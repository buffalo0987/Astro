import React, { useEffect, useState } from 'react';
import { HoldButton } from '../components/HoldButton';

interface FrameRecord {
  id: string;
  filename: string;
  relative_path: string;
  frame_type: string;
  exposure_s: number;
  iso: string;
  sequence_num: number;
  hfr_median: number;
  fwhm_Arcsec: number;
  star_count: number;
  status: 'accepted' | 'rejected';
  reject_reason: string;
}

interface SessionItem {
  id: string;
  target_name: string;
  session_date: string;
  directory_path: string;
  offloaded: number;
  total_frames: number;
  accepted_frames: number;
  rejected_frames: number;
  total_size_mb: number;
  best_hfr: number | null;
  median_hfr: number | null;
  frames: FrameRecord[];
}

export const SessionsOffloadView: React.FC = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [smbWin, setSmbWin] = useState(r'\\astro.local\captures');
  const [smbMac, setSmbMac] = useState('smb://astro.local/captures');
  const [ejectMsg, setEjectMsg] = useState<string | null>(null);

  const loadSessions = async () => {
    const res = await fetch('/api/sessions');
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.storage) {
        setSmbWin(data.storage.smb_windows_path);
        setSmbMac(data.storage.smb_macos_path);
      }
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const toggleCull = async (sessionId: string, frame: FrameRecord) => {
    const nextStatus = frame.status === 'accepted' ? 'rejected' : 'accepted';
    await fetch(`/api/sessions/${sessionId}/frames/${frame.id}/cull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, reject_reason: 'User gallery toggle' }),
    });
    loadSessions();
  };

  const autoCull = async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}/auto-cull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hfr_sigma_limit: 2.0 }),
    });
    loadSessions();
  };

  const safeEjectUsb = async () => {
    const res = await fetch('/api/system/storage/eject', { method: 'POST' });
    const data = await res.json();
    setEjectMsg(data.message || data.detail || 'USB Drive Ejected');
    loadSessions();
  };

  return (
    <div className="p-3 space-y-4">
      {/* Three-Path Offload Header Card */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded border border-neutral-800 bg-black space-y-1">
          <div className="font-extrabold text-sm">PATH 1: LAN SAMBA (SMB3) SHARE</div>
          <div className="opacity-75">Drag &amp; drop Siril folders directly over Wi-Fi / Ethernet:</div>
          <div className="font-mono font-bold select-all">Windows: {smbWin}</div>
          <div className="font-mono font-bold select-all">macOS/Linux: {smbMac}</div>
        </div>

        <div className="p-3 rounded border border-neutral-800 bg-black space-y-1">
          <div className="font-extrabold text-sm">PATH 2: STREAMING ZIP OFFLOAD</div>
          <div className="opacity-75">
            Zero-RAM uncompressed <span className="font-mono">ZIP_STORED</span> stream (&lt;6MB RAM on Pi 4) with{' '}
            <span className="font-mono">lights/ darks/ biases/ flats/</span> +{' '}
            <span className="font-mono">session_manifest.csv</span>.
          </div>
        </div>

        <div className="p-3 rounded border border-neutral-800 bg-black flex flex-col justify-between">
          <div>
            <div className="font-extrabold text-sm">PATH 3: USB 3.0 SAFE EJECT</div>
            <div className="opacity-75">Flush kernel buffers &amp; unmount external exFAT SSD before unplugging:</div>
          </div>
          <button
            type="button"
            onClick={safeEjectUsb}
            className="mt-2 min-h-[46px] rounded-lg font-extrabold border border-red-500 bg-red-950/40"
          >
            SAFE EJECT USB 3.0 DRIVE
          </button>
          {ejectMsg && <div className="mt-1 font-mono text-emerald-400">{ejectMsg}</div>}
        </div>
      </div>

      {/* Session List & Sub-Frame Culling Gallery */}
      {sessions.map((s) => (
        <div key={s.id} className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold">
                {s.target_name} <span className="text-xs font-mono opacity-75">({s.id})</span>
              </h3>
              <div className="text-xs font-mono opacity-75">
                Accepted: {s.accepted_frames} | Rejected (in rejected/): {s.rejected_frames} | Size: {s.total_size_mb} MB |
                Median HFR: {s.median_hfr ?? '--'}px
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <a
                href={`/api/sessions/${s.id}/download.zip?exclude_rejected=true`}
                className="min-h-[44px] px-3 py-2 rounded-lg font-extrabold border border-emerald-500 bg-emerald-950/50 flex items-center"
              >
                DOWNLOAD SIRIL ZIP (ACCEPTED ONLY)
              </a>
              <button
                type="button"
                onClick={() => autoCull(s.id)}
                className="min-h-[44px] px-3 py-2 rounded-lg font-bold border border-neutral-700 bg-neutral-900"
              >
                AUTO-REJECT HFR/CLOUD OUTLIERS
              </button>
              <HoldButton
                label="PURGE REJECTED"
                onConfirm={async () => {
                  await fetch(`/api/sessions/${s.id}/purge-rejected`, { method: 'POST' });
                  loadSessions();
                }}
                className="border-amber-600/70 text-xs"
              />
              <HoldButton
                label="DELETE SESSION"
                onConfirm={async () => {
                  await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
                  loadSessions();
                }}
                className="border-red-600/70 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs font-mono">
            {s.frames.map((fr) => (
              <div
                key={fr.id}
                className={`p-2.5 rounded-lg border ${
                  fr.status === 'rejected'
                    ? 'border-red-800/80 bg-red-950/20 opacity-75'
                    : 'border-neutral-800 bg-black'
                }`}
              >
                <div className="flex justify-between font-bold">
                  <span>
                    #{fr.sequence_num} {fr.frame_type.toUpperCase()}
                  </span>
                  <span>{fr.status.toUpperCase()}</span>
                </div>
                <div className="truncate opacity-70">{fr.filename}</div>
                <div className="mt-1">
                  HFR: {fr.hfr_median.toFixed(2)}px | Stars: {fr.star_count}
                </div>
                {fr.reject_reason && <div className="text-red-400">{fr.reject_reason}</div>}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => toggleCull(s.id, fr)}
                    className="flex-1 py-1.5 rounded border border-neutral-700 font-bold"
                  >
                    {fr.status === 'accepted' ? 'Move to rejected/' : 'Restore'}
                  </button>
                  <a
                    href={`/api/sessions/${s.id}/frames/${fr.id}/download`}
                    className="px-2 py-1.5 rounded border border-neutral-700"
                  >
                    .CR3
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
