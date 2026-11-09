// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertSafeRelativePath,
  GitHubFetcher,
  isOwnObjectProperty,
  resolveSafeChildPath,
} from '../src/services/github-fetcher.js';
import { Manifest } from '../src/types.js';

describe('GitHubFetcher Service (DISA STIG V-222513 & Zero-Clone Hydration)', () => {
  let tmpDir: string;
  let cacheDir: string;
  let localRepoDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fetcher-test-'));
    cacheDir = path.join(tmpDir, 'cache');
    localRepoDir = path.join(tmpDir, 'local-repo');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(localRepoDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('computes correct SHA-256 for strings and buffers', () => {
    const fetcher = new GitHubFetcher({ cacheDir });
    const text = 'hello world';
    const expected = crypto.createHash('sha256').update(text).digest('hex');
    expect(fetcher.computeSha256(text)).toBe(expected);
    expect(fetcher.getCacheDir()).toBe(cacheDir);
  });

  it('fetches manifest from local override path if provided', async () => {
    const mockManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'tecno-consultores/qa-testing-blueprints',
      default_branch: 'main',
      raw_base_url: 'https://raw.githubusercontent.com/test',
      stacks: {
        python: {
          description: 'Python stack',
          readme: 'python/README.md',
          files: [],
        },
      },
      common_files: [],
      agent_governance_files: [],
    };

    fs.writeFileSync(
      path.join(localRepoDir, 'manifest.json'),
      JSON.stringify(mockManifest),
      'utf-8'
    );

    const fetcher = new GitHubFetcher({
      cacheDir,
      localOverridePath: localRepoDir,
    });

    const manifest = await fetcher.fetchManifest();
    expect(manifest.blueprint_version).toBe('2.7.0');
    expect(manifest.stacks.python).toBeDefined();
  });

  it('fetches manifest via HTTP and stores in cache with ETag', async () => {
    const mockManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'tecno-consultores/qa-testing-blueprints',
      default_branch: 'main',
      raw_base_url: 'https://raw.githubusercontent.com/test',
      stacks: {},
      common_files: [],
      agent_governance_files: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"etag-12345"' }),
      text: async () => JSON.stringify(mockManifest),
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetcher = new GitHubFetcher({ cacheDir });
    const manifest = await fetcher.fetchManifest();

    expect(manifest.blueprint_version).toBe('2.7.0');
    expect(fs.existsSync(path.join(cacheDir, 'manifest.json'))).toBe(true);
    expect(fs.readFileSync(path.join(cacheDir, 'manifest.etag'), 'utf-8')).toBe('"etag-12345"');
  });

  it('handles 304 Not Modified by returning cached manifest', async () => {
    const cachedManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.6.9',
      generated_at_utc: '2026-11-01T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {},
      common_files: [],
      agent_governance_files: [],
    };
    fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(cachedManifest), 'utf-8');
    fs.writeFileSync(path.join(cacheDir, 'manifest.etag'), '"etag-cached"', 'utf-8');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 304,
      statusText: 'Not Modified',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetcher = new GitHubFetcher({ cacheDir });
    const manifest = await fetcher.fetchManifest();

    expect(manifest.blueprint_version).toBe('2.6.9');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/manifest.json'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"etag-cached"' }),
      })
    );
  });

  it('falls back to cached manifest when network request fails', async () => {
    const cachedManifest = { blueprint_version: '2.5.0', stacks: {} };
    fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(cachedManifest), 'utf-8');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const fetcher = new GitHubFetcher({ cacheDir });
    const manifest = await fetcher.fetchManifest();
    expect(manifest.blueprint_version).toBe('2.5.0');
  });

  it('throws descriptive error if network fails and no cache exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS Failure')));

    const fetcher = new GitHubFetcher({ cacheDir });
    await expect(fetcher.fetchManifest()).rejects.toThrow('Fallo al obtener manifest.json');
  });

  it('fetches file content from local override with valid SHA-256', async () => {
    const fileRel = 'python/Makefile.example';
    const content = 'qa-all:\n\techo "ok"\n';
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const localFilePath = path.join(localRepoDir, fileRel);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, content, 'utf-8');

    const fetcher = new GitHubFetcher({
      cacheDir,
      localOverridePath: localRepoDir,
    });

    const result = await fetcher.fetchFileContent(fileRel, hash);
    expect(result).toBe(content);
  });

  it('throws cryptographic violation if local file hash mismatches expected hash', async () => {
    const fileRel = 'tampered.sh';
    const content = 'echo "malicious"';
    const badHash = '0000000000000000000000000000000000000000000000000000000000000000';

    const localFilePath = path.join(localRepoDir, fileRel);
    fs.writeFileSync(localFilePath, content, 'utf-8');

    const fetcher = new GitHubFetcher({
      cacheDir,
      localOverridePath: localRepoDir,
    });

    await expect(fetcher.fetchFileContent(fileRel, badHash)).rejects.toThrow(
      'Violación de integridad criptográfica (DISA ASD STIG V6R5 V-222513)'
    );
  });

  it('fetches file from remote GitHub Raw and verifies hash', async () => {
    const content = 'target-remote content';
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => content,
      })
    );

    const fetcher = new GitHubFetcher({ cacheDir });
    const result = await fetcher.fetchFileContent('remote/file.txt', hash);
    expect(result).toBe(content);

    // Debe haberse guardado en caché
    expect(fs.readFileSync(path.join(cacheDir, 'files', 'remote/file.txt'), 'utf-8')).toBe(content);
  });

  it('throws error when remote fetch returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
    );

    const fetcher = new GitHubFetcher({ cacheDir });
    await expect(fetcher.fetchFileContent('missing.txt', 'dummyhash')).rejects.toThrow(
      'HTTP 404 al descargar missing.txt'
    );
  });

  it('throws cryptographic violation when remote file hash does not match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'corrupted remote content',
      })
    );

    const fetcher = new GitHubFetcher({ cacheDir });
    await expect(
      fetcher.fetchFileContent('corrupted.txt', '0000000000000000000000000000000000000000000000000000000000000000')
    ).rejects.toThrow('Violación de integridad criptográfica');
  });

  it('falls back to valid cached file when remote fetch throws network error', async () => {
    const cachedContent = 'valid cached content';
    const hash = crypto.createHash('sha256').update(cachedContent).digest('hex');

    const cachedFilePath = path.join(cacheDir, 'files', 'fallback.txt');
    fs.mkdirSync(path.dirname(cachedFilePath), { recursive: true });
    fs.writeFileSync(cachedFilePath, cachedContent, 'utf-8');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Down')));

    const fetcher = new GitHubFetcher({ cacheDir });
    const res = await fetcher.fetchFileContent('fallback.txt', hash);
    expect(res).toBe(cachedContent);
  });

  it('re-throws error if remote fetch fails and cached file hash does not match', async () => {
    const cachedContent = 'stale content';
    const expectedHash = 'some-other-hash';

    const cachedFilePath = path.join(cacheDir, 'files', 'bad-cache.txt');
    fs.mkdirSync(path.dirname(cachedFilePath), { recursive: true });
    fs.writeFileSync(cachedFilePath, cachedContent, 'utf-8');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Down')));

    const fetcher = new GitHubFetcher({ cacheDir });
    await expect(fetcher.fetchFileContent('bad-cache.txt', expectedHash)).rejects.toThrow(
      'Network Down'
    );
  });

  it('fetches stack bundle and includes common and agent files', async () => {
    const file1Content = 'file1 content';
    const file1Hash = crypto.createHash('sha256').update(file1Content).digest('hex');

    const commonContent = 'common content';
    const commonHash = crypto.createHash('sha256').update(commonContent).digest('hex');

    const mockManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {
        fastapi: {
          description: 'FastAPI Backend',
          readme: 'fastapi/README.md',
          files: [
            {
              path: 'fastapi/Makefile.example',
              target_name: 'Makefile',
              merge_strategy: 'surgical_merge',
              sha256: file1Hash,
              size_bytes: file1Content.length,
            },
          ],
        },
      },
      common_files: [
        {
          path: 'lefthook.yml',
          target_name: 'lefthook.yml',
          merge_strategy: 'surgical_merge',
          sha256: commonHash,
          size_bytes: commonContent.length,
        },
      ],
      agent_governance_files: [],
    };

    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(mockManifest), 'utf-8');

    // Escribir los archivos en localRepoDir
    fs.mkdirSync(path.join(localRepoDir, 'fastapi'), { recursive: true });
    fs.writeFileSync(path.join(localRepoDir, 'fastapi/Makefile.example'), file1Content, 'utf-8');
    fs.writeFileSync(path.join(localRepoDir, 'lefthook.yml'), commonContent, 'utf-8');

    const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localRepoDir });
    const bundle = await fetcher.fetchStackBundle('fastapi', true);

    expect(bundle).toHaveLength(2);
    expect(bundle[0].target_name).toBe('Makefile');
    expect(bundle[0].content).toBe(file1Content);
    expect(bundle[1].target_name).toBe('lefthook.yml');
    expect(bundle[1].content).toBe(commonContent);
  });

  it('throws error if stack does not exist in manifest', async () => {
    const mockManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {},
      common_files: [],
      agent_governance_files: [],
    };
    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(mockManifest), 'utf-8');

    const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localRepoDir });
    await expect(fetcher.fetchStackBundle('unknown-stack')).rejects.toThrow(
      "El stack solicitado 'unknown-stack' no existe"
    );
  });

  it('initializes with default cacheDir and environment fallbacks when options are omitted', () => {
    const originalEnv = process.env.QA_BLUEPRINTS_CACHE_DIR;
    delete process.env.QA_BLUEPRINTS_CACHE_DIR;
    try {
      const fetcher = new GitHubFetcher();
      expect(fetcher.getCacheDir()).toContain('.cache');
      expect(fetcher.getCacheDir()).toContain('qa-11x-blueprints');
    } finally {
      if (originalEnv !== undefined) {
        process.env.QA_BLUEPRINTS_CACHE_DIR = originalEnv;
      }
    }
  });

  it('throws descriptive error on HTTP 500 when downloading manifest without local cache', async () => {
    const fetcher = new GitHubFetcher({
      cacheDir,
      rawBaseUrl: 'https://raw.test',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      text: async () => 'Server error',
    } as unknown as Response);

    await expect(fetcher.fetchManifest()).rejects.toThrow(
      'Fallo al obtener manifest.json y no existe copia en caché local: HTTP 500 al descargar manifest.json: Internal Server Error'
    );
  });

  it('returns cached content when network fetch throws but cached file matches expected SHA-256', async () => {
    const fetcher = new GitHubFetcher({
      cacheDir,
      rawBaseUrl: 'https://raw.test',
    });

    const relPath = 'fastapi/Makefile.example';
    const content = 'cached: content\n';
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Pre-poblar caché con contenido correcto
    const cachedFilePath = path.join(cacheDir, 'files', relPath);
    fs.mkdirSync(path.dirname(cachedFilePath), { recursive: true });
    fs.writeFileSync(cachedFilePath, content, 'utf-8');

    // Simular fallo catastrófico de red
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    const result = await fetcher.fetchFileContent(relPath, hash);
    expect(result).toBe(content);
  });

  it('retries without If-None-Match when server returns 304 but cached manifest is missing', async () => {
    fs.writeFileSync(path.join(cacheDir, 'manifest.etag'), '"etag-orphan"', 'utf-8');
    const freshManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.12.0',
      generated_at_utc: '2026-11-09T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {},
      common_files: [],
      agent_governance_files: [],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 304,
        statusText: 'Not Modified',
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ etag: '"etag-fresh"' }),
        text: async () => JSON.stringify(freshManifest),
      });
    vi.stubGlobal('fetch', fetchMock);

    const fetcher = new GitHubFetcher({ cacheDir });
    const manifest = await fetcher.fetchManifest();
    expect(manifest.blueprint_version).toBe('2.12.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blocks CWE-22 path traversal and prototype pollution in fetcher helpers', async () => {
    expect(() => assertSafeRelativePath('../etc/passwd')).toThrow('CWE-22');
    expect(() => assertSafeRelativePath('/etc/passwd')).toThrow('CWE-22');
    expect(() => assertSafeRelativePath('__proto__/pollute')).toThrow('CWE-22');
    expect(() => assertSafeRelativePath('')).toThrow('CWE-22');
    expect(() => resolveSafeChildPath(tmpDir, '../escape')).toThrow('CWE-22');
    expect(isOwnObjectProperty({ python: 1 }, '__proto__')).toBe(false);
    expect(isOwnObjectProperty({ python: 1 }, 'python')).toBe(true);

    const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localRepoDir });
    await expect(fetcher.fetchFileContent('../secret.txt', 'hash')).rejects.toThrow('CWE-22');
  });
});
