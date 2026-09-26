import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
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
        'playwright-report/**',
        'e2e/**',
        'test/**',
        '**/*.d.ts'
      ]
    }
  }
});
