// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  APSC_DV_002510_REF,
  SEC_10_REF,
  isAuditorSelfDefinition,
  isEnvTemplatePath,
  isTestFilePath,
} from './shared.js';

export function checkSec01MassAssignment(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    const classMatch = /^class\s+(\w+)\s*\((?:[^)]*BaseModel[^)]*)\):/.exec(line);
    if (!classMatch) continue;
    const className = pickAt(classMatch, 1);

    const isInputModel = /(?:Request|Create|Update|In)$/i.test(className);
    if (!isInputModel) continue;

    const classBody = lines.slice(i + 1, i + 25).join('\n');
    const hasForbid =
      classBody.includes("extra='forbid'") ||
      classBody.includes('extra="forbid"') ||
      classBody.includes('ConfigDict(extra="forbid")') ||
      classBody.includes("ConfigDict(extra='forbid')");

    if (!hasForbid) {
      findings.push({
        rule_id: 'SEC-01',
        severity: 'HIGH',
        stig_owasp_ref: 'OWASP API3:2023 / Patrón 1',
        file: relPath,
        line: i + 1,
        message: `El esquema ${className} hereda de BaseModel pero no declara ConfigDict(extra='forbid').`,
        remediation: "Añadir model_config = ConfigDict(extra='forbid') dentro de la clase.",
      });
    }
  }

  return findings;
}

export function checkSec02AntiCswsh(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    if (line.includes('@') && line.includes('.websocket(')) {
      const funcBody = lines.slice(i + 1, i + 30).join('\n');
      const hasOriginCheck =
        funcBody.includes('headers.get("origin")') ||
        funcBody.includes("headers.get('origin')") ||
        funcBody.includes('validate_origin') ||
        funcBody.includes('WS_1008_POLICY_VIOLATION') ||
        funcBody.includes('4403');

      if (!hasOriginCheck) {
        findings.push({
          rule_id: 'SEC-02',
          severity: 'HIGH',
          stig_owasp_ref: 'DISA V-222596 / Patrón 2',
          file: relPath,
          line: i + 1,
          message: 'Endpoint WebSocket detectado sin validación explícita de cabecera Origin ni código 4403.',
          remediation: 'Validar websocket.headers.get("origin") contra la lista blanca antes de websocket.accept().',
        });
      }
    }
  }

  return findings;
}

function checkPhpCommandAndDeserialization(line: string, relPath: string, lineNum: number): SecurityFinding | null {
  if (line.includes('unserialize(') && !line.includes('allowed_classes')) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Deserialización insegura mediante unserialize() sin allowed_classes detectada.',
      remediation: 'Pasar ["allowed_classes" => false] o limitar a clases seguras en unserialize().',
    };
  }
  if (/(?:shell_exec|passthru|system)\s*\(/.test(line)) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Ejecución insegura de comandos del sistema detectada en PHP.',
      remediation: 'Evitar invocar el shell del sistema o utilizar Symfony Process con argumentos sanitizados.',
    };
  }
  return null;
}

function checkGenericCommandAndDeserialization(line: string, relPath: string, lineNum: number): SecurityFinding | null {
  if (line.includes('shell=True')) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Uso inseguro de shell=True detectado (riesgo crítico de inyección de comandos).',
      remediation: 'Utilizar shell=False y pasar los argumentos como una lista desinfectada.',
    };
  }
  if (line.includes('os.system(')) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Uso de os.system() detectado.',
      remediation: 'Reemplazar con subprocess.run([cmd, ...], shell=False, check=True).',
    };
  }
  if (line.includes('pickle.loads(') || line.includes('pickle.load(')) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Deserialización insegura mediante pickle detectada.',
      remediation: 'Utilizar formatos seguros como JSON o msgpack con validación Pydantic/Zod.',
    };
  }
  if (line.includes('yaml.load(') && !line.includes('SafeLoader') && !line.includes('safe_load')) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Uso inseguro de yaml.load() sin SafeLoader.',
      remediation: 'Reemplazar por yaml.safe_load(content) o especificar Loader=yaml.SafeLoader.',
    };
  }
  if (/(?<![.\w])eval\s*\(/.test(line)) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Uso de eval() detectado.',
      remediation: 'Eliminar el uso de eval() en favor de análisis o mapeo de diccionarios deterministas.',
    };
  }
  if (/\bnew\s+Function\s*\(/.test(line) || /\bchild_process\s*\.\s*exec\s*\(/.test(line)) {
    return {
      rule_id: 'SEC-03',
      severity: 'CRITICAL',
      stig_owasp_ref: APSC_DV_002510_REF,
      file: relPath,
      line: lineNum,
      message: 'Uso de ejecución dinámica insegura (new Function / child_process.exec) detectado.',
      remediation: 'Evitar new Function() y reemplazar child_process.exec() por execFile/spawn sin shell.',
    };
  }
  return null;
}

const SEC03_EXTS = ['.py', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.php'] as const;

export function checkSec03CommandAndDeserialization(relPath: string, lines: string[]): SecurityFinding[] {
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }
  if (!SEC03_EXTS.some((ext) => relPath.endsWith(ext))) {
    return [];
  }
  const isPhp = relPath.endsWith('.php');
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) continue;

    const finding = isPhp
      ? checkPhpCommandAndDeserialization(line, relPath, i + 1)
      : checkGenericCommandAndDeserialization(line, relPath, i + 1);

    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

const SEC_04_REF = 'APSC-DV-002390 / 002550 / Patrón 4';

function checkPhpXxe(line: string, relPath: string, lineNum: number): SecurityFinding | null {
  const hasXmlCall = line.includes('loadXML(') || line.includes('simplexml_load_string(');
  if (!hasXmlCall) return null;

  if (line.includes('LIBXML_NOENT') || line.includes('LIBXML_DTDLOAD')) {
    return {
      rule_id: 'SEC-04',
      severity: 'CRITICAL',
      stig_owasp_ref: SEC_04_REF,
      file: relPath,
      line: lineNum,
      message:
        'Parser XML en PHP habilita sustitución o carga de DTD (LIBXML_NOENT / LIBXML_DTDLOAD), permitiendo ataques XXE incluso con LIBXML_NONET.',
      remediation:
        'Eliminar LIBXML_NOENT y LIBXML_DTDLOAD; usar exclusivamente LIBXML_NONET (sin expandir entidades externas) o validar con XSD seguro.',
    };
  }

  if (!line.includes('LIBXML_NONET')) {
    return {
      rule_id: 'SEC-04',
      severity: 'HIGH',
      stig_owasp_ref: SEC_04_REF,
      file: relPath,
      line: lineNum,
      message: 'Parser XML en PHP detectado sin bandera LIBXML_NONET (vulnerabilidad XXE).',
      remediation:
        'Especificar LIBXML_NONET (nunca LIBXML_NOENT ni LIBXML_DTDLOAD) en la llamada a loadXML o simplexml_load_string.',
    };
  }
  return null;
}

function checkPyXxe(fileContent: string, relPath: string, lineNum: number): SecurityFinding | null {
  const hasDefused = fileContent.includes('defusedxml');
  const hasResolveEntitiesFalse = fileContent.includes('resolve_entities=False');

  if (!hasDefused && !hasResolveEntitiesFalse) {
    return {
      rule_id: 'SEC-04',
      severity: 'HIGH',
      stig_owasp_ref: SEC_04_REF,
      file: relPath,
      line: lineNum,
      message: 'Parser XML estándar detectado sin protección contra XXE (resolve_entities=False o defusedxml).',
      remediation: 'Utilizar defusedxml.ElementTree o configurar parser con resolve_entities=False.',
    };
  }
  return null;
}

export function checkSec04Xxe(relPath: string, lines: string[]): SecurityFinding[] {
  if (isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) return [];
  const isPy = relPath.endsWith('.py');
  const isPhp = relPath.endsWith('.php');
  if (!isPy && !isPhp) return [];
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    if (isPhp) {
      const phpXxe = checkPhpXxe(line, relPath, i + 1);
      if (phpXxe) {
        findings.push(phpXxe);
        break;
      }
    } else if (line.includes('from xml.etree') || line.includes('import xml.etree') || line.includes('etree.fromstring')) {
      const pyFinding = checkPyXxe(lines.join('\n'), relPath, i + 1);
      if (pyFinding) {
        findings.push(pyFinding);
        break;
      }
    }
  }

  return findings;
}

const SEC05_EXTS = ['.py', '.ts', '.php'] as const;
const SEC05_INPUT_DIR_RE = /(?:^|[/\\])(?:routes?|routers?|endpoints?|api|schemas?|dto|controllers?)[/\\]/i;
const SEC05_VALIDATOR_TOKENS = [
  'validator',
  'field_validator',
  'z.string()',
  'Assert\\',
  'Validation',
] as const;
const SEC05_NFKC_TOKENS = ['NFKC', 'FORM_KC', 'normalize'] as const;

function isSec05EligiblePath(relPath: string): boolean {
  if (isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) return false;
  return SEC05_EXTS.some((ext) => relPath.endsWith(ext)) && SEC05_INPUT_DIR_RE.test(relPath);
}

function hasSec05StringValidator(content: string): boolean {
  const hasType = content.includes('str') || content.includes('string');
  return hasType && SEC05_VALIDATOR_TOKENS.some((tok) => content.includes(tok));
}

export function checkSec05UnicodeNfkc(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isSec05EligiblePath(relPath)) return [];

  const content = lines.join('\n');
  if (!hasSec05StringValidator(content)) return [];
  if (SEC05_NFKC_TOKENS.some((tok) => content.includes(tok))) return [];
  return [
    {
      rule_id: 'SEC-05',
      severity: 'MEDIUM',
      stig_owasp_ref: 'APSC-DV-002520 / Patrón 5',
      file: relPath,
      line: 1,
      message: 'Validadores de entrada de texto sin normalización canónica Unicode NFKC.',
      remediation:
        'Aplicar unicodedata.normalize("NFKC", valor) o Normalizer::normalize($str, Normalizer::FORM_KC) en validadores para mitigar homoglyph bypass.',
    },
  ];
}

const SEC06_PROTO_PATTERNS: readonly RegExp[] = [
  /\.__proto__\s*=(?!=)/,
  /\[['"]__proto__['"]\]\s*=(?!=)/,
  /constructor\s*\.\s*prototype\b[^=\n]*=(?!=)/,
  /Object\s*\.\s*prototype\b[^=\n]*=(?!=)/,
];

function checkSec06Line(relPath: string, line: string, lineNum: number): SecurityFinding | null {
  if (line.includes('v-html') || line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
    const hasSanitize = /\b(?:escapeHtml|DOMPurify|sanitize\w*)\b/.test(line);
    if (!hasSanitize) {
      return {
        rule_id: 'SEC-06',
        severity: 'HIGH',
        stig_owasp_ref: 'APSC-DV-002490 / Patrón 6',
        file: relPath,
        line: lineNum,
        message: 'Inyección de HTML dinámico (v-html / innerHTML / dangerouslySetInnerHTML) sin desinfección explícita.',
        remediation: 'Sanitizar siempre con DOMPurify.sanitize(...) o escapar con escapeHtml(...) antes de renderizar.',
      };
    }
  }
  if (SEC06_PROTO_PATTERNS.some((re) => re.test(line))) {
    return {
      rule_id: 'SEC-06',
      severity: 'HIGH',
      stig_owasp_ref: 'APSC-DV-002490 / Patrón 6',
      file: relPath,
      line: lineNum,
      message: 'Mutación directa de prototipo (__proto__ / constructor.prototype / Object.prototype) detectada (Prototype Pollution).',
      remediation: 'Usar diccionarios con Object.create(null) o Map y rechazar claves __proto__/constructor/prototype.',
    };
  }
  return null;
}

export function checkSec06XssPrototypePollution(relPath: string, lines: string[]): SecurityFinding[] {
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }
  if (
    !relPath.endsWith('.vue') &&
    !relPath.endsWith('.tsx') &&
    !relPath.endsWith('.jsx') &&
    !relPath.endsWith('.ts') &&
    !relPath.endsWith('.js') &&
    !relPath.endsWith('.html')
  ) {
    return [];
  }
  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const hit = checkSec06Line(relPath, line, i + 1);
    if (hit !== null) {
      findings.push(hit);
    }
  }
  return findings;
}

const SEC07_FASTAPI_SCAN_WINDOW = 30;
const SEC07_DOCS_KWARG_RE = /\b(?:docs_url|openapi_url)\s*=\s*([^\n#]+)/g;
const SEC07_LITERAL_NONE_RE = /^None\b/;
const SEC07_FALSE_GUARDED_NONE_RE = /^None\s+if\s+(?:False|0)\b/;
const SEC07_TAUTOLOGICAL_IF_TRUE_RE = /\bif\s+(?:True|1)\s+else\b/;
const SEC07_TRAILING_ELSE_NONE_RE = /\belse\s+None$/;

function stripSec07TrailingDelims(rawExpr: string): string {
  let end = rawExpr.length;
  while (end > 0 && ',) \t\r'.includes(rawExpr.charAt(end - 1))) {
    end -= 1;
  }
  return rawExpr.slice(0, end).trimStart();
}

function isSafeSec07DocsExpr(rawExpr: string): boolean {
  const expr = stripSec07TrailingDelims(rawExpr);
  if (SEC07_LITERAL_NONE_RE.test(expr)) {
    return !SEC07_FALSE_GUARDED_NONE_RE.test(expr);
  }
  return (
    expr.includes(' if ') &&
    SEC07_TRAILING_ELSE_NONE_RE.test(expr) &&
    !SEC07_TAUTOLOGICAL_IF_TRUE_RE.test(expr)
  );
}

function hasSafeFastApiDocsControl(lines: readonly string[], startIndex: number): boolean {
  const slice = lines
    .slice(startIndex, startIndex + SEC07_FASTAPI_SCAN_WINDOW)
    .filter((ln) => !ln.trimStart().startsWith('#'))
    .join('\n');
  SEC07_DOCS_KWARG_RE.lastIndex = 0;
  let match = SEC07_DOCS_KWARG_RE.exec(slice);
  while (match !== null) {
    if (isSafeSec07DocsExpr(pickAt(match, 1))) {
      return true;
    }
    match = SEC07_DOCS_KWARG_RE.exec(slice);
  }
  return false;
}

export function checkSec07SwaggerInProd(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) return [];
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    if (!line.trimStart().startsWith('#') && line.includes('FastAPI(') && !hasSafeFastApiDocsControl(lines, i)) {
      findings.push({
        rule_id: 'SEC-07',
        severity: 'MEDIUM',
        stig_owasp_ref: 'OWASP API8:2023 / Patrón 7',
        file: relPath,
        line: i + 1,
        message: 'Instanciación de FastAPI sin control de desactivación de Swagger/OpenAPI (docs_url=None) en producción.',
        remediation:
          'Desactivar docs_url=None y openapi_url=None (o ternario seguro con rama por defecto else None) si el entorno no es desarrollo.',
      });
    }
  }

  return findings;
}

const SEC10_PRIVATE_KEY_MARKERS = [
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'BEGIN OPENSSH PRIVATE KEY',
  'BEGIN EC PRIVATE KEY',
] as const;

const SEC10_TOKEN_RES: readonly RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr|npm)_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_\w{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,}\b/,
];

const SEC10_ASSIGNED_SECRET_RE =
  /(?:password|passwd|secret_key|api[-_]?key)\s*[:=]\s*["']([a-z0-9!@#$%^&*()_+-]{8,})["']/i;
const SEC10_ENV_KEY_MARKERS = ['PASSWORD', 'PASSWD', 'SECRET', 'API_KEY', 'TOKEN'] as const;
const SEC10_ENV_KEY_RE = /^[A-Z0-9_]{3,80}$/;

function extractUnquotedEnvSecretValue(line: string): string | null {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return null;
  let key = line.slice(0, eqIdx).trim();
  if (key.startsWith('export ')) key = key.slice(7).trim();
  const upperKey = key.toUpperCase();
  if (!SEC10_ENV_KEY_RE.test(upperKey) || !SEC10_ENV_KEY_MARKERS.some((m) => upperKey.includes(m))) {
    return null;
  }
  const rawVal = line.slice(eqIdx + 1).trim();
  const hashIdx = rawVal.indexOf(' #');
  const val = (hashIdx === -1 ? rawVal : rawVal.slice(0, hashIdx)).trim();
  if (val.length < 8 || /[\s"']/.test(val) || val.startsWith('$')) return null;
  return val;
}

const PEM_HEADER_RE = /-----\s*BEGIN\b/i;
const PROMPTFOO_KEY_TYPE = 'type' as const;
const PROMPTFOO_KEY_VALUE = 'value' as const;
const SIMPLE_ASSIGN_PREFIX_RE = /^[A-Za-z_]\w*\s*=$/;

function unquoteSimpleLiteral(raw: string): string | null {
  const s = raw.trim();
  if (s.length < 2) return null;
  const quote = s[0];
  if ((quote !== '"' && quote !== "'") || s.at(-1) !== quote) return null;
  return s.slice(1, -1);
}

function isSafePromptfooPrefix(prefix: string): boolean {
  let p = prefix.trim();
  if (!p || p === '-') return true;
  if (p.startsWith('- ')) p = p.slice(2).trimStart();
  if (p.startsWith('const ') || p.startsWith('let ') || p.startsWith('var ')) {
    p = p.slice(p.indexOf(' ') + 1).trimStart();
  }
  return SIMPLE_ASSIGN_PREFIX_RE.test(p);
}

function isSafePromptfooSuffix(suffix: string): boolean {
  let s = suffix.trim();
  if (s.startsWith(',') || s.startsWith(';')) s = s.slice(1).trimStart();
  return s === '' || s.startsWith('#') || s.startsWith('//');
}

function parsePromptfooKeyValue(
  rawPart: string
): { key: typeof PROMPTFOO_KEY_TYPE | typeof PROMPTFOO_KEY_VALUE; val: string } | null {
  const colonIdx = rawPart.indexOf(':');
  if (colonIdx === -1) return null;
  const key = unquoteSimpleLiteral(rawPart.slice(0, colonIdx));
  const val = unquoteSimpleLiteral(rawPart.slice(colonIdx + 1));
  if (!val || (key !== PROMPTFOO_KEY_TYPE && key !== PROMPTFOO_KEY_VALUE)) return null;
  return { key, val };
}

function isPromptfooNotContains(val: string): boolean {
  return val === 'not-contains' || val === 'not-icontains';
}

function isPromptfooPrivateKeyMarker(val: string): boolean {
  return (SEC10_PRIVATE_KEY_MARKERS as readonly string[]).includes(val);
}

function isInlinePromptfooKeyAssertion(line: string): boolean {
  const openIdx = line.indexOf('{');
  if (openIdx === -1) return false;
  const closeIdx = line.indexOf('}', openIdx + 1);
  if (closeIdx === -1) return false;

  if (
    !isSafePromptfooPrefix(line.slice(0, openIdx)) ||
    !isSafePromptfooSuffix(line.slice(closeIdx + 1))
  ) {
    return false;
  }

  const parts = line.slice(openIdx + 1, closeIdx).split(',');
  if (parts.length !== 2) return false;
  const first = parsePromptfooKeyValue(pickAt(parts, 0));
  const second = parsePromptfooKeyValue(pickAt(parts, 1));
  if (!first || !second) return false;
  return (
    (first.key === PROMPTFOO_KEY_TYPE &&
      second.key === PROMPTFOO_KEY_VALUE &&
      isPromptfooNotContains(first.val) &&
      isPromptfooPrivateKeyMarker(second.val)) ||
    (first.key === PROMPTFOO_KEY_VALUE &&
      second.key === PROMPTFOO_KEY_TYPE &&
      isPromptfooPrivateKeyMarker(first.val) &&
      isPromptfooNotContains(second.val))
  );
}

function parseYamlPromptfooField(
  rawLine: string
): { key: typeof PROMPTFOO_KEY_TYPE | typeof PROMPTFOO_KEY_VALUE; val: string } | null {
  const hashIdx = rawLine.indexOf('#');
  let cleaned = (hashIdx === -1 ? rawLine : rawLine.slice(0, hashIdx)).trim();
  if (cleaned.startsWith('- ')) cleaned = cleaned.slice(2).trimStart();
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx === -1) return null;
  const key = cleaned.slice(0, colonIdx).trim();
  if (key !== PROMPTFOO_KEY_TYPE && key !== PROMPTFOO_KEY_VALUE) return null;
  const rawVal = cleaned.slice(colonIdx + 1).trim();
  const val = unquoteSimpleLiteral(rawVal) ?? rawVal;
  return { key, val };
}

function isBenignPromptfooPrivateKeyAssertion(
  relPath: string,
  lines: string[],
  index: number
): boolean {
  const line = pickAt(lines, index);
  if (PEM_HEADER_RE.test(line)) return false;
  if (isInlinePromptfooKeyAssertion(line)) return true;

  if (!relPath.endsWith('.yml') && !relPath.endsWith('.yaml')) return false;
  const current = parseYamlPromptfooField(line);
  if (!current || current.key !== PROMPTFOO_KEY_VALUE || !isPromptfooPrivateKeyMarker(current.val)) {
    return false;
  }
  const prev = index > 0 ? parseYamlPromptfooField(pickAt(lines, index - 1)) : null;
  const next = index + 1 < lines.length ? parseYamlPromptfooField(pickAt(lines, index + 1)) : null;
  return Boolean(
    (prev && prev.key === PROMPTFOO_KEY_TYPE && isPromptfooNotContains(prev.val)) ||
      (next && next.key === PROMPTFOO_KEY_TYPE && isPromptfooNotContains(next.val))
  );
}

const SEC10_PLACEHOLDER_MARKERS = [
  'placeholder',
  'example',
  'changeme',
  'change_me',
  'tu_token',
  'tu_clave',
  'your_token',
  'your_api_key',
  'your_secret',
  'replace_me',
  'xxxx',
  'dummy-',
  'fake-',
  'mock-',
  '<example',
  '<redacted',
] as const;

function hasPlaceholderMarker(raw: string): boolean {
  const lower = raw.toLowerCase();
  return SEC10_PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
}

function inspectSec10Line(
  relPath: string,
  lines: string[],
  line: string,
  index: number
): SecurityFinding | null {
  if (
    SEC10_PRIVATE_KEY_MARKERS.some((marker) => line.includes(marker)) &&
    !isBenignPromptfooPrivateKeyAssertion(relPath, lines, index)
  ) {
    return {
      rule_id: 'SEC-10',
      severity: 'CRITICAL',
      stig_owasp_ref: SEC_10_REF,
      file: relPath,
      line: index + 1,
      message: 'Clave criptográfica privada detectada en el código fuente.',
      remediation: 'Eliminar claves privadas del código y delegar en gestores de secretos o Vault.',
    };
  }
  const tokenHit = SEC10_TOKEN_RES.map((re) => re.exec(line)?.[0]).find((m) => m !== undefined);
  if (tokenHit !== undefined && (!isEnvTemplatePath(relPath) || !hasPlaceholderMarker(tokenHit))) {
    return {
      rule_id: 'SEC-10',
      severity: 'CRITICAL',
      stig_owasp_ref: SEC_10_REF,
      file: relPath,
      line: index + 1,
      message: 'Token o clave API hardcodeada detectada en el código fuente.',
      remediation: 'Revocar la credencial de inmediato e inyectarla vía variables de entorno seguras.',
    };
  }
  const assignedSecret =
    SEC10_ASSIGNED_SECRET_RE.exec(line)?.[1] ??
    (path.basename(relPath).startsWith('.env') || isEnvTemplatePath(relPath)
      ? extractUnquotedEnvSecretValue(line)
      : null);
  if (assignedSecret !== null && !hasPlaceholderMarker(assignedSecret)) {
    return {
      rule_id: 'SEC-10',
      severity: 'CRITICAL',
      stig_owasp_ref: SEC_10_REF,
      file: relPath,
      line: index + 1,
      message: 'Contraseña, API key o clave secreta en texto plano asignada directamente en el código.',
      remediation: 'Utilizar variables de entorno o almacén de secretos externo.',
    };
  }
  return null;
}

export function checkSec10Secrets(
  relPath: string,
  lines: string[],
  includeExamples = false
): SecurityFinding[] {
  const skipExample = relPath.endsWith('.example') && !(includeExamples && isEnvTemplatePath(relPath));
  if (
    skipExample ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    relPath.endsWith('verificar-secretos.sh')
  ) {
    return [];
  }
  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const finding = inspectSec10Line(relPath, lines, line, i);
    if (finding) findings.push(finding);
  }
  return findings;
}

