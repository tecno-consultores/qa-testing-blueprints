import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Exigencia corporativa: Falla el pipeline si no se cumple el 95%
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95
      },
      exclude: [
        'coverage/**',
        'dist/**',
        '**/*.d.ts',
        'test/**',
        'vitest.config.ts',
        'stryker.conf.json'
      ]
    }
  }
});
