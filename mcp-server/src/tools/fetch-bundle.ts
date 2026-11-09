// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { FetchedFileItem } from '../types.js';

export async function fetchBlueprintBundle(
  stack: string,
  includeCommonAndAgents = true,
  fetcher?: GitHubFetcher,
  includeContent = false
): Promise<{
  stack: string;
  total_files: number;
  content_omitted_for_token_economy?: boolean;
  files: FetchedFileItem[];
}> {
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const rawFiles = await resolvedFetcher.fetchStackBundle(stack, includeCommonAndAgents);
  const cacheDir = resolvedFetcher.getCacheDir();

  if (includeContent) {
    return {
      stack,
      total_files: rawFiles.length,
      files: rawFiles,
    };
  }

  const compactFiles: FetchedFileItem[] = rawFiles.map((item) => ({
    path: item.path,
    target_name: item.target_name,
    merge_strategy: item.merge_strategy,
    content: '',
    sha256_verified: item.sha256_verified,
    size_bytes: Buffer.byteLength(item.content, 'utf-8'),
    cached_path: path.join(cacheDir, 'files', item.path),
  }));

  return {
    stack,
    total_files: compactFiles.length,
    content_omitted_for_token_economy: true,
    files: compactFiles,
  };
}
