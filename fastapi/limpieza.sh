#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "AVISO: Ejecutando sin root; se usará contenedor efímero Alpine para limpiar cachés de Docker."
fi

echo "Iniciando purga profunda del entorno de QA de FastAPI (Nivel 11X)..."

docker run --rm -v "$(pwd):/work" alpine sh -c "rm -rf /work/.coverage /work/.mypy_cache /work/.pytest_cache /work/.ruff_cache /work/.tox /work/.uv /work/dist /work/tests/__pycache__ /work/src/*/__pycache__ /work/htmlcov /work/mutants /work/target /work/test/target /work/zap-report.html /work/chaos-report.html /work/profile.svg /work/*.log /work/prometheus_data && chown -R $(id -u):$(id -g) /work" 2>/dev/null || true

rm -f .coverage
rm -rf .mypy_cache .pytest_cache .ruff_cache .tox .uv/ dist tests/__pycache__ src/*/__pycache__ htmlcov/ mutants/ target/ test/target/
rm -f zap-report.html chaos-report.html profile.svg ./*.log
find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
rm -rf prometheus_data/

chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" . 2>/dev/null || true

# Apagar infraestructuras y perfiles ocultos para liberar redes y forzar purga de volúmenes de caché (uv-cache)
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile chaos down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true

docker system prune -af --volumes

echo "Limpieza de caché, reportes, imágenes y contenedores finalizada exitosamente."
exit 0
