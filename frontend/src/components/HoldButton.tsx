import React, { useRef, useState } from 'react';

interface HoldButtonProps {
  label: string;
  holdDurationMs?: number;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Cold-weather glove-safe 1.5-second Hold-to-Confirm button for destructive actions
 * (Abort Sequence, Reset PA Calibration, Purge Rejected Frames, Delete Session).
 */
export const HoldButton: React.FC<HoldButtonProps> = ({
  label,
  holdDurationMs = 1500,
  onConfirm,
  className = '',
  disabled = false,
}) => {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const startHold = () => {
    if (disabled) return;
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100);
      setProgress(pct);
      if (pct >= 100) {
        stopHold();
        onConfirm();
      } else {
        timerRef.current = requestAnimationFrame(tick);
      }
    };
    timerRef.current = requestAnimationFrame(tick);
  };

  const stopHold = () => {
    if (timerRef.current !== null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    setProgress(0);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      className={`relative overflow-hidden select-none min-h-[56px] px-4 py-3 rounded-lg font-bold border transition ${className}`}
    >
      <div
        className="absolute inset-y-0 left-0 bg-red-600/40 pointer-events-none transition-none"
        style={{ width: `${progress}%` }}
      />
      <span className="relative z-10">
        {progress > 0 ? `HOLD (${Math.ceil(((100 - progress) / 100) * (holdDurationMs / 1000 * 10) / 10)}s)...` : label}
      </span>
    </button>
  );
};
