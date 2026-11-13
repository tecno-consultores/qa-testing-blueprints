# Reference: DISA STIG V6R5 RLS, AES-256-GCM Vault & WORM Audit Blueprints

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE**
> Hydrate this reference ONLY when implementing PostgreSQL 15–17+ multi-tenant RLS schemas, FIPS-aligned AES-256-GCM vaults with key rotation/zeroization, or transactional WORM `audit_logs` hash-chains.

---

## 1. PostgreSQL 17 RLS DDL, `after_begin` Listener & `SECURITY DEFINER` (`QA-PG17-RLS`)

```sql
-- 1. Non-superuser, non-BYPASSRLS application role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_user') THEN
        CREATE ROLE app_runtime_user WITH LOGIN
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
            PASSWORD 'changeme_placeholder';
    END IF;
END
$$;

-- 2. Enable and FORCE Row-Level Security on every multi-tenant table
CREATE TABLE IF NOT EXISTS tenant_resources (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    allocated_quota NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

ALTER TABLE tenant_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_resources FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_resources
    USING (
        NULLIF(current_setting('app.is_superadmin', true), '') = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.is_superadmin', true), '') = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- 3. Scoped SECURITY DEFINER lookup for pre-authentication (never weaken USING)
CREATE OR REPLACE FUNCTION resolve_tenant_by_slug(p_slug TEXT)
RETURNS TABLE(id UUID, slug VARCHAR, is_active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id, t.slug, t.is_active
    FROM tenants t
    WHERE t.slug = p_slug
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_tenant_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_by_slug(TEXT) TO app_runtime_user;
```

### PostgreSQL 15–17+ Catalog Verification Query (`QA-PG17-RLS`)

```sql
-- Always query pg_catalog.pg_class.relforcerowsecurity (NEVER pg_tables.forcerowsecurity)
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = 'tenant_resources';
```

### SQLAlchemy 2.0 `AsyncSession` Multi-Transaction `after_begin` Persistence

```python
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session


async def apply_rls_session_settings(
    session: AsyncSession,
    tenant_id: str | None,
    is_superadmin: bool = False,
) -> None:
    """Bind tenant context into session.sync_session.info and active transaction."""
    tid_val = str(tenant_id) if tenant_id else ""
    sa_val = "true" if is_superadmin else "false"
    session.sync_session.info["tenant_id"] = tid_val
    session.sync_session.info["is_superadmin"] = sa_val
    await session.execute(
        text(
            "SELECT set_config('app.current_tenant_id', :tid, true), "
            "set_config('app.is_superadmin', :sa, true)"
        ),
        {"tid": tid_val, "sa": sa_val},
    )


@event.listens_for(AsyncSession.sync_session_class, "after_begin")
def _reapply_rls_on_after_begin(session: Session, transaction, connection) -> None:
    """Re-inject SET LOCAL whenever a new transaction opens after await db.commit()."""
    tid = session.info.get("tenant_id")
    sa = session.info.get("is_superadmin", "false")
    if tid is not None:
        connection.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, true), "
                "set_config('app.is_superadmin', :sa, true)"
            ),
            {"tid": str(tid), "sa": str(sa)},
        )
```

---

## 2. AES-256-GCM Vault Wrapper, Keyring Rotation (`kid`) & Memory Zeroization

Enforces `APSC-DV-002010..002040` (FIPS-aligned AEAD) and `APSC-DV-002590` (memory scrubbing).

```python
from __future__ import annotations

import base64
import json
import os
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@contextmanager
def ephemeral_secret_buffer(raw_bytes: bytes) -> Iterator[bytearray]:
    """Expose mutable bytearray and zero all bytes on context exit."""
    buf = bytearray(raw_bytes)
    try:
        yield buf
    finally:
        for idx in range(len(buf)):
            buf[idx] = 0


class VaultCryptoEnvelope:
    """Versioned AES-256-GCM keyring envelope (`v1:{kid}:{b64}`) with AAD binding."""

    def __init__(self, active_kid: str, keyring_b64: dict[str, str]) -> None:
        if active_kid not in keyring_b64:
            raise RuntimeError("Fail-secure abort: active Vault kid missing from keyring")
        self._active_kid = active_kid
        self._keyring_b64 = dict(keyring_b64)

    @classmethod
    def from_env(cls) -> VaultCryptoEnvelope:
        active_kid = os.environ["VAULT_ACTIVE_KID"]
        keyring_raw = json.loads(os.environ["VAULT_KEYRING_JSON"])
        return cls(active_kid=active_kid, keyring_b64=keyring_raw)

    def _decode_key(self, kid: str) -> bytes:
        key_bytes = base64.b64decode(self._keyring_b64[kid], validate=True)
        if len(key_bytes) != 32:
            raise ValueError(f"Vault key '{kid}' must be exactly 256 bits (32 bytes)")
        return key_bytes

    def encrypt(self, plaintext: bytes, tenant_id: str, purpose: str) -> str:
        aad = f"{tenant_id}:{purpose}".encode("utf-8")
        nonce = secrets.token_bytes(12)
        with ephemeral_secret_buffer(self._decode_key(self._active_kid)) as key_buf:
            cipher = AESGCM(bytes(key_buf))
            sealed = cipher.encrypt(nonce, plaintext, aad)
        payload = base64.urlsafe_b64encode(nonce + sealed).decode("ascii")
        return f"v1:{self._active_kid}:{payload}"

    def decrypt(self, envelope: str, tenant_id: str, purpose: str) -> bytes:
        version, kid, payload_b64 = envelope.split(":", 2)
        if version != "v1" or kid not in self._keyring_b64:
            raise ValueError("Unsupported Vault envelope version or unknown key id")
        raw = base64.urlsafe_b64decode(payload_b64.encode("ascii"))
        nonce, ciphertext = raw[:12], raw[12:]
        aad = f"{tenant_id}:{purpose}".encode("utf-8")
        with ephemeral_secret_buffer(self._decode_key(kid)) as key_buf:
            return AESGCM(bytes(key_buf)).decrypt(nonce, ciphertext, aad)

    def rotate_ciphertext(self, envelope: str, tenant_id: str, purpose: str) -> str:
        with ephemeral_secret_buffer(self.decrypt(envelope, tenant_id, purpose)) as plain_buf:
            return self.encrypt(bytes(plain_buf), tenant_id, purpose)
```

> **PHP 8.2–8.5 Equivalent (`ext-openssl` + `ext-sodium`):** Call `openssl_encrypt($plaintext, 'aes-256-gcm', $rawKey, OPENSSL_RAW_DATA, $iv, $tag, $aad, 16)` inside `try { ... } finally { sodium_memzero($rawKey); }`.

---

## 3. Transactional WORM Hash-Chain (`seq_num` + `pg_advisory_xact_lock`) & Anti-Blind-Mock Test

```sql
CREATE SEQUENCE IF NOT EXISTS audit_logs_seq_num_seq AS BIGINT;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    seq_num BIGINT NOT NULL DEFAULT nextval('audit_logs_seq_num_seq'),
    tenant_id UUID NOT NULL,
    actor_username VARCHAR(120) NOT NULL,
    resource_display_name VARCHAR(160) NOT NULL,
    action VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    prev_record_hash CHAR(64) NOT NULL,
    record_sha256_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_tenant_seq ON audit_logs (tenant_id, seq_num);
```

### Concurrency-Safe `write_audit_log()` Pattern

```python
import hashlib
import hmac
import json
import os
import re
import uuid
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

UUID_V4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _sanitize_log_text(value: str) -> str:
    return value.replace("\r", " ").replace("\n", " ").strip()


async def write_audit_log(
    session: AsyncSession,
    *,
    tenant_id: str,
    actor_username: str,
    resource_display_name: str,
    action: str,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> str:
    clean_actor = _sanitize_log_text(actor_username)
    clean_resource = _sanitize_log_text(resource_display_name)
    if UUID_V4_RE.match(clean_actor) or UUID_V4_RE.match(clean_resource):
        raise ValueError("Audit identity fields must be human-readable, never raw UUID v4")

    # Serialize same-tenant WORM inserts to prevent prev_record_hash forks
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": f"audit:{tenant_id}"},
    )
    prev_hash = session.sync_session.info.get("_in_tx_audit_hash")
    if not prev_hash:
        row = (
            await session.execute(
                text(
                    "SELECT record_sha256_hash FROM audit_logs "
                    "WHERE tenant_id = :tid ORDER BY seq_num DESC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()
        prev_hash = row[0] if row else "0" * 64

    # Strict JSON serialization WITHOUT default=str (catches unserialized Decimal/UUID early)
    canonical_payload = json.dumps(
        {
            "tenant_id": tenant_id,
            "actor_username": clean_actor,
            "resource_display_name": clean_resource,
            "action": action,
            "before_state": before_state,
            "after_state": after_state,
            "prev_record_hash": prev_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    hmac_key = os.environ["AUDIT_HMAC_KEY"].encode("utf-8")
    record_hash = hmac.new(hmac_key, canonical_payload, hashlib.sha256).hexdigest()

    await session.execute(
        text(
            "INSERT INTO audit_logs (id, tenant_id, actor_username, resource_display_name, "
            "action, before_state, after_state, prev_record_hash, record_sha256_hash) "
            "VALUES (:id, :tid, :actor, :res, :act, CAST(:before AS jsonb), "
            "CAST(:after AS jsonb), :prev_h, :rec_h)"
        ),
        {
            "id": str(uuid.uuid4()),
            "tid": tenant_id,
            "actor": clean_actor,
            "res": clean_resource,
            "act": action,
            "before": json.dumps(before_state) if before_state is not None else None,
            "after": json.dumps(after_state) if after_state is not None else None,
            "prev_h": prev_hash,
            "rec_h": record_hash,
        },
    )
    session.sync_session.info["_in_tx_audit_hash"] = record_hash
    await session.flush()
    return record_hash
```

### Anti-Blind-Mock & `Decimal` Serialization Pytest Pattern

```python
from decimal import Decimal
import json
import pytest


def test_mock_db_enforces_strict_json_decimal_parity() -> None:
    """MockDbSession MUST pass JSONB payloads to json.dumps() WITHOUT default=str."""
    bad_payload = {"allocated_quota": Decimal("125.50")}
    with pytest.raises(TypeError, match="Decimal is not JSON serializable"):
        json.dumps(bad_payload)

    safe_payload = {"allocated_quota": str(Decimal("125.50"))}
    assert json.loads(json.dumps(safe_payload))["allocated_quota"] == "125.50"
```

---

## 4. Quick Reference Mapping (`APSC-DV-*` / `V-222513` ↔ OWASP v4.2 ↔ `qa-11x` Rules)

| STIG / CVE ID | OWASP v4.2 / ASVS | `audit_security_stig_owasp` Rule | Concrete Implementation Artifact |
| :--- | :--- | :--- | :--- |
| `APSC-DV-000010/070/080/3360` | SM 1-21 | `SEC-12` / Session Governance | KeyDB session counter, `10m`/`15m` idle TTL, distinct-IP alert |
| `APSC-DV-000060/100/2240` | SM-11..15 | Client Purge & Logoff | `localStorage`/`sessionStorage`/`CacheStorage` wipe + confirm banner |
| `APSC-DV-000290..580/1680..1850` | A 1-20, P-6 | `SEC-13` / Identity Lifecycle | `3-fail/15m` lockout, dummy Argon2id, `15-char/5-gen`, `72h`/`35d`, mTLS |
| `APSC-DV-000450/460` | API1/3/5:2023 | `SEC-01`, Service-Layer RBAC | `assert_service_rbac(claims)` + `ApprovalRequest` + `<= 100`/page |
| `APSC-DV-000530/2270/2560` | ASVS V2.8 | `SEC-16` | `>= 128-bit` `challenge_id`, `GETDEL`/Lua, `TTL <= 300s`, `PREAUTH_PUBLIC_ROUTES` |
| `APSC-DV-000650..1370` | SL/SLD | WORM Audit & 75% Alert | `seq_num BIGINT` + `pg_advisory_xact_lock`, CR/LF strip, 75% disk alert |
| `APSC-DV-001430/3140`, `V-222513` | 4.3.3 SFL | `SEC-11`, Supply Chain | `uv.lock`/`pnpm-lock.yaml`, signed CycloneDX SBOM/CBOM (`ECMA-424`) |
| `APSC-DV-002010..2230/2590/3310` | CP-5, MM 1-9 | Vault & Zeroization | FIPS AES-256-GCM envelope, `bytearray`/`sodium_memzero`, DB scrub |
| `APSC-DV-002310/2430/2770` | OSHP, SC 8-11 | `SEC-03/12/15`, `QA-SMOKE-01` | OSHP headers, prod `/docs` off, startup self-test, ephemeral secrets |
| `APSC-DV-002390/2485/2510..2550` | CEC, VSD, FV | `SEC-04/05/06/08/09/14` | `NFKC`, `defusedxml`, zero `pickle`/`shell=True`, magic-bytes, Anti-SSRF |
| `APSC-DV-003230` | Threat Model | Architecture Governance | Programmatic `pytm` / OWASP Threat Dragon specs + `QA-PG17-RLS` |
