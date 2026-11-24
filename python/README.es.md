> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, Profiling) especificados a continuación. No sugieras instalaciones locales. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, y emite tu respuesta final, explicaciones y comentarios de código en el idioma del prompt del usuario (por defecto español).

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía de Pruebas y Validación para Scripts Python (Standalone/Librerías)

Este documento contiene las instrucciones corporativas de Nivel 11X que DEBES seguir innegociablemente al generar código de pruebas para herramientas en Python puro (CLI, scripts automáticos o librerías internas).

## 1. Reglas Estrictas de Ejecución (Contenedores Efímeros No-Root y Caché)
**NUNCA** debes instruir la construcción de imágenes locales (`docker build`), instalaciones globales en el host ni ejecuciones como `root`. Toda ejecución corre en contenedores efímeros con UID/GID mapeado (`-u "$(id -u):$(id -g)"`), `HOME=/tmp`, `COVERAGE_FILE=/tmp/.coverage` y `UV_CACHE_DIR=/tmp/uv-cache`:
*   Para pruebas lógicas, contratos Pact, linting, tipado estricto y profiling: `sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4` (tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`).
*   Para pruebas de carga declarativas (`smoke|load|stress`) y SLOs: `grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276`.
*   Para Recolección de Métricas: `prom/prometheus:v2.55.1` (y Pushgateway si aplica).
*   Para AST Semántico Graphify: `sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0` (vía `./scripts/actualizar-grafos-graphify.sh`).

**Gestor de Paquetes:** La sincronización de dependencias usa `uv` respaldado por `/tmp/uv-cache` y librerías preinstaladas en la imagen v2 (`pact` 4.2.0, `ruff`, `mypy`, `pytest`, `pip-audit`).
**Obligatorio:** Utiliza las metas limpias del `Makefile` (`make qa-lint`, `make qa-unit`, y desde la raíz del catálogo `make test-backend-blueprints`) para preservar aislamiento total y cero archivos propiedad de `root`.

## 2. Pila Tecnológica Requerida
Al generar código, configurar el entorno o plantear soluciones, debes asegurar la implementación de estas herramientas:

*   **Linting y Formateo:** `ruff` (`C901` con complejidad máxima `<= 5` en pruebas críticas y módulos nuevos).
*   **Tipado Estricto:** `mypy --strict --cache-dir=/tmp/mypy` (prevención de excepciones en tiempo de ejecución).
*   **Seguridad y Auditoría:** `pip-audit` (CVEs de dependencias) y `bandit` (vulnerabilidades SAST en el código base).
*   **Análisis de Complejidad (Deuda Técnica):** `radon` (Mantenibilidad Grado A y complejidad ciclomática Grado `A`, `CC <= 5`).
*   **Profiling (Memoria y CPU):** `py-spy` (Detección de cuellos de botella mediante *Flamegraphs*).
*   **Pruebas Lógicas Base e Intercepción:** `pytest` como motor principal, potenciado obligatoriamente por `pytest-mock` y `unittest.mock` para aislar la red y dependencias externas.
*   **Contratos Consumer-Driven Zero-Infra (`Pact` V3/V4):** Paquete `pact` preinstalado exportando artefactos deterministas en `PACT_OUTPUT_DIR` (sin *Pact Broker* externo) sobre *Trimodal Fixtures* (`nominal_configured`, `virgin_empty`, `degraded_conflict`), serialización monetaria exacta con `Decimal` (prohibido `float`), cabecera obligatoria `Idempotency-Key` UUIDv4, errores RFC 7807 (`application/problem+json`) e inspección por ítem de respuestas batch (`results[].status`).
*   **Comportamiento BDD y Carga SLO (`k6`):** `pytest-bdd` para Gherkin local y `python/tests/load/smoke.k6.js` (`K6_PROFILE=smoke|load|stress`) para validar `p(95) < 250ms`, `p(99) < 500ms` y error `< 1%` sin falsos verdes.
*   **Cobertura (Coverage):** `pytest-cov` (se exige un mínimo del 95% con `COVERAGE_FILE=/tmp/.coverage`).
*   **Pruebas de Mutación:** `mutmut` (para validar si las pruebas fallan cuando el código lógico cambia).
*   **Perfil de Compatibilidad:** `tox` con `tox-uv` (compuerta de entorno único `py315` en `tox.ini.example`; para servicios con base de datos que requieran PostgreSQL 17 `FORCE RLS`, adopta el blueprint `fastapi/`).
*   **Observabilidad:** `prometheus_client`.

## 3. Arquitectura de las Pruebas a Generar

Cuando redactes código de pruebas (`tests/`) o lógica base (`src/`), debes separarlo estrictamente en estas áreas:

### A. Observabilidad en Código (Requisito Previo Innegociable)
Dependiendo de la naturaleza del script, debes instrumentarlo de una de estas dos formas:

1.  **Si es un Script Continuo (Daemon/Bot):** Inyecta un mini-servidor asíncrono en `src/main.py` para exponer métricas en el puerto 8000.
    ```python
    from prometheus_client import start_http_server
    if __name__ == '__main__':
        start_http_server(8000) # Expone métricas sin bloquear el script
        # ... resto de la lógica ...
    ```

2.  **Si es un Script Efímero (Batch Task / Cron):** Prometheus no tendrá tiempo de rasparlo. En su lugar, usa `push_to_gateway` para enviar las métricas recolectadas antes de que el script muera.
    ```python
    import logging
    from urllib.error import URLError
    from prometheus_client import CollectorRegistry, push_to_gateway
    # ... recolecta tus métricas en el registro ...
    if __name__ == '__main__':
        registry = CollectorRegistry()
        # ... lógica del script ...
        try:
            push_to_gateway('pushgateway:9091', job='batch_script', registry=registry)
        except (OSError, URLError) as exc:
            logging.warning("Pushgateway no disponible; métricas omitidas: %s", exc)
    ```

### B. Pruebas Unitarias (Mockeadas / Aisladas)
*   **Propósito:** Validar la lógica pura de la librería sin depender de red o credenciales.
*   **Frontera Estricta (Tool Boundary):** Todos los archivos de pruebas unitarias DEBEN nombrarse respetando el patrón `test_*.py` y no tener decoradores de integración.
*   **Regla:** Utiliza `pytest-mock` (el fixture `mocker`) o `@patch` para interceptar la red (ej. `requests`). Simula respuestas JSON exitosas y fallos catastróficos. NINGUNA prueba de este tipo puede tener latencia real.

### C. Pruebas de Integración (Reales)
*   **Propósito:** Validar contratos externos y la comunicación con servicios reales.
*   **Regla:** Usa `python-dotenv` para cargar variables de entorno. Utiliza el decorador `@pytest.mark.integration`. Estas pruebas SÍ requieren credenciales.

### D. Comportamiento y Benchmarking (`pytest-bdd` & `pytest-benchmark`)
*   **BDD:** Utiliza archivos `.feature` para describir el uso de la librería desde la perspectiva del usuario final y enlázalos usando `pytest-bdd`.
*   **Benchmarking:** Marca las funciones matemáticas pesadas o de procesamiento de datos con el fixture `benchmark` para asegurar que refactorizaciones futuras no degraden la velocidad.

### E. Complejidad Ciclomática (`radon`)
*   **Regla:** Ningún método generado puede superar el Grado `A` (`CC <= 5`) de complejidad ciclomática ni caer del Grado `A` en índice de mantenibilidad (MI). Aplica patrones `[DIRECTIVE-11X]` de `.agents/skills/tactical-patterns-11x/SKILL.md` (tablas de despacho, Parameter Object/DTO, cláusulas de guarda o pipelines) evitando micro-helpers pass-through.

### F. Ingestión Inteligente (Paso 0 - AST Graphify)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Antes de modificar código, consulta el grafo AST con `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` (o actualiza con `./scripts/actualizar-grafos-graphify.sh`). Además, DEBES leer las configuraciones de linters y dependencias definidos en `pyproject.toml` para adaptar tu código a las convenciones estrictas del repositorio y evitar rechazos en el CI/CD.

### G. Seguridad por Diseño Obligatoria (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   Todo script o librería en Python DEBE cumplir y probar los controles aplicables de **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)**:
    *   **Canonicalización y Ejecución Segura (`APSC-DV-002510, 002520`):** Normalizar entradas de texto con `unicodedata.normalize("NFKC", ...)` antes de validar y usar `subprocess.run([...], shell=False)` con rutas absolutas y listas blancas (prohibido `shell=True`, `os.system`, `eval`, `pickle.loads`, `yaml.load`).
    *   **XML/XXE y Archivos (`APSC-DV-002390, 002485, 002550`):** Deshabilitar DTDs y entidades externas en analizadores XML (`resolve_entities=False`, `no_network=True`), validar archivos por *Magic Bytes* y mapear rutas mediante índices en lista blanca.
    *   **Criptografía FIPS 140-3, Zeroización de Memoria, Logs y SBOM (`APSC-DV-000650, 001090, 001350, 002310, 002590, 003310` & `OWASP 4.3.9, 4.3.10, 5.3.4`):** Sobrescribir con ceros (`zeroize`) los búferes de memoria (`bytearray`) con secretos al salir de cada función, sanitizar CR/LF en logs con 0 credenciales registradas, fallar en estado seguro (*Fail-Closed*) y generar **CycloneDX SBOM** (`cyclonedx-py`).

## 4. Comandos de Ejecución Local para Desarrolladores (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Actualización del Grafo AST y Contratos Backend**
```bash
./scripts/actualizar-grafos-graphify.sh
# Desde la raíz del repositorio para certificar Pact Python->Node + k6 smoke + antipatrones:
make test-backend-blueprints
```

**Paso 1: Ejecución de las suites de validación**

*   **Auditoría SAST, Calidad, Complejidad y Formateo:**
```bash
make qa-lint
```

*   **Suite Unitaria (Aislada), BDD y Benchmarking (Cobertura innegociable >= 95%):**
```bash
make qa-unit
```

*   **Pruebas de Mutación (Solidez de Assertions):**
```bash
make qa-mutation
```

*   **Profiling (Generar Flamegraph de CPU en `reports/flamegraph.svg`) y SBOM CycloneDX (`reports/sbom.cdx.json`):**
```bash
# El sidecar profiler es la única excepción SYS_PTRACE con user: "0:0" (cap_drop: [ALL], cap_add: [SYS_PTRACE, DAC_OVERRIDE, CHOWN], seccomp:unconfined, .:/app:ro) y reasigna reports/flamegraph.svg a QA_UID:QA_GID (`mutmut_gates.py` valida >= 80% en qa-mutation):
make qa-profile
make qa-sbom
```

**Paso 2: Certificación de Observabilidad y Carga en Vivo (Nivel 11X)**
Usa `qa-backend` abajo para scripts batch con Pushgateway (`push_to_gateway('python_pushgateway:9091', ...)`), mientras los daemons HTTP raspados en `:8000` se ejecutan con `PYTHON_HTTP_CMD` en `python-api` (exponiendo `/health` + `/metrics`); `make qa-load` funciona listo para usar contra el stub `python-api` por defecto o con `PYTHON_HTTP_CMD` / `API_BASE_URL` propios, persistiendo `reports/k6-summary.json`.
```bash
make qa-observability
docker compose -f docker-compose.qa.yml run --rm -T -u "$(id -u):$(id -g)" qa-backend bash -c "uv sync --all-extras -q && uv run python src/main.py"
make qa-load
# Apagar el stack efímero y sus volúmenes al terminar (o ejecutar `make clean-cache`):
docker compose -f docker-compose.qa.yml --profile "*" down -v
```
*(Accede a `http://localhost:9090` durante la ejecución para evaluar el comportamiento de raspeo o push de métricas).*
