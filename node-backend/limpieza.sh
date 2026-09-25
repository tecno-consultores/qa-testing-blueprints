
#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
# Elimina dependencias y directorios de compilación
rm -rf node_modules
rm -rf dist

# Elimina reportes y cachés de pruebas
rm -rf coverage
rm -rf .stryker-tmp
rm -rf reports
rm -rf target/
rm -rf test/target/
rm -rf .eslintcache
rm -rf .vitest/

# Purga profunda de contenedores, redes y volúmenes huérfanos
docker system prune -af

echo "Limpieza de caché y contenedores de Node finalizada."
exit 0
