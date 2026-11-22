> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# Testing and QA Guide for Scripts (Bash/Shell)

**CONTEXT FOR AI:** You are a DevOps automation engineer expert in Bash (POSIX/Ubuntu 26.04). This document defines the strict architectural rules for auditing and testing system scripts.

## 1. Strict Execution Rules
**NEVER** execute destructive tests or scripts on the local host. All validation must run ephemerally inside our official image: `sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7`.
*   This image includes `bats`, `kcov`, `shellcheck`, `shfmt`, and the `bats-mock`/`bats-assert` libraries preinstalled in `/opt/bats-libs/`.
*   **Mandatory:** All executions must be invoked using the provided `Makefile` commands (e.g., `make qa-unit`, `make qa-lint`) to guarantee container destruction post-validation and preserve isolation.

## 2. Isolation and Mocking (Golden Rule)
You are strictly prohibited from allowing tests to interact with the container's real hardware, network, or package manager.
*   **Destructive commands:** If the script invokes `rm`, `apt`, `systemctl`, `docker`, or manipulates network interfaces, you **MUST** create interception functions or use `bats-mock` to stub success/failure of those commands.
*   **Rootless `bats-mock` UID isolation:** On UIDs without an `/etc/passwd` entry (such as GitHub Actions `UID 1001` or macOS `UID 501`), define `_USER=qa` in Compose/Docker and `export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"` before loading `bats-mock` so `id -un` cannot pollute `stderr` / `$output`.
*   **Filesystem:** File operations must take place inside `$BATS_TEST_TMPDIR`.

## 3. Observability via Pushgateway and DevSecOps Security (DISA STIG & OWASP)
*   **Observability rule:** Bash scripts are ephemeral processes (*batch* tasks). To monitor their status, success, or execution times, you **MUST** inject non-blocking `curl` commands that push metrics to the `pushgateway` service enabled in the ephemeral network.
*   **Security by Design in Shell (`DISA V-222483, V-222513, V-222604, V-222645, V-222666` & `OWASP 4.3.3, 4.3.10`):**
    *   Use strict mode (`set -euo pipefail` or safe POSIX equivalent), double-quote all variable expansions to prevent *Command Injection*, and forbid `eval`.
    *   Never write secrets, passwords, or tokens into logs or onto the command line visible via `ps` (`V-222444`).
    *   Verify SHA-256 cryptographic hashes / signatures before installing or deploying artifacts (`V-222513, V-222645`), alert if the audit partition exceeds **75% usage** (`V-222483`), and scrub credentials/PII in database backup or export scripts (`V-222666`).
*   **Injection example:**

```bash
# Upon completing a successful task inside the script (timeout-bounded & non-blocking):
echo "script_success_total 1" | curl -fsS --connect-timeout 2 --max-time 4 -X POST --data-binary @- http://pushgateway:9091/metrics/job/bash_scripts >/dev/null 2>&1 || true
```

## 4. Local Execution Commands for the Developer (and AI Agents)

Instead of crafting complex Docker commands, you **MUST** instruct the user (or run autonomously if you have terminal access) using the standardized `Makefile`, which groups these validations:

* **Step 0: Context Ingestion & AST Graph (`CLI-First`)**
If you are an external agent or using a local terminal, refresh and inspect the stack AST graph without spinning up HTTP daemons:
```bash
./scripts/actualizar-grafos-graphify.sh bash-scripts
python3 .agents/scripts/inspect_blast_radius.py "<function_or_script>"
```
*(Directly inspects the AST graph and `ShellCheck`/`shfmt` without starting background services on port `8080`).*

* **Step 1: Audit syntax and security (ShellCheck)**
* **Step 2: Strict code formatting (shfmt)**
Run both static checks with a single command:
```bash
make qa-lint
```

* **Step 3: Unit and logic tests (BATS-core)**
* **Step 4: Rootless coverage audit (`kcov`) - 95% requirement (zero `SYS_PTRACE`)**
Run `clean_artifacts.sh` tests (`test/ejemplo_mock.bats`) inside `qa-bash` under `no-new-privileges:true` + `cap_drop: [ALL]` (compatible with `kernel.yama.ptrace_scope = 2` without `SYS_PTRACE` or `seccomp:unconfined`). `make qa-unit` uses `--bash-dont-parse-binary-dir --bash-parse-files-in-dir` with vendored QA-11X exclusions (`limpieza.sh`, `instalar-hooks.sh`, `.agents/`, `scripts/{verificar-secretos,auditar-infra,auditar-pagespeed,actualizar-grafos-graphify,generar-sbom-cyclonedx,install-skill}.sh`), guards `BASH_ENV` via `[ -p "/proc/${BASHPID}/fd/${KCOV_BASH_XTRACEFD}" ]` + `export -n BASH_XTRACEFD`, and exports a `<!DOCTYPE`-sanitized Cobertura report directly to `.agents/.cache/coverage/bash.xml` (`0600`) for `verify_diff_coverage.py`:
```bash
make qa-unit
```

* **Step 5: Observability Certification (Level 11X)**
Start Prometheus and Pushgateway and verify metric emission from the ephemeral script:
```bash
make qa-observability
docker compose -f docker-compose.qa.yml run --rm -T -u "$(id -u):$(id -g)" qa-bash bash ./clean_artifacts.sh --dry-run
# Or push a metric upon real artifact cleanup inside the ephemeral Compose network:
docker compose -f docker-compose.qa.yml run --rm -T -u "$(id -u):$(id -g)" qa-bash bash ./clean_artifacts.sh --pushgateway-url http://pushgateway:9091
# Security policy: external URLs require HTTPS (`--proto '=https' --tlsv1.2`); plain HTTP is restricted to local loopbacks/containers (`localhost`, `127.0.0.1`, `[::1]`, `pushgateway`, `bash_pushgateway`) unless `--allow-insecure-local` is passed, and an explicit `--pushgateway-url` failure exits non-zero.
# Verify the pushed metric at http://localhost:9090, then tear down with `make clean-cache` (or `--profile "*" down -v`).
```
