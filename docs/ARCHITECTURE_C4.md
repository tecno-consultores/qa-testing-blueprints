> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (ARCHITECTURE_C4.es.md)](ARCHITECTURE_C4.es.md)

# Test Ecosystem Architecture (C4 Model)

This document graphically describes how tools, containers, and networks interact within **QA Testing Blueprints (`QA-11X v3.0`)**. We use an adaptation of the C4 Model tailored to ephemeral infrastructure to illustrate strict test isolation across **10 stacks / 12 environments**, including Dynamic Security (DAST), Chaos Engineering, Mobile W3C Bridge (`sinfallas/base-mobile-appium:26`), and Observability (Level 11X).

---

## Level 1: System Context Diagram (Human + AI Hybrid Ecosystem)
Shows the high-level picture: how human developers and AI agents interact with the system through the MCP server, modular skills, and ephemeral execution.

```mermaid
flowchart TD
    Human["Developer / QA Staff"]
    Agent["AI Agent (Antigravity, Claude, Cursor, Hermes)"]
    MCP["Node.js/TS MCP Server (@sinfallas/mcp-qa-11x v3.0.0)"]
    Skill["Zero-Clone Skills (10 Modular Skills < 20 KB)"]
    Gate["11X Certification Gate (certify_task_completion.sh - 10 Stages)"]
    QA["QA Testing Blueprints (10 Stacks / 12 Environments / Ephemeral Docker)"]
    Host["Host Machine (Docker Engine)"]
    Reports["Reports & Artifacts (Coverage, ZAP, Chaos, RED Metrics)"]

    Agent -->|"1. Queries 12 Resources & executes 18 Tools (stdio)"| MCP
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
        MCPServer["@sinfallas/mcp-qa-11x (stdio / Node 20+)"]
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
Non-negotiable 13-layer execution chain. If any link fails, the pipeline aborts immediately (Fail-Fast Principle).

```mermaid
flowchart TD
    subgraph Pipeline11X["Pipeline Execution (Standard 11X - 13 Layers)"]
        direction TB

        Blast["0. Blast Radius & AST (inspect_blast_radius.py)"]
        Obs["1. RED Instrumentation (Middleware or Pushgateway)"]
        IaC["2. IaC & Secrets Audit (Trivy / verificar-secretos.sh)"]
        SAST["3. Static Security (Bandit / ESLint Security / Psalm)"]
        Static["4. Quality & Complexity (Radon <= B / SonarJS / PHPStan)"]
        Unit["5. Isolated Unit Logic (Pytest / Vitest / Pest)"]
        Coverage{"6. Total Coverage >= 95%?"}
        Mutation["7. Mutation Testing (Stryker / Mutmut / Infection)"]
        Parity["8. Real Schema Parity (Alembic / PostgreSQL 17)"]
        BDD["9. Behavior & Black-Box (Karate Labs API & UI)"]
        Performance["10. Performance Profiling (py-spy / clinic.js)"]
        DAST["11. Dynamic Security (OWASP ZAP Baseline)"]
        Chaos["12. Chaos Engineering (Pumba + Locust / Artillery)"]
    end

    Blast -->|"Bounded Impact"| Obs
    Obs -->|"Observable App"| IaC
    IaC -->|"Secure Infrastructure"| SAST
    SAST -->|"Passes"| Static
    Static -->|"Clean Code"| Unit
    Unit --> Coverage
    Coverage -->|"Yes"| Mutation
    Coverage -->|"No (Exit Code 1)"| FallaPipeline(("Pipeline Fails"))
    Mutation -->|"Mutants Survive"| FallaPipeline
    Mutation -->|"Solid Assertions"| Parity
    Parity -->|"0 Orphan Schemas"| BDD
    BDD -->|"Validated Contracts"| Performance
    Performance -->|"No Bottlenecks"| DAST
    DAST -->|"Secure Headers"| Chaos
    Chaos -->|"Stable RED Metrics"| Exito(("11X Certified"))

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
