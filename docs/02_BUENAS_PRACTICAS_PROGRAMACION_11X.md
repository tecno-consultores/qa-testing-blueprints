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

### 1.1. Invariante Anti-Silo de Propagación Transversal de Estado, Ciclo Temporal de 3 Fases y Auditoría Semántica
La cobertura unitaria ($\ge 95\%$) mide el porcentaje de líneas ejecutadas, pero es ciega ante desconexiones entre módulos cuando las pruebas abusan de mocks en las fronteras (*Silo Mock Blindness*) o utilizan aserciones tautológicas. Toda suite bajo el Estándar QA 11X debe cumplir estas **4 reglas obligatorias de diseño de pruebas**:

1. **Propagación Transversal de Estado sin Mocks Intermedios (*Cross-Module State Propagation*):**
   - Está estrictamente prohibido dar por válido un test de mutación verificando únicamente el `HTTP 200/201` del endpoint mutador (ej. `POST /api/v1/maintenance/windows` o cambio de estado administrativo) mientras los módulos consumidores (ej. Wallboard NOC o Inventario) se prueban con fixtures estáticos escritos a mano.
   - Cuando una operación en el Módulo A modifica el estado operativo de una entidad, la suite de pruebas DEBE invocar inmediatamente los endpoints de consulta (`GET`, ej. `GET /api/v1/inventory/routers`) y stores de los Módulos B consumidores **sin mocks intermedios**, certificando que el estado efectivo, contadores KPI, insignias y mapas reflejan la mutación de extremo a extremo.
2. **Aserción Obligatoria de las 3 Fases Temporales (*3-Phase Temporal Lifecycle Assertion*):**
   - Toda entidad o flujo gobernado por ventanas de tiempo, cronómetros o TTL (`starts_at` / `ends_at`, ventanas de confirmación/rollback Safe Mode de 60s, expiración de tokens Step-Up de 30s, leases temporales) DEBE probarse obligatoriamente en sus **3 fases del reloj** (prohibiendo ternarios binarios de 2 estados como `is_cancelled ? 'Cancelada' : 'Programada'`):
     - **Fase 1 ($t < \text{starts\_at}$):** Estado Programado / Pendiente (`Programada`).
     - **Fase 2 ($\text{starts\_at} \le t \le \text{ends\_at}$):** Estado Activo / En Curso (`En Curso` / `Activa`, verificando que el recurso programado o scheduler permanezca vivo más allá de los 50ms de la petición HTTP y proyecte el estado activo a todos los módulos consumidores).
     - **Fase 3 ($t > \text{ends\_at}$ o Cancelado):** Estado Expirado / Purgado / Revertido (verificando que se restaure automáticamente el estado nominal original y se registre la traza de auditoría).
3. **Prohibición de Mocks Ciegos en Auditoría y Aserción Semántica Anti-UUID Crudo (*Audit Payload & Semantic Badge Integrity*):**
   - Queda prohibido reemplazar funciones de auditoría (`write_audit_log` o equivalentes) con un `AsyncMock` vacío sin aserciones sobre los argumentos recibidos (`assert_called_once` / `call_args`).
   - Toda prueba de auditoría y de cintas de eventos en UI DEBE certificar explícitamente que los campos de identidad visibles (`actor_username`, `resource_display_name`, `router_display_name`) resuelvan a nombres humanos legibles y **nunca** coincidan con el patrón de un UUID v4 crudo (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, evitando pasar `claims.get("sub")` directamente como `actor_username`), y que los clasificadores de eventos en UI mapeen cada categoría a su insignia semántica real (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`), prohibiendo cláusulas `else` genéricas que asignen `MANTENIMIENTO` a eventos no relacionados.
4. **Invariante de Refresco Dual en Vistas Operativas y Mapas en Vivo (*Dual Auto + Manual Refresh Invariant*):**
   - Toda vista de monitoreo, dashboard operativo, consola o mapa cartográfico en tiempo real DEBE contar simultáneamente con un mecanismo de actualización reactiva/periódica (`setInterval` con limpieza garantizada `clearInterval` en `onUnmounted` + escucha WebSocket) y un botón explícito **`[ 🔄 Refrescar ]`** accesible para el operador que fuerce la recarga inmediata en vivo (`?refresh=true`) sin depender de recargar el navegador (`F5`).

---

## 2. Geometría Visual y Anti-JSDOM (Ceguera de Layout)

### El Problema
Los entornos de prueba basados en DOM virtual como **JSDOM** o **HappyDOM** simulan nodos HTML en Node.js, pero **no calculan renderizado CSS, modelos de caja (Flexbox/Grid), coordenadas (`getBoundingClientRect()`) ni colisiones visuales**:
- Un pie de página fijo (`position: fixed; bottom: 0`) puede estar tapando por completo el botón de envío de un formulario o el contenido de una tabla.
- En Vitest o Jest con JSDOM, la prueba dice: `expect(submitButton).toBeInTheDocument()` -> **PASS**.
- En el navegador real, el usuario humano no puede hacer clic en el botón porque está oculto debajo del pie de página.

### La Solución 11X
1. **Ergonomía In-Flow (Anti-Sticky Footer):**
   - Prohibir pies de página flotantes fijos en interfaces operativas densas.
   - El contenedor `<main>` debe tener `display: flex; flex-direction: column; min-height: 100vh;` y el pie de página debe usar `margin-top: auto` dentro del flujo natural del documento, garantizando que nunca se superponga al contenido.
2. **Validación en Navegador Real:**
   - Utilizar **Karate UI** o **Playwright** con Chrome headless para verificar la visibilidad interactiva real (`waitFor`, `click`), asegurando que los elementos sean geométricamente clicables en el viewport.

---

## 3. Seguridad por Diseño (Security-by-Design)

Cualquier sistema moderno debe incorporar estas directivas como invariantes de arquitectura:

### 3.1. Aislamiento Multi-Tenant con Row-Level Security (RLS)
- No confíes en que el desarrollador siempre recordará añadir `WHERE tenant_id = ?` en cada consulta SQL.
- En PostgreSQL, activa políticas forzadas de RLS en todas las tablas con datos de clientes:
  ```sql
  ALTER TABLE items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE items FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_policy ON items
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  ```
- El middleware de sesión inyecta `SET LOCAL app.current_tenant_id = '...'` en cada transacción de base de datos.

### 3.2. Prevención Estricta de SSRF (Server-Side Request Forgery)
- Cuando una API permite al usuario registrar URLs o webhooks externos, **DEBE** validar la dirección antes de realizar la petición HTTP.
- Rechazar rangos privados y metadatos de nube: `127.0.0.0/8`, `::1`, `localhost`, `169.254.169.254`, y nombres de contenedores internos (`api`, `postgres`, `redis`).

### 3.3. Bóveda Criptográfica (AES-256-GCM)
- Las credenciales sensibles de integración o contraseñas de equipos remotos nunca deben guardarse en texto plano.
- Encriptar en reposo usando **AES-256-GCM** vinculando Datos Adicionales Autenticados (AAD, ej. `tenant_id:entity_id`) para evitar ataques de trasplante de datos entre inquilinos.

### 3.4. Cabeceras de Idempotencia (`Idempotency-Key`)
- Todas las peticiones mutantes críticas (`POST`, `PUT`, `DELETE`) deben aceptar o requerir la cabecera `Idempotency-Key` (UUIDv7).
- Utilizar KeyDB/Redis para bloquear la clave durante el procesamiento con un TTL definido, evitando cobros dobles, provisionamientos duplicados o colisiones de concurrencia.

### 3.5. Gobernanza Maker-Checker (Regla de Dos Personas)
- Para operaciones altamente destructivas (formateo de almacenamiento, borrado masivo de clientes, actualización de firmware), la API debe responder con `HTTP 202 Accepted` y encolar la solicitud en una bandeja de aprobaciones. La operación no se ejecuta hasta que un segundo operador autorizado apruebe el cambio.

### 3.6. Cumplimiento DISA ASD STIG V6R5 y OWASP Developer Guide (Sesiones, Auditoría, Fail-Secure y SBOM)
- **Gobernanza de Sesiones y Cuentas (`DISA APSC-DV-000010, 000070, 000080, 000300, 000320, 000530` & `OWASP 4.3.7`):**
  - Limitar el número de sesiones simultáneas por operador y aplicar *idle timeouts* diferenciados por rol (**10 minutos** para cuentas privilegiadas y **15 minutos** para cuentas estándar).
  - Bloquear cuentas tras **3 intentos fallidos consecutivos en 15 minutos**, aplicando verificación en tiempo constante (*Dummy Argon2id Hash*) para evitar la enumeración de usuarios.
  - Expirar cuentas temporales automáticamente a las **72 horas** y deshabilitar cuentas inactivas a los **35 días**.
  - Purgar `sessionStorage`, `localStorage` y cachés del navegador al cerrar sesión, e invalidar inmediatamente todas las sesiones activas en servidor cuando se revoca una cuenta o cambia su contraseña.
- **Canonicalización, Deserialización Segura y Validación por Magic Bytes (`DISA APSC-DV-002390, 002485, 002520` & `OWASP 4.3.5, 4.3.6`):**
  - Normalizar toda entrada de texto a **Unicode `NFKC`** antes de ejecutar validaciones, deshabilitar entidades externas XML (`resolve_entities=False`, `no_network=True`), prohibir `pickle`/`yaml.load`/`shell=True` y validar cargas de archivos por *Magic Bytes* de cabecera y mapas de índices en lista blanca.
- **Auditoría Forense Inmutable y Prevención de Log Injection (`DISA APSC-DV-000650, 001090, 001350` & `OWASP 4.3.10`):**
  - Registrar eventos de seguridad en UTC con granularidad de milisegundos, sanitizando saltos de línea (`\r`, `\n`) para impedir *Log Injection*, encadenando registros con **HMAC-SHA256**, prohibiendo secretos/tokens en logs y emitiendo alerta operativa cuando el almacenamiento de auditoría supere el **75% de capacidad**.
- **Estado Fail-Secure, Zeroización de Memoria y Cadena de Suministro (`DISA APSC-DV-002310, 002590, 002770, 003230, 003310` & `OWASP 4.2, 4.3.9, 5.3.4`):**
  - Iniciar y fallar siempre en estado seguro (*Fail-Closed / Deny-by-Default*), ejecutar auto-verificación de funciones criptográficas al arranque, sobrescribir búferes de secretos en memoria al salir de cada función, purgar credenciales de exportaciones de base de datos, modelar amenazas como código (`OWASP pytm` / `Threat Dragon`) y generar **CycloneDX SBOM/CBOM (ECMA-424)** firmados criptográficamente.

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
   - Integrar escaneos automáticos de vulnerabilidades con `aquasec/trivy:latest` sobre el sistema de archivos y manifiestos de infraestructura (`./auditar-infra.sh`), bloqueando el pase a producción si existen hallazgos de severidad CRITICAL o HIGH.

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
