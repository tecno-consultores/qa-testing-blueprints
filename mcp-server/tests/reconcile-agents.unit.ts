// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPromotedSection,
  isCanonicalRuleSection,
  isUpstreamBlueprintsRepo,
  splitMarkdownSections,
  reconcileAgentsGovernance,
  runReconcileAgentsCli,
  CANONICAL_GLOBAL_RULE_FILES,
  CANONICAL_GLOBAL_SKILL_DIRS,
  PROMOTED_INVARIANT_FINGERPRINTS,
} from '../src/cli/reconcile-agents.js';
import { syncGlobalGeminiMd, buildConnectorBlock } from '../src/cli/init-agents-md.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';

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

    it('handles projects without .agents/rules/ or AGENTS.md gracefully', async () => {
      const result = await reconcileAgentsGovernance({ projectPath: tmpDir });
      expect(result.project_path).toBe(path.resolve(tmpDir));
      expect(result.dry_run).toBe(false);
      expect(result.removed_duplicate_sections_count).toBe(0);
      expect(result.preserved_domain_sections_count).toBe(0);
      expect(result.reconciled_items).toEqual([]);
      expect(result.domain_rules_file).toBeNull();
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

    it('Case 8: backs up and deletes local copies of the 5 canonical skills in consumer .agents/skills/', async () => {
      const projectDir = path.join(tmpDir, 'consumer-with-local-skills');
      const skillsDir = path.join(projectDir, '.agents', 'skills');

      for (const skillName of CANONICAL_GLOBAL_SKILL_DIRS) {
        const sDir = path.join(skillsDir, skillName);
        fs.mkdirSync(sDir, { recursive: true });
        fs.writeFileSync(path.join(sDir, 'SKILL.md'), `# Local copy of ${skillName}`, 'utf-8');
      }

      const result = await reconcileAgentsGovernance({ projectPath: projectDir, dryRun: false });
      expect(result.removed_duplicate_sections_count).toBe(CANONICAL_GLOBAL_SKILL_DIRS.size);

      for (const skillName of CANONICAL_GLOBAL_SKILL_DIRS) {
        expect(
          fs.existsSync(path.join(result.backup_dir!, '.agents', 'skills', skillName, 'SKILL.md'))
        ).toBe(true);
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
      expect(fs.existsSync(path.join(upstreamSkillDir, 'SKILL.md'))).toBe(true);
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
      expect(updated).toContain('propose_skill_evolution_pr');
      expect(updated).toContain('reconcile_agents_governance');
    });

    it('respects dryRun in syncGlobalGeminiMd', () => {
      const fakeHome = path.join(tmpDir, 'fake-home-dry');
      const geminiDir = path.join(fakeHome, '.gemini');
      fs.mkdirSync(geminiDir, { recursive: true });

      const res = syncGlobalGeminiMd(fakeHome, true);
      expect(res.updated).toBe(true);
      expect(fs.existsSync(res.geminiMdPath)).toBe(false);
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
        stacks: {} as any,
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
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
  });
});
