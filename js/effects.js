// Popups/announcer, particles, screen shake, flash, slowmo, zoom punch.
// Pure data + update; rendering is driven by render.js. Cosmetic-only Math.random OK.
const ANNOUNCER = {
  goal:      ['GOAL!', 'LIGHT THE LAMP!', 'TOP CHEDDAR!', 'BURIED IT!', 'CANNON!'],
  bardown:   ['BARDOWN!!', 'OFF THE IRON — IN!', 'PING — COUNT IT!'],
  save:      ['DENIED!', 'STONEWALLED!', 'ROBBERY!', 'SAYS NO!'],
  bigsave:   ['ABSOLUTE LARCENY!', 'HOW?!', 'GLOVE SAYS NO!'],
  hit:       ['CRUNCH!', 'LEVELED!', 'FLATTENED!', 'BODIED!'],
  bighit:    ['CROSSCHECK CITY!', 'DEMOLISHED!!', 'INTO ORBIT!', 'CALL THE MAYOR — HE\'S GONE!'],
  tackle:    ['TRUCKED!!', 'PANCAKED!', 'FULL EXTENSION!', 'SEE YA!', 'BODIED INTO NEXT WEEK!'],
  latehit:   ['LATE HIT!', 'AFTER THE WHISTLE!', 'CHEAP SHOT!'],
  fire:      ['HE\'S ON FIRE!', 'THE WHOLE TEAM IS ON FIRE!!'],
  fireout:   ['FIRE EXTINGUISHED'],
  shotclock: ['SHOT CLOCK VIOLATION!', 'TOO SLOW!'],
  faceoff:   ['FACEOFF!'],
  noGoal:    ['NO GOAL — IN THE CREASE!', 'WAVED OFF!!'],
  quick:     ['ONE-TIMER!', 'QUICK STICK!'],
  special:   ['ARE YOU KIDDING ME?!', 'FILTHY!!', 'HIGHLIGHT REEL!'],
  desperation:['DESPERATION MODE!!'],
  powerplay: ['POWER PLAY!', 'HE\'S IN THE BOX!'],
  steal:     ['PICKED OFF!', 'INTERCEPTED!'],
  ot:        ['OVERTIME — NEXT GOAL WINS!'],
};

const Effects = {
  popups: [], particles: [], trails: [],
  shake: 0, shakeX: 0, shakeY: 0, flashA: 0, zoom: 0, slowmoT: 0, slowmoScale: 1,

  reset() { this.popups.length = 0; this.particles.length = 0; this.trails.length = 0;
    this.shake = 0; this.flashA = 0; this.zoom = 0; this.slowmoT = 0; },

  popup(text, opts = {}) {
    this.popups.push({
      text, t: 0, life: opts.life || 1.5, size: opts.size || 58,
      color: opts.color || '#ffffff', sub: opts.sub || '', y: opts.y || 290,
      rot: (Math.random() - 0.5) * 0.12,
    });
    if (this.popups.length > 4) this.popups.shift();
  },
  announce(kind, opts = {}) {
    const lines = ANNOUNCER[kind];
    if (!lines) return;
    this.popup(lines[Math.floor(Math.random() * lines.length)], opts);
  },

  burst(x, y, opts = {}) {
    const n = opts.n || 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (opts.spd || 240) * (0.3 + Math.random() * 0.9);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: (opts.life || 0.6) * (0.5 + Math.random() * 0.7), t: 0,
        size: opts.size || 3, color: opts.color || '#ffffff', drag: opts.drag !== undefined ? opts.drag : 3,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  },
  trail(x, y, color, size) {
    this.trails.push({ x, y, t: 0, life: 0.3, size: size || 5, color });
    if (this.trails.length > 220) this.trails.shift();
  },

  addShake(m) { this.shake = Math.min(this.shake + m, 26); },
  flash(a) { this.flashA = Math.max(this.flashA, a); },
  punch(z) { this.zoom = Math.max(this.zoom, z); },
  slowmo(t, scale) { this.slowmoT = Math.max(this.slowmoT, t); this.slowmoScale = scale; },
  timeScale() { return this.slowmoT > 0 ? this.slowmoScale : 1; },

  update(dt) {
    this.shake = damp(this.shake, 6.5, dt);
    if (this.shake < 0.08) this.shake = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    this.zoom = damp(this.zoom, 7, dt);
    this.slowmoT = Math.max(0, this.slowmoT - dt);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > p.life) this.popups.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t > p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx = damp(p.vx, p.drag, dt); p.vy = damp(p.vy, p.drag, dt);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.t += dt;
      if (t.t > t.life) this.trails.splice(i, 1);
    }
  },
};
