---
name: docker-trivy-keydb-hardening
description: >-
  Container hardening guidelines (Trivy HIGH/CRITICAL = 0), KeyDB multi-threaded in-memory engine,
  non-root runtime users, multi-stage Docker builds, and backend performance optimization.
---

# Docker Trivy Hardening & KeyDB Performance Skill

This skill guides the implementation of production-grade Docker containers and ultra-fast in-memory caching engines.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Container Hardening Checklist (Trivy Target = 0)

1. **Non-Root Execution:**
   - Always run applications under unprivileged system users (`appuser` with UID 10001 or `node` with UID 1000).
   - In Dockerfile:
     ```dockerfile
     RUN groupadd -g 10001 appgroup && useradd -u 10001 -g appgroup -s /sbin/nologin -d /app appuser
     USER appuser
     ```
2. **Multi-Stage Builds:**
   - Separate build-time dependencies (compilers, headers, dev dependencies) from the final runtime image to minimize attack surface and image size.
3. **Security Profiles & Capabilities:**
   - Drop unnecessary Linux capabilities (`cap_drop: [ALL]`, keep only required capabilities).
   - Add `no-new-privileges: true` to prevent privilege escalation.
4. **Vulnerability Scans:**
   - Execute `./auditar-infra.sh` or `trivy fs --severity HIGH,CRITICAL .` ensuring 0 unresolved vulnerabilities.

---

## 2. In-Memory Engine: KeyDB Multi-Threaded

When deploying cache, rate-limiting, idempotency locks, or WebSocket pub/sub:
- **Default Choice:** `eqalpha/keydb:alpine`
- **Rationale:** KeyDB is a drop-in multi-threaded Redis alternative that can yield 3x to 5x higher throughput on multi-core servers.
- **Recommended Configuration:**
  ```yaml
  redis:
    image: eqalpha/keydb:alpine
    command: >
      keydb-server
      --server-threads 2
      --appendonly no
      --save ""
      --maxmemory 256mb
      --maxmemory-policy volatile-lru
    healthcheck:
      test: ["CMD-SHELL", "keydb-cli ping | grep PONG"]
      interval: 5s
      timeout: 3s
      retries: 5
  ```
