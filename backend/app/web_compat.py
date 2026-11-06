"""FastAPI / ASGI Runtime & Offline Sandbox Test Adapter.

Uses native FastAPI + Starlette + ORJSONResponse + Uvicorn (uvloop/httptools) in
production on the Raspberry Pi 4, while retaining a lightweight zero-dependency
ASGI/test adapter so the automated test suite and simulator run in offline dev
environments where FastAPI is not installed.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/javascript", ".js")

try:
    import orjson as _orjson  # type: ignore

    HAS_ORJSON = True
except Exception:
    _orjson = None
    HAS_ORJSON = False

try:
    import uvloop as _uvloop  # type: ignore  # noqa: F401

    HAS_UVLOOP = True
except Exception:
    HAS_UVLOOP = False

try:
    import httptools as _httptools  # type: ignore  # noqa: F401

    HAS_HTTPTOOLS = True
except Exception:
    HAS_HTTPTOOLS = False


def json_dumps_bytes(data: Any) -> bytes:
    """Serialize data to UTF-8 JSON bytes using SIMD orjson when available."""
    if HAS_ORJSON and _orjson is not None:
        return _orjson.dumps(data)
    return json.dumps(data).encode("utf-8")


def json_dumps(data: Any) -> str:
    """Serialize data to a JSON string using SIMD orjson when available."""
    if HAS_ORJSON and _orjson is not None:
        return _orjson.dumps(data).decode("utf-8")
    return json.dumps(data)


try:
    from fastapi import (  # type: ignore
        APIRouter,
        Body,
        FastAPI,
        HTTPException,
        Request,
        WebSocket,
        WebSocketDisconnect,
    )
    from fastapi.responses import (  # type: ignore
        FileResponse,
        JSONResponse,
        Response,
        StreamingResponse,
    )
    from fastapi.staticfiles import StaticFiles  # type: ignore

    if HAS_ORJSON:
        try:
            from fastapi.responses import ORJSONResponse as DefaultJSONResponse  # type: ignore
        except Exception:
            DefaultJSONResponse = JSONResponse
    else:
        DefaultJSONResponse = JSONResponse

    HAS_NATIVE_FASTAPI = True
except Exception:
    HAS_NATIVE_FASTAPI = False

    def Body(default: Any = None, **_: Any) -> Any:  # noqa: N802
        return default

    class HTTPException(Exception):
        def __init__(self, status_code: int = 400, detail: str = "Error") -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class WebSocketDisconnect(Exception):
        pass

    class Response:
        def __init__(
            self,
            content: bytes | str = b"",
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
            media_type: str = "application/octet-stream",
        ) -> None:
            self._content: Optional[bytes] = (
                content.encode("utf-8") if isinstance(content, str) else content
            )
            self.status_code = status_code
            self.headers = dict(headers or {})
            self.media_type = media_type

        @property
        def content(self) -> bytes:
            return self._content or b""

    class JSONResponse(Response):
        def __init__(
            self,
            content: Any,
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
        ) -> None:
            super().__init__(
                content=json_dumps_bytes(content),
                status_code=status_code,
                headers=headers,
                media_type="application/json",
            )

    DefaultJSONResponse = JSONResponse

    class FileResponse(Response):
        """Chunk-streamable file response that avoids eager RAM reads until needed."""

        CHUNK_SIZE = 65536

        def __init__(
            self,
            path: str | Path,
            media_type: Optional[str] = None,
            filename: Optional[str] = None,
            headers: Optional[Dict[str, str]] = None,
        ) -> None:
            p = Path(path)
            if not p.is_file():
                raise HTTPException(status_code=404, detail=f"File not found: {p.name}")
            self.file_path = p
            mtype = media_type or mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            hdrs = dict(headers or {})
            if filename:
                hdrs["Content-Disposition"] = f'attachment; filename="{filename}"'
            hdrs.setdefault("Content-Length", str(p.stat().st_size))
            super().__init__(
                content=b"",
                status_code=200,
                headers=hdrs,
                media_type=mtype,
            )
            self._content = None

        @property
        def content(self) -> bytes:
            if self._content is None:
                self._content = self.file_path.read_bytes()
            return self._content

        def iter_chunks(self) -> Iterator[bytes]:
            with self.file_path.open("rb") as fh:
                while True:
                    chunk = fh.read(self.CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk

    class StreamingResponse:
        def __init__(
            self,
            content: Any,
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
            media_type: str = "application/octet-stream",
        ) -> None:
            self.body_iterator = content
            self.status_code = status_code
            self.headers = dict(headers or {})
            self.media_type = media_type

    class StaticFiles:
        def __init__(self, directory: str | Path, html: bool = True) -> None:
            self.directory = Path(directory)
            self.html = html

    class Request:
        def __init__(
            self,
            method: str,
            path: str,
            query_params: Dict[str, str],
            body_bytes: bytes = b"",
            headers: Optional[Dict[str, str]] = None,
        ) -> None:
            self.method = method
            self.path = path
            self.query_params = query_params
            self._body = body_bytes
            self.headers = headers or {}

        async def json(self) -> Any:
            if not self._body:
                return {}
            return json.loads(self._body.decode("utf-8"))

        async def body(self) -> bytes:
            return self._body

    class WebSocket:
        def __init__(self, send_cb: Callable[[str], Any], recv_cb: Callable[[], Any]) -> None:
            self._send_cb = send_cb
            self._recv_cb = recv_cb

        async def accept(self) -> None:
            return None

        async def send_text(self, data: str) -> None:
            res = self._send_cb(data)
            if asyncio.iscoroutine(res):
                await res

        async def send_json(self, data: Any) -> None:
            await self.send_text(json_dumps(data))

        async def receive_text(self) -> str:
            res = self._recv_cb()
            if asyncio.iscoroutine(res):
                return await res
            return str(res)

    class APIRouter:
        def __init__(self, prefix: str = "", tags: Optional[List[str]] = None) -> None:
            self.prefix = prefix.rstrip("/")
            self.tags = tags or []
            self.routes: List[Tuple[str, str, Callable[..., Any]]] = []

        def _add(self, method: str, path: str, func: Callable[..., Any]) -> Callable[..., Any]:
            clean = path.strip("/")
            full_path = f"{self.prefix}/{clean}" if clean else (self.prefix or "/")
            if not full_path.startswith("/"):
                full_path = "/" + full_path
            self.routes.append((method.upper(), full_path, func))
            return func

        def get(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return lambda fn: self._add("GET", path, fn)

        def post(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return lambda fn: self._add("POST", path, fn)

        def put(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return lambda fn: self._add("PUT", path, fn)

        def delete(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return lambda fn: self._add("DELETE", path, fn)

    class FastAPI(APIRouter):
        def __init__(
            self,
            title: str = "AstroPi",
            version: str = "1.0.0",
            lifespan: Optional[Callable[[Any], Any]] = None,
            **_: Any,
        ) -> None:
            super().__init__(prefix="")
            self.title = title
            self.version = version
            self.lifespan = lifespan
            self.ws_routes: Dict[str, Callable[..., Any]] = {}
            self.startup_handlers: List[Callable[[], Any]] = []
            self.shutdown_handlers: List[Callable[[], Any]] = []
            self.static_mounts: List[Tuple[str, StaticFiles]] = []

        def include_router(self, router: APIRouter, prefix: str = "", **_: Any) -> None:
            pfx = prefix.rstrip("/")
            for method, rpath, fn in router.routes:
                combined = f"{pfx}{rpath}" if pfx else rpath
                self.routes.append((method, combined, fn))

        def websocket(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            def _wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
                self.ws_routes[path] = fn
                return fn

            return _wrap

        def on_event(self, event_type: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            def _wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
                if event_type == "startup":
                    self.startup_handlers.append(fn)
                elif event_type == "shutdown":
                    self.shutdown_handlers.append(fn)
                return fn

            return _wrap

        def mount(self, path: str, app: StaticFiles, name: Optional[str] = None) -> None:
            self.static_mounts.append((path.rstrip("/") or "/", app))


def _compile_route_pattern(route_path: str) -> Tuple[re.Pattern[str], List[str]]:
    param_names: List[str] = []

    def _repl(match: re.Match[str]) -> str:
        pname = match.group(1)
        param_names.append(pname)
        return r"([^/]+)"

    regex_str = "^" + re.sub(r"\{([a-zA-Z0-9_]+)\}", _repl, route_path) + "$"
    return re.compile(regex_str), param_names


async def dispatch_http_request(
    app: Any,
    method: str,
    url: str,
    body_bytes: bytes = b"",
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Dict[str, str], Any]:
    """Dispatch an HTTP request against the fallback router and return (status, headers, body_or_file)."""
    parsed = urlparse(url)
    path = parsed.path or "/"
    raw_qs = parse_qs(parsed.query, keep_blank_values=True)
    query_params = {k: v[-1] for k, v in raw_qs.items()}

    for r_method, r_path, handler in getattr(app, "routes", []):
        if r_method != method.upper():
            continue
        pattern, pnames = _compile_route_pattern(r_path)
        m = pattern.match(path)
        if not m:
            continue

        path_params = {name: val for name, val in zip(pnames, m.groups())}
        req_obj = Request(
            method=method.upper(),
            path=path,
            query_params=query_params,
            body_bytes=body_bytes,
            headers=headers,
        )
        json_body: Any = None
        if body_bytes:
            try:
                json_body = json.loads(body_bytes.decode("utf-8"))
            except Exception as exc:
                err_bytes = json_dumps_bytes({"detail": f"Invalid JSON body: {exc}"})
                return 422, {"Content-Type": "application/json"}, err_bytes

        sig = inspect.signature(handler)
        kwargs: Dict[str, Any] = {}
        for pname, param in sig.parameters.items():
            if pname in path_params:
                val: Any = path_params[pname]
                if param.annotation in (int, "int"):
                    val = int(val)
                elif param.annotation in (float, "float"):
                    val = float(val)
                kwargs[pname] = val
            elif pname in ("request", "req") or param.annotation in (Request, "Request"):
                kwargs[pname] = req_obj
            elif pname in ("payload", "body", "data"):
                if json_body is None:
                    kwargs[pname] = None if param.default is None else param.default
                elif isinstance(json_body, dict):
                    kwargs[pname] = json_body
                else:
                    err_bytes = json_dumps_bytes({"detail": "Payload must be a JSON object"})
                    return 422, {"Content-Type": "application/json"}, err_bytes
            elif pname in query_params:
                qval: Any = query_params[pname]
                ann = str(param.annotation)
                if "bool" in ann:
                    qval = qval.lower() in ("1", "true", "yes")
                elif "int" in ann:
                    qval = int(qval)
                elif "float" in ann:
                    qval = float(qval)
                kwargs[pname] = qval
            elif isinstance(json_body, dict) and pname in json_body:
                kwargs[pname] = json_body[pname]

        try:
            res = handler(**kwargs)
            if inspect.iscoroutine(res):
                res = await res
        except HTTPException as hexc:
            err_bytes = json_dumps_bytes({"detail": hexc.detail})
            return hexc.status_code, {"Content-Type": "application/json"}, err_bytes
        except Exception as exc:
            err_bytes = json_dumps_bytes({"detail": str(exc)})
            return 500, {"Content-Type": "application/json"}, err_bytes

        if isinstance(res, StreamingResponse):
            chunks: List[bytes] = []
            iterator = res.body_iterator
            if hasattr(iterator, "__aiter__"):
                async for ch in iterator:
                    chunks.append(ch.encode("utf-8") if isinstance(ch, str) else bytes(ch))
            else:
                for ch in iterator:
                    chunks.append(ch.encode("utf-8") if isinstance(ch, str) else bytes(ch))
            hdrs = {"Content-Type": res.media_type, **res.headers}
            return res.status_code, hdrs, b"".join(chunks)

        if not HAS_NATIVE_FASTAPI and isinstance(res, FileResponse):
            hdrs = {"Content-Type": res.media_type, **res.headers}
            return res.status_code, hdrs, res

        if isinstance(res, Response):
            hdrs = {"Content-Type": res.media_type, **res.headers}
            return res.status_code, hdrs, res.content

        out_bytes = json_dumps_bytes(res)
        return 200, {"Content-Type": "application/json"}, out_bytes

    # Static file mounts
    for mount_prefix, static_app in getattr(app, "static_mounts", []):
        if path.startswith(mount_prefix):
            rel = path[len(mount_prefix) :].lstrip("/") or "index.html"
            candidate = (static_app.directory / rel).resolve()
            if not str(candidate).startswith(str(static_app.directory.resolve())):
                break
            if candidate.is_dir() and static_app.html:
                candidate = candidate / "index.html"
            if candidate.is_file():
                mtype = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
                if candidate.suffix in (".mjs", ".js"):
                    mtype = "application/javascript; charset=utf-8"
                hdrs = {"Content-Type": mtype}
                if "/vendor/" in path:
                    hdrs["Cache-Control"] = "public, max-age=31536000, immutable"
                return 200, hdrs, FileResponse(candidate, media_type=mtype, headers=hdrs)

    return 404, {"Content-Type": "application/json"}, json_dumps_bytes({"detail": "Not Found"})


class SimpleTestResponse:
    def __init__(self, status_code: int, headers: Dict[str, str], content: bytes) -> None:
        self.status_code = status_code
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.raw_headers = headers
        self.content = content

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def json(self) -> Any:
        return json.loads(self.content.decode("utf-8"))


class UniversalTestClient:
    """Synchronous test client exercising native Starlette/FastAPI TestClient on Pi or async router offline."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self._native_client: Any = None
        self._lifespan_cm: Any = None
        if HAS_NATIVE_FASTAPI:
            try:
                from fastapi.testclient import TestClient  # type: ignore

                self._native_client = TestClient(app)
                self._native_client.__enter__()
                return
            except Exception:
                self._native_client = None

        self._loop = asyncio.new_event_loop()
        lifespan_fn = getattr(self.app, "lifespan", None)
        if callable(lifespan_fn):
            self._lifespan_cm = lifespan_fn(self.app)
            self._loop.run_until_complete(self._lifespan_cm.__aenter__())
        for fn in getattr(self.app, "startup_handlers", []):
            res = fn()
            if inspect.iscoroutine(res):
                self._loop.run_until_complete(res)

    def request(
        self,
        method: str,
        url: str,
        json_body: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> SimpleTestResponse:
        if self._native_client is not None:
            resp = self._native_client.request(method, url, json=json_body, headers=headers)
            return SimpleTestResponse(resp.status_code, dict(resp.headers), resp.content)

        body_bytes = json_dumps_bytes(json_body) if json_body is not None else b""
        status, hdrs, payload = self._loop.run_until_complete(
            dispatch_http_request(self.app, method, url, body_bytes=body_bytes, headers=headers)
        )
        raw_bytes = payload.content if hasattr(payload, "content") else bytes(payload)
        return SimpleTestResponse(status, hdrs, raw_bytes)

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("GET", url, headers=headers)

    def post(self, url: str, json: Any = None, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("POST", url, json_body=json, headers=headers)

    def put(self, url: str, json: Any = None, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("PUT", url, json_body=json, headers=headers)

    def delete(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("DELETE", url, headers=headers)

    def close(self) -> None:
        if self._native_client is not None:
            self._native_client.__exit__(None, None, None)
            self._native_client = None
            return
        if self._lifespan_cm is not None:
            self._loop.run_until_complete(self._lifespan_cm.__aexit__(None, None, None))
            self._lifespan_cm = None
        for fn in getattr(self.app, "shutdown_handlers", []):
            res = fn()
            if inspect.iscoroutine(res):
                self._loop.run_until_complete(res)
        self._loop.close()
