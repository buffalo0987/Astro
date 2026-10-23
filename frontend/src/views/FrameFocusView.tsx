import React, { useEffect, useState } from 'react';
import { HistogramChart } from '../components/HistogramChart';
import { SkyPreviewCanvas } from '../components/SkyPreviewCanvas';
import { useAstroStore } from '../store/useAstroStore';

interface CatalogItem {
  id: string;
  common_name: string;
  catalog_ids: string;
  object_type: string;
  constellation: string;
  ra_hours: number;
  dec_deg: number;
  current_alt_deg: number;
  current_az_deg: number;
  visible_now: boolean;
  is_tpo180_pick?: boolean;
  notes: string;
}

export const FrameFocusView: React.FC = () => {
  const { state } = useAstroStore();
  const [subTab, setSubTab] = useState<'FRAMING' | 'FOCUS'>('FRAMING');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState('');
  const [tpo180Only, setTpo180Only] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);

  const loadCatalog = async (q: string = '', tpoOnly: boolean = tpo180Only) => {
    const res = await fetch(
      `/api/framing/catalog?search=${encodeURIComponent(q)}${tpoOnly ? '&tpo180_only=true' : ''}`
    );
    if (res.ok) {
      const data = await res.json();
      setCatalog(data.items || []);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  if (!state) return null;
  const { framing, focus, camera } = state;

  const selectTarget = async (item: CatalogItem) => {
    await fetch('/api/framing/select-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_id: item.id,
        target_name: item.common_name,
        target_ra_hours: item.ra_hours,
        target_dec_deg: item.dec_deg,
      }),
    });
  };

  const solveFraming = async (centerSim: boolean = false) => {
    await fetch('/api/framing/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exposure_s: 2.0,
        iso: '1600',
        sim_center_on_target: centerSim,
      }),
    });
  };

  const runFocusStep = async (simFocusDelta?: number) => {
    await fetch('/api/framing/focus-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exposure_s: 1.5,
        iso: '1600',
        ...(simFocusDelta !== undefined ? { sim_focus_delta: simFocusDelta } : {}),
      }),
    });
  };

  const toggleFocusLoop = async () => {
    if (focus.loop_running) {
      await fetch('/api/framing/focus-loop/stop', { method: 'POST' });
    } else {
      await fetch('/api/framing/focus-loop/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposure_s: 1.5, iso: '1600' }),
      });
    }
  };

  const handleRoiClick = async (xNorm: number, yNorm: number) => {
    await fetch('/api/framing/focus-roi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roi: { x: xNorm, y: yNorm, size: 240 } }),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-3">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-neutral-800 bg-black">
          <button
            type="button"
            onClick={() => setSubTab('FRAMING')}
            className={`min-h-[44px] rounded-lg font-extrabold text-xs sm:text-sm ${
              subTab === 'FRAMING' ? 'bg-red-950/60 border border-red-500 text-red-200' : 'opacity-70'
            }`}
          >
            2A. PUSH-TO FRAMING
          </button>
          <button
            type="button"
            onClick={() => setSubTab('FOCUS')}
            className={`min-h-[44px] rounded-lg font-extrabold text-xs sm:text-sm ${
              subTab === 'FOCUS' ? 'bg-red-950/60 border border-red-500 text-red-200' : 'opacity-70'
            }`}
          >
            2B. FOCUS &amp; HFR AID
          </button>
        </div>

        {/* Offline Target Catalog & Push-To Framing */}
        {subTab === 'FRAMING' && (
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">2A. Plate-Solved &quot;Push-To&quot; Framing</h2>
            <button
              type="button"
              onClick={() => setShowCsvModal(!showCsvModal)}
              className="text-xs px-2.5 py-1 rounded border border-neutral-700"
            >
              Import Telescopius CSV
            </button>
          </div>

          {showCsvModal && (
            <div className="p-3 rounded border border-neutral-700 bg-black space-y-2 text-xs">
              <textarea
                rows={3}
                placeholder="Paste Telescopius CSV (Catalogue Entry, Familiar Name, Right Ascension, Declination)..."
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/framing/catalog/import-csv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csv_text: csvText }),
                  });
                  setShowCsvModal(false);
                  loadCatalog(search);
                }}
                className="px-3 py-1.5 rounded bg-red-900 font-bold"
              >
                Import Targets
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search M1–M110, NGC, Nebula, Focus Star..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                loadCatalog(e.target.value, tpo180Only);
              }}
              className="flex-1 bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const next = !tpo180Only;
                setTpo180Only(next);
                loadCatalog(search, next);
              }}
              className={`px-3 py-2 rounded border text-xs font-extrabold whitespace-nowrap ${
                tpo180Only
                  ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300'
                  : 'border-neutral-700 bg-black'
              }`}
            >
              {tpo180Only ? '★ TPO 180 Picks ✓' : '★ TPO 180 Picks'}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto border border-neutral-800 rounded divide-y divide-neutral-900 text-xs">
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTarget(item)}
                className={`w-full text-left px-3 py-2 flex justify-between items-center hover:bg-neutral-900 ${
                  framing.target_id === item.id ? 'bg-red-950/40 font-bold' : ''
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{item.common_name}</span>
                    {item.is_tpo180_pick && (
                      <span className="px-1.5 py-0.5 rounded border border-emerald-500/60 bg-emerald-950/50 text-emerald-300 text-[10px] font-extrabold">
                        ★ TPO 180 PICK
                      </span>
                    )}
                  </div>
                  <div className="opacity-60">
                    {item.catalog_ids} • {item.constellation}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className={item.visible_now ? 'text-emerald-400' : 'text-amber-500'}>
                    Alt {item.current_alt_deg}°
                  </div>
                  <div className="opacity-60">Az {item.current_az_deg}°</div>
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={camera.busy}
              onClick={() => solveFraming(false)}
              className="min-h-[56px] rounded-xl font-extrabold border border-red-500 bg-red-900/40"
            >
              SOLVE &amp; COMPUTE PUSH-TO
            </button>
            {camera.driver_mode === 'simulator' && (
              <button
                type="button"
                disabled={camera.busy}
                onClick={() => solveFraming(true)}
                className="min-h-[56px] rounded-xl font-bold border border-neutral-700 bg-neutral-900 text-xs"
              >
                SIM: PUSH TO TARGET &amp; RE-SOLVE
              </button>
            )}
          </div>

          {framing.solved && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
              <div className="p-3 rounded border border-neutral-800 bg-black space-y-1">
                <div className="font-bold opacity-75">EQUATORIAL L-BRACKET GUIDANCE</div>
                {framing.instructions_equatorial.map((line, i) => (
                  <div key={i} className="font-extrabold text-sm">
                    • {line}
                  </div>
                ))}
              </div>
              <div className="p-3 rounded border border-neutral-800 bg-black space-y-1">
                <div className="font-bold opacity-75">BALL-HEAD (CAMERA SCREEN) GUIDANCE</div>
                {framing.instructions_ballhead.map((line, i) => (
                  <div key={i} className="font-extrabold text-sm">
                    • {line}
                  </div>
                ))}
                <div className="opacity-75">
                  Sensor Roll PA: {framing.rotation_pa_deg}° | Offset: {framing.angular_separation_deg}°
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Manual Focus Aid (TPO UltraWide 180) */}
        {subTab === 'FOCUS' && (
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">2B. TPO 180 Manual Focus Aid (HFR / FWHM)</h2>
            {focus.roi && (
              <button
                type="button"
                onClick={() =>
                  fetch('/api/framing/focus-roi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clear: true }),
                  })
                }
                className="text-xs px-2 py-1 rounded border border-red-500"
              >
                Clear 1:1 Star ROI
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="p-2 rounded border border-neutral-800 bg-black">
              <div className="text-xs opacity-70">MEDIAN HFR</div>
              <div className="text-xl font-black">{focus.hfr_median.toFixed(2)} px</div>
            </div>
            <div className="p-2 rounded border border-neutral-800 bg-black">
              <div className="text-xs opacity-70">BEST MIN HFR</div>
              <div className="text-xl font-black">
                {focus.min_hfr_achieved ? `${focus.min_hfr_achieved.toFixed(2)} px` : '--'}
              </div>
            </div>
            <div className="p-2 rounded border border-neutral-800 bg-black">
              <div className="text-xs opacity-70">FWHM / STARS</div>
              <div className="text-base font-bold">
                {focus.fwhm_arcsec.toFixed(1)}&quot; ({focus.star_count})
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={camera.busy}
              onClick={() => runFocusStep()}
              className="min-h-[56px] rounded-xl font-bold border border-neutral-700 bg-neutral-900"
            >
              SINGLE FOCUS SHOT
            </button>
            <button
              type="button"
              onClick={toggleFocusLoop}
              className="min-h-[56px] rounded-xl font-extrabold border border-red-500 bg-red-900/40"
            >
              {focus.loop_running ? 'STOP FOCUS LOOP (RAW)' : 'START FAST FOCUS LOOP'}
            </button>
          </div>

          {camera.driver_mode === 'simulator' && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => runFocusStep(-0.5)}
                className="flex-1 py-2 rounded border border-neutral-700"
              >
                SIM: Turn TPO 180 Focus Ring In (-0.5)
              </button>
              <button
                type="button"
                onClick={() => runFocusStep(0.5)}
                className="flex-1 py-2 rounded border border-neutral-700"
              >
                SIM: Turn TPO 180 Focus Ring Out (+0.5)
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      <div className="space-y-4">
        <SkyPreviewCanvas enableRoiSelect onSelectRoi={handleRoiClick} />
        <HistogramChart />
      </div>
    </div>
  );
};
