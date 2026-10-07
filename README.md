# QA Testing Blueprints

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba y "prompts" (instrucciones) diseñados para instruir a agentes de Inteligencia Artificial (como Hermes, Claude Code o ChatGPT) y desarrolladores en la creación de suites de validación de nivel corporativo.

Este proyecto estandariza la forma en que probamos nuestro software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros**, sin contaminar la máquina local y utilizando un conjunto predefinido de herramientas de alta calidad.

## 🚀 Filosofía Principal (Estándar 11X)

1. **Cero Compilaciones Locales:** No utilizamos `docker build`. Toda la infraestructura se levanta consumiendo nuestra flota de imágenes oficiales en Docker Hub. Las imágenes base admiten *tags* específicos para igualar la versión de lenguaje de tu proyecto en producción:
   * `sinfallas/base-python-uv` (Tags: `3.10`, `3.11`, `3.12`, `3.13`, `3.14`, `latest`).
   * `sinfallas/base-node-ionic` (Tags: `22`, `23`, `24`, `25`, `26`, `latest`).
   * `sinfallas/base-bash-qa:latest` y `sinfallas/karatelabs:latest`.
   * `sinfallas/remote-graphify:latest` para Optimización de Contexto IA (Servidor MCP).
2. **Dependencias al Vuelo y Aislamiento de Red:** Los paquetes se resuelven y cachean en tiempo de ejecución dentro del contenedor efímero. Las pruebas unitarias tienen estrictamente prohibido usar red real; deben usar librerías de Mocking (`nock`, `pytest-mock`).
3. **Validación Transversal (Métricas Innegociables):** No solo probamos si el código funciona. Validamos:
   * **Cobertura:** Ninguna suite pasa con menos del **95%**.
   * **Deuda Técnica:** El pipeline falla si hay código espagueti (Complejidad Ciclomática alta auditable por SonarJS o Radon).
   * **Rendimiento:** Exigimos Profiling de Memoria/CPU y un score perfecto en Core Web Vitals (Lighthouse).
   * **Seguridad, Mutación y Resiliencia:** Prevención de inyecciones (SAST), escaneo dinámico (DAST), pruebas anti-falsos-positivos (Stryker/mutmut) e Ingeniería del Caos (Auto-Recovery ante fallos de red).

---

## 📁 Estructura del Repositorio y Casos de Uso

El repositorio está dividido en 4 ecosistemas que cubren la totalidad del desarrollo moderno y bash. Cada carpeta contiene un archivo `.md` (el prompt restrictivo para la IA), un `docker-compose.qa.yml` preconfigurado y los archivos de configuración nativos `.example` listos para usarse como referencia de fusión.

### 🐍 `python/` (Scripts Standalone y Librerías)
* **Objetivo:** Máxima resiliencia estructural, invulnerabilidad lógica y rendimiento matemático óptimo.
* **Stack:** Linting (`ruff`), Tipado (`mypy`), Pruebas (`pytest` + `pytest-mock`), BDD (`pytest-bdd`), Benchmarking (`pytest-benchmark`), Seguridad (`bandit`), Complejidad (`radon`), Profiling (`py-spy`), Mutación (`mutmut`) y Compatibilidad (`tox`).

### ⚡ `fastapi/` (APIs Backend)
* **Objetivo:** Contratos inquebrantables, comportamiento de negocio validado y resiliencia bajo estrés extremo.
* **Stack:** Todo lo de Python, añadiendo ataques de integración (`httpx/TestClient`), validación de contratos (`schemathesis`), BDD de caja negra (`Karate Labs`), concurrencia (`locust`), Seguridad Dinámica DAST (`OWASP ZAP`) e Ingeniería del Caos (`Pumba`).

### 🟩 `node-backend/` (APIs y Microservicios Node.js)
* **Objetivo:** Estandarización asíncrona, seguridad contra inyecciones, código limpio y validación funcional estricta.
* **Stack:** Pruebas e Intercepción (`Vitest` + `Supertest` + `nock`), Calidad y Complejidad (`ESLint` + `Prettier` + `SonarJS`), Seguridad (`ESLint Security` + `pnpm audit`), Mutación (`Stryker`), Profiling de Event Loop (`clinic.js`), Estrés (`Artillery`), BDD (`Karate Labs`), Seguridad Dinámica DAST (`OWASP ZAP`) e Ingeniería del Caos (`Pumba`).

### 🟢 `vue3/` (Frontend UI)
* **Objetivo:** UI sin regresiones visuales, componentes reactivos, accesibilidad (WCAG 2.1) y máximo rendimiento (SEO/PWA).
* **Stack:** Pruebas Unitarias DOM (`Vitest` + `jsdom`), Calidad y Complejidad (`ESLint` + `Prettier` + `SonarJS`), Rendimiento de Build (`Lighthouse CI`), Regresión Visual y Accesibilidad (`Playwright` + `@axe-core`), Compatibilidad (`Browserslist`), Mutación Frontend (`Stryker`) y Aceptación BDD (`Karate Labs`).

### 🐧 `bash-scripts/` (DevOps y Automatización)
* **Objetivo:** Aislamiento absoluto y auditoría POSIX para scripts de infraestructura.
* **Stack:** Auditoría estricta (`ShellCheck`), formateo (`shfmt`), motor de pruebas unitarias (`BATS-core`), auditoría de cobertura (`kcov`), e intercepción nativa de comandos destructivos usando `bats-mock`.

---

## 🛠 Matriz de Herramientas de Pruebas

A continuación se resume el stack de validación corporativo. Se indica `N/A` en las pruebas que no aplican por la naturaleza intrínseca del entorno (ej. un script *standalone* de Python no levanta servidores HTTP, por ende no se le aplica DAST ni Caos). 

| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking | Cobertura | Auditoría de Dependencias | Seguridad Estática (SAST) | Mutación | BDD / Caja Negra | Concurrencia / Estrés | Profiling / Complejidad | DAST (Dinámica) | Ingeniería del Caos | Observabilidad (Métricas) | Auditoría IaC / Docker | Git Hooks Locales |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Python** | [ruff](https://github.com/astral-sh/ruff) + [mypy](https://github.com/python/mypy) | [pytest](https://github.com/pytest-dev/pytest) + [pytest-mock](https://github.com/pytest-dev/pytest-mock) | [pytest-cov](https://github.com/pytest-dev/pytest-cov) | `uv pip audit` | [bandit](https://github.com/pycqa/bandit) | [mutmut](https://github.com/boxed/mutmut) | [pytest-bdd](https://github.com/pytest-dev/pytest-bdd) | [pytest-benchmark](https://github.com/ionelmc/pytest-benchmark) | [py-spy](https://github.com/benfred/py-spy) + [radon](https://github.com/rubik/radon) | N/A | N/A | `prometheus_client` | [trivy](https://github.com/aquasecurity/trivy) | [lefthook](https://github.com/evilmartians/lefthook) |
| **FastAPI** | `ruff` + `mypy` | `pytest` + `TestClient` | `pytest-cov` | `uv pip audit` | `bandit` | `mutmut` | [karate labs](https://github.com/karatelabs/karate) | [locust](https://github.com/locustio/locust) | `py-spy` + `radon` | [OWASP ZAP](https://github.com/zaproxy/zap-api-python) | [pumba](https://github.com/pjsjongsung/PUMBA) | `prometheus-fastapi-instrumentator` | `Trivy` | `Lefthook` |
| **Node** | `ESLint` + `Prettier` | `Vitest` + `nock` | `Vitest (v8)` | `pnpm audit` | `ESLint Security` | `Stryker` | `Karate Labs` | `Artillery` | `clinic.js` + `SonarJS` | `OWASP ZAP` | `Pumba` | `express-prom-bundle` | `Trivy` | `Lefthook` |
| **Vue3** | `ESLint` + `Prettier` | `Vitest` + `jsdom` | `Vitest (v8)` | `npm audit` | `ESLint Security` | `Stryker` | `Karate Labs` | `Lighthouse CI` | `DevTools` + `SonarJS` | `N/A` | `N/A` | `nginx-prometheus-exporter` | `Trivy` | `Lefthook` |
| **Bash** | `ShellCheck`+`shfmt`| `BATS-core`+`bats-mock`| `kcov` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `Pushgateway (cURL)` | `Trivy` | `Lefthook` |

---

## 📚 Base de Conocimiento y Documentación

Para entender los fundamentos de esta arquitectura y cómo automatizarla, consulta nuestros manuales:

* **[`FAQ.md`](./FAQ.md):** Resolución rápida a errores comunes, discos llenos o problemas de cobertura.
* **[`docs/qa-philosophy.md`](docs/qa-philosophy.md):** El "por qué" detrás de nuestras herramientas y la innegociable regla del 95%.
* **[`docs/ai-integration.md`](docs/ai-integration.md):** Cómo exponer este repositorio vía MCP para orquestar Agentes de IA autónomos.
* **[`docs/ci-cd-pipelines.md`](docs/ci-cd-pipelines.md):** Plantillas para integrar estas validaciones efímeras en GitHub Actions o GitLab CI.
* **[`docs/docker-troubleshooting.md`](docs/docker-troubleshooting.md):** Soluciones avanzadas para conflictos de red y virtualización anidada (LXC).

---

## 🧠 ¿Cómo utilizar este repositorio con IA? (Flujo Automatizado)

Si utilizas asistentes como **Hermes Agent**, **Claude Code**, **Cursor** u otras IAs autónomas, debes transferir los archivos de este Blueprint a tu proyecto real **sin sobreescribir la identidad de tu proyecto**. 

Sigue este protocolo para una integración segura:

1. **Archivos a la Raíz:** Descarga la carpeta de la tecnología que necesites (ej. `node-backend/`) y arrastra a la **raíz de tu proyecto** EXCLUSIVAMENTE los archivos operativos: el `docker-compose.qa.yml`, `limpieza.sh`, el orquestador de hooks (`lefthook.yml` y su script) y los archivos `.example`.
2. **Archivos de Documentación (Cero Colisiones):** En tu proyecto, crea una carpeta dedicada (ej. `docs/qa/`). Coloca allí el `AI_MASTER_PROMPT.md` y la carpeta `docs/` global de este repositorio. **NO copies** nuestro `README.md`, `CONTRIBUTING.md` ni `CHANGELOG.md` a tu proyecto, ya que chocarán con los tuyos.
3. **Delega la Fusión a la IA:** Abre tu chat o terminal con el agente y pégale este *prompt* exacto:
   > *"Lee las directrices operativas en `docs/AI_MASTER_PROMPT.md` (o la ruta donde lo hayas puesto). Necesito integrar el estándar QA 11X en este proyecto. Lee los archivos `.example` que acabo de añadir (como `package.json.example`, `pyproject.toml.example`, `gitignore.example`) y realiza una **fusión no destructiva** con mis archivos de configuración reales. Añade todas las herramientas de QA, dependencias de desarrollo y scripts, pero respeta y mantén intactas las dependencias y configuraciones que mi proyecto ya tenía."*
4. Asegúrate de ajustar el *tag* de la imagen en tu `docker-compose.qa.yml` fusionado para que coincida con la versión de tu proyecto en producción (ej. `base-python-uv:3.12` o `base-node-ionic:22`).
5. **Ejecución:** A partir de ahora, ordénale a la IA que cree o ejecute pruebas utilizando exclusivamente los comandos del contenedor efímero descritos en las guías.
