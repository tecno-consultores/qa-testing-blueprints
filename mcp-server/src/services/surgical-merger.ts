// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import * as path from 'node:path';
import { assertNotSymlinkPath } from '../security/pathRealResolver.js';
import { FetchedFileItem, MergeFilesOptions, MergeResultItem } from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  type AgentsMdMergeOptions,
  detectConnectorLang,
  detectExistingStacks,
} from './agents-connector.js';
import { resolveSafeChildPath } from './github-fetcher.js';
import {
  mergeComposerJsonContent,
  mergeEslintConfigMjsContent,
  mergeEslintrcJsonContent,
  mergePackageJsonContent,
  mergePnpmWorkspaceYamlContent,
  mergePyprojectTomlContent,
  mergeVitestSetupTsContent,
} from './surgical-merger/jsonAndToolchainMergers.js';
import {
  mergeAgentsMdContent,
  mergeGitignoreOrNpmrcContent,
  mergeLefthookYamlContent,
  mergeMakefileContent,
} from './surgical-merger/textAndWorkflowMergers.js';

export class SurgicalMerger {
  public mergePackageJson(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergePackageJsonContent(targetContent, exampleContent);
  }

  public mergePnpmWorkspaceYaml(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergePnpmWorkspaceYamlContent(targetContent, exampleContent);
  }

  public mergeEslintrcJson(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergeEslintrcJsonContent(targetContent, exampleContent);
  }

  public mergeEslintConfigMjs(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergeEslintConfigMjsContent(targetContent, exampleContent);
  }

  public mergeVitestSetupTs(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergeVitestSetupTsContent(targetContent, exampleContent);
  }

  public mergeComposerJson(
    targetContent: string,
    exampleContent: string
  ): { merged: string; content: string; changes: string[] } {
    return mergeComposerJsonContent(targetContent, exampleContent);
  }

  public mergePyprojectToml(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergePyprojectTomlContent(targetContent, exampleContent);
  }

  public mergeMakefile(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergeMakefileContent(targetContent, exampleContent);
  }

  public mergeGitignoreOrNpmrc(
    targetContent: string,
    exampleContent: string
  ): { merged: string; changes: string[] } {
    return mergeGitignoreOrNpmrcContent(targetContent, exampleContent);
  }

  public mergeLefthookYaml(
    targetContent: string,
    exampleContent: string,
    targetProjectDir?: string
  ): { merged: string; changes: string[] } {
    return mergeLefthookYamlContent(targetContent, exampleContent, targetProjectDir);
  }

  public mergeAgentsMd(
    targetContent: string,
    projectName = 'Project',
    stacks: string[] = [],
    langOrOptions: AgentsMdMergeOptions | 'auto' | 'es' | 'en' = 'auto'
  ): { merged: string; changes: string[] } {
    return mergeAgentsMdContent(targetContent, projectName, stacks, langOrOptions);
  }

  private resolveSurgicalMerge(
    targetName: string,
    existingContent: string,
    exampleContent: string,
    projectContext: { readonly projectName: string; readonly targetProjectDir?: string } = {
      projectName: 'Project',
    }
  ): { finalContent: string; changes: string[] } {
    const { projectName, targetProjectDir } = projectContext;
    const base = path.basename(targetName);
    const jsonOrTomlHandlers: Record<
      string,
      (existing: string, example: string) => { merged: string; changes: string[] }
    > = {
      'package.json': (e, x) => this.mergePackageJson(e, x),
      'composer.json': (e, x) => this.mergeComposerJson(e, x),
      'pyproject.toml': (e, x) => this.mergePyprojectToml(e, x),
      Makefile: (e, x) => this.mergeMakefile(e, x),
      'pnpm-workspace.yaml': (e, x) => this.mergePnpmWorkspaceYaml(e, x),
      '.eslintrc.json': (e, x) => this.mergeEslintrcJson(e, x),
      'eslint.config.mjs': (e, x) => this.mergeEslintConfigMjs(e, x),
      'vitest.setup.ts': (e, x) => this.mergeVitestSetupTs(e, x),
      'lefthook.yml': (e, x) => this.mergeLefthookYaml(e, x, targetProjectDir),
      'lefthook.yaml': (e, x) => this.mergeLefthookYaml(e, x, targetProjectDir),
    };

    const handler = jsonOrTomlHandlers[base];
    if (handler) {
      const res = handler(existingContent, exampleContent);
      return { finalContent: res.merged, changes: res.changes };
    }
    if (base === 'AGENTS.md') {
      const preservedStacks = detectExistingStacks(existingContent);
      const preservedLang = detectConnectorLang(existingContent);
      const res = this.mergeAgentsMd(existingContent, projectName, preservedStacks, {
        projectDir: targetProjectDir,
        ...(preservedLang !== undefined ? { lang: preservedLang } : {}),
      });
      return { finalContent: res.merged, changes: res.changes };
    }
    const res = this.mergeGitignoreOrNpmrc(existingContent, exampleContent);
    return { finalContent: res.merged, changes: res.changes };
  }

  private resolveMergeStatus(hasChanges: boolean, dryRun: boolean): 'merged' | 'skipped' | 'dry_run' {
    if (!hasChanges) {
      return 'skipped';
    }
    return dryRun ? 'dry_run' : 'merged';
  }

  private processExistingFile(
    item: FetchedFileItem,
    targetFilePath: string,
    dryRun: boolean,
    projectName = 'Project'
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
      const status = this.resolveMergeStatus(res.changes.length > 0, dryRun);
      return { status, changes: res.changes, finalContent: res.merged };
    }

    if (item.merge_strategy === 'surgical_merge') {
      const targetProjectDir = path.dirname(targetFilePath);
      const res = this.resolveSurgicalMerge(item.target_name, existingContent, item.content, {
        projectName,
        targetProjectDir,
      });
      if (res.changes.some((c) => c.startsWith('Error:'))) {
        return { status: 'skipped', changes: res.changes, finalContent: existingContent };
      }
      const status = this.resolveMergeStatus(res.changes.length > 0, dryRun);
      return { status, changes: res.changes, finalContent: res.finalContent };
    }

    if (item.merge_strategy === 'copy_if_missing_or_update_qa') {
      if (existingContent === item.content) {
        return {
          status: 'skipped',
          changes: [`Archivo QA ya sincronizado: ${item.target_name}`],
          finalContent: existingContent,
        };
      }
      return {
        status: dryRun ? 'dry_run' : 'merged',
        changes: [`Actualizada plantilla QA: ${item.target_name}`],
        finalContent: item.content,
      };
    }

    if (
      item.merge_strategy === 'overwrite' ||
      item.merge_strategy === 'copy_or_overwrite' ||
      item.merge_strategy === 'overwrite_executable'
    ) {
      if (existingContent === item.content) {
        return {
          status: 'skipped',
          changes: [`Archivo canónico sin cambios: ${item.target_name}`],
          finalContent: existingContent,
        };
      }
      return {
        status: dryRun ? 'dry_run' : 'merged',
        changes: [`Actualizado archivo con versión canónica: ${item.target_name}`],
        finalContent: item.content,
      };
    }

    throw new Error(
      `[MERGE-STRATEGY-01] Estrategia de fusión no reconocida '${item.merge_strategy}' para '${item.target_name}'.`
    );
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
    assertNotSymlinkPath(targetFilePath);
    fs.writeFileSync(targetFilePath, finalContent, 'utf-8');

    if (
      strategy === 'overwrite_executable' ||
      targetName.endsWith('.sh') ||
      targetName.endsWith('.py')
    ) {
      try {
        // eslint-disable-next-line sonarjs/file-permissions -- Shared repo scripts require 0o755 so non-root Docker UIDs can execute them
        fs.chmodSync(targetFilePath, 0o755);
      } catch (err: unknown) {
        reportDebugCatchError(`surgicalMerger.writeMergedFile.chmod(${targetName})`, err);
      }
    }
  }

  private resolveInitialFileContent(
    item: FetchedFileItem,
    projectName: string,
    targetProjectDir?: string
  ): string {
    return path.basename(item.target_name) === 'AGENTS.md'
      ? this.mergeAgentsMd('', projectName, [], { projectDir: targetProjectDir }).merged
      : item.content;
  }

  private evaluateSingleBundleItem(
    item: FetchedFileItem,
    targetFilePath: string,
    dryRun: boolean,
    projectName: string
  ): {
    status: 'created' | 'merged' | 'skipped' | 'dry_run';
    changes: string[];
    finalContent: string;
    existed: boolean;
  } {
    if (!fs.existsSync(targetFilePath)) {
      return {
        status: dryRun ? 'dry_run' : 'created',
        changes: [`Creado archivo: ${item.target_name}`],
        finalContent: this.resolveInitialFileContent(
          item,
          projectName,
          path.dirname(targetFilePath)
        ),
        existed: false,
      };
    }
    return { ...this.processExistingFile(item, targetFilePath, dryRun, projectName), existed: true };
  }

  public mergeFiles(
    targetProjectDir: string,
    bundleFiles: FetchedFileItem[],
    options?: MergeFilesOptions
  ): Promise<{
    project_path: string;
    dry_run: boolean;
    summary: { total_files: number; created: number; merged: number; skipped: number };
    applied_changes: MergeResultItem[];
  }> {
    return Promise.resolve().then(() =>
      this.executeMergeFiles(targetProjectDir, bundleFiles, options)
    );
  }

  private backupExistingFile(
    targetProjectDir: string,
    targetFilePath: string,
    targetName: string
  ): void {
    const backupPath = resolveSafeChildPath(targetProjectDir, `${targetName}.11x-backup`);
    const existingBackupStat = fs.lstatSync(backupPath, { throwIfNoEntry: false });
    if (existingBackupStat?.isSymbolicLink()) {
      throw new Error(
        `[SEC-SYMLINK-01] Se rechazó escribir respaldo sobre enlace simbólico: ${targetName}.11x-backup`
      );
    }
    fs.copyFileSync(targetFilePath, backupPath);
    try {
      fs.chmodSync(backupPath, 0o600);
    } catch (err: unknown) {
      reportDebugCatchError(`surgicalMerger.backupExistingFile.chmod(${targetName})`, err);
    }
  }

  private executeMergeFiles(
    targetProjectDir: string,
    bundleFiles: FetchedFileItem[],
    options?: MergeFilesOptions
  ): {
    project_path: string;
    dry_run: boolean;
    summary: { total_files: number; created: number; merged: number; skipped: number };
    applied_changes: MergeResultItem[];
  } {
    const dryRun = options?.dryRun ?? false;
    const createBackup = options?.createBackup ?? true;
    const appliedChanges: MergeResultItem[] = [];
    let createdCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    const projectName = path.basename(path.resolve(targetProjectDir)) || 'Project';
    for (const item of bundleFiles) {
      const targetFilePath = resolveSafeChildPath(targetProjectDir, item.target_name);
      const evaluated = this.evaluateSingleBundleItem(item, targetFilePath, dryRun, projectName);

      if (!evaluated.existed) {
        createdCount++;
      } else if (evaluated.status === 'merged' || evaluated.status === 'dry_run') {
        mergedCount++;
      } else {
        skippedCount++;
      }

      if (!dryRun && evaluated.status !== 'skipped') {
        if (createBackup && evaluated.existed && fs.existsSync(targetFilePath)) {
          this.backupExistingFile(targetProjectDir, targetFilePath, item.target_name);
        }
        this.writeMergedFile(targetFilePath, evaluated.finalContent, item.merge_strategy, item.target_name);
      }

      appliedChanges.push({
        file: item.target_name,
        strategy: item.merge_strategy,
        status: evaluated.status,
        changes: evaluated.changes,
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
