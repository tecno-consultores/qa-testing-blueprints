// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt, reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import {
  BOOTSTRAP_PY_PACKAGES,
  PIP_VALUE_FLAGS,
  PROBE_ASSERTION_MARKERS,
  PY_MOCK_PATCH_MARKERS,
  QA_CONTRACT_SDK_01_REF,
  QA_CONTRACT_SDK_01_RULE,
  QA_CONTRACT_SDK_OK_PRAGMA,
  QA_CONTRACT_SDK_REMEDIATION,
  QA_DOCKER_LOCK_01_REF,
  QA_DOCKER_LOCK_01_RULE,
  QA_DOCKER_LOCK_OK_PRAGMA,
  QA_DOCKER_LOCK_REMEDIATION,
  QA_HEALTH_01_REF,
  QA_HEALTH_OK_PRAGMA,
  isAuditorSelfDefinition,
  isExcludedProbePath,
  isTestFilePath,
  joinContinuedShellLines,
  normalizeExampleRelPath,
  readTextFileSafe,
  stripExampleSuffix,
  type AuditSecurityOptions,
} from './shared.js';

function extractDockerfileHealthcheckText(content: string): string {
  const healthLines: string[] = [];
  for (const line of joinContinuedShellLines(content)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^HEALTHCHECK\b/i.test(trimmed) && !/^HEALTHCHECK\s+NONE\b/i.test(trimmed)) {
      healthLines.push(trimmed);
    }
  }
  return healthLines.join('\n');
}

function extractComposeHealthcheckText(content: string): string {
  const lines = content.split(/\r?\n/);
  const captured: string[] = [];
  let inHealthcheck = false;
  let baseIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (inHealthcheck) {
      if (indent <= baseIndent) {
        inHealthcheck = false;
      } else {
        captured.push(trimmed);
        continue;
      }
    }
    if (trimmed.toLowerCase() === 'healthcheck:' || /^healthcheck\s*:\s*#/i.test(trimmed)) {
      inHealthcheck = true;
      baseIndent = indent;
    }
  }
  return captured.join('\n');
}

function collectContainerHealthFiles(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): string[] {
  const includeExamples = options?.includeExamples ?? false;
  const composeFiles = allRelFiles.filter((rel) => {
    const effective = normalizeExampleRelPath(rel, options);
    return (
      (includeExamples || !rel.endsWith('.example')) &&
      /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(effective)
    );
  });
  const dockerDirs = ['', 'fastapi', 'python', 'backend', 'node-backend'];
  const dockerVariants = includeExamples
    ? ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.workers', 'Dockerfile.example']
    : ['Dockerfile', 'Dockerfile.prod', 'Dockerfile.workers'];
  const extraDockerfiles: string[] = [];

  for (const sub of dockerDirs) {
    for (const df of dockerVariants) {
      const rel = sub ? path.join(sub, df) : df;
      if (fs.existsSync(path.join(projectPath, rel))) {
        extraDockerfiles.push(rel);
      }
    }
  }

  return Array.from(new Set([...composeFiles, ...extraDockerfiles]));
}

function collectProbesFromCandidate(
  projectPath: string,
  rel: string,
  probeRegex: RegExp,
  probes: Set<string>
): void {
  const content = readTextFileSafe(path.join(projectPath, rel));
  if (!content) return;
  const isYaml = /\.ya?ml$/i.test(stripExampleSuffix(rel));
  const scopedText = isYaml
    ? extractComposeHealthcheckText(content)
    : extractDockerfileHealthcheckText(content);
  if (!scopedText) return;
  probeRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = probeRegex.exec(scopedText)) !== null) {
    if (!isExcludedProbePath(match[0])) {
      probes.add(match[0]);
    }
  }
}

function extractContainerProbePaths(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): string[] {
  const candidates = collectContainerHealthFiles(projectPath, allRelFiles, options);
  const probes = new Set<string>();
  const probeRegex = /\/(?:tmp|var\/run|run)\/[A-Za-z0-9_.-]{3,64}/g;

  for (const rel of candidates) {
    collectProbesFromCandidate(projectPath, rel, probeRegex, probes);
  }

  return Array.from(probes);
}

interface ProbeSourceMatch {
  relFile: string;
  line: number;
  symbolNames: string[];
}

function isProductionSourceCandidate(rel: string): boolean {
  const norm = rel.replace(/\\/g, '/');
  if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
    return false;
  }
  if (/(?:^|\/)(?:scripts\/|qa[-_.]|probar-|auditar-|verificar-|limpieza\.sh|certify_)/.test(norm)) {
    return false;
  }
  if (norm.endsWith('.sh') || norm.endsWith('.bash')) {
    return /(?:^|\/)(?:entrypoint|docker-entrypoint|start|run-worker|worker)[^/]*\.(?:sh|bash)$/i.test(norm);
  }
  return /\.(?:py|ts|js|php)$/.test(norm);
}

function extractAssignedConstants(lines: string[], targetToken: string): { line: number; symbols: string[] } {
  const symbols: string[] = [];
  let firstLine = 1;
  const constRegex = /^\s*([A-Z][A-Z0-9_]{2,50})\b/;

  for (const [i, line] of lines.entries()) {
    if (!line.includes(targetToken)) continue;
    if (firstLine === 1) firstLine = i + 1;
    const match = constRegex.exec(line);
    if (match) symbols.push(pickAt(match, 1));
  }

  return { line: firstLine, symbols };
}

function findSourceOrchestratorForProbe(
  projectPath: string,
  allRelFiles: string[],
  probePath: string
): ProbeSourceMatch | null {
  const baseToken = path.basename(probePath);
  for (const rel of allRelFiles) {
    if (!isProductionSourceCandidate(rel)) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (!content.includes(probePath) && !content.includes(baseToken)) continue;
      if (content.includes(QA_HEALTH_OK_PRAGMA)) return null;
      const lines = content.split(/\r?\n/);
      const matchedToken = content.includes(probePath) ? probePath : baseToken;
      const { line, symbols } = extractAssignedConstants(lines, matchedToken);
      return { relFile: rel, line, symbolNames: symbols };
    } catch (err: unknown) {
      // Continuar evaluando candidatos si un archivo puntual del repositorio no es legible
      reportDebugCatchError('security-auditor.findSourceOrchestratorForProbe', err);
    }
  }
  return null;
}

const PY_TEST_FUNC_LINE_RE = /^(?:async )?def test_\w+ ?\(/;

function isPythonTestDefLine(line: string): boolean {
  const normalized = line.trimStart().replace(/[ \t]+/g, ' ');
  return PY_TEST_FUNC_LINE_RE.test(normalized);
}

function extractPythonTestBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  let decorators: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith('@')) {
      decorators.push(line);
      continue;
    }
    if (isPythonTestDefLine(line)) {
      if (current) blocks.push(current.join('\n'));
      current = [...decorators, line];
      decorators = [];
      continue;
    }
    if (current && decorators.length > 0) {
      current.push(...decorators);
    }
    decorators = [];
    if (current) current.push(line);
  }
  if (current) blocks.push(current.join('\n'));
  return blocks;
}

function isBlockProbeAssertionValid(block: string, tokens: readonly string[]): boolean {
  if (!tokens.some((tok) => block.includes(tok))) return false;
  if (block.includes(QA_HEALTH_OK_PRAGMA)) return true;
  const hasPatchOrMonkey = PY_MOCK_PATCH_MARKERS.some((marker) => block.includes(marker));
  const mocksWrite = hasPatchOrMonkey && block.includes('write_text');
  const mocksWorkers = hasPatchOrMonkey && block.includes('AsyncMock');
  if (mocksWrite || mocksWorkers) return false;
  return PROBE_ASSERTION_MARKERS.some((marker) => block.includes(marker));
}

function testFileAssertsProbeUnmocked(
  content: string,
  tokens: string[]
): boolean {
  const mentionsToken = tokens.some((tok) => content.includes(tok));
  if (!mentionsToken) return false;
  if (content.includes(QA_HEALTH_OK_PRAGMA)) return true;

  const pyBlocks = extractPythonTestBlocks(content);
  if (pyBlocks.length > 0) {
    return pyBlocks.some((block) => isBlockProbeAssertionValid(block, tokens));
  }

  return isBlockProbeAssertionValid(content, tokens);
}

function hasUnmockedProbeTestAssertion(
  projectPath: string,
  allRelFiles: string[],
  probePath: string,
  symbolNames: string[]
): boolean {
  const tokens = [probePath, path.basename(probePath), ...symbolNames];
  for (const rel of allRelFiles) {
    if (!isTestFilePath(rel) && !rel.endsWith('.feature')) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (testFileAssertsProbeUnmocked(content, tokens)) return true;
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura mientras se buscan aserciones en archivos de prueba
      reportDebugCatchError('security-auditor.hasUnmockedProbeTestAssertion', err);
    }
  }
  return false;
}

export function checkQaHealth01ContainerHeartbeatContract(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const probePaths = extractContainerProbePaths(projectPath, allRelFiles, options);
  const findings: SecurityFinding[] = [];

  for (const probePath of probePaths) {
    const orchestrator = findSourceOrchestratorForProbe(projectPath, allRelFiles, probePath);
    if (!orchestrator) continue;
    const verified = hasUnmockedProbeTestAssertion(
      projectPath,
      allRelFiles,
      probePath,
      orchestrator.symbolNames
    );
    if (!verified) {
      findings.push({
        rule_id: 'QA-HEALTH-01',
        severity: 'HIGH',
        stig_owasp_ref: QA_HEALTH_01_REF,
        file: orchestrator.relFile,
        line: orchestrator.line,
        message: `El contenedor exige la sonda '${probePath}' en healthcheck, pero ningún test afirma su existencia real (.exists()/read_text) sin mockear el orquestador.`,
        remediation:
          'Añadir un test de contrato que arranque el orquestador con Settings() de producción por defecto (sin mockear loops opcionales) y haga assert explícito sobre el archivo/señal de healthcheck.',
      });
    }
  }

  return findings;
}

const PY_MCP_SDK_IMPORT_RE = /\b(?:from\s+mcp\b|import\s+mcp\b|FastMCP\s*\()/;
const PY_MCP_HANDLER_RE =
  /@[A-Za-z0-9_.]+\.(?:list_tools|call_tool|tool|list_resources|read_resource|list_prompts|get_prompt)\b|\bFastMCP\s*\(|\b(?:add_tool|list_tools|call_tool)\s*\(/;
const TS_MCP_SERVER_RE = /@modelcontextprotocol\/sdk\/server/;
const TS_MCP_HANDLER_RE =
  /\.(?:tool|registerTool|resource|registerResource|prompt|registerPrompt|setRequestHandler)\s*\(/;
const PY_SDK_CLIENT_RE =
  /\b(?:ClientSession|create_connected_server_and_client_session|stdio_client|sse_client|streamablehttp_client|memory_object_stream)\b/;
const TS_SDK_CLIENT_RE =
  /\b(?:InMemoryTransport|StdioClientTransport|StreamableHTTPClientTransport|SSEClientTransport)\b/;

function findMatchingLineNumber(content: string, pattern: RegExp): number {
  const lines = content.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (pattern.test(line)) return i + 1;
  }
  return 1;
}

function matchProtocolServerFile(rel: string, content: string): { relFile: string; line: number } | null {
  if (content.includes(QA_CONTRACT_SDK_OK_PRAGMA)) return null;
  if (rel.endsWith('.py') && PY_MCP_SDK_IMPORT_RE.test(content) && PY_MCP_HANDLER_RE.test(content)) {
    return { relFile: rel, line: findMatchingLineNumber(content, PY_MCP_SDK_IMPORT_RE) };
  }
  if (/\.(?:ts|js|mjs)$/.test(rel) && TS_MCP_SERVER_RE.test(content) && TS_MCP_HANDLER_RE.test(content)) {
    return { relFile: rel, line: findMatchingLineNumber(content, TS_MCP_SERVER_RE) };
  }
  return null;
}

function findProtocolServerDeclaration(
  projectPath: string,
  allRelFiles: string[]
): { relFile: string; line: number } | null {
  for (const rel of allRelFiles) {
    const norm = rel.replace(/\\/g, '/');
    if (norm.endsWith('.example') || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
      continue;
    }
    if (!/\.(?:py|ts|js|mjs)$/.test(norm)) continue;

    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      const match = matchProtocolServerFile(rel, content);
      if (match) return match;
    } catch (err: unknown) {
      // Tolerar errores de lectura puntual sin ocultar el resto de archivos MCP/SDK
      reportDebugCatchError('security-auditor.findProtocolServerDeclaration', err);
    }
  }
  return null;
}

function hasRealSdkTransportMarkers(content: string): boolean {
  if (content.includes(QA_CONTRACT_SDK_OK_PRAGMA)) return true;
  if (TS_SDK_CLIENT_RE.test(content) || PY_SDK_CLIENT_RE.test(content)) return true;
  if (content.includes('@modelcontextprotocol/sdk/client') && content.includes('new Client(')) {
    return true;
  }
  return PY_MCP_SDK_IMPORT_RE.test(content) && /\bClient\s*\(/.test(content);
}

function hasRealSdkTransportContractTest(projectPath: string, allRelFiles: string[]): boolean {
  for (const rel of allRelFiles) {
    const norm = rel.replace(/\\/g, '/');
    const isExampleHarness = /(?:^|\/)example\/.*\.(?:ts|js|mjs|py)$/.test(norm);
    if (!isTestFilePath(norm) && !isExampleHarness) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, rel), 'utf8');
      if (hasRealSdkTransportMarkers(content)) return true;
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura al inspeccionar suites de contrato SDK
      reportDebugCatchError('security-auditor.hasRealSdkTransportContractTest', err);
    }
  }
  return false;
}

export function checkQaContractSdk01RealTransport(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const declaration = findProtocolServerDeclaration(projectPath, allRelFiles);
  if (!declaration) return [];
  if (hasRealSdkTransportContractTest(projectPath, allRelFiles)) return [];

  return [
    {
      rule_id: QA_CONTRACT_SDK_01_RULE,
      severity: 'HIGH',
      stig_owasp_ref: QA_CONTRACT_SDK_01_REF,
      file: declaration.relFile,
      line: declaration.line,
      message:
        'Servidor de protocolo (MCP/JSON-RPC/ACP) sin prueba de contrato sobre el transporte/cliente real del SDK: invocar handlers con MagicMock oculta cambios de firma entre versiones (ej. mcp 1.x -> 2.x).',
      remediation: QA_CONTRACT_SDK_REMEDIATION,
    },
  ];
}

interface DockerRunBlock {
  line: number;
  command: string;
}

function consumeRunContinuation(
  rawLines: string[],
  startIdx: number,
  initialCommand: string,
  initialHasPragma: boolean
): { nextIndex: number; command: string; hasPragma: boolean } {
  let idx = startIdx;
  let combined = initialCommand;
  let hasPragma = initialHasPragma;

  while (combined.endsWith('\\') && idx + 1 < rawLines.length) {
    idx++;
    const nextRaw = pickAt(rawLines, idx);
    if (nextRaw.includes(QA_DOCKER_LOCK_OK_PRAGMA)) hasPragma = true;
    const nextTrimmed = nextRaw.trim();
    if (!nextTrimmed.startsWith('#')) {
      combined = `${combined.slice(0, -1).trimEnd()} ${nextTrimmed}`;
    }
  }

  return { nextIndex: idx, command: combined, hasPragma };
}

function skipSingleRunOption(cmd: string, start: number): number {
  let idx = start;
  let quote: '"' | "'" | null = null;
  while (idx < cmd.length) {
    const ch = cmd[idx];
    if (quote !== null) {
      if (ch === quote) quote = null;
      idx += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch ?? '')) {
      break;
    }
    idx += 1;
  }
  return idx;
}

function stripLeadingRunOptions(rawCommand: string): string {
  let pos = 0;
  const trimmed = rawCommand.trim();
  while (trimmed.startsWith('--', pos)) {
    pos = skipSingleRunOption(trimmed, pos);
    while (pos < trimmed.length && /\s/.test(trimmed[pos] ?? '')) {
      pos += 1;
    }
  }
  return trimmed.slice(pos);
}

function extractDockerfileRunBlocks(content: string): DockerRunBlock[] {
  const rawLines = content.split(/\r?\n/);
  if (rawLines.slice(0, 5).some((l) => l.includes(QA_DOCKER_LOCK_OK_PRAGMA))) {
    return [];
  }

  const blocks: DockerRunBlock[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const rawLine = pickAt(rawLines, i);
    const trimmed = rawLine.trim();
    if (!/^RUN\b/i.test(trimmed)) {
      i += 1;
      continue;
    }

    const prevLine = pickAt(rawLines, i - 1);
    const initialPragma =
      prevLine.includes(QA_DOCKER_LOCK_OK_PRAGMA) || rawLine.includes(QA_DOCKER_LOCK_OK_PRAGMA);
    const consumed = consumeRunContinuation(rawLines, i, trimmed.slice(3).trim(), initialPragma);
    if (!consumed.hasPragma) {
      blocks.push({ line: i + 1, command: stripLeadingRunOptions(consumed.command) });
    }
    i = consumed.nextIndex + 1;
  }

  return blocks;
}

const PIP_INSTALL_CMD_RE = /\bpip3?\s+install\b/i;
const PIP_LOCKED_OR_EDITABLE_RE =
  /(?:^|\s)(?:-r|--requirement|-e|--editable)(?:\s|$|=)|\.whl\b|\buv\s+export\b/i;
const NODE_PKG_ADD_RE = /^\s*(?:npm|pnpm|yarn)\s+add\b/i;
const NPM_UNFROZEN_INSTALL_RE = /^\s*npm\s+(?:install|i)\b/i;
const PNPM_INSTALL_CMD_RE = /^\s*pnpm\s+(?:install|i)\b/i;
const YARN_INSTALL_CMD_RE = /^\s*yarn(?:\s+install\b|\s*$)/i;
const FROZEN_LOCKFILE_FLAG_RE = /(?:\s|^)--frozen-lockfile(?:\s|$|=true)/i;
const YARN_IMMUTABLE_FLAG_RE = /(?:\s|^)(?:--frozen-lockfile|--immutable)(?:\s|$|=true)/i;

function normalizePipPackageName(rawToken: string): string {
  const cleaned = rawToken.replace(/^["']|["']$/g, '').trim();
  const base = pickAt(cleaned.replace(/\[[^[\]\n]*\]/g, '').split(/[=<>!~@;]/), 0).trim();
  return base.toLowerCase().replace(/_/g, '-');
}

function extractPipPositionalPackages(pipSegment: string, match: RegExpExecArray): string[] {
  const tokens = pipSegment.slice(match.index + match[0].length).trim().split(/\s+/).filter(Boolean);
  const packages: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = pickAt(tokens, i).replace(/^["']|["']$/g, '');
    if (PIP_VALUE_FLAGS.has(raw)) {
      i++;
      continue;
    }
    if (!raw || raw.startsWith('-') || raw === '.' || raw.startsWith('./') || raw.startsWith('/')) {
      continue;
    }
    const pkg = normalizePipPackageName(raw);
    if (pkg) packages.push(pkg);
  }

  return packages;
}

function hasHandwrittenPythonPipDeps(command: string): boolean {
  for (const segment of command.split(/(?:&&|\|\||;)/)) {
    const cleanSeg = stripLeadingRunOptions(segment);
    const match = PIP_INSTALL_CMD_RE.exec(cleanSeg);
    if (!match) continue;
    if (PIP_LOCKED_OR_EDITABLE_RE.test(cleanSeg)) continue;
    const pkgs = extractPipPositionalPackages(cleanSeg, match);
    if (pkgs.some((pkg) => !BOOTSTRAP_PY_PACKAGES.has(pkg))) {
      return true;
    }
  }
  return false;
}

function hasUnfrozenUvSync(command: string, hasUvLock: boolean): boolean {
  if (!hasUvLock) return false;
  return /\buv\s+sync\b/i.test(command) && !/(?:\s|^)(?:--frozen|--locked)(?:\s|$)/.test(command);
}

function hasExplicitNodePackageArg(trimmed: string): boolean {
  const tokens = trimmed.split(/\s+/).slice(2);
  return tokens.some((tok) => {
    const clean = tok.replace(/^["']|["']$/g, '');
    return (
      Boolean(clean) &&
      clean !== '.' &&
      !clean.startsWith('-') &&
      !clean.startsWith('./') &&
      !clean.startsWith('/')
    );
  });
}

function isUnfrozenNodeSegment(trimmed: string): boolean {
  if (!trimmed || /(?:\s|^)(?:-g|--global)(?:\s|$)/.test(trimmed)) return false;
  if (/^\s*npm\s+ci\b/i.test(trimmed)) return false;
  if (NPM_UNFROZEN_INSTALL_RE.test(trimmed)) return true;
  if (PNPM_INSTALL_CMD_RE.test(trimmed)) return !FROZEN_LOCKFILE_FLAG_RE.test(trimmed);
  if (YARN_INSTALL_CMD_RE.test(trimmed)) {
    return !YARN_IMMUTABLE_FLAG_RE.test(trimmed) && !NODE_PKG_ADD_RE.test(trimmed);
  }
  return NODE_PKG_ADD_RE.test(trimmed) && hasExplicitNodePackageArg(trimmed);
}

function hasHandwrittenNodeDeps(command: string): boolean {
  return command
    .split(/(?:&&|\|\||;)/)
    .some((segment) => isUnfrozenNodeSegment(stripLeadingRunOptions(segment)));
}

function hasAnyManifestInDirs(dirs: string[], fileNames: string[]): boolean {
  return dirs.some((dir) => fileNames.some((name) => fs.existsSync(path.join(dir, name))));
}

function evaluateDockerfileLockViolation(
  command: string,
  hasPyManifest: boolean,
  hasUvLock: boolean,
  hasNodeManifest: boolean
): boolean {
  if (hasPyManifest && (hasHandwrittenPythonPipDeps(command) || hasUnfrozenUvSync(command, hasUvLock))) {
    return true;
  }
  return hasNodeManifest && hasHandwrittenNodeDeps(command);
}

export function inspectDockerfileLockFile(
  projectPath: string,
  rel: string,
  findings: SecurityFinding[]
): void {
  const absDocker = path.join(projectPath, rel);
  const content = readTextFileSafe(absDocker);
  if (!content) return;
  const searchDirs = Array.from(new Set([path.dirname(absDocker), projectPath]));
  const hasPyManifest = hasAnyManifestInDirs(searchDirs, ['pyproject.toml', 'uv.lock', 'requirements.lock']);
  const hasUvLock = hasAnyManifestInDirs(searchDirs, ['uv.lock']);
  const hasNodeManifest = hasAnyManifestInDirs(searchDirs, ['package.json']);

  for (const block of extractDockerfileRunBlocks(content)) {
    if (evaluateDockerfileLockViolation(block.command, hasPyManifest, hasUvLock, hasNodeManifest)) {
      findings.push({
        rule_id: QA_DOCKER_LOCK_01_RULE,
        severity: 'HIGH',
        stig_owasp_ref: QA_DOCKER_LOCK_01_REF,
        file: rel,
        line: block.line,
        message:
          'Dockerfile instala dependencias desde lista manual o sin bandera --frozen/--frozen-lockfile en lugar de usar el lockfile del proyecto, arriesgando ModuleNotFoundError en runtime.',
        remediation: QA_DOCKER_LOCK_REMEDIATION,
      });
    }
  }
}

