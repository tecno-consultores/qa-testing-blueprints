# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
