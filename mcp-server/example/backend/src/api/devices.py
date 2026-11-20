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
    list_tenant_devices,
    register_tenant_device,
)

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])
_MEMORY_STORE: list[TelemetryDevice] = []
_IDEMPOTENCY_CACHE: dict[tuple[str, str], dict[str, Any]] = {}


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
    """Resuelve identidad de sesión validando consistencia de inquilino."""
    tenant_id = unicodedata.normalize("NFKC", x_tenant_id).strip()
    role = unicodedata.normalize("NFKC", x_actor_role).strip()
    username = unicodedata.normalize("NFKC", x_actor_username).strip()
    if x_auth_tenant is not None:
        bound_tenant = unicodedata.normalize("NFKC", x_auth_tenant).strip()
        if bound_tenant != tenant_id:
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


@router.post("", status_code=201)
async def create_device_endpoint(
    payload: CreateDevicePayload,
    claims: Annotated[dict[str, str], Depends(resolve_verified_claims)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
) -> dict[str, Any]:
    clean_key = unicodedata.normalize("NFKC", idempotency_key).strip()
    cache_key = (claims["tenant_id"], clean_key)
    if cache_key in _IDEMPOTENCY_CACHE:
        return dict(_IDEMPOTENCY_CACHE[cache_key])
    try:
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
    _IDEMPOTENCY_CACHE[cache_key] = response_dto
    return response_dto
