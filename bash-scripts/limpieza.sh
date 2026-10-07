#!/usr/bin/env bash
# Licencia: MIT
LC_ALL=C

if [[ "$EUID" != "0" ]]; then
        echo "ERROR: debe ser root."
        exit 1
fi

clear
rm -rf coverage_report/
rm -rf .bats-battery/
rm -rf target/
rm -rf *.log
docker compose -f docker-compose.qa.yml --profile observability down -v 2>/dev/null || true
docker system prune -af

echo "Limpieza de artefactos de Bash QA finalizada."
exit 0
