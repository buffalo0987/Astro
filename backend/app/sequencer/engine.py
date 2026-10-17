"""Resilient Headless Sequencing Engine with SQLite Persistence & Calibration Interlocks."""

from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from ..config import CONFIG
from ..db import DB
from ..hardware.camera_actor import CAMERA
from ..imaging.cr3_parser import decode_cr3_preview_array
from ..imaging.focus_metrics import compute_star_hfr_metrics
from ..imaging.stretch import auto_stretch_rgb, compute_histogram_256
from ..state import STATE
from .storage import STORAGE


INTERLOCK_MESSAGES = {
    "Dark": "Place the lens cap securely on the TPO UltraWide 180 lens for Dark frames, then tap Confirm to continue.",
    "Bias": "Verify the lens cap is on the TPO UltraWide 180 lens for fast Bias frames, then tap Confirm.",
    "Flat": "Remove the lens cap and place your illuminated Flat panel / diffuser over the TPO 180 lens, then tap Confirm.",
    "Light": "Ensure the lens cap is removed from the TPO UltraWide 180 lens and tracking is ON for Light frames, then tap Confirm.",
}


class SequenceEngine:
    """Executes multi-step .CR3 RAW imaging plans headlessly with crash/disconnect resilience."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task[None]] = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self._interlock_event = asyncio.Event()
        self._abort_requested = False

    def list_plans(self) -> List[Dict[str, Any]]:
        with DB.connection() as conn:
            plans = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM sequence_plans ORDER BY updated_at DESC"
                ).fetchall()
            ]
            for p in plans:
                steps = [
                    dict(s)
                    for s in conn.execute(
                        "SELECT * FROM sequence_steps WHERE plan_id = ? ORDER BY step_order ASC",
                        (p["id"],),
                    ).fetchall()
                ]
                p["steps"] = steps
                p["total_frames"] = sum(int(s["total_count"]) for s in steps)
                p["completed_frames"] = sum(int(s["completed_count"]) for s in steps)
        return plans

    def get_plan(self, plan_id: str) -> Dict[str, Any]:
        with DB.connection() as conn:
            row = conn.execute("SELECT * FROM sequence_plans WHERE id = ?", (plan_id,)).fetchone()
            if not row:
                raise KeyError(f"Sequence plan not found: {plan_id}")
            plan = dict(row)
            steps = [
                dict(s)
                for s in conn.execute(
                    "SELECT * FROM sequence_steps WHERE plan_id = ? ORDER BY step_order ASC",
                    (plan_id,),
                ).fetchall()
            ]
            plan["steps"] = steps
            plan["total_frames"] = sum(int(s["total_count"]) for s in steps)
            plan["completed_frames"] = sum(int(s["completed_count"]) for s in steps)
            return plan

    def create_or_update_plan(
        self,
        name: str,
        target_name: str,
        steps: List[Dict[str, Any]],
        target_ra_hours: Optional[float] = None,
        target_dec_deg: Optional[float] = None,
        keep_on_camera_sd: bool = False,
        plan_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pid = plan_id or f"plan_{uuid.uuid4().hex[:8]}"
        now = time.time()
        with DB.connection() as conn:
            conn.execute(
                """
                INSERT INTO sequence_plans (
                    id, name, target_name, target_ra_hours, target_dec_deg,
                    status, active_step_index, keep_on_camera_sd, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'IDLE', 0, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    target_name = excluded.target_name,
                    target_ra_hours = excluded.target_ra_hours,
                    target_dec_deg = excluded.target_dec_deg,
                    keep_on_camera_sd = excluded.keep_on_camera_sd,
                    updated_at = excluded.updated_at
                """,
                (
                    pid,
                    name,
                    target_name,
                    target_ra_hours,
                    target_dec_deg,
                    1 if keep_on_camera_sd else 0,
                    now,
                    now,
                ),
            )
            conn.execute("DELETE FROM sequence_steps WHERE plan_id = ?", (pid,))
            for idx, st in enumerate(steps):
                conn.execute(
                    """
                    INSERT INTO sequence_steps (
                        plan_id, step_order, frame_type, exposure_s, iso,
                        total_count, completed_count, cooldown_s
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pid,
                        idx,
                        st.get("frame_type", "Light"),
                        float(st.get("exposure_s", 60.0)),
                        str(st.get("iso", "800")),
                        int(st.get("total_count", 10)),
                        int(st.get("completed_count", 0)),
                        float(st.get("cooldown_s", 2.0)),
                    ),
                )
        return self.get_plan(pid)

    def delete_plan(self, plan_id: str) -> None:
        if STATE.sequence_state.get("active_plan_id") == plan_id and STATE.sequence_state.get("status") == "RUNNING":
            raise RuntimeError("Cannot delete a currently running sequence plan")
        with DB.connection() as conn:
            conn.execute("DELETE FROM sequence_plans WHERE id = ?", (plan_id,))

    async def start_plan(self, plan_id: str, reset_progress: bool = False) -> Dict[str, Any]:
        if self._task is not None and not self._task.done():
            raise RuntimeError("Another sequence is already running")

        plan = self.get_plan(plan_id)
        remaining_frames = sum(max(0, int(s["total_count"]) - (0 if reset_progress else int(s["completed_count"]))) for s in plan["steps"])
        space_check = STORAGE.preflight_space_check(remaining_frames)
        if not space_check["ok"]:
            raise RuntimeError(space_check["message"])

        session = STORAGE.ensure_session_directory(plan["target_name"])

        with DB.connection() as conn:
            if reset_progress:
                conn.execute("UPDATE sequence_steps SET completed_count = 0 WHERE plan_id = ?", (plan_id,))
                conn.execute("UPDATE sequence_plans SET active_step_index = 0 WHERE id = ?", (plan_id,))
                conn.execute("DELETE FROM captured_frames WHERE plan_id = ?", (plan_id,))
            conn.execute(
                """
                UPDATE sequence_plans
                SET status = 'RUNNING', session_id = ?, pending_interlock_type = NULL, pending_interlock_message = NULL, updated_at = ?
                WHERE id = ?
                """,
                (session["id"], time.time(), plan_id),
            )

        # Guarantee camera is restored to RAW (.CR3) before starting sequence
        await CAMERA.ensure_raw_format()

        self._abort_requested = False
        self._pause_event.set()
        self._interlock_event.clear()
        STATE.active_mode = "SEQUENCE"

        self._task = asyncio.create_task(self._run_sequence_loop(plan_id, session["id"]))
        return self.get_plan(plan_id)

    async def pause_active(self) -> Dict[str, Any]:
        pid = STATE.sequence_state.get("active_plan_id")
        if not pid:
            return STATE.sequence_state
        self._pause_event.clear()
        with DB.connection() as conn:
            conn.execute("UPDATE sequence_plans SET status = 'PAUSED', updated_at = ? WHERE id = ?", (time.time(), pid))
        STATE.sequence_state["status"] = "PAUSED"
        await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        return STATE.sequence_state

    async def resume_active(self) -> Dict[str, Any]:
        pid = STATE.sequence_state.get("active_plan_id")
        if not pid:
            return STATE.sequence_state
        with DB.connection() as conn:
            conn.execute("UPDATE sequence_plans SET status = 'RUNNING', updated_at = ? WHERE id = ?", (time.time(), pid))
        STATE.sequence_state["status"] = "RUNNING"
        self._pause_event.set()
        await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        return STATE.sequence_state

    async def confirm_interlock(self) -> Dict[str, Any]:
        pid = STATE.sequence_state.get("active_plan_id")
        if pid:
            with DB.connection() as conn:
                conn.execute(
                    """
                    UPDATE sequence_plans
                    SET status = 'RUNNING', pending_interlock_type = NULL, pending_interlock_message = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (time.time(), pid),
                )
        STATE.sequence_state["status"] = "RUNNING"
        STATE.sequence_state["interlock_required"] = False
        STATE.sequence_state["interlock_type"] = None
        STATE.sequence_state["interlock_message"] = None
        self._interlock_event.set()
        await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        return STATE.sequence_state

    async def abort_active(self) -> Dict[str, Any]:
        self._abort_requested = True
        self._pause_event.set()
        self._interlock_event.set()
        await CAMERA.abort_active_exposure()
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        pid = STATE.sequence_state.get("active_plan_id")
        if pid:
            with DB.connection() as conn:
                conn.execute(
                    "UPDATE sequence_plans SET status = 'ABORTED', updated_at = ? WHERE id = ?",
                    (time.time(), pid),
                )
        STATE.active_mode = "IDLE"
        STATE.sequence_state["status"] = "ABORTED"
        STATE.sequence_state["interlock_required"] = False
        await CAMERA.ensure_raw_format()
        await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        return STATE.sequence_state

    async def _run_sequence_loop(self, plan_id: str, session_id: str) -> None:
        try:
            plan = self.get_plan(plan_id)
            steps = plan["steps"]
            prev_frame_type: Optional[str] = None

            with DB.connection() as conn:
                s_row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
                target_slug = s_row["target_slug"]
                session_dir = Path(s_row["directory_path"])

            for step_idx, step in enumerate(steps):
                if self._abort_requested:
                    break

                frame_type = step["frame_type"]
                total_count = int(step["total_count"])
                completed_count = int(step["completed_count"])

                # Trigger Calibration Interlock when changing frame type (e.g. Light -> Dark / Flat)
                if prev_frame_type is not None and frame_type != prev_frame_type and completed_count < total_count:
                    msg = INTERLOCK_MESSAGES.get(
                        frame_type,
                        f"Prepare telescope/lens for {frame_type} frames, then tap Confirm.",
                    )
                    self._interlock_event.clear()
                    with DB.connection() as conn:
                        conn.execute(
                            """
                            UPDATE sequence_plans
                            SET status = 'AWAITING_INTERLOCK', pending_interlock_type = ?, pending_interlock_message = ?, updated_at = ?
                            WHERE id = ?
                            """,
                            (frame_type, msg, time.time(), plan_id),
                        )
                    STATE.sequence_state.update(
                        {
                            "status": "AWAITING_INTERLOCK",
                            "interlock_required": True,
                            "interlock_type": frame_type,
                            "interlock_message": msg,
                        }
                    )
                    await STATE.broadcast("INTERLOCK_PROMPT", STATE.sequence_state)
                    await self._interlock_event.wait()
                    if self._abort_requested:
                        break

                prev_frame_type = frame_type

                for seq_num in range(completed_count + 1, total_count + 1):
                    await self._pause_event.wait()
                    if self._abort_requested:
                        break

                    # Refresh overall counts
                    fresh_plan = self.get_plan(plan_id)
                    STATE.sequence_state.update(
                        {
                            "active_plan_id": plan_id,
                            "status": "RUNNING",
                            "target_name": fresh_plan["target_name"],
                            "active_step_index": step_idx,
                            "current_frame_type": frame_type,
                            "current_frame_num": seq_num,
                            "total_step_frames": total_count,
                            "overall_completed": fresh_plan["completed_frames"],
                            "overall_total": fresh_plan["total_frames"],
                            "interlock_required": False,
                        }
                    )
                    await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)

                    abs_path, rel_path, filename = STORAGE.build_frame_path(
                        session_id=session_id,
                        target_slug=target_slug,
                        frame_type=frame_type,
                        exposure_s=float(step["exposure_s"]),
                        iso=str(step["iso"]),
                        sequence_num=seq_num,
                    )

                    await CAMERA.capture_frame(
                        output_path=abs_path,
                        exposure_s=float(step["exposure_s"]),
                        iso=str(step["iso"]),
                        fast_jpeg=False,  # Always RAW (.CR3) for sequences!
                        frame_type=frame_type,
                        mode="SEQUENCE",
                        keep_on_camera_sd=bool(plan.get("keep_on_camera_sd", 0)),
                    )

                    # Extract Tier-1 embedded JPEG preview, MTF stretch, histogram, and star HFR
                    arr_rgb, _ = decode_cr3_preview_array(abs_path, max_dim=1200)
                    stretched = auto_stretch_rgb(arr_rgb, enable_stretch=True)
                    hist = compute_histogram_256(stretched)
                    metrics = compute_star_hfr_metrics(arr_rgb) if frame_type.lower() == "light" else {
                        "star_count": 0,
                        "hfr_median": 0.0,
                        "fwhm_arcsec": 0.0,
                        "bg_median_adu": hist["median_adu"],
                        "stars": [],
                    }

                    # Save stretched preview to /dev/shm for live HUD & thumbnail in session previews/
                    live_preview_file = CONFIG.shm_dir / "latest_preview.jpg"
                    Image.fromarray(stretched).save(live_preview_file, format="JPEG", quality=85)

                    thumb_rel = f"previews/{Path(filename).stem}_thumb.jpg"
                    thumb_abs = session_dir / thumb_rel
                    thumb_img = Image.fromarray(stretched)
                    thumb_img.thumbnail((480, 320))
                    thumb_img.save(thumb_abs, format="JPEG", quality=80)

                    fsize = abs_path.stat().st_size if abs_path.exists() else 0
                    STORAGE.register_captured_frame(
                        session_id=session_id,
                        plan_id=plan_id,
                        filename=filename,
                        relative_path=rel_path,
                        frame_type=frame_type,
                        exposure_s=float(step["exposure_s"]),
                        iso=str(step["iso"]),
                        sequence_num=seq_num,
                        file_size_bytes=fsize,
                        hfr_median=float(metrics["hfr_median"]),
                        fwhm_arcsec=float(metrics["fwhm_arcsec"]),
                        star_count=int(metrics["star_count"]),
                        bg_median_adu=float(metrics["bg_median_adu"]),
                        thumbnail_path=thumb_rel,
                    )

                    with DB.connection() as conn:
                        conn.execute(
                            "UPDATE sequence_steps SET completed_count = ? WHERE id = ?",
                            (seq_num, step["id"]),
                        )
                        conn.execute(
                            "UPDATE sequence_plans SET active_step_index = ?, updated_at = ? WHERE id = ?",
                            (step_idx, time.time(), plan_id),
                        )

                    ts_ms = int(time.time() * 1000)
                    STATE.latest_preview.update(
                        {
                            "image_url": f"/api/camera/preview.jpg?t={ts_ms}",
                            "timestamp": time.time(),
                            "width": int(stretched.shape[1]),
                            "height": int(stretched.shape[0]),
                            "source_format": "RAW (.CR3)",
                            "auto_stretched": True,
                            "histogram": hist,
                            "stars_overlay": metrics["stars"][:15],
                            "meta": {
                                "filename": filename,
                                "frame_type": frame_type,
                                "exposure_s": step["exposure_s"],
                                "iso": step["iso"],
                                "hfr_median": metrics["hfr_median"],
                                "fwhm_arcsec": metrics["fwhm_arcsec"],
                                "star_count": metrics["star_count"],
                            },
                        }
                    )

                    updated_plan = self.get_plan(plan_id)
                    STATE.sequence_state.update(
                        {
                            "overall_completed": updated_plan["completed_frames"],
                            "overall_total": updated_plan["total_frames"],
                            "last_saved_file": filename,
                            "last_frame_hfr": metrics["hfr_median"],
                        }
                    )
                    await STATE.broadcast("FRAME_SAVED", STATE.snapshot())

                    cooldown = float(step.get("cooldown_s", 1.0))
                    if seq_num < total_count and cooldown > 0 and not self._abort_requested:
                        await asyncio.sleep(min(cooldown, 0.25) if STATE.camera.driver_mode == "simulator" else cooldown)

            if not self._abort_requested:
                with DB.connection() as conn:
                    conn.execute(
                        "UPDATE sequence_plans SET status = 'COMPLETED', updated_at = ? WHERE id = ?",
                        (time.time(), plan_id),
                    )
                STATE.sequence_state["status"] = "COMPLETED"
                STATE.active_mode = "IDLE"
                await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            STATE.camera.last_error = f"Sequence error: {exc}"
            STATE.sequence_state["status"] = "PAUSED"
            await STATE.broadcast("SEQUENCE_PROGRESS", STATE.sequence_state)
        finally:
            await CAMERA.ensure_raw_format()


SEQUENCER = SequenceEngine()
