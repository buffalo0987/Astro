/**
 * Step 3: .CR3 RAW Sequencer, Auto-Light & Auto-Flat Calibration Wizards, Physical Interlocks & Live Trailing Monitor
 */

import { html } from '../vendor/htm.mjs';
import { formatDuration } from '../catalog.js';
import {
  store,
  updateStore,
  PREVIEW_EXP_OPTIONS,
  classifyEccentricity,
  evaluateFlatHistogram,
  api,
  runAction,
  showNotice,
  refreshAll,
} from '../store.js';

export function SequenceView({ sequence, framing, camera, system, observer, preview }) {
  const steps = store.editingSteps || [
    { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 20, cooldown_s: 2.0 },
  ];

  const totalFrames = steps.reduce((acc, s) => acc + Number(s.total_count || 0), 0);
  const totalSeconds = steps.reduce(
    (acc, s) => acc + Number(s.total_count || 0) * (Number(s.exposure_s || 0) + Number(s.cooldown_s || 0)),
    0
  );

  const isRunning =
    sequence.status === 'RUNNING' ||
    sequence.status === 'PAUSED' ||
    sequence.status === 'AWAITING_INTERLOCK' ||
    sequence.status === 'INTERLOCK_PAUSED';

  const camOk = camera.driver_mode === 'gphoto2';
  const clkOk = Boolean(observer.last_synced_at);
  const diskOk = Number(system.disk_free_gb || 0) >= 2.0;

  let interlockBtnLabel = '✓ READY — RESUME SEQUENCE';
  if (sequence.interlock_type === 'Dark' || sequence.interlock_type === 'Bias') {
    interlockBtnLabel = `✓ LENS CAP IS ON — START ${String(sequence.interlock_type).toUpperCase()} FRAMES`;
  } else if (sequence.interlock_type === 'Flat') {
    interlockBtnLabel = '✓ FLAT PANEL / T-SHIRT READY — START FLATS';
  } else if (sequence.interlock_type === 'Light') {
    interlockBtnLabel = '✓ LENS UNCOVERED & TRACKING ON — START LIGHTS';
  }

  const lastEcc = classifyEccentricity(sequence.last_frame_eccentricity);

  const updateStepField = (idx, field, rawVal) => {
    const base = store.editingSteps ? store.editingSteps.map((st) => ({ ...st })) : steps.map((st) => ({ ...st }));
    if (!base[idx]) return;
    base[idx][field] = field === 'frame_type' || field === 'iso' ? rawVal : Number(rawVal);
    updateStore({ editingSteps: base, planSavedBanner: false });
  };

  const applyPreset = (presetSteps) => {
    updateStore({ editingSteps: presetSteps, planSavedBanner: false });
  };

  const handleAddStep = () => {
    const base = store.editingSteps ? [...store.editingSteps] : [...steps];
    base.push({ frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 15, cooldown_s: 2.0 });
    updateStore({ editingSteps: base, planSavedBanner: false });
  };

  const handleRemoveStep = (idx) => {
    const base = store.editingSteps ? [...store.editingSteps] : [...steps];
    if (base.length <= 1) return;
    base.splice(idx, 1);
    updateStore({ editingSteps: base, planSavedBanner: false });
  };

  const handleSavePlan = () =>
    runAction(null, async () => {
      const saved = await api('/api/sequence/plans', 'POST', {
        id: store.editingPlanId,
        name: store.editingPlanName || `${framing.target_name} Plan`,
        target_name: framing.target_name,
        target_ra_hours: framing.target_ra_hours,
        target_dec_deg: framing.target_dec_deg,
        steps,
      });
      updateStore({ editingPlanId: saved.id, planSavedBanner: true });
      await refreshAll();
    });

  const handleStartSeq = () =>
    runAction('seq-start', async () => {
      const saved = await api('/api/sequence/plans', 'POST', {
        id: store.editingPlanId,
        name: store.editingPlanName || `${framing.target_name} Plan`,
        target_name: framing.target_name,
        target_ra_hours: framing.target_ra_hours,
        target_dec_deg: framing.target_dec_deg,
        steps,
      });
      updateStore({ editingPlanId: saved.id });
      await api(`/api/sequence/plans/${saved.id}/start`, 'POST', { reset_progress: true });
      showNotice(`Started .CR3 imaging sequence for ${framing.target_name}!`, 'ok', 5000);
      await refreshAll();
    });

  const handlePauseResume = () =>
    runAction(null, async () => {
      await api(sequence.status === 'PAUSED' ? '/api/sequence/resume' : '/api/sequence/pause', 'POST');
      await refreshAll();
    });

  const handleAbort = () =>
    runAction(null, async () => {
      if (!store.abortArmed) {
        updateStore({ abortArmed: true });
        setTimeout(() => {
          if (store.abortArmed) updateStore({ abortArmed: false });
        }, 4000);
        return;
      }
      updateStore({ abortArmed: false });
      await api('/api/sequence/abort', 'POST');
      showNotice('Imaging sequence aborted & camera restored to RAW (.CR3).', 'warn', 5000);
      await refreshAll();
    });

  const handleAutoLight = () =>
    runAction('auto-light', async () => {
      updateStore({ histMode: 'LIGHT' });
      const res = await api('/api/camera/auto-light', 'POST', {});
      const base = store.editingSteps ? store.editingSteps.map((st) => ({ ...st })) : steps.map((st) => ({ ...st }));
      let updatedLight = false;
      const newExp = Number(res.exposure_s);
      const newIso = String(res.iso);

      for (const st of base) {
        if (st.frame_type === 'Light') {
          const prevTotalSec = Number(st.total_count || 0) * Number(st.exposure_s || 0);
          if (prevTotalSec >= 600 && newExp > 0) {
            st.total_count = Math.max(5, Math.round(prevTotalSec / newExp));
          }
          st.exposure_s = newExp;
          st.iso = newIso;
          updatedLight = true;
        } else if (st.frame_type === 'Dark') {
          st.exposure_s = newExp;
          st.iso = newIso;
        } else if (st.frame_type === 'Bias') {
          st.iso = newIso;
        }
      }
      if (!updatedLight) {
        base.unshift({
          frame_type: 'Light',
          exposure_s: newExp,
          iso: newIso,
          total_count: Math.max(10, Math.round(3600 / Math.max(10, newExp))),
          cooldown_s: 2.0,
        });
      }
      updateStore({ lastAutoLight: res, editingSteps: base, planSavedBanner: false });
      await refreshAll();
      showNotice(res.message, res.pa_tip ? 'warn' : 'ok', 10000);
    });

  const handleAutoFlat = () =>
    runAction('auto-flat', async () => {
      updateStore({ histMode: 'FLAT' });
      const res = await api('/api/camera/auto-flat', 'POST', {});
      if (res.converged) {
        const base = store.editingSteps ? store.editingSteps.map((st) => ({ ...st })) : steps.map((st) => ({ ...st }));
        let updatedFlatStep = false;
        for (const st of base) {
          if (st.frame_type === 'Flat') {
            st.exposure_s = Number(res.exposure_s);
            st.iso = String(res.iso);
            updatedFlatStep = true;
          }
        }
        if (!updatedFlatStep && sequence.status !== 'AWAITING_INTERLOCK') {
          base.push({
            frame_type: 'Flat',
            exposure_s: Number(res.exposure_s),
            iso: String(res.iso),
            total_count: 20,
            cooldown_s: 1.0,
          });
        }
        updateStore({
          lastAutoFlat: res,
          flatCalibratedExp: Number(res.exposure_s),
          flatCalibratedIso: String(res.iso),
          flatCalibratedLabel: res.shutter_label || `${res.exposure_s}s`,
          editingSteps: base,
          planSavedBanner: false,
        });
        await refreshAll();
        showNotice(res.message, res.flicker_warning ? 'warn' : 'ok', res.flicker_warning ? 12000 : 8000);
      } else {
        updateStore({ lastAutoFlat: res });
        await refreshAll();
        showNotice(res.message || 'Auto-Flat could not reach 35–55% ADU.', 'warn', 12000);
      }
    });

  const handleFlatTestShot = () =>
    runAction('flat-test-shot', async () => {
      updateStore({ histMode: 'FLAT' });
      const expVal = Number(store.manualExposure || 0.5);
      const flatIso = String(store.flatCalibratedIso || sequence.pending_step_iso || '100');
      await api('/api/camera/capture', 'POST', {
        exposure_s: expVal,
        iso: flatIso,
        frame_type: 'Flat',
        fast_jpeg: true,
        auto_stretch: false,
      });
      updateStore({
        flatCalibratedExp: expVal,
        flatCalibratedIso: flatIso,
        flatCalibratedLabel: null,
      });
      await refreshAll();
      const fEval = evaluateFlatHistogram(store.state?.preview?.histogram);
      showNotice(
        `Flat Test (${expVal}s @ ISO ${flatIso}): ${fEval.pct}% ADU — ${fEval.label}`,
        fEval.ok ? 'ok' : 'warn',
        8000
      );
    });

  const handleConfirmInterlock = () =>
    runAction(null, async () => {
      const confirmPayload = {};
      if (sequence.interlock_type === 'Flat') {
        if (store.flatCalibratedExp !== null) confirmPayload.exposure_s = Number(store.flatCalibratedExp);
        if (store.flatCalibratedIso !== null) confirmPayload.iso = String(store.flatCalibratedIso);
      }
      updateStore({
        flatCalibratedExp: null,
        flatCalibratedIso: null,
        flatCalibratedLabel: null,
        histMode: store.histMode === 'FLAT' ? 'AUTO' : store.histMode,
      });
      await api('/api/sequence/confirm-interlock', 'POST', confirmPayload);
      await refreshAll();
    });

  const fEval = evaluateFlatHistogram(preview?.histogram);
  const flatIso = store.flatCalibratedIso || sequence.pending_step_iso || '100';
  const curExpOpt = PREVIEW_EXP_OPTIONS.find((o) => Number(o.val) === Number(store.manualExposure));
  const expLabel = curExpOpt ? curExpOpt.label : `${store.manualExposure}s`;

  return html`
    <div class="card">
      <div class="card-header">
        <h3>3. .CR3 RAW Sequencer (${sequence.status})</h3>
        <span class="badge badge-raw">Total Plan: ${totalFrames} frames (${formatDuration(totalSeconds)})</span>
      </div>

      ${sequence.interlock_required
        ? html`
            <div class="step-banner" style="border-left-color:var(--warn-col);background:var(--warn-bg);display:grid;gap:8px">
              <div><strong>⚠️ PHYSICAL CALIBRATION INTERLOCK: ${sequence.interlock_type}</strong></div>
              <div>${sequence.interlock_message}</div>
              ${sequence.interlock_type === 'Flat'
                ? html`
                    <div style="background:var(--bg-oled);border:1px solid var(--border-col);border-radius:6px;padding:8px 10px;font-size:12px;display:grid;gap:6px">
                      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                        <span><strong>Siril Flat ADU Check (Target 35–55%):</strong> ${fEval.label}</span>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                          <button class="btn btn-sm btn-primary" onClick=${handleAutoFlat} disabled=${Boolean(store.busyAction)}>
                            ${store.busyAction === 'auto-flat' ? '⏳ Auto-Calibrating...' : '⚡ Auto-Calibrate Flat'}
                          </button>
                          <button class="btn btn-sm" onClick=${handleFlatTestShot} disabled=${Boolean(store.busyAction)}>
                            ${store.busyAction === 'flat-test-shot' ? '⏳ Measuring...' : `📸 Manual Test (${expLabel} @ ISO ${flatIso})`}
                          </button>
                        </div>
                      </div>
                      ${store.lastAutoFlat?.flicker_warning
                        ? html`
                            <div style="color:var(--warn-col);font-size:11px">
                              ⚠️ <strong>PWM Flicker Note (&lt;1/250s):</strong> Dim your screen/panel or add a layer of folded white T-shirt/paper to avoid horizontal LED banding.
                            </div>
                          `
                        : null}
                      <div style="font-size:11px;color:var(--text-muted)">
                        ${store.flatCalibratedExp !== null
                          ? html`
                              <strong style="color:var(--ok-col)">✓ Calibrated Flat Ready:</strong> Will shoot Flats at
                              <strong> ${store.flatCalibratedLabel || `${store.flatCalibratedExp}s`} @ ISO ${flatIso}</strong> when you confirm below.
                            `
                          : html`Tap <strong>⚡ Auto-Calibrate Flat</strong> to automatically solve best shutter speed &amp; ISO for 35–55% ADU (or use Manual Test).`}
                      </div>
                    </div>
                  `
                : null}
              <button class="btn btn-lg btn-primary" onClick=${handleConfirmInterlock}>
                ${interlockBtnLabel}
              </button>
            </div>
          `
        : null}

      <div class="preflight-grid">
        <div class="preflight-pill">
          <span style="color:var(--text-muted)">CAMERA</span>
          <strong style=${`color:${camOk ? 'var(--ok-col)' : 'var(--warn-col)'}`}>
            ${camOk ? '🟢 EOS M200' : '⚠️ Simulator'}
          </strong>
        </div>
        <div class="preflight-pill">
          <span style="color:var(--text-muted)">CLOCK</span>
          <strong style=${`color:${clkOk ? 'var(--ok-col)' : 'var(--warn-col)'}`}>
            ${clkOk ? '🟢 Synced' : '⚠️ Tap Clock'}
          </strong>
        </div>
        <div class="preflight-pill">
          <span style="color:var(--text-muted)">STORAGE</span>
          <strong style=${`color:${diskOk ? 'var(--ok-col)' : 'var(--accent)'}`}>
            ${diskOk ? `🟢 ${system.disk_free_gb} GB` : `⚠️ ${system.disk_free_gb} GB`}
          </strong>
        </div>
      </div>

      <div class="kpi-grid kpi-grid-4">
        <div class="kpi-box">
          <div class="kpi-label">ACTIVE STEP</div>
          <div class="kpi-val">${sequence.current_frame_type || 'IDLE'}</div>
          <div class="kpi-sub">${sequence.target_name || framing.target_name}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">COMPLETED</div>
          <div class="kpi-val">${sequence.overall_completed} / ${sequence.overall_total}</div>
          <div class="kpi-sub">Step: ${sequence.current_frame_num}/${sequence.total_step_frames}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">LAST SUB HFR</div>
          <div class="kpi-val">${sequence.last_frame_hfr ? `${Number(sequence.last_frame_hfr).toFixed(2)}px` : '--'}</div>
          <div class="kpi-sub">${sequence.last_saved_file ? 'Saved .CR3 ✓' : 'Ready'}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">STAR ROUNDNESS</div>
          <div class="kpi-val" style=${lastEcc.trailed ? 'color:var(--warn-col)' : ''}>
            ${lastEcc.val > 0 ? lastEcc.text : '--'}
          </div>
          <div class="kpi-sub" style=${lastEcc.trailed ? 'color:var(--warn-col);font-weight:700' : ''}>
            ${lastEcc.trailed ? '⚠️ Trailed (Check SA2i)' : lastEcc.shortLabel}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${!isRunning
          ? html`
              <button class="btn btn-lg btn-primary" onClick=${handleStartSeq} disabled=${Boolean(store.busyAction)}>
                ▶ SAVE &amp; START .CR3 IMAGING SEQUENCE
              </button>
            `
          : html`
              <button class="btn" style="flex:1" onClick=${handlePauseResume}>
                ${sequence.status === 'PAUSED' ? '▶ RESUME SEQUENCE' : '⏸ PAUSE AFTER CURRENT SHOT'}
              </button>
              <button class="btn ${store.abortArmed ? 'btn-primary' : ''}" style="flex:1" onClick=${handleAbort}>
                ${store.abortArmed ? '⚠️ TAP AGAIN TO CONFIRM ABORT' : '⏹ ABORT SEQUENCE'}
              </button>
            `}
      </div>

      <div style="border-top:1px solid var(--border-col);padding-top:10px;display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div style="font-size:11px;font-weight:800;color:var(--text-muted)">
            1-TAP SKY CONDITION TEMPLATES (FOR TPO 180mm f/4.5 + EOS M200):
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button
              class="btn btn-sm"
              onClick=${() =>
                applyPreset([
                  { frame_type: 'Light', exposure_s: 30, iso: '400', total_count: 60, cooldown_s: 1.5 },
                  { frame_type: 'Dark', exposure_s: 30, iso: '400', total_count: 20, cooldown_s: 1.0 },
                  { frame_type: 'Bias', exposure_s: 0.001, iso: '400', total_count: 30, cooldown_s: 0.5 },
                  { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
                ])}
              title="60x30s ISO 400 + Darks/Biases/Flats — avoids blowing out Bortle 8 skyglow"
            >
              🏙️ Bortle 8 Broadband (60×30s)
            </button>
            <button
              class="btn btn-sm"
              onClick=${() =>
                applyPreset([
                  { frame_type: 'Light', exposure_s: 120, iso: '800', total_count: 25, cooldown_s: 2.0 },
                  { frame_type: 'Dark', exposure_s: 120, iso: '800', total_count: 10, cooldown_s: 1.0 },
                  { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
                  { frame_type: 'Flat', exposure_s: 1.0, iso: '100', total_count: 20, cooldown_s: 1.0 },
                ])}
              title="25x120s ISO 800 Bulb for 2-inch Dual-Band Hα/OIII filter in Bortle 8"
            >
              🧪 Bortle 8 Dual-Band Filter (25×120s)
            </button>
            <button
              class="btn btn-sm"
              onClick=${() =>
                applyPreset([
                  { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 25, cooldown_s: 2.0 },
                  { frame_type: 'Dark', exposure_s: 90, iso: '800', total_count: 10, cooldown_s: 1.0 },
                  { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
                  { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
                ])}
              title="25x90s ISO 800 for Bortle 1–4 Dark Sky sites"
            >
              🌌 Dark Sky (25×90s)
            </button>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:2px">
          <div style="font-size:12px;font-weight:800;color:var(--text-muted)">
            SEQUENCE PLAN STEPS (AUTO-SWITCHES TO .CR3 RAW; &gt;30s USES EOS BULB TIMER)
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button
              class="btn btn-sm btn-primary"
              onClick=${handleAutoLight}
              disabled=${Boolean(store.busyAction || isRunning)}
              title="Shoot a 4s sky probe, plate-solve Declination, factor in SA2i tracking + PA drift, and solve optimal Light Exposure & ISO"
            >
              ${store.busyAction === 'auto-light' ? '⏳ Analyzing Sky...' : '🧠 Auto-Expose Lights'}
            </button>
            <button
              class="btn btn-sm"
              onClick=${handleAutoFlat}
              disabled=${Boolean(store.busyAction || sequence.status === 'RUNNING')}
              title="Point at your flat panel / twilight T-shirt and automatically solve best Flat exposure & ISO (35–55% ADU)"
            >
              ${store.busyAction === 'auto-flat' ? '⏳ Auto-Calibrating...' : '⚡ Auto-Calibrate Flat'}
            </button>
            <button class="btn btn-sm" onClick=${handleAddStep}>+ Add Step</button>
            <button class="btn btn-sm ${store.planSavedBanner ? 'btn-ok' : ''}" onClick=${handleSavePlan}>
              ${store.planSavedBanner ? 'Saved ✓' : 'Save Plan'}
            </button>
          </div>
        </div>

        ${store.lastAutoLight && !sequence.interlock_required
          ? (() => {
              const L = store.lastAutoLight;
              const decSign = L.dec_deg >= 0 ? '+' : '';
              const decBadge = L.declination_source === 'plate_solved' ? 'Plate-Solved' : 'Target';
              return html`
                <div style="font-size:11px;padding:7px 10px;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border-col);line-height:1.5">
                  <div style=${`color:${L.pa_tip ? 'var(--warn-col)' : 'var(--ok-col)'}`}>
                    🧠 <strong>Auto-Light Applied:</strong> <strong>${L.exposure_s}s @ ISO ${L.iso}</strong> (${L.uses_bulb ? 'EOS Bulb' : 'Native Shutter'}) — synced Dark &amp; Bias steps
                  </div>
                  <div style="color:var(--text-muted)">
                    <strong>SA2i Ceiling:</strong> ${Math.round(L.sa2i_max_exposure_s)}s (Dec ${decSign}${L.dec_deg}° [${decBadge}], PA ${L.pa_error_arcmin}') •
                    <strong>Skyfog:</strong> ~${L.projected_skyfog_pct}% ADU (${L.sky_rate_e_per_s} e⁻/s, ${L.swamp_factor}× RN², ${L.snr_efficiency_pct}% SNR eff) •
                    <strong>Limit:</strong> ${L.limiting_factor}
                  </div>
                  ${L.pa_tip ? html`<div style="color:var(--warn-col);margin-top:2px">⚠️ ${L.pa_tip}</div>` : null}
                </div>
              `;
            })()
          : null}

        ${store.lastAutoFlat?.converged && !sequence.interlock_required
          ? html`
              <div style=${`font-size:11px;padding:6px 10px;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border-col);color:${store.lastAutoFlat.flicker_warning ? 'var(--warn-col)' : 'var(--ok-col)'}`}>
                ⚡ <strong>Auto-Flat Applied:</strong> ${store.lastAutoFlat.shutter_label} (${store.lastAutoFlat.exposure_s}s) @ ISO ${store.lastAutoFlat.iso} → <strong>${store.lastAutoFlat.adu_pct}% ADU</strong> (${store.lastAutoFlat.iterations} probe${store.lastAutoFlat.iterations === 1 ? '' : 's'}, unclipped)${store.lastAutoFlat.flicker_warning ? ' — ⚠️ Faster than 1/250s; dim screen or add T-shirt layer to avoid LED banding.' : ''}
              </div>
            `
          : null}

        <div style="overflow-x:auto">
          <table class="step-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Exp (s)</th>
                <th>ISO</th>
                <th>Frames</th>
                <th>Wait (s)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${steps.map(
                (st, idx) => html`
                  <tr key=${idx}>
                    <td>
                      <select
                        value=${st.frame_type}
                        onChange=${(e) => updateStepField(idx, 'frame_type', e.target.value)}
                      >
                        ${['Light', 'Dark', 'Flat', 'Bias'].map(
                          (t) => html`<option key=${t} value=${t} selected=${st.frame_type === t}>${t}</option>`
                        )}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value=${st.exposure_s}
                        onInput=${(e) => updateStepField(idx, 'exposure_s', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value=${String(st.iso)}
                        onChange=${(e) => updateStepField(idx, 'iso', e.target.value)}
                      >
                        ${['100', '200', '400', '800', '1600', '3200', '6400'].map(
                          (iso) => html`<option key=${iso} value=${iso} selected=${String(st.iso) === iso}>${iso}</option>`
                        )}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value=${st.total_count}
                        onInput=${(e) => updateStepField(idx, 'total_count', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value=${st.cooldown_s ?? 2.0}
                        onInput=${(e) => updateStepField(idx, 'cooldown_s', e.target.value)}
                      />
                    </td>
                    <td style="text-align:right">
                      ${steps.length > 1
                        ? html`
                            <button
                              class="btn btn-sm"
                              onClick=${() => handleRemoveStep(idx)}
                              title="Remove step"
                            >
                              ✕
                            </button>
                          `
                        : null}
                    </td>
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
