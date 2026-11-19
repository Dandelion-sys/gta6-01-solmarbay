// Solmar Bay sound: everything is synthesised with Web Audio, no files.
export class SoundBank {
  constructor() {
    this.ctx = null; this.muted = false; this.master = null;
    this.engineOsc = null; this.engineGain = null;
    this.sirenTimer = 0; this.radioStation = 0; this.radioOn = false;
    this.lastHitAt = 0; this.hitCount = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, vol, low) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 900;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0);
  }
  click() { this.ensure(); this.tone(880, 0.07, 'square', 0.12); }
  cash() { this.ensure(); this.tone(1320, 0.12, 'sine', 0.22); setTimeout(() => this.tone(1760, 0.18, 'sine', 0.22), 90); }
  shot() { this.ensure(); this.noise(0.16, 0.5, 2400); this.tone(160, 0.12, 'square', 0.25, 60); }
  punch() { this.ensure(); this.noise(0.1, 0.35, 500); this.tone(120, 0.1, 'sine', 0.3, 70); }
  hit() {
    // A moving car striking the player: low thud plus a crash burst.
    this.ensure(); this.hitCount++; this.lastHitAt = performance.now();
    this.tone(90, 0.35, 'sine', 0.5, 40);
    this.noise(0.3, 0.45, 700);
    this.tone(220, 0.25, 'sawtooth', 0.15, 110);
  }
  siren(dt, wanted) {
    if (!this.ctx || this.muted || wanted < 1) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.9) {
      this.sirenTimer = 0;
      this.tone(720, 0.42, 'sine', 0.07);
      setTimeout(() => this.tone(540, 0.42, 'sine', 0.07), 450);
    }
  }
  engine(speed, driving) {
    if (!this.ctx || this.muted) { if (this.engineOsc) this.engineGain.gain.value = 0; return; }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      this.engineGain.gain.value = 0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const target = driving ? 0.05 + Math.min(0.12, Math.abs(speed) * 0.006) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 4.5, this.ctx.currentTime, 0.1);
  }
  footstep() { this.ensure(); this.noise(0.05, 0.08, 300); }
  missionSting() {
    this.ensure();
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 110));
  }
  radioTick() {
    if (!this.radioOn || !this.ctx || this.muted) return;
    const scales = [[262, 330, 392, 523], [220, 277, 330, 440], [196, 247, 294, 392]];
    const s = scales[this.radioStation % scales.length];
    const n = s[Math.floor(Math.random() * s.length)];
    this.tone(n, 0.3, 'triangle', 0.06);
  }
}
export const RADIO_STATIONS = ['Bay FM — sunny hits', 'Talk Bay — callers and news', 'Tide Podcast — true crime'];
