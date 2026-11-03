#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "AVISO: Ejecutando sin root; se usará contenedor efímero Alpine para limpiar artefactos de Docker."
fi

echo "Iniciando purga profunda del entorno de QA de Bash (Nivel 11X)..."

docker run --rm -v "$(pwd):/work" alpine sh -c "rm -rf /work/coverage_report /work/.bats-battery /work/target /work/*.log /work/prometheus_data && chown -R $(id -u):$(id -g) /work" 2>/dev/null || true

rm -rf coverage_report/ .bats-battery/ target/ ./*.log prometheus_data/
find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true

chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" . 2>/dev/null || true

# Forzamos el derribo de la infraestructura principal y perfiles secundarios
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile observability down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true

docker system prune -af

echo "Limpieza de artefactos de Bash QA finalizada exitosamente."
exit 0
