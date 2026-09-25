Feature: Validación BDD de la API FastAPI

  Background:
    # URL apuntando al servicio FastAPI (o al host si corre localmente)
    * url 'http://api:8000'

  Scenario: Verificar que la API responda al healthcheck
    Given path '/health'
    When method get
    Then status 200
    And match response == { status: 'healthy' }

  Scenario: Intento de acceso a ruta protegida devuelve 401
    Given path '/users/me'
    When method get
    Then status 401
    And match response.detail == 'Not authenticated'
