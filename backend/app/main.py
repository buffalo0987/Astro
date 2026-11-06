"""AstroPi Single-Daemon Headless Backend Entrypoint (FastAPI Lifespan + Uvicorn uvloop)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
from typing import Any, AsyncIterator

from .api import (
    routes_camera,
    routes_framing,
    routes_pa,
    routes_sequence,
    routes_sessions,
    routes_system,
)
from .catalog.seed_catalog import ensure_catalog_seeded
from .config import CONFIG
from .hardware.camera_actor import CAMERA
from .state import STATE
from .web_compat import (
    DefaultJSONResponse,
    FastAPI,
    FileResponse,
    HAS_NATIVE_FASTAPI,
    StaticFiles,
    WebSocket,
    WebSocketDisconnect,
    dispatch_http_request,
    json_dumps,
)


async def startup_daemon() -> None:
    """Initialize directories, seed offline DSO catalog, ensure Root CA, and start CameraActor."""
    CONFIG.ensure_directories()
    ensure_catalog_seeded()
    routes_system.ensure_local_root_ca()
    await CAMERA.initialize()


def shutdown_daemon() -> None:
    """Guaranteed state-machine guard: always restore physical camera to RAW (.CR3) on exit."""
    CAMERA.ensure_raw_format_sync()


@asynccontextmanager
async def lifespan(_app: Any) -> AsyncIterator[None]:
    await startup_daemon()
    try:
        yield
    finally:
        shutdown_daemon()


app = FastAPI(
    title="AstroPi Headless Astrophotography Daemon",
    version="2.0.0",
    lifespan=lifespan,
    default_response_class=DefaultJSONResponse,
)

app.include_router(routes_camera.router)
app.include_router(routes_pa.router)
app.include_router(routes_framing.router)
app.include_router(routes_sequence.router)
app.include_router(routes_sessions.router)
app.include_router(routes_system.router)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()

    async def _sender(msg_text: str) -> None:
        await ws.send_text(msg_text)

    STATE.register_ws_sender(_sender)
    try:
        await ws.send_text(
            json_dumps(
                {
                    "type": "STATE_SNAPSHOT",
                    "timestamp": STATE.observer.current_utc_timestamp(),
                    "payload": STATE.snapshot(),
                }
            )
        )
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                if data.get("type") == "PING":
                    await ws.send_text(json_dumps({"type": "PONG"}))
            except Exception:
                pass
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        STATE.unregister_ws_sender(_sender)


if CONFIG.frontend_dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(CONFIG.frontend_dist_dir), html=True), name="frontend")


def run_server(host: str = "0.0.0.0", port: int = 8000, ssl_port: int = 8443) -> None:
    """Start the single-worker headless server with dual HTTP (8000) and HTTPS Secure Context (8443)."""
    if HAS_NATIVE_FASTAPI:
        import uvicorn  # type: ignore

        _, srv_cert, srv_key = routes_system.ensure_local_root_ca()

        async def _run_dual() -> None:
            common_kwargs = {
                "host": host,
                "log_level": "info",
                "loop": "auto",
                "http": "auto",
                "ws_ping_interval": 20.0,
                "ws_ping_timeout": 20.0,
            }
            c_http = uvicorn.Config(app, port=port, **common_kwargs)
            s_http = uvicorn.Server(c_http)
            if srv_cert.is_file() and srv_key.is_file():
                c_https = uvicorn.Config(
                    app,
                    port=ssl_port,
                    ssl_certfile=str(srv_cert),
                    ssl_keyfile=str(srv_key),
                    **common_kwargs,
                )
                s_https = uvicorn.Server(c_https)
                print(f"AstroPi HTTP Server listening on http://{host}:{port}")
                print(f"AstroPi HTTPS (Secure Context / PWA) listening on https://{host}:{ssl_port}")
                await asyncio.gather(s_http.serve(), s_https.serve())
            else:
                await s_http.serve()

        try:
            asyncio.run(_run_dual())
        except (KeyboardInterrupt, SystemExit):
            pass
        return

    # Local offline development fallback when FastAPI/Uvicorn are not installed
    import ssl
    import tornado.web
    import tornado.websocket

    class LocalDevWSHandler(tornado.websocket.WebSocketHandler):
        def check_origin(self, origin: str) -> bool:
            return True

        def open(self) -> None:
            self._sender = lambda msg: self.write_message(msg)
            STATE.register_ws_sender(self._sender)
            self.write_message(
                json_dumps(
                    {
                        "type": "STATE_SNAPSHOT",
                        "timestamp": STATE.observer.current_utc_timestamp(),
                        "payload": STATE.snapshot(),
                    }
                )
            )

        def on_message(self, message: str | bytes) -> None:
            try:
                data = json.loads(message)
                if data.get("type") == "PING":
                    self.write_message(json_dumps({"type": "PONG"}))
            except Exception:
                pass

        def on_close(self) -> None:
            if hasattr(self, "_sender"):
                STATE.unregister_ws_sender(self._sender)

    class LocalDevHTTPHandler(tornado.web.RequestHandler):
        async def _handle_all(self) -> None:
            status, hdrs, body = await dispatch_http_request(
                app,
                self.request.method or "GET",
                self.request.uri or "/",
                body_bytes=self.request.body or b"",
                headers=dict(self.request.headers),
            )
            self.set_status(status)
            for k, v in hdrs.items():
                self.set_header(k, v)
            if isinstance(body, FileResponse) and hasattr(body, "iter_chunks"):
                for chunk in body.iter_chunks():
                    self.write(chunk)
                    await self.flush()
            else:
                self.write(body)
            await self.finish()

        async def get(self, *_: Any) -> None:
            await self._handle_all()

        async def post(self, *_: Any) -> None:
            await self._handle_all()

        async def put(self, *_: Any) -> None:
            await self._handle_all()

        async def delete(self, *_: Any) -> None:
            await self._handle_all()

    async def _main() -> None:
        await startup_daemon()
        t_app = tornado.web.Application(
            [
                (r"/ws", LocalDevWSHandler),
                (r"/.*", LocalDevHTTPHandler),
            ]
        )
        t_app.listen(port, address=host)
        print(f"AstroPi Local Dev HTTP Server listening on http://{host}:{port}")

        _, srv_cert, srv_key = routes_system.ensure_local_root_ca()
        if srv_cert.is_file() and srv_key.is_file():
            try:
                ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
                ssl_ctx.load_cert_chain(certfile=str(srv_cert), keyfile=str(srv_key))
                t_app.listen(ssl_port, address=host, ssl_options=ssl_ctx)
                print(f"AstroPi Local Dev HTTPS listening on https://{host}:{ssl_port}")
            except Exception as exc:
                print(f"HTTPS listener setup warning: {exc}")

        await asyncio.Event().wait()

    try:
        asyncio.run(_main())
    finally:
        shutdown_daemon()


if __name__ == "__main__":
    run_server()
