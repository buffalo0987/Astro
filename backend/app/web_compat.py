"""FastAPI / ASGI Compatibility Layer.

Imports native FastAPI when installed on the Raspberry Pi 4, and falls back to a
lightweight Tornado + asyncio implementation when running in minimal environments
where FastAPI is not installed.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

try:
    from fastapi import APIRouter, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect  # type: ignore
    from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse  # type: ignore
    from fastapi.staticfiles import StaticFiles  # type: ignore
    HAS_NATIVE_FASTAPI = True
except Exception:
    HAS_NATIVE_FASTAPI = False

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
            self.content = content.encode("utf-8") if isinstance(content, str) else content
            self.status_code = status_code
            self.headers = dict(headers or {})
            self.media_type = media_type

    class JSONResponse(Response):
        def __init__(
            self,
            content: Any,
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
        ) -> None:
            super().__init__(
                content=json.dumps(content).encode("utf-8"),
                status_code=status_code,
                headers=headers,
                media_type="application/json",
            )

    class FileResponse(Response):
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
            mtype = media_type or mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            hdrs = dict(headers or {})
            if filename:
                hdrs["Content-Disposition"] = f'attachment; filename="{filename}"'
            super().__init__(
                content=p.read_bytes(),
                status_code=200,
                headers=hdrs,
                media_type=mtype,
            )

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
            await self.send_text(json.dumps(data))

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
        def __init__(self, title: str = "AstroPi", version: str = "1.0.0", **_: Any) -> None:
            super().__init__(prefix="")
            self.title = title
            self.version = version
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
) -> Tuple[int, Dict[str, str], bytes]:
    """Dispatch an HTTP request against our FastAPI or shim app and return (status, headers, body)."""
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
        req_obj = Request(method=method.upper(), path=path, query_params=query_params, body_bytes=body_bytes, headers=headers)
        json_body: Any = None
        if body_bytes:
            try:
                json_body = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                json_body = {}

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
                kwargs[pname] = json_body if isinstance(json_body, dict) else {}
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
            err_bytes = json.dumps({"detail": hexc.detail}).encode("utf-8")
            return hexc.status_code, {"Content-Type": "application/json"}, err_bytes
        except Exception as exc:
            err_bytes = json.dumps({"detail": str(exc)}).encode("utf-8")
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

        if isinstance(res, Response):
            hdrs = {"Content-Type": res.media_type, **res.headers}
            return res.status_code, hdrs, res.content

        out_bytes = json.dumps(res).encode("utf-8")
        return 200, {"Content-Type": "application/json"}, out_bytes

    # Check static file mounts
    for mount_prefix, static_app in getattr(app, "static_mounts", []):
        if path.startswith(mount_prefix):
            rel = path[len(mount_prefix) :].lstrip("/") or "index.html"
            candidate = (static_app.directory / rel).resolve()
            if not candidate.is_file() and static_app.html:
                candidate = (static_app.directory / "index.html").resolve()
            if candidate.is_file():
                mtype = mimetypes.guess_type(str(candidate))[0] or "text/html"
                return 200, {"Content-Type": mtype}, candidate.read_bytes()

    return 404, {"Content-Type": "application/json"}, json.dumps({"detail": "Not Found"}).encode("utf-8")


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
    """Synchronous test client that runs against either native FastAPI or our async router."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self._loop = asyncio.new_event_loop()
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
        body_bytes = json.dumps(json_body).encode("utf-8") if json_body is not None else b""
        status, hdrs, content = self._loop.run_until_complete(
            dispatch_http_request(self.app, method, url, body_bytes=body_bytes, headers=headers)
        )
        return SimpleTestResponse(status, hdrs, content)

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("GET", url, headers=headers)

    def post(self, url: str, json: Any = None, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("POST", url, json_body=json, headers=headers)

    def put(self, url: str, json: Any = None, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("PUT", url, json_body=json, headers=headers)

    def delete(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleTestResponse:
        return self.request("DELETE", url, headers=headers)

    def close(self) -> None:
        for fn in getattr(self.app, "shutdown_handlers", []):
            res = fn()
            if inspect.iscoroutine(res):
                self._loop.run_until_complete(res)
        self._loop.close()
