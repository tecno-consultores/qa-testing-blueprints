// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { parseQaOutput } from '../parsers/output-parsers.js';
import { assertNoSymlinkSegments } from '../security/pathRealResolver.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import {
  DEFAULT_BREAKER_MAX_STREAK, EXIT_BREAKER_42, extractPathsFromPorcelainLine,
  isDocFilePath, isEphemeralQaArtifactPath, type RawFindingInput,
  recordQaStageEvidence, recordQaStageFindingsState, recordRedPhaseEvidence,
} from '../services/qa-evidence.js';
import type { QaExecutionResult } from '../types.js';
import {
  formatFailVerboseReport, hasComplexityOrSignatureViolation, reportDebugCatchError,
  TACTICAL_PATTERNS_DIRECTIVE_11X,
} from '../utils/diagnosticFormatter.js';
import { recordStageCmdCheckpoint } from './sessionFlightRecorder.js';
import {
  type DockerFallbackContext, ensureSafePrepDirs, execCommand,
  registerComposeDownTarget, resolveComposeDirectFallback, teardownComposeServices,
} from './ephemeral-runner/composeFallback.js';
import {
  BREAKER_REMEDIATION, COMPOSE_QA_FILE, DOCKER_BINARY, MAKE_BINARY, STATUS_FAILED,
  buildStructuredFailureResult, ensureCoverageCacheDir, harvestCoverageForStage,
  harvestCoverageReports, prepareCoverageCacheForStage,
  type RecipeResolutionResult, type RunEphemeralQaOptions,
} from './ephemeral-runner/coverageHarvest.js';
import {
  acquireDockerSlotLock,
  EXIT_TEMPFAIL,
  runPreFlightDockerGuards,
  teardownWorkspaceComposeOnAbort,
} from './ephemeral-runner/dockerGuardrails.js';
import {
  type ExternalSarifScanner,
  type ExternalSarifScanResult,
  PINNED_SEMGREP_SARIF_IMAGE,
  PINNED_TRIVY_SARIF_IMAGE,
  type RunExternalSarifScannerOptions,
  runExternalSarifScannerInDocker,
} from './ephemeral-runner/externalScannerRunner.js';
import {
  expandMakefileVariables, hasUnquotedShellSyntax, resolveMakefileDockerRecipes,
  tokenizeCommandArgs, type ResolveMakefileRecursionOptions,
} from './ephemeral-runner/makefileParser.js';

export {
  ensureCoverageCacheDir, expandMakefileVariables, harvestCoverageReports,
  hasUnquotedShellSyntax, PINNED_SEMGREP_SARIF_IMAGE, PINNED_TRIVY_SARIF_IMAGE,
  resolveComposeDirectFallback, resolveMakefileDockerRecipes, runExternalSarifScannerInDocker,
  tokenizeCommandArgs,
  type ExternalSarifScanner, type ExternalSarifScanResult, type RecipeResolutionResult,
  type ResolveMakefileRecursionOptions, type RunEphemeralQaOptions,
  type RunExternalSarifScannerOptions,
};


async function executeDockerFallbackSequence(
  ctx: DockerFallbackContext
): Promise<QaExecutionResult> {
  const {
    executor,
    commands,
    resolvedPath,
    stage,
    timeoutSeconds,
    startTime,
    execFileSyncFn,
    expectRed,
    signal,
    prepDirs,
  } = ctx;
  const timeoutMs = timeoutSeconds * 1000;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const seenDownKeys = new Set<string>();
  const composeDownTargets: string[][] = [];
  let lastExitCode = 0;

  ensureSafePrepDirs(resolvedPath, prepDirs);
  prepareCoverageCacheForStage(resolvedPath, stage);

  try {
    for (const args of commands) {
      const rawRemainingMs = timeoutMs - (Date.now() - startTime);
      if (rawRemainingMs <= 0 || signal?.aborted) {
        lastExitCode = 124;
        break;
      }
      registerComposeDownTarget(args, seenDownKeys, composeDownTargets);
      const res = await execCommand({
        executor,
        binary: DOCKER_BINARY,
        args,
        cwd: resolvedPath,
        timeoutMs: Math.max(1000, rawRemainingMs),
        signal,
        env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' },
      });
      if (res.stdout) stdoutChunks.push(res.stdout);
      const errChunk = res.stderr || (res.exitCode !== 0 ? res.errorMessage : '');
      if (errChunk) stderrChunks.push(errChunk);
      if (res.exitCode !== 0) {
        lastExitCode = res.exitCode;
        break;
      }
    }

    harvestCoverageForStage(resolvedPath, stage);
  } finally {
    if (composeDownTargets.length > 0) {
      await teardownComposeServices(executor, composeDownTargets, resolvedPath);
    }
  }

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(stdoutChunks.join('\n'), stderrChunks.join('\n'), stage, {
    durationMs,
    exitCode: lastExitCode,
  });
  if (lastExitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución fallback en Docker de 'qa-${stage}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  } else {
    parsed.tail_log = `[Fallback Rule Zero sin GNU make -> docker] ${parsed.tail_log}`.trim();
  }
  return applyStageTrackingAndEvidence(resolvedPath, stage, parsed, { execFileSyncFn, expectRed });
}

function extractStageFindings(parsed: QaExecutionResult): RawFindingInput[] {
  const issues: RawFindingInput[] = parsed.linter_and_complexity_issues.map((item) => ({
    layer: parsed.stage,
    file: item.file,
    rule: item.rule,
    message: item.message,
  }));
  const failures: RawFindingInput[] = parsed.failed_tests.map((test) => ({
    layer: parsed.stage,
    file: test.test_name,
    rule: test.test_name,
    message: test.error_summary,
  }));
  const combined = [...issues, ...failures];
  if (combined.length === 0 && parsed.status === STATUS_FAILED && parsed.exit_code !== 124) {
    const firstDiag =
      parsed.tail_log
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? `Stage ${parsed.stage} failed`;
    combined.push({
      layer: parsed.stage,
      file: parsed.stage,
      rule: `exit-${parsed.exit_code}`,
      message: firstDiag,
    });
  }
  return combined;
}

function applyExpectRedPhaseOutcome(
  resolvedPath: string,
  stage: string,
  parsed: QaExecutionResult,
  execFileSyncFn?: typeof execFileSync
): QaExecutionResult {
  if (parsed.exit_code === EXIT_TEMPFAIL || parsed.exit_code === 124) {
    return parsed;
  }
  if (parsed.status === 'PASSED') {
    const tautologyMsg =
      '[TDD-TAUTOLOGY] expect_red=true pero 0 pruebas fallaron; el test nuevo no reproduce el caso RED.';
    return {
      ...parsed,
      status: STATUS_FAILED,
      exit_code: 1,
      red_phase_verified: false,
      failed_tests: [
        ...parsed.failed_tests,
        { test_name: `tdd:${stage}:expect_red`, error_summary: tautologyMsg },
      ],
      tail_log: `${tautologyMsg}\n${parsed.tail_log}`.trim(),
    };
  }
  const failedCount = Math.max(1, parsed.failed_tests.length);
  recordRedPhaseEvidence(resolvedPath, stage, failedCount, execFileSyncFn);
  recordStageCmdCheckpoint(
    resolvedPath,
    {
      cmdName: `qa-${stage}:red`,
      exitCode: parsed.exit_code,
      summary1Line: `RED_VERIFIED: stage=${stage} failed=${failedCount}`,
    },
    execFileSyncFn
  );
  return {
    ...parsed,
    red_phase_verified: true,
    tail_log: `✔ [TDD RED VERIFIED] El fallo esperado (${failedCount} prueba(s)) quedó certificado sin penalizar BREAKER-42.\n${parsed.tail_log}`.trim(),
  };
}

function applyStageTrackingAndEvidence(
  resolvedPath: string,
  stage: string,
  parsed: QaExecutionResult,
  trackingOpts?: { execFileSyncFn?: typeof execFileSync; expectRed?: boolean }
): QaExecutionResult {
  const execFileSyncFn = trackingOpts?.execFileSyncFn;
  if (trackingOpts?.expectRed) {
    return applyExpectRedPhaseOutcome(resolvedPath, stage, parsed, execFileSyncFn);
  }
  if (fs.existsSync(resolvedPath) && parsed.exit_code !== EXIT_TEMPFAIL) {
    const findings = extractStageFindings(parsed);
    const breaker = recordQaStageFindingsState(resolvedPath, stage, findings, {
      maxStreak: DEFAULT_BREAKER_MAX_STREAK,
      execFileSyncFn,
    });
    if (breaker.triggered) {
      const blockingTrace = breaker.blocking_findings
        .map(
          (f) =>
            `[${f.status} | fp=${f.fingerprint} | streak=${f.consecutive_streak} | osc=${f.oscillations}] ${f.relative_file} [${f.rule_or_test_name}]: ${f.canonical_message}`
        )
        .join('\n');
      const alertBanner = formatFailVerboseReport({
        stageId: `${stage}:BREAKER_42`,
        passed: false,
        broken: true,
        durationMs: parsed.duration_ms,
        command: `make qa-${stage}`,
        exitCode: EXIT_BREAKER_42,
        stderr: blockingTrace,
        remediationHint: BREAKER_REMEDIATION,
      });
      parsed.status = STATUS_FAILED;
      parsed.exit_code = EXIT_BREAKER_42;
      parsed.circuit_breaker = breaker;
      parsed.tail_log = `${alertBanner}\n${parsed.tail_log}`.trim();
    }
  }
  if (
    parsed.status === STATUS_FAILED &&
    !parsed.tail_log.includes('[DIRECTIVE-11X]') &&
    (hasComplexityOrSignatureViolation(parsed.tail_log) ||
      parsed.linter_and_complexity_issues.some((issue) =>
        hasComplexityOrSignatureViolation(`${issue.rule} ${issue.message}`)
      ))
  ) {
    parsed.tail_log = `${parsed.tail_log}\n${TACTICAL_PATTERNS_DIRECTIVE_11X}`.trim();
  }
  recordQaStageEvidence(resolvedPath, stage, parsed.status, execFileSyncFn);
  recordStageCmdCheckpoint(
    resolvedPath,
    {
      cmdName: `qa-${stage}`,
      exitCode: parsed.exit_code,
      summary1Line: `${parsed.status}: stage=${stage} exit=${parsed.exit_code}`,
    },
    execFileSyncFn
  );
  return parsed;
}

interface FallbackRunnerContext {
  readonly executor: typeof execFile;
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutSeconds: number;
  readonly startTime: number;
  readonly execFileSyncFn?: typeof execFileSync;
  readonly expectRed?: boolean;
  readonly makefilePath?: string;
  readonly signal?: AbortSignal;
}

async function runMissingMakefileFallback(ctx: FallbackRunnerContext): Promise<QaExecutionResult> {
  const { executor, resolvedPath, stage, timeoutSeconds, startTime, execFileSyncFn, expectRed, signal } =
    ctx;
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence({
      executor,
      commands: directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      expectRed,
      signal,
    });
  }
  const composeExists = fs.existsSync(path.join(resolvedPath, COMPOSE_QA_FILE));
  const msg = composeExists
    ? `No existe Makefile y el stage '${stage}' no tiene mapeo directo seguro en ${COMPOSE_QA_FILE}.`
    : `No se encontró archivo Makefile en ${resolvedPath}.`;
  const tail = composeExists
    ? msg
    : `Error: Makefile inexistente en el directorio destino: ${resolvedPath}`;
  const failed = buildStructuredFailureResult({
    stage,
    testName: `make qa-${stage}`,
    errorSummary: msg,
    tailLog: tail,
  });
  if (composeExists) {
    recordQaStageEvidence(resolvedPath, stage, failed.status, execFileSyncFn);
  }
  return failed;
}

async function runMakeEnoentFallback(ctx: FallbackRunnerContext): Promise<QaExecutionResult> {
  const {
    executor,
    makefilePath,
    resolvedPath,
    stage,
    timeoutSeconds,
    startTime,
    execFileSyncFn,
    expectRed,
    signal,
  } = ctx;
  const makefileContent = fs.readFileSync(makefilePath as string, 'utf8');
  const primaryResolution = resolveMakefileDockerRecipes(makefileContent, `qa-${stage}`, resolvedPath);
  const secondaryResolution = primaryResolution.ok
    ? primaryResolution
    : resolveMakefileDockerRecipes(makefileContent, stage, resolvedPath);
  const recipeResolution = secondaryResolution.ok ? secondaryResolution : primaryResolution;
  if (recipeResolution.ok) {
    return executeDockerFallbackSequence({
      executor,
      commands: recipeResolution.commands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      expectRed,
      signal,
      prepDirs: recipeResolution.prepDirs,
    });
  }
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence({
      executor,
      commands: directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      expectRed,
      signal,
    });
  }
  const failReason = `GNU make no disponible en el host (ENOENT) y fallback Rule Zero rechazado: ${recipeResolution.reason}`;
  const failed = buildStructuredFailureResult({
    stage,
    testName: `make qa-${stage}`,
    errorSummary: failReason,
    tailLog: failReason,
    durationMs: Date.now() - startTime,
  });
  recordQaStageEvidence(resolvedPath, stage, failed.status, execFileSyncFn);
  return failed;
}

/**
 * Determina si el árbol de trabajo Git contiene exclusivamente cambios en documentación
 * (*.md o archivos documentales dentro de docs/). Si no hay cambios o hay al menos 1 archivo de código,
 * configuración o prueba modificado, devuelve false.
 */
export function isDocsOnlyWorkspaceChange(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): boolean {
  try {
    const raw = execFileSyncFn('git', ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'], {
      cwd: path.resolve(projectPath),
      encoding: 'utf8',
    });
    const lines = String(raw)
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      return false;
    }

    const filePaths = lines
      .flatMap((line) => extractPathsFromPorcelainLine(line))
      .filter((fp) => !isEphemeralQaArtifactPath(fp));

    return filePaths.length > 0 && filePaths.every((fp) => isDocFilePath(fp));
  } catch (err: unknown) {
    // Fail-secure: if git status fails or workspace is not a git repo, never skip QA via DOCS_ONLY fast-path
    reportDebugCatchError('ephemeralRunner.isDocsOnlyWorkspaceChange', err);
    return false;
  }
}

/**
 * Tool 7: run_ephemeral_qa
 * Ejecuta de forma segura e inyectable un target de pruebas del Makefile
 * dentro de contenedores Docker efímeros (Rule Zero) y resume la salida
 * mediante los parsers ahorradores de tokens. Soporta Fast-Path Documental (skipIfDocsOnly)
 * y fallback seguro a Docker Compose cuando GNU make no está disponible (ENOENT).
 */
function buildDocsOnlySkippedResult(stage: string): QaExecutionResult {
  return {
    status: 'SKIPPED',
    stage,
    exit_code: 0,
    duration_ms: 0,
    coverage: {
      detected: false,
      percent: 0,
      threshold: 95.0,
      passed: false,
      uncovered_files: [],
    },
    failed_tests: [],
    linter_and_complexity_issues: [],
    security_alerts: { critical: 0, high: 0 },
    mutation_summary: null,
    tail_log: `✔ [Fast-Path Docs-Only] Solo se detectaron cambios en documentación (*.md / docs/); se omite 'make qa-${stage}' en Docker.`,
  };
}

function shouldEnforceDockerGuards(options?: RunEphemeralQaOptions): boolean {
  if (options?.guardrails?.enabled !== undefined) {
    return options.guardrails.enabled;
  }
  return !options?.execFileFn && process.env.QA_DISABLE_DOCKER_GUARDS !== '1';
}

function buildGuardBlockedResult(
  stage: string,
  summary: string,
  exitCode: number
): QaExecutionResult {
  const result = buildStructuredFailureResult({
    stage,
    testName: `qa-${stage}:docker-guardrail`,
    errorSummary: summary,
    tailLog: summary,
  });
  result.exit_code = exitCode;
  return result;
}

function prependGuardNotes(result: QaExecutionResult, notes: readonly string[]): QaExecutionResult {
  if (notes.length === 0) return result;
  return {
    ...result,
    tail_log: `${notes.join('\n')}\n${result.tail_log}`.trim(),
  };
}

interface CoreStageExecInput {
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutSeconds: number;
  readonly startTime: number;
  readonly executor: typeof execFile;
  readonly options?: RunEphemeralQaOptions;
}

function makefileDefinesTarget(content: string, target: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith(target)) continue;
    const rest = line.slice(target.length).trimStart();
    if (rest.startsWith(':') && !rest.startsWith(':=')) {
      return true;
    }
  }
  return false;
}

function resolveMakefileStageTarget(makefilePath: string, stage: string): string {
  const prefixed = `qa-${stage}`;
  try {
    const content = fs.readFileSync(makefilePath, 'utf8');
    if (makefileDefinesTarget(content, prefixed)) {
      return prefixed;
    }
    if (makefileDefinesTarget(content, stage)) {
      return stage;
    }
  } catch (err: unknown) {
    reportDebugCatchError('ephemeralRunner.resolveMakefileStageTarget', err);
  }
  return prefixed;
}

async function executeQaStageCore(input: CoreStageExecInput): Promise<QaExecutionResult> {
  const { resolvedPath, stage, timeoutSeconds, startTime, executor, options } = input;
  const execFileSyncFn = options?.execFileSyncFn;
  const signal = options?.signal;
  const makefilePath = path.join(resolvedPath, 'Makefile');
  const timeoutMs = timeoutSeconds * 1000;

  if (!fs.existsSync(makefilePath)) {
    return runMissingMakefileFallback({
      executor,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      expectRed: options?.expectRed,
      signal,
    });
  }

  const target = resolveMakefileStageTarget(makefilePath, stage);
  prepareCoverageCacheForStage(resolvedPath, stage);

  const makeRes = await execCommand({
    executor,
    binary: MAKE_BINARY,
    args: [target],
    cwd: resolvedPath,
    timeoutMs,
    signal,
    env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' },
  });
  if (makeRes.errorCode === 'ENOENT') {
    return runMakeEnoentFallback({
      executor,
      makefilePath,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      expectRed: options?.expectRed,
      signal,
    });
  }

  if (makeRes.exitCode === 124 || signal?.aborted) {
    await teardownWorkspaceComposeOnAbort(executor, resolvedPath);
  }

  harvestCoverageForStage(resolvedPath, stage);

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(makeRes.stdout, makeRes.stderr, stage, {
    durationMs,
    exitCode: makeRes.exitCode,
  });
  if (makeRes.exitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución de 'make ${target}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  }
  return applyStageTrackingAndEvidence(resolvedPath, stage, parsed, {
    execFileSyncFn,
    expectRed: options?.expectRed,
  });
}

export async function runEphemeralQa(
  projectPath: string,
  stage: string,
  timeoutSeconds = 300,
  options?: RunEphemeralQaOptions
): Promise<QaExecutionResult> {
  const resolvedPath = resolveSafeProjectPath(projectPath);
  const execFileSyncFn = options?.execFileSyncFn;
  const signal = options?.signal;

  if (options?.skipIfDocsOnly && isDocsOnlyWorkspaceChange(resolvedPath, execFileSyncFn)) {
    return buildDocsOnlySkippedResult(stage);
  }

  const executor = options?.execFileFn || execFile;
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  assertNoSymlinkSegments(resolvedPath, '.agents');

  if (!shouldEnforceDockerGuards(options)) {
    return executeQaStageCore({ resolvedPath, stage, timeoutSeconds, startTime, executor, options });
  }

  const preFlight = runPreFlightDockerGuards(resolvedPath, options?.guardrails);
  if (preFlight.blocked) {
    return buildGuardBlockedResult(
      stage,
      preFlight.summary ?? 'Guardrail Docker activo: ejecución pospuesta.',
      preFlight.exitCode
    );
  }

  const slot = await acquireDockerSlotLock({
    resolvedPath,
    stage,
    timeoutMs,
    signal,
    deps: options?.guardrails,
  });
  if (!slot) {
    return buildGuardBlockedResult(
      stage,
      `[TIMEOUT] La cola serializada Docker QA (${stage}) excedió el límite de espera de ${timeoutSeconds}s.`,
      124
    );
  }

  try {
    const result = await executeQaStageCore({
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      executor,
      options,
    });
    return prependGuardNotes(result, preFlight.notes);
  } finally {
    slot.release();
  }
}
