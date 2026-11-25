// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  QA_DOCKER_LOOP_01_REF,
  QA_DOCKER_LOOP_01_RULE,
  QA_DOCKER_LOOP_COMPOSE_REMEDIATION,
  QA_DOCKER_LOOP_OK_PRAGMA,
  QA_DOCKER_LOOP_SCRIPT_REMEDIATION,
  isAuditorSelfDefinition,
  isTestFilePath,
} from './shared.js';
import {
  advanceComposeSubcommand,
  isTargetComposeRunnerFile,
  splitShellTokens,
} from './ttyAndDockerRules.js';

const TARGET_COMPOSE_RE = /(?:^|\/)(?:docker-compose|compose)\.(?:qa|test|deploy)[^/]*\.ya?ml$/i;
const UNBOUNDED_RESTART_VALUES = new Set(['always', 'unless-stopped', 'on-failure']);
const SERIAL_PARALLEL_LIMIT_RE = /\bCOMPOSE_PARALLEL_LIMIT\s*[:=]\s*['"]?1['"]?\b/;
const COMPOSE_QA_REF_RE = /\bdocker-compose\.qa\.ya?ml\b|\bmake\s+qa-/;
const COMPOSE_DEPLOY_DOWN_RE =
  /\bdocker[\s-]+compose\b[^\n]*docker-compose\.deploy\.ya?ml[^\n]*\bdown\b/;
const COMPOSE_QA_DOWN_RE =
  /\bdocker[\s-]+compose\b[^\n]*docker-compose\.qa\.ya?ml[^\n]*\bdown\b|\b(?:limpieza\.sh|make\s+(?:qa-)?clean)\b/;

const DOCKER_RUN_VALUE_FLAGS = new Set([
  '-u', '--user', '-e', '--env', '--env-file', '-v', '--volume', '-w', '--workdir',
  '-p', '--publish', '-l', '--label', '--name', '--network', '--net', '--cpus',
  '-m', '--memory', '--memory-swap', '--pids-limit', '--security-opt', '--cap-add',
  '--cap-drop', '--entrypoint', '--pull', '--tmpfs', '--platform', '--restart',
  '--shm-size', '--ulimit', '--mount', '--add-host', '--hostname', '-h',
]);

const COMPOSE_BUILD_VALUE_FLAGS = new Set([
  '--build-arg', '-m', '--memory', '--ssh', '--builder', '--progress',
]);

interface LogicalCmd {
  readonly startLine: number;
  readonly text: string;
  readonly exempt: boolean;
}

interface DockerRunScanState {
  hasRm: boolean;
  badRestart: string | null;
}

function makeLoopFinding(
  relPath: string,
  line: number,
  message: string,
  remediation: string
): SecurityFinding {
  return {
    rule_id: QA_DOCKER_LOOP_01_RULE,
    severity: 'HIGH',
    stig_owasp_ref: QA_DOCKER_LOOP_01_REF,
    file: relPath,
    line,
    message,
    remediation,
  };
}

function consumeContinuedLoopCommand(
  lines: string[],
  startIndex: number,
  initialExempt: boolean
): { command: LogicalCmd; nextIndex: number } {
  const startLine = startIndex + 1;
  let exempt = initialExempt;
  const parts: string[] = [];
  let idx = startIndex;
  while (idx < lines.length) {
    const cur = pickAt(lines, idx);
    if (cur.includes(QA_DOCKER_LOOP_OK_PRAGMA)) exempt = true;
    const cleanEnd = cur.trimEnd();
    const continues = cleanEnd.endsWith('\\') && !cleanEnd.endsWith('\\\\');
    parts.push(continues ? cleanEnd.slice(0, -1).trim() : cleanEnd.trim());
    idx += 1;
    if (!continues) break;
  }
  return { command: { startLine, text: parts.join(' '), exempt }, nextIndex: idx };
}

function collectLoopCommands(lines: string[]): LogicalCmd[] {
  const commands: LogicalCmd[] = [];
  let prevPragma = false;
  let i = 0;
  while (i < lines.length) {
    const line = pickAt(lines, i);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && line.includes(QA_DOCKER_LOOP_OK_PRAGMA);
      i += 1;
      continue;
    }
    const { command, nextIndex } = consumeContinuedLoopCommand(lines, i, prevPragma);
    prevPragma = false;
    commands.push(command);
    i = nextIndex;
  }
  return commands;
}

function extractUnboundedRestartValue(rawLine: string): string | null {
  const hashIdx = rawLine.indexOf('#');
  const code = (hashIdx === -1 ? rawLine : rawLine.slice(0, hashIdx)).trim();
  if (!code.startsWith('restart:')) return null;
  const rawVal = code.slice('restart:'.length).trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return UNBOUNDED_RESTART_VALUES.has(rawVal) ? rawVal : null;
}

function inspectComposeRestartPolicies(relPath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  let prevPragma = false;
  for (const [idx, raw] of lines.entries()) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      prevPragma = trimmed.startsWith('#') && raw.includes(QA_DOCKER_LOOP_OK_PRAGMA);
      continue;
    }
    const exempt = prevPragma || raw.includes(QA_DOCKER_LOOP_OK_PRAGMA);
    prevPragma = false;
    if (exempt) continue;
    const badVal = extractUnboundedRestartValue(raw);
    if (badVal) {
      findings.push(
        makeLoopFinding(
          relPath,
          idx + 1,
          `Política de reinicio ilimitada 'restart: ${badVal}' en manifiesto QA/test/deploy puede causar CrashLoop infinito y saturación térmica/veth.`,
          QA_DOCKER_LOOP_COMPOSE_REMEDIATION
        )
      );
    }
  }
  return findings;
}

function parseRestartFlagValue(tokens: readonly string[], idx: number): { value: string; step: number } {
  const tok = pickAt(tokens, idx);
  if (tok.startsWith('--restart=')) {
    return { value: tok.slice('--restart='.length), step: 1 };
  }
  return { value: tokens[idx + 1] ?? '', step: 2 };
}

function advanceDockerRunFlag(
  tokens: readonly string[],
  idx: number,
  state: DockerRunScanState
): number {
  const tok = pickAt(tokens, idx);
  if (tok === '--rm') {
    state.hasRm = true;
    return 1;
  }
  if (tok === '--restart' || tok.startsWith('--restart=')) {
    const parsed = parseRestartFlagValue(tokens, idx);
    if (UNBOUNDED_RESTART_VALUES.has(parsed.value.toLowerCase())) {
      state.badRestart = parsed.value;
    }
    return parsed.step;
  }
  return !tok.includes('=') && DOCKER_RUN_VALUE_FLAGS.has(tok) ? 2 : 1;
}

function inspectDockerRunTokens(
  relPath: string,
  lineNum: number,
  tokens: readonly string[],
  runIdx: number
): SecurityFinding[] {
  const state: DockerRunScanState = { hasRm: false, badRestart: null };
  let idx = runIdx + 1;
  while (idx < tokens.length && tokens[idx] !== ';') {
    if (!pickAt(tokens, idx).startsWith('-')) break;
    idx += advanceDockerRunFlag(tokens, idx, state);
  }

  const findings: SecurityFinding[] = [];
  if (state.badRestart) {
    findings.push(
      makeLoopFinding(
        relPath,
        lineNum,
        `Invocación 'docker run' con política ilimitada '--restart ${state.badRestart}' en script CI/deploy.`,
        QA_DOCKER_LOOP_SCRIPT_REMEDIATION
      )
    );
  }
  if (!state.hasRm) {
    findings.push(
      makeLoopFinding(
        relPath,
        lineNum,
        "Invocación 'docker run' en script CI/deploy omite '--rm', dejando contenedores huérfanos en dockerd.",
        QA_DOCKER_LOOP_SCRIPT_REMEDIATION
      )
    );
  }
  return findings;
}

function inspectComposeUpWaitTokens(
  relPath: string,
  lineNum: number,
  tokens: readonly string[],
  subIdx: number
): SecurityFinding[] {
  let hasWait = false;
  let hasWaitTimeout = false;
  for (let i = subIdx + 1; i < tokens.length && tokens[i] !== ';'; i += 1) {
    const tok = pickAt(tokens, i);
    if (tok === '--wait') hasWait = true;
    if (tok === '--wait-timeout' || tok.startsWith('--wait-timeout=')) hasWaitTimeout = true;
  }
  if (!hasWait || hasWaitTimeout) return [];
  return [
    makeLoopFinding(
      relPath,
      lineNum,
      "Invocación 'docker compose up --wait' omite '--wait-timeout', arriesgando bloqueos indefinidos ante healthchecks degradados.",
      QA_DOCKER_LOOP_SCRIPT_REMEDIATION
    ),
  ];
}

function countComposeBuildServices(tokens: readonly string[], subIdx: number): number {
  let services = 0;
  let i = subIdx + 1;
  while (i < tokens.length && tokens[i] !== ';') {
    const tok = pickAt(tokens, i);
    if (tok.startsWith('-')) {
      i += !tok.includes('=') && COMPOSE_BUILD_VALUE_FLAGS.has(tok) ? 2 : 1;
    } else {
      services += 1;
      i += 1;
    }
  }
  return services;
}

function inspectComposeSubcommandAt(input: {
  relPath: string;
  lineNum: number;
  tokens: string[];
  afterComposeIdx: number;
  hasSerialBuildLimit: boolean;
}): SecurityFinding[] {
  const { relPath, lineNum, tokens, afterComposeIdx, hasSerialBuildLimit } = input;
  const subIdx = advanceComposeSubcommand(tokens, afterComposeIdx);
  if (subIdx === -1) return [];
  const sub = pickAt(tokens, subIdx);
  if (sub === 'up') {
    return inspectComposeUpWaitTokens(relPath, lineNum, tokens, subIdx);
  }
  if (sub === 'build' && !hasSerialBuildLimit && countComposeBuildServices(tokens, subIdx) >= 2) {
    return [
      makeLoopFinding(
        relPath,
        lineNum,
        "Invocación 'docker compose build' con múltiples servicios en paralelo sin exportar COMPOSE_PARALLEL_LIMIT=1.",
        QA_DOCKER_LOOP_SCRIPT_REMEDIATION
      ),
    ];
  }
  return [];
}

function inspectShellCommandTokens(
  relPath: string,
  cmd: LogicalCmd,
  hasSerialBuildLimit: boolean
): SecurityFinding[] {
  const tokens = splitShellTokens(cmd.text);
  const findings: SecurityFinding[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === 'docker' && tokens[i + 1] === 'run') {
      findings.push(...inspectDockerRunTokens(relPath, cmd.startLine, tokens, i + 1));
      continue;
    }
    const isCompose = tokens[i] === 'docker' && tokens[i + 1] === 'compose';
    const isLegacy = tokens[i] === 'docker-compose';
    if (!isCompose && !isLegacy) continue;
    findings.push(
      ...inspectComposeSubcommandAt({
        relPath,
        lineNum: cmd.startLine,
        tokens,
        afterComposeIdx: i + (isCompose ? 2 : 1),
        hasSerialBuildLimit,
      })
    );
  }
  return findings;
}

function inspectDeployDualComposeCleanup(relPath: string, lines: string[]): SecurityFinding[] {
  const base = path.posix.basename(relPath.replace(/\\/g, '/'));
  if (!/^deploy/i.test(base)) return [];
  const fullText = lines.join('\n');
  if (!COMPOSE_QA_REF_RE.test(fullText) || COMPOSE_QA_DOWN_RE.test(fullText)) return [];
  const deployDownIdx = lines.findIndex(
    (l) => !l.trimStart().startsWith('#') && COMPOSE_DEPLOY_DOWN_RE.test(l)
  );
  if (deployDownIdx === -1) return [];
  return [
    makeLoopFinding(
      relPath,
      deployDownIdx + 1,
      'Script deploy*.sh ejecuta QA en docker-compose.qa.yml pero su rutina de limpieza solo desmonta docker-compose.deploy.yml, dejando servicios QA huérfanos.',
      QA_DOCKER_LOOP_SCRIPT_REMEDIATION
    ),
  ];
}

export function checkQaDockerLoop01Containment(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    relPath.endsWith('.example') ||
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    lines.slice(0, 5).some((l) => l.includes(QA_DOCKER_LOOP_OK_PRAGMA))
  ) {
    return [];
  }

  const norm = relPath.replace(/\\/g, '/');
  if (TARGET_COMPOSE_RE.test(norm)) {
    return inspectComposeRestartPolicies(relPath, lines);
  }
  if (!isTargetComposeRunnerFile(relPath, lines)) {
    return [];
  }

  const hasSerialBuildLimit = lines.some(
    (l) => !l.trimStart().startsWith('#') && SERIAL_PARALLEL_LIMIT_RE.test(l)
  );
  const findings: SecurityFinding[] = [];
  for (const cmd of collectLoopCommands(lines)) {
    if (!cmd.exempt) {
      findings.push(...inspectShellCommandTokens(relPath, cmd, hasSerialBuildLimit));
    }
  }
  findings.push(...inspectDeployDualComposeCleanup(relPath, lines));
  return findings;
}
