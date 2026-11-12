# SPDX-License-Identifier: MIT
from __future__ import annotations

from fastapi import FastAPI, Request, Response

from api.devices import router as devices_router

app = FastAPI(
    title="Example Telemetry 11X API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.include_router(devices_router)


@app.middleware("http")
async def inject_oshp_security_headers(request: Request, call_next: object) -> Response:
    response: Response = await call_next(request)  # type: ignore[operator]
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
async def health_probe() -> dict[str, str]:
    return {"status": "ok"}
