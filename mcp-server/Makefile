.PHONY: install qa-lint qa-typecheck qa-unit build qa-all clean

install:
	docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm install

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm run lint

qa-typecheck:
	docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm run typecheck

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm run test:unit

build:
	docker compose -f docker-compose.qa.yml run --rm mcp-server pnpm run build

qa-all: qa-lint qa-typecheck qa-unit build

clean:
	rm -rf dist node_modules coverage
