/**
 * AstroPi Production Static PWA Bundle (Zero-Dependency ES2020 Client)
 * Synchronizes in real time over WebSocket (/ws) across all connected devices.
 */
(() => {
  const store = {
    nightVision: false,
    activeTab: 'PA',
    subTabFrame: 'FRAMING', // 'FRAMING' | 'FOCUS'
    state: null,
    catalog: [],
    catalogSearch: '',
    catalogAboveHorizon: true,
    catalogTpo180Only: false,
    customTargetOpen: false,
    customTargetName: 'Custom Target',
    customTargetRa: '20:59:17',
    customTargetDec: '+44:19:48',
    plans: [],
    editingSteps: null,
    editingPlanName: '',
    editingPlanId: null,
    planSavedBanner: false,
    sessions: [],
    expandedSessionId: null,
    storage: null,
    presets: [],
    drawerOpen: false,
    showSimControls: false,
    abortArmed: false,
    wsConnected: false,
    zoom: 1.0,
  };

  // Web Audio Cues for Dark-Sky Eyes-Free Operation
  let audioCtx = null;
  function playTone(freq, ms = 110, type = 'sine') {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch (_) {}
  }

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  }

  function formatDuration(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
  }

  async function loadCatalog() {
    const q = new URLSearchParams();
    if (store.catalogSearch.trim()) q.set('search', store.catalogSearch.trim());
    if (store.catalogAboveHorizon) q.set('min_alt', '5');
    if (store.catalogTpo180Only) q.set('tpo180_only', 'true');
    const cat = await api(`/api/framing/catalog?${q.toString()}`);
    store.catalog = cat.items || [];
  }

  async function refreshAll() {
    store.state = await api('/api/system/state');
    if (store.activeTab === 'FRAME' && store.catalog.length === 0) {
      await loadCatalog();
    }
    if (store.activeTab === 'SEQUENCE') {
      const p = await api('/api/sequence/plans');
      store.plans = p.plans || [];
      if (!store.editingSteps && store.plans.length > 0) {
        const first = store.plans[0];
        store.editingPlanId = first.id;
        store.editingPlanName = first.name;
        store.editingSteps = (first.steps || []).map((st) => ({ ...st }));
      }
    }
    if (store.activeTab === 'OFFLOAD') {
      const s = await api('/api/sessions');
      store.sessions = s.sessions || [];
      store.storage = s.storage || null;
    }
    if (store.drawerOpen && store.presets.length === 0) {
      const pr = await api('/api/system/presets');
      store.presets = pr.presets || [];
    }
    render();
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => {
      store.wsConnected = true;
      render();
    };
    ws.onclose = () => {
      store.wsConnected = false;
      render();
      setTimeout(connectWs, 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'STATE_SNAPSHOT' || msg.type === 'FRAME_SAVED') {
          store.state = msg.payload;
        } else if (store.state) {
          if (msg.type === 'CAMERA_STATUS' || msg.type === 'EXPOSURE_TICK') {
            store.state.camera = msg.payload;
          } else if (msg.type === 'PA_STATE') {
            if ((msg.payload.points || []).length > (store.state.pa.points || []).length) {
              playTone(660, 140, 'triangle');
            }
            store.state.pa = msg.payload;
          } else if (msg.type === 'FRAMING_STATE') {
            store.state.framing = msg.payload;
          } else if (msg.type === 'FOCUS_METRICS') {
            store.state.focus = msg.payload;
            if (msg.payload.hfr_median > 0) {
              playTone(Math.max(240, 900 - msg.payload.hfr_median * 110), 90);
            }
          } else if (msg.type === 'PREVIEW_UPDATED') {
            store.state.preview = msg.payload;
          } else if (msg.type === 'SEQUENCE_PROGRESS' || msg.type === 'INTERLOCK_PROMPT') {
            if (msg.type === 'INTERLOCK_PROMPT') playTone(440, 220, 'sawtooth');
            store.state.sequence = msg.payload;
          }
        }
        render();
      } catch (_) {}
    };
  }

  function renderPreviewCanvas() {
    const canvas = document.getElementById('sky-canvas');
    const preview = store.state?.preview;
    if (!canvas || !preview?.image_url) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width || 960;
      canvas.height = img.height || 640;
      const ctx = canvas.getContext('2d');
      ctx.save();
      if (store.zoom > 1.0) {
        const zw = canvas.width / store.zoom;
        const zh = canvas.height / store.zoom;
        const sx = (canvas.width - zw) / 2;
        const sy = (canvas.height - zh) / 2;
        ctx.drawImage(img, sx, sy, zw, zh, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      ctx.restore();

      if (store.nightVision) {
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = idata.data;
        for (let i = 0; i < d.length; i += 4) {
          const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = luma;
          d[i + 1] = 0;
          d[i + 2] = 0;
        }
        ctx.putImageData(idata, 0, 0);
      }

      const stars = preview.stars_overlay || [];
      ctx.strokeStyle = store.nightVision ? '#ff1a1a' : '#22d3ee';
      ctx.fillStyle = store.nightVision ? '#ff1a1a' : '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.font = '12px monospace';
      for (const s of stars) {
        const sx = s.x * canvas.width;
        const sy = s.y * canvas.height;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(6, s.hfr * 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(`${s.hfr.toFixed(1)}px`, sx + 8, sy - 6);
      }
    };
    img.src = preview.image_url;
  }

  function renderHistogramSvg(hist) {
    if (!hist || !hist.luma || hist.luma.length === 0) return '';
    const bins = hist.luma;
    const w = 320;
    const h = 44;
    const col = store.nightVision ? '#ff1a1a' : '#ef4444';
    const med = Number(hist.median_adu ?? 50);
    const skyfogPct = Math.round((med / 255) * 100);
    let zoneLabel = 'Optimal Skyfog Zone (15–35%) ✓';
    if (skyfogPct > 40) zoneLabel = '⚠️ High Skyglow (>40%) — Lower Exp/ISO';
    else if (skyfogPct < 10) zoneLabel = 'Low Skyfog (<10%) — Can Increase Exp';

    const pts = bins
      .map((v, i) => {
        const x = (i / (bins.length - 1)) * w;
        const y = h - Math.min(1, Math.max(0, v)) * (h - 6) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:4px;border-top:1px solid var(--border-col);flex-wrap:wrap">
        <div style="font-size:11px;color:var(--text-muted)">
          <div><strong>SKYFOG HISTOGRAM: ${skyfogPct}% (${med} ADU)</strong></div>
          <div>${zoneLabel}</div>
        </div>
        <svg viewBox="0 0 ${w} ${h}" style="flex:1;max-width:250px;height:40px;background:var(--bg-oled);border:1px solid var(--border-col);border-radius:6px">
          <rect x="${w * 0.15}" y="0" width="${w * 0.2}" height="${h}" fill="${col}" opacity="0.12" />
          <polyline fill="none" stroke="${col}" stroke-width="1.8" points="${pts}" />
        </svg>
      </div>
    `;
  }

  function renderBullseyeSvg(pa) {
    const maxErr = Math.max(1.5, pa.total_error_arcmin || 0);
    const scale = maxErr > 60 ? 180 : maxErr > 20 ? 60 : maxErr > 6 ? 20 : maxErr > 2 ? 6 : 2;
    const size = 230;
    const c = size / 2;
    const rMax = 94;
    const toXY = (az, alt) => ({
      x: c + Math.max(-1.08, Math.min(1.08, az / scale)) * rMax,
      y: c - Math.max(-1.08, Math.min(1.08, alt / scale)) * rMax,
    });
    const cur = toXY(pa.az_error_arcmin || 0, pa.alt_error_arcmin || 0);
    const isAligned = pa.points.length >= pa.mode_points && pa.total_error_arcmin <= 1.5;
    const colMain = store.nightVision ? '#ff1a1a' : isAligned ? '#10b981' : '#ef4444';
    const colRing = store.nightVision ? '#660000' : '#3f3f46';
    const trail = (pa.breadcrumb_trail || [])
      .map((pt, idx) => {
        const p = toXY(pt.az_error_arcmin, pt.alt_error_arcmin);
        return `<circle cx="${p.x}" cy="${p.y}" r="${2.5 + idx * 0.8}" fill="${colMain}" opacity="${0.22 + idx * 0.14}"/>`;
      })
      .join('');
    return `
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">
          AUTO-ZOOM BULLSEYE: ±${scale}' FULL SCALE ${isAligned ? '• POLAR ALIGNED (<1.5\')' : ''}
        </div>
        <svg width="${size}" height="${size}" style="background:var(--bg-oled);border-radius:999px;border:1px solid var(--border-col)">
          <line x1="0" y1="${c}" x2="${size}" y2="${c}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <line x1="${c}" y1="0" x2="${c}" y2="${size}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <circle cx="${c}" cy="${c}" r="${rMax}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.66}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.33}" fill="none" stroke="${colMain}" stroke-width="1.6"/>
          ${trail}
          <line x1="${cur.x}" y1="${cur.y}" x2="${c}" y2="${c}" stroke="${colMain}" stroke-width="2.5"/>
          <circle cx="${cur.x}" cy="${cur.y}" r="6.5" fill="${colMain}"/>
        </svg>
      </div>
    `;
  }

  function renderHfrSparkline(history) {
    if (!history || history.length < 2) return '';
    const ptsArr = history.slice(-15);
    const vals = ptsArr.map((h) => h.hfr);
    const minV = Math.min(...vals, 1.2);
    const maxV = Math.max(...vals, minV + 1.5);
    const w = 280;
    const h = 46;
    const col = store.nightVision ? '#ff1a1a' : '#10b981';
    const poly = ptsArr
      .map((item, idx) => {
        const x = (idx / (ptsArr.length - 1)) * (w - 16) + 8;
        const y = h - ((item.hfr - minV) / (maxV - minV)) * (h - 14) - 7;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `
      <div style="background:var(--bg-oled);border:1px solid var(--border-col);border-radius:8px;padding:6px 10px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:2px">
          <span>HFR FOCUS TREND (V-CURVE)</span>
          <span>Range: ${minV.toFixed(2)}px – ${maxV.toFixed(2)}px</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:42px">
          <polyline fill="none" stroke="${col}" stroke-width="2" points="${poly}" />
        </svg>
      </div>
    `;
  }

  function renderPaTab(pa, isSim) {
    const pts = pa.points ? pa.points.length : 0;
    const needed = pa.mode_points || 3;
    const calibrated = pts >= needed;
    const isAligned = calibrated && pa.total_error_arcmin <= 1.5;

    let stepBannerText = '';
    if (pts === 0) {
      stepBannerText = `<strong>Step 1 of ${needed}:</strong> Aim camera roughly toward the sky, lock the Star Adventurer 2i RA clutch, and tap <strong>Capture Point 1</strong>.`;
    } else if (pts < needed) {
      stepBannerText = `<strong>Step ${pts + 1} of ${needed}:</strong> Loosen the Star Adventurer 2i RA clutch, rotate the camera <strong>~30° East or West</strong>, re-lock the clutch, and tap <strong>Capture Point ${pts + 1}</strong>.`;
    } else if (isAligned) {
      stepBannerText = `<strong>Polar Aligned (${pa.total_error_arcmin.toFixed(2)}')!</strong> Lock your wedge knobs and proceed to <strong>2. Frame &amp; Focus</strong>.`;
    } else {
      stepBannerText = `<strong>Calibrated!</strong> Start the <strong>2.5s Live Solve Loop</strong> and turn your wedge Altitude knob &amp; Azimuth screws until the dot enters the center bullseye (&lt;1.5').`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <h3>1. Polar Alignment (${needed}-Point All-Sky)</h3>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${needed === 3 ? 'btn-active' : ''}" data-action="pa-mode-3">3-Pt (+Bump Check)</button>
            <button class="btn btn-sm ${needed === 2 ? 'btn-active' : ''}" data-action="pa-mode-2">2-Pt Fast</button>
            ${pts > 0 ? `<button class="btn btn-sm" data-action="pa-mode-${needed}">Reset</button>` : ''}
          </div>
        </div>

        <div class="step-banner ${isAligned ? 'aligned' : ''}">${stepBannerText}</div>

        ${
          !calibrated
            ? `<button class="btn btn-lg btn-primary" data-action="pa-capture">
                 CAPTURE CALIBRATION POINT ${pts + 1} OF ${needed}
               </button>`
            : `<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
                 <button class="btn btn-lg ${pa.loop_running ? 'btn-warn' : 'btn-primary'}" data-action="pa-loop">
                   ${pa.loop_running ? '⏹ STOP LIVE LOOP (RESTORE RAW)' : '▶ START 2.5s LIVE SOLVE LOOP'}
                 </button>
                 <button class="btn btn-lg" data-action="pa-capture">SINGLE SOLVE</button>
               </div>`
        }

        ${renderBullseyeSvg(pa)}

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">WEDGE ALTITUDE</div>
            <div class="kpi-val">${pa.alt_error_arcmin >= 0 ? '+' : ''}${pa.alt_error_arcmin.toFixed(1)}'</div>
            <div class="kpi-sub"><strong>${pa.alt_direction}</strong> (~${pa.sa2i_knob_turns} turns)</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">WEDGE AZIMUTH</div>
            <div class="kpi-val">${pa.az_error_arcmin >= 0 ? '+' : ''}${pa.az_error_arcmin.toFixed(1)}'</div>
            <div class="kpi-sub"><strong>${pa.az_direction}</strong></div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">TOTAL ERROR</div>
            <div class="kpi-val">${pa.total_error_arcmin.toFixed(2)}'</div>
            <div class="kpi-sub">Bump: ${pa.bump_residual_arcmin.toFixed(2)}' ${pa.bump_warning ? '⚠️' : '✓'}</div>
          </div>
        </div>

        ${
          isSim && store.showSimControls
            ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                 <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                 <button class="btn btn-sm" data-action="pa-sim-align">Simulate Turning Wedge Knobs (&lt;1')</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  function renderFrameFocusTab(framing, focus, isSim) {
    const isFraming = store.subTabFrame === 'FRAMING';

    if (isFraming) {
      const catRows = store.catalog
        .map((item) => {
          const isSel = item.id === framing.target_id;
          const tpoBadge = item.is_tpo180_pick
            ? `<span class="badge badge-raw" style="font-size:10px;padding:1px 6px;margin-left:4px">★ TPO 180 PICK</span>`
            : '';
          const b8Badge = item.bortle8_badge
            ? `<span class="badge" style="font-size:9px;padding:1px 5px;margin-left:4px">${item.bortle8_badge}</span>`
            : '';
          return `
            <button class="catalog-item ${isSel ? 'selected' : ''}" data-target-id="${item.id}" data-target-name="${item.common_name}" data-ra="${item.ra_hours}" data-dec="${item.dec_deg}">
              <div style="padding-right:8px">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
                  <strong>${item.common_name}</strong>
                  ${tpoBadge}${b8Badge}
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                  ${item.catalog_ids} • ${item.constellation} ${item.notes ? `— ${item.notes}` : ''}
                </div>
              </div>
              <div style="text-align:right;white-space:nowrap">
                <span class="badge" style="font-size:10px">Alt ${item.current_alt_deg}°</span>
                ${item.airmass ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${item.airmass}x airmass</div>` : ''}
              </div>
            </button>`;
        })
        .join('');

      return `
        <div class="card">
          <div class="seg-bar">
            <button class="seg-btn active" data-subtab="FRAMING">🎯 2A. Push-To Framing</button>
            <button class="seg-btn" data-subtab="FOCUS">🔍 2B. Focus &amp; HFR Aid</button>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="font-size:13px">
              Target: <strong style="color:var(--accent)">${framing.target_name}</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px">
                (RA ${Number(framing.target_ra_hours).toFixed(2)}h, Dec ${Number(framing.target_dec_deg).toFixed(2)}°)
              </span>
            </div>
            <button class="btn btn-sm" data-action="toggle-custom-target">
              ${store.customTargetOpen ? 'Close Custom RA/Dec' : '+ Custom RA/Dec'}
            </button>
          </div>

          ${
            store.customTargetOpen
              ? `<div class="kpi-box" style="text-align:left;display:grid;gap:8px">
                   <div style="font-size:11px;font-weight:800;color:var(--text-muted)">ENTER CUSTOM J2000 COORDINATES (DECIMAL OR HH:MM:SS)</div>
                   <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px">
                     <input id="custom-name-inp" placeholder="Target Name" value="${store.customTargetName}" />
                     <input id="custom-ra-inp" placeholder="RA (20:59:17)" value="${store.customTargetRa}" />
                     <input id="custom-dec-inp" placeholder="Dec (+44:19:48)" value="${store.customTargetDec}" />
                   </div>
                   <button class="btn btn-sm btn-primary" data-action="apply-custom-target">Set Custom Target</button>
                 </div>`
              : ''
          }

          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input
              id="catalog-search-inp"
              type="search"
              style="flex:1;min-width:180px"
              placeholder="Search M1–M110, NGC, Nebula, Star (e.g. M31, NGC 7000, Orion)..."
              value="${store.catalogSearch}"
            />
            <button class="btn btn-sm ${store.catalogTpo180Only ? 'btn-ok' : ''}" data-action="toggle-tpo180-filter" style="white-space:nowrap">
              ${store.catalogTpo180Only ? '★ TPO 180 Picks Only ✓' : '★ TPO 180 Picks'}
            </button>
            <button class="btn btn-sm ${store.catalogAboveHorizon ? 'btn-active' : ''}" data-action="toggle-horizon-filter" style="white-space:nowrap">
              ${store.catalogAboveHorizon ? 'Above Horizon ✓' : 'All Sky'}
            </button>
          </div>

          <div class="catalog-list">${catRows || '<div style="padding:12px;font-size:12px;color:var(--text-muted)">No matching objects found.</div>'}</div>

          <button class="btn btn-lg btn-primary" data-action="frame-solve">
            📸 CAPTURE &amp; PLATE-SOLVE PUSH-TO OFFSET
          </button>

          ${
            framing.solved
              ? `<div class="step-banner ${framing.on_target ? 'aligned' : ''}">
                   ${
                     framing.on_target
                       ? `<strong>TARGET CENTERED (${framing.angular_separation_deg}° offset)!</strong> Ready to start your imaging sequence.`
                       : `<strong>Offset to ${framing.target_name}: ${framing.angular_separation_deg}°</strong> — Follow either mount adjustment guide below, then re-solve:`
                   }
                 </div>
                 <div class="kpi-grid kpi-grid-2col-sm">
                   <div class="kpi-box" style="text-align:left">
                     <div class="kpi-label">DEC L-BRACKET (RA / DEC)</div>
                     <div style="font-size:12px;line-height:1.5;font-weight:700">${(framing.instructions_equatorial || []).join('<br/>')}</div>
                   </div>
                   <div class="kpi-box" style="text-align:left">
                     <div class="kpi-label">BALL-HEAD (CAMERA X / Y)</div>
                     <div style="font-size:12px;line-height:1.5;font-weight:700">${(framing.instructions_ballhead || []).join('<br/>')}</div>
                   </div>
                   <div class="kpi-box">
                     <div class="kpi-label">SENSOR ROLL / FOV</div>
                     <div class="kpi-val">${framing.rotation_pa_deg}°</div>
                     <div class="kpi-sub">${framing.fov_x_deg}° × ${framing.fov_y_deg}°</div>
                   </div>
                 </div>`
              : ''
          }

          ${
            isSim && store.showSimControls
              ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                   <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                   <button class="btn btn-sm" data-action="frame-sim-center">Simulate Slewing Onto Target</button>
                 </div>`
              : ''
          }
        </div>
      `;
    }

    // 2B: FOCUS & HFR AID
    return `
      <div class="card">
        <div class="seg-bar">
          <button class="seg-btn" data-subtab="FRAMING">🎯 2A. Push-To Framing</button>
          <button class="seg-btn active" data-subtab="FOCUS">🔍 2B. Focus &amp; HFR Aid</button>
        </div>

        <div class="step-banner">
          <strong>Hands-Free Focus Loop:</strong> Start the continuous loop and slowly twist the TPO 180mm focus ring until <strong>Median HFR</strong> reaches its lowest value (audio pitch rises as stars sharpen).
        </div>

        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
          <button class="btn btn-lg ${focus.loop_running ? 'btn-warn' : 'btn-primary'}" data-action="focus-loop">
            ${focus.loop_running ? '⏹ STOP FOCUS LOOP (RAW)' : '▶ START CONTINUOUS FOCUS LOOP'}
          </button>
          <button class="btn btn-lg" data-action="focus-shot">SINGLE SHOT</button>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">CURRENT MEDIAN HFR</div>
            <div class="kpi-val">${focus.hfr_median > 0 ? focus.hfr_median.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub">Lower is sharper</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">BEST MIN HFR</div>
            <div class="kpi-val" style="color:var(--ok-col)">${focus.min_hfr_achieved ? focus.min_hfr_achieved.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub"><button class="btn btn-sm" style="min-height:22px;padding:1px 6px;font-size:10px" data-action="focus-reset-min">Reset Min</button></div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">FWHM / STARS</div>
            <div class="kpi-val">${focus.fwhm_arcsec > 0 ? focus.fwhm_arcsec.toFixed(1) + '"' : '--'}</div>
            <div class="kpi-sub">${focus.star_count} stars measured</div>
          </div>
        </div>

        ${renderHfrSparkline(focus.history)}

        <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-muted)">
            Sub-frame ROI Mode: <strong>${focus.roi ? '1:1 Center Crop (240px)' : 'Full Sensor Field'}</strong>
          </span>
          <button class="btn btn-sm ${focus.roi ? 'btn-active' : ''}" data-action="focus-toggle-roi">
            ${focus.roi ? 'Disable 1:1 ROI Crop' : 'Enable 1:1 Center ROI Crop'}
          </button>
        </div>

        ${
          isSim && store.showSimControls
            ? `<div style="border-top:1px dashed var(--border-col);padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                 <span style="font-size:11px;color:var(--text-muted)">SIMULATOR TEST RIG:</span>
                 <button class="btn btn-sm" data-action="focus-sim-in">Simulate Turning Focus Ring (-0.5 step)</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  function renderSequenceTab(sequence, framing) {
    const steps = store.editingSteps || [
      { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 20, cooldown_s: 2.0 },
    ];
    const totalFrames = steps.reduce((acc, s) => acc + Number(s.total_count || 0), 0);
    const totalSeconds = steps.reduce(
      (acc, s) => acc + Number(s.total_count || 0) * (Number(s.exposure_s || 0) + Number(s.cooldown_s || 0)),
      0
    );
    const isRunning = sequence.status === 'RUNNING' || sequence.status === 'PAUSED' || sequence.status === 'INTERLOCK_PAUSED';

    const rowsHtml = steps
      .map(
        (st, idx) => `
        <tr>
          <td>
            <select data-step-idx="${idx}" data-step-field="frame_type">
              ${['Light', 'Dark', 'Flat', 'Bias']
                .map((t) => `<option value="${t}" ${st.frame_type === t ? 'selected' : ''}>${t}</option>`)
                .join('')}
            </select>
          </td>
          <td>
            <input type="number" step="any" min="0.001" data-step-idx="${idx}" data-step-field="exposure_s" value="${st.exposure_s}" />
          </td>
          <td>
            <select data-step-idx="${idx}" data-step-field="iso">
              ${['100', '200', '400', '800', '1600', '3200', '6400']
                .map((iso) => `<option value="${iso}" ${String(st.iso) === iso ? 'selected' : ''}>${iso}</option>`)
                .join('')}
            </select>
          </td>
          <td>
            <input type="number" min="1" max="999" data-step-idx="${idx}" data-step-field="total_count" value="${st.total_count}" />
          </td>
          <td>
            <input type="number" step="0.5" min="0" data-step-idx="${idx}" data-step-field="cooldown_s" value="${st.cooldown_s ?? 2.0}" />
          </td>
          <td style="text-align:right">
            ${
              steps.length > 1
                ? `<button class="btn btn-sm" data-action="seq-remove-step" data-idx="${idx}" title="Remove step">✕</button>`
                : ''
            }
          </td>
        </tr>`
      )
      .join('');

    return `
      <div class="card">
        <div class="card-header">
          <h3>3. .CR3 RAW Sequencer (${sequence.status})</h3>
          <span class="badge badge-raw">Total Plan: ${totalFrames} frames (${formatDuration(totalSeconds)})</span>
        </div>

        ${
          sequence.interlock_required
            ? `<div class="step-banner" style="border-left-color:var(--warn-col);background:var(--warn-bg);display:grid;gap:8px">
                 <div><strong>⚠️ PHYSICAL CALIBRATION INTERLOCK: ${sequence.interlock_type}</strong></div>
                 <div>${sequence.interlock_message}</div>
                 <button class="btn btn-lg btn-primary" data-action="seq-confirm-interlock">
                   ✓ I HAVE COVERED THE LENS — RESUME SEQUENCE
                 </button>
               </div>`
            : ''
        }

        <div class="kpi-grid">
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
            <div class="kpi-val">${sequence.last_frame_hfr ? sequence.last_frame_hfr.toFixed(2) + 'px' : '--'}</div>
            <div class="kpi-sub">${sequence.last_saved_file ? 'Saved .CR3 ✓' : 'Ready'}</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${
            !isRunning
              ? `<button class="btn btn-lg btn-primary" data-action="seq-start">
                   ▶ SAVE &amp; START .CR3 IMAGING SEQUENCE
                 </button>`
              : `<button class="btn" style="flex:1" data-action="${sequence.status === 'PAUSED' ? 'seq-resume' : 'seq-pause'}">
                   ${sequence.status === 'PAUSED' ? '▶ RESUME SEQUENCE' : '⏸ PAUSE AFTER CURRENT SHOT'}
                 </button>
                 <button class="btn ${store.abortArmed ? 'btn-primary' : ''}" style="flex:1" data-action="seq-abort">
                   ${store.abortArmed ? '⚠️ TAP AGAIN TO CONFIRM ABORT' : '⏹ ABORT SEQUENCE'}
                 </button>`
          }
        </div>

        <div style="border-top:1px solid var(--border-col);padding-top:10px;display:grid;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="font-size:11px;font-weight:800;color:var(--text-muted)">
              1-TAP SKY CONDITION TEMPLATES (FOR TPO 180mm f/4.5 + EOS M200):
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm" data-action="seq-preset-b8-broad" title="60x30s ISO 400 + Darks/Biases/Flats — avoids blowing out Bortle 8 skyglow">
                🏙️ Bortle 8 Broadband (60×30s)
              </button>
              <button class="btn btn-sm" data-action="seq-preset-b8-dual" title="25x120s ISO 800 Bulb for 2-inch Dual-Band Hα/OIII filter in Bortle 8">
                🧪 Bortle 8 Dual-Band Filter (25×120s)
              </button>
              <button class="btn btn-sm" data-action="seq-preset-dark" title="25x90s ISO 800 for Bortle 1–4 Dark Sky sites">
                🌌 Dark Sky (25×90s)
              </button>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:2px">
            <div style="font-size:12px;font-weight:800;color:var(--text-muted)">
              SEQUENCE PLAN STEPS (AUTO-SWITCHES TO .CR3 RAW; &gt;30s USES EOS BULB TIMER)
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" data-action="seq-add-step">+ Add Step</button>
              <button class="btn btn-sm ${store.planSavedBanner ? 'btn-ok' : ''}" data-action="seq-save-plan">
                ${store.planSavedBanner ? 'Saved ✓' : 'Save Plan'}
              </button>
            </div>
          </div>

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
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderOffloadTab(system) {
    const sessHtml = (store.sessions || [])
      .map((s) => {
        const isExp = store.expandedSessionId === s.id;
        const frames = s.frames || [];
        const framesListHtml = isExp
          ? `<div style="max-height:210px;overflow-y:auto;border:1px solid var(--border-col);border-radius:8px;margin-top:6px">
               ${frames
                 .map(
                   (f) => `
                   <div class="frame-row ${f.status === 'rejected' ? 'rejected' : ''}">
                     <div>
                       <strong>${f.filename}</strong>
                       <div style="font-size:11px;color:var(--text-muted)">
                         ${f.frame_type} • ${f.exposure_s}s • ISO ${f.iso} • HFR: ${f.hfr_median ? f.hfr_median.toFixed(2) + 'px' : '--'} (${f.star_count ?? 0} stars)
                       </div>
                     </div>
                     <button
                       class="btn btn-sm ${f.status === 'rejected' ? '' : 'btn-ok'}"
                       data-action="frame-cull-toggle"
                       data-session="${s.id}"
                       data-frame="${f.id}"
                       data-next-status="${f.status === 'rejected' ? 'accepted' : 'rejected'}"
                     >
                       ${f.status === 'rejected' ? 'Restore' : 'Keep ✓'}
                     </button>
                   </div>`
                 )
                 .join('')}
             </div>`
          : '';

        return `
          <div class="kpi-box" style="text-align:left;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <div>
                <strong style="font-size:14px">${s.target_name}</strong>
                <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${s.id})</span>
              </div>
              <span class="badge badge-raw">
                Kept: ${s.accepted_frames} | Rejected: ${s.rejected_frames} | ${s.total_size_mb} MB
              </span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn btn-sm btn-primary" style="text-decoration:none" href="/api/sessions/${s.id}/download.zip?exclude_rejected=true">
                ⬇ Download Siril ZIP (Kept Only)
              </a>
              <button class="btn btn-sm" data-action="sess-toggle-frames" data-session="${s.id}">
                ${isExp ? 'Hide Sub-Frames ▲' : `Inspect / Cull Frames (${frames.length}) ▼`}
              </button>
              <button class="btn btn-sm" data-action="sess-autocull" data-session="${s.id}">
                Auto-Cull Outliers (&gt;2σ)
              </button>
              ${
                s.rejected_frames > 0
                  ? `<button class="btn btn-sm" data-action="sess-purge" data-session="${s.id}">
                       Delete ${s.rejected_frames} Rejected File(s)
                     </button>`
                  : ''
              }
            </div>
            ${framesListHtml}
          </div>`;
      })
      .join('');

    return `
      <div class="card">
        <div class="card-header">
          <h3>4. Sessions, Sub-Frame Culling &amp; Offload</h3>
          <span class="badge">${system.disk_free_gb} GB Free</span>
        </div>

        <div class="kpi-grid kpi-grid-2col-sm">
          <div class="kpi-box" style="text-align:left">
            <div class="kpi-label">WINDOWS WI-FI SHARE (SMB3)</div>
            <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">\\\\astro.local\\captures</div>
          </div>
          <div class="kpi-box" style="text-align:left">
            <div class="kpi-label">MACOS FINDER (CMD+K)</div>
            <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">smb://astro.local/captures</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">USB 3.0 EXTERNAL SSD</div>
            ${
              system.usb_drive_mounted
                ? `<button class="btn btn-sm btn-primary" style="width:100%;margin-top:2px" data-action="usb-eject">
                     ⏏ Safe Eject (${system.usb_drive_label || 'USB'})
                   </button>`
                : `<div class="kpi-sub" style="margin-top:4px">Using Pi Storage (No USB Mounted)</div>`
            }
          </div>
        </div>

        ${sessHtml || '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No imaging sessions recorded yet. Start a sequence in Tab 3 to capture .CR3 frames.</div>'}
      </div>
    `;
  }

  function renderDrawer(observer, camera) {
    if (!store.drawerOpen) return '';
    const presetButtons = (store.presets || [])
      .map(
        (p) => `
        <button class="btn btn-sm" data-action="apply-preset" data-lat="${p.latitude_deg}" data-lon="${p.longitude_deg}" data-elev="${p.elevation_m}" data-name="${p.name}">
          📍 ${p.name} (${Number(p.latitude_deg).toFixed(2)}°, ${Number(p.longitude_deg).toFixed(2)}°)
        </button>`
      )
      .join('');

    return `
      <div class="modal-backdrop" id="drawer-backdrop">
        <div class="modal-drawer">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-col);padding-bottom:10px">
            <h3 style="font-size:16px">Observing Site, Clock &amp; Hardware</h3>
            <button class="btn btn-sm" data-action="close-drawer">✕ Close</button>
          </div>

          <div style="display:grid;gap:8px">
            <div class="kpi-label">1. SAVED OBSERVING SITE PRESETS</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${presetButtons || '<span style="font-size:12px;color:var(--text-muted)">No saved presets yet.</span>'}
            </div>
          </div>

          <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
            <div class="kpi-label">2. SET SITE COORDINATES &amp; SAVE PRESET</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="font-size:11px">
                Latitude (°N):
                <input id="drawer-lat" type="number" step="0.0001" value="${observer.latitude_deg}" style="margin-top:4px" />
              </label>
              <label style="font-size:11px">
                Longitude (°E):
                <input id="drawer-lon" type="number" step="0.0001" value="${observer.longitude_deg}" style="margin-top:4px" />
              </label>
            </div>
            <input id="drawer-preset-name" placeholder="Preset Name (e.g. Backyard, Dark Sky Park)" value="Backyard" />
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-primary" style="flex:1" data-action="save-site-coords">
                Save Site &amp; Sync UTC Clock
              </button>
              <button class="btn btn-sm" data-action="sync-gps">
                Sync Phone Clock/GPS
              </button>
            </div>
          </div>

          <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
            <div class="kpi-label">3. CANON EOS M200 USB RECOVERY</div>
            <p style="font-size:11px;color:var(--text-muted)">
              If the camera shutter locks up or USB disconnects in the cold, issue a kernel USBDEVFS_RESET:
            </p>
            <button class="btn btn-sm" data-action="usb-reset">
              ⚡ Reset Canon EOS M200 USB Port (Resets: ${camera.usb_reset_count || 0})
            </button>
          </div>

          ${
            camera.driver_mode === 'simulator'
              ? `<div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
                   <div class="kpi-label">4. DEVELOPER / SIMULATOR CONTROLS</div>
                   <button class="btn btn-sm ${store.showSimControls ? 'btn-active' : ''}" data-action="toggle-sim-controls">
                     ${store.showSimControls ? 'Hide Simulator Shortcut Buttons' : 'Show Simulator Shortcut Buttons'}
                   </button>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('root');
    if (!root || !store.state) return;

    // Preserve active focus if user is typing in search or input
    const activeEl = document.activeElement;
    const activeId = activeEl ? activeEl.id : null;
    const selStart = activeEl && 'selectionStart' in activeEl ? activeEl.selectionStart : null;

    const { camera, system, observer, pa, framing, focus, sequence, preview } = store.state;
    const isSim = camera.driver_mode === 'simulator';

    let tabHtml = '';
    if (store.activeTab === 'PA') {
      tabHtml = renderPaTab(pa, isSim);
    } else if (store.activeTab === 'FRAME') {
      tabHtml = renderFrameFocusTab(framing, focus, isSim);
    } else if (store.activeTab === 'SEQUENCE') {
      tabHtml = renderSequenceTab(sequence, framing);
    } else if (store.activeTab === 'OFFLOAD') {
      tabHtml = renderOffloadTab(system);
    }

    root.innerHTML = `
      <header class="hud-header">
        <div class="hud-row">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="status-dot ${store.wsConnected && camera.connected ? '' : 'offline'}"></span>
            <strong style="font-size:14px;letter-spacing:0.04em">ASTROPI</strong>
            <span class="badge ${camera.is_fast_jpg_mode ? 'badge-jpg' : 'badge-raw'}">
              ${camera.is_fast_jpg_mode ? 'FAST JPG (SOLVE)' : 'RAW (.CR3)'}
            </span>
            <span style="font-size:12px;color:var(--text-muted)">
              ${system.disk_free_gb}GB free • ${system.cpu_temp_c}°C • ${system.ram_used_mb}MB RAM
            </span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-sm" data-action="open-drawer">
              📍 Site (${observer.latitude_deg.toFixed(1)}°, ${observer.longitude_deg.toFixed(1)}°)
            </button>
            <button class="btn btn-sm ${store.nightVision ? 'btn-active' : ''}" data-action="toggle-nv">
              ${store.nightVision ? '🔴 RED: ON' : '🌙 NIGHT RED'}
            </button>
          </div>
        </div>
        ${
          camera.exposing
            ? `<div class="exp-bar-wrap">
                 <div style="display:flex;justify-content:space-between;font-size:11px;font-family:monospace;margin-bottom:2px">
                   <span>EXPOSING (${camera.shutter_speed} @ ISO ${camera.iso})</span>
                   <span>${camera.exposure_elapsed_s.toFixed(1)}s / ${camera.exposure_total_s.toFixed(1)}s (${camera.exposure_remaining_s.toFixed(1)}s left)</span>
                 </div>
                 <div class="exp-bar-track">
                   <div class="exp-bar-fill" style="width:${camera.exposure_progress_pct}%"></div>
                 </div>
               </div>`
            : ''
        }
      </header>

      <nav class="tabs-grid">
        <button class="btn ${store.activeTab === 'PA' ? 'btn-active' : ''}" data-tab="PA">1. POLAR ALIGN</button>
        <button class="btn ${store.activeTab === 'FRAME' ? 'btn-active' : ''}" data-tab="FRAME">2. FRAME &amp; FOCUS</button>
        <button class="btn ${store.activeTab === 'SEQUENCE' ? 'btn-active' : ''}" data-tab="SEQUENCE">3. SEQUENCE (.CR3)</button>
        <button class="btn ${store.activeTab === 'OFFLOAD' ? 'btn-active' : ''}" data-tab="OFFLOAD">4. SESSIONS &amp; OFFLOAD</button>
      </nav>

      <main class="main-grid">
        ${tabHtml}
        <div class="card">
          <div class="card-header">
            <div>
              <strong style="font-size:13px">LIVE SKY PREVIEW</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${preview?.source_format || 'RAW .CR3'})</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm ${store.zoom > 1 ? 'btn-active' : ''}" data-action="toggle-zoom">
                🔍 ${store.zoom > 1 ? '2x Zoom' : '1x Fit'}
              </button>
              <button class="btn btn-sm" data-action="manual-shot">📸 Test Shot</button>
            </div>
          </div>
          <canvas id="sky-canvas" style="width:100%;border-radius:8px;background:#000;border:1px solid var(--border-col)"></canvas>
          ${renderHistogramSvg(preview?.histogram)}
        </div>
      </main>

      ${renderDrawer(observer, camera)}
    `;

    renderPreviewCanvas();

    if (activeId) {
      const restored = document.getElementById(activeId);
      if (restored) {
        restored.focus();
        if (selStart !== null && 'setSelectionRange' in restored) {
          try {
            restored.setSelectionRange(selStart, selStart);
          } catch (_) {}
        }
      }
    }
  }

  // Input listeners for search & sequence step editing
  document.addEventListener('input', async (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'catalog-search-inp') {
      store.catalogSearch = t.value;
      await loadCatalog();
      render();
    } else if (t.id === 'custom-name-inp') {
      store.customTargetName = t.value;
    } else if (t.id === 'custom-ra-inp') {
      store.customTargetRa = t.value;
    } else if (t.id === 'custom-dec-inp') {
      store.customTargetDec = t.value;
    } else if (t.dataset && t.dataset.stepIdx !== undefined) {
      const idx = Number(t.dataset.stepIdx);
      const field = t.dataset.stepField;
      if (store.editingSteps && store.editingSteps[idx]) {
        store.editingSteps[idx][field] =
          field === 'frame_type' || field === 'iso' ? t.value : Number(t.value);
        store.planSavedBanner = false;
      }
    }
  });

  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'drawer-backdrop') {
      store.drawerOpen = false;
      render();
      return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.tab) {
      store.activeTab = btn.dataset.tab;
      store.abortArmed = false;
      await refreshAll();
      return;
    }
    if (btn.dataset.subtab) {
      store.subTabFrame = btn.dataset.subtab;
      render();
      return;
    }
    if (btn.dataset.targetId) {
      await api('/api/framing/select-target', 'POST', {
        target_id: btn.dataset.targetId,
        target_name: btn.dataset.targetName,
        target_ra_hours: Number(btn.dataset.ra),
        target_dec_deg: Number(btn.dataset.dec),
      });
      await refreshAll();
      return;
    }

    const act = btn.dataset.action;
    if (!act) return;

    if (act === 'toggle-nv') {
      store.nightVision = !store.nightVision;
      document.documentElement.classList.toggle('night-vision', store.nightVision);
      render();
    } else if (act === 'toggle-zoom') {
      store.zoom = store.zoom > 1.0 ? 1.0 : 2.0;
      renderPreviewCanvas();
      render();
    } else if (act === 'open-drawer') {
      store.drawerOpen = true;
      const pr = await api('/api/system/presets');
      store.presets = pr.presets || [];
      render();
    } else if (act === 'close-drawer') {
      store.drawerOpen = false;
      render();
    } else if (act === 'toggle-sim-controls') {
      store.showSimControls = !store.showSimControls;
      render();
    } else if (act === 'apply-preset') {
      await api('/api/system/location-time', 'PUT', {
        latitude_deg: Number(btn.dataset.lat),
        longitude_deg: Number(btn.dataset.lon),
        elevation_m: Number(btn.dataset.elev || 300),
        client_utc_timestamp: Date.now() / 1000,
        sync_source: `Preset: ${btn.dataset.name}`,
      });
      await refreshAll();
    } else if (act === 'save-site-coords') {
      const lat = Number(document.getElementById('drawer-lat')?.value ?? 38.8951);
      const lon = Number(document.getElementById('drawer-lon')?.value ?? -77.0364);
      const name = document.getElementById('drawer-preset-name')?.value || 'Custom Site';
      await api('/api/system/presets', 'POST', {
        name,
        latitude_deg: lat,
        longitude_deg: lon,
        make_default: true,
      });
      await api('/api/system/location-time', 'PUT', {
        latitude_deg: lat,
        longitude_deg: lon,
        client_utc_timestamp: Date.now() / 1000,
        sync_source: `Saved: ${name}`,
      });
      const pr = await api('/api/system/presets');
      store.presets = pr.presets || [];
      await refreshAll();
    } else if (act === 'sync-gps') {
      await api('/api/system/location-time', 'PUT', {
        client_utc_timestamp: Date.now() / 1000,
        sync_source: 'Phone Clock Sync',
      });
      await refreshAll();
    } else if (act === 'usb-reset') {
      await api('/api/camera/reset-usb', 'POST');
      await refreshAll();
    } else if (act === 'manual-shot') {
      await api('/api/camera/capture', 'POST', { exposure_s: 1.5, iso: '800', fast_jpeg: true });
      await refreshAll();
    } else if (act === 'pa-mode-3') {
      await api('/api/pa/start', 'POST', { mode_points: 3 });
      await refreshAll();
    } else if (act === 'pa-mode-2') {
      await api('/api/pa/start', 'POST', { mode_points: 2 });
      await refreshAll();
    } else if (act === 'pa-capture') {
      if ((store.state.pa.points || []).length < store.state.pa.mode_points) {
        await api('/api/pa/capture-point', 'POST', { exposure_s: 1.5, iso: '1600' });
      } else {
        await api('/api/pa/live-step', 'POST', { exposure_s: 1.5, iso: '1600' });
      }
      await refreshAll();
    } else if (act === 'pa-loop') {
      if (store.state.pa.loop_running) {
        await api('/api/pa/live-loop/stop', 'POST', { restore_raw: true });
      } else {
        await api('/api/pa/live-loop/start', 'POST', { exposure_s: 1.5, iso: '1600' });
      }
      await refreshAll();
    } else if (act === 'pa-sim-align') {
      await api('/api/pa/sim-control', 'POST', {
        d_alt_arcmin: -store.state.pa.alt_error_arcmin * 0.92,
        d_az_arcmin: -store.state.pa.az_error_arcmin * 0.92,
      });
      await refreshAll();
    } else if (act === 'toggle-horizon-filter') {
      store.catalogAboveHorizon = !store.catalogAboveHorizon;
      await loadCatalog();
      render();
    } else if (act === 'toggle-tpo180-filter') {
      store.catalogTpo180Only = !store.catalogTpo180Only;
      await loadCatalog();
      render();
    } else if (act === 'toggle-custom-target') {
      store.customTargetOpen = !store.customTargetOpen;
      render();
    } else if (act === 'apply-custom-target') {
      await api('/api/framing/select-target', 'POST', {
        target_id: 'CUSTOM',
        target_name: store.customTargetName || 'Custom Target',
        target_ra_hours: store.customTargetRa,
        target_dec_deg: store.customTargetDec,
      });
      store.customTargetOpen = false;
      await refreshAll();
    } else if (act === 'frame-solve') {
      await api('/api/framing/solve', 'POST', { exposure_s: 2.0, iso: '1600' });
      await refreshAll();
    } else if (act === 'frame-sim-center') {
      await api('/api/framing/solve', 'POST', { exposure_s: 2.0, iso: '1600', sim_center_on_target: true });
      await refreshAll();
    } else if (act === 'focus-shot') {
      await api('/api/framing/focus-step', 'POST', { exposure_s: 1.5, iso: '1600' });
      await refreshAll();
    } else if (act === 'focus-loop') {
      if (store.state.focus.loop_running) {
        await api('/api/framing/focus-loop/stop', 'POST');
      } else {
        await api('/api/framing/focus-loop/start', 'POST', { exposure_s: 1.5, iso: '1600' });
      }
      await refreshAll();
    } else if (act === 'focus-reset-min') {
      await api('/api/framing/focus-roi', 'POST', {
        roi: store.state.focus.roi,
        reset_history: true,
      });
      await refreshAll();
    } else if (act === 'focus-toggle-roi') {
      const hasRoi = Boolean(store.state.focus.roi);
      await api('/api/framing/focus-roi', 'POST', {
        clear: hasRoi,
        roi: hasRoi ? null : { x: 0.5, y: 0.5, size: 240 },
      });
      await refreshAll();
    } else if (act === 'focus-sim-in') {
      await api('/api/framing/focus-step', 'POST', { exposure_s: 1.5, iso: '1600', sim_focus_delta: -0.5 });
      await refreshAll();
    } else if (act === 'seq-preset-b8-broad') {
      store.editingSteps = [
        { frame_type: 'Light', exposure_s: 30, iso: '400', total_count: 60, cooldown_s: 1.5 },
        { frame_type: 'Dark', exposure_s: 30, iso: '400', total_count: 20, cooldown_s: 1.0 },
        { frame_type: 'Bias', exposure_s: 0.001, iso: '400', total_count: 30, cooldown_s: 0.5 },
        { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
      ];
      store.planSavedBanner = false;
      render();
    } else if (act === 'seq-preset-b8-dual') {
      store.editingSteps = [
        { frame_type: 'Light', exposure_s: 120, iso: '800', total_count: 25, cooldown_s: 2.0 },
        { frame_type: 'Dark', exposure_s: 120, iso: '800', total_count: 10, cooldown_s: 1.0 },
        { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
        { frame_type: 'Flat', exposure_s: 1.0, iso: '100', total_count: 20, cooldown_s: 1.0 },
      ];
      store.planSavedBanner = false;
      render();
    } else if (act === 'seq-preset-dark') {
      store.editingSteps = [
        { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 25, cooldown_s: 2.0 },
        { frame_type: 'Dark', exposure_s: 90, iso: '800', total_count: 10, cooldown_s: 1.0 },
        { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 25, cooldown_s: 0.5 },
        { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 20, cooldown_s: 1.0 },
      ];
      store.planSavedBanner = false;
      render();
    } else if (act === 'seq-add-step') {
      if (!store.editingSteps) store.editingSteps = [];
      store.editingSteps.push({
        frame_type: 'Light',
        exposure_s: 90,
        iso: '800',
        total_count: 15,
        cooldown_s: 2.0,
      });
      render();
    } else if (act === 'seq-remove-step') {
      const idx = Number(btn.dataset.idx);
      if (store.editingSteps && store.editingSteps.length > 1) {
        store.editingSteps.splice(idx, 1);
        render();
      }
    } else if (act === 'seq-save-plan') {
      const saved = await api('/api/sequence/plans', 'POST', {
        id: store.editingPlanId,
        name: store.editingPlanName || `${store.state.framing.target_name} Plan`,
        target_name: store.state.framing.target_name,
        target_ra_hours: store.state.framing.target_ra_hours,
        target_dec_deg: store.state.framing.target_dec_deg,
        steps: store.editingSteps,
      });
      store.editingPlanId = saved.id;
      store.planSavedBanner = true;
      await refreshAll();
    } else if (act === 'seq-start') {
      const saved = await api('/api/sequence/plans', 'POST', {
        id: store.editingPlanId,
        name: store.editingPlanName || `${store.state.framing.target_name} Plan`,
        target_name: store.state.framing.target_name,
        target_ra_hours: store.state.framing.target_ra_hours,
        target_dec_deg: store.state.framing.target_dec_deg,
        steps: store.editingSteps,
      });
      store.editingPlanId = saved.id;
      await api(`/api/sequence/plans/${saved.id}/start`, 'POST', { reset_progress: true });
      await refreshAll();
    } else if (act === 'seq-pause') {
      await api('/api/sequence/pause', 'POST');
      await refreshAll();
    } else if (act === 'seq-resume') {
      await api('/api/sequence/resume', 'POST');
      await refreshAll();
    } else if (act === 'seq-confirm-interlock') {
      await api('/api/sequence/confirm-interlock', 'POST');
      await refreshAll();
    } else if (act === 'seq-abort') {
      if (!store.abortArmed) {
        store.abortArmed = true;
        render();
        setTimeout(() => {
          store.abortArmed = false;
          render();
        }, 4000);
        return;
      }
      store.abortArmed = false;
      await api('/api/sequence/abort', 'POST');
      await refreshAll();
    } else if (act === 'usb-eject') {
      const r = await api('/api/system/storage/eject', 'POST');
      alert(r.message);
      await refreshAll();
    } else if (act === 'sess-toggle-frames') {
      const sid = btn.dataset.session;
      store.expandedSessionId = store.expandedSessionId === sid ? null : sid;
      render();
    } else if (act === 'frame-cull-toggle') {
      const sid = btn.dataset.session;
      const fid = btn.dataset.frame;
      const nextStatus = btn.dataset.nextStatus;
      await api(`/api/sessions/${sid}/frames/${fid}/cull`, 'POST', {
        status: nextStatus,
        reject_reason: nextStatus === 'rejected' ? 'Manual user cull' : '',
      });
      await refreshAll();
    } else if (act === 'sess-autocull') {
      await api(`/api/sessions/${btn.dataset.session}/auto-cull`, 'POST', { hfr_sigma_limit: 2.0 });
      await refreshAll();
    } else if (act === 'sess-purge') {
      await api(`/api/sessions/${btn.dataset.session}/purge-rejected`, 'POST');
      await refreshAll();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  // Automatically sync Raspberry Pi UTC sidereal clock from phone/browser on load (works over plain HTTP!)
  api('/api/system/location-time', 'PUT', {
    client_utc_timestamp: Date.now() / 1000,
    sync_source: 'Auto Clock Sync',
  }).catch(() => {});

  refreshAll();
  connectWs();
})();
