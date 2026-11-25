# Reference 10: SDD/EARS Traceability, Pre-Code Analyze Gate, Safe `[P]` Waves & Delta Specs

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE (0 Prompt Overhead until loaded)**  
> Load for `FULL_11X` specs, `REQ-NNN` -> Karate BDD mapping, pre-code `Analyze` gate, disjoint `[P]` waves, brownfield `Delta Specs`, or ADRs.

---

## 1. EARS Syntax & Mechanical Karate BDD Mapping (`REQ-NNN`)

Assign every requirement an immutable `REQ-NNN` ID using one of the 5 EARS patterns and map `1:N` to Karate `.feature` scenarios and `sync_enterprise_tms`:

| EARS Pattern | Template | Mandatory 11X Enforcement |
| :--- | :--- | :--- |
| **Ubiquitous** | `THE SYSTEM SHALL <response>` | System invariants (PG17 RLS `NOBYPASSRLS`, UTC timestamps, `Decimal` money). |
| **Event-driven** | `WHEN <trigger> THE SYSTEM SHALL <response>` | API/UI mutations -> Karate happy-path + dynamic `Idempotency-Key`. |
| **State-driven** | `WHILE <state> THE SYSTEM SHALL <response>` | 3-phase lifecycle (`Pending`, `Active`, `Expired`) & dual refresh states. |
| **Optional** | `WHERE <feature/tier> THE SYSTEM SHALL <response>` | Feature-gated or role-scoped RBAC flows enforced in the service layer. |
| **Unwanted** | `IF <error/timeout/dup> THEN THE SYSTEM SHALL <mitigation>` | **Mandatory:** every mutation/external port needs `>= 1` `IF...THEN` (`409`/`200`, `>= 180s` timeouts, RLS denial). |

---

## 2. Pre-Code `Analyze` Gate (Read-Only Check on `FULL_11X`)

Verify all 7 cross-artifact invariants before writing production code:

1. **Full `MUST REQ -> Task -> Test` Coverage:** `0` phantom requirements without tasks/tests; `0` orphan tasks without `REQ-NNN`.
2. **`AGENTS.md` & Rule Zero Conformance:** Non-root Docker execution, `CC <= 5`, `SonarJS <= 15`, `>= 95%` coverage.
3. **Zero Unmeasurable Adverbs:** Replace vague terms (*fast*, *scalable*) with numeric thresholds (`p95 <= 250ms`, `<= 12,288 B`, `timeout >= 180s`).
4. **Canonical Glossary:** Identical domain nouns across OpenAPI, ORM models, UI stores, and Gherkin steps.
5. **Failure-Path Completeness:** Every external I/O boundary and state transition has an `IF...THEN` contract.
6. **Data & Index Integrity:** Monetary fields use `Decimal`, dates use UTC, hot query filters map to explicit DB indexes.
7. **Acyclic Task DAG:** Task dependencies form a strict DAG with zero circular blockers.

---

## 3. Safe Parallel Wave Marker `[P]` (`/teamwork` & Subagents)

- Mark tasks `[P]` **ONLY** when touched file sets (code + tests + docs) are **100% disjoint** ($F_i \cap F_j = \emptyset$).
- Shared aggregators (`CHANGELOG`, `ROADMAP`, `manifest.json`, `bump_version_11x.py`) run sequentially after `[P]` waves settle.

---

## 4. Brownfield `Delta Specs` (`ADDED / MODIFIED / REMOVED`)

- Express brownfield behavior shifts as `ADDED`, `MODIFIED`, and `REMOVED` deltas against the active spec.
- **Permanent ID Retirement:** Retire `REMOVED` `REQ-NNN` IDs permanently; never reuse retired IDs.
- **Same-Commit Fold:** Fold accepted deltas into the baseline spec within the same local closure commit (`QA-GIT-GATE-01`).

---

## 5. Macro-Architecture & ADR Discipline

- **Modular Monolith + Hexagonal Default:** Isolate contexts via `.agents/boundaries.json` (`layers`, `independence`, `forbidden` in `verify_topological_health.py`) unless 6-dimension quantitative evidence (deploy cadence, autonomy, blast radius, data ownership, scaling asymmetry, latency) justifies splitting.
- **ADR Rigor:** Evaluate **"Do nothing"** explicitly and prove the data seam (`outbox` / schema ownership) before splitting any module.

---

## 6. Two-Stage Clean-Context Subagent Review (`0` Docker — `QA-DOCKER-LOOP-01`)

Before running `certify_task_completion.sh` on `FULL_11X` tasks, eliminate author confirmation bias by auditing `git diff` in a clean read-only subagent context (`research`, **strictly `0` `docker run` / `make qa-*` executions**):

1. **Stage A — Spec Compliance Gate:** Compare `REQ-NNN` & approved plan vs `git diff`. Flag missing requirements, unrequested YAGNI features, or undocumented contract drift before inspecting style.
2. **Stage B — 11X Quality, Anti-Silo & Security Gate:** Only after Stage A passes, verify `CC <= 5`, `QA-TEST-SYNC-01` co-evolution, 11 Anti-Silo invariants, RLS/WORM/RBAC rules, and `fp-check` AST reachability on any `qa-11x-ignore` pragma.
