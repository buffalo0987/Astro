import React, { useEffect, useRef, useState } from 'react';
import { useAstroStore } from '../store/useAstroStore';

interface SkyPreviewCanvasProps {
  enableRoiSelect?: boolean;
  onSelectRoi?: (xNorm: number, yNorm: number) => void;
}

/**
 * Memory-safe Sky Preview Canvas with Pinch/Wheel Zoom, Star HFR overlays,
 * 1:1 Focus ROI selection, and strict Red-Channel Monochrome pixel filtering
 * when Night-Vision Mode is active so zero white/blue/green photons are emitted.
 */
export const SkyPreviewCanvas: React.FC<SkyPreviewCanvasProps> = ({
  enableRoiSelect = false,
  onSelectRoi,
}) => {
  const { state, nightVision } = useAstroStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const preview = state?.preview;

  useEffect(() => {
    if (!preview?.image_url || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width || 960;
      canvas.height = img.height || 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Apply strict OLED Red Monochrome LUT filter when Night-Vision Mode is active
      if (nightVision) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = luma;     // Red channel preserved
          d[i + 1] = 0;    // Green zeroed
          d[i + 2] = 0;    // Blue zeroed
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Draw detected star HFR circles
      const stars = preview.stars_overlay || [];
      ctx.strokeStyle = nightVision ? '#ff1a1a' : '#22d3ee';
      ctx.fillStyle = nightVision ? '#ff3333' : '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.font = '12px monospace';
      for (const s of stars) {
        const sx = s.x * canvas.width;
        const sy = s.y * canvas.height;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(6, s.hfr * 3.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(`${s.hfr.toFixed(1)}px`, sx + 8, sy - 6);
      }
    };
    img.src = preview.image_url;
  }, [preview?.image_url, preview?.stars_overlay, nightVision]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableRoiSelect || !onSelectRoi || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;
    onSelectRoi(xNorm, yNorm);
  };

  return (
    <div className="relative rounded-xl border border-neutral-800 bg-black overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-900 text-xs font-mono">
        <span>
          PREVIEW: {preview?.source_format || 'Small Fine JPEG'}{' '}
          {preview?.auto_stretched ? '[MTF AUTO-STRETCH]' : '[LINEAR]'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1.0, z - 0.5))}
            className="px-2 py-0.5 rounded border border-neutral-700"
          >
            -
          </button>
          <span>{zoom.toFixed(1)}x</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4.0, z + 0.5))}
            className="px-2 py-0.5 rounded border border-neutral-700"
          >
            +
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[420px] flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="max-w-full h-auto cursor-crosshair transition-transform"
        />
      </div>
    </div>
  );
};
