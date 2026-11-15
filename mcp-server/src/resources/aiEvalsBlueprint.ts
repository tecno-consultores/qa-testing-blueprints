// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceLanguage } from '../types.js';
import { getActiveResourceLang } from './resourceLang.js';

export const AI_EVALS_REDTEAM_URI = 'blueprint://ai/evals-redteam' as const;
export const AI_EVALS_REDTEAM_MIME_TYPE = 'text/markdown' as const;
export const AI_EVALS_PROMPTFOO_REL_PATH = 'ai-evals/promptfooconfig.yaml';
const MAX_EXCERPT_LINES = 45;

export const AI_EVALS_REDTEAM_RESOURCE: Resource = {
  uri: AI_EVALS_REDTEAM_URI,
  name: 'QA-11X AI Evals & OWASP Red Team Blueprint',
  description:
    'Dual-Mode corporate blueprint (Zero-Cost Offline + Live DeepEval/Promptfoo) covering RAG, PDF OCR, Real-Time Voice latency, Trace-to-Golden conversion, local Ollama/vLLM profiles, and OWASP LLM Top 10.',
  mimeType: AI_EVALS_REDTEAM_MIME_TYPE,
};

export interface AiEvalsBlueprintContentItem {
  uri: string;
  mimeType: string;
  text: string;
}

export interface AiEvalsBlueprintResult {
  uri: string;
  mimeType: string;
  text: string;
  source: 'workspace' | 'embedded-fallback';
  contents: AiEvalsBlueprintContentItem[];
}

const EMBEDDED_PROMPTFOO_FALLBACK = `description: "QA-11X Matriz Multi-Modelo RAG y Auditoría OWASP LLM Top 10"
providers:
  - id: openai:gpt-4.1-mini
    config:
      apiKey: "\${OPENAI_API_KEY}"
  - id: ollama:chat:qwen3:8b
    config:
      temperature: 0
redteam:
  plugins:
    - id: indirect-prompt-injection
    - id: pii
    - id: rbac
    - id: excessive-agency
    - id: hijacking
  strategies:
    - id: prompt-injection
    - id: jailbreak`;

function resolveDefaultWorkspaceRoot(): string {
  const cwd = path.resolve(process.cwd());
  if (fs.existsSync(path.join(cwd, AI_EVALS_PROMPTFOO_REL_PATH))) {
    return cwd;
  }
  const parent = path.dirname(cwd);
  if (fs.existsSync(path.join(parent, AI_EVALS_PROMPTFOO_REL_PATH))) {
    return parent;
  }
  return cwd;
}

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function loadPromptfooExcerpt(workspaceRoot: string): {
  source: 'workspace' | 'embedded-fallback';
  excerpt: string;
} {
  const rootResolved = path.resolve(workspaceRoot);
  const target = path.resolve(rootResolved, AI_EVALS_PROMPTFOO_REL_PATH);
  if (!fs.existsSync(rootResolved) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return { source: 'embedded-fallback', excerpt: EMBEDDED_PROMPTFOO_FALLBACK };
  }

  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(target);
  if (!isContainedPath(rootReal, targetReal)) {
    return { source: 'embedded-fallback', excerpt: EMBEDDED_PROMPTFOO_FALLBACK };
  }

  const lines = fs.readFileSync(targetReal, 'utf8').split(/\r?\n/);
  const trimmed = lines.slice(0, MAX_EXCERPT_LINES).join('\n').trimEnd();
  return { source: 'workspace', excerpt: trimmed };
}

function renderBlueprintMarkdown(
  source: 'workspace' | 'embedded-fallback',
  promptfooExcerpt: string,
  lang: ResourceLanguage
): string {
  if (lang === 'es') {
    return [
      '# Blueprint QA-11X de AI Evals & OWASP Red Team (`ai-evals`)',
      '',
      '## 1. Umbrales Cuantitativos Bloqueantes',
      '- **Alucinación (`Hallucination`):** `Hallucination < 0.05` (bloqueante)',
      '- **Fidelidad (`Faithfulness`):** `Faithfulness >= 0.90`',
      '- **Trayectoria (`Trajectory`):** `Trajectory >= 0.90` (precedencia AST + `QA-GIT-GATE-01`)',
      '- **Compilación (`Compilation`):** `Compilation > 94%` (`> 0.94`)',
      '- **Regeneración (`Regeneration`):** `Regeneration < 1.2` iteraciones por paso',
      '- **Cobertura y Complejidad Offline:** `>= 95%` (`CC <= 5`, `mypy --strict`)',
      '',
      '## 2. Suites de Evaluación Cubiertas (`ai-evals/`) y Skill',
      '- **Skill:** `.agents/skills/qa-11x-llm-evaluator/SKILL.md` (`evaluate_agent_trajectory`, `run_llm_red_team`)',
      '- **Tríada RAG y Fundamentación:** `ai-evals/rag/test_rag_faithfulness.py`',
      '- **PDF Multimodal y Reconciliación Decimal OCR:** `ai-evals/multimodal-ocr/test_pdf_table_fidelity.py`',
      '- **Latencia Voz Tiempo Real WS/WebRTC:** `ai-evals/voice-realtime/test_voice_websocket_latency.py`',
      '- **Pipeline Trace-to-Golden con Redacción PII:** `ai-evals/golden_from_traces.py`',
      '',
      '## 3. Ejecución Efímera Dual-Mode (Regla Cero Docker)',
      '- **CI Offline ($0, 0 red):** `make test-ai-offline` (`sinfallas/base-python-uv:3.15`)',
      '- **Auditoría Probabilística en Vivo:** `make audit-llm` (`DeepEval` + `Promptfoo`, sale `2` sin credenciales evitando cuelgue TTY)',
      '',
      '## 4. Perfiles Locales Privados (Ollama / vLLM)',
      '- **Ollama:** `export OLLAMA_BASE_URL="http://host.docker.internal:11434"` y `export QA_LLM_MODEL="qwen3:8b"`',
      '- **vLLM (compatible OpenAI):** `export OPENAI_API_BASE="http://host.docker.internal:8000/v1"` y `export OPENAI_API_KEY="EMPTY"`',
      '',
      `## 5. Extracto Verificado de \`${AI_EVALS_PROMPTFOO_REL_PATH}\` (${source})`,
      '```yaml',
      promptfooExcerpt,
      '```',
      '',
    ].join('\n');
  }

  return [
    '# QA-11X AI Evals & OWASP Red Team Blueprint (`ai-evals`)',
    '',
    '## 1. Blocking Quantitative Thresholds',
    '- **Hallucination:** `Hallucination < 0.05` (blocking)',
    '- **Faithfulness:** `Faithfulness >= 0.90`',
    '- **Trajectory:** `Trajectory >= 0.90` (AST precedence + `QA-GIT-GATE-01`)',
    '- **Compilation:** `Compilation > 94%` (`> 0.94`)',
    '- **Regeneration:** `Regeneration < 1.2` iterations per step',
    '- **Offline Coverage & Complexity:** `>= 95%` (`CC <= 5`, `mypy --strict`)',
    '',
    '## 2. Covered Evaluation Suites (`ai-evals/`) & Skill',
    '- **Skill:** `.agents/skills/qa-11x-llm-evaluator/SKILL.md` (`evaluate_agent_trajectory`, `run_llm_red_team`)',
    '- **RAG Triad & Groundedness:** `ai-evals/rag/test_rag_faithfulness.py`',
    '- **Multimodal PDF & OCR Decimal Reconciliation:** `ai-evals/multimodal-ocr/test_pdf_table_fidelity.py`',
    '- **Real-Time Voice WS/WebRTC Latency:** `ai-evals/voice-realtime/test_voice_websocket_latency.py`',
    '- **Trace-to-Golden PII-Redacting Pipeline:** `ai-evals/golden_from_traces.py`',
    '',
    '## 3. Dual-Mode Ephemeral Execution (Rule Zero Docker)',
    '- **CI Offline ($0, 0 network):** `make test-ai-offline` (`sinfallas/base-python-uv:3.15`)',
    '- **Live Probabilistic Audit:** `make audit-llm` (`DeepEval` + `Promptfoo`, exits `2` on missing credentials without TTY hang)',
    '',
    '## 4. Private Local Profiles (Ollama / vLLM)',
    '- **Ollama:** `export OLLAMA_BASE_URL="http://host.docker.internal:11434"` and `export QA_LLM_MODEL="qwen3:8b"`',
    '- **vLLM (OpenAI-compatible):** `export OPENAI_API_BASE="http://host.docker.internal:8000/v1"` and `export OPENAI_API_KEY="EMPTY"`',
    '',
    `## 5. Verified Excerpt from \`${AI_EVALS_PROMPTFOO_REL_PATH}\` (${source})`,
    '```yaml',
    promptfooExcerpt,
    '```',
    '',
  ].join('\n');
}

export function readAiEvalsBlueprint(
  workspaceRoot?: string,
  lang?: ResourceLanguage
): AiEvalsBlueprintResult {
  const resolvedLang = getActiveResourceLang(undefined, lang);
  const effectiveRoot = workspaceRoot ?? resolveDefaultWorkspaceRoot();
  const { source, excerpt } = loadPromptfooExcerpt(effectiveRoot);
  const text = renderBlueprintMarkdown(source, excerpt, resolvedLang);
  return {
    uri: AI_EVALS_REDTEAM_URI,
    mimeType: AI_EVALS_REDTEAM_MIME_TYPE,
    text,
    source,
    contents: [
      {
        uri: AI_EVALS_REDTEAM_URI,
        mimeType: AI_EVALS_REDTEAM_MIME_TYPE,
        text,
      },
    ],
  };
}
