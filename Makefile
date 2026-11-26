# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit sbom compact-context lint-workflows lint-docs sync-governance version-check validate-calm shellcheck shfmt test test-mcp test-example test-karate test-py test-bats diff-cov pr-verdict test-meta-qa test-ai-offline test-frontend-blueprints test-backend-blueprints test-mobile-blueprints audit-llm audit-psi qa-psi qa-k6 lint build certify publish-mcp publish-mcp-dry publish-mcp-registry publish-mcp-registry-dry

DIRECTIVE_11X_COMPLEXITY_MSG := [DIRECTIVE-11X] Complexity/Signature limit exceeded. Do NOT split into pass-through micro-helpers (>4 params). Read '.agents/skills/tactical-patterns-11x/SKILL.md' (or 'blueprint://skills/tactical-patterns-11x') and apply Table-Driven Dispatch, Parameter Object/DTO, Guard Clauses, or Functional Pipeline.
COMPLEXITY_FAILURE_REGEX := C901|PLR0911|PLR0913|max-params|max-depth|sonarjs/cognitive-complexity|complexity.*[0-9]+|Radon

PY_IMG := sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4
NODE_IMG := sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60
MOBILE_IMG := sinfallas/base-mobile-appium:26@sha256:1bb9e70613a786008fe06c418a557aeaa5fe7c62b3db29a26b4e0ce86d3c6728
BASH_IMG := sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7
ACTIONLINT_IMG := rhysd/actionlint:1.7.7@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9
KARATE_IMG := sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89
K6_IMG := grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean           - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean        - Alias canónico de make clean"
	@echo "  make audit           - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make sbom            - Emite SBOM CycloneDX JSON + SHA-256/HMAC (./scripts/generar-sbom-cyclonedx.sh)"
	@echo "  make compact-context - Ejecuta compactación Zero-LLM en 2 niveles (.agents/scripts/compact_context_11x.py)"
	@echo "  make lint-workflows  - Valida sintaxis YAML sin claves duplicadas, permissions, timeouts y secretos en workflows"
	@echo "  make lint-docs       - Valida invariantes documentales, consistencia de roadmap y guardia QA-GIT-GATE-01"
	@echo "  make sync-governance - Sincroniza determinísticamente SHA-256 en manifest.json y valida presupuestos cognitivos"
	@echo "  make version-check   - Verifica paridad SemVer y edición QA-11X en manifiestos, catálogos y scripts"
	@echo "  make validate-calm   - Valida arquitectura como código FINOS CALM y controles 11X en Docker efímero"
	@echo "  make shellcheck      - Ejecuta ShellCheck (-x) sobre scripts Bash del repositorio en Docker efímero"
	@echo "  make shfmt           - Verifica formato canónico Bash (shfmt -d) en Docker efímero"
	@echo "  make test            - Ejecuta suite integral (lint, docs, version-check, validate-calm, workflows, Bash, MCP, Karate, Pytest, Meta-QA, AI y stacks)"
	@echo "  make test-mcp        - Ejecuta pruebas unitarias Vitest (>=95%) del Servidor MCP en Docker efímero"
	@echo "  make test-karate     - Ejecuta contratos BDD Karate Labs del Servidor MCP en Docker efímero"
	@echo "  make test-py         - Ejecuta pruebas unitarias Python de gobernanza y manifiesto (>=95%) en Docker efímero"
	@echo "  make test-bats       - Ejecuta suites BATS-core y emite Cobertura XML (kcov) en .agents/.cache/coverage/bash.xml"
	@echo "  make test-ai-offline - Ejecuta contratos deterministas RAG/Agentes (>=95% cob., ruff CC<=5, mypy) 100% offline"
	@echo "  make test-frontend-blueprints - Valida Screenplay TS estricto en vue3/react-frontend y linter QA-UI-ANTI-001..005"
	@echo "  make test-backend-blueprints  - Valida contratos Pact V4 (FastAPI->Node), k6 smoke y antipatrones"
	@echo "  make test-mobile-blueprints   - Valida sinfallas/base-mobile-appium:26, TSC estricto, WDIO/Screenplay W3C y antipatrones"
	@echo "  make audit-llm       - Ejecuta auditoría probabilística DeepEval + Promptfoo OWASP (requiere API key o Ollama/vLLM)"
	@echo "  make audit-psi       - Ejecuta auditoría Google PageSpeed Insights v5 post-deploy (URL=https://... [STRATEGY=both] [MIN_PERF=0.90])"
	@echo "  make qa-psi          - Alias de make audit-psi (Lab + CrUX sobre dominio HTTPS público)"
	@echo "  make test-meta-qa    - Audita scripts de .agents/scripts/ contra fixtures trimodales en Docker efímero"
	@echo "  make diff-cov        - Verifica 100% cobertura delta multi-stack, ramas >=90% y bloqueo anti-evasión"
	@echo "  make pr-verdict      - Exporta .agents/artifacts/PR_VERDICT.md y atestación SHA-256/HMAC QA 11X"
	@echo "  make test-example    - Certifica las 19 tools, 13 resources, quickstart y verify-v2.sh Clean-Room Docker"
	@echo "  make lint            - Ejecuta verificación de tipos y linters (ESLint --max-warnings 0, TypeScript)"
	@echo "  make build           - Compila la distribución de producción del Servidor MCP"
	@echo "  make publish-mcp     - Publica de forma autónoma el Servidor MCP en npmjs usando credenciales de .env"
	@echo "  make publish-mcp-dry - Simula empaquetado y validación previa de publicación (--dry-run)"
	@echo "  make publish-mcp-registry     - Publica server.json en el MCP Registry oficial vía Docker efímero (--registry-only)"
	@echo "  make publish-mcp-registry-dry - Valida server.json con mcp-publisher y paridad mcpName sin publicar (--registry-only --dry-run)"
	@echo "  make certify         - Ejecuta el gate de certificación 11X (.agents/scripts/certify_task_completion.sh)"

clean:
	@./scripts/limpieza.sh

qa-clean: clean

audit:
	@./scripts/auditar-infra.sh

sbom:
	@./scripts/generar-sbom-cyclonedx.sh $(if $(OUTPUT),"$(OUTPUT)",)

compact-context:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/compact_context_11x.py $(COMPACT_ARGS); \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app" -w /app $(PY_IMG) python3 .agents/scripts/compact_context_11x.py $(COMPACT_ARGS); \
	fi

lint-workflows:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/lint_workflows.py --workspace . || exit 1; \
		if command -v actionlint >/dev/null 2>&1; then \
			set --; for wf in .github/workflows/*.yml .github/workflows/*.yaml; do [ -e "$$wf" ] && set -- "$$@" "$$wf"; done; \
			[ "$$#" -eq 0 ] || actionlint -color "$$@" || exit 1; \
		else \
			echo "⚠️ [SKIPPED] actionlint no disponible en contenedor aislado"; \
		fi; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/lint_workflows.py --workspace /app || exit 1; \
		set --; for wf in .github/workflows/*.yml .github/workflows/*.yaml; do [ -e "$$wf" ] && set -- "$$@" "$$wf"; done; \
		[ "$$#" -eq 0 ] || docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -v "$$(pwd):/repo:ro" -w /repo $(ACTIONLINT_IMG) -color "$$@" || exit 1; \
	fi

lint-docs:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/lint_docs_gate.py --workspace .; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/lint_docs_gate.py --workspace /app; \
	fi

sync-governance:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/sync_governance.py; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app" -w /app $(PY_IMG) python3 .agents/scripts/sync_governance.py; \
	fi

version-check:
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/bump_version_11x.py --workspace . --check; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/bump_version_11x.py --workspace /app --check; \
	fi

validate-calm:
	@./.agents/scripts/validate_calm_architecture.sh

lint:
	@echo "🔍 [Lint] Ejecutando linter y chequeo de tipos en Docker efímero..."
	@if ! out=$$(docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_OPTIONS="--max-old-space-size=4096" -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_verify_deps_before_run=false -e pnpm_config_manage_package_manager_versions=false -v "$$(pwd)/mcp-server:/app" -v "$$(pwd)/mobile-appium:/mobile-appium:ro" -v "$$(pwd)/vibe-rescue:/vibe-rescue:ro" -v "$$(pwd)/.github:/.github:ro" -v "$$(pwd)/architecture:/architecture:ro" -v "$$(pwd)/.agents:/.agents:ro" -w /app $(NODE_IMG) bash -c 'pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint && pnpm --silent run typecheck' 2>&1); then \
		printf '%s\n' "$$out" >&2; \
		if printf '%s' "$$out" | grep -qE '$(COMPLEXITY_FAILURE_REGEX)'; then printf '\n%s\n' "$(DIRECTIVE_11X_COMPLEXITY_MSG)" >&2; fi; \
		exit 1; \
	fi
	@echo "✔ [Lint & Typecheck] 0 errores ni advertencias."

test-mcp:
	@echo "🧪 [Test MCP] Ejecutando pruebas unitarias Vitest (>= 95%) en Docker efímero..."
	@mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
	@docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_OPTIONS="--max-old-space-size=4096" -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_verify_deps_before_run=false -e pnpm_config_manage_package_manager_versions=false -v "$$(pwd)/mcp-server:/app" -v "$$(pwd)/.agents/.cache/coverage:/cov-out" -v "$$(pwd)/mobile-appium:/mobile-appium:ro" -v "$$(pwd)/vibe-rescue:/vibe-rescue:ro" -v "$$(pwd)/.github:/.github:ro" -v "$$(pwd)/architecture:/architecture:ro" -v "$$(pwd)/.agents:/.agents:ro" -v "$$(pwd)/fastapi:/fastapi:ro" -v "$$(pwd)/python:/python:ro" -v "$$(pwd)/node-backend:/node-backend:ro" -v "$$(pwd)/vue3:/vue3:ro" -v "$$(pwd)/react-frontend:/react-frontend:ro" -v "$$(pwd)/php:/php:ro" -v "$$(pwd)/bash-scripts:/bash-scripts:ro" -v "$$(pwd)/ai-evals:/ai-evals:ro" -w /app $(NODE_IMG) bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run test:unit && if [ -f coverage/lcov.info ]; then sed -E 's|^SF:/app/|SF:mcp-server/|; s|^SF:(src/)|SF:mcp-server/\1|' coverage/lcov.info > /cov-out/mcp-server.info; fi && rm -rf coverage .eslintcache"

test-karate:
	@echo "🎭 [Karate BDD] Ejecutando contratos BDD del MCP Server en Docker efímero..."
	@docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -v "$$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$$(pwd):/repo:ro" $(KARATE_IMG) mvn -B -q clean test

test-py:
	@echo "🐍 [Pytest] Ejecutando pruebas unitarias de gobernanza y manifiesto en Docker efímero..."
	@mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		COVERAGE_FILE=/tmp/.coverage UV_CACHE_DIR=/tmp/uv-cache PYTHONPATH=.agents/scripts:vibe-rescue:. pytest --cov=.agents/scripts --cov=scripts --cov=vibe-rescue --cov-fail-under=95 --cov-branch --cov-report=xml:.agents/.cache/coverage/python.xml tests/*.unit.py tests/meta_qa/test_*.py vibe-rescue/tests/*.unit.py -q; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=.agents/scripts:vibe-rescue:. -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app" -w /app $(PY_IMG) pytest --cov=.agents/scripts --cov=scripts --cov=vibe-rescue --cov-fail-under=95 --cov-branch --cov-report=xml:/app/.agents/.cache/coverage/python.xml tests/*.unit.py tests/meta_qa/test_*.py vibe-rescue/tests/*.unit.py -q; \
	fi

shellcheck:
	@echo "🐚 [ShellCheck] Auditando scripts Bash (-x) en Docker efímero..."
	@docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/repo:ro" -w /repo $(BASH_IMG) bash -c 'shopt -s nullglob; raw=(scripts/*.sh scripts/*.sh.example .agents/scripts/*.sh instalar-hooks.sh */limpieza.sh bash-scripts/*.sh mcp-server/example/verify-v2.sh); if [ "$${#raw[@]}" -gt 0 ]; then mapfile -t files < <(printf "%s\n" "$${raw[@]}" | sort -u); shellcheck -x "$${files[@]}"; fi'
	@echo "✔ [ShellCheck] 0 hallazgos en scripts Bash."

shfmt:
	@echo "📐 [shfmt] Verificando formato Bash (shfmt -i 2 -ci -d) en Docker efímero..."
	@docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/repo:ro" -w /repo $(BASH_IMG) bash -c 'shopt -s nullglob; raw=(scripts/*.sh scripts/*.sh.example .agents/scripts/*.sh instalar-hooks.sh */limpieza.sh bash-scripts/*.sh mcp-server/example/verify-v2.sh); if [ "$${#raw[@]}" -gt 0 ]; then mapfile -t files < <(printf "%s\n" "$${raw[@]}" | sort -u); shfmt -i 2 -ci -d "$${files[@]}"; fi'
	@echo "✔ [shfmt] Formato Bash conforme."

test-bats:
	@echo "🦇 [BATS + kcov] Ejecutando pruebas BATS y generando Cobertura XML en Docker efímero..."
	@mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
	@docker run --rm --restart=no --network none --cap-drop=ALL --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e _USER=qa -v "$$(pwd):/repo:ro" -v "$$(pwd)/.agents/.cache/coverage:/cov-out" -w /repo $(BASH_IMG) python3 -c 'import pathlib, shutil, stat, subprocess, sys; shutil.rmtree("/tmp/kcov-bash", ignore_errors=True); pathlib.Path("/tmp/kcov-env.sh").write_text("if [[ \"$${KCOV_BASH_XTRACEFD:-}\" =~ ^[0-9]+$$ ]] && [ -p \"/proc/$${BASHPID}/fd/$${KCOV_BASH_XTRACEFD}\" ]; then\n  PS4=\x27kcov@$${BASH_SOURCE}@$${LINENO}@\x27\n  BASH_XTRACEFD=\"$${KCOV_BASH_XTRACEFD}\"\n  set -x\nfi\n", encoding="utf-8"); rb = pathlib.Path("/tmp/run-bats.sh"); rb.write_text("#!/usr/bin/env bash\nexport -n BASH_XTRACEFD 2>/dev/null || unset BASH_XTRACEFD\nexport BASH_ENV=/tmp/kcov-env.sh\nexec bats \"$$@\"\n", encoding="utf-8"); rb.chmod(rb.stat().st_mode | stat.S_IXUSR); p = subprocess.run(["kcov", "--bash-dont-parse-binary-dir", "--include-path=/repo,/tmp", "--exclude-pattern=/repo/tests,/repo/bash-scripts/test,/tmp/kcov-bash,/tmp/kcov-env.sh,/tmp/run-bats.sh,.bats.src,/tmp/bats-mock", "/tmp/kcov-bash", "/tmp/run-bats.sh", "tests/bats/", "bash-scripts/test/"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True); sys.stdout.write(p.stdout); (sys.stderr.write("\n".join(p.stderr.splitlines()[-40:]) + "\n") if p.returncode != 0 and "\nnot ok " not in ("\n" + p.stdout) else None); sys.exit(p.returncode) if p.returncode != 0 else None; subprocess.run(["/usr/bin/python3", "/repo/.agents/scripts/normalize_kcov_cobertura.py", "--repo", "/repo", "--kcov-dir", "/tmp/kcov-bash", "--output", "/cov-out/bash.xml"], check=True)'
	@echo "✔ [BATS + kcov] Suites BATS OK y reporte Cobertura emitido en .agents/.cache/coverage/bash.xml."

diff-cov:
	@echo "📐 [Diff Coverage] Auditando cobertura diferencial multi-stack y anti-evasión..."
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/verify_diff_coverage.py --workspace . --reports-dir .agents/.cache/coverage $(if $(BASE_REF),--base-ref "$(BASE_REF)",); \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/verify_diff_coverage.py --workspace /app --reports-dir .agents/.cache/coverage $(if $(BASE_REF),--base-ref "$(BASE_REF)",); \
	fi

pr-verdict:
	@echo "🏛️ [PR Verdict] Generando PR_VERDICT.md y atestación SHA-256/HMAC en Docker efímero..."
	@if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		python3 .agents/scripts/generate_pr_verdict.py --workspace . --output-md .agents/artifacts/PR_VERDICT.md --output-json .agents/artifacts/pr_verdict_attestation.json; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e QA11X_ATTESTATION_KEY -v "$$(pwd):/app" -w /app $(PY_IMG) python3 .agents/scripts/generate_pr_verdict.py --workspace /app --output-md .agents/artifacts/PR_VERDICT.md --output-json .agents/artifacts/pr_verdict_attestation.json; \
	fi

test-meta-qa:
	@cmd='ruff check --select E,F,W,I,UP,B,C901,FLY --config "lint.mccabe.max-complexity=5" .agents/scripts scripts tests vibe-rescue && MYPYPATH=.agents/scripts:ai-evals:vibe-rescue mypy --strict --cache-dir=/tmp/mypy .agents/scripts/*.py scripts/*.py tests/*.unit.py tests/meta_qa/*.py tests/evals/*.py vibe-rescue/*.py vibe-rescue/tests/*.py && PYTHONPATH=.agents/scripts pytest --cov=lint_test_antipatterns --cov-fail-under=95 --cov-report=term-missing tests/meta_qa/test_antipattern_linter.py && PYTHONPATH=.agents/scripts pytest --cov=select_tests_by_blast_radius --cov-fail-under=95 --cov-report=term-missing tests/meta_qa/test_governance_scripts.py && PYTHONPATH=.agents/scripts pytest --cov=audit_pagespeed_insights --cov-fail-under=95 --cov-report=term-missing -k pagespeed tests/meta_qa/test_governance_scripts.py && PYTHONPATH=.agents/scripts pytest --cov=vibe-rescue --cov-fail-under=95 --cov-report=term-missing -k vibe_rescue tests/meta_qa/test_governance_scripts.py && PYTHONPATH=.agents/scripts pytest --cov=.agents/scripts --cov-report=term-missing tests/meta_qa/test_governance_scripts.py tests/meta_qa/test_antipattern_linter.py -q'; \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		if ! out=$$(PYTHONDONTWRITEBYTECODE=1 RUFF_CACHE_DIR=/tmp/ruff-cache COVERAGE_FILE=/tmp/.coverage UV_CACHE_DIR=/tmp/uv-cache sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; \
			if printf '%s' "$$out" | grep -qE '$(COMPLEXITY_FAILURE_REGEX)'; then printf '\n%s\n' "$(DIRECTIVE_11X_COMPLEXITY_MSG)" >&2; fi; \
			exit 1; \
		fi; \
	else \
		if ! out=$$(docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(PY_IMG) sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; \
			if printf '%s' "$$out" | grep -qE '$(COMPLEXITY_FAILURE_REGEX)'; then printf '\n%s\n' "$(DIRECTIVE_11X_COMPLEXITY_MSG)" >&2; fi; \
			exit 1; \
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
	'  readState() { return { tenantId: "tenant-alpha", nodes: ["edge-1"], status: "OPERACION" }; },' \
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
	'await operator.abilityTo(VueSP.CallAnApi).request(operator, { method: "POST", path: "/api/v1/nodes", headers: { "idempotency-key": "fixed-caller-key-11x" }, body: { id: "edge-02" } });' \
	'assert.equal((apiLog[1].headers as Record<string, string>)["Idempotency-Key"], "fixed-caller-key-11x");' \
	'const parity = await operator.asks(VueSP.AntiSiloParityQuestion(VueSP.ByRole("status", "badge"), "/api/v1/status", (d) => String((d as { badge: string }).badge)));' \
	'assert.equal(parity.inSync, true);' \
	'assert.equal(parity.tenantId, "tenant-alpha");' \
	'const dual = await operator.asks(VueSP.VerifyDualRefreshContract({ viewPath: "/wallboard#noc-live", expectedStateKey: "nodes" }));' \
	'assert.equal(dual.contractSatisfied, true);' \
	'assert.equal(dual.activeIntervalsAfterUnmount, 0);' \
	'const vueIso = await operator.asks(VueSP.VerifyVueTenantIsolation());' \
	'assert.equal(vueIso.tenantIsolated, true);' \
	'assert.equal(vueIso.renderedTenantId, "tenant-alpha");' \
	'assert.equal((await operator.asks(VueSP.VerifyVueTenantIsolation("missingTenant"))).renderedTenantId, null);' \
	'const crossTenantVue = VueSP.Actor.named("CrossVue", { role: "admin", tenantId: "tenant-omega" }).whoCan(VueSP.InspectPiniaStore.using(piniaPort));' \
	'assert.equal((await crossTenantVue.asks(VueSP.VerifyVueTenantIsolation())).tenantIsolated, false);' \
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
	'let reactIntervals = 1;' \
	'const reactDom: Record<string, string> = {};' \
	'const reactActor = ReactSP.Actor.named("AuditorB", { role: "auditor", tenantId: "tenant-beta", permissions: ["audit:read"] });' \
	'assert.throws(() => reactActor.abilityTo(ReactSP.InspectReactState), ReactSP.MissingAbilityError);' \
	'reactActor.whoCan(ReactSP.BrowseTheWeb.using(makeDriver("/audit", reactDom)), ReactSP.InspectReactState.using({ isTransitionPending: () => pending, async flushTransitions() { pending = false; }, renderedTenantId: () => "tenant-beta", readHookSnapshot: <T,>(k: string) => ({ hook: k, count: 3 }) as T, activeIntervalCount: () => reactIntervals, triggerUnmount() { reactIntervals = 0; } }));' \
	'await reactActor.attemptsTo(ReactSP.WaitForReactTransition("panel auditoria"));' \
	'const reactReport = await reactActor.asks(ReactSP.VerifyReactTenantIsolation("useAuditTrail"));' \
	'assert.equal(reactReport.tenantIsolated, true);' \
	'assert.equal(reactReport.transitionSettled, true);' \
	'assert.equal((reactReport.hookSnapshot as { count: number }).count, 3);' \
	'const reactDual = await reactActor.asks(ReactSP.VerifyDualRefreshContract({ viewPath: "/audit", hookName: "useAuditTrail", expectedStateKey: "count" }));' \
	'assert.equal(reactDual.contractSatisfied, true);' \
	'assert.equal(reactDual.activeIntervalsAfterUnmount, 0);' \
	'assert.equal(reactDom["clicked:role:button:/Refrescar/i"], "yes");' \
	'const nonVacuousReact = ReactSP.Actor.named("NoTracker", { role: "auditor", tenantId: "tenant-beta" }).whoCan(ReactSP.BrowseTheWeb.using(makeDriver("/audit", reactDom)), ReactSP.InspectReactState.using({ isTransitionPending: () => false, async flushTransitions() {}, renderedTenantId: () => "tenant-beta", readHookSnapshot: () => ({ count: 1 }) }));' \
	'const nonVacuousDual = await nonVacuousReact.asks(ReactSP.VerifyDualRefreshContract({ viewPath: "/audit", expectedStateKey: "count" }));' \
	'assert.equal(nonVacuousDual.contractSatisfied, false);' \
	'assert.equal(nonVacuousDual.activeIntervalsAfterUnmount, -1);' \
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
	'assert.equal(tidVue.score, 0.94);' \
	'assert.equal(tidVue.healed, true);' \
	'const tidBeatsSyn = VueLoc.resolveSemanticLocator({ intent: "publish", role: "dialog", accessibleName: "Publicar", testId: "pub-btn", synonyms: ["Aprobar Operacion"], landmark: "dialog" }, [{ ref: "btn-tid", role: "link", accessibleName: "Otro", testId: "pub-btn", attributes: {}, visible: true }, { ref: "dlg-syn", role: "dialog", accessibleName: "Aprobar Operacion", landmark: "overlay", attributes: {}, visible: true }]);' \
	'assert.equal(tidBeatsSyn.ref, "btn-tid");' \
	'assert.equal(tidBeatsSyn.strategy, "testid-fallback");' \
	'const synVue = await operator.asks(VueLoc.LocateSemanticTargetQuestion({ intent: "confirm", role: "dialog", accessibleName: "Confirmar Ventana", synonyms: ["Aprobar Operacion"], landmark: "dialog" }, () => [{ ref: "dlg", role: "dialog", accessibleName: "Aprobar Operacion", landmark: "overlay", attributes: { "data-v-teleport": "true" }, visible: true }], { telemetry: vueTel }));' \
	'assert.equal(synVue.strategy, "semantic-synonym");' \
	'assert.equal(synVue.score, 0.88);' \
	'assert.equal(vueTel.getRecords().length, 2);' \
	'const fuzzyReact = ReactLoc.resolveSemanticLocator({ intent: "submit", role: "button", accessibleName: "Guardar Configuracion" }, [{ ref: "busy", role: "button", accessibleName: "Guardar Configuracion", attributes: { "aria-busy": "true" }, visible: true }, { ref: "dis", role: "button", accessibleName: "Guardar Configuracion", attributes: {}, visible: true, disabled: true }, { ref: "ready", role: "button", accessibleName: ":r0: Guardar Configuracion", attributes: { id: ":r0:", "aria-labelledby": "«r1a» _r_0_ lbl" }, visible: true, bounds: { width: 100, height: 40 } }]);' \
	'assert.equal(fuzzyReact.ref, "ready");' \
	'assert.equal(fuzzyReact.strategy, "exact-aria");' \
	'assert.equal(fuzzyReact.cleanAttributes["aria-labelledby"], "lbl");' \
	'const portalReact = ReactLoc.resolveSemanticLocator({ intent: "close", role: "dialog", accessibleName: "Cerrar Modal", landmark: "portal" }, [{ ref: "dlg-portal", role: "dialog", accessibleName: "Cerrar Modal", attributes: { "data-radix-portal": "true", id: "_r_0_" }, visible: true }]);' \
	'assert.equal(portalReact.ref, "dlg-portal");' \
	'assert.equal(ReactLoc.isReactPortal(portalReact.candidate), true);' \
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
		printf '%s\n' "$$node_script" | docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -i -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$$(pwd):/app:ro" -w /app $(NODE_IMG) sh -c 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module ESNext --moduleResolution Bundler --noEmit vue3/tests/screenplay/Actor.ts react-frontend/tests/screenplay/Actor.ts vue3/tests/utils/semanticLocator.ts react-frontend/tests/utils/semanticLocator.ts && cat > /tmp/verify_screenplay.mts && node /tmp/verify_screenplay.mts >/dev/null && if [ -x /app/mcp-server/node_modules/.bin/eslint ]; then printf "%s\n" "import { createRequire } from \"node:module\"; const req = createRequire(\"/app/mcp-server/package.json\"); const js = req(\"@eslint/js\"); const tseslint = req(\"typescript-eslint\"); const sonarjs = req(\"eslint-plugin-sonarjs\"); const security = req(\"eslint-plugin-security\"); export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, sonarjs.configs.recommended, security.configs.recommended, { files: [\"**/*.ts\"], rules: { complexity: [\"error\", 5], \"max-params\": [\"error\", 4], \"max-depth\": [\"error\", 3], \"sonarjs/cognitive-complexity\": [\"error\", 15], \"sonarjs/no-duplicate-string\": \"off\", \"security/detect-object-injection\": \"off\", \"security/detect-non-literal-regexp\": \"error\", \"@typescript-eslint/no-explicit-any\": \"error\" } });" > /tmp/bp_eslint.mjs && /app/mcp-server/node_modules/.bin/eslint --no-config-lookup --config /tmp/bp_eslint.mjs --max-warnings 0 vue3/tests/screenplay/Actor.ts vue3/tests/utils/semanticLocator.ts vue3/e2e/accessibility.e2e.ts react-frontend/tests/screenplay/Actor.ts react-frontend/tests/utils/semanticLocator.ts react-frontend/e2e/accessibility.e2e.ts >/dev/null; fi' && \
		lint_out=$$(docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/lint_test_antipatterns.py vue3 react-frontend) && \
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
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 -e PACT_OUTPUT_DIR=/pacts -v "$$(pwd):/app:ro" -v "$$pact_dir:/pacts" -w /app $(PY_IMG) sh -c 'ruff check --select E,F,W,I,UP,B,C901,FLY --config "lint.mccabe.max-complexity=5" fastapi/tests/contracts/test_pact_consumer.py && mypy --strict --cache-dir=/tmp/mypy fastapi/tests/contracts/test_pact_consumer.py && pytest --cov=fastapi/tests/contracts --cov-fail-under=95 --cov-report=term-missing fastapi/tests/contracts/test_pact_consumer.py' && \
		test -s "$$pact_dir/fastapi-billing-consumer-node-inventory-provider.json" && \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_PATH=/opt/qa11x/node_modules -e PACT_OUTPUT_DIR=/pacts -v "$$(pwd):/app:ro" -v "$$pact_dir:/pacts:ro" -w /app $(NODE_IMG) sh -c 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module NodeNext --moduleResolution NodeNext --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit node-backend/tests/contracts/provider.pact.test.ts && node --test node-backend/tests/contracts/provider.pact.test.ts && if [ -x /app/mcp-server/node_modules/.bin/eslint ]; then printf "%s\n" "import { createRequire } from \"node:module\"; const req = createRequire(\"/app/mcp-server/package.json\"); const js = req(\"@eslint/js\"); const tseslint = req(\"typescript-eslint\"); const sonarjs = req(\"eslint-plugin-sonarjs\"); const security = req(\"eslint-plugin-security\"); export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, sonarjs.configs.recommended, security.configs.recommended, { files: [\"**/*.ts\"], rules: { complexity: [\"error\", 5], \"max-params\": [\"error\", 4], \"max-depth\": [\"error\", 3], \"sonarjs/cognitive-complexity\": [\"error\", 15], \"sonarjs/no-duplicate-string\": \"off\", \"security/detect-object-injection\": \"off\", \"security/detect-non-literal-regexp\": \"error\", \"@typescript-eslint/no-explicit-any\": \"error\" } });" > /tmp/bp_eslint.mjs && /app/mcp-server/node_modules/.bin/eslint --no-config-lookup --config /tmp/bp_eslint.mjs --max-warnings 0 node-backend/tests/contracts/provider.pact.test.ts >/dev/null; fi' && \
		stub_cid=$$(docker run -d --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 $(PY_IMG) python3 -c "$$stub_script") && \
		docker exec "$$stub_cid" python3 -c "$$wait_script" && \
		docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e K6_PROFILE=smoke -e API_BASE_URL=http://127.0.0.1:18080 -e K6_SUMMARY_PATH=/pacts/k6-summary.json --network "container:$$stub_cid" -v "$$(pwd)/fastapi/tests/load:/load:ro" -v "$$pact_dir:/pacts" $(K6_IMG) run -q /load/smoke.k6.js && \
		test -s "$$pact_dir/k6-summary.json" && \
		grep -q '"thresholdsPassed": true' "$$pact_dir/k6-summary.json" && \
		docker rm -f "$$stub_cid" >/dev/null 2>&1 && stub_cid="" && \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/lint_test_antipatterns.py fastapi/tests/contracts node-backend/tests/contracts; \
	} >"$$log_file" 2>&1 || { cat "$$log_file" >&2; exit 1; }; \
	cov=$$(awk '/TOTAL /{print $$NF}' "$$log_file" | tail -n 1); \
	echo "✅ [test-backend-blueprints] Pact V4 (FastAPI->Node) + k6 smoke + antipatrones OK (cobertura_pact=$${cov:-N/A})"

test-mobile-blueprints:
	@cmd='test -x "$$(command -v java)" && test -x "$$(command -v adb)" && test -x "$$(command -v appium)" && tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions --target ES2023 --module NodeNext --moduleResolution NodeNext --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit mobile-appium/wdio.conf.ts mobile-appium/tests/screenplay/MobileActor.ts mobile-appium/tests/mobile_screenplay.spec.ts mobile-appium/tests/e2e/mobile_app_smoke.spec.ts && node --test mobile-appium/tests/mobile_screenplay.spec.ts'; \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		sh -c "$$cmd" && python3 .agents/scripts/lint_test_antipatterns.py mobile-appium; \
	else \
		docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_PATH=/opt/qa11x/node_modules -v "$$(pwd):/app:ro" -w /app $(MOBILE_IMG) sh -c "$$cmd" && \
		lint_out=$$(docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$$(pwd):/app:ro" -w /app $(PY_IMG) python3 .agents/scripts/lint_test_antipatterns.py mobile-appium) && \
		echo "✅ [test-mobile-blueprints] Appium/ADB + TSC estricto + Screenplay W3C + antipatrones OK | $$lint_out"; \
	fi

test-example:
	@./scripts/probar-mcp-example.sh

test-ai-offline:
	@mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
	@cmd='ruff check --select E,F,W,I,UP,B,C901 --config "lint.mccabe.max-complexity=5" ai-evals tests/evals && MYPYPATH=ai-evals mypy --strict --cache-dir=/tmp/mypy ai-evals/golden_from_traces.py ai-evals/_llm_judge.py ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py ai-evals/tests/test_golden_from_traces.py tests/evals/test_skill_adherence.py && PYTHONPATH=ai-evals pytest --cov=ai-evals --cov=tests/evals --cov-fail-under=95 --cov-report=term-missing --cov-report=xml:/app/.agents/.cache/coverage/ai-evals.xml ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py ai-evals/tests/test_golden_from_traces.py tests/evals/test_skill_adherence.py'; \
	if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then \
		cmd_local="$$(printf '%s' "$$cmd" | sed 's|/app/\.agents|.agents|g')"; \
		if ! out=$$(PYTHONDONTWRITEBYTECODE=1 RUFF_CACHE_DIR=/tmp/ruff-cache COVERAGE_FILE=/tmp/.coverage UV_CACHE_DIR=/tmp/uv-cache DEEPEVAL_TELEMETRY_OPT_OUT=YES sh -c "$$cmd_local" 2>&1); then \
			printf '%s\n' "$$out" >&2; \
			if printf '%s' "$$out" | grep -qE '$(COMPLEXITY_FAILURE_REGEX)'; then printf '\n%s\n' "$(DIRECTIVE_11X_COMPLEXITY_MSG)" >&2; fi; \
			exit 1; \
		fi; \
	else \
		if ! out=$$(docker run --rm --restart=no --network none --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e DEEPEVAL_TELEMETRY_OPT_OUT=YES -v "$$(pwd):/app:ro" -v "$$(pwd)/.agents/.cache/coverage:/app/.agents/.cache/coverage" -w /app $(PY_IMG) sh -c "$$cmd" 2>&1); then \
			printf '%s\n' "$$out" >&2; \
			if printf '%s' "$$out" | grep -qE '$(COMPLEXITY_FAILURE_REGEX)'; then printf '\n%s\n' "$(DIRECTIVE_11X_COMPLEXITY_MSG)" >&2; fi; \
			exit 1; \
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
	@docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e DEEPEVAL_TELEMETRY_OPT_OUT=YES -e QA_LLM_AUDIT_LIVE="$${QA_LLM_AUDIT_LIVE:-$${RUN_LLM_AUDIT:-1}}" -e RUN_LLM_AUDIT="$${RUN_LLM_AUDIT:-1}" -e PYTHONPATH=ai-evals -e OPENAI_API_KEY -e GEMINI_API_KEY -e ANTHROPIC_API_KEY -e OLLAMA_BASE_URL -e OPENAI_API_BASE -e QA_LLM_MODEL -v "$$(pwd):/app:ro" -w /app $(PY_IMG) pytest ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py tests/evals/test_skill_adherence.py -k "live"
	@echo "🛡️ [audit-llm] Ejecutando matrices Promptfoo OWASP LLM Top 10 y Skills en sinfallas/base-node-ionic:26..."
	@mkdir -p .agents/artifacts; \
	prov_regex=""; judge="$${PROMPTFOO_JUDGE_PROVIDER:-}"; \
	if [ -n "$${OPENAI_API_KEY:-}" ] || [ -n "$${OPENAI_API_BASE:-}" ]; then prov_regex="$${prov_regex:+$$prov_regex|}openai:"; judge="$${judge:-openai:gpt-4.1-mini}"; fi; \
	[ -n "$${ANTHROPIC_API_KEY:-}" ] && { prov_regex="$${prov_regex:+$$prov_regex|}anthropic:"; judge="$${judge:-anthropic:messages:claude-sonnet-4-5}"; }; \
	[ -n "$${GEMINI_API_KEY:-}" ] && { prov_regex="$${prov_regex:+$$prov_regex|}google:"; judge="$${judge:-google:gemini-2.5-flash}"; }; \
	[ -n "$${OLLAMA_BASE_URL:-}" ] && { prov_regex="$${prov_regex:+$$prov_regex|}ollama:"; judge="$${judge:-ollama:chat:qwen3:8b}"; }; \
	docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e PROMPTFOO_DISABLE_TELEMETRY=1 -e PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=1 -e PROMPTFOO_CONFIG_DIR=/tmp/.promptfoo -e PROMPTFOO_JUDGE_PROVIDER="$$judge" -e PF_FILTER="$$prov_regex" -e OPENAI_API_KEY -e GEMINI_API_KEY -e ANTHROPIC_API_KEY -e OLLAMA_BASE_URL -e OPENAI_API_BASE -e QA_LLM_MODEL -v "$$(pwd):/app:ro" -v "$$(pwd)/.agents/artifacts:/artifacts" -w /app $(NODE_IMG) sh -c 'if [ -n "$${PF_FILTER:-}" ]; then set -- --filter-providers "$${PF_FILTER}"; else set --; fi; promptfoo eval -c ai-evals/promptfooconfig.yaml "$$@" --no-cache -o /artifacts/promptfoo-results.json && promptfoo eval -c tests/evals/promptfoo_skills_matrix.yaml "$$@" --no-cache -o /artifacts/promptfoo-skills-results.json'

qa-k6:
	@docker compose -f docker-compose.qa.yml --profile k6 run --rm -T -u "$$(id -u):$$(id -g)" k6 version

audit-psi:
	@./scripts/auditar-pagespeed.sh \
	  $(if $(URL),--url "$(URL)",) \
	  --strategy "$(or $(STRATEGY),both)" \
	  $(if $(MIN_PERF),--min-performance "$(MIN_PERF)",) \
	  $(if $(PSI_OUTPUT),--output "$(PSI_OUTPUT)",--output "psi-reports/psi-report.json")

qa-psi: audit-psi

test: lint lint-docs version-check validate-calm lint-workflows shellcheck shfmt test-bats build test-mcp test-example test-karate test-py test-meta-qa test-ai-offline test-frontend-blueprints test-backend-blueprints test-mobile-blueprints

build:
	@echo "📦 [Build] Compilando Servidor MCP en Docker efímero..."
	@docker run --rm --restart=no --security-opt=no-new-privileges:true -u "$$(id -u):$$(id -g)" -e HOME=/tmp -e NODE_OPTIONS="--max-old-space-size=4096" -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_verify_deps_before_run=false -e pnpm_config_manage_package_manager_versions=false -v "$$(pwd)/mcp-server:/app" -w /app $(NODE_IMG) bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run build"
	@echo "✔ [Build] Servidor MCP compilado en mcp-server/dist/."

publish-mcp:
	@./scripts/publicar-mcp.sh

publish-mcp-dry:
	@./scripts/publicar-mcp.sh --dry-run

publish-mcp-registry:
	@./scripts/publicar-mcp.sh --registry-only

publish-mcp-registry-dry:
	@./scripts/publicar-mcp.sh --registry-only --dry-run

certify:
	@QA11X_STRICT="$${QA11X_STRICT:-0}" ./.agents/scripts/certify_task_completion.sh
