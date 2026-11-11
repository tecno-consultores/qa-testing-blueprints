// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export const QA_EVIDENCE_REL_PATH = '.agents/.qa-evidence.json';

const DOC_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.rst',
  '.adoc',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.webp',
  '.pdf',
]);

export function isDocFilePath(fp: string): boolean {
  const normalized = fp.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('.md')) return true;
  const inDocsDir = normalized.startsWith('docs/') || normalized.includes('/docs/');
  if (!inDocsDir) return false;
  const ext = path.posix.extname(normalized);
  return DOC_EXTENSIONS.has(ext);
}

function unquoteGitPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

export function extractPathsFromPorcelainLine(rawLine: string): string[] {
  const cleaned =
    rawLine.length > 3 && rawLine[2] === ' '
      ? rawLine.slice(3)
      : rawLine.trim().replace(/^\S+\s+/, '');
  const arrowIdx = cleaned.indexOf(' -> ');
  if (arrowIdx !== -1) {
    return [
      unquoteGitPath(cleaned.slice(0, arrowIdx)),
      unquoteGitPath(cleaned.slice(arrowIdx + 4)),
    ];
  }
  return [unquoteGitPath(cleaned)];
}

export function resolveExplicitGitRoot(projectPath: string): string | null {
  const resolved = path.resolve(projectPath);
  if (fs.existsSync(path.join(resolved, '.git'))) {
    return resolved;
  }
  const parent = path.dirname(resolved);
  if (parent !== resolved && fs.existsSync(path.join(parent, '.git'))) {
    return parent;
  }
  return null;
}

function isEphemeralOrDocIgnoredForFingerprint(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!norm) return true;
  if (norm === QA_EVIDENCE_REL_PATH || norm.endsWith('/.qa-evidence.json')) return true;
  if (norm === 'graphify-out' || norm.startsWith('graphify-out/') || norm.includes('/graphify-out/')) {
    return true;
  }
  return isDocFilePath(norm);
}

function hashSingleCodeEntry(gitRoot: string, relFile: string): string {
  const full = path.join(gitRoot, relFile);
  try {
    const st = fs.statSync(full);
    if (st.isFile()) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      return `${relFile}:${digest}`;
    }
    if (st.isDirectory()) {
      return `${relFile}:DIR`;
    }
  } catch {
    // Archivo eliminado o inaccesible en el árbol de trabajo
  }
  return `${relFile}:DELETED`;
}

function readHeadCommitOrFallback(gitRoot: string, execFileSyncFn: typeof execFileSync): string {
  try {
    const out = execFileSyncFn('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim() || 'UNBORN_HEAD';
  } catch {
    return 'UNBORN_HEAD';
  }
}

export interface CodeStateFingerprint {
  isGitRepo: boolean;
  gitRoot: string | null;
  hasDirtyCodeChanges: boolean;
  codeFiles: string[];
  fingerprint: string | null;
}

export function computeCodeStateFingerprint(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): CodeStateFingerprint {
  const gitRoot = resolveExplicitGitRoot(projectPath);
  if (!gitRoot) {
    return {
      isGitRepo: false,
      gitRoot: null,
      hasDirtyCodeChanges: false,
      codeFiles: [],
      fingerprint: null,
    };
  }

  try {
    const raw = execFileSyncFn('git', ['status', '--porcelain'], {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const rawLines = String(raw)
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    const codeSet = new Set<string>();
    for (const line of rawLines) {
      for (const p of extractPathsFromPorcelainLine(line)) {
        const normalized = p.replace(/\\/g, '/').replace(/^\.\//, '');
        if (!isEphemeralOrDocIgnoredForFingerprint(normalized)) {
          codeSet.add(normalized);
        }
      }
    }

    const codeFiles = Array.from(codeSet).sort();
    if (codeFiles.length === 0) {
      return {
        isGitRepo: true,
        gitRoot,
        hasDirtyCodeChanges: false,
        codeFiles: [],
        fingerprint: null,
      };
    }

    const headSha = readHeadCommitOrFallback(gitRoot, execFileSyncFn);
    const hasher = crypto.createHash('sha256');
    hasher.update(`HEAD:${headSha}\n`);
    for (const relFile of codeFiles) {
      hasher.update(`${hashSingleCodeEntry(gitRoot, relFile)}\n`);
    }

    return {
      isGitRepo: true,
      gitRoot,
      hasDirtyCodeChanges: true,
      codeFiles,
      fingerprint: hasher.digest('hex'),
    };
  } catch {
    return {
      isGitRepo: true,
      gitRoot,
      hasDirtyCodeChanges: false,
      codeFiles: [],
      fingerprint: null,
    };
  }
}

interface QaStageStamp {
  fingerprint: string;
  recorded_at: string;
}

interface QaEvidenceDocument {
  version: 1;
  stages: Record<string, QaStageStamp>;
}

const RECORDABLE_STAGES = new Set(['lint', 'unit', 'migration', 'integration', 'ci', 'all']);

function readEvidenceDocument(evidencePath: string): QaEvidenceDocument {
  try {
    if (fs.existsSync(evidencePath)) {
      const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as Partial<QaEvidenceDocument>;
      if (parsed && typeof parsed === 'object' && parsed.stages && typeof parsed.stages === 'object') {
        return { version: 1, stages: { ...parsed.stages } };
      }
    }
  } catch {
    // Si está corrupto, reiniciar estructura
  }
  return { version: 1, stages: {} };
}

export function recordQaStageEvidence(
  projectPath: string,
  stage: string,
  status: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): void {
  if (status !== 'PASSED' || !RECORDABLE_STAGES.has(stage)) {
    return;
  }

  const state = computeCodeStateFingerprint(projectPath, execFileSyncFn);
  if (!state.gitRoot) {
    return;
  }

  const stampValue: QaStageStamp = {
    fingerprint: state.fingerprint ?? 'CLEAN_HEAD',
    recorded_at: new Date().toISOString(),
  };

  try {
    const evidencePath = path.join(state.gitRoot, QA_EVIDENCE_REL_PATH);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    const doc = readEvidenceDocument(evidencePath);
    doc.stages[stage] = stampValue;
    if (stage === 'all' || stage === 'ci') {
      doc.stages.lint = stampValue;
      doc.stages.unit = stampValue;
      doc.stages.integration = stampValue;
    }
    fs.writeFileSync(evidencePath, JSON.stringify(doc, null, 2), 'utf8');
  } catch {
    // Entorno de solo lectura: ignorar fallo de escritura de caché efímera
  }
}

export function checkLintEvidenceForDirtyCode(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): { passed: boolean; blockers: string[] } {
  const state = computeCodeStateFingerprint(projectPath, execFileSyncFn);
  if (!state.gitRoot || !state.fingerprint) {
    return { passed: true, blockers: [] };
  }

  const evidencePath = path.join(state.gitRoot, QA_EVIDENCE_REL_PATH);
  const doc = readEvidenceDocument(evidencePath);
  const lintStamp = doc.stages.lint;

  if (lintStamp && lintStamp.fingerprint === state.fingerprint) {
    return { passed: true, blockers: [] };
  }

  const sampleFiles = state.codeFiles.slice(0, 3).join(', ');
  const suffix = state.codeFiles.length > 3 ? ` (+${state.codeFiles.length - 3} más)` : '';
  return {
    passed: false,
    blockers: [
      `Falta evidencia vigente de run_ephemeral_qa(stage="lint") para el árbol de código modificado (${sampleFiles}${suffix}). Ejecuta stage="lint" antes de certificar pre-push.`,
    ],
  };
}
