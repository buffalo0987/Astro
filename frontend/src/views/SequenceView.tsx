import React, { useEffect, useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { HistogramChart } from '../components/HistogramChart';
import { SkyPreviewCanvas } from '../components/SkyPreviewCanvas';
import { useAstroStore } from '../store/useAstroStore';

interface StepItem {
  frame_type: 'Light' | 'Dark' | 'Bias' | 'Flat';
  exposure_s: number;
  iso: string;
  total_count: number;
  completed_count?: number;
  cooldown_s: number;
}

export const SequenceView: React.FC = () => {
  const { state } = useAstroStore();
  const [planId, setPlanId] = useState<string>('plan_default_ngc7000');
  const [targetName, setTargetName] = useState<string>('NGC 7000 North America Nebula');
  const [keepOnSd, setKeepOnSd] = useState<boolean>(false);
  const [steps, setSteps] = useState<StepItem[]>([
    { frame_type: 'Light', exposure_s: 90, iso: '800', total_count: 20, cooldown_s: 2.0 },
    { frame_type: 'Dark', exposure_s: 90, iso: '800', total_count: 10, cooldown_s: 1.0 },
    { frame_type: 'Bias', exposure_s: 0.001, iso: '800', total_count: 20, cooldown_s: 0.5 },
    { frame_type: 'Flat', exposure_s: 0.5, iso: '100', total_count: 15, cooldown_s: 1.0 },
  ]);

  useEffect(() => {
    fetch('/api/sequence/plans')
      .then((r) => r.json())
      .then((d) => {
        if (d.plans && d.plans.length > 0) {
          const p = d.plans[0];
          setPlanId(p.id);
          setTargetName(p.target_name);
          setKeepOnSd(Boolean(p.keep_on_camera_sd));
          setSteps(p.steps);
        }
      })
      .catch(() => {});
  }, []);

  if (!state) return null;
  const { sequence } = state;

  const saveAndStart = async () => {
    const saved = await fetch('/api/sequence/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: planId,
        name: `${targetName} Sequence`,
        target_name: targetName,
        keep_on_camera_sd: keepOnSd,
        steps,
      }),
    }).then((r) => r.json());

    await fetch(`/api/sequence/plans/${saved.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_progress: true }),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-3">
      <div className="space-y-4">
        {/* Calibration Interlock Modal */}
        {sequence.interlock_required && (
          <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-950/60 space-y-3">
            <div className="text-base font-black">
              CALIBRATION STEP INTERLOCK: {sequence.interlock_type?.toUpperCase()} FRAMES
            </div>
            <p className="text-sm">{sequence.interlock_message}</p>
            <button
              type="button"
              onClick={() => fetch('/api/sequence/confirm-interlock', { method: 'POST' })}
              className="w-full min-h-[56px] rounded-xl font-extrabold border border-emerald-400 bg-emerald-900/60"
            >
              CONFIRM &amp; RESUME SEQUENCE
            </button>
          </div>
        )}

        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">3. Resilient .CR3 RAW Sequencer</h2>
            <span className="text-xs font-mono px-2 py-1 rounded border border-neutral-700">
              STATUS: {sequence.status} ({sequence.overall_completed}/{sequence.overall_total})
            </span>
          </div>

          <div className="flex flex-wrap gap-3 items-center text-xs">
            <label className="flex-1">
              Target Name (Siril Folder Prefix):
              <input
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="w-full mt-1 bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={keepOnSd}
                onChange={(e) => setKeepOnSd(e.target.checked)}
              />
              Dual-Save to Camera SD
            </label>
          </div>

          <div className="space-y-2 text-xs">
            {steps.map((st, idx) => (
              <div
                key={idx}
                className="grid grid-cols-5 gap-2 items-center p-2 rounded border border-neutral-800 bg-black"
              >
                <select
                  value={st.frame_type}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx] = { ...st, frame_type: e.target.value as StepItem['frame_type'] };
                    setSteps(next);
                  }}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 font-bold"
                >
                  <option value="Light">Light</option>
                  <option value="Dark">Dark</option>
                  <option value="Bias">Bias</option>
                  <option value="Flat">Flat</option>
                </select>
                <input
                  type="number"
                  value={st.exposure_s}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx] = { ...st, exposure_s: Number(e.target.value) };
                    setSteps(next);
                  }}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5"
                  title="Exposure (s)"
                />
                <select
                  value={st.iso}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx] = { ...st, iso: e.target.value };
                    setSteps(next);
                  }}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5"
                >
                  <option value="100">ISO 100</option>
                  <option value="400">ISO 400</option>
                  <option value="800">ISO 800</option>
                  <option value="1600">ISO 1600</option>
                  <option value="3200">ISO 3200</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={st.total_count}
                  onChange={(e) => {
                    const next = [...steps];
                    next[idx] = { ...st, total_count: Number(e.target.value) };
                    setSteps(next);
                  }}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5"
                  title="Frame Count"
                />
                <button
                  type="button"
                  onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                  className="px-2 py-1.5 rounded border border-neutral-800 hover:border-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSteps([
                  ...steps,
                  { frame_type: 'Light', exposure_s: 60, iso: '800', total_count: 10, cooldown_s: 2.0 },
                ])
              }
              className="px-3 py-1.5 rounded border border-neutral-700 text-xs font-bold"
            >
              + Add Sequence Step
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            {sequence.status !== 'RUNNING' ? (
              <button
                type="button"
                onClick={saveAndStart}
                className="min-h-[56px] rounded-xl font-extrabold border border-emerald-500 bg-emerald-950/50"
              >
                START .CR3 SEQUENCE
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fetch('/api/sequence/pause', { method: 'POST' })}
                className="min-h-[56px] rounded-xl font-bold border border-amber-500 bg-amber-950/50"
              >
                PAUSE SEQUENCE
              </button>
            )}

            {sequence.status === 'PAUSED' && (
              <button
                type="button"
                onClick={() => fetch('/api/sequence/resume', { method: 'POST' })}
                className="min-h-[56px] rounded-xl font-bold border border-emerald-500 bg-emerald-950/50"
              >
                RESUME
              </button>
            )}

            <HoldButton
              label="HOLD TO ABORT"
              onConfirm={() => fetch('/api/sequence/abort', { method: 'POST' })}
              className="border-red-600 bg-red-950/30"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <SkyPreviewCanvas />
        <HistogramChart />
      </div>
    </div>
  );
};
