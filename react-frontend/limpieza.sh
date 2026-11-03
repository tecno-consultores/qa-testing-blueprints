#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "AVISO: Ejecutando sin root; se usará contenedor efímero Alpine para limpiar artefactos de Docker."
fi

echo "Iniciando purga profunda del entorno de QA de React (Nivel 11X)..."

docker run --rm -v "$(pwd):/work" alpine sh -c "rm -rf /work/node_modules /work/dist /work/test-results /work/playwright-report /work/blob-report /work/target /work/test/target /work/coverage /work/.stryker-tmp /work/lhci-reports /work/.lhcache /work/.lighthouseci /work/prometheus_data /work/*.log && chown -R $(id -u):$(id -g) /work" 2>/dev/null || true

rm -rf node_modules dist
rm -rf test-results/ playwright-report/ blob-report/ target/ test/target/ coverage/ .stryker-tmp/ lhci-reports/ .lhcache/ .lighthouseci/ prometheus_data/
find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
rm -f ./*.log

chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" . 2>/dev/null || true

# Apagar infraestructuras de perfiles ocultos para forzar purga de la caché de pnpm (pnpm-store)
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile observability down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true
docker system prune -af --volumes

echo "Limpieza de caché, builds, reportes y contenedores finalizada."
exit 0
