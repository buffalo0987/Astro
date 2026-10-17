import React, { useEffect } from 'react';
import { TelemetryHud } from './components/TelemetryHud';
import { useAstroStore } from './store/useAstroStore';
import { FrameFocusView } from './views/FrameFocusView';
import { PolarAlignView } from './views/PolarAlignView';
import { SequenceView } from './views/SequenceView';
import { SessionsOffloadView } from './views/SessionsOffloadView';
import { SystemDrawer } from './views/SystemDrawer';

export const App: React.FC = () => {
  const { activeTab, setActiveTab, fetchInitialState, connectWebSocket, nightVision } = useAstroStore();

  useEffect(() => {
    fetchInitialState();
    connectWebSocket();
  }, [fetchInitialState, connectWebSocket]);

  const tabs: Array<{ id: 'PA' | 'FRAME' | 'SEQUENCE' | 'OFFLOAD'; label: string }> = [
    { id: 'PA', label: '1. POLAR ALIGN' },
    { id: 'FRAME', label: '2. FRAME & FOCUS' },
    { id: 'SEQUENCE', label: '3. SEQUENCE (.CR3)' },
    { id: 'OFFLOAD', label: '4. SESSIONS & OFFLOAD' },
  ];

  return (
    <div
      className={`min-h-screen bg-black ${
        nightVision ? 'text-[#ff1a1a] night-vision-root' : 'text-neutral-100'
      }`}
    >
      <TelemetryHud />

      <nav className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-neutral-900">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`min-h-[54px] rounded-xl font-extrabold text-xs sm:text-sm border transition ${
              activeTab === t.id
                ? 'border-red-500 bg-red-950/50 text-red-200'
                : 'border-neutral-800 bg-neutral-950 opacity-80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="max-w-7xl mx-auto pb-12">
        {activeTab === 'PA' && <PolarAlignView />}
        {activeTab === 'FRAME' && <FrameFocusView />}
        {activeTab === 'SEQUENCE' && <SequenceView />}
        {activeTab === 'OFFLOAD' && <SessionsOffloadView />}
      </main>

      <SystemDrawer />
    </div>
  );
};

export default App;
