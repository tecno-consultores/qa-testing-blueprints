# 📐 Especificación 01: Arquitectura Zero-Clone, Hidratación desde GitHub y Manifiesto Criptográfico

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Versión Objetivo:** 2.8.0 / 3.0.0  
**Audiencia de Ejecución:** Ingenieros Humanos y Modelos de Ejecución Rápida (Gemini 3.8 Flash High / Claude / Antigravity)  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Propósito y Resumen Ejecutivo

Esta especificación define la arquitectura **Zero-Clone** del ecosistema **QA Testing Blueprints (11X)**. Su objetivo es permitir que cualquier desarrollador humano o Agente de Inteligencia Artificial adopte, audite y ejecute el estándar corporativo 11X en cualquier proyecto **sin necesidad de clonar manualmente este repositorio**.

La arquitectura se compone de tres pilares acoplados:
1. **Manifiesto Remoto Firmado (`manifest.json`):** Índice JSON en la raíz del repositorio en GitHub que lista todos los archivos `.example`, orquestadores `docker-compose.qa.yml`, `Makefile.example`, reglas `.agents/rules/`, scripts `.agents/scripts/` y referencias de seguridad con su ruta relativa, ecosistema y hash criptográfico **SHA-256** (cumpliendo **DISA ASD STIG V6R5 `V-222513` / `APSC-DV-001430`**).
2. **Servidor MCP y CLI en Node.js (`@sinfallas/mcp-qa-11x` o `mcp-qa-11x`):** Paquete distribuido en el registro oficial de **npm**, ejecutable al vuelo mediante `npx -y @sinfallas/mcp-qa-11x`, que expone tanto las herramientas MCP (Resources + Tools) como el subcomando CLI `install-skill`.
3. **Skill Cognitiva (`qa-11x-architect`):** Habilidad multi-agente con carga progresiva (*Progressive Disclosure*) que guía el razonamiento del agente y descarga bajo demanda desde GitHub únicamente los archivos `.example` del stack detectado.

---

## 2. Diagrama Arquitectónico de Flujo (Zero-Clone + Hidratación Bajo Demanda)

```mermaid
flowchart TD
    subgraph "Máquina del Usuario / Entorno del Agente (Sin clonar repo)"
        USER["Desarrollador / Agente IA<br>(Antigravity, Claude, Cursor, Gemini)"]
        SKILL["Skill: qa-11x-architect<br>(SKILL.md + references/)"]
        MCP["Servidor MCP Node.js<br>(npx -y @sinfallas/mcp-qa-11x)"]
        CACHE["Caché Local Verificada<br>(~/.cache/qa-11x-blueprints/)"]
        DOCKER["Contenedores Efímeros Rule Zero<br>(sinfallas/*, postgres:17, keydb)"]
    end

    subgraph "Fuente Única de Verdad (GitHub)"
        GH_MANIFEST["raw.githubusercontent.com/.../manifest.json<br>(Rutas + Hashes SHA-256)"]
        GH_FILES["Archivos .example, Makefiles,<br>docker-compose.qa.yml, .agents/scripts/"]
    end

    USER -->|1. Solicita inicializar o auditar QA 11X| SKILL
    SKILL -->|2a. Entorno con MCP| MCP
    SKILL -->|2b. Entorno sin MCP (Fallback curl)| GH_MANIFEST
    MCP -->|3. Consulta ETag / Descarga selectiva| GH_MANIFEST
    GH_MANIFEST --> GH_FILES
    GH_FILES -->|4. Verifica SHA-256 y almacena| CACHE
    CACHE -->|5. Fusión Quirúrgica No Destructiva| USER
    MCP -->|6. Ejecuta make qa-* y resume logs a JSON| DOCKER
```

---

## 3. Especificación del Manifiesto Remoto (`manifest.json`)

### 3.1. Ubicación del Archivo
- Ruta en el repositorio: `/manifest.json` (raíz del repositorio).
- URL Pública Raw en GitHub:
  `https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/manifest.json`

### 3.2. Esquema JSON Exacto de `manifest.json`
El archivo `manifest.json` DEBE respetar estrictamente la siguiente estructura:

```json
{
  "schema_version": "1.0.0",
  "blueprint_version": "2.7.0",
  "generated_at_utc": "2026-11-02T21:30:00Z",
  "repository": "tecno-consultores/qa-testing-blueprints",
  "default_branch": "main",
  "raw_base_url": "https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main",
  "stacks": {
    "python": {
      "description": "Scripts Standalone y Librerías en Python",
      "readme": "python/README.md",
      "files": [
        {
          "path": "python/docker-compose.qa.yml",
          "target_name": "docker-compose.qa.yml",
          "merge_strategy": "copy_if_missing_or_update_qa",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 1234
        },
        {
          "path": "python/Makefile.example",
          "target_name": "Makefile",
          "merge_strategy": "surgical_merge",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 1520
        },
        {
          "path": "python/pyproject.toml.example",
          "target_name": "pyproject.toml",
          "merge_strategy": "surgical_merge",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 2100
        },
        {
          "path": "python/tox.ini.example",
          "target_name": "tox.ini",
          "merge_strategy": "surgical_merge",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 640
        },
        {
          "path": "python/gitignore.example",
          "target_name": ".gitignore",
          "merge_strategy": "append_missing_lines",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 410
        },
        {
          "path": "python/limpieza.sh",
          "target_name": "limpieza.sh",
          "merge_strategy": "overwrite_executable",
          "sha256": "<hash_sha256_64_hex>",
          "size_bytes": 890
        }
      ]
    },
    "fastapi": {
      "description": "APIs Backend Asíncronas en Python (FastAPI + PostgreSQL 17 + KeyDB)",
      "readme": "fastapi/README.md",
      "files": []
    },
    "node-backend": {
      "description": "Microservicios Backend en Node.js / TypeScript (Express / Fastify)",
      "readme": "node-backend/README.md",
      "files": []
    },
    "vue3": {
      "description": "Frontend Web en Vue 3 + TypeScript + Vite",
      "readme": "vue3/README.md",
      "files": []
    },
    "react-frontend": {
      "description": "Frontend Web en React + TypeScript + Vite",
      "readme": "react-frontend/README.md",
      "files": []
    },
    "bash-scripts": {
      "description": "Scripts DevOps y Automatización en Bash / POSIX Shell",
      "readme": "bash-scripts/README.md",
      "files": []
    }
  },
  "common_files": [
    {
      "path": "lefthook.yml",
      "target_name": "lefthook.yml",
      "merge_strategy": "surgical_merge",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 950
    },
    {
      "path": "commitlint.config.js",
      "target_name": "commitlint.config.js",
      "merge_strategy": "copy_if_missing",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 320
    },
    {
      "path": "auditar-infra.sh",
      "target_name": "auditar-infra.sh",
      "merge_strategy": "overwrite_executable",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 1150
    },
    {
      "path": "scripts/verificar-secretos.sh",
      "target_name": "scripts/verificar-secretos.sh",
      "merge_strategy": "overwrite_executable",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 1420
    }
  ],
  "agent_governance_files": [
    {
      "path": "AGENTS.md",
      "target_name": "AGENTS.md",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 4800
    },
    {
      "path": ".agents/rules/mandatory_qa_pyramid_and_doc_sync.md",
      "target_name": ".agents/rules/mandatory_qa_pyramid_and_doc_sync.md",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 2400
    },
    {
      "path": ".agents/rules/secure_development_and_testing_guidelines.md",
      "target_name": ".agents/rules/secure_development_and_testing_guidelines.md",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 6900
    },
    {
      "path": ".agents/scripts/certify_task_completion.sh",
      "target_name": ".agents/scripts/certify_task_completion.sh",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 3100
    },
    {
      "path": ".agents/scripts/verify_alembic_orm_parity.py",
      "target_name": ".agents/scripts/verify_alembic_orm_parity.py",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 3200
    },
    {
      "path": ".agents/scripts/verify_zero_orphan_vue_components.py",
      "target_name": ".agents/scripts/verify_zero_orphan_vue_components.py",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 3100
    },
    {
      "path": ".agents/scripts/verify_json_no_duplicate_keys.py",
      "target_name": ".agents/scripts/verify_json_no_duplicate_keys.py",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 2600
    },
    {
      "path": ".agents/scripts/inspect_blast_radius.py",
      "target_name": ".agents/scripts/inspect_blast_radius.py",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 5400
    },
    {
      "path": ".agents/scripts/verify_topological_health.py",
      "target_name": ".agents/scripts/verify_topological_health.py",
      "sha256": "<hash_sha256_64_hex>",
      "size_bytes": 3800
    }
  ]
}
```

---

## 4. Especificación del Script Generador (`scripts/generar-manifiesto.py`)

Para evitar mantener los hashes SHA-256 a mano cada vez que se modifique un archivo `.example` o una regla en `.agents/`, se DEBE crear el script determinista `scripts/generar-manifiesto.py` e integrarlo en `.agents/scripts/certify_task_completion.sh`.

### 4.1. Reglas de Transformación de `target_name` y `merge_strategy`
1. Si el nombre del archivo termina en `.example`:
   - `gitignore.example` $\rightarrow$ `target_name = ".gitignore"`, `merge_strategy = "append_missing_lines"`.
   - `npmrc.example` $\rightarrow$ `target_name = ".npmrc"`, `merge_strategy = "append_missing_lines"`.
   - Cualquier otro `<nombre>.<ext>.example` (ej. `pyproject.toml.example`, `package.json.example`, `Makefile.example`, `vitest.config.ts.example`) $\rightarrow$ `target_name = "<nombre>.<ext>"`, `merge_strategy = "surgical_merge"`.
2. Si el archivo es `docker-compose.qa.yml` $\rightarrow$ `target_name = "docker-compose.qa.yml"`, `merge_strategy = "copy_if_missing_or_update_qa"`.
3. Si el archivo termina en `.sh` o `.py` dentro de `.agents/scripts/` o `scripts/` $\rightarrow$ `merge_strategy = "overwrite_executable"`.
4. Si el archivo es `.feature`, `.bats` o `.spec.ts` dentro de `test/` o `e2e/` $\rightarrow$ `merge_strategy = "copy_if_missing"`.

### 4.2. Verificación en Compuerta Pre-Commit (`certify_task_completion.sh`)
- `scripts/generar-manifiesto.py --check` verificará que `manifest.json` esté 100% sincronizado con los hashes SHA-256 reales del árbol de trabajo. Si difiere, regenerará `manifest.json` o fallará con código de salida `1` indicando que se debe ejecutar `python3 scripts/generar-manifiesto.py`.

---

## 5. Protocolo de Hidratación Remota y Caché Local (`GitHubFetcher`)

Tanto el servidor MCP como el instalador de la Skill seguirán este algoritmo exacto de resolución de archivos:

1. **Modo Override Local (Opcional para Desarrollo Interno):**
   - Si existe la variable de entorno `QA_BLUEPRINTS_LOCAL_PATH` y apunta a un directorio válido con `manifest.json`, lee directamente del sistema de archivos local sin hacer peticiones HTTP.
2. **Modo Estándar Zero-Clone (Hidratación desde GitHub Raw + Caché):**
   - Directorio de caché local por defecto: `~/.cache/qa-11x-blueprints/` (o `$XDG_CACHE_HOME/qa-11x-blueprints/`).
   - Archivo de metadatos de caché: `~/.cache/qa-11x-blueprints/cache-meta.json` (almacena `etag` del `manifest.json` y `last_checked_ms`).
   - Cuando se solicita el manifiesto o los archivos de un `stack`:
     1. Descarga `manifest.json` desde `https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/manifest.json` enviando cabecera `If-None-Match: <etag_previo>` y timeout estricto de `5000 ms`.
     2. Para cada archivo requerido del stack solicitado (`files` + `common_files` + `agent_governance_files`):
        - Comprueba si existe en `~/.cache/qa-11x-blueprints/files/<path>` y si su hash SHA-256 calculado coincide exactamente con el `sha256` declarado en `manifest.json`.
        - Si **coincide**: sirve el archivo instantáneamente desde disco (`0 ms` de red).
        - Si **no existe o el hash cambió**: descarga el archivo desde `raw_base_url + "/" + path`, calcula su SHA-256 en memoria (`crypto.createHash('sha256')`), verifica que coincida con `manifest.json` (**DISA STIG `V-222513`**, abortando si hay discrepancia o corrupción), y lo guarda atómicamente en la caché local.
3. **Modo Offline / Fallback Resiliente:**
   - Si no hay conexión a internet o GitHub responde con error `5xx` / timeout, utiliza la copia existente en `~/.cache/qa-11x-blueprints/` o las plantillas esenciales pre-empaquetadas en el paquete npm/skill, emitiendo una advertencia no bloqueante (`offline_fallback: true`).
