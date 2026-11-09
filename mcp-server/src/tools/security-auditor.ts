// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

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
]);

const SCANNABLE_EXTS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.sh',
  '.bash',
  '.json',
  '.php',
  '.feature',
]);

const APSC_DV_002510_REF = 'APSC-DV-002510 / Patrón 3';
const SEC_10_REF = 'APSC-DV-000650 / V-222444 / Patrón 10';
const SEC_11_REF = 'APSC-DV-001350 / Anti-Silo Audit Rule 3';
const UI_11X_02_REF = 'Standard 11X / Anti-Silo UI Rule 3 & 4';

function isScannableFile(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  const ext = path.extname(entry.name).toLowerCase();
  return SCANNABLE_EXTS.has(ext) || entry.name === '.npmrc' || entry.name.startsWith('.env');
}

function shouldSkipDirectory(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false;
  if (IGNORED_DIRS.has(entry.name)) return true;
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
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx') && !relPath.endsWith('.ts') && !relPath.endsWith('.js')) {
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
  if (relPath.endsWith('.example') || relPath.includes('test')) return [];
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
  return (
    relPath.includes('.unit.') ||
    relPath.includes('.spec.') ||
    relPath.includes('.test.') ||
    relPath.includes('test_') ||
    relPath.endsWith('Test.php')
  );
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

function checkBlindAuditMockInTests(relPath: string, lines: string[]): SecurityFinding[] {
  const fullContent = lines.join('\n');
  const mocksAudit =
    fullContent.includes('write_audit_log') || fullContent.includes('writeAuditLog');
  if (!mocksAudit) return [];

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

function checkSec09Npmrc(projectPath: string): SecurityFinding[] {
  const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
  if (!hasPackageJson) return [];

  const npmrcPath = path.join(projectPath, '.npmrc');
  let hasIgnoreScripts = false;
  if (fs.existsSync(npmrcPath)) {
    const content = fs.readFileSync(npmrcPath, 'utf8');
    hasIgnoreScripts = content.includes('ignore-scripts=true') || content.includes('ignore-scripts = true');
  }

  if (hasIgnoreScripts) return [];

  return [
    {
      rule_id: 'SEC-09',
      severity: 'HIGH',
      stig_owasp_ref: 'OWASP SFL / Zero-Trust NPM',
      file: '.npmrc',
      line: 1,
      message: 'Proyecto Node.js carece de archivo .npmrc con directiva estricta ignore-scripts=true.',
      remediation: 'Crear .npmrc en la raíz con ignore-scripts=true para prevenir ejecución de scripts maliciosos en instalación.',
    },
  ];
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
  ];
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
  if (relPath.includes('test') || relPath.includes('spec')) return [];

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
