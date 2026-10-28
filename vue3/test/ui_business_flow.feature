# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

Feature: Cobertura Funcional y Flujos BDD de la Interfaz Web Vue 3 con Karate UI

  Background:
    # Configuración del navegador Chromium headless aislado
    * configure driver = { type: 'chrome', headless: true, addOptions: ['--no-sandbox', '--disable-dev-shm-usage'] }
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * def baseUrl = karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://ui-prod:80'

  # ==============================================================================
  # Grupo 1: Flujo de Autenticación y Validación de Formularios
  # ==============================================================================

  Scenario: 1. El usuario navega al login y verifica validación de campos obligatorios
    Given driver baseUrl + '/login'
    And waitFor("#login-email")
    And waitFor("#login-password")
    When input("#login-email", 'operador@demo.net')
    And input("#login-password", 'PasswordInvalido123!')
    And click("#btn-login-submit")
    Then waitFor(".banner--error")

  # ==============================================================================
  # Grupo 2: Centro de Mando / Dashboard
  # ==============================================================================

  Scenario: 2. El usuario navega al dashboard y actualiza telemetría en tiempo real
    Given driver baseUrl + '/'
    And waitFor("//h1[contains(., 'Centro de Mando') or contains(., 'Dashboard')]")
    And waitFor(".kpi-strip")
    When click("//button[contains(@class, 'btn-primary') and contains(., 'Actualizar')]")
    Then waitFor(".status-indicator.success")
    And match text(".status-text") == 'Actualizado'

  # ==============================================================================
  # Grupo 3: Tablas Operativas y Modales
  # ==============================================================================

  Scenario: 3. Interacción con tabla operativa, filtros y selector de modo de vista
    Given driver baseUrl + '/inventory'
    And waitFor("//h1[contains(., 'Inventario') or contains(., 'Items')]")
    And waitFor("#table-search")
    When input("#table-search", 'Alpha')
    Then waitFor(".view-mode-toggle")
    When click("//button[contains(@class, 'btn-toggle') and contains(., 'Tabla')]")
    Then match attribute("//button[contains(@class, 'btn-toggle') and contains(., 'Tabla')]", 'class') contains 'btn-toggle--active'

  Scenario: 4. Apertura y cierre de diálogo modal con preservación de estado
    Given driver baseUrl + '/inventory'
    And waitFor("button.btn-add-item")
    When click("button.btn-add-item")
    Then waitFor(".modal-dialog")
    And match text(".modal-title") contains 'Nuevo'
    When click(".modal-close-btn")
    Then waitUntil("!document.querySelector('.modal-dialog')")
