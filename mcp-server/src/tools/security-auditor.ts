// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { GroupedSecurityFinding, SecurityAuditResult, SecurityFinding } from '../types.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'target',
  'graphify-out',
  '.stryker-tmp',
  '.trivycache',
]);

const SCANNABLE_EXTS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.html',
  '.sh',
  '.bash',
  '.json',
  '.php',
  '.feature',
  '.sql',
  '.yml',
  '.yaml',
]);

const APSC_DV_002510_REF = 'APSC-DV-002510 / Patrón 3';
const SEC_10_REF = 'APSC-DV-000650 / V-222444 / Patrón 10';
const SEC_11_REF = 'APSC-DV-001350 / Anti-Silo Audit Rule 3';
const SEC_16_REF = 'CWE-352 / CWE-362 / APSC-DV-000530 / Anti-Silo Rule 8';
const QA_HEALTH_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 9';
const QA_HEALTH_OK_PRAGMA = '# qa-health-ok';
const QA_CLI_TTY_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 10';
const QA_TTY_OK_PRAGMA = 'qa-tty-ok';
const UI_11X_02_REF = 'Standard 11X / Anti-Silo UI Rule 3 & 4';

function isScannableFile(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  const ext = path.extname(entry.name).toLowerCase();
  return (
    SCANNABLE_EXTS.has(ext) ||
    entry.name === '.npmrc' ||
    entry.name.startsWith('.env') ||
    entry.name === 'Makefile' ||
    entry.name === 'Makefile.example'
  );
}

function shouldSkipDirectory(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false;
  if (IGNORED_DIRS.has(entry.name) || entry.name === 'backups') return true;
  if (entry.name === '.agents' || entry.name === '.github') return false;
  return entry.name.startsWith('.') && entry.name !== '.npmrc';
}

/**
 * Recopila recursivamente todos los archivos auditables del proyecto.
 */
function collectFiles(dirPath: string): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipDirectory(entry)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath));
      } else if (isScannableFile(entry)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Si no se puede leer el directorio, continuar silenciosamente
  }

  return results;
}

function checkSec01MassAssignment(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/^class\s+([A-Za-z0-9_]+)\s*\((?:[^)]*BaseModel[^)]*)\):/);
    if (!classMatch) continue;

    const className = classMatch[1];
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

function checkSec02AntiCswsh(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
  if (/\beval\s*\(/.test(line)) {
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
  return null;
}

function checkSec03CommandAndDeserialization(relPath: string, lines: string[]): SecurityFinding[] {
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }
  if (!relPath.endsWith('.py') && !relPath.endsWith('.ts') && !relPath.endsWith('.js') && !relPath.endsWith('.php')) return [];
  const isPhp = relPath.endsWith('.php');
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

function checkPhpXxe(line: string, relPath: string, lineNum: number): SecurityFinding | null {
  if ((line.includes('loadXML(') || line.includes('simplexml_load_string(')) && !line.includes('LIBXML_NONET')) {
    return {
      rule_id: 'SEC-04',
      severity: 'HIGH',
      stig_owasp_ref: 'APSC-DV-002390 / 002550 / Patrón 4',
      file: relPath,
      line: lineNum,
      message: 'Parser XML en PHP detectado sin bandera LIBXML_NONET (vulnerabilidad XXE).',
      remediation: 'Especificar LIBXML_NONET | LIBXML_NOENT en la llamada a loadXML o simplexml_load_string.',
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
      stig_owasp_ref: 'APSC-DV-002390 / 002550 / Patrón 4',
      file: relPath,
      line: lineNum,
      message: 'Parser XML estándar detectado sin protección contra XXE (resolve_entities=False o defusedxml).',
      remediation: 'Utilizar defusedxml.ElementTree o configurar parser con resolve_entities=False.',
    };
  }
  return null;
}

function checkSec04Xxe(relPath: string, lines: string[]): SecurityFinding[] {
  const isPy = relPath.endsWith('.py');
  const isPhp = relPath.endsWith('.php');
  if (!isPy && !isPhp) return [];
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

function checkSec05UnicodeNfkc(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') && !relPath.endsWith('.ts') && !relPath.endsWith('.php')) return [];
  const isInputFile = /(?:routes|endpoints|api|schemas|controllers)[/\\]/i.test(relPath);
  if (!isInputFile) return [];

  const content = lines.join('\n');
  const hasStringValidation =
    (content.includes('str') || content.includes('string')) &&
    (content.includes('validator') ||
      content.includes('field_validator') ||
      content.includes('z.string()') ||
      content.includes('Assert\\') ||
      content.includes('Validation'));
  if (!hasStringValidation) return [];

  const hasNfkc =
    content.includes('NFKC') ||
    content.includes('FORM_KC') ||
    content.includes('normalize');
  if (!hasNfkc) {
    return [
      {
        rule_id: 'SEC-05',
        severity: 'MEDIUM',
        stig_owasp_ref: 'APSC-DV-002520 / Patrón 5',
        file: relPath,
        line: 1,
        message: 'Validadores de entrada de texto sin normalización canónica Unicode NFKC.',
        remediation: 'Aplicar unicodedata.normalize("NFKC", valor) o Normalizer::normalize($str, Normalizer::FORM_KC) en validadores para mitigar homoglyph bypass.',
      },
    ];
  }

  return [];
}

function checkSec06XssPrototypePollution(relPath: string, lines: string[]): SecurityFinding[] {
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('v-html') || line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
      const hasSanitize = line.includes('escapeHtml') || line.includes('DOMPurify') || line.includes('sanitize');
      if (!hasSanitize) {
        findings.push({
          rule_id: 'SEC-06',
          severity: 'HIGH',
          stig_owasp_ref: 'APSC-DV-002490 / Patrón 6',
          file: relPath,
          line: i + 1,
          message: 'Inyección de HTML dinámico (v-html / innerHTML / dangerouslySetInnerHTML) sin desinfección explícita.',
          remediation: 'Sanitizar siempre con DOMPurify.sanitize(...) o escapar con escapeHtml(...) antes de renderizar.',
        });
      }
    }
  }

  return findings;
}

function checkSec07SwaggerInProd(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('FastAPI(')) {
      const surrounding = lines.slice(i, i + 15).join('\n');
      const hasProdDocsCheck =
        surrounding.includes('docs_url=None') ||
        surrounding.includes('docs_url = None') ||
        surrounding.includes('openapi_url=None') ||
        surrounding.includes('openapi_url = None');

      if (!hasProdDocsCheck) {
        findings.push({
          rule_id: 'SEC-07',
          severity: 'MEDIUM',
          stig_owasp_ref: 'OWASP API8:2023 / Patrón 7',
          file: relPath,
          line: i + 1,
          message: 'Instanciación de FastAPI sin control de desactivación de Swagger/OpenAPI (docs_url=None) en producción.',
          remediation: 'Desactivar docs_url=None y openapi_url=None si el entorno no es desarrollo.',
        });
      }
    }
  }

  return findings;
}

function checkSec10Secrets(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    relPath.endsWith('verificar-secretos.sh')
  ) {
    return [];
  }
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) continue;

    if (line.includes('BEGIN PRIVATE KEY') || line.includes('BEGIN RSA PRIVATE KEY') || line.includes('BEGIN OPENSSH PRIVATE KEY')) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Clave criptográfica privada detectada en el código fuente.',
        remediation: 'Eliminar claves privadas del código y delegar en gestores de secretos o Vault.',
      });
    } else if (/ghp_[a-zA-Z0-9]{36}/.test(line)) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Token de acceso personal de GitHub hardcodeado detectado.',
        remediation: 'Revocar el token de inmediato e inyectarlo vía variables de entorno seguras.',
      });
    } else if (/(?:password|passwd|secret_key)\s*=\s*["'][a-zA-Z0-9!@#$%^&*()_+]{8,}["']/i.test(line) && !line.includes('placeholder') && !line.includes('example')) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Contraseña o clave secreta en texto plano asignada directamente en el código.',
        remediation: 'Utilizar variables de entorno o almacén de secretos externo.',
      });
    }
  }

  return findings;
}

function checkUi11x01VisualGeometry(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx') && !relPath.endsWith('.html')) {
    return [];
  }
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('<footer') && (line.includes('fixed') || line.includes('position: fixed'))) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'Refactoring UI / Spec 70 / Anti-JSDOM',
        file: relPath,
        line: i + 1,
        message: 'Footer con posición fija detectado (roba espacio vertical e infringe ergonomía in-flow).',
        remediation: 'Ubicar el <footer> en el flujo natural dentro del contenedor principal con margin-top: auto.',
      });
    }

    if (line.includes('outline-none') && !line.includes('focus-visible:') && !line.includes('outline-hidden')) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'WCAG 2.1 AA (2.4.7 Focus Visible)',
        file: relPath,
        line: i + 1,
        message: 'Clase outline-none sin reemplazo focus-visible detectada (elimina indicador de foco para accesibilidad).',
        remediation: 'Utilizar focus-visible:ring-2 o outline-hidden con un indicador visual accesible.',
      });
    }

    if (line.includes('text-white/50') || line.includes('text-white/40') || line.includes('text-white/30')) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'WCAG 2.1 AA (1.4.3 Contrast Minimum 4.5:1)',
        file: relPath,
        line: i + 1,
        message: 'Texto blanco translúcido con opacidad <= 50% detectado (degrada el ratio de contraste 4.5:1).',
        remediation: 'Utilizar colores sólidos con contraste garantizado como text-slate-300 o text-white/80.',
      });
    }
  }

  return findings;
}

function isTestFilePath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return (
    /(^|\/)(tests?|__tests__|spec)\//i.test(norm) ||
    /\.(unit|spec|test|e2e)\.(py|ts|tsx|js|jsx|php)$/i.test(norm) ||
    /(^|\/)test_[^/]+\.py$/i.test(norm) ||
    norm.endsWith('Test.php') ||
    norm.endsWith('.bats')
  );
}

function isAuditorSelfDefinition(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return /(^|\/)src\/tools\/(?:security-auditor|certify-gate|test-pyramid-auditor)\.ts$/.test(norm);
}

function checkRawSubInActorUsername(relPath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rawSubPattern =
    /actor_username\s*[:=]\s*(?:claims\.get\(\s*["']sub["']\s*\)|claims\[\s*["']sub["']\s*\]|(?:token|payload|jwt_payload)\.sub\b)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) continue;
    if (rawSubPattern.test(line)) {
      findings.push({
        rule_id: 'SEC-11',
        severity: 'HIGH',
        stig_owasp_ref: SEC_11_REF,
        file: relPath,
        line: i + 1,
        message:
          'Asignación directa de JWT "sub" (UUID crudo) a actor_username detectada en bitácora de auditoría.',
        remediation:
          'Resolver actor_username a un nombre humano legible (ej. user.username o claims.get("username")) y nunca almacenar un UUID v4 crudo como nombre visible.',
      });
    }
  }
  return findings;
}

function isDirectRealAuditFunctionTest(fullContent: string): boolean {
  const importsRealAuditFn =
    /\bfrom\s+[A-Za-z0-9_.]*audit\s+import\s+[^\n]*\b(?:write_audit_log|writeAuditLog)\b/.test(
      fullContent
    );
  const patchesAuditFn =
    /(?:patch|setattr)\s*\([^)]*(?:write_audit_log|writeAuditLog)/.test(fullContent) ||
    /\b(?:write_audit_log|writeAuditLog)\s*=\s*(?:AsyncMock|MagicMock|vi\.fn)/.test(fullContent);

  if (importsRealAuditFn && !patchesAuditFn) {
    return true;
  }

  return (
    (fullContent.includes('record_sha256_hash') || fullContent.includes('prev_record_hash')) &&
    !patchesAuditFn
  );
}

function checkBlindAuditMockInTests(relPath: string, lines: string[]): SecurityFinding[] {
  const fullContent = lines.join('\n');
  const mocksAudit =
    fullContent.includes('write_audit_log') || fullContent.includes('writeAuditLog');
  if (!mocksAudit) return [];

  if (isDirectRealAuditFunctionTest(fullContent)) return [];

  const hasMockReplacement =
    fullContent.includes('AsyncMock') ||
    fullContent.includes('MagicMock') ||
    fullContent.includes('vi.fn()');
  if (!hasMockReplacement) return [];

  const hasPayloadAssertion =
    fullContent.includes('assert_called') ||
    fullContent.includes('assert_awaited') ||
    fullContent.includes('call_args') ||
    fullContent.includes('toHaveBeenCalledWith');

  if (hasPayloadAssertion) return [];

  const lineIdx = lines.findIndex(
    (l) => l.includes('write_audit_log') || l.includes('writeAuditLog')
  );

  return [
    {
      rule_id: 'SEC-11',
      severity: 'HIGH',
      stig_owasp_ref: SEC_11_REF,
      file: relPath,
      line: lineIdx + 1,
      message:
        'Mock ciego sobre write_audit_log detectado sin aserciones sobre los argumentos recibidos (assert_called_once / call_args).',
      remediation:
        'Inspeccionar explícitamente los argumentos pasados a write_audit_log verificando que actor_username y resource_display_name sean legibles y no UUIDs crudos.',
    },
  ];
}

function checkSec11AuditSemanticIntegrity(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    !relPath.endsWith('.py') &&
    !relPath.endsWith('.ts') &&
    !relPath.endsWith('.js') &&
    !relPath.endsWith('.php')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) {
    return checkBlindAuditMockInTests(relPath, lines);
  }
  return checkRawSubInActorUsername(relPath, lines);
}

function checkCatchAllDomainElse(relPath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const catchAllPattern =
    /\belse\s*\{?\s*return\s+["'](?:MAINTENANCE|MANTENIMIENTO|CAÍDA|CAIDA|CRITICAL|SECURITY|SEGURIDAD)["']/i;

  for (let i = 0; i < lines.length; i++) {
    if (catchAllPattern.test(lines[i])) {
      findings.push({
        rule_id: 'UI-11X-02',
        severity: 'MEDIUM',
        stig_owasp_ref: UI_11X_02_REF,
        file: relPath,
        line: i + 1,
        message:
          'Cláusula else genérica detectada devolviendo una insignia de dominio específica (ej. MAINTENANCE / MANTENIMIENTO).',
        remediation:
          'Mapear explícitamente cada categoría de evento (CAÍDA, MANTENIMIENTO, RESPALDO, SEGURIDAD, OPERACIÓN) y usar una etiqueta neutral (OPERACIÓN / INFO) en el caso por defecto.',
      });
    }
  }
  return findings;
}

function checkUncleanedSetInterval(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx')) {
    return [];
  }
  const fullContent = lines.join('\n');
  if (!fullContent.includes('setInterval(')) return [];
  if (fullContent.includes('clearInterval(')) return [];

  const lineIdx = lines.findIndex((l) => l.includes('setInterval('));
  return [
    {
      rule_id: 'UI-11X-02',
      severity: 'HIGH',
      stig_owasp_ref: UI_11X_02_REF,
      file: relPath,
      line: lineIdx + 1,
      message:
        'Uso de setInterval() en componente UI sin limpieza correspondiente con clearInterval() en onUnmounted / useEffect.',
      remediation:
        'Almacenar el identificador del intervalo y limpiarlo con clearInterval() dentro de onUnmounted (Vue 3) o en el retorno de useEffect (React).',
    },
  ];
}

function checkUi11x02DualRefreshAndSemanticElse(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    !relPath.endsWith('.vue') &&
    !relPath.endsWith('.tsx') &&
    !relPath.endsWith('.jsx') &&
    !relPath.endsWith('.ts')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) return [];

  return [
    ...checkCatchAllDomainElse(relPath, lines),
    ...checkUncleanedSetInterval(relPath, lines),
  ];
}

function checkSingleDirNpmrc(baseDir: string, relPrefix: string): SecurityFinding | null {
  const pkgPath = path.join(baseDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  const npmrcCandidates = [
    path.join(baseDir, '.npmrc'),
    path.join(baseDir, 'npmrc.example'),
    path.join(baseDir, '.npmrc.example'),
  ];

  for (const candidate of npmrcCandidates) {
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, 'utf8');
      if (content.includes('ignore-scripts=true') || content.includes('ignore-scripts = true')) {
        return null;
      }
    }
  }

  return {
    rule_id: 'SEC-09',
    severity: 'HIGH',
    stig_owasp_ref: 'OWASP SFL / Zero-Trust NPM',
    file: relPrefix ? `${relPrefix}/.npmrc` : '.npmrc',
    line: 1,
    message: 'Proyecto Node.js carece de archivo .npmrc con directiva estricta ignore-scripts=true.',
    remediation:
      'Crear .npmrc con ignore-scripts=true para prevenir ejecución de scripts maliciosos en instalación.',
  };
}

function checkSec09Npmrc(projectPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rootFinding = checkSingleDirNpmrc(projectPath, '');
  if (rootFinding) findings.push(rootFinding);

  const subDirs = ['vue3', 'react-frontend', 'node-backend', 'frontend', 'mcp-server'];
  for (const sub of subDirs) {
    const subFinding = checkSingleDirNpmrc(path.join(projectPath, sub), sub);
    if (subFinding) findings.push(subFinding);
  }
  return findings;
}

function checkSec08Oshp(projectPath: string, allRelFiles: string[]): SecurityFinding[] {
  const hasBackendApp = allRelFiles.some((f) => f.endsWith('main.py') || f.endsWith('app.py') || f.endsWith('server.ts') || f.endsWith('index.ts'));
  if (!hasBackendApp) return [];

  for (const relFile of allRelFiles) {
    if (!relFile.endsWith('.py') && !relFile.endsWith('.ts') && !relFile.endsWith('.js')) continue;
    const fullPath = path.join(projectPath, relFile);
    try {
      const text = fs.readFileSync(fullPath, 'utf8');
      if (
        text.includes('Strict-Transport-Security') ||
        text.includes('Content-Security-Policy') ||
        text.includes('X-Content-Type-Options')
      ) {
        return [];
      }
    } catch {
      // Ignorar errores de lectura
    }
  }

  return [
    {
      rule_id: 'SEC-08',
      severity: 'MEDIUM',
      stig_owasp_ref: 'OWASP 5.4.4 / Cabeceras OSHP',
      file: 'src/',
      line: 1,
      message: 'No se detectó configuración de cabeceras de seguridad OWASP OSHP (HSTS, CSP, X-Content-Type-Options).',
      remediation: 'Incorporar middleware de seguridad inyectando HSTS, CSP estricto y X-Content-Type-Options: nosniff.',
    },
  ];
}

function checkProjectLevelRules(projectPath: string, allRelFiles: string[]): SecurityFinding[] {
  return [
    ...checkSec09Npmrc(projectPath),
    ...checkSec08Oshp(projectPath, allRelFiles),
    ...checkQaMypy01StrictChain(projectPath),
    ...checkQaHealth01ContainerHeartbeatContract(projectPath, allRelFiles),
  ];
}

const SYSTEM_NON_HEARTBEAT_PATHS = new Set([
  '/var/run/docker.sock',
  '/var/run/postgresql',
  '/tmp/.coverage',
]);

function collectContainerHealthFiles(projectPath: string, allRelFiles: string[]): string[] {
  const composeFiles = allRelFiles.filter(
    (rel) => !rel.endsWith('.example') && /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(rel)
  );
  const dockerDirs = ['', 'fastapi', 'python', 'backend', 'node-backend'];
  const dockerVariants = ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.workers'];
  const extraDockerfiles: string[] = [];

  for (const sub of dockerDirs) {
    for (const df of dockerVariants) {
      const rel = sub ? path.join(sub, df) : df;
      if (fs.existsSync(path.join(projectPath, rel))) {
        extraDockerfiles.push(rel);
      }
    }
  }

  return Array.from(new Set([...composeFiles, ...extraDockerfiles]));
}

function extractContainerProbePaths(projectPath: string, allRelFiles: string[]): string[] {
  const candidates = collectContainerHealthFiles(projectPath, allRelFiles);
  const probes = new Set<string>();
  const probeRegex = /\/(?:tmp|var\/run|run)\/[A-Za-z0-9_.-]{3,64}/g;

  for (const rel of candidates) {
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (!content.includes('healthcheck') && !content.includes('HEALTHCHECK')) continue;
      const matches = content.match(probeRegex) ?? [];
      for (const match of matches) {
        if (!SYSTEM_NON_HEARTBEAT_PATHS.has(match) && !match.endsWith('.sock')) {
          probes.add(match);
        }
      }
    } catch {
      // Ignorar errores de lectura puntual
    }
  }

  return Array.from(probes);
}

interface ProbeSourceMatch {
  relFile: string;
  line: number;
  symbolNames: string[];
}

function isProductionSourceCandidate(rel: string): boolean {
  if (rel.endsWith('.example') || isTestFilePath(rel) || isAuditorSelfDefinition(rel)) {
    return false;
  }
  return /\.(?:py|ts|js|php|sh)$/.test(rel);
}

function extractAssignedConstants(lines: string[], targetToken: string): { line: number; symbols: string[] } {
  const symbols: string[] = [];
  let firstLine = 1;
  const constRegex = /^\s*([A-Z][A-Z0-9_]{2,50})\b/;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(targetToken)) continue;
    if (firstLine === 1) firstLine = i + 1;
    const match = lines[i].match(constRegex);
    if (match) symbols.push(match[1]);
  }

  return { line: firstLine, symbols };
}

function findSourceOrchestratorForProbe(
  projectPath: string,
  allRelFiles: string[],
  probePath: string
): ProbeSourceMatch | null {
  const baseToken = path.basename(probePath);
  for (const rel of allRelFiles) {
    if (!isProductionSourceCandidate(rel)) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (!content.includes(probePath) && !content.includes(baseToken)) continue;
      if (content.includes(QA_HEALTH_OK_PRAGMA)) return null;
      const lines = content.split(/\r?\n/);
      const matchedToken = content.includes(probePath) ? probePath : baseToken;
      const { line, symbols } = extractAssignedConstants(lines, matchedToken);
      return { relFile: rel, line, symbolNames: symbols };
    } catch {
      // Ignorar errores de lectura puntual
    }
  }
  return null;
}

function testFileAssertsProbeUnmocked(
  content: string,
  tokens: string[]
): boolean {
  const mentionsToken = tokens.some((tok) => content.includes(tok));
  if (!mentionsToken) return false;
  if (content.includes(QA_HEALTH_OK_PRAGMA)) return true;

  const mocksHeartbeatWrite =
    content.includes('write_text') && (content.includes('patch(') || content.includes('monkeypatch'));
  if (mocksHeartbeatWrite && !content.includes('.exists()')) return false;

  const assertionMarkers = [
    '.exists()',
    'os.path.exists',
    '.is_file()',
    '.read_text(',
    'existsSync(',
    'statSync(',
  ];
  return assertionMarkers.some((marker) => content.includes(marker));
}

function hasUnmockedProbeTestAssertion(
  projectPath: string,
  allRelFiles: string[],
  probePath: string,
  symbolNames: string[]
): boolean {
  const tokens = [probePath, path.basename(probePath), ...symbolNames];
  for (const rel of allRelFiles) {
    if (!isTestFilePath(rel) && !rel.endsWith('.feature')) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (testFileAssertsProbeUnmocked(content, tokens)) return true;
    } catch {
      // Ignorar errores de lectura puntual
    }
  }
  return false;
}

function checkQaHealth01ContainerHeartbeatContract(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const probePaths = extractContainerProbePaths(projectPath, allRelFiles);
  const findings: SecurityFinding[] = [];

  for (const probePath of probePaths) {
    const orchestrator = findSourceOrchestratorForProbe(projectPath, allRelFiles, probePath);
    if (!orchestrator) continue;
    const verified = hasUnmockedProbeTestAssertion(
      projectPath,
      allRelFiles,
      probePath,
      orchestrator.symbolNames
    );
    if (!verified) {
      findings.push({
        rule_id: 'QA-HEALTH-01',
        severity: 'HIGH',
        stig_owasp_ref: QA_HEALTH_01_REF,
        file: orchestrator.relFile,
        line: orchestrator.line,
        message: `El contenedor exige la sonda '${probePath}' en healthcheck, pero ningún test afirma su existencia real (.exists()/read_text) sin mockear el orquestador.`,
        remediation:
          'Añadir un test de contrato que arranque el orquestador con Settings() de producción por defecto (sin mockear loops opcionales) y haga assert explícito sobre el archivo/señal de healthcheck.',
      });
    }
  }

  return findings;
}

function checkQaMypy01StrictChain(projectPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const subDirs = ['', 'fastapi', 'python', 'backend'];

  for (const sub of subDirs) {
    const dirPath = sub ? path.join(projectPath, sub) : projectPath;
    const pyprojectPath = path.join(dirPath, 'pyproject.toml');
    const makefilePath = path.join(dirPath, 'Makefile');
    if (!fs.existsSync(pyprojectPath) || !fs.existsSync(makefilePath)) continue;

    try {
      const pyContent = fs.readFileSync(pyprojectPath, 'utf8');
      if (!pyContent.includes('[tool.mypy]')) continue;

      const makeContent = fs.readFileSync(makefilePath, 'utf8');
      const hasQaLintWithRuff = /qa-lint:[\s\S]*?\bruff\b/.test(makeContent);
      const hasMypy = /\bmypy\b/.test(makeContent);
      if (hasQaLintWithRuff && !hasMypy) {
        const relMake = path.relative(projectPath, makefilePath);
        findings.push({
          rule_id: 'QA-MYPY-01',
          severity: 'HIGH',
          stig_owasp_ref: 'Standard 11X Law 2 / Pre-Push Strict Type Parity',
          file: relMake,
          line: 1,
          message:
            'pyproject.toml define [tool.mypy], pero el Makefile ejecuta ruff en qa-lint sin encadenar mypy.',
          remediation:
            'Encadenar obligatoriamente mypy --strict --cache-dir=/tmp/mypy src/ junto a ruff check y ruff format --check antes de pytest.',
        });
      }
    } catch {
      // Ignorar errores de lectura puntual
    }
  }

  return findings;
}

function checkQaKarateStaticIdempotency(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.feature')) return [];
  const findings: SecurityFinding[] = [];
  const staticUuidHeaderRegex =
    /header\s+Idempotency-Key\s*=\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

function checkSec12McpServiceRbac(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') || !/(?:mcp|jsonrpc)/i.test(relPath)) return [];
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }

  const fullText = lines.join('\n');
  const hasRbacOrApproval =
    fullText.includes('claims.get("role")') ||
    fullText.includes("claims.get('role')") ||
    fullText.includes('claims.get("rol")') ||
    fullText.includes("claims.get('rol')") ||
    fullText.includes('claims["role"]') ||
    fullText.includes("claims['role']") ||
    fullText.includes('claims["rol"]') ||
    fullText.includes("claims['rol']") ||
    fullText.includes('assert_service_rbac') ||
    fullText.includes('ApprovalRequest') ||
    fullText.includes('AWAITING_APPROVAL');

  if (hasRbacOrApproval) return [];

  const findings: SecurityFinding[] = [];
  const mutatingToolRegex = /^\s*async\s+def\s+(?:dispatch_|handle_|tool_)?(?:create|update|delete|execute|apply|reboot)_[A-Za-z0-9_]+\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    if (mutatingToolRegex.test(lines[i])) {
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

function checkSec13RlsMultiTxPersistence(relPath: string, lines: string[]): SecurityFinding[] {
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
      line: (lineIdx >= 0 ? lineIdx : 0) + 1,
      message:
        'Se detectó SET LOCAL / set_config("app.current_tenant_id") en AsyncSession sin listener "after_begin". Tras un await db.commit() intermedio, la segunda transacción perderá el contexto RLS.',
      remediation:
        'Almacenar (tenant_id, is_superadmin) en session.sync_session.info y registrar @event.listens_for(AsyncSession.sync_session_class, "after_begin") para re-inyectar SET LOCAL automáticamente (ver recurso MCP blueprint://database/postgres-rls-worm).',
    },
  ];
}

function checkSec14WormDeterministicChain(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py') || isTestFilePath(relPath)) return [];
  const fullText = lines.join('\n');
  const isWormChainFile =
    fullText.includes('prev_record_hash') &&
    (fullText.includes('def write_audit_log') || fullText.includes('record_sha256_hash'));
  if (!isWormChainFile) return [];

  const ordersByCreatedAt =
    /order_by\s*\([^)]*created_at/i.test(fullText) || /ORDER\s+BY\s+[^\n]*created_at/i.test(fullText);
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
      line: (lineIdx >= 0 ? lineIdx : 0) + 1,
      message:
        'Cadena forense WORM (prev_record_hash) ordena únicamente por created_at DESC sin secuencia monotónica (seq_num) ni pg_advisory_xact_lock, quedando vulnerable a empates de reloj y condiciones de carrera.',
      remediation:
        'Usar seq_num BIGINT DEFAULT nextval(...), SELECT pg_advisory_xact_lock(hashtext(tenant_key)), seguimiento en memoria de sesión (_rg_in_tx_audit_hash / _in_tx_audit_hash) y await session.flush() (ver blueprint://database/postgres-rls-worm).',
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

function checkQaCov01AddoptsBypass(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isQaRunnerFile(relPath)) return [];

  const findings: SecurityFinding[] = [];
  const bareAddoptsRegex = /\bpytest\b[^\n]*-o\s+addopts=(?:""|''|\\""|\\'')/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!bareAddoptsRegex.test(line)) continue;

    if (!line.includes('--cov')) {
      findings.push({
        rule_id: 'QA-COV-01',
        severity: 'HIGH',
        stig_owasp_ref: 'Standard 11X Law 2 / Non-Root Ephemeral Coverage Enforcement',
        file: relPath,
        line: i + 1,
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
        line: i + 1,
        message:
          'Se detectó ejecución de pytest con -o addopts="" sobre suites de doble extensión (*.unit.py, *.int.py) sin --import-mode=importlib, provocando ModuleNotFoundError / ImportPathMismatchError en colección.',
        remediation:
          'Exigir siempre --import-mode=importlib y PYTHONPATH=/app/src cuando se ejecute pytest -o addopts="" sobre archivos *.unit.py / *.int.py.',
      });
    }
  }

  return findings;
}

function checkQaPg17RlsInvalidCatalog(relPath: string, lines: string[]): SecurityFinding[] {
  if (isAuditorSelfDefinition(relPath) || relPath.endsWith('.md')) return [];
  if (!/\.(py|sql|sh)$/i.test(relPath)) return [];

  const fullText = lines.join('\n');
  const invalidCatalogRegex =
    /\bpg_tables\s*\.\s*forcerowsecurity\b|\bforcerowsecurity\b[\s\S]{0,140}\bFROM\s+(?:pg_catalog\.)?pg_tables\b|\bFROM\s+(?:pg_catalog\.)?pg_tables\b[\s\S]{0,140}\bforcerowsecurity\b/i;
  if (!invalidCatalogRegex.test(fullText)) return [];

  const lineIdx = lines.findIndex((l) => /forcerowsecurity/i.test(l));
  return [
    {
      rule_id: 'QA-PG17-RLS',
      severity: 'HIGH',
      stig_owasp_ref: 'Standard 11X Law 7 / PostgreSQL 15-17+ RLS Catalog Parity',
      file: relPath,
      line: lineIdx >= 0 ? lineIdx + 1 : 1,
      message:
        'Auditoría RLS consulta la columna inexistente pg_tables.forcerowsecurity (ausente en PostgreSQL 15–17+), causando errores SQL en integración/CI.',
      remediation:
        'Verificar FORCE ROW LEVEL SECURITY consultando pg_catalog.pg_class.relforcerowsecurity con JOIN pg_catalog.pg_namespace (relrowsecurity = true AND relforcerowsecurity = true).',
    },
  ];
}

function checkQaSmoke01SettingsSingletonSync(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.py')) return [];
  const fullText = lines.join('\n');
  if (!fullText.includes('create_app(')) return [];

  const setsOsEnvironProd =
    /os\.environ\s*\[\s*["'][A-Z0-9_]*ENV["']\s*\]\s*=\s*["']production["']/.test(fullText);
  if (!setsOsEnvironProd) return [];

  const syncsSingleton =
    /\bsettings\.[A-Za-z0-9_]*ENV\s*=\s*["']production["']/.test(fullText) ||
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
      line: (lineIdx >= 0 ? lineIdx : 0) + 1,
      message:
        'Smoke test muta os.environ["..._ENV"] = "production" antes de create_app() sin sincronizar el singleton settings ya instanciado en memoria tras importar src/.',
      remediation:
        'Actualizar explícitamente el atributo en el singleton (ej. settings.APP_ENV = "production" o settings.ROSGRID_ENV = "production") además de os.environ, restaurando ambos en un bloque finally.',
    },
  ];
}

function isDockerExecCommand(text: string): boolean {
  return text.includes('docker exec') || text.includes('docker compose exec');
}

function checkSec15EphemeralProdPipelineCreds(relPath: string, lines: string[]): SecurityFinding[] {
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
      line: (lineIdx >= 0 ? lineIdx : 0) + 1,
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
    line: lineIdx >= 0 ? lineIdx + 1 : 1,
    message:
      'Interceptor HTTP 401 excluye /auth/login y /auth/refresh pero omite rutas pre-autenticación multi-etapa (/auth/bootstrap, /auth/2fa/*, confirm-enrollment).',
    remediation:
      'Sincronizar una lista simétrica PREAUTH_PUBLIC_ROUTES entre backend y el predicado de exclusión 401 del cliente HTTP para evitar rotaciones /auth/refresh sin sesión activa.',
  };
}

function checkPreAuthNonAtomicChallengeConsumption(
  relPath: string,
  lines: string[],
  fullText: string
): SecurityFinding | null {
  if (!relPath.endsWith('.py') && !relPath.endsWith('.ts') && !relPath.endsWith('.js') && !relPath.endsWith('.php')) {
    return null;
  }
  if (!/(?:auth|2fa|mfa|bootstrap|challenge)/i.test(relPath)) return null;

  const handlesChallenge =
    fullText.includes('challenge_id') &&
    (fullText.includes('confirm-enrollment') ||
      fullText.includes('confirm_enrollment') ||
      fullText.includes('verify_2fa') ||
      fullText.includes('2fa/verify') ||
      fullText.includes('preauth'));
  if (!handlesChallenge) return null;

  const usesNonAtomicGet = /\b(?:redis|keydb|cache_client|redis_client)\s*\.\s*get\s*\(/.test(fullText);
  const hasAtomicConsume =
    /\bgetdel\b/i.test(fullText) ||
    /\bevalsha?\s*\(/.test(fullText) ||
    fullText.includes('idemp:preauth:');

  if (!usesNonAtomicGet || hasAtomicConsume) return null;

  const lineIdx = lines.findIndex((l) => /\.get\s*\(/.test(l));
  return {
    rule_id: 'SEC-16',
    severity: 'HIGH',
    stig_owasp_ref: SEC_16_REF,
    file: relPath,
    line: lineIdx >= 0 ? lineIdx + 1 : 1,
    message:
      'Consumo no atómico (.get sin GETDEL/Lua ni idemp:preauth) de challenge_id efímero de pre-autenticación en Redis/KeyDB (riesgo TOCTOU CWE-362).',
    remediation:
      'Consumir el challenge de un solo uso atómicamente con GETDEL / script Lua, imponer TTL <= 300s + límite de intentos, y validar Origin/Sec-Fetch-Site junto al token CSPRNG en JSON/header.',
  };
}

function checkSec16PreAuthMultiStepContinuity(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkQaHealth01SupervisorTaskExit(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    !relPath.endsWith('.py') ||
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath)
  ) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(QA_HEALTH_OK_PRAGMA)) continue;
    if (!line.includes('.done()') || !line.includes('.cancelled()')) continue;

    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(lines.length, i + 12);
    const windowText = lines.slice(windowStart, windowEnd).join('\n');
    if (windowText.includes('.exception()') || windowText.includes(QA_HEALTH_OK_PRAGMA)) {
      continue;
    }

    findings.push({
      rule_id: 'QA-HEALTH-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_HEALTH_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Supervisor asyncio evalúa task.done() y task.cancelled() sin inspeccionar task.exception() ni distinguir retorno limpio opt-in (return None) de fallos fatales.',
      remediation:
        'Inspeccionar task.exception() is not None y declarar OPTIONAL_WORKERS para que salidas limpias por feature-flag deshabilitado no degraden el healthcheck del contenedor.',
    });
  }

  return findings;
}

function isDualCliMcpStdioSource(relPath: string, fullText: string): boolean {
  if (/\.(?:ts|js)$/i.test(relPath)) {
    const hasStdioTransport = fullText.includes('StdioServerTransport');
    const hasCliEntrypoint =
      fullText.includes('process.argv') || fullText.startsWith('#!/usr/bin/env node');
    return hasStdioTransport && hasCliEntrypoint && !fullText.includes('.isTTY');
  }

  if (relPath.endsWith('.py')) {
    const hasStdioServer = fullText.includes('stdio_server(');
    const hasCliEntrypoint =
      fullText.includes('sys.argv') ||
      fullText.includes('argparse.') ||
      fullText.includes('typer.Typer');
    return hasStdioServer && hasCliEntrypoint && !fullText.includes('.isatty()');
  }

  return false;
}

function checkQaCliTty01InteractiveHangGuard(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath)
  ) {
    return [];
  }

  const fullText = lines.join('\n');
  if (fullText.includes(QA_TTY_OK_PRAGMA) || !isDualCliMcpStdioSource(relPath, fullText)) {
    return [];
  }

  const transportIdx = lines.findIndex(
    (line) => line.includes('StdioServerTransport') || line.includes('stdio_server(')
  );

  return [
    {
      rule_id: 'QA-CLI-TTY-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_CLI_TTY_01_REF,
      file: relPath,
      line: Math.max(1, transportIdx + 1),
      message:
        'Binario dual CLI + Servidor MCP stdio conecta transporte JSON-RPC sobre stdin sin verificar terminal interactiva (process.stdin.isTTY / sys.stdin.isatty()), provocando bloqueo indefinido al ejecutarse manualmente en consola.',
      remediation:
        'Inspeccionar process.stdin.isTTY (Node/TS) o sys.stdin.isatty() (Python) cuando se invoca sin subcomandos para ejecutar auto-sync/mostrar ayuda y salir con código 0 sin colgar la terminal (permitiendo --stdio explícito), certificándolo en E2E con TTY simulado y timeout.',
    },
  ];
}

function scanSingleFile(absPath: string, relPath: string): SecurityFinding[] {
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  return [
    ...checkSec01MassAssignment(relPath, lines),
    ...checkSec02AntiCswsh(relPath, lines),
    ...checkSec03CommandAndDeserialization(relPath, lines),
    ...checkSec04Xxe(relPath, lines),
    ...checkSec05UnicodeNfkc(relPath, lines),
    ...checkSec06XssPrototypePollution(relPath, lines),
    ...checkSec07SwaggerInProd(relPath, lines),
    ...checkSec10Secrets(relPath, lines),
    ...checkSec11AuditSemanticIntegrity(relPath, lines),
    ...checkSec12McpServiceRbac(relPath, lines),
    ...checkSec13RlsMultiTxPersistence(relPath, lines),
    ...checkSec14WormDeterministicChain(relPath, lines),
    ...checkSec15EphemeralProdPipelineCreds(relPath, lines),
    ...checkSec16PreAuthMultiStepContinuity(relPath, lines),
    ...checkQaCov01AddoptsBypass(relPath, lines),
    ...checkQaPg17RlsInvalidCatalog(relPath, lines),
    ...checkQaSmoke01SettingsSingletonSync(relPath, lines),
    ...checkQaHealth01SupervisorTaskExit(relPath, lines),
    ...checkQaCliTty01InteractiveHangGuard(relPath, lines),
    ...checkQaKarateStaticIdempotency(relPath, lines),
    ...checkUi11x01VisualGeometry(relPath, lines),
    ...checkUi11x02DualRefreshAndSemanticElse(relPath, lines),
  ];
}

function countSeverities(findings: SecurityFinding[]): {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
} {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) {
    if (f.severity in counts) {
      counts[f.severity]++;
    }
  }
  return counts;
}

export function groupFindingsByRule(
  findings: SecurityFinding[],
  maxLocationsPerRule = 15
): GroupedSecurityFinding[] {
  const groups = new Map<string, GroupedSecurityFinding>();

  for (const f of findings) {
    const existing = groups.get(f.rule_id);
    const loc = `${f.file}:${f.line}`;
    if (!existing) {
      groups.set(f.rule_id, {
        rule_id: f.rule_id,
        severity: f.severity,
        stig_owasp_ref: f.stig_owasp_ref,
        message: f.message,
        remediation: f.remediation,
        occurrences_count: 1,
        locations: [loc],
      });
    } else {
      existing.occurrences_count++;
      if (existing.locations.length < maxLocationsPerRule) {
        existing.locations.push(loc);
      }
    }
  }

  return Array.from(groups.values());
}

/**
 * Tool 5: audit_security_stig_owasp
 * Audita estáticamente el código fuente frente a los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
 */
export async function auditSecurityStigOwasp(
  projectPath: string,
  maxFindings?: number
): Promise<SecurityAuditResult> {
  const resolvedPath = path.resolve(projectPath);
  const allAbsoluteFiles = collectFiles(resolvedPath);
  const allRelFiles = allAbsoluteFiles.map((abs) => path.relative(resolvedPath, abs));
  const findings: SecurityFinding[] = [];

  for (let i = 0; i < allAbsoluteFiles.length; i++) {
    findings.push(...scanSingleFile(allAbsoluteFiles[i], allRelFiles[i]));
  }

  findings.push(...checkProjectLevelRules(resolvedPath, allRelFiles));

  const counts = countSeverities(findings);
  const passed = counts.CRITICAL === 0 && counts.HIGH === 0;
  const groupedFindings = groupFindingsByRule(findings);

  let returnedFindings = findings;
  let truncatedCount: number | undefined;

  if (typeof maxFindings === 'number' && maxFindings >= 0 && findings.length > maxFindings) {
    returnedFindings = findings.slice(0, maxFindings);
    truncatedCount = findings.length - maxFindings;
  }

  return {
    project_path: resolvedPath,
    passed,
    total_files_scanned: allAbsoluteFiles.length,
    findings_count: counts,
    findings: returnedFindings,
    grouped_findings: groupedFindings,
    ...(truncatedCount !== undefined ? { truncated_findings_count: truncatedCount } : {}),
  };
}
