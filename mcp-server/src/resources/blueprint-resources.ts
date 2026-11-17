// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import {
  assertSafeRelativePath,
  GitHubFetcher,
  isOwnObjectProperty,
} from '../services/github-fetcher.js';
import type { Manifest, ManifestFileEntry, ResourceLanguage, StackDefinition } from '../types.js';
import { getActiveResourceLang } from './resourceLang.js';

const MIME_MARKDOWN = 'text/markdown';

export interface ResourceResponse {
  uri: string;
  mimeType: string;
  text: string;
}

export class BlueprintResources {
  private fetcher: GitHubFetcher;

  constructor(fetcher?: GitHubFetcher) {
    this.fetcher = fetcher || new GitHubFetcher();
  }

  public async getManifestResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    return {
      uri: 'blueprint://manifest',
      mimeType: 'application/json',
      text: JSON.stringify(manifest),
    };
  }

  public async getPhilosophyResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const resolvedLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const preferredPath = resolvedLang === 'es' ? 'AI_MASTER_PROMPT.es.md' : 'AI_MASTER_PROMPT.md';
    const promptEntry =
      manifest.agent_governance_files.find((f) => f.path === preferredPath) ??
      manifest.agent_governance_files.find((f) => f.path === 'AI_MASTER_PROMPT.md');
    let content = '';
    if (promptEntry) {
      content = await this.fetcher.fetchFileContent(promptEntry.path, promptEntry.sha256);
    } else {
      content =
        resolvedLang === 'es'
          ? '# Filosofía QA 11X\n\nEstándar corporativo de calidad, 13 capas y Rule Zero.'
          : '# QA 11X Philosophy\n\nCorporate quality standard, 13 layers, and Rule Zero.';
    }
    return {
      uri: 'blueprint://core/philosophy',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getSecurityResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const resolvedLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const secRef =
      (resolvedLang === 'es'
        ? manifest.agent_governance_files.find((f) =>
            f.path.endsWith('02-security-disa-owasp-22.es.md')
          ) ?? manifest.agent_governance_files.find((f) => f.path === 'SECURITY.es.md')
        : undefined) ??
      manifest.agent_governance_files.find((f) =>
        f.path.endsWith('02-security-disa-owasp-22.md')
      );
    let content = '';
    if (secRef) {
      content = await this.fetcher.fetchFileContent(secRef.path, secRef.sha256);
    } else {
      content =
        resolvedLang === 'es'
          ? '# 22 Patrones de Seguridad DISA ASD STIG V6R5 & OWASP v4.2\n\nConsulte docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md'
          : '# 22 Security Patterns DISA ASD STIG V6R5 & OWASP v4.2\n\nSee docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md';
    }
    return {
      uri: 'blueprint://security/disa-owasp-22',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getPostgresRlsWormResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const rlsRef = manifest.agent_governance_files.find((f) =>
      f.path.endsWith('08-postgres-rls-zero-downtime-migrations.md')
    );
    let content = '';
    if (rlsRef) {
      content = await this.fetcher.fetchFileContent(rlsRef.path, rlsRef.sha256);
    } else {
      content =
        '# PostgreSQL 17 RLS Multi-Transacción (after_begin) & Cadena WORM Determinista (seq_num + pg_advisory_xact_lock)\n\nConsulte .agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md';
    }
    return {
      uri: 'blueprint://database/postgres-rls-worm',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  private findStackManifestEntry(
    manifest: Manifest,
    stackDef: StackDefinition,
    relPath: string
  ): ManifestFileEntry | undefined {
    return (
      manifest.agent_governance_files.find((f) => f.path === relPath) ||
      stackDef.files.find((f) => f.path === relPath)
    );
  }

  private async fetchPrimaryOrFallbackStackReadme(
    stackDef: StackDefinition,
    readmeFile: ManifestFileEntry | undefined
  ): Promise<string> {
    if (readmeFile) {
      return this.fetcher.fetchFileContent(readmeFile.path, readmeFile.sha256);
    }
    if (stackDef.readme_sha256) {
      return this.fetcher.fetchFileContent(stackDef.readme, stackDef.readme_sha256);
    }
    return `# ${stackDef.description}\n\nConsulte ${stackDef.readme}`;
  }

  public async getStackReadmeResource(stack: string, lang?: ResourceLanguage): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const stackDef = isOwnObjectProperty(manifest.stacks, stack)
      ? manifest.stacks[stack]
      : undefined;
    if (!stackDef) {
      throw new Error(`Stack '${stack}' no reconocido. Opciones válidas: ${Object.keys(manifest.stacks).join(', ')}`);
    }

    const effectiveLang = getActiveResourceLang(undefined, lang);
    const readmeEsPath = stackDef.readme_es ?? stackDef.readme.replace(/\.md$/, '.es.md');
    const esFile =
      effectiveLang === 'es' ? this.findStackManifestEntry(manifest, stackDef, readmeEsPath) : undefined;
    const readmeFile = this.findStackManifestEntry(manifest, stackDef, stackDef.readme);

    const esTargetPath = esFile?.path ?? readmeEsPath;
    const esTargetSha = esFile?.sha256 ?? stackDef.readme_es_sha256;
    let content = '';
    if (effectiveLang === 'es' && esTargetPath && esTargetSha) {
      try {
        content = await this.fetcher.fetchFileContent(esTargetPath, esTargetSha);
      } catch {
        content = await this.fetchPrimaryOrFallbackStackReadme(stackDef, readmeFile);
      }
    } else {
      content = await this.fetchPrimaryOrFallbackStackReadme(stackDef, readmeFile);
    }

    return {
      uri: `blueprint://${stack}/readme`,
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getRefactoringUiResource(topic: string): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const cleanTopic = assertSafeRelativePath(topic.replace(/\.md$/, ''));
    if (cleanTopic.includes('/') || cleanTopic.includes('\\')) {
      throw new Error(
        `Tema de diseño '${topic}' inválido (no se permiten subdirectorios).`
      );
    }
    let targetPath = `.agents/skills/refactoring-ui/references/${cleanTopic}.md`;
    if (cleanTopic === 'skill') {
      targetPath = '.agents/skills/refactoring-ui/SKILL.md';
    }

    const fileEntry = manifest.agent_governance_files.find((f) => f.path === targetPath);
    if (!fileEntry) {
      throw new Error(
        `Tema de diseño '${topic}' no encontrado en refactoring-ui. Opciones: skill, hierarchy, layout, type, color, depth, images, polish, dark-mode, tailwind.`
      );
    }

    const content = await this.fetcher.fetchFileContent(fileEntry.path, fileEntry.sha256);
    return {
      uri: `blueprint://ui/refactoring-ui/${cleanTopic}`,
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getActiveTaskTemplateResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const taskEntry = manifest.agent_governance_files.find(
      (f) => f.path === '.agents/ACTIVE_TASK.md.example'
    );
    let content = '';
    if (taskEntry) {
      content = await this.fetcher.fetchFileContent(taskEntry.path, taskEntry.sha256);
    } else {
      content = '# ACTIVE_TASK.md.example\n\nConsulte la plantilla en .agents/ACTIVE_TASK.md.example';
    }
    return {
      uri: 'blueprint://core/active-task-template',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getCleanupScriptResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const cleanEntry = manifest.common_files.find(
      (f) => f.path === 'scripts/limpieza.sh' || f.path === 'limpieza.sh'
    );
    let content = '';
    if (cleanEntry) {
      content = await this.fetcher.fetchFileContent(cleanEntry.path, cleanEntry.sha256);
    } else {
      content = '#!/usr/bin/env bash\n# Script universal de limpieza QA 11X\n';
    }
    return {
      uri: 'blueprint://core/cleanup-script',
      mimeType: 'text/x-shellscript',
      text: content,
    };
  }

  public async getRoadmapValidatorResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const validatorEntry = manifest.agent_governance_files.find(
      (f) => f.path === '.agents/scripts/verify_roadmap_consistency.py'
    );
    let content = '';
    if (validatorEntry) {
      content = await this.fetcher.fetchFileContent(validatorEntry.path, validatorEntry.sha256);
    } else {
      content = '#!/usr/bin/env python3\n# Validador de consistencia ROADMAP y ACTIVE_TASK\n';
    }
    return {
      uri: 'blueprint://core/roadmap-validator',
      mimeType: 'text/x-python',
      text: content,
    };
  }
}
