// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_GOVERNANCE_FILE_IDS,
  defaultGitCollaborationProbe,
  detectGovernanceFiles,
  isGovernanceOnboardingNeeded,
  resolveFixedGitBinary,
  slugifyProjectName,
} from '../src/services/governanceDetector.js';
import {
  applyGovernanceDocuments,
  defaultGitOwnerProbe,
  extractProjectGovernanceMetadata,
  insertUnreleasedIntoLegacyChangelog,
  normalizeGovernanceDocId,
  parseDeclineGovernanceEntry,
  parseOwnerFromRemoteUrl,
  resolveContainedChildPath,
} from '../src/services/governanceTemplates.js';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';
import { initOrAppendAgentsMd } from '../src/tools/initOrAppendAgentsMd.js';
import { executeInitAgentsCli, parseInitAgentsArgs } from '../src/cli/init-agents-md.js';
import { parseQuickstartCliArgs, runCli } from '../src/cli.js';
import { runQuickstart } from '../src/cli/quickstart.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { loadProjectBoundaryRules, validateSingleRoadmapFile } from '../src/tools/certifyHelpers.js';
import { validateCalmArchitecture } from '../src/tools/validateCalmArchitecture.js';
import { readQa11xConfig } from '../src/services/qa11xConfig.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

describe('Milestone 33 Wave 2 — Non-Destructive Governance Detection, Dynamic Templates & Proportional Blocking', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-hito33-w2-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('REQ-33-07: classifies all 8 governance files across all 5 deterministic states non-destructively', async () => {
    expect(ALL_GOVERNANCE_FILE_IDS).toHaveLength(8);
    expect(slugifyProjectName('/tmp/My_Cool--App!')).toBe('my-cool-app');
    expect(slugifyProjectName('/tmp/---')).toBe('project');

    // 1. Virgin monolithic starter repo: core missing_unprompted, contextual not_applicable
    const virginDir = path.join(tmpDir, 'virgin-app');
    writeFile(virginDir, 'src/index.ts', 'export const ok = 1;\n');
    const virginInsp = await inspectProjectConfig(virginDir);
    const virginGov = virginInsp.standard_11x_readiness?.governance_files ?? [];
    expect(virginGov).toHaveLength(8);
    expect(virginGov.find((g) => g.id === 'CHANGELOG.md')?.state).toBe('missing_unprompted');
    expect(virginGov.find((g) => g.id === '.agents/boundaries.json')?.state).toBe('not_applicable');
    expect(virginGov.find((g) => g.id === 'architecture/calm.json')?.state).toBe('not_applicable');
    expect(virginGov.find((g) => g.id === 'docs/adr/0001-record-architecture-decisions.md')?.state).toBe(
      'not_applicable'
    );
    expect(virginGov.find((g) => g.id === '.github/CODEOWNERS')?.state).toBe('not_applicable');
    expect(virginInsp.standard_11x_readiness?.governance_onboarding_needed).toBe(true);

    // 2. Legacy handcrafted files in enterprise multi-service + git collaborative repo -> present_legacy (never overwritten)
    const legacyDir = path.join(tmpDir, 'legacy-corp');
    writeFile(legacyDir, 'src/api/routes.ts', 'export const r = 1;\n');
    writeFile(legacyDir, 'src/domain/user.ts', 'export const u = 1;\n');
    writeFile(legacyDir, 'services/auth/index.ts', 'export const a = 1;\n');
    writeFile(legacyDir, 'services/billing/index.ts', 'export const b = 1;\n');
    writeFile(legacyDir, 'CHANGELOG.md', '# History\n## [1.0.0]\n- Legacy release\n');
    writeFile(legacyDir, 'ROADMAP.md', '# My Freeform Ideas\n- Do cool things\n');
    writeFile(legacyDir, 'TESTING.md', 'just run tests\n');
    writeFile(legacyDir, 'SECURITY.md', 'email us\n');
    writeFile(legacyDir, '.agents/boundaries.json', '{"invalid": true}');
    writeFile(legacyDir, 'architecture/legacy.calm.json', '{"nodes":[]}');
    writeFile(legacyDir, 'docs/adr/0001-notes.md', 'raw notes without headings');
    writeFile(legacyDir, 'CODEOWNERS', '# comments only\n');

    const legacyResults = detectGovernanceFiles(legacyDir, {
      effectiveTier: 'enterprise',
      detectedStacks: ['node-backend'],
      files: ['architecture/legacy.calm.json'],
      governanceDocs: {},
      gitProbeFn: () => ({ hasRemote: true, distinctAuthorCount: 3 }),
    });
    for (const item of legacyResults) {
      expect(item.state).toBe('present_legacy');
    }
    expect(isGovernanceOnboardingNeeded(true, legacyResults)).toBe(true);

    // Invalid JSON in boundaries.json & calm.json -> also present_legacy; dir read fallback safe
    writeFile(legacyDir, '.agents/boundaries.json', '{broken-json');
    writeFile(legacyDir, 'architecture/legacy.calm.json', '{broken-json');
    const brokenResults = detectGovernanceFiles(legacyDir, {
      effectiveTier: 'enterprise',
      detectedStacks: ['fastapi', 'vue3'],
      files: [],
      governanceDocs: { 'ROADMAP.md': 'legacy_preserved' },
      gitProbeFn: () => ({ hasRemote: false, distinctAuthorCount: 2 }),
    });
    expect(brokenResults.find((g) => g.id === '.agents/boundaries.json')?.state).toBe('present_legacy');
    expect(brokenResults.find((g) => g.id === 'architecture/calm.json')?.state).toBe('present_legacy');
    expect(brokenResults.find((g) => g.id === 'ROADMAP.md')?.persisted_decision).toBe('legacy_preserved');

    // 3. Declined decisions in .qa-11x.json -> state 'declined' and onboarding NOT needed when tier confirmed
    const declinedDir = path.join(tmpDir, 'declined-app');
    writeFile(declinedDir, 'backend/app.py', 'x = 1\n');
    writeFile(declinedDir, 'frontend/app.ts', 'export const y = 1;\n');
    const declinedRes = detectGovernanceFiles(declinedDir, {
      effectiveTier: 'enterprise',
      detectedStacks: ['fastapi', 'vue3'],
      files: [],
      governanceDocs: {
        'CHANGELOG.md': 'declined',
        'ROADMAP.md': 'declined',
        'TESTING.md': 'declined',
        'SECURITY.md': 'declined',
        '.agents/boundaries.json': 'declined',
        'architecture/calm.json': 'declined',
        'docs/adr/0001-record-architecture-decisions.md': 'declined',
        '.github/CODEOWNERS': 'declined',
      },
      gitProbeFn: () => ({ hasRemote: true, distinctAuthorCount: 1 }),
    });
    for (const item of declinedRes) {
      expect(item.state).toBe('declined');
    }
    expect(isGovernanceOnboardingNeeded(true, declinedRes)).toBe(false);
    expect(isGovernanceOnboardingNeeded(false, declinedRes)).toBe(true);

    // 4. Real git repo with remote + commit exercises defaultGitCollaborationProbe
    const gitBin = '/usr/bin/git';
    const gitRepo = path.join(tmpDir, 'real-git');
    writeFile(gitRepo, 'README.md', '# Demo\n');
    execFileSync(gitBin, ['init', '-q', '-b', 'main'], { cwd: gitRepo });
    execFileSync(gitBin, ['config', 'user.name', 'Alice'], { cwd: gitRepo });
    execFileSync(gitBin, ['config', 'user.email', 'alice@example.com'], { cwd: gitRepo });
    execFileSync(gitBin, ['remote', 'add', 'origin', 'https://github.com/acme-org/demo-app.git'], {
      cwd: gitRepo,
    });
    execFileSync(gitBin, ['add', '.'], { cwd: gitRepo });
    execFileSync(gitBin, ['commit', '-q', '-m', 'chore: init'], { cwd: gitRepo });
    const gitGov = detectGovernanceFiles(gitRepo, {
      effectiveTier: 'standard',
      detectedStacks: ['node-backend'],
      files: [],
      governanceDocs: {},
    });
    expect(gitGov.find((g) => g.id === '.github/CODEOWNERS')?.state).toBe('missing_unprompted');
  });

  it('REQ-33-08: generates contextual templates in EN/ES, respects bilingual_mirrors, and surgically updates legacy CHANGELOG.md', () => {
    expect(normalizeGovernanceDocId('changelog')).toBe('CHANGELOG.md');
    expect(normalizeGovernanceDocId('architecture/custom.calm.json')).toBe('architecture/calm.json');
    expect(normalizeGovernanceDocId('docs/adr/0002-custom.md')).toBe(
      'docs/adr/0001-record-architecture-decisions.md'
    );
    expect(() => normalizeGovernanceDocId('unknown-file.txt')).toThrow(/no soportado/i);
    expect(parseDeclineGovernanceEntry('ROADMAP.md:legacy_preserved')).toEqual({
      id: 'ROADMAP.md',
      decision: 'legacy_preserved',
    });
    expect(parseDeclineGovernanceEntry('.github/CODEOWNERS')).toEqual({
      id: '.github/CODEOWNERS',
      decision: 'declined',
    });

    // 1. Metadata extraction from pyproject.toml + Makefile + Spanish README + SSH git remote
    const pyProj = path.join(tmpDir, 'mi-servicio');
    writeFile(pyProj, 'pyproject.toml', '[project]\nname = "mi-servicio"\nversion = "1.4.2"\n');
    writeFile(pyProj, 'Makefile', 'qa-lint:\n\t@echo lint\nqa-unit:\n\t@echo unit\n');
    writeFile(pyProj, 'README.md', '# Mi Servicio\n## Instalación y Arquitectura\nRequisitos y pruebas.\n');
    writeFile(pyProj, 'app/api/main.py', 'x = 1\n');
    writeFile(pyProj, 'app/domain/model.py', 'y = 2\n');
    writeFile(pyProj, 'app/infra/repo.py', 'z = 3\n');
    const gitBin = '/usr/bin/git';
    execFileSync(gitBin, ['init', '-q', '-b', 'main'], { cwd: pyProj });
    execFileSync(gitBin, ['remote', 'add', 'origin', 'git@github.com:tecno-team/mi-servicio.git'], {
      cwd: pyProj,
    });

    const esMeta = extractProjectGovernanceMetadata({
      projectPath: pyProj,
      tier: 'enterprise',
      lang: 'auto',
      stacks: ['fastapi'],
      dryRun: true,
    });
    expect(esMeta.projectName).toBe('mi-servicio');
    expect(esMeta.version).toBe('1.4.2');
    expect(esMeta.lang).toBe('es');
    expect(esMeta.emitSpanishMirror).toBe(false);
    expect(esMeta.makefileTargets).toEqual(['qa-lint', 'qa-unit']);
    expect(esMeta.layerRoot).toBe('app');
    expect(esMeta.detectedLayers).toEqual(['api', 'domain', 'infra']);
    expect(esMeta.ownerHandle).toBe('@tecno-team');

    // Generate all 8 docs in ES without creating *.es.md mirrors
    const esApply = applyGovernanceDocuments({
      projectPath: pyProj,
      tier: 'enterprise',
      lang: 'es',
      stacks: ['fastapi'],
      governanceDocs: [...ALL_GOVERNANCE_FILE_IDS],
      bilingualMirrors: 'auto',
      dryRun: false,
    });
    expect(esApply.items).toHaveLength(8);
    expect(esApply.items.every((i) => i.action === 'created')).toBe(true);
    expect(fs.existsSync(path.join(pyProj, 'CHANGELOG.es.md'))).toBe(false);

    // Generated templates MUST pass QA-11X validators and detect as present_compatible!
    expect(validateSingleRoadmapFile(path.join(pyProj, 'ROADMAP.md'), 'ROADMAP.md')).toEqual([]);
    expect(loadProjectBoundaryRules(pyProj).error).toBeUndefined();
    const calmValidation = validateCalmArchitecture({
      workspaceRoot: pyProj,
      architecturePath: 'architecture/mi-servicio.calm.json',
    });
    expect(calmValidation.valid).toBe(true);

    const detectedAfterEs = detectGovernanceFiles(pyProj, {
      effectiveTier: 'enterprise',
      detectedStacks: ['fastapi'],
      files: ['architecture/mi-servicio.calm.json'],
      governanceDocs: esApply.decisionsDelta,
      gitProbeFn: () => ({ hasRemote: true, distinctAuthorCount: 2 }),
    });
    for (const item of detectedAfterEs) {
      expect(item.state).toBe('present_compatible');
    }

    // Re-running on existing docs preserves them without overwriting
    const repeatEs = applyGovernanceDocuments({
      projectPath: pyProj,
      tier: 'enterprise',
      lang: 'es',
      stacks: ['fastapi'],
      governanceDocs: ['ROADMAP.md', 'TESTING.md', 'CHANGELOG.md'],
      dryRun: false,
    });
    expect(repeatEs.items.every((i) => i.action === 'preserved')).toBe(true);

    // 2. EN project with README.es.md -> auto generates *.es.md mirrors; legacy CHANGELOG surgical insertion + 0600 backup
    const enProj = path.join(tmpDir, 'en-bilingual');
    writeFile(enProj, 'package.json', JSON.stringify({ name: 'en-bilingual', version: '2.1.0' }));
    writeFile(enProj, 'README.md', '# English App\n');
    writeFile(enProj, 'README.es.md', '# App en Español\n');
    writeFile(enProj, 'CHANGELOG.md', '# Changelog\n\n## [2.0.0] - 2026-01-01\n- Old release\n');

    // Dry-run does not mutate disk
    const dryEn = applyGovernanceDocuments({
      projectPath: enProj,
      tier: 'standard',
      lang: 'en',
      stacks: ['node-backend'],
      governanceDocs: ['CHANGELOG.md', 'ROADMAP.md', 'TESTING.md', 'SECURITY.md'],
      declineGovernanceDocs: ['.github/CODEOWNERS'],
      dryRun: true,
    });
    expect(dryEn.items.every((i) => i.action === 'dry_run')).toBe(true);
    expect(fs.existsSync(path.join(enProj, 'ROADMAP.md'))).toBe(false);
    expect(fs.existsSync(path.join(enProj, 'CHANGELOG.md.11x-backup'))).toBe(false);

    // Real run applies surgical insertion + 0600 backup + *.es.md mirrors
    const liveEn = applyGovernanceDocuments({
      projectPath: enProj,
      tier: 'standard',
      lang: 'en',
      stacks: ['node-backend'],
      governanceDocs: [
        'CHANGELOG.md',
        'ROADMAP.md',
        'TESTING.md',
        'SECURITY.md',
        'docs/adr/0001-record-architecture-decisions.md',
      ],
      bilingualMirrors: 'auto',
      dryRun: false,
    });
    const clItem = liveEn.items.find((i) => i.id === 'CHANGELOG.md');
    expect(clItem?.action).toBe('updated');
    expect(clItem?.backup_path).toBe('CHANGELOG.md.11x-backup');
    const updatedChangelog = fs.readFileSync(path.join(enProj, 'CHANGELOG.md'), 'utf8');
    expect(updatedChangelog).toContain('## [Unreleased]');
    expect(updatedChangelog).toContain('## [2.0.0] - 2026-01-01');
    expect(fs.existsSync(path.join(enProj, 'CHANGELOG.md.11x-backup'))).toBe(true);
    expect(fs.existsSync(path.join(enProj, 'ROADMAP.es.md'))).toBe(true);
    expect(fs.existsSync(path.join(enProj, 'TESTING.es.md'))).toBe(true);
    expect(fs.existsSync(path.join(enProj, 'SECURITY.es.md'))).toBe(true);
    expect(validateSingleRoadmapFile(path.join(enProj, 'ROADMAP.md'), 'ROADMAP.md')).toEqual([]);
    expect(validateSingleRoadmapFile(path.join(enProj, 'ROADMAP.es.md'), 'ROADMAP.es.md')).toEqual([]);

    // Legacy changelog insertion fallback cases (heading-only and plain text)
    expect(insertUnreleasedIntoLegacyChangelog('# Log\nOld notes', 'es')).toContain('## [Unreleased]');
    expect(insertUnreleasedIntoLegacyChangelog('plain lines', 'en')).toContain('## [Unreleased]');
  });

  it('REQ-33-08 & REQ-33-09: wires init_or_append_agents_md, init-agents CLI, quickstart CLI, and proportional certification blocking', async () => {
    // 1. initOrAppendAgentsMd with tier + governance_docs + decline_governance_docs persists .qa-11x.json v3
    const mcpProj = path.join(tmpDir, 'mcp-gov-proj');
    writeFile(mcpProj, 'composer.json', JSON.stringify({ name: 'acme/php-api', version: '3.0.0' }));
    writeFile(mcpProj, 'ROADMAP.md', '# Custom Narrative Roadmap\n- Freeform note\n');

    await expect(
      initOrAppendAgentsMd({ projectPath: mcpProj, tier: 'invalid-tier', dryRun: true })
    ).rejects.toThrow(/Invalid tier/);

    const initRes = await initOrAppendAgentsMd({
      projectPath: mcpProj,
      tier: 'standard',
      lang: 'en',
      governanceDocs: ['CHANGELOG.md', 'TESTING.md', 'SECURITY.md'],
      declineGovernanceDocs: ['ROADMAP.md:legacy_preserved', '.github/CODEOWNERS'],
      bilingualMirrors: false,
      dryRun: false,
    });
    expect(initRes.effective_tier).toBe('standard');
    expect(initRes.tier_confirmed_by_user).toBe(true);
    expect(initRes.qa_11x_banner).toBe('[QA-11X | Tier: standard | Path: FULL_11X]');
    expect(initRes.governance_files_applied).toHaveLength(5);

    const cfgAfterInit = readQa11xConfig(mcpProj);
    expect(cfgAfterInit.effectiveTier).toBe('standard');
    expect(cfgAfterInit.tierConfirmedByUser).toBe(true);
    expect(cfgAfterInit.governanceDocs['ROADMAP.md']).toBe('legacy_preserved');
    expect(cfgAfterInit.governanceDocs['.github/CODEOWNERS']).toBe('declined');
    expect(cfgAfterInit.governanceDocs['CHANGELOG.md']).toBe('enabled');

    // 2. CLI parsing & execution for init-agents and quickstart
    expect(() => parseInitAgentsArgs(['--tier', 'bogus'], mcpProj)).toThrow(/Tier no válido/);
    expect(() => parseInitAgentsArgs(['--bilingual-mirrors', 'maybe'], mcpProj)).toThrow(/Valor inválido/);
    const parsedInit = parseInitAgentsArgs(
      [
        '--dir',
        mcpProj,
        '--tier',
        'standard',
        '--governance-docs',
        'CHANGELOG.md,TESTING.md',
        '--decline-governance-docs',
        'ROADMAP.md:legacy_preserved',
        '--bilingual-mirrors',
        'false',
        '--dry-run',
      ],
      mcpProj
    );
    expect(parsedInit.tier).toBe('standard');
    expect(parsedInit.governanceDocs).toEqual(['CHANGELOG.md', 'TESTING.md']);
    expect(parsedInit.declineGovernanceDocs).toEqual(['ROADMAP.md:legacy_preserved']);
    expect(parsedInit.bilingualMirrors).toBe(false);

    // Verify runCli(['init-agents', ...]) accepts all new Wave 2 governance flags end-to-end
    const initViaRunCli = await runCli(
      [
        'init-agents',
        mcpProj,
        '--tier',
        'standard',
        '--governance-docs',
        'CHANGELOG.md,TESTING.md',
        '--decline-governance-docs',
        'ROADMAP.md:legacy_preserved',
        '--bilingual-mirrors',
        'auto',
        '--dry-run',
      ],
      { cwd: mcpProj, log: () => undefined, errorLog: () => undefined }
    );
    expect(initViaRunCli.exitCode).toBe(0);
    expect(initViaRunCli.initResult?.effective_tier).toBe('standard');

    const cliInitRes = await executeInitAgentsCli(
      ['--dir', mcpProj, '--tier', 'standard', '--bilingual-mirrors', 'auto', '--dry-run'],
      { cwd: mcpProj, quietBanner: true }
    );
    expect(cliInitRes?.effective_tier).toBe('standard');

    expect(() => parseQuickstartCliArgs(['--bilingual-mirrors', 'nope'], mcpProj)).toThrow(
      /Invalid --bilingual-mirrors/
    );
    const qsDir = path.join(tmpDir, 'qs-gov');
    writeFile(qsDir, 'package.json', JSON.stringify({ name: 'qs-gov', version: '1.0.0' }));
    const qsCliRes = await runCli(
      [
        'quickstart',
        qsDir,
        '--tier',
        'standard',
        '--ci',
        'none',
        '--governance-docs',
        'CHANGELOG.md,TESTING.md,SECURITY.md',
        '--decline-governance-docs',
        'ROADMAP.md,.github/CODEOWNERS',
        '--bilingual-mirrors',
        'true',
      ],
      { cwd: qsDir, log: () => undefined, errorLog: () => undefined }
    );
    expect(qsCliRes.exitCode).toBe(0);
    expect(fs.existsSync(path.join(qsDir, 'CHANGELOG.md'))).toBe(true);
    expect(fs.existsSync(path.join(qsDir, 'CHANGELOG.es.md'))).toBe(true);
    expect(fs.readFileSync(path.join(qsDir, 'CHANGELOG.md'), 'utf8')).toContain('All notable changes');
    expect(fs.readFileSync(path.join(qsDir, 'CHANGELOG.es.md'), 'utf8')).toContain('Todos los cambios');
    const qsCfg = readQa11xConfig(qsDir);
    expect(qsCfg.governanceDocs['ROADMAP.md']).toBe('declined');

    // Quickstart dry-run maps governance dry_run -> planned on existing directory
    const qsDryDir = path.join(tmpDir, 'qs-dry-gov');
    fs.mkdirSync(qsDryDir, { recursive: true });
    const qsDry = await runQuickstart({
      projectPath: qsDryDir,
      tier: 'starter',
      ci: 'none',
      governanceDocsList: ['CHANGELOG.md'],
      declineGovernanceDocs: ['ROADMAP.md'],
      dryRun: true,
    });
    expect(qsDry.files.some((f) => f.relativePath === 'CHANGELOG.md' && f.action === 'planned')).toBe(
      true
    );

    // Security & edge checks: alternate existing files preserved, 0600 backup, symlink rejected
    const altProj = path.join(tmpDir, 'alt-gov');
    writeFile(altProj, 'CODEOWNERS', '* @root-team\n');
    writeFile(altProj, 'architecture/custom.calm.json', '{"nodes":[]}\n');
    writeFile(altProj, 'docs/adrs/0001-init.md', '# ADR 1\n');
    writeFile(altProj, 'CHANGELOG.md', '# History\n\n## [1.0.0] - 2026-01-01\n- init\n');
    const altRes = applyGovernanceDocuments({
      projectPath: altProj,
      tier: 'enterprise',
      lang: 'es',
      stacks: ['node-backend'],
      governanceDocs: [
        'CHANGELOG.md',
        'TESTING.md',
        '.github/CODEOWNERS',
        'architecture/calm.json',
        'docs/adr/0001-record-architecture-decisions.md',
      ],
      bilingualMirrors: true,
      dryRun: false,
    });
    expect(altRes.items.find((i) => i.id === '.github/CODEOWNERS')).toMatchObject({
      relative_path: 'CODEOWNERS',
      action: 'preserved',
    });
    expect(altRes.items.find((i) => i.id === 'architecture/calm.json')).toMatchObject({
      relative_path: 'architecture/custom.calm.json',
      action: 'preserved',
    });
    expect(
      altRes.items.find((i) => i.id === 'docs/adr/0001-record-architecture-decisions.md')
    ).toMatchObject({
      relative_path: 'docs/adrs/0001-init.md',
      action: 'preserved',
    });
    expect(fs.statSync(path.join(altProj, 'CHANGELOG.md.11x-backup')).mode & 0o777).toBe(0o600);
    // bilingualMirrors=true with lang='es' writes EN canonical + ES mirror (no duplicate ES/ES)
    expect(fs.readFileSync(path.join(altProj, 'TESTING.md'), 'utf8')).toContain(
      'Testing Strategy & Scoreboard'
    );
    expect(fs.readFileSync(path.join(altProj, 'TESTING.es.md'), 'utf8')).toContain(
      'Estrategia y Cuadro de Pruebas'
    );

    // Symlink target rejected even in dryRun
    const symProj = path.join(tmpDir, 'sym-gov');
    fs.mkdirSync(symProj, { recursive: true });
    const outsideTarget = path.join(tmpDir, 'outside.md');
    fs.writeFileSync(outsideTarget, '# Secret\n', 'utf8');
    fs.symlinkSync(outsideTarget, path.join(symProj, 'TESTING.md'));
    expect(() =>
      applyGovernanceDocuments({
        projectPath: symProj,
        tier: 'standard',
        lang: 'en',
        stacks: ['python'],
        governanceDocs: ['TESTING.md'],
        dryRun: true,
      })
    ).toThrow(/symlink|SEC-PATH|enlace/i);

    // 3. REQ-33-09 Proportional blocking in certify11xGate
    // (a) standard with declined CHANGELOG/TESTING/SECURITY MUST STILL BLOCK!
    const stdDeclined = path.join(tmpDir, 'std-declined');
    writeFile(
      stdDeclined,
      '.qa-11x.json',
      JSON.stringify({
        schemaVersion: 3,
        tier: 'standard',
        tierConfirmedByUser: true,
        governanceDocs: {
          'CHANGELOG.md': 'declined',
          'TESTING.md': 'declined',
          'SECURITY.md': 'declined',
          'ROADMAP.md': 'declined',
        },
      })
    );
    writeFile(stdDeclined, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');
    const stdBlocked = await certify11xGate(stdDeclined, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(stdBlocked.gate_passed).toBe(false);
    expect(stdBlocked.blockers.some((b) => b.includes('TESTING.md'))).toBe(true);
    expect(stdBlocked.blockers.some((b) => b.includes('CHANGELOG.md'))).toBe(true);
    expect(stdBlocked.blockers.some((b) => b.includes('SECURITY.md'))).toBe(true);

    // (b) standard with core docs present + legacy_preserved ROADMAP -> PASSES!
    writeFile(stdDeclined, 'TESTING.md', '# Testing\n');
    writeFile(stdDeclined, 'CHANGELOG.md', '## [Unreleased]\n- ok\n');
    writeFile(stdDeclined, 'SECURITY.md', '# Security\n');
    writeFile(stdDeclined, 'ROADMAP.md', '# Freeform Legacy Roadmap\nNo milestones table.\n');
    writeFile(
      stdDeclined,
      '.qa-11x.json',
      JSON.stringify({
        schemaVersion: 3,
        tier: 'standard',
        tierConfirmedByUser: true,
        governanceDocs: { 'ROADMAP.md': 'legacy_preserved' },
      })
    );
    const stdPassed = await certify11xGate(stdDeclined, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(stdPassed.gate_passed).toBe(true);

    // (c) enterprise with declined CALM MUST STILL BLOCK!
    const entDeclined = path.join(tmpDir, 'ent-declined');
    writeFile(
      entDeclined,
      '.qa-11x.json',
      JSON.stringify({
        schemaVersion: 3,
        tier: 'enterprise',
        tierConfirmedByUser: true,
        governanceDocs: { 'architecture/calm.json': 'declined' },
      })
    );
    writeFile(entDeclined, 'graphify-out/graph.json', '{"nodes":[],"links":[]}');
    writeFile(entDeclined, 'TESTING.md', '# Testing\n');
    writeFile(entDeclined, 'CHANGELOG.md', '## [Unreleased]\n- ok\n');
    writeFile(entDeclined, 'SECURITY.md', '# Security\n');
    const entBlocked = await certify11xGate(entDeclined, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(entBlocked.gate_passed).toBe(false);
    expect(entBlocked.blockers.some((b) => /CALM|calm\.json/i.test(b))).toBe(true);

    // (d) Invariant: physically existing broken CHANGELOG.md is ALWAYS audited even in starter + declined
    const starterWithBrokenDoc = path.join(tmpDir, 'starter-broken-doc');
    writeFile(
      starterWithBrokenDoc,
      '.qa-11x.json',
      JSON.stringify({
        schemaVersion: 3,
        tier: 'starter',
        tierConfirmedByUser: true,
        governanceDocs: { 'CHANGELOG.md': 'declined' },
      })
    );
    writeFile(starterWithBrokenDoc, 'CHANGELOG.md', '# Broken without Unreleased\n');
    const starterAudit = await certify11xGate(starterWithBrokenDoc, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(starterAudit.gate_passed).toBe(false);
    expect(starterAudit.blockers.some((b) => b.includes('## [Unreleased]'))).toBe(true);
  });

  it('Wave 2 full diff-coverage: detector/templates edge cases, git probe fallbacks, path containment, and CLI mirror flags', () => {
    // 1. resolveFixedGitBinary null fallback + defaultGitCollaborationProbe/OwnerProbe null & error catches
    expect(resolveFixedGitBinary(['/nonexistent/qa11x-git-bin'])).toBeNull();
    const noOriginGit = path.join(tmpDir, 'git-no-origin');
    fs.mkdirSync(noOriginGit, { recursive: true });
    execFileSync('/usr/bin/git', ['init', '-q', '-b', 'main'], { cwd: noOriginGit });
    expect(defaultGitCollaborationProbe(noOriginGit, null)).toEqual({
      hasRemote: false,
      distinctAuthorCount: 0,
    });
    expect(defaultGitOwnerProbe(noOriginGit, null)).toBeNull();
    expect(defaultGitOwnerProbe(noOriginGit)).toBeNull();

    // 2. parseOwnerFromRemoteUrl HTTPS + invalid URL + resolveContainedChildPath escape guard
    expect(parseOwnerFromRemoteUrl('https://github.com/acme-org/repo.git')).toBe('@acme-org');
    expect(parseOwnerFromRemoteUrl('https://invalid')).toBeNull();
    expect(() => resolveContainedChildPath(tmpDir, '../escape.md')).toThrow(/SEC-PATH-01/);

    // 3. governanceDetector edge cases: directory/symlink in place of file, multi-service root markers,
    //    array/primitive boundaries.json, array calm.json, and non-directory architecture/docs/adr catch
    const detEdge = path.join(tmpDir, 'det-edge');
    fs.mkdirSync(path.join(detEdge, 'TESTING.md'), { recursive: true });
    fs.mkdirSync(path.join(detEdge, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(detEdge, 'frontend'), { recursive: true });
    writeFile(detEdge, '.agents/boundaries.json', '[{"from":"api","to":"infra"}]');
    writeFile(detEdge, 'architecture', 'not-a-directory');
    writeFile(detEdge, 'docs/adr', 'not-a-directory');
    const det1 = detectGovernanceFiles(detEdge, {
      effectiveTier: 'standard',
      detectedStacks: ['python'],
      files: [],
      governanceDocs: {},
      gitProbeFn: () => ({ hasRemote: false, distinctAuthorCount: 1 }),
    });
    expect(det1.find((g) => g.id === 'TESTING.md')?.state).toBe('missing_unprompted');
    expect(det1.find((g) => g.id === '.agents/boundaries.json')?.state).toBe('present_compatible');
    expect(det1.find((g) => g.id === 'architecture/calm.json')?.state).toBe('missing_unprompted');

    const detPrim = path.join(tmpDir, 'det-prim');
    writeFile(detPrim, '.agents/boundaries.json', '"primitive"');
    writeFile(detPrim, 'architecture/arr.calm.json', '[]');
    const det2 = detectGovernanceFiles(detPrim, {
      effectiveTier: 'enterprise',
      detectedStacks: ['python'],
      files: [],
      governanceDocs: {},
      gitProbeFn: () => ({ hasRemote: false, distinctAuthorCount: 1 }),
    });
    expect(det2.find((g) => g.id === '.agents/boundaries.json')?.state).toBe('present_legacy');
    expect(det2.find((g) => g.id === 'architecture/calm.json')?.state).toBe('present_legacy');

    // 4. governanceTemplates edge cases: invalid package.json, pyproject without name/version,
    //    directory Makefile, non-directory architecture (ENOTDIR catch), existing .es.md mirror preserved
    const tplEdge = path.join(tmpDir, 'tpl-edge');
    writeFile(tplEdge, 'package.json', '{corrupt json');
    writeFile(tplEdge, 'pyproject.toml', '[tool.ruff]\nline-length = 88\n');
    fs.mkdirSync(path.join(tplEdge, 'Makefile'), { recursive: true });
    writeFile(tplEdge, 'architecture', 'file-blocking-dir');
    writeFile(tplEdge, 'SECURITY.es.md', '# Política de Seguridad Existente\n');
    const edgeMeta = extractProjectGovernanceMetadata({
      projectPath: tplEdge,
      tier: 'standard',
      lang: 'en',
      stacks: ['python'],
      dryRun: true,
    });
    expect(edgeMeta.projectName).toBe('tpl-edge');
    expect(edgeMeta.version).toBe('0.1.0');
    expect(edgeMeta.makefileTargets).toEqual([]);

    const mirrorPreserved = applyGovernanceDocuments({
      projectPath: tplEdge,
      tier: 'standard',
      lang: 'en',
      stacks: ['python'],
      governanceDocs: ['SECURITY.md'],
      declineGovernanceDocs: ['architecture/calm.json'],
      bilingualMirrors: true,
      dryRun: false,
    });
    expect(mirrorPreserved.items.find((i) => i.id === 'SECURITY.md')?.mirror_path).toBeUndefined();
    expect(fs.readFileSync(path.join(tplEdge, 'SECURITY.es.md'), 'utf8')).toContain(
      'Política de Seguridad Existente'
    );

    // 5. CLI parseQuickstartCliArgs bilingual-mirrors auto/false branches
    expect(parseQuickstartCliArgs(['--bilingual-mirrors', 'false'], tplEdge).bilingualMirrors).toBe(
      false
    );
    expect(parseQuickstartCliArgs(['--bilingual-mirrors', 'auto'], tplEdge).bilingualMirrors).toBe(
      'auto'
    );
  });
});
