# QA Testing Blueprints

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba y "prompts" (instrucciones) diseñados para instruir a agentes de Inteligencia Artificial (como Hermes, Claude Code o ChatGPT) y desarrolladores en la creación de suites de validación de nivel corporativo.

Este proyecto estandariza la forma en que probamos nuestro software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros**, sin contaminar la máquina local y utilizando un conjunto predefinido de herramientas de alta calidad.

## 🚀 Filosofía Principal

1. **Cero Compilaciones Locales:** No utilizamos `docker build`. Toda la infraestructura se levanta consumiendo las imágenes oficiales `sinfallas/base-python-uv:3.13` y `sinfallas/karatelabs:latest`.
2. **Dependencias al Vuelo:** Los paquetes (Python/NPM) se resuelven y cachean en tiempo de ejecución (`uv pip install` o `npm install`) dentro del contenedor efímero.
3. **Validación Transversal:** No solo probamos si el código funciona. Validamos seguridad (SAST), tipado, mutación de lógica, contratos, accesibilidad y rendimiento.

---

## 📁 Estructura del Repositorio y Casos de Uso

El repositorio está dividido en tres ecosistemas. Cada carpeta contiene un archivo `.md` (el prompt para la IA), un `docker-compose.yml` preconfigurado y los archivos de configuración (`pyproject.toml`, `package.json`, etc.) listos para usarse.

### 🐍 `python/` (Scripts Standalone y Librerías)
**Objetivo:** Máxima resiliencia estructural e invulnerabilidad lógica.
* **¿Qué incluye?** Configuración para linting estricto (`ruff`), tipado (`mypy`), pruebas unitarias/integración (`pytest`), cobertura, auditoría de dependencias (`uv pip audit`), seguridad SAST (`bandit`), pruebas de mutación (`mutmut`) y matriz de compatibilidad (`tox`).
* **Cómo usarlo:** Copia esta carpeta si estás desarrollando un script de automatización o una librería pura en Python que no expone puertos web.

### ⚡ `fastapi/` (APIs Backend)
**Objetivo:** Contratos inquebrantables, comportamiento de negocio validado y rendimiento bajo presión.
* **¿Qué incluye?** Todo lo de la carpeta `python/`, pero añade un enfoque multi-contenedor. La API corre en segundo plano mientras es atacada por pruebas de lógica interna (`httpx/TestClient`), validación de contratos y fuzzing (`schemathesis`), flujos BDD de caja negra (`Karate Labs`) y pruebas de concurrencia (`locust`).
* **Cómo usarlo:** Copia esta carpeta cuando construyas microservicios o backends que exponen endpoints REST/OpenAPI.

### 🟢 `vue3/` (Frontend UI)
**Objetivo:** UI sin regresiones visuales, componentes reactivos, accesibilidad y flujos de usuario reales.
* **¿Qué incluye?** Un ecosistema donde Nginx sirve tu compilado de producción, mientras contenedores efímeros ejecutan pruebas unitarias (`Vitest`), regresión visual y accesibilidad (`Playwright` + `@axe-core`), y pruebas de aceptación BDD en el navegador (`Karate Labs`).
* **Cómo usarlo:** Copia esta carpeta para cualquier proyecto de interfaz gráfica moderna en Vue 3.

---

## 🧠 ¿Cómo utilizar este repositorio con IA?

Si utilizas asistentes como **Hermes Agent**, **Claude Code**, **OpenCode** u otras IAs en tu terminal o editor:

1. Clona este repositorio o descarga la carpeta del lenguaje correspondiente a tu proyecto.
2. Copia los archivos de configuración (`pyproject.toml`, `docker-compose.yml`, `tox.ini`, scripts de limpieza) a la raíz de tu propio proyecto.
3. **Alimenta a la IA con el Prompt:** Abre un chat con tu IA y pégale el contenido completo del archivo `pruebas-[tecnologia].md` (ej. `pruebas-api-fastapi.md`).
4. Pídele a la IA: *"Lee estas directrices. A partir de ahora, genera todas las pruebas para mi proyecto siguiendo estrictamente las reglas, comandos y límites de herramientas descritos en este documento"*.
5. Ejecuta los comandos indicados en el documento para correr tus pruebas.
