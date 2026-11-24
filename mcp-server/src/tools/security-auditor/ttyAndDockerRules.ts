// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  COMPOSE_RUN_VALUE_FLAGS,
  COMPOSE_VALUE_FLAGS,
  QA_CLI_TTY_01_REF,
  QA_DOCKER_TTY_01_REF,
  QA_DOCKER_TTY_01_RULE,
  QA_DOCKER_TTY_NO_TTY_REMEDIATION,
  QA_DOCKER_TTY_OK_PRAGMA,
  QA_DOCKER_TTY_WRANGLER_REMEDIATION,
  QA_HEALTH_01_REF,
  QA_HEALTH_OK_PRAGMA,
  QA_TTY_OK_PRAGMA,
  isAuditorSelfDefinition,
  isGithubWorkflowOrActionFile,
  isTestFilePath,
} from './shared.js';

function isUncheckedSupervisorWindow(lines: readonly string[], idx: number): boolean {
  const windowStart = Math.max(0, idx - 6);
  const windowEnd = Math.min(lines.length, idx + 12);
  const windowText = lines.slice(windowStart, windowEnd).join('\n');
  if (!windowText.includes('.cancelled()')) return false;
  return !windowText.includes('.exception()') && !windowText.includes(QA_HEALTH_OK_PRAGMA);
}

export function checkQaHealth01SupervisorTaskExit(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    !relPath.endsWith('.py') ||
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath)
  ) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  let lastReportedLine = -1;
  for (const [i, line] of lines.entries()) {
    if (i <= lastReportedLine || line.includes(QA_HEALTH_OK_PRAGMA) || !line.includes('.done()')) {
      continue;
    }
    if (!isUncheckedSupervisorWindow(lines, i)) continue;

    findings.push({
      rule_id: 'QA-HEALTH-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_HEALTH_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Supervisor asyncio evalúa task.done() y task.cancelled() sin inspeccionar task.exception() ni distinguir retorno limpio opt-in (return None) de fallos fatales.',
      remediation:
        'Inspeccionar task.exception() is not None y declarar OPTIONAL_WORKERS para que salidas limpias por feature-flag deshabilitado no degraden el healthcheck del contenedor.',
    });
    lastReportedLine = i + 6;
  }

  return findings;
}

function isDualCliMcpStdioSource(relPath: string, fullText: string): boolean {
  if (/\.(?:ts|js|mjs)$/i.test(relPath)) {
    const hasStdioTransport = fullText.includes('StdioServerTransport');
    const hasCliEntrypoint =
      fullText.includes('process.argv') || fullText.startsWith('#!/usr/bin/env node');
    return hasStdioTransport && hasCliEntrypoint && !fullText.includes('.isTTY');
  }

  if (relPath.endsWith('.py')) {
    const hasStdioServer = fullText.includes('stdio_server(');
    const hasCliEntrypoint =
      fullText.includes('sys.argv') ||
      fullText.includes('argparse.') ||
      fullText.includes('typer.Typer');
    return hasStdioServer && hasCliEntrypoint && !fullText.includes('.isatty()');
  }

  return false;
}

export function checkQaCliTty01InteractiveHangGuard(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath)
  ) {
    return [];
  }

  const fullText = lines.join('\n');
  if (fullText.includes(QA_TTY_OK_PRAGMA) || !isDualCliMcpStdioSource(relPath, fullText)) {
    return [];
  }

  const transportIdx = lines.findIndex(
    (line) => line.includes('StdioServerTransport') || line.includes('stdio_server(')
  );

  return [
    {
      rule_id: 'QA-CLI-TTY-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_CLI_TTY_01_REF,
      file: relPath,
      line: Math.max(1, transportIdx + 1),
      message:
        'Binario dual CLI + Servidor MCP stdio conecta transporte JSON-RPC sobre stdin sin verificar terminal interactiva (process.stdin.isTTY / sys.stdin.isatty()), provocando bloqueo indefinido al ejecutarse manualmente en consola.',
      remediation:
        'Inspeccionar process.stdin.isTTY (Node/TS) o sys.stdin.isatty() (Python) cuando se invoca sin subcomandos para ejecutar auto-sync/mostrar ayuda y salir con código 0 sin colgar la terminal (permitiendo --stdio explícito), certificándolo en E2E con TTY simulado y timeout.',
    },
  ];
}

interface LogicalShellCommand {
  startLine: number;
  text: string;
  exempt: boolean;
}

interface ActiveComposeLine {
  lineNum: number;
  text: string;
  exempt: boolean;
}

function makeDockerTtyFinding(
  relPath: string,
  line: number,
  message: string,
  remediation: string
): SecurityFinding {
  return {
    rule_id: QA_DOCKER_TTY_01_RULE,
    severity: 'HIGH',
    stig_owasp_ref: QA_DOCKER_TTY_01_REF,
    file: relPath,
    line,
    message,
    remediation,
  };
}

function consumeContinuedCommand(
  lines: string[],
  startIndex: number,
  initialExempt: boolean
): { command: LogicalShellCommand; nextIndex: number } {
  const startLine = startIndex + 1;
  let exempt = initialExempt;
  const parts: string[] = [];
  let idx = startIndex;
  while (idx < lines.length) {
    const cur = pickAt(lines, idx);
    if (cur.includes(QA_DOCKER_TTY_OK_PRAGMA)) exempt = true;
    const cleanEnd = cur.trimEnd();
    const continues = cleanEnd.endsWith('\\') && !cleanEnd.endsWith('\\\\');
    parts.push(continues ? cleanEnd.slice(0, -1).trim() : cleanEnd.trim());
    idx++;
    if (!continues) break;
  }
  return { command: { startLine, text: parts.join(' '), exempt }, nextIndex: idx };
}

function collectLogicalCommands(lines: string[]): LogicalShellCommand[] {
  const commands: LogicalShellCommand[] = [];
  let prevPragma = false;
  let i = 0;
  while (i < lines.length) {
    const line = pickAt(lines, i);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && line.includes(QA_DOCKER_TTY_OK_PRAGMA);
      i++;
      continue;
    }
    const { command, nextIndex } = consumeContinuedCommand(lines, i, prevPragma);
    prevPragma = false;
    commands.push(command);
    i = nextIndex;
  }
  return commands;
}

function pushTokenAndReset(tokens: string[], current: string, sep?: string): string {
  if (current) tokens.push(current);
  if (sep) tokens.push(sep);
  return '';
}

function readQuotedSpan(
  text: string,
  startIdx: number,
  quoteChar: string
): { chunk: string; endIdx: number } {
  let chunk = '';
  let idx = startIdx + 1;
  while (idx < text.length && text[idx] !== quoteChar) {
    chunk += pickAt(text, idx);
    idx++;
  }
  return { chunk, endIdx: idx };
}

function shellSeparatorLength(text: string, idx: number): number {
  const ch = text[idx];
  if (ch === ';' || ch === '|') return 1;
  if (ch === '&' && text[idx + 1] === '&') return 2;
  return 0;
}

function splitShellTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let i = 0;
  while (i < text.length) {
    const ch = pickAt(text, i);
    const sepLen = shellSeparatorLength(text, i);
    if (ch === "'" || ch === '"') {
      const span = readQuotedSpan(text, i, ch);
      current += span.chunk;
      i = span.endIdx + 1;
    } else if (sepLen > 0) {
      current = pushTokenAndReset(tokens, current, ';');
      i += sepLen;
    } else if (/\s/.test(ch)) {
      current = pushTokenAndReset(tokens, current);
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  pushTokenAndReset(tokens, current);
  return tokens;
}

function advanceComposeSubcommand(tokens: string[], afterComposeIdx: number): number {
  let idx = afterComposeIdx;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = pickAt(tokens, idx);
    if (!tok.startsWith('-')) return idx;
    idx += COMPOSE_VALUE_FLAGS.has(tok) ? 2 : 1;
  }
  return -1;
}

function checkRunFlagsMissingNoTty(tokens: string[], runIdx: number): boolean {
  let idx = runIdx + 1;
  let hasNoTty = false;
  while (idx < tokens.length && tokens[idx] !== ';') {
    const tok = pickAt(tokens, idx);
    if (!tok.startsWith('-')) break;
    const isShortNoTty = !tok.startsWith('--') && tok.includes('T');
    if (tok === '--no-TTY' || isShortNoTty) {
      hasNoTty = true;
    }
    idx += COMPOSE_RUN_VALUE_FLAGS.has(tok) ? 2 : 1;
  }
  return !hasNoTty;
}

function hasComposeRunMissingNoTty(commandText: string): boolean {
  const tokens = splitShellTokens(commandText);
  for (let i = 0; i < tokens.length; i++) {
    const isDockerCompose = tokens[i] === 'docker' && tokens[i + 1] === 'compose';
    const isLegacyCompose = tokens[i] === 'docker-compose';
    if (!isDockerCompose && !isLegacyCompose) continue;
    const subIdx = advanceComposeSubcommand(tokens, i + (isDockerCompose ? 2 : 1));
    if (subIdx !== -1 && tokens[subIdx] === 'run' && checkRunFlagsMissingNoTty(tokens, subIdx)) {
      return true;
    }
  }
  return false;
}

function isTargetComposeRunnerFile(relPath: string, lines: string[]): boolean {
  if (isGithubWorkflowOrActionFile(relPath)) return true;
  const norm = relPath.replace(/\\/g, '/');
  if (!norm.endsWith('.sh') && !norm.endsWith('.bash')) return false;
  const base = path.posix.basename(norm);
  if (/^(?:deploy|ci|probar-|release)/i.test(base)) return true;
  return lines.some(
    (l) => !l.trimStart().startsWith('#') && /\bCI\s*=\s*['"]?true['"]?\b/.test(l)
  );
}

function extractActiveComposeLines(lines: string[]): ActiveComposeLine[] {
  const active: ActiveComposeLine[] = [];
  let prevPragma = false;
  for (const [i, raw] of lines.entries()) {
    const trimmed = raw.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && raw.includes(QA_DOCKER_TTY_OK_PRAGMA);
      continue;
    }
    const exempt = prevPragma || raw.includes(QA_DOCKER_TTY_OK_PRAGMA);
    prevPragma = false;
    active.push({ lineNum: i + 1, text: raw, exempt });
  }
  return active;
}

function checkWranglerTmpfsHardening(
  relPath: string,
  activeLines: ActiveComposeLine[]
): SecurityFinding[] {
  const readOnlyLine = activeLines.find(
    (l) => !l.exempt && /^\s*read_only\s*:\s*true\b/.test(l.text)
  );
  if (!readOnlyLine) return [];
  const wranglerMount = activeLines.find((l) => l.text.includes('.wrangler'));
  if (!wranglerMount) {
    return [
      makeDockerTtyFinding(
        relPath,
        readOnlyLine.lineNum,
        'Servicio Compose con read_only: true invoca wrangler sin montar .wrangler como tmpfs, provocando fallo ENOENT/EROFS en saveToConfigCache().',
        QA_DOCKER_TTY_WRANGLER_REMEDIATION
      ),
    ];
  }
  if (!wranglerMount.exempt && !/\bnoexec\b/.test(wranglerMount.text)) {
    return [
      makeDockerTtyFinding(
        relPath,
        wranglerMount.lineNum,
        'Montaje tmpfs de .wrangler en contenedor read_only: true carece de la opción noexec (requerida por endurecimiento 11X).',
        QA_DOCKER_TTY_WRANGLER_REMEDIATION
      ),
    ];
  }
  return [];
}

function checkWranglerCiForceFlag(
  relPath: string,
  lines: string[],
  activeLines: ActiveComposeLine[]
): SecurityFinding[] {
  const hasCiTrue = activeLines.some((l) => /\bCI\s*[:=]\s*['"]?true['"]?/i.test(l.text));
  if (!hasCiTrue) return [];
  const findings: SecurityFinding[] = [];
  for (const cmd of collectLogicalCommands(lines)) {
    if (cmd.exempt) continue;
    const isPagesMutating = /\bwrangler\s+pages\s+(?:deploy|project\s+create)\b/.test(cmd.text);
    if (isPagesMutating && !/--force(?:\s|=|$)/.test(cmd.text)) {
      findings.push(
        makeDockerTtyFinding(
          relPath,
          cmd.startLine,
          'Comando wrangler pages deploy/project create bajo CI=true omite --force, arriesgando bloqueo no interactivo o delegación silenciosa Pages-to-Workers (maybeDelegatePagesToWorkers).',
          QA_DOCKER_TTY_WRANGLER_REMEDIATION
        )
      );
    }
  }
  return findings;
}

export function checkQaDockerTty01NonInteractiveAndReadOnly(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    lines.slice(0, 5).some((l) => l.includes(QA_DOCKER_TTY_OK_PRAGMA))
  ) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  if (isTargetComposeRunnerFile(relPath, lines)) {
    for (const cmd of collectLogicalCommands(lines)) {
      if (!cmd.exempt && hasComposeRunMissingNoTty(cmd.text)) {
        findings.push(
          makeDockerTtyFinding(
            relPath,
            cmd.startLine,
            'Invocación docker compose run en script CI/deploy o GitHub Workflow omite -T (--no-TTY), asignando un pseudo-TTY que colisiona con CI=true.',
            QA_DOCKER_TTY_NO_TTY_REMEDIATION
          )
        );
      }
    }
  }

  const norm = relPath.replace(/\\/g, '/');
  if (/(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(norm)) {
    const activeLines = extractActiveComposeLines(lines);
    if (activeLines.some((l) => !l.exempt && /\bwrangler\b/.test(l.text))) {
      findings.push(
        ...checkWranglerTmpfsHardening(relPath, activeLines),
        ...checkWranglerCiForceFlag(relPath, lines, activeLines)
      );
    }
  }
  return findings;
}

