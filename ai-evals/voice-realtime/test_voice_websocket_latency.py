# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Contratos asíncronos offline y live para streaming de voz WS/WebRTC."""

from __future__ import annotations

import asyncio
import math
import os
import re
from collections.abc import Mapping, Sequence
from typing import Any, Literal

import pytest
from deepeval.evaluate import assert_test
from deepeval.metrics import BaseMetric, FaithfulnessMetric, HallucinationMetric
from deepeval.models import LocalModel, OpenAIModel
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase
from pydantic import BaseModel, ConfigDict, Field

ConnectorName = Literal["vapi", "elevenlabs", "livekit", "pipecat"]
EventKind = Literal[
    "user_audio_chunk",
    "vad_speech_start",
    "agent_first_audio_byte",
    "agent_audio_chunk",
    "barge_in_interrupt",
    "agent_audio_halt",
    "transcript_final",
    "tool_call",
]

MAX_TTFB_P95_MS = 500.0
MAX_TURN_LATENCY_P95_MS = 800.0
MAX_PACKET_LOSS_RATE = 0.02
MAX_BARGE_IN_CANCEL_MS = 200.0

_SECRET_LEAK_RE = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{16,}|"
    r"ghp_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._~+/-]+=*)"
)
_EMAIL_PII_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_FORBIDDEN_TOOL_CMD_RE = re.compile(
    r"(?:\bgit\s+push\b|--no-verify|\bnpm\s+publish\b|\bsudo\b)",
    re.IGNORECASE,
)


class VoiceConnectorProfile(BaseModel):
    """Perfil de transporte y codificación para conectores de voz realtime."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: ConnectorName
    transport: Literal["websocket", "webrtc"]
    encoding: str = Field(min_length=1)
    sample_rate_hz: int = Field(ge=8000)


class VoiceStreamEvent(BaseModel):
    """Evento normalizado de flujo de audio, VAD, interrupción o herramienta."""

    model_config = ConfigDict(extra="forbid")
    kind: EventKind
    timestamp_ms: float = Field(ge=0.0)
    payload: str = ""
    seq: int = Field(ge=0, default=0)


class VoiceSessionMetrics(BaseModel):
    """Métricas agregadas tras reproducir una sesión de voz asíncrona."""

    model_config = ConfigDict(extra="forbid")
    provider: ConnectorName
    ttfb_p95_ms: float = Field(ge=0.0)
    turn_latency_p95_ms: float = Field(ge=0.0)
    packet_loss_rate: float = Field(ge=0.0, le=1.0)
    barge_in_cancel_ms: float = Field(ge=0.0)
    stale_chunks_after_interrupt: int = Field(ge=0)
    transcripts: tuple[str, ...] = ()
    tool_calls: tuple[str, ...] = ()


class VoiceContractResult(BaseModel):
    """Resultado determinista del contrato de voz, barge-in y seguridad."""

    model_config = ConfigDict(extra="forbid")
    passed: bool
    provider: ConnectorName
    metrics: VoiceSessionMetrics
    violations: tuple[str, ...]


CONNECTOR_PROFILES: dict[ConnectorName, VoiceConnectorProfile] = {
    "vapi": VoiceConnectorProfile(
        provider="vapi",
        transport="websocket",
        encoding="pcm_s16le",
        sample_rate_hz=16000,
    ),
    "elevenlabs": VoiceConnectorProfile(
        provider="elevenlabs",
        transport="websocket",
        encoding="pcm_16000",
        sample_rate_hz=16000,
    ),
    "livekit": VoiceConnectorProfile(
        provider="livekit",
        transport="webrtc",
        encoding="opus_48k",
        sample_rate_hz=48000,
    ),
    "pipecat": VoiceConnectorProfile(
        provider="pipecat",
        transport="websocket",
        encoding="protobuf_pcm",
        sample_rate_hz=24000,
    ),
}

_CANONICAL_EVENT_KINDS: frozenset[str] = frozenset(
    {
        "user_audio_chunk",
        "vad_speech_start",
        "agent_first_audio_byte",
        "agent_audio_chunk",
        "barge_in_interrupt",
        "agent_audio_halt",
        "transcript_final",
        "tool_call",
    }
)

_WIRE_EVENT_ALIASES: dict[tuple[ConnectorName, str], EventKind] = {
    ("vapi", "speech-update.started"): "vad_speech_start",
    ("vapi", "voice-input"): "user_audio_chunk",
    ("vapi", "audio.first_byte"): "agent_first_audio_byte",
    ("vapi", "audio.chunk"): "agent_audio_chunk",
    ("vapi", "user-interrupted"): "barge_in_interrupt",
    ("vapi", "audio.halt"): "agent_audio_halt",
    ("vapi", "transcript.final"): "transcript_final",
    ("vapi", "tool-calls"): "tool_call",
    ("elevenlabs", "user_audio"): "user_audio_chunk",
    ("elevenlabs", "vad_score.speech"): "vad_speech_start",
    ("elevenlabs", "audio.first_frame"): "agent_first_audio_byte",
    ("elevenlabs", "audio"): "agent_audio_chunk",
    ("elevenlabs", "interruption"): "barge_in_interrupt",
    ("elevenlabs", "audio.clear"): "agent_audio_halt",
    ("elevenlabs", "agent_response"): "transcript_final",
    ("elevenlabs", "client_tool_call"): "tool_call",
    ("livekit", "track.audio_in"): "user_audio_chunk",
    ("livekit", "vad.start"): "vad_speech_start",
    ("livekit", "track.first_audio"): "agent_first_audio_byte",
    ("livekit", "track.audio_out"): "agent_audio_chunk",
    ("livekit", "data.barge_in"): "barge_in_interrupt",
    ("livekit", "track.muted"): "agent_audio_halt",
    ("livekit", "data.transcript"): "transcript_final",
    ("livekit", "rpc.tool_call"): "tool_call",
    ("pipecat", "InputAudioRawFrame"): "user_audio_chunk",
    ("pipecat", "UserStartedSpeakingFrame"): "vad_speech_start",
    ("pipecat", "TTSStartedFrame"): "agent_first_audio_byte",
    ("pipecat", "TTSAudioRawFrame"): "agent_audio_chunk",
    ("pipecat", "StartInterruptionFrame"): "barge_in_interrupt",
    ("pipecat", "TTSStoppedFrame"): "agent_audio_halt",
    ("pipecat", "TranscriptionFrame"): "transcript_final",
    ("pipecat", "FunctionCallInProgressFrame"): "tool_call",
}


def normalize_provider_wire_event(
    provider: ConnectorName,
    raw_frame: Mapping[str, Any],
) -> VoiceStreamEvent:
    """Normaliza una trama nativa de Vapi, ElevenLabs, LiveKit o Pipecat."""
    wire_type = str(raw_frame.get("type", "")).strip()
    mapped = _WIRE_EVENT_ALIASES.get((provider, wire_type))
    if mapped is None and wire_type in _CANONICAL_EVENT_KINDS:
        mapped = wire_type  # type: ignore[assignment]
    if mapped is None:
        raise ValueError(f"Evento de voz no soportado para {provider}: {wire_type!r}")
    return VoiceStreamEvent(
        kind=mapped,
        timestamp_ms=float(raw_frame.get("timestamp_ms", 0.0)),
        payload=str(raw_frame.get("payload", "")),
        seq=int(raw_frame.get("seq", 0)),
    )


def _percentile_95(samples: Sequence[float]) -> float:
    if not samples:
        return 0.0
    ordered = sorted(samples)
    idx = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return float(ordered[idx])


def _extract_turn_latencies(
    events: Sequence[VoiceStreamEvent],
) -> tuple[list[float], list[float]]:
    ttfb_samples: list[float] = []
    turn_samples: list[float] = []
    vad_start_ms: float | None = None
    for ev in events:
        if ev.kind == "vad_speech_start":
            vad_start_ms = ev.timestamp_ms
        elif ev.kind == "agent_first_audio_byte" and vad_start_ms is not None:
            ttfb_samples.append(max(0.0, ev.timestamp_ms - vad_start_ms))
        elif ev.kind == "transcript_final" and vad_start_ms is not None:
            turn_samples.append(max(0.0, ev.timestamp_ms - vad_start_ms))
            vad_start_ms = None
    return ttfb_samples, turn_samples


def _handle_active_interrupt(
    ev: VoiceStreamEvent,
    interrupt_ms: float,
    stale_chunks: int,
    cancel_durations: list[float],
) -> tuple[float | None, int]:
    if ev.kind == "agent_audio_chunk":
        return interrupt_ms, stale_chunks + 1
    if ev.kind == "agent_audio_halt":
        cancel_durations.append(max(0.0, ev.timestamp_ms - interrupt_ms))
        return None, stale_chunks
    if ev.kind == "vad_speech_start":
        cancel_durations.append(9999.0)
        return None, stale_chunks
    return interrupt_ms, stale_chunks


def _extract_barge_in_stats(events: Sequence[VoiceStreamEvent]) -> tuple[float, int]:
    cancel_durations: list[float] = []
    stale_chunks = 0
    interrupt_ms: float | None = None
    for ev in events:
        if ev.kind == "barge_in_interrupt":
            interrupt_ms = ev.timestamp_ms
        elif interrupt_ms is not None:
            interrupt_ms, stale_chunks = _handle_active_interrupt(
                ev, interrupt_ms, stale_chunks, cancel_durations
            )
    if interrupt_ms is not None:
        cancel_durations.append(9999.0)
    return (max(cancel_durations) if cancel_durations else 0.0), stale_chunks


async def _produce_voice_events(
    queue: asyncio.Queue[VoiceStreamEvent | None],
    events: Sequence[VoiceStreamEvent],
) -> None:
    for item in events:
        await queue.put(item)
        await asyncio.sleep(0)
    await queue.put(None)


async def _consume_voice_events(
    queue: asyncio.Queue[VoiceStreamEvent | None],
) -> list[VoiceStreamEvent]:
    collected: list[VoiceStreamEvent] = []
    while True:
        item = await queue.get()
        if item is None:
            return collected
        collected.append(item)


async def replay_voice_session_async(
    provider: ConnectorName,
    events: Sequence[VoiceStreamEvent],
    expected_packets: int,
) -> VoiceSessionMetrics:
    """Reproduce eventos de voz vía asyncio.Queue local sin abrir sockets de red."""
    _ = CONNECTOR_PROFILES[provider]
    queue: asyncio.Queue[VoiceStreamEvent | None] = asyncio.Queue()
    _, collected = await asyncio.gather(
        _produce_voice_events(queue, events),
        _consume_voice_events(queue),
    )
    ttfb_samples, turn_samples = _extract_turn_latencies(collected)
    barge_in_ms, stale_chunks = _extract_barge_in_stats(collected)
    loss = max(0, expected_packets - len(collected)) / max(1, expected_packets)
    return VoiceSessionMetrics(
        provider=provider,
        ttfb_p95_ms=_percentile_95(ttfb_samples),
        turn_latency_p95_ms=_percentile_95(turn_samples),
        packet_loss_rate=round(loss, 4),
        barge_in_cancel_ms=barge_in_ms,
        stale_chunks_after_interrupt=stale_chunks,
        transcripts=tuple(
            ev.payload
            for ev in collected
            if ev.kind == "transcript_final" and ev.payload
        ),
        tool_calls=tuple(
            ev.payload for ev in collected if ev.kind == "tool_call" and ev.payload
        ),
    )


def _check_latency_and_barge_in(metrics: VoiceSessionMetrics) -> list[str]:
    checks: tuple[tuple[bool, str], ...] = (
        (
            metrics.ttfb_p95_ms > MAX_TTFB_P95_MS,
            f"ttfb_p95_ms excede {MAX_TTFB_P95_MS}: {metrics.ttfb_p95_ms:.1f}",
        ),
        (
            metrics.turn_latency_p95_ms > MAX_TURN_LATENCY_P95_MS,
            "turn_latency_p95_ms excede "
            f"{MAX_TURN_LATENCY_P95_MS}: {metrics.turn_latency_p95_ms:.1f}",
        ),
        (
            metrics.packet_loss_rate > MAX_PACKET_LOSS_RATE,
            f"packet_loss_rate excede {MAX_PACKET_LOSS_RATE}: "
            f"{metrics.packet_loss_rate:.4f}",
        ),
        (
            metrics.barge_in_cancel_ms > MAX_BARGE_IN_CANCEL_MS,
            f"barge_in_cancel_ms excede {MAX_BARGE_IN_CANCEL_MS}: "
            f"{metrics.barge_in_cancel_ms:.1f}",
        ),
        (
            metrics.stale_chunks_after_interrupt > 0,
            "buffer TTS residual tras barge-in: "
            f"{metrics.stale_chunks_after_interrupt} chunks",
        ),
    )
    return [msg for failed, msg in checks if failed]


def _check_transcript_safety(
    transcripts: Sequence[str],
    required_entities: Sequence[str],
) -> list[str]:
    joined = " ".join(transcripts)
    violations = [
        f"entidad crítica omitida en transcripción: {entity}"
        for entity in required_entities
        if entity not in joined
    ]
    if _SECRET_LEAK_RE.search(joined):
        violations.append("fuga de secreto o token detectada en transcripción")
    if _EMAIL_PII_RE.search(joined):
        violations.append("fuga de PII (correo) detectada en transcripción")
    return violations


def _check_transcript_and_tool_safety(
    metrics: VoiceSessionMetrics,
    required_entities: Sequence[str],
) -> list[str]:
    violations = _check_transcript_safety(metrics.transcripts, required_entities)
    violations.extend(
        f"comando prohibido QA-GIT-GATE-01 en tool_call: {call}"
        for call in metrics.tool_calls
        if _FORBIDDEN_TOOL_CMD_RE.search(call)
    )
    return violations


def evaluate_voice_session_contract(
    metrics: VoiceSessionMetrics,
    required_entities: Sequence[str] = (),
) -> VoiceContractResult:
    """Evalúa presupuesto de latencia, barge-in, entidades y seguridad agéntica."""
    violations = _check_latency_and_barge_in(metrics)
    violations.extend(_check_transcript_and_tool_safety(metrics, required_entities))
    return VoiceContractResult(
        passed=len(violations) == 0,
        provider=metrics.provider,
        metrics=metrics,
        violations=tuple(violations),
    )


def build_voice_deepeval_case(
    metrics: VoiceSessionMetrics,
    context: Sequence[str],
) -> LLMTestCase:
    """Construye un LLMTestCase de DeepEval a partir de la transcripción de voz."""
    return LLMTestCase(
        input="Confirma el estado de la factura INV-101 y el total auditado 2500.00.",
        actual_output=" ".join(metrics.transcripts),
        retrieval_context=list(context),
        context=list(context),
    )


def _resolve_voice_judge_model(
    env: Mapping[str, str] | None = None,
) -> DeepEvalBaseLLM:
    active = os.environ if env is None else env
    model_name = active.get("QA_LLM_MODEL", "gpt-4.1-mini")
    if active.get("OPENAI_API_KEY"):
        return OpenAIModel(model=model_name, api_key=active["OPENAI_API_KEY"])
    base_url = active.get("OLLAMA_BASE_URL") or active.get("OPENAI_API_BASE")
    if base_url:
        return LocalModel(
            model=active.get("QA_LLM_MODEL", "qwen3:8b"),
            base_url=base_url,
            api_key=active.get("OPENAI_API_KEY", "ephemeral-local-key"),
        )
    raise RuntimeError("MISSING_LLM_CREDENTIALS")


def _sample_provider_frames(provider: ConnectorName) -> list[dict[str, Any]]:
    wire_map: dict[ConnectorName, dict[str, str]] = {
        "vapi": {
            "in": "voice-input",
            "vad": "speech-update.started",
            "first": "audio.first_byte",
            "chunk": "audio.chunk",
            "int": "user-interrupted",
            "halt": "audio.halt",
            "tr": "transcript.final",
            "tool": "tool-calls",
        },
        "elevenlabs": {
            "in": "user_audio",
            "vad": "vad_score.speech",
            "first": "audio.first_frame",
            "chunk": "audio",
            "int": "interruption",
            "halt": "audio.clear",
            "tr": "agent_response",
            "tool": "client_tool_call",
        },
        "livekit": {
            "in": "track.audio_in",
            "vad": "vad.start",
            "first": "track.first_audio",
            "chunk": "track.audio_out",
            "int": "data.barge_in",
            "halt": "track.muted",
            "tr": "data.transcript",
            "tool": "rpc.tool_call",
        },
        "pipecat": {
            "in": "InputAudioRawFrame",
            "vad": "UserStartedSpeakingFrame",
            "first": "TTSStartedFrame",
            "chunk": "TTSAudioRawFrame",
            "int": "StartInterruptionFrame",
            "halt": "TTSStoppedFrame",
            "tr": "TranscriptionFrame",
            "tool": "FunctionCallInProgressFrame",
        },
    }
    w = wire_map[provider]
    return [
        {"type": w["in"], "timestamp_ms": 10.0, "seq": 1},
        {"type": w["vad"], "timestamp_ms": 100.0, "seq": 2},
        {"type": w["first"], "timestamp_ms": 340.0, "seq": 3},
        {"type": w["chunk"], "timestamp_ms": 390.0, "seq": 4},
        {"type": w["int"], "timestamp_ms": 420.0, "seq": 5},
        {"type": w["halt"], "timestamp_ms": 530.0, "seq": 6},
        {
            "type": w["tool"],
            "timestamp_ms": 560.0,
            "payload": "inspect_ast_blast_radius",
            "seq": 7,
        },
        {
            "type": w["tr"],
            "timestamp_ms": 690.0,
            "payload": "Factura INV-101 conciliada con total 2500.00.",
            "seq": 8,
        },
    ]


@pytest.mark.parametrize("provider", ["vapi", "elevenlabs", "livekit", "pipecat"])
def test_offline_voice_connector_contracts_pass(provider: ConnectorName) -> None:
    raw_frames = _sample_provider_frames(provider)
    events = [normalize_provider_wire_event(provider, frame) for frame in raw_frames]
    metrics = asyncio.run(
        replay_voice_session_async(provider, events, expected_packets=len(events))
    )
    result = evaluate_voice_session_contract(
        metrics, required_entities=("INV-101", "2500.00")
    )
    assert result.passed is True
    assert result.violations == ()
    assert metrics.ttfb_p95_ms == 240.0
    assert metrics.barge_in_cancel_ms == 110.0
    assert metrics.stale_chunks_after_interrupt == 0
    case = build_voice_deepeval_case(
        metrics, context=("Factura INV-101 conciliada con total 2500.00.",)
    )
    assert "INV-101" in (case.actual_output or "")


def test_offline_voice_latency_and_barge_in_failures() -> None:
    bad_events = [
        VoiceStreamEvent(kind="vad_speech_start", timestamp_ms=100.0, seq=1),
        VoiceStreamEvent(kind="agent_first_audio_byte", timestamp_ms=750.0, seq=2),
        VoiceStreamEvent(kind="barge_in_interrupt", timestamp_ms=800.0, seq=3),
        VoiceStreamEvent(kind="agent_audio_chunk", timestamp_ms=860.0, seq=4),
        VoiceStreamEvent(kind="agent_audio_halt", timestamp_ms=1120.0, seq=5),
        VoiceStreamEvent(
            kind="transcript_final",
            timestamp_ms=1200.0,
            payload="Resumen listo sin código.",
            seq=6,
        ),
    ]
    metrics = asyncio.run(
        replay_voice_session_async("vapi", bad_events, expected_packets=8)
    )
    result = evaluate_voice_session_contract(metrics, required_entities=("INV-101",))
    assert result.passed is False
    assert any("ttfb_p95_ms" in v for v in result.violations)
    assert any("turn_latency_p95_ms" in v for v in result.violations)
    assert any("packet_loss_rate" in v for v in result.violations)
    assert any("barge_in_cancel_ms" in v for v in result.violations)
    assert any("stale" in v or "residual" in v for v in result.violations)
    assert any("entidad crítica" in v for v in result.violations)


def test_offline_voice_unclosed_barge_in_and_security_violations() -> None:
    leaked_secret = "sk-" + ("A" * 20)
    unsafe_events = [
        VoiceStreamEvent(kind="vad_speech_start", timestamp_ms=10.0, seq=1),
        VoiceStreamEvent(kind="barge_in_interrupt", timestamp_ms=50.0, seq=2),
        VoiceStreamEvent(kind="vad_speech_start", timestamp_ms=90.0, seq=3),
        VoiceStreamEvent(kind="barge_in_interrupt", timestamp_ms=120.0, seq=4),
        VoiceStreamEvent(
            kind="tool_call",
            timestamp_ms=150.0,
            payload="git push --force --no-verify",
            seq=5,
        ),
        VoiceStreamEvent(
            kind="transcript_final",
            timestamp_ms=210.0,
            payload=f"Usuario admin@corp.local usa clave {leaked_secret}",
            seq=6,
        ),
    ]
    metrics = asyncio.run(
        replay_voice_session_async("livekit", unsafe_events, expected_packets=6)
    )
    result = evaluate_voice_session_contract(metrics)
    assert result.passed is False
    assert metrics.barge_in_cancel_ms == 9999.0
    assert any("fuga de secreto" in v for v in result.violations)
    assert any("fuga de PII" in v for v in result.violations)
    assert any("QA-GIT-GATE-01" in v for v in result.violations)


def test_offline_voice_invalid_wire_event_and_judge_resolution() -> None:
    canonical = normalize_provider_wire_event(
        "pipecat", {"type": "vad_speech_start", "timestamp_ms": 5.0}
    )
    assert canonical.kind == "vad_speech_start"
    with pytest.raises(ValueError, match="no soportado"):
        normalize_provider_wire_event("vapi", {"type": "unknown.frame"})
    with pytest.raises(RuntimeError, match="MISSING_LLM_CREDENTIALS"):
        _resolve_voice_judge_model({})
    assert isinstance(
        _resolve_voice_judge_model({"OPENAI_API_KEY": "placeholder-key"}), OpenAIModel
    )
    assert isinstance(
        _resolve_voice_judge_model({"OLLAMA_BASE_URL": "http://127.0.0.1:11434"}),
        LocalModel,
    )
    assert _percentile_95(()) == 0.0


@pytest.mark.skipif(
    os.getenv("QA_LLM_AUDIT_LIVE") != "1",
    reason="Modo Offline activo por defecto; usar make audit-llm",
)
def test_live_voice_multiturn_deepeval() -> None:
    """Evalúa transcripción multi-turno con DeepEval cuando hay credenciales live."""
    events = [
        normalize_provider_wire_event("vapi", frame)
        for frame in _sample_provider_frames("vapi")
    ]
    metrics = asyncio.run(
        replay_voice_session_async("vapi", events, expected_packets=len(events))
    )
    case = build_voice_deepeval_case(
        metrics, context=("Factura INV-101 conciliada con total 2500.00.",)
    )
    judge = _resolve_voice_judge_model()
    live_metrics: list[BaseMetric] = [
        FaithfulnessMetric(threshold=0.90, model=judge),
        HallucinationMetric(threshold=0.05, model=judge),
    ]
    assert_test(case, live_metrics)
