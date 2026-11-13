# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit lint-workflows lint-docs sync-governance test test-mcp test-example test-karate test-py lint build certify publish-mcp publish-mcp-dry

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean           - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean        - Alias canónico de make clean"
	@echo "  make audit           - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make lint-workflows  - Valida sintaxis YAML sin claves duplicadas, permissions, timeouts y secretos en workflows"
	@echo "  make lint-docs       - Valida invariantes documentales, consistencia de roadmap y guardia QA-GIT-GATE-01"
	@echo "  make sync-governance - Sincroniza determinísticamente SHA-256 en manifest.json y valida presupuestos cognitivos"
	@echo "  make test            - Ejecuta Vitest (>=95%), E2E example/, Karate BDD y Pytest en contenedores efímeros Docker"
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
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app sinfallas/base-python-uv:latest python3 -c "$$(printf '%s\n' \
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
	'if shutil.which("actionlint"):' \
	'    res = subprocess.run(["actionlint", *[str(p) for p in files]], capture_output=True, text=True)' \
	'    if res.returncode != 0: errors.append((res.stdout + res.stderr).strip())' \
	'if errors:' \
	'    for e in errors: print(f"❌ [lint-workflows] {e}", file=sys.stderr)' \
	'    sys.exit(1)' \
	'print(f"✅ [lint-workflows] {len(files)} workflows validados sin hallazgos")' \
	)"

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
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/sync_governance.py

lint:
	@echo "🔍 [Lint] Ejecutando linter y chequeo de tipos en Docker efímero..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c '[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run lint && pnpm --silent run typecheck'
	@echo "✔ [Lint & Typecheck] 0 errores ni advertencias."

test-mcp:
	@echo "🧪 [Test MCP] Ejecutando pruebas unitarias Vitest (>= 95%) en Docker efímero..."
	@docker run --rm -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run test:unit && rm -rf coverage .eslintcache"

test-karate:
	@echo "🎭 [Karate BDD] Ejecutando contratos BDD del MCP Server en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1 mvn -B -q clean test

test-py:
	@echo "🐍 [Pytest] Ejecutando pruebas unitarias de gobernanza y manifiesto en Docker efímero..."
	@docker run --rm -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -u "$$(id -u):$$(id -g)" -v "$$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 uv run --with pytest --with pytest-cov pytest --import-mode=importlib tests/*.unit.py -q

test-example:
	@./scripts/probar-mcp-example.sh

test: test-mcp test-example test-karate test-py

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
