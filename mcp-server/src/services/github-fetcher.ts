// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertNoSymlinkSegments,
  assertNotSymlinkPath,
  resolveRealTargetWithSymlinks,
} from '../security/pathRealResolver.js';
import { FetchedFileItem, GitHubFetcherOptions, Manifest } from '../types.js';

const FORBIDDEN_PATH_SEGMENTS = new Set(['..', '__proto__', 'constructor', 'prototype']);
const EXCLUDED_REMOTE_COMMON_PATHS = new Set([
  'scripts/publicar-mcp.sh',
  'scripts/probar-mcp-example.sh',
  'scripts/install-skill.sh',
  '.env.example',
]);
const MONOREPO_ONLY_GOV_PATHS = new Set([
  '.agents/scripts/bump_version_11x.py',
  '.agents/scripts/sync_governance.py',
  'scripts/install-skill.sh',
]);
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const PACKAGE_META = JSON.parse(fs.readFileSync(PACKAGE_JSON_URL, 'utf-8')) as {
  version: string;
  description?: string;
};

export function extractStandardEdition(description?: string): string {
  const match = /\(QA-11X v\d+\.\d+(?=:)/.exec(description ?? '');
  return match ? match[0].slice(1) : 'QA-11X v3.11';
}

export const MCP_SERVER_VERSION: string = PACKAGE_META.version;
export const MCP_STANDARD_EDITION: string = extractStandardEdition(PACKAGE_META.description);

export function isOwnObjectProperty<T extends object>(obj: T, key: string): boolean {
  if (FORBIDDEN_PATH_SEGMENTS.has(key)) return false;
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function assertSafeRelativePath(relPath: string): string {
  const normalizedInput = relPath.normalize('NFKC').trim();
  if (
    !normalizedInput ||
    normalizedInput.includes('\0') ||
    path.isAbsolute(normalizedInput) ||
    normalizedInput.startsWith('\\')
  ) {
    throw new Error(`Ruta relativa inválida o insegura (CWE-22): '${relPath}'`);
  }
  const segments = normalizedInput.split(/[/\\]+/);
  if (segments.some((seg) => FORBIDDEN_PATH_SEGMENTS.has(seg))) {
    throw new Error(`Intento de Path Traversal o segmento prohibido detectado (CWE-22): '${relPath}'`);
  }
  return normalizedInput;
}

export function resolveSafeChildPath(baseDir: string, relPath: string): string {
  const safeRel = assertSafeRelativePath(relPath);
  const resolvedBase = path.resolve(baseDir);
  const basePrefix = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
  const resolvedTarget = path.resolve(resolvedBase, safeRel);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(basePrefix)) {
    throw new Error(`Violación de confinamiento de directorio (CWE-22): '${relPath}' escapa de '${baseDir}'`);
  }
  const baseOutcome = resolveRealTargetWithSymlinks(resolvedBase);
  const targetOutcome = resolveRealTargetWithSymlinks(resolvedTarget);
  if (!baseOutcome.ok || !targetOutcome.ok) {
    throw new Error(`Ciclo de enlaces simbólicos detectado (CWE-22): '${relPath}'`);
  }
  const realBase = baseOutcome.resolved;
  const realBasePrefix = realBase.endsWith(path.sep) ? realBase : `${realBase}${path.sep}`;
  const realTarget = targetOutcome.resolved;
  if (realTarget !== realBase && !realTarget.startsWith(realBasePrefix)) {
    throw new Error(
      `Violación de confinamiento de symlink (CWE-22): '${relPath}' escapa de '${baseDir}'`
    );
  }
  return resolvedTarget;
}

export function resolveSafeHomeDir(
  explicitHome?: string,
  homedirFn: () => string = os.homedir
): string {
  const candidate = explicitHome || process.env.HOME || process.env.USERPROFILE;
  if (candidate && candidate.trim().length > 0) {
    return candidate;
  }
  try {
    return homedirFn();
  } catch (err: unknown) {
    // Container UIDs without /etc/passwd entry fall back safely to OS tmpdir
    if (process.env.QA11X_DEBUG === '1') {
      const msg = err instanceof Error ? err.message : 'homedir error';
      process.stderr.write(`[QA11X_DEBUG] githubFetcher.resolveSafeHomeDir: ${msg.slice(0, 120)}\n`);
    }
    return os.tmpdir();
  }
}

function isStrictChildPath(targetPath: string, anchorPath: string): boolean {
  const rel = path.relative(anchorPath, targetPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function addAnchorVariants(anchors: Set<string>, rawPath: string): void {
  const resolved = path.resolve(rawPath);
  anchors.add(resolved);
  try {
    anchors.add(fs.realpathSync(resolved));
  } catch {
    // Non-existent anchor path only retains lexical resolved path
  }
}

function collectSafeAnchors(homeDir?: string): string[] {
  const anchors = new Set<string>();
  addAnchorVariants(anchors, resolveSafeHomeDir(homeDir));
  try {
    addAnchorVariants(anchors, process.cwd());
  } catch {
    // Deleted or inaccessible cwd falls back cleanly to remaining anchors
  }
  addAnchorVariants(anchors, os.tmpdir());
  addAnchorVariants(anchors, '/tmp');
  // macOS symlinks /var -> /private/var (used by /var/folders temp paths); anchoring at /var avoids false CWE-22 on OS symlink while still checking every descendant segment
  addAnchorVariants(anchors, '/var');
  return Array.from(anchors);
}

export function resolveSafeDefaultAnchor(targetPath: string, homeDir?: string): string {
  const resolvedTarget = path.resolve(targetPath);
  let bestAnchor = path.parse(resolvedTarget).root;
  for (const anchor of collectSafeAnchors(homeDir)) {
    if (isStrictChildPath(resolvedTarget, anchor) && anchor.length > bestAnchor.length) {
      bestAnchor = anchor;
    }
  }
  return bestAnchor;
}

export function assertSafeAnchoredTarget(targetPath: string, confinementRoot?: string): string {
  const resolvedTarget = path.resolve(targetPath);
  const anchor = confinementRoot ?? resolveSafeDefaultAnchor(resolvedTarget);
  const relDir = path.relative(path.resolve(anchor), resolvedTarget);
  resolveSafeChildPath(anchor, relDir);
  assertNoSymlinkSegments(anchor, relDir);
  return resolvedTarget;
}

function trimTrailingSlashes(rawUrl: string): string {
  let end = rawUrl.length;
  while (end > 0 && rawUrl[end - 1] === '/') {
    end -= 1;
  }
  return rawUrl.slice(0, end);
}

export class GitHubFetcher {
  private readonly rawBaseUrl: string;
  private readonly cacheDir: string;
  private readonly defaultCacheHomeDir: string | null;
  private readonly localOverridePath: string | null;
  private readonly fetchFn?: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options?: GitHubFetcherOptions) {
    const rawUrl =
      options?.rawBaseUrl ||
      process.env.QA_BLUEPRINTS_RAW_URL ||
      'https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main';
    this.rawBaseUrl = trimTrailingSlashes(rawUrl);
    const explicitCacheDir = options?.cacheDir || process.env.QA_BLUEPRINTS_CACHE_DIR;
    if (explicitCacheDir) {
      this.cacheDir = explicitCacheDir;
      this.defaultCacheHomeDir = null;
    } else {
      const homeDir = resolveSafeHomeDir();
      this.cacheDir = path.join(homeDir, '.cache', 'qa-11x-blueprints');
      this.defaultCacheHomeDir = homeDir;
    }
    this.localOverridePath =
      options?.localOverridePath || process.env.QA_BLUEPRINTS_LOCAL_PATH || null;
    this.fetchFn = options?.fetchFn;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  }

  public computeSha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public getCacheDir(): string {
    return this.cacheDir;
  }

  public getLocalOverridePath(): string | null {
    return this.localOverridePath;
  }

  private assertSafeCacheDir(): void {
    if (this.defaultCacheHomeDir !== null) {
      const defaultRel = path.join('.cache', 'qa-11x-blueprints');
      resolveSafeChildPath(this.defaultCacheHomeDir, defaultRel);
      assertNoSymlinkSegments(this.defaultCacheHomeDir, defaultRel);
    } else {
      assertSafeAnchoredTarget(this.cacheDir);
    }
    assertNotSymlinkPath(this.cacheDir);
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private readLocalManifest(): Manifest | null {
    if (!this.localOverridePath) return null;
    const localManifestPath = path.join(this.localOverridePath, 'manifest.json');
    if (fs.existsSync(localManifestPath)) {
      const raw = fs.readFileSync(localManifestPath, 'utf-8');
      return JSON.parse(raw) as Manifest;
    }
    return null;
  }

  private writeCacheAtomic(targetPath: string, content: string): void {
    this.assertSafeCacheDir();
    const resolvedCache = path.resolve(this.cacheDir);
    const relTarget = path.relative(resolvedCache, path.resolve(targetPath));
    resolveSafeChildPath(resolvedCache, relTarget);
    assertNoSymlinkSegments(resolvedCache, relTarget);
    assertNotSymlinkPath(targetPath);

    const dir = path.dirname(targetPath);
    this.ensureDir(dir);
    const tmpPath = `${targetPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
    assertNotSymlinkPath(tmpPath);
    try {
      fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', flag: 'wx' });
      assertNotSymlinkPath(tmpPath);
      fs.renameSync(tmpPath, targetPath);
    } catch (err: unknown) {
      fs.rmSync(tmpPath, { force: true });
      throw err;
    }
  }

  private createRequestSignal(externalSignal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    return externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal;
  }

  private readCachedManifest(cachedPath: string): Manifest | null {
    this.assertSafeCacheDir();
    assertNotSymlinkPath(cachedPath);
    if (!fs.existsSync(cachedPath)) {
      return null;
    }
    try {
      const cachedRaw = fs.readFileSync(cachedPath, 'utf-8');
      return JSON.parse(cachedRaw) as Manifest;
    } catch (err: unknown) {
      if (process.env.QA11X_DEBUG === '1') {
        const detail = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[QA11X_DEBUG] githubFetcher.readCachedManifest(${cachedPath}): ${detail}\n`);
      }
      return null;
    }
  }

  private async executeManifestFetch(params: {
    manifestUrl: string;
    headers: Record<string, string>;
    cachedManifestPath: string;
    cachedEtagPath: string;
    externalSignal?: AbortSignal;
  }): Promise<Manifest> {
    const { manifestUrl, headers, cachedManifestPath, cachedEtagPath, externalSignal } = params;
    const fetchImpl = this.fetchFn ?? globalThis.fetch;
    let response = await fetchImpl(manifestUrl, {
      headers,
      signal: this.createRequestSignal(externalSignal),
    });

    if (response.status === 304) {
      const cached = this.readCachedManifest(cachedManifestPath);
      if (cached) return cached;

      const retryHeaders = { ...headers };
      delete retryHeaders['If-None-Match'];
      response = await fetchImpl(manifestUrl, {
        headers: retryHeaders,
        signal: this.createRequestSignal(externalSignal),
      });
    }

    if (response.ok) {
      const text = await response.text();
      const parsed = JSON.parse(text) as Manifest;
      this.writeCacheAtomic(cachedManifestPath, text);

      const newEtag = response.headers.get('etag');
      if (newEtag) {
        this.writeCacheAtomic(cachedEtagPath, newEtag);
      }
      return parsed;
    }

    throw new Error(`HTTP ${response.status} al descargar manifest.json: ${response.statusText}`);
  }

  public async fetchManifest(forceRefresh = false, externalSignal?: AbortSignal): Promise<Manifest> {
    const local = this.readLocalManifest();
    if (local) return local;

    this.assertSafeCacheDir();
    this.ensureDir(this.cacheDir);
    const cachedManifestPath = path.join(this.cacheDir, 'manifest.json');
    const cachedEtagPath = path.join(this.cacheDir, 'manifest.etag');

    let etag: string | null = null;
    if (!forceRefresh) {
      assertNotSymlinkPath(cachedEtagPath);
      if (fs.existsSync(cachedEtagPath)) {
        etag = fs.readFileSync(cachedEtagPath, 'utf-8').trim();
      }
    }

    const manifestUrl = `${this.rawBaseUrl}/manifest.json`;
    const headers: Record<string, string> = {
      'User-Agent': `mcp-qa-11x/${MCP_SERVER_VERSION}`,
    };
    if (etag && !forceRefresh) {
      headers['If-None-Match'] = etag;
    }

    try {
      return await this.executeManifestFetch({
        manifestUrl,
        headers,
        cachedManifestPath,
        cachedEtagPath,
        ...(externalSignal ? { externalSignal } : {}),
      });
    } catch (err) {
      const fallback = this.readCachedManifest(cachedManifestPath);
      if (fallback) return fallback;
      throw new Error(
        `Fallo al obtener manifest.json y no existe copia en caché local: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private verifySha256(content: string, expectedSha256: string, relPath: string): void {
    const actualSha = this.computeSha256(content);
    if (actualSha !== expectedSha256) {
      throw new Error(
        `Violación de integridad criptográfica (DISA ASD STIG V6R5 V-222513): ` +
          `Hash SHA-256 no coincide para ${relPath}. Esperado ${expectedSha256}, obtenido ${actualSha}`
      );
    }
  }

  private readLocalFile(relPath: string, expectedSha256: string): string | null {
    if (!this.localOverridePath) return null;
    const localFilePath = resolveSafeChildPath(this.localOverridePath, relPath);
    if (fs.existsSync(localFilePath)) {
      const content = fs.readFileSync(localFilePath, 'utf-8');
      this.verifySha256(content, expectedSha256, relPath);
      return content;
    }
    return null;
  }

  private readCachedFile(relPath: string, expectedSha256: string): string | null {
    this.assertSafeCacheDir();
    const cachedFilePath = resolveSafeChildPath(path.join(this.cacheDir, 'files'), relPath);
    assertNoSymlinkSegments(this.cacheDir, path.join('files', relPath));
    if (fs.existsSync(cachedFilePath)) {
      const cachedContent = fs.readFileSync(cachedFilePath, 'utf-8');
      if (this.computeSha256(cachedContent) === expectedSha256) {
        return cachedContent;
      }
    }
    return null;
  }

  public async fetchFileContent(relPath: string, expectedSha256: string): Promise<string> {
    const safeRelPath = assertSafeRelativePath(relPath);
    const local = this.readLocalFile(safeRelPath, expectedSha256);
    if (local !== null) return local;

    const cached = this.readCachedFile(safeRelPath, expectedSha256);
    if (cached !== null) return cached;

    const cachedFilePath = resolveSafeChildPath(path.join(this.cacheDir, 'files'), safeRelPath);
    const encodedRelPath = safeRelPath
      .split(/[/\\]+/)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const fileUrl = `${this.rawBaseUrl}/${encodedRelPath}`;
    const fetchImpl = this.fetchFn ?? globalThis.fetch;
    try {
      const response = await fetchImpl(fileUrl, {
        headers: { 'User-Agent': `mcp-qa-11x/${MCP_SERVER_VERSION}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al descargar ${safeRelPath}: ${response.statusText}`);
      }
      const downloadedText = await response.text();
      this.verifySha256(downloadedText, expectedSha256, safeRelPath);

      this.writeCacheAtomic(cachedFilePath, downloadedText);

      return downloadedText;
    } catch (err) {
      const fallback = this.readCachedFile(safeRelPath, expectedSha256);
      if (fallback !== null) return fallback;
      throw err;
    }
  }

  public async fetchStackBundle(
    stackName: string,
    includeCommonAndAgents = true,
    thinRepoOnly = true
  ): Promise<FetchedFileItem[]> {
    const manifest = await this.fetchManifest();
    const stackDef = isOwnObjectProperty(manifest.stacks, stackName)
      ? manifest.stacks[stackName]
      : undefined;
    if (!stackDef) {
      throw new Error(`El stack solicitado '${stackName}' no existe en manifest.json.`);
    }

    const itemsToFetch: Array<{
      path: string;
      target_name: string;
      merge_strategy: FetchedFileItem['merge_strategy'];
      sha256: string;
    }> = [...stackDef.files];

    if (includeCommonAndAgents) {
      const commonItems = manifest.common_files.filter(
        (f) => !EXCLUDED_REMOTE_COMMON_PATHS.has(f.path)
      );
      const agentItems = thinRepoOnly
        ? manifest.agent_governance_files.filter(
            (f) =>
              !MONOREPO_ONLY_GOV_PATHS.has(f.path) &&
              (f.path.startsWith('.agents/scripts/') ||
                f.path.startsWith('.agents/schemas/') ||
                f.path === '.agents/ACTIVE_TASK.md.example')
          )
        : manifest.agent_governance_files;
      itemsToFetch.push(...commonItems);
      itemsToFetch.push(...agentItems);
    }

    const fetchedFiles: FetchedFileItem[] = [];
    for (const item of itemsToFetch) {
      assertSafeRelativePath(item.path);
      if (item.target_name) {
        assertSafeRelativePath(item.target_name);
      }
      const content = await this.fetchFileContent(item.path, item.sha256);
      fetchedFiles.push({
        path: item.path,
        target_name: item.target_name,
        merge_strategy: item.merge_strategy,
        content,
        sha256_verified: true,
      });
    }

    return fetchedFiles;
  }
}
