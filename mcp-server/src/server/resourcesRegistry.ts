// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  AI_EVALS_REDTEAM_RESOURCE,
  type BlueprintFetcherPathHints,
  readAiEvalsBlueprint,
} from '../resources/aiEvalsBlueprint.js';
import type { BlueprintResources } from '../resources/blueprint-resources.js';
import { getActiveResourceLang } from '../resources/resourceLang.js';
import {
  MOBILE_APPIUM_RESOURCE,
  VIBE_RESCUE_RESOURCE,
  readMobileAppiumBlueprint,
  readVibeRescueBlueprint,
} from '../resources/stackBlueprints.js';
import {
  TACTICAL_PATTERNS_SKILL_RESOURCE,
  readTacticalPatternsSkillResource,
} from '../resources/tacticalPatternsSkill.js';
import type { GitHubFetcher } from '../services/github-fetcher.js';
import type { ResourceLanguage } from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { toSingleResourceResult } from './toolResults.js';

const MARKDOWN_MIME_TYPE = 'text/markdown' as const;

export const REGISTERED_RESOURCE_URIS = [
  'blueprint://manifest',
  'blueprint://core/philosophy',
  'blueprint://security/disa-owasp-22',
  'blueprint://database/postgres-rls-worm',
  'blueprint://{stack}/readme',
  'blueprint://ui/refactoring-ui/{topic}',
  'blueprint://core/active-task-template',
  'blueprint://core/cleanup-script',
  'blueprint://core/roadmap-validator',
  AI_EVALS_REDTEAM_RESOURCE.uri,
  MOBILE_APPIUM_RESOURCE.uri,
  VIBE_RESCUE_RESOURCE.uri,
  TACTICAL_PATTERNS_SKILL_RESOURCE.uri,
] as const;

export function registerCoreResources(server: McpServer, resources: BlueprintResources): void {
  server.registerResource(
    'blueprint-manifest',
    'blueprint://manifest',
    {
      description: 'JSON cryptographic manifest with SHA-256 hashes of all stacks and files.',
      mimeType: 'application/json',
    },
    async (uri) => toSingleResourceResult(uri, await resources.getManifestResource())
  );

  server.registerResource(
    'blueprint-philosophy',
    'blueprint://core/philosophy',
    {
      description: 'Level-11X quality philosophy, 13 pyramid layers, and Rule Zero.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(uri, await resources.getPhilosophyResource(getActiveResourceLang(uri)))
  );

  server.registerResource(
    'blueprint-security',
    'blueprint://security/disa-owasp-22',
    {
      description:
        'Catalog of 22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls + 36 static scanner rules.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(uri, await resources.getSecurityResource(getActiveResourceLang(uri)))
  );

  server.registerResource(
    'blueprint-postgres-rls-worm',
    'blueprint://database/postgres-rls-worm',
    {
      description:
        'Guide and reference implementation for PostgreSQL 17 Multi-Transaction RLS (after_begin) and deterministic WORM audit serialization (seq_num BIGINT + pg_advisory_xact_lock).',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getPostgresRlsWormResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-stack-readme',
    new ResourceTemplate('blueprint://{stack}/readme', { list: undefined }),
    {
      description: 'Operational testing and QA guide for the requested stack.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri, variables) =>
      toSingleResourceResult(
        uri,
        await resources.getStackReadmeResource(
          String(variables.stack ?? ''),
          getActiveResourceLang(uri)
        )
      )
  );

  server.registerResource(
    'blueprint-refactoring-ui',
    new ResourceTemplate('blueprint://ui/refactoring-ui/{topic}', { list: undefined }),
    {
      description: 'Tactical UI design and WCAG 2.1 AA accessibility rules from Refactoring UI.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri, variables) =>
      toSingleResourceResult(
        uri,
        await resources.getRefactoringUiResource(
          String(variables.topic ?? ''),
          getActiveResourceLang(uri)
        )
      )
  );

  server.registerResource(
    'blueprint-active-task-template',
    'blueprint://core/active-task-template',
    {
      description:
        'Canonical active task diary template (.agents/ACTIVE_TASK.md.example) for session crash resilience.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getActiveTaskTemplateResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-cleanup-script',
    'blueprint://core/cleanup-script',
    {
      description:
        'Canonical cleanup script (limpieza.sh) with Alpine fallback to safely purge Docker root artifacts without sudo.',
      mimeType: 'text/x-shellscript',
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getCleanupScriptResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-roadmap-validator',
    'blueprint://core/roadmap-validator',
    {
      description:
        'Canonical roadmap consistency validator (.agents/scripts/verify_roadmap_consistency.py) auditing ROADMAP.md and ACTIVE_TASK.md.',
      mimeType: 'text/x-python',
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getRoadmapValidatorResource(getActiveResourceLang(uri))
      )
  );
}

async function readRemoteOrEmbeddedStackBlueprint(
  resources: BlueprintResources,
  stackId: 'mobile-appium' | 'vibe-rescue',
  lang: ResourceLanguage,
  embeddedFallback: () => { readonly mimeType: string; readonly text: string }
): Promise<{ readonly mimeType: string; readonly text: string }> {
  try {
    return await resources.getStackReadmeResource(stackId, lang);
  } catch (err: unknown) {
    // Offline/network/SHA failure falls back cleanly to embedded blueprint outside the monorepo
    reportDebugCatchError(`server.readRemoteOrEmbeddedStackBlueprint(${stackId})`, err);
    return embeddedFallback();
  }
}

export function registerExtensionResources(
  server: McpServer,
  resources: BlueprintResources,
  fetcher: GitHubFetcher
): void {
  const getHints = (): BlueprintFetcherPathHints => ({
    localOverridePath: fetcher.getLocalOverridePath(),
    cacheDir: fetcher.getCacheDir(),
  });

  server.registerResource(
    AI_EVALS_REDTEAM_RESOURCE.name,
    AI_EVALS_REDTEAM_RESOURCE.uri,
    {
      description: AI_EVALS_REDTEAM_RESOURCE.description,
      mimeType: AI_EVALS_REDTEAM_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(
        uri,
        readAiEvalsBlueprint(undefined, getActiveResourceLang(uri), getHints())
      )
  );

  server.registerResource(
    MOBILE_APPIUM_RESOURCE.name,
    MOBILE_APPIUM_RESOURCE.uri,
    {
      description: MOBILE_APPIUM_RESOURCE.description,
      mimeType: MOBILE_APPIUM_RESOURCE.mimeType,
    },
    async (uri) => {
      const lang = getActiveResourceLang(uri);
      return toSingleResourceResult(
        uri,
        await readRemoteOrEmbeddedStackBlueprint(resources, 'mobile-appium', lang, () =>
          readMobileAppiumBlueprint(undefined, lang)
        )
      );
    }
  );

  server.registerResource(
    VIBE_RESCUE_RESOURCE.name,
    VIBE_RESCUE_RESOURCE.uri,
    {
      description: VIBE_RESCUE_RESOURCE.description,
      mimeType: VIBE_RESCUE_RESOURCE.mimeType,
    },
    async (uri) => {
      const lang = getActiveResourceLang(uri);
      return toSingleResourceResult(
        uri,
        await readRemoteOrEmbeddedStackBlueprint(resources, 'vibe-rescue', lang, () =>
          readVibeRescueBlueprint(undefined, lang)
        )
      );
    }
  );

  server.registerResource(
    TACTICAL_PATTERNS_SKILL_RESOURCE.name,
    TACTICAL_PATTERNS_SKILL_RESOURCE.uri,
    {
      description: TACTICAL_PATTERNS_SKILL_RESOURCE.description,
      mimeType: TACTICAL_PATTERNS_SKILL_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(
        uri,
        readTacticalPatternsSkillResource(undefined, getActiveResourceLang(uri), getHints())
      )
  );
}
