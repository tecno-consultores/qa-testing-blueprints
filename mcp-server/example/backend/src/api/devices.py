# SPDX-License-Identifier: MIT
from __future__ import annotations

import unicodedata
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from models.device import TelemetryDevice
from services.device_service import (
    RegisterDeviceInput,
    ensure_mutation_role,
    list_tenant_devices,
    register_tenant_device,
)

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])
_MEMORY_STORE: list[TelemetryDevice] = []
_IDEMPOTENCY_CACHE: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}


class CreateDevicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=3, max_length=64)
    hostname: str = Field(min_length=3, max_length=128)
    cpu_load_pct: Decimal = Field(ge=Decimal("0.0"), le=Decimal("100.0"))


def resolve_verified_claims(
    x_tenant_id: Annotated[str, Header()] = "tenant-demo",
    x_actor_role: Annotated[str, Header()] = "operator",
    x_actor_username: Annotated[str, Header()] = "operador.noc",
    x_auth_tenant: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Resuelve identidad de sesión validando consistencia fail-closed de inquilino."""
    tenant_id = unicodedata.normalize("NFKC", x_tenant_id).strip()
    role = unicodedata.normalize("NFKC", x_actor_role).strip()
    username = unicodedata.normalize("NFKC", x_actor_username).strip()
    if x_auth_tenant is None:
        raise HTTPException(
            status_code=403,
            detail="Missing verified X-Auth-Tenant header (fail-closed)",
        )
    bound_tenant = unicodedata.normalize("NFKC", x_auth_tenant).strip()
    if not bound_tenant or bound_tenant != tenant_id:
        raise HTTPException(
            status_code=403,
            detail="Cross-tenant access spoofing rejected",
        )
    return {"tenant_id": tenant_id, "role": role, "username": username}


@router.get("")
async def get_devices_endpoint(
    claims: Annotated[dict[str, str], Depends(resolve_verified_claims)],
) -> list[dict[str, str]]:
    items = list_tenant_devices(_MEMORY_STORE, claims["tenant_id"])
    return [
        {
            "id": item.id,
            "hostname": item.hostname,
            "cpu_load_pct": str(item.cpu_load_pct),
        }
        for item in items
    ]


def _payload_fingerprint(payload: CreateDevicePayload) -> str:
    clean_id = unicodedata.normalize("NFKC", payload.id).strip()
    clean_host = unicodedata.normalize("NFKC", payload.hostname).strip()
    return f"{clean_id}|{clean_host}|{payload.cpu_load_pct}"


def _validate_idempotency_key(idempotency_key: str) -> str:
    clean_key = unicodedata.normalize("NFKC", idempotency_key).strip()
    if len(clean_key) < 8:
        raise HTTPException(
            status_code=422, detail="Idempotency-Key must be at least 8 characters"
        )
    return clean_key


def _lookup_idempotent_replay(
    cache_key: tuple[str, str], fingerprint: str
) -> dict[str, Any] | None:
    if cache_key not in _IDEMPOTENCY_CACHE:
        return None
    stored_fp, stored_dto = _IDEMPOTENCY_CACHE[cache_key]
    if stored_fp != fingerprint:
        raise HTTPException(
            status_code=409,
            detail="Idempotency-Key reused with divergent payload",
        )
    return dict(stored_dto)


@router.post("", status_code=201)
async def create_device_endpoint(
    payload: CreateDevicePayload,
    claims: Annotated[dict[str, str], Depends(resolve_verified_claims)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
) -> dict[str, Any]:
    clean_key = _validate_idempotency_key(idempotency_key)
    fingerprint = _payload_fingerprint(payload)
    cache_key = (claims["tenant_id"], clean_key)
    try:
        ensure_mutation_role(claims)
        cached = _lookup_idempotent_replay(cache_key, fingerprint)
        if cached is not None:
            return cached
        device, audit = register_tenant_device(
            _MEMORY_STORE,
            claims=claims,
            device_input=RegisterDeviceInput(
                device_id=payload.id,
                hostname=payload.hostname,
                cpu_load_pct=payload.cpu_load_pct,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    response_dto: dict[str, Any] = {
        "id": device.id,
        "hostname": device.hostname,
        "cpu_load_pct": str(device.cpu_load_pct),
        "audit_actor": audit["actor_username"],
    }
    _IDEMPOTENCY_CACHE[cache_key] = (fingerprint, response_dto)
    return response_dto
