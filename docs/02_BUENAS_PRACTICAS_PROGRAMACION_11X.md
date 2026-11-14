# 🛡️ Buenas Prácticas de Programación y Arquitectura (Nivel 11X)

> **PROPÓSITO:**  
> Este manual recopila las lecciones aprendidas en proyectos de misión crítica sobre desarrollo seguro, arquitectura resiliente y diseño de interfaces operativas. Va más allá de las herramientas de prueba, abordando las trampas arquitectónicas que los desarrolladores y agentes de IA deben evitar activamente.

---

## 1. Anti-Mock Blindness (Erradicación de la Ceguera de Mocks)

### El Problema
El aislamiento mediante mocks (`pytest-mock`, `unittest.mock`, `nock`) permite obtener un 100% de cobertura en milisegundos, pero crea una ilusión peligrosa:
- El desarrollador mockea una llamada a base de datos asumiendo que la columna `status` acepta `NULL`.
- La prueba unitaria pasa con éxito en CI/CD.
- En producción, la tabla real tiene `NOT NULL` y la aplicación colapsa con un error 500 de integridad SQL.

### La Solución 11X
1. **Cero Deriva de Esquema (Schema Drift):**
   - Modificar un modelo ORM (SQLAlchemy, Prisma, TypeORM) no altera la base de datos mágicamente.
   - Todo cambio de modelo, nueva columna o restricción (`UniqueConstraint`) requiere una migración versionada inmediata (ej. Alembic).
   - Validar automáticamente la paridad entre modelos y migraciones usando `.agents/scripts/verify_alembic_orm_parity.py`.
2. **Verificación en Motores Reales de Base de Datos:**
   - La suite de integración y los contratos deben ejecutarse contra un contenedor real de PostgreSQL levantado en `docker-compose.qa.yml`. Nunca des por válida una consulta SQL hasta que PostgreSQL la haya ejecutado sin mocks.

### 1.1. Invariante Anti-Silo y Anti-Ceguera UAT (Las 11 Reglas Obligatorias de Diseño de Pruebas)
La cobertura unitaria (`>= 95%`) mide el porcentaje de líneas ejecutadas, pero es ciega ante desconexiones entre módulos, timeouts cortos enmascarados por mocks instantáneos, asimetrías en flujos pre-autenticación, contenedores que caen en `unhealthy` tras superar suites aisladas, binarios duales `CLI + MCP stdio` que bloquean terminales humanas o cambios de firma en SDKs ocultados por mocks (*Silo & Pipe Mock Blindness*). Toda suite bajo el Estándar QA 11X debe cumplir estas **11 reglas obligatorias de diseño de pruebas** (en paridad 1:1 con `qa-11x-architect` §2.1):

1. **Propagación Transversal de Estado sin Mocks Intermedios (*Cross-Module State Propagation*):**
   - Está estrictamente prohibido dar por válido un test de mutación verificando únicamente el `HTTP 200/201` del endpoint mutador (ej. `POST /api/v1/maintenance/windows` o cambio de estado administrativo) mientras los módulos consumidores (ej. Wallboard NOC o Inventario) se prueban con fixtures estáticos escritos a mano.
   - Cuando una operación en el Módulo A modifica el estado operativo de una entidad, la suite de pruebas DEBE invocar inmediatamente los endpoints de consulta (`GET`, ej. `GET /api/v1/inventory/routers`) y stores de los Módulos B consumidores **sin mocks intermedios**, certificando que el estado efectivo, contadores KPI, insignias y mapas reflejan la mutación de extremo a extremo.
2. **Aserción Obligatoria de las 3 Fases Temporales (*3-Phase Temporal Lifecycle Assertion*):**
   - Toda entidad o flujo gobernado por ventanas de tiempo, cronómetros o TTL (`starts_at` / `ends_at`, ventanas de confirmación/rollback Safe Mode de 60s, expiración de tokens Step-Up de 30s, leases temporales) DEBE probarse obligatoriamente en sus **3 fases del reloj** (prohibiendo ternarios binarios de 2 estados como `is_cancelled ? 'Cancelada' : 'Programada'`):
     - **Fase 1 (`t < starts_at`):** Estado Programado / Pendiente (`Programada`).
     - **Fase 2 (`starts_at <= t <= ends_at`):** Estado Activo / En Curso (`En Curso` / `Activa`, verificando que el recurso programado o scheduler permanezca vivo más allá de los 50ms de la petición HTTP y proyecte el estado activo a todos los módulos consumidores).
     - **Fase 3 (`t > ends_at` o Cancelado):** Estado Expirado / Purgado / Revertido (verificando que se restaure automáticamente el estado nominal original y se registre la traza de auditoría).
3. **Prohibición de Mocks Ciegos en Auditoría, Paridad `JSONB`/`Decimal` y Aserción Semántica Anti-UUID Crudo (`SEC-11` & `UI-11X-02`):**
   - Queda prohibido reemplazar funciones de auditoría (`write_audit_log` o equivalentes) con un `AsyncMock` vacío sin aserciones sobre los argumentos recibidos (`assert_called_once` / `call_args`). En pruebas con sesiones simuladas (`MockDbSession`), validar todas las columnas `JSON`/`JSONB` (`AuditLog.before_state`, `AuditLog.after_state`) ejecutando `json.dumps()` **sin `default=str`** y poblando atributos `Numeric(p, s)` con instancias `decimal.Decimal` reales para impedir escapes `TypeError: Object of type Decimal is not JSON serializable`.
   - Toda prueba de auditoría y de cintas de eventos en UI DEBE certificar explícitamente que los campos de identidad visibles (`actor_username`, `resource_display_name`, `router_display_name`) resuelvan a nombres humanos legibles y **nunca** coincidan con el patrón de un UUID v4 crudo (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, evitando pasar `claims.get("sub")` directamente como `actor_username`, regla `SEC-11`), y que los clasificadores de eventos en UI mapeen cada categoría a su insignia semántica real (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`), prohibiendo cláusulas `else` genéricas (`UI-11X-02`).
4. **Invariante de Refresco Dual en Vistas Operativas y Mapas en Vivo (`UI-11X-02` — *Dual Auto + Manual Refresh Invariant*):**
   - Toda vista de monitoreo, dashboard operativo, consola o mapa cartográfico en tiempo real DEBE contar simultáneamente con un mecanismo de actualización reactiva/periódica (`setInterval` con limpieza garantizada `clearInterval` en `onUnmounted` + escucha WebSocket) y un botón explícito **`[ 🔄 Refrescar ]`** accesible para el operador que fuerce la recarga inmediata en vivo (`?refresh=true`) sin depender de recargar el navegador (`F5`).
5. **Invariante de Separación de Timeouts en Transferencia Pesada (`>= 180s` + Purga de `0 bytes`) y Validación por Ítem en Respuestas Batch `HTTP 200 OK`:**
   - **Separación de Timeouts de Telemetría vs. Transferencia Síncrona de Imagen/Firmware:** Los mocks instantáneos (`AsyncMock` / `vi.fn()`) resuelven en `0 ms`, ocultando que los timeouts cortos de telemetría HTTP (`5s–10s`) abortan descargas reales de paquetes/firmware/backups síncronos (ej. paquetes `.npk` de ~21 MB) y dejan archivos truncados de `0 bytes` en el almacenamiento destino. Todo cliente HTTP que ejecute transferencias pesadas síncronas DEBE permitir y enviar un override explícito de timeout por petición (`timeout >= 180s`) y purgar artefactos truncados (`0 bytes`) previos o fallidos (verificando ambos comportamientos en `call_args` dentro de las pruebas unitarias).
   - **Prohibición de Éxito Ciego por `HTTP 200 OK` en Endpoints Batch:** En servicios y vistas UI que consuman endpoints de ejecución masiva (`POST .../execute`, `POST .../batch`), queda estrictamente prohibido asumir éxito global solo por recibir `HTTP 200 OK`; se debe inspeccionar `res.data.results[].status` (o `items[].status`) por cada recurso objetivo y reflejar en la UI y en los tests los estados de fallo parcial o total por ítem (`results[].status == 'FAILED'` o `'ERROR: bad HTTP response'`).
6. **Garantía *Zero Hardcoded Pass*, Cobertura Real No-Root (`QA-COV-01`) y Tipado Estricto Encadenado (`QA-MYPY-01`):**
   - Ninguna compuerta de calidad, parser de cobertura o runner de pruebas puede devolver `true` o `'PASSED'` de forma literal cuando una herramienta no se ejecutó o no generó métricas verificables; debe retornar `'SKIPPED'` o `detected: false`.
   - Está prohibido invocar `pytest -o addopts=""` sin adjuntar explícitamente `--import-mode=importlib --cov=src --cov-fail-under=95` junto con `-e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/src` (`QA-COV-01`), evitando silenciamientos accidentales del umbral del `95%` o errores de permisos SQLite en contenedores no-root (`UID 1001`). En ecosistemas Node.js/Frontend (`sinfallas/base-node-ionic:26`, cuyo usuario por defecto es `uid=10001`), se debe mapear siempre el usuario del host/CI (`-u "$(id -u):$(id -g)"`), definir `HOME=/tmp` + `pnpm_config_store_dir=/pnpm/store` e inicializar el volumen `pnpm-store:/pnpm` con `chmod -R a+rwX /pnpm` (`pnpm-store-init`) para impedir fallos `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR` (`os error 13`) en volúmenes bind-mounted. Si `pyproject.toml` declara `[tool.mypy]`, el target `qa-lint` del `Makefile` DEBE encadenar `mypy --strict --cache-dir=/tmp/mypy src/` junto a `ruff` (`QA-MYPY-01`).
7. **Sincronización Post-Importación del Singleton `Settings` (`QA-SMOKE-01`) y Secretos Efímeros en Smoke Local (`SEC-15`):**
   - En pruebas de humo que validan el arranque en modo producción (`APP_ENV=production`, ej. verificación de `docs_url=None` o rechazo de secretos por defecto), modificar únicamente `os.environ["APP_ENV"] = "production"` después de haber importado `app` o `settings` es inefectivo porque el singleton Pydantic ya fue instanciado en memoria. El test DEBE mutar tanto `os.environ` como el atributo del singleton ya importado (`settings.APP_ENV = "production"`), restaurando su valor original dentro de un bloque `finally` (`QA-SMOKE-01`).
   - Los scripts locales de validación productiva (`probar-prod-local.sh`) NUNCA deben reutilizar contraseñas estáticas de QA; deben generar llaves criptográficas efímeras (`openssl rand -base64 32` / `openssl rand -hex 32`) antes de `docker compose up -d` y propagar la credencial administrativa rotada mediante `docker exec -e` (`SEC-15`).
8. **Continuidad e Inmunidad Atómica en Ceremonias Pre-Auth Multi-Etapa (`SEC-16`):**
   - Los flujos no autenticados de varios pasos (`POST /auth/login` que retorna `mfa_enrollment_required`, `mfa_challenge` o `password_change_required`, seguido de `POST /auth/mfa/enroll`, `POST /auth/mfa/verify` o WebAuthn) fallan en UAT cuando cada paso se prueba aislado con mocks mientras en la aplicación real los middlewares globales (`CSRF` / `Idempotency-Key`) o el interceptor HTTP `401 -> /auth/refresh` del frontend bloquean el segundo paso.
   - Se deben cumplir y certificar en **un único test continuo sin mocks intermedios** 4 controles: (a) `challenge_id` opaco CSPRNG `>= 128 bits` (`secrets.token_urlsafe(32)`) en JSON/cabecera validando `Origin`/`Sec-Fetch-Site`, (b) consumo atómico de un solo uso con `GETDEL`/Lua o llave acotada `idemp:preauth:{challenge_id}:{key}` en KeyDB/Redis, (c) `TTL <= 300s` y purga inmediata tras `3–5` intentos fallidos, y (d) lista `PREAUTH_PUBLIC_ROUTES` simétrica entre middlewares backend y el interceptor `401` del frontend.
9. **Arranque Real sin Mocks en Orquestadores y Contrato de `Healthcheck` en Contenedores (`QA-HEALTH-01`):**
   - **El Escape que Previene:** Un contenedor de workers en segundo plano (`python -m src.workers.runner`) supera `>= 95%` de cobertura unitaria pero cae en estado `unhealthy` al levantar `docker-compose` real cuando: (1) un sub-worker opcional deshabilitado por configuración (`SIEM_EXPORT_ENABLED=false`) ejecuta `return None` limpio en el primer ciclo (`task.done() == True`, `task.exception() is None`), (2) el bucle supervisor evalúa `if task.done() and not task.cancelled(): healthy = False` confundiendo salida limpia opt-in con caída fatal, y (3) el test del orquestador mockea todos los sub-workers con `AsyncMock` + `asyncio.sleep(0.01)` + `cancel()` sin verificar el archivo o sonda física exigida por `Dockerfile` / `docker-compose.yml` (ej. `/tmp/worker_heartbeat`).
   - **Contrato Obligatorio:** Todo runner de workers, scheduler o punto de entrada supervisado por un `HEALTHCHECK` de contenedor DEBE contar con al menos un test de integración unitaria que arranque el orquestador real bajo `Settings()` de producción por defecto (con workers opcionales deshabilitados) **sin mockear los bucles opcionales**, haciendo `assert` explícito sobre la emisión y permanencia del artefacto de salud (`WORKER_HEARTBEAT_PATH.exists()` o `/healthz` `200 OK`) tras múltiples ciclos del event-loop.
   - **Semántica de Salida en Supervisores `asyncio.Task`:**
     ```python
     from pathlib import Path
     import asyncio

     WORKER_HEARTBEAT_PATH = Path("/tmp/worker_heartbeat")
     OPTIONAL_WORKERS: frozenset[str] = frozenset({"siem_exporter", "telemetry_archiver"})

     def is_supervisor_healthy(tasks: dict[str, asyncio.Task[None]]) -> bool:
         for name, task in tasks.items():
             if task.cancelled():
                 return False
             if task.done():
                 # 1. Excepción no controlada -> SIEMPRE unhealthy
                 if task.exception() is not None:
                     return False
                 # 2. Salida inesperada de worker obligatorio -> SIEMPRE unhealthy
                 # 3. Retorno limpio (None) de worker opcional deshabilitado -> HEALTHY
                 if name not in OPTIONAL_WORKERS:
                     return False
         return True
     ```
10. **Guardia Anti-Bloqueo en Terminal Interactiva (`TTY`) para Binarios Duales CLI + Servidor MCP `stdio` (`QA-CLI-TTY-01`):**
   - **El Escape que Previene (*Pipe & Callback Mock Blindness*):** Un paquete híbrido que combina subcomandos CLI (`install-skill`, `init-agents`) con un servidor MCP sobre `stdio` (`StdioServerTransport` en Node/TS o `stdio_server()` en Python) supera al 100% sus pruebas unitarias (porque inyectan un callback simulado `startStdio`) y sus suites E2E en CI (donde `StdioClientTransport` y `execFileSync` conectan `stdin` mediante *pipes*, dejando `process.stdin.isTTY === undefined`), pero cuando un desarrollador humano ejecuta `npx -y @paquete@latest` sin subcomandos en su consola interactiva (`TTY`), el proceso abre `StdioServerTransport` y congela indefinidamente la terminal esperando tramas JSON-RPC que nunca llegan.
   - **Contrato Obligatorio:** Todo punto de entrada dual CLI + MCP `stdio` DEBE verificar `process.stdin.isTTY` (Node/TS) o `sys.stdin.isatty()` (Python) cuando se invoca sin subcomandos: si detecta una terminal interactiva `TTY` (salvo que se indique explícitamente `--stdio` o `QA_FORCE_STDIO=1`), debe completar cualquier auto-sincronización segura, imprimir la guía ejecutiva de instalación/registro MCP y terminar inmediatamente con `exit(0)`. Además, la suite E2E DEBE incluir una sonda en subproceso con `TTY` simulado y `timeout <= 5s` que certifique la ausencia de bloqueo (`audit_security_stig_owasp` audita estáticamente esta condición mediante `QA-CLI-TTY-01`).
11. **Contrato sobre Transporte Real del SDK (`QA-CONTRACT-SDK-01`) e Instalación desde Lockfile + Smoke Test de Imagen Construida (`QA-DOCKER-LOCK-01`):**
   - **El Escape que Previene:** Una cobertura del 95 % no garantiza que el servicio funcione en runtime real: (1) si las pruebas invocan handlers MCP/JSON-RPC/ACP directamente con `MagicMock`, un cambio de firma del SDK (`mcp 1.x -> 2.x`, ej. de `(request)` a `(ctx, params)`) pasa inadvertido y falla con *Internal error* en producción; y (2) si el `Dockerfile` instala una lista manual de paquetes (`pip install fastapi uvicorn`) en vez de leer el lockfile, la imagen omite dependencias reales (`ModuleNotFoundError`) aunque `pytest` pase en el entorno virtual construido desde `pyproject.toml`.
   - **Contrato Obligatorio:** Todo servidor de protocolo DEBE incluir al menos una prueba in-process conectada a través del cliente/transporte real del SDK (`InMemoryTransport` + `Client` en Node/TS o `ClientSession` / `create_connected_server_and_client_session` en Python) ejecutando `list_tools` y `call_tool` sin mockear el dispatcher (`QA-CONTRACT-SDK-01`). Todo `Dockerfile` DEBE instalar dependencias exclusivamente desde el lockfile del proyecto (`uv sync --frozen --no-dev`, `uv export --frozen --no-dev | uv pip install --system -r -`, `pnpm install --frozen-lockfile` o `npm ci`) y la imagen construida DEBE superar un smoke test post-build en CI (`docker run --rm <img> python -c "import <app>"`, verificación no-root `id -u != 0` y sonda `401` sin credenciales, regla `QA-DOCKER-LOCK-01`). Adicionalmente, `QA-HEALTH-01` restringe la detección de sondas exclusivamente a bloques reales `HEALTHCHECK`/`healthcheck:` (ignorando rutas de toolchain como `/tmp/venv`) y `certify_11x_gate` exime plantillas de entorno como `env.example` y `.env*.example`.

---

### 1.2. Invariante de Co-Evolución y Actualización Obligatoria de Pruebas Preexistentes (`QA-TEST-SYNC-01`)

Modificar una función, ruta, esquema, CLI, skill o catálogo (`manifest.json`) sin actualizar las pruebas que verificaban el contrato previo genera deriva silenciosa y falsos negativos diferidos en CI (por ejemplo, conteos `#[N]` obsoletos en contratos `.feature` de Karate BDD o fixtures desfasados en Meta-QA y suites unitarias). Toda modificación legítima debe aplicar simultáneamente estas tres reglas:

- **Auditoría Previa de Tests Consumidores:** Además del radio de impacto en código de producción (`inspect_blast_radius.py`), rastrear todas las suites consumidoras afectadas en `tests/`, `mcp-server/tests/`, `*.feature` y `*.bats` antes de editar.
- **Sincronización Quirúrgica sin Debilitamiento de Aserciones:** Actualizar de inmediato conteos, esquemas, fixtures, snapshots y expectativas de contrato en las pruebas preexistentes impactadas; queda estrictamente prohibido eliminar o relajar aserciones válidas de regresión para forzar un estado verde.
- **Re-ejecución Efímera Completa Pre-Commit:** Validar dentro de contenedores Docker efímeros (`Regla Cero`) todas las suites impactadas —incluyendo `Karate BDD` (`sinfallas/karatelabs`) siempre que cambien `mcp-server/`, `.agents/skills/` o `manifest.json`— antes de sellar el `git commit` local.

### 1.3. Cobertura Diferencial Multi-Stack y Bloqueo Anti-Evasión (`verify_diff_coverage.py` / `make diff-cov`)

Para impedir la dilución silenciosa de pruebas en repositorios con alta cobertura histórica o regresiones en rutas nuevas, todo incremento de código productivo debe superar la compuerta determinista de **Cobertura Diferencial Multi-Stack**:

- **Persistencia Efímera Segura de Reportes:** Antes de destruir los contenedores `--rm`, `make test-mcp`, `make test-py` y `run_ephemeral_qa` recolectan de forma contenida los reportes XML/LCOV (`python.xml`, `mcp-server.info`) dentro de `.agents/.cache/coverage/` (protegido en `.gitignore` y depurado por `./scripts/limpieza.sh`).
- **Umbral Delta Estricto y Tolerancia Cero a Evasiones:** `.agents/scripts/verify_diff_coverage.py` (`make diff-cov`) exige `100%` de cobertura sobre líneas productivas nuevas o modificadas y `>= 90%` sobre sus ramas (`BRDA`/`condition-coverage`). Introducir marcadores de evasión (`# pragma: no cover`, `// v8 ignore`, `/* c8 ignore */`, `@codeCoverageIgnore`) sin justificación explícita `QA11X-APPROVED-EXCLUSION(<motivo>)` en la misma línea o la inmediatamente anterior bloquea con código `11`.
- **Anti-XXE y Archivos Nuevos Sin Reporte:** Cualquier intento de XML externo (`<!DOCTYPE`/`<!ENTITY`), ruta fuera del workspace o archivo productivo nuevo ausente en los reportes emitidos detiene la certificación con código `12` (`Fast-Path DOCS_ONLY` omite con éxito controlado `0`).

---

## 2. Geometría Visual y Anti-JSDOM (Ceguera de Layout)

### El Problema
Los entornos de prueba basados en DOM virtual como **JSDOM** o **HappyDOM** simulan nodos HTML en Node.js, pero **no calculan renderizado CSS, modelos de caja (Flexbox/Grid), coordenadas (`getBoundingClientRect()`) ni colisiones visuales**:
- Un pie de página fijo (`position: fixed; bottom: 0`) puede estar tapando por completo el botón de envío de un formulario o el contenido de una tabla.
- En Vitest o Jest con JSDOM, la prueba dice: `expect(submitButton).toBeInTheDocument()` -> **PASS**.
- En el navegador real, el usuario humano no puede hacer clic en el botón porque está oculto debajo del pie de página.

### La Solución 11X
1. **Ergonomía In-Flow (Anti-Sticky Footer — `UI-11X-01`):**
   - Prohibir pies de página flotantes fijos (`position: fixed`) en interfaces operativas densas (`UI-11X-01`).
   - El contenedor `<main>` debe tener `display: flex; flex-direction: column; min-height: 100vh;` y el pie de página debe usar `margin-top: auto` dentro del flujo natural del documento, garantizando que nunca se superponga al contenido.
2. **Validación en Navegador Real:**
   - Utilizar **Karate UI** o **Playwright** con Chrome headless para verificar la visibilidad interactiva real (`waitFor`, `click`), asegurando que los elementos sean geométricamente clicables en el viewport.

---

## 3. Seguridad por Diseño (Security-by-Design)

Cualquier sistema moderno debe incorporar estas directivas como invariantes de arquitectura:

### 3.1. Aislamiento Multi-Tenant con Row-Level Security (`SEC-13` & `QA-PG17-RLS`)
- No confíes en que el desarrollador siempre recordará añadir `WHERE tenant_id = ?` en cada consulta SQL.
- En PostgreSQL, activa políticas forzadas de RLS en todas las tablas con datos de clientes bajo un rol de aplicación `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`:
  ```sql
  ALTER TABLE items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE items FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_policy ON items
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  ```
- **Persistencia Multi-Transacción (`SEC-13`):** Dado que `SET LOCAL` caduca tras cada `session.commit()`, almacenar el `tenant_id` en `session.sync_session.info["tenant_id"]` y registrar `@event.listens_for(AsyncSession.sync_session_class, "after_begin")` para re-ejecutar `SET LOCAL app.current_tenant_id` automáticamente en transacciones subsiguientes.
- **Auditoría de Catálogo en PostgreSQL 15–17+ (`QA-PG17-RLS`):** Verificar `FORCE ROW LEVEL SECURITY` consultando `pg_catalog.pg_class.relforcerowsecurity` (`JOIN pg_catalog.pg_namespace`), nunca la columna inexistente `pg_tables.forcerowsecurity`.

### 3.2. Prevención Estricta de SSRF (Server-Side Request Forgery)
- Cuando una API permite al usuario registrar URLs o webhooks externos, **DEBE** validar la dirección antes de realizar la petición HTTP.
- Rechazar rangos privados y metadatos de nube: `127.0.0.0/8`, `::1`, `localhost`, `169.254.169.254`, y nombres de contenedores internos (`api`, `postgres`, `redis`).

### 3.3. Bóveda Criptográfica (AES-256-GCM)
- Las credenciales sensibles de integración o contraseñas de equipos remotos nunca deben guardarse en texto plano.
- Encriptar en reposo usando **AES-256-GCM** vinculando Datos Adicionales Autenticados (AAD, ej. `tenant_id:entity_id`) para evitar ataques de trasplante de datos entre inquilinos.

### 3.4. Cabeceras de Idempotencia (`Idempotency-Key` & `QA-KARATE-IDEMP`)
- Todas las peticiones mutantes críticas (`POST`, `PUT`, `PATCH`, `DELETE`) deben aceptar o requerir la cabecera `Idempotency-Key` (UUIDv4/v7).
- Utilizar KeyDB/Redis para bloquear la clave durante el procesamiento con un TTL definido, evitando cobros dobles, provisionamientos duplicados o colisiones de concurrencia. En escenarios BDD de Karate Labs (`.feature`), generar siempre llaves dinámicas por petición con `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` (`QA-KARATE-IDEMP`), prohibiendo UUIDs literales estáticos.

### 3.5. Gobernanza Maker-Checker y Defensa RBAC en Capa de Servicio (`SEC-12`)
- Para operaciones altamente destructivas (formateo de almacenamiento, borrado masivo de clientes, actualización de firmware o herramientas MCP mutadoras), la API/dispatcher debe encolar la solicitud en `ApprovalRequest` (`AWAITING_APPROVAL`, `HTTP 202 Accepted`) hasta que un segundo operador autorizado apruebe el cambio.
- **Defensa Anti-Bypass de `Depends()` (`SEC-12`):** En FastAPI, `Depends(require_roles(...))` solo se evalúa cuando la llamada entra por el router HTTP. Cuando servicios internos son invocados por despachadores JSON-RPC/MCP, WebSockets o workers, se DEBE validar `claims["role"]` / `claims["rol"]` explícitamente al inicio de la función de servicio.

### 3.6. Cumplimiento DISA ASD STIG V6R5 y OWASP Developer Guide (Sesiones, Cadena WORM `SEC-14`, Fail-Secure y SBOM)
- **Gobernanza de Sesiones y Cuentas (`DISA APSC-DV-000010, 000070, 000080, 000300, 000320, 000530` & `OWASP 4.3.7`):**
  - Limitar el número de sesiones simultáneas por operador y aplicar *idle timeouts* diferenciados por rol (**10 minutos** para cuentas privilegiadas y **15 minutos** para cuentas estándar).
  - Bloquear cuentas tras **3 intentos fallidos consecutivos en 15 minutos**, aplicando verificación en tiempo constante (*Dummy Argon2id Hash*) para evitar la enumeración de usuarios.
  - Expirar cuentas temporales automáticamente a las **72 horas** y deshabilitar cuentas inactivas a los **35 días**.
  - Purgar `sessionStorage`, `localStorage` y cachés del navegador al cerrar sesión, e invalidar inmediatamente todas las sesiones activas en servidor cuando se revoca una cuenta o cambia su contraseña.
- **Canonicalización, Deserialización Segura y Validación por Magic Bytes (`SEC-03`, `SEC-04`, `SEC-05` — `DISA APSC-DV-002390, 002485, 002510, 002520` & `OWASP 4.3.5, 4.3.6`):**
  - Normalizar toda entrada de texto a **Unicode `NFKC`** antes de ejecutar validaciones (`SEC-05`), deshabilitar entidades externas XML (`resolve_entities=False`, `no_network=True`, `SEC-04`), prohibir `pickle`/`yaml.load`/`shell=True` (`SEC-03`) y validar cargas de archivos por *Magic Bytes* de cabecera y mapas de índices en lista blanca.
- **Auditoría Forense Inmutable Determinista y Prevención de Log Injection (`SEC-10`, `SEC-14` — `DISA APSC-DV-000650, 001090, 001350` & `OWASP 4.3.10`):**
  - Registrar eventos de seguridad en UTC con granularidad de milisegundos, sanitizando saltos de línea (`\r`, `\n`) para impedir *Log Injection*, encadenando registros con **HMAC-SHA256** sobre secuencia monotónica `seq_num BIGINT` serializada con `SELECT pg_advisory_xact_lock(hashtext(tenant_key))` + `await session.flush()` (nunca ordenando solo por `created_at DESC`, `SEC-14`), prohibiendo secretos/tokens en código o logs (`SEC-10`) y emitiendo alerta operativa cuando el almacenamiento de auditoría supere el **75% de capacidad**.
- **Estado Fail-Secure, Cabeceras OSHP, Cadena de Suministro y Salud de Contenedores (`SEC-07`, `SEC-08`, `SEC-09`, `QA-HEALTH-01` — `DISA APSC-DV-002310, 002590, 002770, 003230, 003310`):**
  - Iniciar y fallar siempre en estado seguro (*Fail-Closed / Deny-by-Default*), ocultar Swagger/OpenAPI en producción (`SEC-07`), inyectar cabeceras OWASP OSHP (`SEC-08`), fijar `ignore-scripts=true` en `.npmrc` (`SEC-09`), sobrescribir búferes de secretos en memoria, purgar credenciales de exportaciones de BD, verificar contratos reales de `healthcheck` en contenedores (`QA-HEALTH-01`), modelar amenazas como código (`OWASP pytm`) y generar **CycloneDX SBOM/CBOM (ECMA-424)** firmados criptográficamente.

### 3.7. Catálogo de Mitigación de 22 Vectores de Ataque en Plataforma Híbrida (DISA STIG V6R5 + OWASP)
Para profundizar en las implementaciones de código (prevención de Asignación Masiva con `extra="forbid"`, protección anti-CSWSH en WebSockets, sanitización de respuestas 422 en producción, evasión de XSS y Prototype Pollution en el frontend, timeouts y concurrencia de sesión, bloqueo de cuentas en tiempo constante, anti-XXE, auditoría inmutable con HMAC, cabeceras OWASP OSHP, mitigación de OWASP API Security Top 10 2023 y Threat Modeling con `pytm`), consulta la guía técnica especializada:
👉 **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**

---

## 4. Paridad Terminal ↔ Frontend y Tablas Mutables

1. **Cero Acciones Exclusivas de Consola:**
   - Cualquier acción ejecutable por scripts CLI de administración debe tener su pantalla correspondiente en el frontend para operadores técnicos.
2. **Cero Endpoints Huérfanos:**
   - Ningún endpoint en la API debe existir sin una interfaz gráfica que permita inspeccionar, filtrar y accionar sus datos.
3. **Tablas Operativas con Mutaciones Tácticas:**
   - Evita crear tablas de datos puramente de solo lectura cuando la API backend admite mutaciones. Las tablas deben ofrecer botones de acción directa: Crear, Editar, Alternar (Toggle Habilitar/Deshabilitar) y Eliminar con confirmación visual.

---

## 5. Endurecimiento de Contenedores y Motor en Memoria KeyDB

1. **Ejecución No-Root Obligatoria:**
   - Los contenedores de producción y QA deben ejecutarse bajo usuarios sin privilegios (`appuser` con UID 10001 en Python, `node` con UID 1000 en Node.js, o `www` con UID 1000 en PHP `sinfallas/basephpcomposer`).
2. **Compilaciones Multi-Etapa (Multi-Stage Builds) e Imágenes Pre-Compiladas:**
   - Aislar el compilador y los archivos de cabecera en una etapa de construcción (`builder`), copiando solo los artefactos finales compilados a la imagen de ejecución mínima (Alpine o distroless). En PHP (`8.2` a `8.5`), utilizar `sinfallas/basephpcomposer` (tags `8.2`, `8.3`, `8.4`, `8.5` y `latest`) con extensiones nativas C pre-compiladas (`pcov`, `redis`, `pdo_pgsql`, `intl`, `sodium`, `opcache` con `save_comments=1` y JIT) y `expose_php = Off`.
3. **Motor en Memoria: KeyDB Multi-Threaded:**
   - Reemplazar Redis tradicional de un solo hilo por **KeyDB** (`eqalpha/keydb:alpine`) con `--server-threads 2`. Permite multiplicar el rendimiento de operaciones de lectura/escritura y pub/sub por 3x sin modificar código cliente, manteniendo 100% de compatibilidad con librerías Redis.
4. **Auditoría Preventiva con Trivy:**
   - Integrar escaneos automáticos de vulnerabilidades con `aquasec/trivy:latest` sobre el sistema de archivos y manifiestos de infraestructura (`./scripts/auditar-infra.sh`), bloqueando el pase a producción si existen hallazgos de severidad CRITICAL o HIGH.

### 5.1. Despliegues No Interactivos (`docker compose run -T`) y Wrangler v4 (Cloudflare Pages) en Contenedores `read_only: true` (`QA-DOCKER-TTY-01`)

Durante el *dogfooding* productivo bajo **Regla Cero** (`wrangler 4.161.0` dentro de contenedores endurecidos con `read_only: true`, `cap_drop: [ALL]` y `CI: 'true'`), se identificaron tres fallos encadenados al combinar CLI interactivas modernas con rootfs de solo lectura:
1. **`NoDefaultValueProvided` por pseudo-TTY (`process.stdin.isTTY === true`):** `docker compose run --rm` sin `-T` asigna un pseudo-TTY aunque `CI: 'true'` esté activo. Si el proyecto aún no existe en la cuenta o la CLI usa selectores interactivos, el proceso entra en la rama de prompts y aborta inmediatamente. En pipelines CI/CD, scripts de despliegue (`deploy*.sh`, `ci*.sh`) y flujos de agentes, ejecute siempre `docker compose run --rm -T` (`QA-DOCKER-TTY-01`).
2. **Fallo `ENOENT` / `EROFS` en `/app/.wrangler/cache` (`saveToConfigCache`):** Con `read_only: true`, Docker exige que el directorio destino de un `tmpfs` fuera de `/tmp` o `/run` exista previamente en la imagen. Todo caché local requerido por la herramienta (ej. `/app/.wrangler`) debe precrearse en el `Dockerfile` (`mkdir -p` + `chown`) y montarse como `tmpfs` con `mode=1777,noexec,nosuid,nodev`.
3. **Delegación silenciosa Pages-to-Workers (`maybeDelegatePagesToWorkers`) en sesiones de agentes IA:** Wrangler v4 puede intentar redirigir proyectos estáticos nuevos hacia Cloudflare Workers si detecta variables de entorno de agentes de codificación; añada `--force` explícitamente tanto en `wrangler pages project create` (verificando previamente la lista JSON de forma idempotente) como en `wrangler pages deploy`.

```dockerfile
# Dockerfile.deploy — precrear punto de montaje antes de pasar a usuario no-root
USER root
RUN mkdir -p /app/.wrangler \
    && chown -R appuser:appgroup /app /pnpm
USER appuser
```

```yaml
# docker-compose.deploy.yml — rootfs read_only + tmpfs noexec + Fail-Secure + --force
services:
  deploy:
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=64M,mode=1777,noexec,nosuid,nodev
      - /app/.wrangler:size=32M,mode=1777,noexec,nosuid,nodev
    environment:
      HOME: /tmp
      WRANGLER_SEND_METRICS: 'false'
      CI: 'true'
    entrypoint: ["sh", "-c"]
    command:
      - |
        set -eu
        : "$${CF_PAGES_PROJECT:?CF_PAGES_PROJECT es obligatorio}"
        : "$${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN es obligatorio}"
        PROJECT="$${CF_PAGES_PROJECT}"
        BRANCH="$${CF_PAGES_PRODUCTION_BRANCH:-main}"
        PROJECTS_JSON="$$(wrangler pages project list --json)"
        if ! printf '%s' "$$PROJECTS_JSON" | node -e 'const fs=require("fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(0,"utf8"));if(!Array.isArray(d))process.exit(2);process.exit(d.some(x=>(x["Project Name"]??x.name)===p)?0:1)' "$$PROJECT"; then
          status=$$?
          [ "$$status" -eq 1 ] || exit "$$status"
          wrangler pages project create "$$PROJECT" --production-branch="$$BRANCH" --force
        fi
        wrangler pages deploy /app/dist \
          --project-name="$$PROJECT" \
          --branch="$$BRANCH" \
          --commit-dirty=true \
          --force
```

```bash
# deploy.sh — deshabilitar pseudo-TTY en CI; requiere aprobación humana o compuerta GO (QA-GIT-GATE-01)
docker compose -f docker-compose.deploy.yml run --rm -T --no-deps -u "$(id -u):$(id -g)" deploy
```

> **Compuerta de Mutación Remota (`QA-GIT-GATE-01`):** Al igual que `git push` o `npm publish`, la ejecución de `deploy.sh` muta infraestructura externa en producción y requiere autorización explícita del operador humano o una compuerta de liberación `GO` (`evaluate_release_gate`).

### 5.2. Empaquetado de Favicons Multi-Formato, Manifiesto PWA y Cabeceras Edge sin Duplicados (`UI-11X-03`)

Todo frontend SPA o sitio público SSG debe evitar atajos `.webp` en iconos de plataforma y desacoplar explícitamente las cabeceras heredadas de `/*` en Cloudflare Pages y Nginx:

1. **HTML (`index.html`) e Iconos Multi-Resolución:** Nunca apuntar `rel="apple-touch-icon"` a `.webp` ni `.svg` (Safari/iOS los ignora silenciosamente); generar desde el SVG maestro bajo **Regla Cero** (`mcr.microsoft.com/playwright` con `deviceScaleFactor: 1`) los PNGs y empaquetar `public/favicon.ico` (`sizes="48x48"` con tramas `16x16`/`32x32`/`48x48` para navegadores clásicos y Google Search `>= 48px`), `favicon.svg`, PNGs RGBA `48x48`/`32x32` y PNG RGB opaco `180x180` (sin canal alfa, zona segura del 80 %) para Apple Touch Icon:
   ```html
   <link rel="icon" href="/favicon.ico" sizes="48x48" />
   <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
   <link rel="icon" type="image/png" sizes="48x48" href="/favicons/favicon-48x48.png" />
   <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
   <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
   ```
2. **Manifiesto PWA (`site.webmanifest`):** Declarar `icon-192.png` (`192x192`) e `icon-512.png` (`512x512`) en formato `image/png` opaco (zona segura del 80 %) separando `"purpose": "any"` y `"purpose": "maskable"` en objetos distintos (evitando `"any maskable"` combinado).
3. **Edge Cloudflare (`public/_headers` y `_routes.json`) y Nginx:** En Cloudflare Pages, toda subruta que sobrescriba una cabecera definida en `/*` (`Cache-Control`, `X-Robots-Tag`, `Cross-Origin-Resource-Policy`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`) DEBE desacoplarla primero con `! Nombre-Cabecera` para impedir concatenaciones duplicadas. Habilitar `Cross-Origin-Resource-Policy: cross-origin` en `/favicon.ico`, `/favicons/*`, `/brand/*` y `/og/*` (manteniendo `X-Robots-Tag: noindex, nofollow` en consolas SPA privadas y reservando `index, follow` exclusivamente para sitios públicos SSG). En `nginx/default.conf`, replicar `"same-origin"` en `server`/`/index.html` y `"cross-origin"` en `location ~* \.(?:ico|svg|png|webmanifest)$`. En `_routes.json`, excluir la ruta exacta `"/favicon.ico"` cuando `include` contiene `"/*"` y evitar comodines de sufijo inválidos (`/*.ico`, `/*.png`):
   ```text
   /favicon.ico
     ! Cache-Control
     ! Cross-Origin-Resource-Policy
     Cache-Control: public, max-age=604800
     Cross-Origin-Resource-Policy: cross-origin
   ```

### 5.3. Diferencia de Expansión entre `Makefile`/Compose y GitHub Actions (`QA-CI-ESCAPE-01`) y `$(CURDIR)` en Sub-Makefiles (`QA-MAKE-CURDIR-01`)

Durante auditorías de pipelines reales bajo **Regla Cero**, se identificaron dos fallos frecuentes al trasladar comandos `docker run` entre `Makefile`, `docker-compose.yml` y `.github/workflows/*.yml`:

1. **Prohibido usar `$$(...)` o `$${...}` en bloques `run:` de GitHub Actions (`QA-CI-ESCAPE-01`):** En recetas de GNU Make (o `command:` de `docker-compose.yml`) se escribe `$$(pwd)`, `$$(id -u)` o `$${VAR}` para escapar el signo `$` antes de entregarlo al shell. En cambio, GitHub Actions entrega el bloque `run:` directamente a `bash`: escribir `$$(pwd)` expande `$$` al **PID numérico del proceso** (ej. `2970(pwd)`), rompiendo montajes `-v` de Docker con `exit code 125`. Utilice siempre sustitución simple `$(pwd)` / `$(id -u):$(id -g)` / `${VAR}` en workflows y *composite actions* (use `# qa-ci-escape-ok` solo si el paso genera literalmente un `Makefile` o `docker-compose.yml`).
   ```yaml
   # ❌ ANTIPATRÓN (bash expande $$ al PID del proceso -> "create 2970(pwd)" exit code 125)
   - run: docker run --rm -u "$$(id -u):$$(id -g)" -v "$$(pwd):/workspace:ro" aquasec/trivy:latest config .

   # ✔️ PATRÓN 11X (sustitución simple directa en bash)
   - run: docker run --rm -u "$(id -u):$(id -g)" -v "$(pwd):/workspace:ro" aquasec/trivy:latest config .
   ```
2. **Uso obligatorio de `$(CURDIR)` en sub-Makefiles (`QA-MAKE-CURDIR-01`):** Cuando un `Makefile` raíz delega con `$(MAKE) -C backend <target>`, GNU Make cambia al subdirectorio y actualiza `$(CURDIR)`, pero conserva `$(PWD)` / `${PWD}` apuntando al directorio padre del llamador. En `*/Makefile` y `*/Makefile.example` utilice siempre `$(CURDIR)` (ej. `HOST_PWD ?= $(CURDIR)`, eximible con `# qa-make-curdir-ok`) para preservar la frontera exacta de volumen en contenedores efímeros.
   ```makefile
   # ❌ ANTIPATRÓN (hereda el PWD del Makefile raíz y monta el directorio padre)
   HOST_PWD ?= $(PWD)

   # ✔️ PATRÓN 11X (resuelve el directorio real del sub-Makefile invocado con make -C)
   HOST_PWD ?= $(CURDIR)
   ```

---

## 6. Manejo de Errores No Destructivo en Frontend

Un error clásico en tiendas de estado reactivas (Pinia, Vuex, Redux) es limpiar agresivamente los datos ante un fallo de red temporal:
```typescript
// ❌ ANTIPATRÓN: Borra la información válida previa ante un parpadeo de red
try {
  const data = await api.getInventory();
  items.value = data;
} catch (error) {
  items.value = []; // El usuario ve una pantalla en blanco repentina
}

// ✔️ PATRÓN 11X: Preserva el último estado válido conocido y añade indicador
try {
  const data = await api.getInventory();
  items.value = data;
  isStale.value = false;
} catch (error) {
  isStale.value = true;
  lastErrorMessage.value = 'Fallo de conexión. Mostrando datos en caché local.';
}
```
Preservar el estado previo garantiza continuidad operativa en centros de monitoreo y entornos de alta densidad de datos.

---

## 7. Alineación de Toolchain Node 26, pnpm 12, ESLint 8 y Karate 1.5.1 (Vue 3 / React / SSG)

Al certificar proyectos frontend y Node.js dentro de las imágenes oficiales `sinfallas/base-node-ionic:26` (`Node v26.13+`, `pnpm 12.18+`) y `sinfallas/karatelabs:1.5.1`, deben respetarse cinco contratos de entorno para evitar falsos fallos de pipeline y preservar la seguridad Zero-Trust (`SEC-09`):

1. **`pnpm-workspace.yaml` con mapa booleano `allowBuilds` (`SEC-09`):**
   - En `pnpm@12+`, la clave heredada `package.json#pnpm.onlyBuiltDependencies` es ignorada con advertencia y los binarios nativos (`esbuild`, `playwright`, `@playwright/test`) abortan con `ERR_PNPM_IGNORED_BUILDS`.
   - Omite `"pnpm"` en `package.json`, mantén `.npmrc` con `ignore-scripts=true`, y declara las excepciones estrictas en `pnpm-workspace.yaml` usando un **mapa booleano (`Record<string, boolean>`)** (nunca una lista YAML `- pkg`, que provoca `ERR_PNPM_INVALID_SETTING`):
     ```yaml
     allowBuilds:
       esbuild: true
       playwright: true
       '@playwright/test': true
       vue-demi: false
     ```
2. **Compatibilidad TypeScript en Vue 3 (`vue-tsc ^2.2.8`):**
   - Fija `"vue-tsc": "^2.2.8"` junto a `typescript ^5.7.2` en proyectos Vue 3 + Vite para evitar errores de resolución de tipos de versiones `1.x` desfasadas.
3. **ESLint 8 clásico + `eslint-plugin-security` v3 (`recommended-legacy`):**
   - En `eslint-plugin-security@^3.0.0`, el preset `recommended` exporta *Flat Config* (ESLint 9) y falla bajo `.eslintrc.json` de ESLint `8.57.x`. Extiende siempre `"plugin:security/recommended-legacy"` y añade `"ignorePatterns": ["dist/", "dist-ssr/", "coverage/", "playwright-report/", "lhci-reports/", "target/", "graphify-out/"]` (auditado por `SEC-09` en `audit_security_stig_owasp`).
4. **Polyfill en memoria de `localStorage` para Vitest + `jsdom` sobre Node v26:**
   - Node v26 expone un descriptor experimental `globalThis.localStorage` que sin `--localstorage-file` carece del método `.clear()` en sesiones `jsdom`. Registra un `Storage` en memoria dentro de `vitest.setup.ts` (enlazado mediante `test.setupFiles` en `vitest.config.ts`) cuando `typeof globalThis.localStorage?.clear !== 'function'`.
5. **Frontera real de `sinfallas/karatelabs:1.5.1` (HTTP/OSHP/SSG/XML) vs Playwright (`ui-e2e`):**
   - Las imágenes `sinfallas/karatelabs:1.5.1` / `:latest` no incluyen binario Chrome/Chromium. Delega toda interacción DOM real, verificación de botones `[ 🔄 Refrescar ]`, geometría Anti-JSDOM y WCAG 2.1 AA a Playwright (`ui-e2e`), y enfoca `test/ui_business_flow.feature` en contratos HTTP sobre `http://ui-prod:80`: códigos `200`, rutas SPA/SSG, cabeceras OWASP OSHP alineadas con `nginx/default.conf` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`) y lectura segura de XML/SEO como cadena (`* string xmlText = response` en `/sitemap.xml` para evitar fallos de parser por namespaces).
6. **Endurecimiento no-root de `ui-e2e` y paridad exacta Playwright (`QA-PLAYWRIGHT-PIN-01`):**
   - Ejecuta el servicio `ui-e2e` (`mcr.microsoft.com/playwright:v1.52.0-noble`) bajo el UID/GID del usuario (`-u "$(QA_UID):$(QA_GID)" -e HOME=/tmp`), habilita Corepack sin privilegios de escritura global en `/tmp/.corepack-bin` (`COREPACK_HOME=/tmp/.corepack`), prioriza los binarios locales `./node_modules/.bin/playwright` y `./node_modules/.bin/lhci` antes de recurrir a `pnpm`/`corepack`, y fija versión exacta (`"1.52.0"`, sin `^` ni `~`) sincronizada entre `package.json` y el tag Docker (`QA-PLAYWRIGHT-PIN-01`).
7. **Paridad de hidratación SSR/SSG bajo doble esquema de color (`QA-SSR-HYDRATION-01`):**
   - En aplicaciones SSR/SSG (`nuxt`, `vitepress`, `astro`, `next`, `@sveltejs/kit`, `vite-ssg`, `createSSRApp`/`hydrateRoot`) con selector de tema claro/oscuro, evita ramificar el DOM inicial (`v-if`) según `localStorage.theme` o `dataset.theme` mutados antes de hidratar; renderiza ambas ramas vía CSS (`display: none` / `hidden dark:block`) y sincroniza el estado reactivo en `onMounted`.
   - Añade en Playwright una prueba aislada para el `colorScheme` opuesto (`'light'` y `'dark'` vía `newContext`/`emulateMedia` o proyectos dedicados) con listeners `console` y `pageerror` que fallen ante cualquier advertencia `/hydration/i` (eximible únicamente mediante `# qa-ssr-hydration-ok`).

---

## 8. Compatibilidad PHP 8.4/8.5 (`PCOV` y `php.ini`), Exclusión `vendor/` en Trivy IaC y Fallback Rule Zero sin `make`

Para evitar fricciones operativas en aplicaciones PHP 8.4/8.5 (Symfony/PSR-4 y Laravel), auditorías de infraestructura tras `composer install` y entornos sin GNU `make`:

1. **Directivas de sesión y precedencia `PCOV` en PHP 8.4/8.5 (`php/php.ini.example`, `php/composer.json.example`):**
   - **Eliminación de `session.sid_length` y `session.sid_bits_per_character`:** Ambas directivas fueron deprecadas en PHP 8.4/8.5 en favor del CSPRNG nativo de 32 bytes; reemplázalas por `session.cache_expire = 15` junto a `session.use_strict_mode = 1`, `session.cookie_httponly = 1`, `session.cookie_secure = 1` y `session.cookie_samesite = Strict`.
   - **Parametrización explícita de `pcov.directory` y orden en `conf.d`:** La imagen `sinfallas/basephpcomposer` carga `conf.d/docker-php-ext-pcov.ini` en orden lexicográfico. Pasa explícitamente `-d pcov.enabled=1 -d pcov.directory=src` (`-d pcov.directory=app` en Laravel) dentro de los scripts `qa:unit` / `qa:mutation` de `composer.json` (alineado con `<ini name="pcov.directory" value="src"/>` en `phpunit.xml.example`) y monta archivos `.ini` personalizados en `/usr/local/etc/php/conf.d/99-qa11x.ini:ro`.
2. **Exclusión uniforme de `vendor` y `.venv` en Trivy IaC/FS, MCP y AST (`scripts/auditar-infra.sh`, `.trivy.yaml`):**
   - Pasa `--skip-dirs node_modules,.git,dist,target,graphify-out,vendor,.venv` tanto a `trivy config` como a `trivy fs`, replica `vendor`/`.venv`/`target`/`graphify-out` en `scan.skip-dirs` de `.trivy.yaml`, e ignora `vendor` en `security-auditor.ts`, `inspect-project.ts` y `verify_topological_health.py` para evitar falsos positivos sobre dependencias Composer tras `composer install`, manteniendo intacto el escaneo de CVEs sobre `composer.lock` y `uv.lock` en raíz.
3. **Fallback Rule Zero sin GNU `make` en `run_ephemeral_qa` (`mcp-server/src/tools/ephemeral-runner.ts`):**
   - Cuando `make` falla con `ENOENT` (o falta `Makefile` pero existe `docker-compose.qa.yml`), el servidor MCP resuelve recursivamente delegaciones `$(MAKE) -C <subdir> <target>` (profundidad `<= 3`, contención estricta dentro del proyecto e inyección `--project-directory`), rechaza recetas con operadores shell fuera de comillas (`&&`, `||`, `;`, `|`, `>`, `<`) o subshells no expandidos (`$(...)` como `$$(id -u)`) para caer limpiamente al mapeo directo sobre `docker-compose.qa.yml`, descuenta el presupuesto restante de `timeoutSeconds` por paso y ejecuta `docker compose down -v --remove-orphans` tras comandos `up -d` usando exclusivamente `shell: false`.

---

## 9. Auditoría Post-Deploy Dual (Lab + CrUX) con Google PageSpeed Insights v5 (`make audit-psi` / `make qa-psi`)

Complementa a Lighthouse CI (`@lhci/cli` pre-merge sobre contenedores locales) midiendo rendimiento real (*Core Web Vitals* de campo CrUX + puntuación Lighthouse en la nube) sobre dominios HTTPS públicos tras el despliegue:
- **Ejecución estándar:** `make audit-psi URL=https://tu-dominio.com [STRATEGY=both|mobile|desktop] [MIN_PERF=0.90]` (alias `make qa-psi` en proyectos `vue3`/`react-frontend`), respaldado por `scripts/auditar-pagespeed.sh` y `.agents/scripts/audit_pagespeed_insights.py` dentro de `sinfallas/base-python-uv:3.15`.
- **Controles de seguridad y resiliencia:** Bloqueo estricto Anti-SSRF (`SEC-03`: únicamente `https://` público, sin credenciales embebidas y resolución pre-DNS rechazando loopback/RFC1918/link-local/`.internal`), cierre limpio (`exit 0`, `SKIPPED`) ante ausencia opcional de `URL` o límite de cuota HTTP `429` sin `PAGESPEED_API_KEY`, y redacción automática de claves (`[REDACTED]`, `SEC-06`).
