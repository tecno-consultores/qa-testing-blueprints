// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { GroupedSecurityFinding, SecurityAuditResult, SecurityFinding } from '../types.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../utils/ignoredDirs.js';

const IGNORED_DIRS = CANONICAL_IGNORED_DIRS;

const WEBMANIFEST_EXT = '.webmanifest';

const SCANNABLE_EXTS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
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
const UNPREFIXED_SEMVER_RE = /^\d+\.\d+/;
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
const MAKEFILE_NAMES = new Set(['Makefile', 'Makefile.example', 'GNUmakefile']);
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
const SSR_PREHYDRATE_V_IF_PATTERNS: readonly RegExp[] = [
  /\bv-(?:else-)?if\s*=\s*"[^"\n]*(?:localStorage|dataset\.theme|document\.documentElement)/,
  /\bv-(?:else-)?if\s*=\s*'[^'\n]*(?:localStorage|dataset\.theme|document\.documentElement)/,
];
const JSX_PREHYDRATE_STATE_MARKERS = [
  'localStorage',
  'sessionStorage',
  'document.documentElement.dataset',
  'dataset.theme',
  'matchMedia',
  "typeof window !== 'undefined'",
  'typeof window !== "undefined"',
];
const QA_STRYKER_CFG_RULE = 'QA-STRYKER-CFG-01';
const QA_STRYKER_CFG_REF =
  'Standard 11X Layer 5 Mutation Testing / Stryker Container Stability Contract';
const QA_STRYKER_CFG_OK_PRAGMA = 'qa-stryker-cfg-ok';
const SEC_WS_PUBSUB_RULE = 'SEC-WS-PUBSUB-01';
const SEC_WS_PUBSUB_REF =
  'OWASP API3:2023 / API4:2023 / DISA STIG APSC-DV-000460 (Multi-Tenant Real-Time Isolation)';
const SEC_WS_PUBSUB_OK_PRAGMA = 'sec-ws-pubsub-ok';
const WS_PUBSUB_TENANT_MARKERS = [
  'tenant_id',
  'tenantId',
  'org_id',
  'orgId',
  'organization_id',
  'workspace_id',
  'check_tenant',
  'same_tenant',
  'ws:${',
  'ws:{',
  '.startsWith(',
  '.startswith(',
];
const PLAYWRIGHT_CONFIG_RE = /(?:^|\/)playwright\.config\.(?:ts|js|mjs|mts)$/i;
const E2E_TEST_FILE_RE = /(?:(?:^|\/)(?:e2e|tests\/e2e)\/)|(?:\.(?:e2e|spec)\.(?:ts|tsx|js|jsx|mjs)$)/i;
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

function stripExampleSuffix(name: string): string {
  return name.endsWith('.example') ? name.slice(0, -'.example'.length) : name;
}

function hasScannableBasename(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return (
    SCANNABLE_EXTS.has(ext) ||
    name === '.npmrc' ||
    name === '_headers' ||
    name.startsWith('.env') ||
    MAKEFILE_NAMES.has(name)
  );
}

function isScannableFile(entry: fs.Dirent): boolean {
  return entry.isFile() && hasScannableBasename(entry.name);
}

function isScannableFileOrExample(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  if (hasScannableBasename(entry.name)) return true;
  return entry.name.endsWith('.example') && hasScannableBasename(stripExampleSuffix(entry.name));
}

function hasDockerfileBasename(name: string): boolean {
  return name === 'Dockerfile' || /^Dockerfile\.[A-Za-z0-9_.-]+$/.test(name);
}

function isDockerfileEntry(entry: fs.Dirent): boolean {
  return entry.isFile() && !entry.name.endsWith('.example') && hasDockerfileBasename(entry.name);
}

function isDockerfileOrExampleEntry(entry: fs.Dirent): boolean {
  return entry.isFile() && hasDockerfileBasename(stripExampleSuffix(entry.name));
}

function normalizeExampleRelPath(relPath: string, options?: AuditSecurityOptions): string {
  return options?.includeExamples && relPath.endsWith('.example')
    ? stripExampleSuffix(relPath)
    : relPath;
}

function shouldSkipDirectory(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false;
  if (IGNORED_DIRS.has(entry.name) || entry.name === 'backups') return true;
  if (entry.name === '.agents' || entry.name === '.github' || entry.name === '.vitepress') {
    return false;
  }
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
  } catch (err: unknown) {
    // Tolerar directorios ilegibles (permisos/enlaces rotos) para no abortar el escaneo del resto del proyecto
    reportDebugCatchError('security-auditor.collectMatchingFiles', err);
  }

  return results;
}

/**
 * Recopila recursivamente todos los archivos auditables del proyecto.
 */
function collectFiles(dirPath: string, options?: AuditSecurityOptions): string[] {
  const predicate = options?.includeExamples ? isScannableFileOrExample : isScannableFile;
  return collectMatchingFiles(dirPath, predicate);
}

function checkSec01MassAssignment(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkSec02AntiCswsh(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkSec03CommandAndDeserialization(relPath: string, lines: string[]): SecurityFinding[] {
  if (relPath.endsWith('.example') || isTestFilePath(relPath) || isAuditorSelfDefinition(relPath)) {
    return [];
  }
  if (
    !relPath.endsWith('.py') &&
    !relPath.endsWith('.ts') &&
    !relPath.endsWith('.tsx') &&
    !relPath.endsWith('.mts') &&
    !relPath.endsWith('.cts') &&
    !relPath.endsWith('.js') &&
    !relPath.endsWith('.jsx') &&
    !relPath.endsWith('.mjs') &&
    !relPath.endsWith('.php')
  ) {
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

function checkSec04Xxe(relPath: string, lines: string[]): SecurityFinding[] {
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

  for (const [i, line] of lines.entries()) {
    if (line.includes('v-html') || line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
      const hasSanitize = /\b(?:escapeHtml|DOMPurify|sanitize\w*)\b/.test(line);
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

function checkSec07SwaggerInProd(relPath: string, lines: string[]): SecurityFinding[] {
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
  if (val.length < 8 || /[\s"'$#]/.test(val)) return null;
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

  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const assignedSecret =
      SEC10_ASSIGNED_SECRET_RE.exec(line)?.[1] ??
      (path.basename(relPath).startsWith('.env') ? extractUnquotedEnvSecretValue(line) : null);
    if (
      SEC10_PRIVATE_KEY_MARKERS.some((marker) => line.includes(marker)) &&
      !isBenignPromptfooPrivateKeyAssertion(relPath, lines, i)
    ) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Clave criptográfica privada detectada en el código fuente.',
        remediation: 'Eliminar claves privadas del código y delegar en gestores de secretos o Vault.',
      });
    } else if (SEC10_TOKEN_RES.some((re) => re.test(line))) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Token o clave API hardcodeada detectada en el código fuente.',
        remediation: 'Revocar la credencial de inmediato e inyectarla vía variables de entorno seguras.',
      });
    } else if (
      assignedSecret !== null &&
      !assignedSecret.toLowerCase().includes('placeholder') &&
      !assignedSecret.toLowerCase().includes('example') &&
      !assignedSecret.toLowerCase().includes('changeme')
    ) {
      findings.push({
        rule_id: 'SEC-10',
        severity: 'CRITICAL',
        stig_owasp_ref: SEC_10_REF,
        file: relPath,
        line: i + 1,
        message: 'Contraseña, API key o clave secreta en texto plano asignada directamente en el código.',
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

  for (const [i, line] of lines.entries()) {
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

  for (const [i, line] of lines.entries()) {
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
  const importsRealAuditFn = fullContent
    .split(/\r?\n/)
    .some(
      (line) =>
        /\bfrom[ \t]+[\w.]*audit[ \t]+import\b/.test(line) &&
        (line.includes('write_audit_log') || line.includes('writeAuditLog'))
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
    /(?:\belse\s*\{\s*|\belse\s+)return\s+["'](?:MAINTENANCE|MANTENIMIENTO|CAÍDA|CAIDA|CRITICAL|SECURITY|SEGURIDAD)["']/i;

  for (const [i, line] of lines.entries()) {
    if (catchAllPattern.test(line)) {
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
  } catch (err: unknown) {
    // JSON malformado o ilegible se devuelve como null; los verificadores superiores tratan null como ausente
    reportDebugCatchError('security-auditor.readJsonObjectSafe', err);
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

  const subDirs = ['vue3', 'react-frontend', 'node-backend', 'frontend', 'mcp-server', 'mobile-appium'];
  for (const sub of subDirs) {
    const subDir = path.join(projectPath, sub);
    const subFinding = checkSingleDirNpmrc(subDir, sub);
    if (subFinding) findings.push(subFinding);
    findings.push(...checkSec09NodeToolchainHygiene(subDir, sub));
  }
  return findings;
}

export function isNonHttpNodeCliEntry(projectPath: string, relFile: string): boolean {
  if (!relFile.endsWith('index.ts')) return false;
  try {
    const text = fs.readFileSync(path.join(projectPath, relFile), 'utf8');
    const hasCliSignal = text.startsWith('#!/usr/bin/env node') || text.includes('StdioServerTransport');
    const hasHttpSignal = /\b(?:express|fastify|Hono|createServer|NestFactory|Koa)\b/.test(text);
    return hasCliSignal && !hasHttpSignal;
  } catch {
    return false;
  }
}

function checkSec08Oshp(projectPath: string, allRelFiles: string[]): SecurityFinding[] {
  const prodFiles = allRelFiles.filter((f) => !isTestFilePath(f));
  const hasBackendApp = prodFiles.some(
    (f) =>
      (f.endsWith('main.py') ||
        f.endsWith('app.py') ||
        f.endsWith('server.ts') ||
        f.endsWith('index.ts')) &&
      !isNonHttpNodeCliEntry(projectPath, f)
  );
  if (!hasBackendApp) return [];

  for (const relFile of prodFiles) {
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
    } catch (err: unknown) {
      // Continuar buscando cabeceras OSHP en el resto del proyecto si un archivo puntual es ilegible
      reportDebugCatchError('security-auditor.checkSec08Oshp', err);
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

interface Ui11x03FindingInput {
  readonly severity: 'HIGH' | 'MEDIUM';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly remediation: string;
}

function makeUi11x03Finding(input: Ui11x03FindingInput): SecurityFinding {
  return {
    rule_id: 'UI-11X-03',
    severity: input.severity,
    stig_owasp_ref: UI_11X_03_REF,
    file: input.file,
    line: input.line,
    message: input.message,
    remediation: input.remediation,
  };
}

function readTextFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    // Lectura opcional de archivo candidato durante auditoría estática; null representa ausente o ilegible
    reportDebugCatchError('security-auditor.readTextFileSafe', err);
    return null;
  }
}

function parseJsonObjectTextSafe(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (err: unknown) {
    // Manifiesto JSONC o inválido tratado como no parseable sin abortar el resto del escaneo
    reportDebugCatchError('security-auditor.parseJsonObjectTextSafe', err);
    return null;
  }
}

function isDirectorySafe(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err: unknown) {
    // Directorio opcional inexistente o sin permisos equivale a false en detección de estructura
    reportDebugCatchError('security-auditor.isDirectorySafe', err);
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
  return Math.max(1, idx + 1);
}

function parseHtmlLinkAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(tag)) !== null) {
    const attrName = match[1];
    if (attrName) {
      attrs[attrName.toLowerCase()] = pickAt(match, 2, pickAt(match, 3)).trim();
    }
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
    return makeUi11x03Finding({
      severity: 'HIGH',
      file: relPath,
      line,
      message: `Etiqueta rel="${APPLE_TOUCH_REL}" apunta a formato no soportado por Safari/iOS (${cleanHref}).`,
      remediation: 'Generar un PNG RGB opaco de 180x180 px (sin transparencia ni .webp/.svg) y referenciarlo con sizes="180x180".',
    });
  }
  if (cleanHref.endsWith('.png') && !hasSizeToken(sizesAttr, '180x180')) {
    return makeUi11x03Finding({
      severity: 'MEDIUM',
      file: relPath,
      line,
      message: `Etiqueta rel="${APPLE_TOUCH_REL}" PNG omite el atributo recomendado sizes="180x180".`,
      remediation: 'Agregar sizes="180x180" al <link rel="apple-touch-icon"> apuntando al PNG opaco de 180x180 px.',
    });
  }
  return null;
}

interface HtmlLinkTagInput {
  readonly relPath: string;
  readonly line: number;
  readonly tag: string;
  readonly hasSiblingPublic: boolean;
  readonly hasAnyIco: boolean;
}

function inspectHtmlLinkTag(
  input: HtmlLinkTagInput
): { findings: SecurityFinding[]; hasFavicon48: boolean } {
  const { relPath, line, tag, hasSiblingPublic, hasAnyIco } = input;
  const findings: SecurityFinding[] = [];
  const attrs = parseHtmlLinkAttributes(tag);
  const relTokens = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cleanHref = pickAt((attrs.href ?? '').split(/[?#]/, 1), 0).toLowerCase();
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
      makeUi11x03Finding({
        severity: 'HIGH',
        file: relPath,
        line,
        message: `index.html referencia ${PATH_FAVICON_ICO}, pero no existe public/${FAVICON_ICO_NAME} ni ${FAVICON_ICO_NAME} en disco (HTTP 404).`,
        remediation: 'Generar public/favicon.ico multi-resolución (16x16, 32x32, 48x48) con sizes="48x48".',
      })
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
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: 1,
        message: `Suite de marca/PWA detectada sin public/${FAVICON_ICO_NAME} en disco para navegadores clásicos y Google Search (>= 48px).`,
        remediation: 'Empaquetar public/favicon.ico con tramas 16x16, 32x32 y 48x48 y declararlo en index.html con sizes="48x48".',
      }),
    ];
  }
  if (!hasFaviconIco48) {
    return [
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: 1,
        message: `index.html no declara <link rel="icon" href="${PATH_FAVICON_ICO}" sizes="48x48" /> para cumplir el requisito >= 48px de Google Search.`,
        remediation: 'Añadir <link rel="icon" href="/favicon.ico" sizes="48x48" /> en el <head> de index.html.',
      }),
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
    const inspected = inspectHtmlLinkTag({
      relPath,
      line: lineAtOffset(content, match.index),
      tag: match[0],
      hasSiblingPublic,
      hasAnyIco,
    });
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
  const cleanSrc = typeof icon.src === 'string' ? pickAt(icon.src.split(/[?#]/, 1), 0).toLowerCase() : '';
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
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '.webp'),
        message: 'Manifiesto PWA declara iconos .webp en lugar de PNG opacos multiplataforma.',
        remediation: 'Reemplazar iconos .webp por icon-192.png (192x192) e icon-512.png (512x512) en formato image/png.',
      })
    );
  }
  if (summary.hasCombinedPurpose) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, 'maskable'),
        message: 'Manifiesto PWA combina "any maskable" en una misma entrada (riesgo de recorte en lanzadores).',
        remediation: 'Separar en objetos distintos las entradas con "purpose": "any" y "purpose": "maskable".',
      })
    );
  }
  if (!summary.hasPng192 || !summary.hasPng512) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '"icons"'),
        message: 'Manifiesto PWA carece de ambos iconos image/png requeridos (192x192 y 512x512).',
        remediation: 'Incluir entradas image/png explícitas para 192x192 y 512x512 en site.webmanifest.',
      })
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

  for (const [i, raw] of lines.entries()) {
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
        makeUi11x03Finding({
          severity: 'HIGH',
          file: relPath,
          line: op.line,
          message: `Bloque "${block.route}" en _headers redefine "${op.name}" sin desacoplamiento previo "! ${op.name}" (concatenación aditiva desde /*).`,
          remediation: `Anteponer "! ${op.name}" dentro del bloque "${block.route}" antes de emitir el nuevo valor.`,
        })
      );
    }
  }

  if (globalWatched.get(HDR_CORP) === HDR_SAME_ORIGIN && isPublicAssetEdgeRoute(block.route) && !corpSetCrossOrigin) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: block.line,
        message: `La regla global /* fija ${HDR_CORP}: ${HDR_SAME_ORIGIN}, pero "${block.route}" no habilita "${HDR_CROSS_ORIGIN}" para rastreadores y previsualizaciones OG.`,
        remediation: `Desacoplar con "! Cross-Origin-Resource-Policy" y fijar "Cross-Origin-Resource-Policy: cross-origin" en "${block.route}".`,
      })
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
        makeUi11x03Finding({
          severity: 'HIGH',
          file: relPath,
          line: findLineNumberContaining(rawText, pattern),
          message: `Comodín inválido "${pattern}" en _routes.json (Cloudflare Pages v1 solo admite "*" como sufijo final).`,
          remediation: 'Reemplazar comodines de sufijo o intermedios (ej. /*.ico) por rutas exactas como "/favicon.ico" o prefijos "/favicons/*".',
        })
      );
    }
  }

  if (includePatterns.includes(WILDCARD_ALL_ROUTE) && Array.isArray(doc.exclude) && !excludePatterns.includes(PATH_FAVICON_ICO)) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '"exclude"'),
        message: `_routes.json incluye "${WILDCARD_ALL_ROUTE}" sin excluir explícitamente "${PATH_FAVICON_ICO}" en exclude.`,
        remediation: 'Agregar "/favicon.ico" al arreglo exclude de _routes.json para evitar invocar Workers innecesariamente.',
      })
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

function checkProjectLevelRules(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  return [
    ...checkSec09Npmrc(projectPath),
    ...checkSec08Oshp(projectPath, allRelFiles),
    ...checkQaMypy01StrictChain(projectPath),
    ...checkQaHealth01ContainerHeartbeatContract(projectPath, allRelFiles, options),
    ...checkQaContractSdk01RealTransport(projectPath, allRelFiles),
    ...checkQaDockerLock01LockfileAndSmoke(projectPath, options),
    ...checkQaPlaywrightPin01VersionParity(projectPath, allRelFiles, options),
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

function collectContainerHealthFiles(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): string[] {
  const includeExamples = options?.includeExamples ?? false;
  const composeFiles = allRelFiles.filter((rel) => {
    const effective = normalizeExampleRelPath(rel, options);
    return (
      (includeExamples || !rel.endsWith('.example')) &&
      /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(effective)
    );
  });
  const dockerDirs = ['', 'fastapi', 'python', 'backend', 'node-backend'];
  const dockerVariants = includeExamples
    ? ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.workers', 'Dockerfile.example']
    : ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.workers'];
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

function collectProbesFromCandidate(
  projectPath: string,
  rel: string,
  probeRegex: RegExp,
  probes: Set<string>
): void {
  const content = readTextFileSafe(path.join(projectPath, rel));
  if (!content) return;
  const isYaml = /\.ya?ml$/i.test(stripExampleSuffix(rel));
  const scopedText = isYaml
    ? extractComposeHealthcheckText(content)
    : extractDockerfileHealthcheckText(content);
  if (!scopedText) return;
  probeRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = probeRegex.exec(scopedText)) !== null) {
    if (!isExcludedProbePath(match[0])) {
      probes.add(match[0]);
    }
  }
}

function extractContainerProbePaths(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): string[] {
  const candidates = collectContainerHealthFiles(projectPath, allRelFiles, options);
  const probes = new Set<string>();
  const probeRegex = /\/(?:tmp|var\/run|run)\/[A-Za-z0-9_.-]{3,64}/g;

  for (const rel of candidates) {
    collectProbesFromCandidate(projectPath, rel, probeRegex, probes);
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

  for (const [i, line] of lines.entries()) {
    if (!line.includes(targetToken)) continue;
    if (firstLine === 1) firstLine = i + 1;
    const match = constRegex.exec(line);
    if (match) symbols.push(pickAt(match, 1));
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
    } catch (err: unknown) {
      // Continuar evaluando candidatos si un archivo puntual del repositorio no es legible
      reportDebugCatchError('security-auditor.findSourceOrchestratorForProbe', err);
    }
  }
  return null;
}

const PY_TEST_FUNC_LINE_RE = /^(?:async )?def test_\w+ ?\(/;

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
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura mientras se buscan aserciones en archivos de prueba
      reportDebugCatchError('security-auditor.hasUnmockedProbeTestAssertion', err);
    }
  }
  return false;
}

function checkQaHealth01ContainerHeartbeatContract(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const probePaths = extractContainerProbePaths(projectPath, allRelFiles, options);
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
  for (const [i, line] of lines.entries()) {
    if (pattern.test(line)) return i + 1;
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
    } catch (err: unknown) {
      // Tolerar errores de lectura puntual sin ocultar el resto de archivos MCP/SDK
      reportDebugCatchError('security-auditor.findProtocolServerDeclaration', err);
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
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura al inspeccionar suites de contrato SDK
      reportDebugCatchError('security-auditor.hasRealSdkTransportContractTest', err);
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
    const nextRaw = pickAt(rawLines, idx);
    if (nextRaw.includes(QA_DOCKER_LOCK_OK_PRAGMA)) hasPragma = true;
    const nextTrimmed = nextRaw.trim();
    if (!nextTrimmed.startsWith('#')) {
      combined = `${combined.slice(0, -1).trimEnd()} ${nextTrimmed}`;
    }
  }

  return { nextIndex: idx, command: combined, hasPragma };
}

function skipSingleRunOption(cmd: string, start: number): number {
  let idx = start;
  let quote: '"' | "'" | null = null;
  while (idx < cmd.length) {
    const ch = cmd[idx];
    if (quote !== null) {
      if (ch === quote) quote = null;
      idx += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch ?? '')) {
      break;
    }
    idx += 1;
  }
  return idx;
}

function stripLeadingRunOptions(rawCommand: string): string {
  let pos = 0;
  const trimmed = rawCommand.trim();
  while (trimmed.startsWith('--', pos)) {
    pos = skipSingleRunOption(trimmed, pos);
    while (pos < trimmed.length && /\s/.test(trimmed[pos] ?? '')) {
      pos += 1;
    }
  }
  return trimmed.slice(pos);
}

function extractDockerfileRunBlocks(content: string): DockerRunBlock[] {
  const rawLines = content.split(/\r?\n/);
  if (rawLines.slice(0, 5).some((l) => l.includes(QA_DOCKER_LOCK_OK_PRAGMA))) {
    return [];
  }

  const blocks: DockerRunBlock[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const rawLine = pickAt(rawLines, i);
    const trimmed = rawLine.trim();
    if (!/^RUN\b/i.test(trimmed)) {
      i += 1;
      continue;
    }

    const prevLine = pickAt(rawLines, i - 1);
    const initialPragma =
      prevLine.includes(QA_DOCKER_LOCK_OK_PRAGMA) || rawLine.includes(QA_DOCKER_LOCK_OK_PRAGMA);
    const consumed = consumeRunContinuation(rawLines, i, trimmed.slice(3).trim(), initialPragma);
    if (!consumed.hasPragma) {
      blocks.push({ line: i + 1, command: stripLeadingRunOptions(consumed.command) });
    }
    i = consumed.nextIndex + 1;
  }

  return blocks;
}

const PIP_INSTALL_CMD_RE = /\bpip3?\s+install\b/i;
const PIP_LOCKED_OR_EDITABLE_RE =
  /(?:^|\s)(?:-r|--requirement|-e|--editable)(?:\s|$|=)|\.whl\b|\buv\s+export\b/i;
const NODE_PKG_ADD_RE = /^\s*(?:npm|pnpm|yarn)\s+add\b/i;
const NPM_UNFROZEN_INSTALL_RE = /^\s*npm\s+(?:install|i)\b/i;
const PNPM_INSTALL_CMD_RE = /^\s*pnpm\s+(?:install|i)\b/i;
const YARN_INSTALL_CMD_RE = /^\s*yarn(?:\s+install\b|\s*$)/i;
const FROZEN_LOCKFILE_FLAG_RE = /(?:\s|^)--frozen-lockfile(?:\s|$|=true)/i;
const YARN_IMMUTABLE_FLAG_RE = /(?:\s|^)(?:--frozen-lockfile|--immutable)(?:\s|$|=true)/i;

function normalizePipPackageName(rawToken: string): string {
  const cleaned = rawToken.replace(/^["']|["']$/g, '').trim();
  const base = pickAt(cleaned.replace(/\[[^[\]\n]*\]/g, '').split(/[=<>!~@;]/), 0).trim();
  return base.toLowerCase().replace(/_/g, '-');
}

function extractPipPositionalPackages(pipSegment: string, match: RegExpExecArray): string[] {
  const tokens = pipSegment.slice(match.index + match[0].length).trim().split(/\s+/).filter(Boolean);
  const packages: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = pickAt(tokens, i).replace(/^["']|["']$/g, '');
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
  for (const segment of command.split(/(?:&&|\|\||;)/)) {
    const cleanSeg = stripLeadingRunOptions(segment);
    const match = PIP_INSTALL_CMD_RE.exec(cleanSeg);
    if (!match) continue;
    if (PIP_LOCKED_OR_EDITABLE_RE.test(cleanSeg)) continue;
    const pkgs = extractPipPositionalPackages(cleanSeg, match);
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

function hasExplicitNodePackageArg(trimmed: string): boolean {
  const tokens = trimmed.split(/\s+/).slice(2);
  return tokens.some((tok) => {
    const clean = tok.replace(/^["']|["']$/g, '');
    return (
      Boolean(clean) &&
      clean !== '.' &&
      !clean.startsWith('-') &&
      !clean.startsWith('./') &&
      !clean.startsWith('/')
    );
  });
}

function isUnfrozenNodeSegment(trimmed: string): boolean {
  if (!trimmed || /(?:\s|^)(?:-g|--global)(?:\s|$)/.test(trimmed)) return false;
  if (/^\s*npm\s+ci\b/i.test(trimmed)) return false;
  if (NPM_UNFROZEN_INSTALL_RE.test(trimmed)) return true;
  if (PNPM_INSTALL_CMD_RE.test(trimmed)) return !FROZEN_LOCKFILE_FLAG_RE.test(trimmed);
  if (YARN_INSTALL_CMD_RE.test(trimmed)) {
    return !YARN_IMMUTABLE_FLAG_RE.test(trimmed) && !NODE_PKG_ADD_RE.test(trimmed);
  }
  return NODE_PKG_ADD_RE.test(trimmed) && hasExplicitNodePackageArg(trimmed);
}

function hasHandwrittenNodeDeps(command: string): boolean {
  return command
    .split(/(?:&&|\|\||;)/)
    .some((segment) => isUnfrozenNodeSegment(stripLeadingRunOptions(segment)));
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

function inspectDockerfileLockFile(
  projectPath: string,
  rel: string,
  findings: SecurityFinding[]
): void {
  const absDocker = path.join(projectPath, rel);
  const content = readTextFileSafe(absDocker);
  if (!content) return;
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
}

function checkQaDockerLock01LockfileAndSmoke(
  projectPath: string,
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const predicate = options?.includeExamples ? isDockerfileOrExampleEntry : isDockerfileEntry;
  const dockerfiles = collectMatchingFiles(projectPath, predicate)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => !isTestFilePath(rel));
  const findings: SecurityFinding[] = [];

  for (const rel of dockerfiles) {
    inspectDockerfileLockFile(projectPath, rel, findings);
  }

  return findings;
}

interface PlaywrightDockerTag {
  dir: string;
  version: string;
}

function collectPlaywrightDockerTags(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): PlaywrightDockerTag[] {
  const includeExamples = options?.includeExamples ?? false;
  const composeRels = allRelFiles.filter((rel) => {
    const effective = normalizeExampleRelPath(rel, options);
    return (
      (includeExamples || !rel.endsWith('.example')) &&
      !isTestFilePath(effective) &&
      !isAuditorSelfDefinition(effective) &&
      /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(effective)
    );
  });
  const dockerPredicate = includeExamples ? isDockerfileOrExampleEntry : isDockerfileEntry;
  const dockerRels = collectMatchingFiles(projectPath, dockerPredicate)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => (includeExamples || !rel.endsWith('.example')) && !isTestFilePath(rel));
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
  return uniqueVersions.size === 1 ? pickAt(Array.from(uniqueVersions), 0) : null;
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

  const findings: SecurityFinding[] = [];
  for (const { pkgName, spec } of specs) {
    const isExact = EXACT_SEMVER_RE.test(spec);
    if (expectedVersion ? !isExact || spec !== expectedVersion : !isExact) {
      findings.push({
        rule_id: QA_PLAYWRIGHT_PIN_RULE,
        severity: 'HIGH',
        stig_owasp_ref: QA_PLAYWRIGHT_PIN_REF,
        file: relPath,
        line: findLineNumberContaining(content, `"${pkgName}"`),
        message: expectedVersion
          ? `La dependencia "${pkgName}": "${spec}" en ${relPath} no fija la versión exacta de mcr.microsoft.com/playwright:v${expectedVersion} (riesgo de desajuste en binarios Chromium).`
          : `La dependencia mutable "${pkgName}": "${spec}" en ${relPath} usa rango semver (^/~) sin fijación exacta de versión Playwright.`,
        remediation: expectedVersion
          ? `Fijar "${pkgName}": "${expectedVersion}" sin prefijos de rango (^, ~) alineado con mcr.microsoft.com/playwright:v${expectedVersion} (o eximir con "${QA_PLAYWRIGHT_PIN_OK_PRAGMA}").`
          : `Fijar "${pkgName}" a una versión semver exacta (X.Y.Z) sin prefijos de rango (^, ~) (o eximir con "${QA_PLAYWRIGHT_PIN_OK_PRAGMA}").`,
      });
    }
  }

  return findings;
}

function checkQaPlaywrightPin01VersionParity(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const dockerTags = collectPlaywrightDockerTags(projectPath, allRelFiles, options);
  if (dockerTags.length === 0) return [];

  const findings: SecurityFinding[] = [];
  for (const relPath of allRelFiles) {
    const norm = normalizeExampleRelPath(relPath, options).replace(/\\/g, '/');
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

interface SsrEngineScopeInput {
  readonly projectPath: string;
  readonly scopeAbsDir: string;
  readonly pkgContent: string;
  readonly scopeFiles: readonly string[];
  readonly extraFiles: readonly string[];
}

function hasSsrEngineForScope(input: SsrEngineScopeInput): boolean {
  const { projectPath, scopeAbsDir, pkgContent, scopeFiles, extraFiles } = input;
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

function isInsideUseEffectBlock(lines: readonly string[], idx: number): boolean {
  const start = Math.max(0, idx - 8);
  for (let j = idx; j >= start; j -= 1) {
    const trimmed = pickAt(lines, j).trim();
    if (trimmed.includes('useEffect(')) {
      return true;
    }
    if (/^return {0,4}\(/.test(trimmed)) {
      return false;
    }
  }
  return false;
}

function hasJsxConditionalMarkup(line: string): boolean {
  if (line.includes('&& <') || line.includes('&&<')) {
    return true;
  }
  if (!line.includes('{') || !line.includes('?')) {
    return false;
  }
  return line.includes('<') || line.includes(':');
}

function hasJsxPrehydrateConditionalLine(
  relPath: string,
  lines: readonly string[],
  idx: number
): boolean {
  if (!/\.(?:tsx|jsx)$/i.test(relPath)) {
    return false;
  }
  const line = pickAt(lines, idx);
  if (!JSX_PREHYDRATE_STATE_MARKERS.some((m) => line.includes(m))) {
    return false;
  }
  if (!hasJsxConditionalMarkup(line)) {
    return false;
  }
  return !isInsideUseEffectBlock(lines, idx);
}

function inspectPrehydrateLinesInFile(relPath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = content.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const prev = pickAt(lines, i - 1);
    if (line.includes(QA_SSR_HYDRATION_OK_PRAGMA) || prev.includes(QA_SSR_HYDRATION_OK_PRAGMA)) {
      continue;
    }
    const isVuePrehydrate = SSR_PREHYDRATE_V_IF_PATTERNS.some((re) => re.test(line));
    const isJsxPrehydrate = hasJsxPrehydrateConditionalLine(relPath, lines, i);
    if (isVuePrehydrate || isJsxPrehydrate) {
      findings.push({
        rule_id: QA_SSR_HYDRATION_RULE,
        severity: 'MEDIUM',
        stig_owasp_ref: QA_SSR_HYDRATION_REF,
        file: relPath,
        line: i + 1,
        message:
          'Componente SSR/SSG ramifica el DOM inicial (v-if o JSX condicional) según estado de cliente pre-hidratación (localStorage/dataset.theme/matchMedia), arriesgando Hydration Mismatch.',
        remediation: `Renderizar ambas ramas con CSS (display: none / hidden dark:block) y sincronizar el estado reactivo en onMounted/useEffect (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
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

interface PlaywrightHydrationInput {
  readonly projectPath: string;
  readonly scopeDir: string;
  readonly scopeFiles: readonly string[];
  readonly extraFiles: readonly string[];
  readonly allRelFiles: readonly string[];
  readonly seenConfigs: Set<string>;
}

function inspectPlaywrightHydrationContract(input: PlaywrightHydrationInput): SecurityFinding[] {
  const { projectPath, scopeDir, scopeFiles, extraFiles, allRelFiles, seenConfigs } = input;
  const scoped = [...scopeFiles, ...extraFiles];
  const { configs, usedRootFallback } = findPlaywrightScopeConfigs(scopeDir, scoped, allRelFiles);
  const primaryConfig = configs[0];
  if (!primaryConfig || seenConfigs.has(primaryConfig)) return [];
  seenConfigs.add(primaryConfig);

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
      file: primaryConfig,
      line: 1,
      message: buildMissingPlaywrightHydrationMessage(hasDual, hasGuard),
      remediation: `Añadir prueba Playwright con browser.newContext({ colorScheme: 'light' }) / emulateMedia cubriendo ambos esquemas y aserción sobre eventos console/pageerror para /hydration/i (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
    },
  ];
}

interface ScopeSsrHydrationInput {
  readonly projectPath: string;
  readonly pkgRel: string;
  readonly allRelFiles: readonly string[];
  readonly seenBranchFiles: Set<string>;
  readonly seenPwConfigs: Set<string>;
}

function inspectScopeSsrHydration(input: ScopeSsrHydrationInput): SecurityFinding[] {
  const { projectPath, pkgRel, allRelFiles, seenBranchFiles, seenPwConfigs } = input;
  const pkgContent = readTextFileSafe(path.join(projectPath, pkgRel));
  if (!pkgContent || pkgContent.includes(QA_SSR_HYDRATION_OK_PRAGMA)) return [];

  const scopeDir = path.posix.dirname(pkgRel.replace(/\\/g, '/'));
  const scopeAbsDir = scopeDir === '.' ? projectPath : path.join(projectPath, scopeDir);
  const scopeFiles = allRelFiles.filter((r) => isInScopeDir(r.replace(/\\/g, '/'), scopeDir));
  const extraFiles = collectMatchingFiles(scopeAbsDir, isSsrExtraEntry).map((abs) =>
    path.relative(projectPath, abs)
  );

  if (!hasSsrEngineForScope({ projectPath, scopeAbsDir, pkgContent, scopeFiles, extraFiles })) {
    return [];
  }
  if (!hasDualThemeMarkerForScope(projectPath, scopeFiles, extraFiles)) {
    return [];
  }

  return [
    ...inspectSsrPrehydrateBranching(projectPath, scopeFiles, seenBranchFiles),
    ...inspectPlaywrightHydrationContract({
      projectPath,
      scopeDir,
      scopeFiles,
      extraFiles,
      allRelFiles,
      seenConfigs: seenPwConfigs,
    }),
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
      ...inspectScopeSsrHydration({
        projectPath,
        pkgRel,
        allRelFiles,
        seenBranchFiles,
        seenPwConfigs,
      })
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
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura de pyproject/Makefile durante escaneo de proyecto
      reportDebugCatchError('security-auditor.checkQaMypy01StrictChain', err);
    }
  }

  return findings;
}

function checkQaKarateStaticIdempotency(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkSec12McpServiceRbac(relPath: string, lines: string[]): SecurityFinding[] {
  const normPath = relPath.replace(/\\/g, '/');
  const segments = normPath.toLowerCase().split('/');
  const fileName = segments.at(-1) ?? '';
  const isMcpOrRpcPy =
    fileName.endsWith('.py') &&
    (fileName.includes('mcp') ||
      fileName.includes('jsonrpc') ||
      segments
        .slice(0, -1)
        .some(
          (seg) =>
            seg === 'mcp' ||
            seg === 'jsonrpc' ||
            seg.startsWith('mcp_') ||
            (seg.startsWith('mcp-') && seg !== 'mcp-server') ||
            seg.startsWith('jsonrpc_') ||
            seg.startsWith('jsonrpc-')
        ));
  if (!isMcpOrRpcPy) return [];
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
      line: Math.max(1, lineIdx + 1),
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

function checkQaCov01AddoptsBypass(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkQaPg17RlsInvalidCatalog(relPath: string, lines: string[]): SecurityFinding[] {
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

function checkQaSmoke01SettingsSingletonSync(relPath: string, lines: string[]): SecurityFinding[] {
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
  for (const [i, line] of lines.entries()) {
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
  if (/\.(?:ts|js|mjs)$/i.test(relPath)) {
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
    const cur = pickAt(lines, idx);
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
    const line = pickAt(lines, i);
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
    chunk += pickAt(text, idx);
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
  let i = 0;
  while (i < text.length) {
    const ch = pickAt(text, i);
    const sepLen = shellSeparatorLength(text, i);
    if (ch === "'" || ch === '"') {
      const span = readQuotedSpan(text, i, ch);
      current += span.chunk;
      i = span.endIdx + 1;
    } else if (sepLen > 0) {
      current = pushTokenAndReset(tokens, current, ';');
      i += sepLen;
    } else if (/\s/.test(ch)) {
      current = pushTokenAndReset(tokens, current);
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  pushTokenAndReset(tokens, current);
  return tokens;
}

function advanceComposeSubcommand(tokens: string[], afterComposeIdx: number): number {
  let idx = afterComposeIdx;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = pickAt(tokens, idx);
    if (!tok.startsWith('-')) return idx;
    idx += COMPOSE_VALUE_FLAGS.has(tok) ? 2 : 1;
  }
  return -1;
}

function checkRunFlagsMissingNoTty(tokens: string[], runIdx: number): boolean {
  let idx = runIdx + 1;
  let hasNoTty = false;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = pickAt(tokens, idx);
    if (!tok.startsWith('-')) break;
    const isShortNoTty = !tok.startsWith('--') && tok.includes('T');
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
  for (const [i, raw] of lines.entries()) {
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
  const firstPart = pickAt(parts, 0);
  const secondPart = pickAt(parts, 1);
  const thirdPart = pickAt(parts, 2);
  if (parts.length === 2 && firstPart === 'workflows' && secondPart.length > 0) {
    return true;
  }
  return (
    parts.length === 3 &&
    firstPart === 'actions' &&
    secondPart.length > 0 &&
    (thirdPart === 'action.yml' || thirdPart === 'action.yaml')
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

function stripInlineYamlComment(rawRest: string): string {
  for (let i = 1; i < rawRest.length; i++) {
    if (rawRest[i] === '#' && /\s/.test(pickAt(rawRest, i - 1))) {
      return rawRest.slice(0, i).trim();
    }
  }
  return rawRest;
}

function extractThirdPartyActionTarget(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const isSeqItem = trimmed.startsWith('-') && /\s/.test(pickAt(trimmed, 1));
  const candidate = isSeqItem ? trimmed.slice(1).trimStart() : trimmed;
  if (!candidate.startsWith('uses')) return null;
  const afterUses = candidate.slice(4).trimStart();
  if (!afterUses.startsWith(':')) return null;
  const rawRest = afterUses.slice(1).trim();
  const withoutComment = stripInlineYamlComment(rawRest);
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
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
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
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
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
  const fileName = pickAt(parts, parts.length - 1);
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
    const idx = match.index;
    if (countPrecedingDollars(line, idx) % 2 === 0) {
      return true;
    }
  }
  return false;
}

function isStrykerConfigPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return /(?:^|\/)stryker\.conf(?:ig)?\.(?:json|js|mjs|cjs)$/i.test(norm);
}

function hasStrykerIgnoreStaticTrue(
  doc: Record<string, unknown> | null,
  fullText: string
): boolean {
  if (doc) {
    return doc.ignoreStatic === true;
  }
  return /["']?ignoreStatic["']?\s{0,4}:\s{0,4}true\b/.test(fullText);
}

function hasBoundedStrykerConcurrency(
  doc: Record<string, unknown> | null,
  fullText: string
): boolean {
  if (doc) {
    return typeof doc.concurrency === 'number' && doc.concurrency >= 1 && doc.concurrency <= 4;
  }
  if (/CPUS|nproc|STRYKER_CONCURRENCY/i.test(fullText)) {
    return true;
  }
  const match = /\bconcurrency\s{0,4}:\s{0,4}(\d+)/.exec(fullText);
  return match ? Number(match[1]) >= 1 && Number(match[1]) <= 4 : false;
}

function hasStrykerNegatedTestGlob(patterns: readonly unknown[]): boolean {
  return patterns.some(
    (entry) =>
      typeof entry === 'string' &&
      entry.startsWith('!') &&
      (entry.includes('unit') || entry.includes('spec') || entry.includes('test'))
  );
}

function hasStrykerTestExclusions(doc: Record<string, unknown> | null, fullText: string): boolean {
  if (doc) {
    return !Array.isArray(doc.mutate) || hasStrykerNegatedTestGlob(doc.mutate);
  }
  const mutateIdx = fullText.indexOf('mutate');
  if (mutateIdx === -1) {
    return true;
  }
  const slice = fullText.slice(mutateIdx);
  return slice.includes('!') && (slice.includes('unit') || slice.includes('spec') || slice.includes('test'));
}

function checkQaStrykerCfg01(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isStrykerConfigPath(relPath) || isTestFilePath(relPath)) {
    return [];
  }
  const fullText = lines.join('\n');
  if (fullText.includes(QA_STRYKER_CFG_OK_PRAGMA)) {
    return [];
  }
  const doc = relPath.endsWith('.json') ? parseJsonObjectTextSafe(fullText) : null;
  const gaps: string[] = [];
  if (!hasStrykerIgnoreStaticTrue(doc, fullText)) {
    gaps.push('"ignoreStatic": true');
  }
  if (!hasBoundedStrykerConcurrency(doc, fullText)) {
    gaps.push('"concurrency" acotado (<= 4)');
  }
  if (!hasStrykerTestExclusions(doc, fullText)) {
    gaps.push('exclusión "!src/**/*.{unit,spec,test}.*" en "mutate"');
  }
  if (gaps.length === 0) {
    return [];
  }
  return [
    {
      rule_id: QA_STRYKER_CFG_RULE,
      severity: 'MEDIUM',
      stig_owasp_ref: QA_STRYKER_CFG_REF,
      file: relPath,
      line: 1,
      message: `Configuración Stryker omite estabilidad en contenedores: falta ${gaps.join(' y ')}.`,
      remediation: `Establecer "ignoreStatic": true, "concurrency": 4 (o <= 4) y exclusión "!src/**/*.{unit,spec,test}.*" en mutate (o eximir con ${QA_STRYKER_CFG_OK_PRAGMA}).`,
    },
  ];
}

const PUBSUB_SINK_SUBSTRINGS = [
  'pubsub.subscribe(',
  'pubsub.psubscribe(',
  '.psubscribe(',
  'ws_manager.broadcast(',
  'manager.broadcast(',
  'broadcast_all(',
  '.clients.forEach(',
];

function isPubSubBroadcastLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return false;
  }
  return PUBSUB_SINK_SUBSTRINGS.some((needle) => trimmed.includes(needle));
}

function hasTenantScopeInWindow(lines: readonly string[], centerIdx: number): boolean {
  const start = Math.max(0, centerIdx - 12);
  const end = Math.min(lines.length, centerIdx + 25);
  const windowText = lines.slice(start, end).join('\n');
  return WS_PUBSUB_TENANT_MARKERS.some((marker) => windowText.includes(marker));
}

function findFirstSubstringLine(lines: readonly string[], needle: string): number {
  const idx = lines.findIndex((ln) => ln.includes(needle));
  return idx + 1;
}

function hasFinallyPubsubClose(fullText: string): boolean {
  const finallyIdx = fullText.indexOf('finally:');
  if (finallyIdx === -1) {
    return false;
  }
  const tail = fullText.slice(finallyIdx);
  return tail.includes('.aclose(') || tail.includes('.close(');
}

function checkPythonWsPubsubFinallyLeak(
  relPath: string,
  lines: readonly string[]
): SecurityFinding[] {
  if (!relPath.toLowerCase().endsWith('.py')) {
    return [];
  }
  const fullText = lines.join('\n');
  if (fullText.includes(SEC_WS_PUBSUB_OK_PRAGMA)) {
    return [];
  }
  if (!fullText.includes('WebSocket') || !fullText.includes('.pubsub(') || hasFinallyPubsubClose(fullText)) {
    return [];
  }
  return [
    {
      rule_id: SEC_WS_PUBSUB_RULE,
      severity: 'HIGH',
      stig_owasp_ref: SEC_WS_PUBSUB_REF,
      file: relPath,
      line: findFirstSubstringLine(lines, '.pubsub('),
      message:
        'Endpoint WebSocket + Redis/KeyDB .pubsub() sin cierre garantizado pubsub.aclose()/close() dentro de try/finally (riesgo de fuga del pool en suites E2E secuenciales).',
      remediation: `Ejecutar watcher ws.receive() desacoplado y garantizar await pubsub.aclose() dentro de finally: (o eximir con ${SEC_WS_PUBSUB_OK_PRAGMA}).`,
    },
  ];
}

function checkSecWsPubsub01(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    !/\.(?:py|ts|js|php)$/i.test(relPath)
  ) {
    return [];
  }
  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
    if (isLineCommentOrPragmaExempt(line, prevLine, SEC_WS_PUBSUB_OK_PRAGMA)) {
      continue;
    }
    if (!isPubSubBroadcastLine(line) || hasTenantScopeInWindow(lines, i)) {
      continue;
    }
    findings.push({
      rule_id: SEC_WS_PUBSUB_RULE,
      severity: 'HIGH',
      stig_owasp_ref: SEC_WS_PUBSUB_REF,
      file: relPath,
      line: i + 1,
      message:
        'Difusión WebSocket o suscripción Pub/Sub Redis/KeyDB sin validación ni prefijo de aislamiento multi-tenant (tenant_id/org_id), con riesgo de fuga cross-tenant.',
      remediation: `Prefijar canales con identificador de tenant (ej. f"ws:{tenant_id}:events") y verificar tenant_id/org_id por socket antes de reenviar mensajes (o eximir con ${SEC_WS_PUBSUB_OK_PRAGMA}).`,
    });
  }
  findings.push(...checkPythonWsPubsubFinallyLeak(relPath, lines));
  return findings;
}

function checkQaMakeCurdir01SubMakefile(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isSubdirectoryMakefile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(QA_MAKE_CURDIR_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
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

function scanSingleFile(
  absPath: string,
  relPath: string,
  options?: AuditSecurityOptions
): SecurityFinding[] {
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err: unknown) {
    // Archivo inaccesible o enlace simbólico roto durante recorrido del proyecto; omitir solo ese archivo
    reportDebugCatchError('security-auditor.scanSingleFile', err);
    return [];
  }

  const lines = content.split(/\r?\n/);
  const effectiveRel = normalizeExampleRelPath(relPath, options);
  const rawFindings = [
    ...checkSec01MassAssignment(effectiveRel, lines),
    ...checkSec02AntiCswsh(effectiveRel, lines),
    ...checkSec03CommandAndDeserialization(effectiveRel, lines),
    ...checkSec04Xxe(effectiveRel, lines),
    ...checkSec05UnicodeNfkc(effectiveRel, lines),
    ...checkSec06XssPrototypePollution(effectiveRel, lines),
    ...checkSec07SwaggerInProd(effectiveRel, lines),
    ...checkSec10Secrets(effectiveRel, lines),
    ...checkSec11AuditSemanticIntegrity(effectiveRel, lines),
    ...checkSec12McpServiceRbac(effectiveRel, lines),
    ...checkSec13RlsMultiTxPersistence(effectiveRel, lines),
    ...checkSec14WormDeterministicChain(effectiveRel, lines),
    ...checkSec15EphemeralProdPipelineCreds(effectiveRel, lines),
    ...checkSec16PreAuthMultiStepContinuity(effectiveRel, lines),
    ...checkSecCiActionRef(effectiveRel, lines),
    ...checkQaCiEscape01WorkflowExpansion(effectiveRel, lines),
    ...checkQaMakeCurdir01SubMakefile(effectiveRel, lines),
    ...checkQaCov01AddoptsBypass(effectiveRel, lines),
    ...checkQaPg17RlsInvalidCatalog(effectiveRel, lines),
    ...checkQaSmoke01SettingsSingletonSync(effectiveRel, lines),
    ...checkQaHealth01SupervisorTaskExit(effectiveRel, lines),
    ...checkQaCliTty01InteractiveHangGuard(effectiveRel, lines),
    ...checkQaDockerTty01NonInteractiveAndReadOnly(effectiveRel, lines),
    ...checkQaKarateStaticIdempotency(effectiveRel, lines),
    ...checkUi11x01VisualGeometry(effectiveRel, lines),
    ...checkUi11x02DualRefreshAndSemanticElse(effectiveRel, lines),
    ...checkQaStrykerCfg01(effectiveRel, lines),
    ...checkSecWsPubsub01(effectiveRel, lines),
  ];
  return effectiveRel === relPath
    ? rawFindings
    : rawFindings.map((finding) =>
        finding.file === effectiveRel ? { ...finding, file: relPath } : finding
      );
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

export interface AuditSecurityOptions {
  maxFindings?: number;
  includeExamples?: boolean;
}

const SEVERITY_SORT_RANK: Readonly<Record<SecurityFinding['severity'], number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function sortFindingsBySeverity(findings: SecurityFinding[]): SecurityFinding[] {
  return [...findings].sort((a, b) => SEVERITY_SORT_RANK[a.severity] - SEVERITY_SORT_RANK[b.severity]);
}

/**
 * Tool 5: audit_security_stig_owasp
 * Audita estáticamente el código fuente frente a los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
 */
export async function auditSecurityStigOwasp(
  projectPath: string,
  maxFindingsOrOptions?: number | AuditSecurityOptions,
  extraOptions?: Omit<AuditSecurityOptions, 'maxFindings'>
): Promise<SecurityAuditResult> {
  const maxFindings =
    typeof maxFindingsOrOptions === 'number'
      ? maxFindingsOrOptions
      : maxFindingsOrOptions?.maxFindings;
  const includeExamples =
    (typeof maxFindingsOrOptions === 'object' ? maxFindingsOrOptions?.includeExamples : undefined) ??
    extraOptions?.includeExamples ??
    false;

  return Promise.resolve().then(() => {
    const resolvedPath = resolveSafeProjectPath(projectPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error(`La ruta del proyecto no existe o no es un directorio: ${resolvedPath}`);
    }
    const auditOptions: AuditSecurityOptions = { includeExamples };
    const allAbsoluteFiles = collectFiles(resolvedPath, auditOptions);
    const allRelFiles = allAbsoluteFiles.map((abs) => path.relative(resolvedPath, abs));
    const rawFindings: SecurityFinding[] = [];

    for (const [i, absPath] of allAbsoluteFiles.entries()) {
      rawFindings.push(...scanSingleFile(absPath, pickAt(allRelFiles, i), auditOptions));
    }

    rawFindings.push(...checkProjectLevelRules(resolvedPath, allRelFiles, auditOptions));
    const findings = sortFindingsBySeverity(rawFindings);

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
  });
}
