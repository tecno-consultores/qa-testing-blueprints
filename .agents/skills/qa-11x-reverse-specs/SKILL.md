---
name: qa-11x-reverse-specs
description: >-
  Multi-project reverse specifications, cross-project integration mapping, and functional/AST inconsistency reporting
  skill (@sinfallas/mcp-qa-11x). Use whenever documenting sibling client repositories (API, web, mobile) inside a
  container workspace into an isolated analysis folder without writing to source repos or running vulnerability audits.
---

# Multi-Project Reverse Specs & Integration Mapper (`qa-11x-reverse-specs`)

> **OUTPUT LANGUAGE & CLIENT DELIVERABLE POLICY:** Interact in the **user's prompt language** (unless `AGENTS.md` fixes it). Write all client reverse-spec deliverables (`00..03-*.md`) in **one single language matching the user's prompt** (e.g., Spanish when prompted in Spanish; English when prompted in English). **Do NOT create duplicate `.es.md` mirrors** for client analysis deliverables. Keep `.agents/**` governance in concise English.

This modular skill orchestrates deterministic reverse engineering and cross-project integration mapping for multi-repository client workspaces (e.g., API backend + Web portal + Mobile app) via MCP tool `analyze_ecosystem_specs`.

---

## 1. Non-Negotiable Scope & Safety Guardrails

1. **Documentation & Integration ONLY — NO Vulnerability Audits:**
   - **STRICTLY FORBIDDEN** in this workflow: do NOT run `audit_security_stig_owasp`, Trivy/Semgrep CVE scans, OWASP/STIG security audits, or emit security vulnerability reports.
   - Focus exclusively on: functional reverse specifications from code, cross-project HTTP/REST + `.env` communication contracts, functional/integration/architectural inconsistencies, and engineering improvement opportunities.
   - Never copy raw secret values from `.env` files into deliverables; cite only variable names, categories, and non-sensitive URL/port/prefix samples (`[REDACTED]` for credentials).
2. **Zero-Footprint Client Source Repositories:**
   - **NEVER** create, modify, or write `graphify-out/`, docs, configs, or temporary files inside any client source repository.
   - All Graphify AST graphs are built sequentially in read-only (`:ro`) ephemeral Docker containers (`sinfallas/remote-graphify`) into `<outputDir>/.graphs/<slug>/` (e.g., `analisis/.graphs/api-backend/`).
   - Every generated artifact MUST stay strictly inside `<outputDir>/`, and `<outputDir>/` MUST NOT be located inside any source repository (`SEC-PATH-01`).
3. **Current QA-11X Stacks Only:**
   - Operate strictly on the supported QA-11X stacks (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `mobile-appium`, `bash-scripts`, `ai-evals`, `vibe-rescue`) plus OpenAPI specs (`openapi.{json,yaml,yml}`, `swagger.{json,yaml,yml}`) and `.env*` configuration files.
4. **Agent-Only Invocation & No Unsolicited CALM:**
   - Invoked exclusively by the AI agent via MCP tool `analyze_ecosystem_specs` + this skill (no standalone CLI subcommand).
   - Do **NOT** generate `ecosystem.calm.json` or FINOS CALM manifests unless the user explicitly requests one.

---

## 2. Mandatory 4-Step Execution Workflow (AST-First Token Economy)

### Step 1: Run `analyze_ecosystem_specs` (Zero-Footprint Discovery + AST + Correlation)
Invoke MCP tool `analyze_ecosystem_specs` first:
```json
{
  "workspaceRoot": "<container-workspace-path>",
  "outputDir": "analisis",
  "buildGraphs": true,
  "refreshGraphs": false
}
```
- Pass optional `projects: ["api", "web", "mobile"]` only if the user scopes the analysis to a subset of folders.
- The tool runs Graphify AST extraction sequentially (`1` container at a time, `--rm --restart=no --network none`, source mounted `/src:ro`) and atomically writes `<outputDir>/ecosystem-inventory.json`.

### Step 2: Inspect Inventory & AST Summaries Before Reading Code
Follow strict **AST-First Token Economy** (never run blind full-repository scans):
1. Read `<outputDir>/ecosystem-inventory.json` to obtain:
   - Discovered projects (`slug`, `role`, `stacks`, `manifest_files`).
   - Extracted provider HTTP endpoints (`file:line`), domain models (`file:line`), consumer HTTP calls (`file:line`), UI views/screens/routes (`file:line`), and sanitized `.env` variables.
   - Verified `integration_edges` and categorized findings:
     - `BROKEN_CONSUMER_CALL` (`404` missing endpoint / `405` HTTP method mismatch)
     - `ORPHAN_PROVIDER_ENDPOINT` (exposed API routes with zero detected consumers)
     - `CHANNEL_ASYMMETRY` (Web vs Mobile contract, version, or coverage divergence)
     - `ENV_CONFIG_DRIFT` (missing/unused `.env.example` keys, conflicting consumer base URLs/ports)
     - `AST_STRUCTURAL_FINDINGS` (directed cross-file dependency cycles and god-modules)
2. Read each project's `<outputDir>/.graphs/<slug>/GRAPH_REPORT.md` to understand architectural communities and central hub nodes.

### Step 3: Windowed Source Verification (`40–80L` Targeted Reads)
Open **only targeted `40–80` line windows** (`StartLine`/`EndLine`) around high-value `file:line` pointers cited in `ecosystem-inventory.json`:
- Application entrypoints, router mounts, and core domain models/schemas.
- HTTP client wrappers (`baseURL`, interceptors, auth header wiring, retry/error handling).
- Every `BROKEN_CONSUMER_CALL`, `CHANNEL_ASYMMETRY`, `ENV_CONFIG_DRIFT`, and `AST_STRUCTURAL_FINDINGS` location to confirm root cause before writing findings.

### Step 4: Author the Numbered Modular Deliverable Package in `<outputDir>/`
Write all deliverables in the **user's prompt language** (single language, no duplicate `.es.md`):

| Deliverable File | Audience & Required Contents |
| :--- | :--- |
| `<outputDir>/00-resumen-ecosistema.md` | **Executive & functional overview:** ecosystem purpose, project catalog table (`slug`, path, role, stacks, graph stats), high-level **Mermaid** architecture diagram (`flowchart LR`), integration health scorecard, and prioritized executive summary of top inconsistencies & improvements. |
| `<outputDir>/01-specs-<slug>.md` *(one per project)* | **Per-repository reverse specification:** functional responsibilities, module/community breakdown from `GRAPH_REPORT.md`, domain models/entities (`file:L<line>`), exposed API endpoints or UI views/screens/routes (`file:L<line>`), key functional flows (**Mermaid** sequence/flowchart), `.env` integration keys (names & non-secret endpoints only), and internal AST health. |
| `<outputDir>/02-integracion-y-contratos.md` | **Cross-project integration & contracts:** end-to-end communication map (**Mermaid** `flowchart` + critical `sequenceDiagram` flows), verified HTTP/REST contract matrix (`Consumer file:L<line>` ↔ `Method + Path` ↔ `Provider file:L<line>`), Web vs Mobile channel parity matrix, and `.env` base URL/port wiring alignment table. |
| `<outputDir>/03-inconsistencias-y-mejoras.md` | **Inconsistencies & engineering improvements (NO vulnerability audit):** evidence-backed tables for `BROKEN_CONSUMER_CALL` (`404`/`405`), `ORPHAN_PROVIDER_ENDPOINT`, `CHANNEL_ASYMMETRY`, `ENV_CONFIG_DRIFT`, and `AST_STRUCTURAL_FINDINGS` (cycles & god-modules), followed by a prioritized (`P1`/`P2`/`P3`) refactoring & contract-alignment roadmap. |

---

## 3. Evidence Grounding & Anti-Hallucination Quality Gate

Before presenting the final summary to the user, verify EVERY checklist item:
- [ ] **Exact `file:line` Citations:** Every endpoint, domain model, consumer HTTP call, `.env` variable, and inconsistency includes an explicit relative citation (`<project>/<file>:L<line>`).
- [ ] **`[INFERRED]` Ratio Cap (`<= 20%`):** Any business intent or behavioral conclusion not literally stated in code MUST be prefixed with `[INFERRED]`, and `[INFERRED]` statements MUST remain **`<= 20%`** of statements in each deliverable.
- [ ] **Zero Vulnerability Audit Content:** Confirm zero STIG/OWASP/CVE/SAST vulnerability sections or findings were injected.
- [ ] **Zero Footprint Verified:** Confirm client source repositories remain completely untouched (all `.graphs/`, `ecosystem-inventory.json`, and `00..03-*.md` live solely under `<outputDir>/`).
- [ ] **Balanced Mermaid Diagrams:** Verify all ` ```mermaid ` blocks use valid syntax and balanced code fences.
