Feature: Contrato HTTP BDD 11X — Consola Operativa y Propagación Anti-Silo

  Background:
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * url karate.properties['baseUrl'] || karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://qa-frontend:5173'

  Scenario: Verificación HTTP de página UI, cabeceras OSHP, alta idempotente y lectura sin mocks
    Given path '/'
    When method get
    Then status 200
    And match header X-Content-Type-Options == 'nosniff'

    * def newDeviceId = 'dev-ui-' + java.util.UUID.randomUUID().toString().substring(0, 8)
    Given path '/api/v1/devices'
    And header Idempotency-Key = java.util.UUID.randomUUID() + ''
    And request { id: '#(newDeviceId)', hostname: 'branch-gw-bdd', cpu_load_pct: 21.4 }
    When method post
    Then status 201
    And match response.id == newDeviceId
    And match response.cpu_load_pct == '#string'
    And match response.audit_actor == 'operador.noc'

    Given path '/api/v1/devices'
    When method get
    Then status 200
    And match response[*].id contains newDeviceId
