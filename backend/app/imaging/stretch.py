"""PixInsight-Style Midtone Transfer Function (MTF) Auto-Stretch & 256-Bin Histogram."""

from __future__ import annotations

import io
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image


def compute_mtf_lut(
    channel_u8: np.ndarray,
    shadows_clip_sigma: float = -2.8,
    target_bg: float = 0.20,
) -> np.ndarray:
    """Compute a 256-entry uint8 lookup table implementing the PixInsight STF/MTF auto-stretch."""
    # Subsample for speed on Raspberry Pi 4
    sample = channel_u8[::4, ::4].astype(np.float32) / 255.0
    median = float(np.median(sample))
    # Normalized Median Absolute Deviation (MAD * 1.4826)
    mad = float(np.median(np.abs(sample - median))) * 1.4826
    if mad < 1e-5:
        mad = 0.005

    c0 = max(0.0, min(0.95, median + shadows_clip_sigma * mad))
    m_norm = max(1e-4, min(0.999, (median - c0) / max(1e-5, 1.0 - c0)))

    # Midtone balance parameter m that maps m_norm -> target_bg:
    # MTF(x, m) = ((m - 1) * x) / ((2*m - 1) * x - m)
    denom = m_norm * (2.0 * target_bg - 1.0) - target_bg
    if abs(denom) < 1e-6:
        m = 0.5
    else:
        m = (m_norm * (target_bg - 1.0)) / denom
    m = max(0.001, min(0.999, m))

    x = np.linspace(0.0, 1.0, 256, dtype=np.float32)
    x_clipped = np.clip((x - c0) / max(1e-5, 1.0 - c0), 0.0, 1.0)
    mtf = ((m - 1.0) * x_clipped) / ((2.0 * m - 1.0) * x_clipped - m + 1e-8)
    lut = np.clip(mtf * 255.0, 0.0, 255.0).astype(np.uint8)
    return lut


def auto_stretch_rgb(
    arr: np.ndarray,
    enable_stretch: bool = True,
    shadows_clip_sigma: float = -2.8,
    target_bg: float = 0.20,
) -> np.ndarray:
    """Apply MTF auto-stretch to an 8-bit or 16-bit RGB image array."""
    if arr.dtype == np.uint16:
        p1, p999 = np.percentile(arr[::4, ::4], [0.5, 99.9])
        span = max(1.0, float(p999 - p1))
        arr_u8 = np.clip((arr.astype(np.float32) - float(p1)) * (255.0 / span), 0.0, 255.0).astype(np.uint8)
    else:
        arr_u8 = arr

    if not enable_stretch:
        return arr_u8

    if arr_u8.ndim == 2:
        lut = compute_mtf_lut(arr_u8, shadows_clip_sigma, target_bg)
        return lut[arr_u8]

    out = np.empty_like(arr_u8)
    for c in range(min(3, arr_u8.shape[2])):
        lut = compute_mtf_lut(arr_u8[:, :, c], shadows_clip_sigma, target_bg)
        out[:, :, c] = lut[arr_u8[:, :, c]]
    return out


def compute_histogram_256(arr_u8: np.ndarray, bins: int = 64) -> Dict[str, Any]:
    """Compute compact down-binned RGB + Luminance histograms and unstretched ADU / clipping stats."""
    sub = arr_u8[::2, ::2]
    if sub.ndim == 3 and sub.shape[2] >= 3:
        r_ch = sub[:, :, 0]
        g_ch = sub[:, :, 1]
        b_ch = sub[:, :, 2]
        r_hist, _ = np.histogram(r_ch, bins=bins, range=(0, 256))
        g_hist, _ = np.histogram(g_ch, bins=bins, range=(0, 256))
        b_hist, _ = np.histogram(b_ch, bins=bins, range=(0, 256))
        # Fast integer BT.601 luma avoids 3x float64 temporary arrays on ARM64 Pi 4
        luma = (
            (
                77 * r_ch.astype(np.uint16)
                + 150 * g_ch.astype(np.uint16)
                + 29 * b_ch.astype(np.uint16)
            )
            >> 8
        ).astype(np.uint8)
        r_med = round(float(np.median(r_ch)), 1)
        g_med = round(float(np.median(g_ch)), 1)
        b_med = round(float(np.median(b_ch)), 1)
        max_ch_p99 = round(
            float(
                max(
                    np.percentile(r_ch, 99.0),
                    np.percentile(g_ch, 99.0),
                    np.percentile(b_ch, 99.0),
                )
            ),
            1,
        )
    else:
        luma = sub if sub.ndim == 2 else sub[:, :, 0]
        r_hist, _ = np.histogram(luma, bins=bins, range=(0, 256))
        g_hist = b_hist = r_hist
        r_med = g_med = b_med = round(float(np.median(luma)), 1)
        max_ch_p99 = round(float(np.percentile(luma, 99.0)), 1)

    l_hist, _ = np.histogram(luma, bins=bins, range=(0, 256))
    max_val = max(1, int(max(r_hist.max(), g_hist.max(), b_hist.max(), l_hist.max())))

    return {
        "bins": bins,
        "r": [round(float(v) / max_val, 4) for v in r_hist],
        "g": [round(float(v) / max_val, 4) for v in g_hist],
        "b": [round(float(v) / max_val, 4) for v in b_hist],
        "luma": [round(float(v) / max_val, 4) for v in l_hist],
        "median_adu": round(float(np.median(luma)), 1),
        "mean_adu": round(float(np.mean(luma)), 1),
        "p99_adu": round(float(np.percentile(luma, 99.0)), 1),
        "r_median_adu": r_med,
        "g_median_adu": g_med,
        "b_median_adu": b_med,
        "max_channel_p99_adu": max_ch_p99,
    }


def encode_jpeg_bytes(arr_u8: np.ndarray, quality: int = 85) -> bytes:
    """Encode an RGB uint8 NumPy array to JPEG bytes in memory."""
    buf = io.BytesIO()
    Image.fromarray(arr_u8).save(buf, format="JPEG", quality=quality, optimize=False)
    return buf.getvalue()
