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
