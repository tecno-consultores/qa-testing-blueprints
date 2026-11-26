.PHONY: install qa-lint qa-typecheck qa-unit qa-example qa-e2e build qa-all clean

export QA_UID := $(shell id -u)
export QA_GID := $(shell id -g)

install:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent"

qa-lint:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint"

qa-typecheck:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e NODE_OPTIONS="--max-old-space-size=4096" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run typecheck"

qa-unit:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run test:unit"

qa-example:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e QA_BLUEPRINTS_LOCAL_PATH=/app mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run build && pnpm run test:example"

qa-e2e:
	@docker compose -f docker-compose.qa.yml run --rm -T karatelabs mvn -B clean test

build:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run build"

qa-all:
	@docker compose -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e NODE_OPTIONS="--max-old-space-size=4096" mcp-server bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint && pnpm --silent run typecheck && pnpm --silent run test:unit && pnpm --silent run build && QA_BLUEPRINTS_LOCAL_PATH=/app pnpm run test:example"
	@$(MAKE) qa-e2e

clean:
	@rm -rf dist coverage .turbo test-results .eslintcache 2>/dev/null || docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -v "$(CURDIR):/app" alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab rm -rf /app/dist /app/coverage /app/.turbo /app/test-results /app/.eslintcache 2>/dev/null || true
