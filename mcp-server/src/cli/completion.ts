// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { pickAt } from '../utils/diagnosticFormatter.js';
import { type CliCommandOutput, hasHelpFlag, matchFlagValue } from './cliArgHelpers.js';

export const SUPPORTED_SHELLS = ['fish', 'bash', 'zsh'] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

const BIN_NAME = 'mcp-qa-11x';
const ERROR_PREFIX = '❌ [completion]';

interface SubcommandEntry {
  readonly name: string;
  readonly summary: string;
}

const SUBCOMMANDS: readonly SubcommandEntry[] = [
  { name: 'quickstart', summary: 'Zero-config 30s QA-11X onboarding' },
  { name: 'install-skill', summary: 'Install global 11X skills and scripts' },
  { name: 'install', summary: 'Alias for install-skill' },
  { name: 'init-agents', summary: 'Create or update AGENTS.md connector' },
  { name: 'init-agents-md', summary: 'Alias for init-agents' },
  { name: 'reconcile-agents', summary: 'Deduplicate canonical rules in .agents' },
  { name: 'tms-sync', summary: 'Traceability sync with Jira/Zephyr/Xray/GitHub' },
  { name: 'doctor', summary: 'Run QA-11X environment diagnostics' },
  { name: 'status', summary: 'Show QA-11X governance status' },
  { name: 'upgrade', summary: 'Upgrade installed 11X skills and rules' },
  { name: 'cache-clean', summary: 'Clean cached blueprint artifacts' },
  { name: 'certify', summary: 'Run QA-11X certification gate' },
  { name: 'audit', summary: 'Run STIG/OWASP security audit' },
  { name: 'blast-radius', summary: 'Inspect AST blast radius and routing path' },
  { name: 'mcp-config', summary: 'Generate or install MCP client configuration' },
  { name: 'completion', summary: 'Generate shell completion script' },
  { name: 'version', summary: 'Display active MCP server version' },
  { name: 'help', summary: 'Display CLI or subcommand usage help' },
];

interface FlagChoiceSpec {
  readonly long: string;
  readonly short?: string;
  readonly values: readonly string[];
  readonly desc: string;
  readonly zshMeta: string;
}

interface SimpleFlagSpec {
  readonly long: string;
  readonly short?: string;
  readonly desc: string;
}

const FLAG_CHOICES: readonly FlagChoiceSpec[] = [
  {
    long: '--tier',
    short: '-T',
    values: ['starter', 'standard', 'enterprise'],
    desc: 'Quickstart gate profile',
    zshMeta: 'tier',
  },
  {
    long: '--lang',
    short: '-l',
    values: ['auto', 'es', 'en'],
    desc: 'Language policy',
    zshMeta: 'lang',
  },
  {
    long: '--mode',
    short: '-m',
    values: ['security', 'pyramid', 'vibe', 'calm', 'all', 'inventory', 'push-results', 'pull-stories'],
    desc: 'Audit or TMS synchronization mode',
    zshMeta: 'mode',
  },
  {
    long: '--format',
    short: '-f',
    values: ['text', 'json', 'sarif'],
    desc: 'Output format',
    zshMeta: 'format',
  },
  {
    long: '--fail-on',
    values: ['critical', 'high', 'medium', 'any', 'none'],
    desc: 'Minimum severity threshold to fail',
    zshMeta: 'severity',
  },
  {
    long: '--client',
    short: '-c',
    values: [
      'antigravity',
      'claude-code',
      'claude-desktop',
      'cursor',
      'vscode',
      'windsurf',
      'codex',
      'gemini-cli',
      'hermes',
      'all',
    ],
    desc: 'MCP client target',
    zshMeta: 'client',
  },
  {
    long: '--provider',
    values: ['jira', 'zephyr', 'xray', 'github-issues'],
    desc: 'TMS provider',
    zshMeta: 'provider',
  },
  {
    long: '--shell',
    values: ['fish', 'bash', 'zsh'],
    desc: 'Target completion shell',
    zshMeta: 'shell',
  },
  {
    long: '--ci',
    values: ['github', 'none'],
    desc: 'CI workflow provider',
    zshMeta: 'ci',
  },
];

const EXTRA_VALUE_FLAGS: readonly SimpleFlagSpec[] = [
  { long: '--project-path', short: '-p', desc: 'Target project directory' },
  { long: '--dir', desc: 'Target project directory alias' },
  { long: '--agents', short: '-a', desc: 'Bridge agent targets' },
  { long: '--target', short: '-t', desc: 'Skill installation target' },
  { long: '--symbol', short: '-s', desc: 'Target AST symbol or file' },
  { long: '--changed-since', desc: 'Git ref for differential blast radius' },
  { long: '--max-tokens', desc: 'Max token budget for semantic diff' },
  { long: '--max-items', desc: 'Max dependent items returned' },
  { long: '--junit-xml', desc: 'Relative JUnit XML path' },
  { long: '--max-findings', desc: 'Max findings per audit engine' },
  { long: '--architecture-path', desc: 'Relative FINOS CALM model path' },
  { long: '--target-dir', desc: 'TMS scan target directory' },
  { long: '--base-url', desc: 'TMS HTTPS base URL' },
  { long: '--project-key', desc: 'TMS project key' },
  { long: '--issue-key', desc: 'TMS issue key' },
  { long: '--repo', desc: 'GitHub owner/repo slug' },
  { long: '--required-keys', desc: 'Required TMS traceability keys' },
  { long: '--timeout-ms', desc: 'TMS request timeout in ms' },
];

const BOOLEAN_FLAGS: readonly SimpleFlagSpec[] = [
  { long: '--init-agents', desc: 'Inject or update AGENTS.md connector' },
  { long: '--include-scripts', desc: 'Install operational 11X scripts' },
  { long: '--reconcile', desc: 'Deduplicate canonical rules in .agents/' },
  { long: '--auto-build', desc: 'Build missing Graphify AST graph' },
  { long: '--refresh', desc: 'Rebuild Graphify AST graph' },
  { long: '--print', desc: 'Print MCP config snippet' },
  { long: '--install', desc: 'Install MCP config snippet safely' },
  { long: '--pin-version', desc: 'Pin exact npm version in MCP config' },
  { long: '--offline', desc: 'Skip remote version checks' },
  { long: '--strict', desc: 'Fail on any SKIPPED gate check' },
  { long: '--require-lint-evidence', desc: 'Require fresh lint evidence on dirty trees' },
  { long: '--allow-unmerged-examples', desc: 'Allow .example files in root' },
  { long: '--release-gate', desc: 'Evaluate GO/NO-GO release gate' },
  { long: '--sarif', desc: 'Emit SARIF 2.1.0 output' },
  { long: '--include-examples', desc: 'Include .example templates in security scan' },
  { long: '--cache-only', desc: 'Clean caches without syncing skills' },
  { long: '--live', desc: 'Execute live TMS HTTP synchronization' },
  { long: '--dry-run', desc: 'Simulate without writing to disk' },
  { long: '--force', short: '-f', desc: 'Force overwrite managed files' },
  { long: '--json', desc: 'Emit machine-readable JSON output' },
  { long: '--verbose', desc: 'Include verbose diagnostics with --version' },
  { long: '--stdio', desc: 'Force JSON-RPC stdio transport' },
  { long: '--version', short: '-v', desc: 'Print package version' },
  { long: '--help', short: '-h', desc: 'Show usage help' },
];

export const COMPLETION_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x completion <fish|bash|zsh>',
  '   o: npx -y @sinfallas/mcp-qa-11x completion --shell <fish|bash|zsh>',
  '',
  'Opciones:',
  '  --shell <fish|bash|zsh>  Shell objetivo para autocompletado',
  '  --help, -h               Muestra esta ayuda y sale con código 0',
].join('\n');

function formatFishSimpleFlag(spec: SimpleFlagSpec, requiresArg: boolean): string {
  const shortPart = spec.short ? ` -s ${spec.short.slice(1)}` : '';
  const argPart = requiresArg ? ' -r' : '';
  return `complete -c ${BIN_NAME} -l ${spec.long.slice(2)}${shortPart}${argPart} -d '${spec.desc}'`;
}

function appendFishEntries(lines: string[]): void {
  for (const sub of SUBCOMMANDS) {
    lines.push(
      `complete -c ${BIN_NAME} -n '__fish_use_subcommand' -a '${sub.name}' -d '${sub.summary}'`
    );
  }
  for (const spec of FLAG_CHOICES) {
    const shortPart = spec.short ? ` -s ${spec.short.slice(1)}` : '';
    lines.push(
      `complete -c ${BIN_NAME} -l ${spec.long.slice(2)}${shortPart} -x -a '${spec.values.join(' ')}' -d '${spec.desc}'`
    );
  }
}

function appendFishSimpleFlags(lines: string[]): void {
  for (const spec of EXTRA_VALUE_FLAGS) {
    lines.push(formatFishSimpleFlag(spec, true));
  }
  for (const spec of BOOLEAN_FLAGS) {
    lines.push(formatFishSimpleFlag(spec, false));
  }
}

function buildFishCompletion(): string {
  const lines: string[] = [
    `# fish completion for ${BIN_NAME}`,
    `complete -c ${BIN_NAME} -f`,
  ];
  appendFishEntries(lines);
  appendFishSimpleFlags(lines);
  lines.push(
    `complete -c ${BIN_NAME} -n '__fish_seen_subcommand_from completion' -a '${SUPPORTED_SHELLS.join(' ')}'`
  );
  return `${lines.join('\n')}\n`;
}

function collectBashFlagTokens(): string {
  const allSpecs: ReadonlyArray<{ readonly long: string; readonly short?: string }> = [
    ...FLAG_CHOICES,
    ...EXTRA_VALUE_FLAGS,
    ...BOOLEAN_FLAGS,
  ];
  const tokens = allSpecs.flatMap((spec) => (spec.short ? [spec.long, spec.short] : [spec.long]));
  return Array.from(new Set(tokens)).join(' ');
}

function buildBashCompletion(): string {
  const subNames = SUBCOMMANDS.map((s) => s.name).join(' ');
  const allFlags = collectBashFlagTokens();
  const caseArms = FLAG_CHOICES.map((spec) => {
    const pattern = spec.short ? `${spec.long}|${spec.short}` : spec.long;
    return [
      `    ${pattern})`,
      `      COMPREPLY=( $(compgen -W "${spec.values.join(' ')}" -- "\${cur}") )`,
      '      return 0',
      '      ;;',
    ].join('\n');
  }).join('\n');

  return [
    `# bash completion for ${BIN_NAME}`,
    '_mcp_qa_11x_completions() {',
    '  local cur prev cmd',
    '  COMPREPLY=()',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev=""',
    '  if [ "${COMP_CWORD}" -gt 0 ]; then',
    '    prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  fi',
    '  cmd="${COMP_WORDS[1]:-}"',
    '  case "${prev}" in',
    caseArms,
    '  esac',
    '  if [ "${COMP_CWORD}" -eq 1 ]; then',
    `    COMPREPLY=( $(compgen -W "${subNames} --help -h --version -v --stdio" -- "\${cur}") )`,
    '    return 0',
    '  fi',
    '  if [ "${cmd}" = "completion" ] && [[ "${cur}" != -* ]]; then',
    `    COMPREPLY=( $(compgen -W "${SUPPORTED_SHELLS.join(' ')}" -- "\${cur}") )`,
    '    return 0',
    '  fi',
    `  COMPREPLY=( $(compgen -W "${allFlags}" -- "\${cur}") )`,
    '  return 0',
    '}',
    `complete -F _mcp_qa_11x_completions ${BIN_NAME}`,
    '',
  ].join('\n');
}

function formatZshSimpleSpecs(spec: SimpleFlagSpec, valueSuffix: string): string {
  const lines = [`    '${spec.long}[${spec.desc}]${valueSuffix}'`];
  if (spec.short) {
    lines.push(`    '${spec.short}[${spec.desc}]${valueSuffix}'`);
  }
  return lines.join(' \\\n');
}

function buildZshCompletion(): string {
  const subLines = SUBCOMMANDS.map((s) => `    '${s.name}:${s.summary}'`);
  const argSpecs = FLAG_CHOICES.map((spec) => {
    const vals = spec.values.join(' ');
    const lines = [`    '${spec.long}[${spec.desc}]:${spec.zshMeta}:(${vals})'`];
    if (spec.short) {
      lines.push(`    '${spec.short}[${spec.desc}]:${spec.zshMeta}:(${vals})'`);
    }
    return lines.join(' \\\n');
  });
  const extraSpecs = EXTRA_VALUE_FLAGS.map((spec) => formatZshSimpleSpecs(spec, ':value:'));
  const boolSpecs = BOOLEAN_FLAGS.map((spec) => formatZshSimpleSpecs(spec, ''));
  const allArgLines = [
    ...argSpecs,
    ...extraSpecs,
    ...boolSpecs,
    `    '1:shell:(${SUPPORTED_SHELLS.join(' ')})'`,
  ].join(' \\\n');

  return [
    `#compdef ${BIN_NAME}`,
    '_mcp_qa_11x() {',
    '  local -a subcommands',
    '  subcommands=(',
    ...subLines,
    '  )',
    '  if (( CURRENT == 2 )); then',
    "    _describe 'command' subcommands",
    '    return',
    '  fi',
    '  shift words',
    '  (( CURRENT-- ))',
    '  _arguments \\',
    allArgLines,
    '}',
    `(( $+functions[compdef] )) && compdef _mcp_qa_11x ${BIN_NAME}`,
    '',
  ].join('\n');
}

const COMPLETION_VALUE_FLAGS = new Set(['--shell']);

function assignShellValue(current: string | undefined, value: string): string {
  if (current !== undefined) {
    throw new Error(`Argumento posicional inesperado en completion: '${value}'.`);
  }
  return value;
}

function consumeCompletionToken(
  args: readonly string[],
  index: number,
  state: { shell?: string }
): number {
  const arg = pickAt(args, index);
  const shellMatch = matchFlagValue(args, index, COMPLETION_VALUE_FLAGS);
  if (shellMatch) {
    state.shell = assignShellValue(state.shell, shellMatch.value);
    return shellMatch.consumed;
  }
  if (arg.startsWith('-')) {
    throw new Error(`Opción desconocida en completion: '${arg}'.`);
  }
  state.shell = assignShellValue(state.shell, arg);
  return 0;
}

function parseShellArg(args: readonly string[]): string | undefined {
  const state: { shell?: string } = {};
  for (let i = 0; i < args.length; i += 1) {
    i += consumeCompletionToken(args, i, state);
  }
  return state.shell;
}

function isSupportedShell(raw: string): raw is SupportedShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(raw);
}

export function runCompletionCli(args: readonly string[]): CliCommandOutput {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: COMPLETION_HELP_TEXT };
  }
  try {
    const rawShell = parseShellArg(args);
    if (!rawShell) {
      return {
        exitCode: 1,
        output: `${ERROR_PREFIX} Especifica un shell soportado: ${SUPPORTED_SHELLS.join(', ')}.`,
        isError: true,
      };
    }
    const normalized = rawShell.trim().toLowerCase();
    if (!isSupportedShell(normalized)) {
      return {
        exitCode: 1,
        output: `${ERROR_PREFIX} Shell no soportado: '${rawShell}'. Soportados: ${SUPPORTED_SHELLS.join(', ')}.`,
        isError: true,
      };
    }
    const builders: Readonly<Record<SupportedShell, () => string>> = {
      fish: buildFishCompletion,
      bash: buildBashCompletion,
      zsh: buildZshCompletion,
    };
    return { exitCode: 0, output: builders[normalized]() };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      output: `${ERROR_PREFIX} ${detail}`,
      isError: true,
    };
  }
}
