// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { inspectAstBlastRadius } from '../tools/blast-radius.js';
import { isDocFilePath } from '../services/qa-evidence.js';
import type { BlastRadiusResult } from '../types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  matchFlagValue,
  resolveCliProjectPath,
  stripValidatedLangFlags,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';

export type BlastRoutingPath = 'DOCS_ONLY' | 'MICRO_CHANGE' | 'FULL_11X';

export interface BlastRadiusCliDeps {
  readonly cwd?: string;
  readonly graphBuilder?: (projectPath: string, signal?: AbortSignal) => boolean | Promise<boolean>;
}

const CMD_PREFIX = '❌ [blast-radius]';

export const BLAST_RADIUS_HELP_TEXT = renderSubcommandHelpText('blast-radius', 'en');

interface BlastCliParseState {
  symbol?: string;
  projectDir?: string;
  changedSinceRef?: string;
  autoBuildIfMissing: boolean;
  refreshGraph: boolean;
  includeGitSignals: boolean;
  maxTokensBudget?: number;
  maxItems?: number;
  json: boolean;
}

type BlastValueHandler = (val: string, state: BlastCliParseState, flag: string) => void;

function parsePositiveInt(raw: string, flagName: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`El flag ${flagName} requiere un entero positivo.`);
  }
  return parsed;
}

const VALUE_FLAG_HANDLERS: Readonly<Record<string, BlastValueHandler>> = Object.assign<
  Record<string, BlastValueHandler>,
  Record<string, BlastValueHandler>
>(Object.create(null) as Record<string, BlastValueHandler>, {
  '--symbol': (val, state) => {
    state.symbol = val;
  },
  '-s': (val, state) => {
    state.symbol = val;
  },
  '--project-path': (val, state) => {
    state.projectDir = val;
  },
  '--dir': (val, state) => {
    state.projectDir = val;
  },
  '-p': (val, state) => {
    state.projectDir = val;
  },
  '--changed-since': (val, state) => {
    state.changedSinceRef = val;
  },
  '--max-tokens': (val, state, flag) => {
    state.maxTokensBudget = parsePositiveInt(val, flag);
  },
  '--max-items': (val, state, flag) => {
    state.maxItems = parsePositiveInt(val, flag);
  },
});

const BOOL_FLAG_HANDLERS: Readonly<Record<string, (state: BlastCliParseState) => void>> = {
  '--auto-build': (state) => {
    state.autoBuildIfMissing = true;
  },
  '--refresh': (state) => {
    state.refreshGraph = true;
  },
  '--git-signals': (state) => {
    state.includeGitSignals = true;
  },
  '--json': (state) => {
    state.json = true;
  },
};

const VALUE_FLAG_KEYS = Object.keys(VALUE_FLAG_HANDLERS);

function assignBlastPositional(token: string, state: BlastCliParseState): number {
  if (token.startsWith('-')) {
    throw new Error(`Opción desconocida en blast-radius: '${token}'.`);
  }
  if (state.symbol !== undefined) {
    throw new Error(`Argumento posicional inesperado en blast-radius: '${token}'.`);
  }
  state.symbol = token;
  return 0;
}

function applyBlastToken(
  args: readonly string[],
  index: number,
  state: BlastCliParseState
): number {
  const token = pickAt(args, index);
  const boolHandler = Object.hasOwn(BOOL_FLAG_HANDLERS, token)
    ? BOOL_FLAG_HANDLERS[token]
    : undefined;
  if (boolHandler) {
    boolHandler(state);
    return 0;
  }
  const valueMatch = matchFlagValue(args, index, VALUE_FLAG_KEYS);
  if (valueMatch) {
    const handler = VALUE_FLAG_HANDLERS[valueMatch.flag];
    handler?.(valueMatch.value, state, valueMatch.flag);
    return valueMatch.consumed;
  }
  return assignBlastPositional(token, state);
}

function parseBlastRadiusArgs(args: readonly string[]): BlastCliParseState {
  const cleanArgs = stripValidatedLangFlags(args);
  const state: BlastCliParseState = {
    autoBuildIfMissing: false,
    refreshGraph: false,
    includeGitSignals: false,
    json: false,
  };
  for (let i = 0; i < cleanArgs.length; i += 1) {
    i += applyBlastToken(cleanArgs, i, state);
  }
  return state;
}

function computeBlastRoutingPath(result: BlastRadiusResult): BlastRoutingPath {
  const diffFiles = result.diff_bundle?.files;
  if (diffFiles && diffFiles.length > 0 && diffFiles.every((entry) => isDocFilePath(entry.file))) {
    return 'DOCS_ONLY';
  }
  if (
    result.risk_level === 'LOW' &&
    result.dependent_files_count < 5 &&
    (diffFiles?.length ?? 0) <= 3
  ) {
    return 'MICRO_CHANGE';
  }
  return 'FULL_11X';
}

function appendBlastOptionalLines(lines: string[], result: BlastRadiusResult): void {
  if (result.dependent_files.length > 0) {
    lines.push(`📦 dependents: ${result.dependent_files.join(', ')}`);
  }
  if (result.suggested_tests_to_run.length > 0) {
    lines.push(`🧪 tests: ${result.suggested_tests_to_run.join(', ')}`);
  }
  if (result.git_signals) {
    lines.push(
      `🧭 git_signals: commits=${result.git_signals.commits_analyzed}, hotspots=${result.git_signals.hotspots.length}, coupling=${result.git_signals.temporal_coupling_pairs.length}, bus_factor=${result.git_signals.bus_factor_alerts.length}`
    );
  }
  if (result.ast_graph_action_required) {
    lines.push(result.ast_graph_action_required);
  }
}

function formatBlastText(result: BlastRadiusResult, recommendedPath: BlastRoutingPath): string {
  const graphStatus = result.ast_graph_detected ? 'detected' : 'missing';
  const symbolLabel = result.target_symbol || (result.git_signals ? '(git-signals)' : '(changed-since)');
  const lines = [
    `🔎 [blast-radius] symbol=${symbolLabel} | risk=${result.risk_level} | path=${recommendedPath} | dependents=${result.dependent_files_count}`,
    `📁 project=${result.project_path} | ast_graph=${graphStatus}`,
  ];
  appendBlastOptionalLines(lines, result);
  return lines.join('\n');
}

function buildBlastCommandOutput(result: BlastRadiusResult, asJson: boolean): CliCommandOutput {
  const recommended_path = computeBlastRoutingPath(result);
  return {
    exitCode: 0,
    output: asJson
      ? formatCliJson({ ...result, recommended_path })
      : formatBlastText(result, recommended_path),
  };
}

async function executeBlastInspection(
  parsed: BlastCliParseState,
  deps: BlastRadiusCliDeps
): Promise<CliCommandOutput> {
  if (!parsed.symbol && !parsed.changedSinceRef && !parsed.includeGitSignals) {
    return {
      exitCode: 1,
      output: `${CMD_PREFIX} Proporciona un símbolo o --changed-since <ref> (o --git-signals).`,
      isError: true,
    };
  }
  const targetSymbol = parsed.symbol ?? '';
  const projectPath = resolveCliProjectPath(parsed.projectDir, deps.cwd ?? process.cwd());
  const result = await inspectAstBlastRadius(projectPath, targetSymbol, parsed.maxItems, {
    autoBuildIfMissing: parsed.autoBuildIfMissing,
    refreshGraph: parsed.refreshGraph,
    changedSinceRef: parsed.changedSinceRef,
    maxTokensBudget: parsed.maxTokensBudget,
    includeGitSignals: parsed.includeGitSignals,
    graphBuilder: deps.graphBuilder,
  });
  return buildBlastCommandOutput(result, parsed.json);
}

export async function runBlastRadiusCli(
  args: readonly string[],
  deps: BlastRadiusCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('blast-radius', resolveCliHelpLang(args)),
    };
  }
  try {
    const parsed = parseBlastRadiusArgs(args);
    return await executeBlastInspection(parsed, deps);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      output: `${CMD_PREFIX} ${detail}`,
      isError: true,
    };
  }
}
