// Synthesised sound: Web Audio only, no audio files.
export class SoundBank {
  constructor() {
    this.ctx = null; this.muted = false; this.radio = 0; this.radioOn = true;
    this.lastHitAt = 0; this.hitCount = 0; this.sirenOn = false;
  }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, low) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(this.ctx.destination); s.start(t);
  }
  click() { this.tone(660, 0.07, 'square', 0.06); }
  cash() { this.tone(880, 0.12, 'sine', 0.14); setTimeout(() => this.tone(1320, 0.18, 'sine', 0.14), 90); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.16), i * 110)); }
  gunshot() { this.noise(0.16, 0.35, 900); this.tone(140, 0.12, 'square', 0.18, 50); }
  punch() { this.noise(0.09, 0.25, 600); }
  hit() { this.hitCount++; this.lastHitAt = performance.now(); this.noise(0.28, 0.4, 500); this.tone(90, 0.3, 'sawtooth', 0.22, 40); }
  horn() { this.tone(370, 0.25, 'square', 0.1); this.tone(466, 0.25, 'square', 0.08); }
  footstep() { this.noise(0.05, 0.06, 400); }
  engine(speed) { if (!this.ctx || this.muted) return; this.tone(50 + Math.abs(speed) * 4, 0.09, 'sawtooth', 0.03); }
  siren() { if (!this.ctx || this.muted) return; this.tone(750, 0.4, 'sine', 0.05, 950); setTimeout(() => this.tone(950, 0.4, 'sine', 0.05, 750), 420); }
  radioTick(station, step) {
    if (!this.ctx || this.muted || !this.radioOn) return;
    const scales = [[262, 294, 330, 392, 440], [220, 262, 330, 370, 415], [196, 247, 294, 330, 392]];
    const s = scales[station % 3];
    this.tone(s[step % s.length], 0.3, 'triangle', 0.05);
  }
  setMuted(m) { this.muted = m; }
}
