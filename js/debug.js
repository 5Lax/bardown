// BARDOWN test harness — same object drives browser autotests and Node headless runs.
const BARDOWN = {
  game: null,
  errors: [],
  startGame: null, // wired by main.js in the browser

  install(game) { this.game = game; return this; },
  hookErrors() {
    if (!HAS_DOM) return;
    window.addEventListener('error', e => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', e => this.errors.push('rejection: ' + String(e.reason)));
  },

  invariants() {
    const g = this.game, out = [];
    if (!g) return ['no game installed'];
    const rk = CONFIG.rink, M = 45;
    const inRink = (x, y, m) => x > rk.x - m && x < rk.x + rk.w + m && y > rk.y - m && y < rk.y + rk.h + m;
    const b = g.ball;
    if (!isFinite(b.pos.x) || !isFinite(b.pos.y) || !isFinite(b.z)) out.push('ball NaN');
    else if (b.state !== 'dead' && !inRink(b.pos.x, b.pos.y, M)) out.push(`ball out of bounds (${b.pos.x | 0},${b.pos.y | 0}) state=${b.state}`);
    let carriers = 0;
    for (const p of g.players) {
      if (!isFinite(p.pos.x) || !isFinite(p.pos.y)) { out.push(`player ${p.team}/${p.idx} NaN`); continue; }
      if (p.state !== 'benched' && !inRink(p.pos.x, p.pos.y, M)) out.push(`player ${p.team}/${p.idx} OOB (${p.pos.x | 0},${p.pos.y | 0})`);
      if (g.ball.carrier === p) carriers++;
      if (p.turbo < -0.01 || p.turbo > CONFIG.player.turboMax + 0.01) out.push('turbo out of range');
    }
    if (carriers > 1) out.push('multiple carriers');
    if ((b.state === 'carried' || b.state === 'held') && !b.carrier) out.push('carried without carrier');
    if (g.shotClock < -0.6 || g.shotClock > CONFIG.clockCfg.shotClock + 0.01) out.push('shot clock out of range: ' + g.shotClock.toFixed(2));
    if (g.score[0] < 0 || g.score[1] < 0) out.push('negative score');
    if (!['faceoff', 'play', 'goal', 'break', 'over'].includes(g.state)) out.push('bad state ' + g.state);
    for (let t = 0; t < 2; t++) {
      const active = g.teams[t].filter(p => p.state !== 'benched').length;
      const expected = g.powerPlay && g.powerPlay.player.team === t ? 5 : 6;
      if (active !== expected) out.push(`team ${t} roster ${active} != ${expected}`);
    }
    return out;
  },

  summary() {
    const g = this.game;
    if (!g) return null;
    return {
      score: [...g.score], quarter: g.quarter, clock: +g.clock.toFixed(1),
      shotClock: +g.shotClock.toFixed(1), state: g.state, ballState: g.ball.state,
      possession: g.possession, time: +g.time.toFixed(1), over: g.over,
      fire: [...g.fire], powerPlay: !!g.powerPlay,
      stats: JSON.parse(JSON.stringify(g.stats)),
    };
  },

  // synchronous CPU-vs-CPU sim; samples invariants every simulated half-second
  simulate(seconds, opts = {}) {
    const g = this.game;
    if (!g) return { error: 'no game' };
    const dt = 1 / 120;
    const violations = [];
    let t = 0, nextCheck = 0;
    const steps = Math.floor(seconds / dt);
    for (let i = 0; i < steps; i++) {
      if (g.over && !opts.runWhileOver) break;
      g.update(dt);
      Effects.update(dt);
      t += dt;
      if (t >= nextCheck) {
        nextCheck += 0.5;
        for (const v of this.invariants()) {
          const key = v.replace(/[-\d.()]+/g, '#');
          if (!violations.some(x => x.key === key)) violations.push({ key, msg: v, at: +t.toFixed(1) });
        }
      }
    }
    return { simulated: +t.toFixed(1), violations: violations.map(v => `${v.msg} @${v.at}s`), state: this.summary() };
  },
};

if (HAS_DOM) { window.BARDOWN = BARDOWN; BARDOWN.hookErrors(); }
