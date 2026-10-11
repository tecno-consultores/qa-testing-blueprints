#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecute con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Bash (Nivel 11X)..."

rm -rf coverage_report/
rm -rf .bats-battery/
rm -rf target/
rm -rf *.log
rm -rf graphify-out/
rm -rf prometheus_data/

chown -R $USER:$USER . 2>/dev/null || true

# Forzamos el derribo de la infraestructura principal y perfiles secundarios
docker compose -f docker-compose.qa.yml down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile observability down -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down -v 2>/dev/null || true

docker system prune -af

echo "Limpieza de artefactos de Bash QA finalizada exitosamente."
exit 0
