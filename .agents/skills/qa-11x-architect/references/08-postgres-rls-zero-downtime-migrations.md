# Reference 08: PostgreSQL 17 Row-Level Security (RLS), Zero-Downtime Migrations & ORM Parity

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE (0 Prompt Overhead until loaded)**  
> Load this reference ONLY when creating or modifying SQLAlchemy/Doctrine/Prisma ORM models, authoring Alembic/database migrations, tuning PostgreSQL queries, or writing persistence unit/integration tests.

---

## 1. Mandatory Multi-Tenant Row-Level Security (`FORCE ROW LEVEL SECURITY`, `NOBYPASSRLS` & `after_begin`)

Every multi-tenant table in PostgreSQL MUST enforce tenant isolation at the database engine layer so that application-layer query bugs cannot leak cross-tenant data:

```sql
-- 1. Provision a dedicated non-superuser application role (NEVER connect as superuser / BYPASSRLS):
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_user') THEN
        CREATE ROLE app_runtime_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'replace_in_vault';
    END IF;
END
$$;

-- 2. Inside every Alembic / SQL migration creating a tenant-scoped table:
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

-- 3. Pre-authentication lookups (e.g. login by tenant slug or bootstrap count):
-- NEVER weaken the RLS USING clause with "OR current_setting(...) = ''".
-- Use a tightly scoped SECURITY DEFINER function with explicit search_path:
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

- **Why `NOSUPERUSER NOBYPASSRLS` + `FORCE ROW LEVEL SECURITY` are Non-Negotiable:** PostgreSQL superusers and roles with `BYPASSRLS` silently ignore all RLS policies, and table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is enabled.
- **Multi-Transaction RLS Persistence (`after_begin` on `AsyncSession`):** Because `SET LOCAL app.current_tenant_id` expires at the first `await db.commit()`, any endpoint that commits an entity and subsequently opens a second transaction on the same session (e.g., calling `write_audit_log()`) will lose its RLS context unless re-injected. Store `(tenant_id, is_superadmin)` in `session.sync_session.info` and register an `"after_begin"` listener on `AsyncSession.sync_session_class`:

```python
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

async def apply_rls_session_settings(session: AsyncSession, tenant_id: str | None, is_superadmin: bool = False) -> None:
    """Bind tenant context to session.sync_session.info and apply SET LOCAL to the active transaction."""
    session.sync_session.info["tenant_id"] = str(tenant_id) if tenant_id else ""
    session.sync_session.info["is_superadmin"] = "true" if is_superadmin else "false"
    await session.execute(
        text(
            "SELECT set_config('app.current_tenant_id', :tid, true), "
            "set_config('app.is_superadmin', :sa, true)"
        ),
        {"tid": session.sync_session.info["tenant_id"], "sa": session.sync_session.info["is_superadmin"]},
    )

@event.listens_for(AsyncSession.sync_session_class, "after_begin")
def _reapply_rls_on_after_begin(session: Session, transaction, connection) -> None:
    """Automatically re-inject SET LOCAL whenever a subsequent transaction starts after await db.commit()."""
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

## 1.1. Deterministic WORM Audit Hash-Chain Serialization (`SEQUENCE` + `pg_advisory_xact_lock`)

Never order hash-chained immutable audit logs (`audit_logs`) solely by `created_at DESC`—PostgreSQL `now()` is constant within a transaction and `clock_timestamp()` can tie at microsecond resolution or race across concurrent requests. Always combine:
1. A monotonic sequence column (`seq_num BIGINT NOT NULL DEFAULT nextval('audit_logs_seq_num_seq')`).
2. A per-tenant transactional advisory lock (`SELECT pg_advisory_xact_lock(hashtext(:lock_key))`).
3. In-memory session tracking (`session.sync_session.info["_in_tx_audit_hash"]` / `session.__dict__["_rg_in_tx_audit_hash"]`) + `await session.flush()` after each `write_audit_log()` call:

```python
import hashlib, json
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

GENESIS_HASH = "0" * 64

async def write_audit_log(
    session: AsyncSession,
    *,
    tenant_id: str,
    actor_username: str,
    action: str,
    resource_display_name: str,
    payload: dict,
) -> AuditLog:
    # 1. Serialize hash-chain generation per tenant within the active transaction
    lock_key = f"audit_chain:{tenant_id}"
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": lock_key})

    # 2. Resolve previous hash from in-tx session memory first, falling back to monotonic seq_num DESC
    prev_hash = session.__dict__.get("_rg_in_tx_audit_hash") or session.sync_session.info.get("_in_tx_audit_hash")
    if not prev_hash:
        row = await session.execute(
            select(AuditLog.record_sha256_hash)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(AuditLog.seq_num.desc())
            .limit(1)
        )
        prev_hash = row.scalar_one_or_none() or GENESIS_HASH

    canonical = json.dumps(
        {
            "tenant_id": str(tenant_id),
            "actor_username": actor_username,
            "action": action,
            "resource_display_name": resource_display_name,
            "payload": payload,
            "prev_record_hash": prev_hash,
        },
        sort_keys=True,
    )
    record_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    entry = AuditLog(
        tenant_id=tenant_id,
        actor_username=actor_username,
        action=action,
        resource_display_name=resource_display_name,
        before_state=payload.get("before"),
        after_state=payload.get("after"),
        prev_record_hash=prev_hash,
        record_sha256_hash=record_hash,
    )
    session.add(entry)
    session.__dict__["_rg_in_tx_audit_hash"] = record_hash
    session.sync_session.info["_in_tx_audit_hash"] = record_hash
    await session.flush()
    return entry
```

---

## 2. Zero-Downtime Schema Migrations (Expand-Contract Pattern)

Never execute destructive or table-locking DDL statements directly on live tables:

1. **Lock Timeout Guardrail:** Always set a strict lock timeout at the beginning of migrations (`SET LOCAL lock_timeout = '3s';` and `SET LOCAL statement_timeout = '30s';`) so migrations fail fast rather than queuing `ACCESS EXCLUSIVE` locks that stall production traffic.
2. **Concurrent Index Creation:** Create and drop indexes without blocking writes using `CONCURRENTLY` inside an Alembic `autocommit_block()`:
   ```python
   with op.get_context().autocommit_block():
       op.create_index("ix_devices_tenant_status", "devices", ["tenant_id", "status"], postgresql_concurrently=True)
   ```
3. **Two-Phase Foreign Keys & `CHECK` Constraints:** Add constraints with `NOT VALID` first (instant metadata update), then run `VALIDATE CONSTRAINT` in a separate step (uses `SHARE UPDATE EXCLUSIVE` lock, allowing concurrent reads and writes).
4. **Adding Non-Nullable Columns Safely:** In PostgreSQL 11+, `ADD COLUMN col TYPE NOT NULL DEFAULT val` with a non-volatile constant default is instant; otherwise, add the column nullable first (*Expand*), backfill in batches, and enforce `NOT NULL` via a `CHECK (...) NOT VALID` + `VALIDATE CONSTRAINT` (*Contract*).
5. **Alembic Revision ID Limit (`<= 32` chars):** Alembic's default `alembic_version.version_num` column is `VARCHAR(32)`. Keep every `revision = "..."` identifier `<= 32` characters (verified by `.agents/scripts/verify_alembic_orm_parity.py`).

---

## 3. SQLAlchemy 2.0 `AsyncSession` & `MockDbSession` Parity Invariants

1. **Preventing `MissingGreenlet` After Commit/Rollback:**
   - By default, SQLAlchemy expires ORM attributes upon `await db.commit()` or `await db.rollback()`. Accessing `obj.id` or lazy relationships afterward in async code triggers `sqlalchemy.exc.MissingGreenlet`.
   - Configure `expire_on_commit=False` on `async_sessionmaker`, capture primitive values before `rollback()`, or explicitly call `await db.refresh(obj)` before accessing attributes post-commit.
2. **`JSON`/`JSONB` Serialization & `Numeric(p, s)` `Decimal` Parity in Unit Tests:**
   - In unit tests using `MockDbSession`, `add()` / `flush()` / `commit()` MUST validate all `JSON` / `JSONB` columns (`AuditLog.before_state`, `AuditLog.after_state`, `metadata_json`) by calling `json.dumps(val)` **without `default=str`** (matching PostgreSQL `asyncpg`'s strict JSON serializer).
   - Always populate ORM `Numeric(p, s)` fields in test fixtures with `decimal.Decimal("...")` instances (never `float` or `int`), ensuring `TypeError: Object of type Decimal is not JSON serializable` is caught during unit testing if a service forgets to convert `Decimal` before writing to `JSONB`.

---

## 4. Pre-Commit Persistence Verification Checklist & PostgreSQL 15–17+ RLS Catalog Audit (`QA-PG17-RLS`)

When verifying `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` in integration tests against `postgres:17-alpine`, **NEVER** query `pg_tables.forcerowsecurity` (that column does not exist in `pg_catalog.pg_tables` in PostgreSQL 15–17+ and fails with `UndefinedColumnError`). Always query `pg_catalog.pg_class.relforcerowsecurity` joined with `pg_catalog.pg_namespace`:

```sql
SELECT c.relname AS tablename,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY(:tenant_tables);
```

- [ ] Does every new/modified ORM model have a matching migration verified against a real `postgres:17-alpine` container (`run_ephemeral_qa(stage="integration")`)?
- [ ] Does `python3 .agents/scripts/verify_alembic_orm_parity.py` pass with 0 drift and `revision <= 32` chars?
- [ ] Do all multi-tenant tables assert `relrowsecurity = true` AND `relforcerowsecurity = true` via `pg_class` + `pg_namespace`?
- [ ] Do `MockDbSession` unit tests validate `JSONB` columns via `json.dumps()` without `default=str` and use `decimal.Decimal` for `Numeric` fields?
