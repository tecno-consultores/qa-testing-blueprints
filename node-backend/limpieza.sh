#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "AVISO: Ejecutando sin root; se usará contenedor efímero Alpine para limpiar artefactos de Docker."
fi

echo "Iniciando purga profunda del entorno de QA de Node.js (Nivel 11X)..."

docker run --rm -v "$(pwd):/work" alpine sh -c "rm -rf /work/node_modules /work/dist /work/.stryker-tmp /work/coverage /work/target /work/test/target /work/.clinic /work/prometheus_data /work/zap-report.html /work/chaos-report.json /work/chaos-report.html /work/*.clinic-*.html /work/*.log && chown -R $(id -u):$(id -g) /work" 2>/dev/null || true

rm -rf node_modules/ dist/ .stryker-tmp/ coverage/ target/ test/target/ .clinic/ prometheus_data/
find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
rm -f zap-report.html chaos-report.json chaos-report.html ./*.clinic-*.html ./*.log

chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" . 2>/dev/null || true

# Apagar infraestructuras y perfiles ocultos para liberar redes y forzar purga de volúmenes de caché (pnpm-store)
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile chaos down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true

docker system prune -af --volumes

echo "Limpieza de dependencias, reportes, imágenes y contenedores finalizada exitosamente."
exit 0
