# 🔐 The 22 Canonical Security Patterns (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides the comprehensive compliance matrix and tactical implementation blueprints for the **22 canonical security patterns** mandated across all 11X architectures.

---

## 1. Compliance Matrix: 22 Security Controls

| # | Security Pattern Name | DISA ASD STIG V6R5 IDs | OWASP Reference | Core Mandate / Guardrail |
| :-: | :--- | :--- | :--- | :--- |
| **01** | Mass Assignment Prevention | `APSC-DV-002520` | OWASP API3:2023 | Pydantic `extra="forbid"`; separate write DTO from DB model. |
| **02** | Anti-CSWSH Origin Defense | `APSC-DV-002560` | OWASP WebSockets | Verify HTTP `Origin` header; close unauthorized with code `4403`. |
| **03** | 422 Error Sanitization in Prod | `APSC-DV-002430` | OWASP ERR-1..6 | Log validation details internally; return opaque generic error to client. |
| **04** | Strict Anti-SSRF with Pre-DNS | `APSC-DV-002520` | OWASP API7:2023 | Resolve DNS first; forbid private, loopback, link-local, and container IPs. |
| **05** | Safe Parameterized Dynamic SQL | `APSC-DV-002510` | OWASP SQLi | Use SQLAlchemy `:bind_params`; strictly allowlist dynamic column names. |
| **06** | File Upload Quotas & Anti-DoS | `APSC-DV-002485` | OWASP FM 1-5 | Enforce 10MB limit with chunked stream counting; block OOM attacks. |
| **07** | Reverse Proxy Header Integrity | `APSC-DV-002440` | OWASP SC 8-11 | Nginx must forward `X-Forwarded-For`, `X-Forwarded-Proto`, and sanitize Host. |
| **08** | Decoupled Anti-CSRF Middleware | `APSC-DV-002560` | OWASP CSRF | HMAC double-submit cookie pattern; bypass only for Bearer token auth. |
| **09** | Frontend XSS & Prototype Defense | `APSC-DV-002530` | OWASP XSS | `Object.freeze()` configs; forbid unsanitized `v-html` / `dangerouslySetInnerHTML`. |
| **10** | Refresh Token Concurrency Grace | `APSC-DV-002270` | OWASP SM 1-9 | Allow 5-second grace window for simultaneous in-flight token rotations. |
| **11** | Tenant-Isolated Idempotency Keys | `APSC-DV-002560` | OWASP API4:2023 | Key schema: `idemp:{tenant_id}:{user_id}:{key}`; return cached response. |
| **12** | Hide API Docs in Production | `APSC-DV-002430` | OWASP SC-11 | Disable `/docs`, `/redoc`, and `openapi.json` when `APP_ENV=production`. |
| **13** | Shift-Left Lockfile CVE Audit | `APSC-DV-001430` | OWASP A06:2021 | Audit dependencies (`uv pip audit`, `pnpm audit`); block Critical/High. |
| **14** | Concurrent Sessions & Full Purge | `APSC-DV-000010/70/80` | OWASP SM 1-19 | Max 2 sessions; 10m/15m idle timeouts; purge local/session/cache on logout. |
| **15** | Lockout & Constant-Time Auth | `APSC-DV-000290..580` | OWASP A 1-20 | 3-fail/15m lockout; dummy Argon2id hash; 15-char password; 72h temp account. |
| **16** | Unicode NFKC & Anti-Command Inj | `APSC-DV-002510..2530` | OWASP CEC/SFL-9 | Normalize to NFKC *before* validation; forbid `shell=True`; use absolute paths. |
| **17** | Anti-XXE & Magic-Bytes Validation | `APSC-DV-002390/2485` | OWASP VSD/FV | `resolve_entities=False`; JSON+HMAC; verify file magic bytes; indexed paths. |
| **18** | Immutable Audit & 75% Alert | `APSC-DV-000650..1370` | OWASP SL/SLD | Strip CR/LF; UTC ms HMAC-chained log records; zero tokens; 75% disk alert. |
| **19** | FIPS 140-3 & Secret Zeroization | `APSC-DV-002010..2230` | OWASP MM 1-9 | AES-256-GCM; zero memory buffers (`bytearray`); scrub credentials on export. |
| **20** | OSHP Headers & Fail-Secure Init | `APSC-DV-002310..2770` | OWASP OSHP/SC | HSTS, CSP, nosniff, DENY; drop Server headers; startup cryptographic self-test. |
| **21** | OWASP API Top 10 & Anti-Mining | `APSC-DV-000450/460` | OWASP API 2023 | BOLA/BOPLA tenant guards; max 100/page; rate-limit datamining; 5s/64KB 3P API cap. |
| **22** | CycloneDX SBOM & Code Threat Mod | `APSC-DV-001430/3230` | OWASP SBOM | Generate signed CycloneDX SBOM; maintain programmatic `pytm` threat models. |

---

## 2. Tactical Code Blueprints

### Pattern 01: Mass Assignment Prevention (Pydantic v2)
```python
from pydantic import BaseModel, ConfigDict, EmailStr

class UserCreateDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")  # Rejects unexpected properties with 422
    username: str
    email: EmailStr
    password: str
```

### Pattern 02: Anti-CSWSH Origin Check (FastAPI)
```python
from fastapi import WebSocket, status

@app.websocket("/ws/telemetry")
async def secure_ws(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if not origin or origin not in settings.ALLOWED_ORIGINS:
        await websocket.close(code=4403, reason="Unauthorized origin")
        return
    await websocket.accept()
```

### Pattern 04: Anti-SSRF Pre-DNS Check
```python
import ipaddress, socket
from urllib.parse import urlparse

FORBIDDEN_HOSTS = {"localhost", "api", "postgres", "keydb", "redis"}

def validate_safe_outgoing_url(url_str: str) -> str:
    parsed = urlparse(url_str.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Invalid URL scheme")
    hostname = parsed.hostname or ""
    if hostname in FORBIDDEN_HOSTS:
        raise ValueError("Target host is prohibited")
    addr_info = socket.getaddrinfo(hostname, None)
    for family, _, _, _, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("Target resolves to private/restricted IP space")
    return url_str
```

### Pattern 14: Role Timeouts & Secure Logout Purge
```typescript
// Client-side secure logout (Vue 3 / React)
export async function executeSecureLogoff(apiLogoutUrl: string): Promise<void> {
  try {
    await fetch(apiLogoutUrl, { method: 'POST', credentials: 'include', headers: { 'Cache-Control': 'no-store' } });
  } finally {
    sessionStorage.clear();
    localStorage.clear();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }
}
```

### Pattern 15: Constant-Time Anti-Enumeration & Lockout
```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
DUMMY_ARGON2_HASH = ph.hash("ConstantTime_Dummy_Secret_2026!@#")

async def verify_auth_constant_time(redis, user_record: dict | None, password: str, username: str) -> bool:
    fail_key = f"auth_fail:{username}"
    if int(await redis.get(fail_key) or 0) >= 3:
        raise PermissionError("Account temporarily locked (15m window).")
    target_hash = user_record["password_hash"] if user_record else DUMMY_ARGON2_HASH
    try:
        ph.verify(target_hash, password)
        valid = user_record is not None
    except VerifyMismatchError:
        valid = False
    if not valid:
        pipe = redis.pipeline()
        pipe.incr(fail_key)
        pipe.expire(fail_key, 900)
        await pipe.execute()
        raise PermissionError("Invalid credentials or account locked.")
    await redis.delete(fail_key)
    return True
```

### Pattern 16: Unicode NFKC Canonicalization
```python
import unicodedata

def canonicalize_nfkc_text(raw_value: str, max_length: int = 256) -> str:
    normalized = unicodedata.normalize("NFKC", raw_value).strip()
    if len(normalized) > max_length:
        raise ValueError("Input exceeds maximum length")
    if any(ord(c) < 32 or ord(c) == 127 for c in normalized):
        raise ValueError("Illegal control characters detected")
    return normalized
```

### Pattern 19: Cryptographic Memory Zeroization
```python
from contextlib import contextmanager

@contextmanager
def ephemeral_secret_buffer(secret_bytes: bytes):
    buf = bytearray(secret_bytes)
    try:
        yield buf
    finally:
        for i in range(len(buf)):
            buf[i] = 0  # Zero out memory on exit
```

### Pattern 20: OWASP OSHP Secure Headers Middleware
```python
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response

class OWASPSecureHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        for header in ("Server", "X-Powered-By"):
            if header in response.headers:
                del response.headers[header]
        return response
```

### PHP 8.1–8.5 Reference Snippets (NFKC, AES-256-GCM + `sodium_memzero`, Constant-Time Argon2id)
```php
<?php

declare(strict_types=1);

// Pattern 16: Unicode NFKC Canonicalization (ext-intl)
function canonicalizeNfkcText(string $rawValue, int $maxLength = 256): string
{
    $normalized = \Normalizer::normalize($rawValue, \Normalizer::FORM_KC);
    if ($normalized === false) {
        throw new \InvalidArgumentException('Invalid UTF-8 sequence');
    }
    $trimmed = trim($normalized);
    if (mb_strlen($trimmed, 'UTF-8') > $maxLength || preg_match('/[\x00-\x1F\x7F]/u', $trimmed) === 1) {
        throw new \InvalidArgumentException('Input fails length or ASCII control character guard');
    }
    return $trimmed;
}

// Pattern 19: AES-256-GCM + Memory Secret Zeroization (ext-openssl + ext-sodium)
function encryptVaultSecret(string $plaintext, string &$rawKey32Bytes, string $aad): string
{
    try {
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $rawKey32Bytes, OPENSSL_RAW_DATA, $iv, $tag, $aad, 16);
        if ($ciphertext === false) {
            throw new \RuntimeException('AES-256-GCM encryption failed');
        }
        return base64_encode($iv . $tag . $ciphertext);
    } finally {
        sodium_memzero($rawKey32Bytes);
    }
}
```
