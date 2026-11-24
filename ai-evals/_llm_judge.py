# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Resolucion compartida de jueces LLM para suites DeepEval (cloud y local)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any, cast

from deepeval.errors import DeepEvalError
from deepeval.models import (
    AnthropicModel,
    GeminiModel,
    LocalModel,
    OpenAIModel,
)
from deepeval.models.base_model import DeepEvalBaseLLM

_GEMINI_OPENAI_COMPAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
_ANTHROPIC_COMPAT_URL = "https://api.anthropic.com/v1/"


def _normalize_v1_base_url(raw_url: str) -> str:
    cleaned = raw_url.strip().rstrip("/")
    if cleaned.endswith("/v1"):
        return cleaned
    return f"{cleaned}/v1"


def _build_provider_or_local(
    provider_cls: Any,
    fallback_base_url: str,
    model_name: str,
    api_key: str,
) -> DeepEvalBaseLLM:
    try:
        return cast(DeepEvalBaseLLM, provider_cls(model=model_name, api_key=api_key))
    except DeepEvalError:
        return LocalModel(
            model=model_name,
            base_url=fallback_base_url,
            api_key=api_key,
        )


def _pick_model_name(active_env: Mapping[str, str], default: str) -> str:
    raw = active_env.get("QA_LLM_MODEL", "").strip()
    return raw if raw else default


def is_live_llm_audit_enabled(env: Mapping[str, str] | None = None) -> bool:
    """Retorna True si QA_LLM_AUDIT_LIVE=1 o RUN_LLM_AUDIT=1 está activo."""
    active_env = os.environ if env is None else env
    return (
        active_env.get("QA_LLM_AUDIT_LIVE") == "1"
        or active_env.get("RUN_LLM_AUDIT") == "1"
    )


def _resolve_openai_judge(active_env: Mapping[str, str]) -> DeepEvalBaseLLM | None:
    api_key = active_env.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    openai_base = active_env.get("OPENAI_API_BASE", "").strip()
    model_name = _pick_model_name(active_env, "gpt-4.1-mini")
    if openai_base:
        return LocalModel(model=model_name, base_url=openai_base, api_key=api_key)
    return OpenAIModel(model=model_name, api_key=api_key)


def _resolve_cloud_judge(active_env: Mapping[str, str]) -> DeepEvalBaseLLM | None:
    openai_judge = _resolve_openai_judge(active_env)
    if openai_judge is not None:
        return openai_judge
    if active_env.get("GEMINI_API_KEY"):
        return _build_provider_or_local(
            GeminiModel,
            _GEMINI_OPENAI_COMPAT_URL,
            _pick_model_name(active_env, "gemini-2.5-flash"),
            active_env["GEMINI_API_KEY"],
        )
    if active_env.get("ANTHROPIC_API_KEY"):
        return _build_provider_or_local(
            AnthropicModel,
            _ANTHROPIC_COMPAT_URL,
            _pick_model_name(active_env, "claude-sonnet-4-5"),
            active_env["ANTHROPIC_API_KEY"],
        )
    return None


def resolve_deepeval_judge_model(
    env: Mapping[str, str] | None = None,
) -> DeepEvalBaseLLM:
    """Selecciona juez DeepEval (OpenAI/Gemini/Anthropic/Ollama/LocalModel)."""
    active_env = os.environ if env is None else env
    cloud = _resolve_cloud_judge(active_env)
    if cloud is not None:
        return cloud
    ollama_url = active_env.get("OLLAMA_BASE_URL", "").strip()
    if ollama_url:
        return LocalModel(
            model=_pick_model_name(active_env, "qwen3:8b"),
            base_url=_normalize_v1_base_url(ollama_url),
            api_key="ephemeral-ollama-placeholder",
        )
    openai_base = active_env.get("OPENAI_API_BASE", "").strip()
    if openai_base:
        return LocalModel(
            model=_pick_model_name(active_env, "gpt-4.1-mini"),
            base_url=openai_base,
            api_key="ephemeral-local-placeholder",
        )
    raise RuntimeError("MISSING_LLM_CREDENTIALS")
