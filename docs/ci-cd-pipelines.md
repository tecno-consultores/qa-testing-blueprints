# Pipelines de CI/CD (Integración Continua)

Este documento explica cómo trasladar la ejecución de nuestras pruebas locales a entornos automatizados. El objetivo es garantizar que **ningún código llegue a producción si no cumple con la regla estricta del 95% de cobertura y pasa todas las auditorías de Nivel 11X**.

## 1. El Anti-Patrón vs. La Vía "Blueprints"

**Nuestro enfoque (Blueprints):**
El *runner* de CI se trata como una máquina "tonta" cuyo único trabajo es tener Docker instalado. **Ejecutamos exactamente los mismos comandos que en local**. 
Toda la inteligencia y dependencias viven dentro de los contenedores efímeros.

*(Nota: Lefthook no se ejecuta en el CI/CD; su trabajo es interceptar al desarrollador en local antes de que el código suba a GitHub/GitLab).*

---

## 2. Anatomía de la Ejecución en CI (Nivel 11X)

### Paso 0: Auditoría IaC (Trivy)
Antes de descargar código de terceros, escaneamos estáticamente los manifiestos de Docker para prevenir inyecciones a la infraestructura.
### Paso 1: Ejecución Efímera Base
Análisis estático (SAST), Complejidad, Cobertura (>95%) y Profiling. Si fallan, arrojan Exit Code 1.
### Paso 2: Seguridad Dinámica (DAST)
OWASP ZAP levanta un ataque ligero (Baseline) sobre el contenedor vivo.
### Paso 3: Resiliencia (Caos)
Se levanta el perfil `--profile chaos` inyectando latencia con Pumba.

---

## 3. Ejemplo Práctico: GitHub Actions

Aquí tienes la plantilla completa para `.github/workflows/qa-pipeline.yml`.

```yaml
name: QA Testing Blueprint Pipeline (11X)

on:
  pull_request:
    branches: [ "main", "develop" ]

jobs:
  auditoria-y-pruebas:
    name: 🛡️ Auditoría Estricta y Resiliencia
    runs-on: ubuntu-latest

    steps:
      - name: 📥 Checkout del código
        uses: actions/checkout@v4

      - name: 0️⃣ Auditoría de Infraestructura y Contenedores (Trivy)
        run: |
          docker run --rm -v "${PWD}:/app:ro" -w /app aquasec/trivy:latest config . --severity HIGH,CRITICAL --exit-code 1

      - name: 1️⃣ Auditoría de Dependencias y SAST
        run: docker compose -f docker-compose.qa.yml run --rm test bash -c "npm install && npm audit && npm run lint"

      - name: 2️⃣ Suite Efímera con Intercepción de Red (Vitest)
        run: docker compose -f docker-compose.qa.yml run --rm test bash -c "npm install && npm run test:coverage"

      - name: 3️⃣ Pruebas de Mutación (Stryker)
        run: docker compose -f docker-compose.qa.yml run --rm test bash -c "npm install && npm run mutate"

      - name: 4️⃣ Seguridad Dinámica DAST (OWASP ZAP)
        # Levanta la API en segundo plano y la ataca
        run: |
          docker compose -f docker-compose.qa.yml up -d api
          docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:3000 -r zap-report.html

      - name: 5️⃣ Ingeniería del Caos y Estrés (Pumba + Artillery)
        # Inyecta latencia de red y dispara oleadas de carga simultáneamente
        run: docker compose -f docker-compose.qa.yml --profile chaos up --abort-on-container-exit stress_test

      - name: 6️⃣ Archivar Reportes de Calidad (Artefactos)
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-reports
          path: |
            coverage/
            zap-report.html
            chaos-report.json
          retention-days: 7

      - name: 7️⃣ Limpieza del Entorno
        if: always()
        run: sudo ./limpieza.sh
```
