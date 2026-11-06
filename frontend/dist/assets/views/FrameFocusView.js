/**
 * Step 2: Push-To Framing (141-Object Live Catalog) & Hands-Free Focus / Star Roundness Aid
 */

import { html } from '../vendor/htm.mjs';
import { DEFAULT_TARGETS, enrichCatalogLive } from '../catalog.js';
import {
  store,
  updateStore,
  classifyEccentricity,
  api,
  runAction,
  showNotice,
  loadCatalog,
  refreshAll,
} from '../store.js';

function HfrSparkline({ history }) {
  if (!history || history.length < 2) return null;
  const ptsArr = history.slice(-15);
  const vals = ptsArr.map((item) => Number(item.hfr || 0));
  const minV = Math.min(...vals, 1.2);
  const maxV = Math.max(...vals, minV + 1.5);
  const w = 280;
  const h = 46;
  const col = store.nightVision ? '#ff1a1a' : '#10b981';
  const poly = ptsArr
    .map((item, idx) => {
      const x = (idx / (ptsArr.length - 1)) * (w - 16) + 8;
      const y = h - ((Number(item.hfr || 0) - minV) / (maxV - minV)) * (h - 14) - 7;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return html`
    <div style="background:var(--bg-oled);border:1px solid var(--border-col);border-radius:8px;padding:6px 10px">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:2px">
        <span>HFR FOCUS TREND (V-CURVE)</span>
        <span>Range: ${minV.toFixed(2)}px – ${maxV.toFixed(2)}px</span>
      </div>
      <svg viewBox=${`0 0 ${w} ${h}`} style="width:100%;height:42px">
        <polyline fill="none" stroke=${col} stroke-width="2" points=${poly} />
      </svg>
    </div>
  `;
}

export function FrameFocusView({ framing, focus, observer, isSim }) {
  const isFraming = store.subTabFrame === 'FRAMING';
  const expVal = Number(store.manualExposure || 2.0);
  const isoVal = String(store.manualIso || '1600');

  if (isFraming) {
    const rawTargets = store.catalog && store.catalog.length > 0 ? store.catalog : DEFAULT_TARGETS;
    const allTargets = enrichCatalogLive(rawTargets, observer);

    const tpoPicks = allTargets.filter((t) => t.is_tpo180_pick);
    const messierTargets = allTargets.filter((t) => t.id && t.id.startsWith('M') && !t.is_tpo180_pick);
    const focusStars = allTargets.filter((t) => t.object_type === 'Focus Star');
    const otherTargets = allTargets.filter(
      (t) => !t.is_tpo180_pick && !(t.id && t.id.startsWith('M')) && t.object_type !== 'Focus Star'
    );

    let visibleCatalog = allTargets;
    if (store.catalogTpo180Only) {
      visibleCatalog = visibleCatalog.filter((item) => item.is_tpo180_pick);
    }
    if (store.catalogAboveHorizon) {
      visibleCatalog = visibleCatalog.filter((item) => (item.current_alt_deg ?? 0) >= 5);
    }
    if (store.catalogSearch.trim()) {
      const q = store.catalogSearch.trim().toLowerCase();
      visibleCatalog = visibleCatalog.filter(
        (item) =>
          (item.id && item.id.toLowerCase().includes(q)) ||
          (item.common_name && item.common_name.toLowerCase().includes(q)) ||
          (item.catalog_ids && item.catalog_ids.toLowerCase().includes(q)) ||
          (item.constellation && item.constellation.toLowerCase().includes(q))
      );
    }

    const selectTargetObj = (item) =>
      runAction(null, async () => {
        await api('/api/framing/select-target', 'POST', {
          target_id: item.id,
          target_name: item.common_name,
          target_ra_hours: Number(item.ra_hours),
          target_dec_deg: Number(item.dec_deg),
        });
        await refreshAll();
      });

    const handleQuickPick = async (e) => {
      const selectedId = e.target.value;
      if (selectedId === 'CUSTOM') {
        updateStore({ customTargetOpen: true });
        return;
      }
      const item = allTargets.find((c) => c.id === selectedId);
      if (item) await selectTargetObj(item);
    };

    const handleApplyCustom = () =>
      runAction(null, async () => {
        await api('/api/framing/select-target', 'POST', {
          target_id: 'CUSTOM',
          target_name: store.customTargetName || 'Custom Target',
          target_ra_hours: store.customTargetRa,
          target_dec_deg: store.customTargetDec,
        });
        updateStore({ customTargetOpen: false });
        showNotice(`Custom target "${store.customTargetName}" selected.`, 'ok', 4000);
        await refreshAll();
      });

    const handleToggleTpo = () => {
      updateStore({ catalogTpo180Only: !store.catalogTpo180Only });
      loadCatalog().catch(() => {});
    };

    const handleToggleHorizon = () => {
      updateStore({ catalogAboveHorizon: !store.catalogAboveHorizon });
      loadCatalog().catch(() => {});
    };

    const handleFrameSolve = (simCenter = false) =>
      runAction('frame-solve', async () => {
        const body = { exposure_s: expVal, iso: isoVal };
        if (simCenter) body.sim_center_on_target = true;
        await api('/api/framing/solve', 'POST', body);
        await refreshAll();
      });

    const renderOpt = (t) => {
      const isSel = t.id === framing.target_id || t.common_name === framing.target_name;
      const altStr = t.current_alt_deg !== undefined ? ` (Alt ${t.current_alt_deg}°)` : '';
      return html`<option key=${t.id} value=${t.id} selected=${isSel}>${t.common_name}${altStr}</option>`;
    };

    const selectedQuickId =
      allTargets.find((t) => t.id === framing.target_id || t.common_name === framing.target_name)?.id ||
      (framing.target_id === 'CUSTOM' ? 'CUSTOM' : '');

    return html`
      <div class="card">
        <div class="seg-bar">
          <button class="seg-btn active" onClick=${() => updateStore({ subTabFrame: 'FRAMING' })}>🎯 2A. Push-To Framing</button>
          <button class="seg-btn" onClick=${() => updateStore({ subTabFrame: 'FOCUS' })}>🔍 2B. Focus &amp; HFR Aid</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-elevated);padding:10px 12px;border-radius:8px;border:1px solid var(--border-col)">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1">
            <label for="target-quick-pick" style="font-size:12px;font-weight:800;color:var(--accent);letter-spacing:0.04em;white-space:nowrap">
              🎯 TARGET:
            </label>
            <select
              id="target-quick-pick"
              class="ctrl-sel"
              value=${selectedQuickId}
              onChange=${handleQuickPick}
              style="font-size:13px;padding:6px 10px;flex:1;min-width:240px;background:var(--bg-elevated);border-color:var(--accent);color:var(--text-main);font-weight:700"
            >
              <optgroup label="★ TPO 180mm Wide-Field Showcase (Tailored for APS-C)">
                ${tpoPicks.map(renderOpt)}
              </optgroup>
              <optgroup label="Complete Messier Catalog (M1 – M110)">
                ${messierTargets.map(renderOpt)}
              </optgroup>
              <optgroup label="Focus & Calibration Stars">
                ${focusStars.map(renderOpt)}
              </optgroup>
              ${otherTargets.length > 0
                ? html`<optgroup label="Other Deep-Sky Targets">${otherTargets.map(renderOpt)}</optgroup>`
                : null}
              <optgroup label="Custom Coordinates">
                <option value="CUSTOM" selected=${framing.target_id === 'CUSTOM'}>
                  + Custom Coordinates (${store.customTargetName})
                </option>
              </optgroup>
            </select>
            <span style="font-size:11px;font-family:monospace;color:var(--text-muted);white-space:nowrap">
              RA ${Number(framing.target_ra_hours).toFixed(2)}h, Dec ${Number(framing.target_dec_deg).toFixed(2)}°
            </span>
          </div>
          <button class="btn btn-sm" onClick=${() => updateStore({ customTargetOpen: !store.customTargetOpen })}>
            ${store.customTargetOpen ? '✕ Close Custom' : '+ Custom RA/Dec'}
          </button>
        </div>

        ${store.customTargetOpen
          ? html`
              <div class="kpi-box" style="text-align:left;display:grid;gap:8px">
                <div style="font-size:11px;font-weight:800;color:var(--text-muted)">
                  ENTER CUSTOM J2000 COORDINATES (DECIMAL OR HH:MM:SS)
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px">
                  <input
                    id="custom-name-inp"
                    placeholder="Target Name"
                    value=${store.customTargetName}
                    onInput=${(e) => updateStore({ customTargetName: e.target.value })}
                  />
                  <input
                    id="custom-ra-inp"
                    placeholder="RA (20:59:17)"
                    value=${store.customTargetRa}
                    onInput=${(e) => updateStore({ customTargetRa: e.target.value })}
                  />
                  <input
                    id="custom-dec-inp"
                    placeholder="Dec (+44:19:48)"
                    value=${store.customTargetDec}
                    onInput=${(e) => updateStore({ customTargetDec: e.target.value })}
                  />
                </div>
                <button class="btn btn-sm btn-primary" onClick=${handleApplyCustom}>Set Custom Target</button>
              </div>
            `
          : null}

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input
            id="catalog-search-inp"
            type="search"
            style="flex:1;min-width:180px"
            placeholder="Search M1–M110, NGC, Nebula, Star (e.g. M31, NGC 7000, Orion)..."
            value=${store.catalogSearch}
            onInput=${(e) => updateStore({ catalogSearch: e.target.value })}
          />
          <button class="btn btn-sm ${store.catalogTpo180Only ? 'btn-ok' : ''}" onClick=${handleToggleTpo} style="white-space:nowrap">
            ${store.catalogTpo180Only ? '★ TPO 180 Picks Only ✓' : '★ TPO 180 Picks'}
          </button>
          <button class="btn btn-sm ${store.catalogAboveHorizon ? 'btn-active' : ''}" onClick=${handleToggleHorizon} style="white-space:nowrap">
            ${store.catalogAboveHorizon ? 'Above Horizon ✓' : 'All Sky (141 Targets)'}
          </button>
        </div>

        <div class="catalog-list" id="framing-catalog-list">
          ${store.catalogLoading
            ? html`<div style="padding:16px;text-align:center;color:var(--text-muted)">⏳ Updating live altitudes...</div>`
            : visibleCatalog.length > 0
              ? visibleCatalog.map((item) => {
                  const isSel = item.id === framing.target_id || item.common_name === framing.target_name;
                  return html`
                    <button
                      key=${item.id}
                      class="catalog-item ${isSel ? 'selected' : ''}"
                      onClick=${() => selectTargetObj(item)}
                    >
                      <div style="padding-right:8px">
                        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
                          <strong>${item.common_name}</strong>
                          ${item.is_tpo180_pick
                            ? html`<span class="badge badge-raw" style="font-size:10px;padding:1px 6px;margin-left:4px">★ TPO 180 PICK</span>`
                            : null}
                          ${item.bortle8_badge
                            ? html`<span class="badge" style="font-size:9px;padding:1px 5px;margin-left:4px">${item.bortle8_badge}</span>`
                            : null}
                        </div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                          ${item.catalog_ids || item.id} • ${item.constellation || ''} ${item.notes ? `— ${item.notes}` : ''}
                        </div>
                      </div>
                      <div style="text-align:right;white-space:nowrap">
                        ${item.current_alt_deg !== undefined
                          ? html`<span class="badge" style="font-size:10px">Alt ${item.current_alt_deg}°</span>`
                          : null}
                        ${item.airmass
                          ? html`<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${item.airmass}x airmass</div>`
                          : null}
                      </div>
                    </button>
                  `;
                })
              : html`
                  <div style="padding:14px;font-size:12px;color:var(--text-muted);text-align:center">
                    No matching objects found.
                    <button
                      class="btn btn-sm"
                      onClick=${() => updateStore({ catalogAboveHorizon: false, catalogTpo180Only: false, catalogSearch: '' })}
                      style="margin-left:6px"
                    >
                      Clear Filters
                    </button>
                  </div>
                `}
        </div>

        <button class="btn btn-lg btn-primary" onClick=${() => handleFrameSolve(false)} disabled=${Boolean(store.busyAction)}>
          ${store.busyAction === 'frame-solve'
            ? '⏳ EXPOSING & PLATE-SOLVING...'
            : `📸 CAPTURE & PLATE-SOLVE PUSH-TO OFFSET (${store.manualExposure}s @ ISO ${store.manualIso})`}
        </button>

        ${framing.solved
          ? html`
              <div class="step-banner ${framing.on_target ? 'aligned' : ''}">
                ${framing.on_target
                  ? html`<strong>TARGET CENTERED (${framing.angular_separation_deg}° offset)!</strong> Ready to start your imaging sequence.`
                  : html`<strong>Offset to ${framing.target_name}: ${framing.angular_separation_deg}°</strong> — Follow either mount adjustment guide below, then re-solve:`}
              </div>
              <div class="kpi-grid kpi-grid-2col-sm">
                <div class="kpi-box" style="text-align:left">
                  <div class="kpi-label">DEC L-BRACKET (RA / DEC)</div>
                  <div style="font-size:12px;line-height:1.5;font-weight:700">
                    ${(framing.instructions_equatorial || []).map((line, i) => html`<div key=${i}>${line}</div>`)}
                  </div>
                </div>
                <div class="kpi-box" style="text-align:left">
                  <div class="kpi-label">BALL-HEAD (CAMERA X / Y)</div>
                  <div style="font-size:12px;line-height:1.5;font-weight:700">
                    ${(framing.instructions_ballhead || []).map((line, i) => html`<div key=${i}>${line}</div>`)}
                  </div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-label">SENSOR ROLL / FOV</div>
                  <div class="kpi-val">${framing.rotation_pa_deg}°</div>
                  <div class="kpi-sub">${framing.fov_x_deg}° × ${framing.fov_y_deg}°</div>
                </div>
              </div>
            `
          : null}

        ${isSim && store.showSimControls
          ? html`
              <div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                <button class="btn btn-sm" onClick=${() => handleFrameSolve(true)}>Simulate Slewing Onto Target</button>
              </div>
            `
          : null}
      </div>
    `;
  }

  // 2B: FOCUS & HFR AID
  const eccInfo = classifyEccentricity(focus.eccentricity_median);

  const handleFocusLoop = () =>
    runAction(null, async () => {
      if (focus.loop_running) {
        await api('/api/framing/focus-loop/stop', 'POST');
      } else {
        await api('/api/framing/focus-loop/start', 'POST', { exposure_s: expVal, iso: isoVal });
      }
      await refreshAll();
    });

  const handleFocusShot = (simDelta = null) =>
    runAction('focus-shot', async () => {
      const body = { exposure_s: expVal, iso: isoVal };
      if (simDelta !== null) body.sim_focus_delta = simDelta;
      await api('/api/framing/focus-step', 'POST', body);
      await refreshAll();
    });

  const handleResetMin = () =>
    runAction(null, async () => {
      await api('/api/framing/focus-roi', 'POST', { roi: focus.roi, reset_history: true });
      await refreshAll();
    });

  const handleToggleRoi = () =>
    runAction(null, async () => {
      const hasRoi = Boolean(focus.roi);
      await api('/api/framing/focus-roi', 'POST', {
        clear: hasRoi,
        roi: hasRoi ? null : { x: 0.5, y: 0.5, size: 240 },
      });
      await refreshAll();
    });

  return html`
    <div class="card">
      <div class="seg-bar">
        <button class="seg-btn" onClick=${() => updateStore({ subTabFrame: 'FRAMING' })}>🎯 2A. Push-To Framing</button>
        <button class="seg-btn active" onClick=${() => updateStore({ subTabFrame: 'FOCUS' })}>🔍 2B. Focus &amp; HFR Aid</button>
      </div>

      <div class="step-banner">
        <strong>Hands-Free Focus Loop:</strong> Start the continuous loop and slowly twist the TPO 180mm focus ring until <strong>Median HFR</strong> reaches its lowest value (audio pitch rises as stars sharpen).
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
        <button class="btn btn-lg ${focus.loop_running ? 'btn-warn' : 'btn-primary'}" onClick=${handleFocusLoop}>
          ${focus.loop_running ? '⏹ STOP FOCUS LOOP (RAW)' : '▶ START CONTINUOUS FOCUS LOOP'}
        </button>
        <button class="btn btn-lg" onClick=${() => handleFocusShot(null)} disabled=${Boolean(store.busyAction)}>
          ${store.busyAction === 'focus-shot' ? '⏳ EXPOSING...' : `SINGLE SHOT (${store.manualExposure}s)`}
        </button>
      </div>

      <div class="kpi-grid kpi-grid-4">
        <div class="kpi-box">
          <div class="kpi-label">CURRENT MEDIAN HFR</div>
          <div class="kpi-val">${focus.hfr_median > 0 ? `${Number(focus.hfr_median).toFixed(2)}px` : '--'}</div>
          <div class="kpi-sub">Lower is sharper</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">BEST MIN HFR</div>
          <div class="kpi-val" style="color:var(--ok-col)">
            ${focus.min_hfr_achieved ? `${Number(focus.min_hfr_achieved).toFixed(2)}px` : '--'}
          </div>
          <div class="kpi-sub">
            <button class="btn btn-sm" style="min-height:22px;padding:1px 6px;font-size:10px" onClick=${handleResetMin}>
              Reset Min
            </button>
          </div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">FWHM / STARS</div>
          <div class="kpi-val">${focus.fwhm_arcsec > 0 ? `${Number(focus.fwhm_arcsec).toFixed(1)}"` : '--'}</div>
          <div class="kpi-sub">${focus.star_count || 0} stars measured</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">STAR ECCENTRICITY</div>
          <div class="kpi-val" style=${eccInfo.trailed ? 'color:var(--warn-col)' : ''}>
            ${eccInfo.val > 0 ? eccInfo.text : '--'}
          </div>
          <div class="kpi-sub" style=${eccInfo.trailed ? 'color:var(--warn-col);font-weight:700' : ''}>
            ${eccInfo.shortLabel}
          </div>
        </div>
      </div>

      <${HfrSparkline} history=${focus.history} />

      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-muted)">
          Sub-frame ROI Mode: <strong>${focus.roi ? '1:1 Center Crop (240px)' : 'Full Sensor Field'}</strong>
        </span>
        <button class="btn btn-sm ${focus.roi ? 'btn-active' : ''}" onClick=${handleToggleRoi}>
          ${focus.roi ? 'Disable 1:1 ROI Crop' : 'Enable 1:1 Center ROI Crop'}
        </button>
      </div>

      ${isSim && store.showSimControls
        ? html`
            <div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
              <button class="btn btn-sm" onClick=${() => handleFocusShot(-0.5)}>
                Simulate Turning Focus Ring (-0.5 step)
              </button>
            </div>
          `
        : null}
    </div>
  `;
}
