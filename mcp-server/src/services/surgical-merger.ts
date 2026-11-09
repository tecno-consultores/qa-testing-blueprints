// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FetchedFileItem, MergeFilesOptions, MergeResultItem } from '../types.js';
import { mergeOrAppendAgentsMdContent } from '../cli/init-agents-md.js';
import { resolveSafeChildPath } from './github-fetcher.js';

const ALLOW_PLUGINS_KEY = 'allow-plugins';
const REQUIRE_DEV_KEY = 'require-dev';
const SCRIPTS_KEY = 'scripts';

export class SurgicalMerger {
  /**
   * Fusión quirúrgica de package.json:
   * Conserva 'name', 'version', 'dependencies', y solo inyecta devDependencies y scripts faltantes.
   */
  public mergePackageJson(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    let targetObj: Record<string, unknown> = {};
    if (targetContent.trim()) {
      try {
        targetObj = JSON.parse(targetContent);
      } catch {
        targetObj = {};
      }
    }

    const exampleObj = JSON.parse(exampleContent) as Record<string, unknown>;
    const changes: string[] = [];

    // 1. Inyectar scripts faltantes
    const targetScripts = (targetObj.scripts as Record<string, string>) || {};
    const exampleScripts = (exampleObj.scripts as Record<string, string>) || {};
    const mergedScripts = { ...targetScripts };

    for (const [scriptName, scriptCmd] of Object.entries(exampleScripts)) {
      if (!mergedScripts[scriptName]) {
        mergedScripts[scriptName] = scriptCmd;
        changes.push(`Añadido script: "${scriptName}": "${scriptCmd}"`);
      }
    }

    // Blindaje 11X: Asegurar que el script "lint" que usa eslint aplique --max-warnings 0
    if (
      typeof mergedScripts.lint === 'string' &&
      mergedScripts.lint.includes('eslint') &&
      !mergedScripts.lint.includes('--max-warnings')
    ) {
      mergedScripts.lint = `${mergedScripts.lint} --max-warnings 0`;
      changes.push('Inyectado flag estricto "--max-warnings 0" en script "lint"');
    }

    targetObj.scripts = mergedScripts;

    // 2. Inyectar devDependencies faltantes
    const targetDevDeps = (targetObj.devDependencies as Record<string, string>) || {};
    const exampleDevDeps = (exampleObj.devDependencies as Record<string, string>) || {};
    const mergedDevDeps = { ...targetDevDeps };

    for (const [pkg, ver] of Object.entries(exampleDevDeps)) {
      if (!mergedDevDeps[pkg] && !(targetObj.dependencies as Record<string, string>)?.[pkg]) {
        mergedDevDeps[pkg] = ver;
        changes.push(`Añadida devDependency: "${pkg}": "${ver}"`);
      }
    }
    targetObj.devDependencies = mergedDevDeps;

    // 3. Inyectar pnpm.onlyBuiltDependencies si aplica
    if (exampleObj.pnpm && !targetObj.pnpm) {
      targetObj.pnpm = exampleObj.pnpm;
      changes.push('Inyectada configuración "pnpm"');
    }

    return {
      merged: JSON.stringify(targetObj, null, 2) + '\n',
      changes,
    };
  }

  private mergeJsonDictionarySection(
    targetObj: Record<string, unknown>,
    sourceObj: Record<string, unknown>,
    sectionKey: string,
    changes: string[]
  ): void {
    const targetSection = (targetObj[sectionKey] as Record<string, unknown>) || {};
    const sourceSection = (sourceObj[sectionKey] as Record<string, unknown>) || {};
    const mergedSection = { ...targetSection };

    for (const [key, value] of Object.entries(sourceSection)) {
      if (mergedSection[key] === undefined) {
        mergedSection[key] = value;
        changes.push(`Añadido ${sectionKey}["${key}"]: ${JSON.stringify(value)}`);
      }
    }
    targetObj[sectionKey] = mergedSection;
  }

  /**
   * Fusión quirúrgica de composer.json:
   * Conserva name, license, require, e inyecta require-dev, scripts y config.allow-plugins faltantes.
   */
  public mergeComposerJson(
    targetContent: string,
    exampleContent: string
  ): { merged: string; content: string; changes: string[] } {
    let targetObj: Record<string, unknown> = {};
    if (targetContent.trim()) {
      try {
        targetObj = JSON.parse(targetContent) as Record<string, unknown>;
      } catch {
        targetObj = {};
      }
    }
    let exampleObj: Record<string, unknown> = {};
    try {
      exampleObj = JSON.parse(exampleContent) as Record<string, unknown>;
    } catch {
      exampleObj = {};
    }
    const changes: string[] = [];

    this.mergeJsonDictionarySection(targetObj, exampleObj, REQUIRE_DEV_KEY, changes);
    this.mergeJsonDictionarySection(targetObj, exampleObj, SCRIPTS_KEY, changes);

    const tplConfig = (exampleObj.config ?? {}) as Record<string, unknown>;
    if (Object.keys(tplConfig).length > 0) {
      const curConfig = (targetObj.config ?? {}) as Record<string, unknown>;
      targetObj.config = curConfig;
      this.mergeJsonDictionarySection(curConfig, tplConfig, ALLOW_PLUGINS_KEY, changes);
    }

    const mergedStr = `${JSON.stringify(targetObj, null, 2)}\n`;
    return {
      merged: mergedStr,
      content: mergedStr,
      changes,
    };
  }

  /**
   * Fusión quirúrgica de pyproject.toml:
   * Conserva [project] y dependencies intactos, e inyecta secciones [tool.*] faltantes.
   */
  public mergePyprojectToml(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    if (!targetContent.trim()) {
      return {
        merged: exampleContent,
        changes: ['Creado pyproject.toml con plantilla base completa.'],
      };
    }

    const changes: string[] = [];
    const sectionsToInject = [
      'tool.ruff',
      'tool.ruff.lint',
      'tool.ruff.format',
      'tool.mypy',
      'tool.pytest.ini_options',
      'tool.coverage.run',
      'tool.coverage.report',
    ];

    // Extraer secciones de exampleContent
    const exampleSections: Record<string, string> = {};
    const sectionRegex = /^\[([^\]]+)\]/gm;
    let match: RegExpExecArray | null;
    const indices: Array<{ name: string; index: number }> = [];

    while ((match = sectionRegex.exec(exampleContent)) !== null) {
      indices.push({ name: match[1], index: match.index });
    }

    for (let i = 0; i < indices.length; i++) {
      const current = indices[i];
      const next = indices[i + 1];
      const sectionText = next
        ? exampleContent.slice(current.index, next.index).trim()
        : exampleContent.slice(current.index).trim();
      exampleSections[current.name] = sectionText;
    }

    let merged = targetContent.trimEnd() + '\n';

    for (const sec of sectionsToInject) {
      const header = `[${sec}]`;
      if (!merged.includes(header) && exampleSections[sec]) {
        merged += `\n# --- Inyectado por QA 11X Blueprints ---\n${exampleSections[sec]}\n`;
        changes.push(`Inyectada sección: [${sec}]`);
      }
    }

    return {
      merged,
      changes,
    };
  }

  /**
   * Fusión aditiva de Makefiles:
   * Conserva targets existentes, e inyecta únicamente targets ausentes (e.g. qa-*, audit-*).
   */
  public mergeMakefile(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    if (!targetContent.trim()) {
      return {
        merged: exampleContent,
        changes: ['Creado Makefile con plantilla base completa.'],
      };
    }

    const changes: string[] = [];
    const targetLines = targetContent.split('\n');
    const existingTargets = new Set<string>();

    for (const line of targetLines) {
      const targetMatch = /^([a-zA-Z0-9_.-]+):/.exec(line);
      if (targetMatch) {
        existingTargets.add(targetMatch[1]);
      }
    }

    // Dividir exampleContent en bloques de targets
    const exampleBlocks = exampleContent.split(/\n(?=[a-zA-Z0-9_.-]+:)/);
    let appendedBlocks = '';

    for (const block of exampleBlocks) {
      const targetMatch = /^([a-zA-Z0-9_.-]+):/.exec(block.trim());
      if (targetMatch) {
        const targetName = targetMatch[1];
        if (!existingTargets.has(targetName)) {
          appendedBlocks += `\n# --- Añadido por QA 11X Blueprints ---\n${block.trim()}\n`;
          changes.push(`Añadido target Makefile: "${targetName}"`);
        }
      }
    }

    let mergedText = targetContent.trimEnd() + (appendedBlocks ? '\n' + appendedBlocks : '\n');

    const hardenedLines = mergedText.split('\n').map((line) => {
      let updated = line;
      const hasPytest = /\bpytest\b/.test(updated);
      const hasBareAddopts =
        updated.includes('-o addopts=""') || updated.includes("-o addopts=''");
      if (hasPytest && hasBareAddopts && !updated.includes('--cov')) {
        updated = updated.replace(
          /(-o\s+addopts=(?:""|''))/,
          '$1 --cov=src --cov-fail-under=95'
        );
        changes.push('Inyectado "--cov=src --cov-fail-under=95" junto a "-o addopts=\\"\\"" en Makefile');
      }

      if (
        hasPytest &&
        updated.includes('docker') &&
        updated.includes('run --rm') &&
        !updated.includes('COVERAGE_FILE')
      ) {
        updated = updated.replace('run --rm', 'run --rm -e COVERAGE_FILE=/tmp/.coverage');
        changes.push('Inyectado "-e COVERAGE_FILE=/tmp/.coverage" para contenedor no-root en Makefile');
      }
      return updated;
    });

    mergedText = hardenedLines.join('\n');

    return {
      merged: mergedText,
      changes,
    };
  }

  /**
   * Fusión idempotente para .gitignore y .npmrc
   */
  public mergeGitignoreOrNpmrc(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    const existingLines = new Set(
      targetContent
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
    );

    const changes: string[] = [];
    const missingLines: string[] = [];

    for (const line of exampleContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('#') && !existingLines.has(trimmed)) {
        missingLines.push(trimmed);
        changes.push(`Añadida regla: "${trimmed}"`);
      }
    }

    let merged = targetContent.trimEnd();
    if (missingLines.length > 0) {
      merged += '\n# --- Añadido por QA 11X Blueprints ---\n' + missingLines.join('\n') + '\n';
    } else {
      merged += '\n';
    }

    return {
      merged,
      changes,
    };
  }

  /**
   * Fusión quirúrgica y aditiva de AGENTS.md:
   * Conserva el 100% de las instrucciones existentes del usuario y solo añade o actualiza
   * el bloque conector canónico de QA 11X (MCP + Skill).
   */
  public mergeAgentsMd(
    targetContent: string,
    projectName = 'Project',
    stacks: string[] = []
  ): { merged: string; changes: string[] } {
    const res = mergeOrAppendAgentsMdContent(targetContent, projectName, stacks);
    return {
      merged: res.finalContent,
      changes: res.changes,
    };
  }

  private resolveSurgicalMerge(
    targetName: string,
    existingContent: string,
    exampleContent: string
  ): { finalContent: string; changes: string[] } {
    const base = path.basename(targetName);
    if (base === 'package.json') {
      const res = this.mergePackageJson(existingContent, exampleContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    if (base === 'composer.json') {
      const res = this.mergeComposerJson(existingContent, exampleContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    if (base === 'pyproject.toml') {
      const res = this.mergePyprojectToml(existingContent, exampleContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    if (base === 'Makefile') {
      const res = this.mergeMakefile(existingContent, exampleContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    if (base === 'AGENTS.md') {
      const res = this.mergeAgentsMd(existingContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    const res = this.mergeGitignoreOrNpmrc(existingContent, exampleContent);
    return { finalContent: res.merged, changes: res.changes };
  }

  private processExistingFile(
    item: FetchedFileItem,
    targetFilePath: string,
    dryRun: boolean
  ): { status: 'merged' | 'skipped' | 'dry_run'; changes: string[]; finalContent: string } {
    if (item.merge_strategy === 'copy_if_missing') {
      return {
        status: 'skipped',
        changes: [`Archivo preservado sin cambios: ${item.target_name}`],
        finalContent: item.content,
      };
    }

    const existingContent = fs.readFileSync(targetFilePath, 'utf-8');

    if (item.merge_strategy === 'append_missing_lines') {
      const res = this.mergeGitignoreOrNpmrc(existingContent, item.content);
      const status = res.changes.length > 0 ? (dryRun ? 'dry_run' : 'merged') : 'skipped';
      return { status, changes: res.changes, finalContent: res.merged };
    }

    if (item.merge_strategy === 'surgical_merge') {
      const res = this.resolveSurgicalMerge(item.target_name, existingContent, item.content);
      const status = res.changes.length > 0 ? (dryRun ? 'dry_run' : 'merged') : 'skipped';
      return { status, changes: res.changes, finalContent: res.finalContent };
    }

    // Estrategias de sobreescritura
    return {
      status: dryRun ? 'dry_run' : 'merged',
      changes: [`Actualizado archivo con versión canónica: ${item.target_name}`],
      finalContent: item.content,
    };
  }

  private writeMergedFile(
    targetFilePath: string,
    finalContent: string,
    strategy: string,
    targetName: string
  ): void {
    const parentDir = path.dirname(targetFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(targetFilePath, finalContent, 'utf-8');

    if (
      strategy === 'overwrite_executable' ||
      targetName.endsWith('.sh') ||
      targetName.endsWith('.py')
    ) {
      try {
        fs.chmodSync(targetFilePath, 0o755);
      } catch {
        // Ignorar en sistemas que no soporten chmod
      }
    }
  }

  /**
   * Ejecuta la fusión completa no destructiva sobre el proyecto destino
   */
  public async mergeFiles(
    targetProjectDir: string,
    bundleFiles: FetchedFileItem[],
    options?: MergeFilesOptions
  ): Promise<{
    project_path: string;
    dry_run: boolean;
    summary: { total_files: number; created: number; merged: number; skipped: number };
    applied_changes: MergeResultItem[];
  }> {
    const dryRun = options?.dryRun ?? false;
    const appliedChanges: MergeResultItem[] = [];
    let createdCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    for (const item of bundleFiles) {
      const targetFilePath = resolveSafeChildPath(targetProjectDir, item.target_name);
      const exists = fs.existsSync(targetFilePath);

      let status: 'created' | 'merged' | 'skipped' | 'dry_run' = 'created';
      let changes: string[] = [];
      let finalContent = item.content;

      if (!exists) {
        status = dryRun ? 'dry_run' : 'created';
        changes.push(`Creado archivo: ${item.target_name}`);
        createdCount++;
      } else {
        const processed = this.processExistingFile(item, targetFilePath, dryRun);
        status = processed.status;
        changes = processed.changes;
        finalContent = processed.finalContent;

        if (status === 'merged' || status === 'dry_run') {
          mergedCount++;
        } else {
          skippedCount++;
        }
      }

      if (!dryRun && status !== 'skipped') {
        this.writeMergedFile(targetFilePath, finalContent, item.merge_strategy, item.target_name);
      }

      appliedChanges.push({
        file: item.target_name,
        strategy: item.merge_strategy,
        status,
        changes,
      });
    }

    return {
      project_path: targetProjectDir,
      dry_run: dryRun,
      summary: {
        total_files: bundleFiles.length,
        created: createdCount,
        merged: mergedCount,
        skipped: skippedCount,
      },
      applied_changes: appliedChanges,
    };
  }
}
