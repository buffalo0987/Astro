"""Camera control, manual exposure, format guard, and live stretched preview routes."""

from __future__ import annotations

import asyncio
import math
import time
from typing import Any, Dict, List, Optional, Tuple

from ..astrometry.astap_runner import ASTAP
from ..config import CONFIG
from ..hardware.camera_actor import (
    CAMERA,
    format_canon_shutter_label,
    parse_canon_shutter_choice,
)
from ..hardware.simulated_camera import SIM_RIG
from ..imaging.light_exposure_solver import solve_optimal_light_exposure
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
    frame_type = str(body.get("frame_type", "Light"))
    fast_jpeg = bool(body.get("fast_jpeg", True))
    enable_stretch = (
        bool(body["auto_stretch"]) if "auto_stretch" in body else STATE.auto_stretch_enabled
    )
    tier2_linear = bool(body.get("tier2_linear", False))
    restore_raw_after = bool(body.get("restore_raw_after", True))
    is_flat = frame_type.lower() == "flat"

    ext = ".jpg" if fast_jpeg else ".CR3"
    out_file = CONFIG.shm_dir / f"manual_shot{ext}"

    try:
        await CAMERA.capture_frame(
            output_path=out_file,
            exposure_s=exposure_s,
            iso=iso,
            fast_jpeg=fast_jpeg,
            frame_type=frame_type,
            mode="FLAT" if is_flat else STATE.active_mode,
            max_retries=1,
        )
        preview, metrics = await process_and_publish_preview(
            source_path=out_file,
            max_dim=1500,
            enable_stretch=enable_stretch,
            compute_hfr=not is_flat,
            tier2_linear=tier2_linear,
            jpeg_quality=86,
            source_label="Small Fine JPEG" if fast_jpeg else None,
            max_overlay_stars=0 if is_flat else 20,
            meta={"exposure_s": exposure_s, "iso": iso, "frame_type": frame_type},
            broadcast=True,
        )
        return {"preview": preview, "metrics": metrics}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Camera error: {exc}")
    finally:
        if restore_raw_after:
            await CAMERA.ensure_raw_format()


@router.post("/auto-flat")
async def auto_calibrate_flat(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Automatically solve optimal Flat shutter speed & ISO (35-55% unstretched ADU, unclipped).

    Starts at clean ISO 100 by default, uses inverse-gamma (2.2) proportional jumps snapped to
    physical Canon EOS M200 1/3-stop shutter choices, steps ISO up only when dimmer panels or
    dual-band filters would exceed max_exposure_s, warns on PWM screen flicker (<1/250s), and
    guarantees restoration to RAW (.CR3).
    """
    if STATE.camera.exposing or (
        STATE.active_mode == "SEQUENCE" and STATE.sequence_state.get("status") == "RUNNING"
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot run Auto-Flat calibration while an exposure or imaging sequence is actively running.",
        )

    body = payload or {}
    iso_ladder = ("100", "200", "400", "800", "1600")
    lock_iso = bool(body.get("lock_iso", False))
    preferred_iso = str(body.get("preferred_iso", "100")).strip()
    cur_iso = preferred_iso if (lock_iso and preferred_iso in iso_ladder) else "100"

    target_pct = max(38.0, min(52.0, float(body.get("target_adu_pct", 45.0))))
    target_adu = 255.0 * (target_pct / 100.0)
    max_exposure_per_iso_s = max(0.5, min(10.0, float(body.get("max_exposure_s", 2.0))))
    hard_max_exposure_s = max(max_exposure_per_iso_s, min(15.0, float(body.get("hard_max_exposure_s", 4.0))))
    max_iterations = max(2, min(8, int(body.get("max_iterations", 6))))
    flicker_safe_floor_s = 0.004  # 1/250s PWM LED flicker threshold

    await stop_live_loop_quietly()
    try:
        from .routes_framing import stop_focus_loop
        from .routes_pa import stop_pa_live_loop

        if STATE.pa_state.get("loop_running"):
            await stop_pa_live_loop({"restore_raw": False})
        if STATE.focus_state.get("loop_running"):
            await stop_focus_loop()
    except Exception:
        pass

    raw_choices = await CAMERA.get_shutter_choices()
    parsed_choices: List[Tuple[float, str]] = []
    seen_secs: set[float] = set()
    for ch in raw_choices:
        sec = parse_canon_shutter_choice(ch)
        if sec is not None and 0.0001 <= sec <= hard_max_exposure_s * 1.05:
            key = round(sec, 7)
            if key not in seen_secs:
                seen_secs.add(key)
                parsed_choices.append((sec, ch))
    parsed_choices.sort(key=lambda item: item[0])
    if not parsed_choices:
        parsed_choices = [(0.25, "1/4")]

    cur_exp_s = max(parsed_choices[0][0], min(0.25, float(body.get("start_exposure_s", 0.1))))
    tested_pairs: set[Tuple[str, str]] = set()
    history: List[Dict[str, Any]] = []
    converged = False
    too_bright = False
    too_dim = False
    best_entry: Optional[Dict[str, Any]] = None
    last_snapped_exp: Optional[float] = None
    last_desired_exp: Optional[float] = None

    prev_sim_flux = SIM_RIG.flat_panel_ev_flux
    has_sim_override = (
        STATE.camera.driver_mode == "simulator"
        and "sim_flat_flux" in body
        and body["sim_flat_flux"] is not None
    )
    if has_sim_override:
        SIM_RIG.flat_panel_ev_flux = max(0.0, float(body["sim_flat_flux"]))

    out_file = CONFIG.shm_dir / "auto_flat_probe.jpg"

    try:
        for step_num in range(1, max_iterations + 1):
            best_idx = min(
                range(len(parsed_choices)),
                key=lambda i: abs(math.log(parsed_choices[i][0] / max(1e-6, cur_exp_s))),
            )
            if (cur_iso, parsed_choices[best_idx][1]) in tested_pairs:
                if last_desired_exp is not None and last_snapped_exp is not None:
                    if last_desired_exp > last_snapped_exp and best_idx + 1 < len(parsed_choices):
                        best_idx += 1
                    elif last_desired_exp < last_snapped_exp and best_idx - 1 >= 0:
                        best_idx -= 1
                if (cur_iso, parsed_choices[best_idx][1]) in tested_pairs:
                    break

            raw_sec, choice_str = parsed_choices[best_idx]
            snapped_exp_s = round(raw_sec, 6)
            shutter_label = format_canon_shutter_label(choice_str, snapped_exp_s)
            tested_pairs.add((cur_iso, choice_str))

            await CAMERA.capture_frame(
                output_path=out_file,
                exposure_s=snapped_exp_s,
                iso=cur_iso,
                fast_jpeg=True,
                frame_type="Flat",
                mode="FLAT",
                max_retries=1,
            )
            preview, _ = await process_and_publish_preview(
                source_path=out_file,
                max_dim=1500,
                enable_stretch=False,
                compute_hfr=False,
                jpeg_quality=85,
                source_label="Auto-Flat Probe (S1)",
                max_overlay_stars=0,
                meta={
                    "exposure_s": snapped_exp_s,
                    "shutter_label": shutter_label,
                    "iso": cur_iso,
                    "frame_type": "Flat",
                    "auto_flat_step": step_num,
                },
                broadcast=True,
            )
            hist = preview.get("histogram") or {}
            med_adu = float(hist.get("median_adu", 0.0))
            max_ch_p99 = float(hist.get("max_channel_p99_adu", hist.get("p99_adu", 0.0)))
            adu_pct = round((med_adu / 255.0) * 100.0, 1)

            entry = {
                "step": step_num,
                "iso": cur_iso,
                "exposure_s": snapped_exp_s,
                "shutter_label": shutter_label,
                "choice": choice_str,
                "median_adu": med_adu,
                "adu_pct": adu_pct,
                "max_channel_p99_adu": max_ch_p99,
            }
            history.append(entry)

            in_sweet_spot = (36.0 <= adu_pct <= 54.0) and (max_ch_p99 < 240.0)
            if in_sweet_spot and not ((not lock_iso) and int(cur_iso) > 100 and snapped_exp_s < flicker_safe_floor_s):
                converged = True
                best_entry = entry
                break

            # Proportional inverse-gamma (2.2) solver with saturation/pedestal guards
            if med_adu >= 240.0:
                ratio = 0.125
            elif max_ch_p99 >= 240.0 or med_adu >= 225.0:
                ratio = 0.28
            elif med_adu < 8.0:
                ratio = 12.0
            else:
                ratio = max(0.08, min(16.0, (target_adu / med_adu) ** 2.2))

            desired_exp = snapped_exp_s * ratio
            next_iso = cur_iso
            if not lock_iso:
                iso_idx = iso_ladder.index(cur_iso)
                while desired_exp > max_exposure_per_iso_s and iso_idx + 1 < len(iso_ladder):
                    iso_idx += 1
                    desired_exp /= 2.0
                while desired_exp < 0.02 and iso_idx > 0:
                    iso_idx -= 1
                    desired_exp *= 2.0
                next_iso = iso_ladder[iso_idx]

            # Detect physical shutter/ISO limits before taking redundant boundary exposures
            if (
                best_idx == 0
                and next_iso == cur_iso
                and desired_exp < snapped_exp_s * 0.92
                and (adu_pct > 55.0 or max_ch_p99 >= 242.0)
            ):
                too_bright = True
                break

            if (
                best_idx == len(parsed_choices) - 1
                and next_iso == cur_iso
                and desired_exp > snapped_exp_s * 1.08
                and adu_pct < 35.0
            ):
                too_dim = True
                break

            last_snapped_exp = snapped_exp_s if next_iso == cur_iso else None
            last_desired_exp = desired_exp if next_iso == cur_iso else None
            cur_iso = next_iso
            cur_exp_s = max(parsed_choices[0][0], min(hard_max_exposure_s, desired_exp))

        if best_entry is None and history:
            valid_entries = [
                h for h in history if 35 <= round(h["adu_pct"]) <= 55 and h["max_channel_p99_adu"] < 242.0
            ]
            if valid_entries:
                converged = True
                best_entry = min(valid_entries, key=lambda h: abs(h["adu_pct"] - target_pct))
            else:
                unclipped = [h for h in history if h["max_channel_p99_adu"] < 242.0]
                pool = unclipped if unclipped else history
                best_entry = min(pool, key=lambda h: abs(h["adu_pct"] - target_pct))

        assert best_entry is not None
        flicker_warning = bool(converged and best_entry["exposure_s"] < flicker_safe_floor_s)
        adu_pct_int = int(round(best_entry["adu_pct"]))

        if converged and flicker_warning:
            message = (
                f"Auto-Flat solved {best_entry['shutter_label']} @ ISO {best_entry['iso']} ({adu_pct_int}% ADU), "
                "but shutter is faster than 1/250s — dim your screen/panel or add a white T-shirt layer to avoid PWM LED banding."
            )
        elif converged:
            message = (
                f"Auto-Flat calibrated: {best_entry['shutter_label']} @ ISO {best_entry['iso']} "
                f"({adu_pct_int}% ADU in {len(history)} shot{'s' if len(history) != 1 else ''}, zero clipping)."
            )
        elif too_bright:
            message = (
                f"Light source is too bright even at {best_entry['shutter_label']} @ ISO {best_entry['iso']} "
                f"({adu_pct_int}% ADU)! Dim your screen/panel or add folded white T-shirt / paper layers."
            )
        elif too_dim:
            message = (
                f"Light source is too dim even at {best_entry['shutter_label']} @ ISO {best_entry['iso']} "
                f"({adu_pct_int}% ADU)! Check that the lens cap is OFF and brighten your flat panel."
            )
        else:
            message = (
                f"Closest Flat setting after {len(history)} probes: {best_entry['shutter_label']} @ ISO {best_entry['iso']} "
                f"({adu_pct_int}% ADU)."
            )

        return {
            "converged": converged,
            "exposure_s": best_entry["exposure_s"],
            "shutter_label": best_entry["shutter_label"],
            "iso": best_entry["iso"],
            "median_adu": best_entry["median_adu"],
            "adu_pct": adu_pct_int,
            "max_channel_p99_adu": best_entry["max_channel_p99_adu"],
            "iterations": len(history),
            "flicker_warning": flicker_warning,
            "too_bright": too_bright,
            "too_dim": too_dim,
            "message": message,
            "history": history,
            "preview": STATE.latest_preview,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auto-Flat error: {exc}")
    finally:
        if has_sim_override:
            SIM_RIG.flat_panel_ev_flux = prev_sim_flux
        await CAMERA.ensure_raw_format()


@router.post("/auto-light")
async def auto_expose_light(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    """Automatically solve optimal Light sub-exposure & ISO from plate-solved sky & SA2i tracking.

    Captures a fast 4s @ ISO 1600 sky probe, plate-solves via ASTAP to determine exact live
    Declination (or falls back gracefully to selected target Declination), reads Step 1 Polar
    Alignment error, measures unstretched sky background rate + bright-star saturation headroom,
    and returns optimal (exposure_s, iso) + full tracking/SNR telemetry before restoring RAW (.CR3).
    """
    if STATE.camera.exposing or (
        STATE.active_mode == "SEQUENCE" and STATE.sequence_state.get("status") == "RUNNING"
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot run Auto-Light solver while an exposure or imaging sequence is actively running.",
        )

    body = payload or {}
    probe_exp_s = max(0.5, min(15.0, float(body.get("probe_exposure_s", 4.0))))
    probe_iso = str(body.get("probe_iso", "1600")).strip()

    await stop_live_loop_quietly()
    try:
        from .routes_framing import stop_focus_loop
        from .routes_pa import stop_pa_live_loop

        if STATE.pa_state.get("loop_running"):
            await stop_pa_live_loop({"restore_raw": False})
        if STATE.focus_state.get("loop_running"):
            await stop_focus_loop()
    except Exception:
        pass

    prev_sky_flux = SIM_RIG.sky_flux_e_per_s
    prev_star_scale = SIM_RIG.star_flux_scale
    prev_dec = SIM_RIG.pointing_dec_deg
    is_sim = STATE.camera.driver_mode == "simulator"

    if is_sim:
        if "sim_sky_e_per_s" in body and body["sim_sky_e_per_s"] is not None:
            SIM_RIG.sky_flux_e_per_s = float(body["sim_sky_e_per_s"])
        if "sim_star_scale" in body and body["sim_star_scale"] is not None:
            SIM_RIG.star_flux_scale = float(body["sim_star_scale"])
        if "sim_dec_deg" in body and body["sim_dec_deg"] is not None:
            SIM_RIG.pointing_dec_deg = float(body["sim_dec_deg"])

    probe_file = CONFIG.shm_dir / "auto_light_probe.jpg"

    try:
        await CAMERA.capture_frame(
            output_path=probe_file,
            exposure_s=probe_exp_s,
            iso=probe_iso,
            fast_jpeg=True,
            frame_type="Light",
            mode="FRAME",
            max_retries=1,
        )
        preview, star_metrics = await process_and_publish_preview(
            source_path=probe_file,
            max_dim=1400,
            enable_stretch=STATE.auto_stretch_enabled,
            compute_hfr=True,
            jpeg_quality=85,
            source_label="Auto-Light Probe (S1)",
            max_overlay_stars=20,
            meta={"exposure_s": probe_exp_s, "iso": probe_iso, "frame_type": "Light"},
            broadcast=True,
        )
        hist = preview.get("histogram") or {}

        # If extreme skyglow/twilight compressed the 4s ISO 1600 probe (>175 ADU), bracket down with 1s @ ISO 400
        if float(hist.get("median_adu", 0.0)) > 175.0:
            probe_exp_s = 1.0
            probe_iso = "400"
            await CAMERA.capture_frame(
                output_path=probe_file,
                exposure_s=probe_exp_s,
                iso=probe_iso,
                fast_jpeg=True,
                frame_type="Light",
                mode="FRAME",
                max_retries=1,
            )
            preview, star_metrics = await process_and_publish_preview(
                source_path=probe_file,
                max_dim=1400,
                enable_stretch=STATE.auto_stretch_enabled,
                compute_hfr=True,
                jpeg_quality=85,
                source_label="Auto-Light Probe (S1)",
                max_overlay_stars=20,
                meta={"exposure_s": probe_exp_s, "iso": probe_iso, "frame_type": "Light"},
                broadcast=True,
            )
            hist = preview.get("histogram") or {}

        # Attempt ASTAP plate-solve on the probe shot for live sky Declination; fall back gracefully
        solve = await ASTAP.solve_image(probe_file, force_blind=False)
        if solve.solved:
            dec_deg = float(solve.dec_deg)
            declination_source = "plate_solved"
        else:
            dec_deg = float(STATE.framing_state.get("target_dec_deg") or 44.33)
            declination_source = "selected_target"

        pa_pts = len(STATE.pa_state.get("points") or [])
        pa_needed = int(STATE.pa_state.get("mode_points") or 3)
        pa_calibrated = bool(pa_pts >= pa_needed or STATE.pa_state.get("phase") == "LIVE_ADJUST")
        if is_sim and "sim_pa_error_arcmin" in body and body["sim_pa_error_arcmin"] is not None:
            pa_err_arcmin = max(0.2, float(body["sim_pa_error_arcmin"]))
            pa_calibrated = True
        elif pa_calibrated:
            pa_err_arcmin = max(0.2, float(STATE.pa_state.get("total_error_arcmin") or 1.5))
        else:
            pa_err_arcmin = 4.0

        solution = solve_optimal_light_exposure(
            hist=hist,
            star_metrics=star_metrics,
            probe_exposure_s=probe_exp_s,
            probe_iso=probe_iso,
            dec_deg=dec_deg,
            declination_source=declination_source,
            pa_error_arcmin=pa_err_arcmin,
            pa_calibrated=pa_calibrated,
        )
        solution["plate_solved"] = bool(solve.solved)
        solution["solved_ra_hours"] = round(float(solve.ra_hours), 4) if solve.solved else None
        solution["preview"] = STATE.latest_preview
        return solution
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auto-Light solver error: {exc}")
    finally:
        if is_sim:
            SIM_RIG.sky_flux_e_per_s = prev_sky_flux
            SIM_RIG.star_flux_scale = prev_star_scale
            SIM_RIG.pointing_dec_deg = prev_dec
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
