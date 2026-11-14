# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

Feature: Contratos BDD HTTP, Cabeceras OWASP OSHP, Rutas SPA/SSG y SEO para Vue 3 (Karate 1.5.1)
  # Nota de Frontera 11X: sinfallas/karatelabs:1.5.1 no incluye Chrome/Chromium.
  # Las interacciones DOM, botón [ 🔄 Refrescar ] y WCAG 2.1 AA se certifican en Playwright (ui-e2e).
  # Karate certifica en caja negra la entrega HTTP/Nginx/SSG, cabeceras OSHP y XML/SEO sobre ui-prod:80.

  Background:
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * def baseUrl = karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://ui-prod:80'
    * url baseUrl

  # ==============================================================================
  # Grupo 1: Entrega HTML Raíz e Integridad del Shell Vue 3 / SSG
  # ==============================================================================

  Scenario: 1. La ruta raíz entrega HTTP 200 con HTML válido y contenedor de montaje
    Given path '/'
    When method get
    Then status 200
    And match header Content-Type contains 'text/html'
    * string htmlBody = response
    * assert htmlBody.toLowerCase().contains('<!doctype html')
    * assert htmlBody.contains('id="app"') || htmlBody.contains('id="root"')

  # ==============================================================================
  # Grupo 2: Cabeceras de Seguridad OWASP OSHP (Alineadas con nginx/default.conf.example)
  # ==============================================================================

  Scenario: 2. El servidor Nginx inyecta cabeceras OWASP OSHP obligatorias en HTTP interno
    Given path '/'
    When method get
    Then status 200
    And match header X-Frame-Options == 'DENY'
    And match header X-Content-Type-Options == 'nosniff'
    And match header Referrer-Policy == 'strict-origin-when-cross-origin'
    And match header Permissions-Policy contains 'geolocation=()'
    And match header Content-Security-Policy contains "default-src 'self'"

  # ==============================================================================
  # Grupo 3: Resolución de Rutas SPA / SSG y Endurecimiento de Cabecera Server
  # ==============================================================================

  Scenario: 3. Las rutas SPA/SSG responden HTTP 200 sin exponer versión de Nginx (server_tokens off)
    Given path '/inventory'
    When method get
    Then status 200
    And match header Content-Type contains 'text/html'
    * def serverBanner = responseHeaders['Server'] ? responseHeaders['Server'][0] : ''
    * assert !serverBanner.contains('nginx/')

  # ==============================================================================
  # Grupo 4: Higiene del Payload HTML y Ausencia de Fugas Internas
  # ==============================================================================

  Scenario: 4. El documento servido no expone trazas de error ni UUIDs crudos de auditoría en marcado
    Given path '/'
    When method get
    Then status 200
    * string pageText = response
    * assert !pageText.contains('Traceback')
    * assert !pageText.contains('__NUXT_ERROR__')
    * match pageText !contains '#regex [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

  # ==============================================================================
  # Grupo 5: Contrato XML/SEO Seguro para Sitios SSG (* string xmlText = response)
  # ==============================================================================

  Scenario: 5. Inspección segura como string de /sitemap.xml en SSG o fallback SPA sin fallo de namespace
    Given path '/sitemap.xml'
    When method get
    Then status 200
    * string xmlText = response
    * def contentType = responseHeaders['Content-Type'] ? responseHeaders['Content-Type'][0] : ''
    * assert contentType.contains('xml') ? xmlText.contains('<urlset') : xmlText.toLowerCase().contains('<html')
