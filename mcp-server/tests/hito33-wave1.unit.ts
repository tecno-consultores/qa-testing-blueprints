// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { execFile } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultInteractiveTierPrompt,
  runQuickstart,
} from '../src/cli/quickstart.js';
import type { GitHubFetcher } from '../src/services/github-fetcher.js';
import {
  CANONICAL_GITIGNORE_ENTRIES,
  DEFAULT_QA_11X_TIER,
  QA_11X_CONFIG_FILENAME,
  QA_11X_CONFIG_SCHEMA_VERSION,
  buildQa11xConfigV3Payload,
  deriveActiveGatesForTier,
  findMissingCanonicalGitignoreEntries,
  formatQa11xStatusBanner,
  isTierAtLeast,
  parseStandardTier,
  readQa11xConfig,
  writeQa11xConfig,
} from '../src/services/qa11xConfig.js';
import {
  buildCanonicalAiderBridgeBlock,
  buildCanonicalMarkdownBridgeBlock,
  detectConnectorLang,
  detectExistingStacks,
  hasYamlReadKeyOutsideBridge,
} from '../src/services/agents-connector.js';
import { initOrAppendAgentsMd } from '../src/tools/initOrAppendAgentsMd.js';
import { reconcileAgentsGovernance } from '../src/cli/reconcile-agents.js';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import {
  evaluateDeclarativeBoundaryEdge,
  loadProjectBoundaryRules,
  validateBilingualRoadmapFiles,
  validateSingleRoadmapFile,
} from '../src/tools/certifyHelpers.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import { CORE_TOOLSET_NAMES, resolveAllowedToolNames } from '../src/server/toolsetFilter.js';
import { auditTestPyramidGaps } from '../src/tools/test-pyramid-auditor.js';
import { runDoctorCli } from '../src/cli/doctor.js';
import { runCertifyCli } from '../src/cli/certify-cli.js';
import { runAuditCli } from '../src/cli/audit-cli.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

describe('Milestone 33 Wave 1 — Config v3, Hygiene, Gate Parity & Tier Enforcement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-hito33-w1-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('REQ-33-01: parses v1/v2/v3 .qa-11x.json, defaults to standard, and syncs canonical .gitignore', () => {
    expect(DEFAULT_QA_11X_TIER).toBe('standard');
    expect(parseStandardTier('enterprise')).toBe('enterprise');
    expect(parseStandardTier('gold')).toBeNull();
    expect(isTierAtLeast('enterprise', 'standard')).toBe(true);
    expect(isTierAtLeast('starter', 'standard')).toBe(false);
    expect(deriveActiveGatesForTier('starter')).toHaveLength(3);
    expect(deriveActiveGatesForTier('standard')).toHaveLength(9);
    expect(deriveActiveGatesForTier('enterprise')).toHaveLength(17);
    expect(formatQa11xStatusBanner('standard', 'MICRO_CHANGE')).toBe(
      '[QA-11X | Tier: standard | Path: MICRO_CHANGE]'
    );

    // Missing config defaults to standard + unconfirmed
    const emptyCfg = readQa11xConfig(tmpDir);
    expect(emptyCfg.exists).toBe(false);
    expect(emptyCfg.effectiveTier).toBe('standard');
    expect(emptyCfg.tierConfirmedByUser).toBe(false);

    // Legacy v2 config with detectedStacks + activeGates migrates cleanly on write
    writeFile(
      tmpDir,
      QA_11X_CONFIG_FILENAME,
      JSON.stringify({
        schemaVersion: '2.0.0',
        tier: 'starter',
        lang: 'es',
        detectedStacks: ['python', 'vue3'],
        activeGates: ['secret-scan'],
        governanceDocs: { 'ROADMAP.md': 'declined', 'INVALID.md': 'bogus' },
        customOwner: 'team-x',
      })
    );
    const legacy = readQa11xConfig(tmpDir);
    expect(legacy.exists).toBe(true);
    expect(legacy.effectiveTier).toBe('starter');
    expect(legacy.tierConfirmedByUser).toBe(false);
    expect(legacy.stacks).toEqual(['python', 'vue3']);
    expect(legacy.governanceDocs).toEqual({ 'ROADMAP.md': 'declined' });

    const written = writeQa11xConfig(tmpDir, {
      tier: 'standard',
      tierConfirmedByUser: true,
      lang: 'es',
      stacks: ['python', 'vue3'],
      governanceDocs: { 'TESTING.md': 'enabled' },
      existingRaw: legacy.raw,
    });
    expect(written.canonical.schemaVersion).toBe(QA_11X_CONFIG_SCHEMA_VERSION);
    const disk = JSON.parse(fs.readFileSync(path.join(tmpDir, QA_11X_CONFIG_FILENAME), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(disk.activeGates).toBeUndefined();
    expect(disk.detectedStacks).toBeUndefined();
    expect(disk.customOwner).toBe('team-x');
    expect(disk.governanceDocs).toEqual({ 'ROADMAP.md': 'declined', 'TESTING.md': 'enabled' });

    // Force rebuild strips custom keys
    const forced = buildQa11xConfigV3Payload({
      tier: 'enterprise',
      tierConfirmedByUser: true,
      lang: 'en',
      stacks: ['fastapi'],
      existingRaw: disk,
      force: true,
    });
    const forcedParsed = JSON.parse(forced.serialized) as Record<string, unknown>;
    expect(forcedParsed.customOwner).toBeUndefined();

    // Canonical .gitignore missing detection
    expect(findMissingCanonicalGitignoreEntries(null)).toHaveLength(CANONICAL_GITIGNORE_ENTRIES.length);
    const fullGitignore = CANONICAL_GITIGNORE_ENTRIES.join('\n');
    expect(findMissingCanonicalGitignoreEntries(fullGitignore)).toEqual([]);
  });

  it('REQ-33-01: prevents bridge/lang/stacks ping-pong between init-agents and reconcile-agents', async () => {
    writeFile(tmpDir, 'pyproject.toml', '[project]\ndependencies=["fastapi"]\n');
    writeFile(tmpDir, 'nested/sub/old.11x-backup', 'legacy backup\n');

    const mdBridge = buildCanonicalMarkdownBridgeBlock(['Claude Code'], 'fastapi', 'es');
    expect(detectConnectorLang(mdBridge)).toBe('es');
    expect(detectExistingStacks(mdBridge)).toEqual(['fastapi']);

    const aiderWithoutRead = buildCanonicalAiderBridgeBlock('model: sonnet\n', 'en');
    expect(aiderWithoutRead).toContain('read:');
    expect(hasYamlReadKeyOutsideBridge('read:\n  - README.md\n')).toBe(true);
    const aiderWithRead = buildCanonicalAiderBridgeBlock('read:\n  - README.md\n', 'en');
    expect(aiderWithRead).toContain('Existing read: key detected');

    await initOrAppendAgentsMd({
      projectPath: tmpDir,
      lang: 'es',
      agents: ['claude-code'],
      dryRun: false,
    });
    const claudeBefore = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    // Re-running init-agents without lang preserves 'es'
    await initOrAppendAgentsMd({
      projectPath: tmpDir,
      agents: ['claude-code'],
      dryRun: false,
    });
    expect(detectConnectorLang(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8'))).toBe('es');

    // Reconcile must keep CLAUDE.md byte-identical and consolidate nested backup recursively
    await reconcileAgentsGovernance({ projectPath: tmpDir, dryRun: false });
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toBe(claudeBefore);
    expect(fs.existsSync(path.join(tmpDir, 'nested/sub/old.11x-backup'))).toBe(false);
  });

  it('REQ-33-02: clean_workspace_11x preserves coverage in normal mode and BREAKER-42 even in deep_prune', async () => {
    writeFile(tmpDir, '.agents/.cache/coverage/py.xml', '<coverage/>');
    writeFile(tmpDir, '.agents/.cache/sarif/scan.sarif', '{}');
    writeFile(tmpDir, '.agents/.cache/certify_state.json', '{"sessions":{}}');
    writeFile(tmpDir, '.agents/.cache/session_checkpoint.json', '{"status":"IN_PROGRESS"}');
    writeFile(tmpDir, '.agents/.qa-evidence.json', '{"lint":true}');
    writeFile(tmpDir, '.agents/proposals/p1.md', '# prop');
    writeFile(tmpDir, '.pytest_cache/v', 'x');

    const normalRes = await cleanWorkspace11x(tmpDir, false, false);
    expect(normalRes.removed_targets).toContain('.pytest_cache');
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/coverage/py.xml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/certify_state.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.qa-evidence.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents/proposals/p1.md'))).toBe(true);

    const deepRes = await cleanWorkspace11x(tmpDir, false, true);
    expect(deepRes.deep_prune).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/coverage'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/sarif'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/certify_state.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents/.cache/session_checkpoint.json'))).toBe(true);
  });

  it('REQ-33-04: validates boundaries.json, full ROADMAP parity, React/ORM Gate 4/7 fixes, runner fallback, and toolsetFilter', async () => {
    // 1. Declarative boundaries.json evaluation
    writeFile(
      tmpDir,
      '.agents/boundaries.json',
      JSON.stringify({
        rules_sets: [
          { kind: 'layers', root: 'src', layers: ['api', 'domain', 'infra'] },
          { kind: 'independence', modules: ['mod-a', 'mod-b'] },
          { kind: 'forbidden', rules: [{ source: 'src/utils', forbidden: ['src/cli'] }] },
        ],
      })
    );
    const loadedBounds = loadProjectBoundaryRules(tmpDir);
    expect(loadedBounds.error).toBeUndefined();
    expect(
      evaluateDeclarativeBoundaryEdge(loadedBounds.rules, 'src/infra/db.ts', 'src/api/ctrl.ts', 'g.json')
    ).toHaveLength(1);
    expect(
      evaluateDeclarativeBoundaryEdge(loadedBounds.rules, 'mod-a/x.ts', 'mod-b/y.ts', 'g.json')
    ).toHaveLength(1);
    expect(
      evaluateDeclarativeBoundaryEdge(loadedBounds.rules, 'src/utils/u.ts', 'src/cli/c.ts', 'g.json')
    ).toHaveLength(1);

    // 2. Full ROADMAP parity (0% vs [x], partial drift, icon mismatch, bilingual mismatch)
    writeFile(
      tmpDir,
      'ROADMAP.md',
      [
        '| **Milestone 1** | A | Spec | ⏳ Pending | `0%` |',
        '| **Milestone 2** | B | Spec | 🚧 In Progress | `80%` |',
        '## ✅ Milestone 1: A',
        '- [x] Done task',
        '## ⏳ Milestone 2: B',
        '- [x] Task 1',
        '- [ ] Task 2',
        '- [ ] Task 3',
        '## ✅ Milestone 9: Orphan',
        '- [x] Extra',
      ].join('\n')
    );
    const roadmapErrors = validateSingleRoadmapFile(path.join(tmpDir, 'ROADMAP.md'), 'ROADMAP.md');
    expect(roadmapErrors.some((e) => e.includes('Milestone/Hito 1'))).toBe(true);
    expect(roadmapErrors.some((e) => e.includes('Milestone/Hito 2'))).toBe(true);
    expect(roadmapErrors.some((e) => e.includes('sin fila'))).toBe(true);

    writeFile(
      tmpDir,
      'ROADMAP.es.md',
      ['| **Hito 1** | A | Spec | ✅ Completado | `100%` |', '## ✅ Hito 1: A', '- [x] Hecho'].join('\n')
    );
    const bilingualErrors = validateBilingualRoadmapFiles(
      path.join(tmpDir, 'ROADMAP.md'),
      path.join(tmpDir, 'ROADMAP.es.md')
    );
    expect(bilingualErrors.some((e) => e.includes('Desfase bilingüe'))).toBe(true);

    // 3. Gate 4 React exemptions + Gate 7 non-SQLAlchemy models -> SKIPPED
    const reactProj = path.join(tmpDir, 'react-proj');
    writeFile(reactProj, 'TESTING.md', '# Testing\n');
    writeFile(reactProj, 'CHANGELOG.md', '## [Unreleased]\n- ok\n');
    writeFile(reactProj, 'SECURITY.md', '# Security\n');
    writeFile(reactProj, 'src/components/main.tsx', 'export const main = 1;\n');
    writeFile(reactProj, 'src/components/index.tsx', 'export * from "./main";\n');
    writeFile(reactProj, 'src/components/useAuth.tsx', 'export function useAuth() { return true; }\n');
    writeFile(reactProj, 'src/models/user.ts', 'export interface User { id: string }\n');
    writeFile(reactProj, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');

    const reactGate = await certify11xGate(reactProj, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(reactGate.check_statuses?.zero_orphan_ui_components).toBe('SKIPPED');
    expect(reactGate.check_statuses?.orm_alembic_parity).toBe('SKIPPED');

    // 4. Ephemeral runner fallback: make qa-lint -> make lint when Makefile defines lint:
    const mkProj = path.join(tmpDir, 'mk-fallback');
    writeFile(mkProj, 'Makefile', 'lint:\n\t@echo ok\n');
    const seenTargets: string[] = [];
    const mockExec = ((_file: string, args: readonly string[], _opts: unknown, cb: (e: null, out: { stdout: string; stderr: string }) => void) => {
      seenTargets.push(args.join(' '));
      cb(null, { stdout: 'ok', stderr: '' });
    }) as unknown as typeof execFile;
    await runEphemeralQa(mkProj, 'lint', 30, { execFileFn: mockExec, skipIfDocsOnly: false });
    expect(seenTargets[0]).toBe('lint');

    // 5. PHP Compose fallback uses php -d allow_url_fopen=1
    const phpProj = path.join(tmpDir, 'php-proj');
    writeFile(phpProj, 'composer.json', '{"name":"acme/php"}');
    writeFile(phpProj, 'docker-compose.qa.yml', 'services:\n  qa-php:\n    image: php:8.4\n');
    const phpArgsSeen: string[] = [];
    const mockPhpExec = ((_file: string, args: readonly string[], _opts: unknown, cb: (e: null, out: { stdout: string; stderr: string }) => void) => {
      phpArgsSeen.push(args.join(' '));
      cb(null, { stdout: 'ok', stderr: '' });
    }) as unknown as typeof execFile;
    await runEphemeralQa(phpProj, 'lint', 30, { execFileFn: mockPhpExec, skipIfDocsOnly: false });
    expect(phpArgsSeen.join(' ')).toContain('allow_url_fopen=1');

    // 6. ToolsetFilter core & enterprise CALM auto activation
    expect(CORE_TOOLSET_NAMES.has('fetch_blueprint_bundle')).toBe(true);
    expect(CORE_TOOLSET_NAMES.has('init_or_append_agents_md')).toBe(true);
    expect(CORE_TOOLSET_NAMES.has('reconcile_agents_governance')).toBe(true);
    expect(CORE_TOOLSET_NAMES.has('propose_skill_evolution_pr')).toBe(true);

    const entProj = path.join(tmpDir, 'ent-toolset');
    writeFile(entProj, '.qa-11x.json', JSON.stringify({ tier: 'enterprise' }));
    const autoEntTools = resolveAllowedToolNames('auto', entProj);
    expect(autoEntTools?.has('validate_calm_architecture')).toBe(true);
  });

  it('REQ-33-06: scales certify11xGate, auditTestPyramidGaps, and CLIs proportionally by tier and prints status banner', async () => {
    // 1. Starter project with no TESTING/CHANGELOG/SECURITY/AST/ORM passes certify11xGate
    const starterProj = path.join(tmpDir, 'starter-proj');
    writeFile(starterProj, '.qa-11x.json', JSON.stringify({ schemaVersion: 3, tier: 'starter', tierConfirmedByUser: true }));
    writeFile(starterProj, 'src/app.ts', 'export const ok = 1;\n');
    writeFile(starterProj, 'package.json', JSON.stringify({ name: 'starter-app', dependencies: { express: '^5.0.0' } }));
    writeFile(starterProj, '.npmrc', 'ignore-scripts=true\n');

    const starterGate = await certify11xGate(starterProj, {
      updateOptions: { allowNetworkCheck: false },
    });
    expect(starterGate.gate_passed).toBe(true);
    expect(starterGate.effective_tier).toBe('starter');
    expect(starterGate.tier_confirmed_by_user).toBe(true);
    expect(starterGate.qa_11x_banner).toBe('[QA-11X | Tier: starter | Path: FULL_11X]');
    expect(starterGate.check_statuses?.ast_topology_clean).toBe('SKIPPED');
    expect(starterGate.check_statuses?.documentation_synced).toBe('SKIPPED');

    const starterPyramid = await auditTestPyramidGaps(starterProj);
    expect(starterPyramid.effective_tier).toBe('starter');
    expect(starterPyramid.qa_11x_banner).toBe('[QA-11X | Tier: starter | Path: AUTO]');
    expect(starterPyramid.layers_audit.find((l) => l.layer_number === 1)?.required_for_tier).toBe(true);
    expect(starterPyramid.layers_audit.find((l) => l.layer_number === 3)?.required_for_tier).toBe(false);

    // 2. Enterprise project without architecture/*.calm.json fails certify11xGate
    const entProj = path.join(tmpDir, 'enterprise-proj');
    writeFile(entProj, '.qa-11x.json', JSON.stringify({ schemaVersion: 3, tier: 'enterprise', tierConfirmedByUser: true }));
    writeFile(entProj, 'TESTING.md', '# Testing\n');
    writeFile(entProj, 'CHANGELOG.md', '## [Unreleased]\n- ok\n');
    writeFile(entProj, 'SECURITY.md', '# Security\n');
    writeFile(entProj, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');

    const entGate = await certify11xGate(entProj, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(entGate.gate_passed).toBe(false);
    expect(entGate.blockers.some((b) => b.includes('FINOS CALM'))).toBe(true);

    // 3. Doctor, Certify, and Audit CLIs surface the QA-11X status banner
    const fakeHome = path.join(tmpDir, 'fake-home');
    fs.mkdirSync(fakeHome, { recursive: true });
    const docRes = await runDoctorCli(['--dir', starterProj, '--offline'], {
      cwd: starterProj,
      homeDir: fakeHome,
      dockerProbeFn: () => '28.0.0',
    });
    expect(docRes.output).toContain('[QA-11X | Tier: starter | Path: AUTO]');

    const certRes = await runCertifyCli([starterProj, '--offline'], {
      cwd: starterProj,
      homeDir: fakeHome,
    });
    expect(certRes.exitCode).toBe(0);
    expect(certRes.output).toContain('[QA-11X | Tier: starter | Path: FULL_11X]');

    const audRes = await runAuditCli([starterProj, '--mode', 'security'], { cwd: starterProj });
    expect(audRes.output).toContain('[QA-11X | Tier: starter | Path: FULL_11X]');
  });

  it('REQ-33-01: install-skill --target auto falls back to $HOME/.agents/skills without polluting repo', async () => {
    const emptyHome = path.join(tmpDir, 'empty-home');
    const consumerWs = path.join(tmpDir, 'consumer-ws');
    fs.mkdirSync(emptyHome, { recursive: true });
    fs.mkdirSync(consumerWs, { recursive: true });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      await runInstallSkillCli(['--target', 'auto', '--dry-run'], undefined, {
        cwd: consumerWs,
        homeDir: emptyHome,
      });
    } finally {
      console.log = origLog;
    }
    expect(logs.join('\n')).toContain(path.join(emptyHome, '.agents', 'skills'));
    expect(fs.existsSync(path.join(consumerWs, '.agents', 'skills'))).toBe(false);
  });

  it('Wave 1 full diff-coverage: qa11xConfig, quickstart TTY/dry-run, install-skill reconcile, runner EISDIR, certify-gate & certifyHelpers edge cases', async () => {
    // 1. qa11xConfig preserved + dryRun planned
    const cfgDir = path.join(tmpDir, 'cfg-edge');
    fs.mkdirSync(cfgDir, { recursive: true });
    const firstWrite = writeQa11xConfig(cfgDir, {
      tier: 'standard',
      tierConfirmedByUser: true,
      lang: 'es',
      stacks: ['python'],
    });
    expect(firstWrite.action).toBe('created');
    const sameWrite = writeQa11xConfig(cfgDir, {
      tier: 'standard',
      tierConfirmedByUser: true,
      lang: 'es',
      stacks: ['python'],
    });
    expect(sameWrite.action).toBe('preserved');
    const dryWrite = writeQa11xConfig(
      cfgDir,
      { tier: 'enterprise', tierConfirmedByUser: true, lang: 'es', stacks: ['python'] },
      { dryRun: true }
    );
    expect(dryWrite.action).toBe('planned');

    // 2. quickstart dry-run .gitignore planned + defaultInteractiveTierPrompt with PassThrough streams
    const qsDir = path.join(tmpDir, 'qs-dry');
    fs.mkdirSync(path.join(qsDir, '.git'), { recursive: true });
    writeFile(qsDir, 'pyproject.toml', '[project]\nname="qs"\n');
    const qsDry = await runQuickstart({ projectPath: qsDir, dryRun: true, tier: 'standard' });
    expect(qsDry.files.some((f) => f.relativePath === '.gitignore' && f.action === 'planned')).toBe(true);

    const mockIn = new PassThrough();
    const mockOut = new PassThrough();
    const promptPromise = defaultInteractiveTierPrompt('Tier? ', mockIn, mockOut);
    mockIn.write('2\n');
    mockIn.end();
    expect(await promptPromise).toBe('2');

    // 3. install-skill --include-scripts --reconcile consolidates loose .11x-backup
    const recWs = path.join(tmpDir, 'inst-rec-ws');
    const recHome = path.join(tmpDir, 'inst-rec-home');
    fs.mkdirSync(recWs, { recursive: true });
    fs.mkdirSync(recHome, { recursive: true });
    writeFile(recWs, '.agents/scripts/demo.sh', '#!/bin/sh\necho old\n');
    const fakeFetcher = {
      fetchManifest: () =>
        Promise.resolve({
          blueprint_version: '3.9.0',
          agent_governance_files: [
            { path: '.agents/skills/qa-11x-architect/SKILL.md', sha256: 'abc', size_bytes: 5 },
            { path: '.agents/scripts/demo.sh', sha256: 'def', size_bytes: 19 },
          ],
          common_files: [],
        }),
      fetchFileContent: (relPath: string) =>
        Promise.resolve(relPath === '.agents/scripts/demo.sh' ? '#!/bin/sh\necho new\n' : '# ok\n'),
    } as unknown as GitHubFetcher;
    const recLogs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => recLogs.push(args.map(String).join(' '));
    try {
      await runInstallSkillCli(
        ['--target', 'workspace', '--include-scripts', '--reconcile'],
        fakeFetcher,
        { cwd: recWs, homeDir: recHome }
      );
    } finally {
      console.log = origLog;
    }
    expect(fs.existsSync(path.join(recWs, '.agents/scripts/demo.sh.11x-backup'))).toBe(false);
    expect(recLogs.join('\n')).toContain('consolidado');

    // 4. ephemeral-runner EISDIR catch when Makefile is a directory
    const dirMk = path.join(tmpDir, 'dir-mk');
    fs.mkdirSync(path.join(dirMk, 'Makefile'), { recursive: true });
    const fallbackTargets: string[] = [];
    const mockDirExec = ((
      _file: string,
      args: readonly string[],
      _opts: unknown,
      cb: (e: null, out: { stdout: string; stderr: string }) => void
    ) => {
      fallbackTargets.push(args.join(' '));
      cb(null, { stdout: 'ok', stderr: '' });
    }) as unknown as typeof execFile;
    await runEphemeralQa(dirMk, 'lint', 30, { execFileFn: mockDirExec, skipIfDocsOnly: false });
    expect(fallbackTargets[0]).toBe('qa-lint');

    // 5. certifyHelpers: normRelPath, all loadProjectBoundaryRules shapes & errors, full ROADMAP branches
    expect(evaluateDeclarativeBoundaryEdge([], './src/', '/src/', 'g.json')).toEqual([]);
    expect(
      evaluateDeclarativeBoundaryEdge(
        [{ kind: 'layers', root: './src/', layers: ['/api/', 'infra/'] }],
        './src/infra/db.ts',
        '/src/api/ctrl.ts',
        'g.json'
      )
    ).toHaveLength(1);
    expect(
      evaluateDeclarativeBoundaryEdge(
        [{ kind: 'layers', layers: ['', 'api'] }],
        'src/a.ts',
        'src/b.ts',
        'g.json'
      )
    ).toEqual([]);
    expect(
      evaluateDeclarativeBoundaryEdge(
        [{ kind: 'forbidden', rules: [{ source: 'src/utils', forbidden: ['src/cli'] }] }],
        'src/utils/u.ts',
        'src/domain/ok.ts',
        'g.json'
      )
    ).toEqual([]);

    const bDir = path.join(tmpDir, 'bounds-variants');
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify([{ kind: 'layers', layers: ['a', 'b'] }]));
    expect(loadProjectBoundaryRules(bDir).rules).toHaveLength(1);
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify({ kind: 'independence', modules: ['a', 'b'] }));
    expect(loadProjectBoundaryRules(bDir).rules).toHaveLength(1);
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify({ rules: [{ kind: 'forbidden', rules: [] }] }));
    expect(loadProjectBoundaryRules(bDir).rules).toHaveLength(1);
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify({ other: true }));
    expect(loadProjectBoundaryRules(bDir).error).toContain('boundaries.json');
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify('bad-primitive'));
    expect(loadProjectBoundaryRules(bDir).error).toContain('objeto o arreglo');
    writeFile(bDir, '.agents/boundaries.json', JSON.stringify([{ kind: 'unknown-kind' }]));
    expect(loadProjectBoundaryRules(bDir).error).toContain('inválida');

    expect(validateSingleRoadmapFile(path.join(tmpDir, 'nope.md'), 'ROADMAP.md')).toEqual([]);
    const rmNoTable = path.join(tmpDir, 'rm-notable.md');
    fs.writeFileSync(rmNoTable, '## ✅ Milestone 1: Solo\n- [x] Done\n## Other Notes\nText\n', 'utf8');
    expect(validateSingleRoadmapFile(rmNoTable, 'ROADMAP.md').some((e) => e.includes('huérfano'))).toBe(true);

    const rmCases = path.join(tmpDir, 'rm-cases.md');
    fs.writeFileSync(
      rmCases,
      [
        '| **Milestone 1.2.3** | Bad | Spec | ✅ Done | `100%` |',
        '| **Milestone 1** | MissingBody | Spec | ✅ Done | `100%` |',
        '| **Milestone 2** | Taskless | Spec | ✅ Done | `100%` |',
        '| **Milestone 3** | AllDoneBadIcon | Spec | ✅ Completed | `100%` |',
        '| **Milestone 4** | AllPendBadPct | Spec | ✅ Completed | `100%` |',
        '| **Milestone 5** | Partial100 | Spec | ✅ Completed | `100%` |',
        '| **Milestone 6** | Partial0 | Spec | ⏳ Pending | `0%` |',
        '| **Milestone 7** | PartialOk | Spec | 🚧 In Progress | `50%` |',
        '## ✅ Milestone 2: Taskless',
        'No checkboxes here',
        '## ⏳ Milestone 3: AllDoneBadIcon',
        '- [x] Done',
        '## ✅ Milestone 4: AllPendBadPct',
        '- [ ] Still open',
        '## ✅ Milestone 5: Partial100',
        '- [x] One',
        '- [ ] Two',
        '## ⏳ Milestone 6: Partial0',
        '- [x] One',
        '- [ ] Two',
        '## 🚧 Milestone 7: PartialOk',
        '- [x] One',
        '- [ ] Two',
      ].join('\n'),
      'utf8'
    );
    const rmCaseErrs = validateSingleRoadmapFile(rmCases, 'ROADMAP.md');
    expect(rmCaseErrs.some((e) => e.includes('carece de sección'))).toBe(true);
    expect(rmCaseErrs.some((e) => e.includes("en vez de '✅'"))).toBe(true);
    expect(rmCaseErrs.some((e) => e.includes("en vez de '⏳'"))).toBe(true);
    expect(rmCaseErrs.some((e) => e.includes('al 100% pero contiene tareas pendientes'))).toBe(true);
    expect(rmCaseErrs.some((e) => e.includes('Pendiente/0%'))).toBe(true);
    expect(validateBilingualRoadmapFiles(path.join(tmpDir, 'missing1.md'), rmCases)).toEqual([]);
    const rmEmpty = path.join(tmpDir, 'rm-empty.md');
    fs.writeFileSync(rmEmpty, '# Plain roadmap\n', 'utf8');
    expect(validateBilingualRoadmapFiles(rmEmpty, rmEmpty)).toEqual([]);

    // 6. certify-gate edge branches: SQLAlchemy file + unreadable catch, boundaries violation & error, upstream tier, CALM variants, legacy_preserved ROADMAP
    const gProj = path.join(tmpDir, 'gate-edges');
    writeFile(gProj, 'TESTING.md', '# Testing\n');
    writeFile(gProj, 'CHANGELOG.md', '## [Unreleased]\n- ok\n');
    writeFile(gProj, 'SECURITY.md', '# Security\n');
    writeFile(gProj, 'ROADMAP.md', '## Free form roadmap without table\n## ✅ Milestone 1: Custom\n- [x] ok\n');
    writeFile(
      gProj,
      '.qa-11x.json',
      JSON.stringify({
        schemaVersion: 3,
        tier: 'enterprise',
        tierConfirmedByUser: true,
        governanceDocs: { 'ROADMAP.md': 'legacy_preserved' },
      })
    );
    writeFile(gProj, 'src/models.py', 'class User(DeclarativeBase):\n    __tablename__ = "users"\n');
    writeFile(
      gProj,
      '.agents/boundaries.json',
      JSON.stringify({ rules_sets: [{ kind: 'layers', root: 'src', layers: ['api', 'infra'] }] })
    );
    writeFile(
      gProj,
      'graphify-out/graph.json',
      JSON.stringify({
        nodes: [
          { id: 'n1', source_file: 'src/infra/db.ts' },
          { id: 'n2', source_file: 'src/api/ctrl.ts' },
        ],
        links: [{ source: 'n1', target: 'n2', relation: 'imports' }],
      })
    );
    writeFile(gProj, 'architecture/custom.calm.json', '{invalid-json');
    const gRes1 = await certify11xGate(gProj, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(gRes1.blockers.some((b) => b.includes('boundaries.json'))).toBe(true);
    expect(gRes1.blockers.some((b) => b.includes('[CALM]'))).toBe(true);
    expect(gRes1.blockers.some((b) => b.includes('huérfano'))).toBe(false);

    // Invalid boundaries.json + qa-11x.calm.json + unreadable models.py catch
    writeFile(gProj, '.agents/boundaries.json', '{broken');
    writeFile(gProj, 'architecture/qa-11x.calm.json', '{invalid');
    const unreadableModel = path.join(gProj, 'src', 'models.py');
    fs.chmodSync(unreadableModel, 0o000);
    try {
      const gRes2 = await certify11xGate(gProj, {
        requireLintEvidence: false,
        requireUnitEvidence: false,
        updateOptions: { allowNetworkCheck: false },
      });
      expect(gRes2.blockers.some((b) => b.includes('.agents/boundaries.json inválido'))).toBe(true);
    } finally {
      fs.chmodSync(unreadableModel, 0o600);
    }

    // architecture as a file (catch in findFirstCalmArchRelPath) + upstream repo detection without .qa-11x.json
    const upProj = path.join(tmpDir, 'upstream-fake');
    writeFile(upProj, 'manifest.json', '{"common_files":[],"agent_governance_files":[]}');
    writeFile(upProj, '.agents/scripts/sync_governance.py', '# stub\n');
    writeFile(upProj, 'architecture', 'not-a-dir\n');
    writeFile(upProj, 'TESTING.md', '# T\n');
    writeFile(upProj, 'CHANGELOG.md', '## [Unreleased]\n');
    writeFile(upProj, 'SECURITY.md', '# S\n');
    writeFile(upProj, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');
    const upRes = await certify11xGate(upProj, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(upRes.effective_tier).toBe('enterprise');

    // Doctor in $HOME mode (inHomeMode branch of resolveDoctorTierSummary) + certify-cli failing text
    const homeDoc = path.join(tmpDir, 'doc-home');
    fs.mkdirSync(homeDoc, { recursive: true });
    const homeDocRes = await runDoctorCli(['--offline'], {
      cwd: homeDoc,
      homeDir: homeDoc,
      dockerProbeFn: () => '28.0.0',
    });
    expect(homeDocRes.output).toContain('[QA-11X | Tier: standard | Path: AUTO]');

    const failCertCli = await runCertifyCli([upProj, '--offline'], { cwd: upProj, homeDir: homeDoc });
    expect(failCertCli.exitCode).toBe(1);
    expect(failCertCli.output).toContain('[QA-11X | Tier: enterprise | Path: FULL_11X]');

    // Valid generic CALM architecture passes checkCalmForTier in enterprise tier
    const validCalmProj = path.join(tmpDir, 'valid-calm-ent');
    writeFile(
      validCalmProj,
      '.qa-11x.json',
      JSON.stringify({ schemaVersion: 3, tier: 'enterprise', tierConfirmedByUser: true })
    );
    writeFile(validCalmProj, 'TESTING.md', '# T\n');
    writeFile(validCalmProj, 'CHANGELOG.md', '## [Unreleased]\n');
    writeFile(validCalmProj, 'SECURITY.md', '# S\n');
    writeFile(validCalmProj, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');
    writeFile(
      validCalmProj,
      'architecture/app.calm.json',
      JSON.stringify({
        nodes: [
          { 'unique-id': 'web-ui', 'node-type': 'service', name: 'Web UI', description: 'UI' },
          { 'unique-id': 'api-svc', 'node-type': 'service', name: 'API', description: 'API' },
        ],
        relationships: [
          {
            'unique-id': 'rel-web-api',
            description: 'HTTPS calls',
            'relationship-type': { connects: { source: { node: 'web-ui' }, destination: { node: 'api-svc' } } },
          },
        ],
        controls: {
          'tls-control': {
            enabled: true,
            description: 'Enforce TLS',
            requirements: [{ 'requirement-url': 'https://example.com/tls', config: { 'control-id': 'SEC-TLS-01' } }],
            relationships: ['rel-web-api'],
          },
        },
      })
    );
    const validCalmRes = await certify11xGate(validCalmProj, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(validCalmRes.blockers.some((b) => b.includes('CALM'))).toBe(false);
  });
});
