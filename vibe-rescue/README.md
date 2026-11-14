# 🛡️ Blueprint Vibe-to-Enterprise — Rescate y Endurecimiento QA-11X (`vibe-rescue/`)

Protocolo determinista de **5 etapas** diseñado para convertir prototipos *vibe-coded* generados con **Bolt.new, Lovable, v0 o Replit Agent** en sistemas corporativos alineados con **QA-11X, DISA ASD STIG V6R5 y OWASP v4.2**, **sin destruir la experiencia visual (UX) validada**.

---

## 1. Filosofía: *Preserve UX, Eradicate Structural Debt*

Los prototipos generados por IA entregan interfaces funcionales en minutos, pero suelen introducir cinco familias de deuda crítica: secretos de servicio expuestos en el bundle cliente, políticas SQL abiertas (`USING (true)`), escape de tipos (`: any`, `@ts-ignore`), componentes monolíticos (`> 500` líneas) y ausencia total de red de pruebas en contenedores no-root (`Rule Zero`).

---

## 2. Protocolo de 5 Etapas y Matriz de Reglas (`VIBE-SEC-001` .. `VIBE-QA-005`)

| Regla | Etapa | Severidad | Vector Detectado en Prototipos Vibe | Remediación Estándar 11X |
| :--- | :--- | :--- | :--- | :--- |
| `VIBE-SEC-001` | **Etapa 1: Triaje Forense y Cuarentena de Secretos** | `CRITICAL` | Variables cliente (`VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `REACT_APP_*`) con `SERVICE_ROLE`, `SECRET`, `PRIVATE`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`; literales de API keys; o `.env` sin exclusión en `.gitignore`. | Mover llaves a BFF/API en servidor con Vault AES-256-GCM, rotar credenciales filtradas (`<EXAMPLE_REDACTED>`) y sanear `.env.example`. |
| `VIBE-RLS-002` | **Etapa 2: PostgreSQL 15–17+ RLS y RBAC de Servicio** | `CRITICAL` | Políticas SQL `USING (true)` / `WITH CHECK (true)`, tablas `CREATE TABLE` multi-tenant sin `ENABLE` + `FORCE ROW LEVEL SECURITY`, `BYPASSRLS`, o uso de `service_role` / `supabaseAdmin` en cliente. | Aplicar `vibe-rescue/templates/rls_hardening.sql` (rol `NOBYPASSRLS`, `FORCE ROW LEVEL SECURITY`, función `SECURITY DEFINER` y cadena WORM `seq_num`). |
| `VIBE-TYPE-003` | **Etapa 3: Tipado Estricto y Fronteras Validadas** | `HIGH` | Abuso de `: any` / `as any`, `@ts-ignore`, `@ts-nocheck`, `# type: ignore`, `"strict": false` en `tsconfig.json` o rutas mutadoras (`POST`/`PUT`/`PATCH`/`DELETE`) sin `Idempotency-Key`. | Activar `strict: true`, validar payloads con Zod `.strict()` / Pydantic `extra="forbid"`, normalización `NFKC` e `Idempotency-Key`. |
| `VIBE-ARCH-004` | **Etapa 3: Descomposición Modular (`CC <= 5`)** | `MEDIUM` | Componentes, páginas o controladores monolíticos que superan el umbral configurable (`> 500` líneas). | Extraer hooks/stores de dominio y widgets presentacionales (`CC <= 5`) conservando layout in-flow y tokens visuales (`refactoring-ui`). |
| `VIBE-QA-005` | **Etapa 4: Regla Cero y Red de Pruebas (`>= 95%`)** | `HIGH` | Ausencia total de archivos de prueba (`tests/`, `*.test.*`, `*.spec.*`), esperas fijas (`waitForTimeout`, `time.sleep`) o `Dockerfile` con `USER root` / etiqueta `:latest` sin digest. | Encapsular en `sinfallas/base-python-uv:3.15` o `sinfallas/base-node-ionic:26` no-root, eliminar sleeps fijos y exigir cobertura `>= 95%`. |
| *(Cierre)* | **Etapa 5: Sellado de Gobernanza (`QA-GIT-GATE-01`)** | `INFO` | Repositorio rescatado sin conector *Thin-Repo* ni cierre certificado. | Ejecutar `make sync-governance`, `./.agents/scripts/certify_task_completion.sh` (`10/10`) y commit local (sin `git push` automático). |

---

## 3. Ejecución Bajo Regla Cero (`vibe-rescue/audit_vibe_prototype.py`)

El auditor CLI está implementado en **Python 3 stdlib puro** (`CC <= 5`, `mypy --strict`, modo `--dry-run` seguro por defecto y redacción automática como `[REDACTED_SECRET]`). Ejecútalo siempre dentro de `sinfallas/base-python-uv:3.15` como usuario no-root:

```bash
# Auditoría en modo dry-run (Pass-Quiet si está limpio; Fail-Verbose si requiere rescate)
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$(pwd):/app:ro" -w /app \
  sinfallas/base-python-uv:3.15 \
  python3 vibe-rescue/audit_vibe_prototype.py --target /app --json

# Generar bundle de remediación en un subdirectorio sin sobrescribir código existente
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$(pwd):/app" -w /app \
  sinfallas/base-python-uv:3.15 \
  python3 vibe-rescue/audit_vibe_prototype.py \
    --target /app --no-dry-run --emit-remediation qa11x-rescue --enforce
```

### Marcadores Seguros de Configuración

Nunca incluyas secretos reales en documentación ni plantillas; utiliza marcadores explícitos:

```env
OPENAI_API_KEY=<EXAMPLE_REDACTED>
SUPABASE_SERVICE_ROLE_KEY=<EXAMPLE_REDACTED>
```

---

## 4. Plantilla SQL `vibe-rescue/templates/rls_hardening.sql`

`vibe-rescue/templates/rls_hardening.sql` provee DDL idempotente para PostgreSQL 15–17+:

1. **Rol `app_runtime_user`** con `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
2. **Revocación de `PUBLIC`/`anon`/`authenticated`** y eliminación (`DROP POLICY IF EXISTS`) de políticas abiertas heredadas de scaffolds Supabase.
3. **`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`** y política `tenant_isolation_policy` vinculada a `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.
4. **Función pre-auth `resolve_tenant_by_slug`** (`SECURITY DEFINER`, `SET search_path = public`) y tabla inmutable **`audit_log_worm`** (`seq_num BIGINT` monotónico, trigger anti-`UPDATE`/`DELETE` y serialización por inquilino con `pg_advisory_xact_lock`).

---

## 5. Consumo Programático vía Servidor MCP

- **Tool MCP:** `audit_vibe_prototype` (`mcp-server/src/tools/auditVibePrototype.ts`) — ejecuta la inspección de las 5 reglas desde el agente con contención estricta contra *Path Traversal*, `dryRun: true` por defecto, redacción `[REDACTED_SECRET]` y salida `Pass-Quiet` / `Fail-Verbose`.
- **Recurso MCP:** `blueprint://vibe-rescue/readme` (`mcp-server/src/resources/stackBlueprints.ts`) — expone esta guía operativa directamente al contexto del agente.
