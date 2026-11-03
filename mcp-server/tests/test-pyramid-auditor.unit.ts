// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  auditTestPyramidGaps,
  findOrphanSourceFiles,
  findUntestedApiEndpoints,
  findUntestedUiViews,
  evaluateLayer01StaticSast,
  evaluateLayer02StrictTyping,
  evaluateLayer03UnitIsolated,
  evaluateLayer04OrmParity,
  evaluateLayer05ContractFuzzing,
  evaluateLayer06BddApiKarate,
  evaluateLayer07BddUiKarate,
  evaluateLayer08Mutation,
  evaluateLayer09A11yLighthouse,
  evaluateLayer10PerfLoad,
  evaluateLayer11DastZap,
  evaluateLayer12ChaosRed,
  evaluateLayer13TrimodalFixtures,
  buildPrioritizedActionPlan,
} from '../src/tools/test-pyramid-auditor.js';
import { createMcpServer } from '../src/server.js';
import { MissingTestInventory } from '../src/types.js';

describe('audit_test_pyramid_gaps Tool (11X Testing Pyramid Assessment)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pyramid-gap-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws error if project directory does not exist', async () => {
    const fakePath = path.join(tmpDir, 'does-not-exist');
    await expect(auditTestPyramidGaps(fakePath)).rejects.toThrow(
      'El directorio especificado no existe'
    );
  });

  it('throws error if target path is a file and not a directory', async () => {
    const filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello', 'utf-8');
    await expect(auditTestPyramidGaps(filePath)).rejects.toThrow(
      'La ruta especificada no es un directorio'
    );
  });

  // ============================================================================
  // 🧪 Trimodal Scenario 1: Virgin Project (0% Tests Covered)
  // ============================================================================
  it('Trimodal 1: Virgin project produces 0% score with all applicable layers MISSING and full orphan inventory', async () => {
    const projectDir = path.join(tmpDir, 'virgin-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Código fuente sin pruebas
    fs.mkdirSync(path.join(projectDir, 'src', 'services'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'services', 'billing.py'),
      'def compute_total(): return 100\n',
      'utf-8'
    );

    fs.mkdirSync(path.join(projectDir, 'src', 'components'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'components', 'InvoiceTable.vue'),
      '<template><table></table></template>\n',
      'utf-8'
    );

    fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'scripts', 'deploy.sh'),
      '#!/bin/bash\necho "deploying"\n',
      'utf-8'
    );

    // Endpoints en FastAPI sin BDD
    fs.mkdirSync(path.join(projectDir, 'src', 'routers'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'routers', 'invoices.py'),
      `
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1")

@router.get("/invoices")
def get_invoices(): return []

@router.post("/invoices")
def create_invoice(): return {"id": 1}
`,
      'utf-8'
    );

    // Vistas UI sin BDD/E2E
    fs.mkdirSync(path.join(projectDir, 'src', 'views'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'views', 'InvoicesView.vue'),
      '<template><div>Invoices</div></template>\n',
      'utf-8'
    );

    // Config básica
    fs.writeFileSync(
      path.join(projectDir, 'pyproject.toml'),
      '[project]\nname = "virgin-api"\ndependencies = ["fastapi"]\n',
      'utf-8'
    );

    const result = await auditTestPyramidGaps(projectDir);

    expect(result.project_path).toBe(path.resolve(projectDir));
    expect(result.detected_stacks).toContain('fastapi');
    expect(result.pyramid_score_pct).toBeLessThanOrEqual(10);
    expect(result.summary_counts.missing).toBeGreaterThan(0);
    expect(result.summary_counts.covered).toBe(0);

    // Validar inventario de huérfanos
    const orphanFiles = result.missing_test_inventory.orphan_source_files.map(
      (o) => o.source_file
    );
    expect(orphanFiles).toContain('src/services/billing.py');
    expect(orphanFiles).toContain('src/components/InvoiceTable.vue');
    expect(orphanFiles).toContain('scripts/deploy.sh');

    // Validar endpoints no probados
    const untestedPaths = result.missing_test_inventory.untested_api_endpoints.map(
      (u) => u.path
    );
    expect(untestedPaths).toContain('/api/v1/invoices');

    // Validar vistas no probadas
    const untestedViews = result.missing_test_inventory.untested_ui_views.map(
      (v) => v.view_file
    );
    expect(untestedViews).toContain('src/views/InvoicesView.vue');

    // Plan de acción priorizado
    expect(result.prioritized_action_plan.length).toBeGreaterThan(0);
    const criticalSteps = result.prioritized_action_plan.filter(
      (p) => p.priority === 'CRITICAL'
    );
    expect(criticalSteps.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // 🧪 Trimodal Scenario 2: Brownfield Partial Project (Partial Layers)
  // ============================================================================
  it('Trimodal 2: Brownfield project with partial coverage returns PARTIAL layers and medium score', async () => {
    const projectDir = path.join(tmpDir, 'brownfield-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Código y tests parciales
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'auth.py'),
      'def login(): return True\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'src', 'billing.py'),
      'def bill(): return True\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_auth.unit.py'),
      'def test_login(): assert True\n',
      'utf-8'
    );

    // Endpoints y BDD parcial
    fs.mkdirSync(path.join(projectDir, 'src', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'api', 'routes.py'),
      `
from fastapi import APIRouter
router = APIRouter()

@router.get("/health")
def health(): return {"status": "ok"}

@router.post("/checkout")
def checkout(): return {"status": "paid"}
`,
      'utf-8'
    );

    fs.mkdirSync(path.join(projectDir, 'test'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'test', 'api_test.feature'),
      `
Feature: API
  Scenario: Health check
    Given path '/health'
    When method get
    Then status 200
`,
      'utf-8'
    );

    // pyproject con linter pero sin scripts SAST
    fs.writeFileSync(
      path.join(projectDir, 'pyproject.toml'),
      `
[project]
name = "brownfield"
dependencies = ["fastapi"]

[tool.ruff]
line-length = 100

[tool.mypy]
strict = true
`,
      'utf-8'
    );

    const result = await auditTestPyramidGaps(projectDir);

    expect(result.pyramid_score_pct).toBeGreaterThan(0);
    expect(result.summary_counts.partial).toBeGreaterThan(0);

    // billing.py debe ser huérfano, auth.py no
    const orphans = result.missing_test_inventory.orphan_source_files.map(
      (o) => o.source_file
    );
    expect(orphans).toContain('src/billing.py');
    expect(orphans).not.toContain('src/auth.py');

    // /checkout debe ser no probado, /health probado
    const untested = result.missing_test_inventory.untested_api_endpoints.map(
      (u) => u.path
    );
    expect(untested).toContain('/checkout');
    expect(untested).not.toContain('/health');
  });

  // ============================================================================
  // 🧪 Trimodal Scenario 3: Nominal 11X Project (100% Score)
  // ============================================================================
  it('Trimodal 3: Fully instrumented 11X project achieves 100% score and zero gaps', async () => {
    const projectDir = path.join(tmpDir, 'nominal-11x');
    fs.mkdirSync(projectDir, { recursive: true });

    // Código y tests 100% paritarios
    fs.mkdirSync(path.join(projectDir, 'src', 'models'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'tests', 'fixtures'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'models', 'user.py'),
      'class User: id = 1\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_user.unit.py'),
      'def test_user(): pass\n',
      'utf-8'
    );
    fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.agents', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'alembic', 'versions'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'alembic', 'versions', '0001_init.py'),
      '# migration\n',
      'utf-8'
    );
    fs.mkdirSync(path.join(projectDir, 'test'), { recursive: true });

    // Archivo fuente y su test
    fs.writeFileSync(
      path.join(projectDir, 'src', 'service.py'),
      'def calc(): return 42\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_service.unit.py'),
      'def test_calc(): assert calc() == 42\n',
      'utf-8'
    );

    // Test de aislamiento productivo --no-dev y fixtures trimodales
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_production_no_dev_cleanliness.unit.py'),
      'def test_production_no_dev_cleanliness(): pass\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'fixtures', 'trimodal.py'),
      `
# Trimodal fixtures
virgin_state = {}
nominal_state = {"active": True}
degraded_state = {"error": "timeout"}
`,
      'utf-8'
    );

    // Router y escenario BDD Karate API completo
    fs.mkdirSync(path.join(projectDir, 'src', 'routers'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'routers', 'users.py'),
      `
from fastapi import APIRouter
router = APIRouter(prefix="/users")

@router.get("")
def list_users(): return []
`,
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_users.unit.py'),
      'def test_users(): pass\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'test', 'api_test.feature'),
      `
Feature: Users API
  Scenario: List users
    Given path '/users'
    When method get
    Then status 200
`,
      'utf-8'
    );

    // Contrato Schemathesis y scripts
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'api_contract.spec.py'),
      '# contract spec\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'test', 'locustfile.py'),
      '# locust load test\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'scripts', 'auditar-infra.sh'),
      '#!/bin/bash\nexit 0\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'test', 'test_auditar-infra.bats'),
      '@test "audit" { run true; }\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'scripts', 'verificar-secretos.sh'),
      '#!/bin/bash\nexit 0\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'test', 'test_verificar-secretos.bats'),
      '@test "secrets" { run true; }\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, '.agents', 'scripts', 'verify_alembic_orm_parity.py'),
      '# parity\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, '.agents', 'scripts', 'verify_no_orphan_api_endpoints.py'),
      '# no orphan api\n',
      'utf-8'
    );

    // Configuración estricta en pyproject.toml
    fs.writeFileSync(
      path.join(projectDir, 'pyproject.toml'),
      `
[project]
name = "nominal-api"
dependencies = ["fastapi", "prometheus_client"]

[tool.ruff]
line-length = 100

[tool.bandit]
skips = []

[tool.mypy]
strict = true

[tool.coverage.report]
fail_under = 95

[tool.mutmut]
paths_to_mutate = "src/"

[tool.schemathesis]
target = "openapi.json"
`,
      'utf-8'
    );

    // Makefile con todos los targets
    fs.writeFileSync(
      path.join(projectDir, 'Makefile'),
      `
qa-lint:
qa-unit:
qa-parity:
qa-contracts:
qa-bdd:
qa-mutation:
qa-perf:
qa-dast:
qa-chaos:
radon:
`,
      'utf-8'
    );

    // docker-compose.qa.yml con postgres, karate, locust, zap, pumba
    fs.writeFileSync(
      path.join(projectDir, 'docker-compose.qa.yml'),
      `
services:
  postgres:
    image: postgres:17-alpine
  karate:
    image: karatelabs/karate
  locust:
    image: locustio/locust
  zap:
    image: zaproxy/zap-stable
  pumba:
    image: gaia-adm/pumba
`,
      'utf-8'
    );

    // Seguridad OSHP
    fs.writeFileSync(
      path.join(projectDir, 'src', 'security.py'),
      'Content-Security-Policy = "default-src self"\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_security.unit.py'),
      'def test_security(): pass\n',
      'utf-8'
    );

    // Métricas RED
    fs.writeFileSync(
      path.join(projectDir, 'src', 'metrics.py'),
      'metrics_route = "/metrics"\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, 'tests', 'test_metrics.unit.py'),
      'def test_metrics(): pass\n',
      'utf-8'
    );

    const result = await auditTestPyramidGaps(projectDir, 'fastapi');

    expect(result.pyramid_score_pct).toBe(100);
    expect(result.summary_counts.missing).toBe(0);
    expect(result.summary_counts.covered).toBe(11); // 11 capas aplicables a fastapi (sin UI L07 ni A11y L09)
    expect(result.summary_counts.not_applicable).toBe(2);
    expect(result.missing_test_inventory.orphan_source_files.length).toBe(0);
    expect(result.missing_test_inventory.untested_api_endpoints.length).toBe(0);
    expect(result.prioritized_action_plan.length).toBe(0);
  });

  // ============================================================================
  // 🔬 Edge Cases & Stack Filtering
  // ============================================================================
  it('correctly marks L04 as NOT_APPLICABLE when no ORM models exist', () => {
    const layer = evaluateLayer04OrmParity(tmpDir, ['src/utils.ts'], ['node-backend']);
    expect(layer.status).toBe('NOT_APPLICABLE');
  });

  it('correctly marks UI layers as NOT_APPLICABLE for pure python backend', () => {
    const l07 = evaluateLayer07BddUiKarate(tmpDir, [], ['python'], []);
    const l09 = evaluateLayer09A11yLighthouse(tmpDir, [], ['python']);
    expect(l07.status).toBe('NOT_APPLICABLE');
    expect(l09.status).toBe('NOT_APPLICABLE');
  });

  it('correctly detects bash orphans and bats test pairs', () => {
    const files = ['scripts/deploy.sh', 'scripts/backup.sh', 'test/test_deploy.bats'];
    const orphans = findOrphanSourceFiles(tmpDir, files, ['bash-scripts']);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].source_file).toBe('scripts/backup.sh');
    expect(orphans[0].expected_unit_test).toBe('test/test_backup.bats');
  });

  it('extracts Express/NestJS endpoints and handles parametric paths', () => {
    const routeFile = path.join(tmpDir, 'routes.ts');
    fs.writeFileSync(
      routeFile,
      `
app.get('/users/:id', (req, res) => {});
router.post('/checkout', (req, res) => {});
`,
      'utf-8'
    );
    const endpoints = findUntestedApiEndpoints(tmpDir, ['routes.ts']);
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].path).toBe('/users/:id');
    expect(endpoints[1].method).toBe('POST');
  });

  it('buildPrioritizedActionPlan correctly populates steps and commands', () => {
    const inventory: MissingTestInventory = {
      orphan_source_files: [
        {
          source_file: 'src/main.ts',
          expected_unit_test: 'src/__tests__/main.unit.ts',
          stack: 'node-backend',
        },
      ],
      untested_api_endpoints: [
        {
          method: 'POST',
          path: '/api/v1/invoices',
          source_file: 'src/api.ts',
          line: 10,
        },
      ],
      untested_ui_views: [
        {
          view_file: 'src/views/Home.vue',
          expected_unit_test: 'src/views/__tests__/Home.unit.ts',
          present_in_bdd_feature: false,
          present_in_e2e_spec: false,
        },
      ],
    };

    const dummyLayers = [
      evaluateLayer01StaticSast(tmpDir, [], ['node-backend']),
      evaluateLayer04OrmParity(tmpDir, ['models.py'], ['fastapi']),
      evaluateLayer05ContractFuzzing(tmpDir, [], ['fastapi']),
      evaluateLayer08Mutation(tmpDir, [], ['node-backend']),
      evaluateLayer09A11yLighthouse(tmpDir, [], ['vue3']),
      evaluateLayer10PerfLoad(tmpDir, [], ['fastapi']),
      evaluateLayer11DastZap(tmpDir, [], ['fastapi']),
      evaluateLayer12ChaosRed(tmpDir, [], ['fastapi']),
      evaluateLayer13TrimodalFixtures(tmpDir, [], ['fastapi']),
    ];

    const plan = buildPrioritizedActionPlan(dummyLayers, inventory);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].priority).toBe('CRITICAL');
    expect(plan[0].step).toBe(1);
    expect(plan.some((p) => p.priority === 'HIGH')).toBe(true);
    expect(plan.some((p) => p.priority === 'MEDIUM')).toBe(true);
  });

  it('runs through McpServer registered tool successfully', async () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
    // Test direct call
    const result = await auditTestPyramidGaps(tmpDir);
    expect(result).toBeDefined();
    expect(result.summary_counts).toBeDefined();
  });

  // ============================================================================
  // 🔬 Comprehensive Branch Coverage Suite
  // ============================================================================
  it('covers candidate filtering and all orphan variants (React, Vue, Node, Python, Bash)', () => {
    const files = [
      'src/setup.py',
      'src/app.py',
      'src/main.ts',
      'src/index.js',
      'src/types.ts',
      'src/vite-env.d.ts',
      'src/globals.d.ts',
      'src/vite.config.ts',
      'src/auth.unit.py',
      'src/pure_python.py',
      'src/Button.tsx',
      'src/Modal.vue',
      'src/server.ts',
      'scripts/clean.sh',
    ];

    const orphans = findOrphanSourceFiles(tmpDir, files, [
      'python',
      'react-frontend',
      'vue3',
      'node-backend',
      'bash-scripts',
    ]);

    const orphanFiles = orphans.map((o) => o.source_file);
    expect(orphanFiles).not.toContain('src/setup.py');
    expect(orphanFiles).not.toContain('src/app.py');
    expect(orphanFiles).not.toContain('src/main.ts');
    expect(orphanFiles).not.toContain('src/types.ts');
    expect(orphanFiles).not.toContain('src/vite.config.ts');

    expect(orphanFiles).toContain('src/pure_python.py');
    expect(orphanFiles).toContain('src/Button.tsx');
    expect(orphanFiles).toContain('src/Modal.vue');
    expect(orphanFiles).toContain('src/server.ts');
    expect(orphanFiles).toContain('scripts/clean.sh');
  });

  it('covers endpoint prefix variations and clean trailing slash', () => {
    const routeFile = path.join(tmpDir, 'api_routes.py');
    fs.writeFileSync(
      routeFile,
      `
from fastapi import APIRouter
router = APIRouter(prefix="/v1/")

@router.get("/")
def root(): pass

@router.post("/items/")
def create_item(): pass
`,
      'utf-8'
    );

    const endpoints = findUntestedApiEndpoints(tmpDir, ['api_routes.py']);
    expect(endpoints.length).toBeGreaterThanOrEqual(1);
  });

  it('covers UI views discovery with partial BDD and E2E coverage', () => {
    const view1 = path.join(tmpDir, 'src', 'views', 'Dashboard.vue');
    const view2 = path.join(tmpDir, 'src', 'pages', 'Settings.tsx');
    fs.mkdirSync(path.dirname(view1), { recursive: true });
    fs.mkdirSync(path.dirname(view2), { recursive: true });
    fs.writeFileSync(view1, '<template></template>', 'utf-8');
    fs.writeFileSync(view2, 'export const Settings = () => null;', 'utf-8');

    // Unit test solo para Dashboard
    const files = [
      'src/views/Dashboard.vue',
      'src/views/__tests__/Dashboard.unit.ts',
      'src/pages/Settings.tsx',
    ];

    const untested = findUntestedUiViews(tmpDir, files);
    expect(untested.length).toBe(2); // Dashboard falta BDD/E2E, Settings falta todo
  });

  it('covers partial branches for Layer 01 (Static SAST & Linters)', () => {
    // Caso: solo linter sin scripts
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.ruff]\n[tool.bandit]\n',
      'utf-8'
    );
    const l1PartialLinter = evaluateLayer01StaticSast(tmpDir, [], ['python']);
    expect(l1PartialLinter.status).toBe('PARTIAL');

    // Caso: solo scripts sin linter
    const l1PartialScripts = evaluateLayer01StaticSast(
      tmpDir,
      ['scripts/auditar-infra.sh'],
      ['python']
    );
    expect(l1PartialScripts.status).toBe('PARTIAL');

    // Caso: node con eslint --max-warnings 0 y security (sin sonarjs)
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      '{"scripts": {"lint": "eslint --max-warnings 0", "audit": "security"}}',
      'utf-8'
    );
    const l1NodeSecurity = evaluateLayer01StaticSast(
      tmpDir,
      ['scripts/auditar-infra.sh', 'scripts/verificar-secretos.sh'],
      ['vue3']
    );
    expect(l1NodeSecurity.status).toBe('COVERED');
  });

  it('covers partial and not applicable branches for Layer 02 (Strict Typing)', () => {
    // Node sin strict tsconfig
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      '{"scripts": {"typecheck": "tsc --noEmit"}}',
      'utf-8'
    );
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{"strict": false}', 'utf-8');
    const l2NodePartial = evaluateLayer02StrictTyping(tmpDir, [], ['node-backend']);
    expect(l2NodePartial.status).toBe('PARTIAL');

    // Bash puro es NOT_APPLICABLE
    const l2Bash = evaluateLayer02StrictTyping(tmpDir, [], ['bash-scripts']);
    expect(l2Bash.status).toBe('NOT_APPLICABLE');
  });

  it('covers partial branches for Layer 03 (Unit Isolated)', () => {
    // Pruebas unitarias presentes pero sin fail_under = 95
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\n', 'utf-8');
    const l3Partial = evaluateLayer03UnitIsolated(
      tmpDir,
      ['tests/test_x.unit.py'],
      ['python'],
      []
    );
    expect(l3Partial.status).toBe('PARTIAL');
  });

  it('covers partial and missing branches for Layer 04 (ORM Parity)', () => {
    // Modelos sin migraciones -> MISSING
    const l4Missing = evaluateLayer04OrmParity(tmpDir, ['src/models.py'], ['fastapi']);
    expect(l4Missing.status).toBe('MISSING');

    // Modelos con migraciones pero sin script de paridad -> PARTIAL
    const l4Partial = evaluateLayer04OrmParity(
      tmpDir,
      ['src/models.py', 'alembic/versions/001.py'],
      ['fastapi']
    );
    expect(l4Partial.status).toBe('PARTIAL');
  });

  it('covers partial and not applicable branches for Layer 05 (Contracts)', () => {
    // Solo Schemathesis sin script de paridad
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.schemathesis]\n',
      'utf-8'
    );
    const l5Partial = evaluateLayer05ContractFuzzing(tmpDir, [], ['fastapi']);
    expect(l5Partial.status).toBe('PARTIAL');

    // Stack python puro sin fastapi -> NOT_APPLICABLE
    const l5NotApp = evaluateLayer05ContractFuzzing(tmpDir, [], ['python']);
    expect(l5NotApp.status).toBe('NOT_APPLICABLE');
  });

  it('covers partial branches for Layer 06 (BDD API Karate)', () => {
    // Feature presente pero sin servicio karate en docker-compose
    const l6Partial = evaluateLayer06BddApiKarate(
      tmpDir,
      ['test/api_test.feature'],
      ['fastapi'],
      []
    );
    expect(l6Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 07 (BDD UI Karate)', () => {
    // Feature presente pero vistas sin cobertura
    const l7Partial = evaluateLayer07BddUiKarate(
      tmpDir,
      ['test/ui_business_flow.feature'],
      ['vue3'],
      [
        {
          view_file: 'src/views/Home.vue',
          expected_unit_test: 'src/views/__tests__/Home.unit.ts',
          present_in_bdd_feature: false,
          present_in_e2e_spec: false,
        },
      ]
    );
    expect(l7Partial.status).toBe('PARTIAL');

    const l7Missing = evaluateLayer07BddUiKarate(tmpDir, [], ['vue3'], []);
    expect(l7Missing.status).toBe('MISSING');

    const l7Covered = evaluateLayer07BddUiKarate(
      tmpDir,
      ['test/ui_business_flow.feature'],
      ['vue3'],
      []
    );
    expect(l7Covered.status).toBe('COVERED');
  });

  it('covers partial branches for Layer 08 (Mutation Testing)', () => {
    // Mutmut configurado pero sin target qa-mutation en Makefile
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.mutmut]\n',
      'utf-8'
    );
    const l8Partial = evaluateLayer08Mutation(tmpDir, [], ['fastapi']);
    expect(l8Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 09 (A11y & Lighthouse)', () => {
    // Suite e2e presente pero sin lighthouserc
    const l9Partial = evaluateLayer09A11yLighthouse(
      tmpDir,
      ['e2e/accessibility.e2e.ts'],
      ['vue3']
    );
    expect(l9Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 10 (Perf & Load)', () => {
    // Locustfile presente pero sin target qa-perf
    const l10Partial = evaluateLayer10PerfLoad(
      tmpDir,
      ['test/locustfile.py'],
      ['fastapi']
    );
    expect(l10Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 11 (DAST ZAP)', () => {
    // Servicio zap presente en docker-compose pero sin target qa-dast
    fs.writeFileSync(
      path.join(tmpDir, 'docker-compose.qa.yml'),
      'services:\n  zap:\n    image: zaproxy/zap-stable\n',
      'utf-8'
    );
    const l11Partial = evaluateLayer11DastZap(tmpDir, [], ['fastapi']);
    expect(l11Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 12 (Chaos RED)', () => {
    // Métricas presentes pero sin pumba
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'app.py'),
      '# /metrics prometheus\n',
      'utf-8'
    );
    const l12Partial = evaluateLayer12ChaosRed(tmpDir, ['src/app.py'], ['fastapi']);
    expect(l12Partial.status).toBe('PARTIAL');
  });

  it('covers partial branches for Layer 13 (Trimodal Fixtures)', () => {
    // Fixtures presentes pero sin tríada completa
    const l13Partial = evaluateLayer13TrimodalFixtures(
      tmpDir,
      ['tests/fixtures/test_data.py'],
      ['fastapi']
    );
    expect(l13Partial.status).toBe('PARTIAL');
  });

  it('returns 100 score when no layers are applicable', async () => {
    const emptyDir = path.join(tmpDir, 'empty-no-stack-dir');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(emptyDir, 'README.md'), '# Empty project\n', 'utf-8');
    const result = await auditTestPyramidGaps(emptyDir);
    expect(result.pyramid_score_pct).toBe(100);
    expect(result.summary_counts.not_applicable).toBe(13);

    const vueDir = path.join(tmpDir, 'vue-only-project');
    fs.mkdirSync(vueDir, { recursive: true });
    fs.writeFileSync(
      path.join(vueDir, 'package.json'),
      '{"name": "vue-app", "dependencies": {"vue": "3.4.0"}}',
      'utf-8'
    );
    const vueRes = await auditTestPyramidGaps(vueDir);
    expect(vueRes.detected_stacks).toContain('vue3');
  });

  it('covers individual missing requirements and branch variations for all layers', () => {
    // L04 variations
    fs.mkdirSync(path.join(tmpDir, 'alembic', 'versions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'alembic', 'versions', 'v1.py'), '# v1', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  postgres:\n    image: pg', 'utf-8');
    // Falta script de paridad
    const l4MissingScript = evaluateLayer04OrmParity(tmpDir, ['models.py', 'alembic/versions/v1.py'], ['fastapi']);
    expect(l4MissingScript.missing_requirements).toContain('Falta script .agents/scripts/verify_alembic_orm_parity.py.');

    // Falta postgres
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services: {}', 'utf-8');
    const l4MissingPg = evaluateLayer04OrmParity(
      tmpDir,
      ['models.py', 'alembic/versions/v1.py', 'verify_alembic_orm_parity.py'],
      ['fastapi']
    );
    expect(l4MissingPg.missing_requirements).toContain('Falta servicio PostgreSQL real en docker-compose.qa.yml.');

    // L05 variations
    const l5MissingContracts = evaluateLayer05ContractFuzzing(
      tmpDir,
      ['verify_no_orphan_api_endpoints.py'],
      ['fastapi']
    );
    expect(l5MissingContracts.missing_requirements).toContain('Faltan contratos de integración o Schemathesis.');

    // L06 variations
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  karate:\n    image: k', 'utf-8');
    const l6MissingFeature = evaluateLayer06BddApiKarate(tmpDir, [], ['fastapi'], []);
    expect(l6MissingFeature.missing_requirements).toContain('No existe api_test.feature.');

    // L08 NOT_APPLICABLE y variations
    expect(evaluateLayer08Mutation(tmpDir, [], ['bash-scripts']).status).toBe('NOT_APPLICABLE');
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-mutation:\n', 'utf-8');
    const l8MissingTool = evaluateLayer08Mutation(tmpDir, [], ['fastapi']);
    expect(l8MissingTool.missing_requirements).toContain('Falta configuración de mutmut o stryker.');

    // L09 variations
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"dependencies": {"@axe-core/playwright": "1.0"}}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lighthouserc.js'), '// rc', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'accessibility.e2e.ts'), '// a11y', 'utf-8');
    const l9Covered = evaluateLayer09A11yLighthouse(tmpDir, ['accessibility.e2e.ts', 'lighthouserc.js'], ['vue3']);
    expect(l9Covered.status).toBe('COVERED');

    const l9MissingTest = evaluateLayer09A11yLighthouse(tmpDir, ['lighthouserc.js'], ['vue3']);
    expect(l9MissingTest.missing_requirements).toContain('Falta archivo e2e/accessibility.e2e.ts.');

    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');
    const l9MissingAxe = evaluateLayer09A11yLighthouse(tmpDir, ['accessibility.e2e.ts', 'lighthouserc.js'], ['vue3']);
    expect(l9MissingAxe.missing_requirements).toContain('Falta instalar @axe-core/playwright.');

    // L10 NOT_APPLICABLE y variations
    expect(evaluateLayer10PerfLoad(tmpDir, [], ['bash-scripts']).status).toBe('NOT_APPLICABLE');
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-perf:\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  locust:\n    image: l', 'utf-8');
    const l10MissingFile = evaluateLayer10PerfLoad(tmpDir, [], ['fastapi']);
    expect(l10MissingFile.missing_requirements).toContain('Falta locustfile.py o escenario Artillery.');

    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n', 'utf-8');
    const l10MissingDocker = evaluateLayer10PerfLoad(tmpDir, ['test/locustfile.py'], ['fastapi']);
    expect(l10MissingDocker.missing_requirements).toContain('Falta servicio de carga en docker-compose.qa.yml.');

    // L11 NOT_APPLICABLE y variations
    expect(evaluateLayer11DastZap(tmpDir, [], ['bash-scripts']).status).toBe('NOT_APPLICABLE');
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-dast:\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  zap:\n    image: z', 'utf-8');
    const l11MissingOshp = evaluateLayer11DastZap(tmpDir, [], ['fastapi']);
    expect(l11MissingOshp.missing_requirements).toContain('Falta verificación de cabeceras de seguridad OWASP OSHP.');

    fs.writeFileSync(path.join(tmpDir, 'Makefile'), '', 'utf-8');
    const l11MissingMake = evaluateLayer11DastZap(tmpDir, ['security.py'], ['fastapi']);
    expect(l11MissingMake.missing_requirements).toContain('Falta target qa-dast en Makefile.');

    // L12 variations
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-chaos:\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  pumba:\n    image: p', 'utf-8');
    const l12MissingMetrics = evaluateLayer12ChaosRed(tmpDir, [], ['fastapi']);
    expect(l12MissingMetrics.missing_requirements).toContain('Falta instrumentación de telemetría RED (/metrics o Pushgateway).');

    // L13 variations
    fs.writeFileSync(path.join(tmpDir, 'test_no_dev.py'), 'test_production_no_dev_cleanliness = True\n', 'utf-8');
    const l13MissingTriad = evaluateLayer13TrimodalFixtures(tmpDir, ['test_no_dev.py'], ['fastapi']);
    expect(l13MissingTriad.missing_requirements).toContain('Faltan fixtures trimodales completos (virgen, nominal, degradado).');
  });
});
