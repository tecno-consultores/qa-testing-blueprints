---
name: tactical-patterns-11x
description: >-
  Just-in-time refactoring and concurrency patterns for Standard 11X. Use when resolving cyclomatic/cognitive
  complexity or parameter-count violations, isolating external network ports offline, or implementing transactional
  outbox, atomic idempotency, and WebSocket pub/sub.
---

# Tactical Patterns (`tactical-patterns-11x`)

> **OUTPUT:** User prompt language; docs match README/CHANGELOG (Spec 19; `.agents/**` EN).

## 1. Complexity Rescue (`CC <= 5` | `SonarJS <= 15` | `PHP Cog <= 9` | `max-params <= 4`)
- `depth > 3` -> **Guard Clauses** (early return; main path at indent 0).
- `>= 3` state/type branches -> **Dispatch Table / Handler Map** (`dict[Enum, Callable]`, `Record<K, Handler>`, PHP 8.2+ `match`).
- Sequential transforms -> **Pure Pipeline** (stateless functions).
- **FORBIDDEN:** Micro-helpers (`>4` params) or mutating shared dicts; use immutable DTOs (`@dataclass(frozen=True)`, Pydantic `frozen=True`, TS `readonly`, PHP `readonly class`).

## 2. Anti-Mock & Offline Boundary (`--network none`)
- Domain vs. Persistence -> **Functional Core, Imperative Shell** (pure core; thin shell hitting PG17 & KeyDB).
- External APIs/3P/HW -> **Port & Adapter** (`Protocol`/`interface`) *only* at external edges (`respx`, `nock`, `MockHandler`) under `--network none`.
- **FORBIDDEN:** Fake `Repository`/DB/audit mocks in integration/Anti-Silo (`MockDbSession` & `call_args`-asserted `write_audit_log` `AsyncMock` ONLY in `.unit.*`).

## 3. Consistency, Security & Multi-Tenancy (STIG V6R5 / OWASP v4.2)
- DB write + side effect -> **Transactional Outbox** in same PG tx (no dual-write).
- HTTP mutations (`POST`/`PUT`/`PATCH`/`DELETE`) -> **Atomic Idempotency** locking `(tenant_id, idempotency_key)` + SHA-256 (`409` on mismatch).
- PG17 RLS -> **Scoped Unit of Work** (`SET LOCAL app.current_tenant_id` via `after_begin`).
- WS/PubSub (`SEC-WS-PUBSUB-01`) -> `ws:{tenant_id}:events`, `ws.receive()` watcher, `await pubsub.aclose()` in `finally:`.
- Synthetic secrets (`QA-SECRET-CONV-01`) -> prefix `fake-*`, `dummy-*`, `mock-*`, `placeholder-*`.

## 4. Anti-Overengineering
- **FORBIDDEN:** Single-impl `Protocol`/`interface` (outside §2 external ports), `Factory` for `<3` variants, mutable `Singleton`.
