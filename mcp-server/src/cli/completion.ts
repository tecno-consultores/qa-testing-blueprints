// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { pickAt } from '../utils/diagnosticFormatter.js';
import { type CliCommandOutput, hasHelpFlag, matchFlagValue } from './cliArgHelpers.js';
import {
  type CliFlagSpec,
  getCatalogCompletionFlags,
  getCatalogCompletionSubcommands,
  renderSubcommandHelpText,
  resolveCliHelpLang,
} from './commandCatalog.js';

export const SUPPORTED_SHELLS = ['fish', 'bash', 'zsh'] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

const BIN_NAME = 'mcp-qa-11x';
const ERROR_PREFIX = '❌ [completion]';

const SUBCOMMANDS = getCatalogCompletionSubcommands();
const { choiceFlags: FLAG_CHOICES, valueFlags: EXTRA_VALUE_FLAGS, booleanFlags: BOOLEAN_FLAGS } =
  getCatalogCompletionFlags();

export const COMPLETION_HELP_TEXT = renderSubcommandHelpText('completion', 'en');

function escapeShellSingleQuote(text: string): string {
  return text.replaceAll("'", "'\\''");
}

function formatFishSimpleFlag(spec: CliFlagSpec, requiresArg: boolean): string {
  const shortPart = spec.short ? ` -s ${spec.short.slice(1)}` : '';
  const argPart = requiresArg ? ' -r' : '';
  return `complete -c ${BIN_NAME} -l ${spec.long.slice(2)}${shortPart}${argPart} -d '${escapeShellSingleQuote(spec.desc.en)}'`;
}

function appendFishEntries(lines: string[]): void {
  for (const sub of SUBCOMMANDS) {
    lines.push(
      `complete -c ${BIN_NAME} -n '__fish_use_subcommand' -a '${sub.name}' -d '${escapeShellSingleQuote(sub.summary)}'`
    );
  }
  for (const spec of FLAG_CHOICES) {
    const shortPart = spec.short ? ` -s ${spec.short.slice(1)}` : '';
    lines.push(
      `complete -c ${BIN_NAME} -l ${spec.long.slice(2)}${shortPart} -x -a '${spec.values.join(' ')}' -d '${escapeShellSingleQuote(spec.desc.en)}'`
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

function formatZshSimpleSpecs(spec: CliFlagSpec, valueSuffix: string): string {
  const desc = escapeShellSingleQuote(spec.desc.en);
  const lines = [`    '${spec.long}[${desc}]${valueSuffix}'`];
  if (spec.short) {
    lines.push(`    '${spec.short}[${desc}]${valueSuffix}'`);
  }
  return lines.join(' \\\n');
}

function buildZshCompletion(): string {
  const subLines = SUBCOMMANDS.map(
    (s) => `    '${s.name}:${escapeShellSingleQuote(s.summary)}'`
  );
  const argSpecs = FLAG_CHOICES.map((spec) => {
    const vals = spec.values.join(' ');
    const desc = escapeShellSingleQuote(spec.desc.en);
    const lines = [`    '${spec.long}[${desc}]:${spec.zshMeta}:(${vals})'`];
    if (spec.short) {
      lines.push(`    '${spec.short}[${desc}]:${spec.zshMeta}:(${vals})'`);
    }
    return lines.join(' \\\n');
  });
  const extraSpecs = EXTRA_VALUE_FLAGS.map((spec) => formatZshSimpleSpecs(spec, ':value:'));
  const boolSpecs = BOOLEAN_FLAGS.map((spec) => formatZshSimpleSpecs(spec, ''));
  const allArgLines = [...argSpecs, ...extraSpecs, ...boolSpecs].join(' \\\n');

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
    '  local subcmd="${words[2]}"',
    '  shift words',
    '  (( CURRENT-- ))',
    '  if [[ "${subcmd}" == "completion" ]] && (( CURRENT == 2 )); then',
    '    local -a shells',
    `    shells=(${SUPPORTED_SHELLS.join(' ')})`,
    "    _describe 'shell' shells",
    '    return',
    '  fi',
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
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('completion', resolveCliHelpLang(args)),
    };
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
