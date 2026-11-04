# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit test lint build certify publish-mcp publish-mcp-dry

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean           - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean        - Alias canónico de make clean"
	@echo "  make audit           - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make test            - Ejecuta pruebas unitarias del Servidor MCP en contenedor efímero Docker"
	@echo "  make lint            - Ejecuta verificación de tipos y linters (ESLint, TypeScript)"
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
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm --silent run lint
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm --silent run typecheck
	@echo "✔ [Lint & Typecheck] 0 errores ni advertencias."

test:
	@echo "🧪 [Test] Ejecutando pruebas unitarias en Docker efímero..."
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm --silent run test:unit

build:
	@echo "📦 [Build] Compilando Servidor MCP en Docker efímero..."
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm --silent run build
	@echo "✔ [Build] Servidor MCP compilado en mcp-server/dist/."

publish-mcp:
	@./scripts/publicar-mcp.sh

publish-mcp-dry:
	@./scripts/publicar-mcp.sh --dry-run

certify:
	@./.agents/scripts/certify_task_completion.sh
