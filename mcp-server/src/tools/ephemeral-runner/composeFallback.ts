// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import type { execFile, execFileSync } from 'child_process';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import {
  COMPOSE_QA_FILE,
  COMPOSER_STAGE_SET,
  DOCKER_BINARY,
  MAX_EXEC_BUFFER_BYTES,
  PREFERRED_QA_SERVICES,
  resolveHostUidGid,
  resolveSafeCacheTarget,
  type ExecCommandOutcome,
} from './coverageHarvest.js';

function measureLeadingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line.charAt(count) === ' ') {
    count += 1;
  }
  return count;
}

function parseIndentedServiceName(line: string, expectedIndent: number): string | null {
  const indent = measureLeadingSpaces(line);
  if (indent === 0 || (expectedIndent > 0 && indent !== expectedIndent)) {
    return null;
  }
  const colonIdx = line.indexOf(':', indent);
  if (colonIdx <= indent) {
    return null;
  }
  const candidate = line.slice(indent, colonIdx);
  const rest = line.slice(colonIdx + 1).trim();
  if (/^[A-Za-z0-9_-]+$/.test(candidate) && (!rest || rest.startsWith('#'))) {
    return candidate;
  }
  return null;
}

function extractComposeServices(composeContent: string): string[] {
  const services: string[] = [];
  let inServices = false;
  let serviceIndent = 0;
  for (const line of composeContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed === 'services:') {
      inServices = true;
      continue;
    }
    if (!inServices) {
      continue;
    }
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }
    const svc = parseIndentedServiceName(line, serviceIndent);
    if (svc) {
      if (serviceIndent === 0) {
        serviceIndent = measureLeadingSpaces(line);
      }
      services.push(svc);
    }
  }
  return services;
}

function buildComposeRunPrefix(
  service: string,
  uidGid: string,
  extraEnv: readonly string[] = []
): string[] {
  const args = [
    'compose',
    '-f',
    COMPOSE_QA_FILE,
    'run',
    '--rm',
    '-T',
    '-u',
    uidGid,
    '-e',
    'HOME=/tmp',
  ];
  for (const envPair of extraEnv) {
    args.push('-e', envPair);
  }
  args.push(service);
  return args;
}

function readPackageScripts(resolvedPath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(resolvedPath, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    if (!parsed.scripts || typeof parsed.scripts !== 'object' || Array.isArray(parsed.scripts)) {
      return {};
    }
    return parsed.scripts as Record<string, string>;
  } catch (err: unknown) {
    // Optional package.json scripts probe: non-Node or malformed package.json falls back to empty scripts
    reportDebugCatchError('ephemeralRunner.readPackageScripts', err);
    return {};
  }
}

function resolveUiE2eDirectCommands(
  stage: string,
  services: readonly string[],
  hasPkgJson: boolean,
  uidGid: string
): string[][] | null {
  if (!hasPkgJson || !services.includes('ui-e2e')) {
    return null;
  }
  if (stage === 'e2e') {
    const cmd =
      'if [ -x ./node_modules/.bin/playwright ]; then ./node_modules/.bin/playwright test; ' +
      'elif command -v pnpm >/dev/null 2>&1; then pnpm exec playwright test; ' +
      'else corepack pnpm exec playwright test; fi';
    return [[...buildComposeRunPrefix('ui-e2e', uidGid), 'bash', '-c', cmd]];
  }
  if (stage === 'perf') {
    const cmd =
      'export CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -n 1) && ' +
      'if [ -x ./node_modules/.bin/lhci ]; then ./node_modules/.bin/lhci autorun --config=lighthouserc.cjs; ' +
      'elif command -v pnpm >/dev/null 2>&1; then pnpm run test:perf; ' +
      'else corepack pnpm run test:perf; fi';
    return [[...buildComposeRunPrefix('ui-e2e', uidGid), 'bash', '-c', cmd]];
  }
  return null;
}

function resolveNodeDirectCommands(
  resolvedPath: string,
  primaryService: string,
  stage: string,
  uidGid: string
): string[][] | null {
  const scripts = readPackageScripts(resolvedPath);
  if (stage === 'lint') {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', 'lint']];
  }
  if (stage === 'unit') {
    const unitScript =
      ['test:coverage', 'test:unit', 'test'].find((name) => Boolean(scripts[name])) ?? 'test:unit';
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', unitScript]];
  }
  if (stage === 'mutation' && scripts.mutate) {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', 'mutate']];
  }
  return null;
}

function resolvePythonDirectCommands(
  resolvedPath: string,
  primaryService: string,
  stage: string,
  uidGid: string
): string[][] | null {
  if (stage === 'lint') {
    return [
      [
        ...buildComposeRunPrefix(primaryService, uidGid, ['RUFF_CACHE_DIR=/tmp/ruff-cache']),
        'sh',
        '-c',
        'ruff check src tests && mypy --strict --cache-dir=/tmp/mypy src',
      ],
    ];
  }
  if (stage === 'unit') {
    return [
      [
        ...buildComposeRunPrefix(primaryService, uidGid, ['COVERAGE_FILE=/tmp/.coverage']),
        'pytest',
        '-o',
        'cache_dir=/tmp/pytest-cache',
        '--import-mode=importlib',
        '--cov=src',
        '--cov-branch',
        '--cov-fail-under=95',
        '--cov-report=xml:.agents/.cache/coverage/python.xml',
      ],
    ];
  }
  if (stage === 'migration' && fs.existsSync(path.join(resolvedPath, 'alembic.ini'))) {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'alembic', 'upgrade', 'head']];
  }
  return null;
}

function resolveProfileDirectCommands(
  stage: string,
  services: readonly string[],
  uidGid: string
): string[][] | null {
  if (stage !== 'profile' || !services.includes('profiler')) {
    return null;
  }
  const cmds: string[][] = [];
  const targetApp = ['api', 'python-api'].find((svc) => services.includes(svc));
  if (targetApp) {
    cmds.push(['compose', '-f', COMPOSE_QA_FILE, '--profile', 'profile', 'up', '-d', targetApp]);
  }
  cmds.push([
    'compose',
    '-f',
    COMPOSE_QA_FILE,
    '--profile',
    'profile',
    'run',
    '--rm',
    '-T',
    '-u',
    uidGid,
    '-e',
    'HOME=/tmp',
    'profiler',
  ]);
  return cmds;
}

/**
 * Fallback directo sobre docker-compose.qa.yml para proyectos sin Makefile o sin el target buscado.
 */
export function resolveComposeDirectFallback(
  resolvedPath: string,
  stage: string
): string[][] | null {
  const composePath = path.join(resolvedPath, COMPOSE_QA_FILE);
  if (!fs.existsSync(composePath)) {
    return null;
  }
  const services = extractComposeServices(fs.readFileSync(composePath, 'utf8'));
  const uidGid = resolveHostUidGid();
  const profileCmds = resolveProfileDirectCommands(stage, services, uidGid);
  if (profileCmds) {
    return profileCmds;
  }
  if (stage === 'bdd' && services.includes('karatelabs')) {
    return [
      [
        'compose',
        '-f',
        COMPOSE_QA_FILE,
        'run',
        '--rm',
        '-T',
        'karatelabs',
        'mvn',
        '-B',
        'clean',
        'test',
      ],
    ];
  }
  const hasComposer = fs.existsSync(path.join(resolvedPath, 'composer.json'));
  const hasPkgJson = fs.existsSync(path.join(resolvedPath, 'package.json'));
  const hasPyManifest =
    fs.existsSync(path.join(resolvedPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(resolvedPath, 'requirements.txt'));

  const e2eCmds = resolveUiE2eDirectCommands(stage, services, hasPkgJson, uidGid);
  if (e2eCmds) {
    return e2eCmds;
  }

  const primaryService =
    PREFERRED_QA_SERVICES.find((svc) => services.includes(svc)) ??
    services.find((svc) => svc.startsWith('qa-'));
  if (!primaryService) {
    return null;
  }
  if (COMPOSER_STAGE_SET.has(stage) && hasComposer) {
    return [
      [
        'compose',
        '-f',
        COMPOSE_QA_FILE,
        'run',
        '--rm',
        '-T',
        '-u',
        uidGid,
        '-e',
        'HOME=/tmp',
        primaryService,
        'sh',
        '-c',
        `php -d allow_url_fopen=1 "$(command -v composer)" run-script qa:${stage}`,
      ],
    ];
  }
  if (hasPkgJson && !hasComposer) {
    return resolveNodeDirectCommands(resolvedPath, primaryService, stage, uidGid);
  }
  if (hasPyManifest) {
    return resolvePythonDirectCommands(resolvedPath, primaryService, stage, uidGid);
  }
  return null;
}

export interface ExecCommandInput {
  readonly executor: typeof execFile;
  readonly binary: string;
  readonly args: string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
}

function resolveExecErrorExitCode(errWithCode: NodeJS.ErrnoException & {
  code?: number | string;
  killed?: boolean;
  signal?: string;
}): number {
  if (typeof errWithCode.code === 'number') {
    return errWithCode.code;
  }
  if (
    errWithCode.killed ||
    errWithCode.signal === 'SIGTERM' ||
    errWithCode.code === 'ABORT_ERR' ||
    errWithCode.name === 'AbortError'
  ) {
    return 124;
  }
  return 1;
}

export function execCommand(input: ExecCommandInput): Promise<ExecCommandOutcome> {
  const { executor, binary, args, cwd, timeoutMs, signal, env } = input;
  if (signal?.aborted) {
    return Promise.resolve({
      exitCode: 124,
      errorCode: 'ABORT_ERR',
      stdout: '',
      stderr: '',
      errorMessage: 'Execution aborted before spawn',
    });
  }
  return new Promise((resolve) => {
    executor(
      binary,
      args,
      {
        cwd,
        timeout: timeoutMs,
        shell: false,
        maxBuffer: MAX_EXEC_BUFFER_BYTES,
        ...(env ? { env } : {}),
        ...(signal ? { signal } : {}),
      },
      (error, stdout, stderr) => {
        const stdoutStr = stdout ? stdout.toString() : '';
        const stderrStr = stderr ? stderr.toString() : '';
        if (!error) {
          resolve({ exitCode: 0, stdout: stdoutStr, stderr: stderrStr, errorMessage: '' });
          return;
        }
        const errWithCode = error as NodeJS.ErrnoException & {
          code?: number | string;
          killed?: boolean;
          signal?: string;
        };
        const exitCode = resolveExecErrorExitCode(errWithCode);
        resolve({
          exitCode,
          errorCode: typeof errWithCode.code === 'string' ? errWithCode.code : undefined,
          stdout: stdoutStr,
          stderr: stderrStr,
          errorMessage: error.message,
        });
      }
    );
  });
}

function extractComposeDownArgs(args: readonly string[]): string[] | null {
  if (args[0] !== 'compose') return null;
  const upIdx = args.indexOf('up');
  if (upIdx <= 0) return null;
  const tail = args.slice(upIdx + 1);
  const needsTeardown =
    tail.includes('-d') ||
    tail.includes('--detach') ||
    tail.includes('--abort-on-container-exit') ||
    args.includes('--profile');
  if (!needsTeardown) {
    return null;
  }
  return [...args.slice(0, upIdx), 'down', '-v', '--remove-orphans'];
}

export function registerComposeDownTarget(
  args: readonly string[],
  seenKeys: Set<string>,
  targets: string[][]
): void {
  const downArgs = extractComposeDownArgs(args);
  if (!downArgs) return;
  const key = downArgs.join('\0');
  if (!seenKeys.has(key)) {
    seenKeys.add(key);
    targets.push(downArgs);
  }
}

export async function teardownComposeServices(
  executor: typeof execFile,
  composeDownTargets: readonly string[][],
  resolvedPath: string
): Promise<void> {
  for (const downArgs of composeDownTargets) {
    await execCommand({ executor, binary: DOCKER_BINARY, args: downArgs, cwd: resolvedPath, timeoutMs: 30000 });
  }
}

export interface DockerFallbackContext {
  readonly executor: typeof execFile;
  readonly commands: string[][];
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutSeconds: number;
  readonly startTime: number;
  readonly execFileSyncFn?: typeof execFileSync;
  readonly expectRed?: boolean;
  readonly signal?: AbortSignal;
  readonly prepDirs?: readonly string[];
}

export function ensureSafePrepDirs(resolvedPath: string, prepDirs?: readonly string[]): void {
  if (!prepDirs || prepDirs.length === 0) return;
  for (const rel of prepDirs) {
    if (!rel) continue;
    const targetDir = resolveSafeCacheTarget(resolvedPath, rel);
    fs.mkdirSync(targetDir, { recursive: true });
  }
}
