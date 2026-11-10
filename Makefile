# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit test test-mcp test-karate test-py lint build certify publish-mcp publish-mcp-dry

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean           - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean        - Alias canónico de make clean"
	@echo "  make audit           - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make test            - Ejecuta Vitest (>=95%), Karate BDD y Pytest en contenedores efímeros Docker"
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

lint:
	@echo "🔍 [Lint] Ejecutando linter y chequeo de tipos en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c '[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run lint && pnpm --silent run typecheck'
	@echo "✔ [Lint & Typecheck] 0 errores ni advertencias."

test-mcp:
	@echo "🧪 [Test MCP] Ejecutando pruebas unitarias Vitest (>= 95%) en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run test:unit && rm -rf coverage .eslintcache"

test-karate:
	@echo "🎭 [Karate BDD] Ejecutando contratos BDD del MCP Server en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1 mvn -B -q clean test

test-py:
	@echo "🐍 [Pytest] Ejecutando pruebas unitarias de gobernanza y manifiesto en Docker efímero..."
	@docker run --rm -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -u "$$(id -u):$$(id -g)" -v "$$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 uv run --with pytest --with pytest-cov pytest --import-mode=importlib tests/*.unit.py -q

test: test-mcp test-karate test-py

build:
	@echo "📦 [Build] Compilando Servidor MCP en Docker efímero..."
	@docker run --rm -v "$$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run build && chown -R $$(id -u):$$(id -g) dist"
	@echo "✔ [Build] Servidor MCP compilado en mcp-server/dist/."

publish-mcp:
	@./scripts/publicar-mcp.sh

publish-mcp-dry:
	@./scripts/publicar-mcp.sh --dry-run

certify:
	@./.agents/scripts/certify_task_completion.sh
