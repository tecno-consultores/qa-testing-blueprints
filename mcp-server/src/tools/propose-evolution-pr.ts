// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { ProposeEvolutionPrInput, ProposeEvolutionPrResult } from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

export const UPSTREAM_REPO = 'tecno-consultores/qa-testing-blueprints';
const STATUS_PR_CREATED = 'PR_CREATED_VIA_GH';
const STATUS_PROPOSAL_GENERATED = 'PROPOSAL_FILE_AND_URL_GENERATED';
const UTF8_ENCODING = 'utf-8';

export interface ExecRunnerResult {
  stdout: string;
  stderr: string;
}

export type ExecRunnerFunction = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; shell?: boolean; timeout?: number }
) => Promise<ExecRunnerResult>;

export const defaultExecRunner: ExecRunnerFunction = (file, args, options) => {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, shell: false }, (error, stdout, stderr) => {
      if (error) {
        const rejectionError: Error = error;
        reject(rejectionError);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
};

function trimEdgeHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
}

export function buildEvolutionSlug(title: string): string {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const truncated = trimEdgeHyphens(trimEdgeHyphens(normalized).slice(0, 40));
  return truncated.length > 0 ? truncated : 'skill-evolution';
}

const DEFAULT_HUMAN_PRACTICES_DOC = 'docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md';
const DEFAULT_HUMAN_SECURITY_DOC = 'docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md';
const DEFAULT_MCP_AUDITOR_TARGET = 'mcp-server/src/tools/security-auditor.ts';
const DEFAULT_DOCS_VALIDATOR_TARGET = '.agents/scripts/verify_docs_invariants.py';
const SEC_PATH_PREFIX = '[SEC-PATH-01]';
const RELATIVE_TRAVERSAL_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/;
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PERCENT_ENCODED_RE = /%[0-9a-fA-F]{2}/;
const MARKDOWN_OR_HTML_INJECTION_RE = /[`<>[\]()]/;

function assertRelativePathSyntax(normalized: string, fieldName: string): void {
  if (normalized.length === 0) {
    throw new Error(`${SEC_PATH_PREFIX} El campo '${fieldName}' debe ser una ruta relativa no vacía.`);
  }
  if (normalized.includes('\0') || normalized.includes('\r') || normalized.includes('\n')) {
    throw new Error(`${SEC_PATH_PREFIX} El campo '${fieldName}' contiene caracteres de control inválidos.`);
  }
  if (PERCENT_ENCODED_RE.test(normalized)) {
    throw new Error(
      `${SEC_PATH_PREFIX} El campo '${fieldName}' rechaza codificación porcentual (%XX): '${normalized}'.`
    );
  }
  if (MARKDOWN_OR_HTML_INJECTION_RE.test(normalized)) {
    throw new Error(
      `${SEC_PATH_PREFIX} El campo '${fieldName}' rechaza caracteres de inyección Markdown/HTML: '${normalized}'.`
    );
  }
}

export function validateRelativeRepoPath(rawPath: string, fieldName: string): string {
  const normalized = rawPath.normalize('NFKC').trim();
  assertRelativePathSyntax(normalized, fieldName);
  const isAbsoluteOrUri =
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    WINDOWS_DRIVE_RE.test(normalized) ||
    URI_SCHEME_RE.test(normalized);
  if (isAbsoluteOrUri) {
    throw new Error(
      `${SEC_PATH_PREFIX} El campo '${fieldName}' no acepta rutas absolutas ni esquemas URI: '${normalized}'.`
    );
  }
  if (RELATIVE_TRAVERSAL_RE.test(normalized)) {
    throw new Error(`${SEC_PATH_PREFIX} El campo '${fieldName}' rechaza recorrido transversal (..): '${normalized}'.`);
  }
  return normalized.replace(/\\/g, '/');
}

export interface DualConsumerTargets {
  targetHumanDocFile: string;
  targetMcpComponent: string;
}

export function inferDualConsumerTargets(input: ProposeEvolutionPrInput): DualConsumerTargets {
  const safeBlueprintFile = validateRelativeRepoPath(input.target_blueprint_file, 'target_blueprint_file');
  const combinedHint = `${safeBlueprintFile} ${input.improvement_title}`;
  const isSecurityTopic = /(?:02-security|08-postgres|secure_development|\bSEC-\d+)/i.test(combinedHint);
  const isDocsGovernanceTopic = /(?:verify_docs|active_task|continuous_agent_evolution)/i.test(combinedHint);

  const inferredHumanDoc = isSecurityTopic ? DEFAULT_HUMAN_SECURITY_DOC : DEFAULT_HUMAN_PRACTICES_DOC;
  const inferredMcpComponent = isDocsGovernanceTopic
    ? DEFAULT_DOCS_VALIDATOR_TARGET
    : DEFAULT_MCP_AUDITOR_TARGET;

  const customHumanDoc = input.target_human_doc_file?.trim();
  const customMcpComponent = input.target_mcp_component?.trim();

  return {
    targetHumanDocFile: customHumanDoc
      ? validateRelativeRepoPath(customHumanDoc, 'target_human_doc_file')
      : inferredHumanDoc,
    targetMcpComponent: customMcpComponent
      ? validateRelativeRepoPath(customMcpComponent, 'target_mcp_component')
      : inferredMcpComponent,
  };
}

function computeSafeCodeFence(snippet: string): string {
  const matches = snippet.match(/`{3,}/g);
  const maxLen = matches ? Math.max(...matches.map((m) => m.length)) : 2;
  return '`'.repeat(Math.max(3, maxLen + 1));
}

function buildDualConsumerSectionLines(
  safeBlueprintFile: string,
  input: ProposeEvolutionPrInput,
  targets: DualConsumerTargets
): string[] {
  const humanSummaryLines = input.proposed_human_doc_summary?.trim()
    ? ['', '### Borrador para Documentación Humana (`docs/`)', input.proposed_human_doc_summary.trim()]
    : [
        '',
        `> **Recordatorio Dual-Consumer Obligatorio:** Al promover esta propuesta se DEBE documentar su explicación y ejemplo para ingenieros humanos en \`${targets.targetHumanDocFile}\` (además de \`SECURITY.md\` / \`CHANGELOG.md\` cuando aplique) para superar \`verify_docs_invariants.py\`.`,
      ];

  return [
    '## Matriz de Impacto Dual-Consumer (Agentes IA + MCP + Documentación Humana)',
    `- [ ] **Capa Agentes IA (Skill / Rule):** \`${safeBlueprintFile}\``,
    `- [ ] **Capa Ejecutable (MCP / Auditor Estático):** \`${targets.targetMcpComponent}\``,
    `- [ ] **Capa Ingeniería Humana (Manual en \`docs/\`):** \`${targets.targetHumanDocFile}\``,
    ...humanSummaryLines,
  ];
}

function isContainedInRoot(rootReal: string, candidateReal: string): boolean {
  const rel = path.relative(rootReal, candidateReal);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function assertContainedNonSymlinkPath(rootReal: string, targetPath: string): void {
  const rel = path.relative(rootReal, targetPath);
  let cur = rootReal;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    cur = path.join(cur, segment);
    const stat = fs.lstatSync(cur, { throwIfNoEntry: false });
    if (stat === undefined) break;
    if (stat.isSymbolicLink() || !isContainedInRoot(rootReal, fs.realpathSync(cur))) {
      throw new Error(`${SEC_PATH_PREFIX} Symlink rechazado por seguridad en ruta de propuesta: ${cur}`);
    }
  }
}

function writeProposalFile(
  resolvedPath: string,
  slug: string,
  input: ProposeEvolutionPrInput,
  targets: DualConsumerTargets
): string {
  const safeBlueprintFile = validateRelativeRepoPath(input.target_blueprint_file, 'target_blueprint_file');
  const proposalsDir = path.join(resolvedPath, '.agents', 'proposals');
  const filePath = path.join(proposalsDir, `${slug}.md`);
  assertContainedNonSymlinkPath(resolvedPath, filePath);
  fs.mkdirSync(proposalsDir, { recursive: true });
  assertContainedNonSymlinkPath(resolvedPath, filePath);
  const fence = computeSafeCodeFence(input.proposed_content_or_snippet);

  const fileContent = [
    `# Propuesta de Evolución Continua: ${input.improvement_title}`,
    '',
    `**Fecha de Registro:** ${new Date().toISOString()}`,
    `**Rama Sugerida:** \`evolution/${slug}\``,
    `**Repositorio Destino:** \`${UPSTREAM_REPO}\``,
    `**Archivo Objetivo (Capa IA):** \`${safeBlueprintFile}\``,
    `**Componente Ejecutable (Capa MCP):** \`${targets.targetMcpComponent}\``,
    `**Manual Humano Objetivo (\`docs/\`):** \`${targets.targetHumanDocFile}\``,
    '',
    ...buildDualConsumerSectionLines(safeBlueprintFile, input, targets),
    '',
    '## Justificación Empírica (Dogfooding / Producción)',
    input.empirical_rationale,
    '',
    '## Bloque / Cambio Propuesto (Skill / MCP)',
    `${fence}markdown`,
    input.proposed_content_or_snippet,
    fence,
    '',
  ].join('\n');

  fs.writeFileSync(filePath, fileContent, UTF8_ENCODING);
  return filePath;
}

export function buildPrefilledIssueUrl(input: ProposeEvolutionPrInput): {
  issueBody: string;
  prefilledUrl: string;
} {
  const safeBlueprintFile = validateRelativeRepoPath(input.target_blueprint_file, 'target_blueprint_file');
  const targets = inferDualConsumerTargets(input);
  const issueTitle = `[Evolution] ${input.improvement_title}`;
  const fence = computeSafeCodeFence(input.proposed_content_or_snippet);
  const issueBody = [
    `### Matriz Dual-Consumer en \`${UPSTREAM_REPO}\``,
    `- **Capa Agentes IA (Skill / Rule):** \`${safeBlueprintFile}\``,
    `- **Capa Ejecutable (MCP / Auditor):** \`${targets.targetMcpComponent}\``,
    `- **Capa Ingeniería Humana (\`docs/\`):** \`${targets.targetHumanDocFile}\``,
    ...(input.proposed_human_doc_summary?.trim()
      ? ['', '### Borrador para Documentación Humana (`docs/`)', input.proposed_human_doc_summary.trim()]
      : []),
    '',
    '### Justificación Empírica (Dogfooding)',
    input.empirical_rationale,
    '',
    '### Cambio / Bloque Propuesto',
    `${fence}markdown`,
    input.proposed_content_or_snippet,
    fence,
  ].join('\n');

  const maxBodyChars = 3500;
  const urlSafeBody =
    issueBody.length > maxBodyChars
      ? `${issueBody.slice(0, maxBodyChars)}\n\n...(Truncado por longitud de URL; adjunte el contenido completo desde .agents/proposals/)`
      : issueBody;

  const prefilledUrl = `https://github.com/${UPSTREAM_REPO}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(urlSafeBody)}`;

  return { issueBody, prefilledUrl };
}

async function tryCreatePullRequestViaGh(
  execRunner: ExecRunnerFunction,
  input: ProposeEvolutionPrInput,
  body: string,
  cwd: string
): Promise<{ success: boolean; prUrl: string | null; ghAuthenticated: boolean }> {
  try {
    await execRunner('gh', ['auth', 'status'], { cwd, shell: false, timeout: 10000 });
  } catch (err: unknown) {
    // Unauthenticated gh CLI falls back to local proposal file + prefilled GitHub URL
    reportDebugCatchError('proposeEvolutionPr.ghAuthStatus', err);
    return { success: false, prUrl: null, ghAuthenticated: false };
  }

  try {
    const { stdout: remotes } = await execRunner('git', ['remote', '-v'], { cwd, shell: false, timeout: 5000 });
    if (remotes.trim().length > 0 && !remotes.includes('qa-testing-blueprints')) {
      return { success: false, prUrl: null, ghAuthenticated: true };
    }
  } catch (err: unknown) {
    // Missing git remotes falls back to local proposal file + prefilled GitHub URL
    reportDebugCatchError('proposeEvolutionPr.gitRemoteCheck', err);
    return { success: false, prUrl: null, ghAuthenticated: true };
  }

  try {
    const prTitle = `[Evolution] ${input.improvement_title}`;
    const { stdout } = await execRunner(
      'gh',
      ['pr', 'create', '--repo', UPSTREAM_REPO, '--title', prTitle, '--body', body],
      { cwd, shell: false, timeout: 15000 }
    );

    const match = /https:\/\/github\.com\/\S+/.exec(stdout);
    const prUrl = match ? match[0] : stdout.trim();
    return { success: true, prUrl: prUrl || null, ghAuthenticated: true };
  } catch (err: unknown) {
    // gh pr create failure falls back gracefully to local proposal file + prefilled GitHub URL
    reportDebugCatchError('proposeEvolutionPr.ghPrCreate', err);
    return { success: false, prUrl: null, ghAuthenticated: true };
  }
}

export async function proposeSkillEvolutionPr(
  input: ProposeEvolutionPrInput,
  execRunner: ExecRunnerFunction = defaultExecRunner
): Promise<ProposeEvolutionPrResult> {
  const resolvedPath = resolveSafeProjectPath(input.project_path);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio del proyecto especificado no existe: ${resolvedPath}`);
  }

  const safeBlueprintFile = validateRelativeRepoPath(input.target_blueprint_file, 'target_blueprint_file');
  const slug = buildEvolutionSlug(input.improvement_title);
  const branchName = `evolution/${slug}`;
  const proposalsDir = path.join(resolvedPath, '.agents', 'proposals');
  const proposalTargetPath = path.join(proposalsDir, `${slug}.md`);
  assertContainedNonSymlinkPath(resolvedPath, proposalTargetPath);
  const dualTargets = inferDualConsumerTargets(input);
  const { issueBody, prefilledUrl } = buildPrefilledIssueUrl(input);

  const isDryRun = input.dry_run ?? true;
  const preferOffline = input.prefer_offline_fallback ?? true;

  if (isDryRun) {
    return {
      status: STATUS_PROPOSAL_GENERATED,
      target_repo: UPSTREAM_REPO,
      target_blueprint_file: safeBlueprintFile,
      target_human_doc_file: dualTargets.targetHumanDocFile,
      target_mcp_component: dualTargets.targetMcpComponent,
      branch_name: branchName,
      gh_cli_authenticated: false,
      pull_request_url: null,
      prefilled_github_url: prefilledUrl,
      local_proposal_file: proposalTargetPath,
      message: 'Propuesta Dual-Consumer generada en modo dry_run=true sin escribir en disco.',
    };
  }

  const proposalFilePath = writeProposalFile(resolvedPath, slug, input, dualTargets);

  if (preferOffline) {
    return {
      status: STATUS_PROPOSAL_GENERATED,
      target_repo: UPSTREAM_REPO,
      target_blueprint_file: safeBlueprintFile,
      target_human_doc_file: dualTargets.targetHumanDocFile,
      target_mcp_component: dualTargets.targetMcpComponent,
      branch_name: branchName,
      gh_cli_authenticated: false,
      pull_request_url: null,
      prefilled_github_url: prefilledUrl,
      local_proposal_file: proposalFilePath,
      message: 'Propuesta Dual-Consumer generada localmente y URL prellenada creada (modo offline seleccionado).',
    };
  }

  const ghResult = await tryCreatePullRequestViaGh(execRunner, input, issueBody, resolvedPath);

  if (ghResult.success && ghResult.prUrl) {
    return {
      status: STATUS_PR_CREATED,
      target_repo: UPSTREAM_REPO,
      target_blueprint_file: safeBlueprintFile,
      target_human_doc_file: dualTargets.targetHumanDocFile,
      target_mcp_component: dualTargets.targetMcpComponent,
      branch_name: branchName,
      gh_cli_authenticated: true,
      pull_request_url: ghResult.prUrl,
      prefilled_github_url: prefilledUrl,
      local_proposal_file: proposalFilePath,
      message: `Pull Request Dual-Consumer creado exitosamente en ${ghResult.prUrl}`,
    };
  }

  const msg = ghResult.ghAuthenticated
    ? 'gh CLI autenticado pero no se pudo crear el PR directamente; se generó propuesta local Dual-Consumer y URL prellenada.'
    : 'gh CLI no disponible o no autenticado; se generó propuesta local Dual-Consumer y URL prellenada de GitHub.';

  return {
    status: STATUS_PROPOSAL_GENERATED,
    target_repo: UPSTREAM_REPO,
    target_blueprint_file: safeBlueprintFile,
    target_human_doc_file: dualTargets.targetHumanDocFile,
    target_mcp_component: dualTargets.targetMcpComponent,
    branch_name: branchName,
    gh_cli_authenticated: ghResult.ghAuthenticated,
    pull_request_url: null,
    prefilled_github_url: prefilledUrl,
    local_proposal_file: proposalFilePath,
    message: msg,
  };
}
