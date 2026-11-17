// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  buildLanguagePolicyLine,
  buildThinConnectorBlock,
  buildConnectorBlock,
  buildGlobalGeminiBlock,
  mergeOrAppendAgentsMdContent,
  mergeGlobalGeminiContent,
  resolveProjectDisplayName,
} from '../services/agents-connector.js';
import {
  parseAgentsOption,
  syncAgentBridgeFiles,
  type SupportedLang,
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
  mergeOrAppendAgentsMdContent,
  resolveProjectDisplayName,
};

const AGENTS_MD_FILENAME = 'AGENTS.md';
const UTF8 = 'utf-8';
const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const DRY_RUN_FLAG = '--dry-run';
const PROJECT_PATH_FLAG = '--project-path';
const PROJECT_PATH_SHORT_FLAG = '-p';
const LANG_FLAG = '--lang';
const LANG_SHORT_FLAG = '-l';
const AGENTS_FLAG = '--agents';
const AGENTS_SHORT_FLAG = '-a';

export type { InitAgentsMdOptions, InitAgentsMdResult, InitAgentsAction, OutputLanguageMode };

export async function initOrAppendAgentsMd(
  options: InitAgentsMdOptions
): Promise<InitAgentsMdResult> {
  const resolvedPath = resolveSafeProjectPath(options.projectPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio especificado no existe: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolvedPath}`);
  }

  const inspection = await inspectProjectConfig(resolvedPath);
  const detectedStacks = inspection.detected_stacks;
  const projectName = resolveProjectDisplayName(resolvedPath);
  const agentsMdPath = path.join(resolvedPath, AGENTS_MD_FILENAME);

  let existingContent = '';
  if (fs.existsSync(agentsMdPath)) {
    existingContent = fs.readFileSync(agentsMdPath, UTF8);
  }

  const lang = options.lang ?? 'auto';
  const mergeRes = mergeOrAppendAgentsMdContent(existingContent, projectName, detectedStacks, lang);
  const isDryRun = Boolean(options.dryRun);
  const bridgeLang: SupportedLang = lang === 'en' ? 'en' : 'es';
  const bridgeSync =
    options.agents !== undefined
      ? syncAgentBridgeFiles(resolvedPath, options.agents, detectedStacks, {
          lang: bridgeLang,
          dryRun: isDryRun,
        })
      : undefined;

  if (!isDryRun) {
    fs.writeFileSync(agentsMdPath, mergeRes.finalContent, UTF8);
  }

  return {
    project_path: resolvedPath,
    agents_md_path: agentsMdPath,
    action: isDryRun ? 'dry_run' : mergeRes.action,
    detected_stacks: detectedStacks,
    content: mergeRes.finalContent,
    ...(bridgeSync
      ? { bridged_agents: bridgeSync.bridgedAgents, bridge_files: bridgeSync.bridgeFiles }
      : {}),
  };
}

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
  if (arg.startsWith(`${longFlag}=`)) {
    return { value: arg.slice(longFlag.length + 1), consumed: 0 };
  }
  const nextValue = args[index + 1];
  if ((arg === longFlag || arg === shortFlag) && nextValue) {
    return { value: nextValue, consumed: 1 };
  }
  return null;
}

interface InitAgentsCliParseState {
  projectPath: string;
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
  if (!arg.startsWith('-')) {
    state.projectPath = arg;
  }
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

export function syncGlobalGeminiMd(
  homeDir: string,
  dryRun = false,
  lang: OutputLanguageMode = 'auto'
): { updated: boolean; geminiMdPath: string } {
  const geminiDir = path.join(homeDir, '.gemini');
  const geminiMdPath = path.join(geminiDir, 'GEMINI.md');
  if (!fs.existsSync(geminiDir)) {
    return { updated: false, geminiMdPath };
  }

  const existing = fs.existsSync(geminiMdPath) ? fs.readFileSync(geminiMdPath, UTF8) : '';
  const finalContent = mergeGlobalGeminiContent(existing, lang);

  if (!dryRun) {
    fs.writeFileSync(geminiMdPath, finalContent, UTF8);
  }
  return { updated: true, geminiMdPath };
}
