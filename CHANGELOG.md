# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### 🚀 Añadido (Added)
* **Gobernanza de Agentes de IA (`.agents/`):** Estructura completa de gobernanza multi-agente (`rules/`, `skills/`, `scripts/`) compatible con Google Antigravity, Claude Code / Desktop, Hermes Agent, Cursor y Windsurf.
* **Optimización Bimodal de Tokens:** Directivas internas de IA en inglés técnico de alta densidad para reducir el consumo de tokens BPE en un ~35%, manteniendo la interacción y documentación estrictamente en español (`OUTPUT LANGUAGE CONSTRAINT`).
* **Manuales Técnicos Corporativos:**
  * `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`: Gobernanza de agentes, enrutamiento semántico y ciclo de evolución continua.
  * `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`: Anti-Mock Blindness, Geometría Visual Anti-JSDOM, Seguridad por Diseño (RLS, SSRF, AES-256-GCM Vault, Idempotency-Key) y Motor KeyDB Multi-Hilo.
  * `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`: Desglose detallado de los 13 niveles de la pirámide de calidad 11X.
  * `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`: Catálogo y recetario técnico de mitigación de 13 vectores de ataque en plataformas híbridas (Mass Assignment, CSWSH, SSRF, Information Disclosure 422, XSS/Prototype Pollution, SQL injection en contextos dinámicos, race conditions en refresh tokens y shift-left lockfiles).
* **Política de Seguridad DevSecOps (`SECURITY.md`):** Actualización completa con 8 capas de defensa en profundidad, mitigación de vulnerabilidades híbridas y gobernanza de lockfiles herméticos (`uv.lock` y `pnpm-lock.yaml`).
* **Anti-Mock Blindness y Paridad de Base de Datos:** Integración del validador `.agents/scripts/verify_alembic_orm_parity.py` y contenedor real `postgres:17-alpine` en `fastapi/docker-compose.qa.yml`.
* **Motor en Memoria KeyDB:** Incorporación de `eqalpha/keydb:alpine` con multi-threading (`--server-threads 2`) como reemplazo de alto rendimiento para Redis.
* **Invariante Karate Labs BDD Universal:** Enriquecimiento de pruebas BDD de caja negra para API (`fastapi/test/api_test.feature`) y UI en Chrome Headless (`vue3/test/ui_business_flow.feature`).
* **Invariante de Cero Componentes UI Huérfanos:** Script determinista `.agents/scripts/verify_zero_orphan_vue_components.py` que exige pruebas unitarias para cada archivo `.vue` o `.tsx`.
* **Auditoría Anti-Colisión JSON:** Script `.agents/scripts/verify_json_no_duplicate_keys.py` para prevenir sobreescritura silenciosa de claves en diccionarios de traducción y configuración.
* **Radio de Impacto AST (Blast Radius):** Script `.agents/scripts/inspect_blast_radius.py` y auditor topológico `.agents/scripts/verify_topological_health.py` basados en grafos AST de Graphify.
* **Escaneo Preventivo de Secretos:** Script `scripts/verificar-secretos.sh` integrado para detectar credenciales y tokens hardcodeados en commits.
* **Compuerta de Certificación Pre-Commit:** Script automatizado `.agents/scripts/certify_task_completion.sh` que evalúa 7 etapas de control de calidad antes de cerrar tareas.
* **Resolución de Problemas Avanzada (`docs/docker-troubleshooting.md`):** Nuevas secciones operativas para sincronización activa con `pg_isready` en PostgreSQL, límites de memoria y evicción en KeyDB, permisos de caché local en Trivy y prevención de defectos de geometría visual Anti-JSDOM.

### 🔄 Modificado (Changed)
* **`AI_MASTER_PROMPT.md`:** Actualizado con los mandatos aprendidos en campo: Anti-Mock Blindness, Anti-JSDOM, Invariante Karate Labs BDD, Paridad Terminal ↔ Frontend y compuerta de certificación.
* **Modernización Canónica de Seguridad Dinámica (DAST):** Reemplazo global de la imagen deprecada `owasp/zap2docker-stable:latest` por `zaproxy/zap-stable:latest` en todos los orquestadores Docker Compose, guías de ecosistemas y `CONTRIBUTING.md`.
* **Estandarización de Comandos Graphify:** Corrección del error tipográfico `graphifyy` y alineación con los binarios canónicos `graphify-mcp` y `graphify extract --code-only` en todos los orquestadores y READMEs de ecosistemas (`fastapi`, `node-backend`, `python`, `bash-scripts`, `vue3`, `react-frontend`).
* **Armonización de la Pirámide de Calidad a 13 Capas:** Sincronización integral de `docs/qa-philosophy.md`, `docs/ARCHITECTURE_C4.md` y `fastapi/README.md` delimitando con precisión el aislamiento unitario frente a la verificación real de persistencia (Anti-Mock Blindness).
* **Pipelines de CI/CD Seguros (`docs/ci-cd-pipelines.md`):** Eliminación del anti-patrón de inyección de credenciales en disco, incorporación del script de escaneo de secretos y acoplamiento de la compuerta de certificación de 7 pasos.
* **`fastapi/docker-compose.qa.yml`:** Añadidos servicios nativos de `postgres` y `keydb` con healthchecks, y optimizado `pull_policy: if_not_present`.
* **`fastapi/Makefile.example`:** Ampliado con metas `qa-contracts`, `qa-bdd`, `qa-dast`, `qa-chaos` y validaciones estrictas de `radon`, `bandit` y `pip-audit`.
* **`vue3/docker-compose.qa.yml` & `vue3/Makefile.example`:** Actualizado a `sinfallas/base-node-ionic:26`, meta `qa-orphans` y optimizaciones de pull policy.
* **`README.md`:** Reescrito con la nueva gobernanza, filosofía 11X multi-capa y enlaces a los nuevos manuales técnicos.

---

## [2.5.0] - 2026-10-10

### 🚀 Añadido (Added)
*   **Optimizaciones de Caché Persistente:** Implementación global de volúmenes de caché compartidos (`pnpm-store` para Node/Vue/React y `uv-cache` para Python/FastAPI) en los orquestadores `docker-compose.qa.yml`. Esto elimina la reinstalación de paquetes en cada validación efímera y acelera masivamente los pipelines destructivos (BDD, mutación, carga).
*   **Fronteras de Ejecución (Tool Boundaries):** Blindaje de *runners* configurando `testMatch`/`include` en `vitest.config.ts` y `playwright.config.ts`. Se estableció una convención corporativa inquebrantable: `.unit.ts` o `.spec.ts` para Vitest/Pytest, y `.e2e.ts` exclusivo para Playwright/Karate Labs.
*   **Makefiles (Task Runners):** Creación de archivos `Makefile.example` en cada framework para envolver la verbosidad destructiva de Docker Compose (ej. `make qa-unit`, `make qa-all`). Oculta la complejidad y previene errores tipográficos de agentes y humanos.
*   **Seguridad Zero-Trust en NPM:** Inyección de `.npmrc.example` en todos los ecosistemas JavaScript bloqueando la ejecución silenciosa de scripts post-instalación de terceros (`ignore-scripts=true`).
*   **Directiva Zero-Shot (MCP):** Actualización del cerebro del agente (`AI_MASTER_PROMPT.md`) con la "Regla #7". La IA está obligada a leer proactivamente (vía `graphify`) las configuraciones locales de QA (ej. `.eslintrc.json`, `tsconfig.json`, `pyproject.toml`) *antes* de escribir la primera línea de código, garantizando precisión en el primer intento y ahorrando consumo de tokens en ciclos de autocorrección.

### 🔄 Modificado (Changed)
*   **Orquestadores de Pruebas:** Los archivos `docker-compose.qa.yml` de Node, Vue 3, React y FastAPI pasaron por una refactorización masiva para soportar el aislamiento total de la caché de volumen.
*   **Sandboxing de Mutación:** Configuración de volúmenes base que impiden que herramientas agresivas (como Stryker o Mutmut) escaneen historiales `.git` o se atasquen en bucles infinitos por enlaces simbólicos (`symlinks`) expuestos del sistema anfitrión.
*   **Documentación de Integración (IA):** Actualización extensa de `docs/ai-integration.md` incluyendo el flujo de *Tool Calling* seguro y orquestación multi-agente (Developer vs Auditor QA) basado en los nuevos *Makefiles*.
*   **Guías de Contribución y FAQs:** Se actualizó la matriz corporativa en `CONTRIBUTING.md`, `README.md` y las resoluciones de errores en `FAQ.md` para exigir y documentar el uso de los `Makefiles` como puerta de entrada a la ejecución efímera.

---

## [2.4.0] - 2026-10-08

### 🚀 Añadido (Added)
*   **Ecosistema React (Nivel 11X):** Integración completa del ecosistema `react-frontend/` al repositorio corporativo.
*   **Vitest + RTL:** Configuración de pruebas unitarias centradas en el usuario (DOM/ARIA) mediante `@testing-library/react` y `jsdom`, manteniendo la exigencia innegociable de 95% de cobertura.
*   **Reglas Estrictas de Hooks (ESLint):** Integración de `eslint-plugin-react` y `eslint-plugin-react-hooks` para evitar bucles infinitos en dependencias de `useEffect`.
*   **Documentación React:** Creación de un `README.md` (Prompt Operativo) específico para instruir a la IA en la correcta validación del estado y ciclo de vida de React bajo contenedores efímeros.

### 🔄 Modificado (Changed)
*   **Documentación Global:** Actualización del `README.md` maestro (Matriz de Herramientas) y del `AI_MASTER_PROMPT.md` para incluir el enrutamiento de contexto hacia la nueva carpeta de React.
*   **Desacoplamiento de E2E:** Estandarización de los archivos de regresión visual y pruebas BDD (Playwright, Lighthouse CI y Karate Labs) para que sean completamente agnósticos, sirviendo tanto para los ecosistemas Vue 3 como React.

---

## [2.3.1] - 2026-10-07

### 🚀 Añadido (Added)
*   **UX/DX:** Se estandarizó la bibliografía y enlaces externos en archivos centralizados (`RESOURCES.md` / `REFERENCES.md`) para limpiar los prompts operativos.

### 🔄 Modificado (Changed)
*   **Refactorización de Enrutamiento:** Se renombraron las guías operativas de todos los ecosistemas (ej. `pruebas-backend-node.md`, `pruebas-script-bash.md`) a `README.md`. Esto activa el renderizado automático en GitHub/GitLab y optimiza el punto de entrada para los Agentes de IA.
*   **AI Master Prompt:** Actualizada la Regla Innegociable #6 y la sección de enrutamiento para diferenciar la observabilidad entre servicios continuos (middleware `/metrics`) y tareas efímeras (*Pushgateway*).
*   **Documentación de Arquitectura:** Actualizados los diagramas Nivel 2 y Nivel 3 en `ARCHITECTURE_C4.md` para ilustrar gráficamente la recolección asíncrona de métricas vía Pushgateway.
*   **Filosofía y FAQ:** Se agregaron aclaratorias en `qa-philosophy.md` y `FAQ.md` justificando el uso de inyección de comandos `curl` o `push_to_gateway` en entornos que no levantan servidores HTTP (Bash y scripts Python).
*   **CI/CD:** Añadida una advertencia en la plantilla de `ci-cd-pipelines.md` para evitar que los proyectos de scripts efímeros intenten invocar el perfil de caos (`--profile chaos`) en lugar del de observabilidad.
*   **Python Scripts:** Se actualizó el `README.md` del ecosistema Python para instruir a la IA sobre cómo utilizar `CollectorRegistry` y `push_to_gateway` antes de que el contenedor muera.

### 🐛 Corregido (Fixed)
*   **Bug de Red (Python Scripts):** Corregido un error en el `docker-compose.qa.yml` donde Prometheus intentaba raspar un hostname inexistente (`test_env:8000`). Ahora apunta correctamente a `test:8000`.
*   **Fugas de Infraestructura (Limpieza):** Se actualizaron los scripts `limpieza.sh` de Bash y Python Scripts para garantizar que el orquestador apague los contenedores del perfil oculto `--profile observability` antes de podar el sistema.

---

## [2.3.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Observabilidad Universal (Estándar 11X):** Integración completa de Prometheus en todos los ecosistemas para la recolección de métricas RED (Rate, Errors, Duration) en tiempo real, permitiendo evaluar el daño durante las pruebas de Ingeniería del Caos.
* **Perfil de Observabilidad (`--profile observability`):** Creación de un nuevo perfil aislado en los orquestadores `docker-compose.qa.yml` para desplegar sidecars de telemetría (`prom/prometheus`, `nginx-prometheus-exporter`, `prom/pushgateway`) sin alterar ni sobrecargar el flujo de las pruebas lógicas estándar.
* **Telemetría para Tareas Efímeras:** Implementación de la arquitectura `Pushgateway` específica para monitorizar métricas y tiempos de ejecución en el ecosistema Bash y scripts *standalone* en Python.
* **Feature Freeze:** Declaración oficial de congelamiento de nuevas características. Se considera que la arquitectura del Nivel 11X está funcionalmente completa.

### 🔄 Modificado (Changed)
* **Master Prompt (Regla #6):** Se actualizó el archivo `AI_MASTER_PROMPT.md` imponiendo como mandato innegociable la instrumentación de métricas antes de ejecutar inyecciones de red destructivas.
* **Documentación Global:** Evolución estructural de los diagramas del Modelo C4 en `ARCHITECTURE_C4.md`, refinamiento de los pasos de GitHub Actions en `ci-cd-pipelines.md`, y adición de aclaratorias técnicas sobre middlewares de Prometheus en el `FAQ.md` y `CONTRIBUTING.md`.
* **Gestión de Artefactos y Limpieza:** Adaptación masiva de los scripts de purga (`limpieza.sh`) y archivos `.gitignore.example` para destruir proactivamente las redes asociadas a la observabilidad e ignorar las bases de datos temporales `prometheus_data/`.

---

## [2.2.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Optimización de Contexto IA (Graphify MCP):** Integración de la imagen `sinfallas/remote-graphify:latest` en todos los ecosistemas bajo el perfil oculto `--profile graphify`. Permite a los agentes autónomos extraer y consultar el grafo semántico del código mediante Server-Sent Events (SSE), comprimiendo la ventana de contexto y ahorrando tokens masivamente al utilizar proxies como OmniRoute.
* **Bitácora Viva (TESTING.md):** Adición de una nueva regla innegociable (Regla #5) en el `AI_MASTER_PROMPT.md`. A partir de ahora, la IA está obligada a generar o actualizar un archivo `TESTING.md` en el proyecto del usuario, resumiendo el alcance de las pruebas desarrolladas y documentando los comandos exactos de Docker Compose para su ejecución manual.
* **Paso 0 (Ingestión de Contexto):** Se añadió el Paso 0 obligatorio en todas las guías de *prompting* (`pruebas-*.md`), instruyendo a la IA a levantar el servidor MCP efímero antes de iniciar cualquier auditoría o escritura de código.

### 🔄 Modificado (Changed)
* **Erradicación de IPv6 (Redes Unificadas):** Se eliminó por completo el soporte IPv6 (`enable_ipv6: true`) de todos los orquestadores `docker-compose.qa.yml`. Se estandarizó el uso de IPv4 estricto (`driver: bridge`) sobrescribiendo la red `default` para prevenir redes fracturadas, aislar correctamente los entornos y evitar conflictos de NAT en servidores de CI/CD.
* **Documentación Arquitectónica (Modelo C4):** Actualización de los diagramas en `ARCHITECTURE_C4.md` para visualizar el servidor MCP de Graphify y su interacción temprana (Paso 0) con el flujo de automatización 11X.
* **Guías de Integración IA:** Evolución del documento `ai-integration.md` para reflejar la implementación real de Graphify en lugar de ejemplos teóricos del ecosistema MCP.
* **Pipelines de Integración Continua:** Corrección de inconsistencias en los nombres de contenedores (`ui-test` renombrado correctamente a `test`) en las plantillas de GitHub Actions documentadas en `ci-cd-pipelines.md` para garantizar el copiado sin errores.
* **Rutinas de Limpieza y Control de Versiones:** Actualización transversal de todos los `.gitignore.example` y scripts `limpieza.sh` para ignorar la carpeta `graphify-out/` e instruir el apagado forzado del perfil MCP (`docker compose --profile graphify down`).

---

## [2.1.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Seguridad Dinámica (DAST):** Integración de `OWASP ZAP` en modo *Baseline Scan* para los ecosistemas de FastAPI y Node.js. Permite auditar vulnerabilidades en cabeceras HTTP y configuraciones de red atacando la aplicación viva.
* **Ingeniería del Caos (Estándar 11X):** Incorporación de `Pumba` orquestado junto a `Locust` (Python) y `Artillery` (Node) para evaluar la resiliencia y el *Auto-Recovery*. Inyecta latencia de red y simula fallos de infraestructura bajo cargas extremas.
* **Perfiles Docker (Profiles):** Implementación de la bandera `--profile chaos` en los orquestadores `docker-compose.qa.yml`. Esto permite mantener las pruebas destructivas (que requieren acceso al `/var/run/docker.sock`) ocultas y protegidas por defecto, unificando la infraestructura en un solo archivo.
* **Meta-Instrucción Bilingüe (System Directive):** Adición de un bloque de sistema en inglés al inicio de todos los *blueprints* (`pruebas-*.md`). Esto ancla el espacio latente de razonamiento de los LLM en su idioma nativo de mayor capacidad, forzando el cumplimiento estricto mientras se genera la salida en español.

### 🔄 Modificado (Changed)
* **Documentación Global (11X):** Actualización masiva de `ARCHITECTURE_C4.md`, `qa-philosophy.md`, `docker-troubleshooting.md`, `ci-cd-pipelines.md` y `FAQ.md` para reflejar la evolución arquitectónica hacia la Ingeniería del Caos y DAST.
* **Matriz de Herramientas:** Actualización del `README.md` principal confirmando la operatividad total del stack corporativo. Se eliminaron los marcadores de "planificación" de OWASP ZAP y Pumba, y se corrigió la compatibilidad lógica (marcando N/A para scripts Python standalone).
* **Pipelines CI/CD:** El flujo de integración continua ahora integra la seguridad dinámica como Paso Final antes de autorizar un PR.
* **Limpieza Extendida:** Los scripts `limpieza.sh` en FastAPI y Node.js ahora purgan proactivamente las redes asociadas a los perfiles ocultos (`docker compose --profile chaos down`) y eliminan los artefactos `zap-report.html`, `chaos-report.html` y `chaos-report.json`.

---

## [2.0.0] - 2026-10-01

### 🚀 Añadido (Added)
* **Política de Seguridad:** Creación del archivo `SECURITY.md` definiendo reglas de divulgación, manejo de volúmenes de Docker, inyección de secretos (`.env`) y contención de Agentes de IA.
* **Análisis de Complejidad (Deuda Técnica):** Integración de `eslint-plugin-sonarjs` para los ecosistemas Node.js y Vue 3, y de `radon` para el ecosistema Python. El pipeline ahora falla si el código supera la complejidad ciclomática de grado B.
* **Profiling de Rendimiento:** Incorporación de `clinic.js` (Node.js) y `py-spy` (Python) para generación de Flamegraphs y detección de cuellos de botella en memoria/CPU.
* **Mocking Estricto:** Obligatoriedad de interceptar la red en pruebas unitarias mediante `nock` (Node.js) y `pytest-mock` (Python) para garantizar determinismo y velocidad.
* **Regresión Visual y Web Vitals:** Integración de `Lighthouse CI` y configuración estricta de `Playwright` con `@axe-core` en Vue 3 para congelar animaciones y exigir cumplimiento WCAG 2.1 AA.
* **Formateo Estético:** Adición de `.prettierrc.example` para los entornos JavaScript/TypeScript, separando la lógica (`ESLint`) de la estética (`Prettier`).
* **Permisos Extendidos:** Configuración de `cap_add: - SYS_PTRACE` y `seccomp:unconfined` en los orquestadores `docker-compose.qa.yml` para habilitar la lectura de memoria de los Profilers de manera segura.
* **Barrera Pre-commit Estricta:** Implementación de `Lefthook` para interceptar comandos Git a nivel local. Ahora se rechazan commits no semánticos y código que no supere la validación de estilo efímera (`ruff`, `Prettier`, `ESLint`), forzando un modelo educativo de "Fail & Forbid".
* **Prevención de Fugas y Auditoría IaC:** Integración de `Trivy` (escaneo de vulnerabilidades en manifiestos Docker y CVEs de imágenes base) como script manual (`auditar-infra.sh`) y como Paso 0 en los pipelines CI/CD. Añadida expresión regular en Lefthook para bloquear commits con secretos en texto plano.

### 🔄 Modificado (Changed)
* **Matriz de Herramientas:** Actualización del `README.md` principal para reflejar la implementación de las 15 métricas de calidad en todos los ecosistemas (eliminación de los asteriscos de funciones faltantes).
* **Guías de Contribución:** Actualización de `CONTRIBUTING.md` para exigir a los contribuidores mantener el 95% de cobertura, grado A/B en complejidad y un Score >90 en Lighthouse.
* **Reglas de Prompting:** Refactorización de todos los archivos `pruebas-*.md` para dotarlos de instrucciones nivel "10X" con lenguaje restrictivo e imperativo orientado a Agentes de IA.
* **Limpieza Profunda:** Los scripts `limpieza.sh` de cada entorno ahora purgan artefactos de profiling (`.clinic/`, `profile.svg`), reportes de Lighthouse y volcados temporales de Stryker.

---

## [1.0.0] - 2026-05-15

### 🚀 Añadido (Added)
* **Arquitectura Base Efímera:** Implementación de la regla de "Cero Compilaciones Locales" usando contenedores con el flag `--rm` y volúmenes *bind*.
* **Imágenes Oficiales:** Integración de la flota `sinfallas/*` (`base-python-uv`, `base-node-ionic`, `base-bash-qa`, `karatelabs`).
* **Regla del 95%:** Configuración de `kcov`, `Vitest` y `pytest-cov` para fallar pipelines si no se alcanza la cobertura mínima corporativa.
* **Pruebas de Mutación y SAST:** Integración de `Stryker`, `mutmut`, `bandit` y `eslint-plugin-security` para cazar vulnerabilidades lógicas y falsos positivos.
* **BDD de Caja Negra:** Orquestación de `Karate Labs` mediante archivos `.feature` para evaluar las APIs vivas.
* **Pipelines de CI/CD:** Creación de plantillas en `docs/ci-cd-pipelines.md` para emular la arquitectura efímera en GitHub Actions y GitLab CI.
* **Orquestación de IA:** Documentación `docs/ai-integration.md` para acoplar el repositorio a servidores de contexto MCP (Model Context Protocol).
