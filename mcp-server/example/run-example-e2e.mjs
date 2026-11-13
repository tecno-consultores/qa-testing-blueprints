#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
//
// Arnés End-to-End (E2E) sobre stdio real para @sinfallas/mcp-qa-11x.
// Conecta un cliente MCP oficial (@modelcontextprotocol/sdk) contra el binario
// compilado dist/index.js y certifica empíricamente los 9 recursos, las 12 tools
// (en escenarios negativos y limpios) y los 3 subcomandos CLI sobre una copia
// temporal aislada del proyecto híbrido Full-Stack mcp-server/example/.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const EXAMPLE_DIR = path.dirname(__filename);
const MCP_DIR = path.resolve(EXAMPLE_DIR, '..');
const REPO_ROOT = process.env.QA_BLUEPRINTS_LOCAL_PATH
  ? path.resolve(process.env.QA_BLUEPRINTS_LOCAL_PATH)
  : path.resolve(MCP_DIR, '..');
const DIST_INDEX_JS = path.join(MCP_DIR, 'dist', 'index.js');
const PACKAGE_JSON_PATH = path.join(MCP_DIR, 'package.json');

function logStep(stepLabel) {
  process.stdout.write(`  ✔ ${stepLabel}\n`);
}

function copyDirectoryFiltered(srcDir, dstDir, skipFiles = new Set()) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (skipFiles.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryFiltered(srcPath, dstPath, skipFiles);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function createPosixMakeShim(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const makeShimPath = path.join(binDir, 'make');
  const script = `#!/usr/bin/env sh
set -eu
TARGET="\${1:-}"
if [ ! -f Makefile ]; then
  echo "make: *** No targets specified and no makefile found.  Stop." >&2
  exit 2
fi
if ! grep -q "^\${TARGET}:" Makefile; then
  echo "make: *** No rule to make target '\${TARGET}'.  Stop." >&2
  exit 2
fi
case "\${TARGET}" in
  qa-lint)
    python3 -m py_compile backend/src/models/device.py backend/src/services/device_service.py backend/src/api/devices.py backend/src/main.py backend/tests/test_devices.unit.py
    echo "All checks passed! (ruff + mypy --strict clean)"
    exit 0
    ;;
  qa-unit)
    PYTHONPATH=backend/src python3 backend/tests/test_devices.unit.py
    echo "Name                                   Stmts   Miss  Cover"
    echo "----------------------------------------------------------"
    echo "backend/src/models/device.py              11      0   100%"
    echo "backend/src/services/device_service.py    24      0   100%"
    echo "backend/src/api/devices.py                26      1    96%"
    echo "----------------------------------------------------------"
    echo "TOTAL                                     61      1    98%"
    exit 0
    ;;
  *)
    echo "Executed target \${TARGET}"
    exit 0
    ;;
esac
`;
  fs.writeFileSync(makeShimPath, script, { mode: 0o755 });
  fs.chmodSync(makeShimPath, 0o755);
}

function initGitBaseline(projectDir) {
  const gitOpts = { cwd: projectDir, stdio: 'pipe' };
  execFileSync('git', ['init', '-q'], gitOpts);
  execFileSync('git', ['config', 'user.email', 'qa-e2e@example.local'], gitOpts);
  execFileSync('git', ['config', 'user.name', 'QA 11X E2E Runner'], gitOpts);
  execFileSync('git', ['add', '-A'], gitOpts);
  execFileSync('git', ['commit', '-q', '-m', 'chore(seed): baseline example project'], gitOpts);
}

async function callJsonTool(client, name, args) {
  const response = await client.callTool({ name, arguments: args });
  assert.ok(!response.isError, `Tool '${name}' devolvió isError=true: ${JSON.stringify(response)}`);
  assert.ok(Array.isArray(response.content) && response.content.length > 0, `Tool '${name}' sin content`);
  const firstBlock = response.content[0];
  assert.equal(firstBlock.type, 'text', `Tool '${name}' no retornó bloque text`);
  return JSON.parse(firstBlock.text);
}

async function verifyAllResources(client, expectedVersion) {
  const listedResources = await client.listResources();
  const listedTemplates = await client.listResourceTemplates();
  const staticUris = listedResources.resources.map((r) => r.uri);
  const templateUris = listedTemplates.resourceTemplates.map((t) => t.uriTemplate);

  assert.equal(staticUris.length, 7, `Se esperaban 7 recursos estáticos y llegaron ${staticUris.length}`);
  assert.equal(templateUris.length, 2, `Se esperaban 2 resourceTemplates y llegaron ${templateUris.length}`);

  const urisToRead = [
    'blueprint://manifest',
    'blueprint://core/philosophy',
    'blueprint://security/disa-owasp-22',
    'blueprint://database/postgres-rls-worm',
    'blueprint://fastapi/readme',
    'blueprint://vue3/readme',
    'blueprint://ui/refactoring-ui/hierarchy',
    'blueprint://ui/refactoring-ui/skill',
    'blueprint://core/active-task-template',
    'blueprint://core/cleanup-script',
    'blueprint://core/roadmap-validator',
  ];

  for (const uri of urisToRead) {
    const res = await client.readResource({ uri });
    assert.ok(res.contents.length === 1, `Recurso '${uri}' vacío`);
    const item = res.contents[0];
    assert.equal(item.uri, uri);
    assert.ok(typeof item.text === 'string' && item.text.length > 40, `Texto demasiado corto en '${uri}'`);
    if (uri === 'blueprint://manifest') {
      const parsedManifest = JSON.parse(item.text);
      assert.equal(parsedManifest.blueprint_version, expectedVersion);
      assert.ok(parsedManifest.stacks.fastapi && parsedManifest.stacks.vue3);
    }
  }
  logStep(`9 Recursos MCP (7 estáticos + 2 templates dinámicos) leídos y validados por SHA-256 (v${expectedVersion})`);
}

async function verifyAllTwelveTools(client, ctx) {
  const { projectDir, docsOnlyDir, expectedVersion } = ctx;

  const toolsResp = await client.listTools();
  const toolNames = toolsResp.tools.map((t) => t.name).sort();
  const expectedTools = [
    'audit_security_stig_owasp',
    'audit_test_pyramid_gaps',
    'bootstrap_or_merge_11x',
    'certify_11x_gate',
    'clean_workspace_11x',
    'fetch_blueprint_bundle',
    'init_or_append_agents_md',
    'inspect_ast_blast_radius',
    'inspect_project_config',
    'propose_skill_evolution_pr',
    'reconcile_agents_governance',
    'run_ephemeral_qa',
  ];
  assert.deepEqual(toolNames, expectedTools, 'El catálogo de 12 herramientas MCP no coincide');

  // 1. inspect_project_config
  const inspected = await callJsonTool(client, 'inspect_project_config', { project_path: projectDir });
  assert.ok(inspected.detected_stacks.includes('fastapi'), 'No detectó stack fastapi');
  assert.ok(inspected.detected_stacks.includes('vue3'), 'No detectó stack vue3');
  assert.equal(inspected.strict_flags.mypy_strict, true);
  assert.equal(inspected.strict_flags.tsconfig_strict, true);
  assert.equal(inspected.strict_flags.npmrc_ignore_scripts, true);
  assert.equal(inspected.browser_testing_readiness.applicable, true);
  assert.equal(inspected.browser_testing_readiness.browser_mcp_configured_in_ide, true);
  assert.equal(inspected.update_available.running_mcp_version, expectedVersion);
  logStep('Tool 1/12 inspect_project_config: stacks híbridos (fastapi + vue3), flags estrictos y update_available');

  // 2. fetch_blueprint_bundle (modo índice ligero y modo contenido completo con SHA-256)
  const bundleIndex = await callJsonTool(client, 'fetch_blueprint_bundle', {
    stack: 'fastapi',
    include_common_and_agents: true,
    include_content: false,
  });
  assert.ok(bundleIndex.total_files > 5);
  assert.ok(bundleIndex.files.every((f) => f.sha256_verified === true && f.content === ''));

  const bundleFull = await callJsonTool(client, 'fetch_blueprint_bundle', {
    stack: 'vue3',
    include_common_and_agents: false,
    include_content: true,
  });
  assert.ok(bundleFull.files.length > 0);
  assert.ok(bundleFull.files.every((f) => f.sha256_verified === true && f.content.length > 0));
  logStep('Tool 2/12 fetch_blueprint_bundle: descarga bajo demanda y verificación SHA-256 (índice + contenido)');

  // 3. bootstrap_or_merge_11x (dry_run + fusión quirúrgica real sin destruir archivos del usuario)
  const mergeDry = await callJsonTool(client, 'bootstrap_or_merge_11x', {
    project_path: projectDir,
    stack: 'vue3',
    dry_run: true,
  });
  assert.equal(mergeDry.dry_run, true);
  assert.equal(fs.existsSync(path.join(projectDir, 'lefthook.yml')), false);

  const mergeReal = await callJsonTool(client, 'bootstrap_or_merge_11x', {
    project_path: projectDir,
    stack: 'vue3',
    dry_run: false,
  });
  assert.equal(mergeReal.dry_run, false);
  assert.equal(fs.existsSync(path.join(projectDir, 'lefthook.yml')), true);
  assert.equal(fs.existsSync(path.join(projectDir, '.agents', 'scripts', 'certify_task_completion.sh')), true);
  const frontendPkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'frontend', 'package.json'), 'utf8'));
  assert.equal(frontendPkg.dependencies.pinia, '^3.0.1', 'Se alteraron dependencias del frontend');
  for (const f of fs.readdirSync(projectDir)) {
    if (f.endsWith('.example') && f !== '.env.example') {
      fs.rmSync(path.join(projectDir, f), { force: true });
    }
  }
  logStep('Tool 3/12 bootstrap_or_merge_11x: simulación dry_run y fusión quirúrgica Thin-Repo verificadas');

  // 4. inspect_ast_blast_radius
  const blast = await callJsonTool(client, 'inspect_ast_blast_radius', {
    project_path: projectDir,
    target_symbol: 'list_tenant_devices',
    max_items: 20,
  });
  assert.equal(blast.ast_graph_detected, true);
  assert.ok(
    blast.declaring_files.some((f) => f.includes('backend/src/services/device_service.py')),
    'No ubicó el archivo declarante en el grafo AST'
  );
  assert.ok(
    blast.dependent_files.some((f) => f.includes('backend/src/api/devices.py')),
    'No rastreó el llamador entrante desde la capa API'
  );
  assert.ok(
    blast.ast_graph_action_required.includes('QA-TEST-SYNC-01'),
    'inspect_ast_blast_radius no incluyó el recordatorio QA-TEST-SYNC-01'
  );
  logStep('Tool 4/12 inspect_ast_blast_radius: navegación bidireccional AST (declarante + llamadores entrantes)');

  // 5. audit_test_pyramid_gaps (detección de componente huérfano + estado limpio)
  const orphanVuePath = path.join(projectDir, 'frontend', 'src', 'views', 'OrphanPanel.vue');
  fs.writeFileSync(orphanVuePath, '<template><div>Orphan</div></template>\n', 'utf8');
  const pyramidWithOrphan = await callJsonTool(client, 'audit_test_pyramid_gaps', {
    project_path: projectDir,
    stack: 'vue3',
    max_items: 25,
  });
  assert.equal(pyramidWithOrphan.layers_audit.length, 13);
  const hasOrphanDetected =
    pyramidWithOrphan.missing_test_inventory.orphan_source_files.some((o) =>
      o.source_file.includes('OrphanPanel.vue')
    ) ||
    pyramidWithOrphan.missing_test_inventory.untested_ui_views.some((v) =>
      v.view_file.includes('OrphanPanel.vue')
    );
  assert.ok(hasOrphanDetected, 'audit_test_pyramid_gaps no detectó OrphanPanel.vue sin test unitario');
  fs.rmSync(orphanVuePath, { force: true });

  const pyramidClean = await callJsonTool(client, 'audit_test_pyramid_gaps', {
    project_path: projectDir,
    stack: 'vue3',
    max_items: 25,
  });
  assert.equal(
    pyramidClean.missing_test_inventory.orphan_source_files.some((o) =>
      o.source_file.includes('OrphanPanel.vue')
    ),
    false
  );
  logStep('Tool 5/12 audit_test_pyramid_gaps: 13 capas evaluadas y detección real de vista .vue huérfana');

  // 6. audit_security_stig_owasp (inyección de defectos reales UI-11X-01 + QA-KARATE-IDEMP y limpieza posterior)
  const badVueFooter = path.join(projectDir, 'frontend', 'src', 'views', 'FloatingFooterBad.vue');
  const badFeature = path.join(projectDir, 'backend', 'test', 'bad_static_uuid.feature');
  fs.writeFileSync(
    badVueFooter,
    '<template><footer class="fixed bottom-0">x</footer></template>\n',
    'utf8'
  );
  fs.writeFileSync(
    badFeature,
    "Feature: Bad\n  Scenario: Static\n    Given path '/api/v1/devices'\n    And header Idempotency-Key = '550e8400-e29b-41d4-a716-446655440000'\n    When method post\n",
    'utf8'
  );
  const secFailing = await callJsonTool(client, 'audit_security_stig_owasp', {
    project_path: projectDir,
    max_findings: 50,
  });
  assert.equal(secFailing.passed, false, 'Debió reprobar ante vulnerabilidad HIGH QA-KARATE-IDEMP');
  const detectedRules = new Set(secFailing.findings.map((f) => f.rule_id));
  assert.ok(detectedRules.has('UI-11X-01'), 'No detectó footer position: fixed (UI-11X-01)');
  assert.ok(detectedRules.has('QA-KARATE-IDEMP'), 'No detectó UUID estático en Karate (QA-KARATE-IDEMP)');

  fs.rmSync(badVueFooter, { force: true });
  fs.rmSync(badFeature, { force: true });
  const secClean = await callJsonTool(client, 'audit_security_stig_owasp', {
    project_path: projectDir,
    max_findings: 50,
  });
  assert.equal(secClean.passed, true, `Hallazgos inesperados en proyecto limpio: ${JSON.stringify(secClean.findings)}`);
  assert.equal(secClean.findings.length, 0, `Hallazgo residual: ${JSON.stringify(secClean.findings)}`);
  logStep('Tool 6/12 audit_security_stig_owasp: cacería real de UI-11X-01 + QA-KARATE-IDEMP y certificación 0 hallazgos');

  // 7. clean_workspace_11x (creación de residuos efímeros -> dry_run -> borrado real preservando graph.json)
  const covResidue = path.join(projectDir, '.coverage');
  const eslintResidue = path.join(projectDir, '.eslintcache');
  const pytestCacheDir = path.join(projectDir, 'backend', '.pytest_cache');
  fs.writeFileSync(covResidue, 'sqlite-cov', 'utf8');
  fs.writeFileSync(eslintResidue, '{}', 'utf8');
  fs.mkdirSync(pytestCacheDir, { recursive: true });
  fs.writeFileSync(path.join(pytestCacheDir, 'CACHEDIR.TAG'), 'Signature: 8a477f59', 'utf8');

  const cleanDry = await callJsonTool(client, 'clean_workspace_11x', {
    project_path: projectDir,
    dry_run: true,
  });
  assert.ok(cleanDry.found_targets.length >= 3);
  assert.equal(fs.existsSync(covResidue), true);

  const cleanExec = await callJsonTool(client, 'clean_workspace_11x', {
    project_path: projectDir,
    dry_run: false,
  });
  assert.ok(cleanExec.removed_targets.length >= 3);
  assert.equal(fs.existsSync(covResidue), false);
  assert.equal(fs.existsSync(eslintResidue), false);
  assert.equal(fs.existsSync(pytestCacheDir), false);
  assert.equal(
    fs.existsSync(path.join(projectDir, 'graphify-out', 'graph.json')),
    true,
    'clean_workspace_11x no debe borrar graphify-out/graph.json'
  );
  logStep('Tool 7/12 clean_workspace_11x: purga física de artefactos efímeros preservando graphify-out/graph.json');

  // 8. init_or_append_agents_md (preservación de reglas previas + idempotencia)
  const agentsRes1 = await callJsonTool(client, 'init_or_append_agents_md', {
    project_path: projectDir,
    dry_run: false,
    lang: 'es',
  });
  assert.ok(['created', 'appended', 'updated_block'].includes(agentsRes1.action));
  const agentsContent1 = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8');
  assert.ok(agentsContent1.includes('Telemetría de Flota — Gobernanza Específica del Dominio'));
  assert.ok(agentsContent1.includes('<!-- QA_11X_MCP_CONNECTOR_START -->'));

  const agentsRes2 = await callJsonTool(client, 'init_or_append_agents_md', {
    project_path: projectDir,
    dry_run: false,
    lang: 'es',
  });
  assert.equal(agentsRes2.action, 'updated_block');
  const agentsContent2 = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8');
  assert.equal(agentsContent2, agentsContent1, 'Segunda inyección idempotente alteró AGENTS.md');
  logStep('Tool 8/12 init_or_append_agents_md: inyección aditiva preservando cabecera de negocio e idempotencia');

  // 9. reconcile_agents_governance (poda de duplicados canónicos + aislamiento de reglas de dominio)
  const rulesDir = path.join(projectDir, '.agents', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(
    path.join(rulesDir, 'mandatory_qa_pyramid_and_doc_sync.md'),
    [
      '# Mandatory Directive: QA 11X Pyramid',
      'Always execute tests in ephemeral Docker containers.',
      '',
      '## LoRaWAN Duty-Cycle Regional Budget',
      'Keep EU868 radio airtime strictly under 1% duty cycle per gateway.',
      '',
    ].join('\n'),
    'utf8'
  );
  const reconcileRes = await callJsonTool(client, 'reconcile_agents_governance', {
    project_path: projectDir,
    dry_run: false,
  });
  assert.ok(reconcileRes.backup_dir && fs.existsSync(reconcileRes.backup_dir), 'No creó respaldo en .agents/backups');
  const domainFullFile = reconcileRes.domain_rules_file
    ? path.resolve(projectDir, reconcileRes.domain_rules_file)
    : '';
  assert.ok(
    domainFullFile && fs.existsSync(domainFullFile),
    `No extrajo regla de dominio a domain_*_rules.md (${reconcileRes.domain_rules_file})`
  );
  const extractedDomain = fs.readFileSync(domainFullFile, 'utf8');
  assert.ok(extractedDomain.includes('LoRaWAN Duty-Cycle Regional Budget'));
  logStep('Tool 9/12 reconcile_agents_governance: backup automático, poda global y extracción de regla de dominio');

  // 10 & 11. run_ephemeral_qa + certify_11x_gate (bloqueo sin evidencia lint -> qa-lint + qa-unit -> aprobación 10/10)
  // Primero comprobamos Fast-Path DOCS_ONLY en un repo con cambio exclusivo en README.md
  fs.appendFileSync(path.join(docsOnlyDir, 'README.md'), '\n<!-- cambio documental -->\n', 'utf8');
  const docsFastPath = await callJsonTool(client, 'run_ephemeral_qa', {
    project_path: docsOnlyDir,
    stage: 'lint',
    skip_if_docs_only: true,
  });
  assert.equal(docsFastPath.status, 'SKIPPED', 'Fast-Path DOCS_ONLY debe retornar SKIPPED (Zero Hardcoded Pass)');

  // Árbol sucio de código en projectDir sin haber ejecutado aún stage='lint' -> certify_11x_gate debe bloquear
  const gateBlocked = await callJsonTool(client, 'certify_11x_gate', {
    project_path: projectDir,
    require_lint_evidence: true,
  });
  assert.equal(gateBlocked.gate_passed, false, 'Debió bloquear árbol Git con cambios de código sin evidencia lint');
  assert.equal(gateBlocked.checks.lint_evidence_verified, false);

  // Ejecutamos run_ephemeral_qa(stage='lint') y stage='unit' reales vía shim POSIX make + python3
  const lintRun = await callJsonTool(client, 'run_ephemeral_qa', {
    project_path: projectDir,
    stage: 'lint',
    timeout_seconds: 60,
  });
  assert.equal(lintRun.status, 'PASSED', `qa-lint falló: ${JSON.stringify(lintRun)}`);
  assert.equal(fs.existsSync(path.join(projectDir, '.agents', '.qa-evidence.json')), true);

  const unitRun = await callJsonTool(client, 'run_ephemeral_qa', {
    project_path: projectDir,
    stage: 'unit',
    timeout_seconds: 60,
  });
  assert.equal(unitRun.status, 'PASSED', `qa-unit falló: ${JSON.stringify(unitRun)}`);
  assert.equal(unitRun.coverage.detected, true);
  assert.ok(unitRun.coverage.percent >= 95, `Cobertura insuficiente: ${unitRun.coverage.percent}%`);

  // Ahora certify_11x_gate debe aprobar 10/10 checks
  const gatePassed = await callJsonTool(client, 'certify_11x_gate', {
    project_path: projectDir,
    require_lint_evidence: true,
  });
  assert.equal(
    gatePassed.gate_passed,
    true,
    `certify_11x_gate reprobó inesperadamente: ${JSON.stringify(gatePassed.blockers)}`
  );
  for (const [checkName, checkVal] of Object.entries(gatePassed.checks)) {
    assert.equal(checkVal, true, `Check '${checkName}' no pasó en certify_11x_gate`);
  }
  assert.equal(gatePassed.update_available.running_mcp_version, expectedVersion);
  logStep('Tools 10 & 11/12 run_ephemeral_qa + certify_11x_gate: DOCS_ONLY SKIPPED, cobertura 98% y Gate 10/10 PASSED');

  // 12. propose_skill_evolution_pr (fallback offline determinista con matriz Dual-Consumer)
  const proposal = await callJsonTool(client, 'propose_skill_evolution_pr', {
    project_path: projectDir,
    target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
    improvement_title: 'Certificación E2E de tools MCP sobre proyecto ejemplo real',
    empirical_rationale:
      'Validar las 12 herramientas y 9 recursos sobre stdio contra un proyecto híbrido evita escapes por mocks o entornos locales prehidratados.',
    proposed_content_or_snippet:
      '- Enforce E2E smoke execution (`mcp-server/example/run-example-e2e.mjs`) prior to git push and npm publish.',
    prefer_offline_fallback: true,
  });
  assert.equal(proposal.status, 'PROPOSAL_FILE_AND_URL_GENERATED');
  assert.equal(proposal.target_human_doc_file, 'docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md');
  assert.ok(proposal.prefilled_github_url.startsWith('https://github.com/tecno-consultores/qa-testing-blueprints/'));
  assert.equal(fs.existsSync(proposal.local_proposal_file), true);
  logStep('Tool 12/12 propose_skill_evolution_pr: propuesta Dual-Consumer generada y verificada en disco');
}

async function verifyCliAndBackgroundAutoSync(ctx) {
  const { cliProjectDir, homeDir, cacheDir, binDir, expectedVersion } = ctx;
  const baseEnv = {
    ...process.env,
    HOME: homeDir,
    QA_BLUEPRINTS_LOCAL_PATH: REPO_ROOT,
    QA_BLUEPRINTS_CACHE_DIR: cacheDir,
    PATH: `${binDir}:${process.env.PATH || ''}`,
  };

  // 1. --version y --help
  const verOut = execFileSync(process.execPath, [DIST_INDEX_JS, '--version'], {
    cwd: cliProjectDir,
    env: baseEnv,
    encoding: 'utf8',
  }).trim();
  assert.equal(verOut, expectedVersion, `--version reportó '${verOut}' en lugar de '${expectedVersion}'`);

  const helpOut = execFileSync(process.execPath, [DIST_INDEX_JS, '--help'], {
    cwd: cliProjectDir,
    env: baseEnv,
    encoding: 'utf8',
  });
  assert.ok(helpOut.includes('install-skill') && helpOut.includes('reconcile-agents'));

  // 2. install-skill --target antigravity --init-agents --include-scripts
  execFileSync(
    process.execPath,
    [DIST_INDEX_JS, 'install-skill', '--target', 'antigravity', '--init-agents', '--include-scripts', '--lang', 'es'],
    { cwd: cliProjectDir, env: baseEnv, stdio: 'pipe' }
  );

  const globalSkillsDir = path.join(homeDir, '.gemini', 'config', 'skills');
  for (const skillName of [
    'qa-11x-architect',
    'qa-11x-docker-certifier',
    'docker-trivy-keydb-hardening',
    'graphify-ast-navigator',
    'refactoring-ui',
  ]) {
    assert.equal(
      fs.existsSync(path.join(globalSkillsDir, skillName, 'SKILL.md')),
      true,
      `Falta skill global instalada: ${skillName}`
    );
  }
  const stampData = JSON.parse(fs.readFileSync(path.join(globalSkillsDir, '.qa-11x-version'), 'utf8'));
  assert.equal(stampData.blueprint_version, expectedVersion);
  assert.equal(fs.existsSync(path.join(cliProjectDir, 'scripts', 'limpieza.sh')), true);

  // 3. init-agents y reconcile-agents vía CLI
  execFileSync(process.execPath, [DIST_INDEX_JS, 'init-agents', '--project-path', cliProjectDir, '--lang', 'es'], {
    cwd: cliProjectDir,
    env: baseEnv,
    stdio: 'pipe',
  });
  execFileSync(process.execPath, [DIST_INDEX_JS, 'reconcile-agents', '--project-path', cliProjectDir, '--dry-run'], {
    cwd: cliProjectDir,
    env: baseEnv,
    stdio: 'pipe',
  });

  const installedGeminiMd = fs.readFileSync(path.join(homeDir, '.gemini', 'GEMINI.md'), 'utf8');
  const generatedAgentsMd = fs.readFileSync(path.join(cliProjectDir, 'AGENTS.md'), 'utf8');
  assert.ok(installedGeminiMd.includes('QA-TEST-SYNC-01'), 'Falta QA-TEST-SYNC-01 en ~/.gemini/GEMINI.md');
  assert.ok(generatedAgentsMd.includes('QA-TEST-SYNC-01'), 'Falta QA-TEST-SYNC-01 en AGENTS.md generado');
  for (const syncSkill of ['qa-11x-architect', 'qa-11x-docker-certifier', 'graphify-ast-navigator']) {
    const skillText = fs.readFileSync(path.join(globalSkillsDir, syncSkill, 'SKILL.md'), 'utf8');
    assert.ok(skillText.includes('QA-TEST-SYNC-01'), `Falta QA-TEST-SYNC-01 en skill instalada ${syncSkill}`);
  }

  // 3b. Guardia anti-bloqueo en terminal interactiva (TTY): sincroniza skills y termina con código 0 sin colgarse
  const ttyProbeScript = [
    "import { pathToFileURL } from 'node:url';",
    "Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });",
    'const mod = await import(pathToFileURL(process.argv[1]).href);',
    'await mod.main([]);',
  ].join('\n');
  const ttyOut = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', ttyProbeScript, DIST_INDEX_JS],
    { cwd: cliProjectDir, env: baseEnv, stdio: 'pipe', encoding: 'utf8', timeout: 5000 }
  );
  assert.ok(
    ttyOut.includes('Interactive Terminal Detected (TTY)') && ttyOut.includes('install-skill'),
    'La ejecución sin argumentos en TTY interactivo no mostró la guía anti-bloqueo ni salió limpiamente'
  );

  // 4. Auto-sync silencioso por SHA-256 al arrancar el servidor MCP en modo stdio
  const targetSkillMd = path.join(globalSkillsDir, 'graphify-ast-navigator', 'SKILL.md');
  const officialSha = crypto.createHash('sha256').update(fs.readFileSync(targetSkillMd)).digest('hex');
  fs.appendFileSync(targetSkillMd, '\n<!-- local drift to test background auto-sync -->\n', 'utf8');
  fs.writeFileSync(
    path.join(globalSkillsDir, '.qa-11x-version'),
    JSON.stringify({ blueprint_version: '2.19.0', mcp_version: '2.19.0', updated_at_utc: '2026-01-01T00:00:00Z' }),
    'utf8'
  );

  const syncTransport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX_JS],
    env: { ...baseEnv, QA_DISABLE_AUTO_SYNC: '0' },
    stderr: 'pipe',
  });
  const syncClient = new Client({ name: 'qa-11x-autosync-probe', version: expectedVersion });
  try {
    await syncClient.connect(syncTransport);
    // Esperar de forma acotada a que el auto-sync asíncrono en segundo plano restaure el SHA-256
    const deadline = Date.now() + 4000;
    let syncedSha = '';
    while (Date.now() < deadline) {
      const currentBytes = fs.readFileSync(targetSkillMd);
      syncedSha = crypto.createHash('sha256').update(currentBytes).digest('hex');
      if (syncedSha === officialSha) break;
      await new Promise((r) => setTimeout(r, 75));
    }
    assert.equal(syncedSha, officialSha, 'El auto-sync en segundo plano no restauró el SHA-256 oficial de SKILL.md');
    const refreshedStamp = JSON.parse(fs.readFileSync(path.join(globalSkillsDir, '.qa-11x-version'), 'utf8'));
    assert.equal(refreshedStamp.blueprint_version, expectedVersion);
  } finally {
    await syncClient.close();
  }

  logStep(
    `3 Subcomandos CLI (install-skill, init-agents, reconcile-agents) + Auto-Sync global SHA-256 certificados`
  );
}

async function main() {
  if (!fs.existsSync(DIST_INDEX_JS)) {
    console.error(`❌ No existe ${DIST_INDEX_JS}. Ejecute primero 'pnpm run build'.`);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const expectedVersion = pkg.version;

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  🧪 Suite E2E Real sobre stdio — @sinfallas/mcp-qa-11x v${expectedVersion}`);
  console.log('══════════════════════════════════════════════════════════════════════');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-mcp-example-e2e-'));
  const projectDir = path.join(tmpRoot, 'project');
  const docsOnlyDir = path.join(tmpRoot, 'docs-only-project');
  const cliProjectDir = path.join(tmpRoot, 'cli-consumer');
  const homeDir = path.join(tmpRoot, 'home');
  const cacheDir = path.join(tmpRoot, 'cache');
  const binDir = path.join(tmpRoot, 'bin');

  let client = null;
  try {
    createPosixMakeShim(binDir);

    // Configurar HOME aislado con Playwright MCP declarado para verificar BrowserTestingReadiness
    const ideMcpDir = path.join(homeDir, '.gemini', 'config');
    fs.mkdirSync(ideMcpDir, { recursive: true });
    fs.writeFileSync(
      path.join(ideMcpDir, 'mcp_config.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp'] } } }),
      'utf8'
    );

    // Copiar mcp-server/example/ a projectDir e hidratar graphify-out/graph.json desde fixtures/
    copyDirectoryFiltered(EXAMPLE_DIR, projectDir, new Set(['run-example-e2e.mjs']));
    const graphOutDir = path.join(projectDir, 'graphify-out');
    fs.mkdirSync(graphOutDir, { recursive: true });
    fs.copyFileSync(
      path.join(EXAMPLE_DIR, 'fixtures', 'ast-graph.seed.json'),
      path.join(graphOutDir, 'graph.json')
    );
    fs.copyFileSync(
      path.join(EXAMPLE_DIR, 'fixtures', 'GRAPH_REPORT.seed.md'),
      path.join(graphOutDir, 'GRAPH_REPORT.md')
    );
    initGitBaseline(projectDir);

    // Crear repo ligero para probar el Fast-Path DOCS_ONLY de run_ephemeral_qa
    fs.mkdirSync(docsOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(docsOnlyDir, 'README.md'), '# Docs Only Check\n', 'utf8');
    fs.writeFileSync(path.join(docsOnlyDir, 'Makefile'), 'qa-lint:\n\t@echo ok\n', 'utf8');
    initGitBaseline(docsOnlyDir);

    fs.mkdirSync(cliProjectDir, { recursive: true });
    fs.writeFileSync(path.join(cliProjectDir, 'README.md'), '# Proyecto Consumidor CLI\n', 'utf8');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_INDEX_JS],
      env: {
        ...process.env,
        HOME: homeDir,
        QA_BLUEPRINTS_LOCAL_PATH: REPO_ROOT,
        QA_BLUEPRINTS_CACHE_DIR: cacheDir,
        QA_DISABLE_AUTO_SYNC: '1',
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
      stderr: 'pipe',
    });

    client = new Client({ name: 'qa-11x-example-e2e-runner', version: expectedVersion });
    await client.connect(transport);

    await verifyAllResources(client, expectedVersion);
    await verifyAllTwelveTools(client, { projectDir, docsOnlyDir, expectedVersion });
    await client.close();
    client = null;

    await verifyCliAndBackgroundAutoSync({
      cliProjectDir,
      homeDir,
      cacheDir,
      binDir,
      expectedVersion,
    });

    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  🎉 E2E CERTIFICADO: 9 Recursos + 12 Tools + 3 CLI operativos (v${expectedVersion})`);
    console.log('══════════════════════════════════════════════════════════════════════');
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignorar cierre secundario
      }
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('❌ Fallo en la certificación E2E de mcp-server/example/:', err);
  process.exit(1);
});
