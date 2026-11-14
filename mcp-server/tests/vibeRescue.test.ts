// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AUDIT_VIBE_PROTOTYPE_TOOL,
  DEFAULT_MAX_LINES,
  REDACTION_MARKER,
  RLS_TEMPLATE_REL_PATH,
  VIBE_RULE_ARCH,
  VIBE_RULE_QA,
  VIBE_RULE_RLS,
  VIBE_RULE_SEC,
  VIBE_RULE_TYPE,
  VIBE_VERDICT_READY,
  VIBE_VERDICT_RESCUE,
  auditVibePrototype,
  handleAuditVibePrototype,
  redactVibeSecrets,
} from '../src/tools/auditVibePrototype.js';
import {
  MOBILE_APPIUM_README_URI,
  StackBlueprintResolutionError,
  V2_STACK_BLUEPRINTS,
  VIBE_RESCUE_README_REL_PATH,
  VIBE_RESCUE_README_URI,
  VIBE_RESCUE_RESOURCE,
  VIBE_RESCUE_STACK_ID,
  listV2StackBlueprintResources,
  readStackBlueprintResource,
  readVibeRescueBlueprint,
} from '../src/resources/stackBlueprints.js';

const MCP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_PARENT = path.dirname(MCP_ROOT);
const MOUNTED_VIBE_README = '/vibe-rescue/README.md';
const REAL_WORKSPACE_ROOT = fs.existsSync(path.join(REPO_PARENT, VIBE_RESCUE_README_REL_PATH))
  ? REPO_PARENT
  : fs.existsSync(MOUNTED_VIBE_README)
    ? '/'
    : undefined;

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildSyntheticToken(): string {
  return ['sk', '-proj-', 'x'.repeat(24)].join('');
}

function buildToxicPrototype(rootDir: string, rawToken: string): void {
  fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'sql'), { recursive: true });

  fs.writeFileSync(
    path.join(rootDir, '.env'),
    [
      '# config generada por prototype',
      `VITE_SUPABASE_SERVICE_ROLE_KEY=${rawToken}`,
      `OPENAI_API_KEY=${rawToken}`,
      'EMPTY_VAR=',
      'SAFE_VAR=example_placeholder',
      `export API_SECRET="sec_${'y'.repeat(20)}"`,
      'MALFORMED_LINE_WITHOUT_EQUALS',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, '.env.staging'),
    'DATABASE_URL=postgres://user:pass@localhost:5432/app\n',
    'utf8',
  );

  const paddingLines = Array.from({ length: 515 }, (_, idx) => `const pad${idx} = ${idx};`);
  fs.writeFileSync(
    path.join(rootDir, 'src', 'client.tsx'),
    [
      '// @ts-ignore',
      `const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '${rawToken}';`,
      'const client: any = supabaseAdmin;',
      'await page.waitForTimeout(1000);',
      ...paddingLines,
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(rootDir, 'src', 'api.ts'),
    [
      "app.post('/items', async (req, res) => {",
      '  return res.json(req.body);',
      '});',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(rootDir, 'sql', '01_init.sql'),
    [
      '-- USING (true) en comentario ignorado',
      '/* WITH CHECK (true) en bloque ignorado */',
      'CREATE POLICY p ON items USING (true);',
      'ALTER ROLE app_vibe WITH BYPASSRLS;',
      'CREATE TABLE orders (id UUID PRIMARY KEY);',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(rootDir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: false } }, null, 2),
    'utf8',
  );

  fs.writeFileSync(
    path.join(rootDir, 'Dockerfile'),
    'FROM node:22-alpine:latest\nUSER root\nCMD ["node", "index.js"]\n',
    'utf8',
  );
}

function buildCleanEnterpriseProject(rootDir: string, rawToken: string): void {
  fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'sql'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'tests'), { recursive: true });

  fs.writeFileSync(path.join(rootDir, '.gitignore'), '.env\nnode_modules\n', 'utf8');
  fs.writeFileSync(
    path.join(rootDir, '.env'),
    `OPENAI_API_KEY=${rawToken}\nLOG_LEVEL=info\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(rootDir, '.env.example'), 'OPENAI_API_KEY=<EXAMPLE_REDACTED>\n', 'utf8');
  fs.writeFileSync(
    path.join(rootDir, 'sql', 'schema.sql'),
    [
      'CREATE TABLE IF NOT EXISTS items (id UUID PRIMARY KEY, tenant_id UUID NOT NULL);',
      'ALTER TABLE items ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE items FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY items_iso ON items FOR ALL',
      "  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)",
      "  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);",
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'src', 'routes.ts'),
    [
      "app.post('/items', (req) => {",
      "  const key = req.headers['Idempotency-Key'];",
      '  return { key };',
      '});',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'Dockerfile'),
    'FROM node:22-alpine@sha256:abcdef0123456789\nUSER 1001\nCMD ["node", "dist/index.js"]\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'tests', 'app.test.ts'),
    'export const ok = true;\n',
    'utf8',
  );
}

afterEach(() => {
  delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('auditVibePrototype MCP tool (T4.5)', () => {
  it('expone esquema AUDIT_VIBE_PROTOTYPE_TOOL y redacta credenciales en memoria', () => {
    expect(AUDIT_VIBE_PROTOTYPE_TOOL.name).toBe('audit_vibe_prototype');
    expect(AUDIT_VIBE_PROTOTYPE_TOOL.inputSchema.additionalProperties).toBe(false);
    expect(DEFAULT_MAX_LINES).toBe(500);

    const token = buildSyntheticToken();
    const ghToken = ['ghp', '_', 'a'.repeat(24)].join('');
    const redacted = redactVibeSecrets(`Bearer ${token} ${ghToken} API_KEY=${token}`);
    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain(ghToken);
    expect(redacted).toContain(REDACTION_MARKER);
  });

  it('detecta las 5 reglas en prototipo toxico, redacta secretos y responde Fail-Verbose', () => {
    const ws = makeTempDir('qa11x-vibe-toxic-');
    const outsideFile = path.join(makeTempDir('qa11x-vibe-ext-'), 'outside.txt');
    fs.writeFileSync(outsideFile, 'ignored symlink', 'utf8');
    const rawToken = buildSyntheticToken();
    buildToxicPrototype(ws, rawToken);
    fs.symlinkSync(outsideFile, path.join(ws, 'dangling-link.txt'));

    const result = auditVibePrototype({ targetDir: '.' }, { workspaceRoot: ws });
    expect(result.hasSecurityOrInputError).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.verdict).toBe(VIBE_VERDICT_RESCUE);
    expect(result.score).toBe(0);
    expect(result.rlsTemplate).toBe(RLS_TEMPLATE_REL_PATH);
    expect(result.writtenFiles).toEqual([]);

    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    expect(ruleIds.has(VIBE_RULE_SEC)).toBe(true);
    expect(ruleIds.has(VIBE_RULE_RLS)).toBe(true);
    expect(ruleIds.has(VIBE_RULE_TYPE)).toBe(true);
    expect(ruleIds.has(VIBE_RULE_ARCH)).toBe(true);
    expect(ruleIds.has(VIBE_RULE_QA)).toBe(true);

    expect(result.summary).not.toContain(rawToken);
    expect(result.summary).toContain(REDACTION_MARKER);
    expect(result.summary).toContain(RLS_TEMPLATE_REL_PATH);
    for (const finding of result.findings) {
      expect(finding.message).not.toContain(rawToken);
    }

    const enforced = handleAuditVibePrototype(
      { targetDir: '.', enforce: true },
      { workspaceRoot: ws },
    );
    expect(enforced.isError).toBe(true);
    expect(enforced.content[0]?.type).toBe('text');

    const nonEnforced = handleAuditVibePrototype(
      { targetDir: '.', enforce: false },
      { workspaceRoot: ws },
    );
    expect(nonEnforced.isError).toBe(false);
  });

  it('respeta dryRun=true y en dryRun=false emite bundle sin sobrescribir archivos existentes', () => {
    const ws = makeTempDir('qa11x-vibe-emit-');
    const rawToken = buildSyntheticToken();
    buildToxicPrototype(ws, rawToken);

    const dryRes = auditVibePrototype(
      { targetDir: '.', dryRun: true, remediationSubdir: 'qa11x-rescue' },
      { workspaceRoot: ws },
    );
    expect(dryRes.writtenFiles).toEqual([]);
    expect(fs.existsSync(path.join(ws, 'qa11x-rescue'))).toBe(false);

    const writeRes = auditVibePrototype(
      { targetDir: '.', dryRun: false, remediationSubdir: 'qa11x-rescue' },
      { workspaceRoot: ws },
    );
    expect(writeRes.writtenFiles).toHaveLength(3);
    expect(writeRes.skippedExistingFiles).toEqual([]);

    const rlsPath = path.join(ws, 'qa11x-rescue', 'rls_hardening.sql');
    const envExPath = path.join(ws, 'qa11x-rescue', '.env.example');
    const planPath = path.join(ws, 'qa11x-rescue', 'RESCUE_PLAN.md');
    expect(fs.readFileSync(rlsPath, 'utf8')).toContain('FORCE ROW LEVEL SECURITY');
    const envContent = fs.readFileSync(envExPath, 'utf8');
    expect(envContent).toContain('VITE_SUPABASE_SERVICE_ROLE_KEY=<CHANGE_ME_IN_VAULT>');
    expect(envContent).not.toContain(rawToken);
    const planContent = fs.readFileSync(planPath, 'utf8');
    expect(planContent).toContain('RESCUE_REQUIRED');
    expect(planContent).not.toContain(rawToken);

    fs.writeFileSync(planPath, 'CUSTOM_PRESERVED_PLAN\n', 'utf8');
    const secondRun = auditVibePrototype(
      { targetDir: '.', dryRun: false, remediationSubdir: 'qa11x-rescue' },
      { workspaceRoot: ws },
    );
    expect(secondRun.writtenFiles).toEqual([]);
    expect(secondRun.skippedExistingFiles).toHaveLength(3);
    expect(secondRun.summary).toContain('Preservados sin sobrescribir');
    expect(fs.readFileSync(planPath, 'utf8')).toBe('CUSTOM_PRESERVED_PLAN\n');
  });

  it('emite Pass-Quiet de 1 linea en proyecto endurecido y fallback embebido en bundle limpio', () => {
    const ws = makeTempDir('qa11x-vibe-clean-');
    const rawToken = buildSyntheticToken();
    buildCleanEnterpriseProject(ws, rawToken);

    const cleanRes = auditVibePrototype({ targetDir: '.' }, { workspaceRoot: ws });
    expect(cleanRes.hasSecurityOrInputError).toBe(false);
    expect(cleanRes.verdict).toBe(VIBE_VERDICT_READY);
    expect(cleanRes.score).toBe(100);
    expect(cleanRes.counts).toEqual({ critical: 0, high: 0, medium: 0 });
    expect(cleanRes.summary.trim().split('\n')).toHaveLength(1);
    expect(cleanRes.summary).toContain('ENTERPRISE_READY');

    const callClean = handleAuditVibePrototype(
      { targetDir: '.', enforce: true },
      { workspaceRoot: ws },
    );
    expect(callClean.isError).toBe(false);

    const minimalWs = makeTempDir('qa11x-vibe-minimal-');
    fs.mkdirSync(path.join(minimalWs, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(minimalWs, 'tests', 'ok.test.ts'), 'export const x = 1;\n', 'utf8');
    const fallbackOut = auditVibePrototype(
      { targetDir: '.', dryRun: false, remediationSubdir: 'rescue-out' },
      { workspaceRoot: minimalWs, templatePath: path.join(minimalWs, 'missing.sql') },
    );
    expect(fallbackOut.verdict).toBe(VIBE_VERDICT_READY);
    expect(fallbackOut.writtenFiles).toHaveLength(3);
    expect(fs.readFileSync(path.join(minimalWs, 'rescue-out', '.env.example'), 'utf8')).toContain(
      'AUDIT_HMAC_KEY=<CHANGE_ME_IN_VAULT>',
    );
    expect(fs.readFileSync(path.join(minimalWs, 'rescue-out', 'RESCUE_PLAN.md'), 'utf8')).toContain(
      'Sin hallazgos críticos ni altos',
    );
  });

  it('rechaza Path Traversal, symlinks externos, subdirectorios invalidos y maxLines invalido', () => {
    const ws = makeTempDir('qa11x-vibe-guard-');
    const outsideDir = makeTempDir('qa11x-vibe-outside-');
    fs.symlinkSync(outsideDir, path.join(ws, 'escape-dir'));
    fs.symlinkSync(outsideDir, path.join(ws, 'escape-sub'));

    const invalidCases = [
      { targetDir: '../../etc/passwd' },
      { targetDir: '%2e%2e/etc' },
      { targetDir: 'bad\0path' },
      { targetDir: 'escape-dir' },
      { targetDir: 'missing-dir' },
      { targetDir: '.', remediationSubdir: '../escape' },
      { targetDir: '.', remediationSubdir: '/tmp/abs-escape' },
      { targetDir: '.', remediationSubdir: '.' },
      { targetDir: '.', remediationSubdir: 'escape-sub' },
      { targetDir: '.', maxLines: 0 },
    ];

    for (const args of invalidCases) {
      const res = auditVibePrototype(args, { workspaceRoot: ws });
      expect(res.hasSecurityOrInputError).toBe(true);
      expect(res.verdict).toBe(VIBE_VERDICT_RESCUE);
      const callRes = handleAuditVibePrototype(args, { workspaceRoot: ws });
      expect(callRes.isError).toBe(true);
    }

    const badWs = auditVibePrototype(
      { targetDir: '.' },
      { workspaceRoot: path.join(ws, 'missing-workspace') },
    );
    expect(badWs.hasSecurityOrInputError).toBe(true);

    const noUserDockerDir = makeTempDir('qa11x-vibe-nouser-');
    fs.mkdirSync(path.join(noUserDockerDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(noUserDockerDir, 'tests', 'x.test.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(noUserDockerDir, 'Dockerfile'), 'FROM node:22-alpine\n');
    const dockerRes = auditVibePrototype({ targetDir: '.' }, { workspaceRoot: noUserDockerDir });
    expect(dockerRes.findings.some((f) => f.ruleId === VIBE_RULE_QA)).toBe(true);
  });
});

describe('stackBlueprints MCP resource blueprint://vibe-rescue/readme (T4.5)', () => {
  it('registra vibe-rescue junto a mobile-appium y resuelve vibe-rescue/README.md real', () => {
    expect(VIBE_RESCUE_STACK_ID).toBe('vibe-rescue');
    expect(VIBE_RESCUE_RESOURCE.uri).toBe(VIBE_RESCUE_README_URI);
    expect(V2_STACK_BLUEPRINTS['vibe-rescue'].readmeRelPath).toBe(VIBE_RESCUE_README_REL_PATH);

    const uris = listV2StackBlueprintResources().map((entry) => entry.uri);
    expect(uris).toContain(MOBILE_APPIUM_README_URI);
    expect(uris).toContain(VIBE_RESCUE_README_URI);

    const byHelper = readVibeRescueBlueprint(REAL_WORKSPACE_ROOT);
    expect(byHelper.uri).toBe('blueprint://vibe-rescue/readme');
    expect(byHelper.stack).toBe('vibe-rescue');
    if (REAL_WORKSPACE_ROOT) {
      expect(byHelper.source).toBe('workspace');
      expect(byHelper.text).toContain('VIBE-SEC-001');
      expect(byHelper.text).toContain('rls_hardening.sql');
    }

    const syntheticWs = makeTempDir('qa11x-vibe-ws-');
    const readmeTarget = path.join(syntheticWs, VIBE_RESCUE_README_REL_PATH);
    fs.mkdirSync(path.dirname(readmeTarget), { recursive: true });
    fs.writeFileSync(readmeTarget, '# Vibe Rescue Synthetic Workspace\n', 'utf8');
    process.env.QA_BLUEPRINTS_LOCAL_PATH = syntheticWs;
    const fromEnv = readStackBlueprintResource('vibe-rescue');
    expect(fromEnv.source).toBe('workspace');
    expect(fromEnv.text).toContain('Vibe Rescue Synthetic Workspace');
    delete process.env.QA_BLUEPRINTS_LOCAL_PATH;

    const emptyWs = makeTempDir('qa11x-vibe-empty-');
    const fallback = readVibeRescueBlueprint(emptyWs);
    expect(fallback.source).toBe('embedded-fallback');
    expect(fallback.text).toContain('VIBE-RLS-002');

    const outside = path.join(makeTempDir('qa11x-vibe-leak-'), 'secret.md');
    fs.writeFileSync(outside, 'LEAKED_SECRET_DOC', 'utf8');
    const symlinkWs = makeTempDir('qa11x-vibe-sym-');
    fs.mkdirSync(path.join(symlinkWs, 'vibe-rescue'), { recursive: true });
    fs.symlinkSync(outside, path.join(symlinkWs, VIBE_RESCUE_README_REL_PATH));
    const blocked = readVibeRescueBlueprint(symlinkWs);
    expect(blocked.source).toBe('embedded-fallback');
    expect(blocked.text).not.toContain('LEAKED_SECRET_DOC');

    expect(() => readStackBlueprintResource('blueprint://vibe-rescue/bad')).toThrowError(
      StackBlueprintResolutionError,
    );
  });
});
