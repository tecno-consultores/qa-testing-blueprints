// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { pickAt } from '../utils/diagnosticFormatter.js';
import { hasHelpFlag, matchFlagValue } from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';
import {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  GLOBAL_CONNECTOR_TARGETS,
  buildLanguagePolicyLine,
  buildThinConnectorBlock,
  buildConnectorBlock,
  buildGlobalConnectorBlock,
  buildGlobalGeminiBlock,
  mergeOrAppendAgentsMdContent,
  resolveProjectDisplayName,
  syncGlobalAgentConnectors,
  syncGlobalGeminiMd,
} from '../services/agents-connector.js';
import {
  initOrAppendAgentsMd,
  parseAgentsOption,
  type InitOrAppendAgentsMdResult,
} from '../tools/initOrAppendAgentsMd.js';
import type {
  AgentsTargetSpec,
  BilingualMirrorsMode,
  InitAgentsMdOptions,
  InitAgentsMdResult,
  InitAgentsAction,
  OutputLanguageMode,
  StandardTier,
} from '../types.js';
import { parseStandardTier } from '../services/qa11xConfig.js';

export {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  GLOBAL_CONNECTOR_TARGETS,
  buildLanguagePolicyLine,
  buildThinConnectorBlock,
  buildConnectorBlock,
  buildGlobalConnectorBlock,
  buildGlobalGeminiBlock,
  initOrAppendAgentsMd,
  mergeOrAppendAgentsMdContent,
  resolveProjectDisplayName,
  syncGlobalAgentConnectors,
  syncGlobalGeminiMd,
};

const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const DRY_RUN_FLAG = '--dry-run';
const HELP_FLAG = '--help';
const HELP_SHORT_FLAG = '-h';
const PROJECT_PATH_FLAGS = new Set(['--project-path', '--dir', '-p']);
const LANG_FLAGS = new Set(['--lang', '-l']);
const AGENTS_FLAGS = new Set(['--agents', '-a']);
const TIER_FLAGS = new Set(['--tier', '-T']);
const GOVERNANCE_DOCS_FLAGS = new Set(['--governance-docs']);
const DECLINE_GOVERNANCE_DOCS_FLAGS = new Set(['--decline-governance-docs']);
const BILINGUAL_MIRRORS_FLAGS = new Set(['--bilingual-mirrors']);

export const INIT_AGENTS_HELP_TEXT = renderSubcommandHelpText('init-agents', 'en');

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
  rawTier: string | undefined;
  rawGovernanceDocs: string | undefined;
  rawDeclineGovernanceDocs: string | undefined;
  rawBilingualMirrors: string | undefined;
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
  {
    flags: TIER_FLAGS,
    assign: (state, value) => {
      state.rawTier = value;
    },
  },
  {
    flags: GOVERNANCE_DOCS_FLAGS,
    assign: (state, value) => {
      state.rawGovernanceDocs = value;
    },
  },
  {
    flags: DECLINE_GOVERNANCE_DOCS_FLAGS,
    assign: (state, value) => {
      state.rawDeclineGovernanceDocs = value;
    },
  },
  {
    flags: BILINGUAL_MIRRORS_FLAGS,
    assign: (state, value) => {
      state.rawBilingualMirrors = value;
    },
  },
];

function parseCsvListOption(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBilingualMirrorsOption(raw: string): { value: BilingualMirrorsMode } {
  const norm = raw.trim().toLowerCase();
  if (norm === 'auto') return { value: 'auto' };
  if (norm === 'true' || norm === '1' || norm === 'yes') return { value: true };
  if (norm === 'false' || norm === '0' || norm === 'no') return { value: false };
  throw new Error(`Valor inválido para --bilingual-mirrors: '${raw}'. Use auto, true o false.`);
}

function parseTierOption(raw: string): StandardTier {
  const parsed = parseStandardTier(raw);
  if (parsed === null) {
    throw new Error(`Tier no válido: '${raw}'. Valores permitidos: starter, standard, enterprise.`);
  }
  return parsed;
}

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
  lang?: OutputLanguageMode;
  agents?: AgentsTargetSpec;
  tier?: StandardTier;
  governanceDocs?: string[];
  declineGovernanceDocs?: string[];
  bilingualMirrors?: BilingualMirrorsMode;
} {
  const state: InitAgentsCliParseState = {
    projectPath: defaultCwd,
    hasPositionalDir: false,
    dryRun: false,
    rawLang: process.env.QA_OUTPUT_LANG,
    rawAgents: undefined,
    rawTier: undefined,
    rawGovernanceDocs: undefined,
    rawDeclineGovernanceDocs: undefined,
    rawBilingualMirrors: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    i += consumeInitAgentsToken(args, i, state);
  }

  const hasExplicitLang = state.rawLang !== undefined && state.rawLang !== 'undefined';
  return {
    projectPath: resolveInitProjectPath(state.projectPath, defaultCwd),
    dryRun: state.dryRun,
    ...(hasExplicitLang ? { lang: resolveLangOption(state.rawLang) } : {}),
    ...(state.rawAgents !== undefined ? { agents: parseAgentsOption(state.rawAgents) } : {}),
    ...(state.rawTier !== undefined ? { tier: parseTierOption(state.rawTier) } : {}),
    ...(state.rawGovernanceDocs !== undefined
      ? { governanceDocs: parseCsvListOption(state.rawGovernanceDocs) }
      : {}),
    ...(state.rawDeclineGovernanceDocs !== undefined
      ? { declineGovernanceDocs: parseCsvListOption(state.rawDeclineGovernanceDocs) }
      : {}),
    ...(state.rawBilingualMirrors !== undefined
      ? { bilingualMirrors: parseBilingualMirrorsOption(state.rawBilingualMirrors).value }
      : {}),
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
    log(renderSubcommandHelpText('init-agents', resolveCliHelpLang(args)));
    return undefined;
  }
  const {
    projectPath,
    dryRun,
    lang,
    agents,
    tier,
    governanceDocs,
    declineGovernanceDocs,
    bilingualMirrors,
  } = parseInitAgentsArgs(args, deps.cwd);
  logInitAgentsBanner(log, deps.quietBanner, { projectPath, lang: lang ?? 'auto', dryRun });

  const result = await initOrAppendAgentsMd({
    projectPath,
    dryRun,
    ...(lang !== undefined ? { lang } : {}),
    ...(agents !== undefined ? { agents } : {}),
    ...(tier !== undefined ? { tier } : {}),
    ...(governanceDocs !== undefined ? { governanceDocs } : {}),
    ...(declineGovernanceDocs !== undefined ? { declineGovernanceDocs } : {}),
    ...(bilingualMirrors !== undefined ? { bilingualMirrors } : {}),
  });

  logInitAgentsSummary(log, deps.quietBanner, result);
  return result;
}

export async function runInitAgentsCli(args: string[]): Promise<void> {
  await executeInitAgentsCli(args);
}
