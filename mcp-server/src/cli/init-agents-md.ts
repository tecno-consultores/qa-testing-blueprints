// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { pickAt } from '../utils/diagnosticFormatter.js';
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
const PROJECT_PATH_FLAG = '--project-path';
const PROJECT_PATH_SHORT_FLAG = '-p';
const LANG_FLAG = '--lang';
const LANG_SHORT_FLAG = '-l';
const AGENTS_FLAG = '--agents';
const AGENTS_SHORT_FLAG = '-a';

export const INIT_AGENTS_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x init-agents [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, -p <dir>  Directorio del proyecto destino (por defecto: cwd)',
  '  --lang, -l <auto|es|en>   Política de idioma en AGENTS.md (por defecto: auto)',
  '  --agents, -a <spec>       Puentes opcionales (auto | all | lista CSV de 28 agentes)',
  '  --dry-run                 Simula sin modificar archivos en disco',
  '  --help, -h                Muestra esta ayuda y sale con código 0',
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

function extractOptionValue(
  args: string[],
  index: number,
  longFlag: string,
  shortFlag: string
): { value: string; consumed: number } | null {
  const arg = pickAt(args, index);
  if (arg === longFlag || arg === shortFlag) {
    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith('-')) {
      throw new Error(`Falta el valor requerido para la opción '${arg}'.`);
    }
    return { value: nextValue, consumed: 1 };
  }
  if (arg.startsWith(`${longFlag}=`)) {
    const inlineValue = arg.slice(longFlag.length + 1);
    if (!inlineValue) {
      throw new Error(`Falta el valor requerido para la opción '${longFlag}'.`);
    }
    return { value: inlineValue, consumed: 0 };
  }
  return null;
}

interface InitAgentsCliParseState {
  projectPath: string;
  hasPositionalDir: boolean;
  dryRun: boolean;
  rawLang: string | undefined;
  rawAgents: string | undefined;
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
  const pathOpt = extractOptionValue(args, index, PROJECT_PATH_FLAG, PROJECT_PATH_SHORT_FLAG);
  if (pathOpt) {
    state.projectPath = pathOpt.value;
    return pathOpt.consumed;
  }
  const langOpt = extractOptionValue(args, index, LANG_FLAG, LANG_SHORT_FLAG);
  if (langOpt) {
    state.rawLang = langOpt.value;
    return langOpt.consumed;
  }
  const agentsOpt = extractOptionValue(args, index, AGENTS_FLAG, AGENTS_SHORT_FLAG);
  if (agentsOpt) {
    state.rawAgents = agentsOpt.value;
    return agentsOpt.consumed;
  }
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

export function parseInitAgentsArgs(args: string[]): {
  projectPath: string;
  dryRun: boolean;
  lang: OutputLanguageMode;
  agents?: AgentsTargetSpec;
} {
  const state: InitAgentsCliParseState = {
    projectPath: process.cwd(),
    hasPositionalDir: false,
    dryRun: false,
    rawLang: process.env.QA_OUTPUT_LANG,
    rawAgents: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    i += consumeInitAgentsToken(args, i, state);
  }

  return {
    projectPath: state.projectPath,
    dryRun: state.dryRun,
    lang: resolveLangOption(state.rawLang),
    ...(state.rawAgents !== undefined ? { agents: parseAgentsOption(state.rawAgents) } : {}),
  };
}

export async function runInitAgentsCli(args: string[]): Promise<void> {
  if (args.includes(HELP_FLAG) || args.includes(HELP_SHORT_FLAG)) {
    console.log(INIT_AGENTS_HELP_TEXT);
    return;
  }
  const { projectPath, dryRun, lang, agents } = parseInitAgentsArgs(args);

  console.log(DIVIDER);
  console.log('   🔗 Conector AGENTS.md QA 11X (Node.js / MCP CLI)                   ');
  console.log(`${DIVIDER}\n`);

  console.log(`📍 Proyecto objetivo: ${projectPath}`);
  console.log(`🌐 Política de idioma (--lang): ${lang}`);
  if (dryRun) {
    console.log('🔍 Modo Simulación (--dry-run): no se escribirán cambios en disco.\n');
  }

  const result = await initOrAppendAgentsMd({
    projectPath,
    dryRun,
    lang,
    ...(agents !== undefined ? { agents } : {}),
  });

  const stacksMsg = result.detected_stacks.join(', ') || 'ninguno';
  console.log(`✔ Stacks detectados: ${stacksMsg}`);
  console.log(`✔ Archivo destino: ${result.agents_md_path}`);
  console.log(`✔ Acción ejecutada: ${result.action}`);

  console.log(DIVIDER);
  console.log('   ✅ Proceso de Conexión Finalizado Exitosamente                     ');
  console.log(`${DIVIDER}\n`);
}
