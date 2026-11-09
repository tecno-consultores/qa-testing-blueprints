# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

Feature: Flujo principal de negocio de la interfaz React

  Background:
    # Karate interceptará y levantará Chrome internamente
    * configure driver = { type: 'chrome', headless: true, addOptions: ['--no-sandbox', '--disable-dev-shm-usage'] }
    # Lee la URL desde las variables inyectadas en docker-compose o propiedades Karate
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * def baseUrl = karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://ui-prod:80'

  Scenario: El usuario navega al dashboard y verifica la carga de componentes
    Given driver baseUrl + '/'
    And waitFor("//h1[contains(., 'Dashboard')]")
    When click("//button[contains(@class, 'btn-primary') and contains(., 'Actualizar Datos')]")
    Then waitFor(".status-indicator.success")
    And match text(".status-text") == 'Actualizado'
