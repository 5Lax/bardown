// All sound is synthesized via Web Audio — zero assets. Every public method must
// no-op cleanly when ctx is null (headless Node, or before first user gesture).
const AudioSys = {
  ctx: null, master: null, noiseBuf: null, crowdGain: null, crowdTarget: 0.06,
  musicOn: true, musicNext: 0, musicStep: 0, muted: false,

  init() {
    if (this.ctx || !HAS_DOM) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startCrowd();
      try { this.muted = localStorage.getItem('bardown_mute') === '1'; } catch (e) {}
      this.master.gain.value = this.muted ? 0 : 0.55;
    } catch (e) { this.ctx = null; }
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    try { localStorage.setItem('bardown_mute', this.muted ? '1' : '0'); } catch (e) {}
    return this.muted;
  },
  t() { return this.ctx.currentTime; },

  osc(type, f0, f1, t0, dur, peak, dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise(t0, dur, peak, fType, f0, f1, q) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const flt = this.ctx.createBiquadFilter(); flt.type = fType; flt.Q.value = q || 1;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  },

  // ---- SFX ----
  pass()      { if (!this.ctx || this.muted) return; this.noise(this.t(), 0.14, 0.18, 'bandpass', 1500, 500, 2); },
  catchBall() { if (!this.ctx || this.muted) return; this.noise(this.t(), 0.04, 0.22, 'highpass', 2000, 2000, 1); },
  shoot(p)    { if (!this.ctx || this.muted) return; const t = this.t();
    this.noise(t, 0.16, 0.22 + 0.15 * p, 'bandpass', 1800, 380, 1.5);
    this.osc('triangle', 230, 80, t, 0.12, 0.10 + 0.1 * p); },
  post() { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('square', 2350, 2300, t, 0.34, 0.10);
    this.osc('square', 1772, 1750, t, 0.26, 0.07);
    this.noise(t, 0.05, 0.12, 'highpass', 3000, 3000, 1); },
  goalHorn() { if (!this.ctx || this.muted) return; const t = this.t();
    [164, 207, 246].forEach((f, i) => {
      this.osc('sawtooth', f, f * 0.985, t, 1.15, 0.16);
      this.osc('sawtooth', f * 2.003, f * 1.97, t, 1.0, 0.05);
    });
    this.excite(1.0); },
  buzzer() { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('square', 118, 112, t, 0.85, 0.16); this.osc('sawtooth', 119.5, 113, t, 0.85, 0.10); },
  beep()    { if (!this.ctx || this.muted) return; this.osc('square', 1150, 1150, this.t(), 0.07, 0.10); },
  whistle() { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('sine', 2080, 2120, t, 0.38, 0.12); this.osc('sine', 2010, 2040, t, 0.38, 0.08);
    this.noise(t, 0.3, 0.05, 'highpass', 3500, 3500, 1); },
  thud(power) { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('sine', 95, 38, t, 0.16, 0.30 * power);
    this.noise(t, 0.10, 0.22 * power, 'lowpass', 380, 160, 1);
    if (power > 1.2) this.noise(t, 0.18, 0.18, 'bandpass', 900, 200, 2); },
  scoop()   { if (!this.ctx || this.muted) return; this.noise(this.t(), 0.05, 0.14, 'bandpass', 900, 1400, 2); },
  jumpSfx() { if (!this.ctx || this.muted) return; this.noise(this.t(), 0.09, 0.1, 'bandpass', 500, 1500, 2); },

  // gloriously cheesy announcer via speech synthesis — interrupts himself like the real thing
  say(text) {
    if (this.muted || !HAS_DOM || typeof speechSynthesis === 'undefined') return;
    try {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/!+/g, '!').replace(/—/g, ', '));
      u.rate = 1.25; u.pitch = 0.65; u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  },
  tick()    { if (!this.ctx || this.muted) return; this.osc('square', 700, 690, this.t(), 0.035, 0.10); },
  riser()   { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('sawtooth', 180, 880, t, 0.7, 0.12); this.noise(t, 0.7, 0.10, 'bandpass', 400, 3000, 2); },
  bardown() { if (!this.ctx || this.muted) return; this.post(); const me = this;
    setTimeout(() => me.goalHorn(), 90); },
  denied()  { if (!this.ctx || this.muted) return; const t = this.t();
    this.osc('sawtooth', 300, 90, t, 0.3, 0.14); this.noise(t, 0.12, 0.2, 'lowpass', 700, 250, 1); },

  startCrowd() {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 480;
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0.05;
    s.connect(flt); flt.connect(this.crowdGain); this.crowdGain.connect(this.master);
    s.start();
  },
  excite(level) { this.crowdTarget = Math.min(0.30, 0.06 + level * 0.22); },

  // simple synthwave loop: bass 8ths + hats, scheduled ~100ms ahead
  music(enabled) { this.musicOn = enabled; },
  update(dt) {
    if (!this.ctx) return;
    if (this.crowdGain) {
      const g = this.crowdGain.gain.value;
      this.crowdGain.gain.value = g + (0.05 + (this.crowdTarget - 0.05) - g) * Math.min(1, dt * 2);
      this.crowdTarget = Math.max(0.0, this.crowdTarget - dt * 0.12);
    }
    if (!this.musicOn || this.muted) return;
    const step = 60 / 126 / 2; // 8th notes at 126bpm
    const BASS = [55, 55, 65.4, 55, 49, 49, 58.3, 49];
    while (this.musicNext < this.t() + 0.12) {
      const t0 = Math.max(this.musicNext, this.t());
      const i = this.musicStep % 8;
      this.osc('square', BASS[i], BASS[i], t0, step * 0.9, 0.045);
      if (i % 2 === 0) this.noise(t0, 0.03, 0.035, 'highpass', 6000, 6000, 1);
      if (i === 4) this.noise(t0, 0.09, 0.05, 'bandpass', 1800, 900, 1);
      this.musicNext = (this.musicNext || this.t()) + step;
      this.musicStep++;
    }
  },
};
