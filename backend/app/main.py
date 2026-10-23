"""AstroPi Single-Daemon Headless Backend Entrypoint (FastAPI / Uvicorn + Tornado Fallback)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

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
    HAS_NATIVE_FASTAPI,
    FastAPI,
    StaticFiles,
    WebSocket,
    WebSocketDisconnect,
    dispatch_http_request,
)

app = FastAPI(
    title="AstroPi Headless Astrophotography Daemon",
    version="1.0.0",
)

app.include_router(routes_camera.router)
app.include_router(routes_pa.router)
app.include_router(routes_framing.router)
app.include_router(routes_sequence.router)
app.include_router(routes_sessions.router)
app.include_router(routes_system.router)


@app.on_event("startup")
async def on_startup() -> None:
    CONFIG.ensure_directories()
    ensure_catalog_seeded()
    routes_system.ensure_local_root_ca()
    await CAMERA.initialize()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    # Guaranteed state-machine guard: always restore camera to RAW (.CR3) on exit
    CAMERA.ensure_raw_format_sync()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()

    async def _sender(msg_text: str) -> None:
        await ws.send_text(msg_text)

    STATE.register_ws_sender(_sender)
    try:
        await ws.send_text(
            json.dumps(
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
                    await ws.send_text(json.dumps({"type": "PONG"}))
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
            c_http = uvicorn.Config(app, host=host, port=port, log_level="info")
            s_http = uvicorn.Server(c_http)
            if srv_cert.is_file() and srv_key.is_file():
                c_https = uvicorn.Config(
                    app,
                    host=host,
                    port=ssl_port,
                    ssl_certfile=str(srv_cert),
                    ssl_keyfile=str(srv_key),
                    log_level="info",
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

    import ssl
    import tornado.ioloop
    import tornado.web
    import tornado.websocket

    class TornadoWSHandler(tornado.websocket.WebSocketHandler):
        def check_origin(self, origin: str) -> bool:
            return True

        def open(self) -> None:
            self._sender = lambda msg: self.write_message(msg)
            STATE.register_ws_sender(self._sender)
            self.write_message(
                json.dumps(
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
                    self.write_message(json.dumps({"type": "PONG"}))
            except Exception:
                pass

        def on_close(self) -> None:
            if hasattr(self, "_sender"):
                STATE.unregister_ws_sender(self._sender)

    class TornadoHTTPHandler(tornado.web.RequestHandler):
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
        await on_startup()
        t_app = tornado.web.Application(
            [
                (r"/ws", TornadoWSHandler),
                (r"/.*", TornadoHTTPHandler),
            ]
        )
        t_app.listen(port, address=host)
        print(f"AstroPi HTTP Server listening on http://{host}:{port}")

        _, srv_cert, srv_key = routes_system.ensure_local_root_ca()
        if srv_cert.is_file() and srv_key.is_file():
            try:
                ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
                ssl_ctx.load_cert_chain(certfile=str(srv_cert), keyfile=str(srv_key))
                t_app.listen(ssl_port, address=host, ssl_options=ssl_ctx)
                print(f"AstroPi HTTPS (Secure Context / PWA) listening on https://{host}:{ssl_port}")
            except Exception as exc:
                print(f"HTTPS listener setup warning: {exc}")

        await asyncio.Event().wait()

    try:
        asyncio.run(_main())
    finally:
        CAMERA.ensure_raw_format_sync()


if __name__ == "__main__":
    run_server()
