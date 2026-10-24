"""Shared Non-Blocking Preview, MTF Stretch, Histogram & Star HFR Pipeline for Raspberry Pi 4.

Offloads all NumPy / SciPy / Pillow image processing to worker threads via asyncio.to_thread()
so the main FastAPI/WebSocket event loop stays sub-millisecond responsive during exposures.
"""

from __future__ import annotations

import asyncio
import io
import shutil
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image

from ..config import CONFIG
from ..state import STATE
from .cr3_parser import decode_cr3_preview_array
from .focus_metrics import compute_star_hfr_metrics
from .stretch import auto_stretch_rgb, compute_histogram_256

LAST_UNSTRETCHED_PATH = CONFIG.shm_dir / "last_source_rgb.jpg"


def _process_preview_sync(
    source_path: Optional[Path] = None,
    jpeg_bytes: Optional[bytes] = None,
    max_dim: int = 1400,
    enable_stretch: Optional[bool] = None,
    compute_hfr: bool = True,
    roi_norm: Optional[Tuple[float, float, float]] = None,
    tier2_linear: bool = False,
    jpeg_quality: int = 85,
    thumbnail_path: Optional[Path] = None,
    source_label: Optional[str] = None,
    max_overlay_stars: int = 20,
    meta: Optional[Dict[str, Any]] = None,
    cache_source_for_retoggle: bool = True,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Decode, optionally MTF-stretch, compute histogram + HFR, and write /dev/shm/astropi/latest_preview.jpg."""
    do_stretch = STATE.auto_stretch_enabled if enable_stretch is None else bool(enable_stretch)

    if jpeg_bytes is not None:
        with Image.open(io.BytesIO(jpeg_bytes)) as img:
            rgb_img = img.convert("RGB")
            if max(rgb_img.size) > max_dim:
                rgb_img.thumbnail((max_dim, max_dim))
            arr_rgb = np.asarray(rgb_img, dtype=np.uint8)
        decoded_from = source_label or "Live Viewfinder"
    elif source_path is not None:
        arr_rgb, raw_src = decode_cr3_preview_array(
            source_path,
            max_dim=max_dim,
            roi_norm=roi_norm,
            tier2_linear=tier2_linear,
        )
        decoded_from = source_label or raw_src
    else:
        raise ValueError("Either source_path or jpeg_bytes must be provided")

    # Normalize unstretched 8-bit base image once: used both for true exposure histogram
    # (Skyfog 15-35% & Flat 35-55% ADU guides) and for instant Stretch ON/OFF retoggling!
    u8_base = (
        arr_rgb
        if arr_rgb.dtype == np.uint8
        else auto_stretch_rgb(arr_rgb, enable_stretch=False)
    )
    if cache_source_for_retoggle and jpeg_bytes is None:
        try:
            Image.fromarray(u8_base).save(LAST_UNSTRETCHED_PATH, format="JPEG", quality=92)
        except Exception:
            pass

    hist = compute_histogram_256(u8_base)
    stretched = auto_stretch_rgb(u8_base, enable_stretch=do_stretch) if do_stretch else u8_base

    if compute_hfr:
        metrics = compute_star_hfr_metrics(arr_rgb)
    else:
        metrics = {
            "star_count": 0,
            "hfr_median": 0.0,
            "fwhm_arcsec": 0.0,
            "bg_median_adu": hist["median_adu"],
            "stars": [],
        }

    preview_path = CONFIG.shm_dir / "latest_preview.jpg"
    preview_tmp = CONFIG.shm_dir / "latest_preview.tmp.jpg"
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(stretched).save(preview_tmp, format="JPEG", quality=jpeg_quality)
    shutil.move(str(preview_tmp), str(preview_path))

    if thumbnail_path is not None:
        thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
        thumb_img = Image.fromarray(stretched)
        thumb_img.thumbnail((480, 320))
        thumb_img.save(thumbnail_path, format="JPEG", quality=80)

    ts_ms = int(time.time() * 1000)
    merged_meta = dict(meta or {})
    if compute_hfr:
        merged_meta.setdefault("hfr_median", metrics["hfr_median"])
        merged_meta.setdefault("fwhm_arcsec", metrics["fwhm_arcsec"])
        merged_meta.setdefault("star_count", metrics["star_count"])

    preview_payload: Dict[str, Any] = {
        "image_url": f"/api/camera/preview.jpg?t={ts_ms}",
        "timestamp": time.time(),
        "width": int(stretched.shape[1]),
        "height": int(stretched.shape[0]),
        "source_format": decoded_from,
        "auto_stretched": do_stretch,
        "histogram": hist,
        "stars_overlay": metrics["stars"][:max_overlay_stars] if max_overlay_stars > 0 else [],
        "meta": merged_meta,
    }
    return preview_payload, metrics


async def process_and_publish_preview(
    source_path: Optional[Path] = None,
    jpeg_bytes: Optional[bytes] = None,
    max_dim: int = 1400,
    enable_stretch: Optional[bool] = None,
    compute_hfr: bool = True,
    roi_norm: Optional[Tuple[float, float, float]] = None,
    tier2_linear: bool = False,
    jpeg_quality: int = 85,
    thumbnail_path: Optional[Path] = None,
    source_label: Optional[str] = None,
    max_overlay_stars: int = 20,
    meta: Optional[Dict[str, Any]] = None,
    cache_source_for_retoggle: bool = True,
    broadcast: bool = True,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Run preview processing in a background thread and broadcast PREVIEW_UPDATED."""
    preview_payload, metrics = await asyncio.to_thread(
        _process_preview_sync,
        source_path=source_path,
        jpeg_bytes=jpeg_bytes,
        max_dim=max_dim,
        enable_stretch=enable_stretch,
        compute_hfr=compute_hfr,
        roi_norm=roi_norm,
        tier2_linear=tier2_linear,
        jpeg_quality=jpeg_quality,
        thumbnail_path=thumbnail_path,
        source_label=source_label,
        max_overlay_stars=max_overlay_stars,
        meta=meta,
        cache_source_for_retoggle=cache_source_for_retoggle,
    )
    STATE.latest_preview.update(preview_payload)
    if broadcast:
        await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
    return STATE.latest_preview, metrics
