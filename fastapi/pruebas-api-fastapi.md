# Guía de Pruebas y Validación para API (FastAPI)

Este documento contiene las instrucciones ("prompt") que debes seguir como asistente de IA o desarrollador para generar, estructurar y ejecutar pruebas automatizadas en APIs construidas con FastAPI.

## 1. Reglas Estrictas de Ejecución (Docker)
**NUNCA** debes instruir la construcción de imágenes locales. Todo se ejecuta de forma efímera usando nuestras imágenes oficiales en el orquestador de QA:
*   Para la API, pruebas lógicas, contratos y estrés: `sinfallas/base-python-uv:<tag>`
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`

**Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para aislar la infraestructura de pruebas.
La instalación de dependencias en Python se hace al vuelo con:
`uv pip install --system -e '.[dev]'`

## 2. Pila Tecnológica Requerida
La estrategia de validación de FastAPI abarca múltiples capas. Debes configurar:

*   **Calidad de Código y Seguridad:** `ruff`, `mypy`, `uv pip audit` (CVEs) y `bandit` (SAST).
*   **Mutación y Matriz:** `mutmut` y `tox`.
*   **Lógica Interna e Integración:** `pytest`, `pytest-cov` (>95%), `python-dotenv` y `httpx` (para el `TestClient` asíncrono).
*   **Pruebas de Contrato (Fuzzing):** `schemathesis` (bombardeo de endpoints basado en `openapi.json`).
*   **Comportamiento (BDD):** `Karate Labs` (escribiendo escenarios Gherkin en `.feature`).
*   **Pruebas de Carga:** `locust` (simulación de concurrencia).

## 3. Arquitectura de las Pruebas a Generar

### A. Lógica Interna (`pytest` + `TestClient`)
*   Usa `httpx` y `TestClient` para simular peticiones sin levantar el servidor Uvicorn real.
*   Simula (mock) las conexiones a bases de datos o servicios externos de terceros.

### B. Pruebas BDD (`Karate Labs`)
*   Escribe archivos `.feature` en la carpeta `test/`. Evalúa la API viva desde la perspectiva de un cliente externo, validando flujos completos (ej. Login -> Obtener Token -> Consultar Perfil).

### C. Contratos y Estrés
*   Usa `schemathesis` para validar que la API viva nunca arroje errores 500 no controlados por fallos en los esquemas Pydantic.
*   Usa `locustfile.py` para definir el comportamiento de usuarios virtuales y medir la latencia.

## 4. Comandos de Ejecución Local

Para que las herramientas de caja negra funcionen (Karate, Schemathesis, Locust), la aplicación debe estar escuchando peticiones en la red de Docker. 

**Paso 1: Levantar la API en segundo plano**
```bash
docker compose -f docker-compose.qa.yml up -d api
```

**Paso 2: Ejecutar las suites de validación**

*   **Auditoría y Pruebas Unitarias Internas (NO requieren la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && uv pip audit && bandit -r src/ && pytest -v"
```

*   **Pruebas de Mutación (Evaluar solidez de los tests internos):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && mutmut run"
```

*   **Validación Completa Pre-Commit (Pipeline Tox con Matriz de Python):**
```bash
docker compose -f docker-compose.qa.yml run --rm -e UV_PYTHON_DOWNLOADS=true test bash -c "uv pip install --system -e '.[dev]' && tox"
```

*   **Fuzzing y Contratos (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && schemathesis run http://api:8000/openapi.json"
```

*   **Comportamiento BDD con Karate (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```

*   **Pruebas de Carga con Locust (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && locust -f locustfile.py --headless -u 100 -r 10 -t 1m --host http://api:8000"
```
