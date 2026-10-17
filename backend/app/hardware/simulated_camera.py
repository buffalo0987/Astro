"""Realistic Synthetic Starfield, .CR3 Container, and Mount Kinematics Simulator.

Enables full end-to-end verification of Polar Alignment (2/3-point SO(3) calibration +
wedge knob adjustment), Push-To Framing, Focus V-curve, and .CR3 Sequencing when no
physical Canon EOS M200 or ASTAP binary is connected.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image, ImageDraw

from ..astrometry.coordinates import (
    ObserverLocation,
    altaz_to_neu_vector,
    j2000_to_topocentric_altaz,
    neu_vector_to_altaz,
    target_celestial_pole_neu,
)
from ..imaging.cr3_parser import build_synthetic_cr3_bytes
from ..imaging.stretch import encode_jpeg_bytes


class SimulatedRig:
    """Simulates a Canon EOS M200 on a Star Adventurer 2i with realistic sky kinematics."""

    def __init__(self) -> None:
        # Simulated mechanical RA axis offset from true/refracted pole (arcminutes)
        self.wedge_alt_error_arcmin: float = 14.5  # Needs 14.5' RAISE
        self.wedge_az_error_arcmin: float = -9.2   # Needs 9.2' LEFT
        self.ra_clutch_angle_deg: float = 0.0
        # Pointing offset for Framing simulator (near NGC 7000 by default)
        self.pointing_ra_hours: float = 21.08
        self.pointing_dec_deg: float = 43.65
        self.camera_roll_deg: float = 12.5
        # Simulated manual focus ring position (optimal at 0.0, range -5..+5)
        self.focus_defocus_steps: float = 1.4
        self.rng = np.random.default_rng(42)
        self._star_catalog = self._generate_star_field(65)

    def _generate_star_field(self, count: int) -> np.ndarray:
        """Return deterministic (x_norm, y_norm, peak_flux) star coordinates."""
        xs = self.rng.uniform(0.06, 0.94, size=count)
        ys = self.rng.uniform(0.06, 0.94, size=count)
        fluxes = self.rng.uniform(90.0, 235.0, size=count)
        # Put a bright focus star near center
        xs[0], ys[0], fluxes[0] = 0.50, 0.50, 242.0
        return np.column_stack((xs, ys, fluxes))

    def rotate_ra_clutch(self, delta_deg: float = 28.0) -> float:
        self.ra_clutch_angle_deg = (self.ra_clutch_angle_deg + delta_deg) % 360.0
        return self.ra_clutch_angle_deg

    def adjust_wedge(self, d_alt_arcmin: float = 0.0, d_az_arcmin: float = 0.0) -> Tuple[float, float]:
        self.wedge_alt_error_arcmin = round(self.wedge_alt_error_arcmin + d_alt_arcmin, 2)
        self.wedge_az_error_arcmin = round(self.wedge_az_error_arcmin + d_az_arcmin, 2)
        return self.wedge_alt_error_arcmin, self.wedge_az_error_arcmin

    def nudge_framing(self, d_ra_hours: float = 0.0, d_dec_deg: float = 0.0, d_pa_deg: float = 0.0) -> None:
        self.pointing_ra_hours = (self.pointing_ra_hours + d_ra_hours) % 24.0
        self.pointing_dec_deg = max(-89.5, min(89.5, self.pointing_dec_deg + d_dec_deg))
        self.camera_roll_deg = (self.camera_roll_deg + d_pa_deg) % 360.0

    def compute_current_sky_wcs(
        self,
        mode: str,
        observer: ObserverLocation,
        utc_timestamp: float,
    ) -> Dict[str, float]:
        """Compute exact J2000 (ra_hours, dec_deg, crota2_deg) for the current simulated rig pose."""
        if mode == "PA":
            # Construct true mechanical RA axis in NEU from target pole and simulated wedge errors
            _, target_alt_deg, target_az_deg = target_celestial_pole_neu(observer)
            mount_alt_deg = target_alt_deg - (self.wedge_alt_error_arcmin / 60.0)
            cos_alt = max(0.05, math.cos(math.radians(target_alt_deg)))
            mount_az_deg = (target_az_deg - (self.wedge_az_error_arcmin / (60.0 * cos_alt))) % 360.0
            p_mount_neu = altaz_to_neu_vector(mount_alt_deg, mount_az_deg)

            # Camera optical axis is tilted by 6.0 deg from the mount RA axis (realistic off-pole pointing)
            # and rotated around p_mount_neu by self.ra_clutch_angle_deg
            arbitrary = np.array([0.0, 1.0, 0.0], dtype=np.float64)
            if abs(np.dot(p_mount_neu, arbitrary)) > 0.9:
                arbitrary = np.array([1.0, 0.0, 0.0], dtype=np.float64)
            e1 = np.cross(p_mount_neu, arbitrary)
            e1 /= np.linalg.norm(e1)
            e2 = np.cross(p_mount_neu, e1)

            phi = math.radians(self.ra_clutch_angle_deg)
            u_perp = math.cos(phi) * e1 + math.sin(phi) * e2
            u_tan = -math.sin(phi) * e1 + math.cos(phi) * e2

            cone_rad = math.radians(6.0)
            z_cam_neu = math.cos(cone_rad) * p_mount_neu + math.sin(cone_rad) * u_perp
            y_cam_neu = u_tan

            # Convert (z_cam_neu, y_cam_neu) back to approximate J2000 RA/Dec/CROTA2 so ASTAP/coordinates round-trip
            # Using inverse finite difference search on j2000_to_topocentric_altaz
            ra_h, dec_d, crota2 = self._neu_pose_to_j2000(z_cam_neu, y_cam_neu, utc_timestamp, observer)
            return {
                "ra_hours": ra_h,
                "dec_deg": dec_d,
                "crota2_deg": crota2,
            }

        return {
            "ra_hours": self.pointing_ra_hours,
            "dec_deg": self.pointing_dec_deg,
            "crota2_deg": self.camera_roll_deg,
        }

    def _neu_pose_to_j2000(
        self,
        z_neu: np.ndarray,
        y_neu: np.ndarray,
        utc_timestamp: float,
        observer: ObserverLocation,
    ) -> Tuple[float, float, float]:
        """Invert topocentric NEU camera attitude (z_neu, y_neu) to J2000 (ra_hours, dec_deg, crota2_deg)."""
        from ..astrometry.coordinates import (
            _annual_aberration_offset,
            _iau2006_precession_nutation_matrix,
            bennett_refraction_deg,
            local_apparent_sidereal_time_rad,
            unix_to_jd,
        )

        alt_app, az_deg = neu_vector_to_altaz(z_neu)
        # Remove Bennett refraction iteratively
        alt_true = alt_app
        if observer.refraction_enabled:
            for _ in range(3):
                r = bennett_refraction_deg(alt_true, observer.pressure_hpa, observer.temperature_c)
                alt_true = alt_app - r

        def altaz_true_to_icrs(alt_d: float, az_d: float) -> np.ndarray:
            v_neu = altaz_to_neu_vector(alt_d, az_d)
            north, east, up = float(v_neu[0]), float(v_neu[1]), float(v_neu[2])
            lat_r = math.radians(observer.latitude_deg)
            sin_lat, cos_lat = math.sin(lat_r), math.cos(lat_r)
            sin_dec = up * sin_lat + north * cos_lat
            dec_r = math.asin(max(-1.0, min(1.0, sin_dec)))
            cos_dec = max(1e-9, math.cos(dec_r))
            sin_ha = -east / cos_dec
            cos_ha = (up * cos_lat - north * sin_lat) / cos_dec
            ha_r = math.atan2(sin_ha, cos_ha)

            jd = unix_to_jd(utc_timestamp)
            npb, dpsi, eps = _iau2006_precession_nutation_matrix(jd)
            last_r = local_apparent_sidereal_time_rad(jd, observer.longitude_deg, dpsi, eps)
            ra_date = (last_r - ha_r) % (2.0 * math.pi)
            u_date = np.array(
                [math.cos(dec_r) * math.cos(ra_date), math.cos(dec_r) * math.sin(ra_date), math.sin(dec_r)],
                dtype=np.float64,
            )
            u_ab = npb.T @ u_date
            u_icrs = u_ab - _annual_aberration_offset(jd)
            return u_icrs / np.linalg.norm(u_icrs)

        u0 = altaz_true_to_icrs(alt_true, az_deg)
        ra0_r = math.atan2(float(u0[1]), float(u0[0])) % (2.0 * math.pi)
        dec0_r = math.asin(max(-1.0, min(1.0, float(u0[2]))))

        # Step 0.25 deg along y_neu
        step_r = math.radians(0.25)
        v_step_neu = math.cos(step_r) * z_neu + math.sin(step_r) * y_neu
        alt1_app, az1_deg = neu_vector_to_altaz(v_step_neu)
        alt1_true = alt1_app
        if observer.refraction_enabled:
            for _ in range(3):
                alt1_true = alt1_app - bennett_refraction_deg(alt1_true, observer.pressure_hpa, observer.temperature_c)
        u1 = altaz_true_to_icrs(alt1_true, az1_deg)

        e_north = np.array(
            [-math.sin(dec0_r) * math.cos(ra0_r), -math.sin(dec0_r) * math.sin(ra0_r), math.cos(dec0_r)],
            dtype=np.float64,
        )
        e_east = np.array([-math.sin(ra0_r), math.cos(ra0_r), 0.0], dtype=np.float64)
        du = u1 - float(np.dot(u1, u0)) * u0
        crota2_r = math.atan2(float(np.dot(du, e_east)), float(np.dot(du, e_north)))

        return math.degrees(ra0_r) / 15.0, math.degrees(dec0_r), math.degrees(crota2_r) % 360.0

    def render_synthetic_frame(
        self,
        output_path: Path,
        is_raw_cr3: bool,
        frame_type: str,
        exposure_s: float,
        iso: str,
        mode: str,
        observer: ObserverLocation,
        utc_timestamp: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Render a realistic synthetic astro frame (.JPG or .CR3) and sidecar WCS metadata."""
        ts = utc_timestamp if utc_timestamp is not None else time.time()
        w, h = (960, 640)
        rng = np.random.default_rng(int(ts * 1000) % 100000)

        if frame_type.lower() == "bias":
            arr = rng.normal(loc=14.0, scale=1.2, size=(h, w, 3)).clip(0, 255).astype(np.uint8)
        elif frame_type.lower() == "dark":
            arr = rng.normal(loc=16.0, scale=1.8, size=(h, w, 3)).clip(0, 255).astype(np.uint8)
        elif frame_type.lower() == "flat":
            yy, xx = np.mgrid[0:h, 0:w]
            r2 = ((xx - w * 0.5) / (w * 0.6)) ** 2 + ((yy - h * 0.5) / (h * 0.6)) ** 2
            vignette = (195.0 * (1.0 - 0.22 * r2)).clip(80, 220)
            arr = np.stack([vignette, vignette * 0.98, vignette * 0.95], axis=-1).astype(np.uint8)
        else:
            # Sky background + faint H-alpha nebula glow + Gaussian stars
            bg = rng.normal(loc=22.0, scale=2.0, size=(h, w, 3)).astype(np.float32)
            yy, xx = np.mgrid[0:h, 0:w]
            neb = np.exp(-(((xx - w * 0.48) / 140.0) ** 2 + ((yy - h * 0.52) / 95.0) ** 2))
            bg[:, :, 0] += neb * 32.0  # H-alpha red glow
            bg[:, :, 1] += neb * 11.0
            bg[:, :, 2] += neb * 15.0

            # Star PSF sigma controlled by simulated manual focus ring
            psf_sigma = 1.45 + 0.55 * abs(self.focus_defocus_steps)
            rot_rad = math.radians(self.ra_clutch_angle_deg if mode == "PA" else self.camera_roll_deg)
            cos_r, sin_r = math.cos(rot_rad), math.sin(rot_rad)

            patch_r = int(max(8, min(18, math.ceil(psf_sigma * 4.5))))
            py, px = np.mgrid[-patch_r : patch_r + 1, -patch_r : patch_r + 1]

            for sx_n, sy_n, peak in self._star_catalog:
                # Rotate around frame center
                dx_n = sx_n - 0.5
                dy_n = sy_n - 0.5
                rx_n = 0.5 + dx_n * cos_r - dy_n * sin_r
                ry_n = 0.5 + dx_n * sin_r + dy_n * cos_r
                cx = rx_n * w
                cy = ry_n * h
                ix, iy = int(round(cx)), int(round(cy))
                if ix - patch_r < 0 or ix + patch_r + 1 > w or iy - patch_r < 0 or iy + patch_r + 1 > h:
                    continue
                sub_dx = cx - ix
                sub_dy = cy - iy
                r2 = (px - sub_dx) ** 2 + (py - sub_dy) ** 2
                psf = peak * np.exp(-r2 / (2.0 * (psf_sigma**2)))
                for c, tint in enumerate((1.0, 0.96, 0.92)):
                    bg[iy - patch_r : iy + patch_r + 1, ix - patch_r : ix + patch_r + 1, c] += psf * tint

            arr = np.clip(bg, 0, 255).astype(np.uint8)

        jpeg_bytes = encode_jpeg_bytes(arr, quality=90)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if is_raw_cr3:
            cr3_bytes = build_synthetic_cr3_bytes(
                jpeg_bytes,
                metadata_tag=f"Canon EOS M200 | {frame_type} | {exposure_s}s | ISO {iso}",
            )
            output_path.write_bytes(cr3_bytes)
        else:
            output_path.write_bytes(jpeg_bytes)

        wcs = self.compute_current_sky_wcs(mode, observer, ts)
        wcs["utc_timestamp"] = ts
        sidecar = output_path.with_suffix(".simwcs.json")
        sidecar.write_text(json.dumps(wcs), encoding="utf-8")
        return wcs


SIM_RIG = SimulatedRig()
