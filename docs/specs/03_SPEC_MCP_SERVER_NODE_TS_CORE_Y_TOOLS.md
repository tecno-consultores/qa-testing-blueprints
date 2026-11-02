# ⚙️ Especificación 03: Servidor MCP en Node.js / TypeScript (`@sinfallas/mcp-qa-11x`) — Núcleo, Recursos y Herramientas 1–4

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Directorio de Implementación:** `mcp-server/`  
**Paquete npm:** `@sinfallas/mcp-qa-11x` (o `mcp-qa-11x`)  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Desarrolladores  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Stack Tecnológico y Estructura del Proyecto `mcp-server/`

El servidor MCP se implementará en **Node.js 22+ / TypeScript 5.x** con tipado estricto (`strict: true`), utilizando el SDK oficial **`@modelcontextprotocol/sdk`** y **`zod`** para la validación de esquemas. Toda su validación de calidad se ejecutará en el contenedor efímero oficial `sinfallas/base-node-ionic:26` cumpliendo el estándar 11X (`>= 95%` de cobertura con Vitest, `SonarJS`, `ESLint` y `Stryker`).

### 1.1. Árbol de Archivos Exacto de `mcp-server/`
```text
mcp-server/
├── package.json                          # Configuración npm con bin: mcp-qa-11x, scripts y dependencias
├── tsconfig.json                         # TypeScript strict=true, target=ES2022, module=NodeNext
├── vitest.config.ts                      # Cobertura v8 >= 95% en líneas, ramas, funciones y sentencias
├── .eslintrc.json                        # ESLint + SonarJS + eslint-plugin-security
├── .npmrc                                # ignore-scripts=true (Zero-Trust)
├── docker-compose.qa.yml                 # Contenedor efímero sinfallas/base-node-ionic:26 + karatelabs
├── Makefile                              # make qa-lint, make qa-unit, make qa-mutation, make qa-bdd, make qa-all
├── README.md                             # Documentación del paquete npm y configuración MCP
├── src/
│   ├── index.ts                          # Dispatcher CLI: inicia servidor MCP stdio o ejecuta 'install-skill'
│   ├── server.ts                         # Configuración de McpServer (@modelcontextprotocol/sdk)
│   ├── types.ts                          # Interfaces TypeScript compartidas y esquemas Zod
│   ├── cli/
│   │   └── install-skill.ts              # Subcomando CLI: instala qa-11x-architect desde GitHub verificando SHA-256
│   ├── services/
│   │   ├── github-fetcher.ts             # Hidratación desde GitHub Raw + Caché ~/.cache/qa-11x-blueprints/ + SHA-256
│   │   └── surgical-merger.ts            # Fusión no destructiva de package.json, pyproject.toml, Makefile y .gitignore
│   ├── resources/
│   │   └── blueprint-resources.ts        # Registro de los 4 Resources MCP (blueprint://*)
│   ├── tools/
│   │   ├── inspect-project.ts            # Tool 1: inspect_project_config
│   │   ├── fetch-bundle.ts               # Tool 2: fetch_blueprint_bundle
│   │   ├── bootstrap-merge.ts            # Tool 3: bootstrap_or_merge_11x
│   │   ├── blast-radius.ts               # Tool 4: inspect_ast_blast_radius
│   │   ├── security-auditor.ts           # Tool 5: audit_security_stig_owasp (Detallado en Spec 04)
│   │   ├── ephemeral-runner.ts           # Tool 6: run_ephemeral_qa (Detallado en Spec 04)
│   │   └── certify-gate.ts               # Tool 7: certify_11x_gate (Detallado en Spec 04)
│   └── parsers/
│       └── output-parsers.ts             # Parsers ahorradores de tokens (Detallado en Spec 04)
└── tests/
    ├── github-fetcher.unit.ts
    ├── surgical-merger.unit.ts
    ├── inspect-project.unit.ts
    ├── security-auditor.unit.ts
    ├── output-parsers.unit.ts
    ├── ephemeral-runner.unit.ts
    └── certify-gate.unit.ts
```

---

## 2. Configuración Exacta de `mcp-server/package.json`

```json
{
  "name": "@sinfallas/mcp-qa-11x",
  "version": "2.7.0",
  "description": "Servidor MCP e Instalador de Skill para QA Testing Blueprints (Estándar 11X, DISA ASD STIG V6R5 & OWASP v4.2)",
  "license": "MIT",
  "type": "module",
  "bin": {
    "mcp-qa-11x": "./dist/index.js"
  },
  "files": [
    "dist/**/*",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "pnpm run build",
    "lint": "eslint 'src/**/*.ts' 'tests/**/*.ts'",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --coverage",
    "test:mutation": "stryker run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "@vitest/coverage-v8": "^2.1.8",
    "eslint": "^9.17.0",
    "eslint-plugin-security": "^3.0.1",
    "eslint-plugin-sonarjs": "^2.0.4",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

---

## 3. Especificación del Punto de Entrada (`src/index.ts`)

El archivo `src/index.ts` DEBE incluir el *shebang* `#!/usr/bin/env node` en la primera línea y actuar como enrutador dual:
1. Si `process.argv[2] === "install-skill"`:
   - Ejecuta `runInstallSkillCli(process.argv.slice(3))` para descargar e instalar la Skill `qa-11x-architect` desde GitHub en el directorio de skills del agente o del proyecto actual y termina con `process.exit(0)`.
2. Si se invoca sin argumentos o con `--stdio` (modo por defecto cuando lo llaman Claude Desktop, Antigravity, Cursor o Hermes Agent vía `npx -y @sinfallas/mcp-qa-11x`):
   - Inicia el servidor MCP sobre `StdioServerTransport`.

---

## 4. Especificación de los 4 Recursos MCP (`src/resources/blueprint-resources.ts`)

| URI del Recurso | MIME Type | Descripción y Origen de Datos |
| :--- | :--- | :--- |
| **`blueprint://manifest`** | `application/json` | Devuelve el `manifest.json` actualizado desde GitHub (o caché local verificada) con todos los stacks, archivos `.example` y hashes SHA-256. |
| **`blueprint://core/philosophy`** | `text/markdown` | Devuelve las reglas globales condensadas (`AI_MASTER_PROMPT.md` + las 13 capas de `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`). |
| **`blueprint://security/disa-owasp-22`** | `text/markdown` | Devuelve el catálogo de los 22 patrones de seguridad por diseño (`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`). |
| **`blueprint://{stack}/readme`** | `text/markdown` | Devuelve el prompt operativo del ecosistema solicitado (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`). |

---

## 5. Especificación Detallada de las Herramientas MCP 1 a 4

### Tool 1: `inspect_project_config` (Auditoría Zero-Shot del Proyecto Destino)
- **Propósito:** Inspecciona el directorio del proyecto del usuario antes de escribir código, detectando el stack tecnológico, las herramientas instaladas, las configuraciones estrictas y qué archivos del estándar 11X faltan.
- **Esquema Zod de Entrada:**
  ```typescript
  const InspectProjectInputSchema = z.object({
    project_path: z.string().min(1).describe("Ruta absoluta al directorio del proyecto a auditar"),
  });
  ```
- **Lógica Determinista:**
  1. Verifica que `project_path` exista y sea un directorio (canonicalizando la ruta con `path.resolve` y normalización `NFKC`).
  2. Inspecciona la presencia de `pyproject.toml`, `package.json`, `tsconfig.json`, `Makefile`, `docker-compose.qa.yml`, `lefthook.yml`, `TESTING.md`, `CHANGELOG.md`, `.agents/scripts/certify_task_completion.sh`.
  3. Determina automáticamente el `detected_stacks: string[]`:
     - Si `pyproject.toml` contiene `fastapi` $\rightarrow$ `"fastapi"`, si no $\rightarrow$ `"python"`.
     - Si `package.json` contiene `"vue"` $\rightarrow$ `"vue3"`; si contiene `"react"` $\rightarrow$ `"react-frontend"`; si contiene `"express"` o `"fastify"` o `"@nestjs/core"` $\rightarrow$ `"node-backend"`.
     - Si existen archivos `.sh` o `.bats` $\rightarrow$ `"bash-scripts"`.
- **Salida JSON Estructurada:**
  ```json
  {
    "project_path": "/ruta/al/proyecto",
    "detected_stacks": ["fastapi", "vue3"],
    "has_docker_compose_qa": false,
    "has_makefile": false,
    "has_lefthook": false,
    "has_agents_dir": false,
    "has_testing_md": false,
    "strict_flags": {
      "mypy_strict": true,
      "tsconfig_strict": true,
      "npmrc_ignore_scripts": false
    },
    "missing_11x_files": [
      "docker-compose.qa.yml",
      "Makefile",
      "lefthook.yml",
      ".agents/scripts/certify_task_completion.sh",
      "TESTING.md"
    ],
    "recommended_next_tool": "fetch_blueprint_bundle"
  }
  ```

---

### Tool 2: `fetch_blueprint_bundle` (Hidratación Bajo Demanda desde GitHub)
- **Propósito:** Descarga bajo demanda desde GitHub (vía `manifest.json` + caché local verificada con SHA-256) los archivos `.example`, `docker-compose.qa.yml`, `Makefile.example` y scripts `.agents/` del stack solicitado.
- **Esquema Zod de Entrada:**
  ```typescript
  const FetchBundleInputSchema = z.object({
    stack: z.enum(["python", "fastapi", "node-backend", "vue3", "react-frontend", "bash-scripts"]),
    include_common_and_agents: z.boolean().default(true),
  });
  ```
- **Salida JSON Estructurada:**
  Devuelve la lista de archivos descargados con su `path`, `target_name`, `merge_strategy`, `sha256_verified: true` y su contenido íntegro (`content`).

---

### Tool 3: `bootstrap_or_merge_11x` (Fusión Quirúrgica No Destructiva Automatizada)
- **Propósito:** Inyecta o fusiona de forma quirúrgica y **no destructiva** las plantillas `.example` del stack elegido y la carpeta `.agents/` en el proyecto del usuario, garantizando que **ninguna dependencia de producción ni script de negocio preexistente sea eliminado**.
- **Esquema Zod de Entrada:**
  ```typescript
  const BootstrapMergeInputSchema = z.object({
    project_path: z.string().min(1),
    stack: z.enum(["python", "fastapi", "node-backend", "vue3", "react-frontend", "bash-scripts"]),
    dry_run: z.boolean().default(false).describe("Si es true, devuelve el plan de cambios sin escribir en disco"),
  });
  ```
- **Algoritmo de Fusión Quirúrgica (`src/services/surgical-merger.ts`):**
  1. **`package.json` vs `package.json.example`:**
     - Parsea ambos JSON (verificando que no haya claves duplicadas).
     - Conserva el 100% de `name`, `version`, `dependencies` y `scripts` existentes del usuario.
     - Añade las claves faltantes de `devDependencies` y los scripts `qa:*` / `test:*` del `.example`.
  2. **`pyproject.toml` vs `pyproject.toml.example`:**
     - Si no existe `pyproject.toml`, copia el contenido de `pyproject.toml.example`.
     - Si ya existe, conserva `[project]` y `dependencies` intactos, e inyecta las secciones faltantes `[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`, `[tool.coverage.run]` y `[tool.coverage.report]`.
  3. **`Makefile` vs `Makefile.example`:**
     - Si no existe `Makefile`, escribe `Makefile.example`.
     - Si ya existe, añade al final únicamente los targets `qa-*` (`qa-lint`, `qa-unit`, `qa-mutation`, `qa-bdd`, `qa-all`, etc.) que aún no estén declarados.
  4. **`.gitignore` y `.npmrc`:**
     - Añade únicamente las líneas de `gitignore.example` y `npmrc.example` (`ignore-scripts=true`) que no existan ya en el archivo destino.
  5. **Scripts `.agents/scripts/*.py|*.sh`, `auditar-infra.sh` y `scripts/verificar-secretos.sh`:**
     - Los escribe respetando permisos de ejecución (`chmod 0o755`).

---

### Tool 4: `inspect_ast_blast_radius` (Auditoría de Radio de Impacto Pre-Refactorización)
- **Propósito:** Ejecuta `.agents/scripts/inspect_blast_radius.py` y `verify_topological_health.py` sobre un símbolo o archivo del proyecto para identificar cuántos módulos dependen de él antes de refactorizarlo.
- **Esquema Zod de Entrada:**
  ```typescript
  const BlastRadiusInputSchema = z.object({
    project_path: z.string().min(1),
    target_symbol: z.string().min(1).describe("Nombre de la función, clase, modelo o módulo a modificar"),
  });
  ```
- **Salida JSON Estructurada:**
  Devuelve el nivel de riesgo (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), la lista de archivos dependientes y las pruebas que deben re-ejecutarse.
