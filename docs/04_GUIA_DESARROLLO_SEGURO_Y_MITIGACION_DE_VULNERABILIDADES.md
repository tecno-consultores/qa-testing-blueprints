# 🔐 Guía de Desarrollo Seguro y Mitigación de Vulnerabilidades (Estándar 11X)

> **PROPÓSITO:**  
> Este manual técnico proporciona recetas de código concretas, patrones arquitectónicos y validaciones obligatorias para desarrolladores y Agentes de IA. Su objetivo es erradicar desde el diseño los vectores de ataque más comunes en aplicaciones modernas híbridas (SPA en Vue/React + API Asíncrona en FastAPI/Node).

---

## 📋 Índice de Patrones de Código Seguro

1. [Patrón 1: Prevención de Asignación Masiva (Mass Assignment / Over-posting)](#patrón-1-prevención-de-asignación-masiva-mass-assignment--over-posting)
2. [Patrón 2: Protección Anti-CSWSH (Cross-Site WebSocket Hijacking)](#patrón-2-protección-anti-cswsh-cross-site-websocket-hijacking)
3. [Patrón 3: Sanitización de Errores de Validación 422 en Producción](#patrón-3-sanitización-de-errores-de-validación-422-en-producción)
4. [Patrón 4: Defensa Anti-SSRF Estricta con Resolución DNS Previa](#patrón-4-defensa-anti-ssrf-estricta-con-resolución-dns-previa)
5. [Patrón 5: Consultas Parametrizadas Seguras en Contextos Dinámicos de BD](#patrón-5-consultas-parametrizadas-seguras-en-contextos-dinámicos-de-bd)
6. [Patrón 6: Cuotas y Límites Estrictos de Carga de Archivos (Anti-DoS / OOM)](#patrón-6-cuotas-y-límites-estrictos-de-carga-de-archivos-anti-dos--oom)
7. [Patrón 7: Preservación de Cabeceras de Proxy Inverso en Nginx](#patrón-7-preservación-de-cabeceras-de-proxy-inverso-en-nginx)
8. [Patrón 8: Middleware Anti-CSRF Desacoplado con Exclusión de Tokens Bearer](#patrón-8-middleware-anti-csrf-desacoplado-con-exclusión-de-tokens-bearer)
9. [Patrón 9: Prevención de XSS y Prototype Pollution en Frontend](#patrón-9-prevención-de-xss-y-prototype-pollution-en-frontend)
10. [Patrón 10: Tolerancia a Carreras Concurrentes (Grace Period de 5s) en Refresh Tokens](#patrón-10-tolerancia-a-carreras-concurrentes-grace-period-de-5s-en-refresh-tokens)
11. [Patrón 11: Aislamiento Multi-Tenant y por Usuario en Llaves de Idempotencia](#patrón-11-aislamiento-multi-tenant-y-por-usuario-en-llaves-de-idempotencia)
12. [Patrón 12: Ocultación de Swagger / ReDoc / OpenAPI en Producción](#patrón-12-ocultación-de-swagger--redoc--openapi-en-producción)
13. [Patrón 13: Protocolo Shift-Left para Mitigación de CVEs Transitivos en Lockfiles](#patrón-13-protocolo-shift-left-para-mitigación-de-cves-transitivos-en-lockfiles)
14. [Patrón 14: Límites de Sesiones Concurrentes, Timeouts por Rol y Purga Total en Logout (DISA STIG & OWASP)](#patrón-14-límites-de-sesiones-concurrentes-timeouts-por-rol-y-purga-total-en-logout-disa-stig--owasp)
15. [Patrón 15: Bloqueo de Cuentas, Defensa Anti-Enumeración en Tiempo Constante y Ciclo de Vida de Credenciales](#patrón-15-bloqueo-de-cuentas-defensa-anti-enumeración-en-tiempo-constante-y-ciclo-de-vida-de-credenciales)
16. [Patrón 16: Canonicalización Unicode (NFKC), Sanitización de Cabeceras ASCII y Prevención de Command Injection](#patrón-16-canonicalización-unicode-nfkc-sanitización-de-cabeceras-ascii-y-prevención-de-command-injection)
17. [Patrón 17: Blindaje contra XML/XXE, Deserialización Insegura y Validación de Archivos por Magic Bytes](#patrón-17-blindaje-contra-xmlxxe-deserialización-insegura-y-validación-de-archivos-por-magic-bytes)
18. [Patrón 18: Auditoría Forense Inmutable, Prevención de Log Injection (CR/LF) y Alerta de Capacidad al 75%](#patrón-18-auditoría-forense-inmutable-prevención-de-log-injection-crlf-y-alerta-de-capacidad-al-75)
19. [Patrón 19: Criptografía Validada (FIPS 140-3), Zeroización de Secretos en Memoria y Sanitización de Exportaciones](#patrón-19-criptografía-validada-fips-140-3-zeroización-de-secretos-en-memoria-y-sanitización-de-exportaciones)
20. [Patrón 20: Cabeceras de Seguridad HTTP (OWASP OSHP), Estado Fail-Secure y Auto-Verificación de Seguridad](#patrón-20-cabeceras-de-seguridad-http-owasp-oshp-estado-fail-secure-y-auto-verificación-de-seguridad)
21. [Patrón 21: Mitigación de OWASP API Security Top 10 (2023), Anti-Data-Mining y Consumo Seguro de APIs](#patrón-21-mitigación-de-owasp-api-security-top-10-2023-anti-data-mining-y-consumo-seguro-de-apis)
22. [Patrón 22: Cadena de Suministro (CycloneDX SBOM/CBOM), Firma de Artefactos y Threat Modeling como Código](#patrón-22-cadena-de-suministro-cyclonedx-sbomcbom-firma-de-artefactos-y-threat-modeling-como-código)

---

## Patrón 1: Prevención de Asignación Masiva (Mass Assignment / Over-posting)

### El Riesgo
Si un modelo Pydantic o DTO acepta campos adicionales sin filtrar, un atacante puede enviar `{"username": "juan", "role": "SUPERADMIN", "is_superuser": true}`. Si el backend asigna el diccionario directamente al modelo ORM, se produce una escalada de privilegios inadvertida.

### Implementación Obligatoria (Python / Pydantic v2)
```python
from pydantic import BaseModel, ConfigDict, EmailStr

# Esquema de Entrada Estricto: Rechaza cualquier campo no esperado
class UserCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 🔒 Bloquea campos no declarados con HTTP 422

    username: str
    email: EmailStr
    password: str

# Desacoplamiento total del modelo de Base de Datos
class UserInDB(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    username: str
    email: str
    role: str = "OPERATOR"  # Asignado exclusivamente por lógica de negocio
    is_active: bool = True
```

---

## Patrón 2: Protección Anti-CSWSH (Cross-Site WebSocket Hijacking)

### El Riesgo
A diferencia de peticiones HTTP ordinarias, las conexiones WebSocket no aplican la política SOP (*Same-Origin Policy*). Si el usuario tiene una sesión activa mediante cookies, un script en un sitio malicioso puede abrir un canal WebSocket contra el backend y secuestrar datos en tiempo real.

### Implementación Obligatoria (FastAPI WebSockets)
```python
from fastapi import WebSocket, status
from src.core.config import settings

def verify_websocket_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    # En producción, rechaza orígenes nulos o no autorizados
    if not origin:
        return settings.APP_ENV != "production"
    
    # Compara contra la lista blanca de dominios permitidos
    return origin in settings.ALLOWED_ORIGINS

@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    if not verify_websocket_origin(websocket):
        # 🔒 Código 4403: Forbidden Origin (Cierre antes de aceptar el canal)
        await websocket.close(code=4403, reason="Origen no autorizado")
        return

    await websocket.accept()
    # Continuar con el canal seguro...
```

---

## Patrón 3: Sanitización de Errores de Validación 422 en Producción

### El Riesgo
FastAPI devuelve por defecto en respuestas HTTP 422 un detalle exhaustivo con nombres de atributos internos, tipos esperados y expresiones regulares. Esto permite a un atacante mapear con precisión quirúrgica la arquitectura y esquemas de la API.

### Implementación Obligatoria
```python
import logging
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from src.core.config import settings

logger = logging.getLogger(__name__)

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # En desarrollo, devuelve el error detallado para depuración
    if settings.APP_ENV != "production":
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )

    # 🔒 En producción: Registra el detalle en los logs del contenedor y devuelve respuesta opaca
    logger.warning(
        f"Fallo de validación 422 en {request.method} {request.url.path}: {exc.errors()}"
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Los datos proporcionados no cumplen con los requisitos de validación."},
    )
```

---

## Patrón 4: Defensa Anti-SSRF Estricta con Resolución DNS Previa

### El Riesgo
Cuando un usuario configura URLs de webhooks o destinos de red, un atacante puede apuntar a `http://169.254.169.254/latest/meta-data/` o `http://postgres:5432/` para extraer claves de nube o acceder a microservicios internos.

### Implementación Obligatoria
```python
import ipaddress
import socket
from urllib.parse import urlparse

FORBIDDEN_CONTAINER_HOSTS = {"localhost", "api", "postgres", "keydb", "redis", "worker"}

def validate_safe_outgoing_url(url_str: str) -> str:
    parsed = urlparse(url_str.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Esquema no permitido: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL sin hostname válido")

    if hostname.lower() in FORBIDDEN_CONTAINER_HOSTS:
        raise ValueError("Acceso prohibido a recursos internos de infraestructura")

    # 🔒 Resuelve DNS antes de realizar la petición HTTP
    try:
        resolved_ips = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"No se pudo resolver el host: {hostname}") from exc

    for item in resolved_ips:
        ip_addr_str = item[4][0]
        ip = ipaddress.ip_address(ip_addr_str)

        # Bloquea rangos privados RFC 1918, Loopback, Link-Local y Multicast
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            raise ValueError(f"Destino prohibido en red privada/reservada ({ip_addr_str})")

    return url_str
```

---

## Patrón 5: Consultas Parametrizadas Seguras en Contextos Dinámicos de BD

### El Riesgo
Uso de interpolación de cadenas de texto (`f-strings`) para configurar variables de sesión o tenant (`SET LOCAL app.current_tenant_id = f'{tenant_id}'`), susceptible a inyección SQL.

### Implementación Obligatoria (SQLAlchemy Core)
```python
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    # 🔒 Sentencia parametrizada obligatoria con bindparam seguro
    query = text("SET LOCAL app.current_tenant_id = :tenant_id").bindparams(
        tenant_id=tenant_id
    )
    await session.execute(query)
```

---

## Patrón 6: Cuotas y Límites Estrictos de Carga de Archivos (Anti-DoS / OOM)

### El Riesgo
Cargas de archivos masivas (CSVs o binarios) que consumen toda la memoria RAM del servidor si se leen con `await file.read()` sin límites de tamaño.

### Implementación Obligatoria
```python
from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB

async def read_uploaded_file_safely(file: UploadFile) -> bytes:
    chunk_size = 64 * 1024  # 64 KB por lectura
    total_bytes = 0
    buffer = bytearray()

    while chunk := await file.read(chunk_size):
        total_bytes += len(chunk)
        if total_bytes > MAX_UPLOAD_SIZE_BYTES:
            # 🔒 Corta la lectura inmediatamente y responde 413
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="El archivo excede el tamaño máximo permitido de 2 MB.",
            )
        buffer.extend(chunk)

    return bytes(buffer)
```

---

## Patrón 7: Preservación de Cabeceras de Proxy Inverso en Nginx

### El Riesgo
Nginx actúa como terminador de TLS y proxy reverso. Si no reenvía las cabeceras originales, FastAPI y los registros de auditoría creerán que todas las peticiones provienen de la IP del puente Docker (`172.18.0.1`), anulando el rate-limiting y la trazabilidad de seguridad.

### Configuración Obligatoria (`nginx.conf`)
```nginx
location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws/ {
    proxy_pass http://api:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## Patrón 8: Middleware Anti-CSRF Desacoplado con Exclusión de Tokens Bearer

### El Riesgo
Requerir tokens CSRF en llamadas de APIs Machine-to-Machine (M2M) o agentes de IA que ya usan cabeceras `Authorization: Bearer` genera bloqueos innecesarios, mientras que no exigirlos en llamadas desde cookies de navegador genera vulnerabilidad CSRF.

### Implementación Obligatoria
```python
import hmac
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Exime métodos seguros (GET, HEAD, OPTIONS)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        # 🔒 Regla OWASP: Si la petición usa cabecera Authorization: Bearer, no requiere CSRF
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # Si la petición depende de cookies de navegador, exige X-CSRF-Token
        csrf_token = request.headers.get("X-CSRF-Token")
        if not csrf_token or not self.validate_csrf_token(csrf_token, request):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Token CSRF inválido o faltante."},
            )

        return await call_next(request)

    def validate_csrf_token(self, token: str, request: Request) -> bool:
        # Validación HMAC con digest seguro...
        return True
```

---

## Patrón 9: Prevención de XSS y Prototype Pollution en Frontend

### El Riesgo
Inyectar datos dinámicos en el DOM usando `element.innerHTML` o popups de mapas cartográficos sin escapar caracteres especiales, o combinar objetos JSON no sanitizados permitiendo contaminar `Object.prototype`.

### Implementación Obligatoria (TypeScript / Vue 3 / React)
```typescript
// vue3/src/utils/security.ts

/**
 * 🔒 Sanitiza texto para prevenir Cross-Site Scripting (XSS) en innerHTML
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);

  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const FORBIDDEN_PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 🔒 Sanitiza objetos contra ataques de Prototype Pollution
 */
export function sanitizeObject<T>(input: T): T {
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const result = Object.create(null);
  for (const [key, value] of Object.entries(input)) {
    if (!FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
      result[key] = sanitizeObject(value);
    }
  }
  return result as T;
}
```

---

## Patrón 10: Tolerancia a Carreras Concurrentes (Grace Period de 5s) en Refresh Tokens

### El Riesgo
En rotación estricta de Refresh Tokens, cuando un usuario abre 3 pestañas simultáneas, las tres envían el mismo refresh token. La primera petición lo rota exitosamente; la segunda llega milisegundos después y el backend la cataloga falsamente como un intento de **reúso malicioso**, revocando la sesión y expulsando al usuario legítimo.

### Implementación Obligatoria (KeyDB / Redis)
```python
import time

GRACE_PERIOD_SECONDS = 5

async def rotate_refresh_token(redis_client, old_token_family_id: str, new_token: str) -> None:
    now = int(time.time())
    
    # 🔒 En lugar de borrar el token anterior inmediatamente, almacena la llave con TTL de cortesía
    # Esto permite que las peticiones de otras pestañas que salieron casi a la par se acepten
    await redis_client.set(
        f"grace_period:{old_token_family_id}",
        new_token,
        ex=GRACE_PERIOD_SECONDS,
    )
```

---

## Patrón 11: Aislamiento Multi-Tenant y por Usuario en Llaves de Idempotencia

### El Riesgo
Si la clave de idempotencia en KeyDB solo usa el UUID enviado por el cliente (`SET idemp:018f4a12-...`), un atacante de un tenant A puede generar una colisión intencional contra el tenant B, bloqueando o alterando sus transacciones.

### Implementación Obligatoria
```python
def build_idempotency_key(tenant_id: str, user_id: str, client_key: str) -> str:
    # 🔒 Clave aislada estrictamente por Tenant y Usuario
    return f"idemp:{tenant_id}:{user_id}:{client_key}"
```

---

## Patrón 12: Ocultación de Swagger / ReDoc / OpenAPI en Producción

### El Riesgo
En producción, los endpoints `/docs`, `/redoc` y `/openapi.json` exponen detalles de implementación, parámetros de consulta y rutas ocultas a cualquier escáner de internet.

### Implementación Obligatoria
```python
from fastapi import FastAPI
from src.core.config import settings

is_prod = settings.APP_ENV == "production"

app = FastAPI(
    title="Corporate API",
    # 🔒 Desactivación incondicional en producción
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)
```

---

## Patrón 13: Protocolo Shift-Left para Mitigación de CVEs Transitivos en Lockfiles

### El Riesgo
Descubrir CVEs críticos en dependencias de producción solo cuando el workflow de GitHub Actions falla tras el commit, generando cuellos de botella y demoras en despliegue.

### Flujo de Mitigación Local
1. Ejecutar escaneo local:
   ```bash
   ./scripts/auditar-infra.sh
   ```
2. Si Trivy reporta un CVE en una dependencia transitiva (ej. `certifi` o `tar`):
   - **Para Python:** Actualizar la librería congelada en Docker:
     ```bash
     docker compose -f fastapi/docker-compose.qa.yml run --rm qa-backend uv lock --upgrade-package certifi
     ```
   - **Para Node.js / Frontend:** Actualizar selectivamente:
     ```bash
     docker compose -f vue3/docker-compose.qa.yml run --rm qa-vue3 pnpm update tar
     ```
3. Ejecutar las pruebas unitarias (`make qa-unit`) para descartar regresiones.
4. Re-ejecutar `./scripts/auditar-infra.sh` certificando `0` hallazgos.

---

## Patrón 14: Límites de Sesiones Concurrentes, Timeouts por Rol y Purga Total en Logout (DISA STIG & OWASP)

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222387` (`APSC-DV-000010`), `V-222388` (`APSC-DV-000060`), `V-222389` (`APSC-DV-000070`), `V-222390` (`APSC-DV-000080`), `V-222392` (`APSC-DV-000100`), `V-222549` (`APSC-DV-001800`), `V-222578`..`V-222583` (`APSC-DV-002240`..`002290`), `V-222672` (`APSC-DV-003360`).
- **OWASP Developer Guide v4.2:** Sección `4.3.7 Session Management (SM 1-21)`.

### El Riesgo
Permitir sesiones concurrentes ilimitadas o con tiempos de inactividad uniformes expone cuentas administrativas a secuestro de sesión (*Session Hijacking*), fijación de sesión (*Session Fixation*) y persistencia de datos sensibles en el almacenamiento del navegador tras cerrar sesión.

### Implementación Obligatoria (Backend en FastAPI + KeyDB y Frontend en TypeScript)
```python
import secrets
import time
from fastapi import HTTPException, Response, status

# 🔒 DISA STIG V-222389 / V-222390: Timeouts de inactividad diferenciados por rol
IDLE_TIMEOUT_PRIVILEGED_SEC = 10 * 60   # 10 minutos para roles administrativos
IDLE_TIMEOUT_STANDARD_SEC = 15 * 60     # 15 minutos para roles operativos estándar
ABSOLUTE_SESSION_LIFETIME_SEC = 8 * 3600 # OWASP SM-8: Expiración absoluta de sesión
MAX_CONCURRENT_SESSIONS = 2             # DISA STIG V-222387: Límite de sesiones simultáneas

async def create_or_rotate_session(
    redis_client,
    user_id: str,
    role: str,
    client_ip: str,
    previous_session_id: str | None = None,
) -> str:
    # 🔒 DISA STIG V-222581 / OWASP SM-9: Invalidar sesión previa al autenticar o elevar privilegios
    if previous_session_id:
        await redis_client.delete(f"sess:{previous_session_id}")

    # 🔒 DISA STIG V-222582 / V-222583: CSPRNG criptográfico (256 bits de entropía, sin reciclaje)
    new_session_id = secrets.token_urlsafe(32)
    user_sessions_key = f"user_sessions:{user_id}"

    # 🔒 DISA STIG V-222387 / V-222672: Controlar concurrencia y auditar IPs distintas
    active_sessions = await redis_client.smembers(user_sessions_key)
    if len(active_sessions) >= MAX_CONCURRENT_SESSIONS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Límite máximo de sesiones concurrentes alcanzado.",
        )

    idle_ttl = (
        IDLE_TIMEOUT_PRIVILEGED_SEC
        if role in {"SUPERADMIN", "ADMIN", "SECOPS"}
        else IDLE_TIMEOUT_STANDARD_SEC
    )
    now = int(time.time())
    await redis_client.hset(
        f"sess:{new_session_id}",
        mapping={
            "user_id": user_id,
            "role": role,
            "ip": client_ip,
            "created_at": str(now),
            "last_activity": str(now),
        },
    )
    await redis_client.expire(f"sess:{new_session_id}", idle_ttl)
    await redis_client.sadd(user_sessions_key, new_session_id)
    return new_session_id

async def revoke_all_user_sessions(redis_client, user_id: str) -> None:
    """DISA STIG V-222549 / OWASP SM-19: Revocación total al deshabilitar cuenta o cambiar credenciales."""
    user_sessions_key = f"user_sessions:{user_id}"
    session_ids = await redis_client.smembers(user_sessions_key)
    for sid in session_ids:
        sid_str = sid.decode() if isinstance(sid, bytes) else sid
        await redis_client.delete(f"sess:{sid_str}")
    await redis_client.delete(user_sessions_key)
```

```typescript
// 🔒 DISA STIG V-222388, V-222392, V-222578: Purga total de almacenamiento temporal y mensaje explícito
export async function executeSecureLogoff(apiLogoutUrl: string): Promise<string> {
  try {
    await fetch(apiLogoutUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Cache-Control': 'no-store' },
    });
  } finally {
    sessionStorage.clear();
    localStorage.clear();
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  }
  return 'Su sesión ha sido cerrada de forma segura y todos los datos temporales han sido eliminados.';
}
```

---

## Patrón 15: Bloqueo de Cuentas, Defensa Anti-Enumeración en Tiempo Constante y Ciclo de Vida de Credenciales

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222408`..`V-222411` (`APSC-DV-000290`..`000320`), `V-222432`..`V-222437` (`APSC-DV-000530`..`000580`), `V-222520` (`APSC-DV-001470`), `V-222536`..`V-222547` (`APSC-DV-001680`..`001790`).
- **OWASP Developer Guide v4.2:** Sección `4.3.7 Authentication (A 1-20) & Password Policy (P 1-12)`.

### El Riesgo
Si la API responde más rápido cuando un usuario no existe que cuando la contraseña falla (porque omite el cálculo de Argon2id), un atacante puede enumerar cuentas válidas mediante análisis de tiempos (*Timing Side-Channel*) y lanzar ataques de fuerza bruta sobre cuentas huérfanas o temporales no expiradas.

### Implementación Obligatoria (Python / FastAPI)
```python
import re
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
# 🔒 Hash señuelo precalculado para garantizar tiempo constante cuando el usuario no existe (OWASP A-19, A-20)
DUMMY_ARGON2_HASH = ph.hash("ConstantTime_Dummy_Secret_2026!@#")

MAX_FAILED_ATTEMPTS = 3          # DISA STIG V-222432: Máximo 3 intentos fallidos consecutivos
LOCKOUT_WINDOW_SECONDS = 15 * 60 # En una ventana de 15 minutos
TEMP_ACCOUNT_MAX_HOURS = 72      # DISA STIG V-222409: Cuentas temporales expiran en 72h
INACTIVE_ACCOUNT_MAX_DAYS = 35   # DISA STIG V-222411: Cuentas inactivas se deshabilitan a los 35 días

def validate_password_stig_policy(new_password: str, old_password: str | None = None) -> None:
    """DISA STIG V-222536..V-222541: Política de 15 caracteres, complejidad y diferencial de 8 caracteres."""
    if len(new_password) < 15:
        raise ValueError("La contraseña debe tener al menos 15 caracteres (APSC-DV-001680).")
    if not (
        re.search(r"[A-Z]", new_password)
        and re.search(r"[a-z]", new_password)
        and re.search(r"\d", new_password)
        and re.search(r"[^A-Za-z0-9]", new_password)
    ):
        raise ValueError("La contraseña debe incluir mayúsculas, minúsculas, números y caracteres especiales.")
    if old_password:
        diff_chars = sum(1 for a, b in zip(new_password, old_password) if a != b) + abs(
            len(new_password) - len(old_password)
        )
        if diff_chars < 8:
            raise ValueError("Al menos 8 caracteres deben cambiar respecto a la contraseña anterior (APSC-DV-001730).")

async def verify_credentials_constant_time(
    redis_client,
    user_record: dict | None,
    candidate_password: str,
    username_key: str,
) -> dict:
    fail_key = f"auth_fail:{username_key}"
    attempts = int(await redis_client.get(fail_key) or 0)
    if attempts >= MAX_FAILED_ATTEMPTS:
        raise PermissionError("Credenciales inválidas o cuenta temporalmente bloqueada.")

    target_hash = user_record["password_hash"] if user_record else DUMMY_ARGON2_HASH
    try:
        ph.verify(target_hash, candidate_password)
        password_ok = user_record is not None
    except VerifyMismatchError:
        password_ok = False

    if not password_ok:
        pipe = redis_client.pipeline()
        pipe.incr(fail_key)
        pipe.expire(fail_key, LOCKOUT_WINDOW_SECONDS)
        await pipe.execute()
        raise PermissionError("Credenciales inválidas o cuenta temporalmente bloqueada.")

    await redis_client.delete(fail_key)
    # 🔒 DISA STIG V-222437 / OWASP P-12: Retornar fecha/hora del último inicio de sesión al usuario
    return {
        "user_id": user_record["id"],
        "last_Interactive_logon_utc": user_record.get("last_logon_utc"),
        "last_failed_attempt_utc": user_record.get("last_failed_utc"),
    }
```

---

## Patrón 16: Canonicalización Unicode (NFKC), Sanitización de Cabeceras ASCII y Prevención de Command Injection

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222604` (`APSC-DV-002510`), `V-222605` (`APSC-DV-002520`), `V-222606` (`APSC-DV-002530`).
- **OWASP Developer Guide v4.2:** Secciones `4.3.3 SFL-9`, `4.3.5 Canonicalization (CEC 1-5)` y `4.3.6 Server-Side Validation (SSV 1-7) & Language/Framework (LF-6)`.

### El Riesgo
Los atacantes utilizan representaciones Unicode homógrafas o descompuestas (como `＜script＞` en ancho completo `U+FF1C`) que superan los filtros de validación antes de que un componente posterior los normalice a `<script>`. Asimismo, la invocación de subprocesos con `shell=True` permite encadenar comandos arbitrarios del sistema operativo.

### Implementación Obligatoria (Python)
```python
import subprocess
import unicodedata
from pathlib import Path

def canonicalize_and_validate_text(raw_value: str, max_length: int = 256) -> str:
    """DISA STIG V-222605 & OWASP CEC-5 / SSV-3: Canonicalizar a NFKC ANTES de validar."""
    normalized = unicodedata.normalize("NFKC", raw_value).strip()
    if len(normalized) > max_length:
        raise ValueError("Longitud de entrada excede el límite permitido.")
    # Rechazar caracteres de control ASCII no imprimibles (excepto tabulación/salto de línea si aplica)
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in normalized):
        raise ValueError("Se detectaron caracteres de control ASCII ilegales.")
    return normalized

def run_allowlisted_diagnostic_tool(target_ip: str) -> str:
    """DISA STIG V-222604 & OWASP SFL-9: Prohibido shell=True; usar lista blanca de argumentos."""
    clean_ip = canonicalize_and_validate_text(target_ip, max_length=45)
    # 🔒 Ejecución directa de binario con ruta absoluta, sin intérprete de comandos (shell=False)
    completed = subprocess.run(
        ["/usr/bin/ping", "-c", "1", "-W", "2", clean_ip],
        shell=False,
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    )
    return completed.stdout
```

---

## Patrón 17: Blindaje contra XML/XXE, Deserialización Insegura y Validación de Archivos por Magic Bytes

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222398`..`V-222406` (`APSC-DV-000160`..`000270`), `V-222593` (`APSC-DV-002390`), `V-222601` (`APSC-DV-002485`), `V-222608` (`APSC-DV-002550`), `V-222626` (`APSC-DV-002960`).
- **OWASP Developer Guide v4.2:** Secciones `4.3.2 File Management (FM 1-5)`, `4.3.6 Verify Safe Deserialization (VSD 1-6)` y `File Validation (FV 1-9)`.

### El Riesgo
1. **XXE (XML External Entity):** Los analizadores XML con resolución de entidades o DTD habilitados permiten leer `/etc/passwd` o realizar SSRF internos.
2. **Deserialización Insegura:** El uso de `pickle.loads()` o `yaml.load()` permite ejecución remota de código (RCE).
3. **Spoofing de Archivos y Path Traversal:** Confiar en `file.filename` o `file.content_type` sin verificar los *Magic Bytes* de cabecera permite subir scripts ejecutables disfrazados de imágenes o acceder a archivos arbitrarios del servidor.

### Implementación Obligatoria (Python)
```python
import hmac
import hashlib
import json
from lxml import etree

# 🔒 DISA STIG V-222593 / V-222608: Deshabilitar DTDs, entidades externas y acceso de red en XML
SAFE_XML_PARSER = etree.XMLParser(
    resolve_entities=False,
    no_network=True,
    dtd_validation=False,
    load_dtd=False,
    huge_tree=False,
)

def parse_xml_safely(xml_bytes: bytes) -> etree._Element:
    return etree.fromstring(xml_bytes, parser=SAFE_XML_PARSER)

# 🔒 OWASP VSD 1-6: Deserialización segura mediante JSON estricto + verificación de firma HMAC
def deserialize_signed_payload(payload_bytes: bytes, signature_hex: str, secret_key: bytes) -> dict:
    expected_mac = hmac.new(secret_key, payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_mac, signature_hex):
        raise ValueError("Firma criptográfica de payload inválida (OWASP VSD-3).")
    data = json.loads(payload_bytes.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Estructura de objeto no permitida.")
    return data

# 🔒 DISA STIG V-222601 / V-222626 & OWASP FV 1-9: Validación por Magic Bytes y Mapeo por Índice
ALLOWED_MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF-",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
}

REPORT_INDEX_MAP: dict[str, str] = {
    "monthly_audit": "/var/app_storage/reports/audit_2026_11.pdf",
    "compliance_summary": "/var/app_storage/reports/stig_summary.pdf",
}

def verify_file_magic_bytes(header_bytes: bytes, declared_mime: str) -> None:
    expected_magic = ALLOWED_MAGIC_BYTES.get(declared_mime)
    if not expected_magic or not header_bytes.startswith(expected_magic):
        raise ValueError("El encabezado binario del archivo no coincide con un formato permitido.")

def resolve_indexed_file(file_key: str) -> str:
    """Nunca aceptar rutas directas del usuario; usar un mapa de índices en lista blanca."""
    if file_key not in REPORT_INDEX_MAP:
        raise KeyError("Referencia de recurso inválida.")
    return REPORT_INDEX_MAP[file_key]
```

---

## Patrón 18: Auditoría Forense Inmutable, Prevención de Log Injection (CR/LF) y Alerta de Capacidad al 75%

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222444` (`APSC-DV-000650`), `V-222446`..`V-222509` (`APSC-DV-000670`..`001370`).
- **OWASP Developer Guide v4.2:** Sección `4.3.10 Security Logging (SL 1-13) & Security Log Design (SLD 1-11)`.

### El Riesgo
1. **Log Injection / Forgery:** Si un usuario introduce saltos de línea (`\r\n`) o etiquetas HTML en un campo que se registra en los logs, puede falsificar entradas de auditoría completas o ejecutar XSS en paneles de visualización de logs.
2. **Fuga de Secretos en Logs:** Registrar tokens de sesión, contraseñas o PII convierte al SIEM en un vector de robo de credenciales (`V-222444`).
3. **Agotamiento Silencioso de Almacenamiento:** Si el disco de auditoría se llena sin alertar al equipo de operaciones al **75% de capacidad** (`V-222483`), el sistema pierde trazabilidad forense ante un incidente.

### Implementación Obligatoria (Python)
```python
import hashlib
import hmac
import json
import shutil
from datetime import datetime, timezone

AUDIT_STORAGE_ALERT_RATIO = 0.75 # 🔒 DISA STIG V-222483: Alerta obligatoria al 75% de capacidad

def sanitize_log_field(value: str) -> str:
    """OWASP SL-4 & SLD-2: Erradica inyección CR/LF y caracteres de control en logs."""
    return (
        value.replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )

def build_tamper_evident_audit_record(
    app_id: str,
    component: str,
    event_type: str,
    actor_id: str,
    source_ip: str,
    destination_ip: str,
    outcome: str,
    trace_id: str,
    previous_record_hmac: str,
    audit_hmac_key: bytes,
) -> dict:
    """DISA STIG V-222470..V-222509 & OWASP SLD 1-11: Registro UTC encadenado con HMAC."""
    record = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "app_id": sanitize_log_field(app_id),
        "component": sanitize_log_field(component),
        "event_type": sanitize_log_field(event_type),
        "actor_id": sanitize_log_field(actor_id),
        "source_ip": sanitize_log_field(source_ip),
        "destination_ip": sanitize_log_field(destination_ip),
        "outcome": sanitize_log_field(outcome),
        "trace_id": sanitize_log_field(trace_id),
        "prev_hmac": previous_record_hmac,
    }
    canonical_payload = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
    record["record_hmac"] = hmac.new(audit_hmac_key, canonical_payload, hashlib.sha256).hexdigest()
    return record

def check_audit_storage_capacity(audit_mount_path: str = "/var/log") -> dict:
    """DISA STIG V-222483 (APSC-DV-001090): Alerta inmediata cuando el almacenamiento supera el 75%."""
    usage = shutil.disk_usage(audit_mount_path)
    used_ratio = usage.used / usage.total
    return {
        "used_ratio": round(used_ratio, 4),
        "alert_triggered": used_ratio >= AUDIT_STORAGE_ALERT_RATIO,
    }
```

---

## Patrón 19: Criptografía Validada (FIPS 140-3), Zeroización de Secretos en Memoria y Sanitización de Exportaciones

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222393`..`V-222395` (`APSC-DV-000110`..`000130`), `V-222570`..`V-222577` (`APSC-DV-002010`..`002230`), `V-222612` (`APSC-DV-002590`), `V-222643` (`APSC-DV-003120`), `V-222666` (`APSC-DV-003310`).
- **OWASP Developer Guide v4.2:** Sección `4.3.9 Data Protection, Memory Management (MM 1-9) & Cryptographic Practices (CP 1-7)`.

### El Riesgo
Mantener claves criptográficas o contraseñas en búferes de memoria tras su uso las expone a volcados de memoria (*Core Dumps* / *Heartbleed-style leaks*). Asimismo, exportar respaldos o volcados de base de datos sin purgar credenciales administrativas o sin etiquetar la clasificación de sensibilidad expone datos críticos en entornos de preproducción.

### Implementación Obligatoria (Python)
```python
from contextlib import contextmanager
from typing import Iterator

@contextmanager
def ephemeral_secret_buffer(secret_bytes: bytes) -> Iterator[bytearray]:
    """DISA STIG V-222612 & OWASP MM-3/MM-8: Sobrescribe el búfer de memoria en todos los puntos de salida."""
    buf = bytearray(secret_bytes)
    try:
        yield buf
    finally:
        for i in range(len(buf)):
            buf[i] = 0

SENSITIVE_EXPORT_FIELDS = {"password_hash", "totp_secret", "vault_dek", "api_private_key", "db_admin_dsn"}

def sanitize_database_export_rows(rows: list[dict], security_classification: str = "CONFIDENTIAL") -> list[dict]:
    """DISA STIG V-222393, V-222643, V-222666: Purga credenciales de exportaciones y adjunta etiqueta de seguridad."""
    sanitized: list[dict] = []
    for row in rows:
        clean_row = {k: v for k, v in row.items() if k not in SENSITIVE_EXPORT_FIELDS}
        clean_row["_security_label"] = security_classification
        sanitized.append(clean_row)
    return sanitized
```

---

## Patrón 20: Cabeceras de Seguridad HTTP (OWASP OSHP), Estado Fail-Secure y Auto-Verificación de Seguridad

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222585` (`APSC-DV-002310`), `V-222586` (`APSC-DV-002320`), `V-222615` (`APSC-DV-002760`), `V-222616` (`APSC-DV-002770`), `V-222668` (`APSC-DV-003330`).
- **OWASP Developer Guide v4.2:** Secciones `4.3.2 System Configuration (SC 8-11)`, `4.3.8 AC-10/AC-11`, `4.3.9 DP 5-7 / PDT 9-10` y `5.4.4 OWASP Secure Headers Project (OSHP)`.

### El Riesgo
Si una aplicación continúa aceptando tráfico cuando falla la carga de políticas de seguridad o la conexión al motor de autorización (*Fail-Open*), un atacante puede provocar un fallo de recursos para eludir los controles de acceso. Además, la ausencia de cabeceras OSHP (`HSTS`, `CSP`, `Referrer-Policy`, `Cache-Control: no-store`) facilita ataques de degradación TLS, XSS y fuga de tokens en URLs.

### Implementación Obligatoria (FastAPI Middleware + Lifespan Fail-Secure)
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

async def verify_security_functions_self_test() -> None:
    """DISA STIG V-222616 (APSC-DV-002770): Auto-verificación de funciones criptográficas y de seguridad al arranque."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = AESGCM.generate_key(bit_length=256)
    nonce = b"\x00" * 12
    ct = AESGCM(key).encrypt(nonce, b"self-test", b"aad")
    if AESGCM(key).decrypt(nonce, ct, b"aad") != b"self-test":
        raise RuntimeError("Fallo crítico en auto-verificación criptográfica.")

@asynccontextmanager
async def fail_secure_lifespan(app: FastAPI):
    """DISA STIG V-222585 & OWASP AC-10: En caso de fallo de inicialización, abortar en estado seguro (Fail-Closed)."""
    await verify_security_functions_self_test()
    yield

class OWASPSecureHeadersMiddleware(BaseHTTPMiddleware):
    """OWASP OSHP 5.4.4 & 4.3.9: Cabeceras de defensa en profundidad y supresión de banners de versión."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        # 🔒 OWASP SC-11: Eliminar cabeceras que revelen versiones del servidor o framework
        for header in ("Server", "X-Powered-By"):
            if header in response.headers:
                del response.headers[header]
        return response
```

---

## Patrón 21: Mitigación de OWASP API Security Top 10 (2023), Anti-Data-Mining y Consumo Seguro de APIs

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222424` (`APSC-DV-000450`), `V-222425` (`APSC-DV-000460`).
- **OWASP Developer Guide v4.2:** Sección `7.8 OWASP API Security Top 10` (`API1:2023 BOLA`, `API3:2023 BOPLA`, `API4:2023 Unrestricted Resource Consumption`, `API5:2023 BFLA`, `API6:2023 Sensitive Business Flows`, `API10:2023 Unsafe Consumption of APIs`).

### El Riesgo
1. **BOLA (`API1:2023`) y BOPLA (`API3:2023`):** Permitir el acceso a un objeto por su ID sin verificar simultáneamente la pertenencia al `tenant_id` y al propietario, o devolver atributos internos sensibles por no usar un esquema de salida explícito.
2. **Data Mining (`V-222424` / `API4:2023`):** Consultas masivas o enumeración automatizada de registros para exfiltrar la base de datos página por página.
3. **Consumo Inseguro de APIs de Terceros (`API10:2023`):** Confiar ciegamente en respuestas JSON de APIs externas sin aplicar timeouts, límites de tamaño ni validación de esquema.

### Implementación Obligatoria (Python / FastAPI)
```python
import httpx
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

MAX_PAGE_LIMIT = 100
DATA_MINING_QUERY_THRESHOLD_PER_MIN = 60

class ExternalPartnerPayload(BaseModel):
    """OWASP API10:2023: Validar estrictamente payloads provenientes de APIs de terceros."""
    model_config = ConfigDict(extra="forbid")
    partner_id: str = Field(min_length=3, max_length=64)
    status: str = Field(pattern=r"^(ACTIVE|SUSPENDED|PENDING)$")

async def enforce_anti_data_mining_quota(
    redis_client,
    tenant_id: str,
    user_id: str,
    requested_limit: int,
) -> int:
    """DISA STIG V-222424 (APSC-DV-000450) & OWASP API4:2023: Limita paginación y detecta extracción masiva."""
    if requested_limit > MAX_PAGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El límite máximo por página es {MAX_PAGE_LIMIT}.",
        )
    rate_key = f"datamining:{tenant_id}:{user_id}"
    count = await redis_client.incr(rate_key)
    if count == 1:
        await redis_client.expire(rate_key, 60)
    if count > DATA_MINING_QUERY_THRESHOLD_PER_MIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Patrón anómalo de extracción masiva de datos bloqueado (APSC-DV-000450).",
        )
    return requested_limit

async def fetch_external_partner_safely(url: str) -> ExternalPartnerPayload:
    """OWASP API10:2023: Timeouts estrictos, TLS verificado, sin redirecciones abiertas y validación Pydantic."""
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, verify=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        if len(resp.content) > 65536:
            raise ValueError("Respuesta de API externa excede la cuota de seguridad.")
        return ExternalPartnerPayload.model_validate_json(resp.content)
```

---

## Patrón 22: Cadena de Suministro (CycloneDX SBOM/CBOM), Firma de Artefactos y Threat Modeling como Código

### Referencias Normativas
- **DISA ASD STIG V6R5:** `V-222513` (`APSC-DV-001430`), `V-222613` (`APSC-DV-002600`), `V-222645` (`APSC-DV-003140`), `V-222655` (`APSC-DV-003230`), `V-222658` (`APSC-DV-003245`).
- **OWASP Developer Guide v4.2:** Secciones `4.2 Threat Modeling (pytm / Threat Dragon)`, `4.3.3 Software Libraries (SFL 1-15)` y `5.3.4 OWASP CycloneDX (ECMA-424 SBOM / CBOM / VEX)`.

### El Riesgo
Desplegar contenedores o paquetes sin un inventario verificable de componentes (*Software & Cryptography Bill of Materials*), sin verificar firmas criptográficas o sin modelar las amenazas de la arquitectura antes de codificar permite ataques a la cadena de suministro (*Supply Chain Attacks*) y fallos estructurales de diseño.

### Implementación Obligatoria (Threat Modeling como Código con `pytm` y Generación de CycloneDX SBOM)
```python
# threat_model.py — OWASP pytm (DISA STIG V-222655 / OWASP 4.2.5)
from pytm import TM, Actor, Boundary, Data, Dataflow, Datastore, DatastoreType, Server

tm = TM("Arquitectura Corporativa 11X")
tm.description = "Modelo de amenazas programático (STRIDE) sincronizado en CI/CD"
tm.isOrdered = True

internet = Boundary("Internet Pública")
vpc_privada = Boundary("Red Interna de Contenedores Docker")

operador = Actor("Operador Autenticado")
operador.inBoundary = internet

api_gateway = Server("FastAPI Backend")
api_gateway.inBoundary = vpc_privada
api_gateway.OS = "Debian Hardened Non-Root"
api_gateway.controls.isHardened = True
api_gateway.controls.sanitizesInput = True
api_gateway.controls.validatesInput = True
api_gateway.controls.authorizesSource = True

postgres_rls = Datastore("PostgreSQL 16 con FORCE RLS")
postgres_rls.inBoundary = vpc_privada
postgres_rls.type = DatastoreType.SQL
postgres_rls.controls.isEncryptedAtRest = True

credenciales = Data("Payload Autenticado con CSRF y Cookie HttpOnly")
flujo_https = Dataflow(operador, api_gateway, "Petición HTTPS TLS 1.3")
flujo_https.protocol = "HTTPS"
flujo_https.dstPort = 443
flujo_https.data = credenciales
flujo_https.controls.isEncryptedInTransit = True
```

```bash
# 🔒 Generación de SBOM / CBOM en formato estándar OWASP CycloneDX (ECMA-424) y verificación de integridad
docker compose -f fastapi/docker-compose.qa.yml run --rm qa-backend \
  uv run cyclonedx-py environment -o sbom-backend.cdx.json

# 🔒 Verificación criptográfica SHA-256 del artefacto y SBOM antes de publicación (DISA V-222513 / V-222645)
sha256sum sbom-backend.cdx.json > sbom-backend.cdx.json.sha256
sha256sum --check sbom-backend.cdx.json.sha256
```

---

## Anexo PHP 8.2–8.5 (`sinfallas/basephpcomposer`): Recetario de Seguridad DISA ASD STIG V6R5 + OWASP v4.2

En aplicaciones y APIs construidas sobre **PHP 8.2 a 8.5** utilizando la imagen base oficial multi-arquitectura (`amd64`/`arm64`) `sinfallas/basephpcomposer` (tags `8.2`, `8.3`, `8.4`, `8.5` y `latest`), se deben aplicar de forma innegociable los siguientes controles nativos:

1. **Directivas de Endurecimiento en `php.ini` (`DISA APSC-DV-002430` & `OWASP OSHP`):**
   - `expose_php = Off` (suprime el banner `X-Powered-By: PHP/8.x` en todas las respuestas HTTP).
   - `zend.exception_ignore_args = On` y `display_errors = Off` (evita fugas de contraseñas o tokens en stack traces).
   - `session.use_strict_mode = 1`, `session.cookie_httponly = 1`, `session.cookie_secure = 1`, `session.cookie_samesite = "Strict"` y `session.sid_length = 48`.
   - `opcache.save_comments = 1` (indispensable para no romper atributos PHP 8 `#[...]` ni anotaciones de validación/rutas en Doctrine, Symfony, Laravel y Swagger-PHP).

2. **Canonicalización Unicode NFKC, Bóveda AES-256-GCM con `sodium_memzero` y Argon2id en Tiempo Constante:**
```php
<?php

declare(strict_types=1);

namespace App\Security;

final class DisaStigSecurityGuard
{
    private const DUMMY_ARGON2ID_HASH = '$argon2id$v=19$m=65536,t=4,p=1$c2luZmFsbGFzMTF4$7W5rT3x9mK2pL8vN1qR4sT6uV8wX0yZ2aB4cD6eF8gH';

    /**
     * Patrón 16 (APSC-DV-002520): Canonicalización Unicode NFKC previa a cualquier validación.
     */
    public static function canonicalizeNfkc(string $rawInput, int $maxLength = 256): string
    {
        $normalized = \Normalizer::normalize($rawInput, \Normalizer::FORM_KC);
        if ($normalized === false) {
            throw new \InvalidArgumentException('Secuencia UTF-8 inválida.');
        }
        $trimmed = trim($normalized);
        if (mb_strlen($trimmed, 'UTF-8') > $maxLength || preg_match('/[\x00-\x1F\x7F]/u', $trimmed) === 1) {
            throw new \InvalidArgumentException('Entrada rechazada por longitud o caracteres de control ASCII.');
        }
        return $trimmed;
    }

    /**
     * Patrón 19 (APSC-DV-002010 / APSC-DV-002590): Cifrado AES-256-GCM con AAD y zeroización de clave en RAM.
     */
    public static function encryptSecretWithZeroization(string $plaintext, string &$rawKey32Bytes, string $tenantId): string
    {
        try {
            $iv = random_bytes(12);
            $tag = '';
            $ciphertext = openssl_encrypt(
                $plaintext,
                'aes-256-gcm',
                $rawKey32Bytes,
                OPENSSL_RAW_DATA,
                $iv,
                $tag,
                "tenant:{$tenantId}",
                16
            );
            if ($ciphertext === false) {
                throw new \RuntimeException('Fallo en cifrado autenticado AES-256-GCM.');
            }
            return base64_encode($iv . $tag . $ciphertext);
        } finally {
            // 🔒 Zeroización nativa en C del buffer de memoria (ext-sodium)
            sodium_memzero($rawKey32Bytes);
        }
    }

    /**
     * Patrón 15 (APSC-DV-000530): Verificación Argon2id en tiempo constante con bloqueo a 3 intentos / 15m en KeyDB.
     */
    public static function verifyCredentialsConstantTime(\Redis $keydb, ?array $userRecord, string $password, string $username): bool
    {
        $failKey = "auth_fail:{$username}";
        if ((int) ($keydb->get($failKey) ?: 0) >= 3) {
            throw new \RuntimeException('Cuenta bloqueada temporalmente por 15 minutos (APSC-DV-000530).');
        }
        $targetHash = is_array($userRecord) && isset($userRecord['password_hash'])
            ? (string) $userRecord['password_hash']
            : self::DUMMY_ARGON2ID_HASH;

        $isValid = password_verify($password, $targetHash) && $userRecord !== null;
        if (!$isValid) {
            $attempts = $keydb->incr($failKey);
            if ($attempts === 1) {
                $keydb->expire($failKey, 900);
            }
            throw new \RuntimeException('Credenciales inválidas o cuenta bloqueada.');
        }
        $keydb->del($failKey);
        return true;
    }
}
```

