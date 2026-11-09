# Reference 09: SRE Observability (RED Metrics), Pumba Chaos Engineering & Autonomous Incident Triage

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE (0 Prompt Overhead until loaded)**  
> Load this reference ONLY when implementing Prometheus/OpenTelemetry metrics (Layer 12), executing Pumba chaos & Locust/Artillery load profiles (Layer 13), tuning heavy-transfer/batch resiliency, or performing Root Cause Analysis (RCA) on production/UAT incidents.

---

## 1. Layer 12: Universal RED Telemetry & Distributed Trace Correlation

Before running load or chaos experiments, every backend service MUST expose the three **RED metrics** at `/metrics` (or via Prometheus `Pushgateway` for batch/CLI jobs):

1. **Rate:** `http_requests_total{method, route, status_code, tenant_id}` (Counter).
2. **Errors:** `http_errors_total{method, route, exception_type}` and `external_integration_failures_total{target, reason}` (Counter).
3. **Duration:** `http_request_duration_seconds_bucket{method, route, le}` (Histogram configured with SLO buckets: `0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 30.0, 180.0`).
4. **Trace & Audit Correlation (`trace_id`):** Inject `X-Trace-Id` / W3C `traceparent` into every request context, structured JSON log line, and HMAC-SHA256 `AuditLog` record (`APSC-DV-001350`) so any latency spike or 5xx alert maps deterministically to the exact execution path.

---

## 2. Layer 13: Pumba Chaos Engineering & Load Resilience (`docker-compose.qa.yml`)

Chaos experiments validate that the system degrades gracefully without unhandled `HTTP 500` errors, data corruption, or connection-pool deadlocks when infrastructure fails under load (Locust / Artillery):

```bash
# 1. Network Latency & Jitter Injection (300ms ± 100ms on DB/KeyDB for 30s)
docker run -d --rm -v /var/run/docker.sock:/var/run/docker.sock gaiaadm/pumba \
  netem --duration 30s --tc-image gaiadocker/iproute2 delay --time 300 --jitter 100 --correlation 20 re2:.*(postgres|redis).*

# 2. Packet Loss Simulation (15% packet loss on external/router gateway)
docker run -d --rm -v /var/run/docker.sock:/var/run/docker.sock gaiaadm/pumba \
  netem --duration 20s --tc-image gaiadocker/iproute2 loss --percent 15 re2:.*api.*

# 3. Process Freeze / GC Pause Simulation (SIGSTOP/SIGCONT for 5s)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock gaiaadm/pumba \
  pause --duration 5s re2:.*redis.*
```

### Mandatory Resilience Invariants Under Chaos
- **Circuit Breaking & Graceful Fallback:** If KeyDB/Redis or an external device is unreachable, return structured degraded status (`HTTP 503` with `Retry-After` or cached/degraded telemetry payload) — never an uncaught stack trace (`HTTP 500`).
- **Connection Pool Self-Healing:** Configure SQLAlchemy `pool_pre_ping=True`, `pool_recycle=1800`, and explicit connect/command timeouts so dropped TCP sockets recover automatically once Pumba restores the network.
- **Frontend Anti-Destructive Catch:** UI stores (`Pinia` / `Zustand`) catching a network/503 error during background polling MUST preserve the last known valid state on screen and surface a non-blocking toast/banner rather than wiping tables or maps to empty arrays.

---

## 3. Heavy-Transfer Timeouts (`>= 180s`), Zero-Byte Purge & Batch Per-Item Validation

1. **Telemetry vs. Binary Transfer Timeout Separation:**
   - Standard API/telemetry calls use short timeouts (`5s–10s`).
   - Synchronous package, firmware, or backup transfers (e.g. `20+ MB` `.npk` / `.tar.gz` archives) MUST accept and pass an explicit per-request timeout override (`timeout >= 180.0`), verify downloaded file size `> 0`, and purge truncated `0-byte` files before/after failed transfers.
2. **Batch `HTTP 200 OK` Per-Item Inspection:**
   - Bulk endpoints (`POST .../execute`, `POST .../batch`) returning `HTTP 200 OK` with per-resource statuses (`results: [{id, status: "SUCCESS" | "FAILED", error}]`) MUST be validated item-by-item in both backend services and frontend views across *Full Success*, *Partial Failure*, and *Total Failure*.

---

## 4. Autonomous Incident Triage & Post-Mortem Evolution Playbook

When diagnosing a production/UAT failure or test escape:
1. **Isolate via AST Blast Radius:** Run `python3 .agents/scripts/inspect_blast_radius.py "<failing_symbol>"` to map all upstream callers and downstream dependencies without reading unrelated files.
2. **Reproduce Before Patching (Anti-Mock Blindness):** Write a failing unit + integration/BDD test reproducing the exact payload, clock phase (`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`), or serialization type (`Decimal`, `UUID`, `datetime`) that escaped previous mocks.
3. **Verify in Ephemeral Docker (`Rule Zero`):** Execute the targeted and full stack QA suite in Docker.
4. **Mandatory QA-Escape Evolution:** Present the block `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` in Spanish and invoke `propose_skill_evolution_pr` so the guardrail is permanently codified upstream.
