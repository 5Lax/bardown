// All sound is synthesized via Web Audio — zero assets. Every public method must
// no-op cleanly when ctx is null (headless Node, or before first user gesture).
const AudioSys = {
  ctx: null, master: null, noiseBuf: null, crowdGain: null, crowdTarget: 0.06,
  musicOn: true, musicNext: 0, musicStep: 0, muted: true, // silent by default — M opts in

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
      // browser TTS voices load asynchronously — grab them now and again when they arrive
      this.pickVoices();
      try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => this.pickVoices(); } catch (e) {}
      // muted unless the user has explicitly unmuted before
      try { this.muted = localStorage.getItem('bardown_mute') !== '0'; } catch (e) {}
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
  bounce(k) { if (!this.ctx || this.muted) return; this.osc('sine', 240 + k * 120, 140, this.t(), 0.06, 0.07 + k * 0.06); },
  jumpSfx() { if (!this.ctx || this.muted) return; this.noise(this.t(), 0.09, 0.1, 'bandpass', 500, 1500, 2); },

  // two-man broadcast booth via speech synthesis: voice 1 = play-by-play (deep, gravelly,
  // rides the call), voice 2 = wry color analyst (waits his turn, then quips). TTS can't be
  // a real person, but voice ranking + dramatic pacing + a crowd swell sell the broadcast feel.
  voiceA: null, voiceB: null,
  // ranked best-to-worst by how much each reads as a deep North-American sportscaster
  PBP_PREF: ['google uk english male', 'microsoft guy', 'microsoft david', 'daniel', 'arthur',
             'microsoft mark', 'fred', 'google us english', 'aaron', 'reed'],
  COLOR_PREF: ['microsoft david', 'microsoft mark', 'rishi', 'microsoft guy', 'oliver', 'tom', 'alex', 'eric'],
  pickVoices() {
    if (!HAS_DOM || typeof speechSynthesis === 'undefined') return;
    try {
      const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (!vs.length) return;
      const rank = (pref) => {
        for (const name of pref) { const m = vs.find(v => v.name.toLowerCase().includes(name)); if (m) return m; }
        return null;
      };
      this.voiceA = rank(this.PBP_PREF) || vs.find(v => /male|man|guy/i.test(v.name)) || vs[0];
      this.voiceB = rank(this.COLOR_PREF.filter(n => !this.voiceA || !this.voiceA.name.toLowerCase().includes(n)))
        || vs.find(v => v !== this.voiceA) || this.voiceA;
    } catch (e) {}
  },
  say(text, who) {
    if (this.muted || !HAS_DOM || typeof speechSynthesis === 'undefined') return;
    try {
      if (!this.voiceA) this.pickVoices();
      if (who === 2) {
        if (speechSynthesis.speaking) return; // the analyst doesn't talk over the call
      } else if (speechSynthesis.speaking) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/—/g, ', ').replace(/!+/g, '!'));
      if (who === 2) {
        if (this.voiceB) u.voice = this.voiceB;
        u.rate = 1.06; u.pitch = 0.92; u.volume = 0.9;       // analyst: dry, conversational
      } else {
        if (this.voiceA) u.voice = this.voiceA;
        // play-by-play is always amped — deep but lifted, paced so the call lands
        const big = /!|GOAL|SCORE|BARDOWN/i.test(text);
        u.rate = big ? 1.0 : 1.18;
        u.pitch = 0.76; u.volume = 1.0;
        this.excite(1.0);                                     // crowd roars under every call
      }
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

  // heroic adventure loop, G major @ 140 — plucky dual-triangle lead over warm bass
  // and a soft timpani pulse. Fun and mythical, zero assets.
  music(enabled) { this.musicOn = enabled; },
  buildTune() {
    // [freq, eighth-notes]; 0 = rest. Two 4-bar phrases (64 eighths total).
    const N = { G3: 196, A3: 220, B3: 246.9, C4: 261.6, D4: 293.7, E4: 329.6, Fs4: 370, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, Fs5: 740, G5: 784 };
    const phrase = [
      [N.G4, 2], [N.B4, 1], [N.D5, 1], [N.G5, 2], [N.Fs5, 1], [N.E5, 1],
      [N.D5, 3], [N.C5, 1], [N.B4, 2], [N.A4, 2],
      [N.B4, 2], [N.C5, 1], [N.D5, 1], [N.E5, 2], [N.C5, 2],
      [N.D5, 6], [0, 2],
      [N.E5, 2], [N.Fs5, 1], [N.G5, 1], [N.Fs5, 2], [N.E5, 1], [N.D5, 1],
      [N.E5, 3], [N.D5, 1], [N.C5, 2], [N.B4, 2],
      [N.A4, 2], [N.B4, 1], [N.C5, 1], [N.B4, 2], [N.A4, 2],
      [N.G4, 6], [0, 2],
    ];
    this.melodyMap = new Array(64).fill(null);
    let at = 0;
    for (const [f, d] of phrase) { if (f) this.melodyMap[at % 64] = { f, d }; at += d; }
    this.bassBars = [98, 130.8, 98, 146.8, 130.8, 110, 146.8, 98]; // G C G D | C A D G
  },
  update(dt) {
    if (!this.ctx) return;
    if (this.crowdGain) {
      const g = this.crowdGain.gain.value;
      this.crowdGain.gain.value = g + (0.05 + (this.crowdTarget - 0.05) - g) * Math.min(1, dt * 2);
      this.crowdTarget = Math.max(0.0, this.crowdTarget - dt * 0.12);
    }
    if (!this.musicOn || this.muted) return;
    if (!this.melodyMap) this.buildTune();
    const step = 60 / 140 / 2; // 8ths at 140bpm
    while (this.musicNext < this.t() + 0.12) {
      const t0 = Math.max(this.musicNext, this.t());
      const i = this.musicStep % 64;
      const note = this.melodyMap[i];
      if (note) {
        const dur = note.d * step;
        this.osc('triangle', note.f, note.f, t0, dur * 1.05, 0.06);
        this.osc('triangle', note.f * 1.003, note.f * 1.003, t0, dur, 0.03); // chorus shimmer
      }
      if (i % 8 === 0) {
        const root = this.bassBars[Math.floor(i / 8) % 8];
        this.osc('triangle', root, root, t0, step * 7, 0.05);
        this.osc('sine', root / 2, root / 2, t0, step * 3, 0.05);
      }
      if (i % 4 === 2) this.osc('sine', 82, 60, t0, 0.1, 0.05); // soft timpani pulse
      if (i % 2 === 1) this.noise(t0, 0.025, 0.018, 'highpass', 7000, 7000, 1);
      this.musicNext = (this.musicNext || this.t()) + step;
      this.musicStep++;
    }
  },
};
