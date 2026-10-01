#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root. Ejecuta con sudo ./limpieza.sh"
        exit 1
fi

clear
echo "Iniciando purga profunda del entorno de QA de Vue 3..."

# Limpieza de dependencias y builds
rm -rf node_modules
rm -rf dist
rm -rf .nuxt

# Limpieza de reportes de pruebas, mutación y rendimiento
rm -rf test-results/
rm -rf playwright-report/
rm -rf blob-report/
rm -rf target/
rm -rf test/target/
rm -rf coverage/
rm -rf .stryker-tmp/
rm -rf lhci-reports/
rm -rf .lhcache/
rm -f *.html
rm -f *.log

# Reclamar permisos de los archivos generados por Docker
chown -R $USER:$USER . 2>/dev/null || true

# Limpieza profunda de Docker
docker system prune -af --volumes

echo "Limpieza de caché, builds, reportes y contenedores finalizada."
exit 0#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
rm -rf node_modules
rm -rf dist
rm -rf .nuxt
rm -rf test-results/
rm -rf playwright-report/
rm -rf blob-report/
rm -rf target/
rm -rf test/target/
docker system prune -af
echo "Limpieza de caché, builds y contenedores finalizada."
exit 0
