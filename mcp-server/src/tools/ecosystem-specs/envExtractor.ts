// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { collectProjectSourceFiles } from './projectDiscovery.js';
import {
  REDACTED_ENV_VALUE,
  UTF8_ENCODING,
  type DiscoveredProject,
  type EnvCategory,
  type EnvVarEntry,
} from './types.js';

const ENV_EXAMPLE_NAMES: readonly string[] = ['.env.example', '.env.sample', '.env.template'];
const ENV_RUNTIME_NAMES: readonly string[] = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
];

const ENV_CODE_EXTS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.py',
  '.php',
]);

const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SENSITIVE_KEY_RE =
  /(?:SECRET|TOKEN|KEY|PASS|PWD|AUTH|CRED|DSN|DATABASE_URL|DB_URL|REDIS_URL|PRIVATE|CERT|JWT|COOKIE|SALT|HMAC|SMTP|WEBHOOK)/i;
const URL_CRED_RE = /:\/\/[^/\s:@]+:[^/\s@]+@/;
const URL_ENDPOINT_KEY_RE = /(?:URL|ENDPOINT|API|BASE|BACKEND|SERVER|GATEWAY|PROXY)/i;
const PORT_HOST_KEY_RE = /(?:PORT|HOST|HOSTNAME|BIND)$/i;
const CORS_KEY_RE = /(?:CORS|ORIGIN|ALLOWED_HOSTS)/i;
const FLAG_KEY_RE = /(?:ENABLE|DISABLE|FEATURE|FLAG|MODE|ENV|DEBUG|LOG_LEVEL)/i;
const SAFE_VALUE_RE = /^(?:https?:\/\/[^\s'"]+|\/[\w./:-]*|\d{2,5}|true|false|[\w.,-]{1,64})$/;
const JWT_LIKE_RE = /^eyJ[A-Za-z0-9_-]{8,}\./;

const CODE_ENV_PATTERNS: readonly RegExp[] = [
  /\bimport\.meta\.env\.([A-Z][A-Z0-9_]{1,63})\b/g,
  /\bprocess\.env\.([A-Z][A-Z0-9_]{1,63})\b/g,
  /\bprocess\.env\[\s*['"]([A-Z][A-Z0-9_]{1,63})['"]\s*\]/g,
  /\bos\.(?:getenv|environ\.get)\(\s*['"]([A-Z][A-Z0-9_]{1,63})['"]/g,
  /\bos\.environ\[\s*['"]([A-Z][A-Z0-9_]{1,63})['"]\s*\]/g,
  /\b(?:getenv|env)\(\s*['"]([A-Z][A-Z0-9_]{1,63})['"]/g,
];

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const endQuote = trimmed.indexOf(quote, 1);
    return endQuote > 0 ? trimmed.slice(1, endQuote).trim() : trimmed;
  }
  const hashIdx = trimmed.indexOf(' #');
  return hashIdx !== -1 ? trimmed.slice(0, hashIdx).trim() : trimmed;
}

export function classifyEnvKey(key: string): EnvCategory {
  if (SENSITIVE_KEY_RE.test(key)) return 'secret_redacted';
  if (CORS_KEY_RE.test(key)) return 'cors_or_origin';
  if (URL_ENDPOINT_KEY_RE.test(key)) return 'url_or_endpoint';
  if (PORT_HOST_KEY_RE.test(key)) return 'port_or_host';
  if (FLAG_KEY_RE.test(key)) return 'feature_flag';
  return 'other';
}

export function sanitizeEnvSample(key: string, rawValue: string): {
  readonly category: EnvCategory;
  readonly sanitizedSample?: string;
} {
  const category = classifyEnvKey(key);
  const clean = stripWrappingQuotes(rawValue);
  if (!clean) return { category };
  if (category === 'secret_redacted' || URL_CRED_RE.test(clean) || JWT_LIKE_RE.test(clean)) {
    return { category: 'secret_redacted', sanitizedSample: REDACTED_ENV_VALUE };
  }
  if (SAFE_VALUE_RE.test(clean) && clean.length <= 120) {
    return { category, sanitizedSample: clean };
  }
  return { category, sanitizedSample: REDACTED_ENV_VALUE };
}

function parseEnvKeyValueLine(rawLine: string): readonly [string, string] | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const eqIdx = withoutExport.indexOf('=');
  if (eqIdx <= 0) return null;
  const key = withoutExport.slice(0, eqIdx).trim();
  if (!ENV_KEY_RE.test(key)) return null;
  return [key, withoutExport.slice(eqIdx + 1)];
}

function parseSingleEnvFile(
  project: DiscoveredProject,
  fileName: string,
  envFileKind: 'example' | 'runtime',
  out: EnvVarEntry[]
): void {
  const fullPath = path.join(project.absPath, fileName);
  if (!fs.existsSync(fullPath)) return;
  let content: string;
  try {
    if (!fs.statSync(fullPath).isFile()) return;
    content = fs.readFileSync(fullPath, UTF8_ENCODING);
  } catch (err: unknown) {
    reportDebugCatchError(`envExtractor.parseSingleEnvFile(${fullPath})`, err);
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const pair = parseEnvKeyValueLine(lines[i] ?? '');
    if (!pair) continue;
    const [key, rawVal] = pair;
    const { category, sanitizedSample } = sanitizeEnvSample(key, rawVal);
    out.push({
      project_slug: project.slug,
      key,
      source: 'env_file',
      env_file_kind: envFileKind,
      category,
      ...(sanitizedSample !== undefined ? { sanitized_sample: sanitizedSample } : {}),
      file: fileName,
      line: i + 1,
    });
  }
}

interface CodeEnvScanState {
  readonly projectSlug: string;
  readonly seenKeyFile: Set<string>;
  readonly out: EnvVarEntry[];
}

function scanCodeLineEnvRefs(
  relFile: string,
  lineNo: number,
  line: string,
  state: CodeEnvScanState
): void {
  for (const re of CODE_ENV_PATTERNS) {
    re.lastIndex = 0;
    let m = re.exec(line);
    while (m !== null) {
      const key = m[1];
      const dedupeKey = `${relFile}:${key}`;
      if (key && !state.seenKeyFile.has(dedupeKey)) {
        state.seenKeyFile.add(dedupeKey);
        state.out.push({
          project_slug: state.projectSlug,
          key,
          source: 'code_ref',
          category: classifyEnvKey(key),
          file: relFile,
          line: lineNo,
        });
      }
      m = re.exec(line);
    }
  }
}

function scanCodeEnvRefsInFile(
  projectAbs: string,
  relFile: string,
  state: CodeEnvScanState
): void {
  let content: string;
  try {
    content = fs.readFileSync(path.join(projectAbs, relFile), UTF8_ENCODING);
  } catch (err: unknown) {
    reportDebugCatchError(`envExtractor.scanCodeEnvRefsInFile(${relFile})`, err);
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    scanCodeLineEnvRefs(relFile, i + 1, lines[i] ?? '', state);
  }
}

export function extractProjectEnvVars(project: DiscoveredProject): EnvVarEntry[] {
  const entries: EnvVarEntry[] = [];
  for (const name of ENV_EXAMPLE_NAMES) {
    parseSingleEnvFile(project, name, 'example', entries);
  }
  for (const name of ENV_RUNTIME_NAMES) {
    parseSingleEnvFile(project, name, 'runtime', entries);
  }
  const state: CodeEnvScanState = {
    projectSlug: project.slug,
    seenKeyFile: new Set<string>(),
    out: entries,
  };
  const sourceFiles = collectProjectSourceFiles(project.absPath, ENV_CODE_EXTS, false);
  for (const relFile of sourceFiles) {
    scanCodeEnvRefsInFile(project.absPath, relFile, state);
  }
  return entries;
}

export function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input[end - 1] === '/') end -= 1;
  return input.slice(0, end);
}

export function extractUrlPathPrefix(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === REDACTED_ENV_VALUE) return null;
  if (trimmed.startsWith('/')) {
    return stripTrailingSlashes(trimmed) || '/';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const cleanPath = stripTrailingSlashes(parsed.pathname);
      return cleanPath && cleanPath !== '/' ? cleanPath : null;
    } catch {
      return null;
    }
  }
  return null;
}
