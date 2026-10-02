# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
