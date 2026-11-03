# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

Feature: Validación BDD de Caja Negra de la API REST PHP (8.1-8.5) y Manejo de Errores

  Background:
    # URL apuntando al servicio PHP dentro de la red interna de Docker
    * url karate.properties['API_BASE_URL'] || 'http://qa-php:8000'
    * configure headers = { 'Content-Type': 'application/json' }

  # ==============================================================================
  # Grupo 1: Observabilidad, Salud y Métricas
  # ==============================================================================

  Scenario: 1. Healthcheck activo de la API PHP con estado del servicio y dependencias
    Given path '/health'
    When method get
    Then status 200
    And match response.status == 'healthy'
    And match response.service == '#string'

  Scenario: 2. Métricas del sistema expuestas en formato estándar Prometheus
    Given path '/metrics'
    When method get
    Then status 200
    And match response contains 'php_info'

  # ==============================================================================
  # Grupo 2: Control de Acceso, Autenticación y Seguridad
  # ==============================================================================

  Scenario: 3. Intento de acceso a ruta protegida sin token Bearer devuelve 401
    Given path '/api/v1/profile'
    When method get
    Then status 401
    And match response.error == '#string'

  Scenario: 4. Verificación de cabeceras de seguridad OSHP y supresión de firmas
    Given path '/health'
    When method get
    Then status 200
    And match responseHeaders['X-Content-Type-Options'][0] == 'nosniff'
    And match responseHeaders['X-Frame-Options'][0] == 'DENY'
    # Validación DISA APSC-DV-003300: Suprimir firma PHP
    And assert !responseHeaders['X-Powered-By']

  # ==============================================================================
  # Grupo 3: Idempotencia y Manejo de Errores
  # ==============================================================================

  Scenario: 5. Envío de petición mutante sin Idempotency-Key devuelve 400
    Given path '/api/v1/transfers'
    And request { amount: 100, currency: "USD", recipient: "USR-001" }
    When method post
    Then status 400
    And match response.error contains 'Idempotency-Key'
