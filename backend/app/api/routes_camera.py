"""Camera control, manual exposure, format guard, and live stretched preview routes."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Optional

from ..config import CONFIG
from ..hardware.camera_actor import CAMERA
from ..imaging.pipeline import LAST_UNSTRETCHED_PATH, process_and_publish_preview
from ..state import STATE
from ..web_compat import APIRouter, FileResponse, HTTPException, Response

router = APIRouter(prefix="/api/camera", tags=["camera"])

_preview_loop_task: Optional[asyncio.Task[None]] = None
_preview_loop_stop = asyncio.Event()


async def _preview_loop_worker() -> None:
    STATE.camera.live_view_running = True
    await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())
    try:
        while not _preview_loop_stop.is_set():
            t0 = time.monotonic()
            jpeg_bytes = await CAMERA.capture_live_view_bytes()

            if not jpeg_bytes:
                await asyncio.sleep(0.15)
                continue

            try:
                fps = round(1.0 / max(0.01, time.monotonic() - t0), 1)
                await process_and_publish_preview(
                    jpeg_bytes=jpeg_bytes,
                    max_dim=1280,
                    compute_hfr=False,
                    jpeg_quality=82,
                    source_label="Live Viewfinder",
                    max_overlay_stars=0,
                    meta={"mode": "Live Viewfinder", "fps": fps},
                    cache_source_for_retoggle=False,
                    broadcast=True,
                )
            except Exception:
                pass
            await asyncio.sleep(0.10)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        STATE.camera.last_error = f"Live view error: {exc}"
    finally:
        STATE.camera.live_view_running = False
        STATE.camera.busy = False
        try:
            await CAMERA.exit_live_view()
        except Exception:
            pass
        await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())


async def stop_live_loop_quietly() -> None:
    """Stop active EVF Live Viewfinder cleanly before any still or Bulb shutter capture."""
    global _preview_loop_task
    if _preview_loop_task is None or _preview_loop_task.done():
        STATE.camera.live_view_running = False
        return
    _preview_loop_stop.set()
    _preview_loop_task.cancel()
    try:
        await _preview_loop_task
    except (asyncio.CancelledError, Exception):
        pass
    _preview_loop_task = None
    STATE.camera.live_view_running = False
    await CAMERA.exit_live_view()
    await STATE.broadcast("CAMERA_STATUS", CAMERA.status_dict())


CAMERA.register_pre_capture_hook(stop_live_loop_quietly)


@router.post("/live-loop/start")
async def start_live_loop(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    global _preview_loop_task
    if STATE.camera.exposing or (STATE.active_mode == "SEQUENCE" and STATE.sequence_state.get("status") == "RUNNING"):
        raise HTTPException(
            status_code=409,
            detail="Cannot start Live Viewfinder while an exposure or imaging sequence is running.",
        )
    if _preview_loop_task is not None and not _preview_loop_task.done():
        return {"running": True, "camera": CAMERA.status_dict()}
    _preview_loop_stop.clear()
    STATE.camera.live_view_running = True
    _preview_loop_task = asyncio.create_task(_preview_loop_worker())
    return {"running": True, "camera": CAMERA.status_dict()}


@router.post("/live-loop/stop")
async def stop_live_loop() -> Dict[str, Any]:
    await stop_live_loop_quietly()
    await CAMERA.ensure_raw_format()
    return {"running": False, "camera": CAMERA.status_dict()}


@router.get("/status")
async def get_camera_status() -> Dict[str, Any]:
    return CAMERA.status_dict()


@router.post("/connect")
async def connect_camera() -> Dict[str, Any]:
    await stop_live_loop_quietly()
    return await CAMERA.initialize()


@router.post("/reset-usb")
async def reset_camera_usb() -> Dict[str, Any]:
    await stop_live_loop_quietly()
    loop = asyncio.get_running_loop()
    ok = await loop.run_in_executor(CAMERA._executor, CAMERA.reset_usb_bus_sync)
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


@router.post("/config")
async def set_camera_config(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Set ISO, shutter speed, or capture settings directly on the physical camera."""
    body = payload or {}
    iso = body.get("iso")
    exposure_s = body.get("exposure_s")
    if iso is not None:
        await CAMERA.set_iso(str(iso))
    if exposure_s is not None:
        await CAMERA.set_shutter_speed(float(exposure_s))
    return CAMERA.status_dict()


@router.post("/preview-stretch")
async def toggle_preview_stretch(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Toggle PixInsight MTF Auto-Stretch ON/OFF and re-render current preview without shooting."""
    body = payload or {}
    if "auto_stretch" in body:
        STATE.auto_stretch_enabled = bool(body["auto_stretch"])
    elif "enabled" in body:
        STATE.auto_stretch_enabled = bool(body["enabled"])
    else:
        STATE.auto_stretch_enabled = not STATE.auto_stretch_enabled

    STATE.latest_preview["auto_stretched"] = STATE.auto_stretch_enabled
    if LAST_UNSTRETCHED_PATH.is_file():
        await process_and_publish_preview(
            source_path=LAST_UNSTRETCHED_PATH,
            max_dim=1500,
            enable_stretch=STATE.auto_stretch_enabled,
            compute_hfr=True,
            jpeg_quality=86,
            source_label=STATE.latest_preview.get("source_format", "Small Fine JPEG"),
            meta=STATE.latest_preview.get("meta", {}),
            cache_source_for_retoggle=False,
            broadcast=True,
        )
    else:
        await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)

    return {
        "enabled": STATE.auto_stretch_enabled,
        "auto_stretched": STATE.auto_stretch_enabled,
        "preview": STATE.latest_preview,
    }


@router.post("/capture")
async def capture_manual_preview(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Capture a single test frame, run MTF auto-stretch + HFR, and restore RAW (.CR3) if requested."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 2.0))
    iso = str(body.get("iso", "800"))
    fast_jpeg = bool(body.get("fast_jpeg", True))
    enable_stretch = (
        bool(body["auto_stretch"]) if "auto_stretch" in body else STATE.auto_stretch_enabled
    )
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
        preview, metrics = await process_and_publish_preview(
            source_path=out_file,
            max_dim=1500,
            enable_stretch=enable_stretch,
            compute_hfr=True,
            tier2_linear=tier2_linear,
            jpeg_quality=86,
            source_label="Small Fine JPEG" if fast_jpeg else None,
            max_overlay_stars=20,
            meta={"exposure_s": exposure_s, "iso": iso},
            broadcast=True,
        )
        return {"preview": preview, "metrics": metrics}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Camera error: {exc}")
    finally:
        if restore_raw_after:
            await CAMERA.ensure_raw_format()


@router.get("/preview.jpg")
async def get_latest_preview_jpg() -> Response:
    preview_path = CONFIG.shm_dir / "latest_preview.jpg"
    if not preview_path.is_file():
        raise HTTPException(status_code=404, detail="No preview image captured yet")
    return FileResponse(
        preview_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, max-age=0"},
    )
