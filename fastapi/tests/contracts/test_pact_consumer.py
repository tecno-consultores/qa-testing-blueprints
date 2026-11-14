# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas de contrato Consumer-Driven Zero-Infra (Pact V4) para FastAPI -> Node."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

import pytest
from pact import Pact, match

CONSUMER_NAME = "fastapi-billing-consumer"
PROVIDER_NAME = "node-inventory-provider"
PACT_FILENAME = f"{CONSUMER_NAME}-{PROVIDER_NAME}.json"

UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
TENANT_ID_RE = re.compile(r"^tenant-[a-z0-9-]+$")
DECIMAL_STR_RE = re.compile(r"^\d+\.\d{2}$")

NOMINAL_IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440001"
BATCH_IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440002"
CONFLICT_IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440099"
MISSING_RESERVATION_ID = "00000000-0000-4000-8000-000000000404"
CREATED_RESERVATION_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7"


@dataclass(frozen=True)
class ReservationRequest:
    """Solicitud canónica de reserva con precio monetario exacto en Decimal."""

    sku: str
    quantity: int
    unit_price: Decimal


@dataclass(frozen=True)
class ReservationReceipt:
    """Confirmación tipada de reserva emitida por el proveedor."""

    reservation_id: str
    status: str
    unit_price: Decimal
    idempotency_key: str


@dataclass(frozen=True)
class ProblemDetail:
    """Representación RFC 7807 (application/problem+json)."""

    type_uri: str
    title: str
    status: int
    detail: str


@dataclass(frozen=True)
class BatchItemResult:
    """Resultado individual por ítem en un lote de reservas."""

    sku: str
    status: str


@dataclass(frozen=True)
class BatchReservationReport:
    """Resumen por ítem evitando falsos verdes ante HTTP 200 OK parcial."""

    results: tuple[BatchItemResult, ...]
    succeeded_skus: tuple[str, ...]
    rejected_skus: tuple[str, ...]
    all_succeeded: bool


class ContractViolationError(RuntimeError):
    """Error bloqueante ante ruptura del contrato HTTP o tipos monetarios."""


class IdempotencyConflictError(RuntimeError):
    """Error ante colisión HTTP 409 de Idempotency-Key con payload mutado."""

    def __init__(self, problem: ProblemDetail) -> None:
        super().__init__(problem.detail)
        self.problem = problem


def format_decimal_price(value: object) -> str:
    """Valida que el monto sea Decimal exacto (2 decimales) y lo serializa."""
    if not isinstance(value, Decimal):
        raise TypeError("unit_price debe ser Decimal exacto; prohibido float binario.")
    if not value.is_finite() or value <= Decimal("0"):
        raise ValueError("unit_price debe ser un Decimal finito y positivo.")
    if value != value.quantize(Decimal("0.01")):
        raise ValueError("unit_price debe tener exactamente 2 decimales.")
    return f"{value:.2f}"


def parse_decimal_str(raw: object, field_name: str) -> Decimal:
    """Exige cadena decimal estricta en JSON antes de instanciar Decimal."""
    if not isinstance(raw, str):
        raise TypeError(f"{field_name} debe serializarse como string Decimal exacto.")
    if not DECIMAL_STR_RE.fullmatch(raw):
        raise ValueError(f"{field_name} no cumple formato decimal '^\\d+\\.\\d{{2}}$'.")
    return Decimal(raw)


def validate_uuidv4(value: str, field_name: str) -> str:
    """Valida formato UUIDv4 antes de emitir llamadas mutables a red."""
    cleaned = value.strip()
    if not UUID_V4_RE.fullmatch(cleaned):
        raise ValueError(f"{field_name} debe ser un UUIDv4 válido.")
    return cleaned


def validate_tenant_id(tenant_id: str) -> str:
    """Valida formato canónico del identificador multi-tenant."""
    cleaned = tenant_id.strip()
    if not TENANT_ID_RE.fullmatch(cleaned):
        raise ValueError("tenant_id debe cumplir el patrón '^tenant-[a-z0-9-]+$'.")
    return cleaned


def _decode_json_object(raw_bytes: bytes) -> dict[str, object]:
    loaded = json.loads(raw_bytes.decode("utf-8"))
    if not isinstance(loaded, dict):
        raise ContractViolationError("Se esperaba un objeto JSON desde el proveedor.")
    return {str(k): v for k, v in loaded.items()}


def _normalize_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {k.lower(): v for k, v in headers.items()}


def _execute_http_json(
    url: str,
    method: str,
    headers: Mapping[str, str],
    payload: Mapping[str, object] | None,
) -> tuple[int, dict[str, str], dict[str, object]]:
    body_bytes = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body_bytes,
        headers=dict(headers),
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            raw_headers = {k: v for k, v in resp.headers.items()}
            data = _decode_json_object(resp.read())
            return int(resp.status), _normalize_headers(raw_headers), data
    except urllib.error.HTTPError as exc:
        raw_headers = {k: v for k, v in exc.headers.items()}
        return int(exc.code), _normalize_headers(raw_headers), _decode_json_object(
            exc.read()
        )


def _parse_problem_detail(status: int, data: Mapping[str, object]) -> ProblemDetail:
    return ProblemDetail(
        type_uri=str(data.get("type", "")),
        title=str(data.get("title", "")),
        status=int(str(data.get("status", status))),
        detail=str(data.get("detail", "")),
    )


def _serialize_item(item: ReservationRequest) -> dict[str, object]:
    if not item.sku.strip() or item.quantity <= 0:
        raise ValueError("Cada ítem requiere sku no vacío y quantity > 0.")
    return {
        "sku": item.sku,
        "quantity": item.quantity,
        "unitPrice": format_decimal_price(item.unit_price),
    }


def _parse_batch_item(raw_item: object) -> BatchItemResult:
    if not isinstance(raw_item, dict):
        raise ContractViolationError("Cada resultado de lote debe ser un objeto JSON.")
    sku = str(raw_item.get("sku", ""))
    status = str(raw_item.get("status", ""))
    if status not in {"SUCCEEDED", "REJECTED_OUT_OF_STOCK"}:
        raise ContractViolationError(f"Estado de lote inesperado: {status}")
    return BatchItemResult(sku=sku, status=status)


def _verify_echoed_key(headers: Mapping[str, str], expected_key: str) -> None:
    echoed = headers.get("idempotency-key", "")
    if echoed != expected_key:
        raise ContractViolationError(
            "El proveedor omitió o alteró el eco de la cabecera Idempotency-Key."
        )


class InventoryReservationClient:
    """Cliente HTTP consumidor con guardias Fail-Closed de idempotencia y Decimal."""

    def __init__(self, base_url: str, tenant_id: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.tenant_id = validate_tenant_id(tenant_id)

    def _mutation_headers(self, idempotency_key: str) -> dict[str, str]:
        valid_key = validate_uuidv4(idempotency_key, "Idempotency-Key")
        return {
            "Content-Type": "application/json",
            "Idempotency-Key": valid_key,
            "X-Tenant-ID": self.tenant_id,
        }

    def create_reservation(
        self, request: ReservationRequest, idempotency_key: str
    ) -> ReservationReceipt:
        """Crea una reserva exigiendo Decimal exacto e Idempotency-Key UUIDv4."""
        body = _serialize_item(request)
        headers = self._mutation_headers(idempotency_key)
        status, resp_headers, data = _execute_http_json(
            f"{self.base_url}/api/v1/reservations", "POST", headers, body
        )
        if status == 409:
            raise IdempotencyConflictError(_parse_problem_detail(status, data))
        if status != 201:
            raise ContractViolationError(f"Se esperaba HTTP 201 y se recibió {status}.")
        _verify_echoed_key(resp_headers, headers["Idempotency-Key"])
        return ReservationReceipt(
            reservation_id=validate_uuidv4(
                str(data.get("reservationId", "")), "reservationId"
            ),
            status=str(data.get("status", "")),
            unit_price=parse_decimal_str(data.get("unitPrice"), "unitPrice"),
            idempotency_key=headers["Idempotency-Key"],
        )

    def get_reservation(
        self, reservation_id: str
    ) -> ReservationReceipt | ProblemDetail:
        """Consulta una reserva; retorna ProblemDetail RFC 7807 ante 404."""
        valid_id = validate_uuidv4(reservation_id, "reservation_id")
        status, _, data = _execute_http_json(
            f"{self.base_url}/api/v1/reservations/{valid_id}",
            "GET",
            {"X-Tenant-ID": self.tenant_id},
            None,
        )
        if status == 404:
            return _parse_problem_detail(status, data)
        if status != 200:
            raise ContractViolationError(f"Se esperaba HTTP 200/404 y llegó {status}.")
        return ReservationReceipt(
            reservation_id=validate_uuidv4(
                str(data.get("reservationId", "")), "reservationId"
            ),
            status=str(data.get("status", "")),
            unit_price=parse_decimal_str(data.get("unitPrice"), "unitPrice"),
            idempotency_key="",
        )

    def reserve_batch(
        self, items: Sequence[ReservationRequest], idempotency_key: str
    ) -> BatchReservationReport:
        """Ejecuta reserva batch e inspecciona results[].status ítem por ítem."""
        if not items:
            raise ValueError("El lote de reservas no puede estar vacío.")
        body: dict[str, object] = {"items": [_serialize_item(item) for item in items]}
        headers = self._mutation_headers(idempotency_key)
        status, resp_headers, data = _execute_http_json(
            f"{self.base_url}/api/v1/reservations/batch", "POST", headers, body
        )
        if status != 200:
            raise ContractViolationError(f"Se esperaba HTTP 200 y llegó {status}.")
        _verify_echoed_key(resp_headers, headers["Idempotency-Key"])
        raw_results = data.get("results")
        if not isinstance(raw_results, list):
            raise ContractViolationError("El proveedor no devolvió arreglo results[].")
        parsed = tuple(_parse_batch_item(entry) for entry in raw_results)
        succeeded = tuple(r.sku for r in parsed if r.status == "SUCCEEDED")
        rejected = tuple(r.sku for r in parsed if r.status == "REJECTED_OUT_OF_STOCK")
        return BatchReservationReport(
            results=parsed,
            succeeded_skus=succeeded,
            rejected_skus=rejected,
            all_succeeded=len(parsed) > 0 and len(rejected) == 0,
        )


def get_pact_output_dir() -> Path:
    """Resuelve y crea el directorio de artefactos Pact (PACT_OUTPUT_DIR)."""
    output_dir = Path(os.environ.get("PACT_OUTPUT_DIR", "/tmp/pacts"))
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _add_nominal_create_interaction(pact: Pact) -> None:
    (
        pact.upon_receiving("a nominal reservation creation request")
        .given("nominal_configured")
        .with_request("POST", "/api/v1/reservations")
        .with_header("Content-Type", "application/json")
        .with_header("Idempotency-Key", match.uuid(NOMINAL_IDEMPOTENCY_KEY))
        .with_header(
            "X-Tenant-ID", match.regex("tenant-alpha", regex=r"^tenant-[a-z0-9-]+$")
        )
        .with_body(
            {
                "sku": "ROUTER-CCR2004",
                "quantity": 2,
                "unitPrice": match.regex("149.95", regex=r"^\d+\.\d{2}$"),
            },
            content_type="application/json",
        )
        .will_respond_with(201)
        .with_header(
            "Content-Type",
            match.regex("application/json", regex=r"^application/json.*$"),
        )
        .with_header("Idempotency-Key", match.uuid(NOMINAL_IDEMPOTENCY_KEY))
        .with_body(
            {
                "reservationId": match.uuid(CREATED_RESERVATION_ID),
                "status": "CONFIRMED",
                "unitPrice": match.regex("149.95", regex=r"^\d+\.\d{2}$"),
            },
            content_type="application/json",
        )
    )


def _add_virgin_missing_interaction(pact: Pact) -> None:
    (
        pact.upon_receiving("a lookup for a non-existent reservation")
        .given("virgin_empty")
        .with_request("GET", f"/api/v1/reservations/{MISSING_RESERVATION_ID}")
        .with_header(
            "X-Tenant-ID", match.regex("tenant-alpha", regex=r"^tenant-[a-z0-9-]+$")
        )
        .will_respond_with(404)
        .with_header(
            "Content-Type",
            match.regex(
                "application/problem+json", regex=r"^application/problem\+json.*$"
            ),
        )
        .with_body(
            {
                "type": "https://qa-11x.internal/problems/reservation-not-found",
                "title": "Reservation Not Found",
                "status": 404,
                "detail": match.str(
                    f"Reservation {MISSING_RESERVATION_ID} does not exist for tenant."
                ),
            },
            content_type="application/problem+json",
        )
    )


def _add_degraded_batch_interaction(pact: Pact) -> None:
    (
        pact.upon_receiving("a partial-failure batch reservation request")
        .given("degraded_conflict")
        .with_request("POST", "/api/v1/reservations/batch")
        .with_header("Content-Type", "application/json")
        .with_header("Idempotency-Key", match.uuid(BATCH_IDEMPOTENCY_KEY))
        .with_header(
            "X-Tenant-ID", match.regex("tenant-alpha", regex=r"^tenant-[a-z0-9-]+$")
        )
        .with_body(
            {
                "items": [
                    {"sku": "ROUTER-CCR2004", "quantity": 1, "unitPrice": "149.95"},
                    {"sku": "SFP-25G-LR-OOS", "quantity": 4, "unitPrice": "89.50"},
                ]
            },
            content_type="application/json",
        )
        .will_respond_with(200)
        .with_header(
            "Content-Type",
            match.regex("application/json", regex=r"^application/json.*$"),
        )
        .with_header("Idempotency-Key", match.uuid(BATCH_IDEMPOTENCY_KEY))
        .with_body(
            {
                "results": [
                    {
                        "sku": "ROUTER-CCR2004",
                        "status": match.regex(
                            "SUCCEEDED", regex=r"^(SUCCEEDED|REJECTED_OUT_OF_STOCK)$"
                        ),
                    },
                    {
                        "sku": "SFP-25G-LR-OOS",
                        "status": match.regex(
                            "REJECTED_OUT_OF_STOCK",
                            regex=r"^(SUCCEEDED|REJECTED_OUT_OF_STOCK)$",
                        ),
                    },
                ]
            },
            content_type="application/json",
        )
    )


def _add_degraded_conflict_interaction(pact: Pact) -> None:
    (
        pact.upon_receiving("a reservation creation with mutated idempotency payload")
        .given("degraded_conflict")
        .with_request("POST", "/api/v1/reservations")
        .with_header("Content-Type", "application/json")
        .with_header("Idempotency-Key", CONFLICT_IDEMPOTENCY_KEY)
        .with_header("X-Tenant-ID", "tenant-alpha")
        .with_body(
            {"sku": "ROUTER-CCR2004", "quantity": 99, "unitPrice": "149.95"},
            content_type="application/json",
        )
        .will_respond_with(409)
        .with_header(
            "Content-Type",
            match.regex(
                "application/problem+json", regex=r"^application/problem\+json.*$"
            ),
        )
        .with_header("Idempotency-Key", CONFLICT_IDEMPOTENCY_KEY)
        .with_body(
            {
                "type": "https://qa-11x.internal/problems/idempotency-conflict",
                "title": "Idempotency Key Payload Mismatch",
                "status": 409,
                "detail": match.str(
                    f"Idempotency-Key {CONFLICT_IDEMPOTENCY_KEY} was already committed "
                    "with a different payload."
                ),
            },
            content_type="application/problem+json",
        )
    )


def build_reservation_pact() -> Pact:
    """Construye el contrato Pact V4 canónico con las 3 fixtures trimodales."""
    pact = Pact(CONSUMER_NAME, PROVIDER_NAME).with_specification("V4")
    _add_nominal_create_interaction(pact)
    _add_virgin_missing_interaction(pact)
    _add_degraded_batch_interaction(pact)
    _add_degraded_conflict_interaction(pact)
    return pact


def test_consumer_pact_trimodal_contract_and_export() -> None:
    """Verifica el contrato CDCT Trimodal contra pact.serve y exporta Pact V4 JSON."""
    pact = build_reservation_pact()
    output_dir = get_pact_output_dir()
    with pact.serve(addr="127.0.0.1", port=0) as srv:
        client = InventoryReservationClient(str(srv.url), "tenant-alpha")
        receipt = client.create_reservation(
            ReservationRequest("ROUTER-CCR2004", 2, Decimal("149.95")),
            NOMINAL_IDEMPOTENCY_KEY,
        )
        assert receipt.status == "CONFIRMED"
        assert receipt.unit_price == Decimal("149.95")
        assert receipt.idempotency_key == NOMINAL_IDEMPOTENCY_KEY

        missing = client.get_reservation(MISSING_RESERVATION_ID)
        assert isinstance(missing, ProblemDetail)
        assert missing.status == 404
        assert missing.title == "Reservation Not Found"

        batch = client.reserve_batch(
            [
                ReservationRequest("ROUTER-CCR2004", 1, Decimal("149.95")),
                ReservationRequest("SFP-25G-LR-OOS", 4, Decimal("89.50")),
            ],
            BATCH_IDEMPOTENCY_KEY,
        )
        assert batch.all_succeeded is False
        assert batch.succeeded_skus == ("ROUTER-CCR2004",)
        assert batch.rejected_skus == ("SFP-25G-LR-OOS",)

        with pytest.raises(IdempotencyConflictError) as conflict_exc:
            client.create_reservation(
                ReservationRequest("ROUTER-CCR2004", 99, Decimal("149.95")),
                CONFLICT_IDEMPOTENCY_KEY,
            )
        assert conflict_exc.value.problem.status == 409

    pact.write_file(output_dir, overwrite=True)
    pact_file = output_dir / PACT_FILENAME
    assert pact_file.is_file()
    document = json.loads(pact_file.read_text(encoding="utf-8"))
    assert document["consumer"]["name"] == CONSUMER_NAME
    assert document["provider"]["name"] == PROVIDER_NAME
    assert len(document["interactions"]) == 4


def test_client_rejects_missing_idempotency_key_before_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bloquea omisión o formato inválido de Idempotency-Key sin abrir socket."""
    calls: list[str] = []

    def _forbidden_urlopen(req: urllib.request.Request, timeout: float = 0.0) -> object:
        calls.append(f"{req.full_url}:{timeout}")
        raise AssertionError("No debe llamarse la red sin Idempotency-Key válido.")

    monkeypatch.setattr(urllib.request, "urlopen", _forbidden_urlopen)
    client = InventoryReservationClient("http://127.0.0.1:65534", "tenant-alpha")
    item = ReservationRequest("ROUTER-CCR2004", 1, Decimal("149.95"))
    with pytest.raises(ValueError, match="UUIDv4"):
        client.create_reservation(item, "")
    with pytest.raises(ValueError, match="UUIDv4"):
        client.reserve_batch([item], "not-a-uuid")
    assert calls == []


def test_client_rejects_binary_float_and_invalid_inputs() -> None:
    """Impide serialización float binaria y entradas inválidas en dominio/respuesta."""
    with pytest.raises(TypeError, match="Decimal"):
        format_decimal_price(149.95)
    with pytest.raises(ValueError, match="positivo"):
        format_decimal_price(Decimal("0.00"))
    with pytest.raises(ValueError, match="2 decimales"):
        format_decimal_price(Decimal("149.951"))
    with pytest.raises(TypeError, match="string Decimal"):
        parse_decimal_str(149.95, "unitPrice")
    with pytest.raises(ValueError, match="formato decimal"):
        parse_decimal_str("149.9", "unitPrice")
    with pytest.raises(ValueError, match="formato decimal"):
        parse_decimal_str("99.xx", "unitPrice")
    with pytest.raises(ValueError, match="tenant_id"):
        validate_tenant_id("public")
    client = InventoryReservationClient("http://127.0.0.1:65534", "tenant-alpha")
    with pytest.raises(ValueError, match="vacío"):
        client.reserve_batch([], NOMINAL_IDEMPOTENCY_KEY)
    with pytest.raises(ValueError, match="quantity"):
        client.create_reservation(
            ReservationRequest(" ", 0, Decimal("10.00")), NOMINAL_IDEMPOTENCY_KEY
        )


class _FakeHttpResponse:
    """Respuesta HTTP mínima en memoria para pruebas de ruptura de contrato."""

    def __init__(self, status: int, headers: dict[str, str], payload: object) -> None:
        self.status = status
        self.headers = headers
        self._raw = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._raw

    def __enter__(self) -> _FakeHttpResponse:
        return self

    def __exit__(self, *_: object) -> None:
        return None


def _build_contract_break_responses() -> list[_FakeHttpResponse]:
    return [
        _FakeHttpResponse(
            200,
            {"Content-Type": "application/json"},
            {
                "reservationId": CREATED_RESERVATION_ID,
                "status": "CONFIRMED",
                "unitPrice": "149.95",
            },
        ),
        _FakeHttpResponse(
            201,
            {"Content-Type": "application/json"},
            {
                "reservationId": CREATED_RESERVATION_ID,
                "status": "CONFIRMED",
                "unitPrice": "149.95",
            },
        ),
        _FakeHttpResponse(500, {}, {"error": "boom"}),
        _FakeHttpResponse(502, {}, {"error": "bad gateway"}),
        _FakeHttpResponse(200, {}, ["not-an-object"]),
        _FakeHttpResponse(
            200,
            {"Idempotency-Key": BATCH_IDEMPOTENCY_KEY},
            {"results": "not-a-list"},
        ),
        _FakeHttpResponse(
            200,
            {"Idempotency-Key": BATCH_IDEMPOTENCY_KEY},
            {"results": ["bad-item"]},
        ),
        _FakeHttpResponse(
            200,
            {"Idempotency-Key": BATCH_IDEMPOTENCY_KEY},
            {"results": [{"sku": "A", "status": "UNKNOWN"}]},
        ),
        _FakeHttpResponse(503, {}, {"error": "down"}),
    ]


def test_client_detects_contract_breaks_with_fake_responses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Valida caminos 200 GET y detección de respuestas corruptas del proveedor."""
    client = InventoryReservationClient("http://127.0.0.1:18080", "tenant-alpha")
    responses = _build_contract_break_responses()

    def _fake_urlopen(
        req: urllib.request.Request, timeout: float = 0.0
    ) -> _FakeHttpResponse:
        assert req.full_url.startswith("http://127.0.0.1:18080")
        assert timeout > 0
        return responses.pop(0)

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    found = client.get_reservation(CREATED_RESERVATION_ID)
    assert isinstance(found, ReservationReceipt)
    assert found.unit_price == Decimal("149.95")

    req_item = ReservationRequest("ROUTER-CCR2004", 1, Decimal("149.95"))
    with pytest.raises(ContractViolationError, match="Idempotency-Key"):
        client.create_reservation(req_item, NOMINAL_IDEMPOTENCY_KEY)
    with pytest.raises(ContractViolationError, match="HTTP 201"):
        client.create_reservation(req_item, NOMINAL_IDEMPOTENCY_KEY)
    with pytest.raises(ContractViolationError, match="HTTP 200/404"):
        client.get_reservation(CREATED_RESERVATION_ID)
    with pytest.raises(ContractViolationError, match="objeto JSON"):
        client.get_reservation(CREATED_RESERVATION_ID)
    with pytest.raises(ContractViolationError, match="results\\[\\]"):
        client.reserve_batch([req_item], BATCH_IDEMPOTENCY_KEY)
    with pytest.raises(ContractViolationError, match="objeto JSON"):
        client.reserve_batch([req_item], BATCH_IDEMPOTENCY_KEY)
    with pytest.raises(ContractViolationError, match="Estado de lote"):
        client.reserve_batch([req_item], BATCH_IDEMPOTENCY_KEY)
    with pytest.raises(ContractViolationError, match="HTTP 200"):
        client.reserve_batch([req_item], BATCH_IDEMPOTENCY_KEY)
