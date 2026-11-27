---
name: qa-11x-reverse-specs
description: >-
  Multi-project reverse specifications, cross-project integration mapping, and functional/AST inconsistency reporting
  skill (@sinfallas/mcp-qa-11x). Use whenever documenting sibling client repositories (API, web, mobile) inside a
  container workspace into an isolated analysis folder without writing to source repos or running vulnerability audits.
---

# Multi-Project Reverse Specs & Integration Mapper (`qa-11x-reverse-specs` v2.0)

> **OUTPUT LANGUAGE & CLIENT DELIVERABLE POLICY:** Interact in the **user's prompt language** (unless `AGENTS.md` fixes it). Write all client reverse-spec deliverables (`00..05-*.md`) in **one single language matching the user's prompt** (e.g., Spanish when prompted in Spanish; English when prompted in English). **Do NOT create duplicate `.es.md` mirrors** for client analysis deliverables. Keep `.agents/**` governance in concise English.

This modular skill orchestrates deep deterministic reverse engineering, data/state modeling, E2E AST flow tracing, and cross-project integration mapping for multi-repository client workspaces (e.g., API backend + Web portal + Mobile app + workers) via MCP tool `analyze_ecosystem_specs` (`schema_version: 2.0.0`).

---

## 1. Non-Negotiable Scope & Safety Guardrails

1. **Documentation & Integration ONLY — NO Vulnerability Audits:**
   - **STRICTLY FORBIDDEN** in this workflow: do NOT run `audit_security_stig_owasp`, Trivy/Semgrep CVE scans, OWASP/STIG security audits, or emit security vulnerability reports.
   - Focus exclusively on: deep functional reverse specifications from code, data models & state enums, E2E UI-to-model flows, cross-project HTTP/REST + realtime + async + `.env` communication contracts, functional/contractual/AST inconsistencies, and engineering improvement opportunities.
   - Never copy raw secret values from `.env` files into deliverables; cite only variable names, categories, and non-sensitive URL/port/prefix samples (`[REDACTED]` for credentials).
2. **Zero-Footprint Client Source Repositories:**
   - **NEVER** create, modify, or write `graphify-out/`, docs, configs, or temporary files inside any client source repository.
   - All Graphify AST graphs are built sequentially in read-only (`:ro`) ephemeral Docker containers (`sinfallas/remote-graphify`, serialized via `QA_MAX_CONCURRENT_CONTAINERS=1`) into `<outputDir>/.graphs/<slug>/`.
   - Every generated artifact (`.graphs/`, `.skeletons/`, `ecosystem-inventory.json`, `00..05-*.md`) MUST stay strictly inside `<outputDir>/`, and `<outputDir>/` MUST NOT be located inside any source repository (`SEC-PATH-01`).
3. **Current QA-11X Stacks Only:**
   - Operate strictly on the supported QA-11X stacks (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `mobile-appium`, `bash-scripts`, `ai-evals`, `vibe-rescue`) plus OpenAPI specs (`openapi.{json,yaml,yml}`, `swagger.{json,yaml,yml}`), Prisma schemas, and `.env*` configuration files.
4. **Agent-Only Invocation & No Unsolicited CALM:**
   - Invoked exclusively by the AI agent via MCP tool `analyze_ecosystem_specs` + this skill (no standalone CLI subcommand).
   - Do **NOT** generate `ecosystem.calm.json` or FINOS CALM manifests unless the user explicitly requests one.

---

## 2. Mandatory 5-Step Execution Workflow (AST-First + Deterministic Skeletons)

### Step 1: Run `analyze_ecosystem_specs` (Zero-Footprint Deep Discovery + AST + Skeletons)
Invoke MCP tool `analyze_ecosystem_specs` first:
```json
{
  "workspaceRoot": "<container-workspace-path>",
  "outputDir": "analisis",
  "buildGraphs": true,
  "refreshGraphs": false,
  "detailLevel": "deep",
  "generateSkeletons": true
}
```
- `detailLevel`: `"deep"` (default: full endpoints, DTO fields/FKs, enums, realtime/async/external, AST E2E flows, 8 finding categories) | `"standard"` (lightweight fast scan) | `"exhaustive"` (unbounded deep synthesis).
- Pass optional `projects: ["api", "web", "mobile"]` only if the user scopes the analysis to a subset of folders.
- The tool atomically writes `<outputDir>/ecosystem-inventory.json` (`2.0.0`) and deterministic `<outputDir>/.skeletons/00..05-*.skeleton.md` files.

### Step 2: Inspect Inventory, Skeletons & AST Reports Before Reading Source Code
Follow strict **AST-First Token Economy** (never run blind full-repository scans):
1. Read `<outputDir>/ecosystem-inventory.json` (`findings_total_counts`, `truncated_categories`, `projects`, `integration_edges`, `functional_flows`) covering all **8 functional/AST finding categories**:
   - `BROKEN_CONSUMER_CALL` (`404` missing endpoint / `405` HTTP method mismatch)
   - `ORPHAN_PROVIDER_ENDPOINT` (exposed API routes with zero detected consumers)
   - `CHANNEL_ASYMMETRY` (Web vs Mobile contract, version, or coverage divergence)
   - `ENV_CONFIG_DRIFT` (missing/unused `.env.example` keys, conflicting consumer base URLs/ports)
   - `AST_STRUCTURAL_FINDINGS` (symbol cycles, file-level cycles, god-modules)
   - `SPEC_VS_CODE_DRIFT` (OpenAPI spec routes missing in code or undocumented code routes)
   - `PAYLOAD_SCHEMA_DRIFT` (missing required DTO fields, `camelCase` vs `snake_case` drift, undeclared consumer fields)
   - `UNHANDLED_PAGINATION_OR_ERROR_CONTRACT` (mutating calls without error handling, paginated GET calls ignoring envelope)
2. Read each project's `<outputDir>/.graphs/<slug>/GRAPH_REPORT.md` to map communities and central hub nodes.
3. Read `<outputDir>/.skeletons/*.skeleton.md` as the **mandatory non-omissible baseline** for all 6 deliverables.

### Step 3: Windowed Source Verification (`40–80L` Targeted Reads)
Open **only targeted `40–80` line windows** (`StartLine`/`EndLine`) around high-value `file:line` pointers cited in `ecosystem-inventory.json`:
- Application entrypoints, router mounts, request/response DTO schemas, ORM models, and state enums.
- HTTP client wrappers (`baseURL`, auth headers, pagination/error handling), realtime handlers, and async worker jobs.
- Every finding location across the 8 categories to verify business context and root cause before writing prose.

### Step 4: Author the 6 Numbered Modular Deliverables in `<outputDir>/`
Load [`references/deliverable-templates.md`](references/deliverable-templates.md) on demand for exact section contracts. Write all deliverables in the **user's prompt language** (single language, zero duplicate `.es.md`), preserving **100%** of endpoints, models, enums, flows, and findings pre-populated in `.skeletons/`:

| Deliverable File | Audience & Required Contents |
| :--- | :--- |
| `<outputDir>/00-resumen-ecosistema.md` | **Executive & functional overview:** ecosystem purpose, project catalog table, high-level **Mermaid** `flowchart LR` topology, integration health scorecard (pre-truncation totals), and top inconsistencies/improvements. |
| `<outputDir>/01-specs-<slug>.md` *(one per project)* | **Per-repository deep reverse spec:** functional responsibilities, AST communities & hub nodes, complete endpoint catalog (method, path, handler, path/query params, request/response DTOs, status codes, functional auth/role guards), UI views/routes, realtime/async/external integrations, sanitized `.env` table, and internal AST health. |
| `<outputDir>/02-modelo-de-datos-y-estados.md` | **Data dictionary & state machines:** complete field-level tables (`name`, `type`, `required`, `constraints`, `table_name`) per entity/DTO, **Mermaid** `erDiagram` with FK/ORM relations, domain enums, and **Mermaid** `stateDiagram-v2` lifecycle transitions. |
| `<outputDir>/03-flujos-funcionales-e2e.md` | **End-to-end functional flows:** AST-traced UI/Screen → Store/Client → HTTP Edge → API Handler → Service → Model matrix (`functional_flows[]`) plus valid **Mermaid** `sequenceDiagram` flows for core user journeys. |
| `<outputDir>/04-integracion-y-contratos.md` | **Cross-project integration & contracts:** verified HTTP/REST edge matrix (`Consumer file:L<line>` ↔ `Provider file:L<line>`), Web vs Mobile parity matrix, `.env` base URL/port wiring alignment, and realtime/async/external 3P SDK matrix. |
| `<outputDir>/05-inconsistencias-y-mejoras.md` | **Inconsistencies & engineering improvements (NO vulnerability audit):** evidence-backed tables across all **8 categories** (including pre-truncation totals & truncation notes if any), plus prioritized (`P1`/`P2`/`P3`) `IMP-01..IMP-08` refactoring roadmap. |

### Step 5: Evidence Grounding & Anti-Hallucination Quality Gate
Before presenting the final summary to the user, verify EVERY checklist item:
- [ ] **Zero Omissions vs. Skeletons:** Every endpoint, model, enum, flow, and finding from `.skeletons/` is accounted for in `00..05-*.md`.
- [ ] **Exact `file:line` Citations:** Every symbol, route, model, `.env` key, and finding cites `<project>/<file>:L<line>`.
- [ ] **`[INFERRED]` Ratio Cap (`<= 20%`):** Any business intent or behavioral conclusion not literally stated in code MUST be prefixed with `[INFERRED]`, and `[INFERRED]` statements MUST remain **`<= 20%`** per deliverable.
- [ ] **Zero Vulnerability Audit Content:** Confirm zero STIG/OWASP/CVE/SAST vulnerability sections or findings were injected.
- [ ] **Zero Footprint & Valid Mermaid:** Confirm client source repos are untouched and all ` ```mermaid ` blocks use valid syntax and balanced code fences.
