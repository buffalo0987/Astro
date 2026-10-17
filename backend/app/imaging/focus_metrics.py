"""Star Detection, Half-Flux Radius (HFR), and FWHM Focus Analyzer."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from scipy import ndimage

from ..config import CONFIG


def compute_star_hfr_metrics(
    arr: np.ndarray,
    max_stars: int = 25,
    box_half_size: int = 12,
    pixel_scale_arcsec: Optional[float] = None,
) -> Dict[str, Any]:
    """Detect unsaturated stars in an image array and compute median HFR (px) and FWHM (arcsec).

    Uses background-subtracted radial first moment:
      HFR = sum(I(x, y) * r(x, y)) / sum(I(x, y))
    and relates Gaussian FWHM ~ 2.0 * HFR.
    """
    scale_arcsec = pixel_scale_arcsec or CONFIG.optics.pixel_scale_arcsec

    if arr.ndim == 3:
        luma = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]).astype(np.float32)
    else:
        luma = arr.astype(np.float32)

    h, w = luma.shape
    bg_median = float(np.median(luma[::2, ::2]))
    mad = float(np.median(np.abs(luma[::2, ::2] - bg_median))) * 1.4826
    sigma = max(1.5, mad)

    threshold = bg_median + 6.0 * sigma
    sat_ceiling = 250.0 if arr.dtype == np.uint8 else 64000.0

    # Local maximum filter for star peak candidates
    footprint_size = 9
    local_max = ndimage.maximum_filter(luma, size=footprint_size)
    mask = (luma == local_max) & (luma > threshold) & (luma < sat_ceiling)

    # Exclude border margin
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
            "bg_median_adu": round(bg_median, 1),
            "stars": [],
        }

    # Sort candidates by peak brightness descending
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

        # Sub-pixel centroid offset from (x0, y0)
        dx = float(np.sum(sub * xx_grid)) / total_flux
        dy = float(np.sum(sub * yy_grid)) / total_flux
        if abs(dx) > 2.5 or abs(dy) > 2.5:
            continue

        r_grid = np.hypot(xx_grid - dx, yy_grid - dy)
        # Reject single-pixel hot pixels (where >80% of energy is in r < 0.5)
        core_flux = float(np.sum(sub[r_grid < 0.8]))
        if core_flux / total_flux > 0.88:
            continue

        hfr = float(np.sum(sub * r_grid)) / total_flux
        if hfr < 0.85 or hfr > float(box_half_size) * 0.85:
            continue

        stars_out.append(
            {
                "x": round((x0 + dx) / float(w), 4),
                "y": round((y0 + dy) / float(h), 4),
                "x_px": round(x0 + dx, 1),
                "y_px": round(y0 + dy, 1),
                "hfr": round(hfr, 2),
                "fwhm_arcsec": round(hfr * 2.0 * scale_arcsec, 2),
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
            "bg_median_adu": round(bg_median, 1),
            "stars": [],
        }

    hfrs = [s["hfr"] for s in stars_out]
    hfr_med = float(np.median(hfrs))
    fwhm_med = hfr_med * 2.0 * scale_arcsec

    return {
        "star_count": len(stars_out),
        "hfr_median": round(hfr_med, 2),
        "fwhm_arcsec": round(fwhm_med, 2),
        "bg_median_adu": round(bg_median, 1),
        "stars": stars_out,
    }
