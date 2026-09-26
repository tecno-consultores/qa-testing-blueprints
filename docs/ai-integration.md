# Integración Autónoma con Agentes de IA

Este documento detalla cómo evolucionar de una interacción manual (copiar y pegar los archivos `.md` en una ventana de chat) a un flujo de trabajo automatizado, donde los agentes de Inteligencia Artificial ingieren, aplican y ejecutan los *blueprints* de QA de forma autónoma.

## 1. Ingestión de Reglas mediante MCP (Model Context Protocol)
Para que un agente comprenda las restricciones corporativas en tiempo real, los *blueprints* deben exponerse como recursos dinámicos.
* **Implementación:** Levanta un servidor MCP que apunte directamente a la carpeta raíz de `qa-testing-blueprints`.
* **Funcionamiento:** Cuando el agente interactúe con el repositorio de un proyecto (ej. una API en FastAPI), utilizará el servidor MCP para ingerir automáticamente `pruebas-api-fastapi.md`. Esto asegura que el contexto del agente esté inyectado con la regla inquebrantable del 95% de cobertura y el uso exclusivo de `uv` antes de generar una sola línea de código de prueba.

## 2. Orquestación Multi-Agente (Arquitecturas tipo Pantheon / Hermes)
Las pruebas de alta exigencia (mutación, SAST, BDD) abruman el contexto si un solo agente intenta programar la aplicación y auditarla al mismo tiempo. Se debe implementar una separación de roles mediante un framework multi-agente:
* **Agente Developer:** Escribe el código fuente y la lógica de negocio de la aplicación.
* **Agente Auditor (QA):** Se inicializa utilizando el archivo `.md` de este repositorio como su *System Prompt* absoluto. Su única misión es vigilar al Agente Developer. Si el Developer intenta ejecutar `npm install` localmente o crea un script de Bash sin hacer *mocking* de los comandos destructivos, el Auditor QA rechaza el código y le obliga a reescribirlo para que cumpla con el estándar de contenedores efímeros.

## 3. Optimización del Contexto con Proxies de Inferencia (OmniRoute)
El ciclo de auto-corrección (donde la IA lee el error de Vitest, arregla la prueba y vuelve a ejecutar) consume masivamente tokens de entrada, especialmente al procesar volcados de error largos o reportes de cobertura en HTML.
* **Enrutamiento Inteligente:** Utiliza un proxy como **OmniRoute** para gestionar las llamadas del agente.
* **Delegación:** Enruta las tareas mecánicas (ej. corregir errores de tipado o formato detectados por `shfmt` o `ShellCheck`) hacia modelos más rápidos o locales. Reserva los modelos pesados de alto razonamiento exclusivamente para descifrar fallos lógicos complejos, como un mutante sobreviviente de `Stryker` o un interbloqueo en pruebas de concurrencia de `Artillery`.

## 4. Sandboxing: Permisos de Ejecución (Tool Calling)
El ecosistema de `qa-testing-blueprints` está diseñado intencionalmente para ser el entorno de juegos de la IA. Como todas las pruebas ocurren en contenedores efímeros que se autodestruyen, es matemáticamente seguro darle a la IA acceso de ejecución.
* **Permisos Restringidos:** A través del sistema de herramientas (*Tool Calling*) de tu agente, concédele la capacidad de ejecutar comandos en la terminal del host, pero **restringe la herramienta exclusivamente a binarios de Docker**. 
* **El Bucle Autónomo:** Esto permite que el agente ejecute por su cuenta `docker compose run --rm qa-bash bats test/`. Si la prueba falla, la IA lee la salida estándar (`stdout`), reescribe el script BATS internamente, y vuelve a lanzar el contenedor hasta que obtiene el código de salida `0` y la aprobación de `kcov`, entregando un trabajo finalizado sin intervención humana.
