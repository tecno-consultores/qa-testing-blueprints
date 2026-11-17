> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](qa-philosophy.es.md)

# Quality Philosophy (QA Philosophy)

This document sets out the engineering principles and strategic decisions that underpin the `qa-testing-blueprints` (`QA-11X v3.1`) ecosystem.

## 1. 95% Coverage Is a Floor, Not a Target
Requiring 95% coverage in `kcov`, `Vitest`, `PCOV`, or `pytest` is not a vanity metric; it is a containment barrier against silent regressions. We enforce writing tests for `catch` blocks and obscure logic branches.

## 2. Positive Paranoia: Mutation Testing
Tools such as `Stryker`, `Infection`, and `mutmut` attack our own tests by mutating source code logic. If a mutant survives, the test was a false positive.

## 3. Immutability and State Contamination
The greatest enemy of CI is persistent state. Running commands encapsulated inside `Makefiles` (e.g., `make qa-all`) guarantees that the environment starts stateless, evaluates code in an absolute vacuum, purges memory, and destroys itself safely.

## 4. AI-First Design
The imperative wording of our guides narrows the AI toolset strictly to certified `sinfallas/*` images across **10 hydratable stacks + `architecture/` + `mcp-server/` (= 12 matrix environments)** (including `sinfallas/base-mobile-appium:26`) and the **19 MCP tools / 13 resources** exposed by `@sinfallas/mcp-qa-11x` v3.1.0, ensuring generated code fits seamlessly with zero hallucinations.

## 5. Technical Debt Prevention (Complexity and Performance)
Working code is not enough; it must be scalable and efficient. We incorporate tools such as `radon` (Python) and `eslint-plugin-sonarjs` (JS/TS) to statically analyze cyclomatic and cognitive complexity. We complement this with `py-spy` and `clinic.js` to audit CPU and memory profiles from inside the container, catching bottlenecks prior to external load spikes.

## 6. Strict Network Isolation and the Mocking Boundary
To guarantee ephemeral isolation, pure unit tests (`.unit.py`, `.unit.ts`) must never talk to external APIs or networks. We require native `unittest.mock` / `pytest-mock` / `respx` (Python) and interception utilities such as `msw` or `nock` (Node.js) to stub external HTTP responses with zero latency or third-party dependency. However, this mocking boundary must never be used blindly to replace real relational databases or schemas (see Principle 12).

## 7. Local Gates (Pre-Commit & Pre-Push)
Low-quality or insecure code has no right to exist in the repository. We implement `Lefthook` and the certification gate `./.agents/scripts/certify_task_completion.sh` as border guards. At `pre-commit`, we reject unformatted code or hardcoded secrets. At `pre-push`, we execute Trivy to block vulnerable IaC deployments (e.g., exposed ports in Docker Compose). We educate developers and AI agents through immediate failure, while enforcing human confirmation (`QA-GIT-GATE-01`) before any remote `git push`.

## 8. Total Security (SAST + DAST + IaC)
We assume infrastructure and code are vulnerable by default. Traditional tests do not catch injections. Static auditing (Trivy for infrastructure, Bandit / Psalm for code) prevents fatal mistakes, while dynamic auditing with OWASP ZAP (`zaproxy/zap-stable`) attacks the live application to certify the web server exposes no sensitive data.

## 9. Extreme Resilience (Chaos Engineering)
Testing whether the API works under perfect laboratory conditions is no longer sufficient. Level 11X introduces Chaos Engineering (Pumba). We intentionally degrade the internal network by injecting *jitter* and *packet loss* while the application sustains stress spikes. We certify that the architecture has Auto-Recovery mechanisms rather than entering a permanent *deadlock*.

## 10. Universal Observability (RED Metrics)
We cannot improve what we do not measure. We enforce exposing RED metrics (Rate, Errors, Duration) through non-intrusive middleware coupled to Prometheus (for servers) or asynchronous pushes via Pushgateway (for scripts). This enables AI agents and developers to assess the damage caused by destructive tests in real time, moving from static reports to live diagnostics.

## 11. Zero-Trust Dependency Security
The ecosystem proactively blocks silent execution of third-party install scripts (e.g., `.npmrc` with `ignore-scripts=true`). No package downloaded from the internet has the right to execute arbitrary code on our infrastructure during installation, mitigating Supply Chain Attacks.

## 12. Anti-Mock Blindness and Real Persistence Validation
One of the primary causes of critical production failures is the false sense of security provided by database mocks ("Mock Blindness"). A mock always returns what the programmer expects, hiding schema drift, foreign key violations, incompatible types, or Row-Level Security (RLS) policy failures. At Level 11X, every ORM model mutation requires a versioned migration (`alembic revision --autogenerate`) and mandatory verification against a real ephemeral database (`postgres:17-alpine`) through automated parity scripts (`verify_alembic_orm_parity.py`).

## 13. Anti-JSDOM Visual Geometry (Real Browser Rendering)
Emulated environments such as JSDOM or HappyDOM do not compute CSS Layout, layer collisions, z-index, or bounding-box dimensions (`0x0`). Testing frontend components solely with JSDOM hides visual defects like fixed footers (`position: fixed`) overlapping action buttons or tables. Under Standard 11X, footers must reside in-flow inside `<main>` (`margin-top: auto`) and deep interactivity must be certified in real headless browsers via **Playwright** and **Karate Labs UI**.

## 14. Bilingual Agent Governance (High-Density English / 1:1 Dual-Mirror Human Docs)
To eliminate hallucinations and prevent LLM context-window exhaustion, internal governance directives (`.agents/rules/`, `.agents/skills/`) are authored exclusively in high-density technical English, saving roughly 35% of BPE tokens. In parallel, human documentation follows the canonical English (`*.md`) + 1:1 Spanish mirror (`*.es.md`) architecture, while interactive agent outputs dynamically match the user's prompt language without sacrificing local technical sovereignty.
