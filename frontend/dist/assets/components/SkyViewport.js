/**
 * Persistent Live Sky Viewport (<canvas> 1x/2x/4x Pan & Zoom + Star HFR/Eccentricity Overlay + ADU Histogram)
 * The <canvas> element remains mounted across all tab changes and WebSocket updates for zero-flicker 60 FPS pan.
 */

import { html } from '../vendor/htm.mjs';
import { useRef, useEffect } from '../vendor/hooks.mjs';
import {
  store,
  updateStore,
  subscribePreviewCanvas,
  PREVIEW_EXP_OPTIONS,
  TRAILED_ECCENTRICITY_LIMIT,
  isFlatHistActive,
  evaluateFlatHistogram,
  api,
  runAction,
  showNotice,
  refreshAll,
} from '../store.js';

let cachedPreviewUrl = null;
let cachedPreviewImg = null;
let loadingPreviewUrl = null;

function drawPreviewFromImage(canvas, ctx, img, preview) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const imgW = img.naturalWidth || canvas.width;
  const imgH = img.naturalHeight || canvas.height;

  let cropX = 0;
  let cropY = 0;
  let cropW = imgW;
  let cropH = imgH;

  if (store.zoom > 1.0) {
    cropW = imgW / store.zoom;
    cropH = imgH / store.zoom;
    const hw = cropW / 2;
    const hh = cropH / 2;

    const centerX = Math.max(hw, Math.min(imgW - hw, store.panX * imgW));
    const centerY = Math.max(hh, Math.min(imgH - hh, store.panY * imgH));

    cropX = centerX - hw;
    cropY = centerY - hh;

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(img, 0, 0, imgW, imgH, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();

  if (store.nightVision) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#ff1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Draw star HFR + Eccentricity overlays mapped into current zoom & pan window
  const stars = preview?.stars_overlay || [];
  ctx.lineWidth = 1.5;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  for (const s of stars) {
    let destX;
    let destY;
    if (store.zoom > 1.0) {
      const starImgX = s.x * imgW;
      const starImgY = s.y * imgH;
      if (starImgX < cropX || starImgX > cropX + cropW || starImgY < cropY || starImgY > cropY + cropH) {
        continue;
      }
      destX = ((starImgX - cropX) / cropW) * canvas.width;
      destY = ((starImgY - cropY) / cropH) * canvas.height;
    } else {
      destX = s.x * canvas.width;
      destY = s.y * canvas.height;
    }

    const isTrailed = Number(s.eccentricity || 0) >= TRAILED_ECCENTRICITY_LIMIT;
    const starCol = store.nightVision ? '#ff1a1a' : isTrailed ? '#f59e0b' : '#22d3ee';
    ctx.strokeStyle = starCol;
    ctx.fillStyle = starCol;

    ctx.beginPath();
    ctx.arc(destX, destY, Math.max(6, Number(s.hfr || 2) * 3 * store.zoom), 0, Math.PI * 2);
    ctx.stroke();

    const label = s.eccentricity !== undefined && s.eccentricity > 0
      ? `${Number(s.hfr).toFixed(1)}px e=${Number(s.eccentricity).toFixed(2)}`
      : `${Number(s.hfr).toFixed(1)}px`;
    ctx.fillText(label, destX + 8, destY - 6);
  }

  // If zoomed, draw pan hint and overview mini-map
  if (store.zoom > 1.0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(8, 8, 175, 26);
    ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#27272a';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, 175, 26);
    ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#38bdf8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🔍 ${store.zoom}x Zoom • Drag to Pan`, 14, 25);

    const mmW = 60;
    const mmH = 40;
    const mmX = canvas.width - mmW - 10;
    const mmY = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = store.nightVision ? '#550000' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    const vpW = mmW / store.zoom;
    const vpH = mmH / store.zoom;
    const vpX = mmX + (cropX / imgW) * mmW;
    const vpY = mmY + (cropY / imgH) * mmH;
    ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }
}

function paintCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const preview = store.state?.preview;
  canvas.style.cursor = store.zoom > 1.0 ? 'grab' : 'default';

  if (!preview?.image_url) {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#a1a1aa';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Tap '▶ Live Viewfinder' or '📸 Test Shot' to see camera view", canvas.width / 2, canvas.height / 2);
    return;
  }

  if (cachedPreviewImg && cachedPreviewUrl === preview.image_url) {
    drawPreviewFromImage(canvas, ctx, cachedPreviewImg, preview);
    return;
  }

  if (cachedPreviewImg) {
    drawPreviewFromImage(canvas, ctx, cachedPreviewImg, preview);
  }

  if (loadingPreviewUrl === preview.image_url) return;
  loadingPreviewUrl = preview.image_url;

  const img = new Image();
  img.onload = () => {
    cachedPreviewUrl = preview.image_url;
    cachedPreviewImg = img;
    loadingPreviewUrl = null;
    if (canvas.isConnected && store.state?.preview) {
      drawPreviewFromImage(canvas, ctx, img, store.state.preview);
    }
  };
  img.onerror = () => {
    loadingPreviewUrl = null;
  };
  img.src = preview.image_url;
}

function HistogramSvg({ hist }) {
  if (!hist || !hist.luma || hist.luma.length === 0) return null;
  const bins = hist.luma;
  const w = 320;
  const h = 46;
  const flatMode = isFlatHistActive();
  const med = Number(hist.median_adu ?? 50);
  const aduPct = Math.round((med / 255) * 100);

  const buildPts = (arr) =>
    (arr || [])
      .map((v, i) => {
        const x = (i / Math.max(1, arr.length - 1)) * w;
        const y = h - Math.min(1, Math.max(0, v)) * (h - 6) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const ptsLuma = buildPts(bins);
  const showRgb = !store.nightVision && hist.r && hist.g && hist.b;

  let headerText = '';
  let zoneLabel = '';
  let zoneStart = 0.15;
  let zoneWidth = 0.20;
  let zoneCol = store.nightVision ? '#ff1a1a' : '#ef4444';
  let labelColor = 'var(--text-muted)';
  const lumaCol = store.nightVision ? '#ff1a1a' : flatMode ? '#f8fafc' : '#ef4444';

  if (flatMode) {
    const flatEval = evaluateFlatHistogram(hist);
    const rPct = hist.r_median_adu !== undefined ? Math.round((hist.r_median_adu / 255) * 100) : aduPct;
    const gPct = hist.g_median_adu !== undefined ? Math.round((hist.g_median_adu / 255) * 100) : aduPct;
    const bPct = hist.b_median_adu !== undefined ? Math.round((hist.b_median_adu / 255) * 100) : aduPct;
    headerText = `FLAT ADU GUIDE: ${aduPct}% (${med} ADU) • R:${rPct}% G:${gPct}% B:${bPct}%`;
    zoneLabel = flatEval.label;
    zoneStart = 0.35;
    zoneWidth = 0.20;
    zoneCol = store.nightVision ? '#ff1a1a' : flatEval.ok ? '#10b981' : '#f59e0b';
    labelColor = flatEval.ok ? 'var(--ok-col)' : 'var(--warn-col)';
  } else {
    headerText = `SKYFOG HISTOGRAM: ${aduPct}% (${med} ADU)`;
    zoneLabel = 'Optimal Skyfog Zone (15–35%) ✓';
    if (aduPct > 40) zoneLabel = '⚠️ High Skyglow (>40%) — Lower Exp/ISO';
    else if (aduPct < 10) zoneLabel = 'Low Skyfog (<10%) — Can Increase Exp';
  }

  const toggleHistMode = () => {
    updateStore({ histMode: flatMode ? 'LIGHT' : 'FLAT' });
  };

  return html`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:6px;border-top:1px solid var(--border-col);flex-wrap:wrap">
      <div style="font-size:11px;color:var(--text-muted);display:grid;gap:2px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <strong style="color:var(--text-main)">${headerText}</strong>
          <button
            class="btn btn-sm ${flatMode ? 'btn-active' : ''}"
            onClick=${toggleHistMode}
            style="min-height:22px;padding:1px 7px;font-size:10px"
            title="Switch histogram target guide between Light Skyfog (15–35%) and Siril Flat ADU (35–55%)"
          >
            ${flatMode ? '⬜ Mode: Flat ADU (35–55%)' : '🌌 Mode: Skyfog (15–35%)'}
          </button>
        </div>
        <div style=${`color:${labelColor}`}>${zoneLabel}</div>
      </div>

      <svg
        viewBox=${`0 0 ${w} ${h}`}
        style="flex:1;max-width:255px;height:42px;background:var(--bg-oled);border:1px solid var(--border-col);border-radius:6px"
      >
        <rect x=${(w * zoneStart).toFixed(1)} y="0" width=${(w * zoneWidth).toFixed(1)} height=${h} fill=${zoneCol} opacity="0.18" />
        ${flatMode
          ? html`
              <line
                x1=${(w * 0.95).toFixed(1)}
                y1="0"
                x2=${(w * 0.95).toFixed(1)}
                y2=${h}
                stroke=${store.nightVision ? '#ff1a1a' : '#ef4444'}
                stroke-dasharray="3 2"
                stroke-width="1.2"
              />
            `
          : null}
        ${showRgb
          ? html`
              <polyline fill="none" stroke="#ef4444" stroke-opacity="0.45" stroke-width="1.1" points=${buildPts(hist.r)} />
              <polyline fill="none" stroke="#22c55e" stroke-opacity="0.45" stroke-width="1.1" points=${buildPts(hist.g)} />
              <polyline fill="none" stroke="#3b82f6" stroke-opacity="0.45" stroke-width="1.1" points=${buildPts(hist.b)} />
            `
          : null}
        <polyline fill="none" stroke=${lumaCol} stroke-width="1.8" points=${ptsLuma} />
      </svg>
    </div>
  `;
}

export function SkyViewport({ preview, isSim }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintCanvas(canvas);

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0.5;
    let startPanY = 0.5;

    const onMouseDown = (e) => {
      if (store.zoom <= 1.0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = store.panX;
      startPanY = store.panY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!dragging || store.zoom <= 1.0) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - startX) / Math.max(1, rect.width);
      const dy = (e.clientY - startY) / Math.max(1, rect.height);
      const hw = 0.5 / store.zoom;
      const hh = 0.5 / store.zoom;
      store.panX = Math.max(hw, Math.min(1.0 - hw, startPanX - dx / store.zoom));
      store.panY = Math.max(hh, Math.min(1.0 - hh, startPanY - dy / store.zoom));
      paintCanvas(canvas);
    };

    const onMouseUp = () => {
      if (dragging) {
        dragging = false;
        canvas.style.cursor = store.zoom > 1.0 ? 'grab' : 'default';
      }
    };

    const onTouchStart = (e) => {
      if (store.zoom <= 1.0 || e.touches.length !== 1) return;
      dragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startPanX = store.panX;
      startPanY = store.panY;
      e.preventDefault();
    };

    const onTouchMove = (e) => {
      if (!dragging || store.zoom <= 1.0 || e.touches.length !== 1) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.touches[0].clientX - startX) / Math.max(1, rect.width);
      const dy = (e.touches[0].clientY - startY) / Math.max(1, rect.height);
      const hw = 0.5 / store.zoom;
      const hh = 0.5 / store.zoom;
      store.panX = Math.max(hw, Math.min(1.0 - hw, startPanX - dx / store.zoom));
      store.panY = Math.max(hh, Math.min(1.0 - hh, startPanY - dy / store.zoom));
      paintCanvas(canvas);
      e.preventDefault();
    };

    const onTouchEnd = () => {
      dragging = false;
    };

    const onDblClick = () => {
      if (store.zoom > 1.0) {
        store.panX = 0.5;
        store.panY = 0.5;
        paintCanvas(canvas);
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('dblclick', onDblClick);

    const unsubPreview = subscribePreviewCanvas(() => paintCanvas(canvas));

    return () => {
      unsubPreview();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  useEffect(() => {
    paintCanvas(canvasRef.current);
  }, [preview?.image_url, preview?.stars_overlay, store.zoom, store.nightVision]);

  const handleExpChange = async (e) => {
    const val = e.target.value;
    updateStore({ manualExposure: val });
    await api('/api/camera/config', 'POST', { exposure_s: Number(val) }).catch(() => {});
  };

  const handleIsoChange = async (e) => {
    const val = e.target.value;
    updateStore({ manualIso: val });
    await api('/api/camera/config', 'POST', { iso: val }).catch(() => {});
  };

  const handleToggleLiveLoop = async () => {
    const expVal = Number(store.manualExposure || 2.0);
    const isoVal = String(store.manualIso || '1600');
    if (store.liveLoopRunning) {
      updateStore({ liveLoopRunning: false });
      await api('/api/camera/live-loop/stop', 'POST').catch(() => {});
    } else {
      updateStore({ liveLoopRunning: true });
      await api('/api/camera/live-loop/start', 'POST', { exposure_s: expVal, iso: isoVal }).catch((err) => {
        updateStore({ liveLoopRunning: false });
        showNotice(`Live Viewfinder error: ${err.message}`, 'err');
      });
    }
    await refreshAll();
  };

  const handleToggleStretch = () =>
    runAction(null, async () => {
      await api('/api/camera/preview-stretch', 'POST', {});
      await refreshAll();
    });

  const handleToggleZoom = () => {
    let nextZoom = 1.0;
    const patch = {};
    if (store.zoom === 1.0) nextZoom = 2.0;
    else if (store.zoom === 2.0) nextZoom = 4.0;
    else {
      nextZoom = 1.0;
      patch.panX = 0.5;
      patch.panY = 0.5;
    }
    patch.zoom = nextZoom;
    updateStore(patch);
    paintCanvas(canvasRef.current);
  };

  const handleResetPan = () => {
    store.panX = 0.5;
    store.panY = 0.5;
    paintCanvas(canvasRef.current);
  };

  const handleManualShot = () =>
    runAction('manual-shot', async () => {
      await api('/api/camera/capture', 'POST', {
        exposure_s: Number(store.manualExposure || 2.0),
        iso: String(store.manualIso || '1600'),
        fast_jpeg: true,
      });
      await refreshAll();
    });

  const handleConnectCamera = () =>
    runAction('connect-camera', async () => {
      const res = await api('/api/camera/connect', 'POST');
      if (res.driver_mode === 'gphoto2') {
        showNotice('Connected to physical Canon EOS M200 via USB PTP!', 'ok', 5000);
      } else {
        const detail = res.last_error ? ` (${res.last_error})` : '';
        showNotice(
          `Canon EOS M200 not detected on USB. Verify camera is ON in Manual ("M") mode with data USB cable.${detail}`,
          'warn',
          12000
        );
      }
      await refreshAll();
    });

  return html`
    <div class="card">
      <div class="card-header">
        <div>
          <strong style="font-size:13px">LIVE SKY PREVIEW</strong>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px" id="preview-source-fmt">
            (${preview?.source_format || 'RAW .CR3'})
          </span>
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:3px">
            <span style="font-size:11px;font-weight:700;color:var(--text-muted)">EXP:</span>
            <select id="preview-exp-sel" class="ctrl-sel" value=${store.manualExposure} onChange=${handleExpChange}>
              ${PREVIEW_EXP_OPTIONS.map(
                (o) => html`<option key=${o.val} value=${o.val} selected=${Number(store.manualExposure) === Number(o.val)}>${o.label}</option>`
              )}
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:3px">
            <span style="font-size:11px;font-weight:700;color:var(--text-muted)">ISO:</span>
            <select id="preview-iso-sel" class="ctrl-sel" value=${String(store.manualIso)} onChange=${handleIsoChange}>
              ${['100', '200', '400', '800', '1600', '3200', '6400'].map(
                (iso) => html`<option key=${iso} value=${iso} selected=${String(store.manualIso) === iso}>${iso}</option>`
              )}
            </select>
          </div>

          <button
            class="btn btn-sm ${store.liveLoopRunning ? 'btn-warn' : ''}"
            onClick=${handleToggleLiveLoop}
            title="Stream live viewfinder from sensor without physical shutter"
          >
            ${store.liveLoopRunning ? '⏹ Stop Live View' : '▶ Live Viewfinder'}
          </button>

          <button
            id="btn-toggle-stretch"
            class="btn btn-sm ${preview?.auto_stretched !== false ? 'btn-active' : ''}"
            onClick=${handleToggleStretch}
            title="Toggle PixInsight MTF Auto-Stretch (turn OFF for daylight or Flat frames)"
          >
            ${preview?.auto_stretched !== false ? '✨ Stretch: ON' : 'Stretch: OFF'}
          </button>

          <button
            class="btn btn-sm ${store.zoom > 1 ? 'btn-active' : ''}"
            onClick=${handleToggleZoom}
            title="Cycle 1x Fit / 2x Zoom / 4x Zoom"
          >
            🔍 ${store.zoom > 1 ? `${store.zoom}x Zoom` : '1x Fit'}
          </button>

          ${store.zoom > 1
            ? html`<button class="btn btn-sm" onClick=${handleResetPan} title="Center pan on image">🎯 Center</button>`
            : null}

          <button class="btn btn-sm btn-primary" onClick=${handleManualShot} disabled=${Boolean(store.busyAction)}>
            ${store.busyAction === 'manual-shot' ? '⏳ Shooting...' : '📸 Test Shot'}
          </button>
        </div>
      </div>

      ${isSim
        ? html`
            <div
              class="step-banner"
              style="background:rgba(217,119,6,0.12);border:1px solid #d97706;color:#f59e0b;margin-bottom:4px;font-size:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"
            >
              <span>⚠️ <strong>Simulator Active:</strong> Showing synthetic stars. Turn on Canon M200 in Manual (M) mode.</span>
              <button class="btn btn-sm btn-warn" onClick=${handleConnectCamera} style="white-space:nowrap">⚡ Connect Camera</button>
            </div>
          `
        : null}

      <canvas id="sky-canvas" ref=${canvasRef} width="960" height="640"></canvas>
      <div id="hist-container">
        <${HistogramSvg} hist=${preview?.histogram} />
      </div>
    </div>
  `;
}
