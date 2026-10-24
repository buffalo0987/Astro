"""Physics-Based Deep-Sky Light Sub-Exposure & ISO Optimizer.

Combines three live physical constraints for Canon EOS M200 (24MP 3.72um CMOS) +
TPO UltraWide 180mm f/4.5 (4.26"/px) on an unguided Sky-Watcher Star Adventurer 2i:
  1. Unguided SA2i Tracking Ceiling: 144-tooth worm RA periodic error scaled by cos(Dec)
     combined in quadrature with live Polar Alignment drift (from Step 1 PA error).
  2. Skyfog Read-Noise Swamping: live sky photoelectron flux (e-/px/s) vs. Canon 24MP
     ISO read-noise curve (10x-25x RN^2 target, <=35% sRGB skyfog ceiling).
  3. Star Core Saturation Protection: field-star peak flux vs. ISO full-well capacity,
     selecting between ISO 400, ISO 800, and ISO 1600.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional, Sequence, Tuple

import numpy as np

from ..config import CONFIG

# Clean astrophotography sub-exposure durations (<=30s native M200 shutter; >30s EOS Bulb timer)
LIGHT_EXPOSURE_LADDER: Tuple[int, ...] = (10, 15, 20, 25, 30, 45, 60, 75, 90, 105, 120, 150)

# Empirical Canon 24MP APS-C (3.72um Dual-Pixel CMOS, EOS M200) sensor read noise & full-well specs
EOS_M200_ISO_SPECS: Dict[str, Dict[str, float]] = {
    "100": {"read_noise_e": 5.20, "full_well_e": 24600.0},
    "200": {"read_noise_e": 3.50, "full_well_e": 12300.0},
    "400": {"read_noise_e": 2.40, "full_well_e": 6150.0},
    "800": {"read_noise_e": 1.80, "full_well_e": 3075.0},
    "1600": {"read_noise_e": 1.50, "full_well_e": 1538.0},
    "3200": {"read_noise_e": 1.40, "full_well_e": 769.0},
    "6400": {"read_noise_e": 1.36, "full_well_e": 385.0},
}


def get_eos_m200_sensor_spec(iso: str) -> Dict[str, float]:
    """Return (read_noise_e, full_well_e) for the Canon EOS M200 at a given ISO."""
    clean = str(iso).strip()
    if clean in EOS_M200_ISO_SPECS:
        return EOS_M200_ISO_SPECS[clean]
    try:
        iso_num = max(100.0, min(25600.0, float(clean)))
    except ValueError:
        iso_num = 800.0
    fwc = 24600.0 * (100.0 / iso_num)
    rn = math.hypot(1.35, 5.0 * (100.0 / iso_num))
    return {"read_noise_e": round(rn, 2), "full_well_e": round(fwc, 1)}


def srgb_u8_to_linear(adu_u8: float) -> float:
    """Invert IEC 61966-2-1 sRGB 8-bit [0..255] value to normalized linear [0..1] full-well fraction."""
    v = max(0.0, min(1.0, float(adu_u8) / 255.0))
    if v <= 0.04045:
        return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4


def linear_to_srgb_pct(lin_norm: float) -> int:
    """Convert normalized linear [0..1] full-well fraction to Back-of-Camera sRGB ADU percentage."""
    lin = max(0.0, min(1.0, float(lin_norm)))
    v = 12.92 * lin if lin <= 0.0031308 else 1.055 * (lin ** (1.0 / 2.4)) - 0.055
    return int(round(max(0.0, min(100.0, v * 100.0))))


def linear_rgb_to_srgb_u8(rgb_lin: np.ndarray) -> np.ndarray:
    """Vectorized IEC 61966-2-1 linear [0..1] array to uint8 [0..255] sRGB."""
    clipped = np.clip(rgb_lin, 0.0, 1.0)
    srgb = np.where(
        clipped <= 0.0031308,
        12.92 * clipped,
        1.055 * (np.maximum(clipped, 1e-9) ** (1.0 / 2.4)) - 0.055,
    )
    return np.clip(np.round(srgb * 255.0), 0.0, 255.0).astype(np.uint8)


def compute_sa2i_tracking_ceiling(
    dec_deg: float,
    pa_error_arcmin: float,
    pixel_scale_arcsec: Optional[float] = None,
    max_drift_px: float = 1.35,
) -> Dict[str, float]:
    """Compute maximum unguided sub-exposure (s) before star trailing on Star Adventurer 2i.

    Models:
      - SA2i 144-tooth brass worm RA periodic error slope (~0.082"/s at Dec=0) scaled by cos(Dec)
      - Polar Alignment Declination/HA drift (15.041"/s * sin(E_PA) ~= 0.004375"/s per arcmin)
    combined in quadrature against a 1.35-pixel (~5.75" at 180mm) roundness budget.
    """
    scale = float(pixel_scale_arcsec or CONFIG.optics.pixel_scale_arcsec)
    clamped_dec = max(-89.9, min(89.9, float(dec_deg)))
    cos_dec = max(0.20, abs(math.cos(math.radians(clamped_dec))))

    pe_drift_arcsec_s = 0.082 * cos_dec
    pa_drift_arcsec_s = 0.004375 * max(0.3, float(pa_error_arcmin))
    total_drift_arcsec_s = math.hypot(pe_drift_arcsec_s, pa_drift_arcsec_s)

    drift_budget_arcsec = max_drift_px * scale
    raw_max_s = drift_budget_arcsec / max(1e-4, total_drift_arcsec_s)
    max_exposure_s = round(max(15.0, min(150.0, raw_max_s)), 1)

    return {
        "max_exposure_s": max_exposure_s,
        "pe_drift_arcsec_min": round(pe_drift_arcsec_s * 60.0, 2),
        "pa_drift_arcsec_min": round(pa_drift_arcsec_s * 60.0, 2),
        "total_drift_arcsec_min": round(total_drift_arcsec_s * 60.0, 2),
    }


def snap_light_exposure(
    target_s: float,
    ceiling_s: float,
    ladder: Sequence[int] = LIGHT_EXPOSURE_LADDER,
) -> int:
    """Pick the cleanest astrophotography sub-exposure in ladder without exceeding ceiling_s."""
    safe_cap = max(float(ladder[0]), float(ceiling_s) * 1.03)
    feasible = [s for s in ladder if float(s) <= safe_cap]
    if not feasible:
        return int(ladder[0])
    clamped_target = max(float(feasible[0]), min(float(feasible[-1]), float(target_s)))
    return int(min(feasible, key=lambda s: abs(math.log(float(s) / clamped_target))))


def estimate_sky_and_star_flux(
    hist: Dict[str, Any],
    star_metrics: Dict[str, Any],
    probe_exposure_s: float,
    probe_iso: str,
    p9985_adu: Optional[float] = None,
) -> Tuple[float, float, str]:
    """Estimate ISO-invariant sky background rate (e-/px/s) and bright field-star rate (e-/px/s)."""
    probe_spec = get_eos_m200_sensor_spec(probe_iso)
    probe_fwc = probe_spec["full_well_e"]
    t_s = max(0.05, float(probe_exposure_s))

    bg_med = float(hist.get("median_adu", 0.0))
    max_ch_med = max(
        bg_med,
        float(hist.get("r_median_adu", bg_med)),
        float(hist.get("g_median_adu", bg_med)),
        float(hist.get("b_median_adu", bg_med)),
    )
    # Blend luma median with brightest RGB channel median to protect against strong red/amber LP
    sky_ref_adu = 0.65 * bg_med + 0.35 * max_ch_med
    jpeg_floor_lin = 0.0012
    lin_sky = max(0.00012, srgb_u8_to_linear(sky_ref_adu) - jpeg_floor_lin)
    sky_rate_e_s = max(0.10, (lin_sky * probe_fwc) / t_s)

    stars = star_metrics.get("stars") or []
    if len(stars) >= 3:
        peaks = sorted(float(s.get("peak_adu", bg_med)) for s in stars)
        p75_star = peaks[min(len(peaks) - 1, int(0.75 * len(peaks)))]
    elif len(stars) > 0:
        p75_star = max(float(s.get("peak_adu", bg_med)) for s in stars)
    else:
        p75_star = float(hist.get("p99_adu", bg_med))

    max_ch_p99 = float(hist.get("max_channel_p99_adu", p75_star))
    if p9985_adu is not None:
        star_ref_adu = max(p75_star, min(253.0, float(p9985_adu) * 0.94))
    elif max_ch_p99 >= 245.0:
        # >1% of pixels near saturation indicates an intense star cluster / bright core
        star_ref_adu = max(p75_star, max_ch_p99)
    else:
        star_ref_adu = p75_star

    lin_star_above_bg = max(0.0, srgb_u8_to_linear(star_ref_adu) - srgb_u8_to_linear(bg_med))
    if star_ref_adu >= 248.0:
        # Bright field stars are already clipping in the short probe shot
        lin_star_above_bg = max(lin_star_above_bg, 1.35)
    star_rate_e_s = (lin_star_above_bg * probe_fwc) / t_s

    # Approximate Bortle / filter sky condition description from measured sky_rate_e_s at f/4.5, 3.72um
    if sky_rate_e_s < 0.75:
        sky_regime = "Narrowband / Dual-Band or Bortle 1–2 Dark Sky"
    elif sky_rate_e_s < 2.8:
        sky_regime = "Dark-to-Rural Broadband Sky (Bortle 3–4)"
    elif sky_rate_e_s < 7.0:
        sky_regime = "Suburban Broadband Sky (Bortle 5–6)"
    else:
        sky_regime = "Bright Urban/Suburban Skyglow (Bortle 7–9)"

    return round(sky_rate_e_s, 3), round(star_rate_e_s, 2), sky_regime


def solve_optimal_light_exposure(
    hist: Dict[str, Any],
    star_metrics: Dict[str, Any],
    probe_exposure_s: float,
    probe_iso: str,
    dec_deg: float,
    declination_source: str = "selected_target",
    pa_error_arcmin: float = 4.0,
    pa_calibrated: bool = False,
    pixel_scale_arcsec: Optional[float] = None,
    p9985_adu: Optional[float] = None,
) -> Dict[str, Any]:
    """Compute optimal Light (exposure_s, iso) and full diagnostic telemetry."""
    tracking = compute_sa2i_tracking_ceiling(
        dec_deg=dec_deg,
        pa_error_arcmin=pa_error_arcmin,
        pixel_scale_arcsec=pixel_scale_arcsec,
    )
    t_track_max_s = tracking["max_exposure_s"]

    sky_rate_e_s, star_rate_e_s, sky_regime = estimate_sky_and_star_flux(
        hist=hist,
        star_metrics=star_metrics,
        probe_exposure_s=probe_exposure_s,
        probe_iso=probe_iso,
        p9985_adu=p9985_adu,
    )

    candidates: Dict[str, Dict[str, Any]] = {}
    for iso in ("400", "800", "1600"):
        spec = get_eos_m200_sensor_spec(iso)
        rn = spec["read_noise_e"]
        fwc = spec["full_well_e"]

        t_swamp10 = (10.0 * rn * rn) / sky_rate_e_s
        t_sky_ideal = (0.048 * fwc) / sky_rate_e_s  # ~24% Back-of-Camera Skyfog ADU
        t_sky_max = (0.100 * fwc) / sky_rate_e_s    # ~35% Back-of-Camera Skyfog ceiling
        t_star_max = (0.95 * fwc) / max(0.1, sky_rate_e_s + 0.55 * star_rate_e_s)

        ceiling_s = min(t_track_max_s, t_sky_max, max(15.0, t_star_max))
        raw_target_s = min(ceiling_s, max(t_swamp10, t_sky_ideal))
        exp_s = snap_light_exposure(raw_target_s, ceiling_s)

        sky_e = sky_rate_e_s * float(exp_s)
        swamp_factor = sky_e / (rn * rn)
        snr_eff_pct = round(100.0 / math.sqrt(1.0 + 1.0 / max(0.05, swamp_factor)), 1)
        proj_skyfog_pct = linear_to_srgb_pct((sky_e / fwc) + 0.0012)

        candidates[iso] = {
            "iso": iso,
            "exposure_s": exp_s,
            "t_swamp10_s": round(t_swamp10, 1),
            "t_sky_max_s": round(t_sky_max, 1),
            "t_star_max_s": round(t_star_max, 1),
            "ceiling_s": round(ceiling_s, 1),
            "swamp_factor": round(swamp_factor, 1),
            "snr_efficiency_pct": snr_eff_pct,
            "projected_skyfog_pct": proj_skyfog_pct,
        }

    c400 = candidates["400"]
    c800 = candidates["800"]
    c1600 = candidates["1600"]

    # ISO selection decision tree for Canon EOS M200 24MP CMOS
    if (c400["swamp_factor"] >= 18.0 and c400["exposure_s"] <= 45) or (
        min(c800["t_sky_max_s"], c800["t_star_max_s"]) < 35.0 and c400["swamp_factor"] >= 10.0
    ):
        chosen = c400
    elif c800["exposure_s"] >= t_track_max_s * 0.80 and c800["swamp_factor"] < 10.0:
        chosen = c1600
    else:
        chosen = c800

    exp_s = int(chosen["exposure_s"])
    chosen_iso = str(chosen["iso"])
    uses_bulb = exp_s > 30

    # Identify primary limiting factor & actionable field advice
    pa_tip: Optional[str] = None
    if (
        t_track_max_s <= min(chosen["t_sky_max_s"], chosen["t_star_max_s"]) * 1.05
        and exp_s >= t_track_max_s * 0.78
    ):
        if pa_error_arcmin > 6.0 and tracking["pa_drift_arcsec_min"] >= tracking["pe_drift_arcsec_min"] * 0.8:
            limiting_factor = f"Polar Alignment Drift ({pa_error_arcmin:.1f}')"
            pa_tip = f"PA error is {pa_error_arcmin:.1f}' — refine PA under 3' in Tab 1 to unlock longer subs!"
        else:
            limiting_factor = f"SA2i Tracking Ceiling at Dec {dec_deg:+.1f}°"
    elif chosen["t_star_max_s"] < min(t_track_max_s, chosen["t_sky_max_s"]):
        limiting_factor = "Bright Star Core Saturation Protection"
    else:
        limiting_factor = "Skyglow & Read-Noise Optimal Balance"

    mode_str = "Bulb" if uses_bulb else "Native Shutter"
    message = (
        f"Auto-Light solved {exp_s}s @ ISO {chosen_iso} ({mode_str}) • "
        f"SA2i Max {t_track_max_s:.0f}s (Dec {dec_deg:+.1f}°) • "
        f"Skyfog ~{chosen['projected_skyfog_pct']}% ADU ({chosen['swamp_factor']}× RN², {chosen['snr_efficiency_pct']}% SNR eff)."
    )
    if pa_tip:
        message += f" {pa_tip}"

    return {
        "exposure_s": exp_s,
        "iso": chosen_iso,
        "uses_bulb": uses_bulb,
        "sa2i_max_exposure_s": t_track_max_s,
        "dec_deg": round(float(dec_deg), 2),
        "declination_source": declination_source,
        "pa_error_arcmin": round(float(pa_error_arcmin), 2),
        "pa_calibrated": pa_calibrated,
        "sky_rate_e_per_s": sky_rate_e_s,
        "star_rate_e_per_s": star_rate_e_s,
        "sky_regime": sky_regime,
        "swamp_factor": chosen["swamp_factor"],
        "snr_efficiency_pct": chosen["snr_efficiency_pct"],
        "projected_skyfog_pct": chosen["projected_skyfog_pct"],
        "detected_stars": int(star_metrics.get("star_count", 0)),
        "fwhm_arcsec": round(float(star_metrics.get("fwhm_arcsec", 0.0)), 2),
        "limiting_factor": limiting_factor,
        "pa_tip": pa_tip,
        "tracking_detail": tracking,
        "candidates": candidates,
        "message": message,
    }
