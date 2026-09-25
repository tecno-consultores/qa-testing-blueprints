Feature: Validación BDD de la API Node.js

  Background:
    # URL apuntando al servicio Node.js en la red interna de Docker
    * url 'http://api:3000'

  Scenario: Verificar que la API responda al healthcheck correctamente
    Given path '/health'
    When method get
    Then status 200
    And match response == { status: 'healthy' }

  Scenario: Intento de acceso a ruta no encontrada devuelve 404
    Given path '/ruta-inexistente'
    When method get
    Then status 404
