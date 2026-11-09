// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { bootstrapOrMerge11x } from '../src/tools/bootstrap-merge.js';
import { Manifest } from '../src/types.js';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

describe('bootstrapOrMerge11x Dedicated Unit Suite', () => {
  let tmpDir: string;
  let localRepoDir: string;
  let projectDir: string;
  let fetcher: GitHubFetcher;
  let merger: SurgicalMerger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-bootstrap-merge-'));
    localRepoDir = path.join(tmpDir, 'repo');
    projectDir = path.join(tmpDir, 'target-project');
    fs.mkdirSync(localRepoDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    const makefileContent = '# SPDX-License-Identifier: MIT\nqa-lint:\n\t@echo lint\n';

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
      common_files: [],
      agent_governance_files: [],
    };

    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
    fs.mkdirSync(path.join(localRepoDir, 'python'), { recursive: true });
    fs.writeFileSync(path.join(localRepoDir, 'python', 'Makefile.example'), makefileContent, 'utf-8');

    fetcher = new GitHubFetcher({
      cacheDir: path.join(tmpDir, 'cache'),
      localOverridePath: localRepoDir,
    });
    merger = new SurgicalMerger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('supports dryRun mode without writing files to disk', async () => {
    const res = await bootstrapOrMerge11x(projectDir, 'python', true, fetcher, merger);
    expect(res.dry_run).toBe(true);
    expect(res.stack).toBe('python');
    expect(res.summary.created).toBe(1);
    expect(fs.existsSync(path.join(projectDir, 'Makefile'))).toBe(false);
  });

  it('writes merged files to disk when dryRun is false', async () => {
    const res = await bootstrapOrMerge11x(projectDir, 'python', false, fetcher, merger);
    expect(res.dry_run).toBe(false);
    expect(res.summary.created).toBe(1);
    expect(fs.existsSync(path.join(projectDir, 'Makefile'))).toBe(true);
  });
});
