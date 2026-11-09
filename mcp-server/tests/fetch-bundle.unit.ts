// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { fetchBlueprintBundle } from '../src/tools/fetch-bundle.js';
import { Manifest } from '../src/types.js';

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
    fs.mkdirSync(path.join(localRepoDir, 'python'), { recursive: true });
    fs.writeFileSync(path.join(localRepoDir, 'python', 'Makefile.example'), makefileContent, 'utf-8');
    fs.writeFileSync(path.join(localRepoDir, '.trivy.yaml'), trivyContent, 'utf-8');

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
});
