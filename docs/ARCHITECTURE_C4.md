> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](ARCHITECTURE_C4.es.md)

# Test Ecosystem Architecture (C4 Model)

This document graphically describes how tools, containers, and networks interact within **QA Testing Blueprints (`QA-11X v3.9`)**. We use an adaptation of the C4 Model tailored to ephemeral infrastructure to illustrate strict test isolation across **10 hydratable stacks + `architecture/` + `mcp-server/` (= 12 matrix environments)**, including Dynamic Security (DAST), Chaos Engineering, Mobile W3C Bridge (`sinfallas/base-mobile-appium:26`), and Observability (Level 11X).

---

## Level 1: System Context Diagram (Human + AI Hybrid Ecosystem)
Shows the high-level picture: how human developers and AI agents interact with the system through the MCP server, modular skills, and ephemeral execution.

```mermaid
flowchart TD
    Human["Developer / QA Staff"]
    Agent["AI Agent (Antigravity, Claude, Cursor, Hermes)"]
    MCP["Node.js/TS MCP Server (@sinfallas/mcp-qa-11x v3.9.0)"]
    Skill["Zero-Clone Skills (11 Modular Skills < 20 KB)"]
    Gate["11X Certification Gate (certify_task_completion.sh - 10 Stages)"]
    QA["QA Testing Blueprints (10 Hydratable Stacks + architecture/ + mcp-server/ = 12 Matrix Environments / Ephemeral Docker)"]
    Host["Host Machine (Docker Engine)"]
    Reports["Reports & Artifacts (Coverage, ZAP, Chaos, RED Metrics)"]

    Agent -->|"1. Queries 13 Resources & executes 19 Tools (stdio)"| MCP
    Agent -->|"2. Ingests directives & rules"| Skill
    Human -->|"3. Installs skills (npx install-skill) or clones repo"| Skill
    Human -->|"4. Delegates tasks / Pair Programming"| Agent
    MCP -->|"5. Orchestrates ephemeral validations (Rule Zero)"| QA
    Agent -->|"6. Runs universal gate before commit"| Gate
    Human -->|"7. Runs commands (make qa-all)"| QA
    Gate -->|"8. Validates 10 stages (secrets, Trivy, ORM, etc.)"| QA
    QA -->|"9. Runs in isolated sinfallas/* images"| Host
    Host -->|"10. Mounts bind volumes (.:/app)"| QA
    QA -->|"11. Emits reports on container exit"| Reports
    Reports -->|"12. Ingested for self-correction"| Agent
    Reports -->|"13. Inspected for audit"| Human

    classDef default fill:#111,stroke:#333,stroke-width:2px,color:#fff;
    classDef highlight fill:#0052cc,stroke:#003d99,stroke-width:2px,color:#fff;
    classDef barrier fill:#ff8c00,stroke:#b8860b,stroke-width:2px,color:#fff;
    classDef ai fill:#6b21a8,stroke:#9333ea,stroke-width:2px,color:#fff;
    class QA,Host highlight;
    class Gate barrier;
    class Agent,MCP,Skill ai;
```

---

## Level 2: Container & MCP Ecosystem Diagram
Shows the interaction between AI clients, the Node.js/TypeScript MCP server, and the `docker-compose.qa.yml` orchestrator with its isolated virtual network and execution profiles.

```mermaid
flowchart LR
    subgraph ClientIDE["Client / IDE Environment"]
        Client["AI Client / IDE (Antigravity / Claude / Cursor)"]
        MCPServer["@sinfallas/mcp-qa-11x (stdio / Node >= 24)"]
        Client <-->|"JSON-RPC (stdio)"| MCPServer
    end

    subgraph QABridge["Isolated IPv4 Virtual Network (QA Bridge)"]
        API["Live App (Nginx / Uvicorn / Node / PHP-FPM)"]
        Test["Ephemeral QA Container (Vitest / Pytest / Pest, SAST)"]
        DB["PostgreSQL 17 (Real Persistence, Alembic, RLS)"]
        KeyDB["Multi-Threaded KeyDB (In-Memory Cache, Rate Limit)"]
        Karate["BDD / E2E Container (Karate 1.5.1 / Playwright)"]
        Mobile["Mobile W3C Bridge (sinfallas/base-mobile-appium:26 / APPIUM_HOME)"]
        ZAP["DAST Container (OWASP ZAP Baseline)"]
        Pumba["Chaos Injector (Pumba --profile chaos)"]
        Prometheus["Observability (Prometheus --profile chaos)"]
        PushGW["Pushgateway (Metrics Cache)"]
        Graphify["AST & Blast Radius (sinfallas/remote-graphify)"]
        Cache["Persistent Cache (pnpm-store / uv-cache / composer-cache)"]
    end

    MCPServer -->|"run_ephemeral_qa / certify_11x_gate"| Test
    MCPServer -->|"inspect_ast_blast_radius"| Graphify
    MCPServer -->|"clean_workspace_11x (Ephemeral Alpine)"| Cache

    Test -->|"Reads/Writes Dependencies"| Cache
    Test -->|"Unit Isolation (Network Mocks)"| Test
    Test -->|"Validates Real Schemas & Migrations"| DB
    Test -->|"Atomic Operations / Rate Limiting"| KeyDB
    API -->|"Persists Data with RLS"| DB
    API -->|"Queries Session Cache"| KeyDB
    Test -->|"Stress Tests & CPU Profiling"| API
    Karate -->|"Black-Box HTTP Requests (BDD)"| API
    Mobile -->|"Reads/Writes pnpm-store"| Cache
    Mobile -->|"W3C / BFF HTTP Contracts"| API
    ZAP -->|"XSS/SQL Injection & Headers"| API
    Pumba -->|"Injects Latency & Kills Containers"| API
    Test -->|"Pushes Metrics (cURL)"| PushGW
    Prometheus -->|"Scrapes Metrics (/metrics)"| API
    Prometheus -->|"Scrapes"| PushGW
    Graphify -->|"Exposes AST Semantic Topology"| API

    classDef ephemeral fill:#b33a3a,stroke:#800000,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef live fill:#228b22,stroke:#006400,stroke-width:2px,color:#fff;
    classDef chaos fill:#4b0082,stroke:#800080,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef ai fill:#d4af37,stroke:#8b6508,stroke-width:2px,color:#000;
    classDef obs fill:#e6522c,stroke:#8f3018,stroke-width:2px,color:#fff;
    classDef storage fill:#555,stroke:#999,stroke-width:2px,color:#fff;
    classDef datastore fill:#0052cc,stroke:#003366,stroke-width:2px,color:#fff;

    class Test,Karate,Mobile,ZAP ephemeral;
    class Pumba chaos;
    class API live;
    class DB,KeyDB datastore;
    class Graphify ai;
    class Prometheus,PushGW obs;
    class Cache storage;
```

---

## Level 3: Component Diagram (Internal Execution Flow)
Non-negotiable 13-layer execution chain plus transversal meta-gates. If any link fails, the pipeline aborts immediately (Fail-Fast Principle).

```mermaid
flowchart TD
    subgraph Pipeline11X["Pipeline Execution (Standard 11X — L01..L13 Canon)"]
        direction TB

        Blast["Transversal: Blast Radius, AST Topology & FINOS CALM"]
        L01["L01: Static Analysis, Secrets & IaC (Ruff / ESLint / Trivy 0.76.2)"]
        L02["L02: Strict Typing & Complexity (Mypy / Radon Grade A CC <= 5 / SonarJS / PHPStan)"]
        L03["L03: Isolated Unit Tests (Pytest / Vitest / Pest / BATS)"]
        Coverage{"L03 Gate: Total Coverage >= 95%?"}
        L04["L04: Live DB Schema & ORM Parity (Alembic / PostgreSQL 17 RLS)"]
        L05["L05: Integration Contracts & Fuzzing (Pact V4 / Schemathesis)"]
        L06L07["L06-L07: Karate Labs API (Idempotency-Key) & UI HTTP/OSHP/SSG"]
        L08["L08: Mutation Testing (Mutmut / Stryker / Infection MSI >= 80%)"]
        L09["L09: Playwright Screenplay, WCAG 2.1 AA, Visual Geometry & Lighthouse"]
        L10["L10: Performance & Load (grafana/k6:2.4.0 / Locust / Artillery)"]
        L11["L11: Dynamic Security DAST (OWASP ZAP Baseline)"]
        L12["L12: Chaos Engineering & RED Metrics (Pumba + Prometheus)"]
        L13["L13: Trimodal Fixtures, 3-Phase Clock & 10/10 Closure Gate"]
    end

    Blast -->|"Bounded Impact & CALM OK"| L01
    L01 -->|"0 Secrets / 0 Criticals"| L02
    L02 -->|"Clean Types & CC <= 5"| L03
    L03 --> Coverage
    Coverage -->|"Yes"| L04
    Coverage -->|"No (Exit Code 1)"| FallaPipeline(("Pipeline Fails"))
    L04 -->|"0 Schema Drift"| L05
    L05 -->|"Contracts Verified"| L06L07
    L06L07 -->|"API & HTTP/OSHP Pass"| L08
    L08 -->|"Mutants Survive"| FallaPipeline
    L08 -->|"MSI >= 80%"| L09
    L09 -->|"WCAG & Geometry Pass"| L10
    L10 -->|"No Bottlenecks"| L11
    L11 -->|"Secure Headers"| L12
    L12 -->|"Stable RED Metrics"| L13
    L13 -->|"10/10 Certified"| Exito(("11X Certified"))

    classDef pass fill:#2e8b57,stroke:#fff,color:#fff;
    classDef fail fill:#b22222,stroke:#fff,color:#fff;
    class Exito pass;
    class FallaPipeline fail;
```

---

## Key Architectural Patterns

1. **Shift-Left Security:** We enforce local IaC (Trivy) and SAST (Lefthook) validations before spending compute cycles in CI/CD.
2. **Sidecar / Attacker-Defender:** Tools such as ZAP or Locust act as temporary attackers bombarding the Live App. They are never installed inside the production image.
3. **Chaos Engineering Resilience:** Testing whether the API works under ideal lab conditions is no longer sufficient. We use Pumba to intentionally degrade the internal network (Jitter, Packet Loss) and Prometheus to certify that P99 latency does not spike indefinitely.
4. **Blackbox Network Isolation (Boundaries):** BDD containers (Karate) or E2E containers (Playwright, `sinfallas/base-mobile-appium:26`) are strictly separated from unit tests through file naming conventions (`.e2e.ts` vs `.unit.ts`). They have no access to source code and communicate over pure HTTP or W3C WebDriver protocols simulating a real user.
