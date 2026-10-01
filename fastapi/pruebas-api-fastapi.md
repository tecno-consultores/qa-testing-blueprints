> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y Validación para API (FastAPI)

Este documento contiene las instrucciones ("prompt") que debes seguir como asistente de IA o desarrollador para generar, estructurar y ejecutar pruebas automatizadas en APIs construidas con FastAPI, integrando métricas avanzadas de complejidad y consumo de memoria.

## 1. Reglas Estrictas de Ejecución (Docker)
**NUNCA** debes instruir la construcción de imágenes locales. Todo se ejecuta de forma efímera usando nuestras imágenes oficiales en el orquestador de QA:
*   Para la API, pruebas lógicas, contratos, profiling y estrés: `sinfallas/base-python-uv:<tag>`.
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`.

**Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para aislar la infraestructura de pruebas. El contenedor de pruebas cuenta con el privilegio `SYS_PTRACE` habilitado para permitir la intercepción de memoria del *profiler*.
La instalación de dependencias en Python se hace al vuelo con:
`uv pip install --system -e '.[dev]'`

## 2. Pila Tecnológica Requerida
La estrategia de validación de FastAPI abarca múltiples capas con exigencias de nivel corporativo. Debes configurar:

*   **Calidad de Código y Seguridad:** `ruff`, `mypy`, `uv pip audit` (CVEs) y `bandit` (SAST).
*   **Análisis de Complejidad (Deuda Técnica):** `radon` (Mantenibilidad y complejidad ciclomática estricta).
*   **Profiling (Memoria y CPU):** `py-spy` (Generación de Flamegraphs para detectar cuellos de botella y *memory leaks*).
*   **Lógica Interna e Intercepción:** `pytest`, `pytest-cov` (>95%), `pytest-mock` (para aislar DB/Red externa) y `httpx` (para el `TestClient` asíncrono).
*   **Mutación y Matriz:** `mutmut` y `tox`.
*   **Pruebas de Contrato (Fuzzing):** `schemathesis` (bombardeo de endpoints basado en `openapi.json`).
*   **Comportamiento (BDD):** `Karate Labs` (escribiendo escenarios Gherkin en `.feature`).
*   **Pruebas de Carga:** `locust` (simulación de concurrencia).

## 3. Arquitectura de las Pruebas a Generar

### A. Lógica Interna y Mocking (`pytest` + `TestClient` + `pytest-mock`)
*   Usa `httpx` y `TestClient` para simular peticiones sin levantar el servidor Uvicorn real.
*   Es obligatorio el uso de `pytest-mock` (mocker) para simular conexiones a bases de datos, cachés de Redis o servicios externos de terceros. Ninguna prueba unitaria puede depender de latencia de red.

### B. Análisis de Complejidad y Profiling (`radon` + `py-spy`)
*   **Regla de Complejidad:** Ningún bloque de código (función o método) puede tener una complejidad ciclomática de grado `C` o superior. Todo debe ser grado `A` o `B`. El índice de mantenibilidad (MI) no debe caer por debajo de `A`.
*   **Profiling:** Antes de pases a producción, se debe perfilar la aplicación bajo carga utilizando `py-spy` para generar un *Flamegraph* visual (`profile.svg`) que evidencie funciones con alto bloqueo del *Event Loop* de asyncio.

### C. Pruebas BDD (`Karate Labs`)
*   Escribe archivos `.feature` en la carpeta `test/`. Evalúa la API viva desde la perspectiva de un cliente externo, validando flujos completos (ej. Login -> Obtener Token -> Consultar Perfil -> Flujo de error intencional).

### D. Contratos y Estrés
*   Usa `schemathesis` para validar que la API viva nunca arroje errores 500 no controlados por fallos en los esquemas Pydantic.
*   Usa `locustfile.py` para definir el comportamiento de usuarios virtuales y medir la latencia.

## 4. Comandos de Ejecución Local

Para que las herramientas de caja negra funcionen (Karate, Schemathesis, Locust, py-spy), la aplicación debe estar escuchando peticiones en la red de Docker. 

**Paso 1: Levantar la API en segundo plano**
```bash
docker compose -f docker-compose.qa.yml up -d api
```

**Paso 2: Ejecutar las suites de validación (Pipeline Completo)**

*   **Auditoría, Complejidad y Seguridad Estática:**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && uv pip audit && bandit -r src/ && radon cc --min C src/ && radon mi --min B src/"
```

*   **Pruebas Unitarias Internas y Cobertura:**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && pytest --cov=src/ --cov-fail-under=95 -v"
```

*   **Pruebas de Mutación (Evaluar solidez de los mocks y asserts):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && mutmut run"
```

*   **Validación Completa Pre-Commit (Tox):**
```bash
docker compose -f docker-compose.qa.yml run --rm -e UV_PYTHON_DOWNLOADS=true test bash -c "uv pip install --system -e '.[dev]' && tox"
```

*   **Profiling Acumulativo (CPU/RAM Flamegraph):**
```bash
# Requiere que la API viva reciba tráfico simultáneo (ej. disparando Locust o Schemathesis al mismo tiempo)
docker compose -f docker-compose.qa.yml exec -T api bash -c "py-spy record -o /app/profile.svg --pid 1 --duration 30"
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
