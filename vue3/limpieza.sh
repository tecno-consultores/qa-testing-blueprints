#!/usr/bin/env bash
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
