# SPDX-License-Identifier: MIT
# Makefile de referencia 11X para el proyecto semilla Full-Stack (FastAPI + Vue 3)

.PHONY: qa-lint qa-unit qa-integration qa-e2e qa-all

export QA_UID := $(shell id -u)
export QA_GID := $(shell id -g)

qa-lint:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" qa-backend bash -c \
		"ruff check src/ tests/ && ruff format --check src/ tests/ && mypy --strict --cache-dir=/tmp/mypy src/"

qa-unit:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" \
		-e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/backend/src qa-backend bash -c \
		"pytest -o addopts=\"\" --import-mode=importlib --cov=src --cov-fail-under=95 backend/tests/*.unit.py"

qa-integration:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" qa-backend bash -c \
		"alembic -c backend/alembic.ini upgrade head"

qa-e2e:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c \
		"pnpm --silent run test:e2e"

qa-all: qa-lint qa-unit
