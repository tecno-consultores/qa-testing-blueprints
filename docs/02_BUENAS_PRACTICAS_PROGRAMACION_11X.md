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

### 1.1. Invariante Anti-Silo y Anti-Ceguera UAT (Las 10 Reglas Obligatorias de Diseño de Pruebas)
La cobertura unitaria (`>= 95%`) mide el porcentaje de líneas ejecutadas, pero es ciega ante desconexiones entre módulos, timeouts cortos enmascarados por mocks instantáneos, asimetrías en flujos pre-autenticación, contenedores que caen en `unhealthy` tras superar suites aisladas o binarios duales `CLI + MCP stdio` que bloquean terminales humanas (*Silo & Pipe Mock Blindness*). Toda suite bajo el Estándar QA 11X debe cumplir estas **10 reglas obligatorias de diseño de pruebas** (en paridad 1:1 con `qa-11x-architect` §2.1):

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
