# SPDX-License-Identifier: MIT
from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import types
import unittest
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from models.device import TelemetryDevice
from services.device_service import (
    RegisterDeviceInput,
    evaluate_maintenance_phase,
    list_tenant_devices,
    register_tenant_device,
)


class _StubHttpExc(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _StubReqResp:
    status_code: int = 200
    headers: dict[str, str] = field(default_factory=dict)
    _data: Any = None

    def json(self) -> Any:
        return self._data


class _StubRouter:
    def __init__(self, prefix: str = "", tags: Any = None) -> None:
        self.prefix = prefix
        self.tags = tags
        self.routes: dict[tuple[str, str], tuple[Any, int]] = {}

    def get(self, sub: str, status_code: int = 200) -> Any:
        return self._register("GET", sub, status_code)

    def post(self, sub: str, status_code: int = 201) -> Any:
        return self._register("POST", sub, status_code)

    def _register(self, method: str, sub: str, status_code: int) -> Any:
        def _dec(fn: Any) -> Any:
            self.routes[(method, f"{self.prefix}{sub}")] = (fn, status_code)
            return fn

        return _dec


class _StubApp(_StubRouter):
    def __init__(self, **_kwargs: Any) -> None:
        super().__init__()
        self.middlewares: list[Any] = []

    def include_router(self, router: _StubRouter) -> None:
        self.routes.update(router.routes)

    def middleware(self, _kind: str) -> Any:
        def _dec(fn: Any) -> Any:
            self.middlewares.append(fn)
            return fn

        return _dec


def _stub_header(default: Any = ..., **_kwargs: Any) -> Any:
    return "" if default is ... else default


def _stub_depends(fn: Any) -> Any:
    return fn


def _wrap_middleware(mw: Any, nxt: Any) -> Any:
    async def _wrapped(req: Any) -> _StubReqResp:
        return await mw(req, nxt)  # type: ignore[no-any-return]

    return _wrapped


class _StubClient:
    def __init__(self, app: _StubApp) -> None:
        self._app = app

    def get(self, path: str, headers: dict[str, str] | None = None) -> _StubReqResp:
        return self._call("GET", path, None, headers or {})

    def post(
        self, path: str, json: Any = None, headers: dict[str, str] | None = None
    ) -> _StubReqResp:
        return self._call("POST", path, json, headers or {})

    async def _invoke(
        self, method: str, path: str, body: Any, headers: dict[str, str]
    ) -> _StubReqResp:
        fn, status = self._app.routes[(method, path)]
        lower = {k.lower(): v for k, v in headers.items()}
        try:
            res_coro = self._dispatch_fn(fn, lower, body)
            data = await res_coro
            return _StubReqResp(status_code=status, _data=data)
        except _StubHttpExc as exc:
            return _StubReqResp(
                status_code=exc.status_code,
                _data={"detail": exc.detail},
            )
        except Exception as exc:
            return _StubReqResp(status_code=422, _data={"detail": str(exc)})

    def _dispatch_fn(
        self,
        fn: Any,
        lower: dict[str, str],
        body: Any,
    ) -> Any:
        if fn.__name__ == "health_probe":
            return fn()
        api_devices = sys.modules["api.devices"]
        claims = api_devices.resolve_verified_claims(
            x_tenant_id=lower.get("x-tenant-id", "tenant-demo"),
            x_actor_role=lower.get("x-actor-role", "operator"),
            x_actor_username=lower.get("x-actor-username", "operador.noc"),
            x_auth_tenant=lower.get("x-auth-tenant"),
        )
        if fn.__name__ == "get_devices_endpoint":
            return fn(claims=claims)
        idem = lower.get("idempotency-key", "")
        if len(idem) < 8:
            raise _StubHttpExc(422, "Invalid Idempotency-Key")
        parsed = api_devices.CreateDevicePayload.model_validate(body)
        return fn(payload=parsed, claims=claims, idempotency_key=idem)

    def _call(
        self, method: str, path: str, body: Any, headers: dict[str, str]
    ) -> _StubReqResp:
        async def _next(_req: Any) -> _StubReqResp:
            return await self._invoke(method, path, body, headers)

        handler = _next
        for mw in reversed(self._app.middlewares):
            handler = _wrap_middleware(mw, handler)
        return asyncio.run(handler(object()))


def _install_offline_fastapi_stub() -> Any:
    """Registra adaptador mínimo en memoria cuando FastAPI no está en el contenedor."""
    mod = types.ModuleType("fastapi")
    mod.APIRouter = _StubRouter  # type: ignore[attr-defined]
    mod.Depends = _stub_depends  # type: ignore[attr-defined]
    mod.FastAPI = _StubApp  # type: ignore[attr-defined]
    mod.Header = _stub_header  # type: ignore[attr-defined]
    mod.HTTPException = _StubHttpExc  # type: ignore[attr-defined]
    mod.Request = object  # type: ignore[attr-defined]
    mod.Response = _StubReqResp  # type: ignore[attr-defined]
    sys.modules["fastapi"] = mod
    return _StubClient


_TEST_CLIENT_CLS: Any
try:
    from fastapi.testclient import TestClient

    from api.devices import _IDEMPOTENCY_CACHE, _MEMORY_STORE
    from main import app as _fastapi_app

    _TEST_CLIENT_CLS = TestClient
except ImportError:  # pragma: no cover
    if importlib.util.find_spec("pydantic") is not None:
        _TEST_CLIENT_CLS = _install_offline_fastapi_stub()
        from api.devices import _IDEMPOTENCY_CACHE, _MEMORY_STORE
        from main import app as _fastapi_app
    else:  # pragma: no cover - entorno sin pydantic (shim Node)
        _TEST_CLIENT_CLS = None
        _IDEMPOTENCY_CACHE = {}
        _MEMORY_STORE = []
        _fastapi_app = None


class TestTelemetryDevicesUnit(unittest.TestCase):
    def test_trimodal_and_anti_silo_propagation(self) -> None:
        store: list[TelemetryDevice] = []
        # 1. Fixture Virgen: estado vacío sin falsos positivos
        self.assertEqual(list_tenant_devices(store, "tenant-a"), [])

        # 2. Fixture Nominal + propagación de lectura y auditoría JSONB
        claims = {"tenant_id": "tenant-a", "role": "operator", "username": "ana.sre"}
        created, audit = register_tenant_device(
            store,
            claims=claims,
            device_input=RegisterDeviceInput(
                device_id="dev-01",
                hostname="edge-router-01",
                cpu_load_pct=Decimal("42.50"),
            ),
        )
        serialized = json.dumps(audit)
        self.assertIn("ana.sre", serialized)
        self.assertEqual(created.hostname, "edge-router-01")
        self.assertEqual(len(list_tenant_devices(store, "tenant-a")), 1)
        self.assertEqual(list_tenant_devices(store, "tenant-b"), [])

        # Duplicado en el mismo tenant rechaza conflicto
        with self.assertRaises(ValueError):
            register_tenant_device(
                store,
                claims=claims,
                device_input=RegisterDeviceInput(
                    device_id="dev-01",
                    hostname="dup-node",
                    cpu_load_pct=Decimal("12.00"),
                ),
            )

        # 3. Fixture Degradado / Rol sin privilegios (RBAC en capa servicio)
        with self.assertRaises(PermissionError):
            register_tenant_device(
                store,
                claims={"tenant_id": "tenant-a", "role": "viewer", "username": "guest"},
                device_input=RegisterDeviceInput(
                    device_id="dev-02",
                    hostname="unauthorized-node",
                    cpu_load_pct=Decimal("10.00"),
                ),
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
        plain = TelemetryDevice(
            id="dev-op",
            tenant_id="tenant-a",
            hostname="sw-02",
            cpu_load_pct=Decimal("5.00"),
        )
        self.assertEqual(evaluate_maintenance_phase(plain, t0), "OPERACIONAL")
        self.assertEqual(evaluate_maintenance_phase(dev, t0), "Programada")
        self.assertEqual(
            evaluate_maintenance_phase(dev, t0 + timedelta(minutes=20)), "En Curso"
        )
        self.assertEqual(
            evaluate_maintenance_phase(dev, t0 + timedelta(minutes=50)), "Expirada"
        )


@unittest.skipIf(_TEST_CLIENT_CLS is None, "Pydantic/FastAPI no disponible")
class TestTelemetryApiEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        _MEMORY_STORE.clear()
        _IDEMPOTENCY_CACHE.clear()

    def test_api_health_oshp_rbac_idempotency_conflict_and_tenant_isolation(
        self,
    ) -> None:
        client = _TEST_CLIENT_CLS(_fastapi_app)
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

        listed = client.get("/api/v1/devices", headers={"X-Tenant-Id": "tenant-a"})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)


if __name__ == "__main__":
    unittest.main()
