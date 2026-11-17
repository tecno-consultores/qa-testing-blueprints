> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)

# 🔐 Secure Development and Vulnerability Mitigation Guide (Standard 11X)

> **PURPOSE:**  
> This technical manual provides concrete code recipes, architectural patterns, and mandatory validations for developers and AI Agents. Its goal is to eradicate by design the most common attack vectors across modern hybrid applications (Vue/React SPAs + Asynchronous FastAPI/Node APIs).

---

## 📋 Secure Code Patterns Index

1. [Pattern 1: Mass Assignment / Over-posting Prevention](#pattern-1-mass-assignment--over-posting-prevention)
2. [Pattern 2: Anti-CSWSH (Cross-Site WebSocket Hijacking) Protection](#pattern-2-anti-cswsh-cross-site-websocket-hijacking-protection)
3. [Pattern 3: Sanitization of 422 Validation Errors in Production](#pattern-3-sanitization-of-422-validation-errors-in-production)
4. [Pattern 4: Strict Anti-SSRF Defense with Pre-Flight DNS Resolution](#pattern-4-strict-anti-ssrf-defense-with-pre-flight-dns-resolution)
5. [Pattern 5: Safe Parameterized Queries in Dynamic DB Contexts](#pattern-5-safe-parameterized-queries-in-dynamic-db-contexts)
6. [Pattern 6: Strict File Upload Quotas and Limits (Anti-DoS / OOM)](#pattern-6-strict-file-upload-quotas-and-limits-anti-dos--oom)
7. [Pattern 7: Reverse Proxy Header Preservation in Nginx](#pattern-7-reverse-proxy-header-preservation-in-nginx)
8. [Pattern 8: Decoupled Anti-CSRF Middleware with Bearer Token Exclusion](#pattern-8-decoupled-anti-csrf-middleware-with-bearer-token-exclusion)
9. [Pattern 9: Frontend XSS and Prototype Pollution Prevention](#pattern-9-frontend-xss-and-prototype-pollution-prevention)
10. [Pattern 10: Concurrent Race Tolerance (5s Grace Period) in Refresh Tokens](#pattern-10-concurrent-race-tolerance-5s-grace-period-in-refresh-tokens)
11. [Pattern 11: Multi-Tenant and Per-User Isolation in Idempotency Keys](#pattern-11-multi-tenant-and-per-user-isolation-in-idempotency-keys)
12. [Pattern 12: Hiding Swagger / ReDoc / OpenAPI in Production](#pattern-12-hiding-swagger--redoc--openapi-in-production)
13. [Pattern 13: Shift-Left Protocol for Transitive CVE Mitigation in Lockfiles](#pattern-13-shift-left-protocol-for-transitive-cve-mitigation-in-lockfiles)
14. [Pattern 14: Concurrent Session Limits, Role-Tiered Timeouts, and Full Logout Purge (DISA STIG & OWASP)](#pattern-14-concurrent-session-limits-role-tiered-timeouts-and-full-logout-purge-disa-stig--owasp)
15. [Pattern 15: Account Lockout, Constant-Time Anti-Enumeration Defense, and Credential Lifecycle](#pattern-15-account-lockout-constant-time-anti-enumeration-defense-and-credential-lifecycle)
16. [Pattern 16: Unicode Canonicalization (NFKC), ASCII Header Sanitization, and Command Injection Prevention](#pattern-16-unicode-canonicalization-nfkc-ascii-header-sanitization-and-command-injection-prevention)
17. [Pattern 17: Hardening Against XML/XXE, Unsafe Deserialization, and Magic-Byte File Validation](#pattern-17-hardening-against-xmlxxe-unsafe-deserialization-and-magic-byte-file-validation)
18. [Pattern 18: Immutable Forensic Auditing, Log Injection (CR/LF) Prevention, and 75% Capacity Alerting](#pattern-18-immutable-forensic-auditing-log-injection-crlf-prevention-and-75-capacity-alerting)
19. [Pattern 19: Validated Cryptography (FIPS 140-3), In-Memory Secret Zeroization, and Export Sanitization](#pattern-19-validated-cryptography-fips-140-3-in-memory-secret-zeroization-and-export-sanitization)
20. [Pattern 20: HTTP Security Headers (OWASP OSHP), Fail-Secure State, and Security Self-Tests](#pattern-20-http-security-headers-owasp-oshp-fail-secure-state-and-security-self-tests)
21. [Pattern 21: OWASP API Security Top 10 (2023) Mitigation, Anti-Data-Mining, and Unsafe API Consumption Defense](#pattern-21-owasp-api-security-top-10-2023-mitigation-anti-data-mining-and-unsafe-api-consumption-defense)
22. [Pattern 22: Supply Chain (CycloneDX SBOM/CBOM), Artifact Signing, and Threat Modeling as Code](#pattern-22-supply-chain-cyclonedx-sbomcbom-artifact-signing-and-threat-modeling-as-code)

### 🧭 Traceability Map with the Static Auditor (`audit_security_stig_owasp`: `SEC-01`..`SEC-16`)

| MCP Rule | Mitigated Control / Vector | Human Reference Pattern |
| :--- | :--- | :--- |
| `SEC-01` | Mass assignment in Pydantic schemas (`ConfigDict(extra='forbid')`) | Pattern 1 |
| `SEC-02` | Cross-Site WebSocket Hijacking (`Origin` allowlist before `ws.accept()`) | Pattern 2 |
| `SEC-03` | Unsafe command execution (`shell=True`) and deserialization (`pickle`/`yaml.load`) | Pattern 16 and Pattern 17 |
| `SEC-04` | XML External Entities / XXE (`defusedxml` / `resolve_entities=False`) | Pattern 17 |
| `SEC-05` | Unicode `NFKC` canonicalization prior to validation | Pattern 16 |
| `SEC-06` | XSS (`v-html` / `dangerouslySetInnerHTML`) and *Prototype Pollution* in frontend | Pattern 9 |
| `SEC-07` | Exposure of Swagger / ReDoc / OpenAPI under `APP_ENV=production` | Pattern 12 (`QA-SMOKE-01`) |
| `SEC-08` | Missing HTTP security headers (OWASP OSHP: HSTS, CSP, `nosniff`) | Pattern 20 |
| `SEC-09` | Arbitrary npm post-install script execution (`.npmrc` `ignore-scripts=true`), deprecated `pnpm.onlyBuiltDependencies` on `pnpm 12+`, or `plugin:security/recommended` without `-legacy` on ESLint 8 | Pattern 13 and Pattern 22 |
| `SEC-10` | Hardcoded secrets, private keys, or tokens in code or logs | Pattern 18 and Pattern 19 |
| `SEC-11` | Raw UUID v4 identities (`claims["sub"]`) in human audit trails | Pattern 18 and `docs/02` §1.1 |
| `SEC-12` | `Depends(require_roles)` bypass in MCP/JSON-RPC services lacking explicit RBAC or `ApprovalRequest` | Pattern 21 and `docs/02` §3.5 |
| `SEC-13` | Loss of PostgreSQL RLS context after `commit()` without `after_begin` listener | Pattern 5 and `docs/02` §3.1 (`QA-PG17-RLS`) |
| `SEC-14` | Race condition in WORM HMAC chain ordering by `created_at` without `seq_num` + `pg_advisory_xact_lock` | Pattern 18 and `SECURITY.md` |
| `SEC-15` | Reuse of static credentials in production smoke tests without ephemeral secrets or `docker exec -e` | Pattern 15 and `docs/02` §1.1 |
| `SEC-16` | `401` interceptor asymmetry and non-atomic `challenge_id` consumption in multi-step Pre-Auth flows | Pattern 15 and `SECURITY.md` §4.20 |
| `QA-HEALTH-01` | Container/worker `unhealthy` drops caused by `asyncio` supervisors ignoring `task.exception()` or untested `HEALTHCHECK` probes | `docs/02` §1.1 (Rule #9) and `SECURITY.md` §4.22 |
| `QA-CLI-TTY-01` | Indefinite hang in interactive console (`TTY`) for dual CLI + `stdio` MCP binaries failing to check `isTTY` / `isatty()` | `docs/02` §1.1 (Rule #10) and `SECURITY.md` §4.23 |
| `SEC-CI-ACTION-REF` | `uses:` references in GitHub Actions not pinned by a 40-character commit SHA (mutable branches or deleted tags such as `trivy-action@0.28.0`) | Pattern 22 and `SECURITY.md` §4.24 |
| `QA-DOCKER-TTY-01` | Pseudo-TTY allocation (`docker compose run` without `-T`) in `CI=true` pipelines and Wrangler v4 deployments on `read_only: true` without `noexec` `tmpfs` on `.wrangler` or `--force` | `docs/02` §5.1 and `SECURITY.md` §4.25 |
| `UI-11X-03` | `.webp`/`.svg` in `apple-touch-icon`, missing `favicon.ico` (`>=48px`), combined `"any maskable"` in `.webmanifest`, header overrides lacking `! Header` in `_headers`, or `/*.ico` wildcards in `_routes.json` | `docs/02` §5.2 and `SECURITY.md` §4.26 |
| `QA-CI-ESCAPE-01` | Double-dollar escapes `$$(...)` / `$${...}` inherited from `Makefile`/`Compose` inside `.github/workflows/*.yml` or `.github/actions/*/action.yml` (`bash` expands `$$` to PID and breaks Docker mounts with `exit code 125`) | `docs/02` §5.3 and `SECURITY.md` §4.27 |
| `QA-MAKE-CURDIR-01` | Use of `$(PWD)` / `${PWD}` in sub-Makefiles (`*/Makefile`, `*/Makefile.example`) invoked via `$(MAKE) -C <subdir>` instead of `$(CURDIR)`, exposing the parent directory to container mounts | `docs/02` §5.3 and `SECURITY.md` §4.27 |
| `QA-CONTRACT-SDK-01` | MCP/JSON-RPC/ACP servers tested solely by invoking handlers with `MagicMock` without wiring the real in-process SDK client/transport (masks breaking signature shifts like `mcp 1.x -> 2.x`) | `docs/02` §1.1 (Rule #11) and `SECURITY.md` §4.28 |
| `QA-DOCKER-LOCK-01` | `Dockerfile` installing a manual package list (`pip install ...`, `npm install <pkg>`) or `uv sync` without `--frozen` instead of installing from the lockfile, plus missing post-build image smoke test (`import`, `id -u != 0`, `401`) | `docs/02` §1.1 (Rule #11) and `SECURITY.md` §4.28 |
| `QA-PLAYWRIGHT-PIN-01` | Mismatch or SemVer range (`^`/`~`) between `@playwright/test`/`playwright` in `package.json` and `mcr.microsoft.com/playwright:vX.Y.Z` (or `:latest`) in Compose, plus DNS/IP Anti-SSRF (`SEC-03`) and API key redaction (`SEC-06`) in `audit_pagespeed_insights.py` | `docs/02` §7, §9 and `SECURITY.md` §4.29 |
| `QA-SSR-HYDRATION-01` | Pre-hydration DOM branching (`v-if` on `localStorage`/`dataset.theme`) in SSR/SSG apps or missing dual `'light'`/`'dark'` Playwright sweep with `console`/`pageerror` guard (`/hydration/i`) | `docs/02` §7 and `SECURITY.md` §4.30 |

---

## Pattern 1: Mass Assignment / Over-posting Prevention

### The Risk
If a Pydantic model or DTO accepts extra unfiltered fields, an attacker can submit `{"username": "juan", "role": "SUPERADMIN", "is_superuser": true}`. If the backend passes that dictionary directly into the ORM model, unintended privilege escalation occurs.

### Mandatory Implementation (Python / Pydantic v2)
```python
from pydantic import BaseModel, ConfigDict, EmailStr

# Strict Input Schema: Rejects any unexpected field
class UserCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 🔒 Blocks undeclared fields with HTTP 422

    username: str
    email: EmailStr
    password: str

# Full decoupling from the Database model
class UserInDB(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    username: str
    email: str
    role: str = "OPERATOR"  # Assigned exclusively by business logic
    is_active: bool = True
```

---

## Pattern 2: Anti-CSWSH (Cross-Site WebSocket Hijacking) Protection

### The Risk
Unlike ordinary HTTP requests, WebSocket connections do not enforce the SOP (*Same-Origin Policy*). If a user holds an active cookie-based session, a script on a malicious site can open a WebSocket channel against the backend and hijack real-time data.

### Mandatory Implementation (FastAPI WebSockets)
```python
from fastapi import WebSocket, status
from src.core.config import settings

def verify_websocket_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    # In production, reject missing or unauthorized origins
    if not origin:
        return settings.APP_ENV != "production"
    
    # Compare against the allowlisted domains
    return origin in settings.ALLOWED_ORIGINS

@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    if not verify_websocket_origin(websocket):
        # 🔒 Code 4403: Forbidden Origin (Close before accepting the channel)
        await websocket.close(code=4403, reason="Unauthorized origin")
        return

    await websocket.accept()
    # Continue with the secure channel...
```

---

## Pattern 3: Sanitization of 422 Validation Errors in Production

### The Risk
By default, FastAPI HTTP 422 responses return exhaustive detail containing internal attribute names, expected types, and regular expressions. This enables an attacker to map the API's architecture and schemas with surgical precision.

### Mandatory Implementation
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
    # In development, return detailed errors for debugging
    if settings.APP_ENV != "production":
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )

    # 🔒 In production: Log details inside container logs and return an opaque response
    logger.warning(
        f"422 validation failure on {request.method} {request.url.path}: {exc.errors()}"
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Submitted data does not meet validation requirements."},
    )
```

---

## Pattern 4: Strict Anti-SSRF Defense with Pre-Flight DNS Resolution

### The Risk
When a user configures webhook URLs or network targets, an attacker can point to `http://169.254.169.254/latest/meta-data/` or `http://postgres:5432/` to extract cloud credentials or reach internal microservices.

### Mandatory Implementation
```python
import ipaddress
import socket
from urllib.parse import urlparse

FORBIDDEN_CONTAINER_HOSTS = {"localhost", "api", "postgres", "keydb", "redis", "worker"}

def validate_safe_outgoing_url(url_str: str) -> str:
    parsed = urlparse(url_str.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Disallowed scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL lacks a valid hostname")

    if hostname.lower() in FORBIDDEN_CONTAINER_HOSTS:
        raise ValueError("Access to internal infrastructure resources is forbidden")

    # 🔒 Resolve DNS before executing the HTTP request
    try:
        resolved_ips = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve host: {hostname}") from exc

    for item in resolved_ips:
        ip_addr_str = item[4][0]
        ip = ipaddress.ip_address(ip_addr_str)

        # Block RFC 1918 private, Loopback, Link-Local, and Multicast ranges
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            raise ValueError(f"Forbidden target in private/reserved network ({ip_addr_str})")

    return url_str
```

---

## Pattern 5: Safe Parameterized Queries in Dynamic DB Contexts

### The Risk
Using string interpolation (`f-strings`) to set session or tenant variables (`SET LOCAL app.current_tenant_id = f'{tenant_id}'`), creating SQL injection exposure.

### Mandatory Implementation (SQLAlchemy Core)
```python
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    # 🔒 Mandatory parameterized statement using safe bindparams
    query = text("SET LOCAL app.current_tenant_id = :tenant_id").bindparams(
        tenant_id=tenant_id
    )
    await session.execute(query)
```

---

## Pattern 6: Strict File Upload Quotas and Limits (Anti-DoS / OOM)

### The Risk
Massive file uploads (CSVs or binaries) exhausting server RAM when read wholesale with `await file.read()` without size caps.

### Mandatory Implementation
```python
from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB

async def read_uploaded_file_safely(file: UploadFile) -> bytes:
    chunk_size = 64 * 1024  # 64 KB per read
    total_bytes = 0
    buffer = bytearray()

    while chunk := await file.read(chunk_size):
        total_bytes += len(chunk)
        if total_bytes > MAX_UPLOAD_SIZE_BYTES:
            # 🔒 Abort reading immediately and return 413
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds the maximum allowed size of 2 MB.",
            )
        buffer.extend(chunk)

    return bytes(buffer)
```

---

## Pattern 7: Reverse Proxy Header Preservation in Nginx

### The Risk
Nginx acts as TLS terminator and reverse proxy. If it fails to forward original headers, FastAPI and audit logs see every request as originating from the Docker bridge IP (`172.18.0.1`), defeating rate limiting and security traceability.

### Mandatory Configuration (`nginx.conf`)
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

## Pattern 8: Decoupled Anti-CSRF Middleware with Bearer Token Exclusion

### The Risk
Requiring CSRF tokens on Machine-to-Machine (M2M) API calls or AI agents already authenticating with `Authorization: Bearer` headers causes unnecessary blocks, while failing to enforce them on cookie-based browser requests introduces CSRF vulnerabilities.

### Mandatory Implementation
```python
import hmac
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Exempt safe HTTP methods (GET, HEAD, OPTIONS)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        # 🔒 OWASP Rule: Requests carrying Authorization: Bearer do not require CSRF
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # Cookie-authenticated browser requests require X-CSRF-Token
        csrf_token = request.headers.get("X-CSRF-Token")
        if not csrf_token or not self.validate_csrf_token(csrf_token, request):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Invalid or missing CSRF token."},
            )

        return await call_next(request)

    def validate_csrf_token(self, token: str, request: Request) -> bool:
        # Constant-time HMAC digest validation...
        return True
```

---

## Pattern 9: Frontend XSS and Prototype Pollution Prevention

### The Risk
Injecting dynamic data into the DOM via `element.innerHTML` or map popups without escaping special characters, or merging unsanitized JSON objects enabling `Object.prototype` pollution.

### Mandatory Implementation (TypeScript / Vue 3 / React)
```typescript
// vue3/src/utils/security.ts (illustrative path)

/**
 * 🔒 Sanitizes text to prevent Cross-Site Scripting (XSS) in innerHTML
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
 * 🔒 Sanitizes objects against Prototype Pollution attacks
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

## Pattern 10: Concurrent Race Tolerance (5s Grace Period) in Refresh Tokens

### The Risk
Under strict Refresh Token rotation, when a user opens 3 concurrent browser tabs, all three send the same refresh token. The first request rotates it successfully; the second arrives milliseconds later and the backend falsely flags it as **malicious token reuse**, revoking the session and logging out the legitimate user.

### Mandatory Implementation (KeyDB / Redis)
```python
import time

GRACE_PERIOD_SECONDS = 5

async def rotate_refresh_token(redis_client, old_token_family_id: str, new_token: str) -> None:
    now = int(time.time())
    
    # 🔒 Instead of deleting the prior token immediately, retain the key with a grace TTL
    # This allows nearly simultaneous requests from parallel tabs to succeed
    await redis_client.set(
        f"grace_period:{old_token_family_id}",
        new_token,
        ex=GRACE_PERIOD_SECONDS,
    )
```

---

## Pattern 11: Multi-Tenant and Per-User Isolation in Idempotency Keys

### The Risk
If the idempotency key in KeyDB uses only the client-supplied UUID (`SET idemp:018f4a12-...`), an attacker in tenant A can trigger an intentional collision against tenant B, blocking or altering its transactions.

### Mandatory Implementation
```python
def build_idempotency_key(tenant_id: str, user_id: str, client_key: str) -> str:
    # 🔒 Key strictly isolated per Tenant and User
    return f"idemp:{tenant_id}:{user_id}:{client_key}"
```

---

## Pattern 12: Hiding Swagger / ReDoc / OpenAPI in Production

### The Risk
In production, `/docs`, `/redoc`, and `/openapi.json` expose implementation details, query parameters, and hidden routes to any internet scanner.

### Mandatory Implementation
```python
from fastapi import FastAPI
from src.core.config import settings

is_prod = settings.APP_ENV == "production"

app = FastAPI(
    title="Corporate API",
    # 🔒 Unconditional disablement in production
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)
```

---

## Pattern 13: Shift-Left Protocol for Transitive CVE Mitigation in Lockfiles

### The Risk
Discovering critical CVEs in production dependencies only when the GitHub Actions workflow fails after commit creates bottlenecks and deployment delays.

### Local Mitigation Workflow
1. Run local scan:
   ```bash
   ./scripts/auditar-infra.sh
   ```
2. If Trivy reports a CVE in a transitive dependency (e.g., `certifi` or `tar`):
   - **For Python:** Upgrade the pinned library inside Docker:
     ```bash
     docker compose -f fastapi/docker-compose.qa.yml run --rm qa-backend uv lock --upgrade-package certifi
     ```
   - **For Node.js / Frontend:** Upgrade selectively:
     ```bash
     docker compose -f vue3/docker-compose.qa.yml run --rm qa-frontend pnpm update tar
     ```
3. Run unit tests (`make qa-unit`) to rule out regressions.
4. Re-run `./scripts/auditar-infra.sh` certifying `0` findings.

---

## Pattern 14: Concurrent Session Limits, Role-Tiered Timeouts, and Full Logout Purge (DISA STIG & OWASP)

### Normative References
- **DISA ASD STIG V6R5:** `V-222387` (`APSC-DV-000010`), `V-222388` (`APSC-DV-000060`), `V-222389` (`APSC-DV-000070`), `V-222390` (`APSC-DV-000080`), `V-222392` (`APSC-DV-000100`), `V-222549` (`APSC-DV-001800`), `V-222578`..`V-222583` (`APSC-DV-002240`..`002290`), `V-222672` (`APSC-DV-003360`).
- **OWASP Developer Guide v4.2:** Section `4.3.7 Session Management (SM 1-21)`.

### The Risk
Allowing unlimited concurrent sessions or uniform inactivity timeouts exposes administrative accounts to *Session Hijacking*, *Session Fixation*, and persistence of sensitive data in browser storage after logout.

### Mandatory Implementation (FastAPI + KeyDB Backend and TypeScript Frontend)
```python
import secrets
import time
from fastapi import HTTPException, Response, status

# 🔒 DISA STIG V-222389 / V-222390: Role-tiered inactivity timeouts
IDLE_TIMEOUT_PRIVILEGED_SEC = 10 * 60   # 10 minutes for administrative roles
IDLE_TIMEOUT_STANDARD_SEC = 15 * 60     # 15 minutes for standard operational roles
ABSOLUTE_SESSION_LIFETIME_SEC = 8 * 3600 # OWASP SM-8: Absolute session expiration
MAX_CONCURRENT_SESSIONS = 2             # DISA STIG V-222387: Simultaneous session cap

async def create_or_rotate_session(
    redis_client,
    user_id: str,
    role: str,
    client_ip: str,
    previous_session_id: str | None = None,
) -> str:
    # 🔒 DISA STIG V-222581 / OWASP SM-9: Invalidate prior session upon login or privilege elevation
    if previous_session_id:
        await redis_client.delete(f"sess:{previous_session_id}")

    # 🔒 DISA STIG V-222582 / V-222583: Cryptographic CSPRNG (256 bits of entropy, no recycling)
    new_session_id = secrets.token_urlsafe(32)
    user_sessions_key = f"user_sessions:{user_id}"

    # 🔒 DISA STIG V-222387 / V-222672: Enforce concurrency cap and audit distinct IPs
    active_sessions = await redis_client.smembers(user_sessions_key)
    if len(active_sessions) >= MAX_CONCURRENT_SESSIONS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maximum concurrent session limit reached.",
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
    """DISA STIG V-222549 / OWASP SM-19: Full revocation upon account disablement or credential change."""
    user_sessions_key = f"user_sessions:{user_id}"
    session_ids = await redis_client.smembers(user_sessions_key)
    for sid in session_ids:
        sid_str = sid.decode() if isinstance(sid, bytes) else sid
        await redis_client.delete(f"sess:{sid_str}")
    await redis_client.delete(user_sessions_key)
```

```typescript
// 🔒 DISA STIG V-222388, V-222392, V-222578: Full temporary storage purge and explicit logoff confirmation
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
  return 'Your session has been securely closed and all temporary data has been cleared.';
}
```

---

## Pattern 15: Account Lockout, Constant-Time Anti-Enumeration Defense, and Credential Lifecycle

### Normative References
- **DISA ASD STIG V6R5:** `V-222408`..`V-222411` (`APSC-DV-000290`..`000320`), `V-222432`..`V-222437` (`APSC-DV-000530`..`000580`), `V-222520` (`APSC-DV-001470`), `V-222536`..`V-222547` (`APSC-DV-001680`..`001790`).
- **OWASP Developer Guide v4.2:** Section `4.3.7 Authentication (A 1-20) & Password Policy (P 1-12)`.

### The Risk
If the API responds faster when a username does not exist than when a password fails (because it skips Argon2id computation), an attacker can enumerate valid accounts via *Timing Side-Channel* analysis and launch brute-force attacks against orphaned or un-expired temporary accounts.

### Mandatory Implementation (Python / FastAPI)
```python
import re
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
# 🔒 Precomputed decoy hash ensuring constant time when the user does not exist (OWASP A-19, A-20)
DUMMY_ARGON2_HASH = ph.hash("ConstantTime_Dummy_Secret_2026!@#")

MAX_FAILED_ATTEMPTS = 3          # DISA STIG V-222432: Maximum 3 consecutive failed attempts
LOCKOUT_WINDOW_SECONDS = 15 * 60 # Within a 15-minute window
TEMP_ACCOUNT_MAX_HOURS = 72      # DISA STIG V-222409: Temporary accounts expire after 72h
INACTIVE_ACCOUNT_MAX_DAYS = 35   # DISA STIG V-222411: Inactive accounts disable after 35 days

def validate_password_stig_policy(new_password: str, old_password: str | None = None) -> None:
    """DISA STIG V-222536..V-222541: 15-char policy, complexity, and 8-character differential."""
    if len(new_password) < 15:
        raise ValueError("Password must be at least 15 characters long (APSC-DV-001680).")
    if not (
        re.search(r"[A-Z]", new_password)
        and re.search(r"[a-z]", new_password)
        and re.search(r"\d", new_password)
        and re.search(r"[^A-Za-z0-9]", new_password)
    ):
        raise ValueError("Password must include uppercase, lowercase, digits, and special characters.")
    if old_password:
        diff_chars = sum(1 for a, b in zip(new_password, old_password) if a != b) + abs(
            len(new_password) - len(old_password)
        )
        if diff_chars < 8:
            raise ValueError("At least 8 characters must differ from the previous password (APSC-DV-001730).")

async def verify_credentials_constant_time(
    redis_client,
    user_record: dict | None,
    candidate_password: str,
    username_key: str,
) -> dict:
    fail_key = f"auth_fail:{username_key}"
    attempts = int(await redis_client.get(fail_key) or 0)
    if attempts >= MAX_FAILED_ATTEMPTS:
        raise PermissionError("Invalid credentials or account temporarily locked.")

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
        raise PermissionError("Invalid credentials or account temporarily locked.")

    await redis_client.delete(fail_key)
    # 🔒 DISA STIG V-222437 / OWASP P-12: Return last logon timestamp to the user
    return {
        "user_id": user_record["id"],
        "last_Interactive_logon_utc": user_record.get("last_logon_utc"),
        "last_failed_attempt_utc": user_record.get("last_failed_utc"),
    }
```

---

## Pattern 16: Unicode Canonicalization (NFKC), ASCII Header Sanitization, and Command Injection Prevention

### Normative References
- **DISA ASD STIG V6R5:** `V-222604` (`APSC-DV-002510`), `V-222605` (`APSC-DV-002520`), `V-222606` (`APSC-DV-002530`).
- **OWASP Developer Guide v4.2:** Sections `4.3.3 SFL-9`, `4.3.5 Canonicalization (CEC 1-5)`, and `4.3.6 Server-Side Validation (SSV 1-7) & Language/Framework (LF-6)`.

### The Risk
Attackers supply homoglyph or decomposed Unicode forms (such as full-width `＜script＞` `U+FF1C`) that bypass validation filters before a downstream component normalizes them to `<script>`. Likewise, invoking subprocesses with `shell=True` enables arbitrary OS command chaining.

### Mandatory Implementation (Python)
```python
import subprocess
import unicodedata
from pathlib import Path

def canonicalize_and_validate_text(raw_value: str, max_length: int = 256) -> str:
    """DISA STIG V-222605 & OWASP CEC-5 / SSV-3: Canonicalize to NFKC BEFORE validation."""
    normalized = unicodedata.normalize("NFKC", raw_value).strip()
    if len(normalized) > max_length:
        raise ValueError("Input length exceeds maximum allowed limit.")
    # Reject non-printable ASCII control characters (except tab/newline where applicable)
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in normalized):
        raise ValueError("Illegal ASCII control characters detected.")
    return normalized

def run_allowlisted_diagnostic_tool(target_ip: str) -> str:
    """DISA STIG V-222604 & OWASP SFL-9: shell=True forbidden; use allowlisted argument list."""
    clean_ip = canonicalize_and_validate_text(target_ip, max_length=45)
    # 🔒 Direct binary execution with absolute path, no command interpreter (shell=False)
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

## Pattern 17: Hardening Against XML/XXE, Unsafe Deserialization, and Magic-Byte File Validation

### Normative References
- **DISA ASD STIG V6R5:** `V-222398`..`V-222406` (`APSC-DV-000160`..`000270`), `V-222593` (`APSC-DV-002390`), `V-222601` (`APSC-DV-002485`), `V-222608` (`APSC-DV-002550`), `V-222626` (`APSC-DV-002960`).
- **OWASP Developer Guide v4.2:** Sections `4.3.2 File Management (FM 1-5)`, `4.3.6 Verify Safe Deserialization (VSD 1-6)`, and `File Validation (FV 1-9)`.

### The Risk
1. **XXE (XML External Entity):** XML parsers with entity resolution or DTDs enabled allow reading `/etc/passwd` or performing internal SSRF.
2. **Unsafe Deserialization:** Calling `pickle.loads()` or `yaml.load()` permits Remote Code Execution (RCE).
3. **File Spoofing and Path Traversal:** Trusting `file.filename` or `file.content_type` without inspecting header *Magic Bytes* enables uploading executable scripts disguised as images or accessing arbitrary server files.

### Mandatory Implementation (Python)
```python
import hmac
import hashlib
import json
from lxml import etree

# 🔒 DISA STIG V-222593 / V-222608: Disable DTDs, external entities, and network access in XML
SAFE_XML_PARSER = etree.XMLParser(
    resolve_entities=False,
    no_network=True,
    dtd_validation=False,
    load_dtd=False,
    huge_tree=False,
)

def parse_xml_safely(xml_bytes: bytes) -> etree._Element:
    return etree.fromstring(xml_bytes, parser=SAFE_XML_PARSER)

# 🔒 OWASP VSD 1-6: Safe deserialization via strict JSON + HMAC signature verification
def deserialize_signed_payload(payload_bytes: bytes, signature_hex: str, secret_key: bytes) -> dict:
    expected_mac = hmac.new(secret_key, payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_mac, signature_hex):
        raise ValueError("Invalid payload cryptographic signature (OWASP VSD-3).")
    data = json.loads(payload_bytes.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Disallowed object structure.")
    return data

# 🔒 DISA STIG V-222601 / V-222626 & OWASP FV 1-9: Magic-Byte Validation and Index Mapping
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
        raise ValueError("Binary file header does not match an allowed format.")

def resolve_indexed_file(file_key: str) -> str:
    """Never accept raw user file paths; use an allowlisted index map."""
    if file_key not in REPORT_INDEX_MAP:
        raise KeyError("Invalid resource reference.")
    return REPORT_INDEX_MAP[file_key]
```

---

## Pattern 18: Immutable Forensic Auditing, Log Injection (CR/LF) Prevention, and 75% Capacity Alerting

### Normative References
- **DISA ASD STIG V6R5:** `V-222444` (`APSC-DV-000650`), `V-222446`..`V-222509` (`APSC-DV-000670`..`001370`).
- **OWASP Developer Guide v4.2:** Section `4.3.10 Security Logging (SL 1-13) & Security Log Design (SLD 1-11)`.

### The Risk
1. **Log Injection / Forgery:** If a user injects line breaks (`\r\n`) or HTML tags into a logged field, they can forge entire audit entries or trigger XSS in log viewer dashboards.
2. **Secret Leakage in Logs:** Logging session tokens, passwords, or PII turns the SIEM into a credential theft vector (`V-222444`).
3. **Silent Storage Exhaustion:** If the audit disk fills without alerting operations at **75% capacity** (`V-222483`), the system loses forensic traceability during an incident.

### Mandatory Implementation (Python)
```python
import hashlib
import hmac
import json
import shutil
from datetime import datetime, timezone

AUDIT_STORAGE_ALERT_RATIO = 0.75 # 🔒 DISA STIG V-222483: Mandatory alert at 75% capacity

def sanitize_log_field(value: str) -> str:
    """OWASP SL-4 & SLD-2: Eliminates CR/LF injection and control characters in logs."""
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
    """DISA STIG V-222470..V-222509 & OWASP SLD 1-11: HMAC-chained UTC record."""
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
    """DISA STIG V-222483 (APSC-DV-001090): Immediate alert when storage exceeds 75%."""
    usage = shutil.disk_usage(audit_mount_path)
    used_ratio = usage.used / usage.total
    return {
        "used_ratio": round(used_ratio, 4),
        "alert_triggered": used_ratio >= AUDIT_STORAGE_ALERT_RATIO,
    }
```

---

## Pattern 19: Validated Cryptography (FIPS 140-3), In-Memory Secret Zeroization, and Export Sanitization

### Normative References
- **DISA ASD STIG V6R5:** `V-222393`..`V-222395` (`APSC-DV-000110`..`000130`), `V-222570`..`V-222577` (`APSC-DV-002010`..`002230`), `V-222612` (`APSC-DV-002590`), `V-222643` (`APSC-DV-003120`), `V-222666` (`APSC-DV-003310`).
- **OWASP Developer Guide v4.2:** Section `4.3.9 Data Protection, Memory Management (MM 1-9) & Cryptographic Practices (CP 1-7)`.

### The Risk
Retaining cryptographic keys or passwords in memory buffers after use exposes them to *Core Dumps* / *Heartbleed-style* leaks. Likewise, exporting database backups or dumps without scrubbing administrative credentials or attaching sensitivity classification labels exposes critical secrets in pre-production environments.

### Mandatory Implementation (Python)
```python
from contextlib import contextmanager
from typing import Iterator

@contextmanager
def ephemeral_secret_buffer(secret_bytes: bytes) -> Iterator[bytearray]:
    """DISA STIG V-222612 & OWASP MM-3/MM-8: Overwrites the memory buffer on all exit paths."""
    buf = bytearray(secret_bytes)
    try:
        yield buf
    finally:
        for i in range(len(buf)):
            buf[i] = 0

SENSITIVE_EXPORT_FIELDS = {"password_hash", "totp_secret", "vault_dek", "api_private_key", "db_admin_dsn"}

def sanitize_database_export_rows(rows: list[dict], security_classification: str = "CONFIDENTIAL") -> list[dict]:
    """DISA STIG V-222393, V-222643, V-222666: Scrubs credentials from exports and attaches security label."""
    sanitized: list[dict] = []
    for row in rows:
        clean_row = {k: v for k, v in row.items() if k not in SENSITIVE_EXPORT_FIELDS}
        clean_row["_security_label"] = security_classification
        sanitized.append(clean_row)
    return sanitized
```

---

## Pattern 20: HTTP Security Headers (OWASP OSHP), Fail-Secure State, and Security Self-Tests

### Normative References
- **DISA ASD STIG V6R5:** `V-222585` (`APSC-DV-002310`), `V-222586` (`APSC-DV-002320`), `V-222615` (`APSC-DV-002760`), `V-222616` (`APSC-DV-002770`), `V-222668` (`APSC-DV-003330`).
- **OWASP Developer Guide v4.2:** Sections `4.3.2 System Configuration (SC 8-11)`, `4.3.8 AC-10/AC-11`, `4.3.9 DP 5-7 / PDT 9-10`, and `5.4.4 OWASP Secure Headers Project (OSHP)`.

### The Risk
If an application continues accepting traffic when security policy loading or authorization engine initialization fails (*Fail-Open*), an attacker can induce resource exhaustion to bypass access controls. Additionally, missing OSHP headers (`HSTS`, `CSP`, `Referrer-Policy`, `Cache-Control: no-store`) enable TLS downgrade attacks, XSS, and token leakage in URLs.

### Mandatory Implementation (FastAPI Middleware + Fail-Secure Lifespan)
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

async def verify_security_functions_self_test() -> None:
    """DISA STIG V-222616 (APSC-DV-002770): Startup self-test of cryptographic and security functions."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = AESGCM.generate_key(bit_length=256)
    nonce = b"\x00" * 12
    ct = AESGCM(key).encrypt(nonce, b"self-test", b"aad")
    if AESGCM(key).decrypt(nonce, ct, b"aad") != b"self-test":
        raise RuntimeError("Critical failure in cryptographic self-test.")

@asynccontextmanager
async def fail_secure_lifespan(app: FastAPI):
    """DISA STIG V-222585 & OWASP AC-10: Abort in a secure state (Fail-Closed) upon initialization failure."""
    await verify_security_functions_self_test()
    yield

class OWASPSecureHeadersMiddleware(BaseHTTPMiddleware):
    """OWASP OSHP 5.4.4 & 4.3.9: Defense-in-depth headers and version banner suppression."""

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
        # 🔒 OWASP SC-11: Strip headers exposing server or framework versions
        for header in ("Server", "X-Powered-By"):
            if header in response.headers:
                del response.headers[header]
        return response
```

---

## Pattern 21: OWASP API Security Top 10 (2023) Mitigation, Anti-Data-Mining, and Unsafe API Consumption Defense

### Normative References
- **DISA ASD STIG V6R5:** `V-222424` (`APSC-DV-000450`), `V-222425` (`APSC-DV-000460`).
- **OWASP Developer Guide v4.2:** Section `7.8 OWASP API Security Top 10` (`API1:2023 BOLA`, `API3:2023 BOPLA`, `API4:2023 Unrestricted Resource Consumption`, `API5:2023 BFLA`, `API6:2023 Sensitive Business Flows`, `API10:2023 Unsafe Consumption of APIs`).

### The Risk
1. **BOLA (`API1:2023`) and BOPLA (`API3:2023`):** Allowing object access by ID without verifying both `tenant_id` and owner membership, or returning sensitive internal attributes by omitting an explicit output schema.
2. **Data Mining (`V-222424` / `API4:2023`):** Bulk queries or automated record enumeration to exfiltrate the database page by page.
3. **Unsafe Consumption of Third-Party APIs (`API10:2023`):** Blindly trusting JSON responses from external APIs without applying timeouts, size limits, or schema validation.

### Mandatory Implementation (Python / FastAPI)
```python
import httpx
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

MAX_PAGE_LIMIT = 100
DATA_MINING_QUERY_THRESHOLD_PER_MIN = 60

class ExternalPartnerPayload(BaseModel):
    """OWASP API10:2023: Strictly validate payloads originating from third-party APIs."""
    model_config = ConfigDict(extra="forbid")
    partner_id: str = Field(min_length=3, max_length=64)
    status: str = Field(pattern=r"^(ACTIVE|SUSPENDED|PENDING)$")

async def enforce_anti_data_mining_quota(
    redis_client,
    tenant_id: str,
    user_id: str,
    requested_limit: int,
) -> int:
    """DISA STIG V-222424 (APSC-DV-000450) & OWASP API4:2023: Caps pagination and detects bulk scraping."""
    if requested_limit > MAX_PAGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum page limit is {MAX_PAGE_LIMIT}.",
        )
    rate_key = f"datamining:{tenant_id}:{user_id}"
    count = await redis_client.incr(rate_key)
    if count == 1:
        await redis_client.expire(rate_key, 60)
    if count > DATA_MINING_QUERY_THRESHOLD_PER_MIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Anomalous bulk data extraction pattern blocked (APSC-DV-000450).",
        )
    return requested_limit

async def fetch_external_partner_safely(url: str) -> ExternalPartnerPayload:
    """OWASP API10:2023: Strict timeouts, verified TLS, no open redirects, and Pydantic validation."""
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, verify=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        if len(resp.content) > 65536:
            raise ValueError("External API response exceeds security quota.")
        return ExternalPartnerPayload.model_validate_json(resp.content)
```

---

## Pattern 22: Supply Chain (CycloneDX SBOM/CBOM), Artifact Signing, and Threat Modeling as Code

### Normative References
- **DISA ASD STIG V6R5:** `V-222513` (`APSC-DV-001430`), `V-222613` (`APSC-DV-002600`), `V-222645` (`APSC-DV-003140`), `V-222655` (`APSC-DV-003230`), `V-222658` (`APSC-DV-003245`).
- **OWASP Developer Guide v4.2:** Sections `4.2 Threat Modeling (pytm / Threat Dragon)`, `4.3.3 Software Libraries (SFL 1-15)`, and `5.3.4 OWASP CycloneDX (ECMA-424 SBOM / CBOM / VEX)`.

### The Risk
Deploying containers or packages without a verifiable component inventory (*Software & Cryptography Bill of Materials*), without verifying cryptographic signatures, or without threat-modeling the architecture prior to coding invites *Supply Chain Attacks* and structural design flaws.

### Mandatory Implementation (Threat Modeling as Code with `pytm` and CycloneDX SBOM Generation)
```python
# threat_model.py — OWASP pytm (DISA STIG V-222655 / OWASP 4.2.5)
from pytm import TM, Actor, Boundary, Data, Dataflow, Datastore, DatastoreType, Server

tm = TM("Corporate Architecture 11X")
tm.description = "Programmatic threat model (STRIDE) synchronized in CI/CD"
tm.isOrdered = True

internet = Boundary("Public Internet")
vpc_privada = Boundary("Internal Docker Container Network")

operador = Actor("Authenticated Operator")
operador.inBoundary = internet

api_gateway = Server("FastAPI Backend")
api_gateway.inBoundary = vpc_privada
api_gateway.OS = "Debian Hardened Non-Root"
api_gateway.controls.isHardened = True
api_gateway.controls.sanitizesInput = True
api_gateway.controls.validatesInput = True
api_gateway.controls.authorizesSource = True

postgres_rls = Datastore("PostgreSQL 16 with FORCE RLS")
postgres_rls.inBoundary = vpc_privada
postgres_rls.type = DatastoreType.SQL
postgres_rls.controls.isEncryptedAtRest = True

credenciales = Data("Authenticated Payload with CSRF & HttpOnly Cookie")
flujo_https = Dataflow(operador, api_gateway, "HTTPS TLS 1.3 Request")
flujo_https.protocol = "HTTPS"
flujo_https.dstPort = 443
flujo_https.data = credenciales
flujo_https.controls.isEncryptedInTransit = True
```

```bash
# 🔒 Generate SBOM / CBOM in standard OWASP CycloneDX (ECMA-424) format and verify integrity
docker compose -f fastapi/docker-compose.qa.yml run --rm qa-backend \
  uv run cyclonedx-py environment -o sbom-backend.cdx.json

# 🔒 Cryptographic SHA-256 verification of artifact and SBOM prior to publishing (DISA V-222513 / V-222645)
sha256sum sbom-backend.cdx.json > sbom-backend.cdx.json.sha256
sha256sum --check sbom-backend.cdx.json.sha256
```

---

## PHP 8.2–8.5 Annex (`sinfallas/basephpcomposer`): DISA ASD STIG V6R5 + OWASP v4.2 Security Cookbook

In applications and APIs built on **PHP 8.2 to 8.5** using the official multi-architecture (`amd64`/`arm64`) base image `sinfallas/basephpcomposer` (tags `8.2`, `8.3`, `8.4`, `8.5`, and `latest`), the following native controls must be enforced non-negotiably:

1. **Hardening Directives in `php.ini` / `conf.d/99-qa11x.ini` (`DISA APSC-DV-002430` & `OWASP OSHP`):**
   - `expose_php = Off` (suppresses the `X-Powered-By: PHP/8.x` banner on all HTTP responses).
   - `zend.exception_ignore_args = On` and `display_errors = Off` (prevents password or token leaks in stack traces).
   - `session.use_strict_mode = 1`, `session.cookie_httponly = 1`, `session.cookie_secure = 1`, `session.cookie_samesite = "Strict"`, and `session.cache_expire = 15` (in PHP 8.4/8.5, `session.sid_length` and `session.sid_bits_per_character` were deprecated in favor of the native 32-byte CSPRNG; mount custom overrides at `/usr/local/etc/php/conf.d/99-qa11x.ini` to take precedence over `conf.d/docker-php-ext-pcov.ini`).
   - `opcache.save_comments = 1` (essential so PHP 8 attributes `#[...]` and Doctrine, Symfony, Laravel, and Swagger-PHP validation/routing annotations remain intact).

2. **Unicode NFKC Canonicalization, AES-256-GCM Vault with `sodium_memzero`, and Constant-Time Argon2id:**
```php
<?php

declare(strict_types=1);

namespace App\Security;

final class DisaStigSecurityGuard
{
    private const DUMMY_ARGON2ID_HASH = '$argon2id$v=19$m=65536,t=4,p=1$c2luZmFsbGFzMTF4$7W5rT3x9mK2pL8vN1qR4sT6uV8wX0yZ2aB4cD6eF8gH';

    /**
     * Pattern 16 (APSC-DV-002520): Unicode NFKC canonicalization prior to any validation.
     */
    public static function canonicalizeNfkc(string $rawInput, int $maxLength = 256): string
    {
        $normalized = \Normalizer::normalize($rawInput, \Normalizer::FORM_KC);
        if ($normalized === false) {
            throw new \InvalidArgumentException('Invalid UTF-8 sequence.');
        }
        $trimmed = trim($normalized);
        if (mb_strlen($trimmed, 'UTF-8') > $maxLength || preg_match('/[\x00-\x1F\x7F]/u', $trimmed) === 1) {
            throw new \InvalidArgumentException('Input rejected due to length or ASCII control characters.');
        }
        return $trimmed;
    }

    /**
     * Pattern 19 (APSC-DV-002010 / APSC-DV-002590): AES-256-GCM encryption with AAD and in-RAM key zeroization.
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
                throw new \RuntimeException('AES-256-GCM authenticated encryption failure.');
            }
            return base64_encode($iv . $tag . $ciphertext);
        } finally {
            // 🔒 Native C-level zeroization of the memory buffer (ext-sodium)
            sodium_memzero($rawKey32Bytes);
        }
    }

    /**
     * Pattern 15 (APSC-DV-000530): Constant-time Argon2id verification with 3-attempt / 15m lockout in KeyDB.
     */
    public static function verifyCredentialsConstantTime(\Redis $keydb, ?array $userRecord, string $password, string $username): bool
    {
        $failKey = "auth_fail:{$username}";
        if ((int) ($keydb->get($failKey) ?: 0) >= 3) {
            throw new \RuntimeException('Account temporarily locked for 15 minutes (APSC-DV-000530).');
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
            throw new \RuntimeException('Invalid credentials or account locked.');
        }
        $keydb->del($failKey);
        return true;
    }
}
```
