// Synthesised sound: every effect is built with Web Audio, no audio files.
export class SoundBank {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
    this.radioTimer = 0; this.radioNote = 0; this.station = null;
    this.stepTimer = 0;
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
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  cash() { this.tone(880, 0.12, 'sine', 0.22); setTimeout(() => this.tone(1318, 0.22, 'sine', 0.22), 90); }
  gunshot() { this.noise(0.14, 0.5, 900); this.tone(140, 0.1, 'square', 0.25, 60); }
  punch() { this.noise(0.09, 0.35, 500); }
  step() { this.noise(0.05, 0.08, 400); }
  horn() { this.tone(330, 0.3, 'square', 0.12); this.tone(415, 0.3, 'square', 0.1); }
  missionSting() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.22), i * 110));
  }
  failSting() { this.tone(392, 0.3, 'sawtooth', 0.15, 196); }
  phoneBuzz() { this.tone(1200, 0.06, 'sine', 0.12); }
  click() { this.tone(700, 0.05, 'sine', 0.12); }
  splash() { this.noise(0.4, 0.25, 800); }
  setEngine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on && !this.muted ? 0.04 + 0.06 * (speedRatio || 0) : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
      this.engineOsc.frequency.setTargetAtTime(60 + 140 * (speedRatio || 0), this.ctx.currentTime, 0.1);
    }
  }
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenOn = true;
    }
    if (this.sirenOsc) {
      this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.045 : 0, this.ctx.currentTime, 0.2);
      if (on) {
        const t = this.ctx.currentTime;
        this.sirenOsc.frequency.cancelScheduledValues(t);
        this.sirenOsc.frequency.setValueAtTime(660, t);
        this.sirenOsc.frequency.linearRampToValueAtTime(920, t + 0.45);
        this.sirenOsc.frequency.linearRampToValueAtTime(660, t + 0.9);
      }
    }
  }
  radioTick(dt, stationId) {
    if (!this.ctx || this.muted || !stationId) return;
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    this.radioTimer = 0.34;
    const scales = {
      wave: [262, 294, 330, 392, 440, 523],
      talk: [220, 220, 262, 196],
      pod: [196, 233, 262, 311],
    };
    const scale = scales[stationId] || scales.wave;
    this.radioNote = (this.radioNote + 1 + Math.floor(Math.random() * 2)) % scale.length;
    this.tone(scale[this.radioNote], 0.3, stationId === 'wave' ? 'triangle' : 'sine', 0.05);
  }
}
