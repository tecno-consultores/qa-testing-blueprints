// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { GitHubFetcher } from '../services/github-fetcher.js';
import { FetchedFileItem } from '../types.js';

export async function fetchBlueprintBundle(
  stack: string,
  includeCommonAndAgents = true,
  fetcher?: GitHubFetcher
): Promise<{
  stack: string;
  total_files: number;
  files: FetchedFileItem[];
}> {
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const files = await resolvedFetcher.fetchStackBundle(stack, includeCommonAndAgents);

  return {
    stack,
    total_files: files.length,
    files,
  };
}
