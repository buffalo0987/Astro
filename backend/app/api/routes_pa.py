"""Fast-Loop Polar Alignment API routes (2/3-point SO(3) calibration + continuous live solve)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Optional

from PIL import Image

from ..astrometry.astap_runner import ASTAP
from ..astrometry.coordinates import ObserverLocation
from ..astrometry.polar_align import PA_ENGINE
from ..config import CONFIG
from ..hardware.camera_actor import CAMERA
from ..hardware.simulated_camera import SIM_RIG
from ..imaging.cr3_parser import decode_cr3_preview_array
from ..imaging.stretch import auto_stretch_rgb, compute_histogram_256
from ..state import STATE
from ..web_compat import APIRouter, HTTPException

router = APIRouter(prefix="/api/pa", tags=["polar_alignment"])

_pa_loop_task: Optional[asyncio.Task[None]] = None
_pa_loop_stop = asyncio.Event()


def _current_observer() -> ObserverLocation:
    return ObserverLocation(
        latitude_deg=STATE.observer.latitude_deg,
        longitude_deg=STATE.observer.longitude_deg,
        elevation_m=STATE.observer.elevation_m,
        pressure_hpa=STATE.observer.pressure_hpa,
        temperature_c=STATE.observer.temperature_c,
        refraction_enabled=STATE.observer.refraction_enabled,
    )


@router.get("/state")
async def get_pa_state() -> Dict[str, Any]:
    return STATE.pa_state


@router.post("/start")
async def start_pa_workflow(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Enter Polar Alignment mode, switch camera to Small Fine JPEG, and reset solver."""
    body = payload or {}
    await stop_pa_live_loop({"restore_raw": False})

    mode_points = int(body.get("mode_points", 3))
    if mode_points not in (2, 3):
        mode_points = 3
    auto_advance = bool(body.get("auto_advance", False))
    if "refraction_pole" in body:
        STATE.observer.refraction_enabled = bool(body["refraction_pole"])
        STATE.save_observer()

    PA_ENGINE.reset(mode_points=mode_points)
    PA_ENGINE.auto_advance = auto_advance
    ASTAP.clear_seed()

    STATE.active_mode = "PA"
    await CAMERA.set_fast_jpeg_mode()

    obs = _current_observer()
    STATE.pa_state.update(PA_ENGINE.to_dict(obs))
    STATE.pa_state["phase"] = "CALIBRATING"
    STATE.pa_state["loop_running"] = False
    await STATE.broadcast("PA_STATE", STATE.pa_state)
    return STATE.pa_state


@router.post("/capture-point")
async def capture_pa_calibration_point(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Capture a fast JPEG in /dev/shm, plate-solve via ASTAP, and add a calibration point."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 2.0))
    iso = str(body.get("iso", "1600"))
    simulate_ra_step_deg = float(body.get("simulate_ra_step_deg", 0.0))

    STATE.active_mode = "PA"
    if STATE.camera.driver_mode == "simulator" and simulate_ra_step_deg != 0.0:
        SIM_RIG.rotate_ra_clutch(simulate_ra_step_deg)
    elif STATE.camera.driver_mode == "simulator" and len(PA_ENGINE.points) > 0 and "simulate_ra_step_deg" not in body:
        # Automatically advance the simulated RA clutch by 28 deg when testing in simulator
        SIM_RIG.rotate_ra_clutch(28.0)

    frame_path = CONFIG.shm_dir / "pa_frame.jpg"
    await CAMERA.capture_frame(
        output_path=frame_path,
        exposure_s=exposure_s,
        iso=iso,
        fast_jpeg=True,
        frame_type="Light",
        mode="PA",
    )
    utc_ts = STATE.observer.current_utc_timestamp()
    solve = await ASTAP.solve_image(frame_path, force_blind=(len(PA_ENGINE.points) == 0))
    if not solve.solved:
        raise HTTPException(status_code=422, detail=solve.message or "ASTAP plate solve failed")

    # Update stretched preview in /dev/shm
    arr_rgb, _ = decode_cr3_preview_array(frame_path, max_dim=1200)
    stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
    hist = compute_histogram_256(stretched)
    preview_path = CONFIG.shm_dir / "latest_preview.jpg"
    Image.fromarray(stretched).save(preview_path, format="JPEG", quality=82)
    STATE.latest_preview.update(
        {
            "image_url": f"/api/camera/preview.jpg?t={int(time.time() * 1000)}",
            "timestamp": time.time(),
            "source_format": "Small Fine JPEG",
            "histogram": hist,
        }
    )

    obs = _current_observer()
    try:
        pa_dict = PA_ENGINE.add_calibration_point(
            ra_hours=solve.ra_hours,
            dec_deg=solve.dec_deg,
            crota2_deg=solve.crota2_deg,
            utc_timestamp=utc_ts,
            observer=obs,
        )
    except ValueError as vexc:
        raise HTTPException(status_code=400, detail=str(vexc)) from vexc

    pa_dict["last_solve_ms"] = solve.solve_time_ms
    pa_dict["loop_running"] = _pa_loop_task is not None and not _pa_loop_task.done()
    STATE.pa_state.update(pa_dict)
    await STATE.broadcast("PA_STATE", STATE.pa_state)
    await STATE.broadcast("PREVIEW_UPDATED", STATE.latest_preview)
    return STATE.pa_state


@router.post("/live-step")
async def execute_pa_live_step(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Execute one fast-solve iteration (~2.5s cycle) of the Live Wedge Adjustment phase."""
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 1.6))
    iso = str(body.get("iso", "1600"))

    if PA_ENGINE.camera_local_axis is None:
        raise HTTPException(
            status_code=400,
            detail="Calibration points must be completed before running live adjustment.",
        )

    frame_path = CONFIG.shm_dir / "pa_live.jpg"
    await CAMERA.capture_frame(
        output_path=frame_path,
        exposure_s=exposure_s,
        iso=iso,
        fast_jpeg=True,
        frame_type="Light",
        mode="PA",
    )
    utc_ts = STATE.observer.current_utc_timestamp()
    # Use seeded ASTAP search (-ra -spd -r 15) for ~0.2s solves!
    solve = await ASTAP.solve_image(frame_path, force_blind=False)
    if not solve.solved:
        raise HTTPException(status_code=422, detail=solve.message or "Live solve failed")

    arr_rgb, _ = decode_cr3_preview_array(frame_path, max_dim=1200)
    stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
    hist = compute_histogram_256(stretched)
    Image.fromarray(stretched).save(CONFIG.shm_dir / "latest_preview.jpg", format="JPEG", quality=82)
    STATE.latest_preview.update(
        {
            "image_url": f"/api/camera/preview.jpg?t={int(time.time() * 1000)}",
            "timestamp": time.time(),
            "source_format": "Small Fine JPEG",
            "histogram": hist,
        }
    )

    obs = _current_observer()
    pa_dict = PA_ENGINE.evaluate_live_frame(
        ra_hours=solve.ra_hours,
        dec_deg=solve.dec_deg,
        crota2_deg=solve.crota2_deg,
        utc_timestamp=utc_ts,
        observer=obs,
    )
    pa_dict["last_solve_ms"] = solve.solve_time_ms
    pa_dict["loop_running"] = _pa_loop_task is not None and not _pa_loop_task.done()
    STATE.pa_state.update(pa_dict)
    await STATE.broadcast("PA_STATE", STATE.pa_state)
    return STATE.pa_state


async def _continuous_pa_worker(exposure_s: float, iso: str) -> None:
    try:
        while not _pa_loop_stop.is_set():
            if PA_ENGINE.camera_local_axis is None:
                # In Hands-Free Auto-Advance calibration mode
                frame_path = CONFIG.shm_dir / "pa_auto.jpg"
                await CAMERA.capture_frame(
                    output_path=frame_path,
                    exposure_s=exposure_s,
                    iso=iso,
                    fast_jpeg=True,
                    frame_type="Light",
                    mode="PA",
                )
                utc_ts = STATE.observer.current_utc_timestamp()
                solve = await ASTAP.solve_image(frame_path, force_blind=False)
                if solve.solved:
                    obs = _current_observer()
                    locked, info = PA_ENGINE.check_auto_advance_frame(
                        solve.ra_hours,
                        solve.dec_deg,
                        solve.crota2_deg,
                        utc_ts,
                        obs,
                    )
                    if locked:
                        STATE.pa_state.update(info)
                    else:
                        STATE.pa_state.update(PA_ENGINE.to_dict(obs))
                        STATE.pa_state.update(info)
                    STATE.pa_state["last_solve_ms"] = solve.solve_time_ms
                    STATE.pa_state["loop_running"] = True
                    await STATE.broadcast("PA_STATE", STATE.pa_state)
            else:
                await execute_pa_live_step({"exposure_s": exposure_s, "iso": iso})
            await asyncio.sleep(0.35)
    except asyncio.CancelledError:
        pass
    finally:
        STATE.pa_state["loop_running"] = False
        await CAMERA.ensure_raw_format()
        await STATE.broadcast("PA_STATE", STATE.pa_state)


@router.post("/live-loop/start")
async def start_pa_live_loop(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    global _pa_loop_task
    body = payload or {}
    exposure_s = float(body.get("exposure_s", 1.6))
    iso = str(body.get("iso", "1600"))

    if _pa_loop_task is not None and not _pa_loop_task.done():
        return STATE.pa_state

    _pa_loop_stop.clear()
    STATE.pa_state["loop_running"] = True
    _pa_loop_task = asyncio.create_task(_continuous_pa_worker(exposure_s, iso))
    await STATE.broadcast("PA_STATE", STATE.pa_state)
    return STATE.pa_state


@router.post("/live-loop/stop")
async def stop_pa_live_loop(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    global _pa_loop_task
    body = payload or {}
    restore_raw = bool(body.get("restore_raw", True))
    _pa_loop_stop.set()
    if _pa_loop_task is not None and not _pa_loop_task.done():
        _pa_loop_task.cancel()
        try:
            await _pa_loop_task
        except (asyncio.CancelledError, Exception):
            pass
    _pa_loop_task = None
    STATE.pa_state["loop_running"] = False
    if restore_raw:
        await CAMERA.ensure_raw_format()
        if STATE.active_mode == "PA":
            STATE.active_mode = "IDLE"
    await STATE.broadcast("PA_STATE", STATE.pa_state)
    return STATE.pa_state


@router.post("/sim-control")
async def simulator_pa_control(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Adjust simulated Star Adventurer 2i wedge knobs or RA clutch angle during testing."""
    body = payload or {}
    if "rotate_ra_deg" in body:
        SIM_RIG.rotate_ra_clutch(float(body["rotate_ra_deg"]))
    if "d_alt_arcmin" in body or "d_az_arcmin" in body:
        SIM_RIG.adjust_wedge(
            float(body.get("d_alt_arcmin", 0.0)),
            float(body.get("d_az_arcmin", 0.0)),
        )
    if PA_ENGINE.camera_local_axis is not None:
        return await execute_pa_live_step({"exposure_s": 1.0, "iso": "1600"})
    return {
        "ra_clutch_angle_deg": SIM_RIG.ra_clutch_angle_deg,
        "wedge_alt_error_arcmin": SIM_RIG.wedge_alt_error_arcmin,
        "wedge_az_error_arcmin": SIM_RIG.wedge_az_error_arcmin,
    }
