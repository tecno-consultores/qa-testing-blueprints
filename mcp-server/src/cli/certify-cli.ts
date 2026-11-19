// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { certify11xGate } from '../tools/certify-gate.js';
import {
  DECISION_NO_GO,
  evaluateReleaseReadiness,
  type ReleaseGateEvaluationResult,
} from '../tools/evaluateReleaseGate.js';
import type { CertifyGateResult } from '../types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  type FlagValueMatch,
  formatCliJson,
  hasHelpFlag,
  matchFlagValue,
  resolveCliProjectPath,
} from './cliArgHelpers.js';

const PREFIX_ERROR = '❌ [certify]';
const STRICT_SKIPPED_PREFIX = 'STRICT_SKIPPED_CHECK:';
const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_STRICT = '--strict';
const FLAG_REQUIRE_LINT = '--require-lint-evidence';
const FLAG_ALLOW_EXAMPLES = '--allow-unmerged-examples';
const FLAG_RELEASE_GATE = '--release-gate';
const FLAG_JUNIT_XML = '--junit-xml';
const FLAG_OFFLINE = '--offline';
const FLAG_JSON = '--json';

export const CERTIFY_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x certify [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, -p <dir>  Directorio del proyecto a certificar (por defecto: cwd)',
  '  --strict                  Falla con exitCode=20 si alguna verificación queda en SKIPPED',
  '  --require-lint-evidence   Exige evidencia reciente de lint si hay código sucio',
  '  --allow-unmerged-examples Omite verificación de archivos .example sin fusionar',
  '  --release-gate            Evalúa además compuerta Release Readiness (exitCode=30 en NO_GO)',
  '  --junit-xml <path>        Ruta relativa de reporte JUnit XML para --release-gate',
  '  --offline                 Omite consulta remota de actualizaciones',
  '  --json                    Emite resultado estructurado en JSON',
  '  --help, -h                Muestra esta ayuda y sale con código 0',
].join('\n');

export interface CertifyCliDeps {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly fetchFn?: typeof fetch;
}

interface ParsedCertifyArgs {
  rawDir: string | undefined;
  strict: boolean;
  requireLintEvidence: boolean;
  allowUnmergedExamples: boolean;
  releaseGate: boolean;
  junitXmlPath: string | undefined;
  offline: boolean;
  json: boolean;
}

const CERTIFY_BOOL_FLAGS: Readonly<Record<string, (state: ParsedCertifyArgs) => void>> = {
  [FLAG_STRICT]: (state) => {
    state.strict = true;
  },
  [FLAG_REQUIRE_LINT]: (state) => {
    state.requireLintEvidence = true;
  },
  [FLAG_ALLOW_EXAMPLES]: (state) => {
    state.allowUnmergedExamples = true;
  },
  [FLAG_RELEASE_GATE]: (state) => {
    state.releaseGate = true;
  },
  [FLAG_OFFLINE]: (state) => {
    state.offline = true;
  },
  [FLAG_JSON]: (state) => {
    state.json = true;
  },
};

const CERTIFY_VALUE_FLAGS = new Set([
  FLAG_PROJECT_PATH,
  FLAG_PROJECT_PATH_SHORT,
  '--dir',
  FLAG_JUNIT_XML,
]);

function assignCertifyValue(valueMatch: FlagValueMatch, state: ParsedCertifyArgs): number {
  if (valueMatch.flag === FLAG_JUNIT_XML) {
    state.junitXmlPath = valueMatch.value;
  } else {
    state.rawDir = valueMatch.value;
  }
  return valueMatch.consumed;
}

function assignCertifyPositional(arg: string, state: ParsedCertifyArgs): number {
  if (arg.startsWith('-')) {
    throw new Error(`Opción desconocida en certify: '${arg}'.`);
  }
  if (state.rawDir !== undefined) {
    throw new Error(`Argumento posicional inesperado: '${arg}'.`);
  }
  state.rawDir = arg;
  return 0;
}

function applyCertifyArg(
  args: readonly string[],
  index: number,
  state: ParsedCertifyArgs
): number {
  const arg = pickAt(args, index);
  const boolAction = CERTIFY_BOOL_FLAGS[arg];
  if (boolAction) {
    boolAction(state);
    return 0;
  }
  const valueMatch = matchFlagValue(args, index, CERTIFY_VALUE_FLAGS);
  if (valueMatch) {
    return assignCertifyValue(valueMatch, state);
  }
  return assignCertifyPositional(arg, state);
}

function parseCertifyArgs(args: readonly string[]): ParsedCertifyArgs {
  const state: ParsedCertifyArgs = {
    rawDir: undefined,
    strict: false,
    requireLintEvidence: false,
    allowUnmergedExamples: false,
    releaseGate: false,
    junitXmlPath: undefined,
    offline: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    i += applyCertifyArg(args, i, state);
  }
  return state;
}

function computeCertifyExitCode(
  certifyResult: CertifyGateResult,
  strict: boolean,
  releaseGateResult: ReleaseGateEvaluationResult | undefined
): number {
  const hardBlockers = certifyResult.blockers.filter((b) => !b.startsWith(STRICT_SKIPPED_PREFIX));
  if (hardBlockers.length > 0) {
    return 1;
  }
  const skippedOnlyBlockers = certifyResult.blockers.filter((b) =>
    b.startsWith(STRICT_SKIPPED_PREFIX)
  );
  if (strict && skippedOnlyBlockers.length > 0) {
    return 20;
  }
  if (releaseGateResult?.decision === DECISION_NO_GO) {
    return 30;
  }
  return 0;
}

function formatCertifyText(
  exitCode: number,
  certifyResult: CertifyGateResult,
  releaseGateResult: ReleaseGateEvaluationResult | undefined
): string {
  if (exitCode === 0) {
    const gateNote = releaseGateResult ? ` | release=${releaseGateResult.decision}` : '';
    const lines = [
      `✔ [Pass-Quiet] stage=certify_11x_gate | project=${certifyResult.project_path}${gateNote} | exitCode=0`,
    ];
    if (certifyResult.update_available?.agent_notice) {
      lines.push(`  Actualización: ${certifyResult.update_available.agent_notice}`);
    }
    return lines.join('\n');
  }

  const lines = [
    `❌ [Fail-Verbose] stage=certify_11x_gate | project=${certifyResult.project_path} | exitCode=${exitCode}`,
  ];
  for (const blocker of certifyResult.blockers) {
    lines.push(`  - blocker: ${blocker}`);
  }
  if (releaseGateResult?.decision === DECISION_NO_GO) {
    lines.push(`  - release_gate: ${releaseGateResult.summary}`);
  }
  return lines.join('\n');
}

export async function runCertifyCli(
  args: readonly string[],
  deps: CertifyCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: CERTIFY_HELP_TEXT };
  }
  try {
    const parsed = parseCertifyArgs(args);
    const projectPath = resolveCliProjectPath(parsed.rawDir, deps.cwd ?? process.cwd());
    const certifyResult = await certify11xGate(projectPath, {
      strict: parsed.strict,
      requireLintEvidence: parsed.requireLintEvidence || parsed.strict,
      allowUnmergedExamples: parsed.allowUnmergedExamples,
      updateOptions: {
        homeDir: deps.homeDir,
        allowNetworkCheck: !parsed.offline,
        fetchFn: deps.fetchFn,
      },
    });

    const releaseGateResult = parsed.releaseGate
      ? evaluateReleaseReadiness({
          workspaceRoot: projectPath,
          scope: 'full',
          dryRun: false,
          ...(parsed.junitXmlPath !== undefined ? { junitXmlPath: parsed.junitXmlPath } : {}),
        })
      : undefined;

    const exitCode = computeCertifyExitCode(certifyResult, parsed.strict, releaseGateResult);
    const payload = {
      exit_code: exitCode,
      certify: certifyResult,
      ...(releaseGateResult ? { release_gate: releaseGateResult } : {}),
    };

    return {
      exitCode,
      output: parsed.json
        ? formatCliJson(payload)
        : formatCertifyText(exitCode, certifyResult, releaseGateResult),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
