#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
rm -f .coverage
rm -rf .mypy_cache
rm -rf .pytest_cache
rm -rf .ruff_cache
rm -rf .tox
rm -rf dist
rm -rf tests/__pycache__
rm -rf src/*/__pycache__
docker system prune -af
echo "Limpieza de caché y contenedores finalizada."
exit 0
