> 🌐 **Idioma:** [🇺🇸 English (Canonical)](CONTRIBUTING.md) · **Español (Espejo 1:1)**

# Guía de Contribución (Ecosistema Híbrido Humano + Agentes IA)

¡Gracias por tu interés en mejorar **QA Testing Blueprints**! Este repositorio es la fuente de la verdad para la calidad del código, la seguridad por diseño y la gobernanza técnica de nuestros proyectos.

Este ecosistema está diseñado para ser desarrollado, mantenido y extendido tanto por **desarrolladores e ingenieros humanos** como por **Agentes de Inteligencia Artificial autónomos** (Google Antigravity, Anthropic Claude Code / Desktop, Hermes Agent de Nous Research, Cursor, Windsurf). Toda contribución debe respetar las directivas de calidad corporativa Nivel 11X.

---

## 📜 Reglas de Oro para Contribuir (El Estándar 11X)

Para mantener la consistencia y la eficacia de estos blueprints, toda contribución (humana o automatizada) debe respetar los siguientes principios:

1. **Imágenes Base Inmutables:** En proyectos consumidores y blueprints individuales, nunca propongas cambios que requieran agregar un `Dockerfile` local o la instrucción `build:` en los orquestadores `docker-compose.qa.yml`. Todo debe funcionar utilizando exclusivamente nuestra flota de imágenes oficiales (y para nuevos entornos corporativos como `mobile-appium`, planificar y certificar formalmente la imagen dedicada conforme a [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md)):
   * `sinfallas/base-python-uv` (`3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`) para Python/FastAPI, `ai-evals` y `vibe-rescue`.
   * `sinfallas/base-node-ionic` (`22`, `24`, `26` y `latest`) para Node.js/Vue 3/React, Promptfoo, `@finos/calm-cli` y el Servidor MCP.
   * `sinfallas/base-mobile-appium` (`26` y `latest`) para Móvil Nativo e Híbrido W3C Bridge (`mobile-appium/`: Node.js 26, `pnpm`, OpenJDK 21, Android SDK/ADB, Appium 3, `uiautomator2`, `xcuitest`, WebdriverIO v9).
   * `sinfallas/basephpcomposer` (`8.2`, `8.3`, `8.4`, `8.5` y `latest`) para PHP.
   * `sinfallas/base-bash-qa:latest` para Bash/DevOps.
   * `sinfallas/karatelabs:1.5.1` para contratos BDD/Caja Negra.
   * `sinfallas/remote-graphify:latest` para Optimización de Contexto IA (análisis AST CLI-first).
   * *Nota: Se permite el uso de imágenes oficiales consolidadas exclusivamente para Sidecars periféricos (ej. `prom/prometheus:v2.55.1`, `zaproxy/zap-stable:2.15.0`, `postgres:17-alpine`, `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch), `mcr.microsoft.com/playwright:v1.52.0-noble`).*
   * **REGLA DE CACHÉ Y UID NO-ROOT:** Si agregas una imagen que dependa de un gestor de paquetes (`uv`, `pnpm`, `composer`), DEBES declarar obligatoriamente volúmenes nombrados compatibles con cualquier usuario no-root del host/CI (`-u "$(id -u):$(id -g)"`): ej. `/tmp/uv-cache` con `UV_CACHE_DIR=/tmp/uv-cache` y `COVERAGE_FILE=/tmp/.coverage` en Python, o `pnpm-store:/pnpm` inicializado por `pnpm-store-init` (`chmod -R a+rwX /pnpm`) junto a `HOME=/tmp` y `pnpm_config_store_dir=/pnpm/store` en `sinfallas/base-node-ionic:26` / `sinfallas/base-mobile-appium:26` (`uid=10001`).

2. **Efimeridad Absoluta y Regla Cero (`Rule Zero`):** Toda ejecución de pruebas, linters o scripts debe ocurrir dentro de contenedores efímeros (usando `--rm`). Jamás ejecutes pruebas directamente en el host anfitrión. Las pruebas unitarias jamás deben salir a Internet; el Mocking (`nock`, `pytest-mock`) es obligatorio. Para persistencia y esquemas de base de datos rige la regla **Anti-Mock Blindness** (validación obligatoria contra base de datos real efímera).
3. **Prompts Imperativos y Arquitectura Bilingüe (`Spec 19`):**
   * Las directivas internas para consumo de LLMs en `.agents/rules/` y `.agents/skills/` se redactan en **inglés técnico conciso de alta densidad** para ahorrar un ~35% de tokens BPE.
   * La documentación raíz, gobernanza, guías de onboarding, READMEs por stack (`<stack>/README.{md,es.md}`), `architecture/`, `docs/specs/{README,19,20}*.{md,es.md}` y los manuales operativos profundos (`docs/01..05*.{md,es.md}`) siguen la convención **Inglés Canónico (`*.md`) + Espejo 1:1 en Español (`*.es.md`)** ([`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md), Fases A–D completadas; solo las ADRs históricas `01..18` permanecen en español conforme a la Regla 4).
4. **Umbral de Calidad y Deuda Técnica Innegociables:**
   * Cobertura de código unitario **>= 95%** de líneas y ramas.
   * Complejidad ciclomática Grado **A** (`CC <= 5`, `MI >= A`).
   * Accesibilidad web WCAG 2.1 AA (0 violaciones en `@axe-core`) y rendimiento en Lighthouse **>= 90**.
   * Cumplimiento estricto de **DISA ASD STIG V6R5** y **OWASP Developer Guide v4.2** documentadas en [`SECURITY.es.md`](SECURITY.es.md) y [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md).
5. **IPv4 Estricto:** Toda configuración de red en los `docker-compose.qa.yml` debe utilizar exclusivamente el driver `bridge` estándar en IPv4. Prohibido habilitar `enable_ipv6: true` para evitar conflictos de enrutamiento y NAT.

---

## 🤖 Protocolo Obligatorio para Agentes de Inteligencia Artificial

Si eres un **Agente de IA** (o un desarrollador operando en conjunto con uno) contribuyendo a este repositorio, DEBES acatar incondicionalmente el siguiente ciclo:

1. **Lectura de Directivas:** Lee `.agents/rules/` y `AGENTS.md` antes de generar cualquier propuesta.
2. **Bitácora Activa:** Registra las fases de la tarea atómicamente mediante `.agents/scripts/checkpoint_ctl.py` / MCP `session_flight_recorder` (`0600` `.agents/.cache/session_checkpoint.json` -> proyección determinista `<= 40` líneas en `.agents/ACTIVE_TASK.md` + verificación Git en vivo, sin editar `ACTIVE_TASK.md` manualmente).
3. **Inspección AST Preventiva (*Rule Zero*):** Audita el radio de impacto de símbolos compartidos dentro de un contenedor efímero de solo lectura (`docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"`) antes de modificar código.
4. **Pirámide de Pruebas Obligatoria:** Todo código nuevo o modificado debe incorporar sus correspondientes pruebas unitarias (`>= 95%`) y escenarios BDD en Karate Labs (`api_test.feature` y `ui_business_flow.feature`), actualizando las pruebas preexistentes afectadas (`QA-TEST-SYNC-01`).
5. **Compuerta Universal de Certificación (10/10):** Ejecuta `./.agents/scripts/certify_task_completion.sh` y asegura que las **10 etapas** pasen limpiamente (incluyendo `bump_version_11x.py --check` y `sync_governance.py --check`) antes de concluir en un `git commit` local certificado (`QA-GIT-GATE-01`).
6. **Sincronización Criptográfica del Manifiesto:** Si agregas o modificas plantillas o archivos comunes, regenera `manifest.json` ejecutando `make sync-governance` y verifica con `make version-check`.

---

## 📦 Convención de Archivos `.example` en Blueprints (3 Categorías)

Todos los archivos dentro de los 10 directorios de stack siguen una convención estricta de 3 categorías que separa la infraestructura QA del repositorio de las plantillas hidratables en proyectos consumidores (`sync_governance.py` / `manifest.json`):

1. **Categoría 1 (Sin `.example` — Infraestructura QA Raíz):** `docker-compose.qa.yml` (`copy_if_missing_or_update_qa`) y `limpieza.sh` (`overwrite_executable`) en los 10 stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`). Se ejecutan directamente en este repositorio bajo Regla Cero y se copian/actualizan directamente en proyectos destino.
2. **Categoría 2 (Sin `.example` — Suites Ejecutables Directas Rule Zero / Activos de Runtime):** `tests/**`, `test/*.feature`, `test/*.bats`, `e2e/*.ts`, `mobile-appium/wdio.conf.ts`, `vibe-rescue/audit_vibe_prototype.py`, `vibe-rescue/templates/rls_hardening.sql`, `ai-evals/**/*.py` y `ai-evals/promptfooconfig.yaml`. Ejecutables directamente sin renombrar.
3. **Categoría 3 (Con `.example` — Configs Raíz Merge/Copy y Plantillas de Ejemplo):** `Makefile.example`, `package.json.example`, `pyproject.toml.example`, `tsconfig.json.example`, `vite.config.ts.example`, `vitest.config.ts.example`, `playwright.config.ts.example`, `gitignore.example` (se hidrata a `.gitignore`), `php.ini.example`, `nginx/default.conf.example`, `fastapi/initdb/01-init-rls-role.sql.example` y `fastapi/tests/test_production_no_dev_cleanliness.unit.py.example`. Pierden el sufijo `.example` al hidratarse en proyectos destino mediante `surgical_merge`, `append_missing_lines` o `copy_if_missing`.

---

## 🛠️ Cómo Proponer un Cambio

### Si estás agregando una herramienta técnica o modificando un stack
1. Haz un *fork* del repositorio, crea una rama descriptiva (`git checkout -b feature/agregar-k6-stresstest`) e **instala inmediatamente los hooks de seguridad locales** ejecutando `./instalar-hooks.sh` en tu terminal.
2. Modifica el archivo de configuración (`pyproject.toml.example`, `package.json.example`, etc.) y el orquestador `docker-compose.qa.yml` si es estrictamente necesario. *(Nota: Si agregas herramientas de Profiling como `py-spy` o `clinic.js`, recuerda incluir los privilegios `cap_add: - SYS_PTRACE` y `security_opt: - seccomp:unconfined`)*.
3. Actualiza la documentación correspondiente en `docs/`, `TESTING.md` / `TESTING.es.md` y los `Makefiles` documentando el comando de ejecución exacto.
4. Antes de hacer el commit o Pull Request, ejecuta el saneamiento `./scripts/limpieza.sh` y certifica la suite completa ejecutando `./.agents/scripts/certify_task_completion.sh` en local (**10/10 compuertas en verde**).

### Si estás mejorando la Documentación, MCP o Skills
1. Si mejoras el servidor MCP (`mcp-server/`), verifica todo dentro de Docker efímero (`Rule Zero`): ejecuta `make lint`, `make test-mcp` y `make -C mcp-server qa-all` (`>= 95%` de cobertura, `0` warnings en ESLint/SonarJS y TypeScript estricto).
2. Si actualizas cualquiera de las 11 skills modulares en `.agents/skills/`, mantén el presupuesto cognitivo (`qa-11x-architect/SKILL.md <= 12 KB`, `tactical-patterns-11x/SKILL.md <= 2.5 KB`, resto `< 20 KB`), actualiza `catalogs/skillsllm-manifest.json` y sincroniza `docs/specs/`.
3. Mantén la filosofía de "cero complacencia" y preserva la paridad estructural 1:1 entre parejas bilingües (`*.md` + `*.es.md`).

### Convención de Mensajes de Commit (Fuente Única de Verdad)
* [`lefthook.yml`](lefthook.yml) (hook `commit-msg`, replicado en POSIX por [`instalar-hooks.sh`](instalar-hooks.sh) sin dependencias de Node.js) es la **fuente única de verdad** para validar mensajes de commit.
* Todo encabezado de commit debe seguir Conventional Commits con un límite **`<= 100` caracteres** en la descripción conforme a la expresión regular:
  `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(\([a-z0-9._/-]+\))?!?: .{1,100}$`
* Los alcances deben usar caracteres alfanuméricos en minúsculas (`[a-z0-9._/-]+`); las cabeceras estándar de Git `Merge ` y `Revert "..."` se aceptan automáticamente.

### Pull Request (PR)
Abre un PR detallando:
* **¿Qué tecnología, documento, herramienta MCP o skill estás modificando?**
* **¿Qué problema de calidad, seguridad o gobernanza resuelve?**
* **Evidencia:** Adjunta el log de la terminal demostrando que `./.agents/scripts/certify_task_completion.sh` pasó con éxito (10/10 etapas) y que las pruebas corren en Docker efímero sin requerir privilegios de superusuario en el host.
