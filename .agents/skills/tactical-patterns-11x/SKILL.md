---
name: tactical-patterns-11x
description: >-
  JIT tactical patterns for QA-11X: complexity rescue (CC <= 5, SonarJS <= 15, max-params <= 4,
  max-depth <= 3), offline Port/Adapter (--network none), atomic outbox/idempotency/RLS, and anti-overengineering.
---

# Tactical Patterns (`tactical-patterns-11x`)

> **OUTPUT:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

## 1. Complexity Gate Rescue (`Radon CC > 5` | `SonarJS > 15` | `PHP Cognitive > 9` | `max-args` / `max-params`)
- `depth > 3` -> **Guard Clauses** (early return; main path at indent 0).
- `>= 3` state/type branches -> **Dispatch Table / Handler Map** (`dict[Enum, Callable]`, `Record<K, Handler>`, PHP 8.2+ `match`).
- Sequential transforms -> **Pure Pipeline** (stateless functions).
- **FORBIDDEN:** Splitting into `_helper_1`/`_helper_2` passing `> 4` positional params or mutating shared dicts; wrap cohesive args in immutable DTOs (`@dataclass(frozen=True)`, Pydantic `frozen=True`, TS `readonly interface`, PHP `readonly class`).

## 2. Anti-Mock & Offline Boundary (`--network none`)
- Domain vs. Persistence -> **Functional Core, Imperative Shell** (pure core; thin shell hitting real ephemeral PostgreSQL 17 & KeyDB).
- External APIs / 3P / Hardware -> **Port & Adapter** (`Protocol`/`interface`) *only* at external edges for deterministic offline doubles (`respx`, `nock`, `MockHandler`) under `--network none`.
- **FORBIDDEN:** Fake `Repository` interfaces mocking SQLAlchemy, Prisma, Doctrine, or `write_audit_log`.

## 3. Distributed Consistency, Security & Multi-Tenancy (STIG V6R5 / OWASP v4.2)
- DB write + side effect (KeyDB/queues/webhooks) -> **Transactional Outbox** in same PG transaction (no uncoordinated dual-write).
- HTTP mutations (`POST`/`PUT`/`PATCH`/`DELETE`) -> **Atomic Idempotency State Machine** locking `(tenant_id, idempotency_key)` + payload SHA-256 (`409 Conflict` on mismatch; no `SELECT` before `INSERT`).
- PG17 RLS -> **Context-Scoped Unit of Work** setting `SET LOCAL app.current_tenant_id` (`after_begin`) inside active tx.

## 4. Anti-Overengineering Guardrails
- **FORBIDDEN:** Single-implementation `Protocol`/`interface` (outside §2 external network ports).
- **FORBIDDEN:** `Factory`/`AbstractFactory` for `< 3` runtime variants.
- **FORBIDDEN:** Mutable `Singleton` (use explicit injection).
