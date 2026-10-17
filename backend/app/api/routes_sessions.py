"""Session Review, Sub-Frame Culling, and Zero-RAM Streaming ZIP Offload routes."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from ..db import DB
from ..imaging.zip_streamer import stream_zip_stored_async
from ..sequencer.storage import STORAGE
from ..web_compat import APIRouter, FileResponse, HTTPException, StreamingResponse

router = APIRouter(prefix="/api/sessions", tags=["sessions_offload"])


@router.get("")
async def list_sessions() -> Dict[str, Any]:
    sessions = STORAGE.list_sessions_with_stats()
    return {
        "sessions": sessions,
        "storage": STORAGE.storage_overview(),
    }


@router.post("/{session_id}/frames/{frame_id}/cull")
async def cull_or_restore_frame(
    session_id: str,
    frame_id: str,
    payload: Dict[str, Any] = None,
) -> Dict[str, Any]:
    body = payload or {}
    status = str(body.get("status", "rejected"))
    reason = str(body.get("reject_reason", "Manual user cull"))
    try:
        updated = STORAGE.set_frame_cull_status(frame_id, status=status, reject_reason=reason)
        return {"frame": updated}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{session_id}/auto-cull")
async def auto_cull_session(session_id: str, payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    sigma = float(body.get("hfr_sigma_limit", 2.0))
    res = STORAGE.auto_cull_session_outliers(session_id, hfr_sigma_Limit=sigma)
    return res


@router.get("/{session_id}/frames/{frame_id}/thumbnail.jpg")
async def get_frame_thumbnail(session_id: str, frame_id: str) -> FileResponse:
    with DB.connection() as conn:
        f_row = conn.execute(
            "SELECT * FROM captured_frames WHERE id = ? AND session_id = ?",
            (frame_id, session_id),
        ).fetchone()
        if not f_row:
            raise HTTPException(status_code=404, detail="Frame not found")
        s_row = conn.execute(
            "SELECT directory_path FROM capture_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        session_dir = Path(s_row["directory_path"])

    thumb_rel = f_row["thumbnail_path"]
    if thumb_rel:
        thumb_path = session_dir / thumb_rel
        if thumb_path.is_file():
            return FileResponse(thumb_path, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.get("/{session_id}/frames/{frame_id}/download")
async def download_single_cr3_frame(session_id: str, frame_id: str) -> FileResponse:
    with DB.connection() as conn:
        f_row = conn.execute(
            "SELECT * FROM captured_frames WHERE id = ? AND session_id = ?",
            (frame_id, session_id),
        ).fetchone()
        if not f_row:
            raise HTTPException(status_code=404, detail="Frame not found")
        s_row = conn.execute(
            "SELECT directory_path FROM capture_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        session_dir = Path(s_row["directory_path"])

    raw_path = session_dir / f_row["relative_path"]
    if not raw_path.is_file():
        raise HTTPException(status_code=404, detail="RAW .CR3 file not found on disk")
    return FileResponse(
        raw_path,
        media_type="application/octet-stream",
        filename=f_row["filename"],
    )


@router.get("/{session_id}/download.zip")
async def download_session_streaming_zip(
    session_id: str,
    exclude_rejected: bool = True,
) -> StreamingResponse:
    """Stream an entire session folder as an uncompressed ZIP_STORED archive using <6MB RAM."""
    try:
        zip_name, entries = STORAGE.collect_session_zip_entries(
            session_id=session_id,
            exclude_rejected=exclude_rejected,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(
        stream_zip_stored_async(entries),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_name}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/{session_id}/mark-offloaded")
async def mark_session_offloaded(session_id: str, payload: Dict[str, Any] = None) -> Dict[str, Any]:
    body = payload or {}
    offloaded = bool(body.get("offloaded", True))
    try:
        return STORAGE.mark_session_offloaded(session_id, offloaded=offloaded)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{session_id}/purge-rejected")
async def purge_rejected_session_frames(session_id: str) -> Dict[str, Any]:
    try:
        return STORAGE.purge_rejected_frames(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{session_id}")
async def delete_capture_session(session_id: str) -> Dict[str, Any]:
    try:
        return STORAGE.delete_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
