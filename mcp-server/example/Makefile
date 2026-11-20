# SPDX-License-Identifier: MIT
# Makefile de referencia 11X para el proyecto semilla Full-Stack (FastAPI + Vue 3)

.PHONY: qa-lint qa-unit qa-integration qa-e2e qa-all

export QA_UID := $(shell id -u)
export QA_GID := $(shell id -g)

qa-lint:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-backend bash -c \
		"ruff check --select E,F,W,I,UP,B,C901,PLR0913 src/ tests/ && ruff format --check src/ tests/ && mypy --strict --cache-dir=/tmp/mypy src/"

qa-unit:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" \
		-e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/backend/src qa-backend bash -c \
		"pytest --import-mode=importlib --cov=src --cov-fail-under=95 tests/*.unit.py"

qa-integration:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-backend bash -c \
		"if [ -f alembic.ini ]; then alembic -c alembic.ini upgrade head; else python3 -c \"import ast, pathlib; ast.parse(pathlib.Path('migrations/versions/0001_create_telemetry_devices.py').read_text())\"; echo '⚠️ [SKIPPED/NO_ALEMBIC_INI] Migración validada sintácticamente sin motor PostgreSQL'; fi"

qa-e2e:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c \
		"if [ -d node_modules ]; then pnpm --silent run test:e2e; else echo '⚠️ [SKIPPED/NO_NODE_MODULES] Instale dependencias antes de ejecutar Playwright E2E' >&2; exit 2; fi"

qa-all: qa-lint qa-unit
