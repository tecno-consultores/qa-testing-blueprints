// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { certify11xGate } from '../src/tools/certify-gate.js';

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

  it('permite archivos .example si el proyecto evaluado es qa-testing-blueprints', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({ repository: 'qa-testing-blueprints' }));
    fs.writeFileSync(path.join(tempDir, 'docker-compose.yml.example'), '# example');

    const result = await certify11xGate(tempDir);
    expect(result.checks.zero_unmerged_examples).toBe(true);
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
    fs.writeFileSync(path.join(tempDir, 'secret.py'), 'TOKEN = "ghp_111122223333444455556666777788889999"\n');

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
});
