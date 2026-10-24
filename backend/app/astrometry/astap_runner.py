"""ASTAP Plate-Solver Wrapper with /dev/shm Workspace & Automatic Seeded Local Search."""

from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..config import CONFIG


@dataclass
class PlateSolveResult:
    solved: bool
    ra_hours: float
    dec_deg: float
    crota2_deg: float
    fov_x_deg: float
    fov_y_deg: float
    solve_time_ms: int
    used_seeded_search: bool
    solver_backend: str  # "astap_cli" or "simulated_wcs"
    message: str = ""


_READINESS_CACHE: Tuple[float, Dict[str, Any]] = (0.0, {})


def find_astap_binary() -> Optional[str]:
    """Locate astap_cli (or astap) across PATH and standard Linux /opt/astap locations."""
    found = shutil.which(CONFIG.astap_bin)
    if found:
        return found
    for candidate in (
        "/opt/astap/astap_cli",
        "/usr/local/bin/astap_cli",
        "/usr/bin/astap_cli",
        "/opt/astap/astap",
        "/usr/bin/astap",
    ):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def find_astap_db_info() -> Tuple[Optional[str], List[str], bool]:
    """Locate installed ASTAP star database directory and catalog prefixes."""
    dirs_to_check = [
        CONFIG.astap_db_dir,
        "/opt/astap",
        "/usr/share/astap",
        "/usr/share/astap/data",
        "/usr/local/share/astap",
    ]
    medium_fov_prefixes = ("g05", "d05", "d20", "d50", "d80", "h18", "h17", "g17", "g18", "v17")
    best_dir: Optional[str] = None
    found_cats: List[str] = []

    seen = set()
    for d in dirs_to_check:
        if not d or d in seen or not os.path.isdir(d):
            continue
        seen.add(d)
        try:
            entries = os.listdir(d)
        except Exception:
            continue
        cats_here = sorted(
            {
                fn.split("_")[0].split(".")[0].lower()
                for fn in entries
                if fn.endswith((".290", ".1476"))
            }
        )
        if cats_here:
            if best_dir is None:
                best_dir = d
            for c in cats_here:
                if c not in found_cats:
                    found_cats.append(c)
            if any(c.startswith(medium_fov_prefixes) for c in cats_here):
                best_dir = d
                break

    has_180mm_cat = any(c.startswith(medium_fov_prefixes) for c in found_cats)
    return best_dir, found_cats, has_180mm_cat


def check_astap_readiness(force_refresh: bool = False) -> Dict[str, Any]:
    """Return cached ASTAP CLI + 180mm-compatible star catalog readiness telemetry."""
    global _READINESS_CACHE
    now = time.monotonic()
    if not force_refresh and _READINESS_CACHE[1] and (now - _READINESS_CACHE[0]) < 10.0:
        return _READINESS_CACHE[1]

    exe = find_astap_binary()
    db_dir, cats, has_180mm_cat = find_astap_db_info()
    ready = bool(exe and has_180mm_cat)

    if ready:
        cat_label = ", ".join(c.upper() for c in cats)
        status = f"Ready ({cat_label})"
    elif not exe:
        status = "astap_cli missing (run deploy/update.sh)"
    elif cats:
        cat_label = ", ".join(c.upper() for c in cats)
        status = f"Need G05/D05 catalog for 180mm (only {cat_label} found)"
    else:
        status = "Star catalog missing in /opt/astap"

    info = {
        "ready": ready,
        "binary": exe,
        "db_dir": db_dir,
        "catalogs": cats,
        "has_180mm_catalog": has_180mm_cat,
        "status": status,
    }
    _READINESS_CACHE = (now, info)
    return info


class AstapRunner:
    """Executes astap_cli in /dev/shm with blind (-r 180) and seeded (-ra -spd -r 15) modes."""

    def __init__(self) -> None:
        self.last_ra_hours: Optional[float] = None
        self.last_dec_deg: Optional[float] = None

    def clear_seed(self) -> None:
        self.last_ra_hours = None
        self.last_dec_deg = None

    async def solve_image(
        self,
        image_path: Path,
        fov_height_deg: Optional[float] = None,
        downsample: Optional[int] = None,
        force_blind: bool = False,
    ) -> PlateSolveResult:
        """Plate-solve an image in /dev/shm using astap_cli (or simulator WCS sidecar when simulating)."""
        t0 = time.monotonic()
        fov_h = fov_height_deg or round(CONFIG.optics.fov_height_deg, 2)
        z_factor = downsample if downsample is not None else CONFIG.astap_downsample

        used_seeded = (
            not force_blind
            and self.last_ra_hours is not None
            and self.last_dec_deg is not None
        )

        # Synthetic simulator WCS sidecar takes fast-path when camera is in Simulator Mode
        sim_sidecar = image_path.with_suffix(".simwcs.json")
        if sim_sidecar.exists():
            data = json.loads(sim_sidecar.read_text(encoding="utf-8"))
            ra_h = float(data["ra_hours"])
            dec_d = float(data["dec_deg"])
            crota2 = float(data["crota2_deg"])
            self.last_ra_hours = ra_h
            self.last_dec_deg = dec_d
            dt_ms = max(180 if used_seeded else 620, int((time.monotonic() - t0) * 1000))
            return PlateSolveResult(
                solved=True,
                ra_hours=ra_h,
                dec_deg=dec_d,
                crota2_deg=crota2,
                fov_x_deg=round(CONFIG.optics.fov_width_deg, 2),
                fov_y_deg=round(fov_h, 2),
                solve_time_ms=dt_ms,
                used_seeded_search=used_seeded,
                solver_backend="simulated_wcs",
            )

        astap_exe = find_astap_binary()
        db_dir, cats, has_180mm_cat = find_astap_db_info()

        if astap_exe:
            wcs_base = CONFIG.shm_dir / f"solve_{int(time.time() * 1000)}"
            cmd = [
                astap_exe,
                "-f",
                str(image_path),
                "-fov",
                f"{fov_h:.2f}",
                "-z",
                str(z_factor),
                "-o",
                str(wcs_base),
            ]
            if db_dir:
                cmd.extend(["-d", db_dir])

            if used_seeded and self.last_ra_hours is not None and self.last_dec_deg is not None:
                spd_deg = self.last_dec_deg + 90.0
                cmd.extend(
                    [
                        "-ra",
                        f"{self.last_ra_hours:.4f}",
                        "-spd",
                        f"{spd_deg:.4f}",
                        "-r",
                        f"{CONFIG.astap_seeded_radius_deg:.1f}",
                    ]
                )
            else:
                cmd.extend(["-r", f"{CONFIG.astap_blind_radius_deg:.1f}"])

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            ini_file = wcs_base.with_suffix(".ini")
            wcs_file = wcs_base.with_suffix(".wcs")

            try:
                if ini_file.exists():
                    parsed = self._parse_astap_ini(ini_file.read_text(encoding="utf-8", errors="replace"))
                    if parsed["solved"]:
                        self.last_ra_hours = parsed["ra_hours"]
                        self.last_dec_deg = parsed["dec_deg"]
                        dt_ms = int((time.monotonic() - t0) * 1000)
                        return PlateSolveResult(
                            solved=True,
                            ra_hours=parsed["ra_hours"],
                            dec_deg=parsed["dec_deg"],
                            crota2_deg=parsed["crota2_deg"],
                            fov_x_deg=round(CONFIG.optics.fov_width_deg, 2),
                            fov_y_deg=round(fov_h, 2),
                            solve_time_ms=dt_ms,
                            used_seeded_search=used_seeded,
                            solver_backend="astap_cli",
                        )
                # If seeded search failed (e.g. large manual clutch slew), retry blind once!
                if used_seeded:
                    return await self.solve_image(
                        image_path,
                        fov_height_deg=fov_h,
                        downsample=z_factor,
                        force_blind=True,
                    )
            finally:
                for p in (ini_file, wcs_file):
                    if p.exists():
                        try:
                            p.unlink()
                        except Exception:
                            pass

            if not cats:
                fail_msg = (
                    "Plate solve failed: no ASTAP star database found in /opt/astap. "
                    "Run 'sudo bash deploy/update.sh' on the Pi to install the G05 star catalog."
                )
            elif not has_180mm_cat:
                fail_msg = (
                    f"Plate solve failed: only wide-field ({', '.join(cats).upper()}) catalog installed. "
                    "Run 'sudo bash deploy/update.sh' to install the G05 (3°–20° FOV) catalog for 180mm."
                )
            else:
                fail_msg = (
                    "Plate solve failed: insufficient sharp stars detected. "
                    "Verify lens cap is off, stars are focused, no clouds/trees block the view, or raise EXP/ISO."
                )
        else:
            fail_msg = (
                "Plate solver (astap_cli) not installed on Pi. "
                "Run 'sudo bash deploy/update.sh' while on Wi-Fi to install astap_cli + G05 star catalog."
            )

        return PlateSolveResult(
            solved=False,
            ra_hours=0.0,
            dec_deg=0.0,
            crota2_deg=0.0,
            fov_x_deg=round(CONFIG.optics.fov_width_deg, 2),
            fov_y_deg=round(fov_h, 2),
            solve_time_ms=int((time.monotonic() - t0) * 1000),
            used_seeded_search=used_seeded,
            solver_backend="none",
            message=fail_msg,
        )

    @staticmethod
    def _parse_astap_ini(ini_text: str) -> Dict[str, Any]:
        kv: Dict[str, str] = {}
        for line in ini_text.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                kv[k.strip().upper()] = v.split("/")[0].strip()

        solved = kv.get("PLTSOLVD", "F").upper().startswith("T")
        if not solved:
            return {"solved": False}

        crval1_deg = float(kv.get("CRVAL1", "0.0"))
        crval2_deg = float(kv.get("CRVAL2", "0.0"))
        if "CROTA2" in kv:
            crota2_deg = float(kv["CROTA2"])
        elif "CD1_1" in kv and "CD2_1" in kv:
            cd11 = float(kv["CD1_1"])
            cd21 = float(kv["CD2_1"])
            crota2_deg = math.degrees(math.atan2(cd21, cd11)) % 360.0
        else:
            crota2_deg = 0.0

        return {
            "solved": True,
            "ra_hours": (crval1_deg / 15.0) % 24.0,
            "dec_deg": crval2_deg,
            "crota2_deg": crota2_deg % 360.0,
        }


ASTAP = AstapRunner()
