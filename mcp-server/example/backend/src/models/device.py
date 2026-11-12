# SPDX-License-Identifier: MIT
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(slots=True)
class TelemetryDevice:
    """Entidad de dominio multi-tenant protegida por PostgreSQL FORCE RLS."""

    __tablename__ = "telemetry_devices"

    id: str
    tenant_id: str
    hostname: str
    cpu_load_pct: Decimal
    maintenance_starts_at: datetime | None = None
    maintenance_ends_at: datetime | None = None
