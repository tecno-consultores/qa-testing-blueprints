// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';

const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';

function parseTargetArg(args: string[]): string {
  let targetArg = 'workspace';
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--target' || args[i] === '-t') && args[i + 1]) {
      targetArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--target=')) {
      targetArg = args[i].split('=')[1];
    }
  }
  return targetArg;
}

function resolveAllTargets(homeDir: string, cwd: string): string[] {
  const destDirs = [path.join(cwd, '.agents', 'skills')];
  if (fs.existsSync(path.join(homeDir, '.gemini'))) {
    destDirs.push(path.join(homeDir, '.gemini', 'config', 'skills'));
  }
  if (fs.existsSync(path.join(homeDir, '.claude'))) {
    destDirs.push(path.join(homeDir, '.claude', 'skills'));
  }
  if (fs.existsSync(path.join(homeDir, '.hermes'))) {
    destDirs.push(path.join(homeDir, '.hermes', 'skills'));
  }
  return destDirs;
}

function resolveDefaultTarget(homeDir: string, cwd: string): string[] {
  if (fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, 'AGENTS.md'))) {
    return [path.join(cwd, '.agents', 'skills')];
  }
  if (fs.existsSync(path.join(homeDir, '.gemini'))) {
    return [path.join(homeDir, '.gemini', 'config', 'skills')];
  }
  return [path.join(cwd, '.agents', 'skills')];
}

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  switch (targetArg) {
    case 'workspace':
    case 'local':
    case 'cursor':
      return [path.join(cwd, '.agents', 'skills')];
    case 'antigravity':
      return [path.join(homeDir, '.gemini', 'config', 'skills')];
    case 'claude':
      return [path.join(homeDir, '.claude', 'skills')];
    case 'hermes':
      return [path.join(homeDir, '.hermes', 'skills')];
    case 'all':
      return resolveAllTargets(homeDir, cwd);
    default:
      return resolveDefaultTarget(homeDir, cwd);
  }
}

function writeDownloadedSkills(
  destDirs: string[],
  files: Array<{ relSkillPath: string; content: string }>
): void {
  for (const dest of destDirs) {
    for (const item of files) {
      const fullPath = path.join(dest, item.relSkillPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, item.content, 'utf-8');
    }
    console.log(`✅ Skills instaladas con éxito en: ${dest}`);
  }
}

export async function runInstallSkillCli(args: string[], fetcher?: GitHubFetcher): Promise<void> {
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const targetArg = parseTargetArg(args);

  console.log(DIVIDER);
  console.log('   🧠 Instalador de Skills QA 11X (Node.js / MCP CLI)                 ');
  console.log(`${DIVIDER}\n`);

  console.log('📥 Obteniendo manifiesto criptográfico de QA Testing Blueprints...');
  const manifest = await resolvedFetcher.fetchManifest();

  // Filtrar archivos de qa-11x-architect y refactoring-ui
  const skillEntries = manifest.agent_governance_files.filter(
    (f) =>
      f.path.startsWith('.agents/skills/qa-11x-architect/') ||
      f.path.startsWith('.agents/skills/refactoring-ui/')
  );

  if (skillEntries.length === 0) {
    throw new Error('No se encontraron archivos de skills en manifest.json.');
  }

  console.log(`✔ Manifiesto verificado. Archivos de skills indexados: ${skillEntries.length}`);

  const homeDir = process.env.HOME || os.homedir();
  const cwd = process.cwd();
  const destDirs = resolveDestinationDirs(targetArg, homeDir, cwd);

  console.log('📍 Destinos de instalación:');
  for (const d of destDirs) {
    console.log(`  - ${d}`);
  }

  console.log('\n🔒 Descargando y validando integridad SHA-256 (DISA STIG V-222513)...');
  const downloadedFiles: Array<{ relSkillPath: string; content: string }> = [];

  for (const entry of skillEntries) {
    const content = await resolvedFetcher.fetchFileContent(entry.path, entry.sha256);
    const relSkillPath = entry.path.replace(/^\.agents\/skills\//, '');
    downloadedFiles.push({ relSkillPath, content });
    console.log(`  ✔ ${relSkillPath} (${entry.size_bytes} bytes) [SHA-256 verificado]`);
  }

  writeDownloadedSkills(destDirs, downloadedFiles);

  console.log(DIVIDER);
  console.log('   ✅ Instalación Completada Exitosamente                             ');
  console.log(`${DIVIDER}\n`);
}
