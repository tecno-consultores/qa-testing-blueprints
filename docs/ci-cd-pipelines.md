# Pipelines de CI/CD (Integración Continua)

Este documento explica cómo trasladar la ejecución de nuestras pruebas locales a entornos automatizados (como GitHub Actions o GitLab CI). El objetivo principal es garantizar que **ningún código llegue a producción si no cumple con la regla estricta del 95% de cobertura y pasa todas las auditorías**.

## 1. El Anti-Patrón vs. La Vía "Blueprints"

**El enfoque tradicional (Anti-Patrón):**
Normalmente, los pipelines de CI instalan el lenguaje directamente en el *runner* de GitHub/GitLab (ej. usando `actions/setup-node` o `actions/setup-python`), luego ejecutan `npm install` y finalmente corren los tests.
*   **¿Por qué está mal para nosotros?** Porque rompe el aislamiento. El *runner* de CI podría tener dependencias globales preinstaladas de Ubuntu que enmascaran errores, haciendo que el pipeline pase en GitHub pero falle en tu servidor Proxmox de producción.

**Nuestro enfoque (Blueprints):**
El *runner* de CI se trata como una máquina "tonta" cuyo único trabajo es tener Docker instalado. **Ejecutamos exactamente los mismos comandos que en local**. 
*   **¿Por qué es así?** Paridad absoluta. Si `docker compose run --rm test` pasa en tu laptop, pasará en CI y funcionará en producción. Toda la inteligencia, herramientas (SAST, Mutación, BATS) y dependencias viven dentro de las imágenes `sinfallas/*`.

---

## 2. Anatomía de la Ejecución en CI

Para que el pipeline funcione correctamente, debe seguir una estructura estricta de 4 pasos:

### Paso 1: Checkout y Preparación
Clonar el código fuente. No necesitamos instalar Python, Node ni dependencias de sistema.
### Paso 2: Ejecución Efímera (El Núcleo)
Lanzar la suite utilizando `docker compose run --rm`. Si la prueba de cobertura (ej. `kcov` o `pytest-cov`) detecta menos del 95%, arrojará automáticamente un código de salida `1` (Exit Code 1). El sistema de CI intercepta este código y marca el *Pull Request* como "Fallido" (Red/Failed), bloqueando el *merge*.
### Paso 3: Extracción de Artefactos (Reportes)
Como utilizamos volúmenes *bind* (`- .:/app` en nuestros `docker-compose.yml`), cuando el contenedor efímero muere, deja los reportes HTML (cobertura, Playwright, Stryker) físicamente en el disco del *runner*. El paso 3 toma esa carpeta y la sube como un "Artifact" para que el equipo pueda descargarla y ver qué falló.
### Paso 4: Limpieza
Ejecutar `./limpiar.sh` para no saturar el almacenamiento del *runner* (especialmente crítico si usas *runners* auto-hospedados en tu infraestructura).

---

## 3. Ejemplo Práctico: GitHub Actions

Aquí tienes la plantilla base para `.github/workflows/qa-pipeline.yml`. En este ejemplo, audita un proyecto de Node.js/Vue 3, pero la estructura es idéntica para Python o Bash (solo cambia el comando en el Paso 3).

```yaml
name: QA Testing Blueprint Pipeline

# Se ejecuta al abrir un Pull Request hacia 'main' o 'develop'
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

      # (Opcional) Si tu docker-compose necesita credenciales privadas para BDD o APIs
      - name: 2️⃣ Inyectar Secretos de Entorno
        run: |
          echo "API_KEY=${{ secrets.PROD_API_KEY }}" >> .env
          echo "DB_PASS=${{ secrets.DB_PASS }}" >> .env

      - name: 3️⃣ Ejecutar Suite Efímera (Vitest + JSDOM)
        # ¿Por qué este comando? Es exactamente el mismo que usas en local.
        # Si la cobertura es menor a 95%, este comando falla y aborta el pipeline.
        run: docker compose run --rm ui-test npm run test:coverage

      - name: 4️⃣ Pruebas de Mutación (Stryker)
        # ¿Por qué ejecutar mutación en CI? Para evitar que pasen PRs con pruebas 
        # "falsas positivas" que no auditan realmente la lógica.
        run: docker compose run --rm ui-test npx stryker run

      - name: 5️⃣ Archivar Reportes de Calidad (Artefactos)
        # ¿Por qué archivar? El contenedor ya se destruyó por el flag --rm.
        # Rescatamos los archivos HTML que el contenedor guardó en el host.
        uses: actions/upload-artifact@v4
        if: always() # Se ejecuta incluso si las pruebas fallaron
        with:
          name: qa-reports
          path: |
            coverage/
            reports/
            stryker.html
          retention-days: 7

      - name: 6️⃣ Limpieza del Entorno
        if: always()
        run: sudo ./limpiar.sh
```

## 4. Consideraciones Avanzadas y Solución de Problemas

### 🔒 Manejo de Secretos y `.env`
Los contenedores Docker a menudo dependen de un archivo `.env`. NUNCA subas el archivo `.env` al repositorio. En su lugar, utiliza el mecanismo de secretos de tu plataforma (GitHub Secrets / GitLab CI/CD Variables) y créalo dinámicamente durante el pipeline (como se ve en el Paso 2 del ejemplo).

### 🚦 Manejo de Bases de Datos Vivas (Servicios en Segundo Plano)
Si estás ejecutando la carpeta `fastapi/` (que requiere la API viva para que Karate Labs o Schemathesis la ataquen), debes asegurarte de encender los servicios de fondo (con `-d`) ANTES de lanzar los efímeros:

```yaml
      - name: Levantar API en segundo plano
        run: docker compose up -d api-prod
        
      # Esperamos 5 segundos para que la API responda
      - name: Wait for API
        run: sleep 5
        
      - name: Ejecutar BDD (Karate Labs) contra la API viva
        run: docker compose run --rm karate
```

### 📉 ¿Qué pasa si el pipeline falla por Cobertura (94.9%)?
El pipeline actuará como un juez implacable y rechazará el código. En lugar de rebuscar en los *logs* de la consola de GitHub, el desarrollador (o el agente de IA) debe descargar el artefacto ZIP generado en el Paso 5, abrir el archivo `index.html` de cobertura en su navegador y ubicar exactamente la línea de código en rojo que causó el fallo.
