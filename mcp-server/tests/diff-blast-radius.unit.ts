// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachPromptGuard } from '../src/index.js';
import { createMcpServer } from '../src/server.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { inspectAstBlastRadius } from '../src/tools/blast-radius.js';
import {
  buildSemanticDiffBundle,
  classifyDiffTier,
  collapseLargeHunk,
  estimateTokens,
  extractTestCaseNames,
  matchesGlobPattern,
  parseBoundaryGlobs,
  parseUnifiedDiffSections,
  validateGitRef,
} from '../src/utils/diff-bundle.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'QA Test',
      GIT_AUTHOR_EMAIL: 'qa@example.invalid',
      GIT_COMMITTER_NAME: 'QA Test',
      GIT_COMMITTER_EMAIL: 'qa@example.invalid',
    },
  });
}

function writeRepoFile(repoRoot: string, relPath: string, content: string): void {
  const target = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

function initGitRepo(repoRoot: string, initialFiles: Record<string, string>): void {
  git(repoRoot, ['init', '-b', 'main']);
  for (const [rel, content] of Object.entries(initialFiles)) {
    writeRepoFile(repoRoot, rel, content);
  }
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'chore: initial commit']);
}

describe('Modo Diferencial en inspect_ast_blast_radius y diff-bundle (Hito 23)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-diff-blast-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('conserva compatibilidad 100% cuando se omite changed_since_ref', async () => {
    writeRepoFile(tmpDir, 'src/core.ts', 'export function greetUser() { return 1; }\n');
    const result = await inspectAstBlastRadius(tmpDir, 'greetUser');
    expect(result.target_symbol).toBe('greetUser');
    expect(result.diff_bundle).toBeUndefined();
    expect(result.risk_level).toBe('LOW');
  });

  it('valida referencias Git seguras y rechaza inyecciones o rutas inválidas', async () => {
    expect(validateGitRef('origin/main')).toBe('origin/main');
    expect(validateGitRef('HEAD~1')).toBe('HEAD~1');
    for (const badRef of ['', '   ', '-o', '--upload-pack=x', 'HEAD; whoami', '$(id)']) {
      expect(() => validateGitRef(badRef)).toThrow(/Referencia Git inválida/);
    }

    await expect(buildSemanticDiffBundle(path.join(tmpDir, 'missing'), 'HEAD')).rejects.toThrow(
      /no existe/
    );
    const regularFile = path.join(tmpDir, 'archivo.txt');
    fs.writeFileSync(regularFile, 'hola', 'utf-8');
    await expect(buildSemanticDiffBundle(regularFile, 'HEAD')).rejects.toThrow(/directorio válido/);

    initGitRepo(tmpDir, { 'README.md': '# Base\n' });
    await expect(buildSemanticDiffBundle(tmpDir, 'refs/heads/no-existe-xyz')).rejects.toThrow(
      /Error ejecutando git diff/
    );
  });

  it('maneja diff vacío contra HEAD sin errores', async () => {
    initGitRepo(tmpDir, { 'src/app.ts': 'export const ok = true;\n' });
    const bundle = await buildSemanticDiffBundle(tmpDir, 'HEAD');
    expect(bundle.files).toHaveLength(0);
    expect(bundle.raw_tokens_estimate).toBe(0);
    expect(bundle.compacted_tokens_estimate).toBe(0);
    expect(bundle.token_savings_pct).toBe(0);
    expect(bundle.rendered_bundle).toContain('[DIFF_EMPTY]');
  });

  it('poda lockfiles, colapsa hunks > 80 líneas, resume pruebas y logra ahorro >= 60% de tokens', async () => {
    const initialLock = Array.from({ length: 180 }, (_, i) => `pkg-${i}: 1.0.${i}`).join('\n') + '\n';
    const initialCore =
      Array.from({ length: 10 }, (_, i) => `export const base${i} = ${i};`).join('\n') + '\n';
    initGitRepo(tmpDir, {
      'pnpm-lock.yaml': initialLock,
      'assets/app.min.js': 'console.log("v1");\n',
      'src/service.ts': initialCore,
      'tests/service.unit.ts': "it('base case', () => {});\n",
      'migrations/000_base.sql': 'SELECT 1;\n',
      'src/legacy.ts': 'export const old = 1;\n',
    });

    const newLock =
      Array.from({ length: 240 }, (_, i) => `pkg-updated-${i}: 2.0.${i}`).join('\n') + '\n';
    const largeBodyLines = [
      'export async function runBatch() {',
      ...Array.from({ length: 45 }, (_, i) => `  const item${i} = ${i};`),
      '  def pyStyleHelper(): pass',
      '  async def pyAsyncHelper(): pass',
      '  export function innerHelper() { return 42; }',
      ...Array.from({ length: 45 }, (_, i) => `  const tail${i} = ${i};`),
      '  return item0;',
      '}',
    ].join('\n');

    writeRepoFile(tmpDir, 'pnpm-lock.yaml', newLock);
    writeRepoFile(tmpDir, 'assets/app.min.js', 'console.log("' + 'x'.repeat(800) + '");\n');
    writeRepoFile(tmpDir, 'src/service.ts', initialCore + largeBodyLines + '\n');
    writeRepoFile(tmpDir, 'migrations/001_init.sql', 'CREATE TABLE audit_logs (id INT);\n');
    writeRepoFile(
      tmpDir,
      'tests/service.unit.ts',
      [
        "it('calculates diff savings', () => {});",
        'async def test_async_flow(): pass',
        'Scenario: Validacion BDD',
        "@test 'bats test ok' {",
      ].join('\n') + '\n'
    );
    git(tmpDir, ['rm', 'src/legacy.ts']);
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'feat: large delta']);

    const fullBudgetBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', 4000);
    expect(fullBudgetBundle.tiers_summary.PRUNED_NOISE).toBe(2);
    expect(fullBudgetBundle.tiers_summary.CRITICAL_FULL).toBe(1);
    expect(fullBudgetBundle.tiers_summary.CORE_LOGIC).toBe(2);
    expect(fullBudgetBundle.tiers_summary.TESTS_SUMMARY).toBe(1);
    expect(fullBudgetBundle.token_savings_pct).toBeGreaterThanOrEqual(60);
    expect(fullBudgetBundle.rendered_bundle).toContain('[PRUNED_NOISE] pnpm-lock.yaml');
    expect(fullBudgetBundle.rendered_bundle).toContain('CREATE TABLE audit_logs');
    expect(fullBudgetBundle.rendered_bundle).toContain('... [collapsed ');
    expect(fullBudgetBundle.rendered_bundle).toContain('innerHelper');
    expect(fullBudgetBundle.rendered_bundle).toContain('pyAsyncHelper');

    const tightBudgetBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', 120);
    expect(tightBudgetBundle.compacted_tokens_estimate).toBeLessThanOrEqual(120);
    expect(tightBudgetBundle.rendered_bundle).toContain('[TRUNCATED_BY_BUDGET]');

    const mediumTarget = Math.max(150, fullBudgetBundle.compacted_tokens_estimate - 5);
    const mediumBudgetBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', mediumTarget);
    expect(mediumBudgetBundle.rendered_bundle).toContain('[TESTS_SUMMARY] tests/service.unit.ts');
    expect(mediumBudgetBundle.rendered_bundle).toContain('cases=[calculates diff savings');

    const compactCoreTarget = Math.max(100, mediumBudgetBundle.compacted_tokens_estimate - 10);
    const compactCoreBudget = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', compactCoreTarget);
    expect(compactCoreBudget.rendered_bundle).toContain('[CORE_LOGIC_COMPACT] src/service.ts');
    expect(compactCoreBudget.compacted_tokens_estimate).toBeLessThanOrEqual(compactCoreTarget);
  });

  it('resume TESTS_SUMMARY sin compactar CORE_LOGIC cuando el paso 1 basta y soporta múltiples hunks', async () => {
    const multiHunkLines = Array.from({ length: 40 }, (_, i) => `export const c${i} = ${i};`);
    const testLines = Array.from({ length: 20 }, (_, i) => `it('case_${i}', () => { const v = ${i}; });`);
    initGitRepo(tmpDir, {
      'src/multi.ts': multiHunkLines.join('\n') + '\n',
      'tests/multi.unit.ts': testLines.join('\n') + '\n',
    });
    const updatedMulti = [...multiHunkLines];
    updatedMulti[1] = 'export const c1 = 999;';
    updatedMulti[35] = 'export const c35 = 777;';
    writeRepoFile(tmpDir, 'src/multi.ts', updatedMulti.join('\n') + '\n');
    writeRepoFile(
      tmpDir,
      'tests/multi.unit.ts',
      [...testLines, "it('extra_case_a', () => {});", "it('extra_case_b', () => {});"].join('\n') + '\n'
    );
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'feat: two hunks and test summary']);

    const full = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', 4000);
    const fullTokens = full.compacted_tokens_estimate;
    const justUnderFull = Math.max(100, fullTokens - 5);
    const testSummarized = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', justUnderFull);
    expect(testSummarized.rendered_bundle).toContain('[TESTS_SUMMARY] tests/multi.unit.ts');
    expect(testSummarized.rendered_bundle).toContain('extra_case_a');
    expect(testSummarized.rendered_bundle).not.toContain('[CORE_LOGIC_COMPACT]');
  });

  it('redacta secretos en hunks mediante promptGuard.ts y eleva el riesgo a HIGH', async () => {
    initGitRepo(tmpDir, { 'src/config.ts': 'export const cfg = {};\n' });
    const runtimeSecret = ['ghp_', 'A'.repeat(36)].join('');
    writeRepoFile(
      tmpDir,
      'src/config.ts',
      `export const cfg = { token: "${runtimeSecret}" };\n`
    );
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'chore: add config']);

    const result = await inspectAstBlastRadius(tmpDir, 'cfg', 20, {
      changedSinceRef: 'HEAD~1',
      maxTokensBudget: 4000,
    });
    expect(result.diff_bundle?.secret_leak_warning).toBe(true);
    expect(result.diff_bundle?.redacted_occurrences).toBeGreaterThanOrEqual(1);
    expect(result.diff_bundle?.rendered_bundle).toContain('[REDACTED_SECRET]');
    expect(result.diff_bundle?.rendered_bundle).not.toContain(runtimeSecret);
    expect(result.risk_level).toBe('HIGH');
  });

  it('cruza AST graphify-out, emite MISSING_KARATE_API_FEATURE y lo suprime cuando se actualiza *.feature', async () => {
    const graphPayload = {
      nodes: [
        { id: 'n_route', source_file: 'src/routes/orders.ts' },
        { id: 'n_ctrl', source_file: 'src/consumers/dashboard.ts' },
      ],
      links: [{ source: 'n_ctrl', target: 'n_route' }],
    };
    const subGraphPayload = {
      nodes: [
        { id: 's_route', source_file: 'src/api.ts' },
        { id: 's_caller', source_file: 'src/caller.ts' },
      ],
      links: [{ source: 's_caller', target: 's_route' }],
    };
    initGitRepo(tmpDir, {
      'src/routes/orders.ts': 'export const listOrders = () => [];\n',
      'src/consumers/dashboard.ts': 'import { listOrders } from "../routes/orders";\n',
      'subpkg/src/api.ts': 'export const subApi = () => 1;\n',
      'subpkg/src/caller.ts': 'import { subApi } from "./api";\n',
      'graphify-out/graph.json': JSON.stringify(graphPayload),
      'subpkg/graphify-out/graph.json': JSON.stringify(subGraphPayload),
      'mcp-server/graphify-out/graph.json': '{invalid-json',
    });

    writeRepoFile(
      tmpDir,
      'src/routes/orders.ts',
      '@router.get("/orders")\nexport const listOrders = () => ["ok"];\n'
    );
    writeRepoFile(tmpDir, 'subpkg/src/api.ts', 'export const subApi = () => 2;\n');
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'feat: update orders route']);

    const withoutFeature = await inspectAstBlastRadius(tmpDir, 'listOrders', 20, {
      changedSinceRef: 'HEAD~1',
    });
    expect(withoutFeature.diff_bundle?.alerts.map((a) => a.code)).toContain(
      'MISSING_KARATE_API_FEATURE'
    );
    expect(withoutFeature.dependent_files).toContain('src/consumers/dashboard.ts');
    expect(withoutFeature.dependent_files).toContain('subpkg/src/caller.ts');
    expect(withoutFeature.risk_level).toBe('HIGH');

    writeRepoFile(
      tmpDir,
      'test/api_test.feature',
      'Feature: Orders\n  Scenario: List orders\n    * status 200\n'
    );
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'test: add karate scenario']);

    const withFeature = await inspectAstBlastRadius(tmpDir, 'listOrders', 20, {
      changedSinceRef: 'HEAD~2',
    });
    expect(
      withFeature.diff_bundle?.alerts.some((a) => a.code === 'MISSING_KARATE_API_FEATURE')
    ).toBe(false);
  });

  it('evalúa fronteras allowed_globs/forbidden_globs en .agents/ACTIVE_TASK.md y bloquea symlinks externos', async () => {
    initGitRepo(tmpDir, {
      'src/app.ts': 'export const a = 1;\n',
      '.github/workflows/ci.yml': 'name: CI\n',
      '.agents/ACTIVE_TASK.md': [
        '# Active Task',
        '- allowed_globs: ["src/**", ".agents/ACTIVE_TASK.md"]',
        '**forbidden_globs:** .github/workflows/*, secrets/?',
      ].join('\n'),
    });

    writeRepoFile(tmpDir, 'src/app.ts', 'export const a = 2;\n');
    const cleanBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD');
    expect(cleanBundle.boundary_globs?.allowed_globs).toEqual(['src/**', '.agents/ACTIVE_TASK.md']);
    expect(cleanBundle.alerts).toHaveLength(0);

    writeRepoFile(tmpDir, '.github/workflows/ci.yml', 'name: CI v2\n');
    const violatedBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD');
    const alertCodes = violatedBundle.alerts.map((a) => a.code);
    expect(alertCodes).toContain('BOUNDARY_VIOLATION_FORBIDDEN_GLOB');
    expect(alertCodes).toContain('BOUNDARY_VIOLATION_OUTSIDE_ALLOWED_GLOBS');

    const outsideFile = path.join(os.tmpdir(), `outside-task-${Date.now()}.md`);
    fs.writeFileSync(outsideFile, 'allowed_globs: ["*"]', 'utf-8');
    fs.rmSync(path.join(tmpDir, '.agents', 'ACTIVE_TASK.md'));
    fs.symlinkSync(outsideFile, path.join(tmpDir, '.agents', 'ACTIVE_TASK.md'));
    try {
      await expect(buildSemanticDiffBundle(tmpDir, 'HEAD')).rejects.toThrow(/symlink escape/);
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });

  it('cubre utilidades auxiliares y el registro MCP preservando exactamente 18 Tools', async () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('12345')).toBe(2);
    expect(classifyDiffTier('dist/bundle.js', false)).toBe('PRUNED_NOISE');
    expect(classifyDiffTier('assets/logo.png', true)).toBe('PRUNED_NOISE');
    expect(classifyDiffTier('mcp-server/src/server.ts', false)).toBe('CRITICAL_FULL');
    expect(matchesGlobPattern('src/a/b.ts', 'src/**/?.ts')).toBe(true);
    expect(matchesGlobPattern('src/a/b.ts', 'src/')).toBe(true);
    expect(matchesGlobPattern('src/a/b.ts', '')).toBe(false);
    expect(collapseLargeHunk('@@ -1,1 +1,1 @@\n+x').collapsed).toBe(false);
    expect(extractTestCaseNames(['+  Scenario Outline: Pago con tarjeta'])).toEqual([
      'Pago con tarjeta',
    ]);
    expect(parseUnifiedDiffSections('')).toEqual([]);
    expect(parseUnifiedDiffSections('diff --git a/ b/\n')).toEqual([]);
    expect(parseUnifiedDiffSections('diff --git a/bin.dat b/bin.dat\nGIT binary patch\n')[0].isBinary).toBe(
      true
    );
    expect(parseBoundaryGlobs(tmpDir)).toBeUndefined();
    writeRepoFile(
      tmpDir,
      '.agents/ACTIVE_TASK.md',
      '# Active Task\nObjetivo: sin fronteras explícitas\n'
    );
    expect(parseBoundaryGlobs(tmpDir)).toBeUndefined();
    writeRepoFile(
      tmpDir,
      '.agents/ACTIVE_TASK.md',
      'allowed_globs: [src/**, docs/**]\n'
    );
    expect(parseBoundaryGlobs(tmpDir)?.allowed_globs).toEqual(['src/**', 'docs/**']);
    fs.rmSync(path.join(tmpDir, '.agents'), { recursive: true, force: true });

    initGitRepo(tmpDir, {
      'src/security/guard.ts': 'export const guard = true;\n',
    });
    writeRepoFile(tmpDir, 'src/security/guard.ts', 'export const guard = false;\n');
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'chore: update security']);

    const fetcher = new GitHubFetcher({ localOverridePath: tmpDir });
    const merger = new SurgicalMerger();
    const server = createMcpServer({ fetcher, merger });
    attachPromptGuard(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-diff-blast', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(18);
      const callRes = await client.callTool({
        name: 'inspect_ast_blast_radius',
        arguments: {
          project_path: tmpDir,
          target_symbol: 'guard',
          changed_since_ref: 'HEAD~1',
          max_tokens_budget: 2000,
        },
      });
      const textItem = (callRes.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(textItem) as {
        risk_level: string;
        diff_bundle: { base_ref: string; tiers_summary: { CRITICAL_FULL: number } };
      };
      expect(parsed.diff_bundle.base_ref).toBe('HEAD~1');
      expect(parsed.diff_bundle.tiers_summary.CRITICAL_FULL).toBe(1);
      expect(parsed.risk_level).toBe('MEDIUM');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
