# Frequently Asked Questions (FAQ) - QA Testing Blueprints

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](FAQ.es.md)

This document addresses architectural questions and the most common issues when implementing and running the standardized testing ecosystems (Level 11X) in this repository.

## 🏗️ Philosophy and Execution

### Why can't I run `npm install`, `pip install`, or tests directly on my local machine?
To guarantee **immutability and absolute parity with production**. The "works on my machine" problem is usually caused by hidden global Node/Python versions or residual environment variables. By forcing ephemeral containers (through simplified commands such as `make qa-unit`), the environment starts completely clean, uses isolated caches, executes the suite, and destroys itself.

### Lefthook blocked my `git commit` — what should I do?
Our policy is **"Fail & Forbid" (Educational Rejection)**. If Lefthook detected formatting errors or a hardcoded secret, it will abort your commit. Do NOT try to bypass it with `--no-verify`. Run the suggested Docker Rule Zero target (`make lint` at root, or `make qa-lint` inside the affected stack container), verify that the code is clean, and retry the commit.

### All my code works and coverage is 100% — why does the pipeline still fail?
Once you exceed 95% coverage, the pipeline evaluates **Technical Debt and Security**. Most likely:
1. Tools such as `SonarJS` (Node) or `Radon` (Python) detected high **Cyclomatic Complexity** (spaghetti code). You will need to refactor long functions.
2. You failed code formatting standards (`Prettier`, `Ruff`).
3. You introduced vulnerabilities detected by `ESLint Security` or `bandit` (SAST), or failed the `OWASP ZAP` dynamic scan (DAST).
4. Lighthouse performance (Vue 3 / React) dropped below 90.

### What does "ephemeral container" mean, and how do I keep reports if the container is deleted?
An ephemeral container is created dynamically with the `--rm` flag. It starts, runs a single command, and exits. Reports (such as HTML coverage or profiling Flamegraphs) are not lost because `docker-compose.qa.yml` uses **bind volumes** (`- .:/app`), writing results directly to your host disk.

## 🛡️ Tools and Specific Cases

### Why am I required to use Mocking libraries (`nock`, `pytest-mock`) if the API I call is fast?
To guarantee **determinism and total isolation**. If your test depends on the internet or a third-party API that temporarily goes down, your test will fail (false negative) and break the CI/CD pipeline. Unit tests must never leave the container.

### I am testing a Bash script that formats disks or restarts services. Isn't that dangerous?
It is **extremely dangerous and strictly forbidden**. You must use *Mocking*. The `sinfallas/base-bash-qa:latest` image includes the `bats-mock` library to intercept dangerous binaries and inject mock responses.

### What is the difference between SAST (Bandit/ESLint) and DAST (OWASP ZAP)?
*   **SAST (Static):** Scans your written source code like a book, searching for syntax or logic vulnerabilities before the program runs.
*   **DAST (Dynamic):** Acts like an automated attacker. It requires your API to be live and running. ZAP sends real malicious requests (XSS, SQLi), evaluating whether the server breaks or exposes insecure HTTP headers in its responses.

### What are Mutation Tests (Stryker / mutmut)?
They do not test your code; they **test your tests**. They intentionally mutate the original source code (flipping `>` to `<`, or `true` to `false`) and re-run your test suite. If your unit tests still report "Everything passed" despite the defect, your tests have false positives (they are not actually auditing anything).

### Why use Karate Labs (BDD) if I already have Vitest, Pytest, or Supertest evaluating the code?
Because they serve different purposes. Vitest/Pytest test white-box internals (they know the internal code). Karate Labs evaluates black-box behavior: it hits the live application port, simulating a real user via natural language (Gherkin).

### Why must I inject Prometheus middleware into my source code?
Because blind Chaos Engineering is useless. When we inject latency or packet loss with Pumba, we need to observe the real impact on response times (RED metrics) instantaneously. The selected middlewares (`express-prom-bundle`, `prometheus-fastapi-instrumentator`) have near-zero overhead and do not alter business logic.
*   **Note for scripts (Bash/Python):** For ephemeral tasks that do not start an HTTP server, we do not use middlewares. Instead, we push metrics (e.g., via `curl`) to a **Pushgateway**, allowing Prometheus to scrape them after the script finishes.

### Why does Pumba (Chaos) need access to the Docker socket (`/var/run/docker.sock`) if our policy forbids it?
Because **Chaos Engineering** simulates catastrophic infrastructure failures. Pumba needs to talk to the Docker daemon to intercept network traffic of other containers or terminate them abruptly. This is a **documented security exception**, hidden behind the `--profile chaos` flag in Compose. It must never be enabled on a production server.

## 🚨 Troubleshooting

### Docker throws "Permission Denied" or "ptrace(PTRACE_ATTACH)" when running Profilers (`clinic.js` or `py-spy`).
For security reasons, the Docker daemon blocks cross-process memory inspection.
**Solution:** Ensure the service in `docker-compose.qa.yml` enables the required kernel privileges:
```yaml
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
```

### ZAP (DAST) fails to write `zap-report.html` (Permission Denied)
The ZAP container runs by default as non-privileged user `zap` (`UID 1000`), complying with container hardening policies (Trivy `DS002`, zero `user: root`).
**Solution:** Make sure the working directory mounted at `/zap/wrk` is owned by host `UID 1000` or writable before running the scan. Afterwards, run `./scripts/limpieza.sh` or `make clean` (which uses an ephemeral Alpine Docker fallback to sanitize artifacts without `sudo`).

### Docker ran out of disk space, became slow, or tests fail due to stale code detection.
Containers and package managers accumulate massive caches.
**Solution:** Run the master cleanup script without requiring `sudo`:
```bash
./scripts/limpieza.sh
# At the monorepo root, use:
make clean           # or make qa-clean
# Inside individual stacks (e.g., fastapi/, vue3/), use:
make clean-cache     # or make clean
```
This purges temporary reports, test artifacts, and orphan caches using a hybrid strategy (local removal plus an ephemeral Docker fallback with container permissions), also cleaning named cache volumes (`pnpm-store` or `uv-cache`).

### Why do `scripts/limpieza.sh` and the `clean_workspace_11x` MCP tool no longer require `sudo`?
Ephemeral containers under Rule Zero can create `root`-owned files inside bind-mounted volumes. Instead of forcing the user or agent to run destructive superuser commands on the host machine, cleanup launches an ultra-lightweight digest-pinned ephemeral Alpine Linux container (`alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab`) mounting the directory with internal `uid 0` (`--network none --security-opt=no-new-privileges:true`) to safely purge artifacts and return clean ownership to the unprivileged host user.

### The Vue 3 E2E container (Playwright / Lighthouse) reports a network conflict or missing server when reaching the UI.
`make qa-e2e` and `make qa-perf` declare `build-ui` as a prerequisite, compiling the static bundle and bringing up `ui-prod` automatically inside ephemeral Docker (and tearing it down cleanly via the `EXIT` trap). Simply run:
```bash
make qa-e2e
```

## 🤖 AI Agents, MCP Protocol, and Zero-Clone Skills

### How does an AI Agent interact with this repository?
An AI agent (such as Google Antigravity, Anthropic Claude Code / Claude Desktop, Nous Research Hermes Agent, Cursor, or Windsurf) can interact in three ways:
1. **Via MCP Server (`@sinfallas/mcp-qa-11x` v3.7.0):** Connects over `stdio` via `npx -y @sinfallas/mcp-qa-11x@latest`. The server exposes **19 operational tools** (the 12 core v1 tools, 6 v2.0 evaluators — `validate_calm_architecture`, `evaluate_release_gate`, `evaluate_agent_trajectory`, `run_llm_red_team`, `audit_vibe_prototype`, `sync_enterprise_tms` — plus the **v3.1** `session_flight_recorder`) and **13 dynamic resources (`blueprint://*`, supporting `?lang=es|en`)** including **v3.1** `blueprint://skills/tactical-patterns-11x`, allowing the agent to audit and merge templates without cloning the entire repository.
2. **Via Zero-Clone Skills (`qa-11x-architect` and full catalog of 11 modular skills):** Injected into its environment along with operational scripts and the `AGENTS.md` connector by running `npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile` (SHA-256 verified against `manifest.json`), or by downloading and inspecting `scripts/install-skill.sh` with checksum verification before running it locally (avoid blind `curl ... | sh` piping). The agent immediately gains knowledge of the 13 quality layers, 22 baseline DISA/OWASP reference controls (enforced by 37 static scanner rules), JIT complexity patterns, and Anti-JSDOM prevention.
3. **Via Local Rules (`.agents/` and `AGENTS.md`):** When operating inside the cloned repository, the agent automatically reads directives in `.agents/rules/` and keeps the active log in `.agents/ACTIVE_TASK.md`, running the universal gate `./.agents/scripts/certify_task_completion.sh` before finishing turns.

### What is the `@sinfallas/mcp-qa-11x` MCP Server, and why is it superior to cloning the entire repository?
The MCP server implements the Anthropic / Linux Foundation open specification to expose tools and resources to LLMs. It enables **Zero-Clone adoption**: instead of transferring hundreds of files and megabytes to disk or saturating the agent's context window, the agent queries only the stack blueprint it needs with SHA-256 cryptographic verification (`DISA STIG V-222513`), runs tests in ephemeral Docker, and certifies quality through clean RPC calls.

### How do a human developer and an AI agent collaborate under this hybrid standard?
The 11X standard defines a **Hybrid Pair Programming** model:
- The **human developer** defines business requirements, approves architectural changes, and writes high-level prompts.
- The **AI agent** acts as a Staff QA & DevOps engineer: inspects the AST blast radius (`inspect_blast_radius.py`), writes business code, enforces unit and integration tests, authors Karate Labs BDD scenarios, executes tests in ephemeral Docker (`Rule Zero`), and keeps documentation synchronized (`docs/`, `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`).
- The **universal certification gate** (`certify_task_completion.sh`) acts as the objective mathematical arbiter that neither party can bypass prior to committing.

### Why was GitHub Actions publishing for the MCP server removed in favor of npm local publishing?
Following strict corporate sovereignty and credential isolation principles, delegating npm package publishing with `NPM_TOKEN` credentials to remote CI/CD runners introduces secret leakage risks and external network failures outside our control. Publishing is consolidated in the sovereign script `scripts/publicar-mcp.sh`, which runs the full 11X gate in ephemeral local Docker and handles the npm token transiently in memory with immediate cleanup.

### How do I update the MCP Server and Skills in my IDE after publishing a new version to npmjs, and how do I verify changes were downloaded?
Even if `mcp_config.json` specifies `"@sinfallas/mcp-qa-11x@latest"`, the IDE keeps the `stdio` process in memory from startup and `npx` caches copies in `~/.npm/_npx` (plus manifest cache in `~/.cache/qa-11x-blueprints`). To update surgically and verify cryptographic integrity:
1. **Run the surgical `upgrade` command (recommended first step):**
   ```bash
   npx -y @sinfallas/mcp-qa-11x@latest upgrade --reconcile
   ```
   This removes only stale `@sinfallas/mcp-qa-11x` entries inside `~/.npm/_npx` and `~/.cache/qa-11x-blueprints` (without wiping other tools), reconciles `.agents/` governance (`--reconcile`), and re-syncs all 11 modular skills. *(Only as a last resort if a corrupted cache persists, run `rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile`.)*
2. **Restart the MCP server in your IDE:** In Google Antigravity go to **`...` (Additional Options) > MCP Servers > `qa-11x` > Restart** or press `Ctrl+Shift+P` -> **`Developer: Reload Window`**.
3. **Verify environment, active version, and SHA-256 hashes (`DISA STIG V-222513`):**
   * Run **`doctor`** (or offline **`--version --verbose`**) to inspect active binary origin, `~/.npm/_npx` caches, global skills `.qa-11x-version` stamps, IDE configs, and Docker:
     ```bash
     npx -y @sinfallas/mcp-qa-11x@latest doctor
     npx -y @sinfallas/mcp-qa-11x --version --verbose
     ```
   * Optionally inspect cached files directly: `grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json` and `grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json`.
   * During skill synchronization, verify console output displays `✔ [Skills 11X] <N> archivos verificados con SHA-256 (DISA STIG V-222513).`. If any downloaded file mismatches the official manifest SHA-256 hash, the installer aborts automatically due to a cryptographic integrity violation.

### What is "Anti-Mock Blindness", and why is verification against real PostgreSQL and Alembic migrations mandatory?
In unit tests, mocking database calls creates a false sense of security. An ORM model can contain incompatible data types or missing columns that pass mocked tests with 100% coverage yet break production databases. Under Standard 11X, every model change requires a versioned migration and verification via `verify_alembic_orm_parity.py` running against a real PostgreSQL instance in ephemeral Docker.

### Why doesn't JSDOM detect visual layout collisions (Anti-JSDOM), and how is it prevented?
JSDOM simulates DOM nodes in Node.js without computing CSS layout, Flexbox/Grid boxes, or bounding coordinates (`getBoundingClientRect()` returns `0x0`). A fixed footer (`position: fixed`) can overlap a form or table while JSDOM claims buttons exist and are clickable. Standard 11X prohibits fixed footers, mandates in-flow layouts (`margin-top: auto` on `<main>`), and validates real Chromium geometry with **Playwright** (`mcr.microsoft.com/playwright:v1.52.0-noble`)—note that `sinfallas/karatelabs:1.5.1` runs HTTP/API and static HTML contracts without a browser engine.

### Why are internal AI directives in `.agents/` written in technical English when human docs also support Spanish?
For **token economy and logical precision**. BPE tokenizers split Spanish into ~35% more tokens than high-density technical English, so keeping internal rules and skills in English saves context window space for code and schemas. Meanwhile, top-level and operational documentation adopts the **English Canonical (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** architecture (Spec 19), while interactive agent responses and consumer repositories follow *Dynamic Language Mirroring* (matching the user's prompt language unless explicitly pinned via `--lang es|en`).

### Why is KeyDB used instead of standard Redis?
KeyDB is a multithreaded in-memory engine 100% compatible with Redis. It leverages multiple CPU cores simultaneously (`--server-threads 2`), scaling cache, rate-limiting, pub/sub, and idempotency-lock throughput by 3x to 5x without requiring any client library changes.
