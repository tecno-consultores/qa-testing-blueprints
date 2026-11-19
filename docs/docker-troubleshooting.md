> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](docker-troubleshooting.es.md)

# Docker Troubleshooting Guide

This document centralizes the most common issues encountered when operating the QA blueprints. Because our architecture relies on ephemeral containers and *bind* volumes, most errors do not originate from application code, but from interactions between the Docker daemon, internal bridge networks, and the host operating system.

---

## 1. Full Disk Syndrome and Exhausted Networks

**Symptom:**
When attempting to run a test suite, you receive errors such as `no space left on device` or `could not find an available, non-overlapping IPv4 address pool`.

**Why does this happen?**
Docker caches aggressively: dangling images, temporary Prometheus databases, or undestroyed bridge networks accumulate over time. In addition, **persistent cache volumes** (`pnpm-store`, `uv-cache`, and `composer-cache`) can grow unchecked over time.

**The Solution:**
Run the deep purge that shuts down all hidden profiles and removes volumes (`down -v`) without requiring `sudo` privileges on the host:

```bash
./scripts/limpieza.sh
# Or use the Makefile target in your project:
make clean-cache
```

---

## 2. Permission Denied on Generated Files

**Symptom:**
Linux reports `Permission denied` when you attempt to inspect or clean generated reports.

**Why does this happen?**
A side effect of *bind* volumes. When an ephemeral container runs with an internal `root` UID, it creates files and directories (such as `prometheus_data/` or `reports/`) owned by UID `0`.

**The Solution:**
Use the master sanitization script `./scripts/limpieza.sh` (or the `clean_workspace_11x` MCP tool), which spins up an ephemeral Alpine container with internal privileges to clean and normalize permissions automatically without needing `sudo` on the host:

```bash
./scripts/limpieza.sh
# Or clean workspace + root-owned artifacts cleanly via the Makefile alias:
make clean
```

---

## 3. Port Conflict with Prometheus (9090)

**Symptom:**
Error `Bind for 0.0.0.0:9090 failed: port is already allocated` when launching the chaos or observability profile. *(Note: Graphify AST analysis runs in CLI-first mode via `./scripts/actualizar-grafos-graphify.sh` with no persistent daemons on port 8080.)*

**Why does this happen?**
You already have a Prometheus instance or an Nginx service running on your *host* machine or inside another Docker project that you forgot to stop.

**The Solution:**
Kill the conflicting container and tear down the entire compose network:

```bash
docker ps | grep 9090
docker kill <conflicting_container_id>
docker compose -f docker-compose.qa.yml --profile chaos down
```

---

## 4. Abrupt Exit: "Exit Code 137" (OOM Killer)

**Symptom:**
The container terminates with `Exit Code 137`. This commonly occurs with Playwright or Karate Labs (`sinfallas/karatelabs:1.5.1`), and especially when injecting massive concurrency via Artillery, Locust, or k6.

**Why does this happen?**
The Linux *OOM Killer* terminated the process because it exhausted available RAM.

**The Solution:**
Throttle worker concurrency (`--workers=1`) or allocate more RAM to the Docker engine.

---

## 5. Permission Errors When Running Profilers (SYS_PTRACE)

**Symptom:**
When running advanced resource analysis and profiling tools such as `py-spy` in Python or `clinic.js` in Node.js, the container fails with permission denied messages or `ptrace(PTRACE_ATTACH)` errors.

**Why does this happen?**
By default, Docker enforces a strict `seccomp` profile that forbids a process from inspecting another process's memory via low-level system calls.

**The Solution:**
Temporarily grant extended capabilities to the container in your `docker-compose.qa.yml` file:

```yaml
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
```

---

## 6. ZAP (DAST) Fails When Writing the HTML Report

**Symptom:**
OWASP ZAP finishes auditing the API successfully, but throws a `Permission Denied` error when saving `zap-report.html`.

**Why does this happen?**
The ZAP container runs by default as the unprivileged `zap` user, which lacks write permissions on the *bind* volume mapped from your host machine.

**The Solution:**
Keep the container running under its unprivileged user (`UID 1000` — setting `user: root` is forbidden by Trivy `DS002` / DISA STIG compliance) and ensure write permissions on the mapped folder beforehand, or write the report to `/tmp/zap-report.html` and extract it upon exit. Afterward, run `./scripts/limpieza.sh` or `make clean` to normalize permissions without requiring `sudo`.

---

## 7. Pumba Fails with "Cannot connect to the Docker daemon"

**Symptom:**
When executing the resilience test (`docker compose --profile chaos up`), the Pumba container exits immediately with a Docker daemon connection error.

**Why does this happen?**
The Docker daemon on distributions such as Ubuntu Snap or Docker Desktop (Windows/macOS) sometimes uses a socket path different from the standard `/var/run/docker.sock`.

**The Solution:**
Ensure the socket path mounted in your orchestrator matches your host configuration. If you use WSL2 on Windows, enable explicit resource and network integration in Docker Desktop settings.

---

## 8. Dependency or Compilation Errors in Node.js/Vue/React (Zero-Trust)

**Symptom:**
When running `make qa-unit` or installing dependencies, packages such as `esbuild`, `prisma`, `cypress`, or `bcrypt` fail complaining that they could not run their post-install script.

**Why does this happen?**
As a strict security measure, we inject an `.npmrc` file configured with `ignore-scripts=true`. This blocks supply-chain attacks, while also stopping legitimate libraries that need to compile native binaries.

**The Solution:**
Identify the failing library and explicitly declare it in `pnpm-workspace.yaml` using a **boolean `allowBuilds` map** compliant with `SEC-09` (declaring `"pnpm"` / `pnpm.onlyBuiltDependencies` inside `package.json` is forbidden by `SEC-09` and ignored by `pnpm 12+` with `ERR_PNPM_IGNORED_BUILDS`, and never use a YAML list `- pkg` which aborts with `ERR_PNPM_INVALID_SETTING`):
```yaml
allowBuilds:
  esbuild: true
  bcrypt: true
```
You can also rebuild specific trusted native packages cleanly inside the ephemeral container while keeping `.npmrc` `ignore-scripts=true` intact.

---

## 9. Integration Test Failures Due to Unready Database (PostgreSQL)

**Symptom:**
When running integration tests or Alembic migrations, the console outputs `psycopg2.OperationalError: could not connect to server: Connection refused` or `asyncpg.exceptions.CannotConnectNowError`.

**Why does this happen?**
The `postgres` container (`postgres:17-alpine`) starts in the background (`up -d`), yet the PostgreSQL engine takes 1 to 3 seconds to initialize the cluster and accept TCP connections on port 5432.

**The Solution:**
Ensure your script or command waits for active readiness using `pg_isready` before running migrations or suites:
```bash
docker compose -f docker-compose.qa.yml exec -T postgres sh -c "until pg_isready -U postgres; do sleep 0.5; done"
```

---

## 10. Performance or Memory Warnings in Multi-Threaded KeyDB

**Symptom:**
KeyDB emits warnings such as `WARNING: Memory fragmentation ratio is high` or out-of-memory errors (`OOM command not allowed`).

**Why does this happen?**
KeyDB uses a multi-threaded model (`server-threads 4`) by default. Running extreme stress suites with Locust/Artillery/k6 without setting an eviction policy (`maxmemory-policy`) can let temporary session memory saturate the ephemeral container.

**The Solution:**
Verify that the `keydb` service in `docker-compose.qa.yml` declares safe memory limits:
```yaml
    command: keydb-server --server-threads 2 --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly no --save ""
```

---

## 11. Trivy Blocked by Cache Volume Permissions

**Symptom:**
When running `./scripts/auditar-infra.sh` or `make audit`, Trivy throws: `permission denied on /root/.cache/trivy/db`.

**Why does this happen?**
The ephemeral Trivy container creates the vulnerability database with restrictive ownership. If a subsequent audit runs with an unprivileged UID, reading or updating that directory fails.

**The Solution:**
`./scripts/auditar-infra.sh` uses the isolated named volume `qa11x_trivy_cache` to avoid polluting the working tree with `root`-owned files. If the cached database becomes corrupted, purge it cleanly without `sudo`:
```bash
docker volume rm -f qa11x_trivy_cache
./scripts/limpieza.sh
```

---

## 12. Silent Visual Geometry Failures in JSDOM vs. Playwright

**Symptom:**
Vitest unit tests with `jsdom` pass at 100%, yet in a real **Playwright** (`mcr.microsoft.com/playwright:v1.52.0-noble`) Chromium session, action buttons cannot be clicked (`element is intercepted by other element`)—note that `sinfallas/karatelabs:1.5.1` runs HTTP/API and static HTML contracts without a browser engine.

**Why does this happen?**
JSDOM is a logical DOM tree simulator, but it **DOES NOT compute CSS Layout, coordinates, or z-index**. Fixed floating elements (`position: fixed`) or misaligned footers cover buttons in real browsers without JSDOM noticing.

**The Solution:**
1. Design all footers as in-flow elements inside `<main>` using flexbox:
```css
main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
footer {
  margin-top: auto;
}
```
2. Always validate visual geometry and deep interactivity in real headless Chromium browsers via `make qa-e2e` (**Playwright** `mcr.microsoft.com/playwright:v1.52.0-noble`; note `sinfallas/karatelabs:1.5.1` validates HTTP/API and static HTML contracts without a browser engine).

---

## 13. `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR: Permission denied (os error 13)` in Node/Frontend/Mobile Containers (`UID 10001`)

**Symptom:**
On GitHub Actions (`ubuntu-latest`, `uid=1001`) or local workstations (`uid=1000` / `501`) without an existing `node_modules` folder, `pnpm install` aborts with `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR` (`Failed to create virtual store slot directory at "/app/.../node_modules/.pnpm/...": Permission denied (os error 13)`) or `Failed to write cafs: Failed to create file at "/pnpm/store/v11/files/..."`.

**Why does this happen?**
The hardened official images `sinfallas/base-node-ionic:26` and `sinfallas/base-mobile-appium:26` run by default with `uid=10001(appuser)` and include pre-populated `/pnpm/store/v11/files/*` owned by `10001:10001` (`0755`). If `docker compose run` is invoked without mapping the host `UID:GID`, `uid=10001` cannot write to the bind-mounted checkout (`0755` owned by `1001`/`1000`); conversely, if only `-u "$(id -u):$(id -g)"` is passed without unlocking `/pnpm`, user `1001`/`1000` cannot write to `/pnpm/store/v11` (moreover, `pnpm` v12+ ignores legacy `npm_config_*` variables and honors only `pnpm_config_store_dir`).

**The Solution:**
1. Declare the `pnpm-store-init` micro-service (`chmod -R a+rwX /pnpm`) in `docker-compose.qa.yml` with `depends_on: condition: service_completed_successfully`, alongside `HOME: /tmp` and `pnpm_config_store_dir: /pnpm/store`.
2. Always invoke `docker compose run --rm -u "$(id -u):$(id -g)" <service> ...` in `Makefile` and CI pipelines.
3. In Node.js/CLI tools that resolve the user home directory when `process.env.HOME` is unset (e.g., tests running `delete process.env.HOME` under `UID 1001` on GitHub Actions or OpenShift, where that `UID` has no `/etc/passwd` entry inside the container), never call `os.homedir()` without catching exceptions (`uv_os_homedir returned ENOENT`): always wrap `os.homedir()` in `try/catch` with a deterministic fallback to `os.tmpdir()` (`resolveSafeHomeDir`).

---

## 14. `APPIUM_HOME`, `ADB_SERVER_SOCKET`, and Non-Root Driver Failures in `sinfallas/base-mobile-appium:26`

**Symptom:**
When running mobile tests with `sinfallas/base-mobile-appium:26`, Appium reports missing drivers (`No drivers installed`), WebdriverIO fails to locate pre-baked modules (`Cannot find module 'webdriverio'`), or ADB cannot detect the host emulator (`adb devices` returns empty).

**Why does this happen?**
Under Rule Zero and non-root container hardening (`-u "$(id -u):$(id -g)"` with `HOME=/tmp`), Appium looks for drivers under `$HOME/.appium` instead of the pre-baked `/opt/appium-home` directory unless `APPIUM_HOME` is explicitly preserved, and Node requires `NODE_PATH=/opt/qa11x/node_modules`. Furthermore, `sinfallas/base-mobile-appium:26` operates as a W3C Driver Bridge with no embedded QEMU/KVM emulator (`ANDROID_HOME=/opt/android-sdk`), connecting over TCP to the host ADB server or a remote W3C device farm.

**The Solution:**
1. Preserve the canonical environment variables in `mobile-appium/docker-compose.qa.yml` (`HOME: /tmp`, `APPIUM_HOME: /opt/appium-home`, `ANDROID_HOME: /opt/android-sdk`, `ANDROID_SDK_ROOT: /opt/android-sdk`, `NODE_PATH: /opt/qa11x/node_modules`, `QA_MOBILE_ARTIFACT_DIR: /tmp/qa-11x-mobile-artifacts`).
2. Start the Appium Driver Bridge profile (`--profile appium-live`) and audit installed runtimes/drivers (`uiautomator2`, `xcuitest`) before launching E2E suites:
```bash
# Audit OpenJDK 21, Android ADB, Appium 3, and pre-baked drivers under APPIUM_HOME=/opt/appium-home:
make qa-drivers

# Start the W3C Appium bridge targeting host ADB via ADB_SERVER_SOCKET=tcp:host.docker.internal:5037:
make qa-bridge
```
