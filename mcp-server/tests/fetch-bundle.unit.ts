// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { fetchBlueprintBundle } from '../src/tools/fetch-bundle.js';
import {
  BootstrapMergeInputSchema,
  FetchBundleInputSchema,
  Manifest,
  StackNameSchema,
} from '../src/types.js';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

describe('fetchBlueprintBundle Dedicated Unit Suite', () => {
  let tmpDir: string;
  let localRepoDir: string;
  let fetcher: GitHubFetcher;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-fetch-bundle-'));
    localRepoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(localRepoDir, { recursive: true });

    const makefileContent = '# SPDX-License-Identifier: MIT\nqa-all:\n\t@echo ok\n';
    const trivyContent = 'severity:\n  - HIGH\n  - CRITICAL\n';
    const promptfooContent = 'description: "AI Evals"\nproviders: []\n';
    const wdioContent = 'export const config = { runner: "local" };\n';
    const vibeAuditContent = '#!/usr/bin/env python3\nprint("vibe")\n';

    const manifest: Manifest = {
      schema_version: '2.12.0',
      blueprint_version: '2.12.0',
      generated_at_utc: '2026-11-09T00:00:00Z',
      repository: 'tecno-consultores/qa-testing-blueprints',
      default_branch: 'main',
      raw_base_url: 'https://example.com',
      stacks: {
        python: {
          description: 'Python QA Stack',
          readme: 'python/README.md',
          files: [
            {
              path: 'python/Makefile.example',
              target_name: 'Makefile',
              merge_strategy: 'append_makefile_targets',
              sha256: sha256(makefileContent),
              size_bytes: makefileContent.length,
            },
          ],
        },
        'ai-evals': {
          description: 'AI Evals QA Stack',
          readme: 'ai-evals/README.md',
          files: [
            {
              path: 'ai-evals/promptfooconfig.yaml',
              target_name: 'ai-evals/promptfooconfig.yaml',
              merge_strategy: 'copy_if_missing',
              sha256: sha256(promptfooContent),
              size_bytes: promptfooContent.length,
            },
          ],
        },
        'mobile-appium': {
          description: 'Mobile Appium QA Stack',
          readme: 'mobile-appium/README.md',
          files: [
            {
              path: 'mobile-appium/wdio.conf.ts',
              target_name: 'wdio.conf.ts',
              merge_strategy: 'copy_if_missing',
              sha256: sha256(wdioContent),
              size_bytes: wdioContent.length,
            },
          ],
        },
        'vibe-rescue': {
          description: 'Vibe Rescue QA Stack',
          readme: 'vibe-rescue/README.md',
          files: [
            {
              path: 'vibe-rescue/audit_vibe_prototype.py',
              target_name: 'vibe-rescue/audit_vibe_prototype.py',
              merge_strategy: 'copy_or_overwrite',
              sha256: sha256(vibeAuditContent),
              size_bytes: vibeAuditContent.length,
            },
          ],
        },
      },
      common_files: [
        {
          path: '.trivy.yaml',
          target_name: '.trivy.yaml',
          merge_strategy: 'create_if_missing',
          sha256: sha256(trivyContent),
          size_bytes: trivyContent.length,
        },
      ],
      agent_governance_files: [],
    };

    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
    for (const [relPath, fileContent] of [
      ['python/Makefile.example', makefileContent],
      ['ai-evals/promptfooconfig.yaml', promptfooContent],
      ['mobile-appium/wdio.conf.ts', wdioContent],
      ['vibe-rescue/audit_vibe_prototype.py', vibeAuditContent],
      ['.trivy.yaml', trivyContent],
    ]) {
      const fullPath = path.join(localRepoDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fileContent, 'utf-8');
    }

    fetcher = new GitHubFetcher({
      cacheDir: path.join(tmpDir, 'cache'),
      localOverridePath: localRepoDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults to metadata-only mode (includeContent = false) and includes common files', async () => {
    const res = await fetchBlueprintBundle('python', true, fetcher);
    expect(res.stack).toBe('python');
    expect(res.total_files).toBe(2);
    expect(res.content_omitted_for_token_economy).toBe(true);
    expect(res.files.every((f) => f.content === '')).toBe(true);
    expect(res.files.every((f) => (f.size_bytes ?? 0) > 0)).toBe(true);
  });

  it('excludes common and governance files when includeCommonAndAgents is false and returns full content when requested', async () => {
    const res = await fetchBlueprintBundle('python', false, fetcher, true);
    expect(res.stack).toBe('python');
    expect(res.total_files).toBe(1);
    expect(res.content_omitted_for_token_economy).toBeUndefined();
    expect(res.files[0].path).toBe('python/Makefile.example');
    expect(res.files[0].content).toContain('qa-all:');
  });

  it('hydrates ai-evals, mobile-appium, and vibe-rescue bundles with SHA-256 verification', async () => {
    const aiRes = await fetchBlueprintBundle('ai-evals', true, fetcher, true);
    expect(aiRes.stack).toBe('ai-evals');
    expect(aiRes.total_files).toBe(2);
    expect(aiRes.files[0].path).toBe('ai-evals/promptfooconfig.yaml');
    expect(aiRes.files[0].sha256_verified).toBe(true);
    expect(aiRes.files[0].content).toContain('AI Evals');

    const mobileRes = await fetchBlueprintBundle('mobile-appium', false, fetcher, true);
    expect(mobileRes.stack).toBe('mobile-appium');
    expect(mobileRes.total_files).toBe(1);
    expect(mobileRes.files[0].target_name).toBe('wdio.conf.ts');
    expect(mobileRes.files[0].content).toContain('runner: "local"');

    const vibeCompact = await fetchBlueprintBundle('vibe-rescue', true, fetcher, false);
    expect(vibeCompact.stack).toBe('vibe-rescue');
    expect(vibeCompact.total_files).toBe(2);
    expect(vibeCompact.content_omitted_for_token_economy).toBe(true);
    expect(vibeCompact.files[0].content).toBe('');
    expect(vibeCompact.files[0].sha256_verified).toBe(true);
  });

  it('accepts all 10 stacks in StackNameSchema, FetchBundleInputSchema, and BootstrapMergeInputSchema', () => {
    const expectedStacks = [
      'python',
      'fastapi',
      'node-backend',
      'vue3',
      'react-frontend',
      'bash-scripts',
      'php',
      'mobile-appium',
      'ai-evals',
      'vibe-rescue',
    ];
    expect(StackNameSchema.options).toHaveLength(10);
    expect(StackNameSchema.options).toEqual(expectedStacks);
    for (const stack of expectedStacks) {
      expect(FetchBundleInputSchema.parse({ stack }).stack).toBe(stack);
      expect(BootstrapMergeInputSchema.parse({ project_path: '.', stack }).stack).toBe(stack);
    }
    expect(FetchBundleInputSchema.safeParse({ stack: 'unknown-stack' }).success).toBe(false);
  });
});
