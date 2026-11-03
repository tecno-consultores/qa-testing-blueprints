// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { ProposeEvolutionPrInput, ProposeEvolutionPrResult } from '../types.js';

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
        reject(error);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
};

export function buildEvolutionSlug(title: string): string {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = normalized.slice(0, 40).replace(/-+$/, '');
  return truncated.length > 0 ? truncated : 'skill-evolution';
}

function writeProposalFile(
  proposalsDir: string,
  slug: string,
  input: ProposeEvolutionPrInput
): string {
  fs.mkdirSync(proposalsDir, { recursive: true });
  const filePath = path.join(proposalsDir, `${slug}.md`);

  const fileContent = [
    `# Propuesta de Evolución Continua: ${input.improvement_title}`,
    '',
    `**Fecha de Registro:** ${new Date().toISOString()}`,
    `**Rama Sugerida:** \`evolution/${slug}\``,
    `**Repositorio Destino:** \`${UPSTREAM_REPO}\``,
    `**Archivo Objetivo:** \`${input.target_blueprint_file}\``,
    '',
    '## Justificación Empírica (Dogfooding / Producción)',
    input.empirical_rationale,
    '',
    '## Bloque / Cambio Propuesto',
    '```markdown',
    input.proposed_content_or_snippet,
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, fileContent, UTF8_ENCODING);
  return filePath;
}

export function buildPrefilledIssueUrl(input: ProposeEvolutionPrInput): {
  issueBody: string;
  prefilledUrl: string;
} {
  const issueTitle = `[Evolution] ${input.improvement_title}`;
  const issueBody = [
    `### Archivo Objetivo en \`${UPSTREAM_REPO}\``,
    `\`${input.target_blueprint_file}\``,
    '',
    '### Justificación Empírica (Dogfooding)',
    input.empirical_rationale,
    '',
    '### Cambio / Bloque Propuesto',
    '```markdown',
    input.proposed_content_or_snippet,
    '```',
  ].join('\n');

  const prefilledUrl = `https://github.com/${UPSTREAM_REPO}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

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
  } catch {
    return { success: false, prUrl: null, ghAuthenticated: false };
  }

  try {
    const prTitle = `[Evolution] ${input.improvement_title}`;
    const { stdout } = await execRunner(
      'gh',
      ['pr', 'create', '--repo', UPSTREAM_REPO, '--title', prTitle, '--body', body],
      { cwd, shell: false, timeout: 15000 }
    );

    const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = match ? match[0] : stdout.trim();
    return { success: true, prUrl: prUrl || null, ghAuthenticated: true };
  } catch {
    return { success: false, prUrl: null, ghAuthenticated: true };
  }
}

export async function proposeSkillEvolutionPr(
  input: ProposeEvolutionPrInput,
  execRunner: ExecRunnerFunction = defaultExecRunner
): Promise<ProposeEvolutionPrResult> {
  const resolvedPath = path.resolve(input.project_path.normalize('NFKC'));
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio del proyecto especificado no existe: ${resolvedPath}`);
  }

  const slug = buildEvolutionSlug(input.improvement_title);
  const branchName = `evolution/${slug}`;
  const proposalsDir = path.join(resolvedPath, '.agents', 'proposals');
  const proposalFilePath = writeProposalFile(proposalsDir, slug, input);
  const { issueBody, prefilledUrl } = buildPrefilledIssueUrl(input);

  if (input.prefer_offline_fallback) {
    return {
      status: STATUS_PROPOSAL_GENERATED,
      target_repo: UPSTREAM_REPO,
      target_blueprint_file: input.target_blueprint_file,
      branch_name: branchName,
      gh_cli_authenticated: false,
      pull_request_url: null,
      prefilled_github_url: prefilledUrl,
      local_proposal_file: proposalFilePath,
      message: 'Propuesta generada localmente y URL prellenada creada (modo offline seleccionado).',
    };
  }

  const ghResult = await tryCreatePullRequestViaGh(execRunner, input, issueBody, resolvedPath);

  if (ghResult.success && ghResult.prUrl) {
    return {
      status: STATUS_PR_CREATED,
      target_repo: UPSTREAM_REPO,
      target_blueprint_file: input.target_blueprint_file,
      branch_name: branchName,
      gh_cli_authenticated: true,
      pull_request_url: ghResult.prUrl,
      prefilled_github_url: prefilledUrl,
      local_proposal_file: proposalFilePath,
      message: `Pull Request creado exitosamente en ${ghResult.prUrl}`,
    };
  }

  const msg = ghResult.ghAuthenticated
    ? 'gh CLI autenticado pero no se pudo crear el PR directamente; se generó propuesta local y URL prellenada.'
    : 'gh CLI no disponible o no autenticado; se generó propuesta local y URL prellenada de GitHub.';

  return {
    status: STATUS_PROPOSAL_GENERATED,
    target_repo: UPSTREAM_REPO,
    target_blueprint_file: input.target_blueprint_file,
    branch_name: branchName,
    gh_cli_authenticated: ghResult.ghAuthenticated,
    pull_request_url: null,
    prefilled_github_url: prefilledUrl,
    local_proposal_file: proposalFilePath,
    message: msg,
  };
}
