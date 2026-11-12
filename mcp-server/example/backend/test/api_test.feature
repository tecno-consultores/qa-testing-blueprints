Feature: Contratos BDD 11X para API Multi-Tenant de Telemetría

  Background:
    * url baseUrl

  Scenario: Registro idempotente y consulta inmediata sin mocks intermedios (Anti-Silo)
    Given path '/api/v1/devices'
    And header Idempotency-Key = java.util.UUID.randomUUID() + ''
    And request { id: 'dev-bdd-01', hostname: 'core-edge-01', cpu_load_pct: 37.5 }
    When method post
    Then status 201
    And match response.hostname == 'core-edge-01'

    Given path '/api/v1/devices'
    When method get
    Then status 200
    And match response[*].id contains 'dev-bdd-01'
