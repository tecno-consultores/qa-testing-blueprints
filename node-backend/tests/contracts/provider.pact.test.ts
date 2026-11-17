// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
// Verificador de Proveedor Zero-Infra (Pact V3/V4) — 0 any, CC <= 5, Fail-Closed.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { describe, it } from "node:test";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type FaultMode =
  | "none"
  | "float_unit_price"
  | "missing_reservation_id"
  | "missing_idempotency_echo";

interface PactMatcher {
  match: string;
  regex?: string;
}

interface PactRuleEntry {
  combine?: string;
  matchers?: PactMatcher[];
}

interface PactInteraction {
  description: string;
  providerState?: string;
  providerStates?: Array<{ name: string }>;
  request: {
    method: string;
    path: string;
    headers?: Record<string, string | string[]>;
    body?: { content?: JsonValue } | JsonValue;
  };
  response: {
    status: number;
    headers?: Record<string, string | string[]>;
    body?: { content?: JsonValue } | JsonValue;
    matchingRules?: {
      body?: Record<string, PactRuleEntry>;
      header?: Record<string, PactRuleEntry>;
    };
  };
}

interface PactDocument {
  consumer: { name: string };
  provider: { name: string };
  interactions: PactInteraction[];
  metadata?: { pactSpecification?: { version?: string } };
}

interface ProviderStateSnapshot {
  stock: Map<string, number>;
  idempotencyHashes: Map<string, string>;
  reservations: Map<string, JsonObject>;
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_RE = /^tenant-[a-z0-9-]+$/;
const DECIMAL_RE = /^\d+\.\d{2}$/;
const CONFLICT_KEY = "550e8400-e29b-41d4-a716-446655440099";

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined) {
      sorted[key] = canonicalizeJsonValue(entry);
    }
  }
  return sorted;
}

function sha256Canonical(value: unknown): string {
  const serialized = JSON.stringify(canonicalizeJsonValue(value));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function createInitialSnapshot(): ProviderStateSnapshot {
  return {
    stock: new Map<string, number>([["ROUTER-CCR2004", 50]]),
    idempotencyHashes: new Map<string, string>(),
    reservations: new Map<string, JsonObject>(),
  };
}

function applyProviderState(
  state: ProviderStateSnapshot,
  name: string,
): boolean {
  state.stock.clear();
  state.idempotencyHashes.clear();
  state.reservations.clear();
  if (name === "nominal_configured") {
    state.stock.set("ROUTER-CCR2004", 50);
    return true;
  }
  if (name === "virgin_empty") {
    return true;
  }
  if (name === "degraded_conflict") {
    state.stock.set("ROUTER-CCR2004", 10);
    state.stock.set("SFP-25G-LR-OOS", 0);
    state.idempotencyHashes.set(
      `tenant-alpha:${CONFLICT_KEY}`,
      sha256Canonical({ sku: "ROUTER-CCR2004", quantity: 2, unitPrice: "149.95" }),
    );
    return true;
  }
  return false;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: JsonValue,
  contentType = "application/json",
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
  res.end(JSON.stringify(body));
}

function sendProblem(
  res: http.ServerResponse,
  status: number,
  typeUri: string,
  title: string,
  detail: string,
  extraHeaders: Record<string, string> = {},
): void {
  sendJson(
    res,
    status,
    { type: typeUri, title, status, detail },
    "application/problem+json",
    extraHeaders,
  );
}

async function readJsonBody(req: http.IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? (JSON.parse(raw) as JsonValue) : null;
}

function headerStr(
  headers: http.IncomingHttpHeaders,
  name: string,
): string {
  const raw = headers[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }
  return raw ?? "";
}

function validateMutationHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): { tenantId: string; idempotencyKey: string } | null {
  const tenantId = headerStr(req.headers, "x-tenant-id");
  const idempotencyKey = headerStr(req.headers, "idempotency-key");
  if (!TENANT_RE.test(tenantId)) {
    sendProblem(res, 400, "https://qa-11x.internal/problems/invalid-tenant", "Invalid Tenant", "X-Tenant-ID inválido.");
    return null;
  }
  if (!UUID_V4_RE.test(idempotencyKey)) {
    sendProblem(res, 400, "https://qa-11x.internal/problems/missing-idempotency", "Missing Idempotency-Key", "Idempotency-Key UUIDv4 obligatorio.");
    return null;
  }
  return { tenantId, idempotencyKey };
}

function buildCreateResponsePayload(
  reservationId: string,
  unitPrice: string,
  faultMode: FaultMode,
): JsonObject {
  const priceField: JsonValue =
    faultMode === "float_unit_price" ? Number(unitPrice) : unitPrice;
  if (faultMode === "missing_reservation_id") {
    return { status: "CONFIRMED", unitPrice: priceField };
  }
  return { reservationId, status: "CONFIRMED", unitPrice: priceField };
}

function validateCreateBody(
  res: http.ServerResponse,
  body: JsonValue,
): string | null {
  if (!isJsonObject(body)) {
    sendProblem(res, 400, "https://qa-11x.internal/problems/invalid-body", "Invalid Body", "Se esperaba objeto JSON.");
    return null;
  }
  const unitPrice = body.unitPrice;
  if (typeof unitPrice !== "string" || !DECIMAL_RE.test(unitPrice)) {
    sendProblem(res, 422, "https://qa-11x.internal/problems/invalid-price", "Invalid Price", "unitPrice debe ser string decimal exacto.");
    return null;
  }
  return unitPrice;
}

function buildEchoHeaders(faultMode: FaultMode, idempotencyKey: string): Record<string, string> {
  return faultMode === "missing_idempotency_echo" ? {} : { "Idempotency-Key": idempotencyKey };
}

function handleCreateReservation(
  state: ProviderStateSnapshot,
  faultMode: FaultMode,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: JsonValue,
): void {
  const auth = validateMutationHeaders(req, res);
  const unitPrice = auth ? validateCreateBody(res, body) : null;
  if (!auth || !unitPrice) {
    return;
  }
  const compositeKey = `${auth.tenantId}:${auth.idempotencyKey}`;
  const payloadHash = sha256Canonical(body);
  const existing = state.idempotencyHashes.get(compositeKey);
  const echoHeaders = buildEchoHeaders(faultMode, auth.idempotencyKey);
  if (existing && existing !== payloadHash) {
    sendProblem(
      res,
      409,
      "https://qa-11x.internal/problems/idempotency-conflict",
      "Idempotency Key Payload Mismatch",
      `Idempotency-Key ${auth.idempotencyKey} was already committed with a different payload.`,
      echoHeaders,
    );
    return;
  }
  state.idempotencyHashes.set(compositeKey, payloadHash);
  const reservationId = crypto.randomUUID();
  const payload = buildCreateResponsePayload(reservationId, unitPrice, faultMode);
  state.reservations.set(`${auth.tenantId}:${reservationId}`, payload);
  sendJson(res, 201, payload, "application/json", echoHeaders);
}

function evaluateBatchItem(
  state: ProviderStateSnapshot,
  item: JsonValue,
): JsonObject {
  if (!isJsonObject(item) || typeof item.sku !== "string" || typeof item.quantity !== "number") {
    return { sku: "", status: "REJECTED_OUT_OF_STOCK" };
  }
  const available = state.stock.get(item.sku) ?? 0;
  if (item.quantity <= 0 || available < item.quantity) {
    return { sku: item.sku, status: "REJECTED_OUT_OF_STOCK" };
  }
  state.stock.set(item.sku, available - item.quantity);
  return { sku: item.sku, status: "SUCCEEDED" };
}

function handleBatchReservation(
  state: ProviderStateSnapshot,
  faultMode: FaultMode,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: JsonValue,
): void {
  const auth = validateMutationHeaders(req, res);
  if (!auth || !isJsonObject(body) || !Array.isArray(body.items)) {
    return;
  }
  const results = body.items.map((item) => evaluateBatchItem(state, item));
  sendJson(res, 200, { results }, "application/json", buildEchoHeaders(faultMode, auth.idempotencyKey));
}

function handleGetReservation(
  state: ProviderStateSnapshot,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): void {
  const tenantId = headerStr(req.headers, "x-tenant-id");
  const reservationId = pathname.replace("/api/v1/reservations/", "");
  const found = state.reservations.get(`${tenantId}:${reservationId}`);
  if (!found) {
    sendProblem(
      res,
      404,
      "https://qa-11x.internal/problems/reservation-not-found",
      "Reservation Not Found",
      `Reservation ${reservationId} does not exist for tenant.`,
    );
    return;
  }
  sendJson(res, 200, found);
}

async function handleProviderStateRoute(
  state: ProviderStateSnapshot,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req);
  const stateName = isJsonObject(body) && typeof body.state === "string" ? body.state : "";
  if (!applyProviderState(state, stateName)) {
    sendProblem(res, 400, "https://qa-11x.internal/problems/unknown-state", "Unknown State", stateName);
    return;
  }
  sendJson(res, 200, { activeState: stateName });
}

async function routeProviderRequest(
  state: ProviderStateSnapshot,
  faultMode: FaultMode,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  const routeKey = `${req.method ?? "GET"} ${pathname}`;
  if (routeKey === "POST /_pact/provider-states") {
    await handleProviderStateRoute(state, req, res);
    return;
  }
  if (routeKey === "POST /api/v1/reservations") {
    handleCreateReservation(state, faultMode, req, res, await readJsonBody(req));
    return;
  }
  if (routeKey === "POST /api/v1/reservations/batch") {
    handleBatchReservation(state, faultMode, req, res, await readJsonBody(req));
    return;
  }
  if (req.method === "GET" && pathname.startsWith("/api/v1/reservations/")) {
    handleGetReservation(state, req, res, pathname);
    return;
  }
  sendProblem(res, 404, "https://qa-11x.internal/problems/route-not-found", "Not Found", pathname);
}

async function startEphemeralProvider(
  faultMode: FaultMode = "none",
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const state = createInitialSnapshot();
  const server = http.createServer((req, res) => {
    routeProviderRequest(state, faultMode, req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        const detail = err instanceof Error ? err.message : "Unhandled provider error";
        sendProblem(
          res,
          500,
          "https://qa-11x.internal/problems/provider-error",
          "Internal Server Error",
          detail,
        );
      } else {
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function extractBodyContent(body: { content?: JsonValue } | JsonValue | undefined): JsonValue | undefined {
  if (isJsonObject(body) && "content" in body) {
    return body.content;
  }
  return body;
}

function normalizeHeaderRecord(
  headers: Record<string, string | string[]> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }
  for (const [key, val] of Object.entries(headers)) {
    out[key] = Array.isArray(val) ? (val[0] ?? "") : val;
  }
  return out;
}

function checkRegexMatcher(
  matcher: PactMatcher,
  actual: JsonValue,
  location: string,
): void {
  if (typeof actual !== "string") {
    assert.fail(`${location}: se esperaba string para regex.`);
  }
  assert.ok(matcher.regex, `${location}: matcher regex sin expresión.`);
  assert.match(actual, new RegExp(matcher.regex), `${location}: valor '${actual}' no cumple regex.`);
}

const NUMERIC_MATCHERS = new Set(["integer", "decimal", "number"]);

function checkNumericMatcher(matchType: string, actual: JsonValue, location: string): void {
  if (matchType === "integer") {
    assert.equal(typeof actual === "number" && Number.isInteger(actual), true, `${location}: se esperaba entero.`);
    return;
  }
  assert.equal(typeof actual, "number", `${location}: se esperaba número.`);
}

function checkMatcherRule(
  matcher: PactMatcher,
  actual: JsonValue,
  expected: JsonValue,
  location: string,
): void {
  if (matcher.match === "regex") {
    checkRegexMatcher(matcher, actual, location);
    return;
  }
  if (matcher.match === "type") {
    assert.equal(Array.isArray(actual), Array.isArray(expected), `${location}: discrepancia Array.`);
    assert.equal(typeof actual, typeof expected, `${location}: tipo ${typeof actual} != ${typeof expected}.`);
    return;
  }
  if (NUMERIC_MATCHERS.has(matcher.match)) {
    checkNumericMatcher(matcher.match, actual, location);
    return;
  }
  assert.deepEqual(actual, expected, `${location}: discrepancia de igualdad.`);
}

function evaluateRuleEntry(
  rule: PactRuleEntry,
  actual: JsonValue,
  expected: JsonValue,
  location: string,
): void {
  const matchers = rule.matchers ?? [];
  assert.ok(matchers.length > 0, `${location}: entrada matchingRules vacía.`);
  for (const matcher of matchers) {
    checkMatcherRule(matcher, actual, expected, location);
  }
}

function verifyArrayNode(
  expected: JsonValue[],
  actual: JsonValue,
  currentPath: string,
  rules: Record<string, PactRuleEntry>,
): void {
  if (!Array.isArray(actual)) {
    assert.fail(`${currentPath}: se esperaba arreglo.`);
  }
  assert.equal(actual.length, expected.length, `${currentPath}: longitud distinta.`);
  for (let i = 0; i < expected.length; i += 1) {
    verifyBodyNode(expected[i], actual[i], `${currentPath}[${i}]`, rules);
  }
}

function verifyObjectNode(
  expected: JsonObject,
  actual: JsonValue,
  currentPath: string,
  rules: Record<string, PactRuleEntry>,
): void {
  if (!isJsonObject(actual)) {
    assert.fail(`${currentPath}: se esperaba objeto.`);
  }
  for (const key of Object.keys(expected)) {
    assert.ok(key in actual, `${currentPath}.${key}: falta campo obligatorio.`);
    verifyBodyNode(expected[key], actual[key], `${currentPath}.${key}`, rules);
  }
}

function verifyBodyNode(
  expected: JsonValue,
  actual: JsonValue,
  currentPath: string,
  rules: Record<string, PactRuleEntry>,
): void {
  const rule = rules[currentPath];
  if (rule) {
    evaluateRuleEntry(rule, actual, expected, currentPath);
    return;
  }
  if (Array.isArray(expected)) {
    verifyArrayNode(expected, actual, currentPath, rules);
    return;
  }
  if (isJsonObject(expected)) {
    verifyObjectNode(expected, actual, currentPath, rules);
    return;
  }
  assert.strictEqual(actual, expected, `${currentPath}: se esperaba '${String(expected)}' y llegó '${String(actual)}'.`);
}

function verifyResponseHeaders(
  expectedHeaders: Record<string, string | string[]> | undefined,
  actualHeaders: Headers,
  headerRules: Record<string, PactRuleEntry>,
): void {
  const normalized = normalizeHeaderRecord(expectedHeaders);
  for (const [name, expectedVal] of Object.entries(normalized)) {
    const actualVal = actualHeaders.get(name);
    assert.notEqual(actualVal, null, `Falta cabecera de respuesta obligatoria: ${name}`);
    const rule = headerRules[name] ?? headerRules[name.toLowerCase()];
    if (rule) {
      evaluateRuleEntry(rule, actualVal as string, expectedVal, `header.${name}`);
    } else {
      assert.equal(actualVal, expectedVal, `Cabecera ${name} divergente.`);
    }
  }
}

function getProviderStateNames(interaction: PactInteraction): string[] {
  if (interaction.providerStates && interaction.providerStates.length > 0) {
    return interaction.providerStates.map((s) => s.name);
  }
  return interaction.providerState ? [interaction.providerState] : [];
}

async function setupInteractionStates(
  baseUrl: string,
  interaction: PactInteraction,
): Promise<void> {
  for (const stateName of getProviderStateNames(interaction)) {
    const res = await fetch(`${baseUrl}/_pact/provider-states`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: stateName }),
    });
    assert.equal(res.status, 200, `Estado de proveedor inválido o fallido: ${stateName}`);
  }
}

async function verifySingleInteraction(
  baseUrl: string,
  interaction: PactInteraction,
): Promise<void> {
  await setupInteractionStates(baseUrl, interaction);
  const reqHeaders = normalizeHeaderRecord(interaction.request.headers);
  const reqBody = extractBodyContent(interaction.request.body);
  const response = await fetch(`${baseUrl}${interaction.request.path}`, {
    method: interaction.request.method,
    headers: reqHeaders,
    body: reqBody === undefined ? undefined : JSON.stringify(reqBody),
  });
  assert.equal(response.status, interaction.response.status, `${interaction.description}: HTTP status`);
  verifyResponseHeaders(
    interaction.response.headers,
    response.headers,
    interaction.response.matchingRules?.header ?? {},
  );
  const expectedBody = extractBodyContent(interaction.response.body);
  if (expectedBody !== undefined) {
    const actualBody = (await response.json()) as JsonValue;
    verifyBodyNode(expectedBody, actualBody, "$", interaction.response.matchingRules?.body ?? {});
  }
}

export async function verifyProviderAgainstPactFile(
  pactFilePath: string,
  baseUrl: string,
): Promise<number> {
  const raw = await fs.readFile(pactFilePath, "utf-8");
  const pact = JSON.parse(raw) as PactDocument;
  assert.equal(pact.consumer?.name, "fastapi-billing-consumer", "Consumidor inesperado en Pact.");
  assert.equal(pact.provider?.name, "node-inventory-provider", "Proveedor inesperado en Pact.");
  assert.ok(Array.isArray(pact.interactions) && pact.interactions.length > 0, "Contrato Pact vacío.");
  for (const interaction of pact.interactions) {
    await verifySingleInteraction(baseUrl, interaction);
  }
  return pact.interactions.length;
}

function resolvePactArtifactPath(): string {
  const dir = process.env.PACT_OUTPUT_DIR ?? "/tmp/pacts";
  return path.join(dir, "fastapi-billing-consumer-node-inventory-provider.json");
}

describe("Node Inventory Provider — Pact V4 Contract Verification (Zero-Infra)", () => {
  it("verifica al 100% el artefacto Pact real generado por el consumidor Python", async () => {
    const pactPath = resolvePactArtifactPath();
    const provider = await startEphemeralProvider("none");
    try {
      const verified = await verifyProviderAgainstPactFile(pactPath, provider.baseUrl);
      assert.equal(verified, 4);
    } finally {
      await provider.close();
    }
  });

  it("rechaza ruptura deliberada cuando el proveedor serializa unitPrice como float", async () => {
    const pactPath = resolvePactArtifactPath();
    const provider = await startEphemeralProvider("float_unit_price");
    try {
      await assert.rejects(
        () => verifyProviderAgainstPactFile(pactPath, provider.baseUrl),
        /\$\.unitPrice: se esperaba string para regex/,
      );
    } finally {
      await provider.close();
    }
  });

  it("rechaza ruptura deliberada por campo obligatorio ausente y pérdida de eco Idempotency-Key", async () => {
    const pactPath = resolvePactArtifactPath();
    const missingFieldProvider = await startEphemeralProvider("missing_reservation_id");
    const missingHeaderProvider = await startEphemeralProvider("missing_idempotency_echo");
    try {
      await assert.rejects(
        () => verifyProviderAgainstPactFile(pactPath, missingFieldProvider.baseUrl),
        /reservationId: falta campo obligatorio/,
      );
      await assert.rejects(
        () => verifyProviderAgainstPactFile(pactPath, missingHeaderProvider.baseUrl),
        /Falta cabecera de respuesta obligatoria: Idempotency-Key/,
      );
    } finally {
      await missingFieldProvider.close();
      await missingHeaderProvider.close();
    }
  });

  it("falla en modo Fail-Closed ante archivo Pact inexistente o estado desconocido", async () => {
    const provider = await startEphemeralProvider("none");
    try {
      await assert.rejects(
        () => verifyProviderAgainstPactFile("/tmp/nonexistent-pact-11x.json", provider.baseUrl),
        /ENOENT/,
      );
      const stateRes = await fetch(`${provider.baseUrl}/_pact/provider-states`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "unregistered_state" }),
      });
      assert.equal(stateRes.status, 400);

      const idemKey = "550e8400-e29b-41d4-a716-446655440011";
      const headers = {
        "Content-Type": "application/json",
        "X-Tenant-ID": "tenant-acme",
        "Idempotency-Key": idemKey,
      };
      const resA = await fetch(`${provider.baseUrl}/api/v1/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sku: "ROUTER-CCR2004",
          unitPrice: "149.95",
          metadata: { zeta: 2, alpha: 1 },
        }),
      });
      assert.equal(resA.status, 201);
      const resReordered = await fetch(`${provider.baseUrl}/api/v1/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: { alpha: 1, zeta: 2 },
          unitPrice: "149.95",
          sku: "ROUTER-CCR2004",
        }),
      });
      assert.equal(resReordered.status, 201);
    } finally {
      await provider.close();
    }
  });
});
