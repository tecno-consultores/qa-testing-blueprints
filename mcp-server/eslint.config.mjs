// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
//
// Technical Debt Note (F9.8):
// "exactOptionalPropertyTypes": true in tsconfig.json was evaluated and deferred because Zod's
// z.optional() infers `T | undefined`, which conflicts with exact optional property shapes across
// the 19 MCP tool schemas without invasive upstream schema wrappers. Revisit on Zod v4 migration.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'example/**', '*.mjs', 'vitest.config.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  sonarjs.configs.recommended,
  security.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.typecheck.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      // Rules match literal "/tmp/..." strings in Docker QA evidence paths & SAST rule scanners, not unsafe host writes
      'sonarjs/publicly-writable-directories': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': 'warn',
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
