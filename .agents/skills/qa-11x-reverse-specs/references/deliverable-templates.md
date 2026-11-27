# Deliverable Templates & Quality Contracts (`qa-11x-reverse-specs` v2.0)

> Load this reference on demand when synthesizing the 6 deliverables (`00..05-*.md`) from `<outputDir>/.skeletons/*.skeleton.md` and `<outputDir>/ecosystem-inventory.json`. Translate headings and prose to the **user's single prompt language** without duplicating `.es.md` mirrors.

---

## 1. `<outputDir>/00-resumen-ecosistema.md`
Required sections:
1. **Ecosystem Purpose & Scope Notice:** 1–2 paragraphs explaining what the workspace builds + explicit note confirming Zero-Footprint analysis and zero vulnerability audit scope.
2. **Project Catalog Table:** `Slug | Path | Role | Stacks | Endpoints | Models | Enums | Calls | Views | AST Nodes | Cycles` (preserve 100% of rows from `.skeletons/00-resumen-ecosistema.skeleton.md`).
3. **Architecture Topology Diagram:** Valid ` ```mermaid ` `flowchart LR` showing consumers, API providers, realtime channels, async queues, and external 3P SDKs.
4. **Integration & Findings Scorecard:** Table of all 8 finding categories with pre-truncation `findings_total_counts` and truncation status.
5. **Executive Top-5 Priorities:** Concise summary referencing `05-inconsistencias-y-mejoras.md` (`P1`/`P2`/`P3`).

## 2. `<outputDir>/01-specs-<slug>.md` (One File Per Project)
Required sections:
1. **Functional Responsibilities & Stack Profile:** Manifest files, role, stacks, and business scope (`[INFERRED]` tagged if deduced).
2. **Modular Architecture (`GRAPH_REPORT.md`):** AST communities (`communities[]`), top hub nodes (`top_hub_nodes[]`), and module boundaries.
3. **API Endpoints Contract Table (for providers):** `Method | Path | Handler | Path/Query Params | Request DTO | Response DTO | Status | Functional Auth/Guards | Citation`. Never omit routes.
4. **UI Views, Screens & Routes (for web/mobile):** `Name | Kind | Consumed Endpoints | Citation`.
5. **Realtime Channels, Async Jobs & External Integrations:** WebSocket/Socket.IO/SSE paths, Celery/BullMQ/Laravel/NestJS jobs, and external HTTP/SDK integrations (`file:L<line>`).
6. **Environment Configuration Table (Sanitized):** `Key | Category | Source | Sample (non-secret / [REDACTED]) | Citation`.
7. **Internal AST Health:** Symbol cycles, file cycles, and god-module candidates (`Ca`, `Ce`, `I`).

## 3. `<outputDir>/02-modelo-de-datos-y-estados.md`
Required sections:
1. **Entity-Relationship Diagram:** Valid ` ```mermaid ` `erDiagram` derived from extracted `relations[]` (`belongs_to`, `has_many`, `many_to_many`, `references`).
2. **Data Dictionary by Project:** For each model/DTO/ORM entity, list `table_name` (if any), `file:L<line>`, and full field table (`Field | Type | Required | Constraints`).
3. **Enums & Domain Lifecycle State Machines:** Complete enum catalog (`values[]` + `file:L<line>`) and ` ```mermaid ` `stateDiagram-v2` diagrams for status/lifecycle enums verified against transition code windows.

## 4. `<outputDir>/03-flujos-funcionales-e2e.md`
Required sections:
1. **End-to-End Traceability Matrix:** Every `FLOW-XX` from `functional_flows[]` (`Flow ID | Consumer | UI Entry | Consumer Call | Provider Endpoint | Handler/Service | Domain Models`).
2. **Critical Functional Sequence Diagrams:** Valid ` ```mermaid ` `sequenceDiagram` blocks for the top user journeys showing exact HTTP methods, paths, DTOs, error/retry behavior, and persisted models.

## 5. `<outputDir>/04-integracion-y-contratos.md`
Required sections:
1. **Verified HTTP/REST Integration Matrix:** 100% of `integration_edges[]` (`Consumer | Channel | Method | Path | Consumer Source | Provider | Provider Source`).
2. **Web vs Mobile Channel Parity Matrix:** Aligned endpoints vs `WEB_ONLY_ENDPOINT`, `MOBILE_ONLY_ENDPOINT`, and `METHOD_OR_VERSION_DIVERGENCE`.
3. **Environment & Base URL Alignment Table:** Consumer API base URLs/ports vs provider `PORT`/prefix declarations.
4. **Realtime, Async & Third-Party Integration Matrix:** Cross-project WebSocket/SSE channels, shared queues, and external 3P dependencies.

## 6. `<outputDir>/05-inconsistencias-y-mejoras.md`
Required sections:
1. **Scope Disclaimer:** Reiterate strictly functional/contractual/AST scope (ZERO vulnerability/CVE/STIG/OWASP findings).
2. **Categorized Findings Tables (All 8 Categories):**
   - `BROKEN_CONSUMER_CALL` (`404`/`405`)
   - `ORPHAN_PROVIDER_ENDPOINT`
   - `CHANNEL_ASYMMETRY`
   - `ENV_CONFIG_DRIFT`
   - `AST_STRUCTURAL_FINDINGS` (symbol cycles, file cycles, god-modules)
   - `SPEC_VS_CODE_DRIFT`
   - `PAYLOAD_SCHEMA_DRIFT` (`MISSING_REQUIRED_FIELD`, `CASING_MISMATCH`, `UNDECLARED_CONSUMER_FIELD`)
   - `UNHANDLED_PAGINATION_OR_ERROR_CONTRACT`
   Report both shown count and `findings_total_counts` whenever a category was truncated.
3. **Prioritized Engineering Improvement Roadmap (`P1` / `P2` / `P3`):** `IMP-01..IMP-08` with concrete impacted projects, root causes, and actionable contract/refactoring recommendations.
