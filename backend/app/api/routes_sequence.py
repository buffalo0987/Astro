"""Sequencing CRUD, execution control, and Calibration Interlock confirmation routes."""

from __future__ import annotations

from typing import Any, Dict

from ..sequencer.engine import SEQUENCER
from ..state import STATE
from ..web_compat import APIRouter, HTTPException

router = APIRouter(prefix="/api/sequence", tags=["sequence"])


@router.get("/plans")
async def list_sequence_plans() -> Dict[str, Any]:
    plans = SEQUENCER.list_plans()
    if not plans:
        # Seed a default 180mm deep-sky plan so the user has an immediate template
        default_plan = SEQUENCER.create_or_update_plan(
            name="NGC 7000 Wide-Field Session (180mm f/4.5)",
            target_name="NGC 7000 North America Nebula",
            target_ra_hours=20.988,
            target_dec_deg=44.33,
            keep_on_camera_sd=False,
            steps=[
                {"frame_type": "Light", "exposure_s": 90.0, "iso": "800", "total_count": 20, "cooldown_s": 2.0},
                {"frame_type": "Dark", "exposure_s": 90.0, "iso": "800", "total_count": 10, "cooldown_s": 1.0},
                {"frame_type": "Bias", "exposure_s": 0.001, "iso": "800", "total_count": 20, "cooldown_s": 0.5},
                {"frame_type": "Flat", "exposure_s": 0.5, "iso": "100", "total_count": 15, "cooldown_s": 1.0},
            ],
            plan_id="plan_default_ngc7000",
        )
        plans = [default_plan]
    return {"plans": plans, "active_state": STATE.sequence_state}


@router.post("/plans")
async def save_sequence_plan(payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    name = str(body.get("name", "Imaging Plan"))
    target_name = str(body.get("target_name", STATE.framing_state.get("target_name", "Target")))
    steps = body.get("steps") or [
        {"frame_type": "Light", "exposure_s": 60.0, "iso": "800", "total_count": 10, "cooldown_s": 2.0}
    ]
    plan = SEQUENCER.create_or_update_plan(
        name=name,
        target_name=target_name,
        steps=steps,
        target_ra_hours=body.get("target_ra_hours"),
        target_dec_deg=body.get("target_dec_deg"),
        keep_on_camera_sd=bool(body.get("keep_on_camera_sd", False)),
        plan_id=body.get("id"),
    )
    return plan


@router.delete("/plans/{plan_id}")
async def delete_sequence_plan(plan_id: str) -> Dict[str, Any]:
    try:
        SEQUENCER.delete_plan(plan_id)
        return {"deleted": plan_id}
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/plans/{plan_id}/start")
async def start_sequence_plan(plan_id: str, payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    reset_progress = bool(body.get("reset_progress", False))
    try:
        plan = await SEQUENCER.start_plan(plan_id, reset_progress=reset_progress)
        return {"started": True, "plan": plan, "sequence": STATE.sequence_state}
    except (RuntimeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pause")
async def pause_sequence() -> Dict[str, Any]:
    return await SEQUENCER.pause_active()


@router.post("/resume")
async def resume_sequence() -> Dict[str, Any]:
    return await SEQUENCER.resume_active()


@router.post("/confirm-interlock")
async def confirm_sequence_interlock() -> Dict[str, Any]:
    return await SEQUENCER.confirm_interlock()


@router.post("/abort")
async def abort_sequence() -> Dict[str, Any]:
    return await SEQUENCER.abort_active()
