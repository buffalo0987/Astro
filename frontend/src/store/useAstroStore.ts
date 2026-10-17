import { create } from 'zustand';
import { audioCues } from '../utils/audioCues';

export interface AstroSnapshot {
  active_mode: 'IDLE' | 'PA' | 'FRAME' | 'FOCUS' | 'SEQUENCE';
  server_utc: number;
  observer: {
    latitude_deg: number;
    longitude_deg: number;
    elevation_m: number;
    pressure_hpa: number;
    temperature_c: number;
    refraction_enabled: boolean;
    clock_offset_s: number;
    sync_source: string;
  };
  camera: {
    connected: boolean;
    driver_mode: string;
    model: string;
    battery_pct: number;
    image_format: string;
    is_fast_jpg_mode: boolean;
    iso: string;
    shutter_speed: string;
    busy: boolean;
    exposing: boolean;
    exposure_total_s: number;
    exposure_elapsed_s: number;
    exposure_remaining_s: number;
    exposure_progress_pct: number;
    last_error: string | null;
    usb_reset_count: number;
  };
  system: {
    cpu_temp_c: number;
    cpu_percent: number;
    ram_used_mb: number;
    ram_percent: number;
    disk_free_gb: number;
    disk_total_gb: number;
    active_storage_path: string;
    usb_drive_mounted: boolean;
    usb_drive_label: string;
    smb_share_url: string;
    smb_mac_url: string;
  };
  pa: {
    phase: 'IDLE' | 'CALIBRATING' | 'LIVE_ADJUST';
    mode_points: number;
    auto_advance: boolean;
    refraction_pole: boolean;
    points: Array<{
      index: number;
      ra_hours: number;
      dec_deg: number;
      crota2_deg: number;
      alt_deg: number;
      az_deg: number;
    }>;
    bump_residual_arcmin: number;
    bump_warning: boolean;
    alt_error_arcmin: number;
    az_error_arcmin: number;
    total_error_arcmin: number;
    alt_direction: string;
    az_direction: string;
    sa2i_knob_turns: number;
    breadcrumb_trail: Array<{
      alt_error_arcmin: number;
      az_error_arcmin: number;
      total_error_arcmin: number;
    }>;
    loop_running: boolean;
    last_solve_ms: number;
  };
  framing: {
    target_id: string;
    target_name: string;
    target_ra_hours: number;
    target_dec_deg: number;
    solved: boolean;
    on_target?: boolean;
    current_ra_hours: number | null;
    current_dec_deg: number | null;
    rotation_pa_deg: number | null;
    fov_x_deg: number;
    fov_y_deg: number;
    angular_separation_deg: number;
    delta_ra_deg: number;
    delta_dec_deg: number;
    delta_alt_deg: number;
    delta_az_deg: number;
    camera_dx_deg: number;
    camera_dy_deg: number;
    instructions_equatorial: string[];
    instructions_ballhead: string[];
  };
  focus: {
    loop_running: boolean;
    hfr_median: number;
    fwhm_arcsec: number;
    star_count: number;
    min_hfr_achieved: number | null;
    roi: { x: number; y: number; size: number } | null;
    history: Array<{ timestamp: number; hfr: number; fwhm: number; stars: number }>;
    audio_cues_enabled: boolean;
  };
  preview: {
    image_url: string | null;
    timestamp: number | null;
    width: number;
    height: number;
    source_format: string;
    auto_stretched: boolean;
    histogram: { r: number[]; g: number[]; b: number[]; luma: number[]; median_adu?: number };
    stars_overlay: Array<{ x: number; y: number; hfr: number; fwhm_arcsec: number; peak_adu: number }>;
    meta: Record<string, unknown>;
  };
  sequence: {
    active_plan_id: string | null;
    status: string;
    target_name: string;
    active_step_index: number;
    current_frame_type: string;
    current_frame_num: number;
    total_step_frames: number;
    overall_completed: number;
    overall_total: number;
    interlock_required: boolean;
    interlock_type: string | null;
    interlock_message: string | null;
    last_saved_file: string | null;
    last_frame_hfr: number | null;
  };
}

interface AstroStore {
  nightVision: boolean;
  activeTab: 'PA' | 'FRAME' | 'SEQUENCE' | 'OFFLOAD';
  drawerOpen: boolean;
  wsConnected: boolean;
  state: AstroSnapshot | null;
  toggleNightVision: () => void;
  setActiveTab: (tab: 'PA' | 'FRAME' | 'SEQUENCE' | 'OFFLOAD') => void;
  setDrawerOpen: (open: boolean) => void;
  fetchInitialState: () => Promise<void>;
  connectWebSocket: () => void;
  syncBrowserGpsAndTime: () => Promise<void>;
}

export const useAstroStore = create<AstroStore>((set, get) => ({
  nightVision: false,
  activeTab: 'PA',
  drawerOpen: false,
  wsConnected: false,
  state: null,

  toggleNightVision: () => {
    const next = !get().nightVision;
    document.documentElement.classList.toggle('night-vision', next);
    set({ nightVision: next });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),

  fetchInitialState: async () => {
    const res = await fetch('/api/system/state');
    if (res.ok) {
      const data = await res.json();
      set({ state: data });
    }
  },

  connectWebSocket: () => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.onopen = () => set({ wsConnected: true });
    ws.onclose = () => {
      set({ wsConnected: false });
      setTimeout(() => get().connectWebSocket(), 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const cur = get().state;
        if (msg.type === 'STATE_SNAPSHOT' || msg.type === 'FRAME_SAVED') {
          set({ state: msg.payload });
        } else if (cur) {
          if (msg.type === 'CAMERA_STATUS' || msg.type === 'EXPOSURE_TICK') {
            set({ state: { ...cur, camera: msg.payload } });
          } else if (msg.type === 'PA_STATE') {
            const prevPts = cur.pa.points.length;
            const newPts = msg.payload.points?.length || 0;
            if (newPts > prevPts) audioCues.playPointLockedChime();
            set({ state: { ...cur, pa: msg.payload } });
          } else if (msg.type === 'FRAMING_STATE') {
            set({ state: { ...cur, framing: msg.payload } });
          } else if (msg.type === 'FOCUS_METRICS') {
            const hfr = msg.payload.hfr_median || 0;
            const isMin = hfr > 0 && hfr <= (msg.payload.min_hfr_achieved || 99);
            audioCues.playFocusHfrTone(hfr, isMin);
            set({ state: { ...cur, focus: msg.payload } });
          } else if (msg.type === 'PREVIEW_UPDATED') {
            set({ state: { ...cur, preview: msg.payload } });
          } else if (msg.type === 'SEQUENCE_PROGRESS' || msg.type === 'INTERLOCK_PROMPT') {
            if (msg.type === 'INTERLOCK_PROMPT') audioCues.playInterlockAlert();
            set({ state: { ...cur, sequence: msg.payload } });
          }
        }
      } catch {
        // Ignore malformed packets
      }
    };
  },

  syncBrowserGpsAndTime: async () => {
    const clientUtc = Date.now() / 1000;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await fetch('/api/system/location-time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude_deg: pos.coords.latitude,
              longitude_deg: pos.coords.longitude,
              elevation_m: pos.coords.altitude || 300,
              client_utc_timestamp: Date.now() / 1000,
              sync_source: 'Browser GPS',
            }),
          });
          await get().fetchInitialState();
        },
        async () => {
          await fetch('/api/system/location-time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_utc_timestamp: clientUtc,
              sync_source: 'Browser Clock',
            }),
          });
          await get().fetchInitialState();
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  },
}));
