# Pipelines de CI/CD (Integración Continua)

Este documento explica cómo trasladar la ejecución de nuestras pruebas locales a entornos automatizados (como GitHub Actions o GitLab CI). El objetivo principal es garantizar que **ningún código llegue a producción si no cumple con la regla estricta del 95% de cobertura y pasa todas las auditorías**.

## 1. El Anti-Patrón vs. La Vía "Blueprints"

**El enfoque tradicional (Anti-Patrón):**
Normalmente, los pipelines de CI instalan el lenguaje directamente en el *runner* de GitHub/GitLab (ej. usando `actions/setup-node` o `actions/setup-python`), luego ejecutan `npm install` y finalmente corren los tests.
*   **¿Por qué está mal para nosotros?** Porque rompe el aislamiento. El *runner* de CI podría tener dependencias globales preinstaladas de Ubuntu que enmascaran errores, haciendo que el pipeline pase en GitHub pero falle en tu servidor Proxmox de producción.

**Nuestro enfoque (Blueprints):**
El *runner* de CI se trata como una máquina "tonta" cuyo único trabajo es tener Docker instalado. **Ejecutamos exactamente los mismos comandos que en local**. 
*   **¿Por qué es así?** Paridad absoluta. Si `docker compose -f docker-compose.qa.yml run --rm test` pasa en tu laptop, pasará en CI y funcionará en producción. Toda la inteligencia, herramientas (SAST, Mutación, BATS) y dependencias viven dentro de las imágenes `sinfallas/*`.

---

## 2. Anatomía de la Ejecución en CI

Para que el pipeline funcione correctamente, debe seguir una estructura estricta de 4 pasos:

### Paso 1: Checkout y Preparación
Clonar el código fuente. No necesitamos instalar Python, Node ni dependencias de sistema.
### Paso 2: Ejecución Efímera (El Núcleo)
Lanzar la suite utilizando `docker compose -f docker-compose.qa.yml run --rm`. Si la prueba de cobertura detecta menos del 95%, o si fallan las métricas de complejidad de `eslint-plugin-sonarjs` / `radon`, arrojará un código de salida `1` (Exit Code 1) bloqueando el *merge*.
### Paso 3: Extracción de Artefactos (Reportes)
Como utilizamos volúmenes *bind*, cuando el contenedor efímero muere, deja los reportes HTML físicamente en el disco del *runner*. El paso 3 toma esa carpeta y la sube como un "Artifact" para que el equipo pueda descargarlo.
### Paso 4: Limpieza
Ejecutar `./limpiar.sh` para no saturar el almacenamiento del *runner*.

---

## 3. Ejemplo Práctico: GitHub Actions

Aquí tienes la plantilla base para `.github/workflows/qa-pipeline.yml`. En este ejemplo, se audita un proyecto integrando las nuevas capas de complejidad y *linting*.

```yaml
name: QA Testing Blueprint Pipeline

on:
  pull_request:
    branches: [ "main", "develop" ]

jobs:
  auditoria-y-pruebas:
    name: 🛡️ Auditoría Estricta (95% Coverage)
    runs-on: ubuntu-latest

    steps:
      - name: 1️⃣ Checkout del código
        uses: actions/checkout@v4

      - name: 2️⃣ Inyectar Secretos de Entorno
        run: |
          echo "API_KEY=${{ secrets.PROD_API_KEY }}" >> .env
          echo "DB_PASS=${{ secrets.DB_PASS }}" >> .env

      - name: 3️⃣ Auditoría de Dependencias (CVEs)
        # Verificamos vulnerabilidades en paquetes de terceros usando pnpm/npm audit.
        run: docker compose -f docker-compose.qa.yml run --rm ui-test npm audit

      - name: 4️⃣ Análisis Estático, Complejidad y Formateo
        # Ejecutamos ESLint, Prettier y SonarJS para asegurar calidad y evitar Code Smells.
        run: docker compose -f docker-compose.qa.yml run --rm ui-test npm run lint

      - name: 5️⃣ Ejecutar Suite Efímera con Intercepción de Red (Vitest + MSW)
        # Si la cobertura es menor a 95%, este comando falla y aborta el pipeline.
        run: docker compose -f docker-compose.qa.yml run --rm ui-test npm run test:coverage

      - name: 6️⃣ Pruebas de Mutación (Stryker)
        # Para evitar que pasen PRs con pruebas "falsas positivas" que no auditan realmente la lógica.
        run: docker compose -f docker-compose.qa.yml run --rm ui-test npx stryker run

      - name: 7️⃣ Archivar Reportes de Calidad (Artefactos)
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-reports
          path: |
            coverage/
            reports/
            stryker.html
          retention-days: 7

      - name: 8️⃣ Limpieza del Entorno
        if: always()
        run: sudo ./limpiar.sh
```
