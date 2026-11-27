# SPDX-License-Identifier: MIT
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from api.devices import _IDEMPOTENCY_CACHE, _MEMORY_STORE
from main import app


class TestTelemetryApiEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        _MEMORY_STORE.clear()
        _IDEMPOTENCY_CACHE.clear()

    def test_api_health_oshp_rbac_idempotency_conflict_and_tenant_isolation(
        self,
    ) -> None:
        client = TestClient(app)
        health = client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json(), {"status": "ok"})
        for header_name in (
            "Strict-Transport-Security",
            "Content-Security-Policy",
            "X-Content-Type-Options",
            "X-Frame-Options",
            "Referrer-Policy",
            "Permissions-Policy",
            "Cross-Origin-Resource-Policy",
        ):
            self.assertIn(header_name, health.headers)

        spoof = client.get(
            "/api/v1/devices",
            headers={"X-Tenant-Id": "tenant-b", "X-Auth-Tenant": "tenant-a"},
        )
        self.assertEqual(spoof.status_code, 403)

        missing_auth = client.get(
            "/api/v1/devices",
            headers={"X-Tenant-Id": "tenant-a"},
        )
        self.assertEqual(missing_auth.status_code, 403)

        body = {"id": "dev-api-01", "hostname": "gw-01", "cpu_load_pct": 21.4}
        headers = {
            "X-Tenant-Id": "tenant-a",
            "X-Auth-Tenant": "tenant-a",
            "Idempotency-Key": "idem-api-0001",
        }
        created = client.post("/api/v1/devices", json=body, headers=headers)
        self.assertEqual(created.status_code, 201)
        payload = created.json()
        self.assertEqual(payload["cpu_load_pct"], "21.4")
        self.assertEqual(payload["audit_actor"], "operador.noc")

        # Idempotency-Key replay retorna el DTO cacheado
        replay = client.post("/api/v1/devices", json=body, headers=headers)
        self.assertEqual(replay.status_code, 201)
        self.assertEqual(replay.json(), payload)

        # Viewer NO puede evadir RBAC reutilizando una Idempotency-Key cacheada
        viewer_replay = client.post(
            "/api/v1/devices",
            json=body,
            headers={**headers, "X-Actor-Role": "viewer"},
        )
        self.assertEqual(viewer_replay.status_code, 403)

        # Reuso de Idempotency-Key con payload divergente -> 409 Conflict
        divergent = client.post(
            "/api/v1/devices",
            json={"id": "dev-api-01", "hostname": "gw-mutated", "cpu_load_pct": 99.0},
            headers=headers,
        )
        self.assertEqual(divergent.status_code, 409)

        # Idempotency-Key con solo espacios -> 422 tras strip()
        blank_key = client.post(
            "/api/v1/devices",
            json={"id": "dev-api-09", "hostname": "gw-09", "cpu_load_pct": 12.0},
            headers={**headers, "Idempotency-Key": "        "},
        )
        self.assertEqual(blank_key.status_code, 422)

        # Duplicate ID con otra Idempotency-Key -> 409 Conflict
        dup = client.post(
            "/api/v1/devices",
            json=body,
            headers={**headers, "Idempotency-Key": "idem-api-0002"},
        )
        self.assertEqual(dup.status_code, 409)

        # RBAC viewer -> 403 Forbidden
        forbidden = client.post(
            "/api/v1/devices",
            json={"id": "dev-api-02", "hostname": "gw-02", "cpu_load_pct": 10},
            headers={
                "X-Tenant-Id": "tenant-a",
                "X-Auth-Tenant": "tenant-a",
                "X-Actor-Role": "viewer",
                "Idempotency-Key": "idem-api-0003",
            },
        )
        self.assertEqual(forbidden.status_code, 403)

        # Validation error 422
        invalid = client.post(
            "/api/v1/devices",
            json={"id": "x", "hostname": "gw-02", "cpu_load_pct": 10},
            headers=headers,
        )
        self.assertEqual(invalid.status_code, 422)

        listed = client.get(
            "/api/v1/devices",
            headers={"X-Tenant-Id": "tenant-a", "X-Auth-Tenant": "tenant-a"},
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)


if __name__ == "__main__":
    unittest.main()
