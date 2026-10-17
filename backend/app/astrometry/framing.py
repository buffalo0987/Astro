"""Dual-Coordinate "Push-To" Framing Assistant (Equatorial L-Bracket + Ball-Head Camera Frame)."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np

from ..config import CONFIG
from .coordinates import (
    ObserverLocation,
    altaz_to_neu_vector,
    camera_attitude_matrix_neu,
    j2000_to_topocentric_altaz,
    radec_to_unit_vector,
)


def compute_framing_guidance(
    current_ra_hours: float,
    current_dec_deg: float,
    current_pa_deg: float,
    target_ra_hours: float,
    target_dec_deg: float,
    utc_timestamp: float,
    observer: ObserverLocation,
    target_pa_deg: Optional[float] = None,
) -> Dict[str, Any]:
    """Compute exact angular offsets to guide manual framing on the Star Adventurer 2i.

    Returns both:
      1. Equatorial offsets (Delta RA, Delta Dec) for Dec L-Bracket users.
      2. Camera-sensor plane offsets (Delta X Right/Left, Delta Y Up/Down) & Alt/Az offsets
         for Ball-Head users.
    """
    ra_cur_rad = math.radians(current_ra_hours * 15.0)
    dec_cur_rad = math.radians(current_dec_deg)
    ra_tgt_rad = math.radians(target_ra_hours * 15.0)
    dec_tgt_rad = math.radians(target_dec_deg)

    u_cur = radec_to_unit_vector(ra_cur_rad, dec_cur_rad)
    u_tgt = radec_to_unit_vector(ra_tgt_rad, dec_tgt_rad)
    sep_deg = math.degrees(math.acos(float(np.clip(np.dot(u_cur, u_tgt), -1.0, 1.0))))

    # Shortest signed RA offset (target - current) in degrees on the sky
    d_ra_hours = ((target_ra_hours - current_ra_hours + 12.0) % 24.0) - 12.0
    d_ra_sky_deg = d_ra_hours * 15.0 * math.cos(math.radians(0.5 * (current_dec_deg + target_dec_deg)))
    d_dec_deg = target_dec_deg - current_dec_deg

    # Topocentric Alt/Az offsets
    alt_cur, az_cur = j2000_to_topocentric_altaz(current_ra_hours, current_dec_deg, utc_timestamp, observer)
    alt_tgt, az_tgt = j2000_to_topocentric_altaz(target_ra_hours, target_dec_deg, utc_timestamp, observer)
    d_alt_deg = alt_tgt - alt_cur
    d_az_deg = (((az_tgt - az_cur + 180.0) % 360.0) - 180.0) * math.cos(math.radians(alt_cur))

    # Project target direction into the camera's local sensor axes (x_cam = Right, y_cam = Up)
    r_cam_neu = camera_attitude_matrix_neu(
        current_ra_hours,
        current_dec_deg,
        current_pa_deg,
        utc_timestamp,
        observer,
    )
    v_tgt_neu = altaz_to_neu_vector(alt_tgt, az_tgt)
    v_local = r_cam_neu.T @ v_tgt_neu
    cam_dx_deg = math.degrees(math.atan2(float(v_local[0]), float(v_local[2])))
    cam_dy_deg = math.degrees(math.atan2(float(v_local[1]), float(v_local[2])))

    # Roll / position angle difference if requested
    delta_pa_deg = 0.0
    if target_pa_deg is not None:
        delta_pa_deg = ((target_pa_deg - current_pa_deg + 180.0) % 360.0) - 180.0

    eq_instructions: List[str] = []
    if abs(d_ra_sky_deg) >= 0.05:
        ra_dir = "EAST" if d_ra_hours > 0 else "WEST"
        eq_instructions.append(f"Rotate RA Clutch {abs(d_ra_sky_deg):.2f}° {ra_dir} ({abs(d_ra_hours * 60):.1f}m RA)")
    else:
        eq_instructions.append("RA Centered (< 3')")

    if abs(d_dec_deg) >= 0.05:
        dec_dir = "NORTH (+)" if d_dec_deg > 0 else "SOUTH (-)"
        eq_instructions.append(f"Adjust Dec Bracket {abs(d_dec_deg):.2f}° {dec_dir}")
    else:
        eq_instructions.append("Dec Centered (< 3')")

    bh_instructions: List[str] = []
    if abs(cam_dx_deg) >= 0.05:
        x_dir = "RIGHT" if cam_dx_deg > 0 else "LEFT"
        bh_instructions.append(f"Aim Camera {abs(cam_dx_deg):.2f}° {x_dir}")
    else:
        bh_instructions.append("Horizontal Aim Centered")

    if abs(cam_dy_deg) >= 0.05:
        y_dir = "UP" if cam_dy_deg > 0 else "DOWN"
        bh_instructions.append(f"Aim Camera {abs(cam_dy_deg):.2f}° {y_dir}")
    else:
        bh_instructions.append("Vertical Aim Centered")

    on_target = sep_deg <= 0.20

    return {
        "solved": True,
        "on_target": on_target,
        "current_ra_hours": round(current_ra_hours, 4),
        "current_dec_deg": round(current_dec_deg, 4),
        "rotation_pa_deg": round(current_pa_deg % 360.0, 2),
        "target_ra_hours": round(target_ra_hours, 4),
        "target_dec_deg": round(target_dec_deg, 4),
        "fov_x_deg": round(CONFIG.optics.fov_width_deg, 2),
        "fov_y_deg": round(CONFIG.optics.fov_height_deg, 2),
        "angular_separation_deg": round(sep_deg, 2),
        "delta_ra_deg": round(d_ra_sky_deg, 2),
        "delta_dec_deg": round(d_dec_deg, 2),
        "delta_alt_deg": round(d_alt_deg, 2),
        "delta_az_deg": round(d_az_deg, 2),
        "camera_dx_deg": round(cam_dx_deg, 2),
        "camera_dy_deg": round(cam_dy_deg, 2),
        "delta_pa_deg": round(delta_pa_deg, 2),
        "instructions_equatorial": eq_instructions,
        "instructions_ballhead": bh_instructions,
    }
