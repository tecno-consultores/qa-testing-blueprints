> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, Profiling) especificados a continuación. No sugieras instalaciones locales. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, pero emite tu respuesta final, explicaciones y comentarios de código en español.

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía de Pruebas y Validación para API (FastAPI)

Este documento contiene las instrucciones corporativas de Nivel 11X que DEBES seguir innegociablemente para generar, estructurar y ejecutar pruebas automatizadas en APIs construidas con FastAPI. El objetivo no es solo probar que el código funciona, sino garantizar su resiliencia bajo estrés extremo, auditar su complejidad y certificar su seguridad estática y dinámica.

## 1. Reglas Estrictas de Ejecución (Docker Efímero y Caché)
**NUNCA** debes instruir la construcción de imágenes locales (`docker build`) ni construir comandos manuales de `docker compose run`. Todo se ejecuta de forma efímera y segura a través del `Makefile` proporcionado, utilizando los cachés de volumen persistentes:
*   Para la API, pruebas lógicas, contratos, profiling y estrés: `sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4` (tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`).
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89`.
*   Para Seguridad Dinámica (DAST): `zaproxy/zap-stable:2.15.0`.
*   Para Persistencia Real y Validación de Esquemas (Anti-Mock Blindness): `postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065`.
*   Para Caché de Alto Rendimiento y Sesiones: `eqalpha/keydb:6.3.4`.
*   Para Ingeniería del Caos y Observabilidad: `gaiaadm/pumba:0.10.1` y `prom/prometheus:v2.55.1`.
*   Para Extracción Efímera de Grafo AST (Graphify CLI): `sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0`.

**Obligatorio:** Utiliza metas de ejecución limpias (ej. `make qa-unit`) para aprovechar la configuración de `uv-cache`, evitando re-descargar dependencias masivamente.

## 2. Pila Tecnológica Requerida
La estrategia de validación de FastAPI abarca 13 capas transversales (Estándar Corporativo 11X). Debes configurar e integrar:

1.  **Calidad y Tipado Estricto:** `ruff` y `mypy` (`strict = true`).
2.  **Seguridad Estática (SAST):** `pip-audit` (CVEs) y `bandit`.
3.  **Seguridad Dinámica (DAST):** `OWASP ZAP` (`zaproxy/zap-stable`) en escaneo *Baseline*.
4.  **Deuda Técnica:** `radon` (Complejidad ciclomática Grado A, `CC <= 5`; mantenibilidad Grado A).
5.  **Profiling:** `py-spy` (Análisis de CPU/RAM mediante *Flamegraphs* sin bloquear Event Loop).
6.  **Lógica Unitaria e Intercepción:** `pytest`, `pytest-cov` (>95%), y `pytest-mock` (aislamiento puro de I/O externo).
7.  **Paridad de Esquema Real (Anti-Mock Blindness):** `Alembic` + `PostgreSQL 17` efímero auditado con `.agents/scripts/verify_alembic_orm_parity.py`.
8.  **Caché en Memoria Multi-Hilo:** `KeyDB` (`server-threads 2`) para operaciones atómicas, rate limiting y sesiones.
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
*   **Regla de Complejidad:** Ningún bloque de código generado puede superar complejidad ciclomática Grado `A` (`CC <= 5`). El índice de mantenibilidad (MI) debe ser Grado `A`.
*   **Profiling:** Para endpoints pesados, perfilaremos la aplicación bajo carga utilizando `py-spy` para generar un *Flamegraph* visual (`profile.svg`) que evidencie bloqueos en el *Event Loop* asíncrono.

### D. Comportamiento y Caja Negra (`Karate Labs`)
*   Escribe archivos `.feature` en la carpeta `test/` (ej. `test/api_test.feature`). La API se considerará una caja negra opaca y será atacada a través de su puerto HTTP expuesto (8000).

### E. Contratos y Seguridad Dinámica (`Schemathesis` + `OWASP ZAP`)
*   `schemathesis` bombardeará el `openapi.json` con miles de combinaciones malformadas buscando provocar errores HTTP 500 no controlados por Pydantic.
*   `OWASP ZAP` actuará en modo *Baseline Scan* interceptando cabeceras faltantes (CORS, HSTS, X-Frame-Options) sin asfixiar el pipeline.

### F. Resiliencia Extrema (Ingeniería del Caos con Pumba)
*   Las pruebas de estrés tradicionales asumen una red perfecta. Con la configuración de perfil `--profile chaos`, Pumba inyectará latencia aleatoria (Jitter) y cortes temporales a nivel del Kernel de Linux directamente sobre el contenedor de FastAPI, mientras Locust envía oleadas de usuarios concurrentes. El objetivo es certificar que la arquitectura no entra en un interbloqueo (*deadlock*) cuando la infraestructura subyacente falla.

### G. Ingestión Inteligente (Paso 0 - Graphify AST CLI-First)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Extrae o refresca el grafo AST mediante el extractor CLI efímero (`./scripts/actualizar-grafos-graphify.sh fastapi`) y consulta invocadores/invocados vía `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` (o la herramienta MCP `inspect_ast_blast_radius`), sin levantar demonios en el puerto 8080. Además, DEBES leer silenciosamente los lineamientos de linters y dependencias definidos en `pyproject.toml` para adaptar tu código a las reglas del repositorio y pasar las métricas en tu primer intento.

### H. Seguridad por Diseño Obligatoria (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   Al programar o auditar endpoints en FastAPI, DEBES implementar y cubrir con pruebas unitarias/BDD los **22 patrones de [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)**:
    *   **Sesiones e Identidad (`APSC-DV-000010, 000070, 000080, 000300, 000320, 000530` & `OWASP 4.3.7`):** Límites de sesiones concurrentes en KeyDB, *idle timeouts* por rol (**10 min** admin / **15 min** operador), rotación de ID de sesión con CSPRNG validado, bloqueo de cuenta tras **3 intentos fallidos en 15 min** con verificación Argon2id en tiempo constante (`DUMMY_ARGON2_HASH`), política STIG de 15 caracteres/5 generaciones y expiración de cuentas temporales (72h) e inactivas (35d).
    *   **Validación, Canonicalización y Archivos (`APSC-DV-002390, 002485, 002510, 002520, 002960` & `OWASP 4.3.5, 4.3.6`):** `ConfigDict(extra="forbid")`, normalización Unicode `NFKC` antes de validar, prohibición absoluta de `shell=True`/`pickle`/`yaml.load`, XML sin DTD ni entidades externas (`resolve_entities=False`, `no_network=True`), y validación de archivos por *Magic Bytes* y mapas de índices en lista blanca.
    *   **Auditoría Inmutable, Fail-Secure, OSHP y API Top 10 (`APSC-DV-000450, 000650, 001090, 001350, 002310, 002590, 002770, 003310` & `OWASP 4.3.9, 4.3.10, 5.3.4, 5.4.4, 7.8`):** Logs UTC encadenados con HMAC-SHA256 libres de inyección CR/LF y con 0 secretos/tokens, alerta al **75% de almacenamiento de auditoría**, zeroización de búferes de secretos en memoria, purga de credenciales en exportaciones de BD, cabeceras **OWASP OSHP**, arranque *Fail-Secure* con auto-verificación criptográfica, cuotas anti-data-mining, mitigación de BOLA/BOPLA/BFLA, modelo de amenazas como código (`pytm`) y generación de **CycloneDX SBOM/CBOM**.

## 4. Comandos de Ejecución Local para Desarrolladores (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Ingestión de Contexto y Grafo AST (`CLI-First`)**
Extrae/actualiza el grafo de conocimiento AST del código fuente y consulta el radio de impacto antes de editar:
```bash
./scripts/actualizar-grafos-graphify.sh fastapi
python3 .agents/scripts/inspect_blast_radius.py "<simbolo_o_archivo>"
```

**Paso 1: Levantar la API y Servicios de Persistencia**
```bash
docker compose -f docker-compose.qa.yml up -d postgres keydb api
# Apagar el stack efímero y sus volúmenes al terminar (o ejecutar `make clean-cache`):
docker compose -f docker-compose.qa.yml --profile "*" down -v
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

*   **Paridad de Esquema y Migraciones (PostgreSQL 17):**
```bash
make qa-migration
```

*   **Integración Cross-Módulo (Sin Mocks Ciegos):**
```bash
make qa-integration
```

*   **Fuzzing y Contratos:**
```bash
docker compose -f docker-compose.qa.yml run --rm -T -u "$(id -u):$(id -g)" qa-backend bash -c "uv run schemathesis run http://api:8000/openapi.json"
```

*   **Comportamiento BDD (Karate):**
```bash
make qa-bdd
```

*   **Seguridad Dinámica DAST (OWASP ZAP):**
```bash
make qa-dast
```

*   **Profiling Acumulativo (Flamegraph):**
```bash
# Adjuntar py-spy a un PID existente en un contenedor endurecido requiere CAP_SYS_PTRACE (`--cap-add SYS_PTRACE`) o mismo UID; ejecuta `make clean-cache` / `down -v` al finalizar.
docker compose -f docker-compose.qa.yml exec -T -u "$(id -u):$(id -g)" api bash -c "py-spy record -o /tmp/profile.svg --pid 1 --duration 30"
```

**Paso 3: Certificación de Nivel 11X (Ingeniería del Caos y Observabilidad)**
Este comando activa el perfil oculto. Despierta a Pumba, Locust y Prometheus simultáneamente para estresar la API mientras se simula una degradación severa de la red.
```bash
make qa-chaos
```
*(Durante el ataque, visualiza las métricas en `http://localhost:9090` o revisa `chaos-report.html` para validar la tasa de supervivencia de los requests).*
