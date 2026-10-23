"""Camera control, manual exposure, format guard, and live stretched preview routes."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Optional

import numpy as np
from PIL import Image

from ..config import CONFIG
from ..hardware.camera_actor import CAMERA
from ..imaging.cr3_parser import decode_cr3_preview_array
from ..imaging.focus_metrics import compute_star_hfr_metrics
from ..imaging.stretch import auto_stretch_rgb, compute_histogram_256
from ..state import STATE
from ..web_compat import APIRouter, FileResponse, HTTPException, Response

router = APIRouter(prefix="/api/camera", tags=["camera"])

_preview_loop_task: Optional[asyncio.Task[None]] = None
_preview_loop_stop = asyncio.Event()


async def _preview_loop_worker() -> None:
    live_path = CONFIG.shm_dir / "live_view.jpg"
    preview_path = CONFIG.shm_dir / "latest_preview.jpg"
    try:
        while not _preview_loop_stop.is_set():
            t0 = time.monotonic()
            await CAMERA.capture_live_view(live_path)

            if not live_path.is_file() or live_path.stat().st_size == 0:
                await asyncio.sleep(0.15)
                continue

            try:
                with Image.open(live_path) as img:
                    arr_rgb = np.asarray(img.convert("RGB"), dtype=np.uint8)

                stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
                hist = compute_histogram_256(stretched)
                Image.fromarray(stretched).save(preview_path, format="JPEG", quality=82)

                ts_ms = int(time.time() * 1000)
                fps = round(1.0 / max(0.01, time.monotonic() - t0), 1)
                STATE.latest_preview.update(
                    {
                        "image_url": f"/api/camera/preview.jpg?t={ts_ms}",
                        "timestamp": time.time(),
                        "width": int(stretched.shape[1]),
                        "height": int(stretched.shape[0]),
                        "source_format": "Live Viewfinder",
                        "auto_stretched": True,
                        "histogram": hist,
                        "stars_overlay": [],
                        "meta": {
                            "mode": "Live Viewfinder",
                            "fps": fps,
                        },
                    }
                )
                await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
            except Exception:
                pass
            await asyncio.sleep(0.12)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        STATE.camera.last_error = f"Live view error: {exc}"
        await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())
    finally:
        STATE.camera.busy = False
        await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())


@router.post("/live-loop/start")
async def start_live_loop(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    global _preview_loop_task
    if _preview_loop_task is not None and not _preview_loop_task.done():
        return {"running": True, "camera": CAMERA.status_dict()}
    _preview_loop_stop.clear()
    _preview_loop_task = asyncio.create_task(_preview_loop_worker())
    return {"running": True, "camera": CAMERA.status_dict()}


@router.post("/live-loop/stop")
async def stop_live_loop() -> Dict[str, Any]:
    global _preview_loop_task
    _preview_loop_stop.set()
    if _preview_loop_task is not None and not _preview_loop_task.done():
        _preview_loop_task.cancel()
        try:
            await _preview_loop_task
        except (asyncio.CancelledError, Exception):
            pass
    _preview_loop_task = None
    return {"running": False, "camera": CAMERA.status_dict()}


@router.get("/status")
async def get_camera_status() -> Dict[str, Any]:
    return CAMERA.status_dict()


@router.post("/connect")
async def connect_camera() -> Dict[str, Any]:
    return await CAMERA.initialize()


@router.post("/reset-usb")
async def reset_camera_usb() -> Dict[str, Any]:
    ok = CAMERA.reset_usb_bus_sync()
    await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())
    return {"reset_ok": ok, "camera": CAMERA.status_dict()}


@router.post("/format")
async def set_camera_format(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    fast_jpeg = bool(body.get("fast_jpeg", False))
    if fast_jpeg:
        fmt = await CAMERA.set_fast_jpeg_mode()
    else:
        fmt = await CAMERA.ensure_raw_format()
    return {"image_format": fmt, "camera": CAMERA.status_dict()}


@router.post("/abort")
async def abort_exposure() -> Dict[str, Any]:
    await CAMERA.abort_active_exposure()
    return {"aborted": True, "camera": CAMERA.status_dict()}


@router.post("/capture")
async def capture_manual_preview(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Capture a single test frame, run MTF auto-stretch + HFR, and restore RAW (.CR3) if requested."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 2.0))
    iso = str(body.get("iso", "800"))
    fast_jpeg = bool(body.get("fast_jpeg", True))
    enable_stretch = bool(body.get("auto_stretch", True))
    tier2_linear = bool(body.get("tier2_linear", False))
    restore_raw_after = bool(body.get("restore_raw_after", True))

    ext = ".jpg" if fast_jpeg else ".CR3"
    out_file = CONFIG.shm_dir / f"manual_shot{ext}"

    try:
        await CAMERA.capture_frame(
            output_path=out_file,
            exposure_s=exposure_s,
            iso=iso,
            fast_jpeg=fast_jpeg,
            frame_type="Light",
            mode=STATE.active_mode,
            max_retries=1,
        )
        arr_rgb, decoded_from = decode_cr3_preview_array(out_file, max_dim=1500, tier2_linear=tier2_linear)
        stretched = auto_stretch_rgb(arr_rgb, enable_stretch=enable_stretch)
        hist = compute_histogram_256(stretched)
        metrics = compute_star_hfr_metrics(arr_rgb)

        preview_path = CONFIG.shm_dir / "latest_preview.jpg"
        Image.fromarray(stretched).save(preview_path, format="JPEG", quality=86)

        ts_ms = int(time.time() * 1000)
        STATE.latest_preview.update(
            {
                "image_url": f"/api/camera/preview.jpg?t={ts_ms}",
                "timestamp": time.time(),
                "width": int(stretched.shape[1]),
                "height": int(stretched.shape[0]),
                "source_format": decoded_from if not fast_jpeg else "Small Fine JPEG",
                "auto_stretched": enable_stretch,
                "histogram": hist,
                "stars_overlay": metrics["stars"][:20],
                "meta": {
                    "exposure_s": exposure_s,
                    "iso": iso,
                    "hfr_median": metrics["hfr_median"],
                    "fwhm_arcsec": metrics["fwhm_arcsec"],
                    "star_count": metrics["star_count"],
                },
            }
        )
        await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
        return {"preview": STATE.latest_preview, "metrics": metrics}
    finally:
        if restore_raw_after:
            await CAMERA.ensure_raw_format()


@router.get("/preview.jpg")
async def get_latest_preview_jpg() -> Response:
    preview_path = CONFIG.shm_dir / "latest_preview.jpg"
    if not preview_path.is_file():
        # Generate an initial preview frame so the UI canvas is immediately populated
        await capture_manual_preview({"exposure_s": 1.5, "iso": "800", "fast_jpeg": True})
    if not preview_path.is_file():
        raise HTTPException(status_code=404, detail="No preview image available")
    return FileResponse(
        preview_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, max-age=0"},
    )
