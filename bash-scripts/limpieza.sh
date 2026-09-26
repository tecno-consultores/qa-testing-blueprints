#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
# Elimina los reportes generados por kcov
rm -rf coverage_report/

# Elimina posibles artefactos temporales de bats
rm -rf .bats-battery/
rm -rf target/
rm -rf *.log

docker system prune -af

echo "Limpieza de artefactos de Bash QA finalizada."
exit 0
