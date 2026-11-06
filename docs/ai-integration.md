# Integración Autónoma con Agentes de IA

Este documento detalla cómo evolucionar de una interacción manual a un flujo de trabajo automatizado, donde los agentes de Inteligencia Artificial ingieren, aplican y ejecutan los *blueprints* de QA de forma autónoma.

## 1. Ingestión de Reglas mediante MCP (Model Context Protocol)
Para que un agente comprenda las restricciones corporativas en tiempo real, los *blueprints* deben exponerse como recursos dinámicos.

* **El Concepto:** Evita darle a la IA acceso irrestricto de lectura a todo tu disco duro. Usa un servidor MCP para exponer únicamente las reglas y el código que necesita de forma comprimida.
* **Ejemplo Práctico 1 (Implementación Nivel 11X para Código):** En lugar de dar acceso de lectura a todo el disco, nuestro ecosistema integra el perfil oculto `--profile graphify` con el motor `sinfallas/remote-graphify:latest`. Antes de programar, la IA puede extraer el grafo semántico y levantar el servidor MCP efímero si es un agente externo (Hermes, Claude):

```bash
  docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "graphify extract --code-only"
  docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
```
* Luego, el agente externo se conecta por SSE a `http://localhost:8080/sse` para consultar la topología, ahorrando miles de tokens en OmniRoute.
* **Invariante CLI-First para Agentes con Shell (Antigravity):** Si el agente posee capacidades nativas de ejecución en consola, DEBE ejecutar las inspecciones de topología y radio de impacto directamente mediante scripts locales (`python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` o `.agents/scripts/verify_topological_health.py`), evitando explícitamente ocupar el puerto 8080 o dejar procesos en segundo plano.
* **Ejemplo Práctico 2 (Recursos Custom para Documentación):** Configura un servidor MCP que exponga los archivos `.md` como *Recursos* estáticos (URIs). Cuando el agente detecta que está en un proyecto Python, consulta `blueprints://python/fastapi`. El servidor lee el archivo local y le devuelve el prompt inyectando la regla inquebrantable del 95% de cobertura.
* **Ejemplo Práctico 3 (Lectura Proactiva de Configuraciones QA):** El servidor MCP o la inspección estática no solo debe evaluar la topología. Debe auditar proactivamente los archivos de configuración de QA (como `pyproject.toml`, `.eslintrc.json`, `tsconfig.json`, `vitest.config.ts`) antes de escribir código.
  * **Regla Inquebrantable a inyectar al Agente Developer:** "Si el Agente Developer va a escribir código, su primer paso autónomo debe ser leer las reglas de linters y tipado, para generar código que cumpla con el estándar estricto (ej. `strict=true` en Mypy) desde el primer intento, ahorrando ciclos de auto-corrección (tokens)."

## 2. Orquestación Multi-Agente (Arquitecturas tipo Pantheon / Hermes)
Las pruebas de alta exigencia (mutación, SAST, BDD) abruman el contexto si un solo agente intenta programar la aplicación y auditarla al mismo tiempo. Se debe implementar una separación de roles.

* **El Concepto:** Un Agente Developer escribe el código; un Agente Auditor (QA) vigila que se cumplan las reglas del *blueprint*.
* **Sugerencia de Implementación (System Prompt para el Agente QA):**
  > *"Eres un auditor de QA implacable. Tu única fuente de la verdad es el archivo de reglas ingerido vía MCP o `.agents/rules/`. Si el Agente Developer propone comandos crudos locales como `pip install`, `npm run test` o intenta construir comandos largos de Docker, RECHAZA el código. Exígele estrictamente usar los comandos predefinidos en el `Makefile` (ej. `make qa-unit`, `make qa-all`) para aislar la infraestructura e invocar dependencias en los volúmenes de caché."*
* **Flujo:** Si el Developer crea un script de Bash destructivo sin usar `bats-mock`, el Agente QA intercepta el paso y obliga a refactorizar la prueba antes de dar el trabajo por terminado.

## 3. Optimización del Contexto con Proxies de Inferencia (OmniRoute)
El ciclo de auto-corrección consume masivamente tokens de entrada, especialmente al procesar volcados de error largos o reportes de cobertura en HTML.

* **El Concepto:** No gastes tokens de modelos de alto razonamiento (y alto costo) en arreglar un problema de espacios en blanco.
* **Ejemplo de Enrutamiento (Routing):**
  * **Tareas Mecánicas:** Configura OmniRoute para enrutar los errores de `shfmt`, `ShellCheck` o `Ruff` hacia un modelo local rápido y económico (ej. *Llama 3 8B* o *Hermes 3 8B*). Esta misma regla aplica para las herramientas de linting y formateo como `ESLint` y `Prettier`. Corregir indentación o punto y coma no requiere inteligencia avanzada.
  * **Tareas Lógicas:** Si una prueba de mutación en `Stryker` o `mutmut` falla, o hay un interbloqueo reportado por `Artillery`, enruta ese volcado al modelo de más alto razonamiento (ej. *Hermes 3 70B* o *Claude 3.5 Sonnet*), ya que requiere analizar el flujo de negocio para entender por qué la prueba es defectuosa. De igual manera, los reportes de análisis de deuda técnica y complejidad generados por `radon` o `eslint-plugin-sonarjs` deben ser procesados por los modelos mayores.

## 4. Sandboxing: Permisos de Ejecución (Tool Calling)
El ecosistema de `qa-testing-blueprints` está diseñado intencionalmente para ser el entorno de juegos de la IA. Como todas las pruebas ocurren en contenedores que se autodestruyen y se encapsulan tras comandos `make`, es seguro darle a la IA acceso de ejecución.

* **El Concepto:** Proporcionar al agente una herramienta (`tool_call`) para ejecutar comandos en la terminal, pero bloqueando el acceso al host real.
* **Ejemplo Práctico de Restricción (Python):** En la definición de tu herramienta para la IA, aplica una validación estricta antes de invocar el subproceso, forzando el uso exclusivo de los *Makefiles*:

```python
  def ejecutar_comando_qa(comando: str) -> str:
      if not comando.startswith("make qa-") and comando != "make clean-cache" and not comando.startswith("./.agents/scripts/"):
          return "ERROR: Operación denegada. Política corporativa: Solo puedes auditar usando las metas del Makefile estandarizado (ej. 'make qa-lint', 'make qa-unit') o compuertas de .agents/scripts/."
      
      resultado = subprocess.run(comando, shell=True, capture_output=True, text=True)
      return resultado.stdout if resultado.returncode == 0 else resultado.stderr
```

* **El Bucle Autónomo de Observabilidad:** El agente ejecuta las pruebas y evalúa el `stderr`. Si `kcov` reporta solo un 85% de cobertura, o si la IA levanta el perfil `--profile chaos` y detecta mediante peticiones al endpoint `http://localhost:9090/api/v1/query` (Prometheus) que la latencia (P99) sobrepasa los umbrales corporativos, la IA comprende la falla, reescribe el código de negocio en su propio entorno interno y vuelve a invocar la herramienta de estrés hasta lograr el estándar.

## 5. Gobernanza Bimodal `.agents/` y Compuerta de 10 Pasos
En proyectos de grado corporativo, la IA debe seguir una directriz bimodal estricta:
1. **Reglas en Inglés Técnico de Alta Densidad:** Las instrucciones en `.agents/rules/` y habilidades en `.agents/skills/` están optimizadas para reducir el consumo de tokens BPE (~35%) y maximizar la precisión lógica de los modelos LLM.
2. **Documentación Humana en Español:** Todo informe, documentación en `docs/`, `CHANGELOG.md`, `ROADMAP.md` y mensajes para el usuario se redactan en español pulcro.
3. **Compuerta de Certificación Obligatoria (`certify_task_completion.sh`):** Antes de concluir cualquier tarea que modifique código o arquitectura, la IA debe ejecutar los 10 pasos de certificación:
   - Secret Scanning (`scripts/verificar-secretos.sh`).
   - Auditoría de Infraestructura y Contenedores (`scripts/auditar-infra.sh` / Trivy).
   - Integridad de Archivos JSON sin claves duplicadas (`verify_json_no_duplicate_keys.py`).
   - Cero Componentes UI Huérfanos (`verify_zero_orphan_vue_components.py`).
   - Cero Endpoints de API Huérfanos (`verify_no_orphan_api_endpoints.py`).
   - Salud Topológica y Aislamiento de Capas (`verify_topological_health.py`).
   - Paridad ORM y Esquemas Relacionales (`verify_alembic_orm_parity.py`).
   - Sincronización Criptográfica del Manifiesto Remoto (`manifest.json`).
   - Consistencia Interna de ROADMAP.md y ACTIVE_TASK.md (`verify_roadmap_consistency.py`).
   - Sincronización incondicional de documentación y pruebas obligatorias (`CHANGELOG.md`, `TESTING.md`, `README.md`).

---

## 6. Servidor MCP Zero-Clone (`@sinfallas/mcp-qa-11x`) — 1 Comando vía `npx`

El paquete oficial de Node.js **`@sinfallas/mcp-qa-11x`** permite a cualquier Agente de IA o desarrollador utilizar todo el arsenal metodológico y de validación 11X sin clonar el repositorio completo, resolviendo dependencias bajo demanda con verificación criptográfica SHA-256 (`DISA STIG V-222513`).

### 6.1. Ejecución Directa en 1 Comando

```bash
# Levantar el servidor MCP directamente (comunicación stdio):
npx -y @sinfallas/mcp-qa-11x@latest

# Instalación completa recomendada en un repositorio (instala las 5 Skills, scripts .agents/scripts/* e inyecta el conector en AGENTS.md):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts

# Instalación con todas las opciones explícitas (especificando entorno de destino):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|hermes|all] --init-agents --include-scripts

# O inyectar/actualizar únicamente el conector QA 11X en AGENTS.md de forma aditiva y no destructiva:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--dry-run]
```

#### Parámetros del instalador `install-skill`:
* **`--target, -t <entorno>`:** Destino de instalación de las 5 skills (`auto` por defecto, `workspace`, `antigravity`, `claude`, `cursor`, `hermes` o `all`).
* **`--init-agents`:** Crea `AGENTS.md` o agrega al final del existente el bloque conector canónico de QA 11X sin sobrescribir reglas previas.
* **`--include-scripts`:** Descarga en el directorio actual todos los scripts de certificación (`.agents/scripts/*` y `scripts/*`) con permisos `0o755`.

### 6.2. Configuración en Clientes de IA

#### A. Claude Desktop / Claude Code (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
    }
  }
}
```

#### B. Cursor IDE (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
    }
  }
}
```

#### C. Google Antigravity / Gemini CLI (`mcp_config.json`)
```json
{
  "servers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
    }
  }
}
```

#### D. Hermes Agent (`config.yaml`)
```yaml
mcp_servers:
  qa_11x:
    command: "npx"
    args: ["-y", "@sinfallas/mcp-qa-11x@latest"]
```

### 6.3. Catálogo de Recursos MCP Expuestos (`blueprint://*`)

| URI del Recurso | Tipo MIME | Descripción Operativa |
| :--- | :--- | :--- |
| `blueprint://manifest` | `application/json` | Manifiesto criptográfico completo con hashes SHA-256 de todos los stacks y archivos. |
| `blueprint://core/philosophy` | `text/markdown` | Prompt maestro y filosofía Level-11X (`AI_MASTER_PROMPT.md`). |
| `blueprint://security/disa-owasp-22` | `text/markdown` | Síntesis técnica de los 22 patrones DISA ASD STIG V6R5 y OWASP Developer Guide v4.2. |
| `blueprint://{stack}/readme` | `text/markdown` | Guía operativa y lista de archivos canónicos del stack solicitado (`fastapi`, `vue3`, etc.). |
| `blueprint://ui/refactoring-ui/{topic}` | `text/markdown` | Pautas de diseño táctico, jerarquía visual, espaciado y contraste WCAG 2.1 AA. |
| `blueprint://core/active-task-template`| `text/markdown` | Plantilla canónica de bitácora resiliente para agentes de IA (`ACTIVE_TASK.md.example`). |
| `blueprint://core/cleanup-script` | `text/x-shellscript` | Script universal de saneamiento y purga segura sin sudo (`scripts/limpieza.sh`). |
| `blueprint://core/roadmap-validator` | `text/x-python` | Script de validación de consistencia de hoja de ruta (`verify_roadmap_consistency.py`). |

### 6.4. Catálogo de Herramientas MCP (`Tools`)

| Herramienta | Argumentos Principales | Propósito Operativo |
| :--- | :--- | :--- |
| **`inspect_project_config`** | `project_path` | Audita stacks presentes (`python`, `fastapi`, `node`, `vue3`, `react`, `bash`, `php`), configuraciones de linters/tipado y disponibilidad de pruebas en navegador real (`BrowserTestingReadiness`). |
| **`fetch_blueprint_bundle`** | `stack`, `include_common_and_agents` | Descarga bajo demanda todos los archivos del stack con verificación criptográfica SHA-256. |
| **`bootstrap_or_merge_11x`** | `project_path`, `stack`, `dry_run` | Aplica una fusión quirúrgica no destructiva inyectando configuraciones QA sin alterar dependencias. |
| **`inspect_ast_blast_radius`** | `project_path`, `target_symbol` | Analiza el radio de impacto de un símbolo combinando `graphify-out/graph.json` y escaneo estático, informa si existe el grafo AST (`ast_graph_detected`), ordena crearlo con `./scripts/actualizar-grafos-graphify.sh` si falta y recuerda actualizarlo al terminar. |
| **`clean_workspace_11x`** | `project_path`, `dry_run`, `deep_prune` | Sanea artefactos temporales de pruebas y cachés de Docker (soporta modo simulación y fallback Alpine). |
| **`audit_security_stig_owasp`**| `project_path` | Audita estáticamente 11 reglas DISA/OWASP (`SEC-01` a `SEC-11`, incluyendo anti-UUID en `actor_username` y prohibición de mocks ciegos en `write_audit_log`) y ergonomía visual/operativa (`UI-11X-01` y `UI-11X-02`). |
| **`run_ephemeral_qa`** | `project_path`, `stage`, `timeout_seconds` | Ejecuta targets del `Makefile` en Docker efímero bajo la Regla Cero y condensa la salida a JSON. |
| **`certify_11x_gate`** | `project_path` | Ejecuta la compuerta de certificación de cierre (secretos, JSON, componentes UI, ORM, STIG, docs). |
| **`audit_test_pyramid_gaps`** | `project_path`, `stack` | Audita estáticamente las 13 capas de la pirámide 11X (`L01` a `L13`, incluyendo Ciclo Temporal de 3 Fases en `L13` y Refresco Dual en `L07`), detecta archivos huérfanos, endpoints sin BDD, vistas sin E2E y genera un plan de rescate priorizado. |
| **`init_or_append_agents_md`** | `project_path`, `dry_run` | Crea `AGENTS.md` si no existe, o añade de forma aditiva y no destructiva el bloque conector de QA 11X al final de un `AGENTS.md` existente sin modificar reglas previas. |
| **`propose_skill_evolution_pr`** | `project_path`, `target_blueprint_file`, `improvement_title`, `empirical_rationale`, `proposed_content_or_snippet`, `prefer_offline_fallback` | Propone mejoras federadas a `qa-testing-blueprints` mediante `gh` CLI local autenticado o generando un archivo de propuesta local y URL prellenada de GitHub (Zero-Trust, 0 tokens empaquetados). |
| **`reconcile_agents_governance`** | `project_path`, `dry_run` | Reconcilia y deduplica reglas en `.agents/` para proyectos adoptantes, podando directivas ya promovidas a `qa-testing-blueprints`, aislando reglas de dominio en `domain_<project>_rules.md` y respaldando en `.agents/backups/<timestamp>/`. |

### 6.5. Actualización del Servidor MCP, Skills y Documentación en el IDE y Validación Criptográfica

Dado que el transporte `stdio` mantiene vivo el subproceso de Node.js mientras el IDE está abierto y tanto `npx` (`~/.npm/_npx`) como el cliente de recursos (`~/.cache/qa-11x-blueprints`) almacenan cachés en disco, tras publicar una nueva versión en `npmjs.com` o actualizar el repositorio debes ejecutar el siguiente protocolo de actualización y verificación:

#### 1. Purga de Cachés y Rehidratación Completa
```bash
# Elimina las cachés de npx y de blueprints y descarga la última versión verificada con SHA-256:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts
```

#### 2. Reinicio del Servidor MCP en el IDE
* **Google Antigravity:** Abre **`...` (Additional Options) > MCP Servers**, selecciona **`qa-11x`** y pulsa **Restart / Refresh** (o ejecuta `Ctrl+Shift+P` -> **`Developer: Reload Window`**).
* **Cursor / Claude Desktop:** Ejecuta `Developer: Reload Window` o reinicia la aplicación para levantar el nuevo proceso `npx`.

#### 3. Comandos de Validación de Versión e Integridad SHA-256 (`DISA STIG V-222513`)
Para auditar que tanto el binario del servidor MCP como los 20 archivos de las 5 Skills y la documentación en caché corresponden a la última versión publicada:

```bash
# 1. Comparar versión publicada en npmjs contra la instalada en la caché de npx:
npm view @sinfallas/mcp-qa-11x version
grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

# 2. Verificar la versión del manifiesto y su marca de tiempo UTC en la caché local:
grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json

# 3. Validar que el hash SHA-256 de cada archivo de Skill instalado en el IDE coincide con manifest.json:
python3 -c '
import hashlib, json, pathlib
m = json.load(open(pathlib.Path.home() / ".cache/qa-11x-blueprints/manifest.json"))
skills = [f for f in m["agent_governance_files"] if f["path"].startswith(".agents/skills/")]
dest = pathlib.Path.home() / ".gemini/config/skills"
ok = sum(1 for s in skills if (p := dest / s["path"].replace(".agents/skills/", "", 1)).exists() and hashlib.sha256(p.read_bytes()).hexdigest() == s["sha256"])
print(f"✔ Skills en {dest}: {ok}/{len(skills)} archivos coinciden bit a bit con manifest.json (v{m[\"blueprint_version\"]})")
'
```

