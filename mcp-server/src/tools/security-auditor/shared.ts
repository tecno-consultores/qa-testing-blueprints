// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pickAt, reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../../utils/ignoredDirs.js';

export interface AuditSecurityOptions {
  maxFindings?: number;
  includeExamples?: boolean;
  ingestExternalSarif?: boolean;
}

export const IGNORED_DIRS = CANONICAL_IGNORED_DIRS;

export const WEBMANIFEST_EXT = '.webmanifest';

export const SCANNABLE_EXTS = new Set([
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

export const APSC_DV_002510_REF = 'APSC-DV-002510 / Patrón 3';
export const SEC_10_REF = 'APSC-DV-000650 / V-222444 / Patrón 10';
export const SEC_11_REF = 'APSC-DV-001350 / Anti-Silo Audit Rule 3';
export const SEC_16_REF = 'CWE-352 / CWE-362 / APSC-DV-000530 / Anti-Silo Rule 8';
export const QA_HEALTH_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 9';
export const QA_HEALTH_OK_PRAGMA = '# qa-health-ok';
export const QA_CLI_TTY_01_REF = 'APSC-DV-002310 / Standard 11X Anti-Silo Rule 10';
export const QA_TTY_OK_PRAGMA = 'qa-tty-ok';
export const QA_DOCKER_TTY_01_RULE = 'QA-DOCKER-TTY-01';
export const QA_DOCKER_TTY_01_REF =
  'APSC-DV-002310 / Rule Zero Non-Interactive CI & Read-Only Container Contract';
export const QA_DOCKER_TTY_OK_PRAGMA = 'qa-docker-tty-ok';
export const QA_DOCKER_TTY_NO_TTY_REMEDIATION =
  'Agregar -T (--no-TTY) a docker compose run en pipelines CI=true y scripts de despliegue/CI para impedir la asignación de pseudo-TTY (NoDefaultValueProvided).';
export const QA_DOCKER_TTY_WRANGLER_REMEDIATION =
  'Precrear /app/.wrangler en el Dockerfile, montarlo como tmpfs con mode=1777,noexec,nosuid,nodev y pasar --force en wrangler pages project create y wrangler pages deploy.';
export const QA_DOCKER_LOOP_01_RULE = 'QA-DOCKER-LOOP-01';
export const QA_DOCKER_LOOP_01_REF =
  'APSC-DV-002310 / Rule Zero Anti-CrashLoop, Serialized Docker & Resource Containment';
export const QA_DOCKER_LOOP_OK_PRAGMA = 'qa-docker-loop-ok';
export const QA_DOCKER_LOOP_COMPOSE_REMEDIATION =
  'Usar restart: "no" (u omitirlo) en archivos docker-compose.qa*.yml / test*.yml / deploy*.yml (o restart: "on-failure:3" acotado en despliegues), evitando CrashLoops infinitos que saturan CPU/RAM/NetworkManager (o eximir con # qa-docker-loop-ok).';
export const QA_DOCKER_LOOP_SCRIPT_REMEDIATION =
  'Añadir --rm y --restart=no a docker run, --wait-timeout 60 a docker compose up --wait, COMPOSE_PARALLEL_LIMIT=1 (o build secuencial) en builds multi-servicio, y desmontar docker-compose.qa.yml en trap EXIT INT TERM (o eximir con # qa-docker-loop-ok).';
export const COMPOSE_VALUE_FLAGS = new Set([
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
export const COMPOSE_RUN_VALUE_FLAGS = new Set([
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
export const UI_11X_02_REF = 'Standard 11X / Anti-Silo UI Rule 3 & 4';
export const SEC_CI_ACTION_REF_REF = 'DISA STIG V-222513 / APSC-DV-001430 / Supply Chain Pinning';
export const SEC_CI_ACTION_OK_PRAGMA = 'sec-ci-action-ref-ok';
export const SEC_CI_ACTION_REMEDIATION =
  'Fijar la acción mediante el hash SHA-1 completo de 40 caracteres del commit anotado (uses: owner/repo@<sha40> # vX.Y.Z) y verificar que el tag exista en remoto con git ls-remote --tags.';
export const SHA40_RE = /^[0-9a-f]{40}$/;
export const MUTABLE_BRANCH_RE = /^(?:main|master|head|develop|latest)$/i;
export const UNPREFIXED_SEMVER_RE = /^\d+\.\d+/;
export const QA_CI_ESCAPE_01_REF = 'APSC-DV-002510 / Rule Zero GitHub Actions vs Makefile Shell Expansion';
export const QA_CI_ESCAPE_OK_PRAGMA = 'qa-ci-escape-ok';
export const QA_CI_ESCAPE_REMEDIATION =
  'Reemplazar $$(...) o $${...} por sustitución simple $(...) / ${...} en bloques run: de GitHub Actions (donde bash expande $$ al PID numérico del proceso), o añadir # qa-ci-escape-ok si se genera un Makefile/Compose literal.';
export const QA_MAKE_CURDIR_01_REF = 'APSC-DV-002310 / Rule Zero Sub-Makefile CURDIR Volume Boundary';
export const QA_MAKE_CURDIR_OK_PRAGMA = 'qa-make-curdir-ok';
export const QA_MAKE_CURDIR_REMEDIATION =
  'Reemplazar $(PWD) / ${PWD} por $(CURDIR) en sub-Makefiles invocables con $(MAKE) -C <subdir> (ej. HOST_PWD ?= $(CURDIR)) para evitar montar el directorio padre.';
export const DOUBLE_DOLLAR_CI_RE = /\$\$[({][A-Za-z_]/;
export const MAKE_PWD_VAR_RE = /\$\(PWD\)|\$\{PWD\}/g;
export const MAKEFILE_NAMES = new Set(['Makefile', 'Makefile.example', 'GNUmakefile']);
export const QA_CONTRACT_SDK_01_RULE = 'QA-CONTRACT-SDK-01';
export const QA_CONTRACT_SDK_01_REF = 'Standard 11X UAT Rule #11 / Real-Runtime Protocol SDK Contract';
export const QA_CONTRACT_SDK_OK_PRAGMA = 'qa-contract-sdk-ok';
export const QA_CONTRACT_SDK_REMEDIATION =
  'Añadir al menos un test in-process usando el cliente/transporte real del SDK (InMemoryTransport + Client en TS o ClientSession / create_connected_server_and_client_session en Python) ejecutando list_tools y call_tool sin mockear el dispatcher.';
export const QA_DOCKER_LOCK_01_RULE = 'QA-DOCKER-LOCK-01';
export const QA_DOCKER_LOCK_01_REF = 'DISA APSC-DV-001430 / Standard 11X Lockfile & Container Smoke Parity';
export const QA_DOCKER_LOCK_OK_PRAGMA = 'qa-docker-lock-ok';
export const QA_DOCKER_LOCK_REMEDIATION =
  'Instalar dependencias en Dockerfile exclusivamente desde el lockfile (uv sync --frozen --no-dev, uv export --frozen --no-dev | uv pip install --system -r -, pnpm install --frozen-lockfile o npm ci) y ejecutar smoke test post-build sobre la imagen (import <app>, id -u != 0 y sonda 401 sin token).';
export const QA_PLAYWRIGHT_PIN_RULE = 'QA-PLAYWRIGHT-PIN-01';
export const QA_PLAYWRIGHT_PIN_REF = 'DISA STIG APSC-DV-001430 / Standard 11X Playwright Parity';
export const QA_PLAYWRIGHT_PIN_OK_PRAGMA = 'qa-playwright-pin-ok';
export const PLAYWRIGHT_PKGS = ['@playwright/test', 'playwright'] as const;
export const PKG_DEP_SECTIONS = ['dependencies', 'devDependencies'] as const;
export const PLAYWRIGHT_IMAGE_TAG_RE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)\b/g;
export const EXACT_SEMVER_RE = /^\d+\.\d+\.\d+$/;
export const QA_SSR_HYDRATION_RULE = 'QA-SSR-HYDRATION-01';
export const QA_SSR_HYDRATION_REF = 'Standard 11X Layer 8 E2E / SSR Dual-ColorScheme Hydration Parity';
export const QA_SSR_HYDRATION_OK_PRAGMA = 'qa-ssr-hydration-ok';
export const SSR_NPM_DEPS = new Set([
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
export const SSR_CONFIG_NAME_RE =
  /(?:^|\/)(?:nuxt|astro|next)\.config\.(?:ts|js|mjs|cjs|mts)$|(?:^|\/)\.vitepress\/config\.(?:ts|js|mjs|mts)$/i;
export const SSR_THEME_MARKERS = [
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
export const SSR_PREHYDRATE_V_IF_PATTERNS: readonly RegExp[] = [
  /\bv-(?:else-)?if\s*=\s*"[^"\n]*(?:localStorage|dataset\.theme|document\.documentElement)/,
  /\bv-(?:else-)?if\s*=\s*'[^'\n]*(?:localStorage|dataset\.theme|document\.documentElement)/,
];
export const JSX_PREHYDRATE_STATE_MARKERS = [
  'localStorage',
  'sessionStorage',
  'document.documentElement.dataset',
  'dataset.theme',
  'matchMedia',
  "typeof window !== 'undefined'",
  'typeof window !== "undefined"',
];
export const QA_STRYKER_CFG_RULE = 'QA-STRYKER-CFG-01';
export const QA_STRYKER_CFG_REF =
  'Standard 11X Layer 5 Mutation Testing / Stryker Container Stability Contract';
export const QA_STRYKER_CFG_OK_PRAGMA = 'qa-stryker-cfg-ok';
export const SEC_WS_PUBSUB_RULE = 'SEC-WS-PUBSUB-01';
export const SEC_WS_PUBSUB_REF =
  'OWASP API3:2023 / API4:2023 / DISA STIG APSC-DV-000460 (Multi-Tenant Real-Time Isolation)';
export const SEC_WS_PUBSUB_OK_PRAGMA = 'sec-ws-pubsub-ok';
export const WS_PUBSUB_TENANT_MARKERS = [
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
export const PLAYWRIGHT_CONFIG_RE = /(?:^|\/)playwright\.config\.(?:ts|js|mjs|mts)$/i;
export const E2E_TEST_FILE_RE = /(?:(?:^|\/)(?:e2e|tests\/e2e)\/)|(?:\.(?:e2e|spec)\.(?:ts|tsx|js|jsx|mjs)$)/i;
export const HYDRATION_LISTENER_RE = /\bon\(\s*['"](?:console|pageerror)['"]/;
export const PROBE_ASSERTION_MARKERS = [
  '.exists()',
  'os.path.exists',
  '.is_file()',
  '.read_text(',
  'existsSync(',
  'statSync(',
];
export const PY_MOCK_PATCH_MARKERS = ['patch(', 'patch.object(', 'monkeypatch'];
export const BOOTSTRAP_PY_PACKAGES = new Set([
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
export const PIP_VALUE_FLAGS = new Set([
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

export function stripExampleSuffix(name: string): string {
  return name.endsWith('.example') ? name.slice(0, -'.example'.length) : name;
}

export function hasScannableBasename(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return (
    SCANNABLE_EXTS.has(ext) ||
    name === '.npmrc' ||
    name === '_headers' ||
    name === '_redirects' ||
    (name.startsWith('.env') && !isEnvTemplatePath(name)) ||
    MAKEFILE_NAMES.has(name)
  );
}

const ENV_TEMPLATE_SUFFIXES = ['.example', '.sample', '.template'] as const;
const ENV_TEMPLATE_MIDDLE_RE = /^[a-z0-9_-]+$/i;
const TRUSTED_GIT_PATHS = ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git', '/bin/git'] as const;

export function isEnvTemplatePath(relPath: string): boolean {
  const base = path.basename(relPath).toLowerCase();
  const suffix = ENV_TEMPLATE_SUFFIXES.find((s) => base.endsWith(s));
  if (!suffix) return false;
  const stem = base.slice(0, -suffix.length);
  if (stem === '.env' || stem === 'env') return true;
  if (stem.startsWith('.env.')) return ENV_TEMPLATE_MIDDLE_RE.test(stem.slice(5));
  if (stem.startsWith('env.')) return ENV_TEMPLATE_MIDDLE_RE.test(stem.slice(4));
  return false;
}

export function isLiveEnvBasename(name: string): boolean {
  return (name === '.env' || name.startsWith('.env.')) && !isEnvTemplatePath(name);
}

export function isScannableFile(entry: fs.Dirent): boolean {
  return entry.isFile() && hasScannableBasename(entry.name);
}

export function isScannableFileOrExample(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  if (hasScannableBasename(entry.name)) return true;
  return entry.name.endsWith('.example') && hasScannableBasename(stripExampleSuffix(entry.name));
}

export function hasDockerfileBasename(name: string): boolean {
  return name === 'Dockerfile' || /^Dockerfile\.[A-Za-z0-9_.-]+$/.test(name);
}

export function isDockerfileEntry(entry: fs.Dirent): boolean {
  return entry.isFile() && !entry.name.endsWith('.example') && hasDockerfileBasename(entry.name);
}

export function isDockerfileOrExampleEntry(entry: fs.Dirent): boolean {
  return entry.isFile() && hasDockerfileBasename(stripExampleSuffix(entry.name));
}

export function normalizeExampleRelPath(relPath: string, options?: AuditSecurityOptions): string {
  if (!options?.includeExamples || !relPath.endsWith('.example') || isEnvTemplatePath(relPath)) {
    return relPath;
  }
  return stripExampleSuffix(relPath);
}

function trimUnescapedEndBlanks(text: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === ' ') {
    if (text.charAt(end - 2) === '\\') break;
    end -= 1;
  }
  return text.slice(0, end);
}

export function normalizeGitignoreLine(rawLine: string): string {
  if (!rawLine || rawLine.startsWith('#')) return '';
  const trimmed = trimUnescapedEndBlanks(rawLine);
  return trimmed.replace(/^\\#/, '#');
}

function readGitignoreLines(dirPath: string): string[] {
  const giPath = path.join(dirPath, '.gitignore');
  try {
    if (!fs.existsSync(giPath) || fs.lstatSync(giPath).isSymbolicLink()) return [];
    return fs
      .readFileSync(giPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => normalizeGitignoreLine(line))
      .filter((line) => line.length > 0);
  } catch (err: unknown) {
    reportDebugCatchError('security-auditor.readGitignoreLines', err);
    return [];
  }
}

interface CharClassSpec {
  readonly neg: boolean;
  readonly chars: ReadonlySet<string>;
  readonly ranges: readonly (readonly [number, number])[];
}

type FixedAtom =
  | { readonly kind: 'any' }
  | { readonly kind: 'lit'; readonly ch: string }
  | { readonly kind: 'cls'; readonly spec: CharClassSpec };

function inCodePointRanges(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function matchCharClass(ch: string, spec: CharClassSpec): boolean {
  const hit = spec.chars.has(ch) || inCodePointRanges(Number(ch.codePointAt(0)), spec.ranges);
  return spec.neg ? !hit : hit;
}

function matchFixedAtom(ch: string, atom: FixedAtom): boolean {
  if (atom.kind === 'any') return true;
  if (atom.kind === 'lit') return ch === atom.ch;
  return matchCharClass(ch, atom.spec);
}

function findClassEnd(chars: readonly string[], bodyStart: number): number {
  let i = bodyStart;
  while (i < chars.length) {
    const ch = pickAt(chars, i);
    if (ch === '\\') i += 2;
    else if (ch === ']' && i > bodyStart) return i;
    else i += 1;
  }
  return -1;
}

function readClassMember(
  chars: readonly string[],
  idx: number,
  end: number
): { ch: string; next: number } {
  const raw = pickAt(chars, idx);
  if (raw === '\\' && idx + 1 < end) {
    return { ch: pickAt(chars, idx + 1), next: idx + 2 };
  }
  return { ch: raw, next: idx + 1 };
}

function parseCharClassBody(
  chars: readonly string[],
  start: number,
  end: number,
  neg: boolean
): CharClassSpec {
  const set = new Set<string>();
  const ranges: Array<readonly [number, number]> = [];
  let idx = start;
  while (idx < end) {
    const first = readClassMember(chars, idx, end);
    if (first.next + 1 < end && pickAt(chars, first.next) === '-') {
      const second = readClassMember(chars, first.next + 1, end);
      ranges.push([Number(first.ch.codePointAt(0)), Number(second.ch.codePointAt(0))]);
      idx = second.next;
    } else {
      set.add(first.ch);
      idx = first.next;
    }
  }
  return { neg, chars: set, ranges };
}

function tryParseCharClass(
  chars: readonly string[],
  openIdx: number
): { atom: FixedAtom; next: number } {
  const lead = pickAt(chars, openIdx + 1);
  const neg = lead === '!' || lead === '^';
  const bodyStart = openIdx + (neg ? 2 : 1);
  const end = findClassEnd(chars, bodyStart);
  if (end === -1) return { atom: { kind: 'lit', ch: '[' }, next: openIdx + 1 };
  return {
    atom: { kind: 'cls', spec: parseCharClassBody(chars, bodyStart, end, neg) },
    next: end + 1,
  };
}

function readSingleFixedAtom(
  chars: readonly string[],
  idx: number
): { atom: FixedAtom; next: number } {
  const ch = pickAt(chars, idx);
  if (ch === '\\' && idx + 1 < chars.length) {
    return { atom: { kind: 'lit', ch: pickAt(chars, idx + 1) }, next: idx + 2 };
  }
  if (ch === '?') return { atom: { kind: 'any' }, next: idx + 1 };
  if (ch === '[') return tryParseCharClass(chars, idx);
  return { atom: { kind: 'lit', ch }, next: idx + 1 };
}

function tokenizeWildcardSegment(pat: string): {
  readonly first: readonly FixedAtom[];
  readonly middle: readonly (readonly FixedAtom[])[];
  readonly last: readonly FixedAtom[] | null;
} {
  const chars = Array.from(pat);
  const first: FixedAtom[] = [];
  const middle: FixedAtom[][] = [];
  let last: FixedAtom[] | null = null;
  let current = first;
  let idx = 0;
  while (idx < chars.length) {
    if (pickAt(chars, idx) === '*') {
      if (last !== null) middle.push(last);
      last = [];
      current = last;
      idx += 1;
    } else {
      const step = readSingleFixedAtom(chars, idx);
      current.push(step.atom);
      idx = step.next;
    }
  }
  return { first, middle, last };
}

function matchFixedTokenAt(
  tChars: readonly string[],
  token: readonly FixedAtom[],
  offset: number
): boolean {
  for (const [i, atom] of token.entries()) {
    if (!matchFixedAtom(pickAt(tChars, offset + i), atom)) return false;
  }
  return true;
}

function findFixedWildcardToken(
  tChars: readonly string[],
  token: readonly FixedAtom[],
  fromPos: number,
  endLimit: number
): number {
  for (let pos = fromPos; pos + token.length <= endLimit; pos++) {
    if (matchFixedTokenAt(tChars, token, pos)) return pos;
  }
  return -1;
}

function matchMiddleWildcardParts(
  tChars: readonly string[],
  middle: readonly (readonly FixedAtom[])[],
  startPos: number,
  endLimit: number
): boolean {
  let pos = startPos;
  for (const token of middle) {
    const found = findFixedWildcardToken(tChars, token, pos, endLimit);
    if (found === -1) return false;
    pos = found + token.length;
  }
  return true;
}

function matchWildcardEndpoints(
  tChars: readonly string[],
  first: readonly FixedAtom[],
  last: readonly FixedAtom[],
  endLimit: number
): boolean {
  if (first.length > endLimit) return false;
  if (!matchFixedTokenAt(tChars, first, 0)) return false;
  return matchFixedTokenAt(tChars, last, endLimit);
}

export function wildcardSegmentMatch(text: string, pat: string): boolean {
  if (text.includes('/')) return false;
  const tChars = Array.from(text);
  const { first, middle, last } = tokenizeWildcardSegment(pat);
  if (last === null) {
    return tChars.length === first.length && matchFixedTokenAt(tChars, first, 0);
  }
  const endLimit = tChars.length - last.length;
  if (!matchWildcardEndpoints(tChars, first, last, endLimit)) return false;
  return matchMiddleWildcardParts(tChars, middle, first.length, endLimit);
}

function matchDoubleStarTail(relSegs: readonly string[], patSegs: readonly string[]): boolean {
  if (matchAnchoredSegments(relSegs, patSegs.slice(1))) return true;
  return relSegs.length > 0 && matchAnchoredSegments(relSegs.slice(1), patSegs);
}

function matchAnchoredSegments(relSegs: readonly string[], patSegs: readonly string[]): boolean {
  if (patSegs.length === 0) return relSegs.length === 0;
  const head = pickAt(patSegs, 0);
  if (head === '**') return matchDoubleStarTail(relSegs, patSegs);
  if (relSegs.length === 0) return false;
  return (
    wildcardSegmentMatch(pickAt(relSegs, 0), head) &&
    matchAnchoredSegments(relSegs.slice(1), patSegs.slice(1))
  );
}

function splitAnchoredPattern(cleaned: string): string[] | null {
  if (cleaned.startsWith('/')) return cleaned.slice(1).split('/');
  if (cleaned.includes('/')) return cleaned.split('/');
  return null;
}

function matchDirectoryIgnorePattern(dirSegs: readonly string[], cleaned: string): boolean {
  if (dirSegs.length === 0) return false;
  const anchored = splitAnchoredPattern(cleaned);
  if (anchored) return matchAnchoredSegments(dirSegs, [...anchored, '**']);
  return dirSegs.some((seg) => wildcardSegmentMatch(seg, cleaned));
}

function envIgnorePatternMatches(rel: string, baseName: string, rawPat: string): boolean {
  const dirOnly = rawPat.endsWith('/');
  const cleaned = dirOnly ? rawPat.slice(0, -1) : rawPat;
  if (!cleaned) return false;
  if (dirOnly) return matchDirectoryIgnorePattern(rel.split('/').slice(0, -1), cleaned);
  const anchored = splitAnchoredPattern(cleaned);
  if (anchored) return matchAnchoredSegments(rel.split('/'), anchored);
  return wildcardSegmentMatch(baseName, cleaned);
}

function dirPatternMatchesTarget(relDir: string, dirName: string, rawPat: string): boolean {
  const cleaned = rawPat.endsWith('/') ? rawPat.slice(0, -1) : rawPat;
  if (!cleaned) return false;
  const anchored = splitAnchoredPattern(cleaned);
  return anchored ? matchAnchoredSegments(relDir.split('/'), anchored) : wildcardSegmentMatch(dirName, cleaned);
}

function applyDirIgnorePatterns(
  relDir: string,
  dirName: string,
  patterns: readonly string[],
  initialIgnored: boolean
): boolean {
  let ignored = initialIgnored;
  for (const pat of patterns) {
    const isNeg = pat.startsWith('!');
    const body = isNeg ? pat.slice(1) : pat;
    if (dirPatternMatchesTarget(relDir, dirName, body)) {
      ignored = !isNeg;
    }
  }
  return ignored;
}

function hasExcludedAncestorDirectory(dirs: readonly string[]): boolean {
  for (let i = 1; i < dirs.length; i++) {
    const targetDir = pickAt(dirs, i);
    const dirName = path.basename(targetDir);
    let dirIgnored = false;
    for (let j = 0; j < i; j++) {
      const ruleDir = pickAt(dirs, j);
      const relDir = path.relative(ruleDir, targetDir).replace(/\\/g, '/');
      dirIgnored = applyDirIgnorePatterns(relDir, dirName, readGitignoreLines(ruleDir), dirIgnored);
    }
    if (dirIgnored) return true;
  }
  return false;
}

function applyGitignorePatterns(
  rel: string,
  baseName: string,
  patterns: readonly string[],
  initialIgnored: boolean
): boolean {
  let ignored = initialIgnored;
  for (const pat of patterns) {
    const isNeg = pat.startsWith('!');
    const body = isNeg ? pat.slice(1) : pat;
    if (envIgnorePatternMatches(rel, baseName, body)) {
      ignored = !isNeg;
    }
  }
  return ignored;
}

export function findGitWorktreeRoot(startDir: string): string | null {
  let cur = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function collectDirectoryChain(stopRoot: string, targetDir: string): string[] {
  const resolvedStop = path.resolve(stopRoot);
  const chain: string[] = [];
  let cur = path.resolve(targetDir);
  while (true) {
    chain.push(cur);
    if (cur === resolvedStop) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return chain.reverse();
}

export function resolveTrustedGitExecutable(
  candidates: readonly string[] = TRUSTED_GIT_PATHS
): string | null {
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const GIT_SUBPROCESS_ENV = { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' } as const;

export function loadGitTrackedSet(
  dirPath: string,
  gitCandidates: readonly string[] = TRUSTED_GIT_PATHS
): ReadonlySet<string> {
  if (!findGitWorktreeRoot(dirPath)) {
    return new Set<string>();
  }
  const gitBin = resolveTrustedGitExecutable(gitCandidates);
  if (!gitBin) {
    return new Set<string>();
  }
  try {
    const out = execFileSync(
      gitBin,
      ['-c', 'safe.directory=*', '-c', 'core.quotePath=false', '-C', dirPath, 'ls-files'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        env: GIT_SUBPROCESS_ENV,
      }
    );
    return new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    );
  } catch (err: unknown) {
    reportDebugCatchError('security-auditor.loadGitTrackedSet', err);
    return new Set<string>();
  }
}

export function queryGitIgnoredSet(
  dirPath: string,
  relPaths: readonly string[],
  gitCandidates: readonly string[] = TRUSTED_GIT_PATHS
): ReadonlySet<string> | null {
  if (relPaths.length === 0) return new Set<string>();
  if (!findGitWorktreeRoot(dirPath)) return null;
  const gitBin = resolveTrustedGitExecutable(gitCandidates);
  if (!gitBin) return null;
  try {
    const out = execFileSync(
      gitBin,
      ['-c', 'safe.directory=*', '-C', dirPath, 'check-ignore', '-z', '--stdin'],
      {
        input: `${relPaths.join('\0')}\0`,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 5000,
        env: GIT_SUBPROCESS_ENV,
      }
    );
    return new Set(out.split('\0').filter((entry) => entry.length > 0));
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 1) {
      return new Set<string>();
    }
    reportDebugCatchError('security-auditor.queryGitIgnoredSet', err);
    return null;
  }
}

export function isEnvIgnoredByFallbackRules(stopRoot: string, absFile: string): boolean {
  const baseName = path.basename(absFile);
  const dirs = collectDirectoryChain(stopRoot, path.dirname(absFile));
  if (hasExcludedAncestorDirectory(dirs)) return true;
  let ignored = false;
  for (const dir of dirs) {
    const relFromDir = path.relative(dir, absFile).replace(/\\/g, '/');
    ignored = applyGitignorePatterns(relFromDir, baseName, readGitignoreLines(dir), ignored);
  }
  return ignored;
}

function collectUntrackedLiveEnvRels(
  rootDir: string,
  matched: readonly string[],
  trackedFiles: ReadonlySet<string>
): string[] {
  const rels: string[] = [];
  for (const absFile of matched) {
    if (!isLiveEnvBasename(path.basename(absFile))) continue;
    const rel = path.relative(rootDir, absFile).replace(/\\/g, '/');
    if (!trackedFiles.has(rel)) rels.push(rel);
  }
  return rels;
}

interface EnvIgnoreContext {
  readonly rootDir: string;
  readonly stopRoot: string;
  readonly trackedFiles: ReadonlySet<string>;
  readonly gitIgnoredSet: ReadonlySet<string> | null;
}

function shouldExcludeUntrackedIgnoredEnv(absFile: string, ctx: EnvIgnoreContext): boolean {
  if (!isLiveEnvBasename(path.basename(absFile))) return false;
  const rel = path.relative(ctx.rootDir, absFile).replace(/\\/g, '/');
  if (ctx.trackedFiles.has(rel)) return false;
  if (ctx.gitIgnoredSet !== null) return ctx.gitIgnoredSet.has(rel);
  return isEnvIgnoredByFallbackRules(ctx.stopRoot, absFile);
}

export function shouldSkipDirectory(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false;
  if (IGNORED_DIRS.has(entry.name) || entry.name === 'backups') return true;
  if (entry.name === '.agents' || entry.name === '.github' || entry.name === '.vitepress') {
    return false;
  }
  return entry.name.startsWith('.') && entry.name !== '.npmrc';
}

export function collectMatchingFiles(
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
export function collectFiles(dirPath: string, options?: AuditSecurityOptions): string[] {
  const predicate = options?.includeExamples ? isScannableFileOrExample : isScannableFile;
  const matched = collectMatchingFiles(dirPath, predicate);
  if (!matched.some((f) => isLiveEnvBasename(path.basename(f)))) {
    return matched;
  }
  const stopRoot = findGitWorktreeRoot(dirPath) ?? path.resolve(dirPath);
  const trackedFiles = loadGitTrackedSet(dirPath);
  const untrackedEnvRels = collectUntrackedLiveEnvRels(dirPath, matched, trackedFiles);
  const ctx: EnvIgnoreContext = {
    rootDir: dirPath,
    stopRoot,
    trackedFiles,
    gitIgnoredSet: queryGitIgnoredSet(dirPath, untrackedEnvRels),
  };
  return matched.filter((absFile) => !shouldExcludeUntrackedIgnoredEnv(absFile, ctx));
}


export function isTestFilePath(relPath: string): boolean {
  const norm = stripExampleSuffix(relPath.replace(/\\/g, '/'));
  return (
    /(^|\/)(tests?|__tests__|spec)\//i.test(norm) ||
    /\.(unit|spec|test|e2e)\.(py|ts|tsx|mts|js|jsx|mjs|cjs|php)$/i.test(norm) ||
    /(^|\/)test_[^/]+\.py$/i.test(norm) ||
    norm.endsWith('Test.php') ||
    norm.endsWith('.bats')
  );
}

export function isAuditorSelfDefinition(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return /(^|\/)src\/tools\/(?:(?:security-auditor|certify-gate|test-pyramid-auditor)\.ts|(?:security-auditor|test-pyramid)\/[^/]+\.ts)$/.test(norm);
}

export const HDR_CORP = 'cross-origin-resource-policy';
export const HDR_SAME_ORIGIN = 'same-origin';
export const HDR_CROSS_ORIGIN = 'cross-origin';

export const SYSTEM_NON_HEARTBEAT_PATHS = new Set([
  '/var/run/docker.sock',
  '/var/run/postgresql',
  '/tmp/.coverage',
]);

export const NON_HEARTBEAT_PATH_PREFIXES = [
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

export const NON_HEARTBEAT_PROBE_EXTS = ['.html', '.htm', '.xml', '.log', '.csv', '.md', '.sarif'];

export function isExcludedProbePath(probePath: string): boolean {
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

export function joinContinuedShellLines(rawContent: string): string[] {
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


export function readTextFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    // Lectura opcional de archivo candidato durante auditoría estática; null representa ausente o ilegible
    reportDebugCatchError('security-auditor.readTextFileSafe', err);
    return null;
  }
}

export function parseJsonObjectTextSafe(rawText: string): Record<string, unknown> | null {
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

export function isDirectorySafe(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err: unknown) {
    // Directorio opcional inexistente o sin permisos equivale a false en detección de estructura
    reportDebugCatchError('security-auditor.isDirectorySafe', err);
    return false;
  }
}

export function joinSubpath(appDir: string, child: string): string {
  return appDir === '.' ? child : path.join(appDir, child);
}

export function findLineNumberContaining(text: string, needle: string): number {
  if (!needle) return 1;
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes(needle));
  return Math.max(1, idx + 1);
}

export function isGithubWorkflowOrActionFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
    return false;
  }
  const lower = norm.toLowerCase();
  if (!lower.endsWith('.yml') && !lower.endsWith('.yaml')) return false;
  const ghIdx = lower.indexOf('.github/');
  if (ghIdx === -1 || (ghIdx > 0 && lower[ghIdx - 1] !== '/')) return false;
  const parts = lower.slice(ghIdx + '.github/'.length).split('/');
  const isWorkflow = parts.length === 2 && parts[0] === 'workflows';
  const isCompositeAction =
    parts.length === 3 && parts[0] === 'actions' && (parts[2] === 'action.yml' || parts[2] === 'action.yaml');
  return isWorkflow || isCompositeAction;
}
