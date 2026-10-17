import React, { useState } from 'react';
import { useAstroStore } from '../store/useAstroStore';

export const SystemDrawer: React.FC = () => {
  const { state, drawerOpen, setDrawerOpen, syncBrowserGpsAndTime, fetchInitialState } = useAstroStore();
  const [lat, setLat] = useState(state?.observer.latitude_deg ?? 38.8951);
  const [lon, setLon] = useState(state?.observer.longitude_deg ?? -77.0364);

  if (!drawerOpen || !state) return null;

  const saveManualCoords = async () => {
    await fetch('/api/system/location-time', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude_deg: lat,
        longitude_deg: lon,
        client_utc_timestamp: Date.now() / 1000,
        sync_source: 'Manual Preset',
      }),
    });
    await fetchInitialState();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex justify-end">
      <div className="w-full max-w-md bg-neutral-950 border-l border-neutral-800 p-4 space-y-4 overflow-y-auto">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
          <h2 className="text-lg font-extrabold">System, Field GPS &amp; HTTPS Setup</h2>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="px-3 py-1 rounded border border-neutral-700 font-bold"
          >
            Close
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="font-bold text-sm">1. Smartphone GPS &amp; Offline Clock Sync</div>
          <button
            type="button"
            onClick={syncBrowserGpsAndTime}
            className="w-full min-h-[48px] rounded-xl font-extrabold border border-red-500 bg-red-900/40"
          >
            AUTO-SYNC GPS &amp; UTC CLOCK FROM THIS DEVICE
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <label>
              Latitude (°N):
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                className="w-full mt-1 bg-black border border-neutral-700 rounded px-2 py-1.5"
              />
            </label>
            <label>
              Longitude (°E):
              <input
                type="number"
                step="0.0001"
                value={lon}
                onChange={(e) => setLon(Number(e.target.value))}
                className="w-full mt-1 bg-black border border-neutral-700 rounded px-2 py-1.5"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={saveManualCoords}
            className="w-full py-2 rounded border border-neutral-700 font-bold"
          >
            Save Manual Coordinates &amp; Sync Clock
          </button>
        </div>

        <div className="space-y-2 text-xs border-t border-neutral-800 pt-3">
          <div className="font-bold text-sm">2. Field HTTPS &amp; PWA Root CA Certificate</div>
          <p className="opacity-75">
            Install this local Root CA on iOS Safari / Android Chrome so offline HTTPS (
            <span className="font-mono">https://astro.local</span>) and Browser Geolocation work in the field.
          </p>
          <a
            href="/api/system/ca.crt"
            className="block text-center py-2.5 rounded-lg border border-neutral-700 font-bold bg-black"
          >
            Download AstroPi-Local-Root-CA.crt
          </a>
        </div>

        <div className="space-y-2 text-xs border-t border-neutral-800 pt-3">
          <div className="font-bold text-sm">3. Hardware USB Bus Recovery</div>
          <button
            type="button"
            onClick={() => fetch('/api/camera/reset-usb', { method: 'POST' })}
            className="w-full py-2.5 rounded-lg border border-neutral-700 font-bold bg-black"
          >
            Reset Canon EOS M200 USB Bus (USBDEVFS_RESET)
          </button>
        </div>
      </div>
    </div>
  );
};
