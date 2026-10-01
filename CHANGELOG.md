# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [2.0.0] - 2026-10-01

### 🚀 Añadido (Added)
* **Política de Seguridad:** Creación del archivo `SECURITY.md` definiendo reglas de divulgación, manejo de volúmenes de Docker, inyección de secretos (`.env`) y contención de Agentes de IA.
* **Análisis de Complejidad (Deuda Técnica):** Integración de `eslint-plugin-sonarjs` para los ecosistemas Node.js y Vue 3, y de `radon` para el ecosistema Python. El pipeline ahora falla si el código supera la complejidad ciclomática de grado B.
* **Profiling de Rendimiento:** Incorporación de `clinic.js` (Node.js) y `py-spy` (Python) para generación de Flamegraphs y detección de cuellos de botella en memoria/CPU.
* **Mocking Estricto:** Obligatoriedad de interceptar la red en pruebas unitarias mediante `nock` (Node.js) y `pytest-mock` (Python) para garantizar determinismo y velocidad.
* **Regresión Visual y Web Vitals:** Integración de `Lighthouse CI` y configuración estricta de `Playwright` con `@axe-core` en Vue 3 para congelar animaciones y exigir cumplimiento WCAG 2.1 AA.
* **Formateo Estético:** Adición de `.prettierrc.example` para los entornos JavaScript/TypeScript, separando la lógica (`ESLint`) de la estética (`Prettier`).
* **Permisos Extendidos:** Configuración de `cap_add: - SYS_PTRACE` y `seccomp:unconfined` en los orquestadores `docker-compose.qa.yml` para habilitar la lectura de memoria de los Profilers de manera segura.

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
