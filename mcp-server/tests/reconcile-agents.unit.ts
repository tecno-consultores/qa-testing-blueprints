// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPromotedSection,
  isCanonicalRuleSection,
  isUpstreamBlueprintsRepo,
  parseReconcileAgentsArgs,
  RECONCILE_AGENTS_HELP_TEXT,
  splitMarkdownSections,
  reconcileAgentsGovernance,
  runReconcileAgentsCli,
  CANONICAL_GLOBAL_RULE_FILES,
  CANONICAL_GLOBAL_SKILL_DIRS,
  PROMOTED_INVARIANT_FINGERPRINTS,
} from '../src/cli/reconcile-agents.js';
import { isGitWorktreeDirty } from '../src/cli/reconcile/repoHygiene.js';
import { dedupeRepeatedHeadings } from '../src/cli/reconcile/sectionPruner.js';
import { runCli } from '../src/cli.js';
import { syncGlobalGeminiMd, buildConnectorBlock } from '../src/cli/init-agents-md.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';

describe('reconcile-agents (Hito 13: Governance Reconciliation & Deduplication)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-reconcile-agents-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('splitMarkdownSections & isPromotedSection', () => {
    it('splits markdown content by header lines (##, ###, ####)', () => {
      const markdown = [
        '# Title 1',
        'intro text',
        '## Section A',
        'details of section A',
        '### Subsection A.1',
        'sub details',
        '## Section B',
        'details of section B',
      ].join('\n');

      const sections = splitMarkdownSections(markdown);
      expect(sections.length).toBe(4);
      expect(sections[0]).toContain('# Title 1');
      expect(sections[1]).toContain('## Section A');
      expect(sections[2]).toContain('### Subsection A.1');
      expect(sections[3]).toContain('## Section B');
    });

    it('returns empty array on empty input string', () => {
      expect(splitMarkdownSections('')).toEqual([]);
    });

    it('correctly matches promoted invariant fingerprints case-insensitively', () => {
      expect(isPromotedSection('### Silo Mock Blindness Invariant')).toBe(true);
      expect(isPromotedSection('Directiva de Propagación Transversal de Estado entre módulos')).toBe(true);
      expect(isPromotedSection('Ciclo de 3 Fases Temporales (Pending, Active, Expired)')).toBe(true);
      expect(isPromotedSection('Invariante de Refresco Dual en vistas')).toBe(true);
      expect(isPromotedSection('### Invariante QA-TEST-SYNC-01')).toBe(true);
      expect(isPromotedSection('Regla exclusiva de MikroTik RouterOS v7')).toBe(false);
      expect(PROMOTED_INVARIANT_FINGERPRINTS.length).toBeGreaterThan(5);
    });
  });

  describe('reconcileAgentsGovernance validation and edge cases', () => {
    it('throws error when project_path does not exist or is not a directory', async () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      await expect(reconcileAgentsGovernance({ projectPath: nonExistent })).rejects.toThrow(
        'Directorio de proyecto inválido'
      );

      const filePath = path.join(tmpDir, 'dummy.txt');
      fs.writeFileSync(filePath, 'hello');
      await expect(reconcileAgentsGovernance({ projectPath: filePath })).rejects.toThrow(
        'Directorio de proyecto inválido'
      );
    });

    it('handles projects without .agents/rules/ or AGENTS.md gracefully and defaults dryRun to true', async () => {
      const result = await reconcileAgentsGovernance({ projectPath: tmpDir });
      expect(result.project_path).toBe(path.resolve(tmpDir));
      expect(result.dry_run).toBe(true);
      expect(result.removed_duplicate_sections_count).toBe(0);
      expect(result.preserved_domain_sections_count).toBe(0);
      expect(result.reconciled_items).toEqual([]);
      expect(result.domain_rules_file).toBeNull();
    });

    it('rejects forbidden system, traversal, tmpdir, and HOME paths via SEC-PATH-01 (F2.5)', async () => {
      await expect(reconcileAgentsGovernance({ projectPath: '/etc' })).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(reconcileAgentsGovernance({ projectPath: '../outside' })).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(reconcileAgentsGovernance({ projectPath: os.tmpdir() })).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(reconcileAgentsGovernance({ projectPath: os.homedir() })).rejects.toThrow(
        WorkspacePathValidationError
      );
    });
  });

  describe('reconcileAgentsGovernance full workflows (rosgrid style scenario)', () => {
    it('Case 1: reconciles project with redundant promoted rules and extracts domain rules to domain_<project>_rules.md', async () => {
      const projectDir = path.join(tmpDir, 'rosgrid');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      // Archivo con mezcla de reglas promovidas y reglas de negocio propias
      const customRules = [
        '# Custom UAT Directives',
        '## Invariante Anti-Silo y Silo Mock Blindness',
        'No validar solo status 200 en módulo A sin verificar consumidor B en base real.',
        '## MikroTik RouterOS v7 Hardware Offloading',
        'En los routers CCR2004, siempre habilitar hw-offload en los puentes Ethernet.',
        '## Ciclo Temporal de 3 Fases del Reloj',
        'Toda ventana de mantenimiento debe probarse en Programada, En Curso y Expirada.',
      ].join('\n');
      fs.writeFileSync(path.join(rulesDir, 'custom_uat.md'), customRules, 'utf-8');

      // AGENTS.md con sección duplicada fuera del bloque conector
      const agentsMdContent = [
        '# AGENTS.md — rosgrid',
        '## Silo Mock Blindness Universal Directive',
        'Regla duplicada que ya reside en la skill global.',
        buildConnectorBlock('rosgrid', ['python']),
        '## WinBox Protocol Rules',
        'Regla específica de WinBox.',
      ].join('\n\n');
      fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), agentsMdContent, 'utf-8');

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });

      expect(result.removed_duplicate_sections_count).toBeGreaterThanOrEqual(3);
      expect(result.preserved_domain_sections_count).toBeGreaterThanOrEqual(1);
      expect(result.backup_dir).not.toBeNull();
      expect(fs.existsSync(result.backup_dir!)).toBe(true);

      // El archivo custom_uat.md fue eliminado tras extraer sus reglas
      expect(fs.existsSync(path.join(rulesDir, 'custom_uat.md'))).toBe(false);

      // Se creó el archivo de dominio domain_rosgrid_rules.md
      const expectedDomainPath = path.join(rulesDir, 'domain_rosgrid_rules.md');
      expect(fs.existsSync(expectedDomainPath)).toBe(true);
      const domainContent = fs.readFileSync(expectedDomainPath, 'utf-8');
      expect(domainContent).toContain('MikroTik RouterOS v7 Hardware Offloading');
      expect(domainContent).not.toContain('Silo Mock Blindness');

      // AGENTS.md fue podado de secciones duplicadas pero conservó el conector y la regla de WinBox
      const updatedAgentsMd = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf-8');
      expect(updatedAgentsMd).toContain('QA_11X_MCP_CONNECTOR_START');
      expect(updatedAgentsMd).toContain('WinBox Protocol Rules');
      expect(updatedAgentsMd).not.toContain('Silo Mock Blindness Universal Directive');
    });

    it('Case 2: preserves domain_*.md files intact without renaming or modifying', async () => {
      const projectDir = path.join(tmpDir, 'rosgrid-noc');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const domainNocFile = path.join(rulesDir, 'domain_rosgrid_noc.md');
      const domainContent = '# NOC Specific Directives\n## Alerting\nSend alerts to NOC Slack channel.';
      fs.writeFileSync(domainNocFile, domainContent, 'utf-8');

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      const preservedItem = result.reconciled_items.find((item) => item.classification === 'DOMAIN_PRESERVED');

      expect(preservedItem).toBeDefined();
      expect(preservedItem?.file).toContain('domain_rosgrid_noc.md');
      expect(fs.existsSync(domainNocFile)).toBe(true);
      expect(fs.readFileSync(domainNocFile, 'utf-8')).toBe(domainContent);
    });

    it('Case 3: identifies and backs up canonical global rule files (CANONICAL_CLEAN)', async () => {
      const projectDir = path.join(tmpDir, 'sample-app');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      for (const canonical of CANONICAL_GLOBAL_RULE_FILES) {
        fs.writeFileSync(path.join(rulesDir, canonical), `# Canonical rule ${canonical}`, 'utf-8');
      }

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      expect(result.reconciled_items.length).toBe(CANONICAL_GLOBAL_RULE_FILES.size);
      for (const item of result.reconciled_items) {
        expect(item.classification).toBe('CANONICAL_CLEAN');
      }

      // Los archivos canónicos se respaldan en .agents/backups/ y se eliminan de .agents/rules/ del proyecto consumidor
      expect(result.backup_dir).not.toBeNull();
      for (const canonical of CANONICAL_GLOBAL_RULE_FILES) {
        expect(fs.existsSync(path.join(result.backup_dir!, '.agents', 'rules', canonical))).toBe(true);
        expect(fs.existsSync(path.join(rulesDir, canonical))).toBe(false);
      }
    });

    it('Case 7: extracts custom domain sections from modified canonical rule file in consumer project and deletes the canonical file', async () => {
      const projectDir = path.join(tmpDir, 'rosgrid-web');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const modifiedCanonicalPath = path.join(rulesDir, 'mandatory_qa_pyramid_and_doc_sync.md');
      fs.writeFileSync(
        modifiedCanonicalPath,
        [
          '# Mandatory Directive: QA 11X Pyramid & Continuous Documentation Sync',
          '## 1. Supreme Directive: Mandatory 11X Test Creation',
          'Regla global ya incluida en la skill global.',
          '## Topología Cartográfica de Nodos MikroTik',
          'En el mapa de rosgrid-web, cada router CCR debe mostrar su enlace OSPF activo.',
        ].join('\n'),
        'utf-8'
      );

      expect(isCanonicalRuleSection('## 1. Supreme Directive: Mandatory 11X Test Creation')).toBe(true);
      expect(isCanonicalRuleSection('## Topología Cartográfica de Nodos MikroTik')).toBe(false);

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      const item = result.reconciled_items.find((i) =>
        i.file.endsWith('mandatory_qa_pyramid_and_doc_sync.md')
      );
      expect(item?.classification).toBe('DOMAIN_EXTRACTED_TO_DOMAIN_FILE');
      expect(fs.existsSync(modifiedCanonicalPath)).toBe(false);

      const expectedDomainFile = path.join(rulesDir, 'domain_rosgrid_web_rules.md');
      expect(fs.existsSync(expectedDomainFile)).toBe(true);
      const domainText = fs.readFileSync(expectedDomainFile, 'utf-8');
      expect(domainText).toContain('Topología Cartográfica de Nodos MikroTik');
      expect(domainText).not.toContain('Supreme Directive: Mandatory 11X Test Creation');
    });

    it('Case 8: backs up and deletes local copies of the canonical global skills in consumer .agents/skills/', async () => {
      for (const expectedSkill of [
        'qa-11x-architect',
        'qa-11x-docker-certifier',
        'docker-trivy-keydb-hardening',
        'graphify-ast-navigator',
        'refactoring-ui',
        'tactical-patterns-11x',
      ]) {
        expect(CANONICAL_GLOBAL_SKILL_DIRS.has(expectedSkill)).toBe(true);
      }
      for (const expectedRule of [
        'mandatory_qa_pyramid_and_doc_sync.md',
        'secure_development_and_testing_guidelines.md',
        'git_closure_gate.md',
      ]) {
        expect(CANONICAL_GLOBAL_RULE_FILES.has(expectedRule)).toBe(true);
      }
      const projectDir = path.join(tmpDir, 'consumer-with-local-skills');
      const skillsDir = path.join(projectDir, '.agents', 'skills');

      for (const skillName of CANONICAL_GLOBAL_SKILL_DIRS) {
        const sDir = path.join(skillsDir, skillName);
        fs.mkdirSync(path.join(sDir, 'references'), { recursive: true });
        fs.writeFileSync(path.join(sDir, 'SKILL.md'), `# Local copy of ${skillName}`, 'utf-8');
        fs.writeFileSync(path.join(sDir, 'references', 'guide.md'), '# Ref', 'utf-8');
        if (skillName === 'qa-11x-architect') {
          fs.symlinkSync('SKILL.md', path.join(sDir, 'alias.md'));
        }
      }

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      expect(result.removed_duplicate_sections_count).toBe(CANONICAL_GLOBAL_SKILL_DIRS.size);

      for (const skillName of CANONICAL_GLOBAL_SKILL_DIRS) {
        const backupSkillDir = path.join(result.backup_dir!, '.agents', 'skills', skillName);
        const backupSkillMd = path.join(backupSkillDir, 'SKILL.md');
        const backupRefDir = path.join(backupSkillDir, 'references');
        const backupRefMd = path.join(backupRefDir, 'guide.md');
        expect(fs.existsSync(backupSkillMd)).toBe(true);
        expect(fs.existsSync(backupRefMd)).toBe(true);
        expect(fs.statSync(backupSkillDir).mode & 0o777).toBe(0o700);
        expect(fs.statSync(backupRefDir).mode & 0o777).toBe(0o700);
        expect(fs.statSync(backupSkillMd).mode & 0o777).toBe(0o600);
        expect(fs.statSync(backupRefMd).mode & 0o777).toBe(0o600);
        if (skillName === 'qa-11x-architect') {
          expect(fs.lstatSync(path.join(backupSkillDir, 'alias.md')).isSymbolicLink()).toBe(true);
        }
        expect(fs.existsSync(path.join(skillsDir, skillName))).toBe(false);
      }
      // Como solo había skills canónicas, el directorio .agents/skills vacío fue eliminado
      expect(fs.existsSync(skillsDir)).toBe(false);
    });

    it('Case 9: preserves custom non-canonical skill in consumer project and preserves canonical files in upstream repo', async () => {
      const consumerDir = path.join(tmpDir, 'consumer-custom-skill');
      const customSkillDir = path.join(consumerDir, '.agents', 'skills', 'custom-mikrotik-skill');
      fs.mkdirSync(customSkillDir, { recursive: true });
      fs.writeFileSync(path.join(customSkillDir, 'SKILL.md'), '# Custom Skill', 'utf-8');

      await reconcileAgentsGovernance({ projectPath: consumerDir, dryRun: false });
      expect(fs.existsSync(path.join(customSkillDir, 'SKILL.md'))).toBe(true);

      // Simular repositorio fuente qa-testing-blueprints (scripts/generar-manifiesto.py + manifest.json)
      const upstreamDir = path.join(tmpDir, 'upstream-blueprints');
      fs.mkdirSync(path.join(upstreamDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(upstreamDir, 'scripts', 'generar-manifiesto.py'), '# gen', 'utf-8');
      fs.writeFileSync(path.join(upstreamDir, 'manifest.json'), '{}', 'utf-8');
      expect(isUpstreamBlueprintsRepo(upstreamDir)).toBe(true);

      const upstreamRulesDir = path.join(upstreamDir, '.agents', 'rules');
      const upstreamSkillDir = path.join(upstreamDir, '.agents', 'skills', 'qa-11x-architect');
      fs.mkdirSync(upstreamRulesDir, { recursive: true });
      fs.mkdirSync(upstreamSkillDir, { recursive: true });
      const upstreamAgentsMd = path.join(upstreamDir, 'AGENTS.md');
      fs.writeFileSync(
        upstreamAgentsMd,
        '# Upstream\n\n## Invariante Anti-Silo\nTexto canonico.\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(upstreamRulesDir, 'mandatory_qa_pyramid_and_doc_sync.md'),
        '# Canonical',
        'utf-8'
      );
      fs.writeFileSync(path.join(upstreamSkillDir, 'SKILL.md'), '# Skill', 'utf-8');

      const upstreamRes = await reconcileAgentsGovernance({ projectPath: upstreamDir, dryRun: false });
      expect(upstreamRes.removed_duplicate_sections_count).toBe(0);
      expect(
        fs.existsSync(path.join(upstreamRulesDir, 'mandatory_qa_pyramid_and_doc_sync.md'))
      ).toBe(true);
      expect(fs.existsSync(upstreamSkillDir + '/SKILL.md')).toBe(true);
      expect(fs.readFileSync(upstreamAgentsMd, 'utf-8')).toContain('Invariante Anti-Silo');

      // CLI -p=<relative-dir> resolves relative to injected cwd
      const cliRelRes: string[] = [];
      await runReconcileAgentsCli(['-p=consumer-custom-skill', '--dry-run'], {
        cwd: tmpDir,
        log: (m) => cliRelRes.push(m),
      });
      expect(cliRelRes.join('\n')).toContain('Reconcile 11X');
    });

    it('Case 4: dry_run mode simulates without altering files or creating backups', async () => {
      const projectDir = path.join(tmpDir, 'dry-run-project');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const customFile = path.join(rulesDir, 'uat.md');
      fs.writeFileSync(customFile, '## Invariante Anti-Silo\nTexto promovido.', 'utf-8');

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: true });

      expect(result.dry_run).toBe(true);
      expect(result.backup_dir).toBeNull();
      expect(result.removed_duplicate_sections_count).toBeGreaterThan(0);
      expect(fs.existsSync(customFile)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.agents', 'backups'))).toBe(false);
    });

    it('Case 4b: omitting dryRun defaults to dry_run=true without modifying files or creating backups (F2.4)', async () => {
      const projectDir = path.join(tmpDir, 'default-dry-run-project');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const customFile = path.join(rulesDir, 'uat.md');
      fs.writeFileSync(customFile, '## Invariante Anti-Silo\nTexto promovido.', 'utf-8');

      const result = await reconcileAgentsGovernance({ projectPath: projectDir });

      expect(result.dry_run).toBe(true);
      expect(result.backup_dir).toBeNull();
      expect(result.removed_duplicate_sections_count).toBeGreaterThan(0);
      expect(fs.existsSync(customFile)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.agents', 'backups'))).toBe(false);
    });

    it('Case 5: removes completely redundant rule file with no domain sections left', async () => {
      const projectDir = path.join(tmpDir, 'redundant-only');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const onlyPromoted = path.join(rulesDir, 'old_silo.md');
      fs.writeFileSync(onlyPromoted, '## Invariante Anti-Silo\nTexto\n## 3 Fases Temporales\nTexto', 'utf-8');

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      const removedItem = result.reconciled_items.find((i) => i.classification === 'REDUNDANT_PROMOTED_REMOVED');

      expect(removedItem).toBeDefined();
      expect(fs.existsSync(onlyPromoted)).toBe(false);
    });

    it('Case 6: appends to an existing domain_<project>_rules.md if already present', async () => {
      const projectDir = path.join(tmpDir, 'append-domain');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      const domainFile = path.join(rulesDir, 'domain_append_domain_rules.md');
      fs.writeFileSync(domainFile, '# Initial Domain Rules\n\n## Rule 1\nInitial text.\n', 'utf-8');

      const mixedFile = path.join(rulesDir, 'other.md');
      fs.writeFileSync(
        mixedFile,
        '## Invariante Anti-Silo\nPromoted.\n## Rule 2\nAdditional domain rule.\n',
        'utf-8'
      );

      await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });

      const content = fs.readFileSync(domainFile, 'utf-8');
      expect(content).toContain('Initial Domain Rules');
      expect(content).toContain('Additional domain rule');
      expect(content).not.toContain('Invariante Anti-Silo');
    });
  });

  describe('runReconcileAgentsCli', () => {
    it('executes CLI and prints summary log', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const projectDir = path.join(tmpDir, 'cli-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await runReconcileAgentsCli(['--project-path', projectDir]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Reconcile 11X]'));
    });

    it('logs domain_rules_file and backup_dir when rules are extracted', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const projectDir = path.join(tmpDir, 'cli-test-with-rules');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      fs.writeFileSync(
        path.join(rulesDir, 'mixed.md'),
        '## Invariante Anti-Silo\nPromoted\n## Custom Domain\nKeep this',
        'utf-8'
      );

      await runReconcileAgentsCli(['-p', projectDir]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Reconcile 11X]'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reglas de dominio aisladas en:'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Respaldo creado en:'));
    });

    it('honors injected cwd and log in runReconcileAgentsCli and runCli without process.cwd() or console.log', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const projectDir = path.join(tmpDir, 'injected-cwd-ws');
      const rulesDir = path.join(projectDir, '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(rulesDir, 'mixed.md'),
        '## Invariante Anti-Silo\nPromoted\n## Custom Domain\nKeep this',
        'utf-8'
      );

      const helpLogs: string[] = [];
      await runReconcileAgentsCli(['--help'], { log: (m) => helpLogs.push(m) });
      expect(helpLogs).toEqual([RECONCILE_AGENTS_HELP_TEXT]);
      expect(consoleLogSpy).not.toHaveBeenCalled();

      const cliLogs: string[] = [];
      await runReconcileAgentsCli(['--dry-run'], { cwd: projectDir, log: (m) => cliLogs.push(m) });
      expect(cliLogs.some((line) => line.includes('[Reconcile 11X]'))).toBe(true);
      expect(cliLogs.some((line) => line.includes('domain_injected_cwd_ws_rules.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.agents', 'backups'))).toBe(false);
      expect(consoleLogSpy).not.toHaveBeenCalled();

      const dispatchLogs: string[] = [];
      const dispatchRes = await runCli(['reconcile-agents', '--dry-run'], {
        cwd: projectDir,
        log: (m) => dispatchLogs.push(m),
      });
      expect(dispatchRes.exitCode).toBe(0);
      expect(dispatchRes.command).toBe('reconcile-agents');
      expect(dispatchRes.parsed?.projectPath).toBe(projectDir);
      expect(dispatchLogs.some((line) => line.includes('[Reconcile 11X]'))).toBe(true);
      expect(dispatchLogs.some((line) => line.includes('domain_injected_cwd_ws_rules.md'))).toBe(true);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('syncGlobalGeminiMd', () => {
    it('returns updated: false if .gemini directory does not exist in homeDir', () => {
      const emptyHome = path.join(tmpDir, 'empty-home');
      fs.mkdirSync(emptyHome, { recursive: true });

      const res = syncGlobalGeminiMd(emptyHome);
      expect(res.updated).toBe(false);
      expect(res.geminiMdPath).toBe(path.join(emptyHome, '.gemini', 'GEMINI.md'));
    });

    it('creates or updates ~/.gemini/GEMINI.md non-destructively when .gemini exists', () => {
      const fakeHome = path.join(tmpDir, 'fake-home');
      const geminiDir = path.join(fakeHome, '.gemini');
      fs.mkdirSync(geminiDir, { recursive: true });

      const existingGeminiMd = '# Personal Global Directives\nCustom preference here.\n';
      fs.writeFileSync(path.join(geminiDir, 'GEMINI.md'), existingGeminiMd, 'utf-8');

      const res = syncGlobalGeminiMd(fakeHome, false);
      expect(res.updated).toBe(true);

      const updated = fs.readFileSync(res.geminiMdPath, 'utf-8');
      expect(updated).toContain('Personal Global Directives');
      expect(updated).toContain('Custom preference here');
      expect(updated).toContain('QA_11X_MCP_CONNECTOR_START');
      expect(updated).toContain('Graphify AST-First');
      expect(updated).toContain('propose_skill_evolution_pr');
      expect(updated).toContain('reconcile_agents_governance');

      // Segunda invocación idempotente cuando ya existen los marcadores sin cambios -> evita reescritura innecesaria
      const resSecond = syncGlobalGeminiMd(fakeHome, false);
      expect(resSecond.updated).toBe(false);
      const updatedSecond = fs.readFileSync(resSecond.geminiMdPath, 'utf-8');
      expect(updatedSecond).toContain('Personal Global Directives');
      expect(updatedSecond.match(/QA_11X_MCP_CONNECTOR_START/g)?.length).toBe(1);

      // Creación desde cero cuando GEMINI.md no existe aún
      const freshHome = path.join(tmpDir, 'fresh-home');
      fs.mkdirSync(path.join(freshHome, '.gemini'), { recursive: true });
      const resFresh = syncGlobalGeminiMd(freshHome, false);
      expect(resFresh.updated).toBe(true);
      expect(fs.readFileSync(resFresh.geminiMdPath, 'utf-8')).toContain('Global AI Agent Directives');
    });

    it('respects dryRun in syncGlobalGeminiMd', () => {
      const fakeHome = path.join(tmpDir, 'fake-home-dry');
      const geminiDir = path.join(fakeHome, '.gemini');
      fs.mkdirSync(geminiDir, { recursive: true });

      const res = syncGlobalGeminiMd(fakeHome, true);
      expect(res.updated).toBe(true);
      expect(fs.existsSync(res.geminiMdPath)).toBe(false);
    });

    it('rejects dangling GEMINI.md and symlinked .gemini directory in syncGlobalGeminiMd', () => {
      const outsideDir = path.join(tmpDir, 'gemini-outside');
      fs.mkdirSync(outsideDir, { recursive: true });

      const homeDangling = path.join(tmpDir, 'home-dangling-gemini');
      fs.mkdirSync(path.join(homeDangling, '.gemini'), { recursive: true });
      const victim1 = path.join(outsideDir, 'pwned_gemini.md');
      fs.symlinkSync(victim1, path.join(homeDangling, '.gemini', 'GEMINI.md'));
      expect(() => syncGlobalGeminiMd(homeDangling, false)).toThrow(/symlink|CWE-22/i);
      expect(fs.existsSync(victim1)).toBe(false);

      const homeDirLink = path.join(tmpDir, 'home-link-gemini');
      fs.mkdirSync(homeDirLink, { recursive: true });
      fs.symlinkSync(outsideDir, path.join(homeDirLink, '.gemini'));
      expect(() => syncGlobalGeminiMd(homeDirLink, false)).toThrow(/symlink|CWE-22/i);
      expect(fs.existsSync(path.join(outsideDir, 'GEMINI.md'))).toBe(false);
    });
  });

  describe('certifyGate & install-skill integration', () => {
    it('certify11xGate returns upstream_evolution_reminder', async () => {
      const res = await certify11xGate(tmpDir);
      expect(res.upstream_evolution_reminder).toBeDefined();
      expect(res.upstream_evolution_reminder).toContain('MANDATORY POST-MORTEM CHECK');
      expect(res.upstream_evolution_reminder).toContain('propose_skill_evolution_pr');
    });

    it('runInstallSkillCli supports --reconcile flag', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fakeFetcher = new GitHubFetcher();
      vi.spyOn(fakeFetcher, 'fetchManifest').mockResolvedValue({
        blueprint_version: '2.9.1',
        schema_version: '1.0.0',
        generated_at_utc: '2026-11-05T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main',
        stacks: {},
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
            size_bytes: 100,
            merge_strategy: 'overwrite',
          },
        ],
      });
      vi.spyOn(fakeFetcher, 'fetchFileContent').mockResolvedValue('# Test Skill Content');

      const originalCwd = process.cwd();
      try {
        process.chdir(tmpDir);
        await runInstallSkillCli(['--target=workspace', '--reconcile'], fakeFetcher);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Reconcile 11X]'));
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('parseReconcileAgentsArgs y runReconcileAgentsCli cubren inline =, posicionales, errores y --help/-h', async () => {
      expect(parseReconcileAgentsArgs([`--project-path=${tmpDir}`, '--dry-run'])).toEqual({
        projectPath: tmpDir,
        dryRun: true,
        help: false,
      });
      expect(parseReconcileAgentsArgs([`--dir=${tmpDir}`]).projectPath).toBe(tmpDir);
      expect(parseReconcileAgentsArgs(['--help']).help).toBe(true);
      expect(parseReconcileAgentsArgs(['-h']).help).toBe(true);
      expect(parseReconcileAgentsArgs([tmpDir]).projectPath).toBe(tmpDir);

      expect(() => parseReconcileAgentsArgs(['--project-path='])).toThrow(
        "Falta el valor requerido para la opción '--project-path'"
      );
      expect(() => parseReconcileAgentsArgs(['-p'])).toThrow(
        "Falta el valor requerido para la opción '-p'"
      );
      expect(() => parseReconcileAgentsArgs(['--dir', '--dry-run'])).toThrow(
        "Falta el valor requerido para la opción '--dir'"
      );
      expect(() => parseReconcileAgentsArgs([tmpDir, '/second-dir'])).toThrow(
        'Argumento posicional inesperado en reconcile-agents'
      );

      const helpLogs: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
        helpLogs.push(String(msg));
      });
      try {
        await runReconcileAgentsCli(['--help']);
        await runReconcileAgentsCli(['-h']);
        expect(helpLogs).toEqual([RECONCILE_AGENTS_HELP_TEXT, RECONCILE_AGENTS_HELP_TEXT]);
      } finally {
        logSpy.mockRestore();
      }
    });

    it('rechaza symlinks en AGENTS.md, reglas locales, skills y backups e ignora subdirectorios .md', async () => {
      const symProj = path.join(tmpDir, 'sym-proj');
      fs.mkdirSync(path.join(symProj, '.agents', 'rules', 'sub.md'), { recursive: true });
      fs.mkdirSync(path.join(symProj, '.agents', 'skills'), { recursive: true });
      const decoy = path.join(tmpDir, 'decoy.txt');
      fs.writeFileSync(decoy, 'decoy\n', 'utf8');

      // Subdirectorio .md dentro de rules se ignora limpiamente
      const dirRes = await reconcileAgentsGovernance({ projectPath: symProj, dryRun: true });
      expect(dirRes.removed_duplicate_sections_count).toBe(0);
      expect(dirRes.reconciled_items).toEqual([]);

      // Symlink en regla local -> lanza error
      fs.symlinkSync(decoy, path.join(symProj, '.agents', 'rules', 'sym.md'));
      await expect(reconcileAgentsGovernance({ projectPath: symProj, dryRun: true })).rejects.toThrow(/Symlink/);
      fs.unlinkSync(path.join(symProj, '.agents', 'rules', 'sym.md'));

      // Symlink o directorio no regular en AGENTS.md -> lanza error
      fs.symlinkSync(decoy, path.join(symProj, 'AGENTS.md'));
      await expect(reconcileAgentsGovernance({ projectPath: symProj, dryRun: true })).rejects.toThrow(/Symlink/);
      fs.unlinkSync(path.join(symProj, 'AGENTS.md'));
      fs.mkdirSync(path.join(symProj, 'AGENTS.md'));
      await expect(reconcileAgentsGovernance({ projectPath: symProj, dryRun: true })).rejects.toThrow(/no regular/);
      fs.rmSync(path.join(symProj, 'AGENTS.md'), { recursive: true, force: true });

      // Symlink en skill canónica local -> lanza error
      fs.symlinkSync(tmpDir, path.join(symProj, '.agents', 'skills', 'qa-11x-architect'));
      await expect(reconcileAgentsGovernance({ projectPath: symProj, dryRun: false })).rejects.toThrow(/Symlink/);
      fs.unlinkSync(path.join(symProj, '.agents', 'skills', 'qa-11x-architect'));

      // Symlink en ruta de domain rules cuando se extraen reglas de dominio -> lanza error
      fs.writeFileSync(path.join(symProj, '.agents', 'rules', 'custom.md'), '## Custom Domain Rule\nKeep this.\n', 'utf8');
      fs.symlinkSync(decoy, path.join(symProj, '.agents', 'rules', 'domain_sym_proj.md'));
      await expect(reconcileAgentsGovernance({ projectPath: symProj, dryRun: false })).rejects.toThrow(/Symlink/);

      // Symlink ancestral en ws/.agents -> outside: bloquea lectura/borrado/escritura en skills/ y rules/ externos
      const outsideAgents = path.join(tmpDir, 'outside-agents-dir');
      fs.mkdirSync(path.join(outsideAgents, 'skills', 'qa-11x-architect'), { recursive: true });
      fs.mkdirSync(path.join(outsideAgents, 'rules'), { recursive: true });
      fs.writeFileSync(path.join(outsideAgents, 'skills', 'qa-11x-architect', 'SKILL.md'), '# Skill\n', 'utf8');
      fs.writeFileSync(path.join(outsideAgents, 'rules', 'custom.md'), '## Keep External Rule\n', 'utf8');

      const wsSymAgents = path.join(tmpDir, 'ws-sym-agents');
      fs.mkdirSync(wsSymAgents, { recursive: true });
      fs.symlinkSync(outsideAgents, path.join(wsSymAgents, '.agents'));

      await expect(reconcileAgentsGovernance({ projectPath: wsSymAgents, dryRun: false })).rejects.toThrow(/Symlink/);
      expect(fs.existsSync(path.join(outsideAgents, 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(outsideAgents, 'rules', 'custom.md'))).toBe(true);
      expect(fs.existsSync(path.join(outsideAgents, 'backups'))).toBe(false);
    });

    it('v2: conservative AGENTS.md & domain_* pruning, bridge prune/preserve, shadow skills, loose backups, .gitignore, advisories & --scan-workspaces', async () => {
      const { execFileSync } = await import('node:child_process');
      const wsRoot = path.join(tmpDir, 'workspaces-root');
      const repoClean = path.join(wsRoot, 'clean-consumer');
      const repoDirty = path.join(wsRoot, 'dirty-consumer');
      const upstreamRepo = path.join(wsRoot, 'qa-testing-blueprints-mirror');

      // 1. Clean consumer with rich legacy clutter
      fs.mkdirSync(path.join(repoClean, '.agents', 'rules'), { recursive: true });
      fs.mkdirSync(path.join(repoClean, '.claude', 'skills', 'qa-11x-architect'), { recursive: true });
      fs.mkdirSync(path.join(repoClean, '.claude', 'skills', 'custom-vendor'), { recursive: true });
      fs.mkdirSync(path.join(repoClean, '.cursor', 'rules'), { recursive: true });
      await fs.promises.mkdir(path.join(repoClean, '.codex', 'skills', 'qa-11x-architect'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(repoClean, '.codex', 'skills', 'qa-11x-architect', 'SKILL.md'),
        '# Canonical copy in codex\n',
        'utf-8'
      );
      fs.mkdirSync(path.join(repoClean, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(repoClean, 'docs', 'examples', 'python'), { recursive: true });
      fs.writeFileSync(
        path.join(repoClean, '.claude', 'skills', 'qa-11x-architect', 'SKILL.md'),
        '# Canonical copy\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.claude', 'skills', 'custom-vendor', 'SKILL.md'),
        '# Keep custom vendor skill\n',
        'utf-8'
      );
      fs.writeFileSync(path.join(repoClean, 'scripts', 'install-skill.sh'), '#!/bin/sh\n', 'utf-8');
      fs.writeFileSync(path.join(repoClean, '.agents', 'README.md'), '# Stale ref\n', 'utf-8');
      fs.writeFileSync(path.join(repoClean, 'AGENTS.md.bak'), 'old\n', 'utf-8');
      fs.writeFileSync(path.join(repoClean, '.agents', 'rule.11x-backup'), 'old\n', 'utf-8');
      fs.writeFileSync(path.join(repoClean, 'scripts', 'limpieza.sh.11x-incoming'), 'new\n', 'utf-8');
      fs.writeFileSync(
        path.join(repoClean, 'CLAUDE.md'),
        '<!-- QA_11X_BRIDGE_START -->\n# Old bridge\n<!-- QA_11X_BRIDGE_END -->\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.cursor', 'rules', 'qa-11x.mdc'),
        '---\ndescription: test\nglobs: "**/*"\nalwaysApply: true\n---\n\n<!-- QA_11X_BRIDGE_START -->\n# Old\n<!-- QA_11X_BRIDGE_END -->\n\n# Custom Cursor Rule\nKeep me.\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.aider.conf.yml'),
        '# User aider config\n# QA_11X_BRIDGE_START\nread:\n  - OLD.md\n# QA_11X_BRIDGE_END\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.windsurfrules'),
        '<!-- QA_11X_MCP_CONNECTOR_START -->\n# Legacy connector bridge\n<!-- QA_11X_MCP_CONNECTOR_END -->\n# User Windsurf Rule\n',
        'utf-8'
      );
      fs.writeFileSync(path.join(repoClean, '.clinerules'), '# Plain custom cline rules without bridge markers\n', 'utf-8');
      fs.writeFileSync(
        path.join(repoClean, '.agents', 'rules', 'domain_clean_rules.md'),
        [
          '# Domain Rules',
          '## Invariante Anti-Silo',
          'Regla global pura sin rutas locales.',
          '## Hybrid Check',
          'Aplica Rule Zero y SILO MOCK BLINDNESS en backend/app/billing.py.',
          '## Billing Domain',
          'Regla de dominio pura.',
          '## Billing Domain',
          'Regla de dominio pura.',
        ].join('\n\n'),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.agents', 'rules', 'domain_pure_prune_rules.md'),
        [
          '## High-IQ Token Economy Duplicate',
          'Generic promoted guidance.',
          '## Tenant Storage Isolation',
          'Keep S3 prefix strict per tenant in src/storage/s3.ts.',
        ].join('\n\n'),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, '.agents', 'rules', 'legacy_mixed_notes.md'),
        [
          'Headerless duplicate note.',
          'Headerless duplicate note.',
          '## Hybrid Legacy Rule',
          'Enforce Graphify AST-First inside backend/services/auth.py.',
        ].join('\n\n'),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(repoClean, 'AGENTS.md'),
        [
          '# AGENTS',
          buildConnectorBlock('clean-consumer', ['python']),
          '## High-IQ Token Economy Duplicate',
          'Duplicate generic text.',
          '## Mixed Agent Gate',
          'Follow Graphify AST-First in src/orders/service.ts.',
        ].join('\n\n'),
        'utf-8'
      );
      fs.writeFileSync(path.join(repoClean, '.gitignore'), 'node_modules/\n', 'utf-8');
      fs.writeFileSync(path.join(repoClean, '.agents', 'ACTIVE_TASK.md'), 'Status\n', 'utf-8');

      execFileSync('git', ['init'], { cwd: repoClean, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'qa@example.com'], { cwd: repoClean, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'QA'], { cwd: repoClean, stdio: 'ignore' });
      execFileSync('git', ['add', '.'], { cwd: repoClean, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: repoClean, stdio: 'ignore' });

      // 2. Dirty git consumer
      fs.mkdirSync(path.join(repoDirty, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(repoDirty, 'AGENTS.md'), '# Dirty\n## Silo Mock Blindness\ndup\n', 'utf-8');
      execFileSync('git', ['init'], { cwd: repoDirty, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'qa@example.com'], { cwd: repoDirty, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'QA'], { cwd: repoDirty, stdio: 'ignore' });
      execFileSync('git', ['add', '.'], { cwd: repoDirty, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDirty, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDirty, 'uncommitted.txt'), 'dirty\n', 'utf-8');

      // 3. Upstream repo mirror (must be UPSTREAM_SKIPPED; also verifies upstream domain_* preservation)
      fs.mkdirSync(path.join(upstreamRepo, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(upstreamRepo, '.agents', 'rules'), { recursive: true });
      fs.writeFileSync(path.join(upstreamRepo, 'scripts', 'generar-manifiesto.py'), '# up\n', 'utf-8');
      fs.writeFileSync(path.join(upstreamRepo, 'manifest.json'), '{}', 'utf-8');
      fs.writeFileSync(path.join(upstreamRepo, 'AGENTS.md'), '# Upstream\n', 'utf-8');
      fs.writeFileSync(
        path.join(upstreamRepo, '.agents', 'rules', 'domain_upstream_rules.md'),
        '# Upstream domain\n',
        'utf-8'
      );
      const upstreamRes = await reconcileAgentsGovernance({ projectPath: upstreamRepo, dryRun: true });
      expect(
        upstreamRes.reconciled_items.some(
          (i) => i.file.endsWith('domain_upstream_rules.md') && i.classification === 'DOMAIN_PRESERVED'
        )
      ).toBe(true);

      // Default scan-workspaces is read-only DRY-RUN
      const dryLogs: string[] = [];
      await runReconcileAgentsCli(['--scan-workspaces', wsRoot], { log: (m) => dryLogs.push(m) });
      expect(dryLogs.join('\n')).toContain('DRY_RUN');
      expect(dryLogs.join('\n')).toContain('UPSTREAM_SKIPPED');
      expect(fs.existsSync(path.join(repoClean, 'scripts', 'install-skill.sh'))).toBe(true);

      // --apply without --allow-dirty reconciles repoClean & skips repoDirty
      const applyLogs: string[] = [];
      await runReconcileAgentsCli(
        ['--scan-workspaces', wsRoot, '--apply', '--prune-bridges'],
        { log: (m) => applyLogs.push(m) }
      );
      expect(applyLogs.join('\n')).toContain('RECONCILED');
      expect(applyLogs.join('\n')).toContain('DIRTY_SKIPPED');
      expect(fs.existsSync(path.join(repoDirty, 'uncommitted.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(repoDirty, 'AGENTS.md'), 'utf-8')).toContain('Silo Mock Blindness');

      // Verify clean-consumer changes
      expect(fs.existsSync(path.join(repoClean, 'CLAUDE.md'))).toBe(false);
      expect(fs.readFileSync(path.join(repoClean, '.cursor', 'rules', 'qa-11x.mdc'), 'utf-8')).toContain(
        'Custom Cursor Rule'
      );
      expect(fs.existsSync(path.join(repoClean, 'scripts', 'install-skill.sh'))).toBe(false);
      expect(fs.existsSync(path.join(repoClean, 'AGENTS.md.bak'))).toBe(false);
      expect(fs.existsSync(path.join(repoClean, '.claude', 'skills', 'qa-11x-architect'))).toBe(false);
      expect(fs.existsSync(path.join(repoClean, '.claude', 'skills', 'custom-vendor', 'SKILL.md'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(repoClean, 'docs', 'examples', 'python'))).toBe(true);
      const cleanDomain = fs.readFileSync(
        path.join(repoClean, '.agents', 'rules', 'domain_clean_rules.md'),
        'utf-8'
      );
      expect(cleanDomain).not.toContain('Regla global pura');
      expect(cleanDomain).toContain('Hybrid Check');
      expect(cleanDomain.match(/## Billing Domain/g)).toHaveLength(1);
      expect(fs.existsSync(path.join(repoClean, '.codex', 'skills'))).toBe(false);
      expect(
        fs.readFileSync(path.join(repoClean, '.agents', 'rules', 'domain_pure_prune_rules.md'), 'utf-8')
      ).not.toContain('High-IQ Token Economy Duplicate');
      expect(fs.readFileSync(path.join(repoClean, '.aider.conf.yml'), 'utf-8')).toContain(
        '# QA_11X_BRIDGE_START'
      );
      expect(dedupeRepeatedHeadings(['Headerless note', 'Headerless note'])).toEqual({
        kept: ['Headerless note', 'Headerless note'],
        removedCount: 0,
      });
      expect(fs.readFileSync(path.join(repoClean, '.windsurfrules'), 'utf-8')).toContain(
        '# User Windsurf Rule'
      );
      expect(fs.readFileSync(path.join(repoClean, '.gitignore'), 'utf-8')).toContain('graphify-out/');

      // --allow-dirty + --json reconciles repoDirty too; single-repo --json verifies advisories & suggested git rm --cached
      const unreadableDir = path.join(wsRoot, 'unreadable-ws');
      fs.mkdirSync(unreadableDir, { recursive: true });
      fs.chmodSync(unreadableDir, 0o000);
      const dirtyJsonLogs: string[] = [];
      try {
        await runReconcileAgentsCli(
          ['--scan-workspaces', wsRoot, '--apply', '--allow-dirty', '--json'],
          { log: (m) => dirtyJsonLogs.push(m) }
        );
      } finally {
        fs.chmodSync(unreadableDir, 0o700);
      }
      expect(dirtyJsonLogs[0]).toContain('"RECONCILED"');
      expect(fs.readFileSync(path.join(repoDirty, 'AGENTS.md'), 'utf-8')).not.toContain(
        'Silo Mock Blindness'
      );
      expect(
        isGitWorktreeDirty(repoClean, () => {
          throw new Error('git unavailable');
        })
      ).toBe(false);
      await expect(
        runReconcileAgentsCli(['--scan-workspaces', path.join(tmpDir, 'does-not-exist')])
      ).rejects.toThrow('Directorio raíz de workspaces inválido');

      const singleJsonLogs: string[] = [];
      await runReconcileAgentsCli([repoClean, '--dry-run', '--json'], {
        log: (m) => singleJsonLogs.push(m),
      });
      const singleParsed = JSON.parse(singleJsonLogs[0] ?? '{}') as {
        advisories?: string[];
        suggested_git_commands?: string[];
      };
      expect(singleParsed.advisories?.some((a) => a.includes('docs/examples'))).toBe(true);
      expect(singleParsed.suggested_git_commands?.[0]).toContain('git rm --cached');
    });
  });
});
