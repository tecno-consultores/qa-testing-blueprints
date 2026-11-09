# Reference 07: MCP Server, Agentic Tool-Calling & Non-Human Identity (NHI) Security Governance

> **ON-DEMAND PROGRESSIVE DISCLOSURE MODULE (0 Prompt Overhead until loaded)**  
> Load this reference ONLY when designing, auditing, or testing Model Context Protocol (MCP) servers, internal JSON-RPC tool dispatchers, AI agent workflows, or automated infrastructure orchestration tools.

---

## 1. Service-Layer RBAC Defense (Anti-`Depends()` Bypass — `OWASP API5:2023 BFLA` / `APSC-DV-000460`)

### The Vulnerability
In FastAPI (and similar HTTP frameworks), route dependency decorators such as `Depends(require_roles("ADMIN"))` or `Depends(get_current_user)` are evaluated **exclusively by the HTTP router pipeline**. When an internal MCP server, JSON-RPC dispatcher, WebSocket handler, or background worker invokes a Python controller or service function directly (`await execute_router_command(...)`), FastAPI's dependency injection is completely bypassed—leaving `Depends(...)` unevaluated and allowing unprivileged roles (`VIEWER`, `OPERATOR`) to execute privileged mutations.

### Mandatory Defense Pattern
1. **Explicit Service-Layer Role Guard:** Validate `claims["role"]` / `claims["rol"]` at the very beginning of every mutating service function before touching the database, cache, or external devices:
   ```python
   ALLOWED_MUTATION_ROLES = frozenset({"ADMIN", "SUPERADMIN", "NETOPS_LEAD"})

   def assert_service_rbac(claims: dict[str, Any], allowed_roles: frozenset[str] = ALLOWED_MUTATION_ROLES) -> str:
       role = str(claims.get("role") or claims.get("rol") or "").upper()
       if role not in allowed_roles:
           raise PermissionError(f"RBAC Denial: role '{role or 'NONE'}' cannot invoke this service operation.")
       return role
   ```
2. **Never Call HTTP Endpoint Functions from MCP Dispatchers:** MCP tool handlers and background workers MUST call domain service functions that enforce `assert_service_rbac(claims)`, never FastAPI route functions decorated with `Depends()`.

---

## 2. Human-in-the-Loop Approval Gate (`ApprovalRequest` / `AWAITING_APPROVAL`)

Autonomous or agent-triggered tools that mutate production state, network equipment, firewall rules, credentials, or billing records MUST NOT execute immediately upon LLM tool invocation:

1. **Mandatory `ApprovalRequest` Routing:**
   - Any mutating MCP tool (`create_*`, `update_*`, `delete_*`, `execute_*`, `apply_*`, `reboot_*`) MUST persist an `ApprovalRequest` record with status `AWAITING_APPROVAL` (bound to `tenant_id`, `requested_by`, `tool_name`, `payload_hash`, and `expires_at` TTL) and return the pending approval ticket to the caller.
   - Execution occurs ONLY after an authorized human operator approves the request (with Step-Up re-authentication `APSC-DV-001470` for critical actions).
2. **Read-Only vs. Mutating Tool Separation:**
   - Explicitly classify every registered MCP tool with `readOnlyHint: true` vs. `destructiveHint: true` in tool annotations.

---

## 3. Indirect Prompt Injection & MCP Tool Poisoning Defense

When AI agents ingest untrusted external data (device banners, SNMP sysDescr, log lines, webhook payloads, user tickets, or third-party READMEs), malicious instructions embedded in that data can hijack the agent into calling destructive MCP tools:

1. **Input Canonicalization & Control-Char Stripping:** Normalize all tool arguments with Unicode `NFKC` (`APSC-DV-002520`) and reject ASCII control characters (`\x00-\x1f`) and shell metacharacters.
2. **Strict Schema Enforcement (`extra="forbid"` / `.strict()`):** All MCP tool schemas (Zod `.strict()` in TypeScript or Pydantic `ConfigDict(extra="forbid")` in Python) MUST reject undeclared properties.
3. **Untrusted Data Delimiting:** Wrap external telemetry or log outputs returned by MCP tools in explicit untrusted data markers and strip embedded prompt-override directives before returning to the LLM context.
4. **Zero Shell Interpolation (`APSC-DV-002510`):** MCP tools executing system commands MUST use `execFile` / `subprocess.run([...], shell=False)` with strict allowlisted arguments—never string concatenation or `shell=True`.

---

## 4. Non-Human Identity (NHI) & Multi-Tenant Context Isolation

1. **Per-Invocation Tenant Binding:** Every MCP tool invocation MUST extract `tenant_id` from the authenticated caller's cryptographic session/JWT and set `SET LOCAL app.current_tenant_id = :tid` inside the database transaction. Never share a global superuser DB connection across MCP tool calls.
2. **Ephemeral Scoped Credentials:** Agent workers must use short-lived, least-privilege tokens rather than static master API keys.

---

## 5. Mandatory 11X Test Matrix for MCP & Agentic Dispatchers

Every project exposing MCP tools or internal JSON-RPC dispatchers MUST include unit and BDD tests covering:
- [ ] **Direct Unprivileged Service Call (`403` / `PermissionError`):** Invoke the MCP dispatcher and service function directly in Python/TypeScript with `claims={"sub": "...", "role": "VIEWER"}` (bypassing HTTP router) and assert immediate `PermissionError` / `403`.
- [ ] **Mutating MCP Tool Approval Gate:** Invoke a mutating MCP tool with an authorized role and assert it creates an `ApprovalRequest` in `AWAITING_APPROVAL` state instead of mutating the target resource directly.
- [ ] **Cross-Tenant Isolation in MCP Tools:** Verify that an MCP tool invoked under `Tenant A` returns `404` / empty results when querying or mutating a resource UUID belonging to `Tenant B`.
- [ ] **Audit Trail Identity Integrity:** Verify that MCP-initiated actions log the human `actor_username` and `resource_display_name` (never raw UUID v4 `claims.get("sub")`) in `write_audit_log`.
