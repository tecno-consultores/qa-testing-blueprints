# SPDX-License-Identifier: MIT
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import unicodedata
from typing import Any

from models.device import TelemetryDevice

ALLOWED_MUTATION_ROLES = frozenset({"admin", "operator"})


def evaluate_maintenance_phase(device: TelemetryDevice, now_utc: datetime) -> str:
    """Evalúa el ciclo de vida temporal en las 3 fases canónicas del reloj."""
    if device.maintenance_starts_at is None or device.maintenance_ends_at is None:
        return "OPERACIONAL"
    if now_utc < device.maintenance_starts_at:
        return "Programada"
    if device.maintenance_starts_at <= now_utc <= device.maintenance_ends_at:
        return "En Curso"
    return "Expirada"


def list_tenant_devices(store: list[TelemetryDevice], tenant_id: str) -> list[TelemetryDevice]:
    """Retorna únicamente los dispositivos del tenant activo."""
    normalized_tenant = unicodedata.normalize("NFKC", tenant_id).strip()
    return [dev for dev in store if dev.tenant_id == normalized_tenant]


def register_tenant_device(
    store: list[TelemetryDevice],
    claims: dict[str, Any],
    device_id: str,
    hostname: str,
    cpu_load_pct: Decimal,
) -> tuple[TelemetryDevice, dict[str, Any]]:
    """Registra un dispositivo aplicando RBAC en capa servicio y auditoría legible."""
    role = str(claims.get("role", ""))
    if role not in ALLOWED_MUTATION_ROLES:
        raise PermissionError("Insufficient role for device mutation")

    tenant_id = unicodedata.normalize("NFKC", str(claims["tenant_id"])).strip()
    clean_host = unicodedata.normalize("NFKC", hostname).strip()
    actor_name = unicodedata.normalize("NFKC", str(claims["username"])).strip()

    created = TelemetryDevice(
        id=device_id,
        tenant_id=tenant_id,
        hostname=clean_host,
        cpu_load_pct=cpu_load_pct,
    )
    store.append(created)
    audit_entry = {
        "actor_username": actor_name,
        "resource_display_name": clean_host,
        "after_state": {"hostname": clean_host, "cpu_load_pct": str(cpu_load_pct)},
    }
    return created, audit_entry
