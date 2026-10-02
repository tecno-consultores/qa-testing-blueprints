#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecuta con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Node.js (Nivel 11X)..."

rm -rf node_modules/
rm -rf dist/
rm -rf .stryker-tmp/
rm -rf coverage/
rm -rf target/
rm -rf test/target/
rm -rf .clinic/
rm -f zap-report.html
rm -f chaos-report.json
rm -f chaos-report.html
rm -f *.html
rm -f *.clinic-*.html
rm -f *.log

chown -R $USER:$USER . 2>/dev/null || true

docker compose -f docker-compose.qa.yml --profile chaos down -v 2>/dev/null || true
docker system prune -af --volumes

echo "Limpieza de dependencias, reportes, imágenes y contenedores finalizada exitosamente."
exit 0
