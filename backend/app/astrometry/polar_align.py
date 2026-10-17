"""All-Sky 2-Point & 3-Point SO(3) Polar Alignment Engine for Star Adventurer 2i."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ..config import CONFIG
from .coordinates import (
    ObserverLocation,
    camera_attitude_matrix_neu,
    j2000_to_topocentric_altaz,
    neu_vector_to_altaz,
    target_celestial_pole_neu,
)


@dataclass
class CalibrationPoint:
    index: int
    ra_hours: float
    dec_deg: float
    crota2_deg: float
    utc_timestamp: float
    alt_deg: float
    az_deg: float
    r_cam_neu: np.ndarray  # 3x3 SO(3) matrix


@dataclass
class PolarAlignmentSolution:
    calibrated: bool
    num_points: int
    mount_axis_neu: np.ndarray  # 3-vector in topocentric NEU
    camera_local_axis: np.ndarray  # 3-vector in camera local frame (invariant to RA rotation!)
    target_pole_neu: np.ndarray
    mount_alt_deg: float
    mount_az_deg: float
    target_alt_deg: float
    target_az_deg: float
    alt_error_arcmin: float  # target_alt - mount_alt (+ means RAISE wedge)
    az_error_arcmin: float  # (target_az - mount_az)*cos(alt) (+ means TURN RIGHT/EAST)
    total_error_arcmin: float
    alt_direction: str
    az_direction: str
    sa2i_knob_turns: float
    bump_residual_arcmin: float = 0.0
    bump_warning: bool = False
    rotation_angles_deg: List[float] = field(default_factory=list)


def extract_rotation_axis_and_angle(
    r_i: np.ndarray,
    r_j: np.ndarray,
    hemisphere_sign: float = 1.0,
) -> Tuple[np.ndarray, float]:
    """Extract the unit axis p_neu and rotation magnitude (degrees) from dR = r_j @ r_i.T."""
    d_r = r_j @ r_i.T
    cos_phi = float(np.clip((np.trace(d_r) - 1.0) * 0.5, -1.0, 1.0))
    angle_rad = math.acos(cos_phi)
    angle_deg = math.degrees(angle_rad)

    # Skew-symmetric vector extraction
    skew = np.array(
        [
            d_r[2, 1] - d_r[1, 2],
            d_r[0, 2] - d_r[2, 0],
            d_r[1, 0] - d_r[0, 1],
        ],
        dtype=np.float64,
    )
    norm_s = float(np.linalg.norm(skew))
    if norm_s < 1e-9:
        # Fallback to SVD nullspace of (dR - I)
        _, _, vh = np.linalg.svd(d_r - np.eye(3))
        axis = vh[-1, :]
    else:
        axis = skew / norm_s

    # Orient the mount RA axis toward the observer's celestial pole
    # In NEU: North pole has North > 0 (or Up > 0 in Northern hemisphere); South pole has North < 0
    if hemisphere_sign >= 0.0:
        if axis[0] < 0.0:
            axis = -axis
    else:
        if axis[0] > 0.0:
            axis = -axis

    return axis / np.linalg.norm(axis), angle_deg


class PolarAlignEngine:
    """State and mathematical solver for 2-Point and 3-Point Polar Alignment."""

    def __init__(self) -> None:
        self.mode_points: int = 3
        self.auto_advance: bool = False
        self.points: List[CalibrationPoint] = []
        self.camera_local_axis: Optional[np.ndarray] = None
        self.mount_axis_neu: Optional[np.ndarray] = None
        self.bump_residual_arcmin: float = 0.0
        self.bump_warning: bool = False
        self.breadcrumb_trail: List[Dict[str, float]] = []
        self._candidate_stationary_frame: Optional[Tuple[np.ndarray, float, float, float, float]] = None

    def reset(self, mode_points: Optional[int] = None) -> None:
        if mode_points in (2, 3):
            self.mode_points = mode_points
        self.points.clear()
        self.camera_local_axis = None
        self.mount_axis_neu = None
        self.bump_residual_arcmin = 0.0
        self.bump_warning = False
        self.breadcrumb_trail.clear()
        self._candidate_stationary_frame = None

    def add_calibration_point(
        self,
        ra_hours: float,
        dec_deg: float,
        crota2_deg: float,
        utc_timestamp: float,
        observer: ObserverLocation,
    ) -> Dict[str, Any]:
        """Record a plate-solved calibration frame and compute axis if >= 2 points exist."""
        alt_deg, az_deg = j2000_to_topocentric_altaz(ra_hours, dec_deg, utc_timestamp, observer)
        r_cam = camera_attitude_matrix_neu(ra_hours, dec_deg, crota2_deg, utc_timestamp, observer)

        # Verify sufficient RA clutch rotation (> 8 degrees) from previous point
        if self.points:
            prev = self.points[-1]
            _, rot_deg = extract_rotation_axis_and_angle(
                prev.r_cam_neu,
                r_cam,
                1.0 if observer.latitude_deg >= 0 else -1.0,
            )
            if rot_deg < 8.0:
                raise ValueError(
                    f"Insufficient RA clutch rotation ({rot_deg:.1f}°). "
                    "Please rotate the Star Adventurer 2i RA axis by ~20°–35° before capturing."
                )

        pt = CalibrationPoint(
            index=len(self.points) + 1,
            ra_hours=ra_hours,
            dec_deg=dec_deg,
            crota2_deg=crota2_deg,
            utc_timestamp=utc_timestamp,
            alt_deg=alt_deg,
            az_deg=az_deg,
            r_cam_neu=r_cam,
        )
        self.points.append(pt)
        self._candidate_stationary_frame = None

        solution: Optional[PolarAlignmentSolution] = None
        if len(self.points) >= 2:
            solution = self._solve_calibration(observer)

        return self.to_dict(observer, solution)

    def check_auto_advance_frame(
        self,
        ra_hours: float,
        dec_deg: float,
        crota2_deg: float,
        utc_timestamp: float,
        observer: ObserverLocation,
        min_rotation_deg: float = 20.0,
        stability_threshold_deg: float = 0.25,
    ) -> Tuple[bool, Dict[str, Any]]:
        """Evaluate a continuous solve frame during Hands-Free Auto-Advance calibration.

        Locks Point 1 immediately on first stationary frame, and locks Point 2 / Point 3
        once the user has rotated the RA clutch by >= min_rotation_deg and held the
        mount stationary for 2 consecutive solves.
        """
        r_cam = camera_attitude_matrix_neu(ra_hours, dec_deg, crota2_deg, utc_timestamp, observer)
        hemisphere_sign = 1.0 if observer.latitude_deg >= 0.0 else -1.0

        if not self.points:
            res = self.add_calibration_point(ra_hours, dec_deg, crota2_deg, utc_timestamp, observer)
            return True, res

        last_pt = self.points[-1]
        _, rot_from_last_deg = extract_rotation_axis_and_angle(last_pt.r_cam_neu, r_cam, hemisphere_sign)

        if rot_from_last_deg < min_rotation_deg:
            self._candidate_stationary_frame = None
            return False, {
                "auto_advance_status": "ROTATING_NEEDED",
                "rotation_from_last_deg": round(rot_from_last_deg, 1),
                "target_rotation_deg": min_rotation_deg,
            }

        if self._candidate_stationary_frame is None:
            self._candidate_stationary_frame = (r_cam, ra_hours, dec_deg, crota2_deg, utc_timestamp)
            return False, {
                "auto_advance_status": "SETTLING",
                "rotation_from_last_deg": round(rot_from_last_deg, 1),
            }

        prev_r_cam = self._candidate_stationary_frame[0]
        _, drift_deg = extract_rotation_axis_and_angle(prev_r_cam, r_cam, hemisphere_sign)
        if drift_deg <= stability_threshold_deg:
            res = self.add_calibration_point(ra_hours, dec_deg, crota2_deg, utc_timestamp, observer)
            return True, res

        # Still moving; update candidate frame
        self._candidate_stationary_frame = (r_cam, ra_hours, dec_deg, crota2_deg, utc_timestamp)
        return False, {
            "auto_advance_status": "MOVING",
            "rotation_from_last_deg": round(rot_from_last_deg, 1),
            "inter_frame_motion_deg": round(drift_deg, 2),
        }

    def _solve_calibration(self, observer: ObserverLocation) -> PolarAlignmentSolution:
        """Compute the mount's mechanical RA axis from 2 or 3 SO(3) camera attitudes."""
        hemisphere_sign = 1.0 if observer.latitude_deg >= 0.0 else -1.0
        n = len(self.points)

        p_12, ang_12 = extract_rotation_axis_and_angle(
            self.points[0].r_cam_neu,
            self.points[1].r_cam_neu,
            hemisphere_sign,
        )
        rot_angles = [round(ang_12, 2)]

        if n == 2:
            p_mount = p_12
            self.bump_residual_arcmin = 0.0
            self.bump_warning = False
        else:
            p_23, ang_23 = extract_rotation_axis_and_angle(
                self.points[1].r_cam_neu,
                self.points[2].r_cam_neu,
                hemisphere_sign,
            )
            p_13, ang_13 = extract_rotation_axis_and_angle(
                self.points[0].r_cam_neu,
                self.points[2].r_cam_neu,
                hemisphere_sign,
            )
            rot_angles.extend([round(ang_23, 2), round(ang_13, 2)])

            # Over-constrained SVD solve of (R_j @ R_i.T - I) p = 0 weighted by rotation baseline
            w12 = math.sin(math.radians(min(ang_12, 90.0)))
            w23 = math.sin(math.radians(min(ang_23, 90.0)))
            w13 = math.sin(math.radians(min(ang_13, 90.0)))
            p_mount = w12 * p_12 + w23 * p_23 + w13 * p_13
            p_mount /= np.linalg.norm(p_mount)

            # Bump / flexure check between segment 1->2 and segment 2->3
            dot_12_23 = float(np.clip(np.dot(p_12, p_23), -1.0, 1.0))
            self.bump_residual_arcmin = round(math.degrees(math.acos(dot_12_23)) * 60.0, 2)
            self.bump_warning = self.bump_residual_arcmin > 5.0

        # Compute tracking-invariant camera-local RA axis vector u_RA^cam
        local_vecs = [pt.r_cam_neu.T @ p_mount for pt in self.points]
        u_local = np.mean(local_vecs, axis=0)
        u_local /= np.linalg.norm(u_local)

        self.mount_axis_neu = p_mount
        self.camera_local_axis = u_local

        return self._compute_wedge_errors(p_mount, observer, rot_angles)

    def evaluate_live_frame(
        self,
        ra_hours: float,
        dec_deg: float,
        crota2_deg: float,
        utc_timestamp: float,
        observer: ObserverLocation,
    ) -> Dict[str, Any]:
        """Update the mechanical RA axis in real time during Phase 2 Wedge Adjustment."""
        if self.camera_local_axis is None:
            raise RuntimeError("Polar alignment must be calibrated before running live adjustment.")

        r_cam = camera_attitude_matrix_neu(ra_hours, dec_deg, crota2_deg, utc_timestamp, observer)
        p_mount = r_cam @ self.camera_local_axis
        p_mount /= np.linalg.norm(p_mount)
        self.mount_axis_neu = p_mount

        sol = self._compute_wedge_errors(p_mount, observer)
        return self.to_dict(observer, sol)

    def _compute_wedge_errors(
        self,
        p_mount_neu: np.ndarray,
        observer: ObserverLocation,
        rot_angles: Optional[List[float]] = None,
    ) -> PolarAlignmentSolution:
        target_neu, target_alt_deg, target_az_deg = target_celestial_pole_neu(observer)
        mount_alt_deg, mount_az_deg = neu_vector_to_altaz(p_mount_neu)

        # Altitude error: positive means Target Pole is HIGHER than current mount axis -> RAISE wedge
        alt_err_deg = target_alt_deg - mount_alt_deg
        alt_err_arcmin = alt_err_deg * 60.0

        # Shortest signed azimuth difference (target - mount) in [-180, 180], scaled by cos(alt)
        d_az_deg = ((target_az_deg - mount_az_deg + 180.0) % 360.0) - 180.0
        az_err_arcmin = d_az_deg * math.cos(math.radians(target_alt_deg)) * 60.0

        total_err_arcmin = math.hypot(alt_err_arcmin, az_err_arcmin)

        if abs(alt_err_arcmin) < 0.25:
            alt_dir = "ALIGNED"
        elif alt_err_arcmin > 0:
            alt_dir = "RAISE (UP)"
        else:
            alt_dir = "LOWER (DOWN)"

        if abs(az_err_arcmin) < 0.25:
            az_dir = "ALIGNED"
        elif az_err_arcmin > 0:
            az_dir = "TURN RIGHT (EAST)"
        else:
            az_dir = "TURN LEFT (WEST)"

        sa2i_turns = round(abs(alt_err_deg) / CONFIG.optics.sa2i_wedge_deg_per_turn, 2)

        # Record 5-point breadcrumb trail
        self.breadcrumb_trail.append(
            {
                "alt_error_arcmin": round(alt_err_arcmin, 2),
                "az_error_arcmin": round(az_err_arcmin, 2),
                "total_error_arcmin": round(total_err_arcmin, 2),
            }
        )
        if len(self.breadcrumb_trail) > 5:
            self.breadcrumb_trail = self.breadcrumb_trail[-5:]

        return PolarAlignmentSolution(
            calibrated=len(self.points) >= self.mode_points,
            num_points=len(self.points),
            mount_axis_neu=p_mount_neu,
            camera_local_axis=self.camera_local_axis if self.camera_local_axis is not None else np.zeros(3),
            target_pole_neu=target_neu,
            mount_alt_deg=round(mount_alt_deg, 4),
            mount_az_deg=round(mount_az_deg, 4),
            target_alt_deg=round(target_alt_deg, 4),
            target_az_deg=round(target_az_deg, 4),
            alt_error_arcmin=round(alt_err_arcmin, 2),
            az_error_arcmin=round(az_err_arcmin, 2),
            total_error_arcmin=round(total_err_arcmin, 2),
            alt_direction=alt_dir,
            az_direction=az_dir,
            sa2i_knob_turns=sa2i_turns,
            bump_residual_arcmin=self.bump_residual_arcmin,
            bump_warning=self.bump_warning,
            rotation_angles_deg=rot_angles or [],
        )

    def to_dict(
        self,
        observer: ObserverLocation,
        solution: Optional[PolarAlignmentSolution] = None,
    ) -> Dict[str, Any]:
        if solution is None and self.mount_axis_neu is not None:
            solution = self._compute_wedge_errors(self.mount_axis_neu, observer)

        phase = "IDLE"
        if len(self.points) > 0 and len(self.points) < self.mode_points:
            phase = "CALIBRATING"
        elif len(self.points) >= self.mode_points:
            phase = "LIVE_ADJUST"

        return {
            "phase": phase,
            "mode_points": self.mode_points,
            "auto_advance": self.auto_advance,
            "refraction_pole": observer.refraction_enabled,
            "points": [
                {
                    "index": p.index,
                    "ra_hours": round(p.ra_hours, 4),
                    "dec_deg": round(p.dec_deg, 4),
                    "crota2_deg": round(p.crota2_deg, 2),
                    "alt_deg": round(p.alt_deg, 2),
                    "az_deg": round(p.az_deg, 2),
                    "utc_timestamp": p.utc_timestamp,
                }
                for p in self.points
            ],
            "bump_residual_arcmin": round(self.bump_residual_arcmin, 2),
            "bump_warning": self.bump_warning,
            "alt_error_arcmin": solution.alt_error_arcmin if solution else 0.0,
            "az_error_arcmin": solution.az_error_arcmin if solution else 0.0,
            "total_error_arcmin": solution.total_error_arcmin if solution else 0.0,
            "alt_direction": solution.alt_direction if solution else "HOLD",
            "az_direction": solution.az_direction if solution else "HOLD",
            "sa2i_knob_turns": solution.sa2i_knob_turns if solution else 0.0,
            "breadcrumb_trail": list(self.breadcrumb_trail),
        }


PA_ENGINE = PolarAlignEngine()
