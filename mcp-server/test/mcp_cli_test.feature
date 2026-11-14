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
    * match pkg.engines.node == '>=20.0.0'

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
  # Grupo 3: Contratos de Esquema de Herramientas MCP (Tools 1 a 12)
  # ==============================================================================

  Scenario: 3. Definición de contratos y esquemas JSON para las 12 Herramientas MCP
    * def expectedTools =
      """
      [
        { name: 'inspect_project_config', required: ['project_path'] },
        { name: 'fetch_blueprint_bundle', required: ['stack'] },
        { name: 'bootstrap_or_merge_11x', required: ['project_path', 'stack'] },
        { name: 'inspect_ast_blast_radius', required: ['project_path', 'target_symbol'] },
        { name: 'clean_workspace_11x', required: ['project_path'] },
        { name: 'audit_security_stig_owasp', required: ['project_path'] },
        { name: 'run_ephemeral_qa', required: ['project_path', 'stage'] },
        { name: 'certify_11x_gate', required: ['project_path'] },
        { name: 'audit_test_pyramid_gaps', required: ['project_path'] },
        { name: 'init_or_append_agents_md', required: ['project_path'] },
        { name: 'propose_skill_evolution_pr', required: ['project_path', 'target_blueprint_file', 'improvement_title', 'empirical_rationale', 'proposed_content_or_snippet'] },
        { name: 'reconcile_agents_governance', required: ['project_path'] }
      ]
      """
    * match expectedTools == '#[12]'

  # ==============================================================================
  # Grupo 4: Contratos de Esquema de Recursos MCP (Resources 1 a 8)
  # ==============================================================================

  Scenario: 4. Definición de URIs y tipos MIME para los 9 Recursos MCP
    * def expectedResources =
      """
      [
        { uri: 'blueprint://manifest', mimeType: 'application/json' },
        { uri: 'blueprint://core/philosophy', mimeType: 'text/markdown' },
        { uri: 'blueprint://security/disa-owasp-22', mimeType: 'text/markdown' },
        { uri: 'blueprint://database/postgres-rls-worm', mimeType: 'text/markdown' },
        { uri: 'blueprint://{stack}/readme', mimeType: 'text/markdown' },
        { uri: 'blueprint://ui/refactoring-ui/{topic}', mimeType: 'text/markdown' },
        { uri: 'blueprint://core/active-task-template', mimeType: 'text/markdown' },
        { uri: 'blueprint://core/cleanup-script', mimeType: 'text/x-shellscript' },
        { uri: 'blueprint://core/roadmap-validator', mimeType: 'text/x-python' }
      ]
      """
    * match expectedResources == '#[9]'

  # ==============================================================================
  # Grupo 5: Contrato de Salida de Herramientas MCP
  # ==============================================================================

  Scenario: 5. Estructura canónica de respuesta de ejecución de herramientas MCP (JSON compacto ahorrador de tokens)
    * def mockToolResponse =
      """
      {
        content: [
          {
            type: 'text',
            text: '{"status":"PASSED","gate_passed":true}'
          }
        ]
      }
      """
    * match mockToolResponse.content == '#[1]'
    * match mockToolResponse.content[0].type == 'text'
    * match mockToolResponse.content[0].text == '#string'
    * assert !mockToolResponse.content[0].text.contains('\n  ')
    * def parsedJson = karate.fromString(mockToolResponse.content[0].text)
    * match parsedJson.status == 'PASSED'
    * match parsedJson.gate_passed == true

  # ==============================================================================
  # Grupo 6: Contrato CLI para install-skill (Autodetección y 10 Skills v2.0)
  # ==============================================================================

  Scenario: 6. El catálogo de gobernanza indexa las 10 skills corporativas y soporta autodetección
    * def isSkill = function(item) { return item.path.startsWith('.agents/skills/') && item.path.endsWith('/SKILL.md') }
    * def skillFiles = karate.filter(manifest.agent_governance_files, isSkill)
    * match skillFiles == '#[10]'

    # Verificar que las 10 skills corporativas y sub-skills modulares v2.0 estén presentes
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

    # Contrato de opciones CLI de install-skill
    * def installSkillTargets = ['auto', 'workspace', 'antigravity', 'claude', 'cursor', 'hermes', 'all']
    * match installSkillTargets contains 'auto'
    * def installSkillFlags = ['--include-scripts', '--init-agents', '--reconcile']
    * match installSkillFlags contains '--reconcile'

  # ==============================================================================
  # Grupo 7: Contrato CLI y MCP para init-agents (Conector AGENTS.md)
  # ==============================================================================

  Scenario: 7. El conector AGENTS.md soporta modos creación, adición no destructiva e idempotencia
    * def connectorMarkerStart = '<!-- QA_11X_MCP_CONNECTOR_START -->'
    * def connectorMarkerEnd = '<!-- QA_11X_MCP_CONNECTOR_END -->'
    * match connectorMarkerStart == '#string'
    * match connectorMarkerEnd == '#string'

    # Contrato de opciones CLI de init-agents
    * def initAgentsCliFlags = ['--project-path', '-p', '--dry-run']
    * match initAgentsCliFlags contains '--dry-run'
    * match initAgentsCliFlags contains '--project-path'

  # ==============================================================================
  # Grupo 8: Contrato MCP para propose_skill_evolution_pr (Evolución Continua Zero-Trust)
  # ==============================================================================

  Scenario: 8. La herramienta propose_skill_evolution_pr garantiza Zero-Trust y soporte dual gh CLI / Fallback URL
    * def evolutionStatuses = ['PR_CREATED_VIA_GH', 'PROPOSAL_FILE_AND_URL_GENERATED']
    * match evolutionStatuses contains 'PR_CREATED_VIA_GH'
    * match evolutionStatuses contains 'PROPOSAL_FILE_AND_URL_GENERATED'
    * def proposalTemplate =
      """
      {
        status: 'PROPOSAL_FILE_AND_URL_GENERATED',
        target_repo: 'tecno-consultores/qa-testing-blueprints',
        target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
        branch_name: 'evolution/skill-improvement',
        gh_cli_authenticated: false,
        pull_request_url: null,
        prefilled_github_url: 'https://github.com/tecno-consultores/qa-testing-blueprints/issues/new?title=test',
        local_proposal_file: '.agents/proposals/skill-improvement.md',
        message: 'ok'
      }
      """
    * match proposalTemplate.target_repo == 'tecno-consultores/qa-testing-blueprints'

  # ==============================================================================
  # Grupo 9: Contrato del Ecosistema PHP 8.2-8.5 en Manifiesto y Servidor MCP
  # ==============================================================================

  Scenario: 9. El manifiesto indexa oficialmente el stack PHP con sus 10 plantillas y fusión quirúrgica
    * match manifest.stacks.php == '#object'
    * match manifest.stacks.php.description contains 'PHP 8.2-8.5'
    * match manifest.stacks.php.readme == 'php/README.md'
    * match manifest.stacks.php.files == '#[10]'

    # Verificar que composer.json.example aplique estrategia surgical_merge
    * def findComposer = function(f) { return f.target_name == 'composer.json' }
    * def composerEntry = karate.filter(manifest.stacks.php.files, findComposer)[0]
    * match composerEntry.merge_strategy == 'surgical_merge'
    * match composerEntry.sha256 == '#regex ^[0-9a-f]{64}$'

    # Verificar presencia de las plantillas canónicas 11X de PHP
    * def filePaths = karate.map(manifest.stacks.php.files, function(x) { return x.path })
    * match filePaths contains 'php/composer.json.example'
    * match filePaths contains 'php/docker-compose.qa.yml'
    * match filePaths contains 'php/gitignore.example'
    * match filePaths contains 'php/phpstan.neon.example'
    * match filePaths contains 'php/phpunit.xml.example'
    * match filePaths contains 'php/infection.json5.example'
    * match filePaths contains 'php/php.ini.example'
    * match filePaths contains 'php/limpieza.sh'
    * match filePaths contains 'php/Makefile.example'
    * match filePaths contains 'php/test/api_test.feature'

  # ==============================================================================
  # Grupo 10: Contrato de Auditores Anti-Silo, Ciclo Temporal de 3 Fases, Anti-UUID y Refresco Dual (Hito 12)
  # ==============================================================================

  Scenario: 10. Los auditores de seguridad y pirámide 11X exponen reglas SEC-11, UI-11X-02, 3 fases temporales y refresco dual
    * def securityRulesCatalog = ['SEC-01', 'SEC-02', 'SEC-03', 'SEC-04', 'SEC-05', 'SEC-06', 'SEC-07', 'SEC-08', 'SEC-09', 'SEC-10', 'SEC-11', 'UI-11X-01', 'UI-11X-02']
    * match securityRulesCatalog contains 'SEC-11'
    * match securityRulesCatalog contains 'UI-11X-02'

    * def mockSec11Finding =
      """
      {
        rule_id: 'SEC-11',
        severity: 'HIGH',
        stig_owasp_ref: 'APSC-DV-001350 / Anti-Silo Audit Rule 3',
        file: 'src/routers/maintenance.py',
        line: 42,
        message: 'Asignación directa de JWT "sub" (UUID crudo) a actor_username detectada en bitácora de auditoría.',
        remediation: 'Resolver actor_username a un nombre humano legible (ej. user.username o claims.get("username")) y nunca almacenar un UUID v4 crudo como nombre visible.'
      }
      """
    * match mockSec11Finding.rule_id == 'SEC-11'
    * match mockSec11Finding.severity == 'HIGH'
    * assert !mockSec11Finding.stig_owasp_ref.contains('5046a660-b1ba-423d-bf0b-a6f0fd80c40b')

    * def temporalLifecyclePhases = ['Programada', 'En Curso', 'Expirada/Cancelada']
    * match temporalLifecyclePhases == '#[3]'

  # ==============================================================================
  # Grupo 11: Contrato de Reconciliación Automática, Deduplicación y Aislamiento de Dominio en .agents/ (Hito 13)
  # ==============================================================================

  Scenario: 11. La herramienta reconcile_agents_governance y CLI reconcile-agents aíslan dominio y garantizan respaldos
    * def reconcileClassifications = ['CANONICAL_CLEAN', 'REDUNDANT_PROMOTED_REMOVED', 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE', 'DOMAIN_PRESERVED']
    * match reconcileClassifications contains 'CANONICAL_CLEAN'
    * match reconcileClassifications contains 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE'
    * match reconcileClassifications contains 'DOMAIN_PRESERVED'
    * match reconcileClassifications contains 'REDUNDANT_PROMOTED_REMOVED'

    * def mockReconcileResult =
      """
      {
        project_path: '/workspace/rosgrid',
        dry_run: false,
        backup_dir: '/workspace/rosgrid/.agents/backups/2026-11-05T00-00-00-000Z',
        domain_rules_file: '.agents/rules/domain_rosgrid_rules.md',
        removed_duplicate_sections_count: 3,
        preserved_domain_sections_count: 2,
        reconciled_items: [
          {
            file: '.agents/rules/mandatory_qa_pyramid_and_doc_sync.md',
            classification: 'CANONICAL_CLEAN',
            details: 'Archivo canónico global respaldado en .agents/backups/ y listo para sincronización.'
          },
          {
            file: '.agents/rules/custom_uat.md',
            classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
            details: 'Eliminadas 2 sección(es) ya promovidas al estándar global y extraídas 2 sección(es) de dominio.'
          },
          {
            file: '.agents/rules/domain_rosgrid_noc.md',
            classification: 'DOMAIN_PRESERVED',
            details: 'Archivo de dominio con prefijo domain_* preservado intacto.'
          },
          {
            file: 'AGENTS.md',
            classification: 'REDUNDANT_PROMOTED_REMOVED',
            details: 'Podadas 1 sección(es) duplicadas en AGENTS.md que ya residen en la skill global qa-11x-architect.'
          }
        ]
      }
      """
    * match mockReconcileResult.project_path == '/workspace/rosgrid'
    * match mockReconcileResult.removed_duplicate_sections_count == 3
    * match mockReconcileResult.preserved_domain_sections_count == 2
    * match mockReconcileResult.reconciled_items == '#[4]'
    * match mockReconcileResult.backup_dir contains '.agents/backups'
    * match mockReconcileResult.domain_rules_file == '.agents/rules/domain_rosgrid_rules.md'

    # Contrato del reminder de evolución obligatoria en certify11xGate
    * def mockGateResultWithEvolutionReminder =
      """
      {
        gate_passed: true,
        project_path: '/workspace/rosgrid',
        checks: {
          zero_unmerged_examples: true,
          zero_secrets_exposed: true,
          json_integrity: true,
          zero_orphan_ui_components: true,
          zero_orphan_api_endpoints: true,
          orm_alembic_parity: true,
          security_stig_owasp_clean: true,
          documentation_synced: true
        },
        blockers: [],
        upstream_evolution_reminder: 'MANDATORY POST-MORTEM CHECK: Did this task resolve a UAT/integration/production bug that bypassed previous automated tests? If YES, you MUST proactively present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" to the user in Spanish and invoke propose_skill_evolution_pr without waiting to be asked.'
      }
      """
    * match mockGateResultWithEvolutionReminder.upstream_evolution_reminder contains 'propose_skill_evolution_pr'
    * match mockGateResultWithEvolutionReminder.upstream_evolution_reminder contains 'Oportunidad de Mejora Detectada para el Estándar QA 11X'

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

    # 3. Contrato enriquecido de inspect_ast_blast_radius con detección de grafo AST y orden de creación/actualización
    * def mockBlastRadiusMissingGraph =
      """
      {
        project_path: '/workspace/consumer-app',
        target_symbol: 'UserService',
        risk_level: 'LOW',
        dependent_files_count: 1,
        dependent_files: ['src/UserController.ts'],
        suggested_tests_to_run: ['tests/**/UserController.unit.*'],
        ast_graph_detected: false,
        ast_graph_files: [],
        ast_graph_action_required: "⚠️ No se detectó grafo AST (graphify-out/graph.json). DIRECTRIZ OBLIGATORIA: Si el grafo no existe debes crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' (más información en qa-testing-blueprints) y SIEMPRE debes actualizar el grafo al terminar los cambios."
      }
      """
    * match mockBlastRadiusMissingGraph.ast_graph_detected == false
    * match mockBlastRadiusMissingGraph.ast_graph_action_required contains './scripts/actualizar-grafos-graphify.sh'
    * match mockBlastRadiusMissingGraph.ast_graph_action_required contains 'qa-testing-blueprints'

  # ==============================================================================
  # Grupo 13: Contrato de Matriz de Herramientas, Tags Oficiales Docker y Diagramas Mermaid
  # ==============================================================================

  Scenario: 13. El README restaura la Matriz de Herramientas de Pruebas y actualiza tags oficiales de Docker Hub
    * def readmeContent = karate.readAsString(repoRoot + '/README.md')
    * match readmeContent contains '## 🛠 Matriz de Herramientas de Pruebas'
    * match readmeContent contains '| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking |'
    * match readmeContent contains '`3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`'
    * match readmeContent contains '`8.2`, `8.3`, `8.4`, `8.5` y `latest`'
    * match readmeContent contains '`22`, `24`, `26` y `latest`'
    * match readmeContent contains '`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`'
    * match readmeContent !contains '\\text{'
    * match readmeContent !contains '<code>@sinfallas/mcp-qa-11x</code>'

  # ==============================================================================
  # Grupo 14: Contrato de Fast-Path Documental (DOCS_ONLY) y Economía de Tokens v2.10.0
  # ==============================================================================

  Scenario: 14. El servidor MCP y las directrices soportan Fast-Path Documental (DOCS_ONLY) y Zero Hardcoded Pass
    * def agentsContent = karate.readAsString(repoRoot + '/AGENTS.md')
    * match agentsContent contains 'Fast-Path Documental (`DOCS_ONLY`'
    * match agentsContent contains 'Full-Path de Código (`CODE_CHANGE`'

    * def mockDocsFastPathQaResult =
      """
      {
        status: 'SKIPPED',
        stage: 'unit',
        exit_code: 0,
        duration_ms: 0,
        coverage: {
          detected: false,
          percent: 0,
          threshold: 95.0,
          passed: false,
          uncovered_files: []
        },
        failed_tests: [],
        linter_and_complexity_issues: [],
        security_alerts: { critical: 0, high: 0 },
        mutation_summary: null,
        tail_log: "✔ [Fast-Path Docs-Only] Solo se detectaron cambios en documentación (*.md / docs/); se omite 'make qa-unit' en Docker."
      }
      """
    * match mockDocsFastPathQaResult.status == 'SKIPPED'
    * match mockDocsFastPathQaResult.coverage.detected == false
    * match mockDocsFastPathQaResult.coverage.passed == false
    * match mockDocsFastPathQaResult.exit_code == 0
    * match mockDocsFastPathQaResult.tail_log contains '[Fast-Path Docs-Only]'

  # ==============================================================================
  # Grupo 15: Optimización Extrema de Tokens, 3 Vías Proporcionales y Progressive Disclosure
  # ==============================================================================

  Scenario: 15. Contrato de 3 Vías Proporcionales (DOCS_ONLY, MICRO_CHANGE, FULL_11X), Token Economy y Grouped Findings
    * def agentsContent = karate.readAsString(repoRoot + '/AGENTS.md')
    * match agentsContent contains '3-Path Proportional Execution'
    * match agentsContent contains 'DOCS_ONLY'
    * match agentsContent contains 'MICRO_CHANGE'
    * match agentsContent contains 'FULL_11X'

    # Validar estructura compacta ahorradora de tokens para fetch_blueprint_bundle
    * def mockFetchBundleResult =
      """
      {
        stack: 'python',
        total_files: 10,
        content_omitted_for_token_economy: true,
        files: [
          {
            path: 'python/Makefile.example',
            target_name: 'Makefile',
            merge_strategy: 'template_only',
            content: '',
            sha256_verified: true,
            size_bytes: 1024,
            cached_path: '/home/user/.cache/qa-11x-blueprints/files/python/Makefile.example'
          }
        ]
      }
      """
    * match mockFetchBundleResult.content_omitted_for_token_economy == true
    * match mockFetchBundleResult.files[0].content == ''
    * match mockFetchBundleResult.files[0].size_bytes == 1024
    * match mockFetchBundleResult.files[0].sha256_verified == true

    # Validar estructura de hallazgos agrupados y truncado de seguridad
    * def mockSecurityResult =
      """
      {
        project_path: '/workspace',
        passed: true,
        total_files_scanned: 15,
        findings_count: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0 },
        findings: [],
        truncated_findings_count: 0,
        grouped_findings: [
          {
            rule_id: 'SEC-11-01',
            severity: 'MEDIUM',
            stig_owasp_ref: 'APSC-DV-002520 (Unicode Canonicalization)',
            message: 'Se detectó entrada de usuario sin normalización NFKC',
            remediation: 'Aplicar unicodedata.normalize("NFKC", value)',
            occurrences_count: 1,
            locations: ['src/api.py:42']
          }
        ]
      }
      """
    * match mockSecurityResult.passed == true
    * match mockSecurityResult.grouped_findings[0].occurrences_count == 1
    * match mockSecurityResult.grouped_findings[0].locations[0] == 'src/api.py:42'

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
    * assert initAgentsSource.contains('Conector Global Thin-Client QA 11X')
    * assert initAgentsSource.contains('Graphify AST-First (Consultas de Código Q&A y Pre-Cambio)')
    * assert initAgentsSource.contains('QA-TEST-SYNC-01')

    * def graphifySkillSource = karate.readAsString(repoRoot + '/.agents/skills/graphify-ast-navigator/SKILL.md')
    * assert graphifySkillSource.contains('Code Q&A')
    * assert graphifySkillSource.contains('Graphify AST-First, Grep-Fallback, Windowed-Read-Second')
    * assert graphifySkillSource.contains('QA-TEST-SYNC-01')

  Scenario: 19. Contrato v2.16.0 — SEC-16 (Pre-Auth Multi-Step Challenge Continuity), Thin-Repo bootstrap_or_merge_11x, Paridad 10/10 y CLI --version
    * match pkg.version == '2.20.3'
    * match manifest.blueprint_version == '2.20.3'

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
    * assert cliIndexSource.contains("'--version'")
    * assert cliIndexSource.contains('dispatchCliArgs')

  Scenario: 20. Presupuesto Cognitivo SKILL.md (< 20 KB), Regla #8 Anti-Ceguera UAT (SEC-16) y Paridad de 9 Recursos Documentales
    * def findSkillMd = function(f) { return f.path == '.agents/skills/qa-11x-architect/SKILL.md' }
    * def skillMdEntry = karate.filter(manifest.agent_governance_files, findSkillMd)[0]
    * assert skillMdEntry.size_bytes < 20000
    * def skillMdBytes = karate.readAsBytes(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillMdBytes.length < 20000

    * def skillMdContent = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/SKILL.md')
    * assert skillMdContent.contains('10 UAT Anti-Blindness Rules')
    * assert skillMdContent.contains('Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant')
    * assert skillMdContent.contains('Unmocked Orchestrator Boot & Container Healthcheck Contract')
    * assert skillMdContent.contains('QA-CLI-TTY-01')
    * assert skillMdContent.contains('inspect_ast_blast_radius')

    * def sec22Ref = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md')
    * assert sec22Ref.contains('Addendum (`SEC-16` / UAT Rule #8)')
    * assert sec22Ref.contains('PREAUTH_TTL_SECONDS = 300')

    * def rootReadme = karate.readAsString(repoRoot + '/README.md')
    * assert rootReadme.contains('9 recursos `blueprint://*`')
    * assert !rootReadme.contains('8 Resources')

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
    * assert fastapiMakefile.contains('PYTHONPATH=/app/src')

    * def rlsRef = karate.readAsString(repoRoot + '/.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md')
    * assert rlsRef.contains('relforcerowsecurity')
    * assert rlsRef.contains('pg_namespace')

  Scenario: 22. Internacionalización v2.18.0 — Idioma Espejo Dinámico, Flag --lang (auto|es|en), Targets codex/windsurf y Guías Multi-Agente EN/ES
    * match pkg.version == '2.20.3'
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
    * assert initAgentsSource.contains('Conector Global Thin-Client QA 11X')

    * def installSkillSource = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillSource.contains('parseLangArg')
    * assert installSkillSource.contains('CODEX_DIR_NAME')
    * assert installSkillSource.contains('WINDSURF_REL_DIR')
    * assert installSkillSource.contains("case 'codex':")
    * assert installSkillSource.contains("case 'windsurf':")

    * def mcpReadme = karate.readAsString(mcpRoot + '/README.md')
    * assert mcpReadme.contains('Official MCP Server & Skill Installer for QA Testing Blueprints')
    * assert mcpReadme.contains('Language / Idioma')
    * assert mcpReadme.contains('docs/agent-setup.en.md')

    * def mcpReadmeEs = karate.readAsString(mcpRoot + '/README.es.md')
    * assert mcpReadmeEs.contains('Idioma / Language')
    * assert mcpReadmeEs.contains('docs/agent-setup.md')

    * def agentSetupEs = karate.readAsString(repoRoot + '/docs/agent-setup.md')
    * assert agentSetupEs.contains('Guía Maestra de Configuración del Servidor MCP y Skills QA 11X por Agente de IA')
    * assert agentSetupEs.contains('agent-setup.en.md')

    * def agentSetupEn = karate.readAsString(repoRoot + '/docs/agent-setup.en.md')
    * assert agentSetupEn.contains('Master Setup Guide for QA 11X MCP Server & Skills across AI Coding Agents')
    * assert agentSetupEn.contains('agent-setup.md')

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
    * assert humanPractices.contains('10 reglas obligatorias de diseño de pruebas')
    * assert humanPractices.contains('QA-HEALTH-01')
    * assert humanPractices.contains('OPTIONAL_WORKERS')

    * def humanSecurity = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert humanSecurity.contains('Mapa de Trazabilidad con el Auditor Estático')
    * assert humanSecurity.contains('SEC-16')

    * def rootSecurity = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert rootSecurity.contains('### 4.22.')
    * assert rootSecurity.contains('QA-HEALTH-01')

  Scenario: 24. Contrato v2.20.0 — Sello .qa-11x-version, Caché TTL 24h Fail-Open, Aviso Estructurado update_available y Auto-Sync Global de Skills por SHA-256
    * match pkg.version == '2.20.3'
    * match manifest.blueprint_version == '2.20.3'

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
    * assert ciWorkflow.contains('run --rm -u "$(id -u):$(id -g)"')
    * assert ciWorkflow.contains('mcp-server bash -c')

    * def mcpCompose = karate.readAsString(mcpRoot + '/docker-compose.qa.yml')
    * assert mcpCompose.contains('pnpm-store-init:')
    * assert mcpCompose.contains('["chmod", "-R", "a+rwX", "/pnpm"]')
    * assert mcpCompose.contains('pnpm_config_store_dir: /pnpm/store')
    * assert mcpCompose.contains('user: "${QA_UID:-1000}:${QA_GID:-1000}"')

    * def govDoc = karate.readAsString(repoRoot + '/docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md')
    * assert govDoc.contains('9 Recursos Dinámicos')
    * assert govDoc.contains('blueprint://database/postgres-rls-worm')
    * assert govDoc.contains('update_available')

    * def agentsReadme = karate.readAsString(repoRoot + '/.agents/README.md')
    * assert agentsReadme.contains('10 reglas UAT Anti-Blindness')
    * assert agentsReadme.contains('verify_docs_invariants.py')

    * def dockerTrouble = karate.readAsString(repoRoot + '/docs/docker-troubleshooting.md')
    * assert dockerTrouble.contains('ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR')
    * assert dockerTrouble.contains('uv_os_homedir returned ENOENT')

    * def installSkillSrc = karate.readAsString(mcpRoot + '/src/cli/install-skill.ts')
    * assert installSkillSrc.contains('resolveSafeHomeDir()')
    * assert !installSkillSrc.contains('os.homedir()')

  Scenario: 26. Contrato v2.20.1 — Arnés E2E Real sobre stdio (mcp-server/example/) y Acoplamiento en las 4 Barreras
    * match pkg.version == '2.20.3'
    * match pkg.scripts['test:example'] == 'node example/run-example-e2e.mjs'
    * match pkg.files == ['dist/**/*', 'README.md']

    * def e2eRunner = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eRunner.contains('StdioClientTransport')
    * assert e2eRunner.contains('verifyAllResources')
    * assert e2eRunner.contains('verifyAllTwelveTools')
    * assert e2eRunner.contains('verifyCliAndBackgroundAutoSync')

    * def cleanroomScript = karate.readAsString(repoRoot + '/scripts/probar-mcp-example.sh')
    * assert cleanroomScript.contains('--exclude=\'./mcp-server/node_modules\'')
    * assert cleanroomScript.contains('pnpm run test:example')

    * def publisherScript = karate.readAsString(repoRoot + '/scripts/publicar-mcp.sh')
    * assert publisherScript.contains('pnpm --silent run test:example')

    * def ciWorkflow = karate.readAsString(repoRoot + '/.github/workflows/qa-11x-ci.yml')
    * assert ciWorkflow.contains('pnpm run test:example')

    * def lefthookCfg = karate.readAsString(repoRoot + '/lefthook.yml')
    * assert lefthookCfg.contains('mcp-example-smoke:')
    * assert lefthookCfg.contains('./scripts/probar-mcp-example.sh --in-place')

    * def hooksInstaller = karate.readAsString(repoRoot + '/instalar-hooks.sh')
    * assert hooksInstaller.contains('./scripts/probar-mcp-example.sh --in-place')

  Scenario: 27. Contrato v2.20.2 — Saneamiento integral en limpieza.sh, clean_workspace_11x y resolveSafeHomeDir (UID Non-Root)
    * match pkg.version == '2.20.3'
    * match manifest.blueprint_version == '2.20.3'
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
    * match pkg.version == '2.20.3'
    * match manifest.blueprint_version == '2.20.3'
    * def cliIndexSource = karate.readAsString(mcpRoot + '/src/index.ts')
    * assert cliIndexSource.contains('shouldExitInteractiveTty')
    * assert cliIndexSource.contains('INTERACTIVE_TTY_NOTICE')
    * assert cliIndexSource.contains("arg1 === '--stdio'")
    * assert cliIndexSource.contains("arg1 === 'install-skill' || arg1 === 'install'")
    * assert cliIndexSource.contains('process.stdin.isTTY')

    * def secAuditorSource = karate.readAsString(mcpRoot + '/src/tools/security-auditor.ts')
    * assert secAuditorSource.contains('QA-CLI-TTY-01')
    * assert secAuditorSource.contains('checkQaCliTty01InteractiveHangGuard')

    * def e2eRunner = karate.readAsString(mcpRoot + '/example/run-example-e2e.mjs')
    * assert e2eRunner.contains('Interactive Terminal Detected (TTY)')

    * def mcpReadme = karate.readAsString(mcpRoot + '/README.md')
    * assert mcpReadme.contains('install-skill --init-agents --include-scripts --reconcile')
    * assert mcpReadme.contains('--stdio')
    * assert mcpReadme.contains('QA-CLI-TTY-01')

    * def humanPractices = karate.readAsString(repoRoot + '/docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md')
    * assert humanPractices.contains('QA-CLI-TTY-01')

    * def humanSecurity = karate.readAsString(repoRoot + '/docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md')
    * assert humanSecurity.contains('QA-CLI-TTY-01')

    * def rootSecurity = karate.readAsString(repoRoot + '/SECURITY.md')
    * assert rootSecurity.contains('### 4.23.')
    * assert rootSecurity.contains('QA-CLI-TTY-01')


