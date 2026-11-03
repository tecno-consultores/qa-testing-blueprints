// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectAuditResult } from '../types.js';

const BASH_STACK_NAME = 'bash-scripts';

function inspectPythonStack(resolvedPath: string, detectedStacks: string[]): boolean {
  const pyprojectPath = path.join(resolvedPath, 'pyproject.toml');
  let mypyStrict = false;

  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, 'utf-8');
    if (content.includes('fastapi')) {
      detectedStacks.push('fastapi');
    } else {
      detectedStacks.push('python');
    }
    if (content.includes('strict = true') || content.includes('strict=true')) {
      mypyStrict = true;
    }
  }

  return mypyStrict;
}

function detectNodeFrameworks(packageJsonPath: string, detectedStacks: string[]): void {
  if (!fs.existsSync(packageJsonPath)) return;
  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  if (content.includes('"vue"') || content.includes("'vue'")) {
    detectedStacks.push('vue3');
  }
  if (content.includes('"react"') || content.includes("'react'")) {
    detectedStacks.push('react-frontend');
  }
  if (
    content.includes('"express"') ||
    content.includes('"fastify"') ||
    content.includes('"@nestjs/core"')
  ) {
    detectedStacks.push('node-backend');
  }
}

function checkTsconfigStrict(tsconfigPath: string): boolean {
  if (!fs.existsSync(tsconfigPath)) return false;
  const content = fs.readFileSync(tsconfigPath, 'utf-8');
  return content.includes('"strict": true') || content.includes('"strict":true');
}

function checkNpmrcIgnoreScripts(npmrcPath: string): boolean {
  if (!fs.existsSync(npmrcPath)) return false;
  const content = fs.readFileSync(npmrcPath, 'utf-8');
  return content.includes('ignore-scripts=true') || content.includes('ignore-scripts = true');
}

function inspectNodeStack(
  resolvedPath: string,
  detectedStacks: string[]
): { tsconfigStrict: boolean; npmrcIgnoreScripts: boolean } {
  const packageJsonPath = path.join(resolvedPath, 'package.json');
  const tsconfigPath = path.join(resolvedPath, 'tsconfig.json');
  const npmrcPath = path.join(resolvedPath, '.npmrc');

  detectNodeFrameworks(packageJsonPath, detectedStacks);
  const tsconfigStrict = checkTsconfigStrict(tsconfigPath);
  const npmrcIgnoreScripts = checkNpmrcIgnoreScripts(npmrcPath);

  return { tsconfigStrict, npmrcIgnoreScripts };
}

function inspectBashStack(resolvedPath: string, detectedStacks: string[]): void {
  try {
    const entries = fs.readdirSync(resolvedPath);
    const hasBash = entries.some(
      (e) => e.endsWith('.sh') || e.endsWith('.bats') || e === BASH_STACK_NAME
    );
    if (hasBash && !detectedStacks.includes(BASH_STACK_NAME)) {
      detectedStacks.push(BASH_STACK_NAME);
    }
  } catch {
    // Ignorar errores de lectura
  }
}

function collectMissing11xFiles(resolvedPath: string): string[] {
  const checkList: string[] = [
    'docker-compose.qa.yml',
    'Makefile',
    'lefthook.yml',
    path.join('.agents', 'scripts', 'certify_task_completion.sh'),
    'TESTING.md',
    'CHANGELOG.md',
  ];

  const missing: string[] = [];
  for (const item of checkList) {
    if (!fs.existsSync(path.join(resolvedPath, item))) {
      missing.push(item);
    }
  }
  return missing;
}

export async function inspectProjectConfig(projectPathInput: string): Promise<ProjectAuditResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio especificado no existe: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolvedPath}`);
  }

  const detectedStacks: string[] = [];

  const mypyStrict = inspectPythonStack(resolvedPath, detectedStacks);
  const { tsconfigStrict, npmrcIgnoreScripts } = inspectNodeStack(resolvedPath, detectedStacks);
  inspectBashStack(resolvedPath, detectedStacks);

  const missing11xFiles = collectMissing11xFiles(resolvedPath);

  return {
    project_path: resolvedPath,
    detected_stacks: detectedStacks.length > 0 ? detectedStacks : ['python'],
    has_docker_compose_qa: fs.existsSync(path.join(resolvedPath, 'docker-compose.qa.yml')),
    has_makefile: fs.existsSync(path.join(resolvedPath, 'Makefile')),
    has_lefthook: fs.existsSync(path.join(resolvedPath, 'lefthook.yml')),
    has_agents_dir: fs.existsSync(path.join(resolvedPath, '.agents')),
    has_testing_md: fs.existsSync(path.join(resolvedPath, 'TESTING.md')),
    has_changelog_md: fs.existsSync(path.join(resolvedPath, 'CHANGELOG.md')),
    strict_flags: {
      mypy_strict: mypyStrict,
      tsconfig_strict: tsconfigStrict,
      npmrc_ignore_scripts: npmrcIgnoreScripts,
    },
    missing_11x_files: missing11xFiles,
    recommended_next_tool: 'fetch_blueprint_bundle',
  };
}
