// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { pickAt } from '../utils/diagnosticFormatter.js';
import { hasHelpFlag, matchFlagValue } from './cliArgHelpers.js';
import {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  buildLanguagePolicyLine,
  buildThinConnectorBlock,
  buildConnectorBlock,
  buildGlobalGeminiBlock,
  mergeOrAppendAgentsMdContent,
  resolveProjectDisplayName,
  syncGlobalGeminiMd,
} from '../services/agents-connector.js';
import {
  initOrAppendAgentsMd,
  parseAgentsOption,
  type InitOrAppendAgentsMdResult,
} from '../tools/initOrAppendAgentsMd.js';
import type {
  AgentsTargetSpec,
  InitAgentsMdOptions,
  InitAgentsMdResult,
  InitAgentsAction,
  OutputLanguageMode,
} from '../types.js';

export {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  buildLanguagePolicyLine,
  buildThinConnectorBlock,
  buildConnectorBlock,
  buildGlobalGeminiBlock,
  initOrAppendAgentsMd,
  mergeOrAppendAgentsMdContent,
  resolveProjectDisplayName,
  syncGlobalGeminiMd,
};

const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const DRY_RUN_FLAG = '--dry-run';
const HELP_FLAG = '--help';
const HELP_SHORT_FLAG = '-h';
const PROJECT_PATH_FLAGS = new Set(['--project-path', '--dir', '-p']);
const LANG_FLAGS = new Set(['--lang', '-l']);
const AGENTS_FLAGS = new Set(['--agents', '-a']);

export const INIT_AGENTS_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x init-agents [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, --dir, -p <dir>  Directorio del proyecto destino (por defecto: cwd)',
  '  --lang, -l <auto|es|en>          Política de idioma en AGENTS.md (por defecto: auto)',
  '  --agents, -a <spec>              Puentes opcionales (auto | all | lista CSV de 28 agentes)',
  '  --dry-run                        Simula sin modificar archivos en disco',
  '  --help, -h                       Muestra esta ayuda y sale con código 0',
].join('\n');

export type { InitAgentsMdOptions, InitAgentsMdResult, InitAgentsAction, OutputLanguageMode };

function resolveLangOption(rawLang: string | undefined): OutputLanguageMode {
  const normalizedRaw = rawLang && rawLang !== 'undefined' ? rawLang : 'auto';
  const selectedLang = normalizedRaw.trim().toLowerCase();
  if (selectedLang !== 'auto' && selectedLang !== 'es' && selectedLang !== 'en') {
    throw new Error(`Modo de idioma no válido: '${rawLang}'. Valores permitidos: auto, es, en.`);
  }
  return selectedLang;
}

function formatMissingInitFlag(flag: string): string {
  return `Falta el valor requerido para la opción '${flag}'.`;
}

interface InitAgentsCliParseState {
  projectPath: string;
  hasPositionalDir: boolean;
  dryRun: boolean;
  rawLang: string | undefined;
  rawAgents: string | undefined;
}

const INIT_AGENTS_VALUE_FLAG_HANDLERS: ReadonlyArray<{
  readonly flags: ReadonlySet<string>;
  readonly assign: (state: InitAgentsCliParseState, value: string) => void;
}> = [
  {
    flags: PROJECT_PATH_FLAGS,
    assign: (state, value) => {
      state.projectPath = value;
    },
  },
  {
    flags: LANG_FLAGS,
    assign: (state, value) => {
      state.rawLang = value;
    },
  },
  {
    flags: AGENTS_FLAGS,
    assign: (state, value) => {
      state.rawAgents = value;
    },
  },
];

function matchInitAgentsValueFlag(
  args: readonly string[],
  index: number,
  state: InitAgentsCliParseState
): number | null {
  for (const spec of INIT_AGENTS_VALUE_FLAG_HANDLERS) {
    const matched = matchFlagValue(args, index, spec.flags, formatMissingInitFlag);
    if (matched) {
      spec.assign(state, matched.value);
      return matched.consumed;
    }
  }
  return null;
}

function assignInitAgentsPositional(arg: string, state: InitAgentsCliParseState): number {
  if (arg.startsWith('-')) {
    throw new Error(`Opción CLI desconocida en init-agents: '${arg}'. Ejecuta con --help para ver las opciones válidas.`);
  }
  if (state.hasPositionalDir) {
    throw new Error(`Argumento posicional inesperado en init-agents: '${arg}'.`);
  }
  state.projectPath = arg;
  state.hasPositionalDir = true;
  return 0;
}

function consumeInitAgentsToken(
  args: string[],
  index: number,
  state: InitAgentsCliParseState
): number {
  const arg = pickAt(args, index);
  if (arg === DRY_RUN_FLAG) {
    state.dryRun = true;
    return 0;
  }
  if (arg === HELP_FLAG || arg === HELP_SHORT_FLAG) {
    return 0;
  }
  const valueConsumed = matchInitAgentsValueFlag(args, index, state);
  if (valueConsumed !== null) {
    return valueConsumed;
  }
  return assignInitAgentsPositional(arg, state);
}

const INIT_TRAVERSAL_SEG_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

function resolveInitProjectPath(rawPath: string, defaultCwd: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed || path.isAbsolute(trimmed) || INIT_TRAVERSAL_SEG_RE.test(trimmed)) {
    return trimmed;
  }
  return path.resolve(defaultCwd, trimmed);
}

export function parseInitAgentsArgs(
  args: string[],
  defaultCwd: string = process.cwd()
): {
  projectPath: string;
  dryRun: boolean;
  lang: OutputLanguageMode;
  agents?: AgentsTargetSpec;
} {
  const state: InitAgentsCliParseState = {
    projectPath: defaultCwd,
    hasPositionalDir: false,
    dryRun: false,
    rawLang: process.env.QA_OUTPUT_LANG,
    rawAgents: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    i += consumeInitAgentsToken(args, i, state);
  }

  return {
    projectPath: resolveInitProjectPath(state.projectPath, defaultCwd),
    dryRun: state.dryRun,
    lang: resolveLangOption(state.rawLang),
    ...(state.rawAgents !== undefined ? { agents: parseAgentsOption(state.rawAgents) } : {}),
  };
}

export interface InitAgentsCliDeps {
  readonly cwd?: string;
  readonly log?: (msg: string) => void;
  readonly quietBanner?: boolean;
}

function logInitAgentsBanner(
  log: (msg: string) => void,
  quietBanner: boolean | undefined,
  opts: { readonly projectPath: string; readonly lang: OutputLanguageMode; readonly dryRun: boolean }
): void {
  if (quietBanner) {
    return;
  }
  log(DIVIDER);
  log('   🔗 Conector AGENTS.md QA 11X (Node.js / MCP CLI)                   ');
  log(`${DIVIDER}\n`);
  log(`📍 Proyecto objetivo: ${opts.projectPath}`);
  log(`🌐 Política de idioma (--lang): ${opts.lang}`);
  if (opts.dryRun) {
    log('🔍 Modo Simulación (--dry-run): no se escribirán cambios en disco.\n');
  }
}

function logInitAgentsSummary(
  log: (msg: string) => void,
  quietBanner: boolean | undefined,
  result: InitOrAppendAgentsMdResult
): void {
  if (quietBanner) {
    return;
  }
  const stacksMsg = result.detected_stacks.join(', ') || 'ninguno';
  log(`✔ Stacks detectados: ${stacksMsg}`);
  log(`✔ Archivo destino: ${result.agents_md_path}`);
  log(`✔ Acción ejecutada: ${result.action}`);
  log(DIVIDER);
  log('   ✅ Proceso de Conexión Finalizado Exitosamente                     ');
  log(`${DIVIDER}\n`);
}

/** Executes `init-agents` CLI parsing and non-destructive connector injection, returning the result. */
export async function executeInitAgentsCli(
  args: string[],
  deps: InitAgentsCliDeps = {}
): Promise<InitOrAppendAgentsMdResult | undefined> {
  const log = deps.log ?? console.log;
  if (hasHelpFlag(args)) {
    log(INIT_AGENTS_HELP_TEXT);
    return undefined;
  }
  const { projectPath, dryRun, lang, agents } = parseInitAgentsArgs(args, deps.cwd);
  logInitAgentsBanner(log, deps.quietBanner, { projectPath, lang, dryRun });

  const result = await initOrAppendAgentsMd({
    projectPath,
    dryRun,
    lang,
    ...(agents !== undefined ? { agents } : {}),
  });

  logInitAgentsSummary(log, deps.quietBanner, result);
  return result;
}

export async function runInitAgentsCli(args: string[]): Promise<void> {
  await executeInitAgentsCli(args);
}
