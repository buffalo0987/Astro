"""C-Accelerated Star Photometry, Half-Flux Radius (HFR), FWHM & Trailing Eccentricity Analyzer.

Uses `sep` (`sep-pjw`, the compiled C Source Extractor photometry library) when installed on
the Raspberry Pi 4 for <12ms 2D sky-mesh background subtraction and second-moment ellipse
extraction, with a matching flux-weighted second-moment (`Ixx, Iyy, Ixy`) NumPy/SciPy engine
when `sep` is absent.

Outputs PixInsight-compatible star eccentricity `e = sqrt(1 - (b/a)^2)` in [0, 1]:
  - e <= 0.42 : Pinpoint round stars
  - 0.42 < e < 0.65 : Mild elongation (acceptable unguided tracking)
  - e >= 0.65 : Visibly trailed stars (wind shake, cable snag, or SA2i periodic error spike)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
from scipy import ndimage

from ..config import CONFIG

try:
    import sep as _sep  # type: ignore

    HAS_SEP = True
except Exception:
    _sep = None
    HAS_SEP = False

ECCENTRICITY_ROUND_MAX = 0.42
ECCENTRICITY_TRAILED_MIN = 0.65


def classify_eccentricity(ecc: float, star_count: int = 1) -> str:
    """Classify star roundness using PixInsight SubframeSelector eccentricity thresholds."""
    if star_count <= 0:
        return "No Stars"
    if ecc >= ECCENTRICITY_TRAILED_MIN:
        return "Trailed"
    if ecc > ECCENTRICITY_ROUND_MAX:
        return "Slightly Oval"
    return "Round"


def _compute_with_sep(
    luma: np.ndarray,
    sat_ceiling: float,
    max_stars: int,
    box_half_size: int,
    scale_arcsec: float,
) -> Optional[Dict[str, Any]]:
    """Fast C photometry via Source Extractor (`sep`)."""
    if not HAS_SEP or _sep is None:
        return None
    try:
        data = np.ascontiguousarray(luma, dtype=np.float32)
        h, w = data.shape
        bw = min(64, max(16, w // 8))
        bh = min(64, max(16, h // 8))
        bkg = _sep.Background(data, bw=bw, bh=bh, fw=3, fh=3)
        bg_median = float(bkg.globalback)
        sigma = max(1.5, float(bkg.globalrms))
        data_sub = data - bkg

        objs = _sep.extract(data_sub, thresh=5.5, err=sigma, minarea=4, clean=True)
        if objs is None or len(objs) == 0:
            return {
                "star_count": 0,
                "hfr_median": 0.0,
                "fwhm_arcsec": 0.0,
                "eccentricity_median": 0.0,
                "roundness_label": "No Stars",
                "bg_median_adu": round(bg_median, 1),
                "stars": [],
            }

        margin = max(4, box_half_size)
        valid_mask = (
            (objs["x"] >= margin)
            & (objs["x"] < w - margin)
            & (objs["y"] >= margin)
            & (objs["y"] < h - margin)
            & (objs["peak"] + bg_median < sat_ceiling)
            & (objs["a"] > 0.35)
            & (objs["b"] > 0.20)
            & (objs["flag"] == 0)
        )
        cand = objs[valid_mask]
        if len(cand) == 0:
            return {
                "star_count": 0,
                "hfr_median": 0.0,
                "fwhm_arcsec": 0.0,
                "eccentricity_median": 0.0,
                "roundness_label": "No Stars",
                "bg_median_adu": round(bg_median, 1),
                "stars": [],
            }

        order = np.argsort(-cand["flux"])[: max_stars * 2]
        cand = cand[order]
        rmax = float(box_half_size)
        hfrs, hfr_flags = _sep.flux_radius(
            data_sub,
            cand["x"],
            cand["y"],
            np.full(len(cand), rmax, dtype=np.float64),
            0.5,
            subpix=5,
        )

        stars_out: List[Dict[str, float]] = []
        for i in range(len(cand)):
            if int(hfr_flags[i]) != 0:
                continue
            hfr_val = float(hfrs[i])
            if not math.isfinite(hfr_val) or hfr_val < 0.75 or hfr_val > rmax * 0.85:
                continue
            a_val = max(1e-5, float(cand["a"][i]))
            b_val = max(0.0, min(a_val, float(cand["b"][i])))
            ecc = math.sqrt(max(0.0, 1.0 - (b_val / a_val) ** 2))
            cx = float(cand["x"][i])
            cy = float(cand["y"][i])
            stars_out.append(
                {
                    "x": round(cx / float(w), 4),
                    "y": round(cy / float(h), 4),
                    "x_px": round(cx, 1),
                    "y_px": round(cy, 1),
                    "hfr": round(hfr_val, 2),
                    "fwhm_arcsec": round(hfr_val * 2.0 * scale_arcsec, 2),
                    "eccentricity": round(ecc, 2),
                    "theta_deg": round(math.degrees(float(cand["theta"][i])), 1),
                    "peak_adu": round(float(cand["peak"][i] + bg_median), 1),
                    "flux": round(float(cand["flux"][i]), 1),
                }
            )
            if len(stars_out) >= max_stars:
                break

        if not stars_out:
            return {
                "star_count": 0,
                "hfr_median": 0.0,
                "fwhm_arcsec": 0.0,
                "eccentricity_median": 0.0,
                "roundness_label": "No Stars",
                "bg_median_adu": round(bg_median, 1),
                "stars": [],
            }

        hfr_med = float(np.median([s["hfr"] for s in stars_out]))
        ecc_med = float(np.median([s["eccentricity"] for s in stars_out]))
        return {
            "star_count": len(stars_out),
            "hfr_median": round(hfr_med, 2),
            "fwhm_arcsec": round(hfr_med * 2.0 * scale_arcsec, 2),
            "eccentricity_median": round(ecc_med, 2),
            "roundness_label": classify_eccentricity(ecc_med, len(stars_out)),
            "bg_median_adu": round(bg_median, 1),
            "stars": stars_out,
        }
    except Exception:
        return None


def compute_star_hfr_metrics(
    arr: np.ndarray,
    max_stars: int = 25,
    box_half_size: int = 12,
    pixel_scale_arcsec: Optional[float] = None,
) -> Dict[str, Any]:
    """Detect unsaturated stars and compute median HFR (px), FWHM (arcsec), and Eccentricity [0..1]."""
    scale_arcsec = pixel_scale_arcsec or CONFIG.optics.pixel_scale_arcsec

    if arr.ndim == 3:
        luma = (
            np.float32(0.299) * arr[:, :, 0]
            + np.float32(0.587) * arr[:, :, 1]
            + np.float32(0.114) * arr[:, :, 2]
        ).astype(np.float32, copy=False)
    else:
        luma = arr.astype(np.float32, copy=False)

    sat_ceiling = 250.0 if arr.dtype == np.uint8 else 64000.0

    sep_result = _compute_with_sep(luma, sat_ceiling, max_stars, box_half_size, scale_arcsec)
    if sep_result is not None:
        return sep_result

    h, w = luma.shape
    bg_median = float(np.median(luma[::2, ::2]))
    mad = float(np.median(np.abs(luma[::2, ::2] - bg_median))) * 1.4826
    sigma = max(1.5, mad)

    threshold = bg_median + 6.0 * sigma

    footprint_size = 9
    local_max = ndimage.maximum_filter(luma, size=footprint_size)
    mask = (luma == local_max) & (luma > threshold) & (luma < sat_ceiling)

    margin = box_half_size + 2
    if h > 2 * margin and w > 2 * margin:
        mask[:margin, :] = False
        mask[-margin:, :] = False
        mask[:, :margin] = False
        mask[:, -margin:] = False
    else:
        margin = max(2, min(h, w) // 6)

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return {
            "star_count": 0,
            "hfr_median": 0.0,
            "fwhm_arcsec": 0.0,
            "eccentricity_median": 0.0,
            "roundness_label": "No Stars",
            "bg_median_adu": round(bg_median, 1),
            "stars": [],
        }

    peaks = luma[ys, xs]
    order = np.argsort(-peaks)[: max_stars * 3]

    yy_grid, xx_grid = np.mgrid[-box_half_size : box_half_size + 1, -box_half_size : box_half_size + 1]
    stars_out: List[Dict[str, float]] = []

    for idx in order:
        y0, x0 = int(ys[idx]), int(xs[idx])
        if y0 - box_half_size < 0 or y0 + box_half_size + 1 > h:
            continue
        if x0 - box_half_size < 0 or x0 + box_half_size + 1 > w:
            continue

        patch = luma[y0 - box_half_size : y0 + box_half_size + 1, x0 - box_half_size : x0 + box_half_size + 1]
        local_bg = float(np.percentile(patch, 20.0))
        sub = np.maximum(0.0, patch - local_bg - 1.5 * sigma)
        total_flux = float(np.sum(sub))
        if total_flux <= 10.0:
            continue

        dx = float(np.sum(sub * xx_grid)) / total_flux
        dy = float(np.sum(sub * yy_grid)) / total_flux
        if abs(dx) > 3.0 or abs(dy) > 3.0:
            continue

        rx_grid = xx_grid - dx
        ry_grid = yy_grid - dy
        r_grid = np.hypot(rx_grid, ry_grid)

        core_flux = float(np.sum(sub[r_grid < 0.8]))
        if core_flux / total_flux > 0.88:
            continue

        hfr = float(np.sum(sub * r_grid)) / total_flux
        if hfr < 0.85 or hfr > float(box_half_size) * 0.85:
            continue

        # Flux-weighted second central moments inside 3.5 * HFR aperture for Star Eccentricity
        ap_mask = r_grid <= max(4.0, min(float(box_half_size), 3.5 * hfr))
        ap_weights = sub * ap_mask
        ap_flux = float(np.sum(ap_weights))
        if ap_flux > 0.0:
            m_xx = float(np.sum(ap_weights * (rx_grid**2))) / ap_flux
            m_yy = float(np.sum(ap_weights * (ry_grid**2))) / ap_flux
            m_xy = float(np.sum(ap_weights * rx_grid * ry_grid)) / ap_flux
            half_trace = 0.5 * (m_xx + m_yy)
            radicand = max(0.0, (0.5 * (m_xx - m_yy)) ** 2 + m_xy**2)
            root = math.sqrt(radicand)
            lam_major = max(1e-6, half_trace + root)
            lam_minor = max(0.0, half_trace - root)
            ecc = math.sqrt(max(0.0, 1.0 - (lam_minor / lam_major)))
            theta_deg = math.degrees(0.5 * math.atan2(2.0 * m_xy, m_xx - m_yy))
        else:
            ecc = 0.0
            theta_deg = 0.0

        stars_out.append(
            {
                "x": round((x0 + dx) / float(w), 4),
                "y": round((y0 + dy) / float(h), 4),
                "x_px": round(x0 + dx, 1),
                "y_px": round(y0 + dy, 1),
                "hfr": round(hfr, 2),
                "fwhm_arcsec": round(hfr * 2.0 * scale_arcsec, 2),
                "eccentricity": round(ecc, 2),
                "theta_deg": round(theta_deg, 1),
                "peak_adu": round(float(patch.max()), 1),
                "flux": round(total_flux, 1),
            }
        )
        if len(stars_out) >= max_stars:
            break

    if not stars_out:
        return {
            "star_count": 0,
            "hfr_median": 0.0,
            "fwhm_arcsec": 0.0,
            "eccentricity_median": 0.0,
            "roundness_label": "No Stars",
            "bg_median_adu": round(bg_median, 1),
            "stars": [],
        }

    hfr_med = float(np.median([s["hfr"] for s in stars_out]))
    ecc_med = float(np.median([s["eccentricity"] for s in stars_out]))
    fwhm_med = hfr_med * 2.0 * scale_arcsec

    return {
        "star_count": len(stars_out),
        "hfr_median": round(hfr_med, 2),
        "fwhm_arcsec": round(fwhm_med, 2),
        "eccentricity_median": round(ecc_med, 2),
        "roundness_label": classify_eccentricity(ecc_med, len(stars_out)),
        "bg_median_adu": round(bg_median, 1),
        "stars": stars_out,
    }
