#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecute con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Python..."

# Limpiar cachés y bases de datos de herramientas
rm -f .coverage
rm -rf .mypy_cache
rm -rf .pytest_cache
rm -rf .ruff_cache
rm -rf .tox
rm -rf .uv/
rm -rf dist
rm -rf tests/__pycache__
rm -rf src/*/__pycache__

# Limpiar artefactos de cobertura, benchmarking y profiling
rm -rf htmlcov/
rm -rf .benchmarks/
rm -f profile.svg

# Reclamar permisos de los archivos generados por Docker antes de destruirlos (por si se generaron como root)
chown -R $USER:$USER . 2>/dev/null || true

# Purgar infraestructura Docker efímera
docker system prune -af --volumes

echo "Limpieza finalizada."
exit 0#!/usr/bin/env bash
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
echo "Finalizado."
exit 0
