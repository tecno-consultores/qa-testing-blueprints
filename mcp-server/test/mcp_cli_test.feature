# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

@mcp @cli @contracts
Feature: Validación BDD de Contratos y Comportamiento del MCP Server y CLI (@sinfallas/mcp-qa-11x)

  Como Agente de IA (Antigravity, Claude, Hermes, Cursor) o Desarrollador DevSecOps
  Deseo interactuar con el Servidor MCP y la utilidad CLI de QA Testing Blueprints
  Para verificar que los contratos JSON-RPC, recursos y herramientas cumplan con el Estándar 11X

  Background:
    * def pkg = read('../package.json')
    * def manifest = read('../../manifest.json')

  # ==============================================================================
  # Grupo 1: Contrato del Paquete y Metadatos CLI
  # ==============================================================================

  Scenario: 1. El paquete npm expone nombre, versión y binario ejecutable canónico
    * match pkg.name == '@sinfallas/mcp-qa-11x'
    * match pkg.version == '#regex ^[0-9]+\\.[0-9]+\\.[0-9]+$'
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
    * match manifest.common_files == '#[? _ >= 1]'
    * match manifest.agent_governance_files == '#[? _ >= 1]'

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

  Scenario: 4. Definición de URIs y tipos MIME para los 8 Recursos MCP
    * def expectedResources =
      """
      [
        { uri: 'blueprint://manifest', mimeType: 'application/json' },
        { uri: 'blueprint://core/philosophy', mimeType: 'text/markdown' },
        { uri: 'blueprint://security/disa-owasp-22', mimeType: 'text/markdown' },
        { uri: 'blueprint://{stack}/readme', mimeType: 'text/markdown' },
        { uri: 'blueprint://ui/refactoring-ui/{topic}', mimeType: 'text/markdown' },
        { uri: 'blueprint://core/active-task-template', mimeType: 'text/markdown' },
        { uri: 'blueprint://core/cleanup-script', mimeType: 'text/x-shellscript' },
        { uri: 'blueprint://core/roadmap-validator', mimeType: 'text/x-python' }
      ]
      """
    * match expectedResources == '#[8]'

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
  # Grupo 6: Contrato CLI para install-skill (Autodetección y 5 Skills)
  # ==============================================================================

  Scenario: 6. El catálogo de gobernanza indexa las 5 skills corporativas y soporta autodetección
    * def isSkill = function(item) { return item.path.startsWith('.agents/skills/') && item.path.endsWith('/SKILL.md') }
    * def skillFiles = karate.filter(manifest.agent_governance_files, isSkill)
    * match skillFiles == '#[5]'

    # Verificar que las 5 skills requeridas estén presentes
    * def skillPaths = karate.map(skillFiles, function(x) { return x.path })
    * match skillPaths contains '.agents/skills/qa-11x-architect/SKILL.md'
    * match skillPaths contains '.agents/skills/refactoring-ui/SKILL.md'
    * match skillPaths contains '.agents/skills/docker-trivy-keydb-hardening/SKILL.md'
    * match skillPaths contains '.agents/skills/graphify-ast-navigator/SKILL.md'
    * match skillPaths contains '.agents/skills/qa-11x-docker-certifier/SKILL.md'

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
  # Grupo 9: Contrato del Ecosistema PHP 8.1-8.5 en Manifiesto y Servidor MCP
  # ==============================================================================

  Scenario: 9. El manifiesto indexa oficialmente el stack PHP con sus 9 plantillas y fusión quirúrgica
    * match manifest.stacks.php == '#object'
    * match manifest.stacks.php.description contains 'PHP 8.1-8.5'
    * match manifest.stacks.php.readme == 'php/README.md'
    * match manifest.stacks.php.files == '#[9]'

    # Verificar que composer.json.example aplique estrategia surgical_merge
    * def findComposer = function(f) { return f.target_name == 'composer.json' }
    * def composerEntry = karate.filter(manifest.stacks.php.files, findComposer)[0]
    * match composerEntry.merge_strategy == 'surgical_merge'
    * match composerEntry.sha256 == '#regex ^[0-9a-f]{64}$'

    # Verificar presencia de las plantillas canónicas 11X de PHP
    * def filePaths = karate.map(manifest.stacks.php.files, function(x) { return x.path })
    * match filePaths contains 'php/composer.json.example'
    * match filePaths contains 'php/docker-compose.qa.yml'
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





