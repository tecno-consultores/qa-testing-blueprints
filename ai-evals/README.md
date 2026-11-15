> 🌐 **Language:** **English** (Canonical) · [🇪🇸 Leer en Español](README.es.md)

> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively ephemeral Docker containers (`sinfallas/base-python-uv:3.15` and `sinfallas/base-node-ionic:26`), strict Dual-Mode separation, and blocking quantitative thresholds (`HallucinationMetric < 0.05`, `FaithfulnessMetric >= 0.90`, `>= 95%` offline unit coverage). Do not suggest local installations or hardcoded API keys. Output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

# Dual Evaluation Guide for Generative AI, RAG, and Autonomous Agents (`ai-evals`)

This blueprint establishes the **QA 11X** corporate standard for auditing **RAG** (*Retrieval-Augmented Generation*) pipelines, multi-tool agentic workflows, multi-model comparison matrices, and resilience against **OWASP LLM Top 10** threats without incurring cost or credential friction in continuous integration.

---

## 1. Dual-Mode Architecture (Zero API Key Friction in CI)

| Dimension | **Mode 1 — Deterministic Offline (`make test-ai-offline`)** | **Mode 2 — Probabilistic Audit (`make audit-llm`)** |
| :--- | :--- | :--- |
| **When it runs** | On every `make test`, PR, and local validation (`0` network). | On demand or in nightly audits with active credentials. |
| **Cost & Credentials** | **`$0`**, **0 external calls**, zero API keys. | Requires at least one API key or local endpoint in environment. |
| **Fail-Closed Policy** | Blocks if coverage `< 95%`, `CC > 5`, or `mypy --strict` fails. | If credentials are missing, prints `SKIPPED/MISSING_LLM_CREDENTIALS` and exits with **`exit 2`** (zero false `PASSED`). |
| **Technical Scope** | Pydantic contracts, `[doc_id]` citations, zero fabricated numbers, `QA-GIT-GATE-01` guard, tool traces, real `LLMTestCase` instances, and `promptfooconfig.yaml` schema. | LLM Judges (`DeepEval`: faithfulness, contextual precision/recall, hallucination, trajectory) + multi-model matrix & Red Teaming (`Promptfoo`). |

---

## 2. Complementarity Between DeepEval and Promptfoo

1. **DeepEval (`ai-evals/rag/test_rag_faithfulness.py` — Code-First in Python/Pytest):**
   - Ideal for diagnostic decomposition of RAG pipelines (`LLMTestCase`) and granular auditing of agent trajectories (`ToolCall`).
   - In **Mode 1**, validates deterministic schema contracts, orphan citations, unsupported numeric claims, and mandatory tool ordering (`inspect_blast_radius` before editing).
   - In **Mode 2** (`QA_LLM_AUDIT_LIVE=1`), executes `assert_test` against the configured judge (`OpenAI`, `Gemini`, `Anthropic`, `Ollama`, or `LocalModel`).

2. **Promptfoo (`ai-evals/promptfooconfig.yaml` — Config-First in YAML):**
   - Ideal for side-by-side comparison of the same prompt and golden dataset across multiple providers (`openai:gpt-4.1-mini`, `anthropic:messages:claude-sonnet-4-5`, `google:gemini-2.5-flash`, and `ollama:chat:qwen3:8b`).
   - Combines deterministic assertions (`is-json`, `contains`, `not-icontains`, `latency` budget) with semantic rubrics (`context-faithfulness`, `answer-relevance`, `llm-rubric`) and a `redteam` block aligned with **OWASP LLM Top 10** (`indirect-prompt-injection`, `prompt-injection`, `jailbreak`, `pii`, `rbac`, `excessive-agency`, `hijacking`).

---

## 3. Blocking Quantitative Thresholds (11X Standard)

| Metric / Gate | Blocking Threshold | Engine / Layer |
| :--- | :---: | :--- |
| **Offline unit coverage (`ai-evals/rag/`)** | **`>= 95%`** | `pytest --cov` (Mode 1) |
| **Python cyclomatic complexity & typing** | **`CC <= 5` · 0 errors** | `ruff C901` + `mypy --strict` (Mode 1) |
| **Hallucination (`HallucinationMetric`)** | **`< 0.05`** (Blocking) | `DeepEval` (Mode 2) |
| **Context faithfulness (`FaithfulnessMetric`)** | **`>= 0.90`** | `DeepEval` / `Promptfoo` (Mode 2) |
| **Contextual precision, recall & relevance** | **`>= 0.85`** | `DeepEval` / `Promptfoo` (Mode 2) |
| **Trajectory completion (`TaskCompletionMetric`)** | **`>= 0.90`** | Offline contract + `DeepEval` |
| **First-pass build / Agent regeneration** | **`> 94%` / `< 1.2` iters** | Trajectory contract + linters |
| **Secret exfiltration or `git push` execution** | **`0%`** (`QA-GIT-GATE-01`) | `scripts/verificar-secretos.sh` + Red Team |

---

## 4. Execution Under Rule Zero (Non-Root Ephemeral Docker)

All execution runs inside ephemeral containers mapped to the operator's `UID:GID` without persisting credentials to disk or emitting telemetry:

- **Offline Suite (`$0`, default CI):**
  ```bash
  make test-ai-offline
  ```
  Runs `ruff` (`CC <= 5`), `mypy --strict`, and `pytest --cov=ai-evals/rag --cov-fail-under=95` inside `sinfallas/base-python-uv:3.15` with `-u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache`.

- **On-Demand Probabilistic Audit (Cloud Providers or Local `Ollama` / `vLLM`):**
  ```bash
  # Option A: cloud provider (export in memory, never in tracked files)
  export OPENAI_API_KEY="YOUR_TOKEN_EXAMPLE"
  make audit-llm

  # Option B: private zero-cost local inference (Ollama or OpenAI/vLLM-compatible endpoint)
  export OLLAMA_BASE_URL="http://host.docker.internal:11434"
  export QA_LLM_MODEL="qwen3:8b"
  make audit-llm
  ```
  Runs `deepeval` first (`QA_LLM_AUDIT_LIVE=1` or its legacy alias `RUN_LLM_AUDIT=1`) in `sinfallas/base-python-uv:3.15` and then `promptfoo eval -c ai-evals/promptfooconfig.yaml` (`PROMPTFOO_DISABLE_TELEMETRY=1`) in `sinfallas/base-node-ionic:26`. If neither credentials nor a local URL are detected, it aborts immediately with exit code `2` without blocking `TTY` (`QA-CLI-TTY-01`).

---

## 5. Consumption via MCP Server and Bilingual Mirror

- **MCP Tools:** [`evaluate_agent_trajectory`](../mcp-server/src/tools/evaluateAgentTrajectory.ts) and [`run_llm_red_team`](../mcp-server/src/tools/runLlmRedTeam.ts) (the latter exposes a safe dual-mode flow with `dryRun` and an explicit flag for live red-teaming).
- **MCP Resource:** `blueprint://ai/evals-redteam` ([`aiEvalsBlueprint.ts`](../mcp-server/src/resources/aiEvalsBlueprint.ts)).
- **Bilingual Architecture:** Maintained under the English-Primary + 1:1 Spanish Mirror standard defined in [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md).
