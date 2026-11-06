/**
 * AstroPi Modular Zero-Build Offline PWA Entrypoint (Vendored Preact + HTM ES6 Modules)
 * Synchronizes in real time over WebSocket (/ws) with persistent <canvas> SkyViewport.
 */

import { render } from './vendor/preact.mjs';
import { html } from './vendor/htm.mjs';
import { useStore, api, loadCatalog, refreshAll, connectWs } from './store.js';
import { HudBar } from './components/HudBar.js';
import { SkyViewport } from './components/SkyViewport.js';
import { PolarAlignView } from './views/PolarAlignView.js';
import { FrameFocusView } from './views/FrameFocusView.js';
import { SequenceView } from './views/SequenceView.js';
import { OffloadView } from './views/OffloadView.js';
import { SystemDrawer } from './views/SystemDrawer.js';

function App() {
  const snap = useStore();
  if (!snap.state) {
    return html`
      <div style="padding:36px;text-align:center;color:var(--text-muted);font-size:14px">
        ⏳ Connecting to AstroPi Observatory Daemon...
      </div>
    `;
  }

  const { camera, system, observer, pa, framing, focus, sequence, preview } = snap.state;
  const isSim = camera.driver_mode === 'simulator';

  let activeView = null;
  if (snap.activeTab === 'PA') {
    activeView = html`<${PolarAlignView} pa=${pa} isSim=${isSim} />`;
  } else if (snap.activeTab === 'FRAME') {
    activeView = html`<${FrameFocusView} framing=${framing} focus=${focus} observer=${observer} isSim=${isSim} />`;
  } else if (snap.activeTab === 'SEQUENCE') {
    activeView = html`<${SequenceView} sequence=${sequence} framing=${framing} camera=${camera} system=${system} observer=${observer} preview=${preview} />`;
  } else if (snap.activeTab === 'OFFLOAD') {
    activeView = html`<${OffloadView} system=${system} />`;
  }

  return html`
    <${HudBar} camera=${camera} system=${system} observer=${observer} isSim=${isSim} />
    <main class="main-grid">
      ${activeView}
      <${SkyViewport} preview=${preview} isSim=${isSim} />
    </main>
    <${SystemDrawer} observer=${observer} camera=${camera} system=${system} />
  `;
}

const rootEl = document.getElementById('root');
if (rootEl) {
  render(html`<${App} />`, rootEl);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Automatically sync Raspberry Pi UTC sidereal clock from phone/browser on load (works over plain HTTP!)
api('/api/system/location-time', 'PUT', {
  client_utc_timestamp: Date.now() / 1000,
  sync_source: 'Auto Clock Sync',
}).catch(() => {});

loadCatalog().catch(() => {});
refreshAll().catch(() => {});
connectWs();
