.PHONY: install qa-lint qa-typecheck qa-unit qa-e2e build qa-all clean

export QA_UID := $(shell id -u)
export QA_GID := $(shell id -g)

install:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent"

qa-lint:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run lint"

qa-typecheck:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run typecheck"

qa-unit:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run test:unit"

qa-e2e:
	@docker compose -f docker-compose.qa.yml run --rm karatelabs mvn -B clean test

build:
	@docker compose -f docker-compose.qa.yml run --rm -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run build"

qa-all: qa-lint qa-typecheck qa-unit qa-e2e build

clean:
	@rm -rf dist coverage .turbo test-results .eslintcache 2>/dev/null || docker run --rm -v "$$(pwd):/app" alpine rm -rf /app/dist /app/coverage /app/.turbo /app/test-results /app/.eslintcache 2>/dev/null || true
