---
name: docker-trivy-keydb-hardening
description: >-
  Container hardening guidelines (Trivy HIGH/CRITICAL = 0), KeyDB multi-threaded in-memory engine,
  non-root runtime users, multi-stage Docker builds, and backend performance optimization.
---

# Docker Trivy Hardening & KeyDB Performance Skill

This skill guides the implementation of production-grade Docker containers and ultra-fast in-memory caching engines.
> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

---

## 1. Container Hardening Checklist (Trivy Target = 0)

1. **Non-Root Execution & QA Bind-Mount UID Alignment:**
   - Always run production applications under unprivileged system users (`appuser` with UID 10001 or `node` with UID 1000).
   - In Dockerfile:
     ```dockerfile
     RUN groupadd -g 10001 appgroup && useradd -u 10001 -g appgroup -s /sbin/nologin -d /app appuser
     USER appuser
     ```
   - When reusing a `UID 10001` base image (`sinfallas/base-node-ionic:26`) with host bind mounts (`.:/app`) in ephemeral QA/CI (`docker-compose.qa.yml`), map the caller's UID (`-u "$(id -u):$(id -g)"`), set `HOME=/tmp` + `pnpm_config_store_dir=/pnpm/store`, and unlock pre-seeded named volumes via a one-shot init service (`chmod -R a+rwX /pnpm`) to avoid `os error 13` on GitHub Actions (`UID 1001`) and developer hosts (`UID 1000`/`501`).
2. **Multi-Stage Builds, Lockfile Determinism & Built-Image Smoke Test (`QA-DOCKER-LOCK-01`):**
   - Separate build-time dependencies (compilers, headers, dev dependencies) from the final runtime image to minimize attack surface and image size.
   - Install runtime dependencies strictly from the project's lockfile (`uv sync --frozen --no-dev`, `uv export --frozen --no-dev | uv pip install --system -r -`, `pnpm install --frozen-lockfile`, `npm ci`, `composer install --no-dev`), never from duplicated hand-written package lists in `Dockerfile`.
   - Smoke-test every built image in CI before release (`docker run --rm <img> python -c "import <app>"`, `test "$(id -u)" != "0"`, and an unauthenticated `401` probe on protected endpoints).
3. **Security Profiles, Read-Only Root Filesystem & Capabilities:**
   - Drop all unnecessary Linux capabilities (`cap_drop: [ALL]`, adding back only strictly required ones).
   - Enforce `security_opt: ["no-new-privileges:true"]`, default `seccomp` profile (`RuntimeDefault`), and `read_only: true` root filesystems (mounting `/tmp` or `/run` as `tmpfs:size=64M,noexec,nosuid,nodev` and restricting writes exclusively to dedicated data volumes).
   - When a `read_only: true` container requires writable cache/state dirs outside `/tmp` or `/run` (e.g., `/app/.wrangler` for Wrangler v4 `saveToConfigCache`), pre-create them in the `Dockerfile` (`mkdir -p /app/.wrangler && chown ...`) and mount them as `tmpfs` with `mode=1777,noexec,nosuid,nodev` (`QA-DOCKER-TTY-01`).
4. **Shift-Left Vulnerability Scans, CycloneDX SBOM & Artifact Integrity (DISA STIG & OWASP):**
   - Execute `./scripts/auditar-infra.sh` (`aquasec/trivy:0.76.2` `trivy config` on Dockerfiles/Compose manifests + `trivy fs --exit-code 1 --severity HIGH,CRITICAL .`) ensuring 0 unresolved findings.
   - Generate **OWASP CycloneDX SBOM/CBOM (ECMA-424)** (`cyclonedx-py` / `@cyclonedx/cyclonedx-npm`) and verify SHA-256 cryptographic hashes/signatures of release deliverables (`APSC-DV-001430`, `APSC-DV-003140`).
   - Remove deprecated or superseded software components upon upgrade (`APSC-DV-002600`) and monitor audit log storage to alert at **75% capacity** (`APSC-DV-001090`).

---

## 2. In-Memory Engine: KeyDB Multi-Threaded

When deploying cache, rate-limiting, idempotency locks (`idemp:{tenant_id}:{user_id}:{key}`), session concurrency limits (`APSC-DV-000010`), role-based idle timeouts (`10m` admin / `15m` standard, `APSC-DV-000070/000080`), 3-attempt/15m account lockouts (`APSC-DV-000530`), anti-data-mining rate quotas (`APSC-DV-000450`), or WebSocket pub/sub:
- **Default Choice:** `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch)
- **Rationale:** KeyDB is a drop-in multi-threaded Redis alternative yielding 3× to 5× higher throughput on multi-core servers with lower tail latency.
- **Production Hardening & OOM Guardrails:**
  - Always cap `--maxmemory` to **~75–80% of the container memory limit** to leave headroom for KeyDB fragmentation/buffers and prevent Linux kernel OOM-killer terminations.
  - Enable `--protected-mode yes`, require strong authentication (`requirepass` / ACLs), and disable destructive administrative commands in production (`--rename-command FLUSHALL ""`, `--rename-command FLUSHDB ""`, `--rename-command CONFIG ""`, `--rename-command DEBUG ""`).
- **Recommended Configuration:**
  ```yaml
  redis:
    image: eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac
    user: "999:999"
    mem_limit: 384m
    read_only: true
    tmpfs:
      - /tmp:size=32M,noexec,nosuid,nodev
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      REDISCLI_AUTH: "${KEYDB_PASSWORD}"
    # Mount a 0400 keydb.conf (containing requirepass / ACLs) rather than passing secrets in argv (maxmemory 256mb <= 75% of 384m)
    volumes:
      - ./deploy/keydb.conf:/etc/keydb/keydb.conf:ro
    command:
      - keydb-server
      - /etc/keydb/keydb.conf
      - --dir
      - /tmp
      - --server-threads
      - "2"
      - --appendonly
      - "no"
      - --save
      - ""
      - --protected-mode
      - "yes"
      - --maxmemory
      - 256mb
      - --maxmemory-policy
      - volatile-lru
      - --tcp-keepalive
      - "300"
      - --rename-command
      - FLUSHALL
      - ""
      - --rename-command
      - FLUSHDB
      - ""
      - --rename-command
      - CONFIG
      - ""
      - --rename-command
      - DEBUG
      - ""
    healthcheck:
      test: ["CMD-SHELL", "keydb-cli ping | grep -q PONG"]
      interval: 5s
      timeout: 3s
      retries: 5
  ```
