# SPDX-License-Identifier: MIT
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
import json
import unittest

from models.device import TelemetryDevice
from services.device_service import (
    evaluate_maintenance_phase,
    list_tenant_devices,
    register_tenant_device,
)


class TestTelemetryDevicesUnit(unittest.TestCase):
    def test_trimodal_and_anti_silo_propagation(self) -> None:
        store: list[TelemetryDevice] = []
        # 1. Fixture Virgen: estado vacío sin falsos positivos
        self.assertEqual(list_tenant_devices(store, "tenant-a"), [])

        # 2. Fixture Nominal + propagación inmediata de lectura y auditoría JSONB estricta
        claims = {"tenant_id": "tenant-a", "role": "operator", "username": "ana.sre"}
        created, audit = register_tenant_device(
            store,
            claims=claims,
            device_id="dev-01",
            hostname="edge-router-01",
            cpu_load_pct=Decimal("42.50"),
        )
        serialized = json.dumps(audit)
        self.assertIn("ana.sre", serialized)
        self.assertEqual(created.hostname, "edge-router-01")
        self.assertEqual(len(list_tenant_devices(store, "tenant-a")), 1)
        self.assertEqual(list_tenant_devices(store, "tenant-b"), [])

        # 3. Fixture Degradado / Rol sin privilegios (RBAC en capa servicio)
        with self.assertRaises(PermissionError):
            register_tenant_device(
                store,
                claims={"tenant_id": "tenant-a", "role": "viewer", "username": "guest"},
                device_id="dev-02",
                hostname="unauthorized-node",
                cpu_load_pct=Decimal("10.00"),
            )

    def test_three_phase_temporal_maintenance_lifecycle(self) -> None:
        t0 = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)
        dev = TelemetryDevice(
            id="dev-maint",
            tenant_id="tenant-a",
            hostname="core-sw-01",
            cpu_load_pct=Decimal("15.00"),
            maintenance_starts_at=t0 + timedelta(minutes=10),
            maintenance_ends_at=t0 + timedelta(minutes=40),
        )
        self.assertEqual(evaluate_maintenance_phase(dev, t0), "Programada")
        self.assertEqual(evaluate_maintenance_phase(dev, t0 + timedelta(minutes=20)), "En Curso")
        self.assertEqual(evaluate_maintenance_phase(dev, t0 + timedelta(minutes=50)), "Expirada")


if __name__ == "__main__":
    unittest.main()
