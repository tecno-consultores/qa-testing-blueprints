// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchBlueprintBundle } from '../src/tools/fetch-bundle.js';
import { bootstrapOrMerge11x } from '../src/tools/bootstrap-merge.js';
import {
  GRAPHIFY_DOCKER_IMAGE,
  type GraphifyBuilderOptions,
  defaultGraphifyBuilder,
  inspectAstBlastRadius,
} from '../src/tools/blast-radius.js';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';
import { BlueprintResources } from '../src/resources/blueprint-resources.js';
import {
  parseResourceUriAndLang,
  runWithResourceLang,
  getActiveResourceLang,
} from '../src/resources/resourceLang.js';
import { readAiEvalsBlueprint } from '../src/resources/aiEvalsBlueprint.js';
import { readVibeRescueBlueprint } from '../src/resources/stackBlueprints.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import {
  CONNECTOR_START_MARKER as CONNECTOR_SERVICE_START_MARKER,
  CONNECTOR_END_MARKER as CONNECTOR_SERVICE_END_MARKER,
  buildThinConnectorBlock as buildServiceThinConnectorBlock,
  buildAgentsMdConnectorBlock as buildServiceAgentsMdConnectorBlock,
  mergeOrAppendAgentsMdContent as mergeServiceOrAppendAgentsMdContent,
  mergeAgentsMdContent as mergeServiceAgentsMdContent,
  resolveProjectDisplayName as resolveServiceProjectDisplayName,
} from '../src/services/agents-connector.js';
import {
  CONNECTOR_START_MARKER as CLI_CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER as CLI_CONNECTOR_END_MARKER,
  buildThinConnectorBlock as buildCliThinConnectorBlock,
  mergeOrAppendAgentsMdContent as mergeCliAgentsMdContent,
  resolveProjectDisplayName as resolveCliProjectDisplayName,
  initOrAppendAgentsMd as runCliInitAgentsMd,
} from '../src/cli/init-agents-md.js';
import {
  CONNECTOR_START_MARKER as TOOL_CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER as TOOL_CONNECTOR_END_MARKER,
  buildAgentsMdConnectorBlock as buildToolAgentsMdConnectorBlock,
  mergeAgentsMdContent as mergeToolAgentsMdContent,
  resolveProjectDisplayName as resolveToolProjectDisplayName,
  initOrAppendAgentsMd as runToolInitAgentsMd,
} from '../src/tools/initOrAppendAgentsMd.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { runCli } from '../src/cli.js';
import { parseReconcileAgentsArgs, runReconcileAgentsCli } from '../src/cli/reconcile-agents.js';
import {
  CLI_HELP_TEXT,
  attachPromptGuard,
  createConfiguredMcpServer,
  main,
  resolveToolExecutionOptions,
} from '../src/index.js';
import { TaskStateGuard } from '../src/utils/taskStateGuard.js';
import {
  attachDispatcherTracking,
  attachRegistrationTracking,
  createMcpServer,
  extractMethodName,
  getRegisteredServerSurface,
  getServerDispatcherRegistry,
  validateV2ToolWorkspaceArgs,
  wrapReadResourceDispatcher,
} from '../src/server.js';
import { Manifest, ManifestFileEntry } from '../src/types.js';

function restoreEnvVar(name: string, prevValue: string | undefined): void {
  if (prevValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = prevValue;
  }
}

describe('Tools and Resources Integration Suite', () => {
  let tmpDir: string;
  let localRepoDir: string;
  let targetProjectDir: string;
  let fetcher: GitHubFetcher;
  let merger: SurgicalMerger;
  let mockManifest: Manifest;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-test-'));
    localRepoDir = path.join(tmpDir, 'repo');
    targetProjectDir = path.join(tmpDir, 'target-project');
    fs.mkdirSync(localRepoDir, { recursive: true });
    fs.mkdirSync(targetProjectDir, { recursive: true });

    // Preparar manifest mock con archivos locales
    const file1 = 'python/Makefile.example';
    const content1 = 'qa-all:\n\techo "ok"\n';
    const hash1 = crypto.createHash('sha256').update(content1).digest('hex');

    const skillFile = '.agents/skills/qa-11x-architect/SKILL.md';
    const skillContent = '# Architect Skill';
    const skillHash = crypto.createHash('sha256').update(skillContent).digest('hex');

    const refactFile = '.agents/skills/refactoring-ui/SKILL.md';
    const refactContent = '# Refactoring UI';
    const refactHash = crypto.createHash('sha256').update(refactContent).digest('hex');

    const dockerTrivySkill = '.agents/skills/docker-trivy-keydb-hardening/SKILL.md';
    const dockerTrivyContent = '# Docker Trivy KeyDB Hardening';
    const dockerTrivyHash = crypto.createHash('sha256').update(dockerTrivyContent).digest('hex');

    const graphifySkill = '.agents/skills/graphify-ast-navigator/SKILL.md';
    const graphifyContent = '# Graphify AST Navigator';
    const graphifyHash = crypto.createHash('sha256').update(graphifyContent).digest('hex');

    const qaDockerSkill = '.agents/skills/qa-11x-docker-certifier/SKILL.md';
    const qaDockerContent = '# QA 11X Docker Certifier';
    const qaDockerHash = crypto.createHash('sha256').update(qaDockerContent).digest('hex');

    const promptFile = 'AI_MASTER_PROMPT.md';
    const promptContent = '# Master Prompt';
    const promptHash = crypto.createHash('sha256').update(promptContent).digest('hex');

    const readmeFile = 'python/README.md';
    const readmeContent = '# Python Blueprint Documentation';
    const readmeHash = crypto.createHash('sha256').update(readmeContent).digest('hex');

    const secFile = '.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md';
    const secContent = '# 22 Security Patterns';
    const secHash = crypto.createHash('sha256').update(secContent).digest('hex');

    const activeTaskFile = '.agents/ACTIVE_TASK.md.example';
    const activeTaskContent = '# Active Task Template Example';
    const activeTaskHash = crypto.createHash('sha256').update(activeTaskContent).digest('hex');

    const validatorFile = '.agents/scripts/verify_roadmap_consistency.py';
    const validatorContent = '#!/usr/bin/env python3\n# Roadmap and Active Task Validator';
    const validatorHash = crypto.createHash('sha256').update(validatorContent).digest('hex');

    const cleanFile = 'scripts/limpieza.sh';
    const cleanContent = '#!/usr/bin/env bash\necho "cleaning"';
    const cleanHash = crypto.createHash('sha256').update(cleanContent).digest('hex');

    mockManifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {
        python: {
          description: 'Python Standalone',
          readme: 'python/README.md',
          files: [
            {
              path: file1,
              target_name: 'Makefile',
              merge_strategy: 'surgical_merge',
              sha256: hash1,
              size_bytes: content1.length,
            },
            {
              path: readmeFile,
              target_name: 'README.md',
              merge_strategy: 'copy_if_missing',
              sha256: readmeHash,
              size_bytes: readmeContent.length,
            },
          ],
        },
      },
      common_files: [
        {
          path: cleanFile,
          target_name: cleanFile,
          merge_strategy: 'overwrite_executable',
          sha256: cleanHash,
          size_bytes: cleanContent.length,
        },
      ],
      agent_governance_files: [
        {
          path: skillFile,
          target_name: skillFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: skillHash,
          size_bytes: skillContent.length,
        },
        {
          path: refactFile,
          target_name: refactFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: refactHash,
          size_bytes: refactContent.length,
        },
        {
          path: dockerTrivySkill,
          target_name: dockerTrivySkill,
          merge_strategy: 'copy_or_overwrite',
          sha256: dockerTrivyHash,
          size_bytes: dockerTrivyContent.length,
        },
        {
          path: graphifySkill,
          target_name: graphifySkill,
          merge_strategy: 'copy_or_overwrite',
          sha256: graphifyHash,
          size_bytes: graphifyContent.length,
        },
        {
          path: qaDockerSkill,
          target_name: qaDockerSkill,
          merge_strategy: 'copy_or_overwrite',
          sha256: qaDockerHash,
          size_bytes: qaDockerContent.length,
        },
        {
          path: promptFile,
          target_name: promptFile,
          merge_strategy: 'surgical_merge',
          sha256: promptHash,
          size_bytes: promptContent.length,
        },
        {
          path: secFile,
          target_name: secFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: secHash,
          size_bytes: secContent.length,
        },
        {
          path: activeTaskFile,
          target_name: '.agents/ACTIVE_TASK.md',
          merge_strategy: 'copy_if_missing',
          sha256: activeTaskHash,
          size_bytes: activeTaskContent.length,
        },
        {
          path: validatorFile,
          target_name: validatorFile,
          merge_strategy: 'overwrite_executable',
          sha256: validatorHash,
          size_bytes: validatorContent.length,
        },
      ],
    };

    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(mockManifest), 'utf-8');

    // Escribir los archivos en disco dentro de localRepoDir
    const writeRepoFile = (rel: string, c: string) => {
      const p = path.join(localRepoDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, c, 'utf-8');
    };

    writeRepoFile(file1, content1);
    writeRepoFile(readmeFile, readmeContent);
    writeRepoFile(skillFile, skillContent);
    writeRepoFile(refactFile, refactContent);
    writeRepoFile(dockerTrivySkill, dockerTrivyContent);
    writeRepoFile(graphifySkill, graphifyContent);
    writeRepoFile(qaDockerSkill, qaDockerContent);
    writeRepoFile(promptFile, promptContent);
    writeRepoFile(secFile, secContent);
    writeRepoFile(activeTaskFile, activeTaskContent);
    writeRepoFile(validatorFile, validatorContent);
    writeRepoFile(cleanFile, cleanContent);

    fetcher = new GitHubFetcher({
      cacheDir: path.join(tmpDir, 'cache'),
      localOverridePath: localRepoDir,
    });
    merger = new SurgicalMerger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('fetchBlueprintBundle Tool', () => {
    it('returns bundled files with verified SHA-256 when includeContent is true', async () => {
      const result = await fetchBlueprintBundle('python', true, fetcher, true);
      expect(result.stack).toBe('python');
      expect(result.total_files).toBeGreaterThan(0);
      const firstFile = result.files[0];
      expect(firstFile).toBeDefined();
      expect(firstFile?.sha256_verified).toBe(true);
      expect(firstFile?.content.length).toBeGreaterThan(0);
    });

    it('omits file content and provides token-saving metadata by default (includeContent = false)', async () => {
      const result = await fetchBlueprintBundle('python', true, fetcher);
      expect(result.stack).toBe('python');
      expect(result.total_files).toBeGreaterThan(0);
      expect(result.content_omitted_for_token_economy).toBe(true);
      const firstFile = result.files[0];
      expect(firstFile).toBeDefined();
      expect(firstFile?.content).toBe('');
      expect(firstFile?.size_bytes).toBeGreaterThan(0);
      expect(firstFile?.sha256_verified).toBe(true);
      expect(firstFile?.cached_path).toBeDefined();
      expect(firstFile?.cached_path).toBe(path.join(localRepoDir, 'python', 'Makefile.example'));
    });
  });

  describe('bootstrapOrMerge11x Tool', () => {
    it('executes non-destructive merge into target project directory', async () => {
      const result = await bootstrapOrMerge11x(targetProjectDir, 'python', false, {
        fetcher,
        merger,
      });
      expect(result.stack).toBe('python');
      expect(result.dry_run).toBe(false);
      expect(fs.existsSync(path.join(targetProjectDir, 'Makefile'))).toBe(true);
    });
  });

  describe('inspectAstBlastRadius Tool', () => {
    it('detects dependent files and calculates risk level MEDIUM (5-6)', async () => {
      fs.writeFileSync(
        path.join(targetProjectDir, 'service.py'),
        'from models import UserModel\n\ndef get_user(): pass\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'controller.py'),
        'from service import UserModel\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'repository.py'),
        'from models import UserModel\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'serializer.py'),
        'from models import UserModel\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'test_user.unit.py'),
        'from models import UserModel\n',
        'utf-8'
      );

      const result = await inspectAstBlastRadius(targetProjectDir, 'UserModel');

      expect(result.target_symbol).toBe('UserModel');
      expect(result.dependent_files_count).toBe(5);
      expect(result.risk_level).toBe('MEDIUM');
      expect(result.dependent_files).toContain('service.py');
      expect(result.dependent_files).toContain('controller.py');
      expect(result.dependent_files).toContain('test_user.unit.py');
      expect(result.suggested_tests_to_run).toContain('test_user.unit.py');
    });

    it('includes .feature and *.test.* consumer files and QA-TEST-SYNC-01 action reminder', async () => {
      fs.writeFileSync(path.join(targetProjectDir, 'api.ts'), 'export function syncOrder() { return true; }\n', 'utf-8');
      fs.writeFileSync(path.join(targetProjectDir, 'api_contract.feature'), 'Scenario: syncOrder\n  * print "ok"\n', 'utf-8');
      fs.writeFileSync(path.join(targetProjectDir, 'service.test.ts'), 'expect(syncOrder()).toBe(true);\n', 'utf-8');

      const result = await inspectAstBlastRadius(targetProjectDir, 'syncOrder');

      expect(result.dependent_files).toContain('api_contract.feature');
      expect(result.dependent_files).toContain('service.test.ts');
      expect(result.suggested_tests_to_run).toContain('api_contract.feature');
      expect(result.suggested_tests_to_run).toContain('service.test.ts');
      expect(result.ast_graph_action_required).toContain('QA-TEST-SYNC-01');
    });

    it('assigns LOW risk when dependent count < 5', async () => {
      fs.writeFileSync(path.join(targetProjectDir, 'single.py'), 'def helper(): pass\n', 'utf-8');
      const result = await inspectAstBlastRadius(targetProjectDir, 'helper');
      expect(result.risk_level).toBe('LOW');
    });

    it('assigns HIGH risk when dependent count reaches HIGH threshold (15) or security keyword matches', async () => {
      for (let i = 1; i <= 15; i++) {
        fs.writeFileSync(path.join(targetProjectDir, `mod_${i}.py`), 'from core import SharedSymbol\n', 'utf-8');
      }
      const result = await inspectAstBlastRadius(targetProjectDir, 'SharedSymbol');
      expect(result.risk_level).toBe('HIGH');
      expect(result.dependent_files_count).toBe(15);

      const secResult = await inspectAstBlastRadius(targetProjectDir, 'authToken');
      expect(secResult.risk_level).toBe('HIGH');
    });

    it('assigns CRITICAL risk when dependent count reaches CRITICAL threshold (25)', async () => {
      for (let i = 1; i <= 25; i++) {
        fs.writeFileSync(path.join(targetProjectDir, `crit_${i}.py`), 'from core import CriticalSymbol\n', 'utf-8');
      }
      const result = await inspectAstBlastRadius(targetProjectDir, 'CriticalSymbol');
      expect(result.risk_level).toBe('CRITICAL');
      expect(result.dependent_files_count).toBe(25);
    });

    it('truncates dependent files and suggested tests when maxItems is specified', async () => {
      for (let i = 1; i <= 8; i++) {
        fs.writeFileSync(path.join(targetProjectDir, `trunc_${i}.py`), 'from core import TruncSymbol\n', 'utf-8');
      }
      const result = await inspectAstBlastRadius(targetProjectDir, 'TruncSymbol', 3);
      expect(result.dependent_files_count).toBe(8);
      expect(result.dependent_files.length).toBe(3);
      expect(result.truncated_dependents_count).toBe(5);
      expect(result.suggested_tests_to_run.length).toBeLessThanOrEqual(3);
    });

    it('recurses into nested directories and ignores ignored directories like node_modules and .cache', async () => {
      const nestedDir = path.join(targetProjectDir, 'nested', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, 'deep_service.ts'), 'export const target = NestedSymbol;\n', 'utf-8');

      const cacheDir = path.join(targetProjectDir, '.cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'cache_file.ts'), 'NestedSymbol\n', 'utf-8');

      const nodeModulesDir = path.join(targetProjectDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'lib.ts'), 'NestedSymbol\n', 'utf-8');

      const result = await inspectAstBlastRadius(targetProjectDir, 'NestedSymbol');
      expect(result.dependent_files).toContain(path.join('nested', 'deep', 'deep_service.ts'));
      expect(result.dependent_files.some(f => f.includes('.cache'))).toBe(false);
      expect(result.dependent_files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('throws error if target directory does not exist', async () => {
      await expect(inspectAstBlastRadius(path.join(tmpDir, 'nonexistent'), 'Symbol')).rejects.toThrow(
        'El directorio no existe'
      );
    });

    it('detects missing AST graph and parses graphify-out/graph.json callers when present', async () => {
      fs.writeFileSync(path.join(targetProjectDir, 'Service.php'), '<?php class GraphTarget {}', 'utf-8');
      const noGraphRes = await inspectAstBlastRadius(targetProjectDir, 'GraphTarget');
      expect(noGraphRes.ast_graph_detected).toBe(false);
      expect(noGraphRes.ast_graph_files).toEqual([]);
      expect(noGraphRes.ast_graph_action_required).toContain('actualizar-grafos-graphify.sh');
      expect(noGraphRes.dependent_files).toContain('Service.php');

      const graphDir = path.join(targetProjectDir, 'graphify-out');
      fs.mkdirSync(graphDir, { recursive: true });
      const graphPayload = {
        nodes: [
          { id: 'node_target', label: 'GraphTarget', source_file: 'Service.php', source_location: 'L10' },
          { id: 'node_caller', label: 'CallerController', source_file: 'src/CallerController.php' },
          { id: 'node_spec_caller', label: 'CallerSpec', source_file: 'tests/Caller.spec.ts' },
          { id: 'node_callee', label: 'AuditHelper', source_file: 'src/AuditHelper.php', source_location: 'L42' },
          { id: 'node_fileless_callee', label: 'ExternalHelper' },
        ],
        links: [
          { source: 'node_caller', target: 'node_target', relation: 'calls' },
          { source: 'node_spec_caller', target: 'node_target', source_file: 'tests/Caller.spec.ts' },
          { source: 'node_target', target: 'node_callee', relation: 'calls' },
          { source: 'node_target', target: 'node_fileless_callee', relation: 'calls' },
          { source: 'node_target', target: 'node_callee', relation: 'contains' },
          { source: 'node_target', target: 'nonexistent_target', relation: 'calls' },
          { source: 'unknown_node', target: 'other_target' },
        ],
      };
      fs.writeFileSync(path.join(graphDir, 'graph.json'), JSON.stringify(graphPayload), 'utf-8');
      fs.writeFileSync(path.join(graphDir, 'GRAPH_REPORT.md'), '# Graph Report\n', 'utf-8');

      // También probar grafo corrupto en subdirectorio para cubrir catch
      const badGraphDir = path.join(targetProjectDir, 'sub', 'graphify-out');
      fs.mkdirSync(badGraphDir, { recursive: true });
      fs.writeFileSync(path.join(badGraphDir, 'graph.json'), '{ invalid json', 'utf-8');

      const withGraphRes = await inspectAstBlastRadius(targetProjectDir, 'GraphTarget');
      expect(withGraphRes.ast_graph_detected).toBe(true);
      expect(withGraphRes.ast_graph_files).toContain(path.join('graphify-out', 'graph.json'));
      expect(withGraphRes.graph_reports).toContain(path.join('graphify-out', 'GRAPH_REPORT.md'));
      expect(withGraphRes.declaring_files).toContain('Service.php:L10');
      expect(withGraphRes.outgoing_dependencies).toContain('src/AuditHelper.php:AuditHelper');
      expect(withGraphRes.outgoing_dependencies).toContain('ExternalHelper');
      expect(withGraphRes.dependent_files).toContain('src/CallerController.php');
      expect(withGraphRes.dependent_files).toContain('tests/Caller.spec.ts');
      expect(withGraphRes.ast_graph_action_required).toContain('Grafo AST detectado');

      // Probar autoBuildIfMissing y refreshGraph con graphBuilder inyectado
      const freshDir = path.join(tmpDir, 'fresh_auto_graph');
      fs.mkdirSync(freshDir, { recursive: true });
      fs.writeFileSync(path.join(freshDir, 'mod.py'), 'def AutoBuiltSymbol(): pass\n', 'utf-8');

      const autoBuiltRes = await inspectAstBlastRadius(freshDir, 'AutoBuiltSymbol', 20, {
        autoBuildIfMissing: true,
        graphBuilder: (projDir: string) => {
          const outDir = path.join(projDir, 'graphify-out');
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(
            path.join(outDir, 'graph.json'),
            JSON.stringify({
              nodes: [
                { id: 'n1', label: 'AutoBuiltSymbol', source_file: 'mod.py' },
                { id: 'n2', label: 'Consumer', source_file: 'consumer_from_graph.py' },
              ],
              links: [{ source: 'n2', target: 'n1' }],
            }),
            'utf-8'
          );
          return true;
        },
      });
      expect(autoBuiltRes.ast_graph_detected).toBe(true);
      expect(autoBuiltRes.ast_graph_rebuilt).toBe(true);
      expect(autoBuiltRes.dependent_files).toContain('consumer_from_graph.py');

      const refreshedRes = await inspectAstBlastRadius(freshDir, 'AutoBuiltSymbol', 20, {
        refreshGraph: true,
        graphBuilder: () => true,
      });
      expect(refreshedRes.ast_graph_rebuilt).toBe(true);

      // F2.1/F2.2/F2.5: defaultGraphifyBuilder NUNCA ejecuta bash en el host aunque exista scripts/actualizar-grafos-graphify.sh
      const scriptDir = path.join(freshDir, 'scripts');
      fs.mkdirSync(scriptDir, { recursive: true });
      const localGraphScript = path.join(scriptDir, 'actualizar-grafos-graphify.sh');
      fs.writeFileSync(
        localGraphScript,
        '#!/usr/bin/env bash\n# SPDX-License-Identifier: MIT\nexit 1\n',
        { mode: 0o755 }
      );

      const dockerCalls: Array<{
        cmd: string;
        args: readonly string[];
        cwd?: string;
        signal?: AbortSignal;
      }> = [];
      const mockDockerExec = ((
        cmd: string,
        args: readonly string[],
        opts: { cwd?: string; signal?: AbortSignal } | undefined,
        cb: (err: Error | null, stdout?: string, stderr?: string) => void
      ) => {
        dockerCalls.push({ cmd, args, cwd: opts?.cwd, signal: opts?.signal });
        cb(null, '', '');
      }) as unknown as Parameters<typeof defaultGraphifyBuilder>[1];

      const realFreshDir = fs.realpathSync(freshDir);
      const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
      const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;

      const controller = new AbortController();
      const execFileFn = mockDockerExec as unknown as NonNullable<GraphifyBuilderOptions['execFileFn']>;
      expect(await defaultGraphifyBuilder(freshDir, mockDockerExec, controller.signal)).toBe(true);
      expect(await defaultGraphifyBuilder(freshDir, { execFileFn, signal: controller.signal })).toBe(true);
      expect(await defaultGraphifyBuilder(freshDir, { execFileFn }, controller.signal)).toBe(true);
      expect(await defaultGraphifyBuilder('/etc', {})).toBe(false);
      expect(dockerCalls).toHaveLength(3);
      const firstDockerCall = dockerCalls[0];
      expect(firstDockerCall).toBeDefined();
      if (!firstDockerCall) {
        throw new Error('Expected a docker call to be recorded');
      }
      expect(firstDockerCall.cmd).toBe('docker');
      expect(firstDockerCall.cmd).not.toBe('bash');
      expect(firstDockerCall.signal).toBe(controller.signal);
      expect(firstDockerCall.args).toContain('--network');
      expect(firstDockerCall.args).toContain('none');
      expect(firstDockerCall.args).toContain(`${uid}:${gid}`);
      expect(firstDockerCall.args).toContain('HOME=/tmp');
      expect(firstDockerCall.args).toContain(`${realFreshDir}:/app:ro`);
      expect(firstDockerCall.args).toContain(`${path.join(realFreshDir, 'graphify-out')}:/app/graphify-out`);
      expect(firstDockerCall.args).toContain(GRAPHIFY_DOCKER_IMAGE);

      // Si AbortSignal ya está abortada, aborta sin ejecutar docker
      const abortedController = new AbortController();
      abortedController.abort(new Error('timeout abort'));
      const abortedNoCall = vi.fn();
      expect(
        await defaultGraphifyBuilder(
          freshDir,
          abortedNoCall as unknown as Parameters<typeof defaultGraphifyBuilder>[1],
          abortedController.signal
        )
      ).toBe(false);
      expect(abortedNoCall).not.toHaveBeenCalled();

      // Si docker falla, retorna false de forma segura
      const throwingDockerExec = ((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: Error | null) => void
      ) => {
        cb(new Error('docker unavailable'));
      }) as unknown as Parameters<typeof defaultGraphifyBuilder>[1];
      expect(await defaultGraphifyBuilder(freshDir, throwingDockerExec)).toBe(false);

      // Cubre fallback uid/gid = 1000 cuando process.getuid/getgid no están disponibles (Windows)
      const origGetuid = process.getuid;
      const origGetgid = process.getgid;
      Object.defineProperty(process, 'getuid', { value: undefined, configurable: true });
      Object.defineProperty(process, 'getgid', { value: undefined, configurable: true });
      try {
        const winCalls: Array<{ args: readonly string[] }> = [];
        expect(
          await defaultGraphifyBuilder(freshDir, ((
            _c: string,
            args: readonly string[],
            _opts: unknown,
            cb: (err: Error | null, stdout?: string, stderr?: string) => void
          ) => {
            winCalls.push({ args });
            cb(null, '', '');
          }) as unknown as Parameters<typeof defaultGraphifyBuilder>[1])
        ).toBe(true);
        expect(winCalls[0]?.args).toContain('1000:1000');
      } finally {
        Object.defineProperty(process, 'getuid', { value: origGetuid, configurable: true });
        Object.defineProperty(process, 'getgid', { value: origGetgid, configurable: true });
      }

      // Cubre catch de archivo candidato ilegible en processCandidateFile
      const unreadableCandidate = path.join(freshDir, 'unreadable_candidate.ts');
      fs.writeFileSync(unreadableCandidate, 'AutoBuiltSymbol\n', { mode: 0o000 });
      try {
        const resWithUnreadable = await inspectAstBlastRadius(freshDir, 'AutoBuiltSymbol');
        expect(resWithUnreadable.target_symbol).toBe('AutoBuiltSymbol');
      } finally {
        fs.chmodSync(unreadableCandidate, 0o600);
      }

      // Si se pasa ruta prohibida o inexistente, retorna false sin invocar docker
      const noCallSpy = vi.fn();
      expect(
        await defaultGraphifyBuilder('/etc', noCallSpy as unknown as Parameters<typeof defaultGraphifyBuilder>[1])
      ).toBe(false);
      expect(
        await defaultGraphifyBuilder(
          path.join(tmpDir, 'nonexistent-builder-dir'),
          noCallSpy as unknown as Parameters<typeof defaultGraphifyBuilder>[1]
        )
      ).toBe(false);
      expect(noCallSpy).not.toHaveBeenCalled();

      // inspectAstBlastRadius bloquea rutas prohibidas con WorkspacePathValidationError
      await expect(inspectAstBlastRadius('/etc', 'Symbol')).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(inspectAstBlastRadius('../outside', 'Symbol')).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(inspectAstBlastRadius(os.tmpdir(), 'Symbol')).rejects.toThrow(
        WorkspacePathValidationError
      );
    });
  });

  describe('BlueprintResources', () => {
    it('returns manifest resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getManifestResource();
      expect(res.uri).toBe('blueprint://manifest');
      expect(res.mimeType).toBe('application/json');
      expect((JSON.parse(res.text) as { blueprint_version: string }).blueprint_version).toBe('2.7.0');
    });

    it('returns philosophy resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getPhilosophyResource();
      expect(res.uri).toBe('blueprint://core/philosophy');
      expect(res.text).toBe('# Master Prompt');
    });

    it('returns security resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getSecurityResource();
      expect(res.uri).toBe('blueprint://security/disa-owasp-22');
      expect(res.text).toBe('# 22 Security Patterns');
    });

    it('returns stack readme resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getStackReadmeResource('python');
      expect(res.uri).toBe('blueprint://python/readme');
    });

    it('throws error when requesting unknown stack readme or prototype pollution key', async () => {
      const resources = new BlueprintResources(fetcher);
      await expect(resources.getStackReadmeResource('invalid-stack')).rejects.toThrow(
        "Stack 'invalid-stack' no reconocido"
      );
      await expect(resources.getStackReadmeResource('__proto__')).rejects.toThrow(
        "Stack '__proto__' no reconocido"
      );
    });

    it('serves blueprint://{stack}/readme for all 10 stacks including ai-evals, mobile-appium, and vibe-rescue with es fallback', async () => {
      const allTenStacks = [
        'python',
        'fastapi',
        'node-backend',
        'vue3',
        'react-frontend',
        'bash-scripts',
        'php',
        'mobile-appium',
        'ai-evals',
        'vibe-rescue',
      ];
      const tenStacksRecord: Manifest['stacks'] = {};
      for (const stack of allTenStacks) {
        const enPath = `${stack}/README.md`;
        const enBody = `# ${stack} English Blueprint`;
        const esPath = `${stack}/README.es.md`;
        const esBody = `# ${stack} Blueprint Español`;
        const fullEn = path.join(localRepoDir, enPath);
        const fullEs = path.join(localRepoDir, esPath);
        fs.mkdirSync(path.dirname(fullEn), { recursive: true });
        fs.writeFileSync(fullEn, enBody, 'utf-8');
        if (stack !== 'mobile-appium') {
          fs.writeFileSync(fullEs, esBody, 'utf-8');
        }
        let esMirrorFields: Partial<Manifest['stacks'][string]> = {};
        if (stack !== 'mobile-appium' && stack !== 'ai-evals') {
          esMirrorFields = {
            readme_es: esPath,
            readme_es_sha256: crypto.createHash('sha256').update(esBody).digest('hex'),
          };
        } else if (stack === 'ai-evals') {
          // Omit explicit readme_es to verify automatic .es.md derivation with readme_es_sha256
          esMirrorFields = {
            readme_es_sha256: crypto.createHash('sha256').update(esBody).digest('hex'),
          };
        }
        tenStacksRecord[stack] = {
          description: `${stack} stack`,
          readme: enPath,
          readme_sha256: crypto.createHash('sha256').update(enBody).digest('hex'),
          ...esMirrorFields,
          files: [],
        };
      }

      const fullManifest: Manifest = { ...mockManifest, stacks: tenStacksRecord };
      const tenFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-ten-stacks'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(tenFetcher, 'fetchManifest').mockResolvedValue(fullManifest);
      const tenResources = new BlueprintResources(tenFetcher);

      for (const stack of allTenStacks) {
        const enRes = await tenResources.getStackReadmeResource(stack, 'en');
        expect(enRes.uri).toBe(`blueprint://${stack}/readme`);
        expect(enRes.text).toBe(`# ${stack} English Blueprint`);
      }

      expect((await tenResources.getStackReadmeResource('ai-evals', 'es')).text).toBe(
        '# ai-evals Blueprint Español'
      );
      expect((await tenResources.getStackReadmeResource('vibe-rescue', 'es')).text).toBe(
        '# vibe-rescue Blueprint Español'
      );
      // mobile-appium has no Spanish mirror in fixture -> falls back cleanly to English README
      expect((await tenResources.getStackReadmeResource('mobile-appium', 'es')).text).toBe(
        '# mobile-appium English Blueprint'
      );

      await expect(tenResources.getStackReadmeResource('non-existent')).rejects.toThrow(
        `Opciones válidas: ${allTenStacks.join(', ')}`
      );
    });

    it('returns refactoring-ui resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getRefactoringUiResource('skill');
      expect(res.uri).toBe('blueprint://ui/refactoring-ui/skill');
      expect(res.text).toBe('# Refactoring UI');
    });

    it('returns active task template resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getActiveTaskTemplateResource();
      expect(res.uri).toBe('blueprint://core/active-task-template');
      expect(res.mimeType).toBe('text/markdown');
      expect(res.text).toBe('# Active Task Template Example');
    });

    it('throws error when requesting unknown or unsafe refactoring-ui topic', async () => {
      const resources = new BlueprintResources(fetcher);
      await expect(resources.getRefactoringUiResource('unknown-topic')).rejects.toThrow(
        "Tema de diseño 'unknown-topic' no encontrado"
      );
      await expect(resources.getRefactoringUiResource('sub/topic')).rejects.toThrow(
        'no se permiten subdirectorios'
      );
      await expect(resources.getRefactoringUiResource('../secret')).rejects.toThrow('CWE-22');
    });

    it('handles fallback when prompt or security file is absent in manifest', async () => {
      const emptyManifest: Manifest = {
        ...mockManifest,
        agent_governance_files: [],
      };
      const emptyFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'empty-cache'),
        localOverridePath: path.join(tmpDir, 'empty-repo'),
      });
      fs.mkdirSync(path.join(tmpDir, 'empty-repo'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'empty-repo', 'manifest.json'),
        JSON.stringify(emptyManifest),
        'utf-8'
      );

      const resources = new BlueprintResources(emptyFetcher);
      const phil = await resources.getPhilosophyResource();
      expect(phil.text).toContain('QA 11X Philosophy');
      const philEs = await resources.getPhilosophyResource('es');
      expect(philEs.text).toContain('Filosofía QA 11X');

      const sec = await resources.getSecurityResource();
      expect(sec.text).toContain('22 Security Patterns');
      const secEs = await resources.getSecurityResource('es');
      expect(secEs.text).toContain('22 Patrones de Seguridad');

      const task = await resources.getActiveTaskTemplateResource('en');
      expect(task.text).toContain('See the template at .agents/ACTIVE_TASK.md.example');
      const taskEs = await resources.getActiveTaskTemplateResource('es');
      expect(taskEs.text).toContain('Consulte la plantilla en .agents/ACTIVE_TASK.md.example');
      expect(taskEs.text).toContain('Plantilla Canónica de Bitácora Activa');

      const pgEn = await resources.getPostgresRlsWormResource('en');
      expect(pgEn.text).toContain('PostgreSQL 17 Multi-Transaction RLS');
      const pgEs = await resources.getPostgresRlsWormResource('es');
      expect(pgEs.text).toContain('PostgreSQL 17 RLS Multi-Transacción');
      expect(pgEs.text).toContain('Consulte docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md');
    });
  });

  describe('runInstallSkillCli', () => {
    it('installs skills into target workspace directory with --target workspace', async () => {
      const cwd = process.cwd();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const dest = path.join(targetProjectDir, 'cli-test');
      fs.mkdirSync(dest, { recursive: true });

      try {
        process.chdir(dest);
        await runInstallSkillCli(['--target', 'workspace'], fetcher);

        expect(fs.existsSync(path.join(dest, '.agents/skills/qa-11x-architect/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(dest, '.agents/skills/refactoring-ui/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(dest, '.agents/skills/docker-trivy-keydb-hardening/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(dest, '.agents/skills/graphify-ast-navigator/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(dest, '.agents/skills/qa-11x-docker-certifier/SKILL.md'))).toBe(true);
      } finally {
        process.chdir(cwd);
        consoleLogSpy.mockRestore();
      }
    });

    it('installs skills with --target=antigravity and --target claude', async () => {
      const cwd = process.cwd();
      const fakeWorkspace = path.join(tmpDir, 'all-target-ws');
      fs.mkdirSync(fakeWorkspace, { recursive: true });

      const fakeHome = path.join(tmpDir, 'fake-home');
      fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.hermes'), { recursive: true });

      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(fakeWorkspace);
        await runInstallSkillCli(['--target=antigravity'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['-t', 'claude'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.claude/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['--target', 'hermes'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.hermes/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['--target', 'all'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        // Con agentes globales detectados en $HOME, --target all no duplica skills en workspace/.agents/skills
        expect(
          fs.existsSync(path.join(fakeWorkspace, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(false);
      } finally {
        process.chdir(cwd);
        if (origHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = origHome;
        }
      }
    });

    it('throws error if manifest has no skills', async () => {
      const noSkillManifest: Manifest = {
        ...mockManifest,
        agent_governance_files: [],
      };
      const emptyFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'no-skills-cache'),
        localOverridePath: path.join(tmpDir, 'no-skills-repo'),
      });
      fs.mkdirSync(path.join(tmpDir, 'no-skills-repo'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'no-skills-repo', 'manifest.json'),
        JSON.stringify(noSkillManifest),
        'utf-8'
      );

      vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(runInstallSkillCli([], emptyFetcher)).rejects.toThrow(
        'No se encontraron archivos de skills'
      );
    });

    it('handles auto target when in git workspace and when outside git workspace', async () => {
      const cwd = process.cwd();
      const fakeWorkspace = path.join(tmpDir, 'auto-ws');
      fs.mkdirSync(path.join(fakeWorkspace, '.git'), { recursive: true });

      const fakeHome = path.join(tmpDir, 'auto-home');
      fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });

      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        // 1. Invocación desde fakeHome sin argumentos y con --target all --init-agents --include-scripts --reconcile:
        // detecta .gemini, .claude y .cursor y NO crea fakeHome/.agents ni archivos de proyecto en $HOME
        process.chdir(fakeHome);
        await runInstallSkillCli([], fetcher);
        await runInstallSkillCli(
          ['--target', 'all', '--init-agents', '--include-scripts', '--reconcile'],
          fetcher
        );
        await runInstallSkillCli(['--target', 'cursor'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(fakeHome, '.claude/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(fakeHome, '.cursor/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(fs.existsSync(path.join(fakeHome, '.agents'))).toBe(false);
        expect(fs.existsSync(path.join(fakeHome, 'AGENTS.md'))).toBe(false);
        expect(fs.existsSync(path.join(fakeHome, 'lefthook.yml'))).toBe(false);
        expect(fs.existsSync(path.join(fakeHome, 'scripts'))).toBe(false);

        // 2. Invocación desde proyecto git workspace cuando existen agentes globales en $HOME:
        // instala exclusivamente en los directorios globales sin duplicar en workspace/.agents/skills
        process.chdir(fakeWorkspace);
        await runInstallSkillCli([], fetcher);
        expect(
          fs.existsSync(path.join(fakeWorkspace, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(false);

        // 3. Invocación con --target cursor: instala exclusivamente en fakeHome/.cursor/skills
        await runInstallSkillCli(['--target', 'cursor'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.cursor/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(fakeWorkspace, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(false);

        // 4. Invocación en directorio aislado sin .git y con home aislado: fallback a $HOME/.agents/skills (sin contaminar cwd)
        const isolatedHome = path.join(tmpDir, 'isolated-home');
        fs.mkdirSync(isolatedHome, { recursive: true });
        process.env.HOME = isolatedHome;
        const isolatedCwd = path.join(tmpDir, 'isolated-cwd');
        fs.mkdirSync(isolatedCwd, { recursive: true });
        process.chdir(isolatedCwd);
        await runInstallSkillCli([], fetcher);
        expect(
          fs.existsSync(path.join(isolatedHome, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(isolatedCwd, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(false);

        // 5. Invocación con --target cursor cuando .cursor NO existe previamente: crea ~/.cursor/skills globalmente sin contaminar cwd
        const cleanCwdForCursor = path.join(tmpDir, 'clean-cwd-cursor');
        fs.mkdirSync(cleanCwdForCursor, { recursive: true });
        process.chdir(cleanCwdForCursor);
        await runInstallSkillCli(['--target', 'cursor'], fetcher);
        expect(
          fs.existsSync(path.join(isolatedHome, '.cursor/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(fs.existsSync(path.join(cleanCwdForCursor, '.agents'))).toBe(false);
      } finally {
        process.chdir(cwd);
        if (origHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = origHome;
        }
      }
    });

    it('installs operational scripts and common files when --include-scripts is provided', async () => {
      const cwd = process.cwd();
      const testDir = path.join(targetProjectDir, 'include-scripts-test');
      fs.mkdirSync(testDir, { recursive: true });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(testDir);
        await runInstallSkillCli(['--target', 'workspace', '--include-scripts'], fetcher);

        expect(fs.existsSync(path.join(testDir, 'scripts/limpieza.sh'))).toBe(true);
        expect(
          fs.existsSync(path.join(testDir, '.agents/scripts/verify_roadmap_consistency.py'))
        ).toBe(true);
        expect(fs.existsSync(path.join(testDir, '.agents/ACTIVE_TASK.md.example'))).toBe(true);
        expect(fs.existsSync(path.join(testDir, '.agents/ACTIVE_TASK.md'))).toBe(false);
        // --include-scripts no debe copiar las 8 reglas canónicas .agents/rules/*.md dentro del proyecto consumidor
        expect(fs.existsSync(path.join(testDir, '.agents/rules'))).toBe(false);

        // Segunda ejecución idempotente sin cambios locales en scripts/* (no genera .11x-incoming)
        await runInstallSkillCli(['--target', 'workspace', '--include-scripts'], fetcher);
        expect(fs.existsSync(path.join(testDir, 'scripts/limpieza.sh.11x-incoming'))).toBe(false);

        // Tercera ejecución con ACTIVE_TASK.md ya existente y script modificado: preserva script custom y emite .11x-incoming (D4)
        fs.writeFileSync(path.join(testDir, '.agents/ACTIVE_TASK.md'), '# Diario En Progreso', 'utf-8');
        fs.writeFileSync(path.join(testDir, 'scripts/limpieza.sh'), '#!/usr/bin/env bash\necho "custom"\n', 'utf-8');
        await runInstallSkillCli(['--target', 'workspace', '--include-scripts'], fetcher);
        expect(fs.readFileSync(path.join(testDir, '.agents/ACTIVE_TASK.md'), 'utf-8')).toBe(
          '# Diario En Progreso'
        );
        expect(fs.readFileSync(path.join(testDir, 'scripts/limpieza.sh'), 'utf-8')).toContain('custom');
        expect(fs.existsSync(path.join(testDir, 'scripts/limpieza.sh.11x-incoming'))).toBe(true);
        expect(
          fs.readFileSync(path.join(testDir, 'scripts/limpieza.sh.11x-incoming'), 'utf-8')
        ).toContain('cleaning');

        // Probar rama cuando no hay scripts comunes ni de agentes
        const emptyScriptsFetcher = new GitHubFetcher({ cacheDir: path.join(tmpDir, 'empty-scripts-cache') });
        vi.spyOn(emptyScriptsFetcher, 'fetchManifest').mockResolvedValue({
          ...mockManifest,
          common_files: undefined as unknown as Manifest['common_files'],
          agent_governance_files: [
            {
              path: '.agents/skills/qa-11x-architect/SKILL.md',
              target_name: 'SKILL.md',
              merge_strategy: 'copy_or_overwrite',
              sha256: crypto.createHash('sha256').update('# Architect Skill').digest('hex'),
              size_bytes: 17,
            },
          ],
        });
        vi.spyOn(emptyScriptsFetcher, 'fetchFileContent').mockResolvedValue('# Architect Skill');
        await runInstallSkillCli(['--target', 'workspace', '--include-scripts'], emptyScriptsFetcher);

        // Probar rama cuando entry.target_name es vacío y agent_governance_files es undefined
        const noTargetNameFetcher = new GitHubFetcher({ cacheDir: path.join(tmpDir, 'no-target-cache') });
        vi.spyOn(noTargetNameFetcher, 'fetchManifest').mockResolvedValue({
          ...mockManifest,
          common_files: [
            {
              path: 'scripts/direct-path.sh',
              target_name: '',
              merge_strategy: 'overwrite_executable',
              sha256: crypto.createHash('sha256').update('echo direct').digest('hex'),
              size_bytes: 11,
            },
          ],
          agent_governance_files: [
            {
              path: '.agents/skills/qa-11x-architect/SKILL.md',
              target_name: 'SKILL.md',
              merge_strategy: 'copy_or_overwrite',
              sha256: crypto.createHash('sha256').update('# Architect Skill').digest('hex'),
              size_bytes: 17,
            },
          ],
        });
        vi.spyOn(noTargetNameFetcher, 'fetchFileContent').mockResolvedValue('echo direct');
        await runInstallSkillCli(['--target', 'workspace', '--include-scripts'], noTargetNameFetcher);
        expect(fs.existsSync(path.join(testDir, 'scripts/direct-path.sh'))).toBe(true);
      } finally {
        process.chdir(cwd);
      }
    });

    it('respects QA_SKILL_TARGET environment variable when target argument is omitted', async () => {
      const cwd = process.cwd();
      const testDir = path.join(tmpDir, 'env-target-test');
      fs.mkdirSync(testDir, { recursive: true });
      const fakeHome = path.join(tmpDir, 'fake-env-home');
      fs.mkdirSync(fakeHome, { recursive: true });

      const origHome = process.env.HOME;
      const origEnvTarget = process.env.QA_SKILL_TARGET;
      process.env.HOME = fakeHome;
      process.env.QA_SKILL_TARGET = 'hermes';
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(testDir);
        await runInstallSkillCli([], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.hermes/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
      } finally {
        process.chdir(cwd);
        if (origHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = origHome;
        }
        if (origEnvTarget !== undefined) {
          process.env.QA_SKILL_TARGET = origEnvTarget;
        } else {
          delete process.env.QA_SKILL_TARGET;
        }
      }
    });

    it('initializes or updates AGENTS.md when --init-agents flag is provided', async () => {
      const cwd = process.cwd();
      const testDir = path.join(tmpDir, 'init-agents-cli-test');
      fs.mkdirSync(testDir, { recursive: true });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(testDir);
        await runInstallSkillCli(['--target', 'workspace', '--init-agents'], fetcher);
        expect(fs.existsSync(path.join(testDir, 'AGENTS.md'))).toBe(true);
        const content = fs.readFileSync(path.join(testDir, 'AGENTS.md'), 'utf-8');
        expect(content).toContain('<!-- QA_11X_MCP_CONNECTOR_START -->');
      } finally {
        process.chdir(cwd);
      }
    });

    it('initializes default GitHubFetcher in runInstallSkillCli when omitted', async () => {
      const cwd = process.cwd();
      const testDir = path.join(tmpDir, 'default-fetcher-test');
      fs.mkdirSync(testDir, { recursive: true });
      const origLocalPath = process.env.QA_BLUEPRINTS_LOCAL_PATH;
      process.env.QA_BLUEPRINTS_LOCAL_PATH = localRepoDir;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(testDir);
        await runInstallSkillCli(['--target', 'workspace']);
        expect(fs.existsSync(path.join(testDir, '.agents/skills/qa-11x-architect/SKILL.md'))).toBe(true);
      } finally {
        if (origLocalPath === undefined) {
          delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
        } else {
          process.env.QA_BLUEPRINTS_LOCAL_PATH = origLocalPath;
        }
        process.chdir(cwd);
      }
    });

    it('routes explicit --project-path equal to $HOME through resolveSafeProjectPath', async () => {
      const prevHome = process.env.HOME;
      const fakeHome = fs.mkdtempSync(path.join(tmpDir, 'home-proj-guard-'));
      process.env.HOME = fakeHome;
      try {
        await expect(runInstallSkillCli(['--project-path', fakeHome, '--dry-run'], fetcher)).rejects.toThrow(
          WorkspacePathValidationError
        );
        await expect(runInstallSkillCli(['--dir', fakeHome, '--dry-run'], fetcher)).rejects.toThrow(
          WorkspacePathValidationError
        );
      } finally {
        if (prevHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = prevHome;
        }
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    it('supports --dir <projDir>, excludes .env.example, preserves copy_if_missing, chmods missing scripts 0o755, and surgical-merges lefthook.yml with 0o600 backup', async () => {
      const bpDir = path.join(tmpDir, 'bp-phase12');
      const projDir = path.join(tmpDir, 'proj-phase12');
      const outsideCwd = path.join(tmpDir, 'outside-phase12');
      const homeSandbox = path.join(tmpDir, 'home-phase12');
      fs.mkdirSync(projDir, { recursive: true });
      fs.mkdirSync(outsideCwd, { recursive: true });
      fs.mkdirSync(homeSandbox, { recursive: true });

      const writeBp = (rel: string, content: string): ManifestFileEntry => {
        const full = path.join(bpDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
        return {
          path: rel,
          target_name: rel,
          merge_strategy: 'overwrite',
          sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
          size_bytes: Buffer.byteLength(content, 'utf8'),
        };
      };

      const skillEntry = writeBp('.agents/skills/qa-11x-architect/SKILL.md', '# Arch Skill\n');
      const envExampleEntry = writeBp('.env.example', 'SECRET=example\n');
      const probarEntry = writeBp('scripts/probar-mcp-example.sh', '#!/usr/bin/env bash\nexit 0\n');
      const trivyEntry = { ...writeBp('.trivy.yaml', 'scan:\n  security-checks:\n    - vuln\n'), merge_strategy: 'copy_if_missing' };
      const hooksEntry = { ...writeBp('instalar-hooks.sh', '#!/usr/bin/env bash\necho blueprint\n'), merge_strategy: 'copy_if_missing' };
      const lefthookEntry = {
        ...writeBp('lefthook.yml', 'pre-commit:\n  commands:\n    lint:\n      run: echo lint\n\npre-push:\n  commands:\n    gate:\n      run: echo gate\n'),
        merge_strategy: 'surgical_merge',
      };
      const stackCfgEntry = writeBp('python/Makefile.example', 'qa-lint:\n\t@echo ok\n');

      const phase12Manifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '3.2.0',
        generated_at_utc: '2026-11-19T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://example.invalid',
        stacks: {
          python: {
            description: 'Python QA blueprint',
            readme: 'python/README.md',
            files: [{ ...stackCfgEntry, target_name: 'Makefile', merge_strategy: 'copy_if_missing' }],
          },
        },
        common_files: [envExampleEntry, probarEntry, trivyEntry, hooksEntry, lefthookEntry],
        agent_governance_files: [skillEntry],
      };
      fs.writeFileSync(path.join(bpDir, 'manifest.json'), JSON.stringify(phase12Manifest), 'utf8');
      const phase12Fetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'phase12-cache'),
        localOverridePath: bpDir,
      });

      // fetchStackBundle also excludes .env.example & scripts/probar-mcp-example.sh
      const bundle = await phase12Fetcher.fetchStackBundle('python', true, true);
      expect(bundle.some((f) => f.path === '.env.example')).toBe(false);
      expect(bundle.some((f) => f.path === 'scripts/probar-mcp-example.sh')).toBe(false);
      expect(bundle.some((f) => f.path === '.trivy.yaml')).toBe(true);

      // Existing lefthook.yml to exercise surgical_merge + 0o600 .11x-backup
      const originalLefthook = 'pre-commit:\n  commands:\n    custom:\n      run: echo custom\n';
      fs.writeFileSync(path.join(projDir, 'lefthook.yml'), originalLefthook, 'utf8');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const cliRes = await runCli(
        ['install-skill', '--target', 'workspace', '--include-scripts', '--dir', projDir],
        { cwd: outsideCwd, homeDir: homeSandbox, fetcher: phase12Fetcher, log: vi.fn(), errorLog: vi.fn() }
      );
      expect(cliRes.exitCode).toBe(0);

      // Excluded files not written
      expect(fs.existsSync(path.join(projDir, '.env.example'))).toBe(false);
      expect(fs.existsSync(path.join(projDir, 'scripts', 'probar-mcp-example.sh'))).toBe(false);
      expect(fs.existsSync(path.join(outsideCwd, '.trivy.yaml'))).toBe(false);

      // copy_if_missing creates missing files with 0o755 on .sh
      expect(fs.existsSync(path.join(projDir, '.trivy.yaml'))).toBe(true);
      const hooksFull = path.join(projDir, 'instalar-hooks.sh');
      expect(fs.existsSync(hooksFull)).toBe(true);
      expect(fs.statSync(hooksFull).mode & 0o777).toBe(0o755);

      // surgical_merge merged lefthook.yml and created 0o600 .11x-backup
      const mergedLefthook = fs.readFileSync(path.join(projDir, 'lefthook.yml'), 'utf8');
      expect(mergedLefthook).toContain('echo custom');
      expect(mergedLefthook).toContain('pre-push:');
      const lefthookBackup = path.join(projDir, 'lefthook.yml.11x-backup');
      expect(fs.existsSync(lefthookBackup)).toBe(true);
      expect(fs.readFileSync(lefthookBackup, 'utf8')).toBe(originalLefthook);
      expect(fs.statSync(lefthookBackup).mode & 0o777).toBe(0o600);

      // Second run with custom .trivy.yaml & instalar-hooks.sh preserves them via copy_if_missing
      fs.writeFileSync(path.join(projDir, '.trivy.yaml'), '# custom-trivy\n', 'utf8');
      fs.writeFileSync(hooksFull, '#!/usr/bin/env bash\necho custom-hooks\n', 'utf8');
      await runInstallSkillCli(
        ['--target', 'workspace', '--include-scripts', '--dir', projDir],
        phase12Fetcher,
        { cwd: outsideCwd, homeDir: homeSandbox }
      );
      expect(fs.readFileSync(path.join(projDir, '.trivy.yaml'), 'utf8')).toBe('# custom-trivy\n');
      expect(fs.readFileSync(hooksFull, 'utf8')).toContain('custom-hooks');
    });

    it('rejects workspace .agents symlink escape on --target workspace/auto while preserving valid global targets and blocking skill subdir symlinks', async () => {
      const outsideDir = fs.mkdtempSync(path.join(tmpDir, 'install-outside-'));
      const wsEsc = path.join(tmpDir, 'ws-agents-escape');
      const emptyHome = path.join(tmpDir, 'empty-home');
      const globalHome = path.join(tmpDir, 'global-home');
      fs.mkdirSync(wsEsc, { recursive: true });
      fs.mkdirSync(emptyHome, { recursive: true });
      fs.mkdirSync(path.join(globalHome, '.gemini', 'antigravity'), { recursive: true });
      fs.symlinkSync(outsideDir, path.join(wsEsc, '.agents'));

      try {
        await expect(
          runInstallSkillCli(['--target', 'workspace', '--project-path', wsEsc], fetcher, {
            cwd: wsEsc,
            homeDir: emptyHome,
            log: () => {},
          })
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, 'skills'))).toBe(false);

        await expect(
          runInstallSkillCli(
            ['--target', 'workspace', '--include-scripts', '--project-path', wsEsc],
            fetcher,
            { cwd: wsEsc, homeDir: emptyHome, log: () => {} }
          )
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, 'skills'))).toBe(false);

        // --target auto en home vacío usa $HOME/.agents/skills (no escribe en wsEsc/.agents)
        await runInstallSkillCli(['--target', 'auto', '--project-path', wsEsc], fetcher, {
          cwd: wsEsc,
          homeDir: emptyHome,
          log: () => {},
        });
        expect(fs.existsSync(path.join(emptyHome, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(outsideDir, 'skills'))).toBe(false);

        // Preserves valid non-workspace global targets even if ws/.agents is symlinked
        await runInstallSkillCli(['--target', 'antigravity', '--project-path', wsEsc], fetcher, {
          cwd: wsEsc,
          homeDir: globalHome,
          log: () => {},
        });
        expect(
          fs.existsSync(path.join(globalHome, '.gemini', 'config', 'skills', 'qa-11x-architect', 'SKILL.md'))
        ).toBe(true);

        // Rejects symlink inside global target skill subdirectory
        const claudeSkills = path.join(globalHome, '.claude', 'skills');
        fs.mkdirSync(claudeSkills, { recursive: true });
        fs.symlinkSync(outsideDir, path.join(claudeSkills, 'qa-11x-architect'));
        await expect(
          runInstallSkillCli(['--target', 'claude', '--project-path', wsEsc], fetcher, {
            cwd: wsEsc,
            homeDir: globalHome,
            log: () => {},
          })
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, 'SKILL.md'))).toBe(false);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('rejects intermediate parent symlinks across global targets (PROBE_B) and .bak/.11x-backup symlinks in --include-scripts (PROBE_C)', async () => {
      const probeRoot = fs.mkdtempSync(path.join(tmpDir, 'probe-bc-'));
      const bpOrigin = path.join(probeRoot, 'bp-origin');
      const outsideDir = path.join(probeRoot, 'outside');
      const ws = path.join(probeRoot, 'ws');
      fs.mkdirSync(bpOrigin, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.mkdirSync(ws, { recursive: true });

      const writeBpFile = (relPath: string, content: string): ManifestFileEntry => {
        const full = path.join(bpOrigin, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
        return {
          path: relPath,
          target_name: relPath,
          merge_strategy: 'overwrite',
          sha256: crypto.createHash('sha256').update(content).digest('hex'),
          size_bytes: Buffer.byteLength(content),
        };
      };

      const skillEntry = writeBpFile('.agents/skills/qa-11x-architect/SKILL.md', '# Arch\n');
      const budgetEntry = writeBpFile('.agents/scripts/_budgets.py', 'SKILL_MAX_BYTES = 20480\n');
      const lefthookEntry: ManifestFileEntry = {
        ...writeBpFile('lefthook.yml', 'pre-commit:\n  commands:\n    lint:\n      run: echo lint\n'),
        merge_strategy: 'surgical_merge',
      };
      const probeManifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '3.2.0',
        generated_at_utc: '2026-11-21T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://example.invalid',
        stacks: {},
        common_files: [lefthookEntry],
        agent_governance_files: [skillEntry, budgetEntry],
      };
      fs.writeFileSync(path.join(bpOrigin, 'manifest.json'), JSON.stringify(probeManifest), 'utf8');
      const realFetcher = new GitHubFetcher({
        cacheDir: path.join(probeRoot, 'cache'),
        localOverridePath: bpOrigin,
      });

      try {
        // 1. PROBE_B across every global target when intermediate parent dir is a symlink (skills/ missing)
        const globalProbeCases: Array<{
          readonly target: string;
          readonly setupLink: (homeDir: string, destOutside: string) => void;
        }> = [
          {
            target: 'antigravity',
            setupLink: (h, out) => {
              fs.mkdirSync(path.join(h, '.gemini'), { recursive: true });
              fs.symlinkSync(out, path.join(h, '.gemini', 'config'));
            },
          },
          {
            target: 'antigravity',
            setupLink: (h, out) => {
              fs.mkdirSync(path.join(h, '.gemini'), { recursive: true });
              fs.symlinkSync(out, path.join(h, '.gemini', 'antigravity'));
            },
          },
          {
            target: 'claude',
            setupLink: (h, out) => {
              fs.symlinkSync(out, path.join(h, '.claude'));
            },
          },
          {
            target: 'hermes',
            setupLink: (h, out) => {
              fs.symlinkSync(out, path.join(h, '.hermes'));
            },
          },
          {
            target: 'cursor',
            setupLink: (h, out) => {
              fs.symlinkSync(out, path.join(h, '.cursor'));
            },
          },
          {
            target: 'windsurf',
            setupLink: (h, out) => {
              fs.mkdirSync(path.join(h, '.codeium'), { recursive: true });
              fs.symlinkSync(out, path.join(h, '.codeium', 'windsurf'));
            },
          },
          {
            target: 'codex',
            setupLink: (h, out) => {
              fs.symlinkSync(out, path.join(h, '.codex'));
            },
          },
          {
            target: 'all',
            setupLink: (h, out) => {
              fs.mkdirSync(path.join(h, '.gemini'), { recursive: true });
              fs.symlinkSync(out, path.join(h, '.gemini', 'config'));
            },
          },
          {
            target: 'auto',
            setupLink: (h, out) => {
              fs.symlinkSync(out, path.join(h, '.claude'));
            },
          },
        ];

        for (let idx = 0; idx < globalProbeCases.length; idx += 1) {
          const spec = globalProbeCases[idx]!;
          const caseHome = path.join(probeRoot, `home-${idx}`);
          const caseOut = path.join(probeRoot, `out-${idx}`);
          fs.mkdirSync(caseHome, { recursive: true });
          fs.mkdirSync(caseOut, { recursive: true });
          spec.setupLink(caseHome, caseOut);

          await expect(
            runInstallSkillCli(['--target', spec.target, '--project-path', ws], realFetcher, {
              cwd: ws,
              homeDir: caseHome,
              log: () => {},
            })
          ).rejects.toThrow(/symlink|confinamiento/i);
          expect(fs.readdirSync(caseOut)).toEqual([]);
        }

        // 2. PROBE_C (.bak symlink in writeScriptWithBak)
        const wsBak = path.join(probeRoot, 'ws-bak');
        const homeBak = path.join(probeRoot, 'home-bak');
        fs.mkdirSync(path.join(wsBak, '.agents', 'scripts'), { recursive: true });
        fs.mkdirSync(homeBak, { recursive: true });
        const staleScript = path.join(wsBak, '.agents', 'scripts', '_budgets.py');
        const victimBak = path.join(outsideDir, 'victim_bak.txt');
        fs.writeFileSync(staleScript, '# old stale script\n', 'utf8');
        fs.writeFileSync(victimBak, 'ORIGINAL_BAK_VICTIM\n', 'utf8');
        fs.symlinkSync(victimBak, `${staleScript}.bak`);

        await expect(
          runInstallSkillCli(
            ['--target', 'workspace', '--include-scripts', '--project-path', wsBak],
            realFetcher,
            { cwd: wsBak, homeDir: homeBak, log: () => {} }
          )
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.readFileSync(victimBak, 'utf8')).toBe('ORIGINAL_BAK_VICTIM\n');

        // 3. PROBE_C2 (.11x-backup symlink in mergeExistingScriptEntry)
        const wsMerge = path.join(probeRoot, 'ws-merge');
        fs.mkdirSync(wsMerge, { recursive: true });
        const existingLf = path.join(wsMerge, 'lefthook.yml');
        const victimMerge = path.join(outsideDir, 'victim_11x_backup.txt');
        fs.writeFileSync(existingLf, 'pre-commit:\n  commands:\n    custom:\n      run: echo x\n', 'utf8');
        fs.writeFileSync(victimMerge, 'ORIGINAL_11X_BACKUP\n', 'utf8');
        fs.symlinkSync(victimMerge, `${existingLf}.11x-backup`);

        await expect(
          runInstallSkillCli(
            ['--target', 'workspace', '--include-scripts', '--project-path', wsMerge],
            realFetcher,
            { cwd: wsMerge, homeDir: homeBak, log: () => {} }
          )
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.readFileSync(victimMerge, 'utf8')).toBe('ORIGINAL_11X_BACKUP\n');
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    });
  });

  describe('cleanWorkspace11x and Cleanup Resource Suite', () => {
    it('audits workspace artifacts in dry_run mode without deleting and preserves reports/prometheus_data unless deep_prune is true', async () => {
      const dummyCoverage = path.join(targetProjectDir, '.coverage');
      const dummyPytest = path.join(targetProjectDir, '.pytest_cache');
      const dummyDist = path.join(targetProjectDir, 'dist');
      const dummyReports = path.join(targetProjectDir, 'reports');
      const dummyProm = path.join(targetProjectDir, 'prometheus_data');
      fs.writeFileSync(dummyCoverage, 'cov');
      fs.mkdirSync(dummyPytest, { recursive: true });
      fs.mkdirSync(dummyDist, { recursive: true });
      fs.mkdirSync(dummyReports, { recursive: true });
      fs.mkdirSync(dummyProm, { recursive: true });

      const res = await cleanWorkspace11x(targetProjectDir, true, false);
      expect(res.dry_run).toBe(true);
      expect(res.deep_prune).toBe(false);
      expect(res.found_targets).toContain('.coverage');
      expect(res.found_targets).toContain('.pytest_cache');
      expect(res.found_targets).toContain('dist');
      expect(res.found_targets).not.toContain('reports');
      expect(res.found_targets).not.toContain('prometheus_data');
      expect(res.removed_targets).toHaveLength(0);
      expect(res.recommended_command).toBe('./scripts/limpieza.sh');

      const resDeep = await cleanWorkspace11x(targetProjectDir, true, true);
      expect(resDeep.found_targets).toContain('reports');
      expect(resDeep.found_targets).toContain('prometheus_data');

      expect(fs.existsSync(dummyCoverage)).toBe(true);
      expect(fs.existsSync(dummyPytest)).toBe(true);
    });

    it('removes workspace artifacts when dry_run is false', async () => {
      const dummyCoverage = path.join(targetProjectDir, '.coverage');
      const dummySubdir = path.join(targetProjectDir, 'backend', '.pytest_cache');
      const dummyAllure = path.join(targetProjectDir, 'allure-results');
      const dummyDeepeval = path.join(targetProjectDir, '.deepeval');
      const dummyPromptfoo = path.join(targetProjectDir, '.promptfoo');
      const dummyRelease = path.join(targetProjectDir, 'release-readiness.json');
      const dummyDsStore = path.join(targetProjectDir, '.DS_Store');
      const dummyRootActive = path.join(targetProjectDir, 'ACTIVE_TASK.md');
      const dummyLooseBak = path.join(targetProjectDir, 'AGENTS.md.bak');
      const dummyIncoming = path.join(targetProjectDir, 'scripts', 'limpieza.sh.11x-incoming');
      const validAgentsActive = path.join(targetProjectDir, '.agents', 'ACTIVE_TASK.md');
      const dummyEvidence = path.join(targetProjectDir, '.agents', '.qa-evidence.json');
      const validCheckpoint = path.join(targetProjectDir, '.agents', '.cache', 'session_checkpoint.json');
      const validBackupTree = path.join(targetProjectDir, '.agents', 'backups', 'keep.bak');
      const dummyCovCache = path.join(targetProjectDir, '.agents', '.cache', 'coverage');
      fs.writeFileSync(dummyCoverage, 'cov');
      fs.mkdirSync(dummySubdir, { recursive: true });
      fs.mkdirSync(dummyAllure, { recursive: true });
      fs.mkdirSync(dummyDeepeval, { recursive: true });
      fs.mkdirSync(dummyPromptfoo, { recursive: true });
      fs.mkdirSync(dummyCovCache, { recursive: true });
      fs.mkdirSync(path.join(targetProjectDir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(targetProjectDir, '.agents', 'backups'), { recursive: true });
      fs.writeFileSync(dummyRelease, '{}');
      fs.writeFileSync(dummyDsStore, 'mac');
      fs.writeFileSync(dummyRootActive, '# misplaced');
      fs.writeFileSync(dummyLooseBak, 'old\n');
      fs.writeFileSync(dummyIncoming, 'new\n');
      fs.writeFileSync(validBackupTree, 'keep\n');
      fs.writeFileSync(validAgentsActive, '# valid');
      fs.writeFileSync(dummyEvidence, '{}');
      fs.writeFileSync(validCheckpoint, '{"status":"IN_PROGRESS"}');

      const resNormal = await cleanWorkspace11x(targetProjectDir, false, false);
      expect(resNormal.dry_run).toBe(false);
      expect(resNormal.deep_prune).toBe(false);
      expect(resNormal.removed_targets).toContain('.coverage');
      expect(resNormal.removed_targets).toContain('backend/.pytest_cache');
      expect(resNormal.removed_targets).toContain('allure-results');
      expect(resNormal.removed_targets).toContain('.deepeval');
      expect(resNormal.removed_targets).toContain('.promptfoo');
      expect(resNormal.removed_targets).not.toContain('.agents/.cache/coverage');
      expect(resNormal.removed_targets).toContain('release-readiness.json');
      expect(resNormal.removed_targets).toContain('.DS_Store');
      expect(resNormal.removed_targets).toContain('ACTIVE_TASK.md');
      expect(fs.existsSync(dummyEvidence)).toBe(true);
      expect(fs.existsSync(validAgentsActive)).toBe(true);
      expect(fs.existsSync(validCheckpoint)).toBe(true);
      expect(fs.existsSync(validBackupTree)).toBe(true);

      const res = await cleanWorkspace11x(targetProjectDir, false, true);
      expect(res.dry_run).toBe(false);
      expect(res.deep_prune).toBe(true);
      expect(res.removed_targets).toContain('.agents/.qa-evidence.json');
      expect(res.removed_targets).toContain('.agents/.cache/coverage');
      expect(fs.existsSync(validCheckpoint)).toBe(true);
      expect(res.removed_targets).toContain('.agents/backups');
      expect(res.removed_targets).not.toContain(path.join('.agents', 'backups', 'keep.bak'));
      expect(res.removed_targets).toContain('AGENTS.md.bak');
      expect(res.removed_targets).toContain(path.join('scripts', 'limpieza.sh.11x-incoming'));
      expect(res.recommended_command).toBe('./scripts/limpieza.sh --deep');
      expect(fs.existsSync(dummyLooseBak)).toBe(false);
      expect(fs.existsSync(dummyIncoming)).toBe(false);
      expect(fs.existsSync(validBackupTree)).toBe(false);

      expect(fs.existsSync(dummyCoverage)).toBe(false);
      expect(fs.existsSync(dummySubdir)).toBe(false);
      expect(fs.existsSync(dummyAllure)).toBe(false);
      expect(fs.existsSync(dummyDeepeval)).toBe(false);
      expect(fs.existsSync(dummyPromptfoo)).toBe(false);
      expect(fs.existsSync(dummyRelease)).toBe(false);
      expect(fs.existsSync(dummyDsStore)).toBe(false);
      expect(fs.existsSync(dummyRootActive)).toBe(false);
      expect(fs.existsSync(dummyEvidence)).toBe(false);
      expect(fs.existsSync(validAgentsActive)).toBe(true);
    });

    it('uses alpine docker fallback when local removal encounters permission errors', async () => {
      const lockedDir = path.join(targetProjectDir, 'backend');
      fs.mkdirSync(lockedDir, { recursive: true });
      const dummyCoverage = path.join(lockedDir, '.coverage');
      fs.writeFileSync(dummyCoverage, 'root-owned');

      const fakeFallback = vi.fn().mockImplementation((_dir: string, targets: string[]) => {
        for (const t of targets) {
          const p = path.join(targetProjectDir, t);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        return true;
      });

      try {
        const res = await cleanWorkspace11x(targetProjectDir, false, false, {
          fallbackExecutor: fakeFallback,
          targetRemover: () => ({ removed: false }),
        });
        expect(res.docker_fallback_used).toBe(true);
        expect(fakeFallback).toHaveBeenCalled();
        expect(res.removed_targets).toContain('backend/.coverage');
      } finally {
        if (fs.existsSync(dummyCoverage)) fs.unlinkSync(dummyCoverage);
      }
    });

    it('handles alpine fallback failure gracefully when docker is unavailable', async () => {
      const lockedDir = path.join(targetProjectDir, 'backend');
      fs.mkdirSync(lockedDir, { recursive: true });
      const dummyCoverage = path.join(lockedDir, '.coverage');
      fs.writeFileSync(dummyCoverage, 'root-owned');

      const fakeFallback = vi.fn().mockReturnValue(false);

      try {
        const res = await cleanWorkspace11x(targetProjectDir, false, false, {
          fallbackExecutor: fakeFallback,
          targetRemover: () => ({ removed: false }),
        });
        expect(res.docker_fallback_used).toBe(false);
        expect(fakeFallback).toHaveBeenCalled();
      } finally {
        if (fs.existsSync(dummyCoverage)) fs.unlinkSync(dummyCoverage);
      }
    });

    it('throws error when project directory does not exist and rejects forbidden paths', async () => {
      await expect(cleanWorkspace11x(path.join(tmpDir, 'non-existent'))).rejects.toThrow(
        'no existe'
      );
      await expect(cleanWorkspace11x('/etc')).rejects.toThrow(WorkspacePathValidationError);
      await expect(cleanWorkspace11x(os.tmpdir())).rejects.toThrow(WorkspacePathValidationError);
      await expect(cleanWorkspace11x('../outside')).rejects.toThrow(WorkspacePathValidationError);
    });

    it('escanea subdirectorios mobile-appium y vibe-rescue y detecta/elimina symlinks colgantes vía lstatSync', async () => {
      const mobileCov = path.join(targetProjectDir, 'mobile-appium', 'coverage');
      const vibeCache = path.join(targetProjectDir, 'vibe-rescue', '.pytest_cache');
      fs.mkdirSync(mobileCov, { recursive: true });
      fs.mkdirSync(vibeCache, { recursive: true });
      const danglingRes = path.join(targetProjectDir, 'test-results');
      fs.symlinkSync(path.join(tmpDir, 'does-not-exist-target'), danglingRes);

      const dry = await cleanWorkspace11x(targetProjectDir, true, false);
      expect(dry.found_targets).toContain(path.join('mobile-appium', 'coverage'));
      expect(dry.found_targets).toContain(path.join('vibe-rescue', '.pytest_cache'));
      expect(dry.found_targets).toContain('test-results');

      const real = await cleanWorkspace11x(targetProjectDir, false, false);
      expect(real.removed_targets).toContain(path.join('mobile-appium', 'coverage'));
      expect(real.removed_targets).toContain(path.join('vibe-rescue', '.pytest_cache'));
      expect(real.removed_targets).toContain('test-results');
      expect(fs.lstatSync(danglingRes, { throwIfNoEntry: false })).toBeUndefined();
    });

    it('bloquea borrado recursivo cuando .agents es un symlink ancestral apuntando fuera del workspace', async () => {
      const { removeTarget } = await import('../src/tools/clean-workspace.js');
      const outside = fs.mkdtempSync(path.join(tmpDir, 'outside-agents-'));
      fs.mkdirSync(path.join(outside, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(outside, 'artifacts', 'keep.txt'), 'KEEP_SAFE\n', 'utf8');

      const ws = fs.mkdtempSync(path.join(tmpDir, 'ws-sym-agents-'));
      fs.symlinkSync(outside, path.join(ws, '.agents'));

      const res = await cleanWorkspace11x(ws, false, true);
      expect(res.found_targets).not.toContain('.agents/artifacts');
      expect(res.removed_targets).not.toContain('.agents/artifacts');
      expect(fs.existsSync(path.join(outside, 'artifacts', 'keep.txt'))).toBe(true);

      const directRemove = removeTarget(ws, '.agents/artifacts');
      expect(directRemove.removed).toBe(false);
      expect(fs.existsSync(path.join(outside, 'artifacts', 'keep.txt'))).toBe(true);
    });

    it('retrieves cleanup script resource from BlueprintResources', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getCleanupScriptResource();
      expect(res.uri).toBe('blueprint://core/cleanup-script');
      expect(res.mimeType).toBe('text/x-shellscript');
      expect(res.text).toBe('#!/usr/bin/env bash\necho "cleaning"');
    });

    it('retrieves roadmap validator resource from BlueprintResources', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getRoadmapValidatorResource();
      expect(res.uri).toBe('blueprint://core/roadmap-validator');
      expect(res.mimeType).toBe('text/x-python');
      expect(res.text).toBe('#!/usr/bin/env python3\n# Roadmap and Active Task Validator');
    });

    it('falls back to default script when roadmap validator is not in manifest', async () => {
      const emptyManifest = { ...mockManifest, agent_governance_files: [] };
      const emptyFetcher = new GitHubFetcher();
      vi.spyOn(emptyFetcher, 'fetchManifest').mockResolvedValue(emptyManifest);

      const resources = new BlueprintResources(emptyFetcher);
      const res = await resources.getRoadmapValidatorResource();
      expect(res.text).toContain('#!/usr/bin/env python3');
    });

    it('falls back to default script when cleanup script is not in manifest', async () => {
      const emptyManifest = { ...mockManifest, common_files: [] };
      const emptyFetcher = new GitHubFetcher();
      vi.spyOn(emptyFetcher, 'fetchManifest').mockResolvedValue(emptyManifest);

      const resources = new BlueprintResources(emptyFetcher);
      const res = await resources.getCleanupScriptResource();
      expect(res.text).toContain('#!/usr/bin/env bash');
    });

    it('returns postgres-rls-worm resource from manifest or fallback when absent', async () => {
      const resources = new BlueprintResources(fetcher);
      const fallbackRes = await resources.getPostgresRlsWormResource();
      expect(fallbackRes.uri).toBe('blueprint://database/postgres-rls-worm');
      expect(fallbackRes.text).toContain('PostgreSQL 17 Multi-Transaction RLS');

      const rlsPath = '.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md';
      const rlsContent = '# Reference 08 RLS after_begin & WORM seq_num';
      const rlsHash = crypto.createHash('sha256').update(rlsContent).digest('hex');
      const fullRlsFile = path.join(localRepoDir, rlsPath);
      fs.mkdirSync(path.dirname(fullRlsFile), { recursive: true });
      fs.writeFileSync(fullRlsFile, rlsContent, 'utf-8');

      const manifestWithRls = {
        ...mockManifest,
        agent_governance_files: [
          ...mockManifest.agent_governance_files,
          {
            path: rlsPath,
            target_name: rlsPath,
            merge_strategy: 'copy_or_overwrite' as const,
            sha256: rlsHash,
            size_bytes: rlsContent.length,
          },
        ],
      };
      const customFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-rls'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(customFetcher, 'fetchManifest').mockResolvedValue(manifestWithRls);
      const rlsResources = new BlueprintResources(customFetcher);
      const loadedRes = await rlsResources.getPostgresRlsWormResource();
      expect(loadedRes.text).toBe(rlsContent);

      const esDocPath = 'docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md';
      const esDocContent = '# Guía Segura PostgreSQL RLS ES';
      const fullEsDocFile = path.join(localRepoDir, esDocPath);
      fs.mkdirSync(path.dirname(fullEsDocFile), { recursive: true });
      fs.writeFileSync(fullEsDocFile, esDocContent, 'utf-8');
      const esDocManifest: Manifest = {
        ...mockManifest,
        common_files: [
          ...mockManifest.common_files,
          {
            path: esDocPath,
            target_name: esDocPath,
            merge_strategy: 'copy_or_overwrite',
            sha256: crypto.createHash('sha256').update(esDocContent).digest('hex'),
            size_bytes: esDocContent.length,
          },
        ],
      };
      const esDocFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-es-doc'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(esDocFetcher, 'fetchManifest').mockResolvedValue(esDocManifest);
      const loadedEsDoc = await new BlueprintResources(esDocFetcher).getPostgresRlsWormResource('es');
      expect(loadedEsDoc.text).toBe(esDocContent);

      // injectScriptLanguageHeader: shebang de 1 línea (sin \n) y contenido sin shebang
      const singleLineClean = '#!/usr/bin/env bash';
      const noShebangValidator = 'print("ok")';
      fs.writeFileSync(path.join(localRepoDir, 'scripts', 'limpieza.sh'), singleLineClean, 'utf-8');
      fs.writeFileSync(
        path.join(localRepoDir, '.agents', 'scripts', 'verify_roadmap_consistency.py'),
        noShebangValidator,
        'utf-8'
      );
      const scriptHeaderManifest: Manifest = {
        ...mockManifest,
        common_files: mockManifest.common_files.map((f) =>
          f.path === 'scripts/limpieza.sh'
            ? {
                ...f,
                sha256: crypto.createHash('sha256').update(singleLineClean).digest('hex'),
                size_bytes: singleLineClean.length,
              }
            : f
        ),
        agent_governance_files: mockManifest.agent_governance_files.map((f) =>
          f.path === '.agents/scripts/verify_roadmap_consistency.py'
            ? {
                ...f,
                sha256: crypto.createHash('sha256').update(noShebangValidator).digest('hex'),
                size_bytes: noShebangValidator.length,
              }
            : f
        ),
      };
      const scriptHeaderFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-script-header'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(scriptHeaderFetcher, 'fetchManifest').mockResolvedValue(scriptHeaderManifest);
      const scriptResources = new BlueprintResources(scriptHeaderFetcher);
      const cleanOneLine = await scriptResources.getCleanupScriptResource('es');
      expect(cleanOneLine.text).toContain('#!/usr/bin/env bash\n# QA-11X Script universal');
      const roadNoShebang = await scriptResources.getRoadmapValidatorResource('es');
      expect(roadNoShebang.text).toContain('#!/usr/bin/env python3\n# QA-11X Validador');
      expect(roadNoShebang.text).toContain('print("ok")');
    });

    it('resuelve parámetro ?lang=es|en, fallback bilingüe y recursos localizados en BlueprintResources/v2', async () => {
      expect(parseResourceUriAndLang('blueprint://fastapi/readme?lang=es')).toEqual({
        baseUri: 'blueprint://fastapi/readme',
        lang: 'es',
      });
      expect(parseResourceUriAndLang('blueprint://philosophy?foo=1&lang=EN')).toEqual({
        baseUri: 'blueprint://philosophy',
        lang: 'en',
      });
      expect(parseResourceUriAndLang('blueprint://security?lang=fr&x=2')).toEqual({
        baseUri: 'blueprint://security',
        lang: 'en',
      });
      expect(parseResourceUriAndLang('blueprint://ai/evals-redteam')).toEqual({
        baseUri: 'blueprint://ai/evals-redteam',
        lang: 'en',
      });
      expect(getActiveResourceLang(new URL('blueprint://core/philosophy?lang=es'))).toBe('es');
      expect(getActiveResourceLang(new URL('blueprint://core/philosophy?lang=en'))).toBe('en');
      expect(
        runWithResourceLang('es', () =>
          getActiveResourceLang(new URL('blueprint://core/philosophy'))
        )
      ).toBe('es');
      expect(getActiveResourceLang(undefined, 'es')).toBe('es');
      expect(getActiveResourceLang()).toBe('en');

      const resources = new BlueprintResources(fetcher);
      const philEsFallback = await resources.getPhilosophyResource('es');
      expect(philEsFallback.text).toBe('# Master Prompt');

      const secEsFallback = await resources.getSecurityResource('es');
      expect(secEsFallback.text).toContain('# 22 Security Patterns');
      expect(secEsFallback.text).toContain('02-security-disa-owasp-22.md');

      // Fallback EN cuando python/README.es.md no existe aún
      const pyFallbackEn = await resources.getStackReadmeResource('python', 'es');
      expect(pyFallbackEn.text).toBe('# Python Blueprint Documentation');

      // Con espejos .es.md presentes en manifest + disco
      const pyEsContent = '# Documentación Python Blueprint ES';
      const secEsContent = '# Controles Seguridad ES';
      const philEsContent = '# Filosofía Central ES\n';
      fs.writeFileSync(path.join(localRepoDir, 'python', 'README.es.md'), pyEsContent, 'utf-8');
      fs.writeFileSync(path.join(localRepoDir, 'SECURITY.es.md'), secEsContent, 'utf-8');
      fs.writeFileSync(path.join(localRepoDir, 'AI_MASTER_PROMPT.es.md'), philEsContent, 'utf-8');
      const basePythonStack = mockManifest.stacks.python;
      if (!basePythonStack) {
        throw new Error('Expected python stack definition in mockManifest');
      }
      const bilingualManifest: Manifest = {
        ...mockManifest,
        stacks: {
          ...mockManifest.stacks,
          python: {
            ...basePythonStack,
            readme_es: 'python/README.es.md',
            readme_sha256: crypto.createHash('sha256').update('# Python Blueprint Documentation').digest('hex'),
            readme_es_sha256: crypto.createHash('sha256').update(pyEsContent).digest('hex'),
          },
        },
        agent_governance_files: [
          ...mockManifest.agent_governance_files,
          {
            path: 'AI_MASTER_PROMPT.es.md',
            target_name: 'AI_MASTER_PROMPT.es.md',
            merge_strategy: 'copy_or_overwrite',
            sha256: crypto.createHash('sha256').update(philEsContent).digest('hex'),
            size_bytes: philEsContent.length,
          },
          {
            path: 'SECURITY.es.md',
            target_name: 'SECURITY.es.md',
            merge_strategy: 'copy_or_overwrite',
            sha256: crypto.createHash('sha256').update(secEsContent).digest('hex'),
            size_bytes: secEsContent.length,
          },
        ],
      };
      const esFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-es'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(esFetcher, 'fetchManifest').mockResolvedValue(bilingualManifest);
      const esResources = new BlueprintResources(esFetcher);
      expect((await esResources.getPhilosophyResource('en')).text).toBe('# Master Prompt');
      expect((await esResources.getPhilosophyResource('es')).text).toBe(philEsContent);
      expect((await esResources.getSecurityResource('es')).text).toContain('# 22 Security Patterns');
      expect((await esResources.getSecurityResource('es')).text).not.toBe(secEsContent);
      expect((await esResources.getStackReadmeResource('python', 'es')).text).toBe(pyEsContent);

      const pyEsManifestFile: Manifest = {
        ...bilingualManifest,
        stacks: {
          ...bilingualManifest.stacks,
          python: {
            ...basePythonStack,
            readme_es: 'python/README.es.md',
            files: [
              ...basePythonStack.files,
              {
                path: 'python/README.es.md',
                target_name: 'README.es.md',
                merge_strategy: 'copy_or_overwrite',
                sha256: crypto.createHash('sha256').update(pyEsContent).digest('hex'),
                size_bytes: pyEsContent.length,
              },
            ],
          },
        },
      };
      const esFileFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-es-file'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(esFileFetcher, 'fetchManifest').mockResolvedValue(pyEsManifestFile);
      expect(
        (await new BlueprintResources(esFileFetcher).getStackReadmeResource('python', 'es')).text
      ).toBe(pyEsContent);

      const aiEs = readAiEvalsBlueprint(tmpDir, 'es');
      expect(aiEs.source).toBe('embedded-fallback');
      expect(aiEs.text).toContain('Blueprint QA-11X de AI Evals');

      const vibeEsFallback = readVibeRescueBlueprint(tmpDir, 'es');
      expect(vibeEsFallback.source).toBe('embedded-fallback');
      expect(vibeEsFallback.text).toContain('Rescate y Endurecimiento QA-11X');

      const vibeWsDir = path.join(localRepoDir, 'vibe-rescue');
      fs.mkdirSync(vibeWsDir, { recursive: true });
      fs.writeFileSync(path.join(vibeWsDir, 'README.es.md'), '# Vibe Rescue ES Local\n', 'utf-8');
      const vibeEsLocal = readVibeRescueBlueprint(localRepoDir, 'es');
      expect(vibeEsLocal.source).toBe('workspace');
      expect(vibeEsLocal.text).toContain('Vibe Rescue ES Local');

      // Fallback vía stackDef.readme_sha256 cuando files está vacío y fetch de README.es.md falla
      const customPrimaryDir = path.join(localRepoDir, 'custom');
      fs.mkdirSync(customPrimaryDir, { recursive: true });
      const customPrimaryText = '# Custom Stack Primary EN';
      fs.writeFileSync(path.join(customPrimaryDir, 'README.md'), customPrimaryText, 'utf-8');
      const customPrimarySha = crypto.createHash('sha256').update(customPrimaryText).digest('hex');
      const shaOnlyManifest: Manifest = {
        ...mockManifest,
        stacks: {
          ...mockManifest.stacks,
          custom: {
            description: 'Custom Stack',
            readme: 'custom/README.md',
            readme_es: 'custom/README.es.md',
            readme_sha256: customPrimarySha,
            readme_es_sha256: '0'.repeat(64),
            files: [],
          },
        },
        agent_governance_files: [],
      };
      const shaFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-sha-only'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(shaFetcher, 'fetchManifest').mockResolvedValue(shaOnlyManifest);
      const origFetchFile = shaFetcher.fetchFileContent.bind(shaFetcher);
      vi.spyOn(shaFetcher, 'fetchFileContent').mockImplementation(async (relPath, expected) => {
        if (relPath === 'custom/README.es.md') {
          throw new Error('HTTP 404 offline fixture');
        }
        return await origFetchFile(relPath, expected);
      });
      const prevDebug = process.env.QA11X_DEBUG;
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      let customFallbackRes;
      try {
        process.env.QA11X_DEBUG = '1';
        customFallbackRes = await new BlueprintResources(shaFetcher).getStackReadmeResource(
          'custom',
          'es'
        );
      } finally {
        if (prevDebug === undefined) {
          delete process.env.QA11X_DEBUG;
        } else {
          process.env.QA11X_DEBUG = prevDebug;
        }
      }
      expect(customFallbackRes.text).toBe(customPrimaryText);
      expect(
        stderrSpy.mock.calls.some((call) =>
          String(call[0]).includes('blueprintResources.getStackReadmeResource')
        )
      ).toBe(true);
      stderrSpy.mockRestore();

      // Workspace root inexistente retorna embedded-fallback en loadDescriptorMarkdown
      const missingRootRes = readVibeRescueBlueprint(
        path.join(tmpDir, 'non-existent-workspace-root'),
        'en'
      );
      expect(missingRootRes.source).toBe('embedded-fallback');
    });
  });

  describe('createMcpServer and Handlers Execution', () => {
    it('creates server with default options when omitted and registers canonical tool/resource surface', () => {
      const server = createMcpServer();
      expect(server).toBeDefined();
      const surface = getRegisteredServerSurface(server);
      expect(surface?.toolNames.size).toBeGreaterThanOrEqual(19);
      expect(surface?.resourceUris.size).toBeGreaterThanOrEqual(13);
    });

    it('runs tools with default services when omitted', async () => {
      const origLocalPath = process.env.QA_BLUEPRINTS_LOCAL_PATH;
      process.env.QA_BLUEPRINTS_LOCAL_PATH = localRepoDir;
      try {
        const bundle = await fetchBlueprintBundle('python', false);
        expect(bundle.total_files).toBeGreaterThan(0);

        const mergeRes = await bootstrapOrMerge11x(targetProjectDir, 'python', true);
        expect(mergeRes.dry_run).toBe(true);
      } finally {
        if (origLocalPath === undefined) {
          delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
        } else {
          process.env.QA_BLUEPRINTS_LOCAL_PATH = origLocalPath;
        }
      }
    });

    const readResourceText = async (client: Client, uri: string): Promise<string> => {
      const res = await client.readResource({ uri });
      const first = res.contents[0];
      expect(first).toBeDefined();
      expect(first?.uri).toBe(uri);
      return first && 'text' in first ? first.text : '';
    };

    const callToolText = async (
      client: Client,
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError).not.toBe(true);
      const content = 'content' in res && Array.isArray(res.content) ? res.content : [];
      const first = content[0] as { text?: string } | undefined;
      expect(first?.text).toBeDefined();
      return first?.text ?? '';
    };

    it('initializes McpServer and executes registered resources and tools', async () => {
      const server = createMcpServer({ fetcher, merger });
      expect(server).toBeDefined();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'tools-and-resources-unit', version: '1.0.0' });

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        // 1. Ejecutar resource: manifest
        const manifestText = await readResourceText(client, 'blueprint://manifest');
        expect(manifestText).toContain('"blueprint_version":"2.7.0"');
        expect(manifestText).not.toContain('\n  ');

        // 2. Ejecutar resource: philosophy
        expect(await readResourceText(client, 'blueprint://core/philosophy')).toBe('# Master Prompt');

        // 3. Ejecutar resource: security
        expect(await readResourceText(client, 'blueprint://security/disa-owasp-22')).toBe(
          '# 22 Security Patterns'
        );

        // 3b. Ejecutar resource: postgres-rls-worm
        expect(await readResourceText(client, 'blueprint://database/postgres-rls-worm')).toContain(
          'PostgreSQL 17 Multi-Transaction RLS'
        );

        // 4. Ejecutar resource template: stack readme
        expect(await readResourceText(client, 'blueprint://python/readme')).toContain('Python');

        // 5. Ejecutar resource template: refactoring-ui
        expect(await readResourceText(client, 'blueprint://ui/refactoring-ui/skill')).toBe(
          '# Refactoring UI'
        );

        // 6. Ejecutar resource: active-task-template
        expect(await readResourceText(client, 'blueprint://core/active-task-template')).toBe(
          '# Active Task Template Example'
        );

        // 7. Ejecutar resource: cleanup-script
        expect(await readResourceText(client, 'blueprint://core/cleanup-script')).toBe(
          '#!/usr/bin/env bash\necho "cleaning"'
        );

        // 8. Ejecutar resource: roadmap-validator
        expect(await readResourceText(client, 'blueprint://core/roadmap-validator')).toBe(
          '#!/usr/bin/env python3\n# Roadmap and Active Task Validator'
        );

        // 9. Ejecutar tool: inspect_project_config
        const inspectText = await callToolText(client, 'inspect_project_config', {
          project_path: targetProjectDir,
        });
        expect(inspectText).toContain(targetProjectDir);

        // 10. Ejecutar tool: fetch_blueprint_bundle
        const fetchText = await callToolText(client, 'fetch_blueprint_bundle', {
          stack: 'python',
          include_common_and_agents: true,
        });
        expect(fetchText).toContain('python');

        // 11. Ejecutar tool: bootstrap_or_merge_11x
        const mergeText = await callToolText(client, 'bootstrap_or_merge_11x', {
          project_path: targetProjectDir,
          stack: 'python',
          dry_run: true,
        });
        expect(mergeText).toContain('"dry_run":true');
        expect(mergeText).not.toContain('\n  ');

        // 12. Ejecutar tool: inspect_ast_blast_radius
        const blastText = await callToolText(client, 'inspect_ast_blast_radius', {
          project_path: targetProjectDir,
          target_symbol: 'test',
        });
        expect(blastText).toContain('"risk_level"');

        // 13. Ejecutar tool: clean_workspace_11x
        const cleanToolText = await callToolText(client, 'clean_workspace_11x', {
          project_path: targetProjectDir,
          dry_run: true,
        });
        expect(cleanToolText).toContain('"recommended_command"');

        // 14. Ejecutar tool: audit_security_stig_owasp
        const secToolText = await callToolText(client, 'audit_security_stig_owasp', {
          project_path: targetProjectDir,
        });
        expect(secToolText).toContain('"findings_count"');

        // 15. Ejecutar tool: run_ephemeral_qa
        const qaToolText = await callToolText(client, 'run_ephemeral_qa', {
          project_path: targetProjectDir,
          stage: 'unit',
          timeout_seconds: 30,
        });
        expect(qaToolText).toContain('"status"');

        // 16. Ejecutar tool: certify_11x_gate
        const certToolText = await callToolText(client, 'certify_11x_gate', {
          project_path: targetProjectDir,
        });
        expect(certToolText).toContain('"gate_passed"');

        // 17. Ejecutar tool: audit_test_pyramid_gaps
        const pyramidToolText = await callToolText(client, 'audit_test_pyramid_gaps', {
          project_path: targetProjectDir,
        });
        expect(pyramidToolText).toContain('"pyramid_score_pct"');

        // 18. Ejecutar tool: init_or_append_agents_md
        const initAgentsText = await callToolText(client, 'init_or_append_agents_md', {
          project_path: targetProjectDir,
          dry_run: true,
        });
        expect(initAgentsText).toContain('"action":"dry_run"');
        expect(initAgentsText).toContain('<!-- QA_11X_MCP_CONNECTOR_START -->');

        // 19. Ejecutar tool: propose_skill_evolution_pr
        const proposeText = await callToolText(client, 'propose_skill_evolution_pr', {
          project_path: targetProjectDir,
          target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
          improvement_title: 'Prueba de Integracion en Server',
          empirical_rationale: 'Prueba de ejecucion desde handler registrado en server',
          proposed_content_or_snippet: '### Snippet Test',
          prefer_offline_fallback: true,
        });
        expect(proposeText).toContain('"status":"PROPOSAL_FILE_AND_URL_GENERATED"');

        // 20. Ejecutar tool: reconcile_agents_governance
        const reconcileText = await callToolText(client, 'reconcile_agents_governance', {
          project_path: targetProjectDir,
          dry_run: true,
        });
        expect(reconcileText).toContain('"dry_run":true');
        expect(reconcileText).toContain('"removed_duplicate_sections_count":0');
      } finally {
        await client.close();
        await server.close();
      }
    });

    it('handles blueprint://{stack}/readme, fetch, bootstrap, and pyramid tools for ai-evals, mobile-appium, and vibe-rescue', async () => {
      const extraStacks = ['ai-evals', 'mobile-appium', 'vibe-rescue'] as const;
      const extraStackEntries: Manifest['stacks'] = {};
      for (const s of extraStacks) {
        const readmeRel = `${s}/README.md`;
        const readmeBody = `# ${s} Guide`;
        const tplRel = `${s}/template.txt`;
        const tplBody = `template-${s}`;
        fs.mkdirSync(path.join(localRepoDir, s), { recursive: true });
        fs.writeFileSync(path.join(localRepoDir, readmeRel), readmeBody, 'utf-8');
        fs.writeFileSync(path.join(localRepoDir, tplRel), tplBody, 'utf-8');
        extraStackEntries[s] = {
          description: `${s} Stack`,
          readme: readmeRel,
          readme_sha256: crypto.createHash('sha256').update(readmeBody).digest('hex'),
          files: [
            {
              path: tplRel,
              target_name: `${s}-template.txt`,
              merge_strategy: 'copy_if_missing',
              sha256: crypto.createHash('sha256').update(tplBody).digest('hex'),
              size_bytes: tplBody.length,
            },
          ],
        };
      }
      const tenManifest: Manifest = {
        ...mockManifest,
        stacks: { ...mockManifest.stacks, ...extraStackEntries },
      };
      const extFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-ext-stacks'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(extFetcher, 'fetchManifest').mockResolvedValue(tenManifest);

      const extResources = new BlueprintResources(extFetcher);
      const server = createMcpServer({ fetcher: extFetcher, merger });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'tools-ext-stacks-client', version: '1.0.0' });

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        for (const s of extraStacks) {
          const stackRes = await extResources.getStackReadmeResource(s);
          expect(stackRes.text).toBe(`# ${s} Guide`);

          const liveResText = await readResourceText(client, `blueprint://${s}/readme`);
          expect(liveResText.length).toBeGreaterThan(10);
          expect(
            await callToolText(client, 'fetch_blueprint_bundle', {
              stack: s,
              include_common_and_agents: false,
            })
          ).toContain(`"stack":"${s}"`);
          expect(
            await callToolText(client, 'bootstrap_or_merge_11x', {
              project_path: targetProjectDir,
              stack: s,
              dry_run: true,
            })
          ).toContain(`"stack":"${s}"`);
          expect(
            await callToolText(client, 'audit_test_pyramid_gaps', {
              project_path: targetProjectDir,
              stack: s,
            })
          ).toContain(`"${s}"`);
        }
      } finally {
        await client.close();
        await server.close();
      }
    });

    it('F9.3: sirve ?lang=es vs ?lang=en en los 5 recursos localizables (BlueprintResources y MCP readResource)', async () => {
      const rlsRel = '.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md';
      const rlsContent = '# Reference 08 RLS after_begin & WORM seq_num';
      const fullRlsFile = path.join(localRepoDir, rlsRel);
      fs.mkdirSync(path.dirname(fullRlsFile), { recursive: true });
      fs.writeFileSync(fullRlsFile, rlsContent, 'utf-8');

      const manifestWithRls: Manifest = {
        ...mockManifest,
        agent_governance_files: [
          ...mockManifest.agent_governance_files,
          {
            path: rlsRel,
            target_name: rlsRel,
            merge_strategy: 'copy_or_overwrite',
            sha256: crypto.createHash('sha256').update(rlsContent).digest('hex'),
            size_bytes: rlsContent.length,
          },
        ],
      };
      const rlsFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'cache-f93'),
        localOverridePath: localRepoDir,
      });
      vi.spyOn(rlsFetcher, 'fetchManifest').mockResolvedValue(manifestWithRls);

      const directResources = new BlueprintResources(rlsFetcher);
      const rlsEn = await directResources.getPostgresRlsWormResource('en');
      const rlsEs = await directResources.getPostgresRlsWormResource('es');
      expect(rlsEn.text).toBe(rlsContent);
      expect(rlsEs.text).toContain('Guía Operativa ES');
      expect(rlsEs.text).toContain(rlsContent);

      const uiEn = await directResources.getRefactoringUiResource('skill', 'en');
      const uiEs = await directResources.getRefactoringUiResource('skill', 'es');
      expect(uiEn.text).toBe('# Refactoring UI');
      expect(uiEs.text).toContain('Guía Refactoring UI (QA-11X) — Referencia Operativa ES');
      expect(uiEs.text).toContain('# Refactoring UI');

      const taskEn = await directResources.getActiveTaskTemplateResource('en');
      const taskEs = await directResources.getActiveTaskTemplateResource('es');
      expect(taskEn.text).toBe('# Active Task Template Example');
      expect(taskEs.text).toContain('Plantilla Canónica de Bitácora Activa');
      expect(taskEs.text).toContain('# Active Task Template Example');

      const cleanEn = await directResources.getCleanupScriptResource('en');
      const cleanEs = await directResources.getCleanupScriptResource('es');
      expect(cleanEn.text).toBe('#!/usr/bin/env bash\necho "cleaning"');
      expect(cleanEs.text).toContain('#!/usr/bin/env bash\n# QA-11X Script universal de limpieza');
      expect(cleanEs.text).toContain('echo "cleaning"');

      const roadEn = await directResources.getRoadmapValidatorResource('en');
      const roadEs = await directResources.getRoadmapValidatorResource('es');
      expect(roadEn.text).toBe('#!/usr/bin/env python3\n# Roadmap and Active Task Validator');
      expect(roadEs.text).toContain('#!/usr/bin/env python3\n# QA-11X Validador bidireccional');
      expect(roadEs.text).toContain('# Roadmap and Active Task Validator');

      // Protocol roundtrip via ?lang=es and ?lang=en
      const server = createMcpServer({ fetcher: rlsFetcher, merger });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'f93-lang-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        expect(
          await readResourceText(client, 'blueprint://database/postgres-rls-worm?lang=es')
        ).toContain('Guía Operativa ES');
        expect(
          await readResourceText(client, 'blueprint://database/postgres-rls-worm?lang=en')
        ).toBe(rlsContent);

        expect(
          await readResourceText(client, 'blueprint://ui/refactoring-ui/skill?lang=es')
        ).toContain('Referencia Operativa ES');
        expect(
          await readResourceText(client, 'blueprint://ui/refactoring-ui/skill?lang=en')
        ).toBe('# Refactoring UI');

        expect(
          await readResourceText(client, 'blueprint://core/active-task-template?lang=es')
        ).toContain('Plantilla Canónica de Bitácora Activa');
        expect(
          await readResourceText(client, 'blueprint://core/active-task-template?lang=en')
        ).toBe('# Active Task Template Example');

        expect(
          await readResourceText(client, 'blueprint://core/cleanup-script?lang=es')
        ).toContain('Script universal de limpieza sin root');
        expect(
          await readResourceText(client, 'blueprint://core/cleanup-script?lang=en')
        ).toBe('#!/usr/bin/env bash\necho "cleaning"');

        expect(
          await readResourceText(client, 'blueprint://core/roadmap-validator?lang=es')
        ).toContain('Validador bidireccional de consistencia');
        expect(
          await readResourceText(client, 'blueprint://core/roadmap-validator?lang=en')
        ).toBe('#!/usr/bin/env python3\n# Roadmap and Active Task Validator');
      } finally {
        await client.close();
        await server.close();
      }
    });

    it('F9.4: blueprint://security/disa-owasp-22 mantiene URI y usa terminología D3 (+ 37 static scanner rules)', async () => {
      const server = createMcpServer({ fetcher, merger });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'f94-security-meta-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        const listRes = await client.listResources();
        const secMeta = listRes.resources.find(
          (r) => r.uri === 'blueprint://security/disa-owasp-22'
        );
        expect(secMeta).toBeDefined();
        expect(secMeta?.uri).toBe('blueprint://security/disa-owasp-22');
        expect(secMeta?.description).toContain('22 DISA ASD STIG V6R5');
        expect(secMeta?.description).toContain('OWASP Developer Guide v4.2 reference controls');
        expect(secMeta?.description).toContain('+ 37 static scanner rules');
        const listToolsRes = await client.listTools();
        const runnerTool = listToolsRes.tools.find((t) => t.name === 'run_ephemeral_qa');
        const cleanTool = listToolsRes.tools.find((t) => t.name === 'clean_workspace_11x');
        expect(runnerTool?.description).toContain('QA_MAX_CONCURRENT_CONTAINERS=1');
        expect(cleanTool?.description).toContain('found_containers');
      } finally {
        await client.close();
        await server.close();
      }
    });

    it('F9.6: unifica marcadores y builders de agents-connector.ts entre init-agents-md y initOrAppendAgentsMd', async () => {
      expect(CLI_CONNECTOR_START_MARKER).toBe(CONNECTOR_SERVICE_START_MARKER);
      expect(TOOL_CONNECTOR_START_MARKER).toBe(CONNECTOR_SERVICE_START_MARKER);
      expect(CLI_CONNECTOR_END_MARKER).toBe(CONNECTOR_SERVICE_END_MARKER);
      expect(TOOL_CONNECTOR_END_MARKER).toBe(CONNECTOR_SERVICE_END_MARKER);
      expect(buildCliThinConnectorBlock).toBe(buildServiceThinConnectorBlock);
      expect(buildToolAgentsMdConnectorBlock).toBe(buildServiceAgentsMdConnectorBlock);
      expect(mergeCliAgentsMdContent).toBe(mergeServiceOrAppendAgentsMdContent);
      expect(mergeToolAgentsMdContent).toBe(mergeServiceAgentsMdContent);
      expect(resolveCliProjectDisplayName).toBe(resolveServiceProjectDisplayName);
      expect(resolveToolProjectDisplayName).toBe(resolveServiceProjectDisplayName);

      const cliDir = path.join(tmpDir, 'connector-cli-ws');
      const toolDir = path.join(tmpDir, 'connector-tool-ws');
      fs.mkdirSync(cliDir, { recursive: true });
      fs.mkdirSync(toolDir, { recursive: true });
      fs.writeFileSync(path.join(cliDir, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf-8');
      fs.writeFileSync(path.join(toolDir, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf-8');

      const cliCreated = await runCliInitAgentsMd({ projectPath: cliDir, lang: 'en', dryRun: false });
      expect(cliCreated.action).toBe('created');
      expect(cliCreated.content).toContain(CONNECTOR_SERVICE_START_MARKER);
      expect(cliCreated.content).toContain(CONNECTOR_SERVICE_END_MARKER);
      const cliUpdated = await runCliInitAgentsMd({ projectPath: cliDir, lang: 'es', dryRun: false });
      expect(cliUpdated.action).toBe('updated_block');

      const toolCreated = await runToolInitAgentsMd({ projectPath: toolDir, lang: 'en', dryRun: false });
      expect(toolCreated.action).toBe('created');
      expect(toolCreated.content).toContain(CONNECTOR_SERVICE_START_MARKER);
      expect(toolCreated.content).toContain(CONNECTOR_SERVICE_END_MARKER);
      const toolUpdated = await runToolInitAgentsMd({ projectPath: toolDir, lang: 'es', dryRun: false });
      expect(toolUpdated.action).toBe('updated_block');
    });

    it('F9.8: cubre extractMethodName, idempotencia de tracking/promptGuard, removeRequestHandler, validateV2ToolWorkspaceArgs y fallbacks de index/server', async () => {
      // 1. extractMethodName across valid Zod v3 schemas and malformed inputs
      expect(extractMethodName(null)).toBeUndefined();
      expect(extractMethodName('invalid')).toBeUndefined();
      expect(extractMethodName({})).toBeUndefined();
      expect(extractMethodName({ shape: 'not-object' })).toBeUndefined();
      expect(extractMethodName({ shape: { method: null } })).toBeUndefined();
      expect(extractMethodName({ shape: { method: { value: 42 } } })).toBeUndefined();
      expect(extractMethodName({ shape: { method: { _def: { value: 99 } } } })).toBeUndefined();
      expect(extractMethodName({ shape: { method: { value: 'tools/call' } } })).toBe('tools/call');
      expect(
        extractMethodName({ shape: { method: { _def: { value: 'resources/read' } } } })
      ).toBe('resources/read');

      // 2. validateV2ToolWorkspaceArgs boundaries
      expect(() => validateV2ToolWorkspaceArgs(null)).not.toThrow();
      expect(() => validateV2ToolWorkspaceArgs('not-record')).not.toThrow();
      expect(() => validateV2ToolWorkspaceArgs({ project_path: targetProjectDir })).not.toThrow();
      expect(() =>
        validateV2ToolWorkspaceArgs({ workspaceRoot: targetProjectDir, targetDir: 'sub/dir' })
      ).not.toThrow();
      expect(() => validateV2ToolWorkspaceArgs({ targetDir: 'relative-subdir' })).not.toThrow();
      expect(() =>
        validateV2ToolWorkspaceArgs({ workspaceRoot: targetProjectDir, targetDir: '../outside' })
      ).toThrow(WorkspacePathValidationError);
      expect(() =>
        validateV2ToolWorkspaceArgs({ workspaceRoot: targetProjectDir, targetDir: '' })
      ).toThrow(WorkspacePathValidationError);
      expect(() =>
        validateV2ToolWorkspaceArgs({ workspaceRoot: targetProjectDir, targetDir: 'bad\0dir' })
      ).toThrow(WorkspacePathValidationError);
      expect(() =>
        validateV2ToolWorkspaceArgs({ workspaceRoot: targetProjectDir, targetDir: '/etc/passwd' })
      ).toThrow(WorkspacePathValidationError);

      // 3. wrapReadResourceDispatcher guard on untracked server + dispatcher/registration idempotency + removeRequestHandler
      const untracked = new McpServer({ name: 'untracked-test', version: '1.0.0' });
      expect(() => wrapReadResourceDispatcher(untracked)).not.toThrow();

      const server = createMcpServer({ fetcher, merger });
      const registry1 = getServerDispatcherRegistry(server);
      const registry2 = attachDispatcherTracking(server);
      expect(registry2).toBe(registry1);

      const surfaceBefore = getRegisteredServerSurface(server);
      attachRegistrationTracking(server);
      expect(getRegisteredServerSurface(server)).toBe(surfaceBefore);

      // Calling setRequestHandler with a schema lacking method hits method === undefined before SDK throws
      expect(() =>
        server.server.setRequestHandler(
          {} as Parameters<typeof server.server.setRequestHandler>[0],
          () => ({})
        )
      ).toThrow(/missing a method literal/i);

      // removeRequestHandler deletes method from dispatcher registry; wrapReadResourceDispatcher handles missing handler
      expect(registry1?.has('resources/read')).toBe(true);
      server.server.removeRequestHandler('resources/read');
      expect(registry1?.has('resources/read')).toBe(false);
      expect(() => wrapReadResourceDispatcher(server)).not.toThrow();

      // 4. Optional boolean defaults on server tools + attachPromptGuard idempotency + createConfiguredMcpServer + non-Error catch
      const defaultConfigured = createConfiguredMcpServer();
      expect(defaultConfigured.counts.tools).toBeGreaterThanOrEqual(19);

      const guardedServer = createMcpServer({ fetcher, merger });
      attachPromptGuard(guardedServer, { taskGuard: new TaskStateGuard() });
      expect(attachPromptGuard(guardedServer)).toBe(guardedServer);

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'f98-defaults-client', version: '1.0.0' });
      await Promise.all([
        guardedServer.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      try {
        const fetchRes = await callToolText(client, 'fetch_blueprint_bundle', {
          stack: 'python',
          include_common_and_agents: false,
        });
        expect(fetchRes).toContain('"stack":"python"');

        const bootRes = await callToolText(client, 'bootstrap_or_merge_11x', {
          project_path: targetProjectDir,
          stack: 'python',
        });
        expect(bootRes).toContain('"dry_run":true');

        const cleanRes = await callToolText(client, 'clean_workspace_11x', {
          project_path: targetProjectDir,
        });
        expect(cleanRes).toContain('"dry_run":true');

        const recRes = await callToolText(client, 'reconcile_agents_governance', {
          project_path: targetProjectDir,
        });
        expect(recRes).toContain('"dry_run":true');
      } finally {
        await client.close();
        await guardedServer.close();
      }

      // 5. Non-Error throw inside wrapped CallToolRequestSchema handler in attachPromptGuard
      const throwServer = createMcpServer({ fetcher, merger });
      throwServer.server.setRequestHandler(CallToolRequestSchema, () => {
        const nonErrorPayload = 'raw-string-tool-error' as unknown as Error;
        throw nonErrorPayload;
      });
      attachPromptGuard(throwServer);
      const [errClientTx, errServerTx] = InMemoryTransport.createLinkedPair();
      const errClient = new Client({ name: 'f98-non-error-client', version: '1.0.0' });
      await Promise.all([throwServer.connect(errServerTx), errClient.connect(errClientTx)]);
      try {
        const errRes = await errClient.callTool({
          name: 'inspect_project_config',
          arguments: { project_path: targetProjectDir },
        });
        expect(errRes.isError).toBe(true);
        const errContent = 'content' in errRes && Array.isArray(errRes.content) ? errRes.content : [];
        expect((errContent[0] as { text?: string } | undefined)?.text).toContain(
          'raw-string-tool-error'
        );
      } finally {
        await errClient.close();
        await throwServer.close();
      }

      // 6. index.ts main(): Error + non-Error rejection in autoSyncFn, startStdio override, and default process.exit fallback
      const prevDisableSync = process.env.QA_DISABLE_AUTO_SYNC;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      try {
        delete process.env.QA_DISABLE_AUTO_SYNC;
        const nonErrorRejection = 'non-error-sync-failure' as unknown as Error;
        await main([], undefined, {
          isStdinTty: true,
          exitFn: () => undefined,
          autoSyncFn: () => Promise.reject(nonErrorRejection),
        });
        await main([], undefined, {
          isStdinTty: true,
          exitFn: () => undefined,
          autoSyncFn: () => Promise.reject(new Error('error-obj-sync-failure')),
        });
        expect(
          stderrSpy.mock.calls.some((call) => String(call[0]).includes('non-error-sync-failure'))
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some((call) => String(call[0]).includes('error-obj-sync-failure'))
        ).toBe(true);

        let startedCustomStdio = false;
        await main(['--stdio'], async () => {
          startedCustomStdio = true;
          await Promise.resolve();
        });
        expect(startedCustomStdio).toBe(true);

        await main(['--version']);
        expect(exitSpy).toHaveBeenCalledWith(0);

        // 7. resolveToolExecutionOptions, ayuda --help no destructiva, --dry-run en install-skill y antigravity/skills sync
        const qaOpts = resolveToolExecutionOptions('run_ephemeral_qa', { timeout_seconds: 1200 }, 1000);
        expect(qaOpts.timeoutMs).toBe(900_000);
        expect(qaOpts.taskId?.startsWith('run_ephemeral_qa-1000-')).toBe(true);

        const qaMinOpts = resolveToolExecutionOptions('run_ephemeral_qa', { timeout_seconds: 0.2 }, 1000);
        expect(qaMinOpts.timeoutMs).toBe(1000);
        expect(resolveToolExecutionOptions('run_ephemeral_qa', { timeout_seconds: 0 }, 1000).timeoutMs).toBe(300_000);
        expect(resolveToolExecutionOptions('run_ephemeral_qa', { timeout_seconds: 'invalid' }, 1000).timeoutMs).toBe(300_000);

        const qaIdA = resolveToolExecutionOptions('run_ephemeral_qa', {}, 1000).taskId;
        const qaIdB = resolveToolExecutionOptions('run_ephemeral_qa', {}, 1000).taskId;
        expect(qaIdA).not.toBe(qaIdB);

        expect(
          resolveToolExecutionOptions('evaluate_agent_trajectory', { mode: 'live' }).timeoutMs
        ).toBe(185_000);
        expect(
          resolveToolExecutionOptions('run_llm_red_team', { timeoutMs: 240_000 }).timeoutMs
        ).toBe(240_000);
        expect(resolveToolExecutionOptions('certify_11x_gate', {}).profile).toBe('heavy_transfer');
        expect(resolveToolExecutionOptions('fetch_blueprint_bundle', {}).profile).toBe('heavy_transfer');
        expect(resolveToolExecutionOptions('bootstrap_or_merge_11x', {}).profile).toBe('heavy_transfer');

        expect(CLI_HELP_TEXT).toContain('antigravity | claude-code | claude-desktop | cursor | vscode | windsurf');
        expect(CLI_HELP_TEXT).not.toContain('--agents <target>        auto | all | workspace');

        // Subcomandos con --help/-h no escriben ni llaman a red
        const helpSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-help-sandbox-'));
        try {
          for (const subArgs of [
            ['quickstart', '--help', helpSandbox],
            ['install-skill', '--help', helpSandbox],
            ['init-agents', '-h', helpSandbox],
            ['reconcile-agents', '--help', helpSandbox],
            ['tms-sync', '--help'],
          ]) {
            const outLines: string[] = [];
            const helpRes = await runCli(subArgs, {
              cwd: helpSandbox,
              log: (m) => outLines.push(m),
              errorLog: () => undefined,
            });
            expect(helpRes.exitCode).toBe(0);
            expect(outLines.join('\n').length).toBeGreaterThan(20);
          }
          expect(fs.readdirSync(helpSandbox)).toEqual([]);

          // reconcile-agents e install-skill rechazan flags desconocidos explícitamente
          expect(() => parseReconcileAgentsArgs(['--unknown-flag'])).toThrow(/Opción CLI desconocida/);
          await expect(runInstallSkillCli(['--unknown-flag'])).rejects.toThrow(/Opción CLI desconocida/);
          await expect(runReconcileAgentsCli(['--unknown-flag'])).rejects.toThrow(/Opción CLI desconocida/);

          // install-skill --dry-run simula sin escribir en HOME ni workspace; sin dry-run sincroniza .gemini/antigravity/skills si existe
          const skillSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-home-'));
          const prevHomeEnv = process.env.HOME;
          const prevCwdCli = process.cwd();
          try {
            process.env.HOME = skillSandboxHome;
            fs.mkdirSync(path.join(skillSandboxHome, '.gemini', 'antigravity'), { recursive: true });
            const drySkillFetcher = new GitHubFetcher({ cacheDir: path.join(skillSandboxHome, 'c') });
            const dryManifestSpy = vi.spyOn(drySkillFetcher, 'fetchManifest').mockResolvedValue({
              ...mockManifest,
              agent_governance_files: [
                {
                  path: '.agents/skills/qa-11x-architect/SKILL.md',
                  target_name: '.agents/skills/qa-11x-architect/SKILL.md',
                  merge_strategy: 'overwrite',
                  sha256: 'abc',
                  size_bytes: 10,
                },
              ],
            });
            const dryFetchSpy = vi.spyOn(drySkillFetcher, 'fetchFileContent').mockResolvedValue('# Dry Skill');
            process.chdir(helpSandbox);
            await runInstallSkillCli(['--target=auto', '--dry-run'], drySkillFetcher);
            expect(dryFetchSpy).not.toHaveBeenCalled();
            expect(fs.existsSync(path.join(skillSandboxHome, '.gemini', 'config', 'skills'))).toBe(false);

            await runInstallSkillCli(['--target=antigravity'], drySkillFetcher);
            expect(dryManifestSpy).toHaveBeenCalled();
            expect(
              fs.existsSync(
                path.join(
                  skillSandboxHome,
                  '.gemini',
                  'antigravity',
                  'skills',
                  'qa-11x-architect',
                  'SKILL.md'
                )
              )
            ).toBe(true);
          } finally {
            process.chdir(prevCwdCli);
            restoreEnvVar('HOME', prevHomeEnv);
            fs.rmSync(skillSandboxHome, { recursive: true, force: true });
          }
        } finally {
          fs.rmSync(helpSandbox, { recursive: true, force: true });
        }
      } finally {
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
        logSpy.mockRestore();
        if (prevDisableSync === undefined) {
          delete process.env.QA_DISABLE_AUTO_SYNC;
        } else {
          process.env.QA_DISABLE_AUTO_SYNC = prevDisableSync;
        }
      }
    });

    it('expone annotations en las 19 tools, rechaza claves extra (.strict()) y sirve evals/tactical desde caché GitHubFetcher', async () => {
      const cacheRoot = fs.mkdtempSync(path.join(tmpDir, 'fetcher-cache-srv-'));
      const cachedEvalPath = path.join(cacheRoot, 'files', 'ai-evals', 'promptfooconfig.yaml');
      const cachedSkillPath = path.join(
        cacheRoot,
        'files',
        '.agents',
        'skills',
        'tactical-patterns-11x',
        'SKILL.md'
      );
      fs.mkdirSync(path.dirname(cachedEvalPath), { recursive: true });
      fs.mkdirSync(path.dirname(cachedSkillPath), { recursive: true });
      fs.writeFileSync(cachedEvalPath, 'description: "cached-redteam-spec"\n', 'utf8');
      fs.writeFileSync(cachedSkillPath, '# Cached Tactical Skill\n- Guard clauses\n', 'utf8');

      const cacheOnlyFetcher = new GitHubFetcher({ cacheDir: cacheRoot });
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cacheRoot);
      const server = createMcpServer({ fetcher: cacheOnlyFetcher });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'strict-ann-client', version: '1.0.0' }, { capabilities: {} });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      try {
        const listed = await client.listTools();
        expect(listed.tools).toHaveLength(19);
        for (const tool of listed.tools) {
          expect(tool.annotations).toBeDefined();
          expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
        }
        const cleanTool = listed.tools.find((t) => t.name === 'clean_workspace_11x');
        expect(cleanTool?.annotations?.destructiveHint).toBe(true);
        expect(cleanTool?.inputSchema.additionalProperties).toBe(false);

        const strictV1 = await client.callTool({
          name: 'inspect_project_config',
          arguments: { project_path: targetProjectDir, unexpected_key: true },
        });
        expect(strictV1.isError).toBe(true);

        const strictV2 = await client.callTool({
          name: 'validate_calm_architecture',
          arguments: { workspaceRoot: targetProjectDir, unexpected_v2_key: 1 },
        });
        expect(strictV2.isError).toBe(true);

        const evalRes = await client.readResource({ uri: 'blueprint://ai/evals-redteam' });
        const evalFirst = evalRes.contents[0];
        expect(evalFirst && 'text' in evalFirst ? evalFirst.text : '').toContain('cached-redteam-spec');

        const skillRes = await client.readResource({ uri: 'blueprint://skills/tactical-patterns-11x' });
        const skillFirst = skillRes.contents[0];
        expect(skillFirst && 'text' in skillFirst ? skillFirst.text : '').toContain('Cached Tactical Skill');
      } finally {
        cwdSpy.mockRestore();
        await client.close();
        await server.close();
      }
    });
  });
});
