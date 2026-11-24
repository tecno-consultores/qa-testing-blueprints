// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import {
  assertSafeRelativePath,
  GitHubFetcher,
  isOwnObjectProperty,
} from '../services/github-fetcher.js';
import type { Manifest, ManifestFileEntry, ResourceLanguage, StackDefinition } from '../types.js';
import { getActiveResourceLang } from './resourceLang.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

const MIME_MARKDOWN = 'text/markdown';
const BASH_SHEBANG = '#!/usr/bin/env bash';
const PYTHON_SHEBANG = '#!/usr/bin/env python3';
const POSTGRES_ES_DOC_PATH = 'docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md';
const POSTGRES_EN_REF_SUFFIX = '08-postgres-rls-zero-downtime-migrations.md';

const SECURITY_DISA_ES_BANNER = [
  '# 22 Patrones de Seguridad DISA ASD STIG V6R5 & OWASP v4.2 — Guía Operativa ES',
  '',
  `> **Nota Bilingüe:** Las reglas normativas de \`02-security-disa-owasp-22.md\` se mantienen en inglés de alta densidad por eficiencia de tokens; consulta \`${POSTGRES_ES_DOC_PATH}\` para la guía detallada en español.`,
  '',
].join('\n');

const POSTGRES_RLS_ES_BANNER = [
  '# PostgreSQL 17 RLS Multi-Transacción (`after_begin`) y Auditoría WORM Determinista — Guía Operativa ES',
  '',
  `> **Nota Bilingüe:** Las referencias técnicas de \`${POSTGRES_EN_REF_SUFFIX}\` se mantienen en inglés por eficiencia de tokens; consulta \`${POSTGRES_ES_DOC_PATH}\` para el manual completo en español.`,
  '',
].join('\n');

const REFACTORING_UI_ES_BANNER = [
  '# Guía Refactoring UI (QA-11X) — Referencia Operativa ES',
  '',
  '> **Nota Bilingüe:** Las reglas normativas de `refactoring-ui` se mantienen en inglés de alta densidad por eficiencia de tokens; aplica estas pautas junto con contraste OKLCH WCAG 2.1 AA, `tabular-nums` y geometría Anti-JSDOM.',
  '',
].join('\n');

const ACTIVE_TASK_ES_BANNER = [
  '<!-- QA-11X Plantilla Canónica de Bitácora Activa (.agents/ACTIVE_TASK.md.example) — Guía ES -->',
  '> **Nota Operativa:** Bitácora determinista `<= 40` líneas proyectada por `checkpoint_ctl.py` / `session_flight_recorder` (`0600` `.agents/.cache/session_checkpoint.json`).',
  '',
].join('\n');

function injectScriptLanguageHeader(
  rawContent: string,
  defaultShebang: string,
  headerComment: string
): string {
  const normalized = rawContent.replace(/\r\n/g, '\n');
  if (normalized.startsWith('#!')) {
    const newlineIdx = normalized.indexOf('\n');
    if (newlineIdx === -1) {
      return `${normalized}\n${headerComment}\n`;
    }
    const shebangLine = normalized.slice(0, newlineIdx);
    const rest = normalized.slice(newlineIdx + 1);
    return `${shebangLine}\n${headerComment}\n${rest}`;
  }
  return `${defaultShebang}\n${headerComment}\n${normalized}`;
}

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
    const esSecRef =
      resolvedLang === 'es'
        ? manifest.agent_governance_files.find((f) =>
            f.path.endsWith('02-security-disa-owasp-22.es.md')
          )
        : undefined;
    const enSecRef = manifest.agent_governance_files.find((f) =>
      f.path.endsWith('02-security-disa-owasp-22.md')
    );
    let content = '';
    if (esSecRef) {
      content = await this.fetcher.fetchFileContent(esSecRef.path, esSecRef.sha256);
    } else if (enSecRef) {
      const enContent = await this.fetcher.fetchFileContent(enSecRef.path, enSecRef.sha256);
      content = resolvedLang === 'es' ? `${SECURITY_DISA_ES_BANNER}${enContent}` : enContent;
    } else {
      content =
        resolvedLang === 'es'
          ? `# 22 Patrones de Seguridad DISA ASD STIG V6R5 & OWASP v4.2\n\nConsulte ${POSTGRES_ES_DOC_PATH}`
          : '# 22 Security Patterns DISA ASD STIG V6R5 & OWASP v4.2\n\nSee docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md';
    }
    return {
      uri: 'blueprint://security/disa-owasp-22',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getPostgresRlsWormResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const effectiveLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const esDocRef =
      effectiveLang === 'es'
        ? manifest.agent_governance_files.find((f) => f.path === POSTGRES_ES_DOC_PATH) ??
          manifest.common_files.find((f) => f.path === POSTGRES_ES_DOC_PATH)
        : undefined;
    const enRlsRef = manifest.agent_governance_files.find((f) =>
      f.path.endsWith(POSTGRES_EN_REF_SUFFIX)
    );

    let content = '';
    if (esDocRef) {
      content = await this.fetcher.fetchFileContent(esDocRef.path, esDocRef.sha256);
    } else if (enRlsRef) {
      const enContent = await this.fetcher.fetchFileContent(enRlsRef.path, enRlsRef.sha256);
      content = effectiveLang === 'es' ? `${POSTGRES_RLS_ES_BANNER}${enContent}` : enContent;
    } else {
      content =
        effectiveLang === 'es'
          ? `# PostgreSQL 17 RLS Multi-Transacción (after_begin) y Cadena WORM Determinista (seq_num + pg_advisory_xact_lock)\n\nConsulte ${POSTGRES_ES_DOC_PATH} y .agents/skills/qa-11x-architect/references/${POSTGRES_EN_REF_SUFFIX}`
          : `# PostgreSQL 17 Multi-Transaction RLS (after_begin) & Deterministic WORM Hash-Chain (seq_num + pg_advisory_xact_lock)\n\nSee .agents/skills/qa-11x-architect/references/${POSTGRES_EN_REF_SUFFIX}`;
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
    readmeFile: ManifestFileEntry | undefined,
    effectiveLang: ResourceLanguage
  ): Promise<string> {
    if (readmeFile) {
      return this.fetcher.fetchFileContent(readmeFile.path, readmeFile.sha256);
    }
    if (stackDef.readme_sha256) {
      return this.fetcher.fetchFileContent(stackDef.readme, stackDef.readme_sha256);
    }
    const prefix = effectiveLang === 'es' ? 'Consulte' : 'See';
    return `# ${stackDef.description}\n\n${prefix} ${stackDef.readme}`;
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
      } catch (err) {
        // Fallback to primary English README when localized ES README fetch fails
        reportDebugCatchError('blueprintResources.getStackReadmeResource', err);
        content = await this.fetchPrimaryOrFallbackStackReadme(stackDef, readmeFile, effectiveLang);
      }
    } else {
      content = await this.fetchPrimaryOrFallbackStackReadme(stackDef, readmeFile, effectiveLang);
    }

    return {
      uri: `blueprint://${stack}/readme`,
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getRefactoringUiResource(
    topic: string,
    lang?: ResourceLanguage
  ): Promise<ResourceResponse> {
    const effectiveLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const cleanTopic = assertSafeRelativePath(topic.replace(/\.md$/, ''));
    if (cleanTopic.includes('/') || cleanTopic.includes('\\')) {
      throw new Error(
        `Tema de diseño '${topic}' inválido (no se permiten subdirectorios).`
      );
    }
    const targetPath =
      cleanTopic === 'skill'
        ? '.agents/skills/refactoring-ui/SKILL.md'
        : `.agents/skills/refactoring-ui/references/${cleanTopic}.md`;

    const fileEntry = manifest.agent_governance_files.find((f) => f.path === targetPath);
    if (!fileEntry) {
      throw new Error(
        `Tema de diseño '${topic}' no encontrado en refactoring-ui. Opciones: skill, hierarchy, layout, type, color, depth, images, polish, dark-mode, tailwind.`
      );
    }

    const rawContent = await this.fetcher.fetchFileContent(fileEntry.path, fileEntry.sha256);
    const content =
      effectiveLang === 'es' ? `${REFACTORING_UI_ES_BANNER}${rawContent}` : rawContent;
    return {
      uri: `blueprint://ui/refactoring-ui/${cleanTopic}`,
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getActiveTaskTemplateResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const effectiveLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const taskEntry = manifest.agent_governance_files.find(
      (f) => f.path === '.agents/ACTIVE_TASK.md.example'
    );
    let rawContent = '';
    if (taskEntry) {
      rawContent = await this.fetcher.fetchFileContent(taskEntry.path, taskEntry.sha256);
    } else {
      rawContent =
        effectiveLang === 'es'
          ? '# ACTIVE_TASK.md.example\n\nConsulte la plantilla en .agents/ACTIVE_TASK.md.example'
          : '# ACTIVE_TASK.md.example\n\nSee the template at .agents/ACTIVE_TASK.md.example';
    }
    const content =
      effectiveLang === 'es' ? `${ACTIVE_TASK_ES_BANNER}${rawContent}` : rawContent;
    return {
      uri: 'blueprint://core/active-task-template',
      mimeType: MIME_MARKDOWN,
      text: content,
    };
  }

  public async getCleanupScriptResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const effectiveLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const cleanEntry = manifest.common_files.find(
      (f) => f.path === 'scripts/limpieza.sh' || f.path === 'limpieza.sh'
    );
    const headerComment =
      '# QA-11X Script universal de limpieza sin root (limpieza.sh) — purga artefactos Docker y cachés efímeras.';
    const rawContent = cleanEntry
      ? await this.fetcher.fetchFileContent(cleanEntry.path, cleanEntry.sha256)
      : `${BASH_SHEBANG}\n`;
    return {
      uri: 'blueprint://core/cleanup-script',
      mimeType: 'text/x-shellscript',
      text:
        effectiveLang === 'es'
          ? injectScriptLanguageHeader(rawContent, BASH_SHEBANG, headerComment)
          : rawContent,
    };
  }

  public async getRoadmapValidatorResource(lang?: ResourceLanguage): Promise<ResourceResponse> {
    const effectiveLang = getActiveResourceLang(undefined, lang);
    const manifest = await this.fetcher.fetchManifest();
    const validatorEntry = manifest.agent_governance_files.find(
      (f) => f.path === '.agents/scripts/verify_roadmap_consistency.py'
    );
    const headerComment =
      '# QA-11X Validador bidireccional de consistencia (ROADMAP.md y ACTIVE_TASK.md).';
    const rawContent = validatorEntry
      ? await this.fetcher.fetchFileContent(validatorEntry.path, validatorEntry.sha256)
      : `${PYTHON_SHEBANG}\n`;
    return {
      uri: 'blueprint://core/roadmap-validator',
      mimeType: 'text/x-python',
      text:
        effectiveLang === 'es'
          ? injectScriptLanguageHeader(rawContent, PYTHON_SHEBANG, headerComment)
          : rawContent,
    };
  }
}
