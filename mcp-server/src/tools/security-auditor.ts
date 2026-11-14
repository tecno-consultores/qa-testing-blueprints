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
  'vendor',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'target',
  'graphify-out',
  '.stryker-tmp',
  '.trivycache',
]);

const WEBMANIFEST_EXT = '.webmanifest';

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
  WEBMANIFEST_EXT,
]);

const APSC_DV_002510_REF = 'APSC-DV-002510 / Patrón 3';
const SEC_10_REF = 'APSC-DV-000650 / V-222444 / Patrón 10';
const SEC_11_REF = 'APSC-DV-001350 / Anti-Silo Audit Rule 3';
const SEC_16_REF = 'CWE-352 / CWE-362 / APSC-DV-000530 / Anti-Silo Rule 8';
const QA_HEALTH_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 9';
const QA_HEALTH_OK_PRAGMA = '# qa-health-ok';
const QA_CLI_TTY_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 10';
const QA_TTY_OK_PRAGMA = 'qa-tty-ok';
const QA_DOCKER_TTY_01_RULE = 'QA-DOCKER-TTY-01';
const QA_DOCKER_TTY_01_REF =
  'APSC-DV-002310 / Rule Zero Non-Interactive CI & Read-Only Container Contract';
const QA_DOCKER_TTY_OK_PRAGMA = 'qa-docker-tty-ok';
const QA_DOCKER_TTY_NO_TTY_REMEDIATION =
  'Agregar -T (--no-TTY) a docker compose run en pipelines CI=true y scripts de despliegue/CI para impedir la asignación de pseudo-TTY (NoDefaultValueProvided).';
const QA_DOCKER_TTY_WRANGLER_REMEDIATION =
  'Precrear /app/.wrangler en el Dockerfile, montarlo como tmpfs con mode=1777,noexec,nosuid,nodev y pasar --force en wrangler pages project create y wrangler pages deploy.';
const COMPOSE_VALUE_FLAGS = new Set([
  '-f',
  '--file',
  '-p',
  '--project-name',
  '--profile',
  '--env-file',
  '--project-directory',
  '--ansi',
  '--progress',
  '-H',
  '--host',
  '-c',
  '--context',
]);
const COMPOSE_RUN_VALUE_FLAGS = new Set([
  '-u',
  '--user',
  '-e',
  '--env',
  '-v',
  '--volume',
  '-w',
  '--workdir',
  '-p',
  '--publish',
  '-l',
  '--label',
  '--name',
  '--entrypoint',
  '--cap-add',
  '--cap-drop',
  '--isolation',
  '--pull',
]);
const UI_11X_02_REF = 'Standard 11X / Anti-Silo UI Rule 3 & 4';
const SEC_CI_ACTION_REF_REF = 'DISA STIG V-222513 / APSC-DV-001430 / Supply Chain Pinning';
const SEC_CI_ACTION_OK_PRAGMA = 'sec-ci-action-ref-ok';
const SEC_CI_ACTION_REMEDIATION =
  'Fijar la acción mediante el hash SHA-1 completo de 40 caracteres del commit anotado (uses: owner/repo@<sha40> # vX.Y.Z) y verificar que el tag exista en remoto con git ls-remote --tags.';
const SHA40_RE = /^[0-9a-f]{40}$/;
const MUTABLE_BRANCH_RE = /^(?:main|master|head|develop|latest)$/i;
const UNPREFIXED_SEMVER_RE = /^[0-9]+\.[0-9]+/;
const QA_CI_ESCAPE_01_REF = 'APSC-DV-002510 / Rule Zero GitHub Actions vs Makefile Shell Expansion';
const QA_CI_ESCAPE_OK_PRAGMA = 'qa-ci-escape-ok';
const QA_CI_ESCAPE_REMEDIATION =
  'Reemplazar $$(...) o $${...} por sustitución simple $(...) / ${...} en bloques run: de GitHub Actions (donde bash expande $$ al PID numérico del proceso), o añadir # qa-ci-escape-ok si se genera un Makefile/Compose literal.';
const QA_MAKE_CURDIR_01_REF = 'APSC-DV-002310 / Rule Zero Sub-Makefile CURDIR Volume Boundary';
const QA_MAKE_CURDIR_OK_PRAGMA = 'qa-make-curdir-ok';
const QA_MAKE_CURDIR_REMEDIATION =
  'Reemplazar $(PWD) / ${PWD} por $(CURDIR) en sub-Makefiles invocables con $(MAKE) -C <subdir> (ej. HOST_PWD ?= $(CURDIR)) para evitar montar el directorio padre.';
const DOUBLE_DOLLAR_CI_RE = /\$\$[({][A-Za-z_]/;
const MAKE_PWD_VAR_RE = /\$\(PWD\)|\$\{PWD\}/g;
const MAKEFILE_NAMES = new Set(['Makefile', 'Makefile.example']);
const QA_CONTRACT_SDK_01_RULE = 'QA-CONTRACT-SDK-01';
const QA_CONTRACT_SDK_01_REF = 'Standard 11X UAT Rule #11 / Real-Runtime Protocol SDK Contract';
const QA_CONTRACT_SDK_OK_PRAGMA = 'qa-contract-sdk-ok';
const QA_CONTRACT_SDK_REMEDIATION =
  'Añadir al menos un test in-process usando el cliente/transporte real del SDK (InMemoryTransport + Client en TS o ClientSession / create_connected_server_and_client_session en Python) ejecutando list_tools y call_tool sin mockear el dispatcher.';
const QA_DOCKER_LOCK_01_RULE = 'QA-DOCKER-LOCK-01';
const QA_DOCKER_LOCK_01_REF = 'DISA APSC-DV-001430 / Standard 11X Lockfile & Container Smoke Parity';
const QA_DOCKER_LOCK_OK_PRAGMA = 'qa-docker-lock-ok';
const QA_DOCKER_LOCK_REMEDIATION =
  'Instalar dependencias en Dockerfile exclusivamente desde el lockfile (uv sync --frozen --no-dev, uv export --frozen --no-dev | uv pip install --system -r -, pnpm install --frozen-lockfile o npm ci) y ejecutar smoke test post-build sobre la imagen (import <app>, id -u != 0 y sonda 401 sin token).';
const QA_PLAYWRIGHT_PIN_RULE = 'QA-PLAYWRIGHT-PIN-01';
const QA_PLAYWRIGHT_PIN_REF = 'DISA STIG APSC-DV-001430 / Standard 11X Playwright Parity';
const QA_PLAYWRIGHT_PIN_OK_PRAGMA = 'qa-playwright-pin-ok';
const PLAYWRIGHT_PKGS = ['@playwright/test', 'playwright'] as const;
const PKG_DEP_SECTIONS = ['dependencies', 'devDependencies'] as const;
const PLAYWRIGHT_IMAGE_TAG_RE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)\b/g;
const EXACT_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const QA_SSR_HYDRATION_RULE = 'QA-SSR-HYDRATION-01';
const QA_SSR_HYDRATION_REF = 'Standard 11X Layer 8 E2E / SSR Dual-ColorScheme Hydration Parity';
const QA_SSR_HYDRATION_OK_PRAGMA = 'qa-ssr-hydration-ok';
const SSR_NPM_DEPS = new Set([
  'nuxt',
  'vitepress',
  'astro',
  'next',
  '@sveltejs/kit',
  'vite-ssg',
  '@vue/server-renderer',
  '@analogjs/platform',
  '@remix-run/node',
  '@remix-run/react',
  '@react-router/node',
  '@solidjs/start',
]);
const SSR_CONFIG_NAME_RE =
  /(?:^|\/)(?:nuxt|astro|next)\.config\.(?:ts|js|mjs|cjs|mts)$|(?:^|\/)\.vitepress\/config\.(?:ts|js|mjs|mts)$/i;
const SSR_THEME_MARKERS = [
  'prefers-color-scheme',
  'dataset.theme',
  'data-theme',
  'localStorage.theme',
  "localStorage.getItem('theme')",
  'localStorage.getItem("theme")',
  'useDark(',
  'useColorMode(',
  'next-themes',
  '@custom-variant dark',
  ".classList.toggle('dark'",
  '.classList.toggle("dark"',
];
const SSR_PREHYDRATE_V_IF_RE =
  /(?:\bv-(?:else-)?if)\s*=\s*(?:"[^"]*(?:localStorage|dataset\.theme|document\.documentElement)[^"]*"|'[^']*(?:localStorage|dataset\.theme|document\.documentElement)[^']*')/;
const PLAYWRIGHT_CONFIG_RE = /(?:^|\/)playwright\.config\.(?:ts|js|mjs|mts)$/i;
const E2E_TEST_FILE_RE = /(?:^|\/)(?:e2e|tests\/e2e)\/|\.(?:e2e|spec)\.(?:ts|tsx|js|jsx|mjs)$/i;
const HYDRATION_LISTENER_RE = /\bon\(\s*['"](?:console|pageerror)['"]/;
const PROBE_ASSERTION_MARKERS = [
  '.exists()',
  'os.path.exists',
  '.is_file()',
  '.read_text(',
  'existsSync(',
  'statSync(',
];
const PY_MOCK_PATCH_MARKERS = ['patch(', 'patch.object(', 'monkeypatch'];
const BOOTSTRAP_PY_PACKAGES = new Set([
  'pip',
  'uv',
  'setuptools',
  'wheel',
  'hatchling',
  'build',
  'flit-core',
  'poetry',
  'pipx',
]);
const PIP_VALUE_FLAGS = new Set([
  '-r',
  '--requirement',
  '-c',
  '--constraint',
  '-t',
  '--target',
  '--prefix',
  '-i',
  '--index-url',
  '--extra-index-url',
  '-f',
  '--find-links',
  '--python',
  '--root',
]);

function isScannableFile(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  const ext = path.extname(entry.name).toLowerCase();
  return (
    SCANNABLE_EXTS.has(ext) ||
    entry.name === '.npmrc' ||
    entry.name === '_headers' ||
    entry.name.startsWith('.env') ||
    MAKEFILE_NAMES.has(entry.name)
  );
}

function isDockerfileEntry(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  if (entry.name.endsWith('.example')) return false;
  return entry.name === 'Dockerfile' || /^Dockerfile\.[A-Za-z0-9_.-]+$/.test(entry.name);
}

function shouldSkipDirectory(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false;
  if (IGNORED_DIRS.has(entry.name) || entry.name === 'backups') return true;
  if (entry.name === '.agents' || entry.name === '.github') return false;
  return entry.name.startsWith('.') && entry.name !== '.npmrc';
}

function collectMatchingFiles(
  dirPath: string,
  predicate: (entry: fs.Dirent) => boolean
): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipDirectory(entry)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMatchingFiles(fullPath, predicate));
      } else if (predicate(entry)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Si no se puede leer el directorio, continuar silenciosamente
  }

  return results;
}

/**
 * Recopila recursivamente todos los archivos auditables del proyecto.
 */
function collectFiles(dirPath: string): string[] {
  return collectMatchingFiles(dirPath, isScannableFile);
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

const PACKAGE_JSON_FILENAME = 'package.json';
const ESLINTRC_JSON_FILENAME = '.eslintrc.json';

function checkSingleDirNpmrc(baseDir: string, relPrefix: string): SecurityFinding | null {
  const pkgPath = path.join(baseDir, PACKAGE_JSON_FILENAME);
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

function readJsonObjectSafe(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function checkLegacyPnpmField(pkgObj: Record<string, unknown>, relPrefix: string): SecurityFinding | null {
  const rawPnpm = pkgObj.pnpm;
  if (!rawPnpm || typeof rawPnpm !== 'object' || Array.isArray(rawPnpm)) return null;
  if (!('onlyBuiltDependencies' in rawPnpm)) return null;
  return {
    rule_id: 'SEC-09',
    severity: 'MEDIUM',
    stig_owasp_ref: 'OWASP SFL / pnpm 12 Supply-Chain allowBuilds',
    file: relPrefix ? `${relPrefix}/${PACKAGE_JSON_FILENAME}` : PACKAGE_JSON_FILENAME,
    line: 1,
    message:
      'package.json declara pnpm.onlyBuiltDependencies (ignorado en pnpm 12+ con ERR_PNPM_IGNORED_BUILDS).',
    remediation:
      'Eliminar la clave "pnpm" de package.json y declarar el mapa booleano allowBuilds en pnpm-workspace.yaml.',
  };
}

function hasSecurityPluginV3(pkgObj: Record<string, unknown>): boolean {
  const deps: Record<string, unknown> = {
    ...((pkgObj.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((pkgObj.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };
  const ver = deps['eslint-plugin-security'];
  return typeof ver === 'string' && /^(?:\^|~|>=)?3\./.test(ver.trim());
}

function checkLegacyEslintSecurityConfig(
  baseDir: string,
  pkgObj: Record<string, unknown>,
  relPrefix: string
): SecurityFinding | null {
  if (!hasSecurityPluginV3(pkgObj)) return null;
  const eslintObj = readJsonObjectSafe(path.join(baseDir, ESLINTRC_JSON_FILENAME));
  if (!eslintObj || !Array.isArray(eslintObj.extends)) return null;
  if (!eslintObj.extends.includes('plugin:security/recommended')) return null;
  return {
    rule_id: 'SEC-09',
    severity: 'MEDIUM',
    stig_owasp_ref: 'OWASP SAST / ESLint 8 + eslint-plugin-security v3',
    file: relPrefix ? `${relPrefix}/${ESLINTRC_JSON_FILENAME}` : ESLINTRC_JSON_FILENAME,
    line: 1,
    message:
      '.eslintrc.json extiende "plugin:security/recommended" (Flat Config) con eslint-plugin-security v3 en ESLint 8 clásico.',
    remediation:
      'Reemplazar "plugin:security/recommended" por "plugin:security/recommended-legacy" en .eslintrc.json.',
  };
}

function checkSec09NodeToolchainHygiene(baseDir: string, relPrefix: string): SecurityFinding[] {
  const pkgObj = readJsonObjectSafe(path.join(baseDir, PACKAGE_JSON_FILENAME));
  if (!pkgObj) return [];
  const findings: SecurityFinding[] = [];
  const legacyPnpm = checkLegacyPnpmField(pkgObj, relPrefix);
  if (legacyPnpm) findings.push(legacyPnpm);
  const legacyEslint = checkLegacyEslintSecurityConfig(baseDir, pkgObj, relPrefix);
  if (legacyEslint) findings.push(legacyEslint);
  return findings;
}

function checkSec09Npmrc(projectPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rootFinding = checkSingleDirNpmrc(projectPath, '');
  if (rootFinding) findings.push(rootFinding);
  findings.push(...checkSec09NodeToolchainHygiene(projectPath, ''));

  const subDirs = ['vue3', 'react-frontend', 'node-backend', 'frontend', 'mcp-server'];
  for (const sub of subDirs) {
    const subDir = path.join(projectPath, sub);
    const subFinding = checkSingleDirNpmrc(subDir, sub);
    if (subFinding) findings.push(subFinding);
    findings.push(...checkSec09NodeToolchainHygiene(subDir, sub));
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

const UI_11X_03_REF = 'W3C Manifest / Google Search >=48px / Cloudflare Edge Headers';
const UI_11X_03_OK_PRAGMA = 'ui-11x-03-ok';
const APPLE_TOUCH_REL = 'apple-touch-icon';
const FAVICON_ICO_NAME = 'favicon.ico';
const PATH_FAVICON_ICO = '/favicon.ico';
const HDR_CORP = 'cross-origin-resource-policy';
const HDR_SAME_ORIGIN = 'same-origin';
const HDR_CROSS_ORIGIN = 'cross-origin';
const WILDCARD_ALL_ROUTE = '/*';
const PUBLIC_DIR_NAME = 'public';

const WATCHED_EDGE_HEADERS = new Set([
  'cache-control',
  'x-robots-tag',
  HDR_CORP,
  'content-security-policy',
  'x-frame-options',
  'referrer-policy',
]);

const PUBLIC_EDGE_ASSET_PREFIXES = ['/favicons/', '/brand/', '/og/'];

interface EdgeHeaderOp {
  kind: 'detach' | 'set';
  name: string;
  value: string;
  line: number;
}

interface EdgeHeaderBlock {
  route: string;
  line: number;
  ops: EdgeHeaderOp[];
}

function makeUi11x03Finding(
  severity: 'HIGH' | 'MEDIUM',
  relPath: string,
  line: number,
  message: string,
  remediation: string
): SecurityFinding {
  return {
    rule_id: 'UI-11X-03',
    severity,
    stig_owasp_ref: UI_11X_03_REF,
    file: relPath,
    line,
    message,
    remediation,
  };
}

function readTextFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseJsonObjectTextSafe(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isDirectorySafe(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function joinSubpath(appDir: string, child: string): string {
  return appDir === '.' ? child : path.join(appDir, child);
}

function findLineNumberContaining(text: string, needle: string): number {
  if (!needle) return 1;
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes(needle));
  return idx >= 0 ? idx + 1 : 1;
}

function parseHtmlLinkAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').trim();
  }
  return attrs;
}

function hasSizeToken(sizesAttr: string, expectedSize: string): boolean {
  return sizesAttr
    .toLowerCase()
    .split(/\s+/)
    .includes(expectedSize);
}

function lineAtOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function checkAppleTouchLinkTag(
  relPath: string,
  line: number,
  cleanHref: string,
  sizesAttr: string
): SecurityFinding | null {
  if (cleanHref.endsWith('.webp') || cleanHref.endsWith('.svg')) {
    return makeUi11x03Finding(
      'HIGH',
      relPath,
      line,
      `Etiqueta rel="${APPLE_TOUCH_REL}" apunta a formato no soportado por Safari/iOS (${cleanHref}).`,
      'Generar un PNG RGB opaco de 180x180 px (sin transparencia ni .webp/.svg) y referenciarlo con sizes="180x180".'
    );
  }
  if (cleanHref.endsWith('.png') && !hasSizeToken(sizesAttr, '180x180')) {
    return makeUi11x03Finding(
      'MEDIUM',
      relPath,
      line,
      `Etiqueta rel="${APPLE_TOUCH_REL}" PNG omite el atributo recomendado sizes="180x180".`,
      'Agregar sizes="180x180" al <link rel="apple-touch-icon"> apuntando al PNG opaco de 180x180 px.'
    );
  }
  return null;
}

function inspectHtmlLinkTag(
  relPath: string,
  line: number,
  tag: string,
  hasSiblingPublic: boolean,
  hasAnyIco: boolean
): { findings: SecurityFinding[]; hasFavicon48: boolean } {
  const findings: SecurityFinding[] = [];
  const attrs = parseHtmlLinkAttributes(tag);
  const relTokens = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cleanHref = (attrs.href ?? '').split(/[?#]/, 1)[0].toLowerCase();
  const sizesAttr = attrs.sizes ?? '';

  if (relTokens.includes(APPLE_TOUCH_REL)) {
    const appleFinding = checkAppleTouchLinkTag(relPath, line, cleanHref, sizesAttr);
    if (appleFinding) findings.push(appleFinding);
  }

  const isFaviconLink =
    relTokens.includes('icon') &&
    (cleanHref === PATH_FAVICON_ICO || cleanHref === FAVICON_ICO_NAME || cleanHref.endsWith(PATH_FAVICON_ICO));
  if (!isFaviconLink) {
    return { findings, hasFavicon48: false };
  }

  const hasFavicon48 = hasSizeToken(sizesAttr, '48x48');
  if (hasSiblingPublic && !hasAnyIco) {
    findings.push(
      makeUi11x03Finding(
        'HIGH',
        relPath,
        line,
        `index.html referencia ${PATH_FAVICON_ICO}, pero no existe public/${FAVICON_ICO_NAME} ni ${FAVICON_ICO_NAME} en disco (HTTP 404).`,
        'Generar public/favicon.ico multi-resolución (16x16, 32x32, 48x48) con sizes="48x48".'
      )
    );
  }
  return { findings, hasFavicon48 };
}

function hasSubprojectWebmanifest(allRelFiles: string[], appDir: string): boolean {
  const prefix = appDir === '.' ? '' : `${appDir}/`;
  return allRelFiles.some((f) => {
    const norm = f.replace(/\\/g, '/');
    return norm.startsWith(prefix) && norm.toLowerCase().endsWith(WEBMANIFEST_EXT);
  });
}

function checkSubprojectFaviconPresence(
  relPath: string,
  hasBrandSuite: boolean,
  hasPublicIco: boolean,
  hasFaviconIco48: boolean
): SecurityFinding[] {
  if (!hasBrandSuite) return [];
  if (!hasPublicIco) {
    return [
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        1,
        `Suite de marca/PWA detectada sin public/${FAVICON_ICO_NAME} en disco para navegadores clásicos y Google Search (>= 48px).`,
        'Empaquetar public/favicon.ico con tramas 16x16, 32x32 y 48x48 y declararlo en index.html con sizes="48x48".'
      ),
    ];
  }
  if (!hasFaviconIco48) {
    return [
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        1,
        `index.html no declara <link rel="icon" href="${PATH_FAVICON_ICO}" sizes="48x48" /> para cumplir el requisito >= 48px de Google Search.`,
        'Añadir <link rel="icon" href="/favicon.ico" sizes="48x48" /> en el <head> de index.html.'
      ),
    ];
  }
  return [];
}

function checkHtmlFaviconAndAppleTouchLinks(
  projectPath: string,
  relPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (normRel !== 'index.html' && !normRel.endsWith('/index.html')) return [];
  if (isTestFilePath(normRel)) return [];

  const content = readTextFileSafe(path.join(projectPath, relPath));
  if (!content || content.includes(UI_11X_03_OK_PRAGMA)) return [];

  const appDir = path.posix.dirname(normRel);
  const publicDir = path.join(projectPath, joinSubpath(appDir, PUBLIC_DIR_NAME));
  const hasSiblingPublic = isDirectorySafe(publicDir);
  const hasPublicIco = fs.existsSync(path.join(publicDir, FAVICON_ICO_NAME));
  const hasAnyIco = hasPublicIco || fs.existsSync(path.join(projectPath, joinSubpath(appDir, FAVICON_ICO_NAME)));

  const findings: SecurityFinding[] = [];
  let hasFaviconIco48 = false;
  const linkRe = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(content)) !== null) {
    const inspected = inspectHtmlLinkTag(
      relPath,
      lineAtOffset(content, match.index),
      match[0],
      hasSiblingPublic,
      hasAnyIco
    );
    findings.push(...inspected.findings);
    if (inspected.hasFavicon48) hasFaviconIco48 = true;
  }

  const hasBrandSuite =
    isDirectorySafe(path.join(publicDir, 'favicons')) || hasSubprojectWebmanifest(allRelFiles, appDir);
  findings.push(...checkSubprojectFaviconPresence(relPath, hasBrandSuite, hasPublicIco, hasFaviconIco48));
  return findings;
}

interface ManifestIconSummary {
  hasWebp: boolean;
  hasCombinedPurpose: boolean;
  hasPng192: boolean;
  hasPng512: boolean;
}

function inspectManifestIconEntry(entry: unknown, summary: ManifestIconSummary): void {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
  const icon = entry as Record<string, unknown>;
  const cleanSrc = typeof icon.src === 'string' ? icon.src.split(/[?#]/, 1)[0].toLowerCase() : '';
  const mimeType = typeof icon.type === 'string' ? icon.type.toLowerCase() : '';
  const purposeTokens =
    typeof icon.purpose === 'string' ? icon.purpose.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const sizesAttr = typeof icon.sizes === 'string' ? icon.sizes : '';

  if (cleanSrc.endsWith('.webp') || mimeType === 'image/webp') summary.hasWebp = true;
  if (purposeTokens.includes('any') && purposeTokens.includes('maskable')) summary.hasCombinedPurpose = true;

  const isPng = cleanSrc.endsWith('.png') || mimeType === 'image/png';
  if (isPng && hasSizeToken(sizesAttr, '192x192')) summary.hasPng192 = true;
  if (isPng && hasSizeToken(sizesAttr, '512x512')) summary.hasPng512 = true;
}

function checkWebAppManifestIcons(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  const isManifest =
    normRel.toLowerCase().endsWith(WEBMANIFEST_EXT) || /(?:^|\/)public\/manifest\.json$/i.test(normRel);
  if (!isManifest || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(rawText);
  if (!doc || !Array.isArray(doc.icons)) return [];

  const summary: ManifestIconSummary = {
    hasWebp: false,
    hasCombinedPurpose: false,
    hasPng192: false,
    hasPng512: false,
  };
  for (const entry of doc.icons) {
    inspectManifestIconEntry(entry, summary);
  }

  const findings: SecurityFinding[] = [];
  if (summary.hasWebp) {
    findings.push(
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        findLineNumberContaining(rawText, '.webp'),
        'Manifiesto PWA declara iconos .webp en lugar de PNG opacos multiplataforma.',
        'Reemplazar iconos .webp por icon-192.png (192x192) e icon-512.png (512x512) en formato image/png.'
      )
    );
  }
  if (summary.hasCombinedPurpose) {
    findings.push(
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        findLineNumberContaining(rawText, 'maskable'),
        'Manifiesto PWA combina "any maskable" en una misma entrada (riesgo de recorte en lanzadores).',
        'Separar en objetos distintos las entradas con "purpose": "any" y "purpose": "maskable".'
      )
    );
  }
  if (!summary.hasPng192 || !summary.hasPng512) {
    findings.push(
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        findLineNumberContaining(rawText, '"icons"'),
        'Manifiesto PWA carece de ambos iconos image/png requeridos (192x192 y 512x512).',
        'Incluir entradas image/png explícitas para 192x192 y 512x512 en site.webmanifest.'
      )
    );
  }
  return findings;
}

function parseIndentedHeaderOp(trimmed: string, line: number): EdgeHeaderOp | null {
  if (trimmed.startsWith('!')) {
    const detachedName = trimmed.slice(1).trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(detachedName)
      ? { kind: 'detach', name: detachedName, value: '', line }
      : null;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx <= 0) return null;
  const headerName = trimmed.slice(0, colonIdx).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(headerName)) return null;
  return {
    kind: 'set',
    name: headerName,
    value: trimmed.slice(colonIdx + 1).trim().toLowerCase(),
    line,
  };
}

function parseEdgeHeadersBlocks(lines: string[]): EdgeHeaderBlock[] {
  const blocks: EdgeHeaderBlock[] = [];
  let current: EdgeHeaderBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { route: trimmed, line: i + 1, ops: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const op = parseIndentedHeaderOp(trimmed, i + 1);
    if (op) current.ops.push(op);
  }
  return blocks;
}

function collectGlobalWatchedHeaders(blocks: EdgeHeaderBlock[]): Map<string, string> {
  const globalHeaders = new Map<string, string>();
  for (const block of blocks) {
    if (block.route !== WILDCARD_ALL_ROUTE) continue;
    for (const op of block.ops) {
      if (op.kind === 'set' && WATCHED_EDGE_HEADERS.has(op.name)) {
        globalHeaders.set(op.name, op.value);
      }
    }
  }
  return globalHeaders;
}

function isPublicAssetEdgeRoute(route: string): boolean {
  return route === PATH_FAVICON_ICO || PUBLIC_EDGE_ASSET_PREFIXES.some((prefix) => route.startsWith(prefix));
}

function inspectSingleEdgeHeaderBlock(
  relPath: string,
  block: EdgeHeaderBlock,
  globalWatched: Map<string, string>
): SecurityFinding[] {
  if (block.route === WILDCARD_ALL_ROUTE) return [];
  const findings: SecurityFinding[] = [];
  const detached = new Set<string>();
  let corpSetCrossOrigin = false;

  for (const op of block.ops) {
    if (op.kind === 'detach') {
      detached.add(op.name);
      continue;
    }
    if (op.name === HDR_CORP && op.value === HDR_CROSS_ORIGIN) corpSetCrossOrigin = true;
    if (globalWatched.has(op.name) && !detached.has(op.name)) {
      findings.push(
        makeUi11x03Finding(
          'HIGH',
          relPath,
          op.line,
          `Bloque "${block.route}" en _headers redefine "${op.name}" sin desacoplamiento previo "! ${op.name}" (concatenación aditiva desde /*).`,
          `Anteponer "! ${op.name}" dentro del bloque "${block.route}" antes de emitir el nuevo valor.`
        )
      );
    }
  }

  if (globalWatched.get(HDR_CORP) === HDR_SAME_ORIGIN && isPublicAssetEdgeRoute(block.route) && !corpSetCrossOrigin) {
    findings.push(
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        block.line,
        `La regla global /* fija ${HDR_CORP}: ${HDR_SAME_ORIGIN}, pero "${block.route}" no habilita "${HDR_CROSS_ORIGIN}" para rastreadores y previsualizaciones OG.`,
        `Desacoplar con "! Cross-Origin-Resource-Policy" y fijar "Cross-Origin-Resource-Policy: cross-origin" en "${block.route}".`
      )
    );
  }
  return findings;
}

function checkCloudflareHeadersDetachment(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (!/(?:^|\/)_headers$/.test(normRel) || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const blocks = parseEdgeHeadersBlocks(rawText.split(/\r?\n/));
  const globalWatched = collectGlobalWatchedHeaders(blocks);
  if (globalWatched.size === 0) return [];

  const findings: SecurityFinding[] = [];
  for (const block of blocks) {
    findings.push(...inspectSingleEdgeHeaderBlock(relPath, block, globalWatched));
  }
  return findings;
}

function extractRoutePatterns(doc: Record<string, unknown>, key: string): string[] {
  const raw = doc[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function isInvalidPagesRoutePattern(pattern: string): boolean {
  const starIdx = pattern.indexOf('*');
  return starIdx !== -1 && (starIdx !== pattern.length - 1 || pattern.indexOf('*', starIdx + 1) !== -1);
}

function checkCloudflareRoutesJson(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (!/(?:^|\/)_routes\.json$/.test(normRel) || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(rawText);
  if (!doc) return [];

  const includePatterns = extractRoutePatterns(doc, 'include');
  const excludePatterns = extractRoutePatterns(doc, 'exclude');
  const findings: SecurityFinding[] = [];

  for (const pattern of [...includePatterns, ...excludePatterns]) {
    if (isInvalidPagesRoutePattern(pattern)) {
      findings.push(
        makeUi11x03Finding(
          'HIGH',
          relPath,
          findLineNumberContaining(rawText, pattern),
          `Comodín inválido "${pattern}" en _routes.json (Cloudflare Pages v1 solo admite "*" como sufijo final).`,
          'Reemplazar comodines de sufijo o intermedios (ej. /*.ico) por rutas exactas como "/favicon.ico" o prefijos "/favicons/*".'
        )
      );
    }
  }

  if (includePatterns.includes(WILDCARD_ALL_ROUTE) && Array.isArray(doc.exclude) && !excludePatterns.includes(PATH_FAVICON_ICO)) {
    findings.push(
      makeUi11x03Finding(
        'MEDIUM',
        relPath,
        findLineNumberContaining(rawText, '"exclude"'),
        `_routes.json incluye "${WILDCARD_ALL_ROUTE}" sin excluir explícitamente "${PATH_FAVICON_ICO}" en exclude.`,
        'Agregar "/favicon.ico" al arreglo exclude de _routes.json para evitar invocar Workers innecesariamente.'
      )
    );
  }
  return findings;
}

function checkUi11x03FaviconPwaAndEdgeHeaders(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const relPath of allRelFiles) {
    findings.push(
      ...checkHtmlFaviconAndAppleTouchLinks(projectPath, relPath, allRelFiles),
      ...checkWebAppManifestIcons(projectPath, relPath),
      ...checkCloudflareHeadersDetachment(projectPath, relPath),
      ...checkCloudflareRoutesJson(projectPath, relPath)
    );
  }
  return findings;
}

function checkProjectLevelRules(projectPath: string, allRelFiles: string[]): SecurityFinding[] {
  return [
    ...checkSec09Npmrc(projectPath),
    ...checkSec08Oshp(projectPath, allRelFiles),
    ...checkQaMypy01StrictChain(projectPath),
    ...checkQaHealth01ContainerHeartbeatContract(projectPath, allRelFiles),
    ...checkQaContractSdk01RealTransport(projectPath, allRelFiles),
    ...checkQaDockerLock01LockfileAndSmoke(projectPath),
    ...checkQaPlaywrightPin01VersionParity(projectPath, allRelFiles),
    ...checkQaSsrHydration01DualScheme(projectPath, allRelFiles),
    ...checkUi11x03FaviconPwaAndEdgeHeaders(projectPath, allRelFiles),
  ];
}

const SYSTEM_NON_HEARTBEAT_PATHS = new Set([
  '/var/run/docker.sock',
  '/var/run/postgresql',
  '/tmp/.coverage',
]);

const NON_HEARTBEAT_PATH_PREFIXES = [
  '/tmp/venv',
  '/tmp/.venv',
  '/tmp/mypy',
  '/tmp/uv',
  '/tmp/pnpm',
  '/tmp/.pnpm',
  '/tmp/npm',
  '/tmp/pytest',
  '/tmp/ruff',
  '/tmp/pip',
  '/tmp/cache',
  '/tmp/chaos',
  '/tmp/lhci',
  '/tmp/psi',
  '/tmp/report',
];

const NON_HEARTBEAT_PROBE_EXTS = ['.html', '.htm', '.xml', '.log', '.csv', '.md', '.sarif'];

function isExcludedProbePath(probePath: string): boolean {
  const lower = probePath.toLowerCase();
  if (SYSTEM_NON_HEARTBEAT_PATHS.has(probePath) || lower.endsWith('.sock')) {
    return true;
  }
  if (NON_HEARTBEAT_PROBE_EXTS.some((ext) => lower.endsWith(ext))) {
    return true;
  }
  return NON_HEARTBEAT_PATH_PREFIXES.some(
    (prefix) =>
      probePath === prefix ||
      probePath.startsWith(`${prefix}/`) ||
      probePath.startsWith(`${prefix}-`) ||
      probePath.startsWith(`${prefix}_`)
  );
}

function joinContinuedShellLines(rawContent: string): string[] {
  const rawLines = rawContent.split(/\r?\n/);
  const merged: string[] = [];
  let buffer = '';
  for (const rawLine of rawLines) {
    const trimmedEnd = rawLine.trimEnd();
    if (trimmedEnd.endsWith('\\')) {
      buffer += `${trimmedEnd.slice(0, -1)} `;
      continue;
    }
    merged.push(`${buffer}${rawLine}`);
    buffer = '';
  }
  if (buffer) merged.push(buffer);
  return merged;
}

function extractDockerfileHealthcheckText(content: string): string {
  const healthLines: string[] = [];
  for (const line of joinContinuedShellLines(content)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^HEALTHCHECK\b/i.test(trimmed) && !/^HEALTHCHECK\s+NONE\b/i.test(trimmed)) {
      healthLines.push(trimmed);
    }
  }
  return healthLines.join('\n');
}

function extractComposeHealthcheckText(content: string): string {
  const lines = content.split(/\r?\n/);
  const captured: string[] = [];
  let inHealthcheck = false;
  let baseIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (inHealthcheck) {
      if (indent <= baseIndent) {
        inHealthcheck = false;
      } else {
        captured.push(trimmed);
        continue;
      }
    }
    if (trimmed.toLowerCase() === 'healthcheck:' || /^healthcheck\s*:\s*#/i.test(trimmed)) {
      inHealthcheck = true;
      baseIndent = indent;
    }
  }
  return captured.join('\n');
}

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
      const isYaml = /\.ya?ml$/i.test(rel);
      const scopedText = isYaml
        ? extractComposeHealthcheckText(content)
        : extractDockerfileHealthcheckText(content);
      if (!scopedText) continue;
      const matches = scopedText.match(probeRegex) ?? [];
      for (const match of matches) {
        if (!isExcludedProbePath(match)) {
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
  const norm = rel.replace(/\\/g, '/');
  if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
    return false;
  }
  if (/(?:^|\/)(?:scripts\/|qa[-_.]|probar-|auditar-|verificar-|limpieza\.sh|certify_)/.test(norm)) {
    return false;
  }
  if (norm.endsWith('.sh') || norm.endsWith('.bash')) {
    return /(?:^|\/)(?:entrypoint|docker-entrypoint|start|run-worker|worker)[^/]*\.(?:sh|bash)$/i.test(norm);
  }
  return /\.(?:py|ts|js|php)$/.test(norm);
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

const PY_TEST_FUNC_LINE_RE = /^(?:async )?def test_[A-Za-z0-9_]+ ?\(/;

function isPythonTestDefLine(line: string): boolean {
  const normalized = line.trimStart().replace(/[ \t]+/g, ' ');
  return PY_TEST_FUNC_LINE_RE.test(normalized);
}

function extractPythonTestBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  let decorators: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith('@')) {
      decorators.push(line);
      continue;
    }
    if (isPythonTestDefLine(line)) {
      if (current) blocks.push(current.join('\n'));
      current = [...decorators, line];
      decorators = [];
      continue;
    }
    if (current && decorators.length > 0) {
      current.push(...decorators);
    }
    decorators = [];
    if (current) current.push(line);
  }
  if (current) blocks.push(current.join('\n'));
  return blocks;
}

function isBlockProbeAssertionValid(block: string, tokens: readonly string[]): boolean {
  if (!tokens.some((tok) => block.includes(tok))) return false;
  if (block.includes(QA_HEALTH_OK_PRAGMA)) return true;
  const hasPatchOrMonkey = PY_MOCK_PATCH_MARKERS.some((marker) => block.includes(marker));
  const mocksWrite = hasPatchOrMonkey && block.includes('write_text');
  const mocksWorkers = hasPatchOrMonkey && block.includes('AsyncMock');
  if (mocksWrite || mocksWorkers) return false;
  return PROBE_ASSERTION_MARKERS.some((marker) => block.includes(marker));
}

function testFileAssertsProbeUnmocked(
  content: string,
  tokens: string[]
): boolean {
  const mentionsToken = tokens.some((tok) => content.includes(tok));
  if (!mentionsToken) return false;
  if (content.includes(QA_HEALTH_OK_PRAGMA)) return true;

  const pyBlocks = extractPythonTestBlocks(content);
  if (pyBlocks.length > 0) {
    return pyBlocks.some((block) => isBlockProbeAssertionValid(block, tokens));
  }

  return isBlockProbeAssertionValid(content, tokens);
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

const PY_MCP_SDK_IMPORT_RE = /\b(?:from\s+mcp\b|import\s+mcp\b|FastMCP\s*\()/;
const PY_MCP_HANDLER_RE =
  /@[A-Za-z0-9_.]+\.(?:list_tools|call_tool|tool|list_resources|read_resource|list_prompts|get_prompt)\b|\bFastMCP\s*\(|\b(?:add_tool|list_tools|call_tool)\s*\(/;
const TS_MCP_SERVER_RE = /@modelcontextprotocol\/sdk\/server/;
const TS_MCP_HANDLER_RE =
  /\.(?:tool|registerTool|resource|registerResource|prompt|registerPrompt|setRequestHandler)\s*\(/;
const PY_SDK_CLIENT_RE =
  /\b(?:ClientSession|create_connected_server_and_client_session|stdio_client|sse_client|streamablehttp_client|memory_object_stream)\b/;
const TS_SDK_CLIENT_RE =
  /\b(?:InMemoryTransport|StdioClientTransport|StreamableHTTPClientTransport|SSEClientTransport)\b/;

function findMatchingLineNumber(content: string, pattern: RegExp): number {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return 1;
}

function matchProtocolServerFile(rel: string, content: string): { relFile: string; line: number } | null {
  if (content.includes(QA_CONTRACT_SDK_OK_PRAGMA)) return null;
  if (rel.endsWith('.py') && PY_MCP_SDK_IMPORT_RE.test(content) && PY_MCP_HANDLER_RE.test(content)) {
    return { relFile: rel, line: findMatchingLineNumber(content, PY_MCP_SDK_IMPORT_RE) };
  }
  if (/\.(?:ts|js|mjs)$/.test(rel) && TS_MCP_SERVER_RE.test(content) && TS_MCP_HANDLER_RE.test(content)) {
    return { relFile: rel, line: findMatchingLineNumber(content, TS_MCP_SERVER_RE) };
  }
  return null;
}

function findProtocolServerDeclaration(
  projectPath: string,
  allRelFiles: string[]
): { relFile: string; line: number } | null {
  for (const rel of allRelFiles) {
    const norm = rel.replace(/\\/g, '/');
    if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
      continue;
    }
    if (!/\.(?:py|ts|js|mjs)$/.test(norm)) continue;

    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      const match = matchProtocolServerFile(rel, content);
      if (match) return match;
    } catch {
      // Ignorar errores de lectura puntual
    }
  }
  return null;
}

function hasRealSdkTransportMarkers(content: string): boolean {
  if (content.includes(QA_CONTRACT_SDK_OK_PRAGMA)) return true;
  if (TS_SDK_CLIENT_RE.test(content) || PY_SDK_CLIENT_RE.test(content)) return true;
  if (content.includes('@modelcontextprotocol/sdk/client') && content.includes('new Client(')) {
    return true;
  }
  return PY_MCP_SDK_IMPORT_RE.test(content) && /\bClient\s*\(/.test(content);
}

function hasRealSdkTransportContractTest(projectPath: string, allRelFiles: string[]): boolean {
  for (const rel of allRelFiles) {
    const norm = rel.replace(/\\/g, '/');
    const isExampleHarness = /(?:^|\/)example\/.*\.(?:ts|js|mjs|py)$/.test(norm);
    if (!isTestFilePath(norm) && !isExampleHarness) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (hasRealSdkTransportMarkers(content)) return true;
    } catch {
      // Ignorar errores de lectura puntual
    }
  }
  return false;
}

function checkQaContractSdk01RealTransport(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const declaration = findProtocolServerDeclaration(projectPath, allRelFiles);
  if (!declaration) return [];
  if (hasRealSdkTransportContractTest(projectPath, allRelFiles)) return [];

  return [
    {
      rule_id: QA_CONTRACT_SDK_01_RULE,
      severity: 'HIGH',
      stig_owasp_ref: QA_CONTRACT_SDK_01_REF,
      file: declaration.relFile,
      line: declaration.line,
      message:
        'Servidor de protocolo (MCP/JSON-RPC/ACP) sin prueba de contrato sobre el transporte/cliente real del SDK: invocar handlers con MagicMock oculta cambios de firma entre versiones (ej. mcp 1.x -> 2.x).',
      remediation: QA_CONTRACT_SDK_REMEDIATION,
    },
  ];
}

interface DockerRunBlock {
  line: number;
  command: string;
}

function consumeRunContinuation(
  rawLines: string[],
  startIdx: number,
  initialCommand: string,
  initialHasPragma: boolean
): { nextIndex: number; command: string; hasPragma: boolean } {
  let idx = startIdx;
  let combined = initialCommand;
  let hasPragma = initialHasPragma;

  while (combined.endsWith('\\') && idx + 1 < rawLines.length) {
    idx++;
    const nextRaw = rawLines[idx];
    if (nextRaw.includes(QA_DOCKER_LOCK_OK_PRAGMA)) hasPragma = true;
    const nextTrimmed = nextRaw.trim();
    if (!nextTrimmed.startsWith('#')) {
      combined = `${combined.slice(0, -1).trimEnd()} ${nextTrimmed}`;
    }
  }

  return { nextIndex: idx, command: combined, hasPragma };
}

function extractDockerfileRunBlocks(content: string): DockerRunBlock[] {
  const rawLines = content.split(/\r?\n/);
  if (rawLines.slice(0, 5).some((l) => l.includes(QA_DOCKER_LOCK_OK_PRAGMA))) {
    return [];
  }

  const blocks: DockerRunBlock[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!/^RUN\b/i.test(trimmed)) continue;

    const prevLine = i > 0 ? rawLines[i - 1] : '';
    const initialPragma =
      prevLine.includes(QA_DOCKER_LOCK_OK_PRAGMA) || rawLines[i].includes(QA_DOCKER_LOCK_OK_PRAGMA);
    const consumed = consumeRunContinuation(rawLines, i, trimmed.slice(3).trim(), initialPragma);
    if (!consumed.hasPragma) {
      blocks.push({ line: i + 1, command: consumed.command });
    }
    i = consumed.nextIndex;
  }

  return blocks;
}

const PIP_INSTALL_CMD_RE = /\bpip3?\s+install\b/i;
const PIP_LOCKED_OR_EDITABLE_RE =
  /(?:^|\s)(?:-r|--requirement|-e|--editable)(?:\s|$|=)|\.whl\b|\buv\s+export\b/i;
const NODE_PKG_INSTALL_RE = /^\s*(?:npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add)\b/i;

function normalizePipPackageName(rawToken: string): string {
  const cleaned = rawToken.replace(/^["']|["']$/g, '').trim();
  const base = cleaned.replace(/\[.*?\]/g, '').split(/[=<>!~@;]/)[0].trim();
  return base.toLowerCase().replace(/_/g, '-');
}

function extractPipPositionalPackages(pipSegment: string): string[] {
  const match = pipSegment.match(PIP_INSTALL_CMD_RE);
  if (!match || match.index === undefined) return [];
  const tokens = pipSegment.slice(match.index + match[0].length).trim().split(/\s+/).filter(Boolean);
  const packages: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i].replace(/^["']|["']$/g, '');
    if (PIP_VALUE_FLAGS.has(raw)) {
      i++;
      continue;
    }
    if (!raw || raw.startsWith('-') || raw === '.' || raw.startsWith('./') || raw.startsWith('/')) {
      continue;
    }
    const pkg = normalizePipPackageName(raw);
    if (pkg) packages.push(pkg);
  }

  return packages;
}

function hasHandwrittenPythonPipDeps(command: string): boolean {
  for (const segment of command.split(/\s*(?:&&|\|\||;)\s*/)) {
    if (!PIP_INSTALL_CMD_RE.test(segment)) continue;
    if (PIP_LOCKED_OR_EDITABLE_RE.test(segment)) continue;
    const pkgs = extractPipPositionalPackages(segment);
    if (pkgs.some((pkg) => !BOOTSTRAP_PY_PACKAGES.has(pkg))) {
      return true;
    }
  }
  return false;
}

function hasUnfrozenUvSync(command: string, hasUvLock: boolean): boolean {
  if (!hasUvLock) return false;
  return /\buv\s+sync\b/i.test(command) && !/(?:\s|^)(?:--frozen|--locked)(?:\s|$)/.test(command);
}

function hasHandwrittenNodeDeps(command: string): boolean {
  for (const segment of command.split(/\s*(?:&&|\|\||;)\s*/)) {
    const trimmed = segment.trim();
    if (!NODE_PKG_INSTALL_RE.test(trimmed)) continue;
    if (/(?:\s|^)(?:-g|--global)(?:\s|$)/.test(trimmed)) continue;
    const tokens = trimmed.split(/\s+/).slice(2);
    const hasExplicitPkg = tokens.some((tok) => {
      const clean = tok.replace(/^["']|["']$/g, '');
      return clean && clean !== '.' && !clean.startsWith('-') && !clean.startsWith('./') && !clean.startsWith('/');
    });
    if (hasExplicitPkg) return true;
  }
  return false;
}

function hasAnyManifestInDirs(dirs: string[], fileNames: string[]): boolean {
  return dirs.some((dir) => fileNames.some((name) => fs.existsSync(path.join(dir, name))));
}

function evaluateDockerfileLockViolation(
  command: string,
  hasPyManifest: boolean,
  hasUvLock: boolean,
  hasNodeManifest: boolean
): boolean {
  if (hasPyManifest && (hasHandwrittenPythonPipDeps(command) || hasUnfrozenUvSync(command, hasUvLock))) {
    return true;
  }
  return hasNodeManifest && hasHandwrittenNodeDeps(command);
}

function checkQaDockerLock01LockfileAndSmoke(projectPath: string): SecurityFinding[] {
  const dockerfiles = collectMatchingFiles(projectPath, isDockerfileEntry)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => !isTestFilePath(rel));
  const findings: SecurityFinding[] = [];

  for (const rel of dockerfiles) {
    try {
      const absDocker = path.join(projectPath, rel);
      const content = fs.readFileSync(absDocker, 'utf8');
      const searchDirs = Array.from(new Set([path.dirname(absDocker), projectPath]));
      const hasPyManifest = hasAnyManifestInDirs(searchDirs, ['pyproject.toml', 'uv.lock', 'requirements.lock']);
      const hasUvLock = hasAnyManifestInDirs(searchDirs, ['uv.lock']);
      const hasNodeManifest = hasAnyManifestInDirs(searchDirs, ['package.json']);

      for (const block of extractDockerfileRunBlocks(content)) {
        if (evaluateDockerfileLockViolation(block.command, hasPyManifest, hasUvLock, hasNodeManifest)) {
          findings.push({
            rule_id: QA_DOCKER_LOCK_01_RULE,
            severity: 'HIGH',
            stig_owasp_ref: QA_DOCKER_LOCK_01_REF,
            file: rel,
            line: block.line,
            message:
              'Dockerfile instala dependencias desde lista manual o sin bandera --frozen/--frozen-lockfile en lugar de usar el lockfile del proyecto, arriesgando ModuleNotFoundError en runtime.',
            remediation: QA_DOCKER_LOCK_REMEDIATION,
          });
        }
      }
    } catch {
      // Ignorar errores de lectura puntual
    }
  }

  return findings;
}

interface PlaywrightDockerTag {
  dir: string;
  version: string;
}

function collectPlaywrightDockerTags(
  projectPath: string,
  allRelFiles: string[]
): PlaywrightDockerTag[] {
  const composeRels = allRelFiles.filter(
    (rel) =>
      !rel.endsWith('.example') &&
      !isTestFilePath(rel) &&
      !isAuditorSelfDefinition(rel) &&
      /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(rel)
  );
  const dockerRels = collectMatchingFiles(projectPath, isDockerfileEntry)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => !rel.endsWith('.example') && !isTestFilePath(rel));
  const tags: PlaywrightDockerTag[] = [];

  for (const rel of new Set([...composeRels, ...dockerRels])) {
    const content = readTextFileSafe(path.join(projectPath, rel));
    if (!content || content.includes(QA_PLAYWRIGHT_PIN_OK_PRAGMA)) continue;
    const normDir = path.posix.dirname(rel.replace(/\\/g, '/'));
    for (const match of content.matchAll(PLAYWRIGHT_IMAGE_TAG_RE)) {
      if (match[1]) {
        tags.push({ dir: normDir, version: match[1] });
      }
    }
  }

  return tags;
}

function resolveExpectedPlaywrightTag(
  pkgDir: string,
  dockerTags: PlaywrightDockerTag[]
): string | null {
  const sameDir = dockerTags.find((t) => t.dir === pkgDir);
  if (sameDir) return sameDir.version;

  const ancestorOrChild = dockerTags.find(
    (t) =>
      t.dir === '.' ||
      pkgDir === '.' ||
      pkgDir.startsWith(`${t.dir}/`) ||
      t.dir.startsWith(`${pkgDir}/`)
  );
  if (ancestorOrChild) return ancestorOrChild.version;

  const uniqueVersions = new Set(dockerTags.map((t) => t.version));
  return uniqueVersions.size === 1 ? dockerTags[0].version : null;
}

function collectDeclaredPlaywrightSpecs(
  doc: Record<string, unknown>
): Array<{ pkgName: string; spec: string }> {
  const specs: Array<{ pkgName: string; spec: string }> = [];
  for (const section of PKG_DEP_SECTIONS) {
    const rawBlock = doc[section];
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
    const block = rawBlock as Record<string, unknown>;
    for (const pkgName of PLAYWRIGHT_PKGS) {
      const val = block[pkgName];
      if (typeof val === 'string') {
        specs.push({ pkgName, spec: val.trim() });
      }
    }
  }
  return specs;
}

function inspectPackageJsonPlaywrightPin(
  projectPath: string,
  relPath: string,
  dockerTags: PlaywrightDockerTag[]
): SecurityFinding[] {
  const content = readTextFileSafe(path.join(projectPath, relPath));
  if (!content || content.includes(QA_PLAYWRIGHT_PIN_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(content);
  if (!doc) return [];

  const specs = collectDeclaredPlaywrightSpecs(doc);
  if (specs.length === 0) return [];

  const pkgDir = path.posix.dirname(relPath.replace(/\\/g, '/'));
  const expectedVersion = resolveExpectedPlaywrightTag(pkgDir, dockerTags);
  if (!expectedVersion) return [];

  const findings: SecurityFinding[] = [];
  for (const { pkgName, spec } of specs) {
    if (!EXACT_SEMVER_RE.test(spec) || spec !== expectedVersion) {
      findings.push({
        rule_id: QA_PLAYWRIGHT_PIN_RULE,
        severity: 'HIGH',
        stig_owasp_ref: QA_PLAYWRIGHT_PIN_REF,
        file: relPath,
        line: findLineNumberContaining(content, `"${pkgName}"`),
        message: `La dependencia "${pkgName}": "${spec}" en ${relPath} no fija la versión exacta de mcr.microsoft.com/playwright:v${expectedVersion} (riesgo de desajuste en binarios Chromium).`,
        remediation: `Fijar "${pkgName}": "${expectedVersion}" sin prefijos de rango (^, ~) alineado con mcr.microsoft.com/playwright:v${expectedVersion} (o eximir con "${QA_PLAYWRIGHT_PIN_OK_PRAGMA}").`,
      });
    }
  }

  return findings;
}

function checkQaPlaywrightPin01VersionParity(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const dockerTags = collectPlaywrightDockerTags(projectPath, allRelFiles);
  if (dockerTags.length === 0) return [];

  const findings: SecurityFinding[] = [];
  for (const relPath of allRelFiles) {
    const norm = relPath.replace(/\\/g, '/');
    if (!/(?:^|\/)package\.json$/.test(norm) || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
      continue;
    }
    findings.push(...inspectPackageJsonPlaywrightPin(projectPath, relPath, dockerTags));
  }

  return findings;
}

const VITEPRESS_CONFIG_FILES = ['config.ts', 'config.mts', 'config.js', 'config.mjs'] as const;

function isScopeProductionSource(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return !norm.endsWith('.example') && !isTestFilePath(norm) && !isAuditorSelfDefinition(norm);
}

function isInScopeDir(normRel: string, scopeDir: string): boolean {
  return scopeDir === '.' || normRel.startsWith(`${scopeDir}/`);
}

function isSsrExtraEntry(entry: fs.Dirent): boolean {
  if (!entry.isFile() || entry.name.endsWith('.example')) return false;
  const lower = entry.name.toLowerCase();
  return (
    lower.endsWith('.css') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cjs')
  );
}

function hasSsrNpmDependency(pkgContent: string): boolean {
  const doc = parseJsonObjectTextSafe(pkgContent);
  if (!doc) return false;
  for (const section of PKG_DEP_SECTIONS) {
    const block = doc[section];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (Object.keys(block).some((dep) => SSR_NPM_DEPS.has(dep))) {
      return true;
    }
  }
  return false;
}

function hasSsrEngineInSources(projectPath: string, files: readonly string[]): boolean {
  for (const rel of files) {
    if (!isScopeProductionSource(rel) || !/\.(?:ts|tsx|js|jsx|vue)$/i.test(rel)) continue;
    const text = readTextFileSafe(path.join(projectPath, rel));
    if (text && (text.includes('createSSRApp(') || text.includes('hydrateRoot('))) {
      return true;
    }
  }
  return false;
}

function hasSsrEngineForScope(
  projectPath: string,
  scopeAbsDir: string,
  pkgContent: string,
  scopeFiles: readonly string[],
  extraFiles: readonly string[]
): boolean {
  if (hasSsrNpmDependency(pkgContent)) return true;
  if (VITEPRESS_CONFIG_FILES.some((f) => fs.existsSync(path.join(scopeAbsDir, '.vitepress', f)))) {
    return true;
  }
  const allScopeCandidates = [...scopeFiles, ...extraFiles];
  if (
    allScopeCandidates.some(
      (rel) => isScopeProductionSource(rel) && SSR_CONFIG_NAME_RE.test(rel.replace(/\\/g, '/'))
    )
  ) {
    return true;
  }
  return hasSsrEngineInSources(projectPath, allScopeCandidates);
}

function hasDualThemeMarkerForScope(
  projectPath: string,
  scopeFiles: readonly string[],
  extraFiles: readonly string[]
): boolean {
  for (const rel of [...scopeFiles, ...extraFiles]) {
    if (!isScopeProductionSource(rel)) continue;
    if (!/\.(?:ts|tsx|js|jsx|vue|html|css|mjs|mts)$/i.test(rel)) continue;
    const text = readTextFileSafe(path.join(projectPath, rel));
    if (text && SSR_THEME_MARKERS.some((marker) => text.includes(marker))) {
      return true;
    }
  }
  return false;
}

function inspectPrehydrateLinesInFile(relPath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    if (line.includes(QA_SSR_HYDRATION_OK_PRAGMA) || prev.includes(QA_SSR_HYDRATION_OK_PRAGMA)) {
      continue;
    }
    if (SSR_PREHYDRATE_V_IF_RE.test(line)) {
      findings.push({
        rule_id: QA_SSR_HYDRATION_RULE,
        severity: 'MEDIUM',
        stig_owasp_ref: QA_SSR_HYDRATION_REF,
        file: relPath,
        line: i + 1,
        message:
          'Componente SSR/SSG ramifica el DOM inicial (v-if) según estado de cliente pre-hidratación (localStorage/dataset.theme), arriesgando Hydration Mismatch.',
        remediation: `Renderizar ambas ramas con CSS (display: none / hidden dark:block) y sincronizar el estado reactivo en onMounted (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
      });
    }
  }
  return findings;
}

function inspectSsrPrehydrateBranching(
  projectPath: string,
  scopeFiles: readonly string[],
  seenFiles: Set<string>
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const rel of scopeFiles) {
    if (seenFiles.has(rel) || !isScopeProductionSource(rel) || !/\.(?:vue|tsx|jsx)$/i.test(rel)) {
      continue;
    }
    seenFiles.add(rel);
    const content = readTextFileSafe(path.join(projectPath, rel));
    if (!content || content.includes(QA_SSR_HYDRATION_OK_PRAGMA)) continue;
    findings.push(...inspectPrehydrateLinesInFile(rel, content));
  }
  return findings;
}

function hasDualColorSchemeCoverage(texts: readonly string[]): boolean {
  const combined = texts.join('\n');
  return (
    combined.includes('colorScheme') &&
    /['"]light['"]/.test(combined) &&
    /['"]dark['"]/.test(combined)
  );
}

function hasHydrationConsoleGuard(e2eTexts: readonly string[]): boolean {
  const combined = e2eTexts.join('\n');
  return HYDRATION_LISTENER_RE.test(combined) && /hydration/i.test(combined);
}

function findPlaywrightScopeConfigs(
  scopeDir: string,
  candidates: readonly string[],
  rootCandidates: readonly string[]
): { configs: string[]; usedRootFallback: boolean } {
  const own = candidates.filter(
    (rel) => isScopeProductionSource(rel) && PLAYWRIGHT_CONFIG_RE.test(rel.replace(/\\/g, '/'))
  );
  if (own.length > 0 || scopeDir === '.') {
    return { configs: own, usedRootFallback: false };
  }
  const rootConfigs = rootCandidates.filter((rel) => {
    const norm = rel.replace(/\\/g, '/');
    return !norm.includes('/') && isScopeProductionSource(norm) && PLAYWRIGHT_CONFIG_RE.test(norm);
  });
  return { configs: rootConfigs, usedRootFallback: rootConfigs.length > 0 };
}

function readExistingTexts(projectPath: string, relFiles: readonly string[]): string[] {
  const texts: string[] = [];
  for (const rel of relFiles) {
    const txt = readTextFileSafe(path.join(projectPath, rel));
    if (txt) texts.push(txt);
  }
  return texts;
}

function buildMissingPlaywrightHydrationMessage(hasDual: boolean, hasGuard: boolean): string {
  const missing: string[] = [];
  if (!hasDual) missing.push("cobertura dual de colorScheme ('light' y 'dark')");
  if (!hasGuard) missing.push('listeners console/pageerror verificando errores /hydration/i');
  return `Proyecto SSR/SSG con tematización dinámica carece de ${missing.join(' y ')} en la suite Playwright E2E.`;
}

function inspectPlaywrightHydrationContract(
  projectPath: string,
  scopeDir: string,
  scopeFiles: readonly string[],
  extraFiles: readonly string[],
  allRelFiles: readonly string[],
  seenConfigs: Set<string>
): SecurityFinding[] {
  const scoped = [...scopeFiles, ...extraFiles];
  const { configs, usedRootFallback } = findPlaywrightScopeConfigs(scopeDir, scoped, allRelFiles);
  if (configs.length === 0 || seenConfigs.has(configs[0])) return [];
  seenConfigs.add(configs[0]);

  const pwTexts = readExistingTexts(projectPath, configs);
  if (pwTexts.some((txt) => txt.includes(QA_SSR_HYDRATION_OK_PRAGMA))) return [];

  const e2ePool = usedRootFallback ? [...scoped, ...allRelFiles] : scoped;
  const e2eFiles = Array.from(
    new Set(
      e2ePool.filter((rel) => {
        const norm = rel.replace(/\\/g, '/');
        return !norm.endsWith('.example') && !isAuditorSelfDefinition(norm) && E2E_TEST_FILE_RE.test(norm);
      })
    )
  );
  const e2eTexts = readExistingTexts(projectPath, e2eFiles);
  if (e2eTexts.some((txt) => txt.includes(QA_SSR_HYDRATION_OK_PRAGMA))) return [];

  const hasDual = hasDualColorSchemeCoverage([...pwTexts, ...e2eTexts]);
  const hasGuard = hasHydrationConsoleGuard(e2eTexts);
  if (hasDual && hasGuard) return [];

  return [
    {
      rule_id: QA_SSR_HYDRATION_RULE,
      severity: 'MEDIUM',
      stig_owasp_ref: QA_SSR_HYDRATION_REF,
      file: configs[0],
      line: 1,
      message: buildMissingPlaywrightHydrationMessage(hasDual, hasGuard),
      remediation: `Añadir prueba Playwright con browser.newContext({ colorScheme: 'light' }) / emulateMedia cubriendo ambos esquemas y aserción sobre eventos console/pageerror para /hydration/i (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
    },
  ];
}

function inspectScopeSsrHydration(
  projectPath: string,
  pkgRel: string,
  allRelFiles: readonly string[],
  seenBranchFiles: Set<string>,
  seenPwConfigs: Set<string>
): SecurityFinding[] {
  const pkgContent = readTextFileSafe(path.join(projectPath, pkgRel));
  if (!pkgContent || pkgContent.includes(QA_SSR_HYDRATION_OK_PRAGMA)) return [];

  const scopeDir = path.posix.dirname(pkgRel.replace(/\\/g, '/'));
  const scopeAbsDir = scopeDir === '.' ? projectPath : path.join(projectPath, scopeDir);
  const scopeFiles = allRelFiles.filter((r) => isInScopeDir(r.replace(/\\/g, '/'), scopeDir));
  const extraFiles = collectMatchingFiles(scopeAbsDir, isSsrExtraEntry).map((abs) =>
    path.relative(projectPath, abs)
  );

  if (!hasSsrEngineForScope(projectPath, scopeAbsDir, pkgContent, scopeFiles, extraFiles)) {
    return [];
  }
  if (!hasDualThemeMarkerForScope(projectPath, scopeFiles, extraFiles)) {
    return [];
  }

  return [
    ...inspectSsrPrehydrateBranching(projectPath, scopeFiles, seenBranchFiles),
    ...inspectPlaywrightHydrationContract(
      projectPath,
      scopeDir,
      scopeFiles,
      extraFiles,
      allRelFiles,
      seenPwConfigs
    ),
  ];
}

function checkQaSsrHydration01DualScheme(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const packageRels = allRelFiles.filter((rel) => {
    const norm = rel.replace(/\\/g, '/');
    return /(?:^|\/)package\.json$/.test(norm) && isScopeProductionSource(norm);
  });
  const seenBranchFiles = new Set<string>();
  const seenPwConfigs = new Set<string>();
  const findings: SecurityFinding[] = [];

  for (const pkgRel of packageRels) {
    findings.push(
      ...inspectScopeSsrHydration(projectPath, pkgRel, allRelFiles, seenBranchFiles, seenPwConfigs)
    );
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

function isUncheckedSupervisorWindow(lines: readonly string[], idx: number): boolean {
  const windowStart = Math.max(0, idx - 6);
  const windowEnd = Math.min(lines.length, idx + 12);
  const windowText = lines.slice(windowStart, windowEnd).join('\n');
  if (!windowText.includes('.cancelled()')) return false;
  return !windowText.includes('.exception()') && !windowText.includes(QA_HEALTH_OK_PRAGMA);
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
  let lastReportedLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i <= lastReportedLine || line.includes(QA_HEALTH_OK_PRAGMA) || !line.includes('.done()')) {
      continue;
    }
    if (!isUncheckedSupervisorWindow(lines, i)) continue;

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
    lastReportedLine = i + 6;
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

interface LogicalShellCommand {
  startLine: number;
  text: string;
  exempt: boolean;
}

interface ActiveComposeLine {
  lineNum: number;
  text: string;
  exempt: boolean;
}

function makeDockerTtyFinding(
  relPath: string,
  line: number,
  message: string,
  remediation: string
): SecurityFinding {
  return {
    rule_id: QA_DOCKER_TTY_01_RULE,
    severity: 'HIGH',
    stig_owasp_ref: QA_DOCKER_TTY_01_REF,
    file: relPath,
    line,
    message,
    remediation,
  };
}

function consumeContinuedCommand(
  lines: string[],
  startIndex: number,
  initialExempt: boolean
): { command: LogicalShellCommand; nextIndex: number } {
  const startLine = startIndex + 1;
  let exempt = initialExempt;
  const parts: string[] = [];
  let idx = startIndex;
  while (idx < lines.length) {
    const cur = lines[idx];
    if (cur.includes(QA_DOCKER_TTY_OK_PRAGMA)) exempt = true;
    const cleanEnd = cur.trimEnd();
    const continues = cleanEnd.endsWith('\\') && !cleanEnd.endsWith('\\\\');
    parts.push(continues ? cleanEnd.slice(0, -1).trim() : cleanEnd.trim());
    idx++;
    if (!continues) break;
  }
  return { command: { startLine, text: parts.join(' '), exempt }, nextIndex: idx };
}

function collectLogicalCommands(lines: string[]): LogicalShellCommand[] {
  const commands: LogicalShellCommand[] = [];
  let prevPragma = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && line.includes(QA_DOCKER_TTY_OK_PRAGMA);
      i++;
      continue;
    }
    const { command, nextIndex } = consumeContinuedCommand(lines, i, prevPragma);
    prevPragma = false;
    commands.push(command);
    i = nextIndex;
  }
  return commands;
}

function pushTokenAndReset(tokens: string[], current: string, sep?: string): string {
  if (current) tokens.push(current);
  if (sep) tokens.push(sep);
  return '';
}

function readQuotedSpan(
  text: string,
  startIdx: number,
  quoteChar: string
): { chunk: string; endIdx: number } {
  let chunk = '';
  let idx = startIdx + 1;
  while (idx < text.length && text[idx] !== quoteChar) {
    chunk += text[idx];
    idx++;
  }
  return { chunk, endIdx: idx };
}

function shellSeparatorLength(text: string, idx: number): number {
  const ch = text[idx];
  if (ch === ';' || ch === '|') return 1;
  if (ch === '&' && text[idx + 1] === '&') return 2;
  return 0;
}

function splitShellTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const sepLen = shellSeparatorLength(text, i);
    if (ch === "'" || ch === '"') {
      const span = readQuotedSpan(text, i, ch);
      current += span.chunk;
      i = span.endIdx;
    } else if (sepLen > 0) {
      current = pushTokenAndReset(tokens, current, ';');
      i += sepLen - 1;
    } else if (/\s/.test(ch)) {
      current = pushTokenAndReset(tokens, current);
    } else {
      current += ch;
    }
  }
  pushTokenAndReset(tokens, current);
  return tokens;
}

function advanceComposeSubcommand(tokens: string[], afterComposeIdx: number): number {
  let idx = afterComposeIdx;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = tokens[idx];
    if (!tok.startsWith('-')) return idx;
    idx += COMPOSE_VALUE_FLAGS.has(tok) ? 2 : 1;
  }
  return -1;
}

function checkRunFlagsMissingNoTty(tokens: string[], runIdx: number): boolean {
  let idx = runIdx + 1;
  let hasNoTty = false;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = tokens[idx];
    if (!tok.startsWith('-')) break;
    const isShortNoTty = tok.startsWith('-') && !tok.startsWith('--') && tok.includes('T');
    if (tok === '--no-TTY' || isShortNoTty) {
      hasNoTty = true;
    }
    idx += COMPOSE_RUN_VALUE_FLAGS.has(tok) ? 2 : 1;
  }
  return !hasNoTty;
}

function hasComposeRunMissingNoTty(commandText: string): boolean {
  const tokens = splitShellTokens(commandText);
  for (let i = 0; i < tokens.length; i++) {
    const isDockerCompose = tokens[i] === 'docker' && tokens[i + 1] === 'compose';
    const isLegacyCompose = tokens[i] === 'docker-compose';
    if (!isDockerCompose && !isLegacyCompose) continue;
    const subIdx = advanceComposeSubcommand(tokens, i + (isDockerCompose ? 2 : 1));
    if (subIdx !== -1 && tokens[subIdx] === 'run' && checkRunFlagsMissingNoTty(tokens, subIdx)) {
      return true;
    }
  }
  return false;
}

function isTargetComposeRunnerFile(relPath: string, lines: string[]): boolean {
  if (isGithubWorkflowOrActionFile(relPath)) return true;
  const norm = relPath.replace(/\\/g, '/');
  if (!norm.endsWith('.sh') && !norm.endsWith('.bash')) return false;
  const base = path.posix.basename(norm);
  if (/^(?:deploy|ci|probar-|release)/i.test(base)) return true;
  return lines.some(
    (l) => !l.trimStart().startsWith('#') && /\bCI\s*=\s*['"]?true['"]?\b/.test(l)
  );
}

function extractActiveComposeLines(lines: string[]): ActiveComposeLine[] {
  const active: ActiveComposeLine[] = [];
  let prevPragma = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && raw.includes(QA_DOCKER_TTY_OK_PRAGMA);
      continue;
    }
    const exempt = prevPragma || raw.includes(QA_DOCKER_TTY_OK_PRAGMA);
    prevPragma = false;
    active.push({ lineNum: i + 1, text: raw, exempt });
  }
  return active;
}

function checkWranglerTmpfsHardening(
  relPath: string,
  activeLines: ActiveComposeLine[]
): SecurityFinding[] {
  const readOnlyLine = activeLines.find(
    (l) => !l.exempt && /^\s*read_only\s*:\s*true\b/.test(l.text)
  );
  if (!readOnlyLine) return [];
  const wranglerMount = activeLines.find((l) => l.text.includes('.wrangler'));
  if (!wranglerMount) {
    return [
      makeDockerTtyFinding(
        relPath,
        readOnlyLine.lineNum,
        'Servicio Compose con read_only: true invoca wrangler sin montar .wrangler como tmpfs, provocando fallo ENOENT/EROFS en saveToConfigCache().',
        QA_DOCKER_TTY_WRANGLER_REMEDIATION
      ),
    ];
  }
  if (!wranglerMount.exempt && !/\bnoexec\b/.test(wranglerMount.text)) {
    return [
      makeDockerTtyFinding(
        relPath,
        wranglerMount.lineNum,
        'Montaje tmpfs de .wrangler en contenedor read_only: true carece de la opción noexec (requerida por endurecimiento 11X).',
        QA_DOCKER_TTY_WRANGLER_REMEDIATION
      ),
    ];
  }
  return [];
}

function checkWranglerCiForceFlag(
  relPath: string,
  lines: string[],
  activeLines: ActiveComposeLine[]
): SecurityFinding[] {
  const hasCiTrue = activeLines.some((l) => /\bCI\s*[:=]\s*['"]?true['"]?/i.test(l.text));
  if (!hasCiTrue) return [];
  const findings: SecurityFinding[] = [];
  for (const cmd of collectLogicalCommands(lines)) {
    if (cmd.exempt) continue;
    const isPagesMutating = /\bwrangler\s+pages\s+(?:deploy|project\s+create)\b/.test(cmd.text);
    if (isPagesMutating && !/--force(?:\s|=|$)/.test(cmd.text)) {
      findings.push(
        makeDockerTtyFinding(
          relPath,
          cmd.startLine,
          'Comando wrangler pages deploy/project create bajo CI=true omite --force, arriesgando bloqueo no interactivo o delegación silenciosa Pages-to-Workers (maybeDelegatePagesToWorkers).',
          QA_DOCKER_TTY_WRANGLER_REMEDIATION
        )
      );
    }
  }
  return findings;
}

function checkQaDockerTty01NonInteractiveAndReadOnly(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    lines.slice(0, 5).some((l) => l.includes(QA_DOCKER_TTY_OK_PRAGMA))
  ) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  if (isTargetComposeRunnerFile(relPath, lines)) {
    for (const cmd of collectLogicalCommands(lines)) {
      if (!cmd.exempt && hasComposeRunMissingNoTty(cmd.text)) {
        findings.push(
          makeDockerTtyFinding(
            relPath,
            cmd.startLine,
            'Invocación docker compose run en script CI/deploy o GitHub Workflow omite -T (--no-TTY), asignando un pseudo-TTY que colisiona con CI=true.',
            QA_DOCKER_TTY_NO_TTY_REMEDIATION
          )
        );
      }
    }
  }

  const norm = relPath.replace(/\\/g, '/');
  if (/(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(norm)) {
    const activeLines = extractActiveComposeLines(lines);
    if (activeLines.some((l) => !l.exempt && /\bwrangler\b/.test(l.text))) {
      findings.push(
        ...checkWranglerTmpfsHardening(relPath, activeLines),
        ...checkWranglerCiForceFlag(relPath, lines, activeLines)
      );
    }
  }
  return findings;
}

function isGithubWorkflowOrActionFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
    return false;
  }
  const lower = norm.toLowerCase();
  if (!lower.endsWith('.yml') && !lower.endsWith('.yaml')) return false;
  const ghIdx = lower.indexOf('.github/');
  if (ghIdx === -1 || (ghIdx > 0 && lower[ghIdx - 1] !== '/')) return false;
  const sub = lower.slice(ghIdx + '.github/'.length);
  const parts = sub.split('/');
  if (parts.length === 2 && parts[0] === 'workflows' && parts[1].length > 0) {
    return true;
  }
  return (
    parts.length === 3 &&
    parts[0] === 'actions' &&
    parts[1].length > 0 &&
    (parts[2] === 'action.yml' || parts[2] === 'action.yaml')
  );
}

function stripWrappingQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function extractThirdPartyActionTarget(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const isSeqItem = trimmed.startsWith('-') && trimmed.length > 1 && /\s/.test(trimmed[1]);
  const candidate = isSeqItem ? trimmed.slice(1).trimStart() : trimmed;
  if (!candidate.startsWith('uses')) return null;
  const afterUses = candidate.slice(4).trimStart();
  if (!afterUses.startsWith(':')) return null;
  const rawRest = afterUses.slice(1).trim();
  const withoutComment = rawRest.split(/\s+#/, 1)[0].trim();
  const rawTarget = stripWrappingQuotes(withoutComment);
  if (
    !rawTarget ||
    rawTarget.startsWith('./') ||
    rawTarget.startsWith('../') ||
    rawTarget.startsWith('docker://')
  ) {
    return null;
  }
  return rawTarget;
}

function describeUnpinnedActionRef(rawTarget: string): string | null {
  const atIdx = rawTarget.lastIndexOf('@');
  if (atIdx <= 0) {
    return `La directiva uses: '${rawTarget}' omite referencia inmutable por commit SHA de 40 caracteres.`;
  }
  const ref = rawTarget.slice(atIdx + 1);
  if (SHA40_RE.test(ref)) return null;
  if (rawTarget.startsWith('aquasecurity/trivy-action@') && UNPREFIXED_SEMVER_RE.test(ref)) {
    return `La acción '${rawTarget}' usa una etiqueta sin prefijo 'v' (@${ref}) eliminada aguas arriba en aquasecurity/trivy-action; debe fijarse mediante commit SHA de 40 caracteres (# vX.Y.Z).`;
  }
  if (MUTABLE_BRANCH_RE.test(ref)) {
    return `La acción '${rawTarget}' referencia una rama/etiqueta mutable (@${ref}) en lugar de un commit SHA de 40 caracteres.`;
  }
  return `La acción '${rawTarget}' usa una etiqueta semántica mutable (@${ref}) en lugar de un hash SHA de 40 caracteres.`;
}

function checkSecCiActionRef(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isGithubWorkflowOrActionFile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(SEC_CI_ACTION_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    if (line.includes(SEC_CI_ACTION_OK_PRAGMA) || prevLine.includes(SEC_CI_ACTION_OK_PRAGMA)) {
      continue;
    }
    const rawTarget = extractThirdPartyActionTarget(line);
    if (!rawTarget) continue;
    const message = describeUnpinnedActionRef(rawTarget);
    if (!message) continue;
    findings.push({
      rule_id: 'SEC-CI-ACTION-REF',
      severity: 'HIGH',
      stig_owasp_ref: SEC_CI_ACTION_REF_REF,
      file: relPath,
      line: i + 1,
      message,
      remediation: SEC_CI_ACTION_REMEDIATION,
    });
  }
  return findings;
}

function isLineCommentOrPragmaExempt(line: string, prevLine: string, pragma: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return true;
  return line.includes(pragma) || prevLine.includes(pragma);
}

function checkQaCiEscape01WorkflowExpansion(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (!isGithubWorkflowOrActionFile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(QA_CI_ESCAPE_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    if (isLineCommentOrPragmaExempt(line, prevLine, QA_CI_ESCAPE_OK_PRAGMA)) continue;
    if (!DOUBLE_DOLLAR_CI_RE.test(line)) continue;
    findings.push({
      rule_id: 'QA-CI-ESCAPE-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_CI_ESCAPE_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Escape de doble dólar $$(...) / $${...} estilo Makefile o Compose detectado en workflow/action de GitHub Actions: bash expande $$ al PID del proceso (<PID>(pwd)), rompiendo montajes Docker con exit code 125.',
      remediation: QA_CI_ESCAPE_REMEDIATION,
    });
  }
  return findings;
}

function isSubdirectoryMakefile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  const clean = norm.startsWith('./') ? norm.slice(2) : norm;
  if (isTestFilePath(clean) || isAuditorSelfDefinition(clean)) return false;
  const parts = clean.split('/');
  if (parts.length < 2) return false;
  const fileName = parts[parts.length - 1];
  return MAKEFILE_NAMES.has(fileName);
}

function countPrecedingDollars(text: string, index: number): number {
  let count = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === '$') {
    count++;
    cursor--;
  }
  return count;
}

function hasUnescapedMakePwdVar(line: string): boolean {
  MAKE_PWD_VAR_RE.lastIndex = 0;
  for (const match of line.matchAll(MAKE_PWD_VAR_RE)) {
    const idx = match.index ?? 0;
    if (countPrecedingDollars(line, idx) % 2 === 0) {
      return true;
    }
  }
  return false;
}

function checkQaMakeCurdir01SubMakefile(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isSubdirectoryMakefile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(QA_MAKE_CURDIR_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    if (isLineCommentOrPragmaExempt(line, prevLine, QA_MAKE_CURDIR_OK_PRAGMA)) continue;
    if (!hasUnescapedMakePwdVar(line)) continue;
    findings.push({
      rule_id: 'QA-MAKE-CURDIR-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_MAKE_CURDIR_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Sub-Makefile referencia $(PWD) / ${PWD} en lugar de $(CURDIR): al invocarse con $(MAKE) -C <subdir>, GNU Make conserva el PWD del directorio padre y expone rutas fuera del subproyecto.',
      remediation: QA_MAKE_CURDIR_REMEDIATION,
    });
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
    ...checkSec13RlsMultiTxPersistence(relPath, lines),
    ...checkSec14WormDeterministicChain(relPath, lines),
    ...checkSec15EphemeralProdPipelineCreds(relPath, lines),
    ...checkSec16PreAuthMultiStepContinuity(relPath, lines),
    ...checkSecCiActionRef(relPath, lines),
    ...checkQaCiEscape01WorkflowExpansion(relPath, lines),
    ...checkQaMakeCurdir01SubMakefile(relPath, lines),
    ...checkQaCov01AddoptsBypass(relPath, lines),
    ...checkQaPg17RlsInvalidCatalog(relPath, lines),
    ...checkQaSmoke01SettingsSingletonSync(relPath, lines),
    ...checkQaHealth01SupervisorTaskExit(relPath, lines),
    ...checkQaCliTty01InteractiveHangGuard(relPath, lines),
    ...checkQaDockerTty01NonInteractiveAndReadOnly(relPath, lines),
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
