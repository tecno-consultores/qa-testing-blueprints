#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecuta con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Node.js..."

# Limpieza de dependencias y código compilado
rm -rf node_modules/
rm -rf dist/
rm -rf .stryker-tmp/

# Limpieza de reportes de cobertura, Karate Labs y Profiling de Clinic.js
rm -rf coverage/
rm -rf target/
rm -rf test/target/
rm -rf .clinic/
rm -f *.html
rm -f *.clinic-*.html
rm -f *.log

# Reclamar permisos de los archivos generados por Docker (evita problemas de propietario 'root')
chown -R $USER:$USER . 2>/dev/null || true

# Limpieza profunda de contenedores efímeros, redes huérfanas y cachés de construcción
docker system prune -af --volumes

echo "Limpieza de dependencias, reportes, imágenes y contenedores finalizada."
exit 0
