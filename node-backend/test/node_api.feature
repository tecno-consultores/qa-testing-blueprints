# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

Feature: Validación BDD de la API Node.js

  Background:
    # URL apuntando al servicio Node.js en la red interna de Docker
    * def envBaseUrl = java.lang.System.getenv('API_BASE_URL')
    * def baseUrl = karate.properties['API_BASE_URL'] || envBaseUrl || 'http://api:3000'
    * url baseUrl
    * def newIdempotencyKey = function(){ return java.util.UUID.randomUUID() + '' }

  Scenario: Verificar que la API responda al healthcheck correctamente
    Given path '/health'
    When method get
    Then status 200
    And match response == { status: 'healthy' }

  Scenario: Intento de acceso a ruta no encontrada devuelve 404
    Given path '/ruta-inexistente'
    When method get
    Then status 404

  Scenario: Mutación sin cabecera Idempotency-Key es rechazada con 400
    Given path '/api/v1/items'
    And request { name: 'Nodo Core 11X', status: 'ACTIVE' }
    When method post
    Then status 400

  Scenario: Propagación transversal Read-After-Write con Idempotency-Key dinámica y cero UUID crudo
    Given path '/api/v1/items'
    And header Idempotency-Key = newIdempotencyKey()
    And request { name: 'Nodo Core 11X', status: 'ACTIVE' }
    When method post
    Then status 201
    * def createdId = response.id

    Given path '/api/v1/items', createdId
    When method get
    Then status 200
    And match response.name == 'Nodo Core 11X'
    And match response.actor_username != '#regex (?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
