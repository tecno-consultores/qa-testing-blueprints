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
   ./auditar-infra.sh
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
4. Re-ejecutar `./auditar-infra.sh` certificando `0` hallazgos.
