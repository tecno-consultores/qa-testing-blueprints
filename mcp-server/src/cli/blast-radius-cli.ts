// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { inspectAstBlastRadius } from '../tools/blast-radius.js';
import type { BlastRadiusResult } from '../types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  readNextFlagValue,
  resolveCliProjectPath,
} from './cliArgHelpers.js';

export type BlastRoutingPath = 'DOCS_ONLY' | 'MICRO_CHANGE' | 'FULL_11X';

export interface BlastRadiusCliDeps {
  readonly cwd?: string;
  readonly graphBuilder?: (projectPath: string, signal?: AbortSignal) => boolean | Promise<boolean>;
}

const CMD_PREFIX = '❌ [blast-radius]';

export const BLAST_RADIUS_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x blast-radius [symbol] [opciones]',
  '',
  'Opciones:',
  '  --symbol, -s <symbol>     Símbolo o archivo objetivo para auditar radio de explosión AST',
  '  --project-path, -p <dir>  Directorio del proyecto destino (por defecto: cwd)',
  '  --changed-since <ref>     Referencia Git para evaluar diff semántico y ruta recomendada',
  '  --auto-build              Construye graphify-out/graph.json si no existe',
  '  --refresh                 Reconstruye el grafo AST antes de inspeccionar',
  '  --max-tokens <n>          Presupuesto máximo de tokens para el diff semántico',
  '  --max-items <n>           Máximo de dependientes/pruebas listados',
  '  --json                    Emite salida estructurada JSON con recommended_path',
  '  --help, -h                Muestra esta ayuda y sale con código 0',
].join('\n');

interface BlastCliParseState {
  symbol?: string;
  projectDir?: string;
  changedSinceRef?: string;
  autoBuildIfMissing: boolean;
  refreshGraph: boolean;
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

const VALUE_FLAG_HANDLERS: Readonly<Record<string, BlastValueHandler>> = {
  '--symbol': (val, state) => {
    state.symbol = val;
  },
  '-s': (val, state) => {
    state.symbol = val;
  },
  '--project-path': (val, state) => {
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
};

const BOOL_FLAG_HANDLERS: Readonly<Record<string, (state: BlastCliParseState) => void>> = {
  '--auto-build': (state) => {
    state.autoBuildIfMissing = true;
  },
  '--refresh': (state) => {
    state.refreshGraph = true;
  },
  '--json': (state) => {
    state.json = true;
  },
};

function parseBlastRadiusArgs(args: readonly string[]): BlastCliParseState {
  const state: BlastCliParseState = {
    autoBuildIfMissing: false,
    refreshGraph: false,
    json: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = pickAt(args, i);
    const boolHandler = BOOL_FLAG_HANDLERS[token];
    if (boolHandler) {
      boolHandler(state);
      continue;
    }
    const valueHandler = VALUE_FLAG_HANDLERS[token];
    if (valueHandler) {
      valueHandler(readNextFlagValue(args, i, token), state, token);
      i += 1;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Opción desconocida en blast-radius: '${token}'.`);
    }
    state.symbol = token;
  }
  return state;
}

function computeBlastRoutingPath(result: BlastRadiusResult): BlastRoutingPath {
  const diffFiles = result.diff_bundle?.files;
  if (
    diffFiles &&
    diffFiles.length > 0 &&
    diffFiles.every((entry) => entry.file.endsWith('.md') || entry.file.startsWith('docs/'))
  ) {
    return 'DOCS_ONLY';
  }
  if (result.risk_level === 'LOW' && result.dependent_files_count < 5) {
    return 'MICRO_CHANGE';
  }
  return 'FULL_11X';
}

function formatBlastText(result: BlastRadiusResult, recommendedPath: BlastRoutingPath): string {
  const graphStatus = result.ast_graph_detected ? 'detected' : 'missing';
  const lines = [
    `🔎 [blast-radius] symbol=${result.target_symbol} | risk=${result.risk_level} | path=${recommendedPath} | dependents=${result.dependent_files_count}`,
    `📁 project=${result.project_path} | ast_graph=${graphStatus}`,
  ];
  if (result.dependent_files.length > 0) {
    lines.push(`📦 dependents: ${result.dependent_files.join(', ')}`);
  }
  if (result.suggested_tests_to_run.length > 0) {
    lines.push(`🧪 tests: ${result.suggested_tests_to_run.join(', ')}`);
  }
  if (result.ast_graph_action_required) {
    lines.push(result.ast_graph_action_required);
  }
  return lines.join('\n');
}

export async function runBlastRadiusCli(
  args: readonly string[],
  deps: BlastRadiusCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: BLAST_RADIUS_HELP_TEXT };
  }
  try {
    const parsed = parseBlastRadiusArgs(args);
    if (!parsed.symbol && !parsed.changedSinceRef) {
      return {
        exitCode: 1,
        output: `${CMD_PREFIX} Proporciona un símbolo o --changed-since <ref>.`,
        isError: true,
      };
    }
    const targetSymbol = parsed.symbol ?? '.';
    const projectPath = resolveCliProjectPath(parsed.projectDir, deps.cwd ?? process.cwd());
    const result = await inspectAstBlastRadius(projectPath, targetSymbol, parsed.maxItems, {
      autoBuildIfMissing: parsed.autoBuildIfMissing,
      refreshGraph: parsed.refreshGraph,
      changedSinceRef: parsed.changedSinceRef,
      maxTokensBudget: parsed.maxTokensBudget,
      graphBuilder: deps.graphBuilder,
    });
    const recommended_path = computeBlastRoutingPath(result);
    return {
      exitCode: 0,
      output: parsed.json
        ? formatCliJson({ ...result, recommended_path })
        : formatBlastText(result, recommended_path),
    };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      output: `${CMD_PREFIX} ${detail}`,
      isError: true,
    };
  }
}
