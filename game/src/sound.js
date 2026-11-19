// Synthesised sound with the Web Audio interface. No audio files.
// Engine hum, footsteps, gunshots, a cash chime, sirens, radio melodies
// and a mission sting are all small oscillators and noise buffers.
export function createSound() {
  const s = {
    ctx: null, master: null, muted: false, engineOsc: null,
    engineGain: null, sirenOsc: null, sirenGain: null, radioTimer: 0,
    station: 0, radioOn: false,
    ensure() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
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
    },
  };
  return s;
}
export function soundEffects(s) {
  s.noise = function (dur, vol, low) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = low ? 'lowpass' : 'bandpass';
    f.frequency.value = low ? 300 : 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  };
  s.shot = function () { this.noise(0.18, 0.5); this.tone(160, 0.12, 'square', 0.25, 60); };
  s.punch = function () { this.noise(0.1, 0.3, true); };
  s.chime = function () { this.tone(880, 0.12, 'sine', 0.25); setTimeout(() => this.tone(1318, 0.25, 'sine', 0.25), 110); };
  s.sting = function () { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.22), i * 90)); };
  s.step = function () { this.noise(0.05, 0.08, true); };
  s.sirenStart = function () {
    if (!this.ctx || this.muted || this.sirenOsc) return;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.6;
    const lg = this.ctx.createGain(); lg.gain.value = 350;
    lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 750;
    o.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.sirenOsc = o; this.sirenGain = g; this.sirenLfo = lfo;
  };
  s.sirenStop = function () {
    if (this.sirenOsc) { try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) {} }
    this.sirenOsc = null; this.sirenGain = null;
  };
}
export function soundEngine(s) {
  s.engineHum = function (frac) {
    if (!this.ctx || this.muted) return;
    this.ensure();
    if (!this.engineOsc) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = 60;
      const g = this.ctx.createGain(); g.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start();
      this.engineOsc = o; this.engineGain = g;
    }
    this.engineOsc.frequency.value = 50 + frac * 140;
    this.engineGain.gain.value = 0.05 + frac * 0.05;
  };
  s.engineOff = function () {
    if (this.engineGain) this.engineGain.gain.value = 0;
  };
  s.radioNote = function (station, step) {
    if (!this.ctx || this.muted) return;
    const scales = [[262, 294, 330, 392, 440], [220, 262, 330, 370, 440], [196, 247, 294, 330, 392]];
    const scale = scales[station % 3];
    const f = scale[step % scale.length];
    this.tone(f, 0.3, station === 0 ? 'triangle' : 'sine', 0.08);
  };
}
