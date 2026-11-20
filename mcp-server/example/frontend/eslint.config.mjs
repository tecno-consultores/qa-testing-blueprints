// SPDX-License-Identifier: MIT
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  security.configs.recommended,
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      complexity: ['error', 5],
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
);
