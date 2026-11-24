// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as dns from 'node:dns';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { REDACTED_SECRET, redactPiiAndSecrets } from '../../security/promptGuard.js';
import { reportDebugCatchError, sanitizeCommandSecrets } from '../../utils/diagnosticFormatter.js';
import {
  AUTH_HEADER_RE,
  CODE_INVALID_INPUT,
  CODE_PATH_TRAVERSAL,
  CODE_SSRF_BLOCKED,
  NUMERIC_HOST_RE,
  SECRET_ENV_KEYS,
  TmsSecurityError,
  type FetchRequestInit,
  type FetchResponseLike,
  type TmsSyncDependencies,
} from './types.js';

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getEnvMap(deps?: TmsSyncDependencies): Readonly<Record<string, string | undefined>> {
  return deps?.env ?? process.env;
}

export function getNowMs(deps?: TmsSyncDependencies): number {
  return deps?.nowMs ? deps.nowMs() : Date.now();
}

export function defaultFetchPort(url: string, init: FetchRequestInit): Promise<FetchResponseLike> {
  return globalThis.fetch(url, { ...init, redirect: 'error' });
}

function collectSecretsFromEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  const secrets: string[] = [];
  for (const key of SECRET_ENV_KEYS) {
    const val = env[key]?.trim();
    if (val && val.length >= 8) {
      secrets.push(val);
    }
  }
  return secrets;
}

export function serializeRedactedJson(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
  indent?: number
): string {
  return JSON.stringify(
    value,
    (_key, val: unknown) => (typeof val === 'string' ? redactTmsSecrets(val, env) : val),
    indent
  );
}

export function redactTmsSecrets(
  rawText: string,
  env: Readonly<Record<string, string | undefined>> = {}
): string {
  let cleaned = sanitizeCommandSecrets(rawText);
  cleaned = redactPiiAndSecrets(cleaned, { strictPii: false });
  cleaned = cleaned.replace(AUTH_HEADER_RE, `$1 ${REDACTED_SECRET}`);
  for (const secret of collectSecretsFromEnv(env)) {
    if (cleaned.includes(secret)) {
      cleaned = cleaned.split(secret).join(REDACTED_SECRET);
    }
  }
  return cleaned;
}

export function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function assertValidCandidatePath(workspaceRoot: string, candidatePath: string): void {
  if (candidatePath.includes('\0') || workspaceRoot.includes('\0')) {
    throw new TmsSecurityError(CODE_PATH_TRAVERSAL, 'Ruta rechazada por contener bytes nulos.');
  }
  if (candidatePath.trim().length === 0) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'La ruta solicitada no puede estar vacía.');
  }
}

function assertExistingSafeTarget(
  rootResolved: string,
  candidateResolved: string,
  candidatePath: string,
  expectedKind: 'dir' | 'file'
): string {
  if (!fs.existsSync(candidateResolved)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Ruta inexistente: '${candidatePath}'.`);
  }
  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(candidateResolved);
  if (!isContainedPath(rootReal, targetReal)) {
    throw new TmsSecurityError(
      CODE_PATH_TRAVERSAL,
      `Enlace simbólico fuera del workspace detectado en '${candidatePath}'.`
    );
  }
  const stat = fs.statSync(targetReal);
  const matchesKind = expectedKind === 'dir' ? stat.isDirectory() : stat.isFile();
  if (!matchesKind) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Tipo inválido en '${candidatePath}' (se esperaba ${expectedKind}).`);
  }
  return targetReal;
}

export function resolveSafeWorkspacePath(
  workspaceRoot: string,
  candidatePath: string,
  expectedKind: 'dir' | 'file'
): string {
  assertValidCandidatePath(workspaceRoot, candidatePath);
  const rootResolved = path.resolve(workspaceRoot);
  const candidateResolved = path.resolve(rootResolved, candidatePath);
  if (!isContainedPath(rootResolved, candidateResolved)) {
    throw new TmsSecurityError(
      CODE_PATH_TRAVERSAL,
      `La ruta '${candidatePath}' escapa los límites del workspace.`
    );
  }
  return assertExistingSafeTarget(rootResolved, candidateResolved, candidatePath, expectedKind);
}

function isLowPrivateOctet(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  return (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

function isHighPrivateOctet(a: number, b: number): boolean {
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv4Address(ipv4: string): boolean {
  const [a = 0, b = 0] = ipv4.split('.').map((seg) => Number(seg));
  return isLowPrivateOctet(a, b) || isHighPrivateOctet(a, b);
}

const EMBEDDED_IPV4_RE = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

function parseIpv6SegmentGroup(part: string): number[] | null {
  if (!part) return [];
  const tokens = part.split(':');
  const nums: number[] = [];
  for (const [idx, tok] of tokens.entries()) {
    if (idx === tokens.length - 1 && tok.includes('.') && net.isIPv4(tok)) {
      const octMatch = EMBEDDED_IPV4_RE.exec(tok);
      if (!octMatch) return null;
      nums.push(
        (Number(octMatch[1]) << 8) | Number(octMatch[2]),
        (Number(octMatch[3]) << 8) | Number(octMatch[4])
      );
      continue;
    }
    const parsed = Number.parseInt(tok, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null;
    nums.push(parsed);
  }
  return nums;
}

function expandIpv6Hextets(rawHost: string): number[] | null {
  const lower = rawHost.toLowerCase();
  const firstSep = lower.indexOf('::');
  if (firstSep === -1) {
    const direct = parseIpv6SegmentGroup(lower);
    return direct && direct.length === 8 ? direct : null;
  }
  if (lower.indexOf('::', firstSep + 2) !== -1) return null;
  const head = parseIpv6SegmentGroup(lower.slice(0, firstSep));
  const tail = parseIpv6SegmentGroup(lower.slice(firstSep + 2));
  if (!head || !tail) return null;
  const missing = 8 - (head.length + tail.length);
  return missing >= 0 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

function hextetsToIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isIpv4MappedPrefix(hextets: readonly number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  );
}

function isIpv4TranslatedPrefix(hextets: readonly number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0xffff &&
    hextets[5] === 0
  );
}

function isIpv4CompatiblePrefix(hextets: readonly number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0
  );
}

function isReservedTransitionIpv6(hextets: readonly number[]): boolean {
  const [h0 = 0, h1 = 0] = hextets;
  if (isIpv4CompatiblePrefix(hextets) || isIpv4TranslatedPrefix(hextets)) return true;
  if (h0 === 0x2002) return true;
  return h0 === 0x2001 && h1 === 0;
}

function isReservedPrefixIpv6(hextets: readonly number[]): boolean {
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0] = hextets;
  const isSpecialUnicastOrMulticast =
    (h0 & 0xffc0) === 0xfe80 || (h0 & 0xfe00) === 0xfc00 || (h0 & 0xff00) === 0xff00;
  const isNat64 = h0 === 0x0064 && h1 === 0xff9b;
  const isDiscardOnly = h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0;
  return isSpecialUnicastOrMulticast || isNat64 || isDiscardOnly || isReservedTransitionIpv6(hextets);
}

function isPrivateOrReservedIpv6(rawHost: string): boolean {
  if (rawHost.includes('%')) return true;
  const hextets = expandIpv6Hextets(rawHost);
  if (!hextets) return true;
  if (isReservedPrefixIpv6(hextets)) return true;
  if (isIpv4MappedPrefix(hextets)) {
    return isPrivateIpv4Address(hextetsToIpv4(hextets[6] ?? 0, hextets[7] ?? 0));
  }
  return false;
}

function isResolvedIpBlocked(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4Address(address);
  if (net.isIPv6(address)) return isPrivateOrReservedIpv6(address);
  return true;
}

export async function assertResolvedHostPublic(
  endpointUrl: string,
  deps?: TmsSyncDependencies
): Promise<void> {
  if (!deps?.lookupHost && deps?.fetchPort !== undefined) {
    return;
  }
  const hostname = stripHostBrackets(new URL(endpointUrl).hostname);
  if (net.isIP(hostname) !== 0) {
    return;
  }
  const lookupFn = deps?.lookupHost ?? ((host: string) => dns.promises.lookup(host, { all: true }));
  const records = await lookupFn(hostname);
  if (records.length === 0 || records.some((rec) => isResolvedIpBlocked(rec.address))) {
    throw new TmsSecurityError(
      CODE_SSRF_BLOCKED,
      `Resolución DNS bloqueada por política Anti-SSRF para '${hostname}'.`
    );
  }
}

function stripHostBrackets(hostname: string): string {
  const lowered = hostname.toLowerCase().replace(/\.$/, '');
  if (lowered.startsWith('[') && lowered.endsWith(']')) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isBlockedHostname(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    NUMERIC_HOST_RE.test(host)
  ) {
    return true;
  }
  if (net.isIPv4(host)) {
    return isPrivateIpv4Address(host);
  }
  if (net.isIPv6(host)) {
    return isPrivateOrReservedIpv6(host);
  }
  return false;
}

export function validateTmsBaseUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'baseUrl no puede estar vacío.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: unknown) {
    reportDebugCatchError('tmsSyncCli.validateTmsBaseUrl', err);
    throw new TmsSecurityError(CODE_INVALID_INPUT, `baseUrl inválido: '${redactPiiAndSecrets(trimmed)}'.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, 'Solo se permite esquema https:// para integraciones TMS.');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, 'URL rechazada por contener credenciales embebidas.');
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, `Destino bloqueado por política Anti-SSRF: '${parsed.hostname}'.`);
  }
  return parsed;
}

