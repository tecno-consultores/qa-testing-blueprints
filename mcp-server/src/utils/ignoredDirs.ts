// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

export const CANONICAL_IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.cache',
  '.pnpm-store',
  '.venv',
  'venv',
  '.tox',
  '.nox',
  '.hypothesis',
  '.schemathesis',
  'mutants',
  '.mutmut-cache',
  'vendor',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'htmlcov',
  'graphify-out',
  '.stryker-tmp',
  '.trivycache',
  'test-results',
  '.next',
  '.output',
  '.svelte-kit',
]);

export function isIgnoredScanDir(dirName: string): boolean {
  return CANONICAL_IGNORED_DIRS.has(dirName);
}
