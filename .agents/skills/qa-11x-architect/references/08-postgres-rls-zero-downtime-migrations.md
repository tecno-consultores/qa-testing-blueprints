# Reference 08: PostgreSQL 17 Row-Level Security (RLS), Zero-Downtime Migrations & ORM Parity

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE (0 Prompt Overhead until loaded)**  
> Load this reference ONLY when creating or modifying SQLAlchemy/Doctrine/Prisma ORM models, authoring Alembic/database migrations, tuning PostgreSQL queries, or writing persistence unit/integration tests.

---

## 1. Mandatory Multi-Tenant Row-Level Security (`FORCE ROW LEVEL SECURITY`)

Every multi-tenant table in PostgreSQL MUST enforce tenant isolation at the database engine layer so that application-layer query bugs cannot leak cross-tenant data:

```sql
-- Inside every Alembic / SQL migration creating a tenant-scoped table:
ALTER TABLE tenant_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_resources FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_resources
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

- **Why `FORCE ROW LEVEL SECURITY` is Non-Negotiable:** Without `FORCE`, the table owner role (commonly the same user used by the app pool in dev/staging) bypasses RLS policies completely.
- **Session Context Binding:** Before executing queries in a request transaction, execute:
  ```python
  await session.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)"), {"tid": str(tenant_id)})
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

## 4. Pre-Commit Persistence Verification Checklist

- [ ] Does every new/modified ORM model have a matching migration verified against a real `postgres:17-alpine` container?
- [ ] Does `python3 .agents/scripts/verify_alembic_orm_parity.py` pass with 0 drift and `revision <= 32` chars?
- [ ] Do all multi-tenant tables include `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`?
- [ ] Do `MockDbSession` unit tests validate `JSONB` columns via `json.dumps()` without `default=str` and use `decimal.Decimal` for `Numeric` fields?
