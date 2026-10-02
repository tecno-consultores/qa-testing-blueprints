> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y Validación para Scripts Python (Standalone/Librerías)

Este documento contiene las instrucciones ("prompt") que debes seguir como asistente de IA o desarrollador para generar, estructurar y ejecutar pruebas automatizadas para proyectos Python bajo nuestro estándar corporativo (Nivel 11X).

## 1. Reglas Estrictas de Ejecución (Docker)
**NUNCA** debes instruir la construcción de imágenes locales mediante `docker build` o `build:` en el `docker-compose.yml`. Todo el entorno de pruebas debe ejecutarse de forma efímera utilizando las imágenes oficiales:
*   Para pruebas lógicas, benchmarking, profiling y dependencias: `sinfallas/base-python-uv:3.13`.
*   Para Recolección de Métricas: `prom/prometheus:latest`.
*   Para Optimización de Contexto IA (MCP): `sinfallas/remote-graphify:latest`.

**Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para utilizar la infraestructura de pruebas aislada sin afectar al proyecto anfitrión. El contenedor tiene privilegios extendidos (`SYS_PTRACE`) para permitir la intercepción de memoria del *profiler*.
La instalación de dependencias se realiza exclusivamente en tiempo de ejecución usando el gestor `uv`, a través del siguiente comando:
`uv pip install --system -e '.[dev]'`

## 2. Pila Tecnológica Requerida
Al generar código, configurar el entorno o plantear soluciones, debes asegurar la implementación de estas herramientas:

*   **Linting y Formateo:** `ruff` (validación de calidad de código visual y lógica temprana).
*   **Tipado Estricto:** `mypy` (prevención de excepciones en tiempo de ejecución).
*   **Seguridad y Auditoría:** `uv pip audit` (CVEs de dependencias) y `bandit` (vulnerabilidades SAST en el código base).
*   **Análisis de Complejidad (Deuda Técnica):** `radon` (Mantenibilidad y complejidad ciclomática).
*   **Profiling (Memoria y CPU):** `py-spy` (Detección de cuellos de botella mediante *Flamegraphs*).
*   **Pruebas Lógicas Base e Intercepción:** `pytest` como motor principal, potenciado obligatoriamente por `pytest-mock` y `unittest.mock` para aislar la red y dependencias externas.
*   **Comportamiento BDD:** `pytest-bdd` (Para validar flujos de negocio mediante sintaxis Gherkin).
*   **Rendimiento y Estrés Interno:** `pytest-benchmark` (Para medir regresiones de rendimiento en funciones críticas).
*   **Cobertura (Coverage):** `pytest-cov` (se exige un mínimo del 95%).
*   **Pruebas de Mutación:** `mutmut` (para validar si las pruebas fallan cuando el código lógico cambia).
*   **Matriz de Compatibilidad:** `tox` potenciado por `tox-uv`.
*   **Observabilidad:** `prometheus_client`.

## 3. Arquitectura de las Pruebas a Generar

Cuando redactes código de pruebas (`tests/`) o lógica base (`src/`), debes separarlo estrictamente en estas áreas:

### A. Observabilidad en Código (Requisito Previo Innegociable)
*   Si el script está diseñado para ejecutarse prolongadamente (daemons, bots o procesamiento batch), DEBES instrumentar el archivo principal (ej. `src/main.py`) inyectando un mini-servidor asíncrono para exponer métricas en el puerto 8000:
    ```python
    from prometheus_client import start_http_server
    if __name__ == '__main__':
        start_http_server(8000) # Expone métricas sin bloquear el script
        # ... resto de la lógica ...
    ```

### B. Pruebas Unitarias (Mockeadas / Aisladas)
*   **Propósito:** Validar la lógica pura de la librería sin depender de red o credenciales.
*   **Regla:** Utiliza `pytest-mock` (el fixture `mocker`) o `@patch` para interceptar la red (ej. `requests`). Simula respuestas JSON exitosas y fallos catastróficos. NINGUNA prueba de este tipo puede tener latencia real.

### C. Pruebas de Integración (Reales)
*   **Propósito:** Validar contratos externos y la comunicación con servicios reales.
*   **Regla:** Usa `python-dotenv` para cargar variables de entorno. Utiliza el decorador `@pytest.mark.integration`. Estas pruebas SÍ requieren credenciales.

### D. Comportamiento y Benchmarking (`pytest-bdd` & `pytest-benchmark`)
*   **BDD:** Utiliza archivos `.feature` para describir el uso de la librería desde la perspectiva del usuario final y enlázalos usando `pytest-bdd`.
*   **Benchmarking:** Marca las funciones matemáticas pesadas o de procesamiento de datos con el fixture `benchmark` para asegurar que refactorizaciones futuras no degraden la velocidad.

### E. Complejidad Ciclomática (`radon`)
*   **Regla:** Ningún método generado puede superar el grado `B` de complejidad ciclomática ni caer del grado `A` en índice de mantenibilidad (MI). Si el código es muy complejo, divídelo.

### F. Optimización de Contexto IA (MCP) -> `Graphify`
*   **Regla (Exclusiva para ti, IA):** Antes de ingerir código masivamente, DEBES generar y consultar el grafo semántico del proyecto para ahorrar tokens y evitar alucinaciones.

## 4. Comandos de Ejecución Local para Desarrolladores (y para la IA)

Utiliza estos comandos asumiendo que existe el orquestador aislado `docker-compose.qa.yml`:

**Paso 0: Ingestión de Contexto (Obligatorio para la IA antes de programar)**
Extrae la topología del código y levanta tu servidor de contexto:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "uvx graphifyy extract"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
```
*Conéctate a `http://localhost:8080/sse` para consultar las relaciones del código de forma eficiente.*

**Paso 1: Ejecución de las suites de validación**

*   **Auditoría Estática, Complejidad y Seguridad:**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && uv pip audit && bandit -r src/ && radon cc --min C src/ && radon mi --min B src/"
```

*   **Suite Unitaria (Aislada), BDD y Rendimiento (Cobertura > 95%):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && pytest -m 'not integration' --cov=src/ --cov-fail-under=95 -v"
```

*   **Prueba Exclusiva de Integración (Conexión Real):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && pytest -m integration -v"
```

*   **Pruebas de Mutación (Evaluar solidez de los tests):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && mutmut run"
```

*   **Profiling (Generar Flamegraph de CPU para el script):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && py-spy record -o profile.svg -- python src/main.py"
```

*   **Validación Completa Pre-Commit (Pipeline Tox con Matriz):**
```bash
docker compose -f docker-compose.qa.yml run --rm -e UV_PYTHON_DOWNLOADS=true test bash -c "uv pip install --system -e '.[dev]' && tox"
```

**Paso 2: Certificación de Observabilidad en Vivo (Nivel 11X)**
Si el script es persistente (daemon) y fue instrumentado, ejecútalo en conjunto con Prometheus para perfilar sus métricas en vivo.
```bash
docker compose -f docker-compose.qa.yml --profile observability up -d prometheus
docker compose -f docker-compose.qa.yml run --rm test bash -c "uv pip install --system -e '.[dev]' && python src/main.py"
```
*(Accede a `http://localhost:9090` durante la ejecución para evaluar el comportamiento).*
