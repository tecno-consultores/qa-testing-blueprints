#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "AVISO: Ejecutando sin root; se usará contenedor efímero Alpine para limpiar cachés de Docker."
fi

echo "Iniciando purga profunda del entorno de QA de Python (Nivel 11X)..."

docker run --rm -v "$(pwd):/work" alpine sh -c "rm -rf /work/.coverage /work/.mypy_cache /work/.pytest_cache /work/.ruff_cache /work/.tox /work/.uv /work/dist /work/tests/__pycache__ /work/src/*/__pycache__ /work/htmlcov /work/mutants /work/.benchmarks /work/prometheus_data /work/profile.svg && chown -R $(id -u):$(id -g) /work" 2>/dev/null || true

rm -f .coverage
rm -rf .mypy_cache .pytest_cache .ruff_cache .tox .uv/ dist tests/__pycache__ src/*/__pycache__
rm -rf htmlcov/ mutants/ .benchmarks/ prometheus_data/
find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
rm -f profile.svg

chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" . 2>/dev/null || true

# Forzamos el derribo de la infraestructura principal y perfiles ocultos para destruir el volumen de caché persistente (uv-cache)
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile observability down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true

docker system prune -af --volumes

echo "Limpieza finalizada exitosamente."
exit 0
