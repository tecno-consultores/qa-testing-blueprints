# QA Testing Blueprints

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba y "prompts" (instrucciones) diseñados para instruir a agentes de Inteligencia Artificial (como Hermes, Claude Code o ChatGPT) y desarrolladores en la creación de suites de validación de nivel corporativo.

Este proyecto estandariza la forma en que probamos nuestro software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros**, sin contaminar la máquina local y utilizando un conjunto predefinido de herramientas de alta calidad.

## 🚀 Filosofía Principal (Estándar 10X)

1. **Cero Compilaciones Locales:** No utilizamos `docker build`. Toda la infraestructura se levanta consumiendo nuestra flota de imágenes oficiales en Docker Hub. Las imágenes base admiten *tags* específicos para igualar la versión de lenguaje de tu proyecto en producción:
   * `sinfallas/base-python-uv` (Tags: `3.10`, `3.11`, `3.12`, `3.13`, `3.14`, `latest`).
   * `sinfallas/base-node-ionic` (Tags: `22`, `23`, `24`, `25`, `latest`).
   * `sinfallas/base-bash-qa:latest` y `sinfallas/karatelabs:latest`.
2. **Dependencias al Vuelo y Aislamiento de Red:** Los paquetes se resuelven y cachean en tiempo de ejecución dentro del contenedor efímero. Las pruebas unitarias tienen estrictamente prohibido usar red real; deben usar librerías de Mocking (`nock`, `pytest-mock`).
3. **Validación Transversal (Métricas Innegociables):** No solo probamos si el código funciona. Validamos:
   * **Cobertura:** Ninguna suite pasa con menos del **95%**.
   * **Deuda Técnica:** El pipeline falla si hay código espagueti (Complejidad Ciclomática alta auditable por SonarJS o Radon).
   * **Rendimiento:** Exigimos Profiling de Memoria/CPU y un score perfecto en Core Web Vitals (Lighthouse).
   * **Seguridad y Mutación:** Prevención de inyecciones (SAST) y pruebas anti-falsos-positivos (Stryker/mutmut).

---

## 📁 Estructura del Repositorio y Casos de Uso

El repositorio está dividido en 4 ecosistemas que cubren la totalidad del desarrollo moderno y bash. Cada carpeta contiene un archivo `.md` (el prompt restrictivo para la IA), un `docker-compose.qa.yml` preconfigurado y los archivos de configuración nativos `.example` listos para usarse como referencia de fusión.

### 🐍 `python/` (Scripts Standalone y Librerías)
* **Objetivo:** Máxima resiliencia estructural, invulnerabilidad lógica y rendimiento matemático óptimo.
* **Stack:** Linting (`ruff`), Tipado (`mypy`), Pruebas (`pytest` + `pytest-mock`), BDD (`pytest-bdd`), Benchmarking (`pytest-benchmark`), Seguridad (`bandit`), Complejidad (`radon`), Profiling (`py-spy`), Mutación (`mutmut`) y Compatibilidad (`tox`).

### ⚡ `fastapi/` (APIs Backend)
* **Objetivo:** Contratos inquebrantables, comportamiento de negocio validado y rendimiento bajo extrema presión.
* **Stack:** Todo lo de Python, añadiendo ataques de integración (`httpx/TestClient`), validación de contratos (`schemathesis`), BDD de caja negra (`Karate Labs`) y concurrencia (`locust`).

### 🟩 `node-backend/` (APIs y Microservicios Node.js)
* **Objetivo:** Estandarización asíncrona, seguridad contra inyecciones, código limpio y validación funcional estricta.
* **Stack:** Pruebas e Intercepción (`Vitest` + `Supertest` + `nock`), Calidad y Complejidad (`ESLint` + `Prettier` + `SonarJS`), Seguridad (`ESLint Security` + `pnpm audit`), Mutación (`Stryker`), Profiling de Event Loop (`clinic.js`), Estrés (`Artillery`) y BDD (`Karate Labs`).

### 🟢 `vue3/` (Frontend UI)
* **Objetivo:** UI sin regresiones visuales, componentes reactivos, accesibilidad (WCAG 2.1) y máximo rendimiento (SEO/PWA).
* **Stack:** Pruebas Unitarias DOM (`Vitest` + `jsdom`), Calidad y Complejidad (`ESLint` + `Prettier` + `SonarJS`), Rendimiento de Build (`Lighthouse CI`), Regresión Visual y Accesibilidad (`Playwright` + `@axe-core`), Compatibilidad (`Browserslist`), Mutación Frontend (`Stryker`) y Aceptación BDD (`Karate Labs`).

### 🐧 `bash-scripts/` (DevOps y Automatización)
* **Objetivo:** Aislamiento absoluto y auditoría POSIX para scripts de infraestructura.
* **Stack:** Auditoría estricta (`ShellCheck`), formateo (`shfmt`), motor de pruebas unitarias (`BATS-core`), auditoría de cobertura (`kcov`), e intercepción nativa de comandos destructivos usando `bats-mock`.

---

## 🛠️ Matriz de Herramientas de Pruebas

A continuación se resume el stack de validación corporativo. Se han retirado los asteriscos de las herramientas ya implementadas y documentadas en este repositorio. Se indica `N/A` en las pruebas que no aplican por la naturaleza del entorno. *(El asterisco `*` denota tecnologías avanzadas planificadas para el estándar "11X").*

| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking | Cobertura | Auditoría de Dependencias | Seguridad Estática (SAST) | Mutación | BDD / Caja Negra | Concurrencia / Estrés | Profiling / Complejidad | DAST (Dinámica) | Ingeniería del Caos | Auditoría IaC / Docker | Git Hooks Locales |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Python** | `ruff` + `mypy` | `pytest` + `pytest-mock` | `pytest-cov` | `uv pip audit` | `bandit` | `mutmut` | `pytest-bdd` | `pytest-benchmark` | `py-spy` + `radon` | N/A | N/A | `Trivy` | `Lefthook` |
| **FastAPI** | `ruff` + `mypy` | `pytest` + `TestClient` | `pytest-cov` | `uv pip audit` | `bandit` | `mutmut` | `Karate Labs` | `locust` | `py-spy` + `radon` | `OWASP ZAP` | `Pumba`* | `Trivy` | `Lefthook` |
| **Node** | `ESLint` + `Prettier` | `Vitest` + `nock` | `Vitest (v8)` | `pnpm audit` | `ESLint Security` | `Stryker` | `Karate Labs` | `Artillery` | `clinic.js` + `SonarJS` | `OWASP ZAP` | `Pumba`* | `Trivy` | `Lefthook` |
| **Vue3** | `ESLint` + `Prettier` | `Vitest` + `jsdom` | `Vitest (v8)` | `npm audit` | `ESLint Security` | `Stryker` | `Karate Labs` | `Lighthouse CI` | `DevTools` + `SonarJS` | `N/A` | `N/A` | `Trivy` | `Lefthook` |
| **Bash** | `ShellCheck`+`shfmt`| `BATS-core`+`bats-mock`| `kcov` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `Trivy` | `Lefthook` |

---

## 📚 Base de Conocimiento y Documentación

Para entender los fundamentos de esta arquitectura y cómo automatizarla, consulta nuestros manuales:

* **[`FAQ.md`](./FAQ.md):** Resolución rápida a errores comunes, discos llenos o problemas de cobertura.
* **[`docs/qa-philosophy.md`](docs/qa-philosophy.md):** El "por qué" detrás de nuestras herramientas y la innegociable regla del 95%.
* **[`docs/ai-integration.md`](docs/ai-integration.md):** Cómo exponer este repositorio vía MCP para orquestar Agentes de IA autónomos.
* **[`docs/ci-cd-pipelines.md`](docs/ci-cd-pipelines.md):** Plantillas para integrar estas validaciones efímeras en GitHub Actions o GitLab CI.
* **[`docs/docker-troubleshooting.md`](docs/docker-troubleshooting.md):** Soluciones avanzadas para conflictos de red y virtualización anidada (LXC).

---

## 🧠 ¿Cómo utilizar este repositorio con IA?

Si utilizas asistentes como **Hermes Agent**, **Claude Code**, **OpenCode** u otras IAs en tu terminal o editor:

1. Clona este repositorio o descarga la carpeta de la tecnología correspondiente a tu proyecto.
2. **Integra sin sobreescribir (Proyectos Existentes):** Renombra el orquestador del blueprint a `docker-compose.qa.yml` y muévelo a la raíz de tu proyecto. Abre los archivos `.example` (como `pyproject.toml.example` o `package.json.example`) y copia ÚNICAMENTE las dependencias de desarrollo y bloques de configuración de QA hacia tus propios archivos preexistentes. Copia el contenido de `gitignore.example` al final de tu `.gitignore` actual y transfiere los scripts auxiliares como `limpieza.sh`.
3. Asegúrate de ajustar el *tag* de la imagen en tu `docker-compose.qa.yml` para que coincida con la versión de tu proyecto (ej. `base-python-uv:3.12` o `base-node-ionic:22`).
4. **Alimenta a la IA con el Prompt:** Abre un chat con tu IA y pégale el contenido completo del archivo `pruebas-[tecnologia].md` (ej. `pruebas-backend-node.md`).
5. Pídele a la IA: *"Lee estas directrices. A partir de ahora, genera todas las pruebas para mi proyecto siguiendo estrictamente las reglas, comandos y límites de herramientas descritos en este documento"*.
6. Ejecuta los comandos indicados en el documento para correr tus pruebas, recordando siempre incluir el orquestador de QA (ej. `docker compose -f docker-compose.qa.yml run --rm [servicio]`).
