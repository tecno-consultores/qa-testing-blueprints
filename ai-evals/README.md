> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively ephemeral Docker containers (`sinfallas/base-python-uv:3.15` and `sinfallas/base-node-ionic:26`), strict Dual-Mode separation, and blocking quantitative thresholds (`HallucinationMetric >= 0.95` where `1.0` = 0% hallucination, `FaithfulnessMetric >= 0.90`, `>= 95%` offline unit coverage). Do not suggest local installations or hardcoded API keys. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

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

## 2. Complementarity Between DeepEval, Voice/OCR/Golden Modules, and Promptfoo

1. **DeepEval RAG & Shared Judge (`ai-evals/rag/test_rag_faithfulness.py`, `ai-evals/_llm_judge.py`):**
   - Ideal for diagnostic decomposition of RAG pipelines (`LLMTestCase`) and granular auditing of agent trajectories (`ToolCall`), backed by shared judge resolution (`OpenAI`, `Gemini`, `Anthropic`, `/v1`-normalized `Ollama`, or `LocalModel`).
   - In **Mode 1**, validates deterministic schema contracts, orphan citations, unsupported numeric claims, and mandatory tool ordering (`inspect_blast_radius` / `inspect_ast_blast_radius` before editing).
   - In **Mode 2** (`QA_LLM_AUDIT_LIVE=1`), executes `assert_test` against the resolved judge via `resolve_deepeval_judge_model`.

2. **Real-Time Voice & Multimodal OCR Modules (`ai-evals/voice-realtime/`, `ai-evals/multimodal-ocr/`):**
   - `voice-realtime/test_voice_websocket_latency.py`: Replays WebSocket/WebRTC streaming events (`vapi`, `elevenlabs`, `livekit`, `pipecat`) validating `TTFB p95 <= 500ms`, turn latency `<= 800ms`, packet loss `<= 2%`, barge-in `<= 200ms`, and PII/secret hygiene.
   - `multimodal-ocr/test_pdf_table_fidelity.py`: Audits PDF & Tesseract OCR table extraction using exact `Decimal` arithmetic (`2500.00`), required column headers, and shared DeepEval judge checks.

3. **Failure Traces to Golden Regression Converter (`ai-evals/golden_from_traces.py`, `ai-evals/tests/test_golden_from_traces.py`):**
   - Normalizes inputs with `NFKC`, deduplicates via SHA-256, redacts PEM private keys, JWTs, API secrets, URI credentials, and PII, and exports DeepEval JSON (`GoldenExportOptions` DTO) or Promptfoo YAML emitting `vars.query`.

4. **Promptfoo (`ai-evals/promptfooconfig.yaml` — Config-First in YAML):**
   - Ideal for side-by-side comparison across multiple providers (`openai:gpt-4.1-mini`, `anthropic:messages:claude-sonnet-4-5`, `google:gemini-2.5-flash`, `ollama:chat:qwen3:8b`) with judge parameterized via Nunjucks in `defaultTest.options.provider` (`{{ env.PROMPTFOO_JUDGE_PROVIDER | default('openai:gpt-4.1-mini', true) }}`), reading keys directly from the environment (zero literal `"${...}"` `apiKey` overrides) and filtering active providers via `--filter-providers`.
   - Combines deterministic assertions (`is-json`, `contains`, `not-icontains`, `latency` budget) with semantic rubrics (`context-faithfulness`, `answer-relevance`, `llm-rubric`) and a `redteam` block aligned with **OWASP LLM Top 10** (`indirect-prompt-injection`, `prompt-injection`, `jailbreak`, `pii`, `rbac`, `excessive-agency`, `hijacking`) executed non-interactively with `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=1`.

---

## 3. Blocking Quantitative Thresholds (11X Standard)

| Metric / Gate | Blocking Threshold | Engine / Layer |
| :--- | :---: | :--- |
| **Offline unit coverage (`ai-evals` & `tests/evals`)** | **`>= 95%`** | `pytest --cov` (Mode 1) |
| **Python cyclomatic complexity & typing** | **`CC <= 5` · 0 errors** | `ruff C901` + `mypy --strict` (Mode 1) |
| **Hallucination (`HallucinationMetric`)** | **`>= 0.95`** (Blocking, `1.0` = 0% hallucination) | `DeepEval` (Mode 2) |
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
  Runs `ruff` (`CC <= 5`), `mypy --strict`, and `pytest --cov=ai-evals --cov=tests/evals --cov-fail-under=95` inside `sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4` with `-u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache`.

- **Standalone Consumer Blueprint:** Copy `Makefile.example` -> `Makefile`, keep `docker-compose.qa.yml` and `limpieza.sh`, and run `make qa-all`, `make audit-llm`, or `make clean` (non-root `${QA_UID:-1000}:${QA_GID:-1000}`).

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
  Runs `deepeval` first (`QA_LLM_AUDIT_LIVE=1` or its legacy alias `RUN_LLM_AUDIT=1`) in `sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4` and then `promptfoo eval -c ai-evals/promptfooconfig.yaml --filter-providers ...` (`PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=1`) in `sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60`. If neither credentials nor a local URL are detected, it aborts immediately with exit code `2` without blocking `TTY` (`QA-CLI-TTY-01`).

---

## 5. Consumption via MCP Server and Bilingual Mirror

- **MCP Tools:** [`evaluate_agent_trajectory`](../mcp-server/src/tools/evaluateAgentTrajectory.ts) and [`run_llm_red_team`](../mcp-server/src/tools/runLlmRedTeam.ts) (the latter exposes a safe dual-mode flow with `dryRun` and an explicit flag for live red-teaming).
- **MCP Resource:** `blueprint://ai/evals-redteam` ([`aiEvalsBlueprint.ts`](../mcp-server/src/resources/aiEvalsBlueprint.ts)).
- **Bilingual Architecture:** Maintained under the English-Primary + 1:1 Spanish Mirror standard defined in [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md).
