.PHONY: install qa-lint qa-typecheck qa-unit build qa-all clean

install:
	@docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm install --silent

qa-lint:
	@docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm --silent run lint

qa-typecheck:
	@docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm --silent run typecheck

qa-unit:
	@docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm --silent run test:unit

build:
	@docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm --silent run build

qa-all: qa-lint qa-typecheck qa-unit build

clean:
	@rm -rf dist coverage .turbo test-results .eslintcache 2>/dev/null || docker run --rm -v "$$(pwd):/app" alpine rm -rf /app/dist /app/coverage /app/.turbo /app/test-results /app/.eslintcache 2>/dev/null || true
