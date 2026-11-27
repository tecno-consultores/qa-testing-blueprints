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
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';
import { createMcpServer } from '../src/server.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import {
  inspectAstBlastRadius,
  processCandidateFile,
  type GraphScanContext,
} from '../src/tools/blast-radius.js';
import {
  collectGitArchSignals,
  isFixCommitSubject,
  resolveGitNumstatRenamePath,
} from '../src/utils/git-signals.js';
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

const GIT_EXECUTABLE =
  ['/usr/bin/git', '/bin/git', '/usr/local/bin/git'].find((candidate) => fs.existsSync(candidate)) ??
  '/usr/bin/git';

function git(cwd: string, args: string[]): string {
  return execFileSync(GIT_EXECUTABLE, args, {
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

  it('rechaza traversal, rutas críticas del sistema, raíz tmpdir y escapes por symlink (F2.5)', async () => {
    await expect(inspectAstBlastRadius('../outside', 'greetUser')).rejects.toThrow(
      WorkspacePathValidationError
    );
    await expect(inspectAstBlastRadius('/etc', 'greetUser')).rejects.toThrow(
      WorkspacePathValidationError
    );
    await expect(inspectAstBlastRadius(os.tmpdir(), 'greetUser')).rejects.toThrow(
      WorkspacePathValidationError
    );
    const linkToEtc = path.join(tmpDir, 'etc-escape');
    fs.symlinkSync('/etc', linkToEtc);
    await expect(inspectAstBlastRadius(linkToEtc, 'greetUser')).rejects.toThrow(
      WorkspacePathValidationError
    );
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

    // Leer allowed_globs/forbidden_globs prioritariamente desde session_checkpoint.json y fallback sin globs
    fs.rmSync(path.join(tmpDir, '.agents', 'ACTIVE_TASK.md'));
    writeRepoFile(
      tmpDir,
      '.agents/.cache/session_checkpoint.json',
      JSON.stringify({
        allowed_globs: ['src/**'],
        forbidden_globs: ['.github/**'],
      })
    );
    const fromCheckpoint = await buildSemanticDiffBundle(tmpDir, 'HEAD');
    expect(fromCheckpoint.boundary_globs).toEqual({
      allowed_globs: ['src/**'],
      forbidden_globs: ['.github/**'],
    });
    writeRepoFile(tmpDir, '.agents/.cache/session_checkpoint.json', JSON.stringify({ allowed_globs: [] }));
    const emptyCheckpoint = await buildSemanticDiffBundle(tmpDir, 'HEAD');
    expect(emptyCheckpoint.boundary_globs).toBeUndefined();
  });

  it('cubre utilidades auxiliares y el registro MCP preservando exactamente 20 Tools', async () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('12345')).toBe(2);
    expect(classifyDiffTier('dist/bundle.js', false)).toBe('PRUNED_NOISE');
    expect(classifyDiffTier('assets/logo.png', true)).toBe('PRUNED_NOISE');
    expect(classifyDiffTier('mcp-server/src/server.ts', false)).toBe('CRITICAL_FULL');
    expect(matchesGlobPattern('src/a/b.ts', 'src/**/?.ts')).toBe(true);
    expect(matchesGlobPattern('src/a/b/c/d.ts', 'src/**/**/**/d.ts')).toBe(true);
    expect(matchesGlobPattern('src/a/b.ts', 'src/')).toBe(true);
    expect(matchesGlobPattern('src/a/b.ts', '')).toBe(false);
    expect(parseBoundaryGlobs(tmpDir)).toBeUndefined();
    writeRepoFile(tmpDir, '.agents/.cache/session_checkpoint.json', 'null');
    expect(parseBoundaryGlobs(tmpDir)).toBeUndefined();
    writeRepoFile(tmpDir, '.agents/.cache/session_checkpoint.json', '{corrupt json');
    expect(parseBoundaryGlobs(tmpDir)).toBeUndefined();
    fs.rmSync(path.join(tmpDir, '.agents'), { recursive: true, force: true });
    expect(collapseLargeHunk('@@ -1,1 +1,1 @@\n+x').collapsed).toBe(false);
    expect(extractTestCaseNames(['+  Scenario Outline: Pago con tarjeta'])).toEqual([
      'Pago con tarjeta',
    ]);
    expect(parseUnifiedDiffSections('')).toEqual([]);
    expect(parseUnifiedDiffSections('diff --git a/ b/\n')).toEqual([]);
    expect(parseUnifiedDiffSections('diff --git a/bin.dat b/bin.dat\nGIT binary patch\n')[0]?.isBinary).toBe(
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

    const lockedAstDir = path.join(tmpDir, 'locked-ast-sub');
    fs.mkdirSync(lockedAstDir, { recursive: true });
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
      fs.chmodSync(lockedAstDir, 0o000);
    }
    try {
      const lockedBundle = await buildSemanticDiffBundle(tmpDir, 'HEAD~1');
      expect(lockedBundle.base_ref).toBe('HEAD~1');
    } finally {
      fs.chmodSync(lockedAstDir, 0o700);
      fs.rmSync(lockedAstDir, { recursive: true, force: true });
    }

    const fetcher = new GitHubFetcher({ localOverridePath: tmpDir });
    const merger = new SurgicalMerger();
    const server = createMcpServer({ fetcher, merger });
    attachPromptGuard(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-diff-blast', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(20);
      const callRes = await client.callTool({
        name: 'inspect_ast_blast_radius',
        arguments: {
          project_path: tmpDir,
          target_symbol: 'guard',
          changed_since_ref: 'HEAD~1',
          max_tokens_budget: 2000,
        },
      });
      const firstContent = (callRes.content as Array<{ text: string }>)[0];
      expect(firstContent).toBeDefined();
      const textItem = firstContent?.text ?? '';
      const parsed = JSON.parse(textItem) as {
        risk_level: string;
        diff_bundle: { base_ref: string; tiers_summary: { CRITICAL_FULL: number } };
      };
      expect(parsed.diff_bundle.base_ref).toBe('HEAD~1');
      expect(parsed.diff_bundle.tiers_summary.CRITICAL_FULL).toBe(1);
      expect(parsed.risk_level).toBe('MEDIUM');

      // target_symbol vacío con changed_since_ref no falla ni hace matching regex wildcard
      const diffOnlyRes = await client.callTool({
        name: 'inspect_ast_blast_radius',
        arguments: {
          project_path: tmpDir,
          changed_since_ref: 'HEAD~1',
        },
      });
      expect(diffOnlyRes.isError).not.toBe(true);
      const diffOnlyParsed = JSON.parse(
        ((diffOnlyRes.content as Array<{ text: string }>)[0]?.text ?? '{}')
      ) as { target_symbol: string; dependent_files: string[] };
      expect(diffOnlyParsed.target_symbol).toBe('');
      expect(diffOnlyParsed.dependent_files).toEqual([]);

      const missingTargetRes = await client.callTool({
        name: 'inspect_ast_blast_radius',
        arguments: {
          project_path: tmpDir,
          target_symbol: '   ',
        },
      });
      expect(missingTargetRes.isError).toBe(true);
      expect(((missingTargetRes.content as Array<{ text: string }>)[0]?.text ?? '')).toContain(
        'Se requiere target_symbol'
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('omite escaneo regex cuando graph.json ya resuelve llamadores, ignora vendor/target/coverage/build/graphify-out y tolera símbolo "."', async () => {
    const skipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-blast-skip-'));
    try {
      writeRepoFile(skipDir, 'src/core.ts', 'export function calcRate() { return 1; }\n');
      writeRepoFile(skipDir, 'src/from_graph.ts', 'export const ok = calcRate();\n');
      writeRepoFile(skipDir, 'src/only_disk.ts', 'export const missed = calcRate();\n');
      writeRepoFile(skipDir, 'vendor/lib.ts', 'calcRate();\n');
      writeRepoFile(skipDir, 'target/out.ts', 'calcRate();\n');
      writeRepoFile(skipDir, 'coverage/cov.ts', 'calcRate();\n');
      writeRepoFile(skipDir, 'build/bundle.ts', 'calcRate();\n');
      writeRepoFile(skipDir, 'graphify-out/notes.ts', 'calcRate();\n');
      writeRepoFile(
        skipDir,
        'graphify-out/graph.json',
        JSON.stringify({
          nodes: [
            { id: 'n_core', label: 'calcRate', source_file: 'src/core.ts' },
            { id: 'n_caller', label: 'ok', source_file: 'src/from_graph.ts' },
          ],
          links: [{ source: 'n_caller', target: 'n_core', relation: 'calls' }],
        })
      );

      const astRes = await inspectAstBlastRadius(skipDir, 'calcRate');
      expect(astRes.dependent_files).toEqual(['src/from_graph.ts']);
      expect(astRes.dependent_files).not.toContain('src/only_disk.ts');
      expect(astRes.dependent_files).not.toContain('vendor/lib.ts');
      expect(astRes.dependent_files).not.toContain('graphify-out/notes.ts');

      const dotRes = await inspectAstBlastRadius(skipDir, '.');
      expect(dotRes.dependent_files).toEqual([]);

      await expect(inspectAstBlastRadius(skipDir, '   ')).rejects.toThrow('Se requiere target_symbol');

      writeRepoFile(skipDir, 'sub/graph.json', JSON.stringify({ nodes: [], links: [] }));
      writeRepoFile(skipDir, 'docs/GRAPH_REPORT.md', '# Custom report\n');
      const nonGraphifyArtifacts = await inspectAstBlastRadius(skipDir, 'calcRate');
      expect(nonGraphifyArtifacts.ast_graph_files).toContain('sub/graph.json');
      expect(nonGraphifyArtifacts.graph_reports).toContain('docs/GRAPH_REPORT.md');
    } finally {
      fs.rmSync(skipDir, { recursive: true, force: true });
    }
  });

  it('evita falsos positivos con target_symbol "." y changed_since_ref, y cubre guard en processCandidateFile', async () => {
    initGitRepo(tmpDir, {
      'src/alpha.ts': 'export const alpha = 1;\n',
      'src/beta.ts': "export const beta = 'a.b';\n",
    });
    writeRepoFile(tmpDir, 'src/alpha.ts', 'export const alpha = 2;\n');
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'chore: update alpha']);

    const diffDotRes = await inspectAstBlastRadius(tmpDir, '.', undefined, {
      changedSinceRef: 'HEAD~1',
    });
    expect(diffDotRes.target_symbol).toBe('.');
    expect(diffDotRes.dependent_files).toEqual([]);
    expect(diffDotRes.diff_bundle?.files.map((f) => f.file)).toContain('src/alpha.ts');

    const makeCtx = (cleanSymbol: string): GraphScanContext => ({
      cleanSymbol,
      dependentFiles: new Set<string>(),
      suggestedTests: new Set<string>(),
      graphFiles: [],
      graphReports: [],
      declaringFiles: new Set<string>(),
      declaringLocations: new Set<string>(),
      outgoingDependencies: new Set<string>(),
    });

    const dotCtx = makeCtx('.');
    processCandidateFile({
      fullPath: path.join(tmpDir, 'src/beta.ts'),
      rel: 'src/beta.ts',
      ext: '.ts',
      ctx: dotCtx,
    });
    expect(dotCtx.dependentFiles.size).toBe(0);
    expect(dotCtx.suggestedTests.size).toBe(0);

    const betaCtx = makeCtx('beta');
    processCandidateFile({
      fullPath: path.join(tmpDir, 'src/beta.ts'),
      rel: 'src/beta.ts',
      ext: '.ts',
      ctx: betaCtx,
    });
    expect(Array.from(betaCtx.dependentFiles)).toEqual(['src/beta.ts']);

    const missingCtx = makeCtx('beta');
    processCandidateFile({
      fullPath: path.join(tmpDir, 'src/missing.ts'),
      rel: 'src/missing.ts',
      ext: '.ts',
      ctx: missingCtx,
    });
    expect(missingCtx.dependentFiles.size).toBe(0);
  });

  it('preserva rutas UTF-8 no-ASCII (api/routes/café.py y docs/guía.md) sin escapes octales (core.quotePath=false)', async () => {
    initGitRepo(tmpDir, { 'README.md': '# Base\n' });
    writeRepoFile(tmpDir, 'api/routes/café.py', '@router.get("/café")\ndef get_cafe():\n    return {"ok": True}\n');
    writeRepoFile(tmpDir, 'docs/guía.md', '# Guía\nContenido inicial\n');
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-m', 'feat: add utf8 paths']);

    const bundle = await buildSemanticDiffBundle(tmpDir, 'HEAD~1', 4000);
    const files = bundle.files.map((f) => f.file);
    expect(files).toContain('api/routes/café.py');
    expect(files).toContain('docs/guía.md');
    expect(files.some((f) => f.includes('303'))).toBe(false);
    const apiEntry = bundle.files.find((f) => f.file === 'api/routes/café.py');
    const docEntry = bundle.files.find((f) => f.file === 'docs/guía.md');
    expect(apiEntry?.tier).toBe('CRITICAL_FULL');
    expect(docEntry?.tier).toBe('CORE_LOGIC');
  });

  it('mina señales longitudinales Git (renames -M, regex fix, co-cambio y bus factor) e integra include_git_signals en MCP', async () => {
    expect(resolveGitNumstatRenamePath('src/{old.ts => new.ts}')).toBe('src/new.ts');
    expect(resolveGitNumstatRenamePath('old.ts => new.ts')).toBe('new.ts');
    expect(resolveGitNumstatRenamePath('a//{ => sub}/f.ts')).toBe('a/sub/f.ts');
    expect(resolveGitNumstatRenamePath('/a/{broken/f.ts')).toBe('a/{broken/f.ts');
    expect(resolveGitNumstatRenamePath('a/{b => c}/d/')).toBe('a/c/d');
    expect(resolveGitNumstatRenamePath('src/{unclosed => new')).toBe('src/{unclosed => new');
    expect(resolveGitNumstatRenamePath('src/{foo}/a => b')).toBe('src/{foo}/a => b');
    expect(isFixCommitSubject('test: add fixture helpers')).toBe(false);
    expect(isFixCommitSubject('chore: update fixtures')).toBe(false);
    expect(isFixCommitSubject('fix(auth): validate jwt')).toBe(true);
    expect(isFixCommitSubject('hotfix: corrige calculo')).toBe(true);

    // 1. Non-git dir -> detected=false
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-nogit-'));
    try {
      const noGitSignals = await collectGitArchSignals(nonGit);
      expect(noGitSignals.detected).toBe(false);
      expect(noGitSignals.commits_analyzed).toBe(0);
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }

    // 2. Empty git repo -> detected=true, commits_analyzed=0
    const emptyGit = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-emptygit-'));
    try {
      git(emptyGit, ['init', '-q']);
      const emptySignals = await collectGitArchSignals(emptyGit);
      expect(emptySignals.detected).toBe(true);
      expect(emptySignals.commits_analyzed).toBe(0);
    } finally {
      fs.rmSync(emptyGit, { recursive: true, force: true });
    }

    // 3. Real git repo with 11+ commits, lockfile/snap ignored, rename -M, cross-module coupling, bus factor & low-confidence pair
    initGitRepo(tmpDir, {
      'README.md': '# Root\n',
      'fastapi/src/api/page.ts': 'export const p = 0;\n',
      'src/orders/cart.ts': 'export function calcCart() { return 1; }\n',
      'src/billing/invoice.ts': 'export function bill() { return 1; }\n',
      'src/weak/low.ts': 'export const w = 0;\n',
      'tests/billing.unit.ts': 'export const ok = true;\n',
    });
    for (let i = 2; i <= 10; i += 1) {
      writeRepoFile(tmpDir, 'README.md', `# Root ${i}\n`);
      writeRepoFile(tmpDir, 'fastapi/src/api/page.ts', `export const p = ${i};\n`);
      writeRepoFile(tmpDir, 'src/orders/cart.ts', `export function calcCart() { return ${i}; }\n`);
      writeRepoFile(tmpDir, 'src/billing/invoice.ts', `export function bill() { return ${i}; }\n`);
      writeRepoFile(tmpDir, 'tests/billing.unit.ts', `export const ok = ${i};\n`);
      if (i <= 4) {
        writeRepoFile(tmpDir, 'src/weak/low.ts', `export const w = ${i};\n`);
      }
      writeRepoFile(tmpDir, 'pnpm-lock.yaml', `lock: ${i}\n`);
      writeRepoFile(tmpDir, 'snapshots/ui.snap', `snap: ${i}\n`);
      git(tmpDir, ['add', '.']);
      const msg = i % 2 === 0 ? `fix(billing): patch ${i}` : `feat: step ${i}`;
      git(tmpDir, ['commit', '-q', '-m', msg]);
    }
    // 5 commits by a second author on src/weak/low.ts & src/shared/split.ts -> bus factor < 90% and low confidence
    for (let j = 1; j <= 6; j += 1) {
      writeRepoFile(tmpDir, 'src/weak/low.ts', `export const w = ${100 + j};\n`);
      git(tmpDir, ['add', '.']);
      execFileSync(GIT_EXECUTABLE, ['commit', '-q', '-m', `feat: second author ${j}`], {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Second Author',
          GIT_AUTHOR_EMAIL: 'second@example.invalid',
          GIT_COMMITTER_NAME: 'Second Author',
          GIT_COMMITTER_EMAIL: 'second@example.invalid',
        },
      });
    }
    git(tmpDir, ['mv', 'src/billing/invoice.ts', 'src/billing/invoice_v2.ts']);
    writeRepoFile(tmpDir, 'src/billing/invoice_v2.ts', 'export function bill() { return 99; }\n');
    git(tmpDir, ['add', '.']);
    git(tmpDir, ['commit', '-q', '-m', 'refactor: rename invoice']);

    // Add 2 commits of src/orders/cart.ts + src/mid/pair.ts (3 total cochanges out of 12/3 -> wait: we want cochanges=3, min=6 => conf=0.5 < 0.6)
    // and src/two/only.ts with only 2 cochanges (< minCochanges=3), plus empty/short mock git log records
    for (let k = 1; k <= 2; k += 1) {
      writeRepoFile(tmpDir, 'src/two/only.ts', `export const t = ${k};\n`);
      writeRepoFile(tmpDir, 'src/orders/cart.ts', `export function calcCart() { return ${50 + k}; }\n`);
      git(tmpDir, ['add', '.']);
      git(tmpDir, ['commit', '-q', '-m', `chore: two ${k}`]);
    }
    for (let m = 1; m <= 3; m += 1) {
      writeRepoFile(tmpDir, 'src/mid/pair.ts', `export const m = ${m};\n`);
      if (m <= 3) {
        writeRepoFile(tmpDir, 'src/orders/cart.ts', `export function calcCart() { return ${70 + m}; }\n`);
      }
      git(tmpDir, ['add', '.']);
      git(tmpDir, ['commit', '-q', '-m', `chore: mid ${m}`]);
    }
    for (let m2 = 1; m2 <= 3; m2 += 1) {
      writeRepoFile(tmpDir, 'src/mid/pair.ts', `export const m = ${10 + m2};\n`);
      git(tmpDir, ['add', '.']);
      git(tmpDir, ['commit', '-q', '-m', `chore: mid solo ${m2}`]);
    }

    const signals = await collectGitArchSignals(tmpDir);
    expect(signals.detected).toBe(true);
    expect(signals.commits_analyzed).toBe(25);
    expect(signals.hotspots.some((h) => h.file === 'src/orders/cart.ts')).toBe(true);
    expect(signals.hotspots.every((h) => h.file !== 'pnpm-lock.yaml' && !h.file.endsWith('.snap'))).toBe(true);
    expect(signals.temporal_coupling_pairs.some((p) => p.cross_module && p.cochanges >= 3)).toBe(true);
    expect(signals.temporal_coupling_pairs.every((p) => p.confidence >= 0.5)).toBe(true);
    expect(signals.temporal_coupling_pairs.some((p) => p.file_a === 'src/mid/pair.ts' || p.file_b === 'src/mid/pair.ts')).toBe(true);
    expect(signals.temporal_coupling_pairs.some((p) => p.file_a === 'src/two/only.ts' || p.file_b === 'src/two/only.ts')).toBe(false);
    expect(signals.bus_factor_alerts.some((a) => a.module === 'src/orders' && a.top_author_pct === 100)).toBe(true);
    expect(signals.bus_factor_alerts.some((a) => a.module === 'src/weak')).toBe(false);

    // Mocked malformed git log record exercises header.length !== 5 guard
    const mockMalformedExec = ((
      _cmd: string,
      args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, res: { stdout: string; stderr: string }) => void
    ) => {
      const out = args.includes('rev-parse')
        ? `${tmpDir}\n`
        : '\x1ebad_header_only\n\x1eH\x1fh\x1f2026-01-01\x1fDev\x1fchore: ok\n\nmalformed_numstat\n1\t2\tdist/bundle.js\n-\t-\tassets/logo.png\n1\t0\troot.txt\n';
      cb(null, { stdout: out, stderr: '' });
    }) as unknown as typeof import('node:child_process').execFile;
    const malformedSignals = await collectGitArchSignals(tmpDir, { execFileFn: mockMalformedExec });
    expect(malformedSignals.commits_analyzed).toBe(1);
    expect(malformedSignals.hotspots.map((h) => h.file)).toEqual(['assets/logo.png', 'root.txt']);

    // minConfidence: 0.99 exercises confidence < 0.6 filter in blast-radius.ts + aborted signal fallback
    const aborted = new AbortController();
    aborted.abort();
    const abortedSignals = await collectGitArchSignals(tmpDir, { signal: aborted.signal });
    expect(abortedSignals.detected).toBe(false);

    // Graph with calcCart in src/orders/cart.ts -> includeGitSignals adds coupled files & tests (>=0.6) and skips src/mid/pair.ts (0.5 < 0.6)
    writeRepoFile(
      tmpDir,
      'graphify-out/graph.json',
      JSON.stringify({
        nodes: [{ id: 'n_cart', label: 'calcCart', source_file: 'src/orders/cart.ts' }],
        links: [],
      })
    );
    const combined = await inspectAstBlastRadius(tmpDir, 'calcCart', 20, {
      includeGitSignals: true,
    });
    expect(combined.git_signals?.detected).toBe(true);
    expect(combined.dependent_files).toContain('tests/billing.unit.ts');
    expect(combined.dependent_files).not.toContain('src/mid/pair.ts');
    expect(combined.suggested_tests_to_run).toContain('tests/billing.unit.ts');

    // Empty target_symbol + include_git_signals via live InMemoryTransport MCP tool call
    const server = createMcpServer({
      fetcher: new GitHubFetcher({ localOverridePath: tmpDir }),
      merger: new SurgicalMerger(),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-git-signals', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const res = await client.callTool({
        name: 'inspect_ast_blast_radius',
        arguments: { project_path: tmpDir, include_git_signals: true },
      });
      expect(res.isError).not.toBe(true);
      const parsed = JSON.parse(((res.content as Array<{ text: string }>)[0]?.text ?? '{}')) as {
        target_symbol: string;
        git_signals?: { detected: boolean; commits_analyzed: number };
      };
      expect(parsed.target_symbol).toBe('');
      expect(parsed.git_signals?.detected).toBe(true);
      expect(parsed.git_signals?.commits_analyzed).toBe(25);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
