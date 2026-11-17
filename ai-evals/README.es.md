> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente contenedores Docker efímeros (`sinfallas/base-python-uv:3.15` y `sinfallas/base-node-ionic:26`), separación estricta Dual-Mode y umbrales cuantitativos bloqueantes (`HallucinationMetric < 0.05`, `FaithfulnessMetric >= 0.90`, cobertura unitaria offline `>= 95%`). No sugieras instalaciones locales ni API keys hardcodeadas. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, pero emite tu respuesta final, explicaciones y comentarios de código en español.

# Guía de Evaluación Dual de IA Generativa, RAG y Agentes Autónomos (`ai-evals`)

Este blueprint establece el estándar corporativo **QA 11X** para auditar pipelines RAG (*Retrieval-Augmented Generation*), flujos agénticos multi-herramienta, matrices multi-modelo y resistencia frente a amenazas **OWASP LLM Top 10** sin generar costos ni fricción de credenciales en integración continua.

---

## 1. Arquitectura de Modo Dual (Cero Fricción de API Keys en CI)

| Dimensión | **Modo 1 — Offline Determinista (`make test-ai-offline`)** | **Modo 2 — Auditoría Probabilística (`make audit-llm`)** |
| :--- | :--- | :--- |
| **Cuándo se ejecuta** | En cada `make test`, PR y validación local (`0` red). | Bajo demanda o en auditorías nocturnas con credenciales activas. |
| **Costo y Credenciales** | **`$0`**, **0 llamadas externas**, sin API keys. | Requiere al menos una clave o endpoint local en entorno. |
| **Política Fail-Closed** | Bloquea si cobertura `< 95%`, `CC > 5` o falla `mypy --strict`. | Si faltan credenciales, imprime `SKIPPED/MISSING_LLM_CREDENTIALS` y termina con **`exit 2`** (cero `PASSED` falso). |
| **Alcance Técnico** | Contratos Pydantic, citas `[doc_id]`, cero invención numérica, guardia `QA-GIT-GATE-01`, trazas de herramientas, instancias reales `LLMTestCase` y esquema `promptfooconfig.yaml`. | Jueces LLM (`DeepEval`: fidelidad, precisión/exhaustividad contextual, alucinación, trayectoria) + matriz multi-modelo y Red Teaming (`Promptfoo`). |

---

## 2. Complementariedad entre DeepEval, Módulos Voz/OCR/Golden y Promptfoo

1. **DeepEval RAG y Juez Compartido (`ai-evals/rag/test_rag_faithfulness.py`, `ai-evals/_llm_judge.py`):**
   - Ideal para descomposición diagnóstica de pipelines RAG (`LLMTestCase`) y auditoría de trayectorias (`ToolCall`), respaldado por resolución compartida de jueces (`OpenAI`, `Gemini`, `Anthropic`, `Ollama` normalizado `/v1` o `LocalModel`).
   - En **Modo 1**, valida contratos deterministas de esquema, citas huérfanas, cifras no sustentadas y orden obligatorio de herramientas (`inspect_blast_radius` previo a edición).
   - En **Modo 2** (`QA_LLM_AUDIT_LIVE=1`), ejecuta `assert_test` contra el juez resuelto mediante `resolve_deepeval_judge_model`.

2. **Módulos Voz en Tiempo Real y OCR Multimodal (`ai-evals/voice-realtime/`, `ai-evals/multimodal-ocr/`):**
   - `voice-realtime/test_voice_websocket_latency.py`: Reinyecta eventos WebSocket/WebRTC (`vapi`, `elevenlabs`, `livekit`, `pipecat`) validando `TTFB p95 <= 500ms`, latencia de turno `<= 800ms`, pérdida de paquetes `<= 2%`, barge-in `<= 200ms` e higiene PII/secretos.
   - `multimodal-ocr/test_pdf_table_fidelity.py`: Audita extracción tabular PDF y OCR Tesseract usando aritmética exacta `Decimal` (`2500.00`), cabeceras obligatorias y juez DeepEval compartido.

3. **Conversor de Trazas Fallidas a Golden Tests (`ai-evals/golden_from_traces.py`, `ai-evals/tests/test_golden_from_traces.py`):**
   - Normaliza entradas con `NFKC`, deduplica por SHA-256, redacta llaves privadas PEM, JWTs, secretos API, credenciales en URI y PII, y exporta JSON DeepEval (`GoldenExportOptions` DTO) o YAML Promptfoo emitiendo `vars.query`.

4. **Promptfoo (`ai-evals/promptfooconfig.yaml` — Config-First en YAML):**
   - Ideal para comparar múltiples proveedores (`openai:gpt-4.1-mini`, `anthropic:messages:claude-sonnet-4-5`, `google:gemini-2.5-flash`, `ollama:chat:qwen3:8b`) parametrizando el juez mediante `defaultTest.options.provider` (`PROMPTFOO_JUDGE_PROVIDER`).
   - Combina aserciones deterministas (`is-json`, `contains`, `not-icontains`, presupuesto de `latency`) con rúbricas semánticas (`context-faithfulness`, `answer-relevance`, `llm-rubric`) y bloque `redteam` alineado con **OWASP LLM Top 10** (`indirect-prompt-injection`, `prompt-injection`, `jailbreak`, `pii`, `rbac`, `excessive-agency`, `hijacking`).

---

## 3. Umbrales Cuantitativos Bloqueantes (Estándar 11X)

| Métrica / Gate | Umbral Bloqueante | Motor / Capa |
| :--- | :---: | :--- |
| **Cobertura unitaria offline (`ai-evals` y `tests/evals`)** | **`>= 95%`** | `pytest --cov` (Modo 1) |
| **Complejidad ciclomática y tipado Python** | **`CC <= 5` · 0 errores** | `ruff C901` + `mypy --strict` (Modo 1) |
| **Alucinación (`HallucinationMetric`)** | **`< 0.05`** (Bloqueante) | `DeepEval` (Modo 2) |
| **Fidelidad al contexto (`FaithfulnessMetric`)** | **`>= 0.90`** | `DeepEval` / `Promptfoo` (Modo 2) |
| **Precisión, Exhaustividad y Relevancia Contextual** | **`>= 0.85`** | `DeepEval` / `Promptfoo` (Modo 2) |
| **Completitud de trayectoria (`TaskCompletionMetric`)** | **`>= 0.90`** | Contrato offline + `DeepEval` |
| **Compilación primer pase / Regeneración agéntica** | **`> 94%` / `< 1.2` iters** | Contrato de trayectoria + linters |
| **Exfiltración de secretos o ejecución `git push`** | **`0%`** (`QA-GIT-GATE-01`) | `scripts/verificar-secretos.sh` + Red Team |

---

## 4. Ejecución bajo Regla Cero (Docker Efímero Non-Root)

Toda ejecución ocurre dentro de contenedores efímeros alineados al `UID:GID` del operador y sin persistir credenciales en disco ni emitir telemetría:

- **Suite Offline (`$0`, CI por defecto):**
  ```bash
  make test-ai-offline
  ```
  Ejecuta `ruff` (`CC <= 5`), `mypy --strict` y `pytest --cov=ai-evals --cov=tests/evals --cov-fail-under=95` en `sinfallas/base-python-uv:3.15` con `-u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache`.

- **Plantilla Standalone para Consumidores:** Copia `Makefile.example` -> `Makefile`, conserva `docker-compose.qa.yml` y `limpieza.sh`, y ejecuta `make qa-all`, `make audit-llm` o `make clean` (non-root `${QA_UID:-1000}:${QA_GID:-1000}`).

- **Auditoría Probabilística Bajo Demanda (Proveedores Cloud o Locales `Ollama` / `vLLM`):**
  ```bash
  # Opción A: proveedor cloud (exportar en memoria, nunca en archivos trackeados)
  export OPENAI_API_KEY="TU_TOKEN_EXAMPLE"
  make audit-llm

  # Opción B: inferencia local privada sin costos (Ollama o endpoint compatible OpenAI/vLLM)
  export OLLAMA_BASE_URL="http://host.docker.internal:11434"
  export QA_LLM_MODEL="qwen3:8b"
  make audit-llm
  ```
  Ejecuta primero `deepeval` (`QA_LLM_AUDIT_LIVE=1` o su alias heredado `RUN_LLM_AUDIT=1`) en `sinfallas/base-python-uv:3.15` y luego `promptfoo eval -c ai-evals/promptfooconfig.yaml` (`PROMPTFOO_DISABLE_TELEMETRY=1`) en `sinfallas/base-node-ionic:26`. Si no detecta credenciales ni URL local, aborta inmediatamente con código de salida `2` sin bloquear `TTY` (`QA-CLI-TTY-01`).

---

## 5. Consumo vía Servidor MCP y Espejo Bilingüe

- **Herramientas MCP:** [`evaluate_agent_trajectory`](../mcp-server/src/tools/evaluateAgentTrajectory.ts) y [`run_llm_red_team`](../mcp-server/src/tools/runLlmRedTeam.ts) (esta última expone un flujo dual-mode seguro con `dryRun` y bandera explícita para red-teaming en vivo).
- **Recurso MCP:** `blueprint://ai/evals-redteam` ([`aiEvalsBlueprint.ts`](../mcp-server/src/resources/aiEvalsBlueprint.ts)).
- **Arquitectura Bilingüe:** Mantenida bajo el estándar Inglés Primario + Espejo Español 1:1 definido en [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md).
