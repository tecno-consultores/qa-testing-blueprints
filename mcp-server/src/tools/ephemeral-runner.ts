// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { parseQaOutput } from '../parsers/output-parsers.js';
import { QaExecutionResult } from '../types.js';

export interface RunEphemeralQaOptions {
  execFileFn?: typeof execFile;
}

/**
 * Tool 6: run_ephemeral_qa
 * Ejecuta de forma segura e inyectable un target de pruebas del Makefile
 * dentro de contenedores Docker efímeros (Rule Zero) y resume la salida
 * mediante los parsers ahorradores de tokens.
 */
export async function runEphemeralQa(
  projectPath: string,
  stage: string,
  timeoutSeconds = 300,
  options?: RunEphemeralQaOptions
): Promise<QaExecutionResult> {
  const resolvedPath = path.resolve(projectPath);
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
