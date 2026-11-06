/**
 * Step 1: All-Sky 2/3-Point SO(3) Polar Alignment View + Auto-Zoom Bullseye SVG
 */

import { html } from '../vendor/htm.mjs';
import { store, api, runAction, refreshAll } from '../store.js';

function StepBannerContent({ pts, needed, isAligned, totalErr }) {
  if (pts === 0) {
    return html`
      <strong>Step 1 of ${needed}:</strong> Aim camera roughly toward the sky, lock the Star Adventurer 2i RA clutch, and tap <strong>Capture Point 1</strong>.
    `;
  }
  if (pts < needed) {
    return html`
      <strong>Step ${pts + 1} of ${needed}:</strong> Loosen the Star Adventurer 2i RA clutch, rotate the camera <strong>~30° East or West</strong>, re-lock the clutch, and tap <strong>Capture Point ${pts + 1}</strong>.
    `;
  }
  if (isAligned) {
    return html`
      <strong>Polar Aligned (${Number(totalErr).toFixed(2)}')!</strong> Lock your wedge knobs and proceed to <strong>2. Frame &amp; Focus</strong>.
    `;
  }
  return html`
    <strong>Calibrated!</strong> Start the <strong>2.5s Live Solve Loop</strong> and turn your wedge Altitude knob &amp; Azimuth screws until the dot enters the center bullseye (&lt;1.5').
  `;
}

function BullseyeSvg({ pa }) {
  const maxErr = Math.max(1.5, Number(pa.total_error_arcmin || 0));
  const scale = maxErr > 60 ? 180 : maxErr > 20 ? 60 : maxErr > 6 ? 20 : maxErr > 2 ? 6 : 2;
  const size = 230;
  const c = size / 2;
  const rMax = 94;
  const toXY = (az, alt) => ({
    x: c + Math.max(-1.08, Math.min(1.08, az / scale)) * rMax,
    y: c - Math.max(-1.08, Math.min(1.08, alt / scale)) * rMax,
  });
  const cur = toXY(pa.az_error_arcmin || 0, pa.alt_error_arcmin || 0);
  const ptsLen = (pa.points || []).length;
  const isAligned = ptsLen >= (pa.mode_points || 3) && Number(pa.total_error_arcmin || 0) <= 1.5;
  const colMain = store.nightVision ? '#ff1a1a' : isAligned ? '#10b981' : '#ef4444';
  const colRing = store.nightVision ? '#660000' : '#3f3f46';
  const trail = pa.breadcrumb_trail || [];

  return html`
    <div style="text-align:center">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">
        AUTO-ZOOM BULLSEYE: ±${scale}' FULL SCALE ${isAligned ? "• POLAR ALIGNED (<1.5')" : ''}
      </div>
      <svg
        width=${size}
        height=${size}
        style="background:var(--bg-oled);border-radius:999px;border:1px solid var(--border-col)"
      >
        <line x1="0" y1=${c} x2=${size} y2=${c} stroke=${colRing} stroke-dasharray="4 4" />
        <line x1=${c} y1="0" x2=${c} y2=${size} stroke=${colRing} stroke-dasharray="4 4" />
        <circle cx=${c} cy=${c} r=${rMax} fill="none" stroke=${colRing} />
        <circle cx=${c} cy=${c} r=${rMax * 0.66} fill="none" stroke=${colRing} />
        <circle cx=${c} cy=${c} r=${rMax * 0.33} fill="none" stroke=${colMain} stroke-width="1.6" />
        ${trail.map((pt, idx) => {
          const p = toXY(pt.az_error_arcmin, pt.alt_error_arcmin);
          return html`
            <circle
              key=${idx}
              cx=${p.x}
              cy=${p.y}
              r=${2.5 + idx * 0.8}
              fill=${colMain}
              opacity=${0.22 + idx * 0.14}
            />
          `;
        })}
        <line x1=${cur.x} y1=${cur.y} x2=${c} y2=${c} stroke=${colMain} stroke-width="2.5" />
        <circle cx=${cur.x} cy=${cur.y} r="6.5" fill=${colMain} />
      </svg>
    </div>
  `;
}

export function PolarAlignView({ pa, isSim }) {
  const pts = pa.points ? pa.points.length : 0;
  const needed = pa.mode_points || 3;
  const calibrated = pts >= needed;
  const isAligned = calibrated && Number(pa.total_error_arcmin || 0) <= 1.5;

  const expVal = Number(store.manualExposure || 2.0);
  const isoVal = String(store.manualIso || '1600');

  const setPaMode = (modePoints) =>
    runAction(null, async () => {
      await api('/api/pa/start', 'POST', { mode_points: modePoints });
      await refreshAll();
    });

  const handleCapturePoint = () =>
    runAction('pa-capture', async () => {
      if ((pa.points || []).length < needed) {
        await api('/api/pa/capture-point', 'POST', { exposure_s: expVal, iso: isoVal });
      } else {
        await api('/api/pa/live-step', 'POST', { exposure_s: expVal, iso: isoVal });
      }
      await refreshAll();
    });

  const handleToggleLoop = () =>
    runAction(null, async () => {
      if (pa.loop_running) {
        await api('/api/pa/live-loop/stop', 'POST', { restore_raw: true });
      } else {
        await api('/api/pa/live-loop/start', 'POST', { exposure_s: expVal, iso: isoVal });
      }
      await refreshAll();
    });

  const handleSimAlign = () =>
    runAction(null, async () => {
      await api('/api/pa/sim-control', 'POST', {
        d_alt_arcmin: -Number(pa.alt_error_arcmin || 0) * 0.92,
        d_az_arcmin: -Number(pa.az_error_arcmin || 0) * 0.92,
      });
      await refreshAll();
    });

  return html`
    <div class="card">
      <div class="card-header">
        <h3>1. Polar Alignment (${needed}-Point All-Sky)</h3>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm ${needed === 3 ? 'btn-active' : ''}" onClick=${() => setPaMode(3)}>
            3-Pt (+Bump Check)
          </button>
          <button class="btn btn-sm ${needed === 2 ? 'btn-active' : ''}" onClick=${() => setPaMode(2)}>
            2-Pt Fast
          </button>
          ${pts > 0
            ? html`<button class="btn btn-sm" onClick=${() => setPaMode(needed)}>Reset</button>`
            : null}
        </div>
      </div>

      <div class="step-banner ${isAligned ? 'aligned' : ''}">
        <${StepBannerContent} pts=${pts} needed=${needed} isAligned=${isAligned} totalErr=${pa.total_error_arcmin} />
      </div>

      ${pa.solve_warning
        ? html`
            <div class="step-banner" style="border-left-color:var(--warn-col);background:var(--warn-bg);font-size:12px">
              ⚠️ ${pa.solve_warning}
            </div>
          `
        : null}

      ${!calibrated
        ? html`
            <button class="btn btn-lg btn-primary" onClick=${handleCapturePoint} disabled=${Boolean(store.busyAction)}>
              ${store.busyAction === 'pa-capture'
                ? '⏳ EXPOSING & PLATE-SOLVING...'
                : `📸 CAPTURE CALIBRATION POINT ${pts + 1} OF ${needed} (${store.manualExposure}s @ ISO ${store.manualIso})`}
            </button>
          `
        : html`
            <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
              <button class="btn btn-lg ${pa.loop_running ? 'btn-warn' : 'btn-primary'}" onClick=${handleToggleLoop}>
                ${pa.loop_running ? '⏹ STOP LIVE LOOP (RESTORE RAW)' : '▶ START 2.5s LIVE SOLVE LOOP'}
              </button>
              <button class="btn btn-lg" onClick=${handleCapturePoint} disabled=${Boolean(store.busyAction)}>
                ${store.busyAction === 'pa-capture' ? '⏳ SOLVING...' : 'SINGLE SOLVE'}
              </button>
            </div>
          `}

      <${BullseyeSvg} pa=${pa} />

      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">WEDGE ALTITUDE</div>
          <div class="kpi-val">${pa.alt_error_arcmin >= 0 ? '+' : ''}${Number(pa.alt_error_arcmin || 0).toFixed(1)}'</div>
          <div class="kpi-sub"><strong>${pa.alt_direction}</strong> (~${pa.sa2i_knob_turns} turns)</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">WEDGE AZIMUTH</div>
          <div class="kpi-val">${pa.az_error_arcmin >= 0 ? '+' : ''}${Number(pa.az_error_arcmin || 0).toFixed(1)}'</div>
          <div class="kpi-sub"><strong>${pa.az_direction}</strong></div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">TOTAL ERROR</div>
          <div class="kpi-val">${Number(pa.total_error_arcmin || 0).toFixed(2)}'</div>
          <div class="kpi-sub">
            Bump: ${Number(pa.bump_residual_arcmin || 0).toFixed(2)}' ${pa.bump_warning ? '⚠️' : '✓'}
          </div>
        </div>
      </div>

      ${isSim && store.showSimControls
        ? html`
            <div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
              <button class="btn btn-sm" onClick=${handleSimAlign}>Simulate Turning Wedge Knobs (&lt;1')</button>
            </div>
          `
        : null}
    </div>
  `;
}
