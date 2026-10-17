import React from 'react';
import { useAstroStore } from '../store/useAstroStore';

export const TelemetryHud: React.FC = () => {
  const { state, nightVision, toggleNightVision, wsConnected, setDrawerOpen } = useAstroStore();
  if (!state) return null;

  const { camera, system, observer } = state;

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800 bg-black/95 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              wsConnected && camera.connected ? 'bg-emerald-500' : 'bg-red-600'
            }`}
          />
          <span className="font-bold tracking-wide text-sm md:text-base">
            ASTROPI <span className="text-xs opacity-75">{camera.model}</span>
          </span>
          <span
            className={`px-2 py-0.5 text-xs font-extrabold rounded border ${
              camera.is_fast_jpg_mode
                ? 'border-amber-500/60 text-amber-400 bg-amber-950/40'
                : 'border-emerald-500/60 text-emerald-400 bg-emerald-950/40'
            }`}
          >
            {camera.is_fast_jpg_mode ? 'FAST JPG (SOLVE)' : 'RAW (.CR3)'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>ISO {camera.iso}</span>
          <span>Disk: {system.disk_free_gb} GB free</span>
          <span>Pi: {system.cpu_temp_c}°C | {system.ram_used_mb} MB RAM</span>
          <span>
            GPS: {observer.latitude_deg.toFixed(2)}°, {observer.longitude_deg.toFixed(2)}° ({observer.sync_source})
          </span>

          <button
            type="button"
            onClick={toggleNightVision}
            className={`min-h-[42px] px-3 py-1.5 rounded font-bold border ${
              nightVision
                ? 'border-red-500 bg-red-950 text-red-300'
                : 'border-neutral-700 bg-neutral-900 text-neutral-200'
            }`}
          >
            {nightVision ? 'NIGHT VISION: ON' : 'NIGHT VISION: OFF'}
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-[42px] px-3 py-1.5 rounded font-bold border border-neutral-700 bg-neutral-900"
          >
            SYSTEM / GPS
          </button>
        </div>
      </div>

      {camera.exposing && (
        <div className="mt-2">
          <div className="flex justify-between text-xs font-mono mb-1">
            <span>EXPOSING ({camera.shutter_speed})</span>
            <span>
              {camera.exposure_elapsed_s.toFixed(1)}s / {camera.exposure_total_s.toFixed(1)}s (
              {camera.exposure_remaining_s.toFixed(1)}s rem)
            </span>
          </div>
          <div className="w-full h-2 bg-neutral-900 rounded overflow-hidden">
            <div
              className="h-full bg-red-600 transition-all duration-150"
              style={{ width: `${camera.exposure_progress_pct}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
};
