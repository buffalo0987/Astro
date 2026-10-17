"""Siril/WBPP Storage Manager, Sub-Frame Culling, Manifest Writer, and Safe USB Eject."""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ..config import CONFIG
from ..db import DB
from ..state import STATE


FRAME_TYPE_SUBFOLDER = {
    "light": "lights",
    "dark": "darks",
    "bias": "biases",
    "flat": "flats",
}


def sanitize_slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_-]+", "_", name.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "Target"


class StorageManager:
    """Manages Siril/WBPP directory layouts, sub-frame culling, and USB 3.0 drives."""

    def get_active_storage_root(self) -> Path:
        root = Path(STATE.system.active_storage_path or str(CONFIG.captures_dir))
        root.mkdir(parents=True, exist_ok=True)
        return root

    def set_active_storage_root(self, new_path: str) -> Dict[str, Any]:
        if STATE.active_mode == "SEQUENCE" and STATE.sequence_state.get("status") == "RUNNING":
            raise RuntimeError("Cannot change active storage root while a sequence is running")
        target = Path(new_path).resolve()
        target.mkdir(parents=True, exist_ok=True)
        STATE.system.active_storage_path = str(target)
        DB.set_setting("active_storage_path", str(target))
        STATE.refresh_system_telemetry()
        return self.storage_overview()

    def discover_storage_volumes(self) -> List[Dict[str, Any]]:
        """Discover local capture storage and any mounted external USB drives."""
        volumes: List[Dict[str, Any]] = []
        default_dir = CONFIG.captures_dir
        default_dir.mkdir(parents=True, exist_ok=True)
        u_def = shutil.disk_usage(default_dir)
        volumes.append(
            {
                "id": "local_pi",
                "label": "Raspberry Pi Local Storage",
                "path": str(default_dir),
                "is_usb": False,
                "free_gb": round(u_def.free / (1024**3), 2),
                "total_gb": round(u_def.total / (1024**3), 2),
                "active": str(self.get_active_storage_root()) == str(default_dir),
            }
        )

        # Scan standard Linux USB auto-mount roots
        usb_roots = ["/media", "/run/media", "/mnt"]
        seen_paths = {str(default_dir.resolve())}
        STATE.system.usb_drive_mounted = False
        STATE.system.usb_drive_label = ""
        STATE.system.usb_drive_path = ""

        for root_str in usb_roots:
            root = Path(root_str)
            if not root.is_dir():
                continue
            for candidate in root.glob("*"):
                if candidate.is_dir():
                    # Check 1 level deeper (e.g., /media/pi/ASTRO_USB)
                    sub_dirs = [candidate] + [d for d in candidate.glob("*") if d.is_dir()]
                    for d in sub_dirs:
                        try:
                            if os.path.ismount(d):
                                cap_path = d / "AstroPi_Captures"
                                resolved = str(d.resolve())
                                if resolved in seen_paths:
                                    continue
                                seen_paths.add(resolved)
                                usage = shutil.disk_usage(d)
                                is_act = str(self.get_active_storage_root()).startswith(resolved)
                                volumes.append(
                                    {
                                        "id": f"usb_{d.name}",
                                        "label": f"USB 3.0 Drive ({d.name})",
                                        "path": str(cap_path),
                                        "mount_point": str(d),
                                        "is_usb": True,
                                        "free_gb": round(usage.free / (1024**3), 2),
                                        "total_gb": round(usage.total / (1024**3), 2),
                                        "active": is_act,
                                    }
                                )
                                STATE.system.usb_drive_mounted = True
                                STATE.system.usb_drive_label = d.name
                                STATE.system.usb_drive_path = str(d)
                        except Exception:
                            continue

        return volumes

    def storage_overview(self) -> Dict[str, Any]:
        vols = self.discover_storage_volumes()
        STATE.refresh_system_telemetry()
        return {
            "active_storage_path": str(self.get_active_storage_root()),
            "disk_free_gb": STATE.system.disk_free_gb,
            "disk_total_gb": STATE.system.disk_total_gb,
            "usb_drive_mounted": STATE.system.usb_drive_mounted,
            "usb_drive_label": STATE.system.usb_drive_label,
            "smb_windows_path": STATE.system.smb_share_url,
            "smb_macos_path": STATE.system.smb_mac_url,
            "volumes": vols,
        }

    def preflight_space_check(self, total_frames: int, est_frame_mb: float = 30.0) -> Dict[str, Any]:
        root = self.get_active_storage_root()
        usage = shutil.disk_usage(root)
        required_bytes = int(total_frames * est_frame_mb * 1024 * 1024)
        free_bytes = usage.free
        ok = free_bytes >= required_bytes
        return {
            "ok": ok,
            "required_mb": round(required_bytes / (1024 * 1024), 1),
            "free_mb": round(free_bytes / (1024 * 1024), 1),
            "free_gb": round(free_bytes / (1024**3), 2),
            "message": (
                "Sufficient disk space available."
                if ok
                else f"Insufficient disk space: requires {required_bytes / (1024**2):.0f} MB, only {free_bytes / (1024**2):.0f} MB free."
            ),
        }

    def ensure_session_directory(self, target_name: str, session_date: Optional[str] = None) -> Dict[str, Any]:
        """Create or retrieve a Siril/WBPP-compatible session directory and DB record."""
        date_str = session_date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
        slug = sanitize_slug(target_name)
        session_id = f"{slug}_{date_str}"
        session_dir = self.get_active_storage_root() / session_id

        for sub in ("lights", "darks", "biases", "flats", "rejected", "previews"):
            (session_dir / sub).mkdir(parents=True, exist_ok=True)

        now = time.time()
        with DB.connection() as conn:
            conn.execute(
                """
                INSERT INTO capture_sessions (
                    id, target_name, target_slug, session_date, directory_path, offloaded, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    directory_path = excluded.directory_path,
                    updated_at = excluded.updated_at
                """,
                (session_id, target_name, slug, date_str, str(session_dir), now, now),
            )
            row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            return dict(row)

    def build_frame_path(
        self,
        session_id: str,
        target_slug: str,
        frame_type: str,
        exposure_s: float,
        iso: str,
        sequence_num: int,
    ) -> Tuple[Path, str, str]:
        """Return (absolute_path, relative_path_in_session, filename) for a new .CR3 frame."""
        with DB.connection() as conn:
            s_row = conn.execute("SELECT directory_path FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not s_row:
                raise KeyError(f"Session not found: {session_id}")
            session_dir = Path(s_row["directory_path"])

        subfolder = FRAME_TYPE_SUBFOLDER.get(frame_type.lower(), "lights")
        exp_str = f"{int(exposure_s)}s" if float(exposure_s).is_integer() else f"{exposure_s:g}s"
        filename = f"{target_slug}_{frame_type.capitalize()}_{exp_str}_ISO{iso}_{sequence_num:04d}.CR3"
        rel_path = f"{subfolder}/{filename}"
        abs_path = session_dir / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        return abs_path, rel_path, filename

    def register_captured_frame(
        self,
        session_id: str,
        plan_id: Optional[str],
        filename: str,
        relative_path: str,
        frame_type: str,
        exposure_s: float,
        iso: str,
        sequence_num: int,
        file_size_bytes: int,
        hfr_median: float,
        fwhm_arcsec: float,
        star_count: int,
        bg_median_adu: float,
        solved_ra_hours: Optional[float] = None,
        solved_dec_deg: Optional[float] = None,
        thumbnail_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        frame_id = f"{session_id}_{frame_type.lower()}_{sequence_num:04d}_{int(time.time() * 1000) % 10000}"
        now = time.time()
        with DB.connection() as conn:
            conn.execute(
                """
                INSERT INTO captured_frames (
                    id, session_id, plan_id, filename, relative_path, frame_type,
                    exposure_s, iso, sequence_num, file_size_bytes,
                    hfr_median, fwhm_Arcsec, star_count, bg_median_adu,
                    solved_ra_hours, solved_dec_deg, status, thumbnail_path, captured_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
                """,
                (
                    frame_id,
                    session_id,
                    plan_id,
                    filename,
                    relative_path,
                    frame_type,
                    exposure_s,
                    iso,
                    sequence_num,
                    file_size_bytes,
                    hfr_median,
                    fwhm_arcsec,
                    star_count,
                    bg_median_adu,
                    solved_ra_hours,
                    solved_dec_deg,
                    thumbnail_path,
                    now,
                ),
            )
            conn.execute("UPDATE capture_sessions SET updated_at = ? WHERE id = ?", (now, session_id))
            row = conn.execute("SELECT * FROM captured_frames WHERE id = ?", (frame_id,)).fetchone()
            res = dict(row)

        self.write_session_manifests(session_id)
        return res

    def write_session_manifests(self, session_id: str) -> None:
        """Write session_manifest.json and session_manifest.csv inside the session folder."""
        with DB.connection() as conn:
            s_row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not s_row:
                return
            session = dict(s_row)
            frames = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM captured_frames WHERE session_id = ? ORDER BY captured_at ASC",
                    (session_id,),
                ).fetchall()
            ]

        session_dir = Path(session["directory_path"])
        if not session_dir.exists():
            return

        manifest_json = {
            "session_id": session["id"],
            "target_name": session["target_name"],
            "session_date": session["session_date"],
            "optics": {
                "camera": CONFIG.optics.camera_name,
                "lens": CONFIG.optics.lens_name,
                "focal_length_mm": CONFIG.optics.focal_length_mm,
                "pixel_scale_arcsec": round(CONFIG.optics.pixel_scale_arcsec, 2),
            },
            "total_frames": len(frames),
            "accepted_frames": sum(1 for f in frames if f["status"] == "accepted"),
            "rejected_frames": sum(1 for f in frames if f["status"] == "rejected"),
            "frames": frames,
        }
        (session_dir / "session_manifest.json").write_text(
            json.dumps(manifest_json, indent=2),
            encoding="utf-8",
        )

        csv_path = session_dir / "session_manifest.csv"
        fieldnames = [
            "filename",
            "relative_path",
            "frame_type",
            "exposure_s",
            "iso",
            "sequence_num",
            "hfr_median",
            "fwhm_Arcsec",
            "star_count",
            "bg_median_adu",
            "status",
            "reject_reason",
            "captured_at",
        ]
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for fr in frames:
                writer.writerow({k: fr.get(k, "") for k in fieldnames})

    def set_frame_cull_status(
        self,
        frame_id: str,
        status: str,
        reject_reason: str = "Manual user cull",
    ) -> Dict[str, Any]:
        """Move a .CR3 file between its Siril folder (lights/darks/...) and rejected/."""
        if status not in ("accepted", "rejected"):
            raise ValueError("status must be 'accepted' or 'rejected'")

        with DB.connection() as conn:
            row = conn.execute("SELECT * FROM captured_frames WHERE id = ?", (frame_id,)).fetchone()
            if not row:
                raise KeyError(f"Frame not found: {frame_id}")
            frame = dict(row)
            s_row = conn.execute(
                "SELECT directory_path FROM capture_sessions WHERE id = ?",
                (frame["session_id"],),
            ).fetchone()
            session_dir = Path(s_row["directory_path"])

            old_abs = session_dir / frame["relative_path"]
            if status == "rejected":
                new_rel = f"rejected/{frame['filename']}"
            else:
                subfolder = FRAME_TYPE_SUBFOLDER.get(frame["frame_type"].lower(), "lights")
                new_rel = f"{subfolder}/{frame['filename']}"

            new_abs = session_dir / new_rel
            new_abs.parent.mkdir(parents=True, exist_ok=True)
            if old_abs.exists() and old_abs != new_abs:
                shutil.move(str(old_abs), str(new_abs))

            conn.execute(
                """
                UPDATE captured_frames
                SET status = ?, relative_path = ?, reject_reason = ?
                WHERE id = ?
                """,
                (status, new_rel, reject_reason if status == "rejected" else "", frame_id),
            )
            updated = dict(conn.execute("SELECT * FROM captured_frames WHERE id = ?", (frame_id,)).fetchone())

        self.write_session_manifests(frame["session_id"])
        return updated

    def auto_cull_session_outliers(
        self,
        session_id: str,
        hfr_sigma_Limit: float = 2.0,
        min_star_fraction: float = 0.50,
    ) -> Dict[str, Any]:
        """Automatically flag and move statistical outlier Light frames (wind gusts / clouds) to rejected/."""
        with DB.connection() as conn:
            lights = [
                dict(r)
                for r in conn.execute(
                    """
                    SELECT * FROM captured_frames
                    WHERE session_id = ? AND LOWER(frame_type) = 'light'
                    """,
                    (session_id,),
                ).fetchall()
            ]

        if len(lights) < 3:
            return {"rejected_count": 0, "rejected_ids": []}

        hfrs = np.array([float(f["hfr_median"] or 0.0) for f in lights if (f["hfr_median"] or 0.0) > 0])
        stars = np.array([int(f["star_count"] or 0) for f in lights])

        med_hfr = float(np.median(hfrs)) if len(hfrs) > 0 else 99.0
        mad_hfr = float(np.median(np.abs(hfrs - med_hfr))) * 1.4826 if len(hfrs) > 0 else 0.5
        hfr_cutoff = med_hfr + max(0.35, hfr_sigma_Limit * max(0.15, mad_hfr))
        peak_stars = int(stars.max()) if len(stars) > 0 else 0
        star_cutoff = max(3, int(peak_stars * min_star_fraction))

        rejected_ids: List[str] = []
        for fr in lights:
            hfr_val = float(fr["hfr_median"] or 0.0)
            star_val = int(fr["star_count"] or 0)
            reasons: List[str] = []
            if hfr_val > hfr_cutoff:
                reasons.append(f"High HFR ({hfr_val:.2f}px > {hfr_cutoff:.2f}px)")
            if peak_stars >= 8 and star_val < star_cutoff:
                reasons.append(f"Low stars ({star_val} < {star_cutoff})")
            if reasons and fr["status"] != "rejected":
                self.set_frame_cull_status(fr["id"], "rejected", "; ".join(reasons))
                rejected_ids.append(fr["id"])

        return {"rejected_count": len(rejected_ids), "rejected_ids": rejected_ids}

    def list_sessions_with_stats(self) -> List[Dict[str, Any]]:
        with DB.connection() as conn:
            sessions = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM capture_sessions ORDER BY created_at DESC"
                ).fetchall()
            ]
            for s in sessions:
                frames = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT * FROM captured_frames WHERE session_id = ? ORDER BY sequence_num ASC, captured_at ASC",
                        (s["id"],),
                    ).fetchall()
                ]
                s["frames"] = frames
                s["total_frames"] = len(frames)
                s["accepted_frames"] = sum(1 for f in frames if f["status"] == "accepted")
                s["rejected_frames"] = sum(1 for f in frames if f["status"] == "rejected")
                s["total_size_mb"] = round(
                    sum(int(f["file_size_bytes"] or 0) for f in frames) / (1024 * 1024),
                    2,
                )
                light_hfrs = [
                    float(f["hfr_median"])
                    for f in frames
                    if f["frame_type"].lower() == "light" and f["status"] == "accepted" and f["hfr_median"]
                ]
                s["best_hfr"] = round(min(light_hfrs), 2) if light_hfrs else None
                s["median_hfr"] = round(float(np.median(light_hfrs)), 2) if light_hfrs else None
        return sessions

    def collect_session_zip_entries(
        self,
        session_id: str,
        exclude_rejected: bool = True,
    ) -> Tuple[str, List[Tuple[Path, str]]]:
        """Return (archive_filename, [(disk_path, arcname_in_zip), ...]) for streaming ZIP download."""
        with DB.connection() as conn:
            s_row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not s_row:
                raise KeyError(f"Session not found: {session_id}")
            session = dict(s_row)
            frames = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM captured_frames WHERE session_id = ? ORDER BY captured_at ASC",
                    (session_id,),
                ).fetchall()
            ]

        session_dir = Path(session["directory_path"])
        entries: List[Tuple[Path, str]] = []
        root_folder = session["id"]

        for fr in frames:
            if exclude_rejected and fr["status"] == "rejected":
                continue
            disk_path = session_dir / fr["relative_path"]
            if disk_path.is_file():
                entries.append((disk_path, f"{root_folder}/{fr['relative_path']}"))

        for manifest_name in ("session_manifest.csv", "session_manifest.json"):
            m_path = session_dir / manifest_name
            if m_path.is_file():
                entries.append((m_path, f"{root_folder}/{manifest_name}"))

        return f"{root_folder}.zip", entries

    def mark_session_offloaded(self, session_id: str, offloaded: bool = True) -> Dict[str, Any]:
        with DB.connection() as conn:
            conn.execute(
                "UPDATE capture_sessions SET offloaded = ?, updated_at = ? WHERE id = ?",
                (1 if offloaded else 0, time.time(), session_id),
            )
            row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not row:
                raise KeyError(f"Session not found: {session_id}")
            return dict(row)

    def purge_rejected_frames(self, session_id: str) -> Dict[str, Any]:
        with DB.connection() as conn:
            s_row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not s_row:
                raise KeyError(f"Session not found: {session_id}")
            session_dir = Path(s_row["directory_path"])
            rej = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM captured_frames WHERE session_id = ? AND status = 'rejected'",
                    (session_id,),
                ).fetchall()
            ]
            freed_bytes = 0
            for fr in rej:
                p = session_dir / fr["relative_path"]
                if p.exists():
                    freed_bytes += p.stat().st_size
                    p.unlink()
            conn.execute(
                "DELETE FROM captured_frames WHERE session_id = ? AND status = 'rejected'",
                (session_id,),
            )
        self.write_session_manifests(session_id)
        STATE.refresh_system_telemetry()
        return {
            "deleted_frames": len(rej),
            "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        }

    def delete_session(self, session_id: str) -> Dict[str, Any]:
        with DB.connection() as conn:
            s_row = conn.execute("SELECT * FROM capture_sessions WHERE id = ?", (session_id,)).fetchone()
            if not s_row:
                raise KeyError(f"Session not found: {session_id}")
            session_dir = Path(s_row["directory_path"])
            if session_dir.exists() and session_dir != self.get_active_storage_root():
                shutil.rmtree(session_dir, ignore_errors=True)
            conn.execute("DELETE FROM capture_sessions WHERE id = ?", (session_id,))
        STATE.refresh_system_telemetry()
        return {"deleted_session_id": session_id}

    def safe_eject_usb(self, mount_point: Optional[str] = None) -> Dict[str, Any]:
        """Flush filesystem buffers and safely unmount an external USB 3.0 drive."""
        if STATE.active_mode == "SEQUENCE" and STATE.sequence_state.get("status") == "RUNNING":
            raise RuntimeError("Cannot eject USB drive while an imaging sequence is actively running.")

        os.sync()
        target_mount = mount_point or STATE.system.usb_drive_path
        if not target_mount:
            # Reset active storage to local Pi directory
            STATE.system.active_storage_path = str(CONFIG.captures_dir)
            STATE.system.usb_drive_mounted = False
            STATE.system.usb_drive_label = ""
            return {
                "ejected": True,
                "message": "Filesystem buffers synced. No external USB mount was active; switched to local Pi storage.",
            }

        # Switch active storage root back to local Pi storage before unmounting
        if str(STATE.system.active_storage_path).startswith(target_mount):
            STATE.system.active_storage_path = str(CONFIG.captures_dir)
            DB.set_setting("active_storage_path", str(CONFIG.captures_dir))

        unmounted = False
        err_msg = ""
        for cmd in (["udisksctl", "unmount", "-f", "-p", target_mount], ["umount", target_mount]):
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
                if res.returncode == 0:
                    unmounted = True
                    break
                err_msg = res.stderr.strip()
            except Exception as exc:
                err_msg = str(exc)

        STATE.system.usb_drive_mounted = False
        STATE.system.usb_drive_label = ""
        STATE.system.usb_drive_path = ""
        STATE.refresh_system_telemetry()
        return {
            "ejected": True,
            "unmounted_os": unmounted,
            "mount_point": target_mount,
            "message": (
                f"USB drive ({target_mount}) synced and safely unmounted — safe to unplug."
                if unmounted
                else f"Filesystem buffers synced and storage switched to Pi local disk ({err_msg or 'ready'})."
            ),
        }


STORAGE = StorageManager()
