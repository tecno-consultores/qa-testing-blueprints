// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { execFileSync } from 'child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';
import { recordQaStageEvidence } from '../src/services/qa-evidence.js';
import { CertifyGateInputSchema } from '../src/types.js';

describe('certify-gate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function setupNominalProject(dir: string): void {
    fs.writeFileSync(path.join(dir, 'TESTING.md'), '# Testing QA 11X\nCoverage >= 95%');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Initial feature\n');
    fs.writeFileSync(path.join(dir, '.npmrc'), 'ignore-scripts=true\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'app' }, null, 2));

    const compDir = path.join(dir, 'src', 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'Header.vue'), '<template><header>ok</header></template>');
    fs.writeFileSync(path.join(compDir, 'Header.unit.ts'), '// unit test');

    const modelDir = path.join(dir, 'src', 'models');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'user.py'), '# user model');
    const alembicDir = path.join(dir, 'alembic', 'versions');
    fs.mkdirSync(alembicDir, { recursive: true });
    fs.writeFileSync(path.join(alembicDir, '001_init.py'), '# migration');
  }

  it('certifica exitosamente un proyecto que cumple todas las compuertas 11X', async () => {
    setupNominalProject(tempDir);

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(true);
    expect(result.checks.zero_unmerged_examples).toBe(true);
    expect(result.checks.zero_secrets_exposed).toBe(true);
    expect(result.checks.json_integrity).toBe(true);
    expect(result.checks.zero_orphan_ui_components).toBe(true);
    expect(result.checks.orm_alembic_parity).toBe(true);
    expect(result.checks.security_stig_owasp_clean).toBe(true);
    expect(result.checks.documentation_synced).toBe(true);
    expect(result.checks.zero_orphan_api_endpoints).toBe(false);
    expect(result.checks.ast_topology_clean).toBe(false);
    expect(result.checks.lint_evidence_verified).toBe(false);
    expect(result.check_statuses?.zero_orphan_api_endpoints).toBe('SKIPPED');
    expect(result.check_statuses?.ast_topology_clean).toBe('SKIPPED');
    expect(result.check_statuses?.lint_evidence_verified).toBe('SKIPPED');
    expect(result.skipped_checks).toEqual(
      expect.arrayContaining(['zero_orphan_api_endpoints', 'ast_topology_clean', 'lint_evidence_verified'])
    );
    expect(result.blockers.length).toBe(0);
  });

  it('bloquea la certificación si existen archivos .example sin fusionar en la raíz', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'docker-compose.yml.example'), '# example');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_unmerged_examples).toBe(false);
    expect(result.blockers.some((b) => b.includes('.example sin fusionar'))).toBe(true);
  });

  it('bloquea .example aunque manifest.json o package.json suplanten qa-testing-blueprints, salvo opt-in explícito', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({ repository: 'qa-testing-blueprints' }));
    fs.mkdirSync(path.join(tempDir, 'mcp-server'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'mcp-server', '.npmrc'), 'ignore-scripts=true\n');
    fs.writeFileSync(
      path.join(tempDir, 'mcp-server', 'package.json'),
      JSON.stringify({ name: '@sinfallas/mcp-qa-11x' })
    );
    fs.writeFileSync(path.join(tempDir, 'docker-compose.yml.example'), '# example');

    // Sin opt-in explícito debe bloquear aunque los metadatos digan qa-testing-blueprints
    const spoofedRes = await certify11xGate(tempDir);
    expect(spoofedRes.gate_passed).toBe(false);
    expect(spoofedRes.checks.zero_unmerged_examples).toBe(false);
    expect(spoofedRes.check_statuses?.zero_unmerged_examples).toBe('FAILED');
    expect(spoofedRes.blockers.some((b) => b.includes('.example sin fusionar'))).toBe(true);

    // Con allowUnmergedExamples=true reporta SKIPPED y permite aprobar si strict=false
    const optInOptionRes = await certify11xGate(tempDir, { allowUnmergedExamples: true });
    expect(optInOptionRes.check_statuses?.zero_unmerged_examples).toBe('SKIPPED');
    expect(optInOptionRes.checks.zero_unmerged_examples).toBe(false);
    expect(optInOptionRes.skipped_checks).toContain('zero_unmerged_examples');
    expect(optInOptionRes.gate_passed).toBe(true);

    // Con strict=true un check SKIPPED bloquea la compuerta
    const strictOptInRes = await certify11xGate(tempDir, {
      allowUnmergedExamples: true,
      strict: true,
    });
    expect(strictOptInRes.gate_passed).toBe(false);
    expect(strictOptInRes.blockers).toContain('STRICT_SKIPPED_CHECK: zero_unmerged_examples');

    // Con variable de entorno QA11X_BLUEPRINT_SOURCE_REPO=1 también reporta SKIPPED
    const prevEnv = process.env.QA11X_BLUEPRINT_SOURCE_REPO;
    process.env.QA11X_BLUEPRINT_SOURCE_REPO = '1';
    try {
      const envOptInRes = await certify11xGate(tempDir);
      expect(envOptInRes.check_statuses?.zero_unmerged_examples).toBe('SKIPPED');
      expect(envOptInRes.gate_passed).toBe(true);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.QA11X_BLUEPRINT_SOURCE_REPO;
      } else {
        process.env.QA11X_BLUEPRINT_SOURCE_REPO = prevEnv;
      }
    }
  });

  it('maneja manifest.json corrupto con generar-manifiesto.py y errores de lectura en CHANGELOG.md/ROADMAP.md', async () => {
    setupNominalProject(tempDir);
    fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'scripts', 'generar-manifiesto.py'), '# gen\n');
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), '{bad json');
    fs.rmSync(path.join(tempDir, 'CHANGELOG.md'));
    fs.mkdirSync(path.join(tempDir, 'CHANGELOG.md'));
    fs.mkdirSync(path.join(tempDir, 'ROADMAP.md'));

    const res = await certify11xGate(tempDir, { requireLintEvidence: false });
    expect(res.gate_passed).toBe(false);
    expect(res.blockers).toContain('No se pudo validar la integridad criptográfica de manifest.json.');
    expect(res.blockers).toContain('No se pudo leer CHANGELOG.md.');
  });

  it('rechaza rutas críticas del sistema, traversal .. y raíz tmpdir/HOME en certify11xGate (F2.5)', async () => {
    await expect(certify11xGate('/etc')).rejects.toThrow(WorkspacePathValidationError);
    await expect(certify11xGate('../outside')).rejects.toThrow(WorkspacePathValidationError);
    await expect(certify11xGate(os.tmpdir())).rejects.toThrow(WorkspacePathValidationError);
    await expect(certify11xGate(os.homedir())).rejects.toThrow(WorkspacePathValidationError);
  });

  it('bloquea la certificación si detecta claves duplicadas en JSON', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{\n  "port": 8080,\n  "port": 9090\n}\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.json_integrity).toBe(false);
    expect(result.blockers.some((b) => b.includes('Claves duplicadas'))).toBe(true);
  });

  it('bloquea la certificación si existen componentes UI huérfanos sin prueba unitaria', async () => {
    setupNominalProject(tempDir);
    const compDir = path.join(tempDir, 'src', 'components');
    fs.writeFileSync(path.join(compDir, 'Modal.vue'), '<template><div>modal</div></template>');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_orphan_ui_components).toBe(false);
    expect(result.blockers.some((b) => b.includes('Componente UI huérfano'))).toBe(true);
  });

  it('bloquea la certificación si existen modelos SQLAlchemy sin directorio de migraciones Alembic', async () => {
    setupNominalProject(tempDir);
    const alembicDir = path.join(tempDir, 'alembic');
    fs.rmSync(alembicDir, { recursive: true, force: true });

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.orm_alembic_parity).toBe(false);
    expect(result.blockers.some((b) => b.includes('Modelos SQLAlchemy detectados'))).toBe(true);
  });

  it('bloquea la certificación si falta TESTING.md o CHANGELOG.md carece de ## [Unreleased]', async () => {
    setupNominalProject(tempDir);
    fs.unlinkSync(path.join(tempDir, 'TESTING.md'));
    fs.writeFileSync(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.documentation_synced).toBe(false);
    expect(result.blockers.some((b) => b.includes('TESTING.md'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('## [Unreleased]'))).toBe(true);
  });

  it('bloquea si falta por completo el archivo CHANGELOG.md', async () => {
    setupNominalProject(tempDir);
    fs.unlinkSync(path.join(tempDir, 'CHANGELOG.md'));

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Falta archivo de historial CHANGELOG.md'))).toBe(true);
  });

  it('bloquea la certificación y propaga vulnerabilidad HIGH no secreta', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'src', 'schemas.py'), 'class UserCreateRequest(BaseModel):\n  name: str\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.security_stig_owasp_clean).toBe(false);
    expect(result.blockers.some((b) => b.includes('Vulnerabilidad HIGH'))).toBe(true);
  });

  it('bloquea la certificación y propaga secretos como vulnerabilidad crítica', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'secret.py'), 'TOKEN = "ghp_111122223333444455556666777788889999"\n'); // qa-secret-fixture-ok

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_secrets_exposed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Secreto detectado'))).toBe(true);
  });

  it('bloquea la certificación si CHANGELOG.md tiene cabeceras de versión duplicadas o ACTIVE_TASK.md incumple reglas', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n- Cambio 1\n\n## [1.0.0]\n- Inicial\n\n## [1.0.0]\n- Duplicado\n'
    );
    const agentsDir = path.join(tempDir, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const bloatedLines = Array.from({ length: 42 }, (_, idx) => `- [ ] Fase ${idx + 1}`).join('\n');
    fs.writeFileSync(
      path.join(agentsDir, 'ACTIVE_TASK.md'),
      `# Active Task\n- **Estado:** COMPLETED (100%)\n${bloatedLines}\n`
    );

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.documentation_synced).toBe(false);
    expect(result.blockers.some((b) => b.includes('Encabezado de versión duplicado en CHANGELOG.md: [1.0.0]'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('excede el presupuesto compacto de 40 líneas'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('marcado como COMPLETED pero aún contiene fases pendientes'))).toBe(true);

    const cacheDir = path.join(agentsDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'session_checkpoint.json'), '{bad json');
    const corruptCkpt = await certify11xGate(tempDir);
    expect(corruptCkpt.blockers.some((b) => b.includes('session_checkpoint.json contiene JSON corrupto'))).toBe(true);

    fs.writeFileSync(path.join(agentsDir, 'ACTIVE_TASK.md'), '# Active Task\n- **Estado:** IN_PROGRESS\n- [ ] F2\n');
    fs.writeFileSync(
      path.join(cacheDir, 'session_checkpoint.json'),
      JSON.stringify({ status: 'CERTIFIED_CLEAN', intent_140chars: 'x'.repeat(141), planned_steps: ['F2'] })
    );
    const incohCkpt = await certify11xGate(tempDir);
    expect(incohCkpt.blockers.some((b) => b.includes('excede 140 caracteres'))).toBe(true);
    expect(incohCkpt.blockers.some((b) => b.includes('aún tiene planned_steps'))).toBe(true);
    expect(incohCkpt.blockers.some((b) => b.includes('no coincide con Estado COMPLETED'))).toBe(true);
  });

  it('bloquea la certificación si graph.json presenta una violación topológica UI -> DB o está corrupto', async () => {
    setupNominalProject(tempDir);
    const graphDir = path.join(tempDir, 'graphify-out');
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(
      path.join(graphDir, 'graph.json'),
      JSON.stringify({
        links: [{ source: 'src/views/Dashboard.vue', target: 'src/models.py' }],
      })
    );
    const vueGraphDir = path.join(tempDir, 'vue3', 'graphify-out');
    fs.mkdirSync(vueGraphDir, { recursive: true });
    fs.writeFileSync(path.join(vueGraphDir, 'graph.json'), '{ invalid json');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.ast_topology_clean).toBe(false);
    expect(result.blockers.some((b) => b.includes('Violación topológica AST'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('Archivo de grafo AST corrupto'))).toBe(true);
  });

  it('detecta QA-KARATE-IDEMP en archivos .feature y SEC-12 en despachadores MCP sin validación RBAC', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'api_test.feature'),
      "Feature: API\nScenario: Test\nAnd header Idempotency-Key = '018f4a12-8888-7000-8000-000000000001'\n"
    );
    fs.writeFileSync(
      path.join(tempDir, 'src', 'mcp_dispatcher.py'),
      'async def execute_reboot_router(router_id: str):\n    return await service_reboot(router_id)\n'
    );

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.security_stig_owasp_clean).toBe(false);
    expect(result.blockers.some((b) => b.includes('QA-KARATE-IDEMP'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('SEC-12'))).toBe(true);
  });

  it('detecta llamadas HTTP huérfanas en frontend hacia endpoints inexistentes (zero_orphan_api_endpoints)', async () => {
    setupNominalProject(tempDir);

    const apiDir = path.join(tempDir, 'fastapi', 'src', 'api', 'v1');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiDir, 'routers.py'),
      'router = APIRouter(prefix="/devices")\n@router.get("")\nasync def list_devices():\n    return []\n@router.get("/{device_id}")\nasync def get_device(device_id: str):\n    return {}\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'fastapi', 'src', 'legacy.py'),
      '@app.get("status")\nasync def status():\n    return {}\n'
    );

    const nodeApiDir = path.join(tempDir, 'node-backend', 'src');
    fs.mkdirSync(path.join(nodeApiDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(
      path.join(nodeApiDir, 'routes.ts'),
      'app.get("/api/v1/nodes/:id", (req, res) => res.json({}));\n'
    );

    const frontDir = path.join(tempDir, 'vue3', 'src', 'services');
    fs.mkdirSync(frontDir, { recursive: true });
    fs.writeFileSync(path.join(frontDir, 'api.unit.ts'), '// ignored test file\n');
    fs.writeFileSync(
      path.join(frontDir, 'api.ts'),
      'export async function fetchAll() {\n  await http.get("/api/v1/devices");\n  await http.get("api/v1/devices/123?refresh=true");\n  await http.get("/api/v1/nodes/abc");\n  await http.get("/health");\n  await http.get("https://external.example.com/status");\n  await http.post("/api/v1/nonexistent-endpoint");\n}\n'
    );

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_orphan_api_endpoints).toBe(false);
    expect(
      result.blockers.some((b) =>
        b.includes('Llamada HTTP huérfana en frontend hacia endpoint inexistente (404/405): [POST] /api/v1/nonexistent-endpoint')
      )
    ).toBe(true);
  });

  it('excluye .env.example en zero_unmerged_examples y soporta estructura monorepo (fastapi/migrations/versions y docs en ../)', async () => {
    setupNominalProject(tempDir);
    // 1. .env.example en la raíz no debe bloquear zero_unmerged_examples
    fs.writeFileSync(path.join(tempDir, '.env.example'), 'DATABASE_URL=postgresql://...\n');
    // 2. Modelos en fastapi/src/models y migraciones en fastapi/migrations/versions
    fs.mkdirSync(path.join(tempDir, 'fastapi', 'src', 'models'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'fastapi', 'src', 'models', 'user.py'), 'class User: pass\n');
    fs.mkdirSync(path.join(tempDir, 'fastapi', 'migrations', 'versions'), { recursive: true });

    const rootRes = await certify11xGate(tempDir);
    expect(rootRes.checks.zero_unmerged_examples).toBe(true);
    expect(rootRes.checks.orm_alembic_parity).toBe(true);
    expect(rootRes.gate_passed).toBe(true);

    // 3. Invocar certify11xGate directamente sobre el sub-stack fastapi/ (TESTING.md y CHANGELOG.md están en ../)
    const subStackRes = await certify11xGate(path.join(tempDir, 'fastapi'));
    expect(subStackRes.checks.documentation_synced).toBe(true);
  });

  it('exime env.example y variantes .env.*.example en zero_unmerged_examples sin eximir blueprints reales', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'env.example'), 'PORT=8080\n');
    fs.writeFileSync(path.join(tempDir, '.env.production.example'), 'APP_ENV=production\n');
    fs.writeFileSync(path.join(tempDir, 'env.staging.example'), 'APP_ENV=staging\n');

    const okRes = await certify11xGate(tempDir);
    expect(okRes.checks.zero_unmerged_examples).toBe(true);
    expect(okRes.gate_passed).toBe(true);

    fs.writeFileSync(path.join(tempDir, 'pyproject.toml.example'), '[project]\nname="demo"\n');
    const failRes = await certify11xGate(tempDir);
    expect(failRes.checks.zero_unmerged_examples).toBe(false);
    expect(failRes.gate_passed).toBe(false);
    expect(failRes.blockers.some((b) => b.includes('pyproject.toml.example'))).toBe(true);
  });

  it('aprueba session_checkpoint.json IN_PROGRESS con intent_140chars válido', async () => {
    setupNominalProject(tempDir);
    const cacheDir = path.join(tempDir, '.agents', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'session_checkpoint.json'),
      JSON.stringify({ status: 'IN_PROGRESS', intent_140chars: 'Tarea activa en curso' })
    );
    const res = await certify11xGate(tempDir);
    expect(res.blockers.every((b) => !b.includes('session_checkpoint.json'))).toBe(true);
  });

  it('F1.9: bloquea en modo fail-closed ante JSON sintácticamente corrupto o ilegible y marca SKIPPED si no hay JSON', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'corrupt.json'), '{ "broken": true, }', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'broken.json.example'), '{"unclosed": [1, 2', 'utf8');

    const corruptRes = await certify11xGate(tempDir);
    expect(corruptRes.gate_passed).toBe(false);
    expect(corruptRes.checks.json_integrity).toBe(false);
    expect(corruptRes.check_statuses?.json_integrity).toBe('FAILED');
    expect(corruptRes.blockers.some((b) => b.includes('INVALID_JSON:') && b.includes('corrupt.json'))).toBe(true);
    expect(corruptRes.blockers.some((b) => b.includes('INVALID_JSON:') && b.includes('broken.json.example'))).toBe(true);

    // Archivo JSON ilegible (sin permisos de lectura) también falla fail-closed
    fs.rmSync(path.join(tempDir, 'corrupt.json'));
    fs.rmSync(path.join(tempDir, 'broken.json.example'));
    const unreadableJson = path.join(tempDir, 'unreadable.json');
    fs.writeFileSync(unreadableJson, '{"ok": true}', 'utf8');
    fs.chmodSync(unreadableJson, 0o000);
    try {
      const unreadableRes = await certify11xGate(tempDir);
      expect(unreadableRes.gate_passed).toBe(false);
      expect(unreadableRes.check_statuses?.json_integrity).toBe('FAILED');
      expect(unreadableRes.blockers.some((b) => b.includes('INVALID_JSON:') && b.includes('unreadable.json'))).toBe(true);
    } finally {
      fs.chmodSync(unreadableJson, 0o600);
    }

    // Sin ningún .json ni .json.example -> SKIPPED (nunca PASSED)
    fs.rmSync(unreadableJson);
    fs.rmSync(path.join(tempDir, 'package.json'));
    const noJsonRes = await certify11xGate(tempDir);
    expect(noJsonRes.checks.json_integrity).toBe(false);
    expect(noJsonRes.check_statuses?.json_integrity).toBe('SKIPPED');
    expect(noJsonRes.skipped_checks).toContain('json_integrity');
    expect(noJsonRes.gate_passed).toBe(true);
  });

  it('F1.6/F1.7: en modo strict=true convierte checks SKIPPED en blockers y pasa cuando todos los 10 checks tienen targets', async () => {
    expect(CertifyGateInputSchema.parse({ project_path: tempDir }).strict).toBe(false);
    expect(CertifyGateInputSchema.parse({ project_path: tempDir, strict: true }).strict).toBe(true);

    setupNominalProject(tempDir);
    const strictBlocked = await certify11xGate(tempDir, { strict: true });
    expect(strictBlocked.gate_passed).toBe(false);
    expect(strictBlocked.blockers).toEqual(
      expect.arrayContaining([
        'STRICT_SKIPPED_CHECK: zero_orphan_api_endpoints',
        'STRICT_SKIPPED_CHECK: ast_topology_clean',
        'STRICT_SKIPPED_CHECK: lint_evidence_verified',
      ])
    );

    // Completar targets restantes para los 10 checks: API bidireccional, AST graph y lint evidence
    fs.mkdirSync(path.join(tempDir, 'fastapi', 'src', 'api', 'v1'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'fastapi', 'src', 'api', 'v1', 'items.py'),
      'router = APIRouter(prefix="/items")\n@router.get("")\nasync def list_items():\n    return []\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, 'vue3', 'src', 'views'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'vue3', 'src', 'views', 'Items.vue'),
      '<script setup>http.get("/api/v1/items");</script>\n',
      'utf8'
    );
    fs.writeFileSync(path.join(tempDir, 'vue3', 'src', 'views', 'Items.unit.ts'), '// test\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'graphify-out'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'graphify-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'a', source_file: 'src/app.py' }], links: [] }),
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const mockGit = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.includes('status')) return ' M src/models/user.py\n';
      if (cmd === 'git' && args?.[0] === 'rev-parse') return 'abc123\n';
      return '';
    }) as unknown as typeof execFileSync;
    recordQaStageEvidence(tempDir, 'lint', 'PASSED', mockGit);

    const strictPassed = await certify11xGate(tempDir, { strict: true, execFileSyncFn: mockGit });
    expect(strictPassed.gate_passed).toBe(true);
    expect(strictPassed.skipped_checks).toEqual([]);
    expect(Object.values(strictPassed.check_statuses ?? {}).every((s) => s === 'PASSED')).toBe(true);
  });

  it('F1.6/F1.7: detecta endpoints backend huérfanos cuando existe directorio frontend con 0 llamadas API y omite solo en mono-layer real', async () => {
    setupNominalProject(tempDir);
    fs.mkdirSync(path.join(tempDir, 'fastapi', 'src', 'api', 'v1'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'fastapi', 'src', 'api', 'v1', 'orders.py'),
      'router = APIRouter(prefix="/orders")\n@router.get("")\nasync def list_orders():\n    return []\n',
      'utf8'
    );

    // Sin frontend dir -> mono-layer backend -> SKIPPED (no false PASSED)
    const monoBackendRes = await certify11xGate(tempDir);
    expect(monoBackendRes.checks.zero_orphan_api_endpoints).toBe(false);
    expect(monoBackendRes.check_statuses?.zero_orphan_api_endpoints).toBe('SKIPPED');
    expect(monoBackendRes.skipped_checks).toContain('zero_orphan_api_endpoints');
    expect(monoBackendRes.gate_passed).toBe(true);

    // Con vue3/src existente en disco y 0 llamadas API -> FAILED (anti-mono-layer pitfall)
    fs.mkdirSync(path.join(tempDir, 'vue3', 'src', 'views'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'vue3', 'src', 'views', 'Empty.vue'), '<template><div/></template>', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'vue3', 'src', 'views', 'Empty.unit.ts'), '// unit', 'utf8');

    const fullstackOrphanRes = await certify11xGate(tempDir);
    expect(fullstackOrphanRes.gate_passed).toBe(false);
    expect(fullstackOrphanRes.checks.zero_orphan_api_endpoints).toBe(false);
    expect(fullstackOrphanRes.check_statuses?.zero_orphan_api_endpoints).toBe('FAILED');
    expect(
      fullstackOrphanRes.blockers.some((b) => b.includes('Endpoint backend huérfano') && b.includes('/api/v1/orders'))
    ).toBe(true);

    // Con directorio backend existente (0 rutas) y frontend haciendo llamadas API -> FAILED
    fs.writeFileSync(
      path.join(tempDir, 'fastapi', 'src', 'api', 'v1', 'orders.py'),
      '# sin rutas\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'vue3', 'src', 'views', 'Empty.vue'),
      '<script setup>http.get("/api/v1/ghost");</script>',
      'utf8'
    );
    const ghostCallRes = await certify11xGate(tempDir);
    expect(ghostCallRes.check_statuses?.zero_orphan_api_endpoints).toBe('FAILED');
    expect(ghostCallRes.blockers.some((b) => b.includes('Llamada HTTP huérfana') && b.includes('/api/v1/ghost'))).toBe(
      true
    );

    // Sin backend dir (mono-layer frontend) -> SKIPPED
    fs.rmSync(path.join(tempDir, 'fastapi'), { recursive: true, force: true });
    const monoFrontendRes = await certify11xGate(tempDir);
    expect(monoFrontendRes.check_statuses?.zero_orphan_api_endpoints).toBe('SKIPPED');
    expect(monoFrontendRes.checks.zero_orphan_api_endpoints).toBe(false);
  });

  it('F1.6: empareja llamadas nativas fetch() con método implícito GET y método explícito POST', async () => {
    setupNominalProject(tempDir);
    fs.mkdirSync(path.join(tempDir, 'fastapi', 'src', 'api', 'v1'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'fastapi', 'src', 'api', 'v1', 'devices.py'),
      [
        'router = APIRouter(prefix="/devices")',
        '@router.get("")',
        'async def list_devices():',
        '    return []',
        '@router.post("")',
        'async def create_device():',
        '    return {}',
      ].join('\n'),
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, 'frontend', 'src', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'frontend', 'src', 'api', 'devicesClient.ts'),
      [
        'export async function load() { return fetch(`/api/v1/devices${q ? "?refresh=true" : ""}`); }',
        "export async function save(body: string) { return fetch('/api/v1/devices', {\n  method: 'POST',\n  body,\n}); }",
      ].join('\n'),
      'utf8'
    );

    const res = await certify11xGate(tempDir, { requireLintEvidence: false });
    expect(res.check_statuses?.zero_orphan_api_endpoints).toBe('PASSED');
    expect(res.checks.zero_orphan_api_endpoints).toBe(true);
    expect(res.blockers).toEqual([]);

    // Cobertura de rama: fetch sin comilla de cierre en la misma línea y ruta inexistente en checkUnmergedExamples
    fs.writeFileSync(
      path.join(tempDir, 'frontend', 'src', 'api', 'devicesClient.ts'),
      [
        "const bad = fetch('/api/v1/broken",
        "export async function load() { return fetch('/api/v1/devices'); }",
        "export async function save(body: string) { return fetch('/api/v1/devices', { method: 'POST', body }); }",
      ].join('\n'),
      'utf8'
    );
    const partialFetchRes = await certify11xGate(tempDir, { requireLintEvidence: false });
    expect(partialFetchRes.check_statuses?.zero_orphan_api_endpoints).toBe('PASSED');

    const missingDirRes = await certify11xGate(path.join(tempDir, 'does-not-exist'), { requireLintEvidence: false });
    expect(missingDirRes.gate_passed).toBe(false);
    expect(missingDirRes.blockers.length).toBeGreaterThan(0);
    expect(Object.values(missingDirRes.check_statuses ?? {})).toEqual(
      Array.from({ length: 10 }, () => 'SKIPPED')
    );
  });

  it('F3.4: aplica límite de 40 líneas totales (incluyendo en blanco) en ACTIVE_TASK.md y acepta CERTIFIED_CLEAN y COMPLETED (100%)', async () => {
    setupNominalProject(tempDir);
    const agentsDir = path.join(tempDir, '.agents');
    const cacheDir = path.join(agentsDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Exactamente 40 líneas con salto de línea final + CERTIFIED_CLEAN + Estado CERTIFIED_CLEAN pasa
    const exact40 = [
      '# Active Task',
      '- **Estado:** CERTIFIED_CLEAN',
      ...Array.from({ length: 38 }, (_, i) => `- [x] Paso ${i + 1}`),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(agentsDir, 'ACTIVE_TASK.md'), exact40, 'utf8');
    fs.writeFileSync(
      path.join(cacheDir, 'session_checkpoint.json'),
      JSON.stringify({ status: 'CERTIFIED_CLEAN', intent_140chars: 'Cierre limpio', planned_steps: [] })
    );
    const okClean = await certify11xGate(tempDir);
    expect(okClean.gate_passed).toBe(true);
    expect(okClean.blockers).toEqual([]);

    // Checkpoint legado COMPLETED (100%) + ACTIVE_TASK COMPLETED (100%) también pasa
    fs.writeFileSync(
      path.join(agentsDir, 'ACTIVE_TASK.md'),
      '# Active Task\n- **Estado:** COMPLETED (100%)\n- [x] Paso 1\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(cacheDir, 'session_checkpoint.json'),
      JSON.stringify({ status: 'COMPLETED (100%)', intent_140chars: 'Legado completado', planned_steps: [] })
    );
    const okLegacy = await certify11xGate(tempDir);
    expect(okLegacy.gate_passed).toBe(true);
    expect(okLegacy.blockers).toEqual([]);

    // 22 líneas con contenido + 20 líneas en blanco = 42 líneas totales -> bloquea (> 40)
    const blankPadded = [
      '# Active Task',
      '- **Estado:** CERTIFIED_CLEAN',
      ...Array.from({ length: 20 }, () => ''),
      ...Array.from({ length: 20 }, (_, i) => `- [x] Item ${i + 1}`),
    ].join('\n');
    fs.writeFileSync(path.join(agentsDir, 'ACTIVE_TASK.md'), blankPadded, 'utf8');
    const blankBloated = await certify11xGate(tempDir);
    expect(blankBloated.gate_passed).toBe(false);
    expect(
      blankBloated.blockers.some((b) => b.includes('excede el presupuesto compacto de 40 líneas'))
    ).toBe(true);

    // Archivo ACTIVE_TASK.md vacío + checkpoint con status numérico inválido (tipo != string) -> FAIL-CLOSED
    fs.writeFileSync(path.join(agentsDir, 'ACTIVE_TASK.md'), '', 'utf8');
    fs.writeFileSync(
      path.join(cacheDir, 'session_checkpoint.json'),
      JSON.stringify({ status: 123, intent_140chars: 'Estado numérico', planned_steps: [] })
    );
    const badStatusRes = await certify11xGate(tempDir);
    expect(badStatusRes.gate_passed).toBe(false);
    expect(badStatusRes.blockers.some((b) => b.includes('status inválido o no textual'))).toBe(true);

    fs.writeFileSync(path.join(cacheDir, 'session_checkpoint.json'), 'null', 'utf8');
    const nullRootRes = await certify11xGate(tempDir);
    expect(nullRootRes.gate_passed).toBe(false);
    expect(nullRootRes.blockers.some((b) => b.includes('objeto JSON'))).toBe(true);
  });

  it('blocks fail-securely on unreadable project root, unreadable candidate test files, and unreadable ACTIVE_TASK.md', async () => {
    const lockedRoot = path.join(tempDir, 'locked-root');
    fs.mkdirSync(lockedRoot, { recursive: true });
    fs.chmodSync(lockedRoot, 0o000);
    try {
      const lockedRes = await certify11xGate(lockedRoot, {
        requireLintEvidence: false,
        allowUnmergedExamples: false,
      });
      expect(lockedRes.gate_passed).toBe(false);
      expect(lockedRes.check_statuses?.zero_unmerged_examples).toBe('FAILED');
      expect(lockedRes.check_statuses?.json_integrity).toBe('FAILED');
      expect(
        lockedRes.blockers.some((b) =>
          b.includes('No se pudo enumerar el directorio raíz para verificar archivos .example')
        )
      ).toBe(true);
      expect(
        lockedRes.blockers.some((b) =>
          b.includes('No se pudo enumerar el directorio raíz para validar integridad JSON')
        )
      ).toBe(true);
    } finally {
      fs.chmodSync(lockedRoot, 0o700);
    }

    const lockedFilesProj = path.join(tempDir, 'locked-files-proj');
    fs.mkdirSync(lockedFilesProj, { recursive: true });
    setupNominalProject(lockedFilesProj);
    fs.writeFileSync(
      path.join(lockedFilesProj, 'src', 'components', 'OrphanWidget.vue'),
      '<template><div/></template>',
      'utf8'
    );
    const testsDir = path.join(lockedFilesProj, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    const unreadableTest = path.join(testsDir, 'unreadable.unit.ts');
    fs.writeFileSync(unreadableTest, '// unreadable test', 'utf8');
    const agentsDir = path.join(lockedFilesProj, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const unreadableActiveTask = path.join(agentsDir, 'ACTIVE_TASK.md');
    fs.writeFileSync(unreadableActiveTask, '# Active Task', 'utf8');

    fs.chmodSync(unreadableTest, 0o000);
    fs.chmodSync(unreadableActiveTask, 0o000);
    try {
      const res = await certify11xGate(lockedFilesProj, { requireLintEvidence: false });
      expect(res.gate_passed).toBe(false);
      expect(res.check_statuses?.zero_orphan_ui_components).toBe('FAILED');
      expect(res.blockers).toContain('No se pudo leer .agents/ACTIVE_TASK.md.');
    } finally {
      fs.chmodSync(unreadableTest, 0o600);
      fs.chmodSync(unreadableActiveTask, 0o600);
    }
  });

  it('certify11xGate aborta tempranamente cuando AbortSignal ya fue cancelada', async () => {
    const controller = new AbortController();
    controller.abort(new Error('gate aborted by TaskStateGuard timeout'));
    await expect(
      certify11xGate(tempDir, { requireLintEvidence: false, signal: controller.signal })
    ).rejects.toThrow(/gate aborted by TaskStateGuard timeout/);

    const strReasonController = new AbortController();
    strReasonController.abort('cancelado manualmente en prueba');
    await expect(
      certify11xGate(tempDir, { requireLintEvidence: false, signal: strReasonController.signal })
    ).rejects.toThrow('cancelado manualmente en prueba');

    const emptyReasonController = new AbortController();
    emptyReasonController.abort('');
    await expect(
      certify11xGate(tempDir, { requireLintEvidence: false, signal: emptyReasonController.signal })
    ).rejects.toThrow('certify_11x_gate abortado por timeout o cancelación.');
  });

  it('soporta rutas PHP (.php), omite php/src sin rutas, evita fallback sobre .. cuando existe .git, ignora vendor/target/venv/build y verifica readme_sha256', async () => {
    setupNominalProject(tempDir);

    // php/src único sin rutas + frontend con llamadas -> SKIPPED sin falso bloqueador
    fs.mkdirSync(path.join(tempDir, 'php', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'php', 'src', 'Entity.php'), '<?php class Entity {}', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'frontend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'frontend', 'src', 'app.ts'), "fetch('/api/v1/items');", 'utf8');
    const phpOnlyNoRoutes = await certify11xGate(tempDir);
    expect(phpOnlyNoRoutes.check_statuses?.zero_orphan_api_endpoints).toBe('SKIPPED');

    // Con rutas PHP Laravel + Symfony attribute (explícito y default GET sin methods)
    fs.writeFileSync(
      path.join(tempDir, 'php', 'src', 'Routes.php'),
      "<?php\nRoute::get('/api/v1/items', fn() => []);\n#[Route('/api/v1/orders', methods: ['POST'])]\n#[Route('/api/v1/status')]\n",
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'frontend', 'src', 'app.ts'),
      "fetch('/api/v1/items'); fetch('/api/v1/orders', { method: 'POST' }); fetch('/api/v1/status');",
      'utf8'
    );
    const phpParityPass = await certify11xGate(tempDir);
    expect(phpParityPass.check_statuses?.zero_orphan_api_endpoints).toBe('PASSED');

    // vendor/, target/, venv/, build/ con JSON corrupto deben ser ignorados en checkJsonIntegrity
    for (const ignoredDir of ['vendor', 'target', 'venv', 'build']) {
      fs.mkdirSync(path.join(tempDir, ignoredDir), { recursive: true });
      fs.writeFileSync(path.join(tempDir, ignoredDir, 'bad.json'), '{corrupt', 'utf8');
    }
    const ignoredJsonPass = await certify11xGate(tempDir);
    expect(ignoredJsonPass.check_statuses?.json_integrity).toBe('PASSED');

    // readme_sha256 / readme_es_sha256 desfasados en manifest.json bloquean
    fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'scripts', 'generar-manifiesto.py'), '# gen\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'python'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'python', 'README.md'), '# Python\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'python', 'README.es.md'), '# Python ES\n', 'utf8');
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({
        stacks: {
          python: {
            readme: 'python/README.md',
            readme_sha256: '0'.repeat(64),
            readme_es: 'python/README.es.md',
            readme_es_sha256: '0'.repeat(64),
          },
        },
      }),
      'utf8'
    );
    const shaMismatch = await certify11xGate(tempDir);
    expect(shaMismatch.gate_passed).toBe(false);
    expect(shaMismatch.blockers.some((b) => b.includes('sync_governance.py'))).toBe(true);

    // Subproyecto con propio .git NO hereda TESTING.md / CHANGELOG.md del directorio padre
    const childGitProj = path.join(tempDir, 'child-repo');
    fs.mkdirSync(path.join(childGitProj, '.git'), { recursive: true });
    const isolatedRes = await certify11xGate(childGitProj);
    expect(isolatedRes.gate_passed).toBe(false);
    expect(isolatedRes.blockers.some((b) => b.includes('CHANGELOG.md'))).toBe(true);

    // Entradas manifest.json con symlink interno, fuga por subdirectorio symlink o traversal '..' bloquean
    const outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-manifest-ext-'));
    try {
      fs.writeFileSync(path.join(outsideTarget, 'secret.md'), '# ext\n', 'utf8');
      fs.mkdirSync(path.join(tempDir, 'python'), { recursive: true });
      fs.symlinkSync(path.join(tempDir, 'python', 'README.md'), path.join(tempDir, 'python', 'leaf-link.md'));
      fs.symlinkSync(outsideTarget, path.join(tempDir, 'dir-escape'));
      fs.writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify({
          common_files: [
            { path: 'python/leaf-link.md', sha256: '0'.repeat(64) },
            { path: 'dir-escape/secret.md', sha256: '0'.repeat(64) },
            { path: '../outside-rel.md', sha256: '0'.repeat(64) },
            { path: '../outside-rel.md', sha256: '0'.repeat(64) },
          ],
        }),
        'utf8'
      );
      const symlinkManifestRes = await certify11xGate(tempDir);
      expect(symlinkManifestRes.gate_passed).toBe(false);
      expect(symlinkManifestRes.blockers.some((b) => b.includes('Symlink no permitido'))).toBe(true);
      expect(symlinkManifestRes.blockers.some((b) => b.includes('dir-escape/secret.md'))).toBe(true);
      expect(symlinkManifestRes.blockers.some((b) => b.includes('Ruta insegura en manifiesto'))).toBe(true);
    } finally {
      fs.rmSync(outsideTarget, { recursive: true, force: true });
    }
  });

  it('detecta ciclos AST (A -> B -> A), violaciones services/routes, exención de archivos de prueba y Milestone EN pendiente en ROADMAP.md', async () => {
    setupNominalProject(tempDir);

    // AST cycle across modules + services -> routes layer violation + test file exemption + empty/dangling graphify-out
    const emptyGraphDir = path.join(tempDir, 'subpkg', 'graphify-out');
    fs.mkdirSync(emptyGraphDir, { recursive: true });
    const emptyJsonGraphDir = path.join(tempDir, 'emptyjsonpkg', 'graphify-out');
    fs.mkdirSync(emptyJsonGraphDir, { recursive: true });
    fs.writeFileSync(path.join(emptyJsonGraphDir, 'graph.json'), '{}', 'utf8');
    const danglingGraphDir = path.join(tempDir, 'danglingpkg', 'graphify-out');
    fs.mkdirSync(danglingGraphDir, { recursive: true });
    fs.symlinkSync(path.join(tempDir, 'does-not-exist-target.json'), path.join(danglingGraphDir, 'graph.json'));

    const graphDir = path.join(tempDir, 'graphify-out');
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(
      path.join(graphDir, 'graph.json'),
      JSON.stringify({
        nodes: [
          { id: 'nB', source_file: 'src/routes/b.ts' },
          { id: 'nC', source_file: 'src/services/c.ts' },
          { id: 'nA', source_file: 'src/services/a.ts' },
          { id: 'nSame', source_file: 'src/services/a.ts' },
          { id: 'nFile', file: 'src/services/f.ts' },
          { id: 'nOnlyId' },
          { source_file: 'src/services/anon.ts' },
          { id: 'z_node', source_file: 'src/services/z.ts' },
          { id: 'a_node', source_file: 'src/services/a2.ts' },
          { id: 'nTest', source_file: 'tests/a.test.ts' },
        ],
        links: [
          {},
          { source: 'nB', target: 'nC', relation: 'calls' },
          { source: 'nC', target: 'nA', relation: 'calls' },
          { source: 'nA', target: 'nB', relation: 'calls' },
          { source: 'nA', target: 'nFile', relation: 'calls' },
          { source: 'nA', target: 'nB', relation: 'contains' },
          { source: 'nA', target: 'nSame', relation: 'calls' },
          { source: 'z_node', target: 'a_node', relation: 'calls' },
          { source: 'a_node', target: 'z_node', relation: 'calls' },
          { source: 'nTest', target: 'nA', relation: 'calls' },
        ],
      }),
      'utf8'
    );

    // Ignored node_modules graph + corrupt graph.json + English Milestone 27. / Milestone invalid-id in ROADMAP.md
    const nmGraphDir = path.join(tempDir, 'node_modules', 'pkg', 'graphify-out');
    fs.mkdirSync(nmGraphDir, { recursive: true });
    fs.writeFileSync(path.join(nmGraphDir, 'graph.json'), '{}', 'utf8');
    const symSubDir = path.join(tempDir, 'sym-subdir');
    fs.symlinkSync(tempDir, symSubDir);
    const corruptGraphDir = path.join(tempDir, 'corruptpkg', 'graphify-out');
    fs.mkdirSync(corruptGraphDir, { recursive: true });
    fs.writeFileSync(path.join(corruptGraphDir, 'graph.json'), '{bad json', 'utf8');

    // English Milestone 27 marked 100% in summary table but still has pending - [ ] item
    fs.writeFileSync(
      path.join(tempDir, 'ROADMAP.md'),
      [
        '# Roadmap',
        '| Milestone 27.1 | Done | 100% |',
        '| Milestone bad | Done | 100% |',
        '## Milestone bad: Ignored',
        '## Milestone 27.1.: Verification',
        '- [ ] Pending milestone verification task',
      ].join('\n'),
      'utf8'
    );

    const astAndRoadmapRes = await certify11xGate(tempDir, { requireLintEvidence: false });
    expect(astAndRoadmapRes.gate_passed).toBe(false);
    expect(astAndRoadmapRes.check_statuses?.ast_topology_clean).toBe('FAILED');
    expect(astAndRoadmapRes.blockers.some((b) => b.includes('Ciclo de dependencia AST'))).toBe(true);
    expect(astAndRoadmapRes.blockers.some((b) => b.includes('Violación topológica AST'))).toBe(true);
    expect(astAndRoadmapRes.blockers.some((b) => b.includes('Archivo de grafo AST corrupto'))).toBe(true);
    expect(astAndRoadmapRes.blockers.some((b) => b.includes('tests/a.test.ts'))).toBe(false);
    expect(astAndRoadmapRes.blockers.some((b) => b.includes('Milestone/Hito 27.1'))).toBe(true);
  });
});
