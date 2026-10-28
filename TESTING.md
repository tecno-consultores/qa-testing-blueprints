# 🛡️ Cuadro de Mando de Aseguramiento de Calidad (TESTING.md) — Estándar Corporativo 11X

Este documento constituye la bitácora viva y certificación del estándar de calidad Nivel 11X para los blueprints del repositorio `qa-testing-blueprints`. Todos los ecosistemas incluidos son evaluados bajo la **Regla Cero** (`Rule Zero`): ejecución estricta y 100% aislada en contenedores Docker efímeros.

---

## 1. Métricas Globales y Umbrales Innegociables

| Dimensión de Calidad | Herramienta Canónica | Umbral Mínimo Requerido | Acción ante Incumplimiento |
| :--- | :--- | :--- | :--- |
| **Cobertura Unitaria** | `pytest-cov`, `vitest`, `kcov` | **$\ge 95.0\%$** de líneas y ramas | Bloqueo inmediato de Merge / Exit Code 1 |
| **Complejidad Ciclomática** | `radon` (Python), `eslint-plugin-sonarjs` | Grado **A** o **B** (Cognitiva $\le 15$) | Rechazo por deuda técnica |
| **Mantenibilidad** | `radon mi` | Grado **A** ($> 20$) | Refactorización obligatoria |
| **Seguridad Estática (SAST)** | `bandit`, `eslint-plugin-security`, `ShellCheck` | **0 hallazgos HIGH / MEDIUM** | Bloqueo por vulnerabilidad |
| **CVEs en Dependencias** | `uv pip audit`, `pnpm audit`, `trivy` | **0 vulnerabilidades CRITICAL / HIGH** | Bloqueo de suministro de software |
| **Seguridad Dinámica (DAST)**| `zaproxy/zap-stable` (OWASP ZAP) | **0 alertas HIGH**, cabeceras auditadas | Bloqueo dinámico en CI/CD |
| **Pruebas de Mutación** | `mutmut`, `stryker` | Puntuación de mutación $> 80\%$ | Rechazo por asertos débiles |
| **Comportamiento BDD** | `sinfallas/karatelabs:latest` (Gherkin) | **100% de escenarios PASSED** | Bloqueo de flujo funcional |
| **Paridad de Esquema DB** | `.agents/scripts/verify_alembic_orm_parity.py` | **0 tablas huérfanas / drift = 0** | Rechazo por Anti-Mock Blindness |
| **Componentes Huérfanos** | `.agents/scripts/verify_zero_orphan_vue_components.py` | **0 componentes sin test unitario** | Bloqueo en pre-commit |
| **Accesibilidad Web** | `@axe-core/playwright` | **0 violaciones WCAG 2.1 AA** | Rechazo de interfaz táctica |
| **Rendimiento Frontend** | `Lighthouse CI` | **Puntuación $\ge 90$** (Core Web Vitals) | Bloqueo de compilación estática |
| **Secret Scanning** | `./scripts/verificar-secretos.sh` | **0 secretos / API keys en código** | Rechazo en pre-commit |

---

## 2. Matriz de Ecosistemas Tecnológicos y Comandos Efímeros

### ⚡ FastAPI (Backend Python) — 13 Capas
* **Imagen Base:** `sinfallas/base-python-uv:3.13`
* **Persistencia:** `postgres:17-alpine` + `eqalpha/keydb:alpine`
* **Comandos de Validación:**
  ```bash
  cd fastapi
  make qa-lint       # Ruff, Mypy strict, Bandit SAST, Radon complejidad
  make qa-unit       # Pytest aislado con mocks de red (Cobertura >= 95%)
  make qa-parity     # Verificación de esquema real PostgreSQL y migraciones Alembic
  make qa-contracts  # Schemathesis fuzzing de OpenAPI
  make qa-bdd        # Karate Labs BDD (test/api_test.feature)
  make qa-mutation   # Mutmut auditoría de asertos
  make qa-dast       # OWASP ZAP Baseline Scan contra http://api:8000
  make qa-chaos      # Pumba jitter + Locust concurrencia + Prometheus RED
  make qa-all        # Suite completa 11X
  ```

### 🟢 Vue 3 (Frontend TypeScript) — Alta Densidad Táctica
* **Imagen Base:** `sinfallas/base-node-ionic:26`
* **Servidor Web:** `nginx:alpine` + `nginx-prometheus-exporter`
* **Comandos de Validación:**
  ```bash
  cd vue3
  make qa-lint       # ESLint, Prettier, SonarJS, vue-tsc typecheck
  make qa-unit       # Vitest en jsdom con aislamiento total (>= 95%)
  make qa-orphans    # Auditoría de 0 componentes .vue sin test dedicado
  make qa-mutation   # Stryker mutantes en templates y lógica
  make qa-bdd        # Karate Labs UI en Chrome Headless (test/ui_business_flow.feature)
  make qa-e2e        # Playwright regresión visual + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (Core Web Vitals >= 90)
  make qa-all        # Pipeline completo
  ```

### 🟩 Node.js (Microservicios Express/Fastify)
* **Imagen Base:** `sinfallas/base-node-ionic:26`
* **Comandos de Validación:**
  ```bash
  cd node-backend
  make qa-lint       # ESLint, SonarJS, Prettier, audit dependencias
  make qa-unit       # Vitest + Nock aislamiento de red (>= 95%)
  make qa-mutation   # Stryker
  make qa-e2e        # Karate Labs BDD en http://api:3000
  make qa-dast       # OWASP ZAP Baseline Scan
  make qa-stress     # Pumba inyección de latencia + Artillery
  ```

### 🐍 Python Standalone (Librerías y CLI)
* **Imagen Base:** `sinfallas/base-python-uv:3.13`
* **Comandos de Validación:**
  ```bash
  cd python
  make qa-lint       # Ruff, Mypy, Bandit, Radon
  make qa-unit       # Pytest + Pytest-BDD + Pytest-Benchmark (>= 95%)
  make qa-mutation   # Mutmut
  make qa-all        # Ejecución consolidada
  ```

### ⚛️ React (Frontend Vite / TypeScript)
* **Imagen Base:** `sinfallas/base-node-ionic:26`
* **Comandos de Validación:**
  ```bash
  cd react-frontend
  make qa-lint       # ESLint, React Hooks plugin, SonarJS
  make qa-unit       # Vitest + React Testing Library (>= 95%)
  make qa-mutation   # Stryker
  make qa-e2e        # Playwright visual regression + Axe
  ```

### 🐧 Bash / DevOps Scripts
* **Imagen Base:** `sinfallas/base-bash-qa:latest`
* **Comandos de Validación:**
  ```bash
  cd bash-scripts
  make qa-lint       # ShellCheck (0 errores/warnings) + shfmt POSIX
  make qa-unit       # BATS-core + bats-mock + kcov (>= 95%)
  ```

---

## 3. Compuerta de Certificación Pre-Commit (`certify_task_completion.sh`)

Antes de autorizar cualquier integración de código o cerrar una tarea técnica, se debe ejecutar la compuerta universal de certificación:

```bash
./.agents/scripts/certify_task_completion.sh
```

El script evalúa de forma secuencial e implacable 7 compuertas obligatorias:
1. **[1/7] Secret Scanning:** Detección de claves privadas, tokens y credenciales vía `scripts/verificar-secretos.sh`.
2. **[2/7] Local Dependency & IaC Security Audit:** Escaneo estático de vulnerabilidades y manifiestos Docker Compose con Trivy (`scripts/auditar-infra.sh`).
3. **[3/7] Database Schema & Migration Parity:** Inspección de modelos SQLAlchemy frente a migraciones Alembic (`verify_alembic_orm_parity.py`).
4. **[4/7] Zero Orphan Components:** Verificación determinista de cobertura unitaria para el 100% de componentes UI (`verify_zero_orphan_vue_components.py`).
5. **[5/7] No Duplicate JSON Keys:** Prevención de colisiones y sobreescrituras en diccionarios (`verify_json_no_duplicate_keys.py`).
6. **[6/7] Topological Health & AST Layer Boundaries:** Validación de acoplamiento y límites de capas arquitectónicas (`verify_topological_health.py`).
7. **[7/7] Documentation Synchronization:** Verificación incondicional de consistencia en `CHANGELOG.md`, `TESTING.md` y `README.md`.
