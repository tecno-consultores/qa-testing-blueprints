// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from '../cli/commandCatalog.js';
import { guardToolCallInput } from '../security/promptGuard.js';
import {
  formatFailVerboseReport, formatPassQuietSummary, pickAt, throwIfSignalAborted,
} from '../utils/diagnosticFormatter.js';
import { executeInventoryMode } from './tms/inventoryAndJunit.js';
import { executePullStoriesMode, executePushResultsMode } from './tms/providerHttp.js';
import {
  getEnvMap, getNowMs, isPlainRecord, redactTmsSecrets,
  resolveSafeWorkspacePath, serializeRedactedJson, validateTmsBaseUrl,
} from './tms/security.js';
import {
  CODE_INVALID_INPUT, MODE_INVENTORY, MODE_PUSH, PROVIDER_JIRA, STAGE_TMS_SYNC,
  STATUS_DRY_RUN, STATUS_PULL_OK, STATUS_SKIPPED, STATUS_SYNCED, STATUS_TRACEABILITY_OK,
  TMS_PROVIDERS, TMS_SYNC_MODES, MissingTmsCredentialsError, TmsSecurityError,
  type FetchPort, type FetchRequestInit, type FetchResponseLike, type HostLookupPort,
  type InventorySummary, type MappedTestRecord, type ParsedJunitCase, type ParsedJunitSummary,
  type PullStoryOutput, type TmsCliResult, type TmsProvider, type TmsSecurityErrorCode,
  type TmsSyncArgs, type TmsSyncDependencies, type TmsSyncMode, type TmsSyncResult, type TmsSyncStatus,
} from './tms/types.js';

export {
  MissingTmsCredentialsError, TMS_PROVIDERS, TMS_SYNC_MODES, TmsSecurityError,
  redactTmsSecrets, resolveSafeWorkspacePath, validateTmsBaseUrl,
  type FetchPort, type FetchRequestInit, type FetchResponseLike, type HostLookupPort,
  type InventorySummary, type MappedTestRecord, type ParsedJunitCase, type ParsedJunitSummary,
  type PullStoryOutput, type TmsCliResult, type TmsProvider, type TmsSecurityErrorCode,
  type TmsSyncArgs, type TmsSyncDependencies, type TmsSyncMode, type TmsSyncResult, type TmsSyncStatus,
};

function validateModeAndProvider(args: TmsSyncArgs): { mode: TmsSyncMode; provider: TmsProvider } {
  if (!TMS_SYNC_MODES.includes(args.mode)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Modo TMS no soportado: '${String(args.mode)}'.`);
  }
  const provider = args.provider ?? PROVIDER_JIRA;
  if (!TMS_PROVIDERS.includes(provider)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Proveedor TMS no soportado: '${String(provider)}'.`);
  }
  return { mode: args.mode, provider };
}

export async function executeTmsSync(
  args: TmsSyncArgs,
  deps?: TmsSyncDependencies
): Promise<TmsSyncResult> {
  throwIfSignalAborted(deps?.signal, 'sync_enterprise_tms abortado por timeout o cancelación.');
  const startedAt = getNowMs(deps);
  const { mode, provider } = validateModeAndProvider(args);
  const workspaceRoot = args.workspaceRoot ?? deps?.workspaceRoot ?? process.cwd();

  if (mode === MODE_INVENTORY) {
    return executeInventoryMode({ args, provider, workspaceRoot, startedAt, deps });
  }
  if (mode === MODE_PUSH) {
    return executePushResultsMode({ args, provider, workspaceRoot, startedAt, deps });
  }
  return executePullStoriesMode(args, provider, startedAt, deps);
}

interface ParsedCliOptions {
  help: boolean;
  json: boolean;
  args: TmsSyncArgs;
}

function readNextFlagValue(argv: readonly string[], index: number, flag: string): string {
  const val = argv[index + 1];
  if (val === undefined || val.startsWith('--')) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `La bandera '${flag}' requiere un valor.`);
  }
  return val;
}

const VALUE_CLI_FLAGS = new Set<string>([
  '--mode',
  '-m',
  '--provider',
  '--target-dir',
  '--junit-xml',
  '--base-url',
  '--project-key',
  '--issue-key',
  '--test-execution-key',
  '--repo',
  '--required-keys',
  '--timeout-ms',
]);

function applyCliValueFlag(
  flag: string,
  val: string,
  args: TmsSyncArgs
): void {
  const handlers: Record<string, () => void> = {
    '--mode': () => { args.mode = val as TmsSyncMode; },
    '-m': () => { args.mode = val as TmsSyncMode; },
    '--provider': () => { args.provider = val as TmsProvider; },
    '--target-dir': () => { args.targetDir = val; },
    '--junit-xml': () => { args.junitXmlPath = val; },
    '--base-url': () => { args.baseUrl = val; },
    '--project-key': () => { args.projectKey = val; },
    '--issue-key': () => { args.issueKey = val; },
    '--test-execution-key': () => { args.testExecutionKey = val; },
    '--repo': () => { args.repo = val; },
    '--required-keys': () => { args.requiredKeys = val.split(',').map((s) => s.trim()).filter(Boolean); },
    '--timeout-ms': () => { args.timeoutMs = Number(val); },
  };
  handlers[flag]?.();
}

function splitEqualsFlagToken(tok: string): { flag: string; inlineValue?: string } {
  const eqIdx = tok.indexOf('=');
  if (eqIdx === -1) {
    return { flag: tok };
  }
  return { flag: tok.slice(0, eqIdx), inlineValue: tok.slice(eqIdx + 1) };
}

function readTmsFlagValue(
  argv: readonly string[],
  index: number,
  flag: string,
  inlineValue: string | undefined
): { value: string; consumed: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, `La bandera '${flag}' requiere un valor.`);
    }
    return { value: inlineValue, consumed: 0 };
  }
  return { value: readNextFlagValue(argv, index, flag), consumed: 1 };
}

function parseTmsCliArgs(argv: readonly string[]): ParsedCliOptions {
  const args: TmsSyncArgs = { mode: MODE_INVENTORY };
  let help = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const tok = pickAt(argv, i);
    if (tok === '--help' || tok === '-h') {
      help = true;
    } else if (tok === '--json') {
      json = true;
    } else if (tok === '--live') {
      args.dryRun = false;
    } else if (tok === '--dry-run') {
      args.dryRun = true;
    } else {
      const { flag, inlineValue } = splitEqualsFlagToken(tok);
      if (!VALUE_CLI_FLAGS.has(flag)) {
        throw new TmsSecurityError(CODE_INVALID_INPUT, `Argumento CLI desconocido: '${tok}'.`);
      }
      const matched = readTmsFlagValue(argv, i, flag, inlineValue);
      applyCliValueFlag(flag, matched.value, args);
      i += matched.consumed;
    }
  }
  return { help, json, args };
}

function isSuccessStatus(status: TmsSyncStatus): boolean {
  return (
    status === STATUS_TRACEABILITY_OK ||
    status === STATUS_DRY_RUN ||
    status === STATUS_SKIPPED ||
    status === STATUS_SYNCED ||
    status === STATUS_PULL_OK
  );
}

function formatCliHelpText(argv: readonly string[] = []): string {
  return renderSubcommandHelpText('tms-sync', resolveCliHelpLang(argv));
}

function formatResultText(
  result: TmsSyncResult,
  env: Readonly<Record<string, string | undefined>>
): TmsCliResult {
  const safeMsg = redactTmsSecrets(result.message, env);
  const passed = isSuccessStatus(result.status);
  if (passed) {
    return {
      exitCode: 0,
      result,
      output: formatPassQuietSummary({
        stageId: `${STAGE_TMS_SYNC}:${result.mode}:${result.provider}:${result.status}`,
        passed: true,
        checksCount: Math.max(1, result.attempts),
        durationMs: result.durationMs,
      }),
    };
  }
  return {
    exitCode: 1,
    result,
    output: formatFailVerboseReport({
      stageId: `${STAGE_TMS_SYNC}:${result.mode}:${result.provider}`,
      passed: false,
      exitCode: 1,
      durationMs: result.durationMs,
      command: `tms-sync --mode ${result.mode} --provider ${result.provider}`,
      stderr: safeMsg,
      remediationHint: 'Verifica conectividad HTTPS, credenciales TMS y cobertura de etiquetas @JIRA/@TC.',
    }),
  };
}

export async function runTmsSyncCli(
  argv: readonly string[],
  deps?: TmsSyncDependencies
): Promise<TmsCliResult> {
  const env = getEnvMap(deps);
  try {
    const parsed = parseTmsCliArgs(argv);
    if (parsed.help) {
      return { exitCode: 0, output: formatCliHelpText(argv) };
    }
    const result = await executeTmsSync(parsed.args, deps);
    if (parsed.json) {
      return {
        exitCode: isSuccessStatus(result.status) ? 0 : 1,
        result,
        output: serializeRedactedJson(result, env),
      };
    }
    return formatResultText(result, env);
  } catch (err) {
    const rawErr = err instanceof Error ? err.message : String(err);
    const safeErr = redactTmsSecrets(rawErr, env);
    return {
      exitCode: 1,
      output: formatFailVerboseReport({
        stageId: STAGE_TMS_SYNC,
        passed: false,
        exitCode: 1,
        durationMs: 0,
        stderr: safeErr,
        remediationHint: 'Corrige los argumentos, URL HTTPS o credenciales TMS requeridas.',
      }),
    };
  }
}

export const SYNC_ENTERPRISE_TMS_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: STAGE_TMS_SYNC,
  description:
    'Synchronizes bidirectional Zero-Infra traceability (inventory, push-results, pull-stories) with Jira, Zephyr Scale, Xray, and GitHub Issues using dry-run mode by default, anti-SSRF validation, and promptGuard sanitization.',
};

export async function handleSyncEnterpriseTms(
  rawArgs: unknown,
  deps?: TmsSyncDependencies
): Promise<CallToolResult> {
  const env = getEnvMap(deps);
  const record = isPlainRecord(rawArgs) ? rawArgs : {};
  const guarded = guardToolCallInput(STAGE_TMS_SYNC, record);
  if (guarded.blocked) {
    const blockedMsg = `Bloqueado por PromptGuard (${guarded.matchedRules.join(', ')})`;
    return {
      isError: true,
      content: [{ type: 'text', text: blockedMsg }],
      structuredContent: {
        status: 'BLOCKED',
        blocked: true,
        matchedRules: [...guarded.matchedRules],
        error: blockedMsg,
      },
    };
  }
  try {
    const result = await executeTmsSync(guarded.sanitizedArgs as unknown as TmsSyncArgs, deps);
    const redactedJson = serializeRedactedJson(result, env, 2);
    return {
      isError: !isSuccessStatus(result.status),
      content: [{ type: 'text', text: redactedJson }],
      structuredContent: JSON.parse(redactedJson) as Record<string, unknown>,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const redactedErr = redactTmsSecrets(rawMsg, env);
    return {
      isError: true,
      content: [{ type: 'text', text: redactedErr }],
      structuredContent: { status: 'ERROR', error: redactedErr },
    };
  }
}
