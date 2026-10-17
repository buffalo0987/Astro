import React from 'react';

interface PolarBullseyeProps {
  altErrorArcmin: number;
  azErrorArcmin: number;
  totalErrorArcmin: number;
  altDirection: string;
  azDirection: string;
  sa2iKnobTurns: number;
  breadcrumbTrail: Array<{ alt_error_arcmin: number; az_error_arcmin: number; total_error_arcmin: number }>;
  nightVision: boolean;
}

/**
 * Auto-scaling concentric Bullseye Radar (zooms automatically from 300' -> 60' -> 15' -> 5' -> 2')
 * with 5-point solve breadcrumb trail and Star Adventurer 2i wedge knob turn estimates.
 */
export const PolarBullseye: React.FC<PolarBullseyeProps> = ({
  altErrorArcmin,
  azErrorArcmin,
  totalErrorArcmin,
  altDirection,
  azDirection,
  sa2iKnobTurns,
  breadcrumbTrail,
  nightVision,
}) => {
  // Choose dynamic full-scale radius in arcminutes based on current total error
  const maxErr = Math.max(1.5, totalErrorArcmin);
  const scaleArcmin =
    maxErr > 60 ? 180 : maxErr > 20 ? 60 : maxErr > 6 ? 20 : maxErr > 2 ? 6 : 2;

  const size = 280;
  const center = size / 2;
  const maxRadiusPx = 115;

  const toCanvasXY = (azArcmin: number, altArcmin: number) => {
    const x = center + Math.max(-1.1, Math.min(1.1, azArcmin / scaleArcmin)) * maxRadiusPx;
    const y = center - Math.max(-1.1, Math.min(1.1, altArcmin / scaleArcmin)) * maxRadiusPx;
    return { x, y };
  };

  const currentPt = toCanvasXY(azErrorArcmin, altErrorArcmin);
  const strokeMain = nightVision ? '#ff1a1a' : '#ef4444';
  const strokeRing = nightVision ? '#660000' : '#334155';
  const strokeTarget = nightVision ? '#cc0000' : '#10b981';

  return (
    <div className="flex flex-col items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-black">
      <div className="text-xs font-mono opacity-80">
        BULLSEYE SCALE: ±{scaleArcmin}&apos; (Inner Ring: {(scaleArcmin / 3).toFixed(1)}&apos;)
      </div>

      <svg width={size} height={size} className="overflow-visible">
        <line x1={0} y1={center} x2={size} y2={center} stroke={strokeRing} strokeDasharray="4 4" />
        <line x1={center} y1={0} x2={center} y2={size} stroke={strokeRing} strokeDasharray="4 4" />

        {[1.0, 0.66, 0.33].map((frac, idx) => (
          <circle
            key={idx}
            cx={center}
            cy={center}
            r={maxRadiusPx * frac}
            fill="none"
            stroke={idx === 2 ? strokeTarget : strokeRing}
            strokeWidth={idx === 2 ? 2 : 1}
          />
        ))}

        {/* 5-point solve breadcrumb trail */}
        {breadcrumbTrail.map((pt, i) => {
          const p = toCanvasXY(pt.az_error_arcmin, pt.alt_error_arcmin);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3 + i}
              fill={strokeMain}
              opacity={0.25 + i * 0.14}
            />
          );
        })}

        {/* Vector from current mount axis to target pole */}
        <line
          x1={currentPt.x}
          y1={currentPt.y}
          x2={center}
          y2={center}
          stroke={strokeMain}
          strokeWidth={2.5}
        />
        <circle cx={currentPt.x} cy={currentPt.y} r={8} fill={strokeMain} />
      </svg>

      <div className="grid grid-cols-3 gap-2 w-full text-center font-mono">
        <div className="p-2 rounded border border-neutral-800">
          <div className="text-xs opacity-70">ALTITUDE KNOB</div>
          <div className="text-lg font-extrabold">{altErrorArcmin.toFixed(1)}&apos;</div>
          <div className="text-xs font-bold">{altDirection}</div>
          <div className="text-[11px] opacity-75">~{sa2iKnobTurns} SA 2i turns</div>
        </div>
        <div className="p-2 rounded border border-neutral-800">
          <div className="text-xs opacity-70">AZIMUTH KNOBS</div>
          <div className="text-lg font-extrabold">{azErrorArcmin.toFixed(1)}&apos;</div>
          <div className="text-xs font-bold">{azDirection}</div>
        </div>
        <div className="p-2 rounded border border-neutral-800">
          <div className="text-xs opacity-70">TOTAL ERROR</div>
          <div className="text-xl font-black">{totalErrorArcmin.toFixed(2)}&apos;</div>
          <div className="text-xs font-bold">
            {totalErrorArcmin <= 1.5 ? 'EXCELLENT (<1.5\')' : 'ADJUST WEDGE'}
          </div>
        </div>
      </div>
    </div>
  );
};
