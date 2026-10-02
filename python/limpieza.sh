#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecute con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Python (Nivel 11X)..."

rm -f .coverage
rm -rf .mypy_cache
rm -rf .pytest_cache
rm -rf .ruff_cache
rm -rf .tox
rm -rf .uv/
rm -rf dist
rm -rf tests/__pycache__
rm -rf src/*/__pycache__

rm -rf htmlcov/
rm -rf .benchmarks/
rm -rf graphify-out/
rm -f profile.svg

chown -R $USER:$USER . 2>/dev/null || true

docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true
docker system prune -af --volumes

echo "Limpieza finalizada exitosamente."
exit 0
