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
  stripValidatedLangFlags,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';

const PREFIX_ERROR = '❌ [certify]';
const STRICT_SKIPPED_PREFIX = 'STRICT_SKIPPED_CHECK:';
const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_STRICT = '--strict';
const FLAG_REQUIRE_LINT = '--require-lint-evidence';
const FLAG_NO_REQUIRE_LINT = '--no-require-lint-evidence';
const FLAG_REQUIRE_UNIT = '--require-unit-evidence';
const FLAG_NO_REQUIRE_UNIT = '--no-require-unit-evidence';
const FLAG_ALLOW_EXAMPLES = '--allow-unmerged-examples';
const FLAG_RELEASE_GATE = '--release-gate';
const FLAG_JUNIT_XML = '--junit-xml';
const FLAG_OFFLINE = '--offline';
const FLAG_JSON = '--json';

export const CERTIFY_HELP_TEXT = renderSubcommandHelpText('certify', 'en');

export interface CertifyCliDeps {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly fetchFn?: typeof fetch;
}

interface ParsedCertifyArgs {
  rawDir: string | undefined;
  strict: boolean;
  requireLintEvidence: boolean;
  requireUnitEvidence: boolean;
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
  [FLAG_NO_REQUIRE_LINT]: (state) => {
    state.requireLintEvidence = false;
  },
  [FLAG_REQUIRE_UNIT]: (state) => {
    state.requireUnitEvidence = true;
  },
  [FLAG_NO_REQUIRE_UNIT]: (state) => {
    state.requireUnitEvidence = false;
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
  const boolAction = Object.hasOwn(CERTIFY_BOOL_FLAGS, arg) ? CERTIFY_BOOL_FLAGS[arg] : undefined;
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
  const cleanArgs = stripValidatedLangFlags(args);
  const state: ParsedCertifyArgs = {
    rawDir: undefined,
    strict: false,
    requireLintEvidence: true,
    requireUnitEvidence: true,
    allowUnmergedExamples: false,
    releaseGate: false,
    junitXmlPath: undefined,
    offline: false,
    json: false,
  };
  for (let i = 0; i < cleanArgs.length; i++) {
    i += applyCertifyArg(cleanArgs, i, state);
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
  const bannerLine = certifyResult.qa_11x_banner ? [certifyResult.qa_11x_banner] : [];
  if (exitCode === 0) {
    const gateNote = releaseGateResult ? ` | release=${releaseGateResult.decision}` : '';
    const lines = [
      ...bannerLine,
      `✔ [Pass-Quiet] stage=certify_11x_gate | project=${certifyResult.project_path}${gateNote} | exitCode=0`,
    ];
    if (certifyResult.update_available?.agent_notice) {
      lines.push(`  Actualización: ${certifyResult.update_available.agent_notice}`);
    }
    return lines.join('\n');
  }

  const lines = [
    ...bannerLine,
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
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('certify', resolveCliHelpLang(args)),
    };
  }
  try {
    const parsed = parseCertifyArgs(args);
    const projectPath = resolveCliProjectPath(parsed.rawDir, deps.cwd ?? process.cwd());
    const certifyResult = await certify11xGate(projectPath, {
      strict: parsed.strict,
      requireLintEvidence: parsed.requireLintEvidence || parsed.strict,
      requireUnitEvidence: parsed.requireUnitEvidence || parsed.strict,
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
