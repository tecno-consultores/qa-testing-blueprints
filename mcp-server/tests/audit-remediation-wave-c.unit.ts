// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli, resolveSubcommandHelpText } from '../src/cli.js';
import { runCertifyCli } from '../src/cli/certify-cli.js';
import {
  CLI_COMMAND_CATALOG,
  type CanonicalSubcommandName,
  getCatalogSubcommandSpec,
  renderRootHelpText,
  renderSubcommandHelpText,
  resolveCatalogCommand,
  resolveCliHelpLang,
} from '../src/cli/commandCatalog.js';
import { runDoctorCli } from '../src/cli/doctor.js';
import { runMcpConfigCli } from '../src/cli/mcp-config.js';
import {
  findSummaryTagByPrefix,
  parseJunitXmlReport,
} from '../src/integrations/tms/inventoryAndJunit.js';
import { executeTmsSync, runTmsSyncCli } from '../src/integrations/tmsSyncCli.js';
import { resolveToolExecutionOptions } from '../src/index.js';
import {
  ensureStructuredToolResult,
  getToolAnnotations,
  getToolExecutionHints,
  toJsonToolResult,
  toStructuredRecord,
} from '../src/server/toolResults.js';
import {
  MCP_SERVER_VERSION,
  resolveSafeDefaultAnchor,
} from '../src/services/github-fetcher.js';
import { resolveComposeDirectFallback } from '../src/tools/ephemeral-runner/composeFallback.js';
import { resolveMakefileDockerRecipes } from '../src/tools/ephemeral-runner/makefileParser.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import {
  isExcludedProbePath,
  parseJsonObjectTextSafe,
} from '../src/tools/security-auditor/shared.js';
import { auditTestPyramidGaps } from '../src/tools/test-pyramid-auditor.js';
import {
  findOrphanSourceFiles,
  findUntestedUiViews,
} from '../src/tools/test-pyramid/inventory.js';
import {
  DEFAULT_TASK_CAPACITY,
  TASK_CAPACITY_EXTENSION_URI,
  TaskStateGuard,
} from '../src/utils/taskStateGuard.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Wave C Audit Remediation Contracts (CLI Catalog, Hints, StructuredContent, Doctor, Anchors)', () => {
  it('resolves bilingual CLI help language from flags and QA_OUTPUT_LANG with EN default', () => {
    expect(resolveCliHelpLang([], {})).toBe('en');
    expect(resolveCliHelpLang(['--lang', 'es'], {})).toBe('es');
    expect(resolveCliHelpLang(['-l', 'es_VE'], {})).toBe('es');
    expect(resolveCliHelpLang(['--lang=en-US'], { QA_OUTPUT_LANG: 'es' })).toBe('en');
    expect(resolveCliHelpLang(['-l=es'], {})).toBe('es');
    expect(resolveCliHelpLang(['--lang=fr'], { QA_OUTPUT_LANG: 'es' })).toBe('es');
    expect(resolveCliHelpLang([], { QA_OUTPUT_LANG: 'es-ES' })).toBe('es');
    expect(resolveCliHelpLang([], { QA_OUTPUT_LANG: 'en' })).toBe('en');
    expect(resolveCliHelpLang([], { QA_OUTPUT_LANG: 'de' })).toBe('en');
  });

  it('renders bilingual root & subcommand help from CLI_COMMAND_CATALOG and blocks prototype keys', () => {
    expect(CLI_COMMAND_CATALOG).toHaveLength(12);
    expect(resolveCatalogCommand('status')).toBe('doctor');
    expect(resolveCatalogCommand('cache-clean')).toBe('upgrade');
    expect(resolveCatalogCommand('install')).toBe('install-skill');
    expect(resolveCatalogCommand('init-agents-md')).toBe('init-agents');
    expect(resolveCatalogCommand('__proto__')).toBeUndefined();
    expect(resolveCatalogCommand('constructor')).toBeUndefined();

    const enRoot = renderRootHelpText({ lang: 'en', counts: { tools: 19, resources: 13 } });
    const esRoot = renderRootHelpText({ lang: 'es', counts: { tools: 19, resources: 13 } });
    expect(enRoot).toContain('Commands:');
    expect(enRoot).toContain('19 tools, 13 resources');
    expect(esRoot).toContain('Comandos:');
    expect(esRoot).toContain('19 herramientas, 13 recursos');
    expect(esRoot).toContain('Opciones clave por subcomando:');

    for (const spec of CLI_COMMAND_CATALOG) {
      const enSub = renderSubcommandHelpText(spec.name, 'en');
      const esSub = renderSubcommandHelpText(spec.name, 'es');
      expect(enSub).toContain(`Usage: npx -y @sinfallas/mcp-qa-11x ${spec.name}`);
      expect(esSub).toContain(`Uso: npx -y @sinfallas/mcp-qa-11x ${spec.name}`);
    }
    const fallbackHelp = renderSubcommandHelpText('unknown' as CanonicalSubcommandName, 'es');
    expect(fallbackHelp).toContain('Comandos:');
  });

  it('normalizes structuredContent records and guarantees structuredContent on prose-only CallToolResult', () => {
    expect(toStructuredRecord({ ok: true, count: 2 })).toEqual({ ok: true, count: 2 });
    expect(toStructuredRecord([1, 2, 3])).toEqual({ value: [1, 2, 3] });
    expect(toStructuredRecord('hello')).toEqual({ value: 'hello' });
    expect(toStructuredRecord(undefined)).toEqual({ value: null });

    const jsonRes = toJsonToolResult({ status: 'PASS' });
    expect(jsonRes.structuredContent).toEqual({ status: 'PASS' });

    const alreadyStructured = ensureStructuredToolResult({
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { custom: 1 },
    });
    expect(alreadyStructured.structuredContent).toEqual({ custom: 1 });

    const proseOnly = ensureStructuredToolResult({
      content: [{ type: 'text', text: 'summary line' }],
      isError: false,
    });
    expect(proseOnly.structuredContent).toEqual({ ok: true, summary: 'summary line' });

    const emptyError = ensureStructuredToolResult({
      content: [],
      isError: true,
    });
    expect(emptyError.structuredContent).toEqual({ ok: false, summary: '' });
  });

  it('propagates readOnlyHint/idempotentHint into TaskStateGuard and aligns default capacity & URI', () => {
    expect(DEFAULT_TASK_CAPACITY).toBe(4);
    expect(TASK_CAPACITY_EXTENSION_URI).toBe('urn:qa-11x:extensions:task-capacity:v1');

    const guard = new TaskStateGuard();
    const snapshot = guard.getSnapshot();
    expect(snapshot.capacity).toBe(4);
    expect(snapshot.extensionUri).toBe('urn:qa-11x:extensions:task-capacity:v1');

    expect(getToolAnnotations('__unknown_tool__').readOnlyHint).toBe(false);
    expect(getToolAnnotations('__unknown_tool__').idempotentHint).toBe(false);
    expect(getToolExecutionHints('inspect_project_config')).toEqual({
      readOnly: true,
      idempotent: true,
    });
    expect(getToolExecutionHints('propose_skill_evolution_pr')).toEqual({
      readOnly: false,
      idempotent: false,
    });

    const roOpts = resolveToolExecutionOptions('inspect_project_config', {});
    expect(roOpts.readOnly).toBe(true);
    expect(roOpts.idempotent).toBe(true);

    const liveTmsOpts = resolveToolExecutionOptions('sync_enterprise_tms', { dryRun: false });
    expect(liveTmsOpts.readOnly).toBe(false);
    expect(liveTmsOpts.idempotent).toBe(false);
    expect(liveTmsOpts.timeoutMs).toBeGreaterThanOrEqual(185_000);
  });

  it('aligns certify CLI requireLintEvidence default=true and supports --no-require-lint-evidence', async () => {
    const projectDir = makeTempDir('qa-certify-lint-default-');
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Demo\n', 'utf8');

    const esHelp = await runCertifyCli(['--help', '--lang', 'es'], { cwd: projectDir });
    expect(esHelp.exitCode).toBe(0);
    expect(esHelp.output).toContain('--no-require-lint-evidence');
    expect(esHelp.output).toContain('Uso: npx -y @sinfallas/mcp-qa-11x certify');

    const defaultRun = await runCertifyCli([projectDir, '--offline', '--json'], { cwd: projectDir });
    const optOutRun = await runCertifyCli(
      [projectDir, '--offline', '--no-require-lint-evidence', '--json'],
      { cwd: projectDir }
    );
    expect(defaultRun.output).toContain('"certify"');
    expect(optOutRun.output).toContain('"certify"');
  });

  it('pins mcp-config version by default and opts into @latest only when --latest is passed', () => {
    const pinnedRes = runMcpConfigCli(['--client', 'vscode', '--print']);
    expect(pinnedRes.exitCode).toBe(0);
    expect(pinnedRes.output).toContain(`@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`);

    const latestRes = runMcpConfigCli(['--client', 'vscode', '--print', '--latest']);
    expect(latestRes.exitCode).toBe(0);
    expect(latestRes.output).toContain('@sinfallas/mcp-qa-11x@latest');
  });

  it('audits vscode, gemini-cli, codex TOML, and hermes YAML pinning in doctor', async () => {
    const fakeHome = makeTempDir('qa-doctor-clients-');
    const fakeProject = makeTempDir('qa-doctor-proj-');

    const vscodePath = path.join(fakeHome, '.config', 'Code', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(vscodePath), { recursive: true });
    fs.writeFileSync(
      vscodePath,
      JSON.stringify({
        servers: {
          'qa-11x': { command: 'npx', args: ['-y', '@sinfallas/mcp-qa-11x@latest'] },
        },
      }),
      'utf8'
    );

    const geminiPath = path.join(fakeHome, '.gemini', 'settings.json');
    fs.mkdirSync(path.dirname(geminiPath), { recursive: true });
    fs.writeFileSync(
      geminiPath,
      JSON.stringify({
        mcpServers: {
          'qa-11x': { command: 'npx', args: ['-y', `@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`] },
        },
      }),
      'utf8'
    );

    const codexPath = path.join(fakeHome, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.writeFileSync(
      codexPath,
      '[mcp_servers.qa-11x]\ncommand = "npx"\nargs = ["-y", "@sinfallas/mcp-qa-11x@latest"]\n',
      'utf8'
    );

    const hermesYaml = path.join(fakeHome, '.hermes', 'config.yaml');
    fs.mkdirSync(path.dirname(hermesYaml), { recursive: true });
    fs.writeFileSync(
      hermesYaml,
      'mcp_servers:\n  qa-11x:\n    command: npx\n    args:\n      - -y\n      - "@sinfallas/mcp-qa-11x@latest"\n',
      'utf8'
    );

    const res = await runDoctorCli([fakeProject, '--offline', '--json'], {
      homeDir: fakeHome,
      cwd: fakeProject,
      platform: 'linux',
      dockerProbeFn: () => '27.5.1',
    });
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.output) as {
      ide_mcp_configs: Array<{ client: string; exists: boolean; has_qa_11x: boolean }>;
      ide_config_warnings: string[];
    };
    const byClient = new Map(parsed.ide_mcp_configs.map((cfg) => [cfg.client, cfg]));
    expect(byClient.get('vscode')?.has_qa_11x).toBe(true);
    expect(byClient.get('gemini-cli')?.has_qa_11x).toBe(true);
    expect(byClient.get('codex')?.has_qa_11x).toBe(true);
    expect(byClient.get('hermes')?.has_qa_11x).toBe(true);

    const warningsJoined = parsed.ide_config_warnings.join('\n');
    expect(warningsJoined).toContain('.config/Code/User/mcp.json');
    expect(warningsJoined).toContain('.codex/config.toml');
    expect(warningsJoined).toContain('.hermes/config.yaml');
    expect(warningsJoined).not.toContain('.gemini/settings.json');
  });

  it('anchors /var child paths safely for macOS /var -> /private/var temp directories', () => {
    const fakeHome = makeTempDir('qa-anchor-home-');
    const anchor = resolveSafeDefaultAnchor('/var/folders/xy/qa-11x-cache', fakeHome);
    expect(anchor === '/var' || anchor.startsWith('/var/')).toBe(true);
  });

  it('renders localized Spanish/English help cleanly for all 12 subcommands including tms-sync and leading --lang', async () => {
    for (const spec of CLI_COMMAND_CATALOG) {
      expect(getCatalogSubcommandSpec(spec.name)?.name).toBe(spec.name);
      const outEs: string[] = [];
      const resEs = await runCli([spec.name, '--help', '--lang', 'es'], {
        log: (msg) => outEs.push(msg),
        errorLog: (msg) => outEs.push(msg),
      });
      expect(resEs.exitCode).toBe(0);
      const joinedEs = outEs.join('\n');
      expect(joinedEs).toContain(`Uso: npx -y @sinfallas/mcp-qa-11x ${spec.name}`);
      expect(joinedEs).toContain('Opciones:');
      expect(joinedEs).not.toContain('[options]');
      expect(joinedEs).not.toContain('Fail-Verbose');
    }

    const tmsDirectEs = await runTmsSyncCli(['--help', '--lang', 'es']);
    expect(tmsDirectEs.exitCode).toBe(0);
    expect(tmsDirectEs.output).toContain('Uso: npx -y @sinfallas/mcp-qa-11x tms-sync');
    expect(tmsDirectEs.output).toContain('[opciones]');

    const leadingOut: string[] = [];
    const leadingRes = await runCli(['--lang', 'es', '--help'], {
      log: (msg) => leadingOut.push(msg),
      errorLog: (msg) => leadingOut.push(msg),
    });
    expect(leadingRes.exitCode).toBe(0);
    expect(leadingOut.join('\n')).toContain('Servidor MCP Oficial');

    const leadingSubOut: string[] = [];
    const leadingSubRes = await runCli(['--lang=es', 'help', 'doctor'], {
      log: (msg) => leadingSubOut.push(msg),
      errorLog: (msg) => leadingSubOut.push(msg),
    });
    expect(leadingSubRes.exitCode).toBe(0);
    expect(leadingSubOut.join('\n')).toContain('Uso: npx -y @sinfallas/mcp-qa-11x doctor [dir] [opciones]');

    const helpFlagOut: string[] = [];
    const helpFlagRes = await runCli(['help', '-l', 'es', 'certify'], {
      log: (msg) => helpFlagOut.push(msg),
      errorLog: (msg) => helpFlagOut.push(msg),
    });
    expect(helpFlagRes.exitCode).toBe(0);
    expect(helpFlagOut.join('\n')).toContain('Uso: npx -y @sinfallas/mcp-qa-11x certify [dir] [opciones]');

    const leadingNoHelpErr: string[] = [];
    const leadingNoHelp = await runCli(['--lang', 'es'], {
      log: (msg) => leadingNoHelpErr.push(msg),
      errorLog: (msg) => leadingNoHelpErr.push(msg),
    });
    expect(leadingNoHelp.exitCode).toBe(1);

    expect(await resolveSubcommandHelpText('help', 'es')).toContain('Servidor MCP Oficial');
    expect(await resolveSubcommandHelpText('nonexistent-cmd', 'en')).toBeNull();
  });

  it('ignores TOML/YAML comments, table headers, and YAML keys in doctor pinning audit', async () => {
    const fakeHome = makeTempDir('qa-doctor-toml-yaml-');
    const fakeProject = makeTempDir('qa-doctor-toml-proj-');

    // 1. Pinned Codex TOML with table header [mcp_servers.mcp-qa-11x] + commented @latest + escaped quote
    const codexPath = path.join(fakeHome, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.writeFileSync(
      codexPath,
      [
        '# legacy: "@sinfallas/mcp-qa-11x@latest"',
        '[mcp_servers.mcp-qa-11x]',
        'command = "npx"',
        `args = ["-y", "@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}"] # pinned`,
        'note = "escaped \\"quote\\" and # inside string"',
      ].join('\n'),
      'utf8'
    );

    // 2. Multi-server Hermes YAML with key mcp-qa-11x: + commented @latest + pinned version
    const hermesYaml = path.join(fakeHome, '.hermes', 'config.yaml');
    fs.mkdirSync(path.dirname(hermesYaml), { recursive: true });
    fs.writeFileSync(
      hermesYaml,
      [
        '# old: @sinfallas/mcp-qa-11x@latest',
        'mcpServers:',
        '  other-server:',
        '    command: node',
        '    args: ["server.js"]',
        '  mcp-qa-11x:',
        '    command: npx',
        '    args:',
        '      - "-y"',
        `      - "@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}"`,
      ].join('\n'),
      'utf8'
    );

    const pinnedRes = await runDoctorCli([fakeProject, '--offline', '--json'], {
      homeDir: fakeHome,
      cwd: fakeProject,
      platform: 'linux',
      dockerProbeFn: () => '27.5.1',
    });
    expect(pinnedRes.exitCode).toBe(0);
    const pinnedParsed = JSON.parse(pinnedRes.output) as {
      ide_mcp_configs: Array<{ client: string; has_qa_11x: boolean }>;
      ide_config_warnings: string[];
    };
    const byClient = new Map(pinnedParsed.ide_mcp_configs.map((cfg) => [cfg.client, cfg]));
    expect(byClient.get('codex')?.has_qa_11x).toBe(true);
    expect(byClient.get('hermes')?.has_qa_11x).toBe(true);
    expect(pinnedParsed.ide_config_warnings).toEqual([]);

    // 3. Commented-only # qa-11x in TOML/YAML does NOT mark has_qa_11x=true
    fs.writeFileSync(codexPath, '# [mcp_servers.qa-11x]\n# @sinfallas/mcp-qa-11x@latest\n', 'utf8');
    fs.writeFileSync(hermesYaml, '# qa-11x: disabled\nother: true\n', 'utf8');
    const commentedRes = await runDoctorCli([fakeProject, '--offline', '--json'], {
      homeDir: fakeHome,
      cwd: fakeProject,
      platform: 'linux',
      dockerProbeFn: () => null,
    });
    const commentedParsed = JSON.parse(commentedRes.output) as {
      ide_mcp_configs: Array<{ client: string; has_qa_11x: boolean }>;
      ide_config_warnings: string[];
    };
    const byClient2 = new Map(commentedParsed.ide_mcp_configs.map((cfg) => [cfg.client, cfg]));
    expect(byClient2.get('codex')?.has_qa_11x).toBe(false);
    expect(byClient2.get('hermes')?.has_qa_11x).toBe(false);
    expect(commentedParsed.ide_config_warnings).toEqual([]);
  });

  it('covers TMS inventory gaps, XML parser edges, and pull-stories skipped status', async () => {
    const dir = makeTempDir('qa-tms-edges-');
    fs.writeFileSync(path.join(dir, 'sample.unit.ts'), '// @TC-100\nexport const ok = 1;\n', 'utf8');

    const inv = await executeTmsSync({
      mode: 'inventory',
      provider: 'jira',
      workspaceRoot: dir,
      requiredKeys: ['REQ-999'],
    });
    expect(inv.inventory?.uncoveredRequirements).toContain('REQ-999');

    const trailingCommentXml = '<testsuite><testcase name="a"/></testsuite><!-- trailing -->';
    expect(parseJunitXmlReport(trailingCommentXml, {}).cases).toHaveLength(1);

    const trailingTextXml = '<testsuite><testcase name="b"/></testsuite>   \n';
    expect(parseJunitXmlReport(trailingTextXml, {}).cases).toHaveLength(1);

    const unclosedQuoteXml = '<testsuite><testcase name="unclosed></testsuite>';
    expect(parseJunitXmlReport(unclosedQuoteXml, {}).cases).toHaveLength(1);

    expect(findSummaryTagByPrefix(undefined, 'TC-')).toBeUndefined();

    const skippedPull = await executeTmsSync(
      {
        mode: 'pull-stories',
        provider: 'jira',
        baseUrl: 'https://jira.example.com',
        issueKey: 'PROJ-1',
      },
      { env: {} }
    );
    expect(skippedPull.status).toBe('SKIPPED');
    expect(skippedPull.message).toContain('ausencia de credenciales');
  });

  it('covers compose direct fallback parsing and stage null edges', () => {
    const nodeDir = makeTempDir('qa-compose-node-');
    fs.writeFileSync(
      path.join(nodeDir, 'docker-compose.qa.yml'),
      [
        'version: "3.9"',
        'services:',
        '  - not-a-service',
        '  invalid_key: alpine',
        '  qa-custom:',
        '    image: node:26',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(path.join(nodeDir, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
    const unitCmds = resolveComposeDirectFallback(nodeDir, 'unit');
    expect(unitCmds?.[0]).toContain('qa-custom');
    expect(resolveComposeDirectFallback(nodeDir, 'mutation')).toBeNull();

    const pyDir = makeTempDir('qa-compose-py-');
    fs.writeFileSync(
      path.join(pyDir, 'docker-compose.qa.yml'),
      'services:\n  qa-py:\n    image: python:3.15\n',
      'utf8'
    );
    fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf8');
    expect(resolveComposeDirectFallback(pyDir, 'migration')).toBeNull();

    const noQaDir = makeTempDir('qa-compose-noqa-');
    fs.writeFileSync(
      path.join(noQaDir, 'docker-compose.qa.yml'),
      'services:\n  db:\n    image: postgres:17\n',
      'utf8'
    );
    expect(resolveComposeDirectFallback(noQaDir, 'unit')).toBeNull();
  });

  it('covers Makefile delegation --directory=, non-compose rewrite, and guard errors', () => {
    const root = makeTempDir('qa-mk-deleg-');
    const sub = path.join(root, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(
      path.join(sub, 'Makefile'),
      'qa-unit:\n\tdocker run --rm alpine:3.21 true\n',
      'utf8'
    );
    const dirFlagRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) --directory=sub qa-unit\n',
      'qa-unit',
      root
    );
    expect(dirFlagRes.ok).toBe(true);
    expect(dirFlagRes.ok ? dirFlagRes.commands[0]?.[0] : '').toBe('run');

    const noTargetRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) -C sub\n',
      'qa-unit',
      root
    );
    expect(noTargetRes.ok).toBe(false);

    const selfLoopRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) -C . qa-unit\n',
      'qa-unit',
      root
    );
    expect(selfLoopRes.ok).toBe(false);
    expect(!selfLoopRes.ok ? selfLoopRes.reason : '').toContain('circular');

    const missingDirRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) -C ghost qa-unit\n',
      'qa-unit',
      root
    );
    expect(missingDirRes.ok).toBe(false);
    expect(!missingDirRes.ok ? missingDirRes.reason : '').toContain('No existe Makefile');

    const missingSubTargetRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) -C sub nonexistent\n',
      'qa-unit',
      root
    );
    expect(missingSubTargetRes.ok).toBe(false);

    for (const d of ['d1', 'd2', 'd3', 'd4']) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'd1', 'Makefile'), 'qa-unit:\n\t$(MAKE) -C ../d2 qa-unit\n', 'utf8');
    fs.writeFileSync(path.join(root, 'd2', 'Makefile'), 'qa-unit:\n\t$(MAKE) -C ../d3 qa-unit\n', 'utf8');
    fs.writeFileSync(path.join(root, 'd3', 'Makefile'), 'qa-unit:\n\t$(MAKE) -C ../d4 qa-unit\n', 'utf8');
    fs.writeFileSync(path.join(root, 'd4', 'Makefile'), 'qa-unit:\n\tdocker run --rm alpine true\n', 'utf8');
    const deepRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\t$(MAKE) -C d1 qa-unit\n',
      'qa-unit',
      root
    );
    expect(deepRes.ok).toBe(false);
    expect(!deepRes.ok ? deepRes.reason : '').toContain('Profundidad máxima');
  });

  it('covers security auditor edge rules (JSON array pkg, quoted uses, safe XXE, _headers, compose flags, SSR engines)', async () => {
    expect(isExcludedProbePath('/tmp/worker.log')).toBe(true);
    expect(parseJsonObjectTextSafe('[1, 2, 3]')).toBeNull();

    const dir = makeTempDir('qa-sec-edges-');
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '[]', 'utf8');
    fs.writeFileSync(
      path.join(dir, '.github', 'workflows', 'ci.yml'),
      [
        'jobs:',
        '  t:',
        '    steps:',
        '      - uses: "actions/checkout@v4"',
        '      - run: docker compose -f docker-compose.qa.yml --version',
      ].join('\n') + '\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'safe_xml.py'),
      'import xml.etree.ElementTree as ET\nimport defusedxml\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'public', '_headers'),
      '/*\n  !bad header!\n  X-Frame-Options: DENY\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'Makefile'),
      'qa-ver:\n\tdocker compose -f docker-compose.qa.yml --version\n',
      'utf8'
    );

    const res = await auditSecurityStigOwasp(dir);
    expect(res.findings.some((f) => f.rule_id === 'SEC-CI-ACTION-REF')).toBe(true);
    expect(res.findings.some((f) => f.rule_id === 'SEC-04')).toBe(false);

    // SSR engine detection via createSSRApp, .vitepress/config.ts, and nuxt.config.ts
    const ssrSrcDir = makeTempDir('qa-ssr-src-');
    fs.mkdirSync(path.join(ssrSrcDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(ssrSrcDir, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(ssrSrcDir, 'src', 'entry.ts'), 'createSSRApp(App);\nconst m = "prefers-color-scheme";\n', 'utf8');
    fs.writeFileSync(path.join(ssrSrcDir, 'src', 'Empty.vue'), '', 'utf8');
    fs.writeFileSync(path.join(ssrSrcDir, 'src', 'Theme.vue'), '<template><div v-if="localStorage.theme">x</div></template>\n', 'utf8');
    const ssrSrcRes = await auditSecurityStigOwasp(ssrSrcDir);
    expect(ssrSrcRes.findings.some((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toBe(true);

    const vpDir = makeTempDir('qa-ssr-vp-');
    fs.mkdirSync(path.join(vpDir, '.vitepress'), { recursive: true });
    fs.mkdirSync(path.join(vpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(vpDir, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(vpDir, '.vitepress', 'config.ts'), 'export default {};\n', 'utf8');
    fs.writeFileSync(path.join(vpDir, 'src', 'theme.css'), '@media (prefers-color-scheme: dark) {}\n', 'utf8');
    fs.writeFileSync(path.join(vpDir, 'src', 'Theme.vue'), '<template><div v-if="localStorage.theme">x</div></template>\n', 'utf8');
    const vpRes = await auditSecurityStigOwasp(vpDir);
    expect(vpRes.findings.some((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toBe(true);

    const nuxtDir = makeTempDir('qa-ssr-nuxt-');
    fs.mkdirSync(path.join(nuxtDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(nuxtDir, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(nuxtDir, 'nuxt.config.ts'), 'export default {};\n', 'utf8');
    fs.writeFileSync(path.join(nuxtDir, 'src', 'theme.css'), '@media (prefers-color-scheme: dark) {}\n', 'utf8');
    fs.writeFileSync(path.join(nuxtDir, 'src', 'Theme.vue'), '<template><div v-if="localStorage.theme">x</div></template>\n', 'utf8');
    const nuxtRes = await auditSecurityStigOwasp(nuxtDir);
    expect(nuxtRes.findings.some((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toBe(true);

    // Line-scoped qa-ssr-hydration-ok must exempt only the annotated line, never later unannotated lines
    const scopedDir = makeTempDir('qa-ssr-scoped-pragma-');
    fs.mkdirSync(path.join(scopedDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(scopedDir, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(scopedDir, 'nuxt.config.ts'), 'export default {};\n', 'utf8');
    fs.writeFileSync(path.join(scopedDir, 'src', 'theme.css'), '@media (prefers-color-scheme: dark) {}\n', 'utf8');
    fs.writeFileSync(
      path.join(scopedDir, 'src', 'ScopedTheme.vue'),
      [
        '<template>',
        '  <!-- qa-ssr-hydration-ok -->',
        '  <div v-if="localStorage.theme === \'dark\'">exempt-prev</div>',
        '  <div v-if="localStorage.theme === \'light\'">exempt-inline <!-- qa-ssr-hydration-ok --></div>',
        '  <div v-if="localStorage.theme === \'system\'">unannotated-must-flag</div>',
        '</template>',
      ].join('\n'),
      'utf8'
    );
    const scopedRes = await auditSecurityStigOwasp(scopedDir);
    const scopedFindings = scopedRes.findings.filter(
      (f) => f.rule_id === 'QA-SSR-HYDRATION-01' && f.file === 'src/ScopedTheme.vue'
    );
    expect(scopedFindings).toHaveLength(1);
    expect(scopedFindings[0]?.line).toBe(5);
  });

  it('covers QA-HEALTH-01, QA-CONTRACT-SDK-01, and QA-DOCKER-LOCK-01 edge paths', async () => {
    const shHealthDir = makeTempDir('qa-health-sh-');
    fs.mkdirSync(path.join(shHealthDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(shHealthDir, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf8');
    fs.writeFileSync(
      path.join(shHealthDir, 'Dockerfile'),
      'FROM alpine:3.21\nHEALTHCHECK CMD test -f /tmp/worker_heartbeat\nRUN pip install -i https://pypi.org/simple requests\n',
      'utf8'
    );
    fs.writeFileSync(path.join(shHealthDir, 'entrypoint.sh'), '#!/bin/sh\ntouch /tmp/worker_heartbeat\n', 'utf8');
    fs.writeFileSync(
      path.join(shHealthDir, 'tests', 'worker.test.ts'),
      "expect(fs.existsSync('/tmp/worker_heartbeat')).toBe(true);\n",
      'utf8'
    );
    const shRes = await auditSecurityStigOwasp(shHealthDir);
    expect(shRes.findings.some((f) => f.rule_id === 'QA-HEALTH-01')).toBe(false);
    expect(shRes.findings.some((f) => f.rule_id === 'QA-DOCKER-LOCK-01')).toBe(true);

    const pyHealthDir = makeTempDir('qa-health-py-');
    fs.mkdirSync(path.join(pyHealthDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(pyHealthDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(pyHealthDir, 'Dockerfile'),
      'FROM python:3.15\nHEALTHCHECK CMD test -f /tmp/py_hb\n',
      'utf8'
    );
    fs.writeFileSync(path.join(pyHealthDir, 'src', 'worker.py'), 'HB = "/tmp/py_hb"\n', 'utf8');
    fs.writeFileSync(
      path.join(pyHealthDir, 'tests', 'test_worker.py'),
      'def test_hb():\n    @custom_dec\n    def inner():\n        pass\n    assert Path("/tmp/py_hb").exists()\n',
      'utf8'
    );
    const pyRes = await auditSecurityStigOwasp(pyHealthDir);
    expect(pyRes.findings.some((f) => f.rule_id === 'QA-HEALTH-01')).toBe(false);

    const pySdkDir = makeTempDir('qa-sdk-py-');
    fs.mkdirSync(path.join(pySdkDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(pySdkDir, 'src', 'mcp_srv.py'),
      'app = FastMCP\n(\n  "demo"\n)\n@app.tool()\ndef ping():\n    return "ok"\n',
      'utf8'
    );
    const pySdkRes = await auditSecurityStigOwasp(pySdkDir);
    expect(pySdkRes.findings.some((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toBe(true);

    const tsSdkDir = makeTempDir('qa-sdk-ts-');
    fs.mkdirSync(path.join(tsSdkDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tsSdkDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tsSdkDir, 'src', 'srv.ts'),
      "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';\nserver.tool('ping', () => ({}));\n",
      'utf8'
    );
    fs.writeFileSync(
      path.join(tsSdkDir, 'tests', 'sdk.test.ts'),
      "import { Client } from '@modelcontextprotocol/sdk/client/index.js';\nconst c = new Client({ name: 't', version: '1' });\n",
      'utf8'
    );
    const tsSdkRes = await auditSecurityStigOwasp(tsSdkDir);
    expect(tsSdkRes.findings.some((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toBe(false);
  });

  it('covers test-pyramid dual refresh via WebSocket and inventory UI/non-code edges', async () => {
    const dir = makeTempDir('qa-pyramid-edges-');
    fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests', 'e2e'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.5.0' } }), 'utf8');
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), 'body { color: black; }\n', 'utf8');
    fs.writeFileSync(
      path.join(dir, 'src', 'views', 'MonitorDashboard.vue'),
      '<script setup>\nconst ws = new WebSocket("/ws");\n</script>\n<template><button>Refrescar</button></template>\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'features', 'ui_business.feature'),
      'Feature: MonitorDashboard\n  Scenario: loads MonitorDashboard\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'tests', 'e2e', 'monitor.spec.ts'),
      "test('MonitorDashboard renders', () => {});\n",
      'utf8'
    );

    expect(findOrphanSourceFiles(dir, ['src/styles.css'], ['vue3'])).toEqual([]);
    const untestedUi = findUntestedUiViews(dir, [
      'src/views/MonitorDashboard.vue',
      'features/ui_business.feature',
      'tests/e2e/monitor.spec.ts',
    ]);
    expect(untestedUi).toHaveLength(1);
    expect(untestedUi[0]?.present_in_bdd_feature).toBe(true);
    expect(untestedUi[0]?.present_in_e2e_spec).toBe(true);

    const pyramid = await auditTestPyramidGaps(dir);
    expect(pyramid.detected_stacks).toContain('vue3');
  });
});
