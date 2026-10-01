#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de FastAPI..."

# Limpieza de dependencias y cachés
rm -f .coverage
rm -rf .mypy_cache
rm -rf .pytest_cache
rm -rf .ruff_cache
rm -rf .tox
rm -rf .uv/
rm -rf dist
rm -rf tests/__pycache__
rm -rf src/*/__pycache__

# Limpieza de reportes de cobertura, Karate Labs y Profiling
rm -rf htmlcov/
rm -rf target/
rm -rf test/target/
rm -f profile.svg
rm -f *.log

# Reclamar permisos de los archivos generados por Docker antes de destruirlos (por si se generaron como root)
chown -R $USER:$USER . 2>/dev/null || true

# Limpieza profunda de contenedores efímeros y redes huérfanas
docker system prune -af --volumes

echo "Limpieza de caché, reportes, imágenes y contenedores finalizada."
exit 0
