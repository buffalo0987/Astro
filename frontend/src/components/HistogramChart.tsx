import React from 'react';
import { useAstroStore } from '../store/useAstroStore';

export const HistogramChart: React.FC = () => {
  const { state, nightVision } = useAstroStore();
  const hist = state?.preview?.histogram;
  const luma = hist?.luma || [];

  if (!luma.length) return null;

  const w = 260;
  const h = 56;
  const pts = luma
    .map((v, i) => `${(i / (luma.length - 1)) * w},${h - Math.min(1, v) * (h - 6)}`)
    .join(' ');

  return (
    <div className="p-2 rounded-lg border border-neutral-800 bg-black text-xs font-mono">
      <div className="flex justify-between mb-1 opacity-75">
        <span>MTF HISTOGRAM</span>
        <span>MEDIAN ADU: {hist?.median_adu ?? '--'}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={nightVision ? '#ff1a1a' : '#38bdf8'}
          strokeWidth="2"
          points={pts}
        />
      </svg>
    </div>
  );
};
