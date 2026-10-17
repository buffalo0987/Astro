"""Push-To Framing, Offline Deep-Sky Catalog, and Manual Focus Aid (HFR/FWHM) routes."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional

from PIL import Image

from ..astrometry.astap_runner import ASTAP
from ..astrometry.coordinates import ObserverLocation
from ..astrometry.framing import compute_framing_guidance
from ..catalog.seed_catalog import import_telescopius_csv, parse_sexagesimal_or_decimal, query_catalog
from ..config import CONFIG
from ..hardware.camera_actor import CAMERA
from ..hardware.simulated_camera import SIM_RIG
from ..imaging.cr3_parser import decode_cr3_preview_array
from ..imaging.focus_metrics import compute_star_hfr_metrics
from ..imaging.stretch import auto_stretch_rgb, compute_histogram_256
from ..state import STATE
from ..web_compat import APIRouter, HTTPException

router = APIRouter(prefix="/api/framing", tags=["framing_focus"])

_focus_loop_task: Optional[asyncio.Task[None]] = None
_focus_loop_stop = asyncio.Event()


def _current_observer() -> ObserverLocation:
    return ObserverLocation(
        latitude_deg=STATE.observer.latitude_deg,
        longitude_deg=STATE.observer.longitude_deg,
        elevation_m=STATE.observer.elevation_m,
        pressure_hpa=STATE.observer.pressure_hpa,
        temperature_c=STATE.observer.temperature_c,
        refraction_enabled=STATE.observer.refraction_enabled,
    )


@router.get("/catalog")
async def list_dso_catalog(
    search: str = "",
    object_type: str = "",
    min_alt: Optional[float] = None,
) -> Dict[str, Any]:
    obs = _current_observer()
    items = query_catalog(
        observer=obs,
        utc_timestamp=STATE.observer.current_utc_timestamp(),
        search=search,
        object_type=object_type,
        min_altitude_deg=min_alt,
    )
    return {"items": items, "count": len(items)}


@router.post("/catalog/import-csv")
async def import_catalog_csv(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    csv_text = str(body.get("csv_text", ""))
    if not csv_text.strip():
        raise HTTPException(status_code=400, detail="csv_text is required")
    imported = import_telescopius_csv(csv_text)
    return {"imported": imported, "count": len(imported)}


@router.post("/select-target")
async def select_framing_target(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    target_id = str(body.get("target_id", "CUSTOM"))
    target_name = str(body.get("target_name", "Custom Target"))
    ra_raw = body.get("target_ra_hours", body.get("ra", 20.988))
    dec_raw = body.get("target_dec_deg", body.get("dec", 44.33))

    ra_hours = (
        parse_sexagesimal_or_decimal(str(ra_raw), is_ra=True)
        if isinstance(ra_raw, str)
        else float(ra_raw)
    )
    dec_deg = (
        parse_sexagesimal_or_decimal(str(dec_raw), is_ra=False)
        if isinstance(dec_raw, str)
        else float(dec_raw)
    )

    STATE.framing_state.update(
        {
            "target_id": target_id,
            "target_name": target_name,
            "target_ra_hours": round(ra_hours % 24.0, 5),
            "target_dec_deg": round(max(-90.0, min(90.0, dec_deg)), 5),
        }
    )

    if STATE.framing_state.get("solved") and STATE.framing_state.get("current_ra_hours") is not None:
        guidance = compute_framing_guidance(
            current_ra_hours=float(STATE.framing_state["current_ra_hours"]),
            current_dec_deg=float(STATE.framing_state["current_dec_deg"]),
            current_pa_deg=float(STATE.framing_state.get("rotation_pa_deg") or 0.0),
            target_ra_hours=float(STATE.framing_state["target_ra_hours"]),
            target_dec_deg=float(STATE.framing_state["target_dec_deg"]),
            utc_timestamp=STATE.observer.current_utc_timestamp(),
            observer=_current_observer(),
        )
        STATE.framing_state.update(guidance)

    await STATE.broadcast("FRAMING_STATE", STATE.framing_state)
    return STATE.framing_state


@router.post("/solve")
async def capture_and_solve_framing(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Capture a fast JPEG in /dev/shm, plate-solve via ASTAP, compute Push-To vectors, and restore RAW."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 2.0))
    iso = str(body.get("iso", "1600"))
    restore_raw = bool(body.get("restore_raw", True))

    if "sim_nudge_ra_hours" in body or "sim_nudge_dec_deg" in body:
        SIM_RIG.nudge_framing(
            float(body.get("sim_nudge_ra_hours", 0.0)),
            float(body.get("sim_nudge_dec_deg", 0.0)),
            float(body.get("sim_nudge_pa_deg", 0.0)),
        )
    elif bool(body.get("sim_center_on_target", False)):
        SIM_RIG.pointing_ra_hours = float(STATE.framing_state["target_ra_hours"])
        SIM_RIG.pointing_dec_deg = float(STATE.framing_state["target_dec_deg"])

    STATE.active_mode = "FRAME"
    frame_path = CONFIG.shm_dir / "framing_solve.jpg"
    try:
        await CAMERA.capture_frame(
            output_path=frame_path,
            exposure_s=exposure_s,
            iso=iso,
            fast_jpeg=True,
            frame_type="Light",
            mode="FRAME",
        )
        utc_ts = STATE.observer.current_utc_timestamp()
        solve = await ASTAP.solve_image(frame_path, force_blind=False)
        if not solve.solved:
            raise HTTPException(status_code=422, detail=solve.message or "Framing plate solve failed")

        arr_rgb, _ = decode_cr3_preview_array(frame_path, max_dim=1400)
        stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
        hist = compute_histogram_256(stretched)
        metrics = compute_star_hfr_metrics(arr_rgb)
        Image.fromarray(stretched).save(CONFIG.shm_dir / "latest_preview.jpg", format="JPEG", quality=85)

        STATE.latest_preview.update(
            {
                "image_url": f"/api/camera/preview.jpg?t={int(time.time() * 1000)}",
                "timestamp": time.time(),
                "source_format": "Small Fine JPEG",
                "histogram": hist,
                "stars_overlay": metrics["stars"][:20],
            }
        )

        guidance = compute_framing_guidance(
            current_ra_hours=solve.ra_hours,
            current_dec_deg=solve.dec_deg,
            current_pa_deg=solve.crota2_deg,
            target_ra_hours=float(STATE.framing_state["target_ra_hours"]),
            target_dec_deg=float(STATE.framing_state["target_dec_deg"]),
            utc_timestamp=utc_ts,
            observer=_current_observer(),
        )
        guidance["solve_time_ms"] = solve.solve_time_ms
        STATE.framing_state.update(guidance)
        await STATE.broadcast("FRAMING_STATE", STATE.framing_state)
        await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
        return STATE.framing_state
    finally:
        if restore_raw:
            await CAMERA.ensure_raw_format()
            if STATE.active_mode == "FRAME":
                STATE.active_mode = "IDLE"


@router.post("/focus-roi")
async def set_focus_roi(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    if body.get("clear", False) or body.get("roi") is None:
        STATE.focus_state["roi"] = None
    else:
        r = body["roi"]
        STATE.focus_state["roi"] = {
            "x": max(0.05, min(0.95, float(r.get("x", 0.5)))),
            "y": max(0.05, min(0.95, float(r.get("y", 0.5)))),
            "size": int(r.get("size", 240)),
        }
    if "reset_history" in body and body["reset_history"]:
        STATE.focus_state["history"] = []
        STATE.focus_state["min_hfr_achieved"] = None
    await STATE.broadcast("FOCUS_METRICS", STATE.focus_state)
    return STATE.focus_state


@router.post("/focus-step")
async def capture_focus_step(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Capture a fast focus frame, compute full-field or 1:1 ROI HFR/FWHM, and append V-curve history."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 1.5))
    iso = str(body.get("iso", "1600"))
    restore_raw = bool(body.get("restore_raw", not STATE.focus_state.get("loop_running", False)))

    if "sim_focus_step" in body:
        SIM_RIG.focus_defocus_steps = round(float(body["sim_focus_step"]), 2)
    elif "sim_focus_delta" in body:
        SIM_RIG.focus_defocus_steps = round(SIM_RIG.focus_defocus_steps + float(body["sim_focus_delta"]), 2)

    STATE.active_mode = "FOCUS"
    frame_path = CONFIG.shm_dir / "focus_frame.jpg"
    try:
        await CAMERA.capture_frame(
            output_path=frame_path,
            exposure_s=exposure_s,
            iso=iso,
            fast_jpeg=True,
            frame_type="Light",
            mode="FOCUS",
        )
        roi_cfg = STATE.focus_state.get("roi")
        roi_tuple = (
            (float(roi_cfg["x"]), float(roi_cfg["y"]), float(roi_cfg.get("size", 240)))
            if isinstance(roi_cfg, dict)
            else None
        )

        arr_rgb, _ = decode_cr3_preview_array(frame_path, max_dim=1400, roi_norm=roi_tuple)
        stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
        hist = compute_histogram_256(stretched)
        metrics = compute_star_hfr_metrics(arr_rgb)

        Image.fromarray(stretched).save(CONFIG.shm_dir / "latest_preview.jpg", format="JPEG", quality=85)

        hfr = float(metrics["hfr_median"])
        fwhm = float(metrics["fwhm_arcsec"])
        scount = int(metrics["star_count"])

        prev_min = STATE.focus_state.get("min_hfr_achieved")
        if hfr > 0 and (prev_min is None or hfr < prev_min):
            STATE.focus_state["min_hfr_achieved"] = hfr

        history: List[Dict[str, Any]] = list(STATE.focus_state.get("history", []))
        if hfr > 0:
            history.append(
                {
                    "timestamp": round(time.time(), 1),
                    "hfr": hfr,
                    "fwhm": fwhm,
                    "stars": scount,
                }
            )
            if len(history) > 30:
                history = history[-30:]

        STATE.focus_state.update(
            {
                "hfr_median": hfr,
                "fwhm_arcsec": fwhm,
                "star_count": scount,
                "history": history,
            }
        )
        STATE.latest_preview.update(
            {
                "image_url": f"/api/camera/preview.jpg?t={int(time.time() * 1000)}",
                "timestamp": time.time(),
                "source_format": "1:1 ROI JPEG" if roi_tuple else "Small Fine JPEG",
                "histogram": hist,
                "stars_overlay": metrics["stars"][:20],
            }
        )
        await STATE.broadcast("FOCUS_METRICS", STATE.focus_state)
        await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
        return STATE.focus_state
    finally:
        if restore_raw:
            await CAMERA.ensure_raw_format()
            if STATE.active_mode == "FOCUS" and not STATE.focus_state.get("loop_running", False):
                STATE.active_mode = "IDLE"


async def _focus_loop_worker(exposure_s: float, iso: str) -> None:
    try:
        while not _focus_loop_stop.is_set():
            await capture_focus_step({"exposure_s": exposure_s, "iso": iso, "restore_raw": False})
            await asyncio.sleep(0.30)
    except asyncio.CancelledError:
        pass
    finally:
        STATE.focus_state["loop_running"] = False
        await CAMERA.ensure_raw_format()
        if STATE.active_mode == "FOCUS":
            STATE.active_mode = "IDLE"
        await STATE.broadcast("FOCUS_METRICS", STATE.focus_state)


@router.post("/focus-loop/start")
async def start_focus_loop(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    global _focus_loop_task
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 1.5))
    iso = str(body.get("iso", "1600"))
    if _focus_loop_task is not None and not _focus_loop_task.done():
        return STATE.focus_state
    _focus_loop_stop.clear()
    STATE.focus_state["loop_running"] = True
    _focus_loop_task = asyncio.create_task(_focus_loop_worker(exposure_s, iso))
    await STATE.broadcast("FOCUS_METRICS", STATE.focus_state)
    return STATE.focus_state


@router.post("/focus-loop/stop")
async def stop_focus_loop() -> Dict[str, Any]:
    global _focus_loop_task
    _focus_loop_stop.set()
    if _focus_loop_task is not None and not _focus_loop_task.done():
        _focus_loop_task.cancel()
        try:
            await _focus_loop_task
        except (asyncio.CancelledError, Exception):
            pass
    _focus_loop_task = None
    STATE.focus_state["loop_running"] = False
    await CAMERA.ensure_raw_format()
    if STATE.active_mode == "FOCUS":
        STATE.active_mode = "IDLE"
    await STATE.broadcast("FOCUS_METRICS", STATE.focus_state)
    return STATE.focus_state
