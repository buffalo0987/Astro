/**
 * AstroPi Production Static PWA Bundle (Zero-Dependency ES2020 Client)
 * Synchronizes in real time over WebSocket (/ws) across all connected devices.
 */
(() => {
  const store = {
    nightVision: false,
    activeTab: 'PA',
    state: null,
    catalog: [],
    plans: [],
    sessions: [],
    storage: null,
    wsConnected: false,
    zoom: 1.0,
  };

  // Web Audio Cues
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

  async function refreshAll() {
    store.state = await api('/api/system/state');
    if (store.activeTab === 'FRAME' && store.catalog.length === 0) {
      const cat = await api('/api/framing/catalog');
      store.catalog = cat.items || [];
    }
    if (store.activeTab === 'SEQUENCE') {
      const p = await api('/api/sequence/plans');
      store.plans = p.plans || [];
    }
    if (store.activeTab === 'OFFLOAD') {
      const s = await api('/api/sessions');
      store.sessions = s.sessions || [];
      store.storage = s.storage || null;
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
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

  function renderBullseyeSvg(pa) {
    const maxErr = Math.max(1.5, pa.total_error_arcmin || 0);
    const scale = maxErr > 60 ? 180 : maxErr > 20 ? 60 : maxErr > 6 ? 20 : maxErr > 2 ? 6 : 2;
    const size = 250;
    const c = size / 2;
    const rMax = 100;
    const toXY = (az, alt) => ({
      x: c + Math.max(-1.1, Math.min(1.1, az / scale)) * rMax,
      y: c - Math.max(-1.1, Math.min(1.1, alt / scale)) * rMax,
    });
    const cur = toXY(pa.az_error_arcmin || 0, pa.alt_error_arcmin || 0);
    const colMain = store.nightVision ? '#ff1a1a' : '#ef4444';
    const colRing = store.nightVision ? '#660000' : '#3f3f46';
    const trail = (pa.breadcrumb_trail || [])
      .map((pt, idx) => {
        const p = toXY(pt.az_error_arcmin, pt.alt_error_arcmin);
        return `<circle cx="${p.x}" cy="${p.y}" r="${3 + idx}" fill="${colMain}" opacity="${0.25 + idx * 0.14}"/>`;
      })
      .join('');
    return `
      <div style="text-align:center">
        <div style="font-size:11px;opacity:0.75;margin-bottom:4px">AUTO-SCALE RADAR: ±${scale}'</div>
        <svg width="${size}" height="${size}">
          <line x1="0" y1="${c}" x2="${size}" y2="${c}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <line x1="${c}" y1="0" x2="${c}" y2="${size}" stroke="${colRing}" stroke-dasharray="4 4"/>
          <circle cx="${c}" cy="${c}" r="${rMax}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.66}" fill="none" stroke="${colRing}"/>
          <circle cx="${c}" cy="${c}" r="${rMax * 0.33}" fill="none" stroke="${colMain}" stroke-width="1.8"/>
          ${trail}
          <line x1="${cur.x}" y1="${cur.y}" x2="${c}" y2="${c}" stroke="${colMain}" stroke-width="2.5"/>
          <circle cx="${cur.x}" cy="${cur.y}" r="7" fill="${colMain}"/>
        </svg>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('root');
    if (!root || !store.state) return;
    const { camera, system, observer, pa, framing, focus, sequence } = store.state;

    let tabHtml = '';
    if (store.activeTab === 'PA') {
      tabHtml = `
        <div class="card">
          <h3>1. SO(3) All-Sky Polar Alignment (${pa.mode_points}-Point)</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn ${pa.mode_points === 3 ? 'btn-active' : ''}" data-action="pa-mode-3">3-Point (+Bump Check)</button>
            <button class="btn ${pa.mode_points === 2 ? 'btn-active' : ''}" data-action="pa-mode-2">2-Point Quick</button>
            <button class="btn" data-action="pa-capture">
              ${pa.points.length < pa.mode_points ? `Capture Point ${pa.points.length + 1}/${pa.mode_points}` : 'Re-Solve Live Wedge'}
            </button>
            ${
              pa.points.length >= pa.mode_points
                ? `<button class="btn btn-primary" data-action="pa-loop">${
                    pa.loop_running ? 'STOP LIVE LOOP (RAW)' : 'START 2.5s LIVE SOLVE'
                  }</button>`
                : ''
            }
            <button class="btn" data-action="pa-sim-align">SIM: Dial In Wedge (&lt;1')</button>
          </div>
          ${renderBullseyeSvg(pa)}
          <div class="kpi-grid">
            <div class="kpi-box">
              <div>ALTITUDE</div>
              <div class="kpi-val">${pa.alt_error_arcmin.toFixed(1)}'</div>
              <div style="font-size:11px">${pa.alt_direction} (~${pa.sa2i_knob_turns} turns)</div>
            </div>
            <div class="kpi-box">
              <div>AZIMUTH</div>
              <div class="kpi-val">${pa.az_error_arcmin.toFixed(1)}'</div>
              <div style="font-size:11px">${pa.az_direction}</div>
            </div>
            <div class="kpi-box">
              <div>TOTAL ERROR</div>
              <div class="kpi-val">${pa.total_error_arcmin.toFixed(2)}'</div>
              <div style="font-size:11px">Bump: ${pa.bump_residual_arcmin.toFixed(2)}'</div>
            </div>
          </div>
        </div>
      `;
    } else if (store.activeTab === 'FRAME') {
      const catRows = store.catalog
        .slice(0, 25)
        .map(
          (item) => `
          <button class="catalog-item" data-target-id="${item.id}" data-target-name="${item.common_name}" data-ra="${item.ra_hours}" data-dec="${item.dec_deg}">
            <span><strong>${item.common_name}</strong> <small>(${item.catalog_ids})</small></span>
            <span>Alt ${item.current_alt_deg}°</span>
          </button>`
        )
        .join('');
      tabHtml = `
        <div class="card">
          <h3>2A. Push-To Framing (${framing.target_name})</h3>
          <div class="catalog-list">${catRows}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="frame-solve">SOLVE &amp; COMPUTE PUSH-TO</button>
            <button class="btn" data-action="frame-sim-center">SIM: Center on Target</button>
          </div>
          ${
            framing.solved
              ? `<div class="kpi-grid">
                  <div class="kpi-box"><div>L-BRACKET ΔRA/ΔDec</div><div style="font-size:12px">${(framing.instructions_equatorial || []).join('<br/>')}</div></div>
                  <div class="kpi-box"><div>BALL-HEAD ΔX/ΔY</div><div style="font-size:12px">${(framing.instructions_ballhead || []).join('<br/>')}</div></div>
                  <div class="kpi-box"><div>OFFSET / PA</div><div class="kpi-val">${framing.angular_separation_deg}°</div><div style="font-size:11px">Roll ${framing.rotation_pa_deg}°</div></div>
                </div>`
              : ''
          }
          <h3>2B. Manual Focus Aid (TPO 180mm f/4.5)</h3>
          <div class="kpi-grid">
            <div class="kpi-box"><div>MEDIAN HFR</div><div class="kpi-val">${focus.hfr_median.toFixed(2)}px</div></div>
            <div class="kpi-box"><div>BEST MIN HFR</div><div class="kpi-val">${focus.min_hfr_achieved ? focus.min_hfr_achieved.toFixed(2) + 'px' : '--'}</div></div>
            <div class="kpi-box"><div>FWHM / STARS</div><div class="kpi-val">${focus.fwhm_arcsec.toFixed(1)}" (${focus.star_count})</div></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="focus-shot">SINGLE FOCUS SHOT</button>
            <button class="btn" data-action="focus-sim-in">SIM: Focus Ring In (-0.5)</button>
          </div>
        </div>
      `;
    } else if (store.activeTab === 'SEQUENCE') {
      tabHtml = `
        <div class="card">
          <h3>3. Resilient .CR3 RAW Sequencer (${sequence.status})</h3>
          ${
            sequence.interlock_required
              ? `<div class="kpi-box" style="border-color:#f59e0b">
                  <div><strong>CALIBRATION INTERLOCK: ${sequence.interlock_type}</strong></div>
                  <div style="margin:6px 0">${sequence.interlock_message}</div>
                  <button class="btn btn-primary" data-action="seq-confirm-interlock">CONFIRM &amp; RESUME</button>
                </div>`
              : ''
          }
          <div class="kpi-grid">
            <div class="kpi-box"><div>STEP</div><div class="kpi-val">${sequence.current_frame_type}</div></div>
            <div class="kpi-box"><div>PROGRESS</div><div class="kpi-val">${sequence.overall_completed}/${sequence.overall_total}</div></div>
            <div class="kpi-box"><div>LAST HFR</div><div class="kpi-val">${sequence.last_frame_hfr ?? '--'}</div></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="seq-start">START .CR3 SEQUENCE</button>
            <button class="btn" data-action="seq-pause">PAUSE</button>
            <button class="btn" data-action="seq-resume">RESUME</button>
            <button class="btn" data-action="seq-abort">ABORT SEQUENCE (RESTORE RAW)</button>
          </div>
        </div>
      `;
    } else if (store.activeTab === 'OFFLOAD') {
      const sessHtml = (store.sessions || [])
        .map(
          (s) => `
          <div class="kpi-box" style="text-align:left;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap">
              <strong>${s.target_name} (${s.id})</strong>
              <span>Accepted: ${s.accepted_frames} | Rejected: ${s.rejected_frames} | ${s.total_size_mb} MB</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn btn-primary" style="text-decoration:none;display:inline-flex;align-items:center" href="/api/sessions/${s.id}/download.zip?exclude_rejected=true">
                Download Siril Streaming ZIP
              </a>
              <button class="btn" data-action="sess-autocull" data-session="${s.id}">Auto-Reject Outliers</button>
              <button class="btn" data-action="sess-purge" data-session="${s.id}">Purge Rejected</button>
            </div>
          </div>`
        )
        .join('');
      tabHtml = `
        <div class="card">
          <h3>4. Sessions, Sub-Frame Culling &amp; Multi-Path Offload</h3>
          <div class="kpi-grid">
            <div class="kpi-box"><div>SMB3 WINDOWS</div><div style="font-size:12px;font-family:monospace">\\\\astro.local\\captures</div></div>
            <div class="kpi-box"><div>SMB3 MACOS</div><div style="font-size:12px;font-family:monospace">smb://astro.local/captures</div></div>
            <div class="kpi-box">
              <button class="btn btn-primary" style="width:100%" data-action="usb-eject">SAFE EJECT USB 3.0</button>
            </div>
          </div>
          ${sessHtml || '<div style="opacity:0.7">No capture sessions recorded yet.</div>'}
        </div>
      `;
    }

    root.innerHTML = `
      <header class="hud-header">
        <div class="hud-row">
          <div style="display:flex;align-items:center;gap:8px">
            <strong>ASTROPI</strong>
            <span class="badge ${camera.is_fast_jpg_mode ? 'badge-jpg' : 'badge-raw'}">
              ${camera.is_fast_jpg_mode ? 'FAST JPG (SOLVE)' : 'RAW (.CR3)'}
            </span>
            <span style="font-size:12px">Disk: ${system.disk_free_gb} GB | Pi: ${system.cpu_temp_c}°C / ${system.ram_used_mb} MB</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" style="min-height:40px;padding:6px 10px" data-action="sync-gps">
              GPS (${observer.latitude_deg.toFixed(2)}°, ${observer.longitude_deg.toFixed(2)}°)
            </button>
            <button class="btn ${store.nightVision ? 'btn-active' : ''}" style="min-height:40px;padding:6px 10px" data-action="toggle-nv">
              ${store.nightVision ? 'OLED RED: ON' : 'NIGHT VISION'}
            </button>
          </div>
        </div>
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
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>LIVE STRETCHED PREVIEW (${store.state.preview?.source_format || 'RAW'})</strong>
            <button class="btn" style="min-height:38px;padding:4px 10px" data-action="manual-shot">TEST SHOT</button>
          </div>
          <canvas id="sky-canvas" style="width:100%;border-radius:8px;background:#000"></canvas>
        </div>
      </main>
    `;

    renderPreviewCanvas();
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.tab) {
      store.activeTab = btn.dataset.tab;
      await refreshAll();
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
    } else if (act === 'sync-gps') {
      await api('/api/system/location-time', 'PUT', {
        client_utc_timestamp: Date.now() / 1000,
        sync_source: 'Browser Clock/GPS',
      });
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
    } else if (act === 'frame-solve') {
      await api('/api/framing/solve', 'POST', { exposure_s: 2.0, iso: '1600' });
      await refreshAll();
    } else if (act === 'frame-sim-center') {
      await api('/api/framing/solve', 'POST', { exposure_s: 2.0, iso: '1600', sim_center_on_target: true });
      await refreshAll();
    } else if (act === 'focus-shot') {
      await api('/api/framing/focus-step', 'POST', { exposure_s: 1.5, iso: '1600' });
      await refreshAll();
    } else if (act === 'focus-sim-in') {
      await api('/api/framing/focus-step', 'POST', { exposure_s: 1.5, iso: '1600', sim_focus_delta: -0.5 });
      await refreshAll();
    } else if (act === 'seq-start') {
      const plansRes = await api('/api/sequence/plans');
      const pid = plansRes.plans[0].id;
      await api(`/api/sequence/plans/${pid}/start`, 'POST', { reset_progress: true });
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
      await api('/api/sequence/abort', 'POST');
      await refreshAll();
    } else if (act === 'usb-eject') {
      const r = await api('/api/system/storage/eject', 'POST');
      alert(r.message);
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

  refreshAll();
  connectWs();
})();
