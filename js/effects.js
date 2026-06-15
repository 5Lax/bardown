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
  fire:      ['HE\'S ON FIRE!', 'BOOMSHAKALAKA!', 'HE\'S HEATED UP — LITERALLY!'],
  heatup:    ['HEATING UP!', 'HE\'S FEELING IT!', 'TWO IN A ROW!'],
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
  goalieGoal:['GOALIE GOOOOAL?!', 'THE KEEPER SCORES!!', 'FULL COURT. BY THE GOALIE.'],
};

// the color analyst's follow-up lines — fired a beat after the play-by-play call
const BANTER = {
  goal:      ['Top shelf, where momma hides the cookies!', 'That goalie is going to feel that one in his dreams.', 'You could hang laundry on that rope.', 'Filthy. Absolutely filthy, partner.'],
  bardown:   ['That ping is the best sound in sports.', 'Iron and in. The purists are weeping with joy.'],
  tackle:    ['He is going to need a new spine.', 'Somewhere his mother just gasped.', 'That is a felony in at least nine states.', 'Full extension! Beautiful form on the crime.'],
  bighit:    ['The boards felt that one.', 'He left his soul at center floor.', 'Clean up on aisle five.'],
  save:      ['Highway robbery!', 'He had no business saving that.'],
  bigsave:   ['Call the police, because that was a robbery.', 'The kid is a wall with legs.'],
  fire:      ['Somebody call the fire marshal.', 'He is cooking with the whole stove now.', 'The net is going to need an insurance claim.'],
  heatup:    ['He is starting to feel it now.', 'One more and he is cooking.'],
  powerplay: ['Off to the sin bin.', 'You cannot just truck the goalie. Well, you can. It is just illegal.'],
  noGoal:    ['The crease giveth, and the crease taketh away.', 'Great goal. Illegal, but great.'],
  desperation: ['Down five? Time to throw the kitchen sink. And the dishes.'],
  shotclock: ['You have thirty seconds for a reason, gentlemen.'],
  quick:     ['Catch and release! Like a fishing show, but violent.'],
  goalieGoal: ['I have called games for thirty years and I have never. Seen. That.', 'Somebody check what they put in his water bottle.', 'The other goalie may simply retire.'],
};

const Effects = {
  popups: [], particles: [], trails: [],
  shake: 0, shakeX: 0, shakeY: 0, flashA: 0, zoom: 0, slowmoT: 0, slowmoScale: 1,
  boothQ: null, boothSub: null,

  reset() { this.popups.length = 0; this.particles.length = 0; this.trails.length = 0;
    this.shake = 0; this.flashA = 0; this.zoom = 0; this.slowmoT = 0;
    this.boothQ = null; this.boothSub = null; },

  popup(text, opts = {}) {
    this.popups.push({
      text, t: 0, life: opts.life || 1.5, size: opts.size || 58,
      color: opts.color || '#ffffff', sub: opts.sub || '', y: opts.y || 290,
      rot: (Math.random() - 0.5) * 0.12,
    });
    if (this.popups.length > 4) this.popups.shift();
  },
  VOICED: new Set(['goal', 'bardown', 'fire', 'heatup', 'special', 'noGoal', 'powerplay', 'ot', 'desperation', 'tackle', 'bigsave', 'bighit', 'goalieGoal']),
  announce(kind, opts = {}) {
    const lines = ANNOUNCER[kind];
    if (!lines) return;
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.popup(line, opts);
    if (this.VOICED.has(kind)) {
      AudioSys.say(line, 1);
      // queue the analyst's quip a beat later
      if (BANTER[kind] && Math.random() < 0.7) {
        this.boothQ = { text: BANTER[kind][Math.floor(Math.random() * BANTER[kind].length)], t: 1.5 };
      }
    }
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
    if (this.boothQ) {
      this.boothQ.t -= dt;
      if (this.boothQ.t <= 0) {
        AudioSys.say(this.boothQ.text, 2);
        this.boothSub = { text: this.boothQ.text, t: 3.4 };
        this.boothQ = null;
      }
    }
    if (this.boothSub) {
      this.boothSub.t -= dt;
      if (this.boothSub.t <= 0) this.boothSub = null;
    }
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
