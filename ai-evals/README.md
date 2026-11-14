> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively ephemeral Docker containers (`sinfallas/base-python-uv:3.15` and `sinfallas/base-node-ionic:26`), strict Dual-Mode separation, and blocking quantitative thresholds (`HallucinationMetric < 0.05`, `FaithfulnessMetric >= 0.90`, `>= 95%` offline unit coverage). Do not suggest local installations or hardcoded API keys. Output your final response, explanations, and code comments in Spanish.

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

## 2. Complementariedad entre DeepEval y Promptfoo

1. **DeepEval (`ai-evals/rag/test_rag_faithfulness.py` — Code-First en Python/Pytest):**
   - Ideal para descomposición diagnóstica de pipelines RAG (`LLMTestCase`) y auditoría granular de trayectorias agénticas (`ToolCall`).
   - En **Modo 1**, valida contratos deterministas de esquema, citas huérfanas, cifras no sustentadas y orden obligatorio de herramientas (`inspect_blast_radius` previo a edición).
   - En **Modo 2** (`QA_LLM_AUDIT_LIVE=1`), ejecuta `assert_test` contra el juez configurado (`OpenAI`, `Gemini`, `Anthropic`, `Ollama` o `LocalModel`).

2. **Promptfoo (`ai-evals/promptfooconfig.yaml` — Config-First en YAML):**
   - Ideal para comparar lado a lado el mismo prompt y dataset dorado entre múltiples proveedores (`openai:gpt-4.1-mini`, `anthropic:messages:claude-sonnet-4-5`, `google:gemini-2.5-flash` y `ollama:chat:qwen3:8b`).
   - Combina aserciones deterministas (`is-json`, `contains`, `not-icontains`, presupuesto de `latency`) con rúbricas semánticas (`context-faithfulness`, `answer-relevance`, `llm-rubric`) y bloque `redteam` alineado con **OWASP LLM Top 10** (`indirect-prompt-injection`, `prompt-injection`, `jailbreak`, `pii`, `rbac`, `excessive-agency`, `hijacking`).

---

## 3. Umbrales Cuantitativos Bloqueantes (Estándar 11X)

| Métrica / Gate | Umbral Bloqueante | Motor / Capa |
| :--- | :---: | :--- |
| **Cobertura unitaria offline (`ai-evals/rag/`)** | **`>= 95%`** | `pytest --cov` (Modo 1) |
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
  Ejecuta `ruff` (`CC <= 5`), `mypy --strict` y `pytest --cov=ai-evals/rag --cov-fail-under=95` en `sinfallas/base-python-uv:3.15` con `-u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache`.

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
  Ejecuta primero `deepeval` (`QA_LLM_AUDIT_LIVE=1`) en `sinfallas/base-python-uv:3.15` y luego `promptfoo eval -c ai-evals/promptfooconfig.yaml` (`PROMPTFOO_DISABLE_TELEMETRY=1`) en `sinfallas/base-node-ionic:26`. Si no detecta credenciales ni URL local, aborta inmediatamente con código de salida `2` sin bloquear `TTY` (`QA-CLI-TTY-01`).
