# SPDX-License-Identifier: MIT
from __future__ import annotations

from decimal import Decimal
import unicodedata
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from models.device import TelemetryDevice
from services.device_service import list_tenant_devices, register_tenant_device

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])
_MEMORY_STORE: list[TelemetryDevice] = []


class CreateDevicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=3, max_length=64)
    hostname: str = Field(min_length=3, max_length=128)
    cpu_load_pct: Decimal = Field(ge=Decimal("0.0"), le=Decimal("100.0"))


@router.get("")
async def get_devices_endpoint(x_tenant_id: str = Header(default="tenant-demo")) -> list[dict[str, str]]:
    clean_tenant = unicodedata.normalize("NFKC", x_tenant_id)
    items = list_tenant_devices(_MEMORY_STORE, clean_tenant)
    return [
        {"id": item.id, "hostname": item.hostname, "cpu_load_pct": str(item.cpu_load_pct)}
        for item in items
    ]


@router.post("", status_code=201)
async def create_device_endpoint(
    payload: CreateDevicePayload,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8),
) -> dict[str, Any]:
    _ = unicodedata.normalize("NFKC", idempotency_key)
    claims = {"tenant_id": "tenant-demo", "role": "operator", "username": "operador.noc"}
    try:
        device, audit = register_tenant_device(
            _MEMORY_STORE,
            claims=claims,
            device_id=payload.id,
            hostname=payload.hostname,
            cpu_load_pct=payload.cpu_load_pct,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"id": device.id, "hostname": device.hostname, "audit_actor": audit["actor_username"]}
