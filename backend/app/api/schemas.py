"""Typed Request Validation Helpers (Pydantic v2 on Pi + Zero-Dep Coercion Fallback).

Ensures malformed API payloads cleanly return HTTP 422 Unprocessable Entity rather
than unhandled 500 ValueError/TypeError tracebacks.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

from ..web_compat import HTTPException


def ensure_body_dict(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalize an optional JSON body into a dict or raise 422."""
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Request body must be a JSON object")
    return payload


def coerce_float(
    body: Dict[str, Any],
    key: str,
    default: float,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> float:
    """Extract and range-validate a finite float parameter from a request dict."""
    raw = body.get(key, default)
    if raw is None:
        raw = default
    try:
        val = float(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be a valid number") from exc
    if not math.isfinite(val):
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be finite")
    if min_val is not None and val < min_val:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be >= {min_val}")
    if max_val is not None and val > max_val:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be <= {max_val}")
    return val


def coerce_int(
    body: Dict[str, Any],
    key: str,
    default: int,
    min_val: Optional[int] = None,
    max_val: Optional[int] = None,
) -> int:
    """Extract and range-validate an integer parameter from a request dict."""
    raw = body.get(key, default)
    if raw is None:
        raw = default
    try:
        val = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be an integer") from exc
    if min_val is not None and val < min_val:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be >= {min_val}")
    if max_val is not None and val > max_val:
        raise HTTPException(status_code=422, detail=f"Field '{key}' must be <= {max_val}")
    return val
