/**
 * Slide-Over Observatory Settings Drawer: Live Clocks, Site Presets, Storage Volumes, Root CA, ASTAP & Runtime Stack
 */

import { html } from '../vendor/htm.mjs';
import { useState, useEffect } from '../vendor/hooks.mjs';
import {
  store,
  updateStore,
  useObservatoryClock,
  api,
  runAction,
  showNotice,
  loadCatalog,
  refreshAll,
} from '../store.js';

export function SystemDrawer({ observer, camera, system }) {
  const { utcStr, localStr, lstStr } = useObservatoryClock(observer);
  const [latVal, setLatVal] = useState(observer?.latitude_deg ?? 35.3395);
  const [lonVal, setLonVal] = useState(observer?.longitude_deg ?? -97.4867);
  const [presetName, setPresetName] = useState('Backyard');

  useEffect(() => {
    if (observer) {
      setLatVal(observer.latitude_deg);
      setLonVal(observer.longitude_deg);
    }
  }, [observer?.latitude_deg, observer?.longitude_deg]);

  if (!store.drawerOpen) return null;

  const isClockSynced = observer.last_synced_at !== null && observer.last_synced_at !== undefined;
  const rt = system?.runtime_stack || {};
  const volumes = store.storage?.volumes || [];

  const handleClose = () => updateStore({ drawerOpen: false });

  const handleBackdropClick = (e) => {
    if (e.target && e.target.id === 'drawer-backdrop') {
      handleClose();
    }
  };

  const handleApplyPreset = (p) =>
    runAction(null, async () => {
      await api('/api/system/location-time', 'PUT', {
        latitude_deg: Number(p.latitude_deg),
        longitude_deg: Number(p.longitude_deg),
        elevation_m: Number(p.elevation_m || 300),
        client_utc_timestamp: Date.now() / 1000,
        sync_source: `Preset: ${p.name}`,
      });
      showNotice(`Site set to ${p.name} & UTC clock synced.`, 'ok', 4000);
      await refreshAll();
    });

  const handleSaveSite = () =>
    runAction(null, async () => {
      const lat = Number(latVal);
      const lon = Number(lonVal);
      const name = presetName || 'Custom Site';
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
      updateStore({ presets: pr.presets || [] });
      showNotice(`Saved observing site "${name}" & synced UTC clock.`, 'ok', 4000);
      await refreshAll();
    });

  const handleSyncGps = () => {
    const doSync = async (coords = null) => {
      try {
        const payload = {
          client_utc_timestamp: Date.now() / 1000,
          sync_source: coords ? 'Browser GPS & Clock' : 'Browser Device Clock',
        };
        if (coords) {
          payload.latitude_deg = coords.latitude;
          payload.longitude_deg = coords.longitude;
          if (coords.altitude) payload.elevation_m = coords.altitude;
        }
        await api('/api/system/location-time', 'PUT', payload);
        showNotice(coords ? 'Synced GPS coordinates & UTC clock!' : 'Synced UTC clock from device!', 'ok', 4000);
        await refreshAll();
        loadCatalog().catch(() => {});
      } catch (err) {
        showNotice(`Clock/GPS sync failed: ${err.message}`, 'err');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doSync(pos.coords),
        () => doSync(null),
        { timeout: 6000 }
      );
    } else {
      doSync(null);
    }
  };

  const handleSelectVolume = (path) =>
    runAction(null, async () => {
      const st = await api('/api/system/storage/select', 'POST', { path });
      updateStore({ storage: st });
      showNotice(`Active capture volume set to ${path}`, 'ok', 4000);
      await refreshAll();
    });

  const handleUsbReset = () =>
    runAction('usb-reset', async () => {
      await api('/api/camera/reset-usb', 'POST');
      showNotice('Issued USB port reset to Canon EOS M200.', 'ok', 5000);
      await refreshAll();
    });

  const stackItems = [
    { key: 'pyerfa', label: 'ERFA Astrometry' },
    { key: 'sep', label: 'SEP Photometry' },
    { key: 'rawpy', label: 'LibRaw 14-Bit CR3' },
    { key: 'simplejpeg', label: 'TurboJPEG SIMD' },
    { key: 'orjson', label: 'orjson Serializer' },
    { key: 'uvloop', label: 'uvloop Event Loop' },
  ];

  return html`
    <div class="modal-backdrop" id="drawer-backdrop" onClick=${handleBackdropClick}>
      <div class="modal-drawer">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-col);padding-bottom:10px">
          <h3 style="font-size:16px">Observing Site, Clock &amp; Hardware</h3>
          <button class="btn btn-sm" onClick=${handleClose}>✕ Close</button>
        </div>

        <!-- Observatory Clock & Sync Status -->
        <div class="kpi-box" style="text-align:left;display:grid;gap:8px;background:var(--bg-oled);border:1px solid var(--border-col);padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="kpi-label">OBSERVATORY CLOCK &amp; TIME SYNCHRONIZATION</div>
            <span
              class="badge ${isClockSynced ? 'badge-raw' : 'badge-jpg'}"
              style=${isClockSynced ? 'background:#0e4429;border-color:#3fb950;color:#3fb950;font-weight:700' : ''}
            >
              ${isClockSynced ? '🟢 CLOCK SYNCED' : '⚠️ SYNC RECOMMENDED'}
            </span>
          </div>
          <div class="kpi-grid" style="grid-template-columns:repeat(3, 1fr);gap:6px">
            <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
              <div style="font-size:10px;color:var(--text-muted);font-weight:700">PI UTC CLOCK</div>
              <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--text-main);margin-top:2px" id="drawer-utc-clock">
                ${utcStr} UTC
              </div>
              <div style="font-size:10px;color:var(--text-muted)">Universal Time</div>
            </div>
            <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
              <div style="font-size:10px;color:var(--text-muted);font-weight:700">LOCAL TIME</div>
              <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--text-main);margin-top:2px" id="drawer-local-clock">
                ${localStr}
              </div>
              <div style="font-size:10px;color:var(--text-muted)">Device Local</div>
            </div>
            <div style="background:var(--bg-card);padding:8px;border-radius:6px;border:1px solid var(--border-col)">
              <div style="font-size:10px;color:var(--text-muted);font-weight:700">SIDEREAL (LST)</div>
              <div style="font-size:13px;font-weight:800;font-family:monospace;color:var(--accent);margin-top:2px" id="drawer-lst-clock">
                ${lstStr}
              </div>
              <div style="font-size:10px;color:var(--text-muted)">Meridian RA</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap;gap:6px">
            <div>
              Sync Source: <strong style="color:var(--text-main)">${observer.sync_source || 'Browser Clock'}</strong>
              ${observer.clock_offset_s !== undefined
                ? ` (Delta: ${observer.clock_offset_s > 0 ? '+' : ''}${Number(observer.clock_offset_s).toFixed(2)}s)`
                : ''}
            </div>
            <button class="btn btn-sm btn-primary" onClick=${handleSyncGps} style="padding:4px 10px">
              ⚡ Sync Clock &amp; GPS Now
            </button>
          </div>
        </div>

        <div style="display:grid;gap:8px">
          <div class="kpi-label">1. SAVED OBSERVING SITE PRESETS</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${(store.presets || []).length > 0
              ? store.presets.map(
                  (p) => html`
                    <button key=${p.id || p.name} class="btn btn-sm" onClick=${() => handleApplyPreset(p)}>
                      📍 ${p.name} (${Number(p.latitude_deg).toFixed(2)}°, ${Number(p.longitude_deg).toFixed(2)}°)
                    </button>
                  `
                )
              : html`<span style="font-size:12px;color:var(--text-muted)">No saved presets yet.</span>`}
          </div>
        </div>

        <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
          <div class="kpi-label">2. SET SITE COORDINATES &amp; SAVE PRESET</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label style="font-size:11px">
              Latitude (°N):
              <input
                id="drawer-lat"
                type="number"
                step="0.0001"
                value=${latVal}
                onInput=${(e) => setLatVal(e.target.value)}
                style="margin-top:4px"
              />
            </label>
            <label style="font-size:11px">
              Longitude (°E):
              <input
                id="drawer-lon"
                type="number"
                step="0.0001"
                value=${lonVal}
                onInput=${(e) => setLonVal(e.target.value)}
                style="margin-top:4px"
              />
            </label>
          </div>
          <input
            id="drawer-preset-name"
            placeholder="Preset Name (e.g. Backyard, Dark Sky Park)"
            value=${presetName}
            onInput=${(e) => setPresetName(e.target.value)}
          />
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-primary" style="flex:1" onClick=${handleSaveSite}>
              Save Site &amp; Sync UTC Clock
            </button>
            <button class="btn btn-sm" onClick=${handleSyncGps}>
              Sync Phone Clock/GPS
            </button>
          </div>
        </div>

        ${volumes.length > 0
          ? html`
              <div style="display:grid;gap:6px;border-top:1px solid var(--border-col);padding-top:10px">
                <div class="kpi-label">3. ACTIVE CAPTURE VOLUME &amp; HTTPS PWA TRUST</div>
                ${volumes.map(
                  (v) => html`
                    <button
                      key=${v.path}
                      class="btn btn-sm ${v.active ? 'btn-ok' : ''}"
                      style="justify-content:space-between"
                      onClick=${() => handleSelectVolume(v.path)}
                    >
                      <span>${v.active ? '✓ ' : ''}${v.label}</span>
                      <span style="font-size:11px;opacity:0.85">${v.free_gb} GB free</span>
                    </button>
                  `
                )}
                <a class="btn btn-sm" style="text-decoration:none" href="/api/system/ca.crt">
                  🔐 Install AstroPi Local HTTPS Root CA (.crt)
                </a>
              </div>
            `
          : html`
              <div style="display:grid;gap:6px;border-top:1px solid var(--border-col);padding-top:10px">
                <div class="kpi-label">3. HTTPS SECURE CONTEXT / OFFLINE PWA</div>
                <a class="btn btn-sm" style="text-decoration:none" href="/api/system/ca.crt">
                  🔐 Install AstroPi Local HTTPS Root CA (.crt)
                </a>
              </div>
            `}

        <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
          <div class="kpi-label">4. ASTAP SOLVER, CANON USB &amp; C-ACCELERATED STACK</div>
          <div class="preflight-pill">
            <span style="color:var(--text-muted)">ASTAP SOLVER (180mm)</span>
            <strong style=${`color:${system?.astap_ready ? 'var(--ok-col)' : 'var(--warn-col)'}`}>
              ${system?.astap_ready ? `🟢 ${system.astap_status}` : `⚠️ ${system?.astap_status || 'Check ASTAP'}`}
            </strong>
          </div>

          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${stackItems.map(
              (item) => html`
                <span
                  key=${item.key}
                  class="badge ${rt[item.key] ? 'badge-raw' : ''}"
                  style="font-size:10px;padding:2px 6px"
                  title=${rt[item.key] ? `${item.label}: Native C module active` : `${item.label}: Pure-Python fallback active`}
                >
                  ${rt[item.key] ? '⚡' : '•'} ${item.label}
                </span>
              `
            )}
          </div>

          <p style="font-size:11px;color:var(--text-muted)">
            If the camera shutter locks up or USB disconnects in the cold, issue a kernel USBDEVFS_RESET:
          </p>
          <button class="btn btn-sm" onClick=${handleUsbReset} disabled=${Boolean(store.busyAction)}>
            ⚡ Reset Canon EOS M200 USB Port (Resets: ${camera.usb_reset_count || 0})
          </button>
        </div>

        ${camera.driver_mode === 'simulator'
          ? html`
              <div style="display:grid;gap:8px;border-top:1px solid var(--border-col);padding-top:10px">
                <div class="kpi-label">5. DEVELOPER / SIMULATOR CONTROLS</div>
                <button
                  class="btn btn-sm ${store.showSimControls ? 'btn-active' : ''}"
                  onClick=${() => updateStore({ showSimControls: !store.showSimControls })}
                >
                  ${store.showSimControls ? 'Hide Simulator Shortcut Buttons' : 'Show Simulator Shortcut Buttons'}
                </button>
              </div>
            `
          : null}
      </div>
    </div>
  `;
}
