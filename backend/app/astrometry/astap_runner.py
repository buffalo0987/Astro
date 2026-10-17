"""ASTAP Plate-Solver Wrapper with /dev/shm Workspace & Automatic Seeded Local Search."""

from __future__ import annotations

import asyncio
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

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
        """Plate-solve an image in /dev/shm using astap_cli (or simulator WCS sidecar fallback)."""
        t0 = time.monotonic()
        fov_h = fov_height_deg or round(CONFIG.optics.fov_height_deg, 2)
        z_factor = downsample if downsample is not None else CONFIG.astap_downsample

        used_seeded = (
            not force_blind
            and self.last_ra_hours is not None
            and self.last_dec_deg is not None
        )

        astap_exe = shutil.which(CONFIG.astap_bin)
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
            if os.path.isdir(CONFIG.astap_db_dir):
                cmd.extend(["-d", CONFIG.astap_db_dir])

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
                    parsed = self._parse_astap_ini(ini_file.read_text(encoding="utf-8"))
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

        # Fallback to synthetic simulator WCS sidecar when astap_cli is not installed
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
            message="Plate solve failed: insufficient stars or astap_cli not found",
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
            import math
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


import os  # noqa: E402

ASTAP = AstapRunner()
