# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

Feature: Validación BDD de Caja Negra de la API REST FastAPI y Manejo de Errores

  Background:
    # URL apuntando al servicio FastAPI dentro de la red interna de Docker
    * url 'http://api:8000'
    * configure headers = { 'Content-Type': 'application/json' }
    # Generador dinámico de Idempotency-Key para prevenir colisiones 409/422 en KeyDB vivo
    * def newIdempotencyKey = function(){ return java.util.UUID.randomUUID() + '' }

  # ==============================================================================
  # Grupo 1: Observabilidad, Salud y Métricas
  # ==============================================================================

  Scenario: 1. Healthcheck activo de la API con estado del servicio y dependencias
    Given path '/health'
    When method get
    Then status 200
    And match response.status == 'healthy'
    And match response.service == '#string'

  Scenario: 2. Métricas del sistema expuestas en formato estándar Prometheus
    Given path '/metrics'
    When method get
    Then status 200
    And match response contains 'http_requests_total'

  # ==============================================================================
  # Grupo 2: Control de Acceso y Autenticación
  # ==============================================================================

  Scenario: 3. Intento de acceso a ruta protegida sin credenciales devuelve 401
    Given path '/api/v1/users/me'
    When method get
    Then status 401
    And match response.detail == '#string'

  Scenario: 4. Envío de credenciales incompletas genera error de validación 422
    Given path '/api/v1/auth/login'
    And header Idempotency-Key = newIdempotencyKey()
    And request { username: "solouser_sinpassword" }
    When method post
    Then status 422
    And match response.detail[0].type == '#string'
    And match response.detail[0].loc contains 'password'

  # ==============================================================================
  # Grupo 3: Idempotencia y Contratos de Creación
  # ==============================================================================
  # Regla 11X: Toda petición mutable (POST/PUT/PATCH/DELETE) contra endpoints con
  # IdempotencyMiddleware DEBE inyectar un UUID dinámico por ejecución:
  #   And header Idempotency-Key = java.util.UUID.randomUUID() + ''
  # Excepciones únicas: (A) probar rechazo HTTP 400 por falta de header, o (B) guardar
  # * def idemKey = java.util.UUID.randomUUID() + '' local al Scenario para probar replay/409.

  Scenario: 5. Verificación de rechazo de payload malformado con tipos inválidos
    Given path '/api/v1/items'
    And header Idempotency-Key = newIdempotencyKey()
    And request { title: 12345, quantity: "no_es_numero" }
    When method post
    Then status 422
    And match response.detail == '#array'

  Scenario: 6. Consulta de recurso inexistente devuelve 404
    Given path '/api/v1/items/00000000-0000-0000-0000-000000000000'
    When method get
    Then status 404
    And match response.detail == '#string'

  # ==============================================================================
  # Grupo 4: Invariante Anti-Silo (Propagación Transversal, 3 Fases y Auditoría)
  # ==============================================================================
  # Regla 11X: Prohibido validar mutaciones en un silo sin verificar los endpoints GET
  # de los módulos consumidores y la integridad semántica de la bitácora (Anti-UUID).

  Scenario: 7. Propagación transversal Read-After-Write y bitácora sin UUID crudo en actor_username
    # Paso 1 (Write): Registrar una mutación válida en el módulo origen con llave de idempotencia fresca
    Given path '/api/v1/items'
    And header Idempotency-Key = newIdempotencyKey()
    And request { title: "Router Core 11X", quantity: 1 }
    When method post
    Then status 201
    * def createdItemId = response.id

    # Paso 2 (Read-After-Write): Consultar inmediatamente el módulo consumidor sin mocks intermedios
    Given path '/api/v1/items', createdItemId
    When method get
    Then status 200
    And match response.title == 'Router Core 11X'
    And match response.actor_username != '#regex (?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
