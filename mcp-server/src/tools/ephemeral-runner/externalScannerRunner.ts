// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile as defaultExecFile, type execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSymlinkSegments, assertNotSymlinkPath } from '../../security/pathRealResolver.js';
import { resolveSafeProjectPath } from '../../security/workspacePathValidator.js';
import { resolveSafeChildPath } from '../../services/github-fetcher.js';
import {
  DEFAULT_SARIF_CACHE_REL_DIR,
  ingestSingleSarifReport,
} from '../../utils/sarifIngester.js';
import { execCommand } from './composeFallback.js';
import {
  DOCKER_BINARY,
  resolveHostUidGid,
  resolveSafeCacheTarget,
  type DockerGuardrailDeps,
} from './coverageHarvest.js';
import { acquireDockerSlotLock, runPreFlightDockerGuards } from './dockerGuardrails.js';

export type ExternalSarifScanner = 'semgrep' | 'trivy' | 'codeql';

export const PINNED_TRIVY_SARIF_IMAGE =
  'aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb';
export const PINNED_SEMGREP_SARIF_IMAGE = 'semgrep/semgrep:1.119.0';
export const PINNED_CODEQL_SARIF_IMAGE = 'mcr.microsoft.com/cstsectools/codeql-container:2.20.3';

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_CODEQL_DB_REL = '.agents/.cache/codeql-db';
const STATUS_BLOCKED = 'BLOCKED' as const;

export interface RunExternalSarifScannerOptions {
  readonly scanner: ExternalSarifScanner;
  readonly image?: string;
  readonly rulesRelDir?: string;
  readonly trivyCacheDir?: string;
  readonly codeqlDbRelPath?: string;
  readonly timeoutSeconds?: number;
  readonly signal?: AbortSignal;
  readonly execFileFn?: typeof execFile;
  readonly guardrails?: DockerGuardrailDeps;
}

export interface ExternalSarifScanResult {
  readonly status: 'PASSED' | 'FAILED' | 'BLOCKED';
  readonly scanner: ExternalSarifScanner;
  readonly exit_code: number;
  readonly sarif_path: string;
  readonly duration_ms: number;
  readonly findings_count: number;
  readonly summary: string;
  readonly command_args: readonly string[];
}

function ensureSarifCacheDir(resolvedRoot: string): string {
  const relCacheRoot = path.join('.agents', '.cache');
  const cacheRoot = resolveSafeCacheTarget(resolvedRoot, relCacheRoot);
  const sarifDir = resolveSafeCacheTarget(resolvedRoot, DEFAULT_SARIF_CACHE_REL_DIR);
  fs.mkdirSync(sarifDir, { recursive: true, mode: 0o700 });
  resolveSafeCacheTarget(resolvedRoot, relCacheRoot);
  resolveSafeCacheTarget(resolvedRoot, DEFAULT_SARIF_CACHE_REL_DIR);
  fs.chmodSync(cacheRoot, 0o700);
  fs.chmodSync(sarifDir, 0o700);
  return sarifDir;
}

const SAFE_IMAGE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,255}$/;

function validateSafeDockerImageRef(rawImage: string): string {
  const trimmed = rawImage.trim();
  if (!SAFE_IMAGE_REF_RE.test(trimmed)) {
    throw new Error(
      `[RULE-ZERO] Referencia de imagen Docker inválida o insegura rechazada: '${trimmed}'.`
    );
  }
  return trimmed;
}

function resolveScannerImage(scanner: ExternalSarifScanner, explicit?: string): string {
  let candidate: string;
  if (explicit && explicit.trim().length > 0) {
    candidate = explicit;
  } else if (scanner === 'trivy') {
    candidate = process.env.QA11X_TRIVY_IMAGE || PINNED_TRIVY_SARIF_IMAGE;
  } else if (scanner === 'semgrep') {
    candidate = process.env.QA11X_SEMGREP_IMAGE || PINNED_SEMGREP_SARIF_IMAGE;
  } else {
    candidate = process.env.QA11X_CODEQL_IMAGE || PINNED_CODEQL_SARIF_IMAGE;
  }
  return validateSafeDockerImageRef(candidate);
}

function resolveSafeTrivyCacheDir(resolvedRoot: string, explicitCacheDir?: string): string | null {
  const rawCandidate = explicitCacheDir ?? '.trivycache';
  if (/[\s:\0]/.test(rawCandidate)) {
    throw new Error(
      `[RULE-ZERO] Ruta trivyCacheDir insegura (carácter prohibido en bind-mount): '${rawCandidate}'.`
    );
  }
  const safePath = resolveSafeCacheTarget(resolvedRoot, rawCandidate);
  if (!fs.existsSync(safePath)) {
    return null;
  }
  assertNotSymlinkPath(safePath);
  return safePath;
}

function resolveDefaultSemgrepConfig(resolvedRoot: string): string {
  if (fs.existsSync(path.join(resolvedRoot, '.semgrep'))) {
    return '/workspace/.semgrep';
  }
  if (fs.existsSync(path.join(resolvedRoot, '.semgrep.yml'))) {
    return '/workspace/.semgrep.yml';
  }
  return 'off';
}

function buildBaseDockerArgs(resolvedRoot: string, sarifDir: string): string[] {
  return [
    'run',
    '--rm',
    '--restart=no',
    '--network',
    'none',
    '--cpus=2',
    '--memory=2g',
    '--pids-limit=256',
    '--security-opt=no-new-privileges:true',
    '-u',
    resolveHostUidGid(),
    '-e',
    'HOME=/tmp',
    '-v',
    `${resolvedRoot}:/workspace:ro`,
    '-v',
    `${sarifDir}:/sarif-out:rw`,
    '-w',
    '/workspace',
  ];
}

function buildScannerDockerArgs(
  resolvedRoot: string,
  sarifDir: string,
  options: RunExternalSarifScannerOptions
): string[] {
  const args = buildBaseDockerArgs(resolvedRoot, sarifDir);
  const image = resolveScannerImage(options.scanner, options.image);

  if (options.scanner === 'semgrep') {
    let configTarget = resolveDefaultSemgrepConfig(resolvedRoot);
    if (options.rulesRelDir) {
      const safeRules = resolveSafeCacheTarget(resolvedRoot, options.rulesRelDir);
      args.push('-v', `${safeRules}:/rules:ro`);
      configTarget = '/rules';
    }
    args.push(
      image,
      'semgrep',
      'scan',
      '--config',
      configTarget,
      '--sarif',
      '--sarif-output=/sarif-out/semgrep.sarif',
      '--metrics=off',
      '/workspace'
    );
    return args;
  }

  if (options.scanner === 'trivy') {
    const cacheDir = resolveSafeTrivyCacheDir(resolvedRoot, options.trivyCacheDir);
    if (cacheDir) {
      args.push('-v', `${cacheDir}:/tmp/trivy-cache:rw`, '-e', 'TRIVY_CACHE_DIR=/tmp/trivy-cache');
    }
    args.push(
      image,
      'fs',
      '.',
      '--offline-scan',
      '--skip-db-update',
      '--format',
      'sarif',
      '--output',
      '/sarif-out/trivy.sarif',
      '--severity',
      'HIGH,CRITICAL'
    );
    return args;
  }

  const dbRel = options.codeqlDbRelPath ?? DEFAULT_CODEQL_DB_REL;
  assertNoSymlinkSegments(resolvedRoot, dbRel);
  const normalizedDb = dbRel.replace(/\\/g, '/').replace(/^\.\//, '');
  args.push(
    image,
    'database',
    'analyze',
    `/workspace/${normalizedDb}`,
    '--format=sarif-latest',
    '--output=/sarif-out/codeql.sarif'
  );
  return args;
}

function buildBlockedOutcome(
  scanner: ExternalSarifScanner,
  sarifPath: string,
  exitCode: number,
  summary: string
): ExternalSarifScanResult {
  return {
    status: STATUS_BLOCKED,
    scanner,
    exit_code: exitCode,
    sarif_path: sarifPath,
    duration_ms: 0,
    findings_count: 0,
    summary,
    command_args: [],
  };
}

/**
 * Runs an external SARIF scanner (`semgrep`, `trivy`, `codeql`) exclusively inside a serialized
 * non-root offline Docker container (`--rm --restart=no --network none`, `QA_MAX_CONCURRENT_CONTAINERS=1`).
 */
export async function runExternalSarifScannerInDocker(
  projectPath: string,
  options: RunExternalSarifScannerOptions
): Promise<ExternalSarifScanResult> {
  const resolvedRoot = resolveSafeProjectPath(projectPath);
  const sarifDir = ensureSarifCacheDir(resolvedRoot);
  const sarifPath = resolveSafeChildPath(sarifDir, `${options.scanner}.sarif`);
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = timeoutSeconds * 1000;

  const preFlight = runPreFlightDockerGuards(resolvedRoot, options.guardrails);
  if (preFlight.blocked) {
    return buildBlockedOutcome(
      options.scanner,
      sarifPath,
      preFlight.exitCode,
      preFlight.summary ?? '[QA-DOCKER-LOOP-01] Guardrail Docker activo: escaneo SARIF bloqueado.'
    );
  }

  const slot = await acquireDockerSlotLock({
    resolvedPath: resolvedRoot,
    stage: `sarif-${options.scanner}`,
    timeoutMs,
    signal: options.signal,
    deps: options.guardrails,
  });
  if (!slot) {
    return buildBlockedOutcome(
      options.scanner,
      sarifPath,
      124,
      `[TIMEOUT] Cola serializada Docker (sarif-${options.scanner}) agotó ${timeoutSeconds}s.`
    );
  }

  const startTime = Date.now();
  try {
    const commandArgs = buildScannerDockerArgs(resolvedRoot, sarifDir, options);
    const executor = options.execFileFn ?? defaultExecFile;
    const execRes = await execCommand({
      executor,
      binary: DOCKER_BINARY,
      args: commandArgs,
      cwd: resolvedRoot,
      timeoutMs,
      signal: options.signal,
      env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' },
    });

    const durationMs = Date.now() - startTime;
    if (execRes.errorCode === 'ENOENT') {
      return {
        status: STATUS_BLOCKED,
        scanner: options.scanner,
        exit_code: 127,
        sarif_path: sarifPath,
        duration_ms: durationMs,
        findings_count: 0,
        summary:
          '[RULE-ZERO] Docker Engine no está instalado o disponible en PATH (ENOENT); nunca se ejecutan escáneres externos directamente en el host.',
        command_args: commandArgs,
      };
    }

    const scopedFindings = ingestSingleSarifReport(resolvedRoot, sarifPath);
    const status = execRes.exitCode === 0 ? 'PASSED' : 'FAILED';
    const rawDetail = [execRes.stderr || execRes.errorMessage, execRes.stdout]
      .filter((chunk) => chunk.trim().length > 0)
      .join('\n')
      .trim();

    return {
      status,
      scanner: options.scanner,
      exit_code: execRes.exitCode,
      sarif_path: sarifPath,
      duration_ms: durationMs,
      findings_count: scopedFindings.length,
      summary:
        rawDetail ||
        `✔ [SARIF:${options.scanner}] Escaneo Docker completado (${scopedFindings.length} hallazgos).`,
      command_args: commandArgs,
    };
  } finally {
    slot.release();
  }
}
