// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import { SEC_16_REF, isAuditorSelfDefinition, isTestFilePath } from './shared.js';

export function checkQaKarateStaticIdempotency(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.feature')) return [];
  const findings: SecurityFinding[] = [];
  const staticUuidHeaderRegex =
    /header\s+Idempotency-Key\s*=\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i;

  for (const [i, line] of lines.entries()) {
    if (line.includes('# static-ok')) continue;
    if (staticUuidHeaderRegex.test(line)) {
      findings.push({
        rule_id: 'QA-KARATE-IDEMP',
        severity: 'HIGH',
        stig_owasp_ref: 'Standard 11X Law 6 / Karate BDD Dynamic Idempotency',
        file: relPath,
        line: i + 1,
        message:
          'Se detectó un UUID literal estático en cabecera Idempotency-Key dentro de Karate Labs BDD (.feature), provocando colisiones 409/422 en re-ejecuciones.',
        remediation:
          "Inyectar un UUID dinámico por petición usando: And header Idempotency-Key = java.util.UUID.randomUUID() + ''",
      });
    }
  }

  return findings;
}

const SEC12_RBAC_MARKERS = [
  'claims.get("role")',
  "claims.get('role')",
  'claims.get("rol")',
  "claims.get('rol')",
  'claims["role"]',
  "claims['role']",
  'claims["rol"]',
  "claims['rol']",
  'assert_service_rbac',
  'ApprovalRequest',
  'AWAITING_APPROVAL',
] as const;

function isMcpOrJsonRpcPySegment(seg: string): boolean {
  return (
    seg === 'mcp' ||
    seg === 'jsonrpc' ||
    seg.startsWith('mcp_') ||
    (seg.startsWith('mcp-') && seg !== 'mcp-server') ||
    seg.startsWith('jsonrpc_') ||
    seg.startsWith('jsonrpc-')
  );
}

export function checkSec12McpServiceRbac(relPath: string, lines: string[]): SecurityFinding[] {
  const segments = relPath.replace(/\\/g, '/').toLowerCase().split('/');
  const fileName = segments.at(-1) ?? '';
  const isMcpOrRpcPy =
    fileName.endsWith('.py') &&
    (fileName.includes('mcp') ||
      fileName.includes('jsonrpc') ||
      segments.slice(0, -1).some(isMcpOrJsonRpcPySegment));
  if (!isMcpOrRpcPy || relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }

  const fullText = lines.join('\n');
  if (SEC12_RBAC_MARKERS.some((marker) => fullText.includes(marker))) return [];

  const findings: SecurityFinding[] = [];
  const mutatingToolRegex = /^\s*async\s+def\s+(?:dispatch_|handle_|tool_)?(?:create|update|delete|execute|apply|reboot)_\w+\s*\(/;

  for (const [i, line] of lines.entries()) {
    if (mutatingToolRegex.test(line)) {
      findings.push({
        rule_id: 'SEC-12',
        severity: 'HIGH',
        stig_owasp_ref: 'OWASP API5:2023 BFLA / APSC-DV-000460 / Anti-Depends Bypass',
        file: relPath,
        line: i + 1,
        message:
          'Despachador MCP/JSON-RPC define operación de mutación sin validar explícitamente claims["role"]/claims["rol"] ni enrutar por ApprovalRequest (Depends() es omitido fuera del router HTTP).',
        remediation:
          'Validar explícitamente claims["role"] / claims["rol"] en la capa de servicio y exigir ApprovalRequest (AWAITING_APPROVAL) en herramientas MCP mutables.',
      });
    }
  }

  return findings;
}

export function checkSec13RlsMultiTxPersistence(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') || isTestFilePath(relPath)) return [];
  const fullText = lines.join('\n');
  const setsLocalTenant =
    fullText.includes('SET LOCAL app.current_tenant_id') ||
    (fullText.includes('app.current_tenant_id') && fullText.includes('set_config('));
  if (!setsLocalTenant) return [];
  if (!fullText.includes('AsyncSession')) return [];
  if (fullText.includes('after_begin')) return [];

  const lineIdx = lines.findIndex((l) => l.includes('app.current_tenant_id'));
  return [
    {
      rule_id: 'SEC-13',
      severity: 'HIGH',
      stig_owasp_ref: 'Standard 11X Law 7 / PostgreSQL RLS Multi-Transaction Persistence (after_begin)',
      file: relPath,
      line: Math.max(1, lineIdx + 1),
      message:
        'Se detectó SET LOCAL / set_config("app.current_tenant_id") en AsyncSession sin listener "after_begin". Tras un await db.commit() intermedio, la segunda transacción perderá el contexto RLS.',
      remediation:
        'Almacenar (tenant_id, is_superadmin) en session.sync_session.info y registrar @event.listens_for(AsyncSession.sync_session_class, "after_begin") para re-inyectar SET LOCAL automáticamente (ver recurso MCP blueprint://database/postgres-rls-worm).',
    },
  ];
}

export function checkSec14WormDeterministicChain(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') || isTestFilePath(relPath)) return [];
  const fullText = lines.join('\n');
  const isWormChainFile =
    fullText.includes('prev_record_hash') &&
    (fullText.includes('def write_audit_log') || fullText.includes('record_sha256_hash'));
  if (!isWormChainFile) return [];

  const ordersByCreatedAt =
    /order_by\s*\([^)]*created_at/i.test(fullText) ||
    lines.some((line) => /\border[ \t]+by\b/i.test(line) && /\bcreated_at\b/i.test(line));
  const hasDeterministicLockAndSeq =
    fullText.includes('seq_num') && fullText.includes('pg_advisory_xact_lock');

  if (!ordersByCreatedAt || hasDeterministicLockAndSeq) return [];

  const lineIdx = lines.findIndex((l) => l.includes('created_at') || l.includes('prev_record_hash'));
  return [
    {
      rule_id: 'SEC-14',
      severity: 'HIGH',
      stig_owasp_ref: 'APSC-DV-001350 / Standard 11X Law 7 / Deterministic WORM Audit Chain',
      file: relPath,
      line: Math.max(1, lineIdx + 1),
      message:
        'Cadena forense WORM (prev_record_hash) ordena únicamente por created_at DESC sin secuencia monotónica (seq_num) ni pg_advisory_xact_lock, quedando vulnerable a empates de reloj y condiciones de carrera.',
      remediation:
        'Usar seq_num BIGINT DEFAULT nextval(...), SELECT pg_advisory_xact_lock(hashtext(tenant_key)), seguimiento en memoria de sesión (_in_tx_audit_hash) y await session.flush() (ver blueprint://database/postgres-rls-worm).',
    },
  ];
}

function isQaRunnerFile(relPath: string): boolean {
  const base = path.basename(relPath);
  const norm = relPath.replace(/\\/g, '/');
  return (
    base === 'Makefile' ||
    base === 'Makefile.example' ||
    relPath.endsWith('.sh') ||
    (norm.includes('.github/workflows/') && (norm.endsWith('.yml') || norm.endsWith('.yaml')))
  );
}

function joinLogicalCommandLines(lines: readonly string[]): Array<{ lineNum: number; text: string }> {
  const joined: Array<{ lineNum: number; text: string }> = [];
  let idx = 0;
  while (idx < lines.length) {
    const startLine = idx + 1;
    let combined = pickAt(lines, idx);
    while (combined.trimEnd().endsWith('\\') && idx + 1 < lines.length) {
      combined = `${combined.trimEnd().slice(0, -1)} ${pickAt(lines, idx + 1).trimStart()}`;
      idx += 1;
    }
    joined.push({ lineNum: startLine, text: combined });
    idx += 1;
  }
  return joined;
}

export function checkQaCov01AddoptsBypass(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isQaRunnerFile(relPath)) return [];

  const findings: SecurityFinding[] = [];
  const bareAddoptsRegex = /\bpytest\b[^\n]*-o\s+addopts=(?:""|''|\\""|\\'')/;

  for (const { lineNum, text: line } of joinLogicalCommandLines(lines)) {
    if (!bareAddoptsRegex.test(line)) continue;

    if (!line.includes('--cov')) {
      findings.push({
        rule_id: 'QA-COV-01',
        severity: 'HIGH',
        stig_owasp_ref: 'Standard 11X Law 2 / Non-Root Ephemeral Coverage Enforcement',
        file: relPath,
        line: lineNum,
        message:
          'Se detectó ejecución de pytest con -o addopts="" sin incluir explícitamente --cov=src --cov-fail-under=95 (lo que desactiva silenciosamente la compuerta de cobertura de pyproject.toml).',
        remediation:
          'Añadir explícitamente --import-mode=importlib --cov=src --cov-fail-under=95 junto a -o addopts="" e inyectar -e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/src en contenedores Docker no-root.',
      });
    } else if (/\.(?:unit|int)\.py\b/.test(line) && !line.includes('--import-mode=importlib')) {
      findings.push({
        rule_id: 'QA-COV-01',
        severity: 'HIGH',
        stig_owasp_ref: 'Standard 11X Law 2 / Pytest Importlib Mode Parity',
        file: relPath,
        line: lineNum,
        message:
          'Se detectó ejecución de pytest con -o addopts="" sobre suites de doble extensión (*.unit.py, *.int.py) sin --import-mode=importlib, provocando ModuleNotFoundError / ImportPathMismatchError en colección.',
        remediation:
          'Exigir siempre --import-mode=importlib y PYTHONPATH=/app/src cuando se ejecute pytest -o addopts="" sobre archivos *.unit.py / *.int.py.',
      });
    }
  }

  return findings;
}

function consumeSqlQuotedToken(text: string, start: number, quote: string): { text: string; nextIndex: number } {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === quote) {
      if (text[i + 1] === quote) {
        i += 2;
        continue;
      }
      return { text: text.slice(start, i + 1), nextIndex: i + 1 };
    }
    i += 1;
  }
  return { text: text.slice(start), nextIndex: text.length };
}

function consumeSqlLineComment(text: string, start: number): { text: string; nextIndex: number } {
  let i = start;
  let spaces = '';
  while (i < text.length && text[i] !== '\n') {
    spaces += ' ';
    i += 1;
  }
  return { text: spaces, nextIndex: i };
}

function consumeSqlBlockComment(text: string, start: number): { text: string; nextIndex: number } {
  let depth = 1;
  let i = start + 2;
  let blanked = '  ';
  while (i < text.length && depth > 0) {
    if (text[i] === '/' && text[i + 1] === '*') {
      depth += 1;
      blanked += '  ';
      i += 2;
    } else if (text[i] === '*' && text[i + 1] === '/') {
      depth -= 1;
      blanked += '  ';
      i += 2;
    } else {
      blanked += text[i] === '\n' ? '\n' : ' ';
      i += 1;
    }
  }
  return { text: blanked, nextIndex: i };
}

function readPgDollarTag(text: string, start: number): string | null {
  if (text[start] !== '$') return null;
  if (text[start + 1] === '$') return '$$';
  const first = text[start + 1] ?? '';
  if (!/[A-Za-z_]/.test(first)) return null;
  let i = start + 2;
  while (i < text.length && /\w/.test(text[i] ?? '')) {
    i += 1;
  }
  return text[i] === '$' ? text.slice(start, i + 1) : null;
}

function consumeSqlDollarQuotedToken(text: string, start: number): { text: string; nextIndex: number } | null {
  const tag = readPgDollarTag(text, start);
  if (!tag) return null;
  const closeIdx = text.indexOf(tag, start + tag.length);
  if (closeIdx === -1) {
    return { text: text.slice(start), nextIndex: text.length };
  }
  const endIdx = closeIdx + tag.length;
  return { text: text.slice(start, endIdx), nextIndex: endIdx };
}

function stripSqlCommentsPreservingLines(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      const seg = consumeSqlQuotedToken(text, i, ch);
      out += seg.text;
      i = seg.nextIndex;
      continue;
    }
    if (ch === '$') {
      const seg = consumeSqlDollarQuotedToken(text, i);
      if (seg) {
        out += seg.text;
        i = seg.nextIndex;
        continue;
      }
    }
    if (ch === '-' && text[i + 1] === '-') {
      const seg = consumeSqlLineComment(text, i);
      out += seg.text;
      i = seg.nextIndex;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const seg = consumeSqlBlockComment(text, i);
      out += seg.text;
      i = seg.nextIndex;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function consumeScriptTripleQuote(
  text: string,
  start: number,
  delim: string
): { text: string; nextIndex: number } {
  const closeIdx = text.indexOf(delim, start + 3);
  if (closeIdx === -1) {
    return { text: text.slice(start), nextIndex: text.length };
  }
  const endIdx = closeIdx + 3;
  return { text: text.slice(start, endIdx), nextIndex: endIdx };
}

function consumeScriptSingleLineQuote(
  text: string,
  start: number,
  quote: string
): { text: string; nextIndex: number } {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (ch === quote || ch === '\n') {
      const end = ch === quote ? i + 1 : i;
      return { text: text.slice(start, end), nextIndex: end };
    }
    i += 1;
  }
  return { text: text.slice(start), nextIndex: text.length };
}

function consumeScriptQuoteAt(text: string, start: number): { text: string; nextIndex: number } | null {
  const ch = text[start];
  if (ch !== "'" && ch !== '"') return null;
  const triple = ch + ch + ch;
  if (text.startsWith(triple, start)) {
    return consumeScriptTripleQuote(text, start, triple);
  }
  return consumeScriptSingleLineQuote(text, start, ch);
}

function stripScriptHashComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const quoted = consumeScriptQuoteAt(text, i);
    if (quoted) {
      out += quoted.text;
      i = quoted.nextIndex;
      continue;
    }
    if (text[i] === '#' && (i === 0 || /[\s;(&|]/.test(text[i - 1] ?? ''))) {
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

export function checkQaPg17RlsInvalidCatalog(relPath: string, lines: string[]): SecurityFinding[] {
  if (isAuditorSelfDefinition(relPath) || relPath.endsWith('.md')) return [];
  if (!/\.(py|sql|sh)$/i.test(relPath)) return [];

  const rawText = lines.join('\n');
  const sanitizedText = relPath.toLowerCase().endsWith('.sql')
    ? stripSqlCommentsPreservingLines(rawText)
    : stripScriptHashComments(rawText);

  const invalidCatalogRegex =
    /\bpg_tables\s*\.\s*forcerowsecurity\b|\bforcerowsecurity\b[\s\S]{0,140}\bFROM\s+(?:pg_catalog\.)?pg_tables\b|\bFROM\s+(?:pg_catalog\.)?pg_tables\b[\s\S]{0,140}\bforcerowsecurity\b/i;
  if (!invalidCatalogRegex.test(sanitizedText)) return [];

  const sanitizedLines = sanitizedText.split('\n');
  const lineIdx = sanitizedLines.findIndex((l) => /\bforcerowsecurity\b/i.test(l));
  return [
    {
      rule_id: 'QA-PG17-RLS',
      severity: 'HIGH',
      stig_owasp_ref: 'Standard 11X Law 7 / PostgreSQL 15-17+ RLS Catalog Parity',
      file: relPath,
      line: Math.max(1, lineIdx + 1),
      message:
        'Auditoría RLS consulta la columna inexistente pg_tables.forcerowsecurity (ausente en PostgreSQL 15–17+), causando errores SQL en integración/CI.',
      remediation:
        'Verificar FORCE ROW LEVEL SECURITY consultando pg_catalog.pg_class.relforcerowsecurity con JOIN pg_catalog.pg_namespace (relrowsecurity = true AND relforcerowsecurity = true).',
    },
  ];
}

export function checkQaSmoke01SettingsSingletonSync(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const fullText = lines.join('\n');
  if (!fullText.includes('create_app(')) return [];

  const setsOsEnvironProd =
    /os\.environ\s*\[\s*["'][A-Z0-9_]*ENV["']\s*\]\s*=\s*["']production["']/.test(fullText);
  if (!setsOsEnvironProd) return [];

  const syncsSingleton =
    /\bsettings\.\w*ENV\s*=\s*["']production["']/.test(fullText) ||
    /\bsetattr\s*\(\s*settings\b/.test(fullText) ||
    /\bpatch\s*\([^)]*settings/.test(fullText) ||
    fullText.includes('cache_clear()');

  if (syncsSingleton) return [];

  const lineIdx = lines.findIndex((l) => l.includes('os.environ') && l.includes('production'));
  return [
    {
      rule_id: 'QA-SMOKE-01',
      severity: 'HIGH',
      stig_owasp_ref: 'APSC-DV-002430 / OWASP SC-11 / In-Process Smoke Test Singleton Sync',
      file: relPath,
      line: Math.max(1, lineIdx + 1),
      message:
        'Smoke test muta os.environ["..._ENV"] = "production" antes de create_app() sin sincronizar el singleton settings ya instanciado en memoria tras importar src/.',
      remediation:
        'Actualizar explícitamente el atributo en el singleton (ej. settings.APP_ENV = "production") además de os.environ, restaurando ambos en un bloque finally.',
    },
  ];
}

function isDockerExecCommand(text: string): boolean {
  return text.includes('docker exec') || text.includes('docker compose exec');
}

export function checkSec15EphemeralProdPipelineCreds(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.sh') && !relPath.endsWith('.bash')) return [];
  const fullText = lines.join('\n');
  const hasLocalAdminPass =
    fullText.includes('LOCAL_ADMIN_PASS=') || fullText.includes('EPHEMERAL_ADMIN_PASS=');
  if (!hasLocalAdminPass || !isDockerExecCommand(fullText)) return [];

  const propagatesAdminPassInExec = lines.some(
    (l) =>
      isDockerExecCommand(l) &&
      l.includes('-e ') &&
      (l.includes('LOCAL_ADMIN_PASS') || l.includes('EPHEMERAL_ADMIN_PASS'))
  );

  if (propagatesAdminPassInExec) return [];

  const lineIdx = lines.findIndex((l) => isDockerExecCommand(l));
  return [
    {
      rule_id: 'SEC-15',
      severity: 'HIGH',
      stig_owasp_ref: 'APSC-DV-002310 / Fail-Secure Ephemeral Credential Propagation',
      file: relPath,
      line: Math.max(1, lineIdx + 1),
      message:
        'Script de validación productiva define LOCAL_ADMIN_PASS / EPHEMERAL_ADMIN_PASS pero ejecuta docker exec sin propagar la contraseña efímera mediante -e <PASS_ENV_VAR>="${LOCAL_ADMIN_PASS}".',
      remediation:
        'Exportar llaves efímeras con openssl rand (>= 32 bytes) antes de docker compose up -d y propagar explícitamente docker exec -e <PASS_ENV_VAR>="${LOCAL_ADMIN_PASS}" hacia el validador de contratos.',
    },
  ];
}

function checkPreAuthFrontendInterceptorAsymmetry(
  relPath: string,
  lines: string[],
  fullText: string
): SecurityFinding | null {
  if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx') && !relPath.endsWith('.js') && !relPath.endsWith('.jsx')) {
    return null;
  }
  const has401Interceptor =
    (fullText.includes('interceptors.response.use') || fullText.includes('onResponseError')) &&
    fullText.includes('401');
  const excludesBasicAuth =
    fullText.includes('/auth/login') && fullText.includes('/auth/refresh');
  if (!has401Interceptor || !excludesBasicAuth) return null;

  const coversMultiStepPreAuth =
    fullText.includes('/2fa/') ||
    fullText.includes('confirm-enrollment') ||
    fullText.includes('/auth/bootstrap') ||
    fullText.includes('PREAUTH_PUBLIC_ROUTES');
  if (coversMultiStepPreAuth) return null;

  const lineIdx = lines.findIndex((l) => l.includes('/auth/login'));
  return {
    rule_id: 'SEC-16',
    severity: 'HIGH',
    stig_owasp_ref: SEC_16_REF,
    file: relPath,
    line: Math.max(1, lineIdx + 1),
    message:
      'Interceptor HTTP 401 excluye /auth/login y /auth/refresh pero omite rutas pre-autenticación multi-etapa (/auth/bootstrap, /auth/2fa/*, confirm-enrollment).',
    remediation:
      'Sincronizar una lista simétrica PREAUTH_PUBLIC_ROUTES entre backend y el predicado de exclusión 401 del cliente HTTP para evitar rotaciones /auth/refresh sin sesión activa.',
  };
}

const PREAUTH_EXTS = ['.py', '.ts', '.js', '.php'] as const;
const PREAUTH_FLOW_MARKERS = [
  'confirm-enrollment',
  'confirm_enrollment',
  'verify_2fa',
  '2fa/verify',
  'preauth',
] as const;

function checkPreAuthNonAtomicChallengeConsumption(
  relPath: string,
  lines: string[],
  fullText: string
): SecurityFinding | null {
  if (!PREAUTH_EXTS.some((ext) => relPath.endsWith(ext))) {
    return null;
  }
  if (!/(?:auth|2fa|mfa|bootstrap|challenge)/i.test(relPath)) return null;

  const handlesChallenge =
    fullText.includes('challenge_id') &&
    PREAUTH_FLOW_MARKERS.some((marker) => fullText.includes(marker));
  if (!handlesChallenge) return null;

  const usesNonAtomicGet =
    /\$?\b(?:redis|keydb|cache_client|redis_client)\s*(?:\.|->)\s*get\s*\(/i.test(fullText);
  const hasAtomicConsume =
    /\bgetdel\b/i.test(fullText) ||
    /\bevalsha?\s*\(/.test(fullText) ||
    fullText.includes('idemp:preauth:');

  if (!usesNonAtomicGet || hasAtomicConsume) return null;

  const lineIdx = lines.findIndex((l) => /(?:\.|->)\s*get\s*\(/.test(l));
  return {
    rule_id: 'SEC-16',
    severity: 'HIGH',
    stig_owasp_ref: SEC_16_REF,
    file: relPath,
    line: Math.max(1, lineIdx + 1),
    message:
      'Consumo no atómico (.get sin GETDEL/Lua ni idemp:preauth) de challenge_id efímero de pre-autenticación en Redis/KeyDB (riesgo TOCTOU CWE-362).',
    remediation:
      'Consumir el challenge de un solo uso atómicamente con GETDEL / script Lua, imponer TTL <= 300s + límite de intentos, y validar Origin/Sec-Fetch-Site junto al token CSPRNG en JSON/header.',
  };
}

export function checkSec16PreAuthMultiStepContinuity(relPath: string, lines: string[]): SecurityFinding[] {
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }
  const fullText = lines.join('\n');
  const findings: SecurityFinding[] = [];
  const f1 = checkPreAuthFrontendInterceptorAsymmetry(relPath, lines, fullText);
  if (f1) findings.push(f1);
  const f2 = checkPreAuthNonAtomicChallengeConsumption(relPath, lines, fullText);
  if (f2) findings.push(f2);
  return findings;
}

