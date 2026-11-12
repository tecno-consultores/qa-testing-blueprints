Feature: Flujo UI de Negocio — Tablero Operativo de Dispositivos

  Scenario: Refresco manual y alta táctica de nodo desde consola web
    * driver 'http://qa-frontend:5173/devices'
    * waitFor("button")
    * click("{button}🔄 Refrescar")
    * match text('h1') contains 'Consola Operativa de Dispositivos'
