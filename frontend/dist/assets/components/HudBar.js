/**
 * Top Sticky Observatory HUD Header, Exposure Progress Bar, Workflow Tabs & Notice Banner
 */

import { html } from '../vendor/htm.mjs';
import {
  store,
  updateStore,
  useObservatoryClock,
  api,
  runAction,
  showNotice,
  dismissNotice,
  loadCatalog,
  refreshAll,
} from '../store.js';

function ClockPill({ observer, onOpenDrawer }) {
  const { utcStr } = useObservatoryClock(observer);
  const synced = Boolean(observer?.last_synced_at);
  return html`
    <button
      class="btn btn-sm"
      onClick=${onOpenDrawer}
      title=${`Observatory Clock: ${synced ? 'Synced' : 'Tap to sync'}. Tap to view clock & site settings`}
      style="display:inline-flex;align-items:center;gap:5px;font-family:monospace;font-size:12px;padding:3px 8px"
    >
      <span style=${`display:inline-block;width:7px;height:7px;border-radius:50%;background:${synced ? '#10b981' : '#f59e0b'}`}></span>
      <span id="hud-clock-time">${utcStr} UTC</span>
    </button>
  `;
}

export function HudBar({ camera, system, observer, isSim }) {
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

  const handleOpenDrawer = async () => {
    updateStore({ drawerOpen: true });
    try {
      const [pr, st] = await Promise.all([api('/api/system/presets'), api('/api/system/storage')]);
      updateStore({ presets: pr.presets || [], storage: st });
    } catch (_) {}
  };

  const handleToggleNightVision = () => {
    const nextNv = !store.nightVision;
    document.documentElement.classList.toggle('night-vision', nextNv);
    updateStore({ nightVision: nextNv });
  };

  const selectTab = (tab) => {
    updateStore({ activeTab: tab, abortArmed: false });
    if (tab === 'FRAME') loadCatalog().catch(() => {});
    refreshAll().catch(() => {});
  };

  return html`
    <header class="hud-header">
      <div class="hud-row">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="status-dot ${store.wsConnected && !isSim ? '' : isSim ? 'sim-mode' : 'offline'}"></span>
          <strong style="font-size:14px;letter-spacing:0.04em">ASTROPI</strong>
          ${isSim
            ? html`
                <button
                  class="btn btn-sm btn-warn"
                  onClick=${handleConnectCamera}
                  disabled=${Boolean(store.busyAction)}
                  title="Camera in simulator mode. Tap to connect physical Canon M200"
                >
                  ${store.busyAction === 'connect-camera' ? '⏳ Connecting...' : '⚡ Connect Camera (Simulator Mode)'}
                </button>
              `
            : html`
                <span class="badge badge-raw" style="background:#0e4429;border-color:#3fb950;color:#3fb950;font-weight:700">
                  🟢 ${camera.model || 'Canon EOS M200 (USB PTP)'}${camera.battery_pct !== undefined ? ` • 🔋 ${camera.battery_pct}%` : ''}
                </span>
              `}
          <span class="badge ${camera.is_fast_jpg_mode ? 'badge-jpg' : 'badge-raw'}">
            ${camera.is_fast_jpg_mode ? 'FAST JPG (SOLVE)' : 'RAW (.CR3)'}
          </span>
          <span style="font-size:12px;color:var(--text-muted)">
            ${system.disk_free_gb}GB free • ${system.cpu_temp_c}°C • ${system.ram_used_mb}MB RAM
          </span>
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <${ClockPill} observer=${observer} onOpenDrawer=${handleOpenDrawer} />
          <button class="btn btn-sm" onClick=${handleOpenDrawer}>
            📍 Site (${Number(observer.latitude_deg).toFixed(1)}°, ${Number(observer.longitude_deg).toFixed(1)}°)
          </button>
          <button class="btn btn-sm ${store.nightVision ? 'btn-active' : ''}" onClick=${handleToggleNightVision}>
            ${store.nightVision ? '🔴 RED: ON' : '🌙 NIGHT RED'}
          </button>
        </div>
      </div>

      <div class="exp-bar-wrap" id="exposure-bar-wrap" style=${`display:${camera.exposing ? 'block' : 'none'}`}>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-family:monospace;margin-bottom:2px">
          <span>EXPOSING (${camera.shutter_speed} @ ISO ${camera.iso})</span>
          <span id="exposure-bar-text">
            ${Number(camera.exposure_elapsed_s || 0).toFixed(1)}s / ${Number(camera.exposure_total_s || 0).toFixed(1)}s (${Number(camera.exposure_remaining_s || 0).toFixed(1)}s left)
          </span>
        </div>
        <div class="exp-bar-track">
          <div class="exp-bar-fill" id="exposure-bar-fill" style=${`width:${camera.exposure_progress_pct || 0}%`}></div>
        </div>
      </div>
    </header>

    <nav class="tabs-grid">
      <button class="btn ${store.activeTab === 'PA' ? 'btn-active' : ''}" onClick=${() => selectTab('PA')}>
        1. POLAR ALIGN
      </button>
      <button class="btn ${store.activeTab === 'FRAME' ? 'btn-active' : ''}" onClick=${() => selectTab('FRAME')}>
        2. FRAME &amp; FOCUS
      </button>
      <button class="btn ${store.activeTab === 'SEQUENCE' ? 'btn-active' : ''}" onClick=${() => selectTab('SEQUENCE')}>
        3. SEQUENCE (.CR3)
      </button>
      <button class="btn ${store.activeTab === 'OFFLOAD' ? 'btn-active' : ''}" onClick=${() => selectTab('OFFLOAD')}>
        4. SESSIONS &amp; OFFLOAD
      </button>
    </nav>

    ${store.notice
      ? html`
          <div style="padding:0 12px">
            <div class="notice-banner ${store.notice.level || 'err'}">
              <div>
                <strong>${store.notice.level === 'ok' ? '✓' : '⚠️'}</strong>
                <span style="margin-left:6px">${store.notice.message}</span>
              </div>
              <button class="btn btn-sm" onClick=${dismissNotice} style="min-height:28px;padding:2px 8px">✕</button>
            </div>
          </div>
        `
      : null}
  `;
}
