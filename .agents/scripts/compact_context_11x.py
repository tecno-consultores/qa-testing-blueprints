#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Compactador determinista de contexto Zero-LLM en 2 niveles para QA-11X v2.0."""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import sys
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

CLEARED_TOOL_MARKER = "[tool result cleared]"
DEFAULT_CONTEXT_WINDOW = 200_000
DEFAULT_THRESHOLD_RATIO = 0.90
DEFAULT_KEEP_RECENT_TOOLS = 6
DEFAULT_KEEP_LAST_MESSAGES = 20
CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class CompactionResult:
    messages: list[dict[str, Any]]
    tier_applied: int
    before_tokens: int
    after_tokens: int
    threshold_tokens: int
    context_window: int
    masked_tool_results: int
    dropped_messages: int
    uncompactable_single_message: bool


def _block_char_length(item: Any) -> int:
    if isinstance(item, str):
        return len(item)
    if isinstance(item, dict) and set(item.keys()) <= {"type", "text"} and isinstance(item.get("text"), str):
        return len(item["text"])
    return len(json.dumps(item, ensure_ascii=False, separators=(",", ":")))


def _content_char_length(content: Any) -> int:
    if content is None:
        return 0
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        return sum(_block_char_length(item) for item in content)
    return len(json.dumps(content, ensure_ascii=False, separators=(",", ":")))


def estimate_message_tokens(message: dict[str, Any]) -> int:
    """Estima tokens con ceil(len(texto) / 4) sin depender de un LLM externo."""
    total_chars = _content_char_length(message.get("content"))
    tool_calls = message.get("tool_calls")
    if tool_calls:
        total_chars += len(json.dumps(tool_calls, ensure_ascii=False, separators=(",", ":")))
    return math.ceil(total_chars / CHARS_PER_TOKEN) if total_chars > 0 else 0


def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    return sum(estimate_message_tokens(msg) for msg in messages)


def _is_tool_result_block(block: Any) -> bool:
    return isinstance(block, dict) and block.get("type") == "tool_result"


def _is_tool_result_message(message: dict[str, Any]) -> bool:
    if message.get("role") == "tool":
        return True
    content = message.get("content")
    return isinstance(content, list) and bool(content) and all(_is_tool_result_block(b) for b in content)


def _has_tool_calls(message: dict[str, Any]) -> bool:
    if message.get("role") != "assistant":
        return False
    if message.get("tool_calls"):
        return True
    content = message.get("content")
    return isinstance(content, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_use" for b in content
    )


def _collect_tool_result_slots(messages: list[dict[str, Any]]) -> list[tuple[int, int | None]]:
    slots: list[tuple[int, int | None]] = []
    for msg_idx, msg in enumerate(messages):
        if msg.get("role") == "tool":
            slots.append((msg_idx, None))
            continue
        content = msg.get("content")
        if isinstance(content, list):
            for block_idx, block in enumerate(content):
                if _is_tool_result_block(block):
                    slots.append((msg_idx, block_idx))
    return slots


def _mask_single_slot(messages: list[dict[str, Any]], msg_idx: int, block_idx: int | None) -> int:
    if block_idx is None:
        if messages[msg_idx].get("content") == CLEARED_TOOL_MARKER:
            return 0
        messages[msg_idx]["content"] = CLEARED_TOOL_MARKER
        return 1
    block = messages[msg_idx]["content"][block_idx]
    if block.get("content") == CLEARED_TOOL_MARKER:
        return 0
    block["content"] = CLEARED_TOOL_MARKER
    return 1


def apply_tier1_masking(
    messages: list[dict[str, Any]],
    keep_recent_tools: int = DEFAULT_KEEP_RECENT_TOOLS,
) -> tuple[list[dict[str, Any]], int]:
    """Nivel 1: enmascara resultados de tools antiguos preservando los últimos N pares."""
    updated = copy.deepcopy(messages)
    slots = _collect_tool_result_slots(updated)
    cutoff = len(slots) if keep_recent_tools <= 0 else max(0, len(slots) - keep_recent_tools)
    masked = sum(_mask_single_slot(updated, msg_idx, blk_idx) for msg_idx, blk_idx in slots[:cutoff])
    return updated, masked


def _find_root_prefix(messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    first_user_idx: int | None = None
    for idx, msg in enumerate(messages):
        if msg.get("role") == "user" and not _is_tool_result_message(msg):
            first_user_idx = idx
            break
    if first_user_idx is None:
        return [], list(messages)
    prefix: list[dict[str, Any]] = []
    rest: list[dict[str, Any]] = []
    for idx, msg in enumerate(messages):
        if idx == first_user_idx or (idx < first_user_idx and msg.get("role") == "system"):
            prefix.append(msg)
        else:
            rest.append(msg)
    return prefix, rest


def _group_atomic_units(messages: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    idx = 0
    total = len(messages)
    while idx < total:
        current = [messages[idx]]
        if _has_tool_calls(messages[idx]):
            idx += 1
            while idx < total and _is_tool_result_message(messages[idx]):
                current.append(messages[idx])
                idx += 1
            groups.append(current)
            continue
        idx += 1
        groups.append(current)
    return groups


def _needs_further_pruning(
    kept_groups: list[list[dict[str, Any]]],
    prefix_count: int,
    tail_count: int,
    keep_last_messages: int,
    projected_tokens: int,
    threshold_tokens: int,
) -> bool:
    if len(kept_groups) <= 1:
        return False
    return (prefix_count + tail_count > keep_last_messages) or (projected_tokens > threshold_tokens)


def apply_tier2_atomic_prune(
    messages: list[dict[str, Any]],
    keep_last_messages: int,
    threshold_tokens: int,
    base_offset_tokens: int,
) -> tuple[list[dict[str, Any]], int]:
    """Nivel 2: poda grupos antiguos preservando raíz y atomicidad tool_call <-> tool_result."""
    prefix, tail = _find_root_prefix(messages)
    groups = _group_atomic_units(tail)
    if not groups:
        return prefix, 0

    kept = list(groups)
    prefix_tokens = estimate_messages_tokens(prefix)
    tail_tokens = sum(estimate_messages_tokens(g) for g in kept)
    tail_count = sum(len(g) for g in kept)
    dropped = 0

    while _needs_further_pruning(
        kept, len(prefix), tail_count, keep_last_messages, base_offset_tokens + prefix_tokens + tail_tokens, threshold_tokens
    ):
        removed = kept.pop(0)
        dropped += len(removed)
        tail_count -= len(removed)
        tail_tokens -= estimate_messages_tokens(removed)

    flattened = [msg for group in kept for msg in group]
    return [*prefix, *flattened], dropped


def _validate_parameters(
    context_window: int,
    threshold_ratio: float,
    keep_recent_tools: int,
    keep_last_messages: int,
    anchor_tokens: int,
) -> None:
    if context_window <= 0:
        raise ValueError("--context-window debe ser > 0.")
    if not (0.0 < threshold_ratio <= 1.0):
        raise ValueError("--threshold-ratio debe estar en (0, 1].")
    if keep_recent_tools < 0:
        raise ValueError("--keep-recent-tools debe ser >= 0.")
    if keep_last_messages < 1:
        raise ValueError("--keep-last-messages debe ser >= 1.")
    if anchor_tokens < 0:
        raise ValueError("--anchor-tokens debe ser >= 0.")


def compact_context(
    messages: list[dict[str, Any]],
    *,
    anchor_tokens: int = 0,
    context_window: int = DEFAULT_CONTEXT_WINDOW,
    threshold_ratio: float = DEFAULT_THRESHOLD_RATIO,
    keep_recent_tools: int = DEFAULT_KEEP_RECENT_TOOLS,
    keep_last_messages: int = DEFAULT_KEEP_LAST_MESSAGES,
) -> CompactionResult:
    """Ejecuta compactación determinista en 2 niveles sin LLM."""
    _validate_parameters(context_window, threshold_ratio, keep_recent_tools, keep_last_messages, anchor_tokens)
    threshold_tokens = int(context_window * threshold_ratio)
    raw_before = estimate_messages_tokens(messages)
    before_tokens = anchor_tokens + raw_before
    oversized = any(estimate_message_tokens(msg) > context_window for msg in messages)

    if before_tokens <= threshold_tokens:
        return CompactionResult(
            messages=copy.deepcopy(messages),
            tier_applied=0,
            before_tokens=before_tokens,
            after_tokens=before_tokens,
            threshold_tokens=threshold_tokens,
            context_window=context_window,
            masked_tool_results=0,
            dropped_messages=0,
            uncompactable_single_message=oversized,
        )

    tier1_msgs, masked_count = apply_tier1_masking(messages, keep_recent_tools=keep_recent_tools)
    raw_after_t1 = estimate_messages_tokens(tier1_msgs)
    after_t1 = max(raw_after_t1, before_tokens - max(0, raw_before - raw_after_t1))
    tier_applied = 1 if masked_count > 0 else 0

    if after_t1 <= threshold_tokens:
        return CompactionResult(
            messages=tier1_msgs,
            tier_applied=tier_applied,
            before_tokens=before_tokens,
            after_tokens=after_t1,
            threshold_tokens=threshold_tokens,
            context_window=context_window,
            masked_tool_results=masked_count,
            dropped_messages=0,
            uncompactable_single_message=oversized,
        )

    tier2_msgs, dropped_count = apply_tier2_atomic_prune(
        tier1_msgs,
        keep_last_messages=keep_last_messages,
        threshold_tokens=threshold_tokens,
        base_offset_tokens=max(0, before_tokens - raw_before),
    )
    raw_after_t2 = estimate_messages_tokens(tier2_msgs)
    after_t2 = max(raw_after_t2, before_tokens - max(0, raw_before - raw_after_t2))
    if dropped_count > 0:
        tier_applied = 2

    return CompactionResult(
        messages=tier2_msgs,
        tier_applied=tier_applied,
        before_tokens=before_tokens,
        after_tokens=after_t2,
        threshold_tokens=threshold_tokens,
        context_window=context_window,
        masked_tool_results=masked_count,
        dropped_messages=dropped_count,
        uncompactable_single_message=oversized,
    )


def _extract_input_payload(raw_text: str) -> tuple[list[dict[str, Any]], int]:
    data = json.loads(raw_text)
    if isinstance(data, list):
        messages = data
        payload_anchor = 0
    elif isinstance(data, dict) and isinstance(data.get("messages"), list):
        messages = data["messages"]
        payload_anchor = int(data.get("anchor_tokens", 0))
    else:
        raise TypeError("El JSON de entrada debe ser una lista de mensajes o un objeto con clave 'messages'.")
    if not all(isinstance(item, dict) for item in messages):
        raise TypeError("Cada mensaje en 'messages' debe ser un objeto JSON.")
    return messages, payload_anchor


def _load_input_payload(input_path: str | None) -> tuple[list[dict[str, Any]], int]:
    if input_path is None or input_path == "-":
        if sys.stdin.isatty():
            raise PermissionError(
                "[QA-CLI-TTY-01] Se requiere --input <json> o entrada por tubería stdin; TTY interactivo rechazado."
            )
        return _extract_input_payload(sys.stdin.read())
    if "\0" in input_path:
        raise ValueError("Ruta --input inválida.")
    resolved = Path(input_path).resolve()
    return _extract_input_payload(resolved.read_text(encoding="utf-8"))


def _write_output_atomic(output_path: str, result: CompactionResult) -> None:
    if "\0" in output_path:
        raise ValueError("Ruta --output inválida.")
    dest = Path(output_path).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest.parent / f".compact-{uuid.uuid4().hex}.tmp"
    payload = json.dumps(asdict(result), indent=2, ensure_ascii=False) + "\n"
    try:
        tmp_path.write_text(payload, encoding="utf-8")
        os.replace(tmp_path, dest)
    except OSError:
        tmp_path.unlink(missing_ok=True)
        raise


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compactador determinista de contexto Zero-LLM en 2 niveles (QA-11X v2.0)."
    )
    parser.add_argument("--input", type=str, default=None, help="Archivo JSON de mensajes (o '-' para stdin).")
    parser.add_argument("--output", type=str, default=None, help="Archivo JSON de salida compactado.")
    parser.add_argument("--anchor-tokens", type=int, default=None, help="Tokens base reportados del último turno.")
    parser.add_argument("--context-window", type=int, default=DEFAULT_CONTEXT_WINDOW, help="Ventana de contexto total.")
    parser.add_argument("--threshold-ratio", type=float, default=DEFAULT_THRESHOLD_RATIO, help="Umbral de disparo (0..1].")
    parser.add_argument("--keep-recent-tools", type=int, default=DEFAULT_KEEP_RECENT_TOOLS, help="Pares recientes de tools a conservar.")
    parser.add_argument("--keep-last-messages", type=int, default=DEFAULT_KEEP_LAST_MESSAGES, help="Mensajes máximos tras Tier 2.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI no interactivo con guardia QA-CLI-TTY-01."""
    args = parse_args(argv)
    try:
        messages, payload_anchor = _load_input_payload(args.input)
        anchor = payload_anchor if args.anchor_tokens is None else args.anchor_tokens
        result = compact_context(
            messages,
            anchor_tokens=anchor,
            context_window=args.context_window,
            threshold_ratio=args.threshold_ratio,
            keep_recent_tools=args.keep_recent_tools,
            keep_last_messages=args.keep_last_messages,
        )
        if args.output is not None:
            _write_output_atomic(args.output, result)
    except (PermissionError, OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"❌ [compact-context] {exc}", file=sys.stderr)
        return 1

    oversized_flag = str(result.uncompactable_single_message).lower()
    print(
        f"✅ [compact-context] tier_applied={result.tier_applied} before_tokens={result.before_tokens} "
        f"after_tokens={result.after_tokens} threshold_tokens={result.threshold_tokens} "
        f"masked_tool_results={result.masked_tool_results} dropped_messages={result.dropped_messages} "
        f"uncompactable_single_message={oversized_flag}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
