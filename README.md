# QA Testing Blueprints

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba y "prompts" (instrucciones) diseñados para instruir a agentes de Inteligencia Artificial (como Hermes, Claude Code o ChatGPT) y desarrolladores en la creación de suites de validación de nivel corporativo.

Este proyecto estandariza la forma en que probamos nuestro software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros**, sin contaminar la máquina local y utilizando un conjunto predefinido de herramientas de alta calidad.

## 🚀 Filosofía Principal

1. **Cero Compilaciones Locales:** No utilizamos `docker build`. Toda la infraestructura se levanta consumiendo nuestra flota de imágenes oficiales en Docker Hub. Las imágenes base admiten *tags* específicos para igualar la versión de lenguaje de tu proyecto en producción:
   * `sinfallas/base-python-uv` (Tags: `3.10`, `3.11`, `3.12`, `3.13`, `3.14`, `latest`).
   * `sinfallas/base-node-ionic` (Tags: `22`, `23`, `24`, `25`, `latest`).
   * `sinfallas/base-bash-qa:latest` y `sinfallas/karatelabs:latest`.
2. **Dependencias al Vuelo:** Los paquetes se resuelven y cachean en tiempo de ejecución (`uv pip install` o `pnpm install`) dentro del contenedor efímero para mantener la paridad absoluta con producción.
3. **Validación Transversal (Regla del 95%):** No solo probamos si el código funciona. Validamos seguridad (SAST), tipado, mutación de lógica, contratos y rendimiento. Es política corporativa que **ninguna suite pase si la cobertura de código es menor al 95%**.

---

## 📁 Estructura del Repositorio y Casos de Uso

El repositorio está dividido en 4 ecosistemas que cubren la totalidad del desarrollo moderno y bash. Cada carpeta contiene un archivo `.md` (el prompt restrictivo para la IA), un `docker-compose.yml` preconfigurado y los archivos de configuración nativos listos para usarse.

### 🐍 `python/` (Scripts Standalone y Librerías)
* **Objetivo:** Máxima resiliencia estructural e invulnerabilidad lógica.
* **Stack:** Linting estricto (`ruff`), tipado (`mypy`), pruebas (`pytest`), seguridad SAST (`bandit`), pruebas de mutación (`mutmut`) y matriz de compatibilidad (`tox`).

### ⚡ `fastapi/` (APIs Backend)
* **Objetivo:** Contratos inquebrantables, comportamiento de negocio validado y rendimiento bajo presión.
* **Stack:** Todo lo de Python, añadiendo ataques de integración (`httpx/TestClient`), validación de contratos (`schemathesis`), BDD de caja negra (`Karate Labs`) y concurrencia (`locust`).

### 🟩 `node-backend/` (APIs y Microservicios Node.js)
* **Objetivo:** Estandarización asíncrona, seguridad contra inyecciones y validación funcional estricta usando `pnpm`.
* **Stack:** Pruebas e integración (`Vitest` + `Supertest`), seguridad estática y vulnerabilidades (`ESLint Security` + `pnpm audit`), pruebas de mutación (`Stryker`), estrés/carga (`Artillery`) y caja negra (`Karate Labs`).

### 🟢 `vue3/` (Frontend UI)
* **Objetivo:** UI sin regresiones visuales, componentes reactivos, accesibilidad (a11y) y flujos de usuario reales.
* **Stack:** Servidor Nginx de producción interceptado por pruebas unitarias (`Vitest`), regresión visual del DOM (`Playwright` + `@axe-core`), y aceptación BDD en el navegador (`Karate Labs`).

### 🐧 `bash-scripts/` (DevOps y Automatización)
* **Objetivo:** Aislamiento absoluto y auditoría POSIX para scripts de infraestructura.
* **Stack:** Auditoría estricta (`ShellCheck`), formateo (`shfmt`), motor de pruebas unitarias (`BATS-core`), auditoría de cobertura (`kcov`), e intercepción nativa de comandos destructivos usando `bats-mock`. 

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
2. Copia los archivos de configuración (`pyproject.toml`, `package.json`, `docker-compose.yml`, scripts `limpiar.sh`) a la raíz de tu propio proyecto.
3. Asegúrate de ajustar el *tag* de la imagen en tu `docker-compose.yml` para que coincida con la versión de tu proyecto (ej. `base-python-uv:3.12` o `base-node-ionic:22`).
4. **Alimenta a la IA con el Prompt:** Abre un chat con tu IA y pégale el contenido completo del archivo `pruebas-[tecnologia].md` (ej. `pruebas-backend-node.md`).
5. Pídele a la IA: *"Lee estas directrices. A partir de ahora, genera todas las pruebas para mi proyecto siguiendo estrictamente las reglas, comandos y límites de herramientas descritos en este documento"*.
6. Ejecuta los comandos indicados en el documento para correr tus pruebas.
