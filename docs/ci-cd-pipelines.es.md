> 🌐 **Idioma:** [🇺🇸 English (Canonical)](ci-cd-pipelines.md) · **Español (Espejo 1:1)**

# Pipelines de CI/CD (Integración Continua y Ejecución Soberana)

Este documento explica los principios de integración continua bajo el estándar 11X, abordando tanto la ejecución soberana local operada por **Agentes de Inteligencia Artificial** como el traslado opcional de las pruebas a entornos automatizados remotos (como GitHub Actions o GitLab CI) en proyectos que adopten este blueprint.

---

## 0. Shift-Left Extremo: Gobernanza por Agentes de IA vs. CI/CD Tradicional

En los flujos tradicionales de desarrollo, el pipeline de CI/CD remoto es el primer lugar donde se descubren fallos de linting, cobertura insuficiente o vulnerabilidades de seguridad. Esto introduce ciclos lentos de retroalimentación (10 a 20 minutos por iteración).

En el Estándar 11X aplicamos un **Shift-Left Extremo operado por Agentes de IA**:
* **Ejecución Local Autónoma:** Antes de que un commit sea generado, el agente de IA (Google Antigravity, Claude Code, Cursor, Hermes) ejecuta localmente la suite en Docker efímero (`Rule Zero`) y la compuerta universal de certificación (`./.agents/scripts/certify_task_completion.sh`).
* **Calidad Garantizada Pre-Push:** Cuando el código se envía a Git, ya ha sido validado matemáticamente contra la regla del 95% de cobertura, 0 secretos, paridad ORM con PostgreSQL real y escenarios BDD de Karate Labs. El CI remoto deja de ser un filtro de descubrimiento para convertirse en una simple salvaguarda redundante (junto a la confirmación humana `QA-GIT-GATE-01` para envíos remotos).
* **Filosofía Soberana (Modelo RoSGrid):** Para tareas de alta criticidad como la publicación de paquetes (ej. el servidor MCP `@sinfallas/mcp-qa-11x` en npm), el estándar rechaza delegar credenciales maestras (`NPM_TOKEN`) a *runners* externos compartidos. El ciclo de publicación se ejecuta de manera soberana y local mediante scripts efímeros auditados (`scripts/publicar-mcp.sh`).

---

## 1. El Anti-Patrón vs. La Vía "Blueprints"

**El enfoque tradicional (Anti-Patrón):**
Normalmente, los pipelines de CI instalan el lenguaje directamente en el *runner* de GitHub/GitLab (ej. usando `actions/setup-node` o `actions/setup-python`), luego ejecutan `npm install` y finalmente corren los tests.
*   **¿Por qué está mal para nosotros?** Porque rompe el aislamiento. El *runner* de CI podría tener dependencias globales preinstaladas de Ubuntu que enmascaran errores, haciendo que el pipeline pase en GitHub pero falle en tu servidor Proxmox de producción.

**Nuestro enfoque (Blueprints):**
El *runner* de CI se trata como una máquina "tonta" cuyo único trabajo es tener Docker instalado. **Ejecutamos exactamente los mismos comandos encapsulados de los Makefiles que usamos en local a lo largo de los 10 stacks hidratables + `architecture/` + `mcp-server/` (= 12 entornos de matriz)**. 
*   **¿Por qué es así?** Paridad absoluta. Si `make qa-unit` pasa en tu laptop, pasará en CI y funcionará en producción. Toda la inteligencia, herramientas (SAST, Mutación, BATS, Appium 3), configuraciones `.npmrc` y dependencias viven dentro de las imágenes base certificadas `sinfallas/*` (`sinfallas/base-python-uv:3.15`, `sinfallas/base-node-ionic:26`, `sinfallas/base-mobile-appium:26`, `sinfallas/basephpcomposer:8.5`, `sinfallas/karatelabs:1.5.1`, `sinfallas/base-bash-qa:latest`, `sinfallas/remote-graphify:latest`) respaldadas en los volúmenes de caché.

---

## 2. Anatomía de la Ejecución en CI (Nivel 11X)

Para que el pipeline funcione correctamente, debe seguir una estructura estricta:

### Paso 0: Auditoría de Infraestructura (Trivy)
Antes de descargar dependencias de lenguaje, escaneamos estáticamente los manifiestos de Docker para prevenir inyecciones a la infraestructura o escalamiento de privilegios.
### Paso 1: Checkout y Preparación
Clonar el código fuente. No necesitamos instalar Python, Node ni dependencias de sistema.
### Paso 2: Ejecución Efímera Base (El Núcleo)
Lanzar las suites utilizando los comandos definidos en el `Makefile` (ej. `make qa-lint`, `make qa-unit`). Si la prueba de cobertura detecta menos del 95%, o si fallan las métricas de complejidad, arrojará un código de salida `1` (Exit Code 1) bloqueando el *merge*.
### Paso 3: Seguridad Dinámica (DAST)
OWASP ZAP levanta un ataque ligero (*Baseline Scan*) sobre el contenedor vivo para auditar vulnerabilidades en la red.
### Paso 4: Resiliencia, Caos y Observabilidad
Se activa el perfil oculto `--profile chaos` inyectando latencia con Pumba y oleadas de estrés concurrente, mientras Prometheus recopila métricas.
### Paso 5: Extracción de Artefactos (Reportes)
Como utilizamos volúmenes *bind*, cuando el contenedor efímero muere, deja los reportes HTML y JSON físicamente en el disco del *runner*. El pipeline toma esa carpeta y la sube como un "Artifact" para que el equipo pueda descargarlo.
### Paso 6: Limpieza
Ejecutar `./scripts/limpieza.sh` (o `make clean`) para destruir artefactos temporales y contenedores efímeros sin saturar el almacenamiento del *runner*.

---

## 3. Ejemplo Práctico de Referencia: GitHub Actions (Para Proyectos Adoptantes)

A continuación se presenta una plantilla ilustrativa de referencia para proyectos externos que adopten este blueprint y requieran configurar un flujo de verificación en GitHub Actions (ej. en `.github/workflows/qa-pipeline.yml`). Al utilizar los `Makefiles` corporativos bajo la Regla Cero, el pipeline es extremadamente limpio, no instala lenguajes en el runner y delega toda la inteligencia a las imágenes oficiales efímeras:

```yaml
name: QA Testing Blueprint Pipeline (Nivel 11X)

on:
  pull_request:
    branches: [ "main", "develop" ]

permissions:
  contents: read

jobs:
  auditoria-y-pruebas:
    name: 🛡️ Auditoría Estricta (95% Coverage) y Resiliencia
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: 1️⃣ Checkout del código (fijar SHA inmutable en producción)
        uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0

      - name: 2️⃣ Verificación de Secretos y Configuración Efímera Segura
        run: |
          ./scripts/verificar-secretos.sh
          # Inyectar variables de entorno de prueba con rol no-superusuario NOBYPASSRLS (NUNCA credenciales reales)
          echo "ENVIRONMENT=test" >> .env.test
          echo "DATABASE_URL=postgresql+asyncpg://app_user:test_only_rls_pwd@postgres:5432/test_db" >> .env.test

      - name: 3️⃣ Auditoría de Infraestructura y Contenedores (Trivy)
        run: |
          ./scripts/auditar-infra.sh

      - name: 4️⃣ Análisis Estático, Complejidad y Formateo
        # Ejecuta linting, tipeo estricto (Mypy/TS) y reglas de complejidad ciclomática.
        run: make qa-lint

      - name: 5️⃣ Ejecutar Suite Efímera con Intercepción de Red (>= 95% Cobertura)
        # Si la cobertura es menor a 95%, este comando falla y aborta el pipeline.
        run: make qa-unit

      - name: 6️⃣ Pruebas de Mutación (Anti-Falsos Positivos)
        # Asegura que las pruebas realmente validen la lógica alterando el AST.
        run: make qa-mutation

      - name: 7️⃣ Compuerta de Certificación 11X (ORM Parity, Orphans y Topología en Docker Regla Cero)
        run: ./.agents/scripts/certify_task_completion.sh

      - name: 8️⃣ Seguridad Dinámica DAST (OWASP ZAP Baseline)
        # Levanta los servicios de persistencia y la API, luego ejecuta ZAP escribiendo reportes en /reports (evita escribir en /zap/wrk:ro).
        # (Nota: Ignorar este paso si es un script Bash o Python Standalone)
        run: |
          make qa-dast

      - name: 9️⃣ Ingeniería del Caos y Observabilidad (Prometheus + Pumba)
        # Activa el perfil chaos sin abortar por códigos de salida de contenedores sidecar.
        # (Nota: Si tu proyecto es un script Bash o Python puro, cambia 'qa-chaos' por 'qa-observability')
        run: make qa-chaos

      - name: 🔟 Archivar Reportes de Calidad (Artefactos)
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        if: always()
        with:
          name: qa-reports
          path: |
            coverage/
            coverage_report/
            reports/
            stryker.html
            zap-report.html
            chaos-report.html
            chaos-report.json
          retention-days: 7

      - name: 1️⃣1️⃣ Limpieza del Entorno
        if: always()
        run: ./scripts/limpieza.sh
```

### 3.1 Compuerta Compuesta PR (`qa-11x-pr-check@v3`), SARIF y Compuertas Diferenciales

Para aplicar verificación rápida en PR sin duplicar YAML, fija la acción compuesta por SHA de commit inmutable de 40 caracteres (`tecno-consultores/qa-testing-blueprints/.github/actions/qa-11x-pr-check@<sha40> # v3`, cumplimiento `SEC-CI-ACTION-REF`; evita etiquetas flotantes `@v3`) junto con las compuertas CLI y `Makefile`:

* **Compuerta Estricta de Release (`certify --strict --release-gate`):** Detiene el pipeline si persisten bloqueantes, tareas pendientes en `ACTIVE_TASK.md`, archivos `.example` sin fusionar o ausencia del sello `lint` (`python3 .agents/scripts/release_readiness_gate.py` en Docker `Rule Zero` / MCP `evaluate_release_gate`).
* **Carga de Seguridad SARIF (`audit --sarif`):** Emite hallazgos estáticos OWASP/STIG (`--fail-on high`) en formato SARIF v2.1.0 para ingesta nativa en GitHub Code Scanning.
* **Radio de Explosión AST y Cobertura Diferencial:** Ejecuta `blast-radius --changed-since origin/main` y `make diff-cov` (`100%` líneas delta, `>= 90%` ramas delta) para validar suites impactadas y cubrir cada fragmento modificado.
* **Atestaciones Firmadas (`make pr-verdict` y `make sbom`):** Genera `PR_VERDICT.md` (`SHA-256` / `HMAC-SHA256` opcional) y artefactos CycloneDX SBOM/CBOM firmados (`ECMA-424`) antes de fusionar.
