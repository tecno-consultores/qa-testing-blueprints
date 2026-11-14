# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit lint-workflows lint-docs sync-governance validate-calm test test-mcp test-example test-karate test-py test-meta-qa test-ai-offline test-frontend-blueprints test-backend-blueprints audit-llm lint build certify publish-mcp publish-mcp-dry

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean           - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean        - Alias canónico de make clean"
	@echo "  make audit           - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make lint-workflows  - Valida sintaxis YAML sin claves duplicadas, permissions, timeouts y secretos en workflows"
	@echo "  make lint-docs       - Valida invariantes documentales, consistencia de roadmap y guardia QA-GIT-GATE-01"
	@echo "  make sync-governance - Sincroniza determinísticamente SHA-256 en manifest.json y valida presupuestos cognitivos"
	@echo "  make validate-calm   - Valida arquitectura como código FINOS CALM y controles 11X en Docker efímero"
	@echo "  make test            - Ejecuta Vitest (>=95%), E2E example/, Karate BDD, Pytest, Meta-QA, AI Offline y Frontend"
	@echo "  make test-ai-offline - Ejecuta contratos deterministas RAG/Agentes (>=95% cob., ruff CC<=5, mypy) 100% offline"
	@echo "  make test-frontend-blueprints - Valida Screenplay TS estricto en vue3/react-frontend y linter QA-UI-ANTI-001..005"
	@echo "  make test-backend-blueprints  - Valida contratos Pact V4 (FastAPI->Node), k6 smoke y antipatrones"
	@echo "  make audit-llm       - Ejecuta auditoría probabilística DeepEval + Promptfoo OWASP (requiere API key o Ollama/vLLM)"
	@echo "  make test-meta-qa    - Audita scripts de .agents/scripts/ contra fixtures trimodales en Docker efímero"
	@echo "  make test-example    - Certifica las 12 tools, 9 resources y 3 CLI sobre mcp-server/example/ (Clean-Room Docker)"
	@echo "  make lint            - Ejecuta verificación de tipos y linters (ESLint --max-warnings 0, TypeScript)"
	@echo "  make build           - Compila la distribución de producción del Servidor MCP"
	@echo "  make publish-mcp     - Publica de forma autónoma el Servidor MCP en npmjs usando credenciales de .env"
	@echo "  make publish-mcp-dry - Simula empaquetado y validación previa de publicación (--dry-run)"
	@echo "  make certify         - Ejecuta el gate de certificación 11X (.agents/scripts/certify_task_completion.sh)"

clean:
	@./scripts/limpieza.sh

qa-clean: clean

audit:
	@./scripts/auditar-infra.sh

lint-workflows:
	@py=$$(printf '%s\n' \
	'import re, shutil, subprocess, sys, yaml' \
	'from pathlib import Path' \
	'class UniqueKeyLoader(yaml.SafeLoader): pass' \
	'def _cm(loader, node, deep=False):' \
	'    seen = set()' \
	'    for kn, _ in node.value:' \
	'        k = loader.construct_object(kn, deep=deep)' \
	'        tok = (type(k), k)' \
	'        if tok in seen:' \
	'            raise yaml.constructor.ConstructorError("mapping", node.start_mark, f"clave duplicada {k!r}", kn.start_mark)' \
	'        seen.add(tok)' \
	'    return yaml.SafeLoader.construct_mapping(loader, node, deep=deep)' \
	'UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _cm)' \
	'files = sorted([*Path(".github/workflows").glob("*.yml"), *Path(".github/workflows").glob("*.yaml")])' \
	'if not files:' \
	'    print("❌ [lint-workflows] No se encontraron workflows en .github/workflows/", file=sys.stderr)' \
	'    sys.exit(1)' \
	'errors = []' \
	'dol, sq = chr(36), chr(39)' \
	'sec_re = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|(?:npm|ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|(?:password|passwd|secret|api_key|token)\s*[=:]\s*[" + sq + r"]?[A-Za-z0-9_/-]{16,}[" + sq + r"]?", re.I)' \
	'ign_re = re.compile(re.escape(dol + "{{") + r"|" + re.escape(dol + "{") + r"|placeholder|example|dummy|TU_TOKEN|changeme", re.I)' \
	'for wf in files:' \
	'    txt = wf.read_text(encoding="utf-8")' \
	'    try: doc = yaml.load(txt, Loader=UniqueKeyLoader)' \
	'    except Exception as exc: errors.append(f"{wf}: {exc}"); continue' \
	'    if not isinstance(doc, dict): errors.append(f"{wf}: raíz YAML inválida"); continue' \
	'    if not doc.get("permissions"): errors.append(f"{wf}: falta permissions:")' \
	'    jobs = doc.get("jobs")' \
	'    if not isinstance(jobs, dict) or not jobs: errors.append(f"{wf}: falta jobs:")' \
	'    else:' \
	'        for jn, jc in jobs.items():' \
	'            tm = jc.get("timeout-minutes") if isinstance(jc, dict) else None' \
	'            if not isinstance(tm, int) or isinstance(tm, bool) or tm <= 0: errors.append(f"{wf}: job {jn!r} sin timeout-minutes > 0")' \
	'    for ln, line in enumerate(txt.splitlines(), 1):' \
	'        if sec_re.search(line) and not ign_re.search(line): errors.append(f"{wf}:{ln}: posible secreto en texto plano")' \
	'action_files = sorted([*Path(".github/actions").glob("*/action.yml"), *Path(".github/actions").glob("*/action.yaml")])' \
	'for af in action_files:' \
	'    txt = af.read_text(encoding="utf-8")' \
	'    try: doc = yaml.load(txt, Loader=UniqueKeyLoader)' \
	'    except Exception as exc: errors.append(f"{af}: {exc}"); continue' \
	'    runs_cfg = doc.get("runs") if isinstance(doc, dict) else None' \
	'    if not isinstance(runs_cfg, dict) or runs_cfg.get("using") != "composite":' \
	'        errors.append(f"{af}: falta runs.using == composite")' \
	'    for ln, line in enumerate(txt.splitlines(), 1):' \
	'        if sec_re.search(line) and not ign_re.search(line): errors.append(f"{af}:{ln}: posible secreto en texto plano")' \
	'if shutil.which("actionlint"):' \
	'    res = subprocess.run(["actionlint", *[str(p) for p in files]], capture_output=True, text=True)' \
	'    if res.returncode != 0: errors.append((res.stdout + res.stderr).strip())' \
	'if errors:' \
	'    for e in errors: print(f"❌ [lint-workflows] {e}", file=sys.stderr)' \
	'    sys.exit(1)' \
	'print(f"✅ [lint-workflows] {len(files)} workflows y {len(action_files)} actions validados sin hallazgos")' \
	); \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 -c "$$py"; \
	else \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:latest python3 -c "$$py"; \
	fi

lint-docs:
	@py=$$(printf '%s\n' \
	'import re, subprocess, sys' \
	'from pathlib import Path' \
	'errors = []' \
	'for script in (".agents/scripts/verify_docs_invariants.py", ".agents/scripts/verify_roadmap_consistency.py"):' \
	'    res = subprocess.run(["python3", script], capture_output=True, text=True)' \
	'    if res.returncode != 0:' \
	'        errors.append((res.stdout + res.stderr).strip() or f"Fallo en {script}")' \
	'gate_rule = Path(".agents/rules/git_closure_gate.md")' \
	'if not gate_rule.is_file() or "QA-GIT-GATE-01" not in gate_rule.read_text(encoding="utf-8"):' \
	'    errors.append(".agents/rules/git_closure_gate.md ausente o sin identificador QA-GIT-GATE-01")' \
	'forbidden_push = re.compile(r"and push to `?git`?|\+\s*`?git push`?|commit and push to git|git commit`?,\s*`?git push|subir siempre los cambios a git|git commit`?\s+y\s+`?git push", re.I)' \
	'for doc in ("AGENTS.md", "AI_MASTER_PROMPT.md"):' \
	'    p = Path(doc)' \
	'    if not p.is_file():' \
	'        errors.append(f"Archivo requerido ausente: {doc}")' \
	'        continue' \
	'    txt = p.read_text(encoding="utf-8")' \
	'    if "QA-GIT-GATE-01" not in txt:' \
	'        errors.append(f"{doc}: falta referencia explícita a QA-GIT-GATE-01")' \
	'    for ln, line in enumerate(txt.splitlines(), 1):' \
	'        if forbidden_push.search(line):' \
	'            errors.append(f"{doc}:{ln}: directiva residual de git push automático obligatorio")' \
	'if errors:' \
	'    for err in errors: print(f"❌ [lint-docs] {err}", file=sys.stderr)' \
	'    sys.exit(1)' \
	'print("✅ [lint-docs] Invariantes documentales, roadmap y guardia git verificados")' \
	); \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 -c "$$py"; \
	else \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:latest python3 -c "$$py"; \
	fi

sync-governance:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/sync_governance.py; \
	else \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/sync_governance.py; \
	fi

validate-calm:
	@./.agents/scripts/validate_calm_architecture.sh

lint:
	@echo "🔍 [Lint] Ejecutando linter y chequeo de tipos en Docker efímero..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -v "$$(pwd)/mcp-server:/app" -v "$$(pwd)/mobile-appium:/mobile-appium:ro" -v "$$(pwd)/vibe-rescue:/vibe-rescue:ro" -v "$$(pwd)/.github:/.github:ro" -w /app sinfallas/base-node-ionic:26 bash -c '[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run lint && pnpm --silent run typecheck'
	@echo "✔ [Lint & Typecheck] 0 errores ni advertencias."

test-mcp:
	@echo "🧪 [Test MCP] Ejecutando pruebas unitarias Vitest (>= 95%) en Docker efímero..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -v "$$(pwd)/mcp-server:/app" -v "$$(pwd)/mobile-appium:/mobile-appium:ro" -v "$$(pwd)/vibe-rescue:/vibe-rescue:ro" -v "$$(pwd)/.github:/.github:ro" -w /app sinfallas/base-node-ionic:26 bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run test:unit && rm -rf coverage .eslintcache"

test-karate:
	@echo "🎭 [Karate BDD] Ejecutando contratos BDD del MCP Server en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1 mvn -B -q clean test

test-py:
	@echo "🐍 [Pytest] Ejecutando pruebas unitarias de gobernanza y manifiesto en Docker efímero..."
	@docker run --rm -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -u "$$(id -u):$$(id -g)" -v "$$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 uv run --with pytest --with pytest-cov pytest --import-mode=importlib tests/*.unit.py -q

test-meta-qa:
	@cmd='ruff check --select E,F,W,I,UP,B,C901,FLY --config "lint.mccabe.max-complexity=5" .agents/scripts/lint_test_antipatterns.py .agents/scripts/select_tests_by_blast_radius.py vibe-rescue/audit_vibe_prototype.py tests/meta_qa/test_antipattern_linter.py && ruff check tests/meta_qa && MYPYPATH=.agents/scripts mypy --strict --cache-dir=/tmp/mypy .agents/scripts/lint_test_antipatterns.py .agents/scripts/select_tests_by_blast_radius.py vibe-rescue/audit_vibe_prototype.py tests/meta_qa/test_antipattern_linter.py && PYTHONPATH=.agents/scripts pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=lint_test_antipatterns --cov-fail-under=95 --cov-report=term-missing tests/meta_qa/test_antipattern_linter.py && PYTHONPATH=.agents/scripts pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=select_tests_by_blast_radius --cov-fail-under=95 --cov-report=term-missing tests/meta_qa/test_governance_scripts.py && PYTHONPATH=.agents/scripts pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=vibe-rescue --cov-fail-under=95 --cov-report=term-missing -k vibe_rescue tests/meta_qa/test_governance_scripts.py && PYTHONPATH=.agents/scripts pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=.agents/scripts --cov-report=term-missing tests/meta_qa/test_governance_scripts.py tests/meta_qa/test_antipattern_linter.py -q'; \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		if ! out=$$(PYTHONDONTWRITEBYTECODE=1 RUFF_CACHE_DIR=/tmp/ruff-cache COVERAGE_FILE=/tmp/.coverage UV_CACHE_DIR=/tmp/uv-cache sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; exit 1; \
		fi; \
	else \
		if ! out=$$(docker run --rm -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; exit 1; \
		fi; \
	fi; \
	lint_cov=$$(printf '%s\n' "$$out" | awk '/lint_test_antipatterns\.py/{for(i=1;i<=NF;i++) if($$i ~ /%$$/){print $$i; exit}}'); \
	blast_cov=$$(printf '%s\n' "$$out" | awk '/select_tests_by_blast_radius\.py/{for(i=1;i<=NF;i++) if($$i ~ /%$$/){print $$i; exit}}'); \
	vibe_cov=$$(printf '%s\n' "$$out" | awk '/audit_vibe_prototype\.py/{for(i=1;i<=NF;i++) if($$i ~ /%$$/){print $$i; exit}}'); \
	summary=$$(printf '%s\n' "$$out" | grep -E '[0-9]+ passed' | tail -n 1 | sed -E 's/^=+ *//; s/ *=+$$//'); \
	echo "✅ [test-meta-qa] Meta-QA + linter + blast-selector + vibe-rescue OK ($${summary:-0 fallos}, cob_linter=$${lint_cov:-N/A}, cob_blast=$${blast_cov:-N/A}, cob_vibe=$${vibe_cov:-N/A})"

test-frontend-blueprints:
	@node_script=$$(printf '%s\n' \
	'import assert from "node:assert/strict";' \
	'import * as VueSP from "/app/vue3/tests/screenplay/Actor.ts";' \
	'import * as ReactSP from "/app/react-frontend/tests/screenplay/Actor.ts";' \
	'import * as VueLoc from "/app/vue3/tests/utils/semanticLocator.ts";' \
	'import * as ReactLoc from "/app/react-frontend/tests/utils/semanticLocator.ts";' \
	'assert.throws(() => VueSP.Actor.named("Bad", { tenantId: "  " }), /tenantId/);' \
	'assert.throws(() => ReactSP.Actor.named("", { tenantId: "t1" }), /name/);' \
	'const makeDriver = (initialUrl: string, textMap: Record<string, string>) => {' \
	'  let url = initialUrl;' \
	'  return {' \
	'    async goto(nextUrl: string) { url = nextUrl; },' \
	'    currentUrl() { return url; },' \
	'    locate(loc: VueSP.SemanticLocator) {' \
	'      const key = loc.strategy === "role" ? `role:$${loc.role}:$${String(loc.name ?? "")}` : loc.strategy === "label" ? `label:$${String(loc.label)}` : loc.strategy === "text" ? `text:$${String(loc.text)}` : `testid:$${loc.testId}`;' \
	'      return {' \
	'        async click() { textMap[`clicked:$${key}`] = "yes"; },' \
	'        async fill(v: string) { textMap[key] = v; },' \
	'        async textContent() { return textMap[key] ?? null; },' \
	'        async isVisible() { return true; },' \
	'      };' \
	'    },' \
	'  };' \
	'};' \
	'const vueDom: Record<string, string> = { "role:status:badge": "OPERACION" };' \
	'const apiLog: Array<Record<string, unknown>> = [];' \
	'const apiPort: VueSP.ApiClientPort = {' \
	'  async send(spec) {' \
	'    apiLog.push({ method: spec.method, path: spec.path, headers: spec.headers });' \
	'    return { status: 200, data: { badge: "OPERACION" } } as never;' \
	'  },' \
	'};' \
	'let intervals = 1;' \
	'const piniaPort: VueSP.PiniaStoreInspectorPort = {' \
	'  storeId: "nocWallboard",' \
	'  readState() { return { nodes: ["edge-1"], status: "OPERACION" }; },' \
	'  activeIntervalCount() { return intervals; },' \
	'  triggerUnmount() { intervals = 0; },' \
	'};' \
	'const operator = VueSP.Actor.named("OpA", { role: "operator", tenantId: "tenant-alpha", permissions: ["noc:mutate"] });' \
	'assert.throws(() => operator.abilityTo(VueSP.CallAnApi), VueSP.MissingAbilityError);' \
	'assert.equal(operator.hasPermission("noc:mutate"), true);' \
	'operator.whoCan(VueSP.BrowseTheWeb.using(makeDriver("/noc", vueDom)), VueSP.CallAnApi.using(apiPort), VueSP.InspectPiniaStore.using(piniaPort));' \
	'await operator.attemptsTo(' \
	'  VueSP.FillField(VueSP.ByLabel("Host"), "edge-01"),' \
	'  VueSP.ClickSemantic(VueSP.ByTestId("save-btn")),' \
	'  VueSP.defineTask("Publicar cambio", async (a) => {' \
	'    const res = await a.abilityTo(VueSP.CallAnApi).request(a, { method: "POST", path: "/api/v1/nodes", body: { id: "edge-01" } });' \
	'    a.remember("lastStatus", res.status);' \
	'  }),' \
	'  VueSP.RefreshView({ path: "/noc" }),' \
	');' \
	'assert.equal(operator.recall<number>("lastStatus"), 200);' \
	'assert.equal(vueDom["label:Host"], "edge-01");' \
	'assert.equal(vueDom["clicked:testid:save-btn"], "yes");' \
	'assert.equal(vueDom["clicked:role:button:/Refrescar/i"], "yes");' \
	'const postHeaders = apiLog[0].headers as Record<string, string>;' \
	'assert.equal(postHeaders["X-Tenant-ID"], "tenant-alpha");' \
	'assert.equal(postHeaders["X-Actor-Role"], "operator");' \
	'assert.ok(postHeaders["Idempotency-Key"] && postHeaders["Idempotency-Key"].length > 8);' \
	'const parity = await operator.asks(VueSP.AntiSiloParityQuestion(VueSP.ByRole("status", "badge"), "/api/v1/status", (d) => String((d as { badge: string }).badge)));' \
	'assert.equal(parity.inSync, true);' \
	'assert.equal(parity.tenantId, "tenant-alpha");' \
	'const dual = await operator.asks(VueSP.VerifyDualRefreshContract({ viewPath: "/wallboard", expectedStateKey: "nodes" }));' \
	'assert.equal(dual.contractSatisfied, true);' \
	'assert.equal(dual.activeIntervalsAfterUnmount, 0);' \
	'assert.equal(await operator.asks(VueSP.TemporalLifecycleQuestion({ startsAtMs: 100, endsAtMs: 200, nowMs: 50 })), "pending");' \
	'assert.equal(await operator.asks(VueSP.TemporalLifecycleQuestion({ startsAtMs: 100, endsAtMs: 200, nowMs: 150 })), "active");' \
	'assert.equal(await operator.asks(VueSP.TemporalLifecycleQuestion({ startsAtMs: 100, endsAtMs: 200, nowMs: 250 })), "expired");' \
	'assert.equal(await operator.asks(VueSP.TemporalLifecycleQuestion({ startsAtMs: 100, endsAtMs: 200, nowMs: 150, cancelled: true })), "expired");' \
	'const batchPartial = await operator.asks(VueSP.InspectBatchExecutionQuestion({ status: 200, data: { results: [{ id: "a", status: "ok" }, { id: "b", status: "failed" }] } }));' \
	'assert.equal(batchPartial.allSucceeded, false);' \
	'assert.deepEqual(batchPartial.failedIds, ["b"]);' \
	'const batchFull = await operator.asks(VueSP.InspectBatchExecutionQuestion({ status: 200, data: { results: [{ id: "a", status: "success" }] } }));' \
	'assert.equal(batchFull.allSucceeded, true);' \
	'assert.equal(Object.isFrozen(operator.getRecordedSteps()), true);' \
	'assert.ok(operator.getRecordedSteps().length >= 8);' \
	'let pending = true;' \
	'const reactActor = ReactSP.Actor.named("AuditorB", { role: "auditor", tenantId: "tenant-beta", permissions: ["audit:read"] });' \
	'assert.throws(() => reactActor.abilityTo(ReactSP.InspectReactState), ReactSP.MissingAbilityError);' \
	'reactActor.whoCan(ReactSP.InspectReactState.using({ isTransitionPending: () => pending, async flushTransitions() { pending = false; }, renderedTenantId: () => "tenant-beta", readHookSnapshot: <T,>(k: string) => ({ hook: k, count: 3 }) as T }));' \
	'await reactActor.attemptsTo(ReactSP.WaitForReactTransition("panel auditoria"));' \
	'const reactReport = await reactActor.asks(ReactSP.VerifyReactTenantIsolation("useAuditTrail"));' \
	'assert.equal(reactReport.tenantIsolated, true);' \
	'assert.equal(reactReport.transitionSettled, true);' \
	'assert.equal((reactReport.hookSnapshot as { count: number }).count, 3);' \
	'const crossTenantActor = ReactSP.Actor.named("AdminC", { role: "admin", tenantId: "tenant-gamma" }).whoCan(ReactSP.InspectReactState.using({ isTransitionPending: () => false, async flushTransitions() {}, renderedTenantId: () => "tenant-beta", readHookSnapshot: () => undefined }));' \
	'assert.equal((await crossTenantActor.asks(ReactSP.VerifyReactTenantIsolation("useAuditTrail"))).tenantIsolated, false);' \
	'const vueTel = new VueLoc.HealingTelemetryCollector();' \
	'const exactVue = VueLoc.resolveSemanticLocator({ intent: "save", role: "button", accessibleName: "Guardar Cambios", landmark: "dialog" }, [{ ref: "btn-0", role: "button", accessibleName: "Guardar Cambios", attributes: { "data-v-a1b2c3": "", "data-teleport": "modal" }, visible: true, bounds: { width: 120, height: 36 } }], { telemetry: vueTel });' \
	'assert.equal(exactVue.strategy, "exact-aria");' \
	'assert.equal(exactVue.score, 1);' \
	'assert.equal(exactVue.healed, false);' \
	'assert.equal("data-v-a1b2c3" in exactVue.cleanAttributes, false);' \
	'assert.equal(vueTel.getRecords().length, 0);' \
	'const tidVue = VueLoc.resolveSemanticLocator({ intent: "publish", role: "button", accessibleName: "Publicar", testId: "pub-btn" }, [{ ref: "zero", role: "button", accessibleName: "Publicar", attributes: {}, visible: true, bounds: { width: 0, height: 20 } }, { ref: "btn-tid", role: "link", accessibleName: "Desplegar ahora", testId: "pub-btn", attributes: {}, visible: true, bounds: { width: 90, height: 32 } }], { telemetry: vueTel });' \
	'assert.equal(tidVue.ref, "btn-tid");' \
	'assert.equal(tidVue.strategy, "testid-fallback");' \
	'assert.equal(tidVue.score, 0.92);' \
	'assert.equal(tidVue.healed, true);' \
	'const synVue = await operator.asks(VueLoc.LocateSemanticTargetQuestion({ intent: "confirm", role: "dialog", accessibleName: "Confirmar Ventana", synonyms: ["Aprobar Operacion"], landmark: "dialog" }, () => [{ ref: "dlg", role: "dialog", accessibleName: "Aprobar Operacion", landmark: "overlay", attributes: { "data-v-teleport": "true" }, visible: true }], { telemetry: vueTel }));' \
	'assert.equal(synVue.strategy, "semantic-synonym");' \
	'assert.equal(synVue.score, 0.9);' \
	'assert.equal(vueTel.getRecords().length, 2);' \
	'const fuzzyReact = ReactLoc.resolveSemanticLocator({ intent: "submit", role: "button", accessibleName: "Guardar Configuracion" }, [{ ref: "busy", role: "button", accessibleName: "Guardar Configuracion", attributes: { "aria-busy": "true" }, visible: true }, { ref: "ready", role: "button", accessibleName: ":r0: Guardar Configuracion", attributes: { id: ":r0:", "aria-labelledby": "«r1a» lbl" }, visible: true, bounds: { width: 100, height: 40 } }]);' \
	'assert.equal(fuzzyReact.ref, "ready");' \
	'assert.equal(fuzzyReact.strategy, "exact-aria");' \
	'assert.equal(fuzzyReact.cleanAttributes["aria-labelledby"], "lbl");' \
	'const jaccardReact = await reactActor.asks(ReactLoc.LocateSemanticTargetQuestion({ intent: "filter", role: "textbox", accessibleName: "Buscar registros por tenant" }, () => [{ ref: "inp", role: "textbox", accessibleName: "Buscar registros de tenant activos", attributes: {}, visible: true }]));' \
	'assert.equal(jaccardReact.strategy, "fuzzy-aria");' \
	'assert.ok(jaccardReact.score >= 0.75 && jaccardReact.score <= 0.9);' \
	'assert.throws(() => ReactLoc.resolveSemanticLocator({ intent: "missing", role: "button", accessibleName: "Nada" }, [{ ref: "hid", role: "button", accessibleName: "Nada", attributes: {}, visible: false }]), (e: unknown) => e instanceof ReactLoc.SemanticLocatorError && e.reason === "no_candidates");' \
	'assert.throws(() => VueLoc.resolveSemanticLocator({ intent: "low", role: "button", accessibleName: "Aprobar Despliegue Global" }, [{ ref: "weak", role: "button", accessibleName: "Aprobar Borrador Local Privado Temporal", attributes: {}, visible: true }]), (e: unknown) => e instanceof VueLoc.SemanticLocatorError && e.reason === "below_min_confidence");' \
	'assert.throws(() => VueLoc.resolveSemanticLocator({ intent: "tie", role: "button", accessibleName: "Exportar Reporte Mensual" }, [{ ref: "c1", role: "button", accessibleName: "Exportar Reporte Anual", attributes: {}, visible: true }, { ref: "c2", role: "button", accessibleName: "Exportar Reporte Diario", attributes: {}, visible: true }]), (e: unknown) => e instanceof VueLoc.SemanticLocatorError && e.reason === "ambiguous_tie");' \
	'console.log("screenplay-and-self-healing-ok");' \
	); \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module ESNext --moduleResolution Bundler --noEmit vue3/tests/screenplay/Actor.ts react-frontend/tests/screenplay/Actor.ts vue3/tests/utils/semanticLocator.ts react-frontend/tests/utils/semanticLocator.ts && \
		printf '%s\n' "$$node_script" > /tmp/verify_screenplay.mts && \
		node /tmp/verify_screenplay.mts >/dev/null && \
		python3 .agents/scripts/lint_test_antipatterns.py vue3 react-frontend; \
	else \
		printf '%s\n' "$$node_script" | docker run --rm -i -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app sinfallas/base-node-ionic:26 sh -c 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module ESNext --moduleResolution Bundler --noEmit vue3/tests/screenplay/Actor.ts react-frontend/tests/screenplay/Actor.ts vue3/tests/utils/semanticLocator.ts react-frontend/tests/utils/semanticLocator.ts && cat > /tmp/verify_screenplay.mts && node /tmp/verify_screenplay.mts >/dev/null' && \
		lint_out=$$(docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/lint_test_antipatterns.py vue3 react-frontend); \
		echo "✅ [test-frontend-blueprints] TS estricto + Screenplay RBAC + Self-Healing DOM (vue3/react) OK | $$lint_out"; \
	fi

test-backend-blueprints:
	@pact_dir=$$(mktemp -d /tmp/qa11x-pacts.XXXXXX); \
	stub_cid=""; \
	log_file=$$(mktemp /tmp/qa11x-backend-bp.XXXXXX.log); \
	cleanup() { \
		if [ -n "$$stub_cid" ]; then docker rm -f "$$stub_cid" >/dev/null 2>&1 || true; fi; \
		rm -rf "$$pact_dir" "$$log_file" 2>/dev/null || true; \
	}; \
	trap cleanup EXIT; \
	stub_script=$$(printf '%s\n' \
		'import http.server, json' \
		'class H(http.server.BaseHTTPRequestHandler):' \
		'    def _send(self, code, payload, extra=None):' \
		'        self.send_response(code)' \
		'        self.send_header("Content-Type", "application/json")' \
		'        for k, v in (extra or {}).items(): self.send_header(k, v)' \
		'        self.end_headers()' \
		'        self.wfile.write(json.dumps(payload).encode())' \
		'    def do_GET(self):' \
		'        self._send(200, {"status": "ok"}) if self.path == "/health" else self._send(404, {"status": "not_found"})' \
		'    def do_POST(self):' \
		'        _ = self.rfile.read(int(self.headers.get("Content-Length", "0")))' \
		'        key = self.headers.get("Idempotency-Key", "")' \
		'        if self.path == "/api/v1/reservations": self._send(201, {"reservationId": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "status": "CONFIRMED", "unitPrice": "149.95"}, {"Idempotency-Key": key})' \
		'        elif self.path == "/api/v1/reservations/batch": self._send(200, {"results": [{"sku": "ROUTER-CCR2004", "status": "SUCCEEDED"}, {"sku": "SWITCH-CRS326", "status": "SUCCEEDED"}]}, {"Idempotency-Key": key})' \
		'        else: self._send(404, {"error": "unknown"})' \
		'    def log_message(self, *a): pass' \
		'http.server.HTTPServer(("127.0.0.1", 18080), H).serve_forever()' \
	); \
	wait_script=$$(printf '%s\n' \
		'import time, urllib.request' \
		'for _ in range(40):' \
		'    try:' \
		'        with urllib.request.urlopen("http://127.0.0.1:18080/health", timeout=1) as r:' \
		'            if r.status == 200: raise SystemExit(0)' \
		'    except Exception:' \
		'        time.sleep(0.05)' \
		'raise SystemExit(1)' \
	); \
	{ \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 -e PACT_OUTPUT_DIR=/pacts -v "$$(pwd):/app:ro" -v "$$pact_dir:/pacts" -w /app sinfallas/base-python-uv:3.15 sh -c 'ruff check --select E,F,W,I,UP,B,C901,FLY --config "lint.mccabe.max-complexity=5" fastapi/tests/contracts/test_pact_consumer.py && mypy --strict --cache-dir=/tmp/mypy fastapi/tests/contracts/test_pact_consumer.py && pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=fastapi/tests/contracts --cov-fail-under=95 --cov-report=term-missing fastapi/tests/contracts/test_pact_consumer.py' && \
		test -s "$$pact_dir/fastapi-billing-consumer-node-inventory-provider.json" && \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_PATH=/opt/qa11x/node_modules -e PACT_OUTPUT_DIR=/pacts -v "$$(pwd):/app:ro" -v "$$pact_dir:/pacts:ro" -w /app sinfallas/base-node-ionic:26 sh -c 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module NodeNext --moduleResolution NodeNext --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit node-backend/tests/contracts/provider.pact.test.ts && node --test node-backend/tests/contracts/provider.pact.test.ts' && \
		stub_cid=$$(docker run -d --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 sinfallas/base-python-uv:3.15 python3 -c "$$stub_script") && \
		docker exec "$$stub_cid" python3 -c "$$wait_script" && \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e K6_PROFILE=smoke -e API_BASE_URL=http://127.0.0.1:18080 -e K6_SUMMARY_PATH=/pacts/k6-summary.json --network "container:$$stub_cid" -v "$$(pwd)/fastapi/tests/load:/load:ro" -v "$$pact_dir:/pacts" grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276 run -q /load/smoke.k6.js && \
		test -s "$$pact_dir/k6-summary.json" && \
		grep -q '"thresholdsPassed": true' "$$pact_dir/k6-summary.json" && \
		docker rm -f "$$stub_cid" >/dev/null 2>&1 && stub_cid="" && \
		docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/lint_test_antipatterns.py fastapi/tests/contracts node-backend/tests/contracts; \
	} >"$$log_file" 2>&1 || { cat "$$log_file" >&2; exit 1; }; \
	cov=$$(awk '/TOTAL /{print $$NF}' "$$log_file" | tail -n 1); \
	echo "✅ [test-backend-blueprints] Pact V4 (FastAPI->Node) + k6 smoke + antipatrones OK (cobertura_pact=$${cov:-N/A})"

test-example:
	@./scripts/probar-mcp-example.sh

test-ai-offline:
	@cmd='ruff check --select E,F,W,I,UP,B,C901 --config "lint.mccabe.max-complexity=5" ai-evals tests/evals && MYPYPATH=ai-evals mypy --strict --cache-dir=/tmp/mypy ai-evals/golden_from_traces.py ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py tests/evals/test_skill_adherence.py && PYTHONPATH=ai-evals pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function -W "ignore::DeprecationWarning:deepeval.*" -W "ignore:.*HallucinationMetric.*:DeprecationWarning" -W "ignore::SyntaxWarning:deepeval.*" --import-mode=importlib --cov=ai-evals --cov=tests/evals --cov-fail-under=95 --cov-report=term-missing ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py tests/evals/test_skill_adherence.py'; \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		if ! out=$$(PYTHONDONTWRITEBYTECODE=1 RUFF_CACHE_DIR=/tmp/ruff-cache COVERAGE_FILE=/tmp/.coverage UV_CACHE_DIR=/tmp/uv-cache DEEPEVAL_TELEMETRY_OPT_OUT=YES sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; exit 1; \
		fi; \
	else \
		if ! out=$$(docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e DEEPEVAL_TELEMETRY_OPT_OUT=YES -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; exit 1; \
		fi; \
	fi; \
	cov=$$(printf '%s\n' "$$out" | awk '/^TOTAL /{print $$NF}' | tail -n 1); \
	summary=$$(printf '%s\n' "$$out" | grep -E '[0-9]+ passed' | tail -n 1 | sed -E 's/^=+ *//; s/ *=+$$//'); \
	echo "✅ [test-ai-offline] Contratos RAG/Voz/OCR/Skills OK ($${summary:-ok}, cobertura=$${cov:-N/A})"

audit-llm:
	@if [ -z "$${OPENAI_API_KEY:-}$${GEMINI_API_KEY:-}$${ANTHROPIC_API_KEY:-}$${OLLAMA_BASE_URL:-}$${OPENAI_API_BASE:-}" ]; then \
		echo "⚠️ [SKIPPED/MISSING_LLM_CREDENTIALS] Sin proveedor LLM configurado (exporte OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_BASE_URL u OPENAI_API_BASE)." >&2; \
		exit 2; \
	fi
	@echo "🤖 [audit-llm] Ejecutando evaluación DeepEval en sinfallas/base-python-uv:3.15..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e DEEPEVAL_TELEMETRY_OPT_OUT=YES -e QA_LLM_AUDIT_LIVE=1 -e PYTHONPATH=ai-evals -e OPENAI_API_KEY -e GEMINI_API_KEY -e ANTHROPIC_API_KEY -e OLLAMA_BASE_URL -e OPENAI_API_BASE -e QA_LLM_MODEL -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 pytest -o cache_dir=/tmp/pytest-cache -o asyncio_default_fixture_loop_scope=function --import-mode=importlib ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py tests/evals/test_skill_adherence.py -k "live"
	@echo "🛡️ [audit-llm] Ejecutando matrices Promptfoo OWASP LLM Top 10 y Skills en sinfallas/base-node-ionic:26..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PROMPTFOO_DISABLE_TELEMETRY=1 -e PROMPTFOO_CONFIG_DIR=/tmp/.promptfoo -e OPENAI_API_KEY -e GEMINI_API_KEY -e ANTHROPIC_API_KEY -e OLLAMA_BASE_URL -e OPENAI_API_BASE -v "$$(pwd):/app:ro" -w /app sinfallas/base-node-ionic:26 sh -c "promptfoo eval -c ai-evals/promptfooconfig.yaml --no-cache -o /tmp/promptfoo-results.json && promptfoo eval -c tests/evals/promptfoo_skills_matrix.yaml --no-cache -o /tmp/promptfoo-skills-results.json"

test: test-mcp test-example test-karate test-py test-meta-qa test-ai-offline test-frontend-blueprints test-backend-blueprints

build:
	@echo "📦 [Build] Compilando Servidor MCP en Docker efímero..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run build"
	@echo "✔ [Build] Servidor MCP compilado en mcp-server/dist/."

publish-mcp:
	@./scripts/publicar-mcp.sh

publish-mcp-dry:
	@./scripts/publicar-mcp.sh --dry-run

certify:
	@./.agents/scripts/certify_task_completion.sh
