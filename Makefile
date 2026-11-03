# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Makefile canónico para desarrollo local, automatización y gobernanza Level-11X

.PHONY: help clean qa-clean audit test lint build certify

help:
	@echo "Comandos canónicos de desarrollo y gobernanza para QA Testing Blueprints:"
	@echo "  make clean      - Limpia artefactos temporales, cachés de Docker y residuos root (./scripts/limpieza.sh)"
	@echo "  make qa-clean   - Alias canónico de make clean"
	@echo "  make audit      - Ejecuta escaneo preventivo de seguridad IaC y dependencias (Trivy en Docker)"
	@echo "  make test       - Ejecuta pruebas unitarias del Servidor MCP en contenedor efímero Docker"
	@echo "  make lint       - Ejecuta verificación de tipos y linters (ESLint, TypeScript)"
	@echo "  make build      - Compila la distribución de producción del Servidor MCP"
	@echo "  make certify    - Ejecuta el gate de certificación 11X (.agents/scripts/certify_task_completion.sh)"

clean:
	@./scripts/limpieza.sh

qa-clean: clean

audit:
	@echo "🔒 [Audit] Iniciando escaneo preventivo de vulnerabilidades y seguridad..."
	@./auditar-infra.sh

lint:
	@echo "🔍 [Lint] Ejecutando linter y chequeo de tipos en Docker efímero..."
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm run lint
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm run typecheck

test:
	@echo "🧪 [Test] Ejecutando pruebas unitarias en Docker efímero..."
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm run test:unit

build:
	@echo "📦 [Build] Compilando Servidor MCP en Docker efímero..."
	@docker run --rm -v $$(pwd)/mcp-server:/app -w /app sinfallas/base-node-ionic:26 pnpm run build

certify:
	@echo "🛡️ [Certify] Ejecutando compuerta universal de certificación 11X..."
	@./.agents/scripts/certify_task_completion.sh
