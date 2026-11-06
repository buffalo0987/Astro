/**
 * Reactive Pub/Sub Observatory Store, REST/WebSocket Client & Calibration Helpers
 */

import { useState, useEffect } from './vendor/hooks.mjs';
import { playTone } from './audio.js';
import { DEFAULT_TARGETS, computeLst } from './catalog.js';

export const PREVIEW_EXP_OPTIONS = [
  { val: '0.001', label: '1/1000s' },
  { val: '0.004', label: '1/250s' },
  { val: '0.0167', label: '1/60s' },
  { val: '0.0667', label: '1/15s' },
  { val: '0.25', label: '1/4s' },
  { val: '0.5', label: '0.5s' },
  { val: '1', label: '1s' },
  { val: '1.6', label: '1.6s' },
  { val: '2', label: '2s' },
  { val: '3.2', label: '3.2s' },
  { val: '5', label: '5s' },
  { val: '8', label: '8s' },
  { val: '10', label: '10s' },
  { val: '15', label: '15s' },
  { val: '20', label: '20s' },
  { val: '30', label: '30s' },
];

export const TRAILED_ECCENTRICITY_LIMIT = 0.65;

export const store = {
  nightVision: false,
  activeTab: 'PA',
  subTabFrame: 'FRAMING', // 'FRAMING' | 'FOCUS'
  state: null,
  catalog: [...DEFAULT_TARGETS],
  catalogSearch: '',
  catalogAboveHorizon: false,
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
  panX: 0.5,
  panY: 0.5,
  liveLoopRunning: false,
  catalogLoading: false,
  manualExposure: '2',
  manualIso: '1600',
  histMode: 'AUTO', // 'AUTO' | 'LIGHT' | 'FLAT'
  flatCalibratedExp: null,
  flatCalibratedIso: null,
  flatCalibratedLabel: null,
  lastAutoFlat: null,
  lastAutoLight: null,
  notice: null,
  busyAction: null,
};

let storeVersion = 0;
const listeners = new Set();
const previewListeners = new Set();

export function notifyStore() {
  storeVersion += 1;
  for (const fn of listeners) fn(storeVersion);
}

export function notifyPreviewCanvas() {
  for (const fn of previewListeners) fn();
}

export function subscribePreviewCanvas(fn) {
  previewListeners.add(fn);
  return () => previewListeners.delete(fn);
}

export function updateStore(patch) {
  Object.assign(store, patch);
  notifyStore();
}

export function useStore() {
  const [, setTick] = useState(storeVersion);
  useEffect(() => {
    const sub = (v) => setTick(v);
    listeners.add(sub);
    return () => listeners.delete(sub);
  }, []);
  return store;
}

export function useObservatoryClock(observer) {
  const [, setSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const offset = observer?.clock_offset_s !== undefined ? Number(observer.clock_offset_s || 0) : 0;
  const nowSec = Date.now() / 1000 + offset;
  const d = new Date(nowSec * 1000);
  const utcStr = d.toISOString().substring(11, 19);
  const localStr = d.toLocaleTimeString([], { hour12: false });
  const lstStr = computeLst(nowSec, observer?.longitude_deg ?? -97.4867);
  return { nowSec, utcStr, localStr, lstStr };
}

let noticeTimer = null;

export function showNotice(message, level = 'err', autoHideMs = 10000) {
  store.notice = { message, level };
  if (level === 'err') playTone(310, 140, 'sawtooth');
  else if (level === 'ok') playTone(740, 100, 'sine');
  if (noticeTimer) clearTimeout(noticeTimer);
  if (autoHideMs > 0) {
    noticeTimer = setTimeout(() => {
      store.notice = null;
      notifyStore();
    }, autoHideMs);
  }
  notifyStore();
}

export function dismissNotice() {
  if (noticeTimer) clearTimeout(noticeTimer);
  store.notice = null;
  notifyStore();
}

export async function api(path, method = 'GET', body = null) {
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

export async function runAction(busyKey, fn) {
  if (busyKey) {
    store.busyAction = busyKey;
    notifyStore();
  }
  try {
    return await fn();
  } catch (err) {
    showNotice(err.message || 'Action failed', 'err', 12000);
    return null;
  } finally {
    if (busyKey && store.busyAction === busyKey) {
      store.busyAction = null;
      notifyStore();
    }
  }
}

export function classifyEccentricity(ecc) {
  const val = Number(ecc || 0);
  if (!Number.isFinite(val) || val <= 0) {
    return { val: 0, text: '--', shortLabel: 'Pending', badgeClass: '', trailed: false };
  }
  if (val >= TRAILED_ECCENTRICITY_LIMIT) {
    return {
      val,
      text: val.toFixed(2),
      shortLabel: '⚠️ Trailed',
      badgeClass: 'badge-jpg',
      trailed: true,
    };
  }
  if (val >= 0.42) {
    return {
      val,
      text: val.toFixed(2),
      shortLabel: 'Slightly Oval',
      badgeClass: '',
      trailed: false,
    };
  }
  return {
    val,
    text: val.toFixed(2),
    shortLabel: 'Round ✓',
    badgeClass: 'badge-raw',
    trailed: false,
  };
}

export function isFlatHistActive() {
  if (store.histMode === 'FLAT') return true;
  if (store.histMode === 'LIGHT') return false;
  const seq = store.state?.sequence;
  if (seq && (seq.interlock_type === 'Flat' || seq.current_frame_type === 'Flat')) return true;
  if (store.state?.preview?.meta?.frame_type === 'Flat') return true;
  return false;
}

export function evaluateFlatHistogram(hist) {
  if (!hist) return { pct: 0, ok: false, label: 'Capture a test shot to check Flat ADU (target 35–55%)' };
  const med = Number(hist.median_adu ?? 0);
  const pct = Math.round((med / 255) * 100);
  const maxChP99 = Number(hist.max_channel_p99_adu ?? hist.p99_adu ?? 0);
  if (maxChP99 >= 242) {
    return { pct, ok: false, warn: true, label: '⚠️ CHANNEL CLIPPING (>95%) — Shorten Exp or Dim Panel!' };
  }
  if (pct > 55) {
    return { pct, ok: false, warn: true, label: `⚠️ Too Bright (${pct}% > 55%) — Shorten Flat Exposure` };
  }
  if (pct < 35) {
    return { pct, ok: false, warn: true, label: `⚠️ Underexposed (${pct}% < 35%) — Lengthen Flat Exposure` };
  }
  return { pct, ok: true, warn: false, label: '✓ Optimal Siril Flat Zone (35–55% • No Channel Clipping)' };
}

export async function loadCatalog() {
  if (store.catalogLoading) return;
  store.catalogLoading = true;
  notifyStore();
  try {
    const q = new URLSearchParams();
    if (store.catalogSearch.trim()) q.set('search', store.catalogSearch.trim());
    if (store.catalogAboveHorizon) q.set('min_alt', '5');
    if (store.catalogTpo180Only) q.set('tpo180_only', 'true');
    const qStr = q.toString();
    const path = qStr ? `/api/framing/catalog?${qStr}` : '/api/framing/catalog';
    const cat = await api(path);
    if (cat && cat.items && cat.items.length > 0) {
      const liveMap = new Map(cat.items.map((it) => [it.id, it]));
      store.catalog = DEFAULT_TARGETS.map((def) => liveMap.get(def.id) || def);
      for (const item of cat.items) {
        if (!DEFAULT_TARGETS.some((d) => d.id === item.id)) {
          store.catalog.push(item);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load catalog:', err);
  } finally {
    store.catalogLoading = false;
    notifyStore();
  }
}

export async function refreshAll() {
  try {
    store.state = await api('/api/system/state');
    if (store.state?.camera && typeof store.state.camera.live_view_running === 'boolean') {
      store.liveLoopRunning = store.state.camera.live_view_running;
    }
  } catch (err) {
    console.warn('Failed to fetch system state:', err);
  }
  notifyStore();

  if (store.activeTab === 'FRAME') {
    loadCatalog().catch(() => {});
  }
  if (store.activeTab === 'SEQUENCE') {
    try {
      const p = await api('/api/sequence/plans');
      store.plans = p.plans || [];
      if (!store.editingSteps && store.plans.length > 0) {
        const first = store.plans[0];
        store.editingPlanId = first.id;
        store.editingPlanName = first.name;
        store.editingSteps = (first.steps || []).map((st) => ({ ...st }));
      }
      notifyStore();
    } catch (err) {
      console.warn('Failed to fetch sequence plans:', err);
    }
  }
  if (store.activeTab === 'OFFLOAD') {
    try {
      const s = await api('/api/sessions');
      store.sessions = s.sessions || [];
      store.storage = s.storage || null;
      notifyStore();
    } catch (err) {
      console.warn('Failed to fetch sessions:', err);
    }
  }
  if (store.drawerOpen) {
    try {
      const [pr, st] = await Promise.all([
        store.presets.length === 0 ? api('/api/system/presets') : Promise.resolve({ presets: store.presets }),
        api('/api/system/storage'),
      ]);
      store.presets = pr.presets || [];
      store.storage = st;
      notifyStore();
    } catch (err) {
      console.warn('Failed to fetch drawer info:', err);
    }
  }
}

export function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    store.wsConnected = true;
    notifyStore();
  };
  ws.onclose = () => {
    store.wsConnected = false;
    notifyStore();
    setTimeout(connectWs, 2000);
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'STATE_SNAPSHOT' || msg.type === 'FRAME_SAVED') {
        store.state = msg.payload;
        if (msg.payload?.camera && typeof msg.payload.camera.live_view_running === 'boolean') {
          store.liveLoopRunning = msg.payload.camera.live_view_running;
        }
        notifyStore();
        notifyPreviewCanvas();
      } else if (store.state) {
        if (msg.type === 'PREVIEW_UPDATED') {
          store.state = { ...store.state, preview: msg.payload };
          notifyPreviewCanvas();
          notifyStore();
          return;
        }
        if (msg.type === 'EXPOSURE_TICK') {
          store.state = { ...store.state, camera: msg.payload };
          notifyStore();
          return;
        }
        if (msg.type === 'CAMERA_STATUS') {
          if (typeof msg.payload.live_view_running === 'boolean') {
            store.liveLoopRunning = msg.payload.live_view_running;
          }
          store.state = { ...store.state, camera: msg.payload };
        } else if (msg.type === 'PA_STATE') {
          if ((msg.payload.points || []).length > (store.state.pa?.points || []).length) {
            playTone(660, 140, 'triangle');
          }
          store.state = { ...store.state, pa: msg.payload };
        } else if (msg.type === 'FRAMING_STATE') {
          store.state = { ...store.state, framing: msg.payload };
        } else if (msg.type === 'FOCUS_METRICS') {
          store.state = { ...store.state, focus: msg.payload };
          if (msg.payload.hfr_median > 0) {
            playTone(Math.max(240, 900 - msg.payload.hfr_median * 110), 90);
          }
        } else if (msg.type === 'SEQUENCE_PROGRESS' || msg.type === 'INTERLOCK_PROMPT') {
          if (msg.type === 'INTERLOCK_PROMPT') {
            playTone(440, 220, 'sawtooth');
            store.flatCalibratedExp = null;
            if (msg.payload?.interlock_type === 'Flat') {
              store.histMode = 'FLAT';
              if (msg.payload.pending_step_exposure_s) {
                store.manualExposure = String(msg.payload.pending_step_exposure_s);
              }
              if (msg.payload.pending_step_iso) {
                store.manualIso = String(msg.payload.pending_step_iso);
              }
            }
          }
          store.state = { ...store.state, sequence: msg.payload };
        }
        notifyStore();
      }
    } catch (_) {}
  };
}
