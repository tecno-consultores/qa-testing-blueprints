#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecuta con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de FastAPI (Nivel 11X)..."

# Limpieza de dependencias temporales y cachés lógicos
rm -f .coverage
rm -rf .mypy_cache
rm -rf .pytest_cache
rm -rf .ruff_cache
rm -rf .tox
rm -rf .uv/
rm -rf dist
rm -rf tests/__pycache__
rm -rf src/*/__pycache__

# Limpieza de reportes de cobertura, BDD, Profiling, DAST y Caos
rm -rf htmlcov/
rm -rf target/
rm -rf test/target/
rm -f zap-report.html
rm -f chaos-report.html
rm -f profile.svg
rm -f *.log

# Reclamar permisos de los archivos generados por Docker antes de destruirlos (por si se generaron como root)
chown -R $USER:$USER . 2>/dev/null || true

# Limpieza profunda de contenedores efímeros y redes huérfanas (incluyendo perfiles ocultos)
docker compose -f docker-compose.qa.yml --profile chaos down -v 2>/dev/null || true
docker system prune -af --volumes

echo "Limpieza de caché, reportes, imágenes y contenedores finalizada exitosamente."
exit 0
