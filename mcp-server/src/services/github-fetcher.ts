// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FetchedFileItem, GitHubFetcherOptions, Manifest } from '../types.js';

const FORBIDDEN_PATH_SEGMENTS = new Set(['..', '__proto__', 'constructor', 'prototype']);
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

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
  const resolvedTarget = path.resolve(resolvedBase, safeRel);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Violación de confinamiento de directorio (CWE-22): '${relPath}' escapa de '${baseDir}'`);
  }
  return resolvedTarget;
}

export class GitHubFetcher {
  private readonly rawBaseUrl: string;
  private readonly cacheDir: string;
  private readonly localOverridePath: string | null;

  constructor(options?: GitHubFetcherOptions) {
    this.rawBaseUrl =
      options?.rawBaseUrl ||
      process.env.QA_BLUEPRINTS_RAW_URL ||
      'https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main';
    this.cacheDir =
      options?.cacheDir ||
      process.env.QA_BLUEPRINTS_CACHE_DIR ||
      path.join(os.homedir(), '.cache', 'qa-11x-blueprints');
    this.localOverridePath =
      options?.localOverridePath || process.env.QA_BLUEPRINTS_LOCAL_PATH || null;
  }

  public computeSha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public getCacheDir(): string {
    return this.cacheDir;
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

  private readCachedManifest(cachedPath: string): Manifest | null {
    if (fs.existsSync(cachedPath)) {
      const cachedRaw = fs.readFileSync(cachedPath, 'utf-8');
      return JSON.parse(cachedRaw) as Manifest;
    }
    return null;
  }

  private async executeManifestFetch(
    manifestUrl: string,
    headers: Record<string, string>,
    cachedManifestPath: string,
    cachedEtagPath: string
  ): Promise<Manifest> {
    let response = await fetch(manifestUrl, {
      headers,
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
    });

    if (response.status === 304) {
      const cached = this.readCachedManifest(cachedManifestPath);
      if (cached) return cached;

      const retryHeaders = { ...headers };
      delete retryHeaders['If-None-Match'];
      response = await fetch(manifestUrl, {
        headers: retryHeaders,
        signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      });
    }

    if (response.ok) {
      const text = await response.text();
      const parsed = JSON.parse(text) as Manifest;
      fs.writeFileSync(cachedManifestPath, text, 'utf-8');

      const newEtag = response.headers.get('etag');
      if (newEtag) {
        fs.writeFileSync(cachedEtagPath, newEtag, 'utf-8');
      }
      return parsed;
    }

    throw new Error(`HTTP ${response.status} al descargar manifest.json: ${response.statusText}`);
  }

  public async fetchManifest(forceRefresh = false): Promise<Manifest> {
    const local = this.readLocalManifest();
    if (local) return local;

    this.ensureDir(this.cacheDir);
    const cachedManifestPath = path.join(this.cacheDir, 'manifest.json');
    const cachedEtagPath = path.join(this.cacheDir, 'manifest.etag');

    let etag: string | null = null;
    if (!forceRefresh && fs.existsSync(cachedEtagPath)) {
      etag = fs.readFileSync(cachedEtagPath, 'utf-8').trim();
    }

    const manifestUrl = `${this.rawBaseUrl}/manifest.json`;
    const headers: Record<string, string> = {
      'User-Agent': 'mcp-qa-11x/2.12.0',
    };
    if (etag && !forceRefresh) {
      headers['If-None-Match'] = etag;
    }

    try {
      return await this.executeManifestFetch(
        manifestUrl,
        headers,
        cachedManifestPath,
        cachedEtagPath
      );
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
    const cachedFilePath = resolveSafeChildPath(path.join(this.cacheDir, 'files'), relPath);
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
    const fileUrl = `${this.rawBaseUrl}/${safeRelPath}`;
    try {
      const response = await fetch(fileUrl, {
        headers: { 'User-Agent': 'mcp-qa-11x/2.12.0' },
        signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al descargar ${safeRelPath}: ${response.statusText}`);
      }
      const downloadedText = await response.text();
      this.verifySha256(downloadedText, expectedSha256, safeRelPath);

      this.ensureDir(path.dirname(cachedFilePath));
      fs.writeFileSync(cachedFilePath, downloadedText, 'utf-8');

      return downloadedText;
    } catch (err) {
      const fallback = this.readCachedFile(safeRelPath, expectedSha256);
      if (fallback !== null) return fallback;
      throw err;
    }
  }

  public async fetchStackBundle(
    stackName: string,
    includeCommonAndAgents = true
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
      itemsToFetch.push(...manifest.common_files);
      itemsToFetch.push(...manifest.agent_governance_files);
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
