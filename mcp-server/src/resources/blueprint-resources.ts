// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { GitHubFetcher } from '../services/github-fetcher.js';

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
      text: JSON.stringify(manifest, null, 2),
    };
  }

  public async getPhilosophyResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const promptEntry = manifest.agent_governance_files.find((f) => f.path === 'AI_MASTER_PROMPT.md');
    let content = '';
    if (promptEntry) {
      content = await this.fetcher.fetchFileContent(promptEntry.path, promptEntry.sha256);
    } else {
      content = '# Filosofía QA 11X\n\nEstándar corporativo de calidad, 13 capas y Rule Zero.';
    }
    return {
      uri: 'blueprint://core/philosophy',
      mimeType: 'text/markdown',
      text: content,
    };
  }

  public async getSecurityResource(): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const secRef = manifest.agent_governance_files.find((f) =>
      f.path.endsWith('02-security-disa-owasp-22.md')
    );
    let content = '';
    if (secRef) {
      content = await this.fetcher.fetchFileContent(secRef.path, secRef.sha256);
    } else {
      content = '# 22 Patrones de Seguridad DISA ASD STIG V6R5 & OWASP v4.2\n\nConsulte docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md';
    }
    return {
      uri: 'blueprint://security/disa-owasp-22',
      mimeType: 'text/markdown',
      text: content,
    };
  }

  public async getStackReadmeResource(stack: string): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const stackDef = manifest.stacks[stack];
    if (!stackDef) {
      throw new Error(`Stack '${stack}' no reconocido. Opciones válidas: ${Object.keys(manifest.stacks).join(', ')}`);
    }

    // El readme suele ser <stack>/README.md
    const readmeFile = manifest.agent_governance_files.find(f => f.path === stackDef.readme) ||
      stackDef.files.find(f => f.path === stackDef.readme);

    let content = '';
    if (readmeFile) {
      content = await this.fetcher.fetchFileContent(readmeFile.path, readmeFile.sha256);
    } else {
      content = `# ${stackDef.description}\n\nConsulte ${stackDef.readme}`;
    }

    return {
      uri: `blueprint://${stack}/readme`,
      mimeType: 'text/markdown',
      text: content,
    };
  }

  public async getRefactoringUiResource(topic: string): Promise<ResourceResponse> {
    const manifest = await this.fetcher.fetchManifest();
    const cleanTopic = topic.replace(/\.md$/, '');
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
      mimeType: 'text/markdown',
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
      mimeType: 'text/markdown',
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
}
