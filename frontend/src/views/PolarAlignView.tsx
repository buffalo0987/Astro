import React, { useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { HistogramChart } from '../components/HistogramChart';
import { PolarBullseye } from '../components/PolarBullseye';
import { SkyPreviewCanvas } from '../components/SkyPreviewCanvas';
import { useAstroStore } from '../store/useAstroStore';

export const PolarAlignView: React.FC = () => {
  const { state, nightVision } = useAstroStore();
  const [exposureS, setExposureS] = useState(2.0);
  const [iso, setIso] = useState('1600');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!state) return null;
  const { pa, camera } = state;

  const startOrResetPa = async (modePoints: number, autoAdvance: boolean, refractionPole: boolean) => {
    setErrorMsg(null);
    await fetch('/api/pa/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode_points: modePoints,
        auto_advance: autoAdvance,
        refraction_pole: refractionPole,
      }),
    });
  };

  const capturePoint = async () => {
    setErrorMsg(null);
    const res = await fetch('/api/pa/capture-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exposure_s: exposureS, iso }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.detail || 'Solve failed');
    }
  };

  const toggleLiveLoop = async () => {
    if (pa.loop_running) {
      await fetch('/api/pa/live-loop/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore_raw: true }),
      });
    } else {
      await fetch('/api/pa/live-loop/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposure_s: exposureS, iso }),
      });
    }
  };

  const simWedgeNudge = async (dAlt: number, dAz: number) => {
    await fetch('/api/pa/sim-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ d_alt_arcmin: dAlt, d_az_arcmin: dAz }),
    });
  };

  const nextPointNum = pa.points.length + 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-3">
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold">
              1. SO(3) All-Sky Polar Alignment ({pa.mode_points}-Point)
            </h2>
            <span className="text-xs font-mono px-2 py-1 rounded border border-neutral-700">
              {pa.last_solve_ms > 0 ? `ASTAP Solve: ${pa.last_solve_ms}ms` : 'Ready'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => startOrResetPa(3, pa.auto_advance, pa.refraction_pole)}
              className={`min-h-[44px] px-3 py-2 rounded font-bold border ${
                pa.mode_points === 3 ? 'border-red-500 bg-red-950/40' : 'border-neutral-800'
              }`}
            >
              3-Point (With Bump Check)
            </button>
            <button
              type="button"
              onClick={() => startOrResetPa(2, pa.auto_advance, pa.refraction_pole)}
              className={`min-h-[44px] px-3 py-2 rounded font-bold border ${
                pa.mode_points === 2 ? 'border-red-500 bg-red-950/40' : 'border-neutral-800'
              }`}
            >
              2-Point (Quick Mode)
            </button>
            <button
              type="button"
              onClick={() => startOrResetPa(pa.mode_points, !pa.auto_advance, pa.refraction_pole)}
              className={`min-h-[44px] px-3 py-2 rounded font-bold border ${
                pa.auto_advance ? 'border-red-500 bg-red-950/40' : 'border-neutral-800'
              }`}
            >
              Hands-Free Auto-Advance: {pa.auto_advance ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => startOrResetPa(pa.mode_points, pa.auto_advance, !pa.refraction_pole)}
              className="min-h-[44px] px-3 py-2 rounded font-bold border border-neutral-800"
            >
              Target: {pa.refraction_pole ? 'Refracted Apparent Pole' : 'Unrefracted True Pole'}
            </button>
          </div>

          <div className="flex gap-3 text-xs items-center">
            <label className="flex items-center gap-1">
              Exp (s):
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
                value={exposureS}
                onChange={(e) => setExposureS(Number(e.target.value))}
                className="w-16 bg-black border border-neutral-700 rounded px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1">
              ISO:
              <select
                value={iso}
                onChange={(e) => setIso(e.target.value)}
                className="bg-black border border-neutral-700 rounded px-2 py-1"
              >
                <option value="800">800</option>
                <option value="1600">1600</option>
                <option value="3200">3200</option>
                <option value="6400">6400</option>
              </select>
            </label>
          </div>

          {errorMsg && (
            <div className="p-2 rounded border border-red-600 bg-red-950/50 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {pa.bump_warning && (
            <div className="p-2 rounded border border-amber-500 bg-amber-950/40 text-xs font-bold">
              WARNING: 3-Point Flexure/Bump Residual is {pa.bump_residual_arcmin}&apos; (&gt;5&apos;). Tripod or ball-head may have shifted during clutch rotation.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {pa.points.length < pa.mode_points ? (
              <button
                type="button"
                disabled={camera.busy}
                onClick={capturePoint}
                className="min-h-[60px] rounded-xl font-extrabold text-base border border-red-500 bg-red-900/40 hover:bg-red-900/60"
              >
                {pa.points.length === 0
                  ? 'CAPTURE POINT 1 (INITIAL POSE)'
                  : `ROTATE RA ~30° & CAPTURE POINT ${nextPointNum}/${pa.mode_points}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleLiveLoop}
                className="min-h-[60px] rounded-xl font-extrabold text-base border border-emerald-500 bg-emerald-950/50"
              >
                {pa.loop_running ? 'STOP LIVE SOLVE LOOP (RESTORE RAW)' : 'START CONTINUOUS LIVE SOLVE (~2.5s)'}
              </button>
            )}

            <HoldButton
              label="HOLD TO RESET PA"
              onConfirm={() => startOrResetPa(pa.mode_points, pa.auto_advance, pa.refraction_pole)}
              className="border-neutral-700 bg-neutral-900"
            />
          </div>

          {/* Calibration Points Progress */}
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            {Array.from({ length: pa.mode_points }).map((_, idx) => {
              const pt = pa.points[idx];
              return (
                <div key={idx} className="p-2 rounded border border-neutral-800 bg-black">
                  <div className="font-bold">POINT {idx + 1}</div>
                  {pt ? (
                    <>
                      <div>RA: {pt.ra_hours.toFixed(2)}h</div>
                      <div>Dec: {pt.dec_deg.toFixed(2)}°</div>
                      <div>Roll: {pt.crota2_deg.toFixed(1)}°</div>
                    </>
                  ) : (
                    <div className="opacity-50">Pending...</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <PolarBullseye
          altErrorArcmin={pa.alt_error_arcmin}
          azErrorArcmin={pa.az_error_arcmin}
          totalErrorArcmin={pa.total_error_arcmin}
          altDirection={pa.alt_direction}
          azDirection={pa.az_direction}
          sa2iKnobTurns={pa.sa2i_knob_turns}
          breadcrumbTrail={pa.breadcrumb_trail}
          nightVision={nightVision}
        />

        {camera.driver_mode === 'simulator' && pa.points.length >= pa.mode_points && (
          <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-950 text-xs space-y-2">
            <div className="font-bold">SIMULATOR WEDGE KNOB TESTER (Star Adventurer 2i)</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => simWedgeNudge(-5.0, 0)}
                className="px-3 py-2 rounded border border-neutral-700"
              >
                Turn Alt UP (+5&apos;)
              </button>
              <button
                type="button"
                onClick={() => simWedgeNudge(0, 5.0)}
                className="px-3 py-2 rounded border border-neutral-700"
              >
                Turn Az LEFT (+5&apos;)
              </button>
              <button
                type="button"
                onClick={() => simWedgeNudge(-pa.alt_error_arcmin * 0.9, -pa.az_error_arcmin * 0.9)}
                className="px-3 py-2 rounded border border-red-600 font-bold"
              >
                Dial In Wedge (&lt; 1&apos;)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SkyPreviewCanvas />
        <HistogramChart />
      </div>
    </div>
  );
};
