# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

Feature: Validación BDD de Caja Negra de la API REST PHP (8.2-8.5) y Manejo de Errores

  Background:
    # URL apuntando al servicio PHP dentro de la red interna de Docker
    * def envBaseUrl = java.lang.System.getenv('API_BASE_URL')
    * url karate.properties['API_BASE_URL'] || envBaseUrl || 'http://php-api:8000'
    * configure headers = { 'Content-Type': 'application/json' }
    * def newIdempotencyKey = function(){ return java.util.UUID.randomUUID() + '' }

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
    And request { amount: "100.00", currency: "USD", recipient: "USR-001" }
    When method post
    Then status 400
    And match response.error contains 'Idempotency-Key'

  # ==============================================================================
  # Grupo 4: Invariante Anti-Silo y Auditoría Semántica Anti-UUID Crudo
  # ==============================================================================

  Scenario: 6. Identidad de servicio y auditoría exponen nombres legibles (nunca UUID v4 crudo)
    Given path '/health'
    When method get
    Then status 200
    And match response.service == '#string'
    And match response.service != '#regex (?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  Scenario: 7. Propagación transversal Read-After-Write con Idempotency-Key dinámica
    Given path '/api/v1/transfers'
    And header Idempotency-Key = newIdempotencyKey()
    And request { amount: "250.00", currency: "USD", recipient: "USR-11X" }
    When method post
    Then status 201
    * def transferId = response.id

    Given path '/api/v1/transfers', transferId
    When method get
    Then status 200
    And match response.amount == '250.00'
    And match response.actor_username == '#string'
    And match response.actor_username != '#regex (?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  Scenario: 8. Consulta de recurso inexistente (virgin_empty) devuelve 404 RFC 7807
    Given path '/api/v1/transfers/00000000-0000-0000-0000-000000000000'
    And header X-Tenant-ID = 'tenant-alpha'
    When method get
    Then status 404
    And match responseHeaders['Content-Type'][0] contains 'application/problem+json'
    And match response.status == 404
    And match response.title == '#string'

  Scenario: 9. Colisión de Idempotency-Key con payload mutado (degraded_conflict) devuelve 409 RFC 7807
    * def conflictKey = newIdempotencyKey()
    Given path '/api/v1/transfers'
    And header Idempotency-Key = conflictKey
    And header X-Tenant-ID = 'tenant-alpha'
    And request { amount: "120.00", currency: "USD", recipient: "USR-11X" }
    When method post
    Then status 201

    Given path '/api/v1/transfers'
    And header Idempotency-Key = conflictKey
    And header X-Tenant-ID = 'tenant-alpha'
    And request { amount: "999.99", currency: "USD", recipient: "USR-11X" }
    When method post
    Then status 409
    And match responseHeaders['Content-Type'][0] contains 'application/problem+json'
    And match response.status == 409
    And match response.title == '#string'

  Scenario: 10. Aislamiento estricto multi-tenant entre X-Tenant-ID distintos
    Given path '/api/v1/transfers'
    And header Idempotency-Key = newIdempotencyKey()
    And header X-Tenant-ID = 'tenant-alpha'
    And request { amount: "310.00", currency: "USD", recipient: "USR-ALPHA" }
    When method post
    Then status 201
    * def alphaTransferId = response.id

    Given path '/api/v1/transfers', alphaTransferId
    And header X-Tenant-ID = 'tenant-beta'
    When method get
    Then status 404
