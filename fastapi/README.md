> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y Validación para API (FastAPI)

Este documento contiene las instrucciones corporativas de Nivel 11X que DEBES seguir innegociablemente para generar, estructurar y ejecutar pruebas automatizadas en APIs construidas con FastAPI. El objetivo no es solo probar que el código funciona, sino garantizar su resiliencia bajo estrés extremo, auditar su complejidad y certificar su seguridad estática y dinámica.

## 1. Reglas Estrictas de Ejecución (Docker Efímero y Caché)
**NUNCA** debes instruir la construcción de imágenes locales (`docker build`) ni construir comandos manuales de `docker compose run`. Todo se ejecuta de forma efímera y segura a través del `Makefile` proporcionado, utilizando los cachés de volumen persistentes:
*   Para la API, pruebas lógicas, contratos, profiling y estrés: `sinfallas/base-python-uv:<tag>`.
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`.
*   Para Seguridad Dinámica (DAST): `zaproxy/zap-stable:latest`.
*   Para Persistencia Real y Validación de Esquemas (Anti-Mock Blindness): `postgres:17-alpine`.
*   Para Caché de Alto Rendimiento y Sesiones: `eqalpha/keydb:alpine`.
*   Para Ingeniería del Caos y Observabilidad: `gaiaadm/pumba:latest` y `prom/prometheus:latest`.
*   Para Optimización de Contexto IA (MCP): `sinfallas/remote-graphify:latest`.

**Obligatorio:** Utiliza metas de ejecución limpias (ej. `make qa-unit`) para aprovechar la configuración de `uv-cache`, evitando re-descargar dependencias masivamente.

## 2. Pila Tecnológica Requerida
La estrategia de validación de FastAPI abarca 13 capas transversales (Estándar Corporativo 11X). Debes configurar e integrar:

1.  **Calidad y Tipado Estricto:** `ruff` y `mypy` (`strict = true`).
2.  **Seguridad Estática (SAST):** `uv pip audit` (CVEs) y `bandit`.
3.  **Seguridad Dinámica (DAST):** `OWASP ZAP` (`zaproxy/zap-stable`) en escaneo *Baseline*.
4.  **Deuda Técnica:** `radon` (Complejidad ciclomática <= B, mantenibilidad grado A).
5.  **Profiling:** `py-spy` (Análisis de CPU/RAM mediante *Flamegraphs* sin bloquear Event Loop).
6.  **Lógica Unitaria e Intercepción:** `pytest`, `pytest-cov` (>95%), y `pytest-mock` (aislamiento puro de I/O externo).
7.  **Paridad de Esquema Real (Anti-Mock Blindness):** `Alembic` + `PostgreSQL 17` efímero auditado con `.agents/scripts/verify_alembic_orm_parity.py`.
8.  **Caché en Memoria Multi-Hilo:** `KeyDB` (`server-threads 4`) para operaciones atómicas, rate limiting y sesiones.
9.  **Fuzzing y Contratos:** `schemathesis` (Ataque basado en el estándar OpenAPI).
10. **Comportamiento (BDD):** `Karate Labs` (Escenarios funcionales Gherkin en `test/api_test.feature`).
11. **Pruebas de Mutación:** `mutmut` (Inserción de mutantes lógicos para auditar los *asserts*).
12. **Ingeniería del Caos:** `Pumba` orquestado con `Locust` (Inyección de latencia y auto-recovery).
13. **Observabilidad:** `prometheus-fastapi-instrumentator` (Métricas RED en tiempo real).

## 3. Arquitectura de las Pruebas a Generar

### A. Observabilidad en Código (Requisito Previo Innegociable)
*   Antes de realizar cualquier auditoría, DEBES asegurar que el archivo raíz de FastAPI (ej. `src/main.py`) esté instrumentado inyectando estas dos líneas exactas para exponer la ruta `/metrics` de manera no intrusiva:

```python
    from prometheus_fastapi_instrumentator import Instrumentator
    # Inyectar después de definir app = FastAPI():
    Instrumentator().instrument(app).expose(app)
```

### B. Lógica Interna, Mocking y Frontera Anti-Mock Blindness
*   Usa `httpx` y el `TestClient` nativo de FastAPI para simular peticiones sin depender de la red externa.
*   **Frontera Estricta (Tool Boundary):** Todos los archivos de pruebas unitarias DEBEN llamarse `.unit.py` o `.spec.py` para aislar su ejecución.
*   **Aislamiento Unitario:** En pruebas `.unit.py`, usa `pytest-mock` para aislar llamadas HTTP hacia terceros o APIs externas.
*   **Anti-Mock Blindness (Obligatorio en Persistencia):** NUNCA simules la base de datos con mocks ciegos para validar modelos SQLAlchemy o migraciones Alembic. Las pruebas de integración (`.int.py` o flujos de repositorio) DEBEN validarse contra el contenedor `postgres:17` efímero. Cada cambio en `src/models/` exige su correspondiente migración `alembic revision --autogenerate` verificada en PostgreSQL real.

### C. Análisis de Complejidad y Profiling (`radon` + `py-spy`)
*   **Regla de Complejidad:** Ningún bloque de código generado puede tener una complejidad ciclomática de grado `C` o superior. El índice de mantenibilidad (MI) debe ser `A`.
*   **Profiling:** Para endpoints pesados, perfilaremos la aplicación bajo carga utilizando `py-spy` para generar un *Flamegraph* visual (`profile.svg`) que evidencie bloqueos en el *Event Loop* asíncrono.

### D. Comportamiento y Caja Negra (`Karate Labs`)
*   Escribe archivos `.feature` en la carpeta `test/` (ej. `test/api_test.feature`). La API se considerará una caja negra opaca y será atacada a través de su puerto HTTP expuesto (8000).

### E. Contratos y Seguridad Dinámica (`Schemathesis` + `OWASP ZAP`)
*   `schemathesis` bombardeará el `openapi.json` con miles de combinaciones malformadas buscando provocar errores HTTP 500 no controlados por Pydantic.
*   `OWASP ZAP` actuará en modo *Baseline Scan* interceptando cabeceras faltantes (CORS, HSTS, X-Frame-Options) sin asfixiar el pipeline.

### F. Resiliencia Extrema (Ingeniería del Caos con Pumba)
*   Las pruebas de estrés tradicionales asumen una red perfecta. Con la configuración de perfil `--profile chaos`, Pumba inyectará latencia aleatoria (Jitter) y cortes temporales a nivel del Kernel de Linux directamente sobre el contenedor de FastAPI, mientras Locust envía oleadas de usuarios concurrentes. El objetivo es certificar que la arquitectura no entra en un interbloqueo (*deadlock*) cuando la infraestructura subyacente falla.

### G. Ingestión Inteligente (Paso 0 - MCP / AST CLI-First)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Si tienes capacidad de shell (Antigravity), inspecciona el AST y el radio de impacto directamente vía CLI (`python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"`), sin levantar demonios de fondo que ocupen el puerto 8080. Si eres un agente externo (Hermes, Claude), conéctate al servidor MCP `sinfallas/remote-graphify:latest`. Además, DEBES leer silenciosamente los lineamientos de linters y dependencias definidos en `pyproject.toml` para adaptar tu código a las reglas del repositorio y pasar las métricas en tu primer intento.

## 4. Comandos de Ejecución Local para Desarrolladores (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Ingestión de Contexto (Opcional para Agentes MCP)**
Extrae la topología del código y levanta tu servidor de contexto si requieres MCP externo:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "graphify extract --code-only"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
# (El Agente IA externo se conecta a http://localhost:8080/sse)
```

**Paso 1: Levantar la API y Servicios de Persistencia**
```bash
docker compose -f docker-compose.qa.yml up -d postgres keydb api
```

**Paso 2: Ejecutar las suites de validación estándar (Pipeline Regular)**

*   **Auditoría SAST, Linting y Complejidad:**
```bash
make qa-lint
```

*   **Pruebas Unitarias Aisladas (Cobertura innegociable >95%):**
```bash
make qa-unit
```

*   **Pruebas de Mutación (Solidez de Assertions):**
```bash
make qa-mutation
```

*   **Fuzzing y Contratos:**
```bash
docker compose -f docker-compose.qa.yml run --rm qa-backend bash -c "uv sync && uv run schemathesis run http://api:8000/openapi.json"
```

*   **Comportamiento BDD (Karate):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```

*   **Seguridad Dinámica DAST (OWASP ZAP):**
```bash
docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:8000 -r zap-report.html
```

*   **Profiling Acumulativo (Flamegraph):**
```bash
docker compose -f docker-compose.qa.yml exec -T api bash -c "py-spy record -o /app/profile.svg --pid 1 --duration 30"
```

**Paso 3: Certificación de Nivel 11X (Ingeniería del Caos y Observabilidad)**
Este comando activa el perfil oculto. Despierta a Pumba, Locust y Prometheus simultáneamente para estresar la API mientras se simula una degradación severa de la red.
```bash
docker compose -f docker-compose.qa.yml --profile chaos up --abort-on-container-exit stress_test
```
*(Durante el ataque, visualiza las métricas en `http://localhost:9090` o revisa `chaos-report.html` para validar la tasa de supervivencia de los requests).*
