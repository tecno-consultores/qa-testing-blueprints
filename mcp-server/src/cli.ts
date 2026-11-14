// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import {
  initOrAppendAgentsMd,
  parseAgentsOption,
  SUPPORTED_AGENT_IDS,
  validateSupportedLang,
  type AgentsTargetSpec,
  type InitOrAppendAgentsMdResult,
  type SupportedLang,
} from './tools/initOrAppendAgentsMd.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { MCP_SERVER_VERSION } from './services/github-fetcher.js';

export { parseAgentsOption };

const FLAG_LANG = '--lang';
const FLAG_LANG_SHORT = '-l';
const FLAG_AGENTS = '--agents';
const FLAG_AGENTS_SHORT = '-a';
const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_TARGET = '--target';
const FLAG_TARGET_SHORT = '-t';
const FLAG_DRY_RUN = '--dry-run';
const FLAG_INIT_AGENTS = '--init-agents';
const FLAG_INCLUDE_SCRIPTS = '--include-scripts';
const FLAG_RECONCILE = '--reconcile';

const CMD_INIT_AGENTS = 'init-agents' as const;
const CMD_INSTALL_SKILL = 'install-skill' as const;
const CMD_RECONCILE_AGENTS = 'reconcile-agents' as const;
const CMD_HELP = 'help' as const;
const CMD_VERSION = 'version' as const;
const CMD_STDIO = 'stdio' as const;

export type CliCommandName =
  | typeof CMD_INIT_AGENTS
  | typeof CMD_INSTALL_SKILL
  | typeof CMD_RECONCILE_AGENTS
  | typeof CMD_HELP
  | typeof CMD_VERSION
  | typeof CMD_STDIO;

export interface ParsedCliArgs {
  readonly command: CliCommandName;
  readonly projectPath: string;
  readonly lang: SupportedLang;
  readonly agents?: AgentsTargetSpec;
  readonly target?: string;
  readonly dryRun: boolean;
  readonly initAgents: boolean;
  readonly includeScripts: boolean;
  readonly reconcile: boolean;
  readonly rawForwardArgs: readonly string[];
}

export type InstallSkillRunner = (args: string[]) => Promise<void>;
export type ReconcileAgentsRunner = (args: string[]) => Promise<void>;

export interface CliDeps {
  readonly cwd?: string;
  readonly isStdinTty?: boolean;
  readonly log?: (message: string) => void;
  readonly errorLog?: (message: string) => void;
  readonly installSkillRunner?: InstallSkillRunner;
  readonly reconcileRunner?: ReconcileAgentsRunner;
}

export interface CliRunResult {
  readonly exitCode: number;
  readonly command: CliCommandName;
  readonly mode?: 'tty-notice' | 'stdio-ready';
  readonly parsed?: ParsedCliArgs;
  readonly initResult?: InitOrAppendAgentsMdResult;
}

export const CLI_USAGE_TEXT = [
  `@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — QA 11X Multi-Agent Connector CLI`,
  '',
  'Commands:',
  '  init-agents       Create or update AGENTS.md and optional Thin-Repo agent bridges',
  '  install-skill     Install global 11X skills (pass --init-agents to sync connectors)',
  '  reconcile-agents  Deduplicate canonical rules in .agents/',
  '',
  'Options:',
  '  --lang, -l <es|en>               Output language policy (default: es)',
  `  --agents, -a <csv|auto|all>      Bridge target IDs (${SUPPORTED_AGENT_IDS.length} supported), auto, or all`,
  '  --project-path, -p <dir>         Target project directory (default: cwd)',
  '  --target, -t <env>               Global skills target directory',
  '  --init-agents                    Run init-agents after install-skill',
  '  --include-scripts                Install operational 11X scripts',
  '  --reconcile                      Reconcile .agents/ before syncing skills',
  '  --dry-run                        Simulate without writing files to disk',
  '  --version, -v                    Print active package version',
  '  --help, -h                       Print this help message',
].join('\n');

const SUBCOMMAND_MAP: Readonly<Record<string, CliCommandName>> = Object.freeze({
  'init-agents': CMD_INIT_AGENTS,
  'init-agents-md': CMD_INIT_AGENTS,
  'install-skill': CMD_INSTALL_SKILL,
  install: CMD_INSTALL_SKILL,
  'reconcile-agents': CMD_RECONCILE_AGENTS,
  '--help': CMD_HELP,
  '-h': CMD_HELP,
  help: CMD_HELP,
  '--version': CMD_VERSION,
  '-v': CMD_VERSION,
});

interface MutableParseState {
  projectPath: string;
  rawLang?: string;
  rawAgents?: string;
  target?: string;
  dryRun: boolean;
  initAgents: boolean;
  includeScripts: boolean;
  reconcile: boolean;
}

type ValueFlagField = 'rawLang' | 'rawAgents' | 'projectPath' | 'target';
type BooleanFlagField = 'dryRun' | 'initAgents' | 'includeScripts' | 'reconcile';

const VALUE_FLAG_FIELDS: Readonly<Record<string, ValueFlagField>> = Object.freeze({
  [FLAG_LANG]: 'rawLang',
  [FLAG_LANG_SHORT]: 'rawLang',
  [FLAG_AGENTS]: 'rawAgents',
  [FLAG_AGENTS_SHORT]: 'rawAgents',
  [FLAG_PROJECT_PATH]: 'projectPath',
  [FLAG_PROJECT_PATH_SHORT]: 'projectPath',
  [FLAG_TARGET]: 'target',
  [FLAG_TARGET_SHORT]: 'target',
});

const BOOLEAN_FLAG_FIELDS: Readonly<Record<string, BooleanFlagField>> = Object.freeze({
  [FLAG_DRY_RUN]: 'dryRun',
  [FLAG_INIT_AGENTS]: 'initAgents',
  [FLAG_INCLUDE_SCRIPTS]: 'includeScripts',
  [FLAG_RECONCILE]: 'reconcile',
});

function readFlagValue(
  argv: readonly string[],
  index: number,
  token: string
): { field: ValueFlagField; value: string; step: number } | null {
  const eqIdx = token.indexOf('=');
  if (eqIdx !== -1) {
    const flagName = token.slice(0, eqIdx);
    const field = VALUE_FLAG_FIELDS[flagName];
    if (!field) {
      return null;
    }
    const inlineValue = token.slice(eqIdx + 1);
    if (!inlineValue) {
      throw new Error(`Missing value for flag '${flagName}'.`);
    }
    return { field, value: inlineValue, step: 0 };
  }

  const field = VALUE_FLAG_FIELDS[token];
  if (!field) {
    return null;
  }
  const nextValue = argv[index + 1];
  if (nextValue === undefined || nextValue.startsWith('-')) {
    throw new Error(`Missing value for flag '${token}'.`);
  }
  return { field, value: nextValue, step: 1 };
}

function applyCliToken(
  argv: readonly string[],
  index: number,
  state: MutableParseState
): number {
  const token = argv[index];
  const boolField = BOOLEAN_FLAG_FIELDS[token];
  if (boolField) {
    state[boolField] = true;
    return 0;
  }

  const valueFlag = readFlagValue(argv, index, token);
  if (valueFlag) {
    state[valueFlag.field] = valueFlag.value;
    return valueFlag.step;
  }

  if (!token.startsWith('-')) {
    state.projectPath = token;
  }
  return 0;
}

export function parseCliArgs(
  argv: readonly string[],
  cwd: string = process.cwd()
): ParsedCliArgs {
  const first = argv[0];
  const state: MutableParseState = {
    projectPath: cwd,
    dryRun: false,
    initAgents: false,
    includeScripts: false,
    reconcile: false,
  };

  if (!first) {
    return {
      command: CMD_STDIO,
      projectPath: state.projectPath,
      lang: 'es',
      dryRun: false,
      initAgents: false,
      includeScripts: false,
      reconcile: false,
      rawForwardArgs: [],
    };
  }

  const command = SUBCOMMAND_MAP[first];
  if (!command) {
    throw new Error(`Unknown CLI subcommand '${first}'. Run with --help to view usage.`);
  }

  const tail = argv.slice(1);
  for (let i = 0; i < tail.length; i++) {
    i += applyCliToken(tail, i, state);
  }

  return {
    command,
    projectPath: state.projectPath,
    lang: validateSupportedLang(state.rawLang),
    agents: state.rawAgents !== undefined ? parseAgentsOption(state.rawAgents) : undefined,
    target: state.target,
    dryRun: state.dryRun,
    initAgents: state.initAgents,
    includeScripts: state.includeScripts,
    reconcile: state.reconcile,
    rawForwardArgs: tail,
  };
}

function buildInstallSkillForwardArgs(parsed: ParsedCliArgs): string[] {
  const forwarded: string[] = [];
  if (parsed.target) {
    forwarded.push(FLAG_TARGET, parsed.target);
  }
  if (parsed.includeScripts) {
    forwarded.push(FLAG_INCLUDE_SCRIPTS);
  }
  if (parsed.reconcile) {
    forwarded.push(FLAG_RECONCILE);
  }
  forwarded.push(FLAG_LANG, parsed.lang);
  return forwarded;
}

function formatInitAgentsSummary(result: InitOrAppendAgentsMdResult): string {
  const bridgeCount = result.bridge_files.length;
  return `✔ [init-agents] action=${result.action} lang=${result.lang} agents_md=${result.agents_md_path} bridges=${bridgeCount}`;
}

async function handleInitAgentsCommand(
  parsed: ParsedCliArgs,
  log: (msg: string) => void
): Promise<CliRunResult> {
  const initResult = await initOrAppendAgentsMd({
    projectPath: parsed.projectPath,
    lang: parsed.lang,
    agents: parsed.agents,
    dryRun: parsed.dryRun,
  });
  log(formatInitAgentsSummary(initResult));
  return { exitCode: 0, command: CMD_INIT_AGENTS, parsed, initResult };
}

async function handleInstallSkillCommand(
  parsed: ParsedCliArgs,
  deps: CliDeps,
  log: (msg: string) => void
): Promise<CliRunResult> {
  const runner = deps.installSkillRunner ?? runInstallSkillCli;
  if (!parsed.dryRun) {
    await runner(buildInstallSkillForwardArgs(parsed));
  }
  if (!parsed.initAgents) {
    return { exitCode: 0, command: CMD_INSTALL_SKILL, parsed };
  }
  const initResult = await initOrAppendAgentsMd({
    projectPath: parsed.projectPath,
    lang: parsed.lang,
    agents: parsed.agents,
    dryRun: parsed.dryRun,
  });
  log(formatInitAgentsSummary(initResult));
  return { exitCode: 0, command: CMD_INSTALL_SKILL, parsed, initResult };
}

export async function runCli(
  argv: readonly string[],
  deps: CliDeps = {}
): Promise<CliRunResult> {
  const log = deps.log ?? console.log;
  const parsed = parseCliArgs(argv, deps.cwd ?? process.cwd());

  if (parsed.command === CMD_HELP) {
    log(CLI_USAGE_TEXT);
    return { exitCode: 0, command: CMD_HELP, parsed };
  }
  if (parsed.command === CMD_VERSION) {
    log(MCP_SERVER_VERSION);
    return { exitCode: 0, command: CMD_VERSION, parsed };
  }
  if (parsed.command === CMD_STDIO) {
    const isTty = deps.isStdinTty ?? Boolean(process.stdin.isTTY);
    if (isTty) {
      log(CLI_USAGE_TEXT);
      return { exitCode: 0, command: CMD_STDIO, mode: 'tty-notice', parsed };
    }
    return { exitCode: 0, command: CMD_STDIO, mode: 'stdio-ready', parsed };
  }
  if (parsed.command === CMD_INIT_AGENTS) {
    return await handleInitAgentsCommand(parsed, log);
  }
  if (parsed.command === CMD_INSTALL_SKILL) {
    return await handleInstallSkillCommand(parsed, deps, log);
  }
  const reconcileRunner = deps.reconcileRunner ?? runReconcileAgentsCli;
  await reconcileRunner([...parsed.rawForwardArgs]);
  return { exitCode: 0, command: CMD_RECONCILE_AGENTS, parsed };
}
