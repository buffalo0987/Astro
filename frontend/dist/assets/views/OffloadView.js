/**
 * Step 4: Sessions, Sub-Frame Culling (HFR + 1-Tap Star-Trailing Eccentricity Filter) & Siril / SMB3 / USB Offload
 */

import { html } from '../vendor/htm.mjs';
import {
  store,
  updateStore,
  TRAILED_ECCENTRICITY_LIMIT,
  classifyEccentricity,
  api,
  runAction,
  showNotice,
  refreshAll,
} from '../store.js';

export function OffloadView({ system }) {
  const handleUsbEject = () =>
    runAction(null, async () => {
      const r = await api('/api/system/storage/eject', 'POST');
      showNotice(r.message, 'ok', 8000);
      await refreshAll();
    });

  const handleToggleFrames = (sid) => {
    updateStore({ expandedSessionId: store.expandedSessionId === sid ? null : sid });
  };

  const handleFrameCullToggle = (sid, fid, currentStatus) =>
    runAction(null, async () => {
      const nextStatus = currentStatus === 'rejected' ? 'accepted' : 'rejected';
      await api(`/api/sessions/${sid}/frames/${fid}/cull`, 'POST', {
        status: nextStatus,
        reject_reason: nextStatus === 'rejected' ? 'Manual user cull' : '',
      });
      await refreshAll();
    });

  const handleAutoCull = (sid) =>
    runAction(null, async () => {
      const res = await api(`/api/sessions/${sid}/auto-cull`, 'POST', { hfr_sigma_limit: 2.0 });
      showNotice(`Auto-cull complete: flagged ${res.rejected_count || 0} HFR outlier sub-frame(s).`, 'ok', 5000);
      await refreshAll();
    });

  const handleCullTrailed = (sid) =>
    runAction(null, async () => {
      const res = await api(`/api/sessions/${sid}/cull-trailed`, 'POST', {
        max_eccentricity: TRAILED_ECCENTRICITY_LIMIT,
      });
      showNotice(
        res.rejected_count > 0
          ? `Flagged ${res.rejected_count} trailed Light sub(s) (e ≥ ${TRAILED_ECCENTRICITY_LIMIT}) to rejected/.`
          : `No trailed subs exceeded e ≥ ${TRAILED_ECCENTRICITY_LIMIT}. All Light frames are round!`,
        'ok',
        6000
      );
      await refreshAll();
    });

  const handlePurgeRejected = (sid) =>
    runAction(null, async () => {
      const res = await api(`/api/sessions/${sid}/purge-rejected`, 'POST');
      showNotice(`Deleted ${res.deleted_frames || 0} rejected file(s) (${res.freed_mb || 0} MB freed).`, 'ok', 5000);
      await refreshAll();
    });

  const sessions = store.sessions || [];

  return html`
    <div class="card">
      <div class="card-header">
        <h3>4. Sessions, Sub-Frame Culling &amp; Offload</h3>
        <span class="badge">${system.disk_free_gb} GB Free</span>
      </div>

      <div class="kpi-grid kpi-grid-2col-sm">
        <div class="kpi-box" style="text-align:left">
          <div class="kpi-label">WINDOWS WI-FI SHARE (SMB3)</div>
          <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">\\\\astro.local\\captures</div>
        </div>
        <div class="kpi-box" style="text-align:left">
          <div class="kpi-label">MACOS FINDER (CMD+K)</div>
          <div style="font-size:12px;font-family:monospace;font-weight:700;margin-top:2px">smb://astro.local/captures</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">USB 3.0 EXTERNAL SSD</div>
          ${system.usb_drive_mounted
            ? html`
                <button class="btn btn-sm btn-primary" style="width:100%;margin-top:2px" onClick=${handleUsbEject}>
                  ⏏ Safe Eject (${system.usb_drive_label || 'USB'})
                </button>
              `
            : html`<div class="kpi-sub" style="margin-top:4px">Using Pi Storage (No USB Mounted)</div>`}
        </div>
      </div>

      ${sessions.length > 0
        ? sessions.map((s) => {
            const isExp = store.expandedSessionId === s.id;
            const frames = s.frames || [];
            const fc = s.frame_counts || {};
            const countsBadge = `Lights: ${fc.light ?? 0} • Darks: ${fc.dark ?? 0} • Flats: ${fc.flat ?? 0} • Biases: ${fc.bias ?? 0}`;
            const trailedCount = Number(s.trailed_frames || 0);
            const medEcc = s.median_eccentricity ? ` • Med e=${Number(s.median_eccentricity).toFixed(2)}` : '';

            return html`
              <div key=${s.id} class="kpi-box" style="text-align:left;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                  <div>
                    <strong style="font-size:14px">${s.target_name}</strong>
                    <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${s.id})</span>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                      ${countsBadge}${medEcc} • Auto-generates <code>siril_stack.ssf</code> (180mm, 3.72µm, SPCC-ready)
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    ${trailedCount > 0
                      ? html`
                          <span class="badge badge-jpg" title="Accepted Light frames with star eccentricity ≥ 0.65">
                            ⚠️ ${trailedCount} Trailed
                          </span>
                        `
                      : null}
                    <span class="badge badge-raw">
                      Kept: ${s.accepted_frames} | Rejected: ${s.rejected_frames} | ${s.total_size_mb} MB
                    </span>
                  </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <a
                    class="btn btn-sm btn-primary"
                    style="text-decoration:none"
                    href=${`/api/sessions/${s.id}/download.zip?exclude_rejected=true`}
                  >
                    ⬇ Download Siril ZIP (+ siril_stack.ssf)
                  </a>
                  <a
                    class="btn btn-sm"
                    style="text-decoration:none"
                    href=${`/api/sessions/${s.id}/siril_stack.ssf`}
                    title="Download custom Siril 1.2+ preprocessing & plate-solve script"
                  >
                    📜 Siril Script (.ssf)
                  </a>
                  <button class="btn btn-sm" onClick=${() => handleToggleFrames(s.id)}>
                    ${isExp ? 'Hide Sub-Frames ▲' : `Inspect / Cull Frames (${frames.length}) ▼`}
                  </button>
                  <button
                    class="btn btn-sm ${trailedCount > 0 ? 'btn-warn' : ''}"
                    onClick=${() => handleCullTrailed(s.id)}
                    title="Move elongated/trailed Light frames (eccentricity ≥ 0.65) to rejected/"
                  >
                    🎯 Reject Trailed Subs (e ≥ 0.65)
                  </button>
                  <button class="btn btn-sm" onClick=${() => handleAutoCull(s.id)}>
                    Auto-Cull Outliers (&gt;2σ)
                  </button>
                  ${s.rejected_frames > 0
                    ? html`
                        <button class="btn btn-sm" onClick=${() => handlePurgeRejected(s.id)}>
                          Delete ${s.rejected_frames} Rejected File(s)
                        </button>
                      `
                    : null}
                </div>

                ${isExp
                  ? html`
                      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-col);border-radius:8px;margin-top:6px">
                        ${frames.map((f) => {
                          const ecc = classifyEccentricity(f.eccentricity);
                          return html`
                            <div key=${f.id} class="frame-row ${f.status === 'rejected' ? 'rejected' : ''}">
                              <div>
                                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                  <strong>${f.filename}</strong>
                                  ${f.frame_type === 'Light' && ecc.trailed
                                    ? html`<span class="badge badge-jpg" style="font-size:10px;padding:1px 6px">⚠️ Trailed (e=${ecc.text})</span>`
                                    : null}
                                  ${f.reject_reason
                                    ? html`<span style="font-size:10px;color:var(--warn-col)">[${f.reject_reason}]</span>`
                                    : null}
                                </div>
                                <div style="font-size:11px;color:var(--text-muted)">
                                  ${f.frame_type} • ${f.exposure_s}s • ISO ${f.iso} • HFR: ${f.hfr_median ? `${Number(f.hfr_median).toFixed(2)}px` : '--'} • e: ${ecc.val > 0 ? ecc.text : '--'} (${f.star_count ?? 0} stars)
                                </div>
                              </div>
                              <button
                                class="btn btn-sm ${f.status === 'rejected' ? '' : 'btn-ok'}"
                                onClick=${() => handleFrameCullToggle(s.id, f.id, f.status)}
                              >
                                ${f.status === 'rejected' ? 'Restore' : 'Keep ✓'}
                              </button>
                            </div>
                          `;
                        })}
                      </div>
                    `
                  : null}
              </div>
            `;
          })
        : html`
            <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
              No imaging sessions recorded yet. Start a sequence in Tab 3 to capture .CR3 frames.
            </div>
          `}
    </div>
  `;
}
