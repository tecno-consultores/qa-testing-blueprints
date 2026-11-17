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
import { INIT_AGENTS_HELP_TEXT } from './cli/init-agents-md.js';
import { INSTALL_SKILL_HELP_TEXT, runInstallSkillCli } from './cli/install-skill.js';
import { RECONCILE_AGENTS_HELP_TEXT, runReconcileAgentsCli } from './cli/reconcile-agents.js';
import {
  formatQuickstartOutput,
  runQuickstart,
  validateQuickstartCi,
  validateQuickstartTier,
  type QuickstartCiProvider,
  type QuickstartResult,
  type QuickstartTier,
} from './cli/quickstart.js';
import { runTmsSyncCli } from './integrations/tmsSyncCli.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { pickAt } from './utils/diagnosticFormatter.js';

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
const FLAG_HELP = '--help';
const FLAG_HELP_SHORT = '-h';
const FLAG_DIR = '--dir';
const FLAG_TIER = '--tier';
const FLAG_TIER_SHORT = '-T';
const FLAG_CI = '--ci';
const FLAG_FORCE = '--force';
const FLAG_FORCE_SHORT = '-f';
const FLAG_JSON = '--json';

const CMD_INIT_AGENTS = 'init-agents' as const;
const CMD_INSTALL_SKILL = 'install-skill' as const;
const CMD_RECONCILE_AGENTS = 'reconcile-agents' as const;
const CMD_QUICKSTART = 'quickstart' as const;
const CMD_TMS_SYNC = 'tms-sync' as const;
const CMD_HELP = 'help' as const;
const CMD_VERSION = 'version' as const;
const CMD_STDIO = 'stdio' as const;

export type CliCommandName =
  | typeof CMD_INIT_AGENTS
  | typeof CMD_INSTALL_SKILL
  | typeof CMD_RECONCILE_AGENTS
  | typeof CMD_QUICKSTART
  | typeof CMD_TMS_SYNC
  | typeof CMD_HELP
  | typeof CMD_VERSION
  | typeof CMD_STDIO;

export interface ParsedCliArgs {
  readonly command: CliCommandName;
  readonly projectPath: string;
  readonly lang: SupportedLang;
  readonly agents?: AgentsTargetSpec;
  readonly target?: string;
  readonly tier?: QuickstartTier;
  readonly ci?: QuickstartCiProvider;
  readonly dryRun: boolean;
  readonly help?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly initAgents: boolean;
  readonly includeScripts: boolean;
  readonly reconcile: boolean;
  readonly rawForwardArgs: readonly string[];
}

export interface ParsedQuickstartCliArgs {
  readonly command: typeof CMD_QUICKSTART;
  readonly projectPath: string;
  readonly tier?: QuickstartTier;
  readonly lang?: SupportedLang;
  readonly agents?: AgentsTargetSpec;
  readonly ci?: QuickstartCiProvider;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly json: boolean;
  readonly help?: boolean;
}

export type InstallSkillRunner = (args: string[]) => Promise<void>;
export type ReconcileAgentsRunner = (args: string[]) => Promise<void>;
export type InitAgentsRunner = (args: string[]) => Promise<void>;

export interface CliDeps {
  readonly cwd?: string;
  readonly baseBoundaryDir?: string;
  readonly isStdinTty?: boolean;
  readonly fetcher?: GitHubFetcher;
  readonly log?: (message: string) => void;
  readonly errorLog?: (message: string) => void;
  readonly installSkillRunner?: InstallSkillRunner;
  readonly reconcileRunner?: ReconcileAgentsRunner;
  readonly initAgentsRunner?: InitAgentsRunner;
}

export interface CliRunResult {
  readonly exitCode: number;
  readonly command: CliCommandName;
  readonly mode?: 'tty-notice' | 'stdio-ready';
  readonly parsed?: ParsedCliArgs;
  readonly initResult?: InitOrAppendAgentsMdResult;
  readonly quickstartResult?: QuickstartResult;
  readonly errorMessage?: string;
}

export const CLI_USAGE_TEXT = [
  `@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — QA 11X Multi-Agent Connector CLI`,
  '',
  'Commands:',
  '  quickstart        Zero-config 30s adoption (.qa-11x.json, AGENTS.md, PR check)',
  '  init-agents       Create or update AGENTS.md and optional Thin-Repo agent bridges',
  '  install-skill     Install global 11X skills (pass --init-agents to sync connectors)',
  '  reconcile-agents  Deduplicate canonical rules in .agents/',
  '  tms-sync          Zero-infra traceability sync (jira|zephyr|xray|github-issues)',
  '',
  'Options:',
  '  --lang, -l <es|en>               Output language policy (default: es, quickstart: en)',
  `  --agents, -a <csv|auto|all>      Bridge target IDs (${SUPPORTED_AGENT_IDS.length} supported), auto, or all`,
  '  --dir, --project-path, -p <dir>  Target project directory (default: cwd)',
  '  --tier, -T <starter|standard|enterprise>  Quickstart gate profile (default: starter)',
  '  --ci <github|none>               Quickstart CI workflow generator (default: github)',
  '  --target, -t <env>               Global skills target directory',
  '  --init-agents                    Run init-agents after install-skill',
  '  --include-scripts                Install operational 11X scripts',
  '  --reconcile                      Reconcile .agents/ before syncing skills',
  '  --dry-run                        Simulate without writing files to disk',
  '  --force, -f                      Overwrite customized quickstart CI/task files',
  '  --json                           Emit machine-readable JSON output (quickstart)',
  '  --version, -v                    Print active package version',
  '  --help, -h                       Print this help message',
].join('\n');

export const QUICKSTART_HELP_TEXT = [
  'Usage: npx -y @sinfallas/mcp-qa-11x quickstart [dir] [options]',
  '',
  'Options:',
  '  --dir, --project-path, -p <dir>          Target project directory (default: cwd)',
  '  --tier, -T <starter|standard|enterprise> Quickstart gate profile (default: auto)',
  '  --lang, -l <auto|es|en>                  Language policy for AGENTS.md',
  `  --agents, -a <auto|all|csv>              Thin-Repo bridge targets (${SUPPORTED_AGENT_IDS.length} supported agents)`,
  '  --ci <github|none>                       CI workflow generator (default: github)',
  '  --dry-run                                Simulate without writing files',
  '  --force, -f                              Overwrite customized CI/task files',
  '  --json                                   Emit machine-readable JSON output',
  '  --help, -h                               Show this help message and exit 0',
].join('\n');

const SUBCOMMAND_MAP: Readonly<Record<string, CliCommandName>> = Object.freeze({
  'init-agents': CMD_INIT_AGENTS,
  'init-agents-md': CMD_INIT_AGENTS,
  'install-skill': CMD_INSTALL_SKILL,
  install: CMD_INSTALL_SKILL,
  'reconcile-agents': CMD_RECONCILE_AGENTS,
  quickstart: CMD_QUICKSTART,
  'tms-sync': CMD_TMS_SYNC,
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

type QuickstartValueFlagField = 'projectPath' | 'rawTier' | 'rawLang' | 'rawAgents' | 'rawCi';
type QuickstartBooleanFlagField = 'dryRun' | 'force' | 'json';

interface MutableQuickstartParseState {
  projectPath: string;
  hasPositionalDir: boolean;
  rawTier?: string;
  rawLang?: string;
  rawAgents?: string;
  rawCi?: string;
  dryRun: boolean;
  force: boolean;
  json: boolean;
}

const QUICKSTART_VALUE_FLAG_FIELDS: Readonly<Record<string, QuickstartValueFlagField>> =
  Object.freeze({
    [FLAG_DIR]: 'projectPath',
    [FLAG_PROJECT_PATH]: 'projectPath',
    [FLAG_PROJECT_PATH_SHORT]: 'projectPath',
    [FLAG_TIER]: 'rawTier',
    [FLAG_TIER_SHORT]: 'rawTier',
    [FLAG_LANG]: 'rawLang',
    [FLAG_LANG_SHORT]: 'rawLang',
    [FLAG_AGENTS]: 'rawAgents',
    [FLAG_AGENTS_SHORT]: 'rawAgents',
    [FLAG_CI]: 'rawCi',
  });

const QUICKSTART_BOOLEAN_FLAG_FIELDS: Readonly<Record<string, QuickstartBooleanFlagField>> =
  Object.freeze({
    [FLAG_DRY_RUN]: 'dryRun',
    [FLAG_FORCE]: 'force',
    [FLAG_FORCE_SHORT]: 'force',
    [FLAG_JSON]: 'json',
  });

function readMappedFlagValue<TField extends string>(
  argv: readonly string[],
  index: number,
  token: string,
  flagMap: Readonly<Record<string, TField>>
): { field: TField; value: string; step: number } | null {
  const eqIdx = token.indexOf('=');
  if (eqIdx !== -1) {
    const flagName = token.slice(0, eqIdx);
    const field = flagMap[flagName];
    if (!field) {
      return null;
    }
    const inlineValue = token.slice(eqIdx + 1);
    if (!inlineValue) {
      throw new Error(`Missing value for flag '${flagName}'.`);
    }
    return { field, value: inlineValue, step: 0 };
  }

  const field = flagMap[token];
  if (!field) {
    return null;
  }
  const nextValue = argv[index + 1];
  if (nextValue === undefined || nextValue.startsWith('-')) {
    throw new Error(`Missing value for flag '${token}'.`);
  }
  return { field, value: nextValue, step: 1 };
}

const CLI_BOOLEAN_FLAGS_BY_CMD: Readonly<Record<CliCommandName, ReadonlySet<string>>> = Object.freeze({
  [CMD_INIT_AGENTS]: new Set([FLAG_DRY_RUN]),
  [CMD_INSTALL_SKILL]: new Set([FLAG_DRY_RUN, FLAG_INIT_AGENTS, FLAG_INCLUDE_SCRIPTS, FLAG_RECONCILE]),
  [CMD_RECONCILE_AGENTS]: new Set([FLAG_DRY_RUN]),
  [CMD_QUICKSTART]: new Set([FLAG_DRY_RUN, FLAG_FORCE, FLAG_FORCE_SHORT, FLAG_JSON]),
  [CMD_TMS_SYNC]: new Set<string>(),
  [CMD_HELP]: new Set<string>(),
  [CMD_VERSION]: new Set<string>(),
  [CMD_STDIO]: new Set<string>(),
});

const CLI_VALUE_FLAGS_BY_CMD: Readonly<Record<CliCommandName, ReadonlySet<string>>> = Object.freeze({
  [CMD_INIT_AGENTS]: new Set([
    FLAG_PROJECT_PATH,
    FLAG_PROJECT_PATH_SHORT,
    FLAG_DIR,
    FLAG_LANG,
    FLAG_LANG_SHORT,
    FLAG_AGENTS,
    FLAG_AGENTS_SHORT,
  ]),
  [CMD_INSTALL_SKILL]: new Set([
    FLAG_TARGET,
    FLAG_TARGET_SHORT,
    FLAG_LANG,
    FLAG_LANG_SHORT,
    FLAG_AGENTS,
    FLAG_AGENTS_SHORT,
    FLAG_PROJECT_PATH,
    FLAG_PROJECT_PATH_SHORT,
  ]),
  [CMD_RECONCILE_AGENTS]: new Set([FLAG_PROJECT_PATH, FLAG_PROJECT_PATH_SHORT, FLAG_DIR]),
  [CMD_QUICKSTART]: new Set<string>(),
  [CMD_TMS_SYNC]: new Set<string>(),
  [CMD_HELP]: new Set<string>(),
  [CMD_VERSION]: new Set<string>(),
  [CMD_STDIO]: new Set<string>(),
});

function hasHelpToken(args: readonly string[]): boolean {
  return args.includes(FLAG_HELP) || args.includes(FLAG_HELP_SHORT);
}

function getContextualHelpText(command: CliCommandName): string {
  switch (command) {
    case CMD_INSTALL_SKILL:
      return INSTALL_SKILL_HELP_TEXT;
    case CMD_INIT_AGENTS:
      return INIT_AGENTS_HELP_TEXT;
    case CMD_RECONCILE_AGENTS:
      return RECONCILE_AGENTS_HELP_TEXT;
    default:
      return CLI_USAGE_TEXT;
  }
}

function applyCliToken(
  argv: readonly string[],
  index: number,
  state: MutableParseState,
  command: CliCommandName
): number {
  const token = pickAt(argv, index);
  const allowedBools = CLI_BOOLEAN_FLAGS_BY_CMD[command];
  const boolField = BOOLEAN_FLAG_FIELDS[token];
  if (boolField && allowedBools.has(token)) {
    state[boolField] = true;
    return 0;
  }

  const allowedValues = CLI_VALUE_FLAGS_BY_CMD[command];
  const normalizedTokenName = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
  if (allowedValues.has(normalizedTokenName)) {
    const extendedValueFields: Readonly<Record<string, ValueFlagField>> = {
      ...VALUE_FLAG_FIELDS,
      [FLAG_DIR]: 'projectPath',
    };
    const valueFlag = readMappedFlagValue(argv, index, token, extendedValueFields);
    if (valueFlag) {
      state[valueFlag.field] = valueFlag.value;
      return valueFlag.step;
    }
  }

  if (token.startsWith('-')) {
    throw new Error(`Unknown CLI flag '${token}' for '${command}'. Run with --help to view usage.`);
  }
  state.projectPath = token;
  return 0;
}

function applyQuickstartToken(
  argv: readonly string[],
  index: number,
  state: MutableQuickstartParseState
): number {
  const token = pickAt(argv, index);
  const boolField = QUICKSTART_BOOLEAN_FLAG_FIELDS[token];
  if (boolField) {
    state[boolField] = true;
    return 0;
  }

  const valueFlag = readMappedFlagValue(argv, index, token, QUICKSTART_VALUE_FLAG_FIELDS);
  if (valueFlag) {
    state[valueFlag.field] = valueFlag.value;
    return valueFlag.step;
  }

  if (token.startsWith('-')) {
    throw new Error(`Unknown CLI flag '${token}' for 'quickstart'. Run with --help to view usage.`);
  }
  if (state.hasPositionalDir) {
    throw new Error(`Unexpected positional argument '${token}' for 'quickstart'.`);
  }
  state.projectPath = token;
  state.hasPositionalDir = true;
  return 0;
}

export function parseQuickstartCliArgs(
  tail: readonly string[],
  cwd: string = process.cwd()
): ParsedQuickstartCliArgs {
  const help = hasHelpToken(tail);
  const state: MutableQuickstartParseState = {
    projectPath: cwd,
    hasPositionalDir: false,
    dryRun: false,
    force: false,
    json: false,
  };

  if (!help) {
    for (let i = 0; i < tail.length; i++) {
      i += applyQuickstartToken(tail, i, state);
    }
  }

  return {
    command: CMD_QUICKSTART,
    projectPath: state.projectPath,
    tier: state.rawTier !== undefined ? validateQuickstartTier(state.rawTier) : undefined,
    lang: state.rawLang !== undefined ? validateSupportedLang(state.rawLang) : undefined,
    agents: state.rawAgents !== undefined ? parseAgentsOption(state.rawAgents) : undefined,
    ci: state.rawCi !== undefined ? validateQuickstartCi(state.rawCi) : undefined,
    dryRun: state.dryRun,
    force: state.force,
    json: state.json,
    help,
  };
}

function mapQuickstartToParsedCliArgs(
  qs: ParsedQuickstartCliArgs,
  tail: readonly string[]
): ParsedCliArgs {
  return {
    command: CMD_QUICKSTART,
    projectPath: qs.projectPath,
    lang: qs.lang ?? 'en',
    agents: qs.agents,
    tier: qs.tier,
    ci: qs.ci,
    dryRun: qs.dryRun,
    help: qs.help,
    force: qs.force,
    json: qs.json,
    initAgents: false,
    includeScripts: false,
    reconcile: false,
    rawForwardArgs: tail,
  };
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
  if (command === CMD_QUICKSTART) {
    return mapQuickstartToParsedCliArgs(parseQuickstartCliArgs(tail, cwd), tail);
  }
  if (command === CMD_TMS_SYNC) {
    return {
      command: CMD_TMS_SYNC,
      projectPath: cwd,
      lang: 'es',
      dryRun: false,
      help: hasHelpToken(tail),
      initAgents: false,
      includeScripts: false,
      reconcile: false,
      rawForwardArgs: tail,
    };
  }
  if (hasHelpToken(tail)) {
    return {
      command,
      projectPath: cwd,
      lang: 'es',
      dryRun: false,
      help: true,
      initAgents: false,
      includeScripts: false,
      reconcile: false,
      rawForwardArgs: tail,
    };
  }

  for (let i = 0; i < tail.length; i++) {
    i += applyCliToken(tail, i, state, command);
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
  if (parsed.dryRun) {
    forwarded.push(FLAG_DRY_RUN);
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
  deps: CliDeps,
  log: (msg: string) => void
): Promise<CliRunResult> {
  if (deps.initAgentsRunner) {
    await deps.initAgentsRunner([...parsed.rawForwardArgs]);
    return { exitCode: 0, command: CMD_INIT_AGENTS, parsed };
  }
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
  const runner =
    deps.installSkillRunner ??
    ((forwardArgs: string[]) => runInstallSkillCli(forwardArgs, deps.fetcher));
  await runner(buildInstallSkillForwardArgs(parsed));
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

async function handleQuickstartCommand(
  tail: readonly string[],
  deps: CliDeps,
  log: (msg: string) => void
): Promise<CliRunResult> {
  const errorLog = deps.errorLog ?? console.error;
  try {
    const parsed = parseQuickstartCliArgs(tail, deps.cwd ?? process.cwd());
    if (parsed.help) {
      log(QUICKSTART_HELP_TEXT);
      return { exitCode: 0, command: CMD_QUICKSTART };
    }
    const quickstartResult = await runQuickstart({
      dir: parsed.projectPath,
      baseBoundaryDir: deps.baseBoundaryDir,
      tier: parsed.tier,
      lang: parsed.lang,
      agents: parsed.agents,
      ci: parsed.ci,
      dryRun: parsed.dryRun,
      force: parsed.force,
      json: parsed.json,
    });
    log(formatQuickstartOutput(quickstartResult, parsed.json));
    return { exitCode: 0, command: CMD_QUICKSTART, quickstartResult };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errorLog(`❌ [quickstart] ${errorMessage}`);
    return { exitCode: 1, command: CMD_QUICKSTART, errorMessage };
  }
}

async function dispatchCliCommand(
  parsed: ParsedCliArgs,
  deps: CliDeps,
  log: (message: string) => void,
  errorLog: (message: string) => void
): Promise<CliRunResult> {
  if (parsed.help) {
    if (parsed.command === CMD_TMS_SYNC) {
      const tmsHelp = await runTmsSyncCli(['--help']);
      log(tmsHelp.output);
      return { exitCode: 0, command: CMD_TMS_SYNC, parsed };
    }
    log(getContextualHelpText(parsed.command));
    return { exitCode: 0, command: parsed.command, parsed };
  }

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
  if (parsed.command === CMD_TMS_SYNC) {
    const tmsRes = await runTmsSyncCli([...parsed.rawForwardArgs]);
    const stream = tmsRes.exitCode === 0 ? log : errorLog;
    stream(tmsRes.output);
    return { exitCode: tmsRes.exitCode, command: CMD_TMS_SYNC, parsed };
  }
  if (parsed.command === CMD_INIT_AGENTS) {
    return await handleInitAgentsCommand(parsed, deps, log);
  }
  if (parsed.command === CMD_INSTALL_SKILL) {
    return await handleInstallSkillCommand(parsed, deps, log);
  }
  const reconcileRunner = deps.reconcileRunner ?? runReconcileAgentsCli;
  await reconcileRunner([...parsed.rawForwardArgs]);
  return { exitCode: 0, command: CMD_RECONCILE_AGENTS, parsed };
}

export async function runCli(
  argv: readonly string[],
  deps: CliDeps = {}
): Promise<CliRunResult> {
  const log = deps.log ?? console.log;
  const errorLog = deps.errorLog ?? console.error;
  if (argv[0] === CMD_QUICKSTART) {
    return await handleQuickstartCommand(argv.slice(1), deps, log);
  }
  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(argv, deps.cwd ?? process.cwd());
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errorLog(`❌ ${errorMessage}`);
    return { exitCode: 1, command: CMD_HELP, errorMessage };
  }

  return await dispatchCliCommand(parsed, deps, log, errorLog);
}
