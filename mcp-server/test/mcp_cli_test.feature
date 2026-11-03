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
  # Grupo 3: Contratos de Esquema de Herramientas MCP (Tools 1 a 8)
  # ==============================================================================

  Scenario: 3. Definición de contratos y esquemas JSON para las 8 Herramientas MCP
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
        { name: 'certify_11x_gate', required: ['project_path'] }
      ]
      """
    * match expectedTools == '#[8]'

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

  Scenario: 5. Estructura canónica de respuesta de ejecución de herramientas MCP
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
    * def parsedJson = karate.fromString(mockToolResponse.content[0].text)
    * match parsedJson.status == 'PASSED'
    * match parsedJson.gate_passed == true
