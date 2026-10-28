# QA Testing Blueprints (Estándar Corporativo Nivel 11X)

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba, buenas prácticas de ingeniería y gobernanza para **Agentes de Inteligencia Artificial** (Google Antigravity, Claude Code / Claude Desktop, Hermes Agent de Nous Research, Cursor, Windsurf) y desarrolladores humanos en la creación de software de nivel corporativo.

Este proyecto estandariza la forma en que construimos y validamos software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros (`Rule Zero`)**, sin contaminar la máquina local, erradicando la ceguera de mocks mediante motores de base de datos reales y aplicando salvaguardas de seguridad por diseño desde el primer día.

---

## 🚀 Filosofía Principal (Estándar 11X)

1. **Efimeridad Absoluta (Cero Docker Build en Pruebas):** Toda la infraestructura de validación se levanta al vuelo consumiendo nuestra flota de imágenes oficiales en [Docker Hub](https://hub.docker.com/u/sinfallas), junto a motores certificados de base de datos y memoria:
   * [sinfallas/base-python-uv](https://hub.docker.com/r/sinfallas/base-python-uv) (Tags: `3.10` a `3.15`, `latest`).
   * [sinfallas/base-node-ionic](https://hub.docker.com/r/sinfallas/base-node-ionic) (Tags: `22` a `26`, `latest`).
   * [sinfallas/base-bash-qa](https://hub.docker.com/r/sinfallas/base-bash-qa):latest.
   * [sinfallas/karatelabs](https://hub.docker.com/r/sinfallas/karatelabs):latest para BDD de API y UI en Chrome Headless.
   * [sinfallas/remote-graphify](https://hub.docker.com/r/sinfallas/remote-graphify):latest para Optimización de Contexto IA y Radio de Impacto (Blast Radius).
   * `postgres:17-alpine` y `eqalpha/keydb:alpine` (multi-hilo) con healthchecks nativos.
2. **Dependencias al Vuelo y Aislamiento de Red:** Los paquetes se resuelven en tiempo de ejecución utilizando volúmenes de caché persistentes (`pnpm-store` o `uv-cache`). Las pruebas unitarias tienen prohibido salir a internet; deben aislarse estrictamente.
3. **Validación Transversal Multi-Capa (Métricas Innegociables):**
   * **Cobertura Unitaria:** Ninguna suite pasa con menos del **95.0%**.
   * **Anti-Mock Blindness:** Prohibido confiar ciegamente en mocks para persistencia. Todo cambio de modelo ORM exige migración versionada y validación en base de datos real (`verify_alembic_orm_parity.py`).
   * **Geometría Visual Anti-JSDOM:** Prohibido el uso de footers fijos superpuestos. Verificación de layout in-flow y pruebas interactivas en navegador real (Karate UI / Playwright).
   * **Invariante BDD Karate Labs:** Todo endpoint y vista web DEBE contar con escenarios BDD de aceptación (`api_test.feature` y `ui_business_flow.feature`).
   * **Cero Componentes Huérfanos:** 100% de componentes UI cuentan con pruebas unitarias (`verify_zero_orphan_vue_components.py`).
   * **Deuda Técnica y Mutación:** Complejidad Ciclomática Grado A (`CC <= 5`, `MI >= B`) y pruebas de mutación (Stryker / Mutmut) para eliminar falsos positivos.
   * **Seguridad por Diseño:** RLS por tenant en PostgreSQL, anti-SSRF, cifrado AES-256-GCM, tokens CSRF, cabeceras de idempotencia y auditoría preventiva con Trivy.

---

## 🤖 Gobernanza de Agentes de IA (`.agents/`) y Optimización de Tokens

Este repositorio incorpora un sistema completo de directivas y compuertas automáticas para Agentes de IA:

* **Estructura `.agents/`:** Contiene directivas de cumplimiento obligatorio (`rules/`), habilidades especializadas (`skills/`) y scripts deterministas de pre-commit (`scripts/`).
* **Optimización de Tokens ($\approx 35\%$ de Ahorro):** Las directivas internas para el consumo de los LLMs están redactadas en **inglés técnico de alta densidad**, lo cual reduce el consumo de tokens BPE en un 35% en la ventana de contexto. Toda la interacción humana y documentación se genera estrictamente en **español** (`OUTPUT LANGUAGE CONSTRAINT`).
* **Compuerta de Certificación Automática:** Los agentes deben ejecutar `./.agents/scripts/certify_task_completion.sh` antes de dar cualquier tarea por terminada.
* **Evolución Continua:** Los agentes tienen mandato de auto-actualizar las directivas ante nuevos descubrimientos (`continuous_agent_evolution.md`).

---

## 📁 Estructura del Repositorio

El repositorio está dividido en ecosistemas tecnológicos listos para ser adoptados:

| Carpeta | Ecosistema | Stack Principal de Validación |
| :--- | :--- | :--- |
| **`python/`** | Scripts Standalone y Librerías | `Ruff` + `Mypy Strict` + `Pytest` + `Pytest-Cov (95%)` + `Bandit` + `Radon` + `Mutmut` |
| **`fastapi/`** | APIs Backend Python | `Ruff` + `Mypy` + `Postgres 17` + `KeyDB` + `Alembic` + `Karate Labs API` + `Locust` + `ZAP` + `Pumba` |
| **`node-backend/`** | Microservicios Node.js | `ESLint` + `Prettier` + `Vitest` + `Stryker` + `SonarJS` + `Karate Labs` + `Artillery` + `ZAP` |
| **`vue3/`** | Frontend Web (Vue 3 / Vite) | `ESLint` + `vue-tsc` + `Vitest (95%)` + `Stryker` + `Playwright` + `@axe-core` + `Lighthouse CI` + `Karate UI` |
| **`react-frontend/`**| Frontend Web (React / Vite) | `ESLint` + `tsc` + `Vitest (95%)` + `RTL` + `Stryker` + `Playwright` + `@axe-core` + `Lighthouse CI` + `Karate UI` |
| **`bash-scripts/`** | Automatización DevOps | `ShellCheck` + `shfmt` + `BATS-core` + `bats-mock` + `kcov` |
| **`.agents/`** | Gobernanza de Agentes IA | Reglas (`rules/`), Habilidades (`skills/`) y Scripts de certificación (`scripts/`) |

---

## 📚 Guías Técnicas y Manuales Operativos

* **[`docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`](docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md):** Manual completo sobre gobernanza de agentes, optimización bimodal de tokens y compatibilidad multi-agente (Antigravity, Claude, Hermes, Cursor).
* **[`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md):** Guía de arquitectura: Anti-Mock Blindness, Geometría Visual Anti-JSDOM, Seguridad RLS, Bóveda AES-256-GCM, Idempotencia y Motor KeyDB Multi-Hilo.
* **[`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`](docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md):** La pirámide completa de 13 capas de calidad, con sintaxis de código, comandos Docker y criterios de aprobación.
* **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md):** Recetario técnico de desarrollo seguro y mitigación de los 13 vectores de ataque en plataformas híbridas (SPA + API).
* **[`SECURITY.md`](./SECURITY.md):** Política de seguridad corporativa, arquitectura de defensa DevSecOps y reporte responsable.
* **[`TESTING.md`](./TESTING.md):** Cuadro de mando de aseguramiento de calidad, métricas 11X y comandos de validación efímera.
* **[`FAQ.md`](./FAQ.md):** Resolución rápida a dudas frecuentes, discos llenos o fallos de cobertura.
* **[`docs/qa-philosophy.md`](docs/qa-philosophy.md):** La filosofía de calidad y la innegociable regla del 95%.
* **[`docs/ai-integration.md`](docs/ai-integration.md):** Integración autónoma vía Model Context Protocol (MCP).
* **[`docs/ci-cd-pipelines.md`](docs/ci-cd-pipelines.md):** Plantillas de integración continua para GitHub Actions y GitLab CI.
* **[`docs/docker-troubleshooting.md`](docs/docker-troubleshooting.md):** Diagnóstico de conflictos de red y entornos anidados.

---

## 🧠 ¿Cómo utilizar este Blueprint en un Proyecto Nuevo? (Flujo Automatizado)

1. **Copiar Archivos Operativos:** Arrastra a la raíz de tu proyecto el `docker-compose.qa.yml`, el `Makefile.example` (renómbralo a `Makefile`), los archivos `.example` del ecosistema elegido y la carpeta `.agents/`.
2. **Documentación:** Copia la carpeta `docs/` y el archivo `AI_MASTER_PROMPT.md` a tu proyecto (ej. en `docs/qa/` o en la raíz).
3. **Delega la Fusión a la IA:**
   > *"Lee las directrices en `AI_MASTER_PROMPT.md` y `.agents/README.md`. Necesito integrar el estándar QA 11X en este proyecto. Lee los archivos `.example` y realiza una **fusión quirúrgica no destructiva** con mis archivos de configuración reales. Conserva intactas mis dependencias de negocio y añade todo el stack de linters, tipado estricto y pruebas."*
4. **Verificación:** Ejecuta `make qa-all` y `./.agents/scripts/certify_task_completion.sh` para certificar el pase de calidad corporativo.
