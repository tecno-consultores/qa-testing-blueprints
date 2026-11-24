// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
// Verificador de Proveedor Zero-Infra (Pact V3/V4) — 0 any, CC <= 5, Fail-Closed.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type FaultMode =
  | 'none'
  | 'float_unit_price'
  | 'missing_reservation_id'
  | 'missing_idempotency_echo';

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

interface ProblemSpec {
  typeUri: string;
  title: string;
  detail: string;
  extraHeaders?: Record<string, string>;
}

interface JsonResponseOptions {
  contentType?: string;
  extraHeaders?: Record<string, string>;
}

interface RequestContext {
  state: ProviderStateSnapshot;
  faultMode: FaultMode;
  req: http.IncomingMessage;
  res: http.ServerResponse;
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_RE = /^tenant-[a-z0-9-]+$/;
const DECIMAL_RE = /^\d+\.\d{2}$/;
const CONFLICT_KEY = '550e8400-e29b-41d4-a716-446655440099';
const NUMERIC_MATCHERS = new Set(['integer', 'decimal', 'number']);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    const entry: unknown = value[key];
    if (entry !== undefined) {
      sorted[key] = canonicalizeJsonValue(entry);
    }
  }
  return sorted;
}

function sha256Canonical(value: unknown): string {
  const serialized = JSON.stringify(canonicalizeJsonValue(value));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function createInitialSnapshot(): ProviderStateSnapshot {
  return {
    stock: new Map<string, number>([['ROUTER-CCR2004', 50]]),
    idempotencyHashes: new Map<string, string>(),
    reservations: new Map<string, JsonObject>(),
  };
}

function applyProviderState(state: ProviderStateSnapshot, name: string): boolean {
  state.stock.clear();
  state.idempotencyHashes.clear();
  state.reservations.clear();
  if (name === 'nominal_configured') {
    state.stock.set('ROUTER-CCR2004', 50);
    return true;
  }
  if (name === 'virgin_empty') {
    return true;
  }
  if (name === 'degraded_conflict') {
    state.stock.set('ROUTER-CCR2004', 10);
    state.stock.set('SFP-25G-LR-OOS', 0);
    state.idempotencyHashes.set(
      `tenant-alpha:${CONFLICT_KEY}`,
      sha256Canonical({ sku: 'ROUTER-CCR2004', quantity: 2, unitPrice: '149.95' }),
    );
    return true;
  }
  return false;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: JsonValue,
  options: JsonResponseOptions = {},
): void {
  const contentType = options.contentType ?? 'application/json';
  const extraHeaders = options.extraHeaders ?? {};
  res.writeHead(status, { 'Content-Type': contentType, ...extraHeaders });
  res.end(JSON.stringify(body));
}

function sendProblem(res: http.ServerResponse, status: number, problem: ProblemSpec): void {
  sendJson(
    res,
    status,
    { type: problem.typeUri, title: problem.title, status, detail: problem.detail },
    { contentType: 'application/problem+json', extraHeaders: problem.extraHeaders },
  );
}

function toBufferChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  return Buffer.from(typeof chunk === 'string' ? chunk : '', 'utf-8');
}

async function readJsonBody(req: http.IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];
  for await (const rawChunk of req) {
    chunks.push(toBufferChunk(rawChunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? (JSON.parse(raw) as JsonValue) : null;
}

function headerStr(headers: http.IncomingHttpHeaders, name: string): string {
  const raw = headers[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
}

function validateMutationHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): { tenantId: string; idempotencyKey: string } | null {
  const tenantId = headerStr(req.headers, 'x-tenant-id');
  const idempotencyKey = headerStr(req.headers, 'idempotency-key');
  if (!TENANT_RE.test(tenantId)) {
    sendProblem(res, 400, {
      typeUri: 'https://qa-11x.internal/problems/invalid-tenant',
      title: 'Invalid Tenant',
      detail: 'X-Tenant-ID inválido.',
    });
    return null;
  }
  if (!UUID_V4_RE.test(idempotencyKey)) {
    sendProblem(res, 400, {
      typeUri: 'https://qa-11x.internal/problems/missing-idempotency',
      title: 'Missing Idempotency-Key',
      detail: 'Idempotency-Key UUIDv4 obligatorio.',
    });
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
    faultMode === 'float_unit_price' ? Number(unitPrice) : unitPrice;
  if (faultMode === 'missing_reservation_id') {
    return { status: 'CONFIRMED', unitPrice: priceField };
  }
  return { reservationId, status: 'CONFIRMED', unitPrice: priceField };
}

function validateCreateBody(res: http.ServerResponse, body: JsonValue): string | null {
  if (!isJsonObject(body)) {
    sendProblem(res, 400, {
      typeUri: 'https://qa-11x.internal/problems/invalid-body',
      title: 'Invalid Body',
      detail: 'Se esperaba objeto JSON.',
    });
    return null;
  }
  const unitPrice = body.unitPrice;
  if (typeof unitPrice !== 'string' || !DECIMAL_RE.test(unitPrice)) {
    sendProblem(res, 422, {
      typeUri: 'https://qa-11x.internal/problems/invalid-price',
      title: 'Invalid Price',
      detail: 'unitPrice debe ser string decimal exacto.',
    });
    return null;
  }
  return unitPrice;
}

function buildEchoHeaders(faultMode: FaultMode, idempotencyKey: string): Record<string, string> {
  return faultMode === 'missing_idempotency_echo' ? {} : { 'Idempotency-Key': idempotencyKey };
}

function checkIdempotencyConflict(
  ctx: RequestContext,
  auth: { tenantId: string; idempotencyKey: string },
  body: JsonValue,
  echoHeaders: Record<string, string>,
): boolean {
  const compositeKey = `${auth.tenantId}:${auth.idempotencyKey}`;
  const payloadHash = sha256Canonical(body);
  const existing = ctx.state.idempotencyHashes.get(compositeKey);
  if (existing && existing !== payloadHash) {
    sendProblem(ctx.res, 409, {
      typeUri: 'https://qa-11x.internal/problems/idempotency-conflict',
      title: 'Idempotency Key Payload Mismatch',
      detail: `Idempotency-Key ${auth.idempotencyKey} already committed with a different payload.`,
      extraHeaders: echoHeaders,
    });
    return true;
  }
  ctx.state.idempotencyHashes.set(compositeKey, payloadHash);
  return false;
}

function handleCreateReservation(ctx: RequestContext, body: JsonValue): void {
  const auth = validateMutationHeaders(ctx.req, ctx.res);
  if (!auth) {
    return;
  }
  const unitPrice = validateCreateBody(ctx.res, body);
  if (!unitPrice) {
    return;
  }
  const echoHeaders = buildEchoHeaders(ctx.faultMode, auth.idempotencyKey);
  if (checkIdempotencyConflict(ctx, auth, body, echoHeaders)) {
    return;
  }
  const reservationId = crypto.randomUUID();
  const payload = buildCreateResponsePayload(reservationId, unitPrice, ctx.faultMode);
  ctx.state.reservations.set(`${auth.tenantId}:${reservationId}`, payload);
  sendJson(ctx.res, 201, payload, { extraHeaders: echoHeaders });
}

function parseValidBatchItem(item: JsonValue): { sku: string; quantity: number } | null {
  if (!isJsonObject(item)) {
    return null;
  }
  const { sku, quantity } = item;
  if (typeof sku !== 'string' || typeof quantity !== 'number') {
    return null;
  }
  return { sku, quantity };
}

function evaluateBatchItem(state: ProviderStateSnapshot, item: JsonValue): JsonObject {
  const parsed = parseValidBatchItem(item);
  if (!parsed) {
    return { sku: '', status: 'REJECTED_OUT_OF_STOCK' };
  }
  const available = state.stock.get(parsed.sku) ?? 0;
  if (parsed.quantity <= 0 || available < parsed.quantity) {
    return { sku: parsed.sku, status: 'REJECTED_OUT_OF_STOCK' };
  }
  state.stock.set(parsed.sku, available - parsed.quantity);
  return { sku: parsed.sku, status: 'SUCCEEDED' };
}

function validateBatchBody(res: http.ServerResponse, body: JsonValue): JsonValue[] | null {
  if (!isJsonObject(body) || !Array.isArray(body.items)) {
    sendProblem(res, 400, {
      typeUri: 'https://qa-11x.internal/problems/invalid-batch',
      title: 'Invalid Batch Body',
      detail: 'Se esperaba objeto JSON con arreglo items.',
    });
    return null;
  }
  return body.items;
}

function handleBatchReservation(ctx: RequestContext, body: JsonValue): void {
  const auth = validateMutationHeaders(ctx.req, ctx.res);
  if (!auth) {
    return;
  }
  const items = validateBatchBody(ctx.res, body);
  if (!items) {
    return;
  }
  const echoHeaders = buildEchoHeaders(ctx.faultMode, auth.idempotencyKey);
  if (checkIdempotencyConflict(ctx, auth, body, echoHeaders)) {
    return;
  }
  const results = items.map((item) => evaluateBatchItem(ctx.state, item));
  sendJson(ctx.res, 200, { results }, { extraHeaders: echoHeaders });
}

function handleGetReservation(
  state: ProviderStateSnapshot,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): void {
  const tenantId = headerStr(req.headers, 'x-tenant-id');
  const reservationId = pathname.replace('/api/v1/reservations/', '');
  const found = state.reservations.get(`${tenantId}:${reservationId}`);
  if (!found) {
    sendProblem(res, 404, {
      typeUri: 'https://qa-11x.internal/problems/reservation-not-found',
      title: 'Reservation Not Found',
      detail: `Reservation ${reservationId} does not exist for tenant.`,
    });
    return;
  }
  sendJson(res, 200, found);
}

async function handleProviderStateRoute(ctx: RequestContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const stateName = isJsonObject(body) && typeof body.state === 'string' ? body.state : '';
  if (!applyProviderState(ctx.state, stateName)) {
    sendProblem(ctx.res, 400, {
      typeUri: 'https://qa-11x.internal/problems/unknown-state',
      title: 'Unknown State',
      detail: stateName,
    });
    return;
  }
  sendJson(ctx.res, 200, { activeState: stateName });
}

type RouteHandler = (ctx: RequestContext) => Promise<void>;

const EXACT_ROUTES = new Map<string, RouteHandler>([
  ['POST /_pact/provider-states', handleProviderStateRoute],
  [
    'POST /api/v1/reservations',
    async (ctx: RequestContext): Promise<void> => {
      handleCreateReservation(ctx, await readJsonBody(ctx.req));
    },
  ],
  [
    'POST /api/v1/reservations/batch',
    async (ctx: RequestContext): Promise<void> => {
      handleBatchReservation(ctx, await readJsonBody(ctx.req));
    },
  ],
]);

function readRequestMethodAndPath(req: http.IncomingMessage): {
  method: string;
  pathname: string;
} {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const method = req.method ?? 'GET';
  return { method, pathname };
}

async function routeProviderRequest(ctx: RequestContext): Promise<void> {
  const { method, pathname } = readRequestMethodAndPath(ctx.req);
  const handler = EXACT_ROUTES.get(`${method} ${pathname}`);
  if (handler) {
    await handler(ctx);
    return;
  }
  if (method === 'GET' && pathname.startsWith('/api/v1/reservations/')) {
    handleGetReservation(ctx.state, ctx.req, ctx.res, pathname);
    return;
  }
  sendProblem(ctx.res, 404, {
    typeUri: 'https://qa-11x.internal/problems/route-not-found',
    title: 'Not Found',
    detail: pathname,
  });
}

async function startEphemeralProvider(
  faultMode: FaultMode = 'none',
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const state = createInitialSnapshot();
  const server = http.createServer((req, res) => {
    routeProviderRequest({ state, faultMode, req, res }).catch((err: unknown) => {
      if (!res.headersSent) {
        const detail = err instanceof Error ? err.message : 'Unhandled provider error';
        sendProblem(res, 500, {
          typeUri: 'https://qa-11x.internal/problems/provider-error',
          title: 'Internal Server Error',
          detail,
        });
      } else {
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

interface ExtractedBody {
  present: boolean;
  value: JsonValue;
}

function extractBodyContent(
  body: { content?: JsonValue } | JsonValue | undefined,
): ExtractedBody {
  const raw = isJsonObject(body) && 'content' in body ? body.content : body;
  if (raw === undefined) {
    return { present: false, value: null };
  }
  return { present: true, value: raw };
}

function normalizeHeaderRecord(
  headers: Record<string, string | string[]> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }
  for (const [key, val] of Object.entries(headers)) {
    out[key] = Array.isArray(val) ? (val[0] ?? '') : val;
  }
  return out;
}

function compilePactRegex(pattern: string, location: string): RegExp {
  assert.ok(pattern.length <= 256, `${location}: regex excede 256 caracteres.`);
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(pattern);
}

function checkRegexMatcher(
  matcher: PactMatcher,
  actual: JsonValue,
  location: string,
): void {
  if (typeof actual !== 'string') {
    assert.fail(`${location}: se esperaba string para regex.`);
  }
  assert.ok(matcher.regex, `${location}: matcher regex sin expresión.`);
  const compiled = compilePactRegex(matcher.regex, location);
  assert.match(actual, compiled, `${location}: valor '${actual}' no cumple regex.`);
}

function checkNumericMatcher(matchType: string, actual: JsonValue, location: string): void {
  if (matchType === 'integer') {
    const isInt = typeof actual === 'number' && Number.isInteger(actual);
    assert.equal(isInt, true, `${location}: se esperaba entero.`);
    return;
  }
  assert.equal(typeof actual, 'number', `${location}: se esperaba número.`);
}

function checkMatcherRule(
  matcher: PactMatcher,
  actual: JsonValue,
  expected: JsonValue,
  location: string,
): void {
  if (matcher.match === 'regex') {
    checkRegexMatcher(matcher, actual, location);
    return;
  }
  if (matcher.match === 'type') {
    assert.equal(
      Array.isArray(actual),
      Array.isArray(expected),
      `${location}: discrepancia Array.`,
    );
    assert.equal(typeof actual, typeof expected, `${location}: discrepancia de tipo.`);
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
  assert.strictEqual(
    actual,
    expected,
    `${currentPath}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}.`,
  );
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
      evaluateRuleEntry(rule, actualVal, expectedVal, `header.${name}`);
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: stateName }),
    });
    assert.equal(res.status, 200, `Estado de proveedor inválido o fallido: ${stateName}`);
  }
}

async function verifyExpectedBody(
  expectedBody: ExtractedBody,
  response: Response,
  rules: Record<string, PactRuleEntry>,
): Promise<void> {
  if (!expectedBody.present) {
    return;
  }
  const actualBody = (await response.json()) as JsonValue;
  verifyBodyNode(expectedBody.value, actualBody, '$', rules);
}

function readHeaderRules(interaction: PactInteraction): Record<string, PactRuleEntry> {
  return interaction.response.matchingRules?.header ?? {};
}

function readBodyRules(interaction: PactInteraction): Record<string, PactRuleEntry> {
  return interaction.response.matchingRules?.body ?? {};
}

async function verifySingleInteraction(
  baseUrl: string,
  interaction: PactInteraction,
): Promise<void> {
  await setupInteractionStates(baseUrl, interaction);
  const reqHeaders = normalizeHeaderRecord(interaction.request.headers);
  const reqBody = extractBodyContent(interaction.request.body);
  const init: RequestInit = {
    method: interaction.request.method,
    headers: reqHeaders,
  };
  if (reqBody.present) {
    init.body = JSON.stringify(reqBody.value);
  }
  const response = await fetch(`${baseUrl}${interaction.request.path}`, init);
  assert.equal(
    response.status,
    interaction.response.status,
    `${interaction.description}: HTTP status`,
  );
  verifyResponseHeaders(
    interaction.response.headers,
    response.headers,
    readHeaderRules(interaction),
  );
  const expectedBody = extractBodyContent(interaction.response.body);
  await verifyExpectedBody(expectedBody, response, readBodyRules(interaction));
}

function assertValidPactDocument(pact: PactDocument): void {
  assert.equal(pact.consumer?.name, 'fastapi-billing-consumer', 'Consumidor inesperado en Pact.');
  assert.equal(pact.provider?.name, 'node-inventory-provider', 'Proveedor inesperado en Pact.');
  assert.ok(
    Array.isArray(pact.interactions) && pact.interactions.length > 0,
    'Contrato Pact vacío.',
  );
}

export async function verifyProviderAgainstPactFile(
  pactFilePath: string,
  baseUrl: string,
): Promise<number> {
  const resolved = path.resolve(pactFilePath);
  assert.ok(resolved.endsWith('.json') && !resolved.includes('\0'), 'Ruta Pact inválida.');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const raw = await fs.readFile(resolved, 'utf-8');
  const pact = JSON.parse(raw) as PactDocument;
  assertValidPactDocument(pact);
  for (const interaction of pact.interactions) {
    await verifySingleInteraction(baseUrl, interaction);
  }
  return pact.interactions.length;
}

const PACT_FILENAME = 'fastapi-billing-consumer-node-inventory-provider.json';

function readEnvValue(value: string | undefined): string {
  return value ? value.trim() : '';
}

function resolveExternalPactPath(env: NodeJS.ProcessEnv): string | null {
  const requireExternal = env.PACT_REQUIRE_EXTERNAL === '1';
  const envDir = readEnvValue(env.PACT_OUTPUT_DIR);
  if (!envDir) {
    if (requireExternal) {
      throw new Error(
        `PACT_REQUIRE_EXTERNAL=1 requiere PACT_OUTPUT_DIR para localizar ${PACT_FILENAME}.`,
      );
    }
    return null;
  }
  const candidate = path.join(envDir, PACT_FILENAME);
  if (requireExternal) {
    return candidate;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fsSync.existsSync(candidate) ? candidate : null;
}

function resolveBundledPactPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'tests', 'contracts', 'fixtures', PACT_FILENAME),
    path.resolve(process.cwd(), 'node-backend', 'tests', 'contracts', 'fixtures', PACT_FILENAME),
  ];
  for (const candidate of candidates) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolvePactArtifactPath(env: NodeJS.ProcessEnv = process.env): string {
  const external = resolveExternalPactPath(env);
  if (external) {
    return external;
  }
  return resolveBundledPactPath() ?? path.join(os.tmpdir(), 'pacts', PACT_FILENAME);
}

void describe('Node Inventory Provider — Pact V4 Contract Verification (Zero-Infra)', () => {
  void it('verifica al 100% el artefacto Pact real generado por el consumidor Python', async () => {
    const pactPath = resolvePactArtifactPath();
    const provider = await startEphemeralProvider('none');
    try {
      const verified = await verifyProviderAgainstPactFile(pactPath, provider.baseUrl);
      assert.equal(verified, 4);
    } finally {
      await provider.close();
    }
  });

  void it(
    'rechaza ruptura deliberada cuando el proveedor serializa unitPrice como float',
    async () => {
      const pactPath = resolvePactArtifactPath();
      const provider = await startEphemeralProvider('float_unit_price');
      try {
        await assert.rejects(
          () => verifyProviderAgainstPactFile(pactPath, provider.baseUrl),
          /\$\.unitPrice: se esperaba string para regex/,
        );
      } finally {
        await provider.close();
      }
    },
  );

  void it(
    'rechaza ruptura por campo obligatorio ausente y pérdida de eco Idempotency-Key',
    async () => {
      const pactPath = resolvePactArtifactPath();
      const missingFieldProvider = await startEphemeralProvider('missing_reservation_id');
      const missingHeaderProvider = await startEphemeralProvider('missing_idempotency_echo');
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
    },
  );

  void it('falla Fail-Closed ante Pact ausente, batch 400 y conflicto 409', async () => {
    const provider = await startEphemeralProvider('none');
    try {
      assert.throws(
        () => resolvePactArtifactPath({ PACT_REQUIRE_EXTERNAL: '1' }),
        /PACT_OUTPUT_DIR/,
      );
      const missingPact = path.join(os.tmpdir(), 'nonexistent-pact-11x.json');
      await assert.rejects(
        () => verifyProviderAgainstPactFile(missingPact, provider.baseUrl),
        /ENOENT/,
      );
      const stateRes = await fetch(`${provider.baseUrl}/_pact/provider-states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'unregistered_state' }),
      });
      assert.equal(stateRes.status, 400);

      const badBatchRes = await fetch(`${provider.baseUrl}/api/v1/reservations/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'tenant-acme',
          'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440012',
        },
        body: JSON.stringify({ invalidField: true }),
      });
      assert.equal(badBatchRes.status, 400);

      const batchHeaders = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'tenant-acme',
        'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440013',
      };
      const batchOk = await fetch(`${provider.baseUrl}/api/v1/reservations/batch`, {
        method: 'POST',
        headers: batchHeaders,
        body: JSON.stringify({ items: [{ sku: 'ROUTER-CCR2004', quantity: 1 }] }),
      });
      assert.equal(batchOk.status, 200);
      const batchConflict = await fetch(`${provider.baseUrl}/api/v1/reservations/batch`, {
        method: 'POST',
        headers: batchHeaders,
        body: JSON.stringify({ items: [{ sku: 'ROUTER-CCR2004', quantity: 2 }] }),
      });
      assert.equal(batchConflict.status, 409);

      const idemKey = '550e8400-e29b-41d4-a716-446655440011';
      const headers = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'tenant-acme',
        'Idempotency-Key': idemKey,
      };
      const resA = await fetch(`${provider.baseUrl}/api/v1/reservations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sku: 'ROUTER-CCR2004',
          unitPrice: '149.95',
          metadata: { zeta: 2, alpha: 1 },
        }),
      });
      assert.equal(resA.status, 201);
      const resReordered = await fetch(`${provider.baseUrl}/api/v1/reservations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          metadata: { alpha: 1, zeta: 2 },
          unitPrice: '149.95',
          sku: 'ROUTER-CCR2004',
        }),
      });
      assert.equal(resReordered.status, 201);
    } finally {
      await provider.close();
    }
  });
});
