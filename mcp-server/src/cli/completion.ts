// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { pickAt } from '../utils/diagnosticFormatter.js';
import { type CliCommandOutput, hasHelpFlag, readNextFlagValue } from './cliArgHelpers.js';

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
];

interface FlagChoiceSpec {
  readonly long: string;
  readonly short?: string;
  readonly values: readonly string[];
  readonly desc: string;
  readonly zshMeta: string;
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

const EXTRA_VALUE_FLAGS: readonly string[] = [
  '--project-path',
  '--dir',
  '--agents',
  '--target',
  '--symbol',
  '--changed-since',
  '--max-tokens',
  '--max-items',
  '--junit-xml',
  '--max-findings',
  '--architecture-path',
];

const BOOLEAN_FLAGS: readonly string[] = [
  '--init-agents',
  '--include-scripts',
  '--reconcile',
  '--auto-build',
  '--refresh',
  '--print',
  '--install',
  '--pin-version',
  '--offline',
  '--strict',
  '--require-lint-evidence',
  '--allow-unmerged-examples',
  '--release-gate',
  '--sarif',
  '--include-examples',
  '--cache-only',
  '--dry-run',
  '--force',
  '--json',
  '--help',
];

export const COMPLETION_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x completion <fish|bash|zsh>',
  '   o: npx -y @sinfallas/mcp-qa-11x completion --shell <fish|bash|zsh>',
  '',
  'Opciones:',
  '  --shell <fish|bash|zsh>  Shell objetivo para autocompletado',
  '  --help, -h               Muestra esta ayuda y sale con código 0',
].join('\n');

function buildFishCompletion(): string {
  const lines: string[] = [
    `# fish completion for ${BIN_NAME}`,
    `complete -c ${BIN_NAME} -f`,
  ];
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
  for (const flag of EXTRA_VALUE_FLAGS) {
    lines.push(`complete -c ${BIN_NAME} -l ${flag.slice(2)} -r`);
  }
  for (const flag of BOOLEAN_FLAGS) {
    lines.push(`complete -c ${BIN_NAME} -l ${flag.slice(2)}`);
  }
  lines.push(
    `complete -c ${BIN_NAME} -n '__fish_seen_subcommand_from completion' -a '${SUPPORTED_SHELLS.join(' ')}'`
  );
  return `${lines.join('\n')}\n`;
}

function buildBashCompletion(): string {
  const subNames = SUBCOMMANDS.map((s) => s.name).join(' ');
  const allFlags = [
    ...FLAG_CHOICES.map((f) => f.long),
    ...EXTRA_VALUE_FLAGS,
    ...BOOLEAN_FLAGS,
  ].join(' ');
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
    `    COMPREPLY=( $(compgen -W "${subNames} --help --version --stdio" -- "\${cur}") )`,
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
  const extraSpecs = EXTRA_VALUE_FLAGS.map((f) => `    '${f}[Option ${f}]:value:'`);
  const boolSpecs = BOOLEAN_FLAGS.map((f) => `    '${f}[Flag ${f}]'`);
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
    '  _arguments \\',
    allArgLines,
    '}',
    `(( $+functions[compdef] )) && compdef _mcp_qa_11x ${BIN_NAME}`,
    '',
  ].join('\n');
}

function parseShellArg(args: readonly string[]): string | undefined {
  let shell: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = pickAt(args, i);
    if (arg === '--shell') {
      shell = readNextFlagValue(args, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Opción desconocida en completion: '${arg}'.`);
    }
    shell = arg;
  }
  return shell;
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
