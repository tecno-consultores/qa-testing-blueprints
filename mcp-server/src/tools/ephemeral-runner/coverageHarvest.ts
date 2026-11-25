// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import type { execFile, execFileSync } from 'child_process';
import { assertNoSymlinkSegments } from '../../security/pathRealResolver.js';
import { resolveSafeChildPath } from '../../services/github-fetcher.js';
import type { QaExecutionResult } from '../../types.js';

export interface DockerGuardrailDeps {
  readonly enabled?: boolean;
  readonly lockDir?: string;
  readonly maxConcurrent?: number;
  readonly maxTempC?: number;
  readonly minFreeMemPct?: number;
  readonly pollIntervalMs?: number;
  readonly platform?: NodeJS.Platform;
  readonly meminfoPath?: string;
  readonly thermalBaseDir?: string;
  readonly isPidAliveFn?: (pid: number) => boolean;
  readonly execFileSyncFn?: typeof execFileSync;
  readonly sleepFn?: (ms: number) => Promise<void>;
}

export const MAX_EXEC_BUFFER_BYTES = 20 * 1024 * 1024;
export const COMPOSE_QA_FILE = 'docker-compose.qa.yml';
export const DOCKER_BINARY = 'docker';
export const MAKE_BINARY = 'make';
export const BASH_QA_IMAGE_PINNED =
  'sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7';
export const STATUS_FAILED = 'FAILED' as const;
export const BREAKER_REMEDIATION =
  'BREAKER-42 ACTIVADO: Detén ediciones a ciegas, consulta inspect_ast_blast_radius(changed_since_ref) y aplica las 4 fases de qa-11x-systematic-debugging (--reset-state requiere intervención humana).';
export const MAX_MAKE_DELEGATION_DEPTH = 3;
export const PREFERRED_QA_SERVICES = [
  'qa-php',
  'qa-backend',
  'qa-fastapi',
  'qa-node',
  'qa-vue3',
  'qa-frontend',
  'qa-mobile',
  'qa-python',
  'qa-bash',
];
export const COMPOSER_STAGE_SET = new Set(['lint', 'unit', 'mutation', 'sbom']);
export const COVERAGE_STAGE_SET = new Set(['unit', 'ci', 'all']);
export const MAKE_NOOP_FLAGS = new Set(['-s', '--silent', '--no-print-directory']);
export const SHELL_CHAIN_TOKENS = new Set(['&&', '||', ';', '|']);
const COBERTURA_XML_NAME = 'coverage.xml';
const DIRECT_COBERTURA_NAME = 'cobertura.xml';
const LCOV_INFO_NAME = 'lcov.info';
const MONOREPO_COVERAGE_SUBDIRS = [
  'fastapi',
  'python',
  'php',
  'bash-scripts',
  'mobile-appium',
  'backend',
  'mcp-server',
  'node-backend',
  'vue3',
  'react-frontend',
  'frontend',
] as const;

interface CoverageHarvestCandidate {
  srcRel: string;
  destName: string;
  rewriteSubDir?: string;
}

const ROOT_COVERAGE_CANDIDATES: readonly CoverageHarvestCandidate[] = [
  { srcRel: COBERTURA_XML_NAME, destName: DIRECT_COBERTURA_NAME },
  { srcRel: path.join('coverage', 'cobertura-coverage.xml'), destName: 'node-cobertura.xml' },
  { srcRel: path.join('build', 'logs', DIRECT_COBERTURA_NAME), destName: 'php.xml' },
  { srcRel: path.join('coverage', 'clover.xml'), destName: 'php.xml' },
  { srcRel: path.join('coverage_report', 'kcov-merged', DIRECT_COBERTURA_NAME), destName: 'bash.xml' },
  { srcRel: path.join('coverage_report', DIRECT_COBERTURA_NAME), destName: 'bash.xml' },
  { srcRel: path.join('coverage', LCOV_INFO_NAME), destName: LCOV_INFO_NAME },
];

export function resolveSafeCacheTarget(resolvedPath: string, relPath: string): string {
  const safePath = resolveSafeChildPath(resolvedPath, relPath);
  assertNoSymlinkSegments(resolvedPath, relPath);
  return safePath;
}

export function ensureCoverageCacheDir(resolvedPath: string): string {
  const relCacheRoot = path.join('.agents', '.cache');
  const relCoverageDir = path.join(relCacheRoot, 'coverage');
  const cacheRoot = resolveSafeCacheTarget(resolvedPath, relCacheRoot);
  const coverageDir = resolveSafeCacheTarget(resolvedPath, relCoverageDir);
  fs.mkdirSync(coverageDir, { recursive: true, mode: 0o700 });
  resolveSafeCacheTarget(resolvedPath, relCacheRoot);
  resolveSafeCacheTarget(resolvedPath, relCoverageDir);
  fs.chmodSync(cacheRoot, 0o700);
  fs.chmodSync(coverageDir, 0o700);
  return coverageDir;
}

export function prepareCoverageCacheForStage(resolvedPath: string, stage: string): void {
  if (COVERAGE_STAGE_SET.has(stage)) {
    ensureCoverageCacheDir(resolvedPath);
  }
}

export function harvestCoverageForStage(resolvedPath: string, stage: string): void {
  if (COVERAGE_STAGE_SET.has(stage)) {
    harvestCoverageReports(resolvedPath);
  }
}

function buildCoverageCandidates(): CoverageHarvestCandidate[] {
  const subdirCandidates = MONOREPO_COVERAGE_SUBDIRS.flatMap((subDir) => [
    { srcRel: path.join(subDir, COBERTURA_XML_NAME), destName: `${subDir}.xml` },
    { srcRel: path.join(subDir, '.agents', '.cache', 'coverage', 'bash.xml'), destName: `${subDir}.xml` },
    { srcRel: path.join(subDir, 'coverage_report', 'kcov-merged', DIRECT_COBERTURA_NAME), destName: `${subDir}.xml` },
    { srcRel: path.join(subDir, 'coverage_report', DIRECT_COBERTURA_NAME), destName: `${subDir}.xml` },
    {
      srcRel: path.join(subDir, 'coverage', LCOV_INFO_NAME),
      destName: `${subDir}.info`,
      rewriteSubDir: subDir,
    },
  ]);
  return [...ROOT_COVERAGE_CANDIDATES, ...subdirCandidates];
}

function readContainedCoverageFile(rootReal: string, candidatePath: string): string | null {
  if (!fs.existsSync(candidatePath)) {
    return null;
  }
  const realSource = fs.realpathSync(candidatePath);
  if (!realSource.startsWith(`${rootReal}${path.sep}`)) {
    return null;
  }
  if (!fs.statSync(realSource).isFile()) {
    return null;
  }
  return fs.readFileSync(realSource, 'utf8');
}

function rewriteLcovSubdirPrefix(content: string, subDir?: string): string {
  if (!subDir) {
    return content;
  }
  return content
    .replace(/^SF:\/(?:app|workspace)\//gm, `SF:${subDir}/`)
    .replace(/^SF:src\//gm, `SF:${subDir}/src/`);
}

const SAFE_COBERTURA_DOCTYPE_RE = /<!DOCTYPE\s+coverage\s+[^\s[\]<>][^[\]<>]*>\r?\n?/gi;

function sanitizeHarvestedCoveragePayload(
  content: string,
  destName: string,
  subDir?: string
): string {
  if (!destName.endsWith('.xml')) {
    return rewriteLcovSubdirPrefix(content, subDir);
  }
  if (content.toUpperCase().includes('<!ENTITY')) {
    return content;
  }
  return content.replace(SAFE_COBERTURA_DOCTYPE_RE, '');
}

export function harvestCoverageReports(resolvedPath: string): string[] {
  if (!fs.existsSync(resolvedPath)) {
    return [];
  }
  ensureCoverageCacheDir(resolvedPath);
  const rootReal = fs.realpathSync(resolvedPath);
  const harvested: string[] = [];
  const seenDest = new Set<string>();
  for (const item of buildCoverageCandidates()) {
    if (seenDest.has(item.destName)) {
      continue;
    }
    const raw = readContainedCoverageFile(rootReal, path.join(resolvedPath, item.srcRel));
    if (raw === null) {
      continue;
    }
    const destRel = path.join('.agents', '.cache', 'coverage', item.destName);
    const destPath = resolveSafeCacheTarget(resolvedPath, destRel);
    fs.writeFileSync(
      destPath,
      sanitizeHarvestedCoveragePayload(raw, item.destName, item.rewriteSubDir),
      {
        encoding: 'utf8',
        mode: 0o600,
      }
    );
    resolveSafeCacheTarget(resolvedPath, destRel);
    fs.chmodSync(destPath, 0o600);
    seenDest.add(item.destName);
    harvested.push(destPath);
  }
  return harvested;
}

export interface RunEphemeralQaOptions {
  execFileFn?: typeof execFile;
  execFileSyncFn?: typeof execFileSync;
  skipIfDocsOnly?: boolean;
  signal?: AbortSignal;
  guardrails?: DockerGuardrailDeps;
}

export interface ParsedTarget {
  deps: string[];
  recipes: string[];
}

export interface ParsedMakefile {
  vars: Map<string, string>;
  targets: Map<string, ParsedTarget>;
}

export type RecipeResolutionResult =
  | { ok: true; commands: string[][]; prepDirs?: string[] }
  | { ok: false; reason: string };

export interface ExecCommandOutcome {
  exitCode: number;
  errorCode?: string;
  stdout: string;
  stderr: string;
  errorMessage: string;
}

export interface StructuredFailureInput {
  readonly stage: string;
  readonly testName: string;
  readonly errorSummary: string;
  readonly tailLog: string;
  readonly durationMs?: number;
}

export function buildStructuredFailureResult(input: StructuredFailureInput): QaExecutionResult {
  const { stage, testName, errorSummary, tailLog, durationMs = 0 } = input;
  return {
    status: STATUS_FAILED,
    stage,
    exit_code: 1,
    duration_ms: durationMs,
    coverage: {
      detected: false,
      percent: 0,
      threshold: 95.0,
      passed: false,
      uncovered_files: [],
    },
    failed_tests: [{ test_name: testName, error_summary: errorSummary }],
    linter_and_complexity_issues: [],
    security_alerts: { critical: 0, high: 0 },
    mutation_summary: null,
    tail_log: tailLog,
  };
}


export function resolvePosixNumericId(kind: 'uid' | 'gid'): number {
  const getter = kind === 'uid' ? process.getuid : process.getgid;
  return typeof getter === 'function' ? getter() : 1000;
}

export function resolveHostUidGid(): string {
  return `${resolvePosixNumericId('uid')}:${resolvePosixNumericId('gid')}`;
}
