# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

@mcp @cli @contracts
Feature: Validación BDD de Contratos y Comportamiento del MCP Server y CLI (@sinfallas/mcp-qa-11x)

  Como Agente de IA (Antigravity, Claude, Hermes, Cursor) o Desarrollador DevSecOps
  Deseo interactuar con el Servidor MCP y la utilidad CLI de QA Testing Blueprints
  Para verificar que los contratos JSON-RPC, recursos y herramientas cumplan con el Estándar 11X

  Background:
    * def Files = Java.type('java.nio.file.Files')
    * def Paths = Java.type('java.nio.file.Paths')
    * def repoRoot = Files.exists(Paths.get('/repo/manifest.json')) ? 'file:/repo' : 'file:..'
    * def mcpRoot = repoRoot + '/mcp-server'
    * def pkg = read(mcpRoot + '/package.json')
    * def manifest = read(repoRoot + '/manifest.json')
    * def expectedSemver3x = '#regex ^3\\.[0-9]+\\.[0-9]+$'
    * def expectedEditionRegex = '#regex ^QA-11X v3\\.[0-9]+$'
    * def qaskillsBg = read(repoRoot + '/catalogs/qaskills-pack.json')
    * def expectedEdition = qaskillsBg.standard_edition

  # ==============================================================================
  # Grupo 1: Contrato del Paquete y Metadatos CLI
  # ==============================================================================

  Scenario: 1. El paquete npm expone nombre, versión, metadatos de npmjs y binario ejecutable canónico
    * match pkg.name == '@sinfallas/mcp-qa-11x'
    * match pkg.version == '#regex ^[0-9]+\\.[0-9]+\\.[0-9]+$'
    * match pkg.homepage == 'https://github.com/tecno-consultores/qa-testing-blueprints'
    * match pkg.repository.type == 'git'
    * match pkg.repository.url == 'git+https://github.com/tecno-consultores/qa-testing-blueprints.git'
    * match pkg.repository.directory == 'mcp-server'
    * match pkg.bugs.url == 'https://github.com/tecno-consultores/qa-testing-blueprints/issues'
    * assert pkg.keywords.length >= 10
    * match pkg.bin['mcp-qa-11x'] == 'dist/index.js'
    * match pkg.type == 'module'
    * match pkg.license == 'MIT'
    * match pkg.engines.node == '>=24.0.0'

  # ==============================================================================
  # Grupo 2: Contrato Criptográfico del Manifiesto Remoto
  # ==============================================================================

  Scenario: 2. El manifiesto base cumple con el esquema Zero-Clone y verificación SHA-256
    * match manifest.blueprint_version == pkg.version
    * match manifest.schema_version == '#string'
    * match manifest.generated_at_utc == '#string'
    * match manifest.repository == 'tecno-consultores/qa-testing-blueprints'
    * match manifest.stacks == '#object'
    * assert manifest.common_files.length >= 1
    * assert manifest.agent_governance_files.length >= 1

    # Validar que cada archivo contenga hash SHA-256 de 64 caracteres hexadecimales
    * def validateEntry = function(item) { return item.sha256.length == 64 && item.size_bytes >= 0 }
    * def commonValid = karate.filter(manifest.common_files, validateEntry)
    * match commonValid == '#[manifest.common_files.length]'

  # ==============================================================================
  # Grupo 3: Contratos de Esquema de Herramientas MCP (Tools 1 a 19)
  # ==============================================================================

  Scenario: 3. Definición de contratos y esquemas JSON para las 19 Herramientas MCP
    * def serverSrc3 = karate.readAsString(mcpRoot + '/src/server.ts')
    * def typesSrc3 = karate.readAsString(mcpRoot + '/src/types.ts')
    * def calmToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/validateCalmArchitecture.ts')
    * def gateToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/evaluateReleaseGate.ts')
    * def trajToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/evaluateAgentTrajectory.ts')
    * def redToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/runLlmRedTeam.ts')
    * def vibeToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/auditVibePrototype.ts')
    * def tmsToolSrc3 = karate.readAsString(mcpRoot + '/src/integrations/tmsSyncCli.ts')
    * def flightToolSrc3 = karate.readAsString(mcpRoot + '/src/tools/sessionFlightRecorder.ts')
    * def allToolSources3 = serverSrc3 + '\n' + calmToolSrc3 + '\n' + gateToolSrc3 + '\n' + trajToolSrc3 + '\n' + redToolSrc3 + '\n' + vibeToolSrc3 + '\n' + tmsToolSrc3 + '\n' + flightToolSrc3
    * def coreTools3 =
      """
      [
        'inspect_project_config',
        'fetch_blueprint_bundle',
        'bootstrap_or_merge_11x',
        'inspect_ast_blast_radius',
        'clean_workspace_11x',
        'audit_security_stig_owasp',
        'run_ephemeral_qa',
        'certify_11x_gate',
        'audit_test_pyramid_gaps',
        'init_or_append_agents_md',
        'propose_skill_evolution_pr',
        'reconcile_agents_governance'
      ]
      """
    * def v2Tools3 =
      """
      [
        'validate_calm_architecture',
        'evaluate_release_gate',
        'evaluate_agent_trajectory',
        'run_llm_red_team',
        'audit_vibe_prototype',
        'sync_enterprise_tms',
        'session_flight_recorder'
      ]
      """
    * match coreTools3 == '#[12]'
    * match v2Tools3 == '#[7]'
    * def missingCore3 = karate.filter(coreTools3, function(t) { return !serverSrc3.contains("'" + t + "'") })
    * match missingCore3 == '#[0]'
    * def missingV23 = karate.filter(v2Tools3, function(t) { return !allToolSources3.contains("name: '" + t + "'") && !allToolSources3.contains("= '" + t + "'") })
    * match missingV23 == '#[0]'
    * assert serverSrc3.contains('tools: CORE_REGISTERED_TOOL_NAMES.length + V2_TOOL_REGISTRATIONS.length')
    * assert typesSrc3.contains('InspectProjectInputSchema')
    * assert typesSrc3.contains('FetchBundleInputSchema')
    * assert typesSrc3.contains('BootstrapMergeInputSchema')
    * assert typesSrc3.contains('ProposeEvolutionPrInputSchema')
    * assert serverSrc3.contains('SyncEnterpriseTmsInputSchema')
    * assert serverSrc3.contains('SessionFlightRecorderInputSchema')

  # ==============================================================================
  # Grupo 4: Contratos de Esquema de Recursos MCP (11 estáticos + 2 templates = 13 Resources)
  # ==============================================================================

  Scenario: 4. Definición de URIs y tipos MIME para los 13 Recursos MCP (11 estáticos + 2 templates)
    * def serverSrc4 = karate.readAsString(mcpRoot + '/src/server.ts')
    * def resSrc4 = karate.readAsString(mcpRoot + '/src/resources/blueprint-resources.ts')
    * def aiRes4 = karate.readAsString(mcpRoot + '/src/resources/aiEvalsBlueprint.ts')
    * def stackRes4 = karate.readAsString(mcpRoot + '/src/resources/stackBlueprints.ts')
    * def tacticalRes4 = karate.readAsString(mcpRoot + '/src/resources/tacticalPatternsSkill.ts')
    * def allResSrc4 = serverSrc4 + '\n' + resSrc4 + '\n' + aiRes4 + '\n' + stackRes4 + '\n' + tacticalRes4
    * def declaredStaticUris4 =
      """
      [
        'blueprint://manifest',
        'blueprint://core/philosophy',
        'blueprint://security/disa-owasp-22',
        'blueprint://database/postgres-rls-worm',
        'blueprint://core/active-task-template',
        'blueprint://core/cleanup-script',
        'blueprint://core/roadmap-validator',
        'blueprint://ai/evals-redteam',
        'blueprint://mobile-appium/readme',
        'blueprint://vibe-rescue/readme',
        'blueprint://skills/tactical-patterns-11x'
      ]
      """
    * def declaredTemplateUris4 =
      """
      [
        'blueprint://{stack}/readme',
        'blueprint://ui/refactoring-ui/{topic}'
      ]
      """
    * match declaredStaticUris4 == '#[11]'
    * match declaredTemplateUris4 == '#[2]'
    * def missingStatic4 = karate.filter(declaredStaticUris4, function(u) { return !allResSrc4.contains(u) })
    * match missingStatic4 == '#[0]'
    * def missingTemplates4 = karate.filter(declaredTemplateUris4, function(u) { return !serverSrc4.contains("new ResourceTemplate('" + u + "'") || !serverSrc4.contains("'" + u + "'") })
    * match missingTemplates4 == '#[0]'
    * assert serverSrc4.contains('resources: REGISTERED_RESOURCE_URIS.length')
    * assert serverSrc4.contains("mimeType: 'application/json'")
    * assert resSrc4.contains("mimeType: 'text/x-shellscript'")
    * assert resSrc4.contains("mimeType: 'text/x-python'")
    * assert resSrc4.contains("const MIME_MARKDOWN = 'text/markdown'")

  # ==============================================================================
  # Grupo 5: Contrato de Salida de Herramientas MCP
  # ==============================================================================

  Scenario: 5. Estructura canónica de respuesta de ejecución de herramientas MCP (JSON compacto ahorrador de tokens)
    * def serverSrc5 = karate.readAsString(mcpRoot + '/src/server.ts')
    * def certifySrc5 = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * def typesSrc5 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert serverSrc5.contains('function toJsonToolResult')
    * assert serverSrc5.contains("type: 'text'")
    * assert serverSrc5.contains('text: JSON.stringify(result)')
    * assert !serverSrc5.contains('JSON.stringify(result, null')
    * assert certifySrc5.contains('gate_passed')
    * assert certifySrc5.contains('check_statuses')
    * assert typesSrc5.contains("'PASSED'")
    * assert typesSrc5.contains("'FAILED'")
    * assert typesSrc5.contains("'SKIPPED'")

  # ==============================================================================
  # Grupo 6: Contrato CLI para install-skill (Autodetección y 11 Skills v3.1)
  # ==============================================================================

  Scenario: 6. El catálogo de gobernanza indexa las 11 skills corporativas y soporta autodetección
    * def isSkill = function(item) { return item.path.startsWith('.agents/skills/') && item.path.endsWith('/SKILL.md') }
    * def skillFiles = karate.filter(manifest.agent_governance_files, isSkill)
    * match skillFiles == '#[11]'

    # Verificar que las 11 skills corporativas y sub-skills modulares estén presentes
    * def skillPaths = karate.map(skillFiles, function(x) { return x.path })
    * match skillPaths contains '.agents/skills/qa-11x-architect/SKILL.md'
    * match skillPaths contains '.agents/skills/refactoring-ui/SKILL.md'
    * match skillPaths contains '.agents/skills/docker-trivy-keydb-hardening/SKILL.md'
    * match skillPaths contains '.agents/skills/graphify-ast-navigator/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-docker-certifier/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-devsecops-hardener/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-systematic-debugging/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-screenplay-builder/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-llm-evaluator/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-vibe-rescue/SKILL.md'
    * match skillPaths contains '.agents/skills/tactical-patterns-11x/SKILL.md'

    # Contrato real de opciones CLI de install-skill
    * def installSkillSrc6 = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * def expectedTargets6 = ['auto', 'workspace', 'antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'hermes', 'all']
    * def missingTargets6 = karate.filter(expectedTargets6, function(t) { return !installSkillSrc6.contains("'" + t + "'") })
    * match missingTargets6 == '#[0]'
    * assert installSkillSrc6.contains("'--include-scripts'")
    * assert installSkillSrc6.contains("'--init-agents'")
    * assert installSkillSrc6.contains("'--reconcile'")
    * assert installSkillSrc6.contains("'--dir'")
    * assert installSkillSrc6.contains("'--dry-run'")

  # ==============================================================================
  # Grupo 7: Contrato CLI y MCP para init-agents (Conector AGENTS.md)
  # ==============================================================================

  Scenario: 7. El conector AGENTS.md soporta modos creación, adición no destructiva e idempotencia
    * def connectorSrc7 = karate.readAsString(mcpRoot + '/src/services/agents-connector.ts')
    * def initCliSrc7 = karate.readAsString(mcpRoot + '/src/cli/init-agents-md.ts')
    * assert connectorSrc7.contains("CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->'")
    * assert connectorSrc7.contains("CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->'")
    * assert connectorSrc7.contains('replaceDelimitedSection')
    * assert connectorSrc7.contains("'created'")
    * assert connectorSrc7.contains("'appended'")
    * assert connectorSrc7.contains("'updated_block'")
    * assert initCliSrc7.contains("'--project-path'")
    * assert initCliSrc7.contains("'--dir'")
    * assert initCliSrc7.contains("'-p'")
    * assert initCliSrc7.contains("'--dry-run'")
    * assert initCliSrc7.contains("'--lang'")
    * assert initCliSrc7.contains("'--agents'")

  # ==============================================================================
  # Grupo 8: Contrato MCP para propose_skill_evolution_pr (Evolución Continua Zero-Trust)
  # ==============================================================================

  Scenario: 8. La herramienta propose_skill_evolution_pr garantiza Zero-Trust y soporte dual gh CLI / Fallback URL
    * def proposeSrc8 = karate.readAsString(mcpRoot + '/src/tools/propose-evolution-pr.ts')
    * def typesSrc8 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert proposeSrc8.contains("UPSTREAM_REPO = 'tecno-consultores/qa-testing-blueprints'")
    * assert proposeSrc8.contains("STATUS_PR_CREATED = 'PR_CREATED_VIA_GH'")
    * assert proposeSrc8.contains("STATUS_PROPOSAL_GENERATED = 'PROPOSAL_FILE_AND_URL_GENERATED'")
    * assert proposeSrc8.contains('shell: false')
    * assert proposeSrc8.contains('validateRelativeRepoPath')
    * assert proposeSrc8.contains('[SEC-PATH-01]')
    * assert proposeSrc8.contains('prefilled_github_url:')
    * assert proposeSrc8.contains('local_proposal_file:')
    * assert typesSrc8.contains('ProposeEvolutionPrInputSchema')
    * assert typesSrc8.contains('.default(true)')

  # ==============================================================================
  # Grupo 9: Contrato del Ecosistema PHP 8.2-8.5 en Manifiesto y Servidor MCP
  # ==============================================================================

  Scenario: 9. El manifiesto indexa oficialmente los stacks PHP (15), Node Backend (18) y Mobile Appium (13) con fusión quirúrgica
    * match manifest.stacks.php == '#object'
    * match manifest.stacks.php.description contains 'PHP 8.2-8.5'
    * match manifest.stacks.php.readme == 'php/README.md'
    * match manifest.stacks.php.files == '#[15]'

    # Verificar que composer.json.example aplique estrategia surgical_merge
    * def findComposer = function(f) { return f.target_name == 'composer.json' }
    * def composerEntry = karate.filter(manifest.stacks.php.files, findComposer)[0]
    * match composerEntry.merge_strategy == 'surgical_merge'
    * match composerEntry.sha256 == '#regex ^[0-9a-f]{64}$'

    # Verificar presencia de las plantillas canónicas 11X de PHP
    * def filePaths = karate.map(manifest.stacks.php.files, function(x) { return x.path })
    * match filePaths contains 'php/composer.json.example'
    * match filePaths contains 'php/docker-compose.qa.yml'
    * match filePaths contains 'php/tests/load/smoke.k6.js'
    * match filePaths contains 'php/gitignore.example'
    * match filePaths contains 'php/phpstan.neon.example'
    * match filePaths contains 'php/phpunit.xml.example'
    * match filePaths contains 'php/psalm.xml.example'
    * match filePaths contains 'php/infection.json5.example'
    * match filePaths contains 'php/initdb/01-init-rls-role.sql.example'
    * match filePaths contains 'php/php.ini.example'
    * match filePaths contains 'php/.php-cs-fixer.dist.php.example'
    * match filePaths contains 'php/limpieza.sh'
    * match filePaths contains 'php/Makefile.example'
    * match filePaths contains 'php/test/api_test.feature'
    * match filePaths contains 'php/zap.yaml.example'

    # Verificar conteos y nuevas plantillas en node-backend (18) y mobile-appium (13)
    * match manifest.stacks['node-backend'].files == '#[18]'
    * def nodePaths = karate.map(manifest.stacks['node-backend'].files, function(x) { return x.path })
    * match nodePaths contains 'node-backend/tests/contracts/fixtures/fastapi-billing-consumer-node-inventory-provider.json'
    * match manifest.stacks['mobile-appium'].files == '#[13]'
    * def mobilePaths = karate.map(manifest.stacks['mobile-appium'].files, function(x) { return x.path })
    * match mobilePaths contains 'mobile-appium/.prettierrc.example'
    * match mobilePaths contains 'mobile-appium/eslint.config.mjs.example'
    * match mobilePaths contains 'mobile-appium/tsconfig.json.example'
    * match mobilePaths contains 'mobile-appium/tests/e2e/mobile_app_smoke.spec.ts'

  # ==============================================================================
  # Grupo 10: Contrato de Auditores Anti-Silo, Ciclo Temporal de 3 Fases, Anti-UUID y Refresco Dual (Hito 12)
  # ==============================================================================

  Scenario: 10. Los auditores de seguridad y pirámide 11X exponen reglas SEC-11, UI-11X-02, UI-11X-03, 3 fases temporales y refresco dual
    * def secSrc10 = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * def pyrSrc10 = karate.readAsString(mcpRoot + '/src/tools/test-pyramid-auditor.ts')
    * def expectedSecRules10 = ['SEC-01', 'SEC-02', 'SEC-03', 'SEC-04', 'SEC-05', 'SEC-06', 'SEC-07', 'SEC-08', 'SEC-09', 'SEC-10', 'SEC-11', 'UI-11X-01', 'UI-11X-02', 'UI-11X-03']
    * def missingSecRules10 = karate.filter(expectedSecRules10, function(r) { return !secSrc10.contains("'" + r + "'") })
    * match missingSecRules10 == '#[0]'
    * assert secSrc10.contains('APSC-DV-001350')
    * assert secSrc10.contains('actor_username')
    * assert pyrSrc10.contains('Programada, En Curso, Expirada/Cancelada')
    * assert pyrSrc10.contains('starts_at')
    * assert pyrSrc10.contains('ends_at')

  # ==============================================================================
  # Grupo 11: Contrato de Reconciliación Automática, Deduplicación y Aislamiento de Dominio en .agents/ (Hito 13)
  # ==============================================================================

  Scenario: 11. La herramienta reconcile_agents_governance y CLI reconcile-agents aíslan dominio y garantizan respaldos
    * def typesSrc11 = karate.readAsString(mcpRoot + '/src/types.ts')
    * def reconcileSrc11 = karate.readAsString(mcpRoot + '/src/cli/reconcile-agents.ts')
    * def certifySrc11 = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * def expectedReconcileClass11 = ['CANONICAL_CLEAN', 'REDUNDANT_PROMOTED_REMOVED', 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE', 'DOMAIN_PRESERVED']
    * def missingReconcile11 = karate.filter(expectedReconcileClass11, function(c) { return !typesSrc11.contains("'" + c + "'") || !reconcileSrc11.contains(c) })
    * match missingReconcile11 == '#[0]'
    * assert reconcileSrc11.contains('.agents/backups/')
    * assert reconcileSrc11.contains("const DOMAIN_PREFIX = 'domain_'")
    * assert reconcileSrc11.contains('backup_dir:')
    * assert reconcileSrc11.contains('domain_rules_file:')
    * assert certifySrc11.contains('upstream_evolution_reminder:')
    * assert certifySrc11.contains('propose_skill_evolution_pr')
    * assert certifySrc11.contains('Oportunidad de Mejora Detectada para el Estándar QA 11X')

  # ==============================================================================
  # Grupo 12: Contrato del Flujo de 11 Directrices Operativas y Ciclo de Vida del Grafo AST (Local + MCP)
  # ==============================================================================

  Scenario: 12. El manifiesto y herramientas MCP garantizan las 11 directrices operativas y el ciclo del grafo AST
    # 1. Verificar que scripts/actualizar-grafos-graphify.sh se distribuya en common_files para usuarios del MCP
    * def commonPaths = karate.map(manifest.common_files, function(x) { return x.path })
    * match commonPaths contains 'scripts/actualizar-grafos-graphify.sh'
    * match commonPaths contains 'scripts/limpieza.sh'

    # 2. Verificar que .agents/ACTIVE_TASK.md.example esté indexado en agent_governance_files
    * def govPaths = karate.map(manifest.agent_governance_files, function(x) { return x.path })
    * match govPaths contains '.agents/ACTIVE_TASK.md.example'
    * match govPaths contains '.agents/scripts/inspect_blast_radius.py'

    # 3. Contrato real de inspect_ast_blast_radius con detección de grafo AST y guía de creación/actualización
    * def blastSrc12 = karate.readAsString(mcpRoot + '/src/tools/blast-radius.ts')
    * assert blastSrc12.contains('ast_graph_detected:')
    * assert blastSrc12.contains('ast_graph_files:')
    * assert blastSrc12.contains('ast_graph_action_required:')
    * assert blastSrc12.contains('./scripts/actualizar-grafos-graphify.sh')
    * assert blastSrc12.contains('qa-testing-blueprints')

  # ==============================================================================
  # Grupo 13: Contrato de Matriz de Herramientas, Tags Oficiales Docker y Diagramas Mermaid
  # ==============================================================================

  Scenario: 13. El README restaura la Matriz de Herramientas de Pruebas y actualiza tags oficiales de Docker Hub
    * def readmeContent = karate.readAsString(repoRoot + '/README.md')
    * match readmeContent contains '## 🛠 Testing Tools Matrix'
    * match readmeContent contains '| Environment | Linting / Formatting | Unit Tests / Mocking |'
    * match readmeContent contains '`3.11`, `3.12`, `3.13`, `3.14`, `3.15`, `latest`'
    * match readmeContent contains '`8.2`, `8.3`, `8.4`, `8.5`, `latest`'
    * match readmeContent contains '`22`, `24`, `26`, `latest`'
    * match readmeContent contains '`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`'
    * match readmeContent !contains 'QA-11X-BDD-COMPATIBILITY-ANCHORS'
    * match readmeContent !contains '\\text{'
    * match readmeContent !contains '<code>@sinfallas/mcp-qa-11x</code>'

    * def readmeEsContent = karate.readAsString(repoRoot + '/README.es.md')
    * match readmeEsContent contains '## 🛠 Matriz de Herramientas de Pruebas'
    * match readmeEsContent contains '| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking |'
    * match readmeEsContent contains '`3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`'
    * match readmeEsContent contains '`8.2`, `8.3`, `8.4`, `8.5` y `latest`'
    * match readmeEsContent contains '`22`, `24`, `26` y `latest`'
    * match readmeEsContent contains '`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`'

  # ==============================================================================
  # Grupo 14: Contrato de Fast-Path Documental (DOCS_ONLY) y Economía de Tokens v2.10.0
  # ==============================================================================

  Scenario: 14. El servidor MCP y las directrices soportan Fast-Path Documental (DOCS_ONLY) y Zero Hardcoded Pass
    * def agentsContent = karate.readAsString(repoRoot + '/AGENTS.md')
    * match agentsContent contains 'Documentation Fast-Path (`DOCS_ONLY`'
    * match agentsContent contains 'Full Code Path (`CODE_CHANGE`'

    * def runnerSrc14 = karate.readAsString(mcpRoot + '/src/tools/ephemeral-runner.ts')
    * assert runnerSrc14.contains('options?.skipIfDocsOnly && isDocsOnlyWorkspaceChange')
    * assert runnerSrc14.contains("status: 'SKIPPED'")
    * assert runnerSrc14.contains('exit_code: 0')
    * assert runnerSrc14.contains('detected: false')
    * assert runnerSrc14.contains('passed: false')
    * assert runnerSrc14.contains('[Fast-Path Docs-Only]')

  # ==============================================================================
  # Grupo 15: Optimización Extrema de Tokens, 3 Vías Proporcionales y Progressive Disclosure
  # ==============================================================================

  Scenario: 15. Contrato de 3 Vías Proporcionales (DOCS_ONLY, MICRO_CHANGE, FULL_11X), Token Economy y Grouped Findings
    * def agentsContent = karate.readAsString(repoRoot + '/AGENTS.md')
    * match agentsContent contains '3-Path Proportional Execution'
    * match agentsContent contains 'DOCS_ONLY'
    * match agentsContent contains 'MICRO_CHANGE'
    * match agentsContent contains 'FULL_11X'

    # Validar implementación real de economía de tokens en fetch_blueprint_bundle
    * def fetchSrc15 = karate.readAsString(mcpRoot + '/src/tools/fetch-bundle.ts')
    * assert fetchSrc15.contains('content_omitted_for_token_economy: true')
    * assert fetchSrc15.contains("content: ''")
    * assert fetchSrc15.contains('sha256_verified: item.sha256_verified')
    * assert fetchSrc15.contains('size_bytes:')
    * assert fetchSrc15.contains('cached_path:')

    # Validar implementación real de hallazgos agrupados y truncado de seguridad en audit_security_stig_owasp
    * def secSrc15 = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSrc15.contains('grouped_findings: groupedFindings')
    * assert secSrc15.contains('truncated_findings_count:')
    * assert secSrc15.contains('occurrences_count:')
    * assert secSrc15.contains('APSC-DV-002520')

    # Verificar que install-skill protege el directorio personal $HOME frente a contaminación con archivos de proyecto
    * def installSkillSource = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillSource.contains('isHomeDirectory')
    * assert installSkillSource.contains('[Modo Global $HOME]')
    * assert installSkillSource.contains('resolveGlobalOrFallbackTargets')
    * assert installSkillSource.contains('resolveAllGlobalAgentDirs')
    * assert !installSkillSource.contains('AGENT_RULES_PREFIX')

    # Verificar que reconcile-agents limpia archivos canónicos y skills duplicadas en proyectos consumidores
    * def reconcileSource = karate.readAsString(mcpRoot + '/src/cli/reconcile-agents.ts')
    * assert reconcileSource.contains('CANONICAL_GLOBAL_SKILL_DIRS')
    * assert reconcileSource.contains('isCanonicalRuleSection')
    * assert reconcileSource.contains('processCanonicalRuleFileInConsumer')
    * assert reconcileSource.contains('reconcileSkillsDir')

  # ==============================================================================
  # Grupo 16: Contrato de Autoconstrucción AST, Topología Gate, Reglas SEC-12/QA-KARATE-IDEMP y Referencias Bajo Demanda
  # ==============================================================================

  Scenario: 16. Las herramientas MCP soportan auto_build_if_missing, ast_topology_clean, SEC-12, QA-KARATE-IDEMP y referencias 07..09
    * def blastSource = karate.readAsString(mcpRoot + '/src/tools/blast-radius.ts')
    * assert blastSource.contains('autoBuildIfMissing')
    * assert blastSource.contains('refreshGraph')
    * assert blastSource.contains('defaultGraphifyBuilder')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains('checkDuplicateVersionHeaders')
    * assert certifySource.contains('checkActiveTaskGovernance')
    * assert certifySource.contains('checkAstTopology')
    * assert certifySource.contains('ast_topology_clean')

    * def secSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSource.contains('QA-KARATE-IDEMP')
    * assert secSource.contains('SEC-12')

    * def skillContent = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillContent.contains('references/07-mcp-agentic-security-governance.md')
    * assert skillContent.contains('references/08-postgres-rls-zero-downtime-migrations.md')
    * assert skillContent.contains('references/09-sre-observability-chaos-triage.md')

  Scenario: 17. Evolución empírica RLS Multi-Tx (after_begin), Cadena WORM (seq_num + pg_advisory_xact_lock), COVERAGE_FILE=/tmp/.coverage, Monorepo certify_11x_gate y SEC-11
    * def secSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSource.contains('isDirectRealAuditFunctionTest')
    * assert secSource.contains('SEC-13')
    * assert secSource.contains('SEC-14')
    * assert secSource.contains('SEC-15')
    * assert secSource.contains('QA-COV-01')
    * assert secSource.contains('QA-SMOKE-01')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains(".env.example")
    * assert certifySource.contains('resolveWithParentFallback')

    * def mergerSource = karate.readAsString(mcpRoot + '/src/services/surgical-merger.ts')
    * assert mergerSource.contains('COVERAGE_FILE=/tmp/.coverage')
    * assert mergerSource.contains('--cov=src --cov-fail-under=95')

    * def rlsReference = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md')
    * assert rlsReference.contains('after_begin')
    * assert rlsReference.contains('NOBYPASSRLS')
    * assert rlsReference.contains('SECURITY DEFINER')
    * assert rlsReference.contains('pg_advisory_xact_lock')
    * assert rlsReference.contains('seq_num')

  Scenario: 18. Navegación AST Bidireccional (Graphify AST-First en Consultas de Código Q&A) y Conector Global GEMINI.md Sin Duplicación
    * def blastRadiusSource = karate.readAsString(mcpRoot + '/src/tools/blast-radius.ts')
    * assert blastRadiusSource.contains('outgoing_dependencies')
    * assert blastRadiusSource.contains('declaring_files')
    * assert blastRadiusSource.contains('graph_reports')
    * assert blastRadiusSource.contains('QA-TEST-SYNC-01')

    * def initAgentsSource = karate.readAsString(mcpRoot + '/src/cli/init-agents-md.ts')
    * assert initAgentsSource.contains('buildGlobalGeminiBlock')
    * def agentsConnectorSource = karate.readAsString(mcpRoot + '/src/services/agents-connector.ts')
    * assert agentsConnectorSource.contains('Conector Global Thin-Client QA 11X')
    * assert agentsConnectorSource.contains('Graphify AST-First (Consultas de Código Q&A y Pre-Cambio)')
    * assert agentsConnectorSource.contains('QA-TEST-SYNC-01')

    * def graphifySkillSource = karate.readAsString(repoRoot + '/.agents/skills/graphify-ast-navigator/SKILL.md')
    * assert graphifySkillSource.contains('Code Q&A')
    * assert graphifySkillSource.contains('Graphify AST-First, Grep-Fallback, Windowed-Read-Second')
    * assert graphifySkillSource.contains('QA-TEST-SYNC-01')

  Scenario: 19. Contrato v3.x — SEC-16 (Pre-Auth Multi-Step Challenge Continuity), Thin-Repo bootstrap_or_merge_11x, Paridad 10/10 y CLI --version
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version

    * def commonPaths = karate.map(manifest.common_files, function(x) { return x.path })
    * match commonPaths !contains 'scripts/publicar-mcp.sh'

    * def secSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSource.contains('SEC-16')
    * assert secSource.contains('PREAUTH_PUBLIC_ROUTES')
    * assert secSource.contains('checkPreAuthNonAtomicChallengeConsumption')

    * def bootstrapSource = karate.readAsString(mcpRoot + '/src/tools/bootstrap-merge.ts')
    * assert bootstrapSource.contains('fetchStackBundle(stack, true, true)')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains('checkManifestCryptographicParity')
    * assert certifySource.contains('checkRoadmapConsistency')

    * def cliIndexSource = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert cliIndexSource.contains('--version')
    * assert cliIndexSource.contains('dispatchCliArgs')
    * def cliRouterSource = karate.readAsString(mcpRoot + '/src/cli.ts')
    * assert cliRouterSource.contains("'--version'")

  Scenario: 20. Presupuesto Cognitivo SKILL.md (<= 12 KB), Regla #8 Anti-Ceguera UAT (SEC-16) y Paridad de 13 Recursos Documentales
    * def findSkillMd = function(f) { return f.path == '.agents/skills/qa-11x-architect/SKILL.md' }
    * def skillMdEntry = karate.filter(manifest.agent_governance_files, findSkillMd)[0]
    * assert skillMdEntry.size_bytes <= 12288
    * def skillMdBytes = karate.readAsBytes(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillMdBytes.length <= 12288

    * def skillMdContent = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillMdContent.contains('11 UAT Anti-Blindness Rules')
    * assert skillMdContent.contains('Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant')
    * assert skillMdContent.contains('Unmocked Orchestrator Boot & Container Healthcheck Contract')
    * assert skillMdContent.contains('QA-CLI-TTY-01')
    * assert skillMdContent.contains('QA-CONTRACT-SDK-01')
    * assert skillMdContent.contains('QA-DOCKER-LOCK-01')
    * assert skillMdContent.contains('inspect_ast_blast_radius')

    * def sec22Ref = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md')
    * assert sec22Ref.contains('Addendum (`SEC-16` / UAT Rule #8)')
    * assert sec22Ref.contains('PREAUTH_TTL_SECONDS = 300')

    * def rootReadme = karate.readAsString(repoRoot + '/README.md')
    * assert rootReadme.contains('13 Resources')
    * assert !rootReadme.contains('8 Resources')
    * def rootReadmeEs = karate.readAsString(repoRoot + '/README.es.md')
    * assert rootReadmeEs.contains('13 recursos `blueprint://*`')

  Scenario: 21. Paridad Pre-Push 1:1 con CI — Sello de Evidencia Lint, Stages integration/ci, Parser de Endpoints Dinámicos e Invariantes Python/PostgreSQL 17
    * def typesSource = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesSource.contains('"migration"')
    * assert typesSource.contains('"integration"')
    * assert typesSource.contains('"ci"')
    * assert typesSource.contains('lint_evidence_verified')
    * assert typesSource.contains('require_lint_evidence')

    * def qaEvidenceSource = karate.readAsString(mcpRoot + '/src/services/qa-evidence.ts')
    * assert qaEvidenceSource.contains('checkLintEvidenceForDirtyCode')
    * assert qaEvidenceSource.contains('recordQaStageEvidence')
    * assert qaEvidenceSource.contains('.agents/.qa-evidence.json')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains('stripDynamicQuerySuffix')
    * assert certifySource.contains('SUBPATH_INTERPOLATION_TOKEN')

    * def secSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSource.contains('QA-MYPY-01')
    * assert secSource.contains('QA-PG17-RLS')
    * assert secSource.contains('--import-mode=importlib')

    * def fastapiMakefile = karate.readAsString(repoRoot + '/fastapi/Makefile.example')
    * assert fastapiMakefile.contains('--cache-dir=/tmp/mypy')
    * assert fastapiMakefile.contains('qa-integration:')
    * assert fastapiMakefile.contains('qa-ci:')
    * assert fastapiMakefile.contains('PYTHONPATH=/app')

    * def rlsRef = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md')
    * assert rlsRef.contains('relforcerowsecurity')
    * assert rlsRef.contains('pg_namespace')

  Scenario: 22. Internacionalización v3.x — Idioma Espejo Dinámico, Flag --lang (auto|es|en), Targets codex/windsurf y Guías Multi-Agente EN/ES
    * match pkg.version == expectedSemver3x
    * match pkg.description contains 'Official MCP Server & Thin-Repo Skill Installer for QA Testing Blueprints'
    * match pkg.keywords contains 'codex'
    * match pkg.keywords contains 'windsurf'
    * match pkg.keywords contains 'vscode'
    * match pkg.keywords contains 'jetbrains'

    * def typesSource = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesSource.contains('OutputLanguageModeSchema')
    * assert typesSource.contains("z.enum(['auto', 'es', 'en'])")

    * def initAgentsSource = karate.readAsString(mcpRoot + '/src/cli/init-agents-md.ts')
    * assert initAgentsSource.contains('buildLanguagePolicyLine')
    * assert initAgentsSource.contains('OutputLanguageMode')
    * def agentsConnectorSource21 = karate.readAsString(mcpRoot + '/src/services/agents-connector.ts')
    * assert agentsConnectorSource21.contains('Conector Global Thin-Client QA 11X')

    * def installSkillSource = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillSource.contains('parseLangArg')
    * assert installSkillSource.contains('CODEX_DIR_NAME')
    * assert installSkillSource.contains('WINDSURF_REL_DIR')
    * assert installSkillSource.contains("case 'codex':")
    * assert installSkillSource.contains("case 'windsurf':")

    * def mcpReadme = karate.readAsString(mcpRoot + '/README.md')
    * assert mcpReadme.contains('Official MCP Server & Skill Installer for QA Testing Blueprints')
    * assert mcpReadme.contains('English (Canonical)')
    * assert mcpReadme.contains('README.es.md')
    * assert mcpReadme.contains('docs/agent-setup.md')
    * assert !mcpReadme.contains('agent-setup.en.md')

    * def mcpReadmeEs = karate.readAsString(mcpRoot + '/README.es.md')
    * assert mcpReadmeEs.contains('Español (Espejo 1:1)')
    * assert mcpReadmeEs.contains('docs/agent-setup.es.md')
    * assert !mcpReadmeEs.contains('agent-setup.en.md')

    * def agentSetupEn = karate.readAsString(repoRoot + '/docs/agent-setup.md')
    * assert agentSetupEn.contains('Agent Setup & Integration Guide — QA 11X MCP Server & Skills')
    * assert agentSetupEn.contains('agent-setup.es.md')
    * assert !agentSetupEn.contains('agent-setup.en.md')

    * def agentSetupEs = karate.readAsString(repoRoot + '/docs/agent-setup.es.md')
    * assert agentSetupEs.contains('Guía de Configuración e Integración de Agentes — Servidor MCP y Skills QA 11X')
    * assert agentSetupEs.contains('agent-setup.md')
    * assert !agentSetupEs.contains('agent-setup.en.md')

    * def repoFsRoot22 = Files.exists(Paths.get('/repo/manifest.json')) ? '/repo' : '..'
    * assert !Files.exists(Paths.get(repoFsRoot22 + '/docs/agent-setup.en.md'))

    * def archSkill = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert archSkill.contains('OUTPUT LANGUAGE & DYNAMIC MIRRORING')
    * assert archSkill.contains('QA-TEST-SYNC-01')
    * def certSkill = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-docker-certifier/SKILL.md')
    * assert certSkill.contains('OUTPUT LANGUAGE & DYNAMIC MIRRORING')
    * assert certSkill.contains('QA-TEST-SYNC-01')
    * def trivySkill = karate.readAsString(repoRoot + '/.agents/skills/docker-trivy-keydb-hardening/SKILL.md')
    * assert trivySkill.contains('OUTPUT LANGUAGE & DYNAMIC MIRRORING')
    * def graphSkill = karate.readAsString(repoRoot + '/.agents/skills/graphify-ast-navigator/SKILL.md')
    * assert graphSkill.contains('OUTPUT LANGUAGE & DYNAMIC MIRRORING')
    * def refactSkill = karate.readAsString(repoRoot + '/.agents/skills/refactoring-ui/SKILL.md')
    * assert refactSkill.contains('OUTPUT LANGUAGE & DYNAMIC MIRRORING')

  Scenario: 23. Invariante QA-HEALTH-01 (Regla Anti-Silo #9), Paridad Documental Humana 1:1 y Gobernanza Dual-Consumer
    * def secSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secSource.contains('QA-HEALTH-01')
    * assert secSource.contains('checkQaHealth01SupervisorTaskExit')
    * assert secSource.contains('checkQaHealth01ContainerHeartbeatContract')

    * def proposeSource = karate.readAsString(mcpRoot + '/src/tools/propose-evolution-pr.ts')
    * assert proposeSource.contains('inferDualConsumerTargets')
    * assert proposeSource.contains('Matriz de Impacto Dual-Consumer')
    * assert proposeSource.contains('docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert proposeSource.contains('docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')

    * def docsValidator = karate.readAsString(repoRoot + '/.agents/scripts/verify_docs_invariants.py')
    * assert docsValidator.contains('check_dual_consumer_parity')
    * assert docsValidator.contains('_check_uat_rules_parity')
    * assert docsValidator.contains('_check_auditor_rules_in_human_docs')

    * def humanPractices = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert humanPractices.contains('11 mandatory test design rules')
    * assert humanPractices.contains('QA-HEALTH-01')
    * assert humanPractices.contains('OPTIONAL_WORKERS')
    * def humanPracticesEs = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md')
    * assert humanPracticesEs.contains('11 reglas obligatorias de diseño de pruebas')

    * def humanSecurity = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert humanSecurity.contains('Traceability Map with the Static Auditor')
    * assert humanSecurity.contains('SEC-16')
    * def humanSecurityEs = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md')
    * assert humanSecurityEs.contains('Mapa de Trazabilidad con el Auditor Estático')

    * def rootSecurity = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert rootSecurity.contains('### 4.22.')
    * assert rootSecurity.contains('QA-HEALTH-01')

  Scenario: 24. Contrato v3.x — Sello .qa-11x-version, Caché TTL 24h Fail-Open, Aviso Estructurado update_available y Auto-Sync Global de Skills por SHA-256
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version

    * def versionMgrSource = karate.readAsString(mcpRoot + '/src/services/version-manager.ts')
    * assert versionMgrSource.contains('.qa-11x-version')
    * assert versionMgrSource.contains('latest-version-check.json')
    * assert versionMgrSource.contains('DEFAULT_VERSION_TTL_MS')
    * assert versionMgrSource.contains('evaluateUpdateStatus')
    * assert versionMgrSource.contains('syncGlobalSkillsInBackground')

    * def inspectSource = karate.readAsString(mcpRoot + '/src/tools/inspect-project.ts')
    * assert inspectSource.contains('update_available: updateAvailable')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains('update_available: updateAvailable')

    * def installSkillTs = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillTs.contains('writeVersionStamp')

    * def installSkillSh = karate.readAsString(repoRoot + '/scripts/install-skill.sh')
    * assert installSkillSh.contains('.qa-11x-version')

    * def cliIndexSource = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert cliIndexSource.contains('syncGlobalSkillsInBackground')

  Scenario: 25. Alineación Non-Root UID 10001 en CI / Stacks Node (pnpm-store-init) y Paridad Documental Integral
    * def ciWorkflow = karate.readAsString(repoRoot + '/.github/workflows/qa-11x-ci.yml')
    * assert ciWorkflow.contains('make lint && make build && make test-mcp && make test-example')
    * assert ciWorkflow.contains('make test-karate')
    * assert ciWorkflow.contains('make test-py && make test-meta-qa')

    * def rootMakefile25 = karate.readAsString(repoRoot + '/Makefile')
    * assert rootMakefile25.contains('-u "$$(id -u):$$(id -g)"')
    * assert rootMakefile25.contains('-e HOME=/tmp')

    * def mcpMakefile25 = karate.readAsString(mcpRoot + '/Makefile')
    * assert mcpMakefile25.contains('docker compose -f docker-compose.qa.yml run --rm -T')

    * def mcpCompose = karate.readAsString(mcpRoot + '/docker-compose.qa.yml')
    * assert mcpCompose.contains('pnpm-store-init:')
    * assert mcpCompose.contains('["chmod", "-R", "a+rwX", "/pnpm"]')
    * assert mcpCompose.contains('pnpm_config_store_dir: /pnpm/store')
    * assert mcpCompose.contains('user: "${QA_UID:-1000}:${QA_GID:-1000}"')

    * def govDoc = karate.readAsString(repoRoot + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert govDoc.contains('13 Dynamic Resources')
    * assert govDoc.contains('blueprint://database/postgres-rls-worm')
    * assert govDoc.contains('update_available')
    * def govDocEs = karate.readAsString(repoRoot + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md')
    * assert govDocEs.contains('13 Recursos Dinámicos')

    * def agentsReadme = karate.readAsString(repoRoot + '/.agents/README.md')
    * assert agentsReadme.contains('11 UAT Anti-Blindness Rules')
    * assert agentsReadme.contains('verify_docs_invariants.py')

    * def dockerTrouble = karate.readAsString(repoRoot + '/docs/docker-troubleshooting.md')
    * assert dockerTrouble.contains('ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR')
    * assert dockerTrouble.contains('uv_os_homedir returned ENOENT')

    * def installSkillSrc = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillSrc.contains('resolveSafeHomeDir(')
    * assert !installSkillSrc.contains('os.homedir()')

  Scenario: 26. Contrato v3.x — Arnés E2E Real sobre stdio (mcp-server/example/) + Clean-Room Tarball verify-v2.sh y 4 Barreras
    * match pkg.version == expectedSemver3x
    * match pkg.scripts['test:example'] == 'node example/run-example-e2e.mjs'
    * match pkg.files == ['dist/**/*', 'LICENSE', 'README.md', 'README.es.md', 'CHANGELOG.md', 'CHANGELOG.es.md']

    * def e2eRunner = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eRunner.contains('StdioClientTransport')
    * assert e2eRunner.contains('verifyAllResources')
    * assert e2eRunner.contains('staticUris.length, 11')
    * assert e2eRunner.contains('templateUris.length, 2')
    * assert e2eRunner.contains('verifyAllNineteenTools')
    * assert e2eRunner.contains('verifyCliAndBackgroundAutoSync')

    * def verifyV2Script = karate.readAsString(mcpRoot + '/example/verify-v2.sh')
    * assert verifyV2Script.contains('npm pack')
    * assert verifyV2Script.contains('toolsList.tools.length, 19')
    * assert verifyV2Script.contains('resourcesList.resources.length, 11')
    * assert verifyV2Script.contains('templatesList.resourceTemplates.length, 2')

    * def cleanroomScript = karate.readAsString(repoRoot + '/scripts/probar-mcp-example.sh')
    * assert cleanroomScript.contains('--exclude=\'./mcp-server/node_modules\'')
    * assert cleanroomScript.contains('pnpm run test:example')

    * def publisherScript = karate.readAsString(repoRoot + '/scripts/publicar-mcp.sh')
    * assert publisherScript.contains('pnpm --silent run test:example')

    * def ciWorkflow = karate.readAsString(repoRoot + '/.github/workflows/qa-11x-ci.yml')
    * assert ciWorkflow.contains('make lint && make build && make test-mcp && make test-example')

    * def lefthookCfg = karate.readAsString(repoRoot + '/lefthook.yml')
    * assert lefthookCfg.contains('mcp-example-smoke:')
    * assert lefthookCfg.contains('./scripts/probar-mcp-example.sh --in-place')
    * assert lefthookCfg.contains('mobile-appium vibe-rescue .github')

    * def hooksInstaller = karate.readAsString(repoRoot + '/instalar-hooks.sh')
    * assert hooksInstaller.contains('./scripts/probar-mcp-example.sh --in-place')
    * assert hooksInstaller.contains('mobile-appium vibe-rescue .github')

  Scenario: 27. Contrato v3.x — Saneamiento integral en limpieza.sh, clean_workspace_11x y resolveSafeHomeDir (UID Non-Root)
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version
    * def rootCleanup = karate.readAsString(repoRoot + '/scripts/limpieza.sh')
    * assert rootCleanup.contains('qa_mcp_cleanroom_')
    * assert rootCleanup.contains('qa-11x-mcp-example-e2e-')
    * assert rootCleanup.contains('qa-11x-last-failure.json')
    * assert rootCleanup.contains('allure-results')
    * assert rootCleanup.contains('.deepeval')
    * assert rootCleanup.contains('.DS_Store')
    * assert rootCleanup.contains('.pnpm-store')
    * assert rootCleanup.contains('.turbo')
    * assert rootCleanup.contains('sbom.cyclonedx.json')
    * assert rootCleanup.contains('.agents/proposals')
    * assert rootCleanup.contains('qa-11x-blueprints')
    * assert rootCleanup.contains('-user 10001')
    * def activeCleanupLines = karate.filter(rootCleanup.split('\n'), function(l){ return !l.trim().startsWith('#') }).join('\n')
    * assert !activeCleanupLines.contains('zap.yaml')

    * def cleanToolTs = karate.readAsString(mcpRoot + '/src/tools/clean-workspace.ts')
    * assert cleanToolTs.contains("'.turbo'")
    * assert cleanToolTs.contains("'allure-results'")
    * assert cleanToolTs.contains("'.deepeval'")
    * assert cleanToolTs.contains("'.DS_Store'")
    * assert cleanToolTs.contains("'.agents/proposals'")
    * assert cleanToolTs.contains("'sbom.cyclonedx.json'")
    * assert cleanToolTs.contains("'bash-scripts'")
    * assert !cleanToolTs.contains("'zap.yaml'")

  Scenario: 28. Invariante Dual-Consumer QA-CLI-TTY-01 (Regla UAT #10), Guardia Anti-Bloqueo TTY, Flag --stdio y Alias install
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version
    * def cliIndexSource = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert cliIndexSource.contains('shouldExitInteractiveTty')
    * assert cliIndexSource.contains('INTERACTIVE_TTY_NOTICE')
    * assert cliIndexSource.contains("arg1 === '--stdio'")
    * assert cliIndexSource.contains('runCli(args')
    * def cliRouterSource = karate.readAsString(mcpRoot + '/src/cli.ts')
    * assert cliRouterSource.contains("'install-skill': CMD_INSTALL_SKILL")
    * assert cliRouterSource.contains('install: CMD_INSTALL_SKILL')
    * assert cliIndexSource.contains('process.stdin.isTTY')

    * def secAuditorSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secAuditorSource.contains('QA-CLI-TTY-01')
    * assert secAuditorSource.contains('checkQaCliTty01InteractiveHangGuard')
    * assert secAuditorSource.contains('QA-DOCKER-TTY-01')
    * assert secAuditorSource.contains('checkQaDockerTty01NonInteractiveAndReadOnly')
    * assert secAuditorSource.contains('SEC-CI-ACTION-REF')
    * assert secAuditorSource.contains('checkSecCiActionRef')
    * assert secAuditorSource.contains('UI-11X-03')
    * assert secAuditorSource.contains('checkUi11x03FaviconPwaAndEdgeHeaders')
    * assert secAuditorSource.contains('QA-CI-ESCAPE-01')
    * assert secAuditorSource.contains('checkQaCiEscape01WorkflowExpansion')
    * assert secAuditorSource.contains('QA-MAKE-CURDIR-01')
    * assert secAuditorSource.contains('checkQaMakeCurdir01SubMakefile')
    * assert secAuditorSource.contains('QA-CONTRACT-SDK-01')
    * assert secAuditorSource.contains('checkQaContractSdk01RealTransport')
    * assert secAuditorSource.contains('QA-DOCKER-LOCK-01')
    * assert secAuditorSource.contains('checkQaDockerLock01LockfileAndSmoke')
    * assert secAuditorSource.contains('extractComposeHealthcheckText')

    * def certifySource = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifySource.contains('isDeploymentEnvTemplate')

    * def e2eRunner = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eRunner.contains('Interactive Terminal Detected (TTY)')

    * def mcpReadme = karate.readAsString(mcpRoot + '/README.md')
    * assert mcpReadme.contains('install-skill --init-agents --include-scripts --reconcile')
    * assert mcpReadme.contains('--stdio')
    * assert mcpReadme.contains('QA-CLI-TTY-01')

    * def humanPractices = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert humanPractices.contains('QA-CLI-TTY-01')
    * assert humanPractices.contains('QA-DOCKER-TTY-01')
    * assert humanPractices.contains('UI-11X-03')
    * assert humanPractices.contains('QA-CI-ESCAPE-01')
    * assert humanPractices.contains('QA-MAKE-CURDIR-01')
    * assert humanPractices.contains('QA-CONTRACT-SDK-01')
    * assert humanPractices.contains('QA-DOCKER-LOCK-01')

    * def humanSecurity = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert humanSecurity.contains('QA-CLI-TTY-01')
    * assert humanSecurity.contains('QA-DOCKER-TTY-01')
    * assert humanSecurity.contains('SEC-CI-ACTION-REF')
    * assert humanSecurity.contains('UI-11X-03')
    * assert humanSecurity.contains('QA-CI-ESCAPE-01')
    * assert humanSecurity.contains('QA-MAKE-CURDIR-01')
    * assert humanSecurity.contains('QA-CONTRACT-SDK-01')
    * assert humanSecurity.contains('QA-DOCKER-LOCK-01')

    * def rootSecurity = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert rootSecurity.contains('### 4.23.')
    * assert rootSecurity.contains('QA-CLI-TTY-01')
    * assert rootSecurity.contains('### 4.24.')
    * assert rootSecurity.contains('SEC-CI-ACTION-REF')
    * assert rootSecurity.contains('### 4.25.')
    * assert rootSecurity.contains('QA-DOCKER-TTY-01')
    * assert rootSecurity.contains('### 4.26.')
    * assert rootSecurity.contains('UI-11X-03')
    * assert rootSecurity.contains('### 4.27.')
    * assert rootSecurity.contains('QA-CI-ESCAPE-01')
    * assert rootSecurity.contains('QA-MAKE-CURDIR-01')
    * assert rootSecurity.contains('### 4.28.')
    * assert rootSecurity.contains('QA-CONTRACT-SDK-01')
    * assert rootSecurity.contains('QA-DOCKER-LOCK-01')

  Scenario: 29. Cierre T5.4 — llms.txt (GEO), Catálogos Globales (QASkills, SkillsLLM, AgenticSkills), Paridad 11/19/13 y Versión SemVer 3.x
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version
    * def govPaths = karate.map(manifest.agent_governance_files, function(x){ return x.path })
    * match govPaths contains 'llms.txt'
    * match govPaths contains 'catalogs/qaskills-pack.json'
    * match govPaths contains 'catalogs/skillsllm-manifest.json'
    * match govPaths contains 'catalogs/agenticskills-submission.md'
    * def llmsTxt = karate.readAsString(repoRoot + '/llms.txt')
    * assert llmsTxt.contains(pkg.version)
    * assert llmsTxt.contains('MIT')
    * assert llmsTxt.contains('qa-11x-architect')
    * assert llmsTxt.contains('validate_calm_architecture')
    * assert llmsTxt.contains('session_flight_recorder')
    * assert llmsTxt.contains('blueprint://skills/tactical-patterns-11x')
    * string qaskillsRaw = karate.readAsString(repoRoot + '/catalogs/qaskills-pack.json')
    * json qaskills = qaskillsRaw
    * match qaskills.version == pkg.version
    * match qaskills.license == 'MIT'
    * match qaskills.skills == '#[11]'
    * string skillsllmRaw = karate.readAsString(repoRoot + '/catalogs/skillsllm-manifest.json')
    * json skillsllm = skillsllmRaw
    * match skillsllm.version == pkg.version
    * match skillsllm.license == 'MIT'
    * match skillsllm.mcp_capabilities.tools_count == 19
    * match skillsllm.mcp_capabilities.resources_count == 13
    * match skillsllm.mcp_capabilities.tools == '#[19]'
    * match skillsllm.mcp_capabilities.resources == '#[13]'
    * match skillsllm.blueprints == '#[10]'
    * match skillsllm.skills == '#[11]'
    * def agenticskills = karate.readAsString(repoRoot + '/catalogs/agenticskills-submission.md')
    * assert agenticskills.contains(pkg.version)
    * assert agenticskills.contains('qa-11x-architect')
    * assert agenticskills.contains('sync_enterprise_tms')
    * assert agenticskills.contains('blueprint://vibe-rescue/readme')

  Scenario: 30. Alineación Node 26 / pnpm 12 allowBuilds, ESLint recommended-legacy, Vitest localStorage y Karate 1.5.1 HTTP en manifest.json
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def vuePnpmWs = findEntry(manifest.stacks.vue3.files, 'vue3/pnpm-workspace.yaml.example')
    * match vuePnpmWs.merge_strategy == 'surgical_merge'
    * match vuePnpmWs.sha256 == '#regex ^[0-9a-f]{64}$'
    * def vueVitestSetup = findEntry(manifest.stacks.vue3.files, 'vue3/vitest.setup.ts.example')
    * match vueVitestSetup.merge_strategy == 'surgical_merge'
    * match vueVitestSetup.sha256 == '#regex ^[0-9a-f]{64}$'
    * def reactPnpmWs = findEntry(manifest.stacks['react-frontend'].files, 'react-frontend/pnpm-workspace.yaml.example')
    * match reactPnpmWs.merge_strategy == 'surgical_merge'
    * match reactPnpmWs.sha256 == '#regex ^[0-9a-f]{64}$'
    * def nodePnpmWs = findEntry(manifest.stacks['node-backend'].files, 'node-backend/pnpm-workspace.yaml.example')
    * match nodePnpmWs.merge_strategy == 'surgical_merge'
    * match nodePnpmWs.sha256 == '#regex ^[0-9a-f]{64}$'
    * string vuePkgRaw = karate.readAsString(repoRoot + '/vue3/package.json.example')
    * json vuePkg = vuePkgRaw
    * assert vuePkg.pnpm == null
    * match vuePkg.devDependencies['vue-tsc'] == '^2.2.12'

  Scenario: 31. Compatibilidad PHP 8.4/8.5 (sin session.sid_length + pcov.directory), exclusión vendor en Trivy IaC y fallback Docker en ephemeral-runner
    * def phpRef = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/06-stack-php.md')
    * assert !phpRef.contains('session.sid_length = 48')
    * assert !phpRef.contains('session.sid_bits_per_character = 6')
    * assert phpRef.contains('-d pcov.directory=src')
    * assert phpRef.contains('conf.d/zz-qa11x.ini')
    * string phpComposerRaw = karate.readAsString(repoRoot + '/php/composer.json.example')
    * json phpComposer = phpComposerRaw
    * assert phpComposer.scripts['qa:unit'].contains('-d pcov.directory=src')
    * assert phpComposer.scripts['qa:mutation'].contains('-d pcov.directory=src')
    * def auditarInfra = karate.readAsString(repoRoot + '/scripts/auditar-infra.sh')
    * assert auditarInfra.contains('node_modules,.git,dist,target,graphify-out,vendor,.venv')
    * def docs02 = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert docs02.contains('## 8.')
    * assert docs02.contains('conf.d/zz-qa11x.ini')
    * def runnerTs = karate.readAsString(repoRoot + '/mcp-server/src/tools/ephemeral-runner.ts')
    * assert runnerTs.contains('resolveMakefileDockerRecipes')
    * assert runnerTs.contains('resolveComposeDirectFallback')
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def composerManifest = findEntry(manifest.stacks.php.files, 'php/composer.json.example')
    * match composerManifest.sha256 == '#regex ^[0-9a-f]{64}$'
    * def auditarManifest = findEntry(manifest.common_files, 'scripts/auditar-infra.sh')
    * match auditarManifest.sha256 == '#regex ^[0-9a-f]{64}$'

  Scenario: 32. Verificar paridad Dual-Consumer QA-PLAYWRIGHT-PIN-01, fallbacks ui-e2e/make -C, exclusiones PSI y scripts PageSpeed Insights
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def secAuditor = karate.readAsString(repoRoot + '/mcp-server/src/tools/security-auditor.ts')
    * assert secAuditor.contains('QA-PLAYWRIGHT-PIN-01')
    * assert secAuditor.contains('/tmp/psi')
    * def securityDoc = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert securityDoc.contains('QA-PLAYWRIGHT-PIN-01')
    * def docs04 = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert docs04.contains('QA-PLAYWRIGHT-PIN-01')
    * def skillMd = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillMd.contains('QA-PLAYWRIGHT-PIN-01')
    * def vueMake = karate.readAsString(repoRoot + '/vue3/Makefile.example')
    * assert vueMake.contains('./node_modules/.bin/playwright')
    * assert vueMake.contains('./node_modules/.bin/lhci')
    * assert vueMake.contains('qa-psi:')
    * def reactMake = karate.readAsString(repoRoot + '/react-frontend/Makefile.example')
    * assert reactMake.contains('./node_modules/.bin/playwright')
    * assert reactMake.contains('./node_modules/.bin/lhci')
    * assert reactMake.contains('qa-psi:')
    * def psiShManifest = findEntry(manifest.common_files, 'scripts/auditar-pagespeed.sh')
    * match psiShManifest.sha256 == '#regex ^[0-9a-f]{64}$'
    * def psiPyManifest = findEntry(manifest.agent_governance_files, '.agents/scripts/audit_pagespeed_insights.py')
    * match psiPyManifest.sha256 == '#regex ^[0-9a-f]{64}$'

  Scenario: 33. Verificar paridad Dual-Consumer QA-SSR-HYDRATION-01, exclusión vendor en MCP/.trivy.yaml y endurecimiento QA-HEALTH-01 / fallback sin make
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def secAuditor = karate.readAsString(repoRoot + '/mcp-server/src/tools/security-auditor.ts')
    * assert secAuditor.contains('QA-SSR-HYDRATION-01')
    * assert secAuditor.contains('QA-STRYKER-CFG-01')
    * assert secAuditor.contains('SEC-WS-PUBSUB-01')
    * assert secAuditor.contains('extractPythonTestBlocks')
    * assert secAuditor.contains('isUncheckedSupervisorWindow')
    * def serverTs = karate.readAsString(repoRoot + '/mcp-server/src/server.ts')
    * assert serverTs.contains('22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 36 static scanner rules')
    * assert serverTs.contains('QA-SSR-HYDRATION-01')
    * assert serverTs.contains('QA-STRYKER-CFG-01')
    * assert serverTs.contains('SEC-WS-PUBSUB-01')
    * def screenplaySkill = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-screenplay-builder/SKILL.md')
    * assert screenplaySkill.contains('QA-SSR-HYDRATION-01')
    * def architectSkill = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert architectSkill.contains('QA-SSR-HYDRATION-01')
    * assert architectSkill.contains('QA-STRYKER-CFG-01')
    * assert architectSkill.contains('SEC-WS-PUBSUB-01')
    * def docs02 = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert docs02.contains('QA-SSR-HYDRATION-01')
    * assert docs02.contains('QA-STRYKER-CFG-01')
    * assert docs02.contains('SEC-WS-PUBSUB-01')
    * def docs04 = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert docs04.contains('QA-SSR-HYDRATION-01')
    * assert docs04.contains('QA-STRYKER-CFG-01')
    * assert docs04.contains('SEC-WS-PUBSUB-01')
    * def securityDoc = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert securityDoc.contains('### 4.30.')
    * assert securityDoc.contains('QA-SSR-HYDRATION-01')
    * assert securityDoc.contains('### 4.31.')
    * assert securityDoc.contains('QA-STRYKER-CFG-01')
    * assert securityDoc.contains('### 4.32.')
    * assert securityDoc.contains('SEC-WS-PUBSUB-01')
    * def trivyCfg = karate.readAsString(repoRoot + '/.trivy.yaml')
    * assert trivyCfg.contains('**/vendor')
    * assert trivyCfg.contains('**/node_modules')
    * def phpunitXml = karate.readAsString(repoRoot + '/php/phpunit.xml.example')
    * def phpunitXmlActive = phpunitXml.replace(/<!--[\s\S]*?-->/g, '')
    * assert !phpunitXmlActive.contains('<ini name="pcov.directory"')
    * assert phpunitXmlActive.contains('<directory suffix=".php">src</directory>')
    * def phpIni = karate.readAsString(repoRoot + '/php/php.ini.example')
    * assert phpIni.contains('pcov.directory = src')
    * string phpCompScen33Raw = karate.readAsString(repoRoot + '/php/composer.json.example')
    * json phpCompScen33 = phpCompScen33Raw
    * assert phpCompScen33.scripts['qa:unit'].contains('-d pcov.directory=src')
    * def runnerTs = karate.readAsString(repoRoot + '/mcp-server/src/tools/ephemeral-runner.ts')
    * assert runnerTs.contains('hasUnquotedShellSyntax')
    * assert runnerTs.contains('--remove-orphans')
    * def phpunitManifest = findEntry(manifest.stacks.php.files, 'php/phpunit.xml.example')
    * match phpunitManifest.sha256 == '#regex ^[0-9a-f]{64}$'

  Scenario: 34. Hito 21: Cobertura Diferencial Multi-Stack, persistencia efimera y bloqueo anti-evasion
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def diffCovManifest = findEntry(manifest.agent_governance_files, '.agents/scripts/verify_diff_coverage.py')
    * match diffCovManifest.sha256 == '#regex ^[0-9a-f]{64}$'
    * def makefileText = karate.readAsString(repoRoot + '/Makefile')
    * assert makefileText.contains('diff-cov:')
    * assert makefileText.contains('.agents/.cache/coverage')
    * def runnerTs = karate.readAsString(repoRoot + '/mcp-server/src/tools/ephemeral-runner.ts')
    * assert runnerTs.contains('ensureCoverageCacheDir')
    * assert runnerTs.contains('harvestCoverageReports')
    * def gitignoreText = karate.readAsString(repoRoot + '/.gitignore')
    * assert gitignoreText.contains('.agents/.cache/')
    * def limpiezaSh = karate.readAsString(repoRoot + '/scripts/limpieza.sh')
    * assert limpiezaSh.contains('.agents/.cache')
    * def pyramidRule = karate.readAsString(repoRoot + '/.agents/rules/mandatory_qa_pyramid_and_doc_sync.md')
    * assert pyramidRule.contains('QA11X-APPROVED-EXCLUSION')
    * def docs02 = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert docs02.contains('QA11X-APPROVED-EXCLUSION')
    * assert docs02.contains('verify_diff_coverage.py')

  Scenario: 35. Hito 22: Memoria determinista de hallazgos y cortacircuitos Anti-Loop BREAKER-42
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def trackerManifest = findEntry(manifest.agent_governance_files, '.agents/scripts/track_findings_state.py')
    * match trackerManifest.sha256 == '#regex ^[0-9a-f]{64}$'
    * def qaEvidenceTs = karate.readAsString(repoRoot + '/mcp-server/src/services/qa-evidence.ts')
    * assert qaEvidenceTs.contains('CERTIFY_STATE_REL_PATH')
    * assert qaEvidenceTs.contains('EXIT_BREAKER_42 = 42')
    * assert qaEvidenceTs.contains('recordQaStageFindingsState')
    * def runnerTs = karate.readAsString(repoRoot + '/mcp-server/src/tools/ephemeral-runner.ts')
    * assert runnerTs.contains('BREAKER_42')
    * assert runnerTs.contains('formatFailVerboseReport')
    * def certifySh = karate.readAsString(repoRoot + '/.agents/scripts/certify_task_completion.sh')
    * assert certifySh.contains('run_certify_findings_tracker')
    * assert certifySh.contains('track_findings_state.py')
    * def guardrailRule = karate.readAsString(repoRoot + '/.agents/rules/anti_regression_and_side_effects_guardrail.md')
    * assert guardrailRule.contains('BREAKER-42')
    * assert guardrailRule.contains('track_findings_state.py')
    * def debugSkill = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-systematic-debugging/SKILL.md')
    * assert debugSkill.contains('BREAKER-42')
    * assert debugSkill.contains('track_findings_state.py')
    * def docs05 = karate.readAsString(repoRoot + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert docs05.contains('BREAKER-42')
    * assert docs05.contains('track_findings_state.py')
    * def pkgJson = karate.readAsString(repoRoot + '/mcp-server/package.json')
    * assert pkgJson.contains('19 Tools, 13 Resources')

  Scenario: 36. Hito 23: Modo diferencial en inspect_ast_blast_radius (cero inflacion MCP) y exportador PR_VERDICT.md
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def verdictManifest = findEntry(manifest.agent_governance_files, '.agents/scripts/generate_pr_verdict.py')
    * match verdictManifest.sha256 == '#regex ^[0-9a-f]{64}$'
    * def diffBundleTs = karate.readAsString(repoRoot + '/mcp-server/src/utils/diff-bundle.ts')
    * assert diffBundleTs.contains('PRUNED_NOISE')
    * assert diffBundleTs.contains('CRITICAL_FULL')
    * assert diffBundleTs.contains('CORE_LOGIC')
    * assert diffBundleTs.contains('TESTS_SUMMARY')
    * assert diffBundleTs.contains('MISSING_KARATE_API_FEATURE')
    * assert diffBundleTs.contains('redactPiiAndSecrets')
    * def typesTs = karate.readAsString(repoRoot + '/mcp-server/src/types.ts')
    * assert typesTs.contains('changed_since_ref')
    * assert typesTs.contains('max_tokens_budget')
    * def verdictPy = karate.readAsString(repoRoot + '/.agents/scripts/generate_pr_verdict.py')
    * assert verdictPy.contains('APTO PARA MERGE')
    * assert verdictPy.contains('BLOQUEADO')
    * assert verdictPy.contains('QA11X_ATTESTATION_KEY')
    * assert verdictPy.contains('EXIT_EVIDENCE_OR_DIVERGENCE = 30')
    * def rootMakefile = karate.readAsString(repoRoot + '/Makefile')
    * assert rootMakefile.contains('pr-verdict:')
    * def docs05Verdict = karate.readAsString(repoRoot + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert docs05Verdict.contains('generate_pr_verdict.py')
    * assert docs05Verdict.contains('PR_VERDICT.md')
    * assert docs05Verdict.contains('diff-bundle.ts')
    * def pkgJson = karate.readAsString(repoRoot + '/mcp-server/package.json')
    * assert pkgJson.contains('19 Tools, 13 Resources')

  Scenario: 37. Contrato QA-11X v3.x (Hito 24) — bump_version_11x.py, Protocolo MCP en Vivo, Planificación 19_SPEC/20_SPEC y Catálogo
    * match pkg.version == expectedSemver3x
    * match manifest.blueprint_version == pkg.version
    * def govPaths37 = karate.map(manifest.agent_governance_files, function(x){ return x.path })
    * match govPaths37 contains 'AI_MASTER_PROMPT.md'
    * match govPaths37 contains '.agents/scripts/bump_version_11x.py'

    * def bumpPy = karate.readAsString(repoRoot + '/.agents/scripts/bump_version_11x.py')
    * assert bumpPy.contains('VERSION_RULES')
    * assert bumpPy.contains('EDITION_RULES')

    * def rootMakefile37 = karate.readAsString(repoRoot + '/Makefile')
    * assert rootMakefile37.contains('version-check:')

    * def spec19En = karate.readAsString(repoRoot + '/docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md')
    * assert spec19En.contains('19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md')
    * assert spec19En.contains('QA-11X')
    * def spec19Es = karate.readAsString(repoRoot + '/docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md')
    * assert spec19Es.contains('19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md')
    * assert spec19Es.contains('IMPLEMENTADO Y CERTIFICADO')

    * def spec20En = karate.readAsString(repoRoot + '/docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md')
    * assert spec20En.contains('20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md')
    * assert spec20En.contains('base-mobile-appium')
    * def spec20Es = karate.readAsString(repoRoot + '/docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md')
    * assert spec20Es.contains('20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md')
    * assert spec20Es.contains('base-mobile-appium')
    * assert spec20Es.contains('IMPLEMENTADO Y CERTIFICADO')

    * def liveTest = karate.readAsString(mcpRoot + '/tests/live-mcp-protocol.test.ts')
    * assert liveTest.contains('StdioClientTransport')
    * assert liveTest.contains('InMemoryTransport')
    * assert liveTest.contains('tms-sync')

    * string qaskillsRaw37 = karate.readAsString(repoRoot + '/catalogs/qaskills-pack.json')
    * json qaskills37 = qaskillsRaw37
    * match qaskills37.standard_edition == expectedEditionRegex
    * string skillsllmRaw37 = karate.readAsString(repoRoot + '/catalogs/skillsllm-manifest.json')
    * json skillsllm37 = skillsllmRaw37
    * match skillsllm37.standard_edition == expectedEdition
    * string calmRaw37 = karate.readAsString(repoRoot + '/architecture/qa-11x.calm.json')
    * json calm37 = calmRaw37
    * match calm37.metadata[0]['qa-11x'].standard == expectedEdition

  Scenario: 38. Hito 25 — Matriz 15x12, base-mobile-appium:26 (Spec 20) y Arquitectura Bilingüe EN+ES con ?lang=es|en (Spec 19)
    * def rootReadmeEn38 = karate.readAsString(repoRoot + '/README.md')
    * assert rootReadmeEn38.contains('Testing Tools Matrix')
    * assert rootReadmeEn38.contains('sinfallas/base-mobile-appium')
    * def rootReadmeEs38 = karate.readAsString(repoRoot + '/README.es.md')
    * assert rootReadmeEs38.contains('Matriz de Herramientas de Pruebas')
    * assert rootReadmeEs38.contains('sinfallas/base-mobile-appium')

    * def mobileCompose38 = karate.readAsString(repoRoot + '/mobile-appium/docker-compose.qa.yml')
    * assert mobileCompose38.contains('sinfallas/base-mobile-appium:26')
    * assert mobileCompose38.contains('--allow-insecure=')
    * assert !mobileCompose38.contains('--relaxed-security')
    * def auditBaseWf38 = karate.readAsString(repoRoot + '/.github/workflows/audit-base-images.yml')
    * assert auditBaseWf38.contains('sinfallas/base-mobile-appium:26')

    * match manifest.stacks.fastapi.readme == 'fastapi/README.md'
    * match manifest.stacks.fastapi.readme_es == 'fastapi/README.es.md'
    * match manifest.stacks.fastapi.readme_sha256 == '#regex ^[0-9a-f]{64}$'
    * match manifest.stacks.fastapi.readme_es_sha256 == '#regex ^[0-9a-f]{64}$'
    * def govPaths38 = karate.map(manifest.agent_governance_files, function(x){ return x.path })
    * match govPaths38 contains 'AI_MASTER_PROMPT.es.md'
    * match govPaths38 contains 'SECURITY.es.md'

    * def resourceLangTs = karate.readAsString(mcpRoot + '/src/resources/resourceLang.ts')
    * assert resourceLangTs.contains('parseResourceUriAndLang')
    * assert resourceLangTs.contains('runWithResourceLang')
    * def serverTs38 = karate.readAsString(mcpRoot + '/src/server.ts')
    * assert serverTs38.contains('wrapReadResourceDispatcher')

  Scenario: 39. Hito 26 — Flight Recorder Atómico (checkpoint_ctl.py + session_flight_recorder) y Micro-Skill Táctica JIT (tactical-patterns-11x + candados linter)
    * def findEntry = function(list, pathStr) { return karate.filter(list, function(x) { return x.path == pathStr })[0] }
    * def checkpointSchemaEntry = findEntry(manifest.agent_governance_files, '.agents/schemas/session_checkpoint.schema.json')
    * match checkpointSchemaEntry.sha256 == '#regex ^[0-9a-f]{64}$'
    * def checkpointCtlEntry = findEntry(manifest.agent_governance_files, '.agents/scripts/checkpoint_ctl.py')
    * match checkpointCtlEntry.sha256 == '#regex ^[0-9a-f]{64}$'
    * def tacticalSkillEntry = findEntry(manifest.agent_governance_files, '.agents/skills/tactical-patterns-11x/SKILL.md')
    * match tacticalSkillEntry.sha256 == '#regex ^[0-9a-f]{64}$'

    * def recorderTs = karate.readAsString(mcpRoot + '/src/tools/sessionFlightRecorder.ts')
    * assert recorderTs.contains('session_flight_recorder')
    * assert recorderTs.contains('recordStageCmdCheckpoint')
    * assert recorderTs.contains('AUTO-GENERATED BY checkpoint_ctl.py')

    * def tacticalResTs = karate.readAsString(mcpRoot + '/src/resources/tacticalPatternsSkill.ts')
    * assert tacticalResTs.contains('blueprint://skills/tactical-patterns-11x')

    * def diagTs = karate.readAsString(mcpRoot + '/src/utils/diagnosticFormatter.ts')
    * assert diagTs.contains('TACTICAL_PATTERNS_DIRECTIVE_11X')
    * assert diagTs.contains('[DIRECTIVE-11X]')

    * def eslintMcp = karate.readAsString(mcpRoot + '/eslint.config.mjs')
    * assert eslintMcp.contains('max-params')
    * assert eslintMcp.contains('max-depth')
    * assert eslintMcp.contains('sonarjs')
    * assert eslintMcp.contains('eslint-plugin-security')
    * assert eslintMcp.contains('@typescript-eslint/no-floating-promises')
    * def tsconfigTypecheckMcp = karate.readAsString(mcpRoot + '/tsconfig.typecheck.json')
    * assert tsconfigTypecheckMcp.contains('tsconfig.json')
    * def pyExample = karate.readAsString(repoRoot + '/python/pyproject.toml.example')
    * assert pyExample.contains('PLR0913')
    * def activeRule = karate.readAsString(repoRoot + '/.agents/rules/active_task_and_planning_resilience.md')
    * assert activeRule.contains('session_flight_recorder')
    * assert pkg.description.includes('19 Tools, 13 Resources')

  Scenario: 40. Contratos Fase 1 (F1.6-F1.9) — Fail-Closed JSON, Cero Falsos Positivos SKIPPED, Modo strict en certify_11x_gate y parseTestsDetected
    * def typesTs40 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesTs40.contains('GateCheckStatus')
    * assert typesTs40.contains('check_statuses')
    * assert typesTs40.contains('skipped_checks')
    * assert typesTs40.contains('tests_detected')
    * assert typesTs40.contains('strict:')

    * def certifyTs40 = karate.readAsString(mcpRoot + '/src/tools/certify-gate.ts')
    * assert certifyTs40.contains('INVALID_JSON:')
    * assert certifyTs40.contains('STRICT_SKIPPED_CHECK:')
    * assert certifyTs40.contains('inspectSingleJsonFile')
    * assert certifyTs40.contains('GATE_STATUS_SKIPPED')

    * def qaEvidenceTs40 = karate.readAsString(mcpRoot + '/src/services/qa-evidence.ts')
    * assert qaEvidenceTs40.contains("status: 'SKIPPED'")

    * def outputParsersTs40 = karate.readAsString(mcpRoot + '/src/parsers/output-parsers.ts')
    * assert outputParsersTs40.contains('parseTestsDetected')
    * assert outputParsersTs40.contains('evaluateUnitStageStatus')
    * assert outputParsersTs40.contains('TEST_STAGE_NAMES')

  Scenario: 41. Contratos Fase 2 (F2.3-F2.7) — allow_unmerged_examples, dry_run=true por defecto, SEC-PATH-01 resolveSafeProjectPath y TTY/Auto-Sync <5s
    * def typesTs41 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesTs41.contains('allow_unmerged_examples:')

    * def serverTs41 = karate.readAsString(mcpRoot + '/src/server.ts')
    * assert serverTs41.contains('allowUnmergedExamples: args.allow_unmerged_examples')
    * assert serverTs41.contains('args.dry_run')
    * assert serverTs41.contains('validateV2ToolWorkspaceArgs')
    * assert serverTs41.contains('resolveSafeProjectPath')

    * def bootstrapTs41 = karate.readAsString(mcpRoot + '/src/tools/bootstrap-merge.ts')
    * assert bootstrapTs41.contains('dryRun = true')
    * assert bootstrapTs41.contains('resolveSafeProjectPath')

    * def reconcileTs41 = karate.readAsString(mcpRoot + '/src/cli/reconcile-agents.ts')
    * assert reconcileTs41.contains('options.dryRun ?? true')
    * assert reconcileTs41.contains('resolveSafeProjectPath')

    * def indexTs41 = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert indexTs41.contains('runAutoSyncSafely')
    * assert indexTs41.contains('runBoundedInteractiveAutoSync')
    * assert indexTs41.contains('INTERACTIVE_TTY_SYNC_TIMEOUT_MS')

    * def verMgrTs41 = karate.readAsString(mcpRoot + '/src/services/version-manager.ts')
    * assert verMgrTs41.contains('executeGlobalSkillsSync')
    * assert verMgrTs41.contains('process.stderr.write')

    * def validatorTs41 = karate.readAsString(mcpRoot + '/src/security/workspacePathValidator.ts')
    * assert validatorTs41.contains('QA11X_WORKSPACE_ROOTS')
    * assert validatorTs41.contains('SEC-PATH-01')

    * def e2eMjs41 = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eMjs41.contains('QA11X_WORKSPACE_ROOTS')

    * def readmeEn41 = karate.readAsString(mcpRoot + '/README.md')
    * assert readmeEn41.contains('allow_unmerged_examples')
    * assert readmeEn41.contains('QA11X_WORKSPACE_ROOTS')
    * assert readmeEn41.contains('dry_run` defaults to `true')

    * def readmeEs41 = karate.readAsString(mcpRoot + '/README.es.md')
    * assert readmeEs41.contains('allow_unmerged_examples')
    * assert readmeEs41.contains('QA11X_WORKSPACE_ROOTS')
    * assert readmeEs41.contains('dry_run` es `true` por defecto')

  Scenario: 42. Contratos Fase 4 (F4.5-F4.7) — Manifiesto 10 Stacks, Descripciones en Ingles, SECURITY.md y Clarificacion 10 Stacks / 12 Entornos
    * def expectedStacks42 = ['python', 'fastapi', 'node-backend', 'vue3', 'react-frontend', 'bash-scripts', 'php', 'mobile-appium', 'ai-evals', 'vibe-rescue']
    * def stackKeys42 = karate.keysOf(manifest.stacks)
    * match stackKeys42 == '#[10]'
    * match stackKeys42 contains only expectedStacks42

    * def isValidStack42 =
      """
      function(name) {
        var s = manifest.stacks[name];
        if (!s || !s.description || s.description.length < 10) return false;
        if (/[áéíóúñÁÉÍÓÚÑ]/.test(s.description)) return false;
        if (/(^|\s)(y|en|con|para|de|sin|sobre)(\s|$)/i.test(s.description)) return false;
        if (!s.files || s.files.length < 1) return false;
        var shaRe = /^[0-9a-f]{64}$/;
        if (!shaRe.test(s.readme_sha256 || '') || !shaRe.test(s.readme_es_sha256 || '')) return false;
        for (var i = 0; i < s.files.length; i++) {
          var f = s.files[i];
          if (!f || !shaRe.test(f.sha256 || '') || !(f.size_bytes >= 0)) return false;
        }
        return true;
      }
      """
    * def validStacks42 = karate.filter(expectedStacks42, isValidStack42)
    * match validStacks42 == '#[10]'

    * def govPaths42 = karate.map(manifest.agent_governance_files, function(x) { return x.path })
    * match govPaths42 contains 'SECURITY.md'
    * match govPaths42 contains 'SECURITY.es.md'

    * def typesTs42 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesTs42.includes("'ai-evals'") || typesTs42.includes('"ai-evals"')
    * assert typesTs42.includes("'mobile-appium'") || typesTs42.includes('"mobile-appium"')
    * assert typesTs42.includes("'vibe-rescue'") || typesTs42.includes('"vibe-rescue"')

    * def govDoc42 = karate.readAsString(repoRoot + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert govDoc42.includes('12 matrix environments')
    * assert govDoc42.includes('mobile-appium')
    * assert govDoc42.includes('ai-evals')
    * assert govDoc42.includes('vibe-rescue')

    * def testingDoc42 = karate.readAsString(repoRoot + '/TESTING.md')
    * assert testingDoc42.includes('10 hydratable stacks')
    * assert testingDoc42.includes('12 matrix environments')

    * def rootReadme42 = karate.readAsString(repoRoot + '/README.md')
    * assert rootReadme42.includes('10 hydratable stacks')
    * assert rootReadme42.includes('12 matrix environments')

  Scenario: 43. Contratos Fase 5 (F5.3, F5.6, F5.12, F5.13) — Conteos Dinamicos Runtime, Standard Edition Dinamico, D3 y 15 Etapas run_ephemeral_qa
    * def indexTs43 = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert indexTs43.contains('getRegisteredSurfaceCounts')
    * assert indexTs43.contains('createConfiguredMcpServer')
    * assert indexTs43.contains('getCliHelpText')
    * assert indexTs43.contains('getInteractiveTtyNotice')
    * assert !indexTs43.contains('(19 tools, 13 resources)')

    * def serverTs43 = karate.readAsString(mcpRoot + '/src/server.ts')
    * assert serverTs43.contains('getRegisteredServerSurface')
    * assert serverTs43.contains('22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 36 static scanner rules')

    * def agentCardTs43 = karate.readAsString(mcpRoot + '/src/a2a/agentCard.ts')
    * assert agentCardTs43.contains('deriveStandardVersion')
    * assert !agentCardTs43.contains("DEFAULT_STANDARD_VERSION = 'QA-11X v3.0'")

    * def mcpReadmeEn43 = karate.readAsString(mcpRoot + '/README.md')
    * assert mcpReadmeEn43.contains('22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 36 static scanner rules')
    * assert mcpReadmeEn43.contains('16 QA stages')
    * assert mcpReadmeEn43.contains('mutation`, `dast`, `e2e`, `perf`, `chaos`, `profile`, `all`')
    * assert mcpReadmeEn43.contains('`mobile-appium`, `ai-evals`, and `vibe-rescue`')

    * def mcpReadmeEs43 = karate.readAsString(mcpRoot + '/README.es.md')
    * assert mcpReadmeEs43.contains('22 controles de referencia DISA ASD STIG V6R5 / OWASP v4.2 + 36 reglas del escáner estático')
    * assert mcpReadmeEs43.contains('16 etapas QA')
    * assert mcpReadmeEs43.contains('mutation`, `dast`, `e2e`, `perf`, `chaos`, `profile`, `all`')
    * assert mcpReadmeEs43.contains('`mobile-appium`, `ai-evals` y `vibe-rescue`')

  Scenario: 44. Contratos Fase 6 (F6.4, F6.6, F6.7, F6.16, F6.20, F6.25) — Purga agent-setup.en.md, Paridad Spec 19 ES->ES, docs/05_ARQUITECTURA y Metadatos CALM
    * def repoFsRoot44 = Files.exists(Paths.get('/repo/manifest.json')) ? '/repo' : '..'
    * assert !Files.exists(Paths.get(repoFsRoot44 + '/docs/agent-setup.en.md'))
    * assert !Files.exists(Paths.get(repoFsRoot44 + '/docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md'))
    * assert !Files.exists(Paths.get(repoFsRoot44 + '/docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md'))
    * assert Files.exists(Paths.get(repoFsRoot44 + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md'))
    * assert Files.exists(Paths.get(repoFsRoot44 + '/docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md'))

    * def readmeEn44 = karate.readAsString(repoRoot + '/README.md')
    * assert !readmeEn44.contains('QA-11X-BDD-COMPATIBILITY-ANCHORS')
    * assert !readmeEn44.contains('agent-setup.en.md')
    * def readmeEs44 = karate.readAsString(repoRoot + '/README.es.md')
    * assert !readmeEs44.contains('agent-setup.en.md')
    * def resourcesEn44 = karate.readAsString(repoRoot + '/RESOURCES.md')
    * assert !resourcesEn44.contains('agent-setup.en.md')
    * def resourcesEs44 = karate.readAsString(repoRoot + '/RESOURCES.es.md')
    * assert !resourcesEs44.contains('agent-setup.en.md')
    * def llms44 = karate.readAsString(repoRoot + '/llms.txt')
    * assert !llms44.contains('agent-setup.en.md')
    * def aiIntEn44 = karate.readAsString(repoRoot + '/docs/ai-integration.md')
    * assert !aiIntEn44.contains('agent-setup.en.md')
    * def aiIntEs44 = karate.readAsString(repoRoot + '/docs/ai-integration.es.md')
    * assert !aiIntEs44.contains('agent-setup.en.md')

    * def verifyDocsPy44 = karate.readAsString(repoRoot + '/.agents/scripts/verify_docs_invariants.py')
    * assert verifyDocsPy44.contains('docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert verifyDocsPy44.contains('docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md')
    * assert verifyDocsPy44.contains('19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES')
    * assert verifyDocsPy44.contains('20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26')
    * assert verifyDocsPy44.contains('mcp-server/example/AGENTS.md')
    * assert verifyDocsPy44.contains('_check_forbidden_agent_setup_en')
    * assert verifyDocsPy44.contains('_check_es_mirror_links')
    * assert verifyDocsPy44.contains('enlace ES→EN')

    * def govPaths44 = karate.map(manifest.agent_governance_files, function(x) { return x.path })
    * match govPaths44 contains '.agents/scripts/verify_docs_invariants.py'

    * string calmRaw44 = karate.readAsString(repoRoot + '/architecture/qa-11x.calm.json')
    * json calm44 = calmRaw44
    * match calm44.controls['worm-hmac-audit-chain'].requirements[0].config['control-id'] contains 'SEC-14'
    * match calm44.controls['cli-tty-anti-hang-guard'].requirements[0].config['control-id'] contains 'QA-CLI-TTY-01'
    * match calm44.controls['git-closure-human-gate'].requirements[0].config['control-id'] == 'QA-GIT-GATE-01'
    * def calmTestTs44 = karate.readAsString(mcpRoot + '/tests/calm.test.ts')
    * assert calmTestTs44.contains("controlId: 'SEC-14'")
    * assert calmTestTs44.contains("controlId: 'QA-CLI-TTY-01'")
    * assert calmTestTs44.contains("protocol: 'TLS'")

  Scenario: 45. Contratos Fase 7 (F7.5, F7.9, F7.13, F7.14, F7.15) — Convención .example en 3 Categorías, Vite/TS, nginx-unprivileged, qa-frontend, puertos 127.0.0.1 y mobile-appium
    * def repoFsRoot45 = Files.exists(Paths.get('/repo/manifest.json')) ? '/repo' : '..'
    * def contribEn45 = karate.readAsString(repoRoot + '/CONTRIBUTING.md')
    * assert contribEn45.contains('Category 1')
    * assert contribEn45.contains('Category 2')
    * assert contribEn45.contains('Category 3')
    * assert contribEn45.contains('tsconfig.json.example')
    * assert contribEn45.contains('vite.config.ts.example')
    * assert contribEn45.contains('fastapi/tests/test_production_no_dev_cleanliness.unit.py.example')
    * def contribEs45 = karate.readAsString(repoRoot + '/CONTRIBUTING.es.md')
    * assert contribEs45.contains('Categoría 1')
    * assert contribEs45.contains('Categoría 2')
    * assert contribEs45.contains('Categoría 3')
    * assert contribEs45.contains('tsconfig.json.example')
    * assert contribEs45.contains('vite.config.ts.example')
    * assert contribEs45.contains('fastapi/tests/test_production_no_dev_cleanliness.unit.py.example')

    * def troubleEn45 = karate.readAsString(repoRoot + '/docs/docker-troubleshooting.md')
    * assert troubleEn45.contains('mobile-appium/docker-compose.qa.yml')
    * assert !troubleEn45.contains('mobile-appium/docker-compose.qa.yml.example')
    * def troubleEs45 = karate.readAsString(repoRoot + '/docs/docker-troubleshooting.es.md')
    * assert troubleEs45.contains('mobile-appium/docker-compose.qa.yml')
    * assert !troubleEs45.contains('mobile-appium/docker-compose.qa.yml.example')

    * def docs04En45 = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert docs04En45.contains('qa-frontend')
    * assert !docs04En45.contains('qa-vue3')
    * def docs04Es45 = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md')
    * assert docs04Es45.contains('qa-frontend')
    * assert !docs04Es45.contains('qa-vue3')

    * def spec20En45 = karate.readAsString(repoRoot + '/docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md')
    * assert spec20En45.contains('mobile-appium/docker-compose.qa.yml')
    * assert !spec20En45.contains('mobile-appium/docker-compose.qa.yml.example')
    * def spec20Es45 = karate.readAsString(repoRoot + '/docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md')
    * assert spec20Es45.contains('mobile-appium/docker-compose.qa.yml')
    * assert !spec20Es45.contains('mobile-appium/docker-compose.qa.yml.example')

    * assert Files.exists(Paths.get(repoFsRoot45 + '/fastapi/tests/test_production_no_dev_cleanliness.unit.py.example'))
    * assert !Files.exists(Paths.get(repoFsRoot45 + '/fastapi/test/test_production_no_dev_cleanliness.unit.py.example'))
    * assert Files.exists(Paths.get(repoFsRoot45 + '/mobile-appium/docker-compose.qa.yml'))
    * assert !Files.exists(Paths.get(repoFsRoot45 + '/mobile-appium/docker-compose.qa.yml.example'))

    * def expectedStacks45 = ['python', 'fastapi', 'node-backend', 'vue3', 'react-frontend', 'bash-scripts', 'php', 'mobile-appium', 'ai-evals', 'vibe-rescue']
    * def stackReady45 =
      """
      function(s) {
        var base = repoFsRoot45 + '/' + s;
        return Files.exists(Paths.get(base + '/docker-compose.qa.yml'))
          && !Files.exists(Paths.get(base + '/docker-compose.qa.yml.example'))
          && Files.exists(Paths.get(base + '/Makefile.example'))
          && Files.exists(Paths.get(base + '/gitignore.example'))
          && Files.exists(Paths.get(base + '/limpieza.sh'));
      }
      """
    * def readyStacks45 = karate.filter(expectedStacks45, stackReady45)
    * match readyStacks45 == '#[10]'

    * def vueCompose45 = karate.readAsString(repoRoot + '/vue3/docker-compose.qa.yml')
    * assert vueCompose45.contains('nginxinc/nginx-unprivileged')
    * assert vueCompose45.contains('qa-frontend')
    * assert !vueCompose45.contains('qa-vue3')
    * assert vueCompose45.contains(':8080')
    * assert Files.exists(Paths.get(repoFsRoot45 + '/vue3/tsconfig.json.example'))
    * assert Files.exists(Paths.get(repoFsRoot45 + '/vue3/vite.config.ts.example'))

    * def reactCompose45 = karate.readAsString(repoRoot + '/react-frontend/docker-compose.qa.yml')
    * assert reactCompose45.contains('nginxinc/nginx-unprivileged')
    * assert reactCompose45.contains('qa-frontend')
    * assert reactCompose45.contains(':8080')
    * assert Files.exists(Paths.get(repoFsRoot45 + '/react-frontend/tsconfig.json.example'))
    * assert Files.exists(Paths.get(repoFsRoot45 + '/react-frontend/vite.config.ts.example'))

  Scenario: 46. Contratos Fase 8 (F8.13, F8.17, F8.18, F8.19, F8.20, F8.21) — Limpieza legacy, LICENSE/engines/files MCP, .example secretos, pre-pack dist y tarball CLI
    * def repoFsRoot46 = Files.exists(Paths.get('/repo/manifest.json')) ? '/repo' : '..'
    * assert !Files.exists(Paths.get(repoFsRoot46 + '/commitlint.config.js'))
    * assert Files.exists(Paths.get(repoFsRoot46 + '/pytest.ini'))
    * def pytestIni46 = karate.readAsString(repoRoot + '/pytest.ini')
    * assert pytestIni46.contains('addopts = --import-mode=importlib')
    * assert pytestIni46.contains('cache_dir = /tmp/pytest-cache')

    * def rootLicense46 = karate.readAsString(repoRoot + '/LICENSE')
    * def mcpLicense46 = karate.readAsString(mcpRoot + '/LICENSE')
    * match mcpLicense46 == rootLicense46

    * match pkg.dependencies['@modelcontextprotocol/sdk'] == '^1.32.2'
    * match pkg.engines.node == '>=24.0.0'
    * match pkg.packageManager == 'pnpm@12.18.0'
    * match pkg.files == ['dist/**/*', 'LICENSE', 'README.md', 'README.es.md', 'CHANGELOG.md', 'CHANGELOG.es.md']

    * def syncGov46 = karate.readAsString(repoRoot + '/.agents/scripts/sync_governance.py')
    * assert !syncGov46.contains('commitlint.config.js')
    * def blastSel46 = karate.readAsString(repoRoot + '/.agents/scripts/select_tests_by_blast_radius.py')
    * assert !blastSel46.contains('commitlint.config.js')
    * def certify46 = karate.readAsString(repoRoot + '/.agents/scripts/certify_task_completion.sh')
    * assert !certify46.contains('commitlint')

    * def verificarSecretos46 = karate.readAsString(repoRoot + '/scripts/verificar-secretos.sh')
    * assert !verificarSecretos46.contains('svg|pyc|example')
    * assert verificarSecretos46.contains('EXAMPLE_ONLY')
    * assert verificarSecretos46.contains('CHANGE[_-]?ME')
    * assert verificarSecretos46.contains('00000000')
    * assert verificarSecretos46.contains('tu_clave_aqui')

    * def probarMcp46 = karate.readAsString(repoRoot + '/scripts/probar-mcp-example.sh')
    * assert probarMcp46.contains('package/LICENSE')
    * assert probarMcp46.contains('package/README.es.md')
    * assert probarMcp46.contains('package/CHANGELOG.es.md')
    * assert probarMcp46.contains('init-agents')
    * assert probarMcp46.contains('--offline')

    * def publicarMcp46 = karate.readAsString(repoRoot + '/scripts/publicar-mcp.sh')
    * assert publicarMcp46.contains('ensure_fresh_dist_before_pack')

    * def liveMcpTest46 = karate.readAsString(mcpRoot + '/tests/live-mcp-protocol.test.ts')
    * assert liveMcpTest46.contains('getLatestTsMtimeMs')
    * assert liveMcpTest46.contains('mtimeMs')

  Scenario: 47. Contratos Fase 9 (F9.1, F9.9) — Separación resources/list (11) vs resources/templates/list (2), ESLint 9 Flat Config, tsconfig.typecheck y Vite 6 / vue-tsc
    * def repoFsRoot47 = Files.exists(Paths.get('/repo/manifest.json')) ? '/repo' : '..'
    * def mcpFsRoot47 = repoFsRoot47 + '/mcp-server'
    * assert !Files.exists(Paths.get(mcpFsRoot47 + '/.eslintrc.json'))
    * assert Files.exists(Paths.get(mcpFsRoot47 + '/eslint.config.mjs'))
    * assert Files.exists(Paths.get(mcpFsRoot47 + '/tsconfig.typecheck.json'))
    * assert Files.exists(Paths.get(repoFsRoot47 + '/vue3/eslint.config.mjs.example'))
    * assert !Files.exists(Paths.get(repoFsRoot47 + '/vue3/.eslintrc.json.example'))
    * assert Files.exists(Paths.get(repoFsRoot47 + '/react-frontend/eslint.config.mjs.example'))
    * assert !Files.exists(Paths.get(repoFsRoot47 + '/react-frontend/.eslintrc.json.example'))
    * assert Files.exists(Paths.get(repoFsRoot47 + '/node-backend/eslint.config.mjs.example'))
    * assert !Files.exists(Paths.get(repoFsRoot47 + '/node-backend/.eslintrc.json.example'))

    * def e2eMjs47 = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eMjs47.contains('staticUris.length, 11')
    * assert e2eMjs47.contains('templateUris.length, 2')
    * assert e2eMjs47.contains('blueprint://core/philosophy?lang=es')

    * def verifyV247 = karate.readAsString(mcpRoot + '/example/verify-v2.sh')
    * assert verifyV247.contains('resourcesList.resources.length, 11')
    * assert verifyV247.contains('templatesList.resourceTemplates.length, 2')

    * def nodeVueRef47 = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/04-stack-node-vue-react.md')
    * assert nodeVueRef47.contains('eslint.config.mjs')
    * assert nodeVueRef47.contains('no-floating-promises')
    * assert nodeVueRef47.contains('^2.2.12')
    * assert nodeVueRef47.contains('SEC-09')

    * def docs02En47 = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert docs02En47.contains('eslint.config.mjs')
    * assert docs02En47.contains('SEC-09')
    * def docs02Es47 = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md')
    * assert docs02Es47.contains('eslint.config.mjs')
    * assert docs02Es47.contains('SEC-09')

    * def aiIntEn47 = karate.readAsString(repoRoot + '/docs/ai-integration.md')
    * assert aiIntEn47.contains('11 static')
    * assert aiIntEn47.contains('eslint.config.mjs')
    * assert aiIntEn47.contains('22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls')
    * def aiIntEs47 = karate.readAsString(repoRoot + '/docs/ai-integration.es.md')
    * assert aiIntEs47.contains('11 estáticos')
    * assert aiIntEs47.contains('eslint.config.mjs')
    * assert aiIntEs47.contains('22 controles de referencia DISA ASD STIG V6R5 y OWASP Developer Guide v4.2')

  Scenario: 48. Regresión BATS UID sin /etc/passwd (_USER) y filtrado Pass-Quiet de kcov en CI
    * def repoRoot48 = Files.exists(Paths.get('/repo/manifest.json')) ? 'file:/repo' : 'file:..'
    * def bashCompose48 = karate.readAsString(repoRoot48 + '/bash-scripts/docker-compose.qa.yml')
    * assert bashCompose48.contains('_USER: qa')
    * def mockBats48 = karate.readAsString(repoRoot48 + '/bash-scripts/test/ejemplo_mock.bats')
    * assert mockBats48.contains('export _USER=')
    * def rootMake48 = karate.readAsString(repoRoot48 + '/Makefile')
    * assert rootMake48.contains('-e _USER=qa')
    * assert rootMake48.contains('/tmp/kcov-stderr.log') || (rootMake48.contains('p.stderr.splitlines()[-40:]') && rootMake48.contains('not ok '))
    * def bashMake48 = karate.readAsString(repoRoot48 + '/bash-scripts/Makefile.example')
    * assert bashMake48.contains('/tmp/kcov-stderr.log')
    * def lefthook48 = karate.readAsString(repoRoot48 + '/lefthook.yml')
    * assert lefthook48.contains('-e _USER=qa')
    * def hooks48 = karate.readAsString(repoRoot48 + '/instalar-hooks.sh')
    * assert hooks48.contains('-e _USER=qa')
    * def probar48 = karate.readAsString(repoRoot48 + '/scripts/probar-mcp-example.sh')
    * assert probar48.contains('--prefer-offline --trust-lockfile')

  Scenario: 49. Contratos Fase 1 — Aislamiento TaskStateGuard, Empaquetado tsconfig.build, Seguridad Prompt/Merge y Quickstart @v3
    * match pkg.main == './dist/index.js'
    * match pkg.types == './dist/index.d.ts'
    * match pkg.exports['./agent-card'].default == './dist/a2a/agentCard.js'
    * match pkg.scripts.build == 'rm -rf dist && tsc -p tsconfig.build.json'

    * def tsconfigBuild = read(mcpRoot + '/tsconfig.build.json')
    * match tsconfigBuild.compilerOptions.sourceMap == false
    * match tsconfigBuild.compilerOptions.declarationMap == false

    * def guardSrc49 = karate.readAsString(mcpRoot + '/src/utils/taskStateGuard.ts')
    * assert guardSrc49.contains('MAX_STUCK_TASKS = 32')

    * def indexSrc49 = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert indexSrc49.contains('resolveToolExecutionOptions')
    * assert indexSrc49.contains('heavy_transfer')

    * def quickstartSrc49 = karate.readAsString(mcpRoot + '/src/cli/quickstart.ts')
    * assert quickstartSrc49.contains('qa-11x-pr-check@v3')
    * assert quickstartSrc49.contains('actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0')

    * def typesSrc49 = karate.readAsString(mcpRoot + '/src/types.ts')
    * assert typesSrc49.contains('create_backup')
    * assert typesSrc49.contains('include_examples')

    * def qaEvSrc49 = karate.readAsString(mcpRoot + '/src/services/qa-evidence.ts')
    * assert qaEvSrc49.contains('streaks')
    * assert qaEvSrc49.contains('oscillations')

  Scenario: 50. Contratos Fase 2 — 7 Subcomandos CLI (doctor, upgrade, certify, audit, blast-radius, mcp-config, completion), SARIF 2.1.0 y Paridad 19 Tools / 13 Resources
    * def cliSrc50 = karate.readAsString(mcpRoot + '/src/cli.ts')
    * assert cliSrc50.contains("'doctor'")
    * assert cliSrc50.contains("'upgrade'")
    * assert cliSrc50.contains("'certify'")
    * assert cliSrc50.contains("'audit'")
    * assert cliSrc50.contains("'blast-radius'")
    * assert cliSrc50.contains("'mcp-config'")
    * assert cliSrc50.contains("'completion'")
    * assert cliSrc50.contains('status: CMD_DOCTOR')
    * assert cliSrc50.contains("'cache-clean': CMD_UPGRADE")
    * assert cliSrc50.contains('LAZY_CLI_HANDLERS')

    * def indexSrc50 = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert indexSrc50.contains('doctor')
    * assert indexSrc50.contains('upgrade')
    * assert indexSrc50.contains('certify')
    * assert indexSrc50.contains('audit')
    * assert indexSrc50.contains('blast-radius')
    * assert indexSrc50.contains('mcp-config')
    * assert indexSrc50.contains('completion')
    * assert indexSrc50.contains('--verbose')
    * assert indexSrc50.contains('getDeclaredSurfaceCounts')

    * def sarifSrc50 = karate.readAsString(mcpRoot + '/src/utils/sarifFormatter.ts')
    * assert sarifSrc50.contains("SARIF_VERSION = '2.1.0'")
    * assert sarifSrc50.contains('https://json.schemastore.org/sarif-2.1.0.json')

    * def verifyV250 = karate.readAsString(mcpRoot + '/example/verify-v2.sh')
    * assert verifyV250.contains('doctor "${PROJ_DIR}" --offline --json')
    * assert verifyV250.contains('upgrade --dry-run --json')
    * assert verifyV250.contains('audit "${PROJ_DIR}" --mode security --fail-on none --sarif')
    * assert verifyV250.contains('mcp-config --client antigravity --pin-version')
    * assert verifyV250.contains('completion fish')
    * assert verifyV250.contains('toolsList.tools.length, 19')
    * assert verifyV250.contains('resourcesList.resources.length + templatesList.resourceTemplates.length, 13')

  Scenario: 51. Contratos W1B — Rutas IDE Compartidas (ideConfigPaths), CLI Unificado 12 Subcomandos, Example Hardening y Verificador Clean-Room
    * def idePathsSrc51 = karate.readAsString(mcpRoot + '/src/utils/ideConfigPaths.ts')
    * assert idePathsSrc51.contains('.gemini')
    * assert idePathsSrc51.contains('antigravity')
    * assert idePathsSrc51.contains('claude_desktop_config.json')
    * assert idePathsSrc51.contains('.hermes')

    * def mcpConfigSrc51 = karate.readAsString(mcpRoot + '/src/cli/mcp-config.ts')
    * assert mcpConfigSrc51.contains('ideConfigPaths.js')
    * assert mcpConfigSrc51.contains('prepareClientInstall')
    * assert mcpConfigSrc51.contains('TOML_SECTION_HEADER_RE')

    * def doctorSrc51 = karate.readAsString(mcpRoot + '/src/cli/doctor.ts')
    * assert doctorSrc51.contains('getDoctorIdeMcpTargets')

    * def inspectSrc51 = karate.readAsString(mcpRoot + '/src/tools/inspect-project.ts')
    * assert inspectSrc51.contains('getBrowserMcpCandidatePaths')

    * def blastCliSrc51 = karate.readAsString(mcpRoot + '/src/cli/blast-radius-cli.ts')
    * assert blastCliSrc51.contains("parsed.symbol ?? ''")

    * def qsSrc51 = karate.readAsString(mcpRoot + '/src/cli/quickstart.ts')
    * assert qsSrc51.contains('resolveSafeProjectPath')
    * assert qsSrc51.contains('audit --mode vibe')

    * def certifyCliSrc51 = karate.readAsString(mcpRoot + '/src/cli/certify-cli.ts')
    * assert certifyCliSrc51.contains('requireLintEvidence: false')

    * def upgradeCliSrc51 = karate.readAsString(mcpRoot + '/src/cli/upgrade.ts')
    * assert upgradeCliSrc51.contains('FLAG_RECONCILE')

    * def completionSrc51 = karate.readAsString(mcpRoot + '/src/cli/completion.ts')
    * assert completionSrc51.contains('shift words')
    * assert completionSrc51.contains('(( CURRENT-- ))')

    * def cliSrc51 = karate.readAsString(mcpRoot + '/src/cli.ts')
    * assert cliSrc51.contains('resolveSubcommandHelpText')
    * assert cliSrc51.contains('executeInitAgentsCli')

    * def indexSrc51 = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert indexSrc51.contains('mcp-config --client')

    * def dashboardVue51 = karate.readAsString(mcpRoot + '/example/frontend/src/views/DevicesDashboard.vue')
    * assert dashboardVue51.contains('<script lang="ts">')
    * def dashboardUnit51 = karate.readAsString(mcpRoot + '/example/frontend/src/views/DevicesDashboard.unit.ts')
    * assert dashboardUnit51.contains('mount(DevicesDashboard)')
    * def exMainPy51 = karate.readAsString(mcpRoot + '/example/backend/src/main.py')
    * assert !exMainPy51.contains('type: ignore')
    * def exCompose51 = karate.readAsString(mcpRoot + '/example/docker-compose.qa.yml')
    * assert exCompose51.contains('sinfallas/base-python-uv:3.15@sha256:')
    * assert exCompose51.contains('sinfallas/base-node-ionic:26@sha256:')

    * def exReadmeEn51 = karate.readAsString(mcpRoot + '/example/README.md')
    * assert exReadmeEn51.contains('12 CLI Subcommands')
    * def exReadmeEs51 = karate.readAsString(mcpRoot + '/example/README.es.md')
    * assert exReadmeEs51.contains('12 Subcomandos CLI')
    * def verifyV251 = karate.readAsString(mcpRoot + '/example/verify-v2.sh')
    * assert verifyV251.contains('--version --json')
    * assert verifyV251.contains('certify ')
    * assert verifyV251.contains('blast-radius ')
    * assert verifyV251.contains('tms-sync ')
    * assert verifyV251.contains('session_flight_recorder')




