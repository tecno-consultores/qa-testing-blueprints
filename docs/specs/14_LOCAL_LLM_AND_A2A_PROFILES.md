# ⚡ Especificación Técnica 14: Perfiles de Inferencia Local (`Ollama` / `vLLM`), Tarjeta A2A (`task-capacity`) y Compactador Zero-LLM en 2 Niveles (`T2.7`)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (T2.7):** `mcp-server/src/a2a/agentCard.ts`, `mcp-server/tests/a2a.test.ts`, `.agents/scripts/compact_context_11x.py`, `tests/meta_qa/test_governance_scripts.py`, `mcp-server/src/utils/taskStateGuard.ts`  
**Modelo Ejecutor Objetivo:** Modelos locales abiertos (Qwen 3.8 / Ollama / vLLM) y modelos *frontier* híbridos  
**Estado:** IMPLEMENTADO (CERTIFICACIÓN QA-11X v2.0)

---

## 1. Propósito y Alcance Arquitectónico

Las ejecuciones autónomas del estándar **QA-11X v2.0** sobre infraestructura local (*on-premise* con `Ollama` o `vLLM`) y entornos multi-agente distribuidos presentan tres modos de fallo recurrentes: (1) saturación silenciosa de workers sin capacidad declarada ni reserva atómica, (2) degradación cuadrática o contaminación por *Indirect Prompt Injection* al resumir historiales largos mediante un LLM, y (3) fallos de llamada a herramientas (*tool calling*) por plantillas de chat incompatibles, decodificación gramatical parcial y parámetros de muestreo mal calibrados.

Esta especificación formaliza:
1. El manifiesto determinista **Agent2Agent (A2A)** (`/.well-known/agent-card.json`) y la extensión `task-capacity` (`1..32`).
2. La arquitectura del compactador de contexto **Zero-LLM** en 2 niveles (`.agents/scripts/compact_context_11x.py`).
3. Los perfiles normativos de invocación, esquemas JSON y muestreo para inferencia local (`Ollama` y `vLLM >= 0.29.0` / `0.31.0+`).

---

## 2. Contrato Agent2Agent (`/.well-known/agent-card.json`) y Extensión `task-capacity`

El módulo `mcp-server/src/a2a/agentCard.ts` (100% Node.js nativo, funciones puras `CC <= 5`, `0 any`) genera y persiste de forma atómica la tarjeta pública de capacidades del agente MCP.

### 2.1 Estructura Canónica del Manifiesto

| Campo | Contrato / Valor por Defecto | Invariante de Validación |
| :--- | :--- | :--- |
| **`name` / `version` / `url`** | `qa-11x-mcp-agent` / `2.20.3` / `stdio://sinfallas/mcp-qa-11x` | Cadenas no vacías sin bytes nulos (`\0`). |
| **`description`** | Incluye `activeModel`, `standardVersion` (`QA-11X v2.0`) y las `skills` declaradas | Generación determinista si no se provee descripción explícita. |
| **`protocolVersion`** | `0.2.1` | Identificador explícito del protocolo A2A soportado. |
| **`capabilities`** | `{ streaming: false, pushNotifications: false, stateTransitionHistory: true }` | Mezcla parcial segura sobre valores deterministas por defecto. |
| **`skills`** | Catálogo estructurado de las **10 skills modulares v2.0** (`id`, `name`, `description`, `tags`) | Clonación defensiva; cubre desde `qa-11x-architect` hasta `refactoring-ui`. |
| **`securityProfile`** | `{ promptGuard: true, ruleZeroEphemeralDocker: true, gitClosureHumanGate: 'QA-GIT-GATE-01' }` | Declara guardias de entrada, Regla Cero y compuerta humana de `git push`. |

### 2.2 Extensión `task-capacity` (`1..32`) e Interoperabilidad con `TaskStateGuard`

1. **URIs Soportadas:**
   - **URI Canónica:** `urn:qa-11x:extensions:task-capacity:v1`.
   - **URI de Compatibilidad (`TaskStateGuard`):** `urn:quaia:extensions:task-capacity:v1` (re-exportada desde `mcp-server/src/utils/taskStateGuard.ts`).
   - Cualquier URI fuera de ese conjunto dispara el error determinista `[A2A_UNSUPPORTED_EXTENSION_URI]`.
2. **Acotamiento Estricto de Capacidad (`1 <= capacity <= 32`):**
   - `validateTaskCapacity(capacity)` acepta exclusivamente enteros en `[1, 32]` y rechaza `<= 0`, `> 32`, decimales (`1.5`), `NaN` e `Infinity` con `RangeError` (`[A2A_INVALID_CAPACITY]`).
3. **Evaluación de Slots (`evaluateCapacityStatus(runningTasks, capacity)`):**
   - `runningTasks < capacity` -> estado `AVAILABLE`, `availableSlots = capacity - runningTasks`, `saturated = false`.
   - `runningTasks >= capacity` -> estado `BUSY`, `availableSlots = 0`, `saturated = true` (alineado 1:1 con `409 BUSY` en `TaskStateGuard.acquireSlot()`).
4. **Escritura Atómica Anti-*Path Traversal* (`writeAgentCardFile`):**
   - Resuelve `realpath` del `workspaceRoot`, exige que `relativeOutputPath` (por defecto `.well-known/agent-card.json`) sea relativa y estrictamente descendiente tras crear directorios padres, verifica mediante `lstat` que el destino no sea symlink ni directorio, escribe en un archivo temporal hermano con `crypto.randomUUID()` y ejecuta `rename` atómico.

---

## 3. Compactador Determinista de Contexto Zero-LLM (`.agents/scripts/compact_context_11x.py`)

### 3.1 Estimación Sin LLM y Guardia `QA-CLI-TTY-01`

- **Fórmula de Estimación:** $\text{tokens}_{\text{antes}} = \text{anchor\_tokens} + \sum_{m \in \text{mensajes}} \lceil \text{len}(\text{texto}(m)) / 4 \rceil$.
- **Umbral de Disparo:** $\text{umbral} = \lfloor \text{context\_window} \times \text{threshold\_ratio} \rfloor$ (por defecto `200000 * 0.90 = 180000` tokens). Si $\text{tokens}_{\text{antes}} \le \text{umbral}$, el script retorna `tier_applied = 0` sin alterar los mensajes.
- **Guardia `QA-CLI-TTY-01`:** Si no se pasa `--input <archivo.json>` (o se usa `-`) y `sys.stdin.isatty()` es verdadero, falla de inmediato con código `1` evitando cuelgues en sesiones interactivas.
- **Mensaje Único Gigante:** Si algún mensaje individual excede `--context-window`, marca `uncompactable_single_message: true` sin truncar ni corromper pares `tool_calls`.

### 3.2 Estrategia Escalonada en 2 Niveles

1. **Nivel 1 (`tier_applied = 1` — Enmascaramiento de Resultados Antiguos de Tools):**
   - Localiza cronológicamente todos los resultados (`role == "tool"` y bloques `{"type": "tool_result"}`).
   - Conserva intactos los **6 resultados más recientes** (`--keep-recent-tools 6`).
   - Sustituye únicamente el contenido de los resultados anteriores por el marcador literal `"[tool result cleared]"`, dejando intactos los mensajes `assistant` y sus `tool_calls` / `tool_use` para que el agente conserve trazabilidad de qué invocó y pueda re-ejecutarlo si lo necesita.
2. **Nivel 2 (`tier_applied = 2` — Poda Atómica de Mensajes Antiguos):**
   - Se activa **exclusivamente** cuando el Nivel 1 no logra bajar de `threshold_tokens`.
   - Agrupa `assistant(tool_calls)` y todos sus resultados `tool` / `tool_result` consecutivos en **unidades atómicas indivisibles**.
   - Descarta los grupos atómicos más antiguos hasta cumplir `--keep-last-messages 20` y bajar de `threshold_tokens`, respetando dos invariantes inquebrantables:
     1. **Preservar siempre la tarea raíz:** mantiene intactos el bloque `system` inicial y el **primer prompt `user`**.
     2. **Cero huérfanos de herramientas:** jamás separa una llamada `assistant.tool_calls` de su(s) resultado(s) `tool` correspondiente(s).

### 3.3 Justificación de Seguridad DevSecOps (*Anti-Indirect Prompt Injection*)

Resumir historiales largos mediante un LLM secundario expone al agente a **Inyección de Prompt Indirecta** (OWASP LLM01): salidas no confiables provenientes de tickets de Jira, HTML externo o logs de CI pueden incrustar directivas maliciosas que, al ser sintetizadas por el LLM compactador, terminan promovidas hacia el bloque de instrucciones de sistema o resúmenes de alta autoridad. El enmascaramiento determinista Zero-LLM (`"[tool result cleared]"`) y la poda estructural atómica eliminan por diseño esa superficie de ataque y evitan costos extra de inferencia.

---

## 4. Perfiles Calibrados para Inferencia Local (`Ollama` & `vLLM`)

### 4.1 Plantilla de Chat de Mensaje Único de Sistema

Modelos abiertos modernos (como **Qwen 3.8** y variantes instruct compatibles con OpenAI Chat Completions en `Ollama` y `vLLM`) exigen que todas las directivas de gobernanza, esquema de herramientas y contexto de rol se fusionen en un **único mensaje `role: "system"` en la posición `0`** del arreglo `messages`. Los bloques `system` intermedios o múltiples rompen plantillas Jinja estrictas o degradan la atención sobre reglas de cierre (`QA-GIT-GATE-01`).

### 4.2 Restricción Gramatical `tool_choice: "required"` y Esquemas JSON Estrictos

En servidores **`vLLM >= 0.29.0` (y `0.31.0+`)** que operan con decodificación guiada (*guided decoding* / gramáticas CFG):
- Cuando el paso del flujo exige invocar una herramienta de salida estructurada o verificación (`certify_11x_gate`, `run_ephemeral_qa`), se debe forzar explícitamente **`tool_choice: "required"`**.
- Los esquemas JSON de herramientas de salida en modelos locales **deben declarar todos los atributos en `required`** (evitando propiedades opcionales que la decodificación guiada omite sistemáticamente al optimizar longitud de secuencia).

### 4.3 Perfiles Duales de Muestreo, Longitud de Contexto y Timeouts en GPU Única

| Perfil Operativo | Cuándo Usarlo | `enable_thinking` | `temperature` | `top_p` | `presence_penalty` | Regla Crítica |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`thinking: none`** | Enrutamiento rápido, clasificación determinista, extracción de JSON | `false` | `0.7` | `0.8` | `0.0` | Latencia mínima y cero divagación en parseo de esquemas. |
| **`thinking: low \| medium`** | Diagnóstico AST, diseño de pruebas BDD/unitarias, depuración 4 fases | `true` | `1.0` | `0.95` | `0.5` | **PROHIBIDO `presence_penalty >= 1.5`**: valores altos degradan e interrumpen bucles de *tool calling*. |

- **Dimensionamiento de Ventana (`vLLM`):** configurar `--max-model-len 262144` (o el máximo soportado por la VRAM disponible, alineando `--context-window` en `compact_context_11x.py` al `90%` efectivo antes del límite físico para evitar OOM de KV-cache).
- **Timeouts Extendidos en GPU Única:** las inferencias locales con contexto amplio (`> 32k` tokens) o perfil `thinking: medium` presentan latencias de *prefill* elevadas en una sola GPU; los clientes MCP/HTTP deben configurar **timeouts de lectura `>= 180,000 ms` (`180s`)**, reutilizando el perfil `heavy_transfer` (`DEFAULT_HEAVY_TRANSFER_TIMEOUT_MS`) definido en `mcp-server/src/utils/taskStateGuard.ts`.

---

## 5. Verificación y Criterios de Aceptación (`QA-TEST-SYNC-01`)

1. `mcp-server/tests/a2a.test.ts`: verifica generación por defecto con las 10 skills, validación estricta de `capacity` (`1`, `32`, rechazo en `0`, `33`, `-1`, `1.5`, `NaN`), compatibilidad con `urn:quaia:extensions:task-capacity:v1`, transición `AVAILABLE -> BUSY`, escritura atómica y rechazo de *Path Traversal* y *symlinks* con cobertura `>= 95%`.
2. `tests/meta_qa/test_governance_scripts.py`: verifica no-op bajo `90%`, enmascaramiento Tier 1 conservando 6 pares recientes e intactos los `tool_calls`, poda atómica Tier 2 preservando tarea raíz y parejas `tool_call <-> tool_result`, detección de `uncompactable_single_message` y guardia `QA-CLI-TTY-01`.
