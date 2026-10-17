/**
 * Web Audio API synthesizer for hands-free field audio cues:
 * - Polar Alignment calibration point locked chime
 * - Polar Alignment < 1.0' target zone tone
 * - Focus Aid HFR V-curve pitch feedback (higher pitch = sharper focus / smaller HFR)
 * - Calibration Interlock alert chime (Dark / Bias / Flat lens cap reminder)
 */

class FieldAudioCues {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(freqHz: number, durationMs: number = 120, type: OscillatorType = 'sine', gainVal: number = 0.08): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqHz, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  public playPointLockedChime(): void {
    this.playTone(587.33, 110, 'triangle', 0.1);
    setTimeout(() => this.playTone(880.0, 160, 'triangle', 0.12), 115);
    if (navigator.vibrate) navigator.vibrate([60, 40, 90]);
  }

  public playFocusHfrTone(hfr: number, isNewMin: boolean): void {
    if (hfr <= 0) return;
    // Map HFR [1.2 .. 6.0] px -> Frequency [920 .. 260] Hz so sharper stars sound higher-pitched
    const clamped = Math.max(1.2, Math.min(6.0, hfr));
    const freq = 920 - ((clamped - 1.2) / 4.8) * 660;
    this.playTone(freq, 95, 'sine', 0.07);
    if (isNewMin) {
      setTimeout(() => this.playTone(freq * 1.25, 130, 'triangle', 0.1), 100);
    }
  }

  public playInterlockAlert(): void {
    this.playTone(440, 180, 'sawtooth', 0.1);
    setTimeout(() => this.playTone(554.37, 220, 'sawtooth', 0.1), 200);
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }
}

export const audioCues = new FieldAudioCues();
