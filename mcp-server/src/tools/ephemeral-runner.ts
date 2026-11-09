// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { parseQaOutput } from '../parsers/output-parsers.js';
import { QaExecutionResult } from '../types.js';

export interface RunEphemeralQaOptions {
  execFileFn?: typeof execFile;
  execFileSyncFn?: typeof execFileSync;
  skipIfDocsOnly?: boolean;
}

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

function isDocFilePath(fp: string): boolean {
  const normalized = fp.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('.md')) return true;
  const inDocsDir = normalized.startsWith('docs/') || normalized.includes('/docs/');
  if (!inDocsDir) return false;
  const ext = path.posix.extname(normalized);
  return DOC_EXTENSIONS.has(ext);
}

/**
 * Determina si el árbol de trabajo Git contiene exclusivamente cambios en documentación
 * (*.md o archivos documentales dentro de docs/). Si no hay cambios o hay al menos 1 archivo de código,
 * configuración o prueba modificado, devuelve false.
 */
export function isDocsOnlyWorkspaceChange(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): boolean {
  try {
    const raw = execFileSyncFn('git', ['status', '--porcelain'], {
      cwd: path.resolve(projectPath),
      encoding: 'utf8',
    });
    const lines = String(raw)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return false;
    }

    const filePaths = lines.map((line) => {
      const cleaned = line.slice(2).trim();
      const arrowIdx = cleaned.indexOf(' -> ');
      return arrowIdx !== -1 ? cleaned.slice(arrowIdx + 4).trim() : cleaned;
    });

    return filePaths.every((fp) => isDocFilePath(fp));
  } catch {
    return false;
  }
}

/**
 * Tool 7: run_ephemeral_qa
 * Ejecuta de forma segura e inyectable un target de pruebas del Makefile
 * dentro de contenedores Docker efímeros (Rule Zero) y resume la salida
 * mediante los parsers ahorradores de tokens. Soporta Fast-Path Documental (skipIfDocsOnly).
 */
export async function runEphemeralQa(
  projectPath: string,
  stage: string,
  timeoutSeconds = 300,
  options?: RunEphemeralQaOptions
): Promise<QaExecutionResult> {
  const resolvedPath = path.resolve(projectPath);

  if (options?.skipIfDocsOnly && isDocsOnlyWorkspaceChange(resolvedPath, options.execFileSyncFn)) {
    return {
      status: 'SKIPPED',
      stage,
      exit_code: 0,
      duration_ms: 0,
      coverage: {
        detected: false,
        percent: 0,
        threshold: 95.0,
        passed: false,
        uncovered_files: [],
      },
      failed_tests: [],
      linter_and_complexity_issues: [],
      security_alerts: { critical: 0, high: 0 },
      mutation_summary: null,
      tail_log: `✔ [Fast-Path Docs-Only] Solo se detectaron cambios en documentación (*.md / docs/); se omite 'make qa-${stage}' en Docker.`,
    };
  }

  const makefilePath = path.join(resolvedPath, 'Makefile');

  if (!fs.existsSync(makefilePath)) {
    return {
      status: 'FAILED',
      stage,
      exit_code: 1,
      duration_ms: 0,
      coverage: {
        detected: false,
        percent: 0,
        threshold: 95.0,
        passed: false,
        uncovered_files: [],
      },
      failed_tests: [
        {
          test_name: `make qa-${stage}`,
          error_summary: `No se encontró archivo Makefile en ${resolvedPath}.`,
        },
      ],
      linter_and_complexity_issues: [],
      security_alerts: { critical: 0, high: 0 },
      mutation_summary: null,
      tail_log: `Error: Makefile inexistente en el directorio destino: ${resolvedPath}`,
    };
  }

  const executor = options?.execFileFn || execFile;
  const target = `qa-${stage}`;
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  return new Promise<QaExecutionResult>((resolve) => {
    executor(
      'make',
      [target],
      {
        cwd: resolvedPath,
        timeout: timeoutMs,
        shell: false,
        maxBuffer: 20 * 1024 * 1024, // 20 MB buffer para salidas masivas de Docker
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const stdoutStr = stdout ? stdout.toString() : '';
        const stderrStr = stderr ? stderr.toString() : '';

        let exitCode = 0;
        if (error) {
          if (typeof error.code === 'number') {
            exitCode = error.code;
          } else if (error.killed || error.signal === 'SIGTERM') {
            exitCode = 124; // Código estándar timeout
          } else {
            exitCode = 1;
          }
        }

        const parsed = parseQaOutput(stdoutStr, stderrStr, stage, durationMs, exitCode);

        // Si fue timeout, enriquecer información en tail_log si no hay pruebas explícitas
        if (exitCode === 124) {
          parsed.status = 'FAILED';
          parsed.tail_log = `[TIMEOUT] La ejecución de 'make ${target}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
        }

        resolve(parsed);
      }
    );
  });
}
