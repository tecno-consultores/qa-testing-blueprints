// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertSafeRelativePath,
  extractStandardEdition,
  GitHubFetcher,
  isOwnObjectProperty,
  MCP_STANDARD_EDITION,
  resolveSafeChildPath,
  resolveSafeDefaultAnchor,
  resolveSafeHomeDir,
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
    vi.unstubAllGlobals();
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
      text: () => Promise.resolve(JSON.stringify(mockManifest)),
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

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 304,
      statusText: 'Not Modified',
      headers: new Headers(),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const fetcher = new GitHubFetcher({ cacheDir });
    const manifest = await fetcher.fetchManifest();

    expect(manifest.blueprint_version).toBe('2.6.9');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestInput = firstCall?.[0];
    if (typeof requestInput !== 'string') {
      throw new Error('Expected fetch to be called with a string URL');
    }
    expect(requestInput).toContain('/manifest.json');
    expect((firstCall?.[1]?.headers as Record<string, string> | undefined)?.['If-None-Match']).toBe(
      '"etag-cached"'
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
        text: () => Promise.resolve(content),
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
        text: () => Promise.resolve('corrupted remote content'),
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
    const fullBundle = await fetcher.fetchStackBundle('fastapi', true, false);
    expect(fullBundle).toHaveLength(2);

    expect(bundle).toHaveLength(2);
    expect(bundle[0]?.target_name).toBe('Makefile');
    expect(bundle[0]?.content).toBe(file1Content);
    expect(bundle[1]?.target_name).toBe('lefthook.yml');
    expect(bundle[1]?.content).toBe(commonContent);
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
      text: () => Promise.resolve('Server error'),
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
        text: () => Promise.resolve(JSON.stringify(freshManifest)),
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

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-gf-out-'));
    try {
      const danglingEscape = path.join(localRepoDir, 'dangling-escape');
      fs.symlinkSync(path.join(outsideDir, 'missing-target'), danglingEscape);
      expect(() => resolveSafeChildPath(localRepoDir, 'dangling-escape/file.txt')).toThrow('CWE-22');

      const loopA = path.join(localRepoDir, 'loopA');
      const loopB = path.join(localRepoDir, 'loopB');
      fs.symlinkSync(loopB, loopA);
      fs.symlinkSync(loopA, loopB);
      expect(() => resolveSafeChildPath(localRepoDir, 'loopA')).toThrow('Ciclo de enlaces simbólicos');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('logs sanitized debug trace when QA11X_DEBUG=1 and homedir fails', () => {
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    const prevDebug = process.env.QA11X_DEBUG;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      process.env.QA11X_DEBUG = '1';

      expect(
        resolveSafeHomeDir(undefined, () => {
          throw new Error('passwd entry missing');
        })
      ).toBe(os.tmpdir());
      expect(
        resolveSafeHomeDir(undefined, () => {
          throw 'non-error-homedir' as unknown as Error;
        })
      ).toBe(os.tmpdir());
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('passwd entry missing'));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('homedir error'));
    } finally {
      stderrSpy.mockRestore();
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
      if (prevDebug === undefined) delete process.env.QA11X_DEBUG;
      else process.env.QA11X_DEBUG = prevDebug;
    }
  });

  it('extracts standard edition from package description with safe fallback', () => {
    expect(MCP_STANDARD_EDITION).toBe('QA-11X v3.7');
    expect(extractStandardEdition('Official MCP Server (QA-11X v3.9: 19 Tools)')).toBe('QA-11X v3.9');
    expect(extractStandardEdition('Description without edition tag')).toBe('QA-11X v3.7');
    expect(extractStandardEdition()).toBe('QA-11X v3.7');
  });

  it('trims trailing slashes in rawBaseUrl, encodes path segments, and recovers cleanly from corrupt cached manifest.json', async () => {
    const cleanUrlFetcher = new GitHubFetcher({
      cacheDir,
      rawBaseUrl: 'https://raw.example.test/org/repo',
    });
    const cleanFetchSpy = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', cleanFetchSpy);
    expect(await cleanUrlFetcher.fetchFileContent('plain.txt', cleanUrlFetcher.computeSha256('ok'))).toBe('ok');

    const fetcher = new GitHubFetcher({
      cacheDir,
      rawBaseUrl: 'https://raw.example.test/org/repo///',
    });
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('file-body', { status: 200 })
      );
    vi.stubGlobal('fetch', fetchSpy);

    const expectedHash = fetcher.computeSha256('file-body');
    const fetched = await fetcher.fetchFileContent('dir name/file+1.txt', expectedHash);
    expect(fetched).toBe('file-body');
    const firstUrlArg = fetchSpy.mock.calls[0]?.[0];
    expect(typeof firstUrlArg === 'string' ? firstUrlArg : '').toBe(
      'https://raw.example.test/org/repo/dir%20name/file%2B1.txt'
    );

    const prevDebug = process.env.QA11X_DEBUG;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      process.env.QA11X_DEBUG = '1';
      fs.writeFileSync(path.join(cacheDir, 'manifest.json'), '{corrupt json', 'utf-8');
      fs.writeFileSync(path.join(cacheDir, 'manifest.etag'), '"v1"', 'utf-8');

      const validManifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '3.2.0',
        generated_at_utc: '2026-11-18T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.example.test/org/repo',
        stacks: {},
        common_files: [],
        agent_governance_files: [],
      };
      const manifestSpy = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 304 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(validManifest), { status: 200 }));
      vi.stubGlobal('fetch', manifestSpy);

      const loaded = await fetcher.fetchManifest(false, new AbortController().signal);
      expect(loaded.blueprint_version).toBe('3.2.0');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('readCachedManifest'));

      expect(resolveSafeChildPath(path.sep, 'tmp')).toBe(path.join(path.sep, 'tmp'));

      const raceBody = 'concurrent cached body';
      const raceHash = fetcher.computeSha256(raceBody);
      const raceFilePath = path.join(cacheDir, 'files', 'race.txt');
      const raceFetcher = new GitHubFetcher({
        cacheDir,
        rawBaseUrl: 'https://raw.example.test/org/repo',
        fetchFn: (() => {
          fs.mkdirSync(path.dirname(raceFilePath), { recursive: true });
          fs.writeFileSync(raceFilePath, raceBody, 'utf-8');
          return Promise.reject(new Error('Network race fallback'));
        }) as unknown as typeof fetch,
      });
      expect(await raceFetcher.fetchFileContent('race.txt', raceHash)).toBe(raceBody);
    } finally {
      stderrSpy.mockRestore();
      if (prevDebug === undefined) delete process.env.QA11X_DEBUG;
      else process.env.QA11X_DEBUG = prevDebug;
    }
  });

  it('rejects symlinked cacheDir, default $HOME/.cache symlink, and dangling cache file symlinks without external writes', async () => {
    const outsideCache = fs.mkdtempSync(path.join(tmpDir, 'outside-cache-'));
    const validManifest: Manifest = {
      schema_version: '1.0.0',
      blueprint_version: '3.2.0',
      generated_at_utc: '2026-11-21T00:00:00Z',
      repository: 'tecno-consultores/qa-testing-blueprints',
      default_branch: 'main',
      raw_base_url: 'https://raw.example.test/org/repo',
      stacks: {},
      common_files: [],
      agent_governance_files: [],
    };
    const fileBody = 'verified-cache-body\n';
    const fileSha = crypto.createHash('sha256').update(fileBody).digest('hex');

    // 1. Explicit cacheDir symlink -> outsideCache
    const symCacheDir = path.join(tmpDir, 'sym-cache-dir');
    fs.symlinkSync(outsideCache, symCacheDir);
    const fetcher1 = new GitHubFetcher({
      cacheDir: symCacheDir,
      fetchFn: vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/manifest.json')) {
          return Promise.resolve(new Response(JSON.stringify(validManifest), { status: 200 }));
        }
        return Promise.resolve(new Response(fileBody, { status: 200 }));
      }) as unknown as typeof fetch,
    });
    await expect(fetcher1.fetchManifest(true)).rejects.toThrow(/symlink|confinamiento/i);
    await expect(fetcher1.fetchFileContent('remote/demo.txt', fileSha)).rejects.toThrow(
      /symlink|confinamiento/i
    );
    expect(fs.readdirSync(outsideCache)).toEqual([]);

    // 2. Default $HOME/.cache/qa-11x-blueprints where fakeHome/.cache -> outsideCache
    const prevHome = process.env.HOME;
    const prevEnvCache = process.env.QA_BLUEPRINTS_CACHE_DIR;
    delete process.env.QA_BLUEPRINTS_CACHE_DIR;
    const fakeHome = path.join(tmpDir, 'fake-home-cache');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.symlinkSync(outsideCache, path.join(fakeHome, '.cache'));
    try {
      process.env.HOME = fakeHome;
      const defaultFetcher = new GitHubFetcher({
        fetchFn: vi.fn().mockResolvedValue(
          new Response(JSON.stringify(validManifest), { status: 200 })
        ) as unknown as typeof fetch,
      });
      await expect(defaultFetcher.fetchManifest(true)).rejects.toThrow(/symlink|confinamiento/i);
      expect(fs.readdirSync(outsideCache)).toEqual([]);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevEnvCache !== undefined) process.env.QA_BLUEPRINTS_CACHE_DIR = prevEnvCache;
    }

    // 3. Dangling cache file symlinks inside valid cacheDir (manifest.json, manifest.etag, files/remote.txt)
    const realCache = path.join(tmpDir, 'real-dangling-cache');
    fs.mkdirSync(path.join(realCache, 'files'), { recursive: true });
    const pwnManifest = path.join(outsideCache, 'pwned-manifest.json');
    const pwnEtag = path.join(outsideCache, 'pwned.etag');
    const pwnFile = path.join(outsideCache, 'pwned-file.txt');
    fs.symlinkSync(pwnManifest, path.join(realCache, 'manifest.json'));
    fs.symlinkSync(pwnEtag, path.join(realCache, 'manifest.etag'));
    fs.symlinkSync(pwnFile, path.join(realCache, 'files', 'remote.txt'));

    const fetcher3 = new GitHubFetcher({
      cacheDir: realCache,
      fetchFn: vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/manifest.json')) {
          return Promise.resolve(
            new Response(JSON.stringify(validManifest), {
              status: 200,
              headers: { etag: '"e1"' },
            })
          );
        }
        return Promise.resolve(new Response(fileBody, { status: 200 }));
      }) as unknown as typeof fetch,
    });
    await expect(fetcher3.fetchManifest(false)).rejects.toThrow(/symlink|confinamiento/i);
    await expect(fetcher3.fetchManifest(true)).rejects.toThrow(/symlink|confinamiento/i);
    await expect(fetcher3.fetchFileContent('remote.txt', fileSha)).rejects.toThrow(
      /symlink|confinamiento/i
    );
    expect(fs.existsSync(pwnManifest)).toBe(false);
    expect(fs.existsSync(pwnEtag)).toBe(false);
    expect(fs.existsSync(pwnFile)).toBe(false);

    // 4. writeCacheAtomic cleans up CSPRNG tmp file if renameSync fails (e.g., manifest.json is a directory)
    const renameFailCache = path.join(tmpDir, 'rename-fail-cache');
    fs.mkdirSync(path.join(renameFailCache, 'manifest.json'), { recursive: true });
    const fetcher4 = new GitHubFetcher({
      cacheDir: renameFailCache,
      fetchFn: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validManifest), { status: 200 })
      ) as unknown as typeof fetch,
    });
    await expect(fetcher4.fetchManifest(true)).rejects.toThrow(/Fallo al obtener manifest\.json/i);
    const leftoverTmp = fs
      .readdirSync(renameFailCache)
      .filter((entry) => entry.startsWith('manifest.json.tmp.'));
    expect(leftoverTmp).toEqual([]);

    // 5. resolveSafeDefaultAnchor handles non-existent HOME and deleted cwd cleanly
    const prevCwd = process.cwd();
    const deletedCwd = fs.mkdtempSync(path.join(tmpDir, 'deleted-cwd-'));
    try {
      process.chdir(deletedCwd);
      fs.rmSync(deletedCwd, { recursive: true, force: true });
      const anchor = resolveSafeDefaultAnchor(
        path.join(tmpDir, 'probe', 'leaf'),
        path.join(tmpDir, 'nonexistent-home')
      );
      expect(anchor.length).toBeGreaterThan(0);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
