CONFIG.goals.forEach((g, i) => { g.i = i; });

class Game {
  constructor(opts = {}) {
    this.mode = opts.mode || 'p1';            // 'p1' (human = team 0) | 'p2' (pad = team 1) | 'cpu'
    this.humanTeam = 0;
    this.diff = CONFIG.difficulty[opts.difficulty] || CONFIG.difficulty.ARCADE;
    this.rng = new RNG(opts.seed || 1234567);
    this.homeIdx = opts.home !== undefined ? opts.home : 0;
    this.awayIdx = opts.away !== undefined ? opts.away : 1;
    this.teamDefs = [CONFIG.teams[this.homeIdx], CONFIG.teams[this.awayIdx]];

    // phase gates — flipped on as build phases land
    this.hitsEnabled = true;
    this.turboEnabled = false; // always-turbo now: meter & button retired, everyone sprints
    this.interceptEnabled = true;
    this.specialsEnabled = true;
    this.rubberEnabled = true;
    this.fireEnabled = true;
    this.faceoffMash = true;
    this.penaltiesEnabled = true;
    this.otEnabled = true;

    const half = CONFIG.net.mouthW / 2, dep = CONFIG.net.depth;
    this.netBoxes = CONFIG.goals.map(n => ({ x: n.f > 0 ? n.x - dep : n.x, y: n.cy - half, w: dep, h: CONFIG.net.mouthW }));
    this.posts = [];
    for (const n of CONFIG.goals) this.posts.push({ x: n.x, y: n.cy - half }, { x: n.x, y: n.cy + half });

    this.teams = [[], []];
    this.goalies = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 5; i++) this.teams[t].push(new Player(this, t, i, false));
      const g = new Goalie(this, t);
      this.teams[t].push(g);
      this.goalies.push(g);
    }
    this.players = [...this.teams[0], ...this.teams[1]];
    this.ball = new Ball(this);

    this.score = [0, 0];
    this.stats = { shots: [0, 0], saves: [0, 0], hits: [0, 0], bardowns: [0, 0], specials: [0, 0], steals: [0, 0], biggestLead: [0, 0], fires: [0, 0], pps: [0, 0] };
    this.quarter = 1;
    this.clock = CONFIG.clockCfg.quarterLen;
    this.shotClock = CONFIG.clockCfg.shotClock;
    this.possession = -1;
    this.unanswered = [0, 0];
    this.fire = [false, false];
    this.penaltyHeat = [0, 0];
    this.powerPlay = null;
    this.time = 0;
    this.paused = false;
    this.over = false;
    this.ot = false;
    this.pendingGameOver = false;
    this.controlled = null;
    this.controlled2 = null;
    this.lastBeep = -1;
    this.faceoffBattle = null;
    this.setupFaceoff();
  }

  attackNet(team) { return CONFIG.goals[1 - team]; }
  defendNet(team) { return CONFIG.goals[team]; }
  netIndex(net) { return net.i; }

  getMods(team) {
    const R = CONFIG.rubber;
    const d = clamp(this.score[1 - team] - this.score[team], 0, R.maxGoals);
    const rb = this.rubberEnabled ? d : 0;
    return {
      speed: 1 + rb * R.speedPerGoal,
      err: 1 - rb * R.errPerGoal,
      turboRegen: 1 + rb * R.turboPerGoal,
      fumbleBonus: this.rubberEnabled && d >= 3 ? R.fumbleAt3 : 0,
      desperation: this.rubberEnabled && d >= R.desperationAt,
      onFire: this.fireEnabled && this.fire[team],
    };
  }
  aiReaction(team) {
    const lead = clamp(this.score[team] - this.score[1 - team], 0, CONFIG.rubber.maxGoals);
    let base = CONFIG.ai.reactBase + (this.rubberEnabled ? lead * CONFIG.rubber.cpuReactPerGoal : 0);
    if (this.mode === 'p1' && team === 1 - this.humanTeam) base = Math.max(0.02, base + this.diff.cpuReact);
    return base;
  }
  aiAggro(team) {
    return (this.mode === 'p1' && team === 1 - this.humanTeam) ? this.diff.cpuAggro : 1;
  }
  goalieReflex(team, shot) {
    let r = 1;
    if (shot) {
      const sm = this.getMods(shot.team);
      if (sm.onFire) r *= 0.85;
      if (shot.shooter && shot.shooter.onFire) r *= CONFIG.fire.playerGoalieReflex; // hot hand
      if (shot.special) r *= sm.desperation ? CONFIG.rubber.despGoalieMult : 0.8;
      if (shot.quick) r *= 0.75; // one-timers catch the goalie mid-slide — the box scoring channel
      // arcade house rules: the CPU goalie freezes on the human's release, then reacts slower
      if (this.mode === 'p1' && shot.team === this.humanTeam) {
        if (this.time - shot.t0 < this.diff.goalieDelay) return 0;
        r *= this.diff.goalieReflex;
      }
    }
    return r;
  }

  // turbo+shoot while flying at the net = dive shot. force=true (CPU desperation) skips the speed gate.
  startDive(p, force) {
    if (!this.specialsEnabled || p.state !== 'play' || this.ball.carrier !== p) return false;
    const net = this.attackNet(p.team), SP = CONFIG.special;
    const d = dist(p.pos.x, p.pos.y, net.x, net.cy);
    if (d > SP.diveRange || d < CONFIG.crease.r + p.r) return false;
    const toNet = norm(net.x - p.pos.x, net.cy - p.pos.y);
    const spd = Math.hypot(p.vel.x, p.vel.y);
    const vDir = spd > 1 ? { x: p.vel.x / spd, y: p.vel.y / spd } : toNet;
    if (vDir.x * toNet.x + vDir.y * toNet.y < 0.45) return false;
    if (!force && !p.turboActive && spd < CONFIG.player.maxSpeed * 0.6) return false;
    p.state = 'diving';
    p.diveT = SP.diveTime;
    p.diveReleased = false;
    p.charging = false; p.charge = 0; p.pendingSpecial = null;
    const boost = SP.diveBoost + spd * 0.45;
    p.vel.x = (vDir.x * 0.45 + toNet.x * 0.55) * boost;
    p.vel.y = (vDir.y * 0.45 + toNet.y * 0.55) * boost;
    AudioSys.pass();
    return true;
  }

  setupFaceoff() {
    const c = CONFIG.center;
    for (let t = 0; t < 2; t++) {
      const s = t === 0 ? -1 : 1;
      const spots = [
        { x: c.x + s * 26, y: c.y },
        { x: c.x + s * 130, y: c.y - 150 },
        { x: c.x + s * 130, y: c.y + 150 },
        { x: c.x + s * 330, y: c.y - 85 },
        { x: c.x + s * 330, y: c.y + 85 },
      ];
      for (let i = 0; i < 5; i++) {
        const p = this.teams[t][i];
        if (p.state === 'benched') continue;
        p.pos.x = spots[i].x; p.pos.y = spots[i].y;
        p.vel.x = p.vel.y = 0;
        p.state = 'play'; p.knockT = 0; p.charging = false; p.charge = 0;
        p.facing = t === 0 ? 0 : Math.PI;
        p.ai.spot = null; p.ai.shooting = false; p.ai.cutting = 0;
        p.resetIntent();
      }
      const g = this.goalies[t], net = this.defendNet(t);
      g.pos.x = net.x + net.f * CONFIG.goalie.arcR;
      g.pos.y = net.cy;
      g.vel.x = g.vel.y = 0; g.state = 'play'; g.resetIntent();
    }
    const b = this.ball;
    b.state = 'loose'; b.carrier = null; b.passTo = null; b.shot = null;
    b.pos.x = c.x; b.pos.y = c.y; b.vel.x = b.vel.y = 0; b.z = 0;
    b.syncPrev();
    this.possession = -1;
    this.shotClock = CONFIG.clockCfg.shotClock;
    this.state = 'faceoff';
    this.stateT = 0;
    this.faceoffBattle = this.faceoffMash ? { mashes: 0, cpu: 0, go: false, done: false } : null;
    if (this.mode !== 'cpu') this.setControlled(this.teams[this.humanTeam][0]);
    if (this.mode === 'p2') this.setControlled2(this.teams[1 - this.humanTeam][0]);
  }

  setControlled(p) {
    if (this.controlled === p) return;
    if (this.controlled) this.controlled.controlled = false;
    this.controlled = p;
    if (p) p.controlled = true;
  }

  update(dt) {
    if (this.paused || this.over) return;
    this.time += dt;
    this.stateT += dt;
    switch (this.state) {
      case 'faceoff': this.stepFaceoff(dt); break;
      case 'play': this.stepPlay(dt); break;
      case 'goal':
        this.stepAction(dt);
        if (this.stateT > CONFIG.clockCfg.goalCelebration) {
          if (this.pendingGameOver) this.endGame();
          else this.setupFaceoff();
        }
        break;
      case 'break':
        this.stepAction(dt); // after-the-whistle violence continues through the banner
        if (this.stateT > CONFIG.clockCfg.breakTime) {
          this.quarter++;
          this.clock = CONFIG.clockCfg.quarterLen;
          Effects.popup('Q' + this.quarter, { size: 70, color: '#ffd24a', life: 1.0 });
          this.setupFaceoff();
        }
        break;
    }
  }

  stepFaceoff(dt) {
    const F = CONFIG.faceoff;
    if (!this.faceoffBattle) {
      if (this.stateT >= CONFIG.clockCfg.faceoffDrop) this.endFaceoff(this.rng.range(0, Math.PI * 2));
      return;
    }
    const fb = this.faceoffBattle;
    if (this.stateT < F.readyTime) return;
    if (!fb.go) { fb.go = true; AudioSys.whistle(); }
    if (this.mode !== 'cpu') {
      const src = this.mode === 'p2' ? 'kbm' : 'all';
      if (Input.pressed('pass', src) || Input.pressed('shoot', src) || Input.pressed('jump', src)) { fb.mashes++; AudioSys.tick(); }
    }
    if (this.mode === 'p2') {
      if (Input.pressed('pass', 'pad') || Input.pressed('shoot', 'pad') || Input.pressed('jump', 'pad')) { fb.cpu++; AudioSys.tick(); }
    } else {
      fb.cpuRate = fb.cpuRate || (F.cpuRate + this.rng.range(-F.cpuRateJitter, F.cpuRateJitter) + (this.rubberEnabled ? clamp(this.score[this.mode === 'p1' ? this.humanTeam : 0] - this.score[1], -3, 3) * 0.6 : 0));
      fb.cpu += fb.cpuRate * dt;
    }
    if (this.mode === 'cpu') fb.mashes += (F.cpuRate + this.rng.range(-1, 1)) * dt;
    if (this.stateT >= F.readyTime + F.mashTime) {
      const humanWins = fb.mashes >= fb.cpu;
      const winner = humanWins ? this.humanTeam : 1 - this.humanTeam;
      const s = winner === 0 ? -1 : 1;
      const a = Math.atan2(this.rng.range(-0.6, 0.6), s);
      this.endFaceoff(a);
      Effects.popup(this.teamDefs[winner].name + ' WINS THE DRAW', { size: 30, life: 0.9, y: 350 });
    }
  }
  endFaceoff(angle) {
    AudioSys.whistle();
    const sp = this.rng.range(CONFIG.faceoff.popSpeed[0], CONFIG.faceoff.popSpeed[1]);
    this.ball.drop(Math.cos(angle) * sp, Math.sin(angle) * sp, this.rng.range(180, 300));
    this.state = 'play';
    this.stateT = 0;
  }

  stepPlay(dt) {
    this.clock -= dt;
    if (this.possession >= 0 && this.ball.state !== 'shot') {
      this.shotClock -= dt;
      const s = Math.ceil(this.shotClock);
      if (this.shotClock <= CONFIG.clockCfg.beepAt && this.shotClock > 0 && s !== this.lastBeep) {
        AudioSys.beep(); this.lastBeep = s;
      }
      if (this.shotClock <= 0) this.shotClockViolation();
    }
    if (this.powerPlay) {
      this.powerPlay.t -= dt;
      if (this.powerPlay.t <= 0) this.endPowerPlay();
    }
    this.penaltyHeat[0] = Math.max(0, this.penaltyHeat[0] - CONFIG.penalty.decay * dt);
    this.penaltyHeat[1] = Math.max(0, this.penaltyHeat[1] - CONFIG.penalty.decay * dt);
    if (this.clock <= 0) { this.endQuarter(); return; }
    this.stepAction(dt);
  }

  // entity movement + ai + human input + resolution (used by play, goal and break states)
  stepAction(dt) {
    this.updateControl();
    this.applyHumanIntent();
    if (this.mode === 'p2') { this.updateControl2(); this.applyHumanIntent2(); }
    AI.update(this, dt);
    for (const p of this.players) p.update(dt);
    this.collidePlayers();
    this.ball.update(dt);
    this.resolve(dt);
  }

  updateControl() {
    if (this.mode === 'cpu') return;
    const src = this.mode === 'p2' ? 'kbm' : 'all';
    const t = this.humanTeam;
    const goalie = this.goalies[t];
    if (Input.enabled && Input.held('goalie', src) && goalie.state === 'play') {
      goalie.manual = true;
      this.setControlled(goalie);
      return;
    }
    goalie.manual = false;
    const c = this.ball.carrier;
    if (c && c.team === t && !c.isGoalie) return this.setControlled(c);
    let cur = this.controlled;
    if (cur && (cur.isGoalie || cur.state === 'benched')) cur = null;
    let best = null, bd = 1e9;
    for (const p of this.teams[t]) {
      if (p.isGoalie || p.state !== 'play') continue;
      const d = dist(p.pos.x, p.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (!cur) this.setControlled(best);
    else {
      const cd = dist(cur.pos.x, cur.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (best !== cur && bd * CONFIG.switchCfg.hysteresis < cd) this.setControlled(best);
    }
  }

  setControlled2(p) {
    if (this.controlled2 === p) return;
    if (this.controlled2) this.controlled2.controlled = false;
    this.controlled2 = p;
    if (p) p.controlled = true;
  }

  updateControl2() {
    const t = 1 - this.humanTeam;
    const goalie = this.goalies[t];
    if (Input.enabled && Input.held('goalie', 'pad') && goalie.state === 'play') {
      goalie.manual = true;
      this.setControlled2(goalie);
      return;
    }
    goalie.manual = false;
    const c = this.ball.carrier;
    if (c && c.team === t && !c.isGoalie) return this.setControlled2(c);
    let cur = this.controlled2;
    if (cur && (cur.isGoalie || cur.state === 'benched')) cur = null;
    let best = null, bd = 1e9;
    for (const p of this.teams[t]) {
      if (p.isGoalie || p.state !== 'play') continue;
      const d = dist(p.pos.x, p.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (!cur) this.setControlled2(best);
    else {
      const cd = dist(cur.pos.x, cur.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (best !== cur && bd * CONFIG.switchCfg.hysteresis < cd) this.setControlled2(best);
    }
  }

  applyHumanIntent() {
    if (this.mode === 'cpu' || !Input.enabled) return;
    const src = this.mode === 'p2' ? 'kbm' : 'all';
    const p = this.controlled;
    if (!p || p.state !== 'play') return;
    const it = p.intent;
    const mv = Input.move(src);
    it.mx = mv.x; it.my = mv.y;
    it.aim = Input.aimFor(p, src);
    if (Input.pressed('jump', src)) it.jump = true;
    if (Input.pressed('cut', src)) this.callCut(this.humanTeam);
    if (Input.pressed('mod', src)) it.spin = true; // SHIFT tap = spin dodge
    const lobMod = Input.held('turbo', src);      // SHIFT held = saucer modifier
    // LMB: quick tap = pass (switch on D), hold past the threshold = charge a shot
    const lmb = Input.held('shoot', src);
    // hold shoot while a pass is on the way to you = armed one-timer (fires on the catch)
    if (lmb && !p.hasBall && this.ball.state === 'pass' && this.ball.passTo === p) p.oneTimerArmed = true;
    else if (!lmb) p.oneTimerArmed = false;
    if (Input.pressed('shoot', src)) p.lmbAt = this.time;
    it.shootHold = lmb && p.hasBall && (this.time - (p.lmbAt !== undefined ? p.lmbAt : -9)) > 0.14;
    if (p.wasLmb && !lmb && (this.time - (p.lmbAt !== undefined ? p.lmbAt : -9)) <= 0.14) {
      if (p.hasBall || (this.ball.state === 'held' && this.ball.carrier === p)) { it.pass = true; it.passLob = lobMod; }
      else this.manualSwitch();
    }
    p.wasLmb = lmb;
    if (Input.pressed('pass', src)) { // gamepad A keeps a dedicated pass button
      if (p.hasBall || (this.ball.state === 'held' && this.ball.carrier === p)) { it.pass = true; it.passLob = lobMod; }
      else this.manualSwitch();
    }
    if (Input.pressed('hit', src)) {
      // double right-click inside the window = flying body tackle
      if (this.time - (this.lastHitPress || -9) < CONFIG.tackle.window) it.tackle = true;
      else it.hit = true;
      this.lastHitPress = this.time;
    }
  }

  applyHumanIntent2() {
    if (!Input.enabled) return;
    const p = this.controlled2;
    if (!p || p.state !== 'play') return;
    const t = 1 - this.humanTeam;
    const it = p.intent;
    const mv = Input.move('pad');
    it.mx = mv.x; it.my = mv.y;
    it.aim = Input.aimFor(p, 'pad');
    if (Input.pressed('jump', 'pad')) it.jump = true;
    if (Input.pressed('cut', 'pad')) this.callCut(t);
    if (Input.pressed('mod', 'pad')) it.spin = true;
    const pheld = Input.held('shoot', 'pad');
    if (pheld && !p.hasBall && this.ball.state === 'pass' && this.ball.passTo === p) p.oneTimerArmed = true;
    else if (!pheld) p.oneTimerArmed = false;
    it.shootHold = pheld && p.hasBall;
    if (Input.pressed('pass', 'pad')) {
      if (p.hasBall || (this.ball.state === 'held' && this.ball.carrier === p)) { it.pass = true; it.passLob = Input.held('turbo', 'pad'); }
      else this.manualSwitch2();
    }
    if (Input.pressed('hit', 'pad')) {
      if (this.time - (this.lastHitPress2 || -9) < CONFIG.tackle.window) it.tackle = true;
      else it.hit = true;
      this.lastHitPress2 = this.time;
    }
  }

  manualSwitch() {
    const t = this.humanTeam;
    let best = null, bd = 1e9;
    for (const p of this.teams[t]) {
      if (p.isGoalie || p.state !== 'play' || p === this.controlled) continue;
      const d = dist(p.pos.x, p.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) this.setControlled(best);
  }

  manualSwitch2() {
    const t = 1 - this.humanTeam;
    let best = null, bd = 1e9;
    for (const p of this.teams[t]) {
      if (p.isGoalie || p.state !== 'play' || p === this.controlled2) continue;
      const d = dist(p.pos.x, p.pos.y, this.ball.pos.x, this.ball.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) this.setControlled2(best);
  }

  collidePlayers() {
    const ps = this.players, BB = CONFIG.body;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.state === 'benched') continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.state === 'benched') continue;
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
        const min = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = min - d;
        // box body play: a SET player (slow, upright) is a wall — picks and positional
        // defense work because you cannot run through a planted body. Spinners slip it.
        const spdA = Math.hypot(a.vel.x, a.vel.y), spdB = Math.hypot(b.vel.x, b.vel.y);
        const setA = a.state === 'play' && spdA < BB.setSpeed;
        const setB = b.state === 'play' && spdB < BB.setSpeed;
        let massA = a.mass * (setA ? 3 : 1), massB = b.mass * (setB ? 3 : 1);
        const ma = 1 / massA, mb = 1 / massB, tot = ma + mb;
        a.pos.x -= nx * ov * (ma / tot); a.pos.y -= ny * ov * (ma / tot);
        b.pos.x += nx * ov * (mb / tot); b.pos.y += ny * ov * (mb / tot);
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
        if (rel < 0) {
          const imp = rel * 0.4;
          a.vel.x += nx * imp * (ma / tot) * 2; a.vel.y += ny * imp * (ma / tot) * 2;
          b.vel.x -= nx * imp * (mb / tot) * 2; b.vel.y -= ny * imp * (mb / tot) * 2;
          // hard contact: runner meets wall
          this.bodyWall(a, b, nx, ny, -rel, setA, setB);
          this.bodyWall(b, a, -nx, -ny, -rel, setB, setA);
        }
      }
    }
  }

  // `mover` is running into `wall` along n (pointing mover→wall). If the wall is set
  // and the mover isn't mid-spin, kill the through-velocity and ride him to the side.
  bodyWall(wall, mover, nx, ny, vn, wallSet, moverSet) {
    const BB = CONFIG.body;
    if (!wallSet || moverSet || vn < BB.hardVn) return;
    if (mover.spinT > 0 || mover.state !== 'play') return;
    // strip the component of mover velocity pointed INTO the wall
    const into = mover.vel.x * -nx + mover.vel.y * -ny;
    if (into > 0) {
      mover.vel.x += nx * into;
      mover.vel.y += ny * into;
    }
    // opponents ride the carrier toward the boards, away from the middle lane
    if (wall.team !== mover.team && this.ball.carrier === mover) {
      const side = mover.pos.y >= CONFIG.center.y ? 1 : -1;
      mover.vel.y += side * BB.funnel;
      if (vn > BB.stumbleVn) {
        mover.staggerT = BB.staggerT;
        Effects.burst(mover.pos.x, mover.pos.y, { n: 5, color: '#cfd6cf', spd: 110, life: 0.3, size: 2 });
        AudioSys.thud(0.5);
      }
    }
  }

  // ---- actions ----

  // pass targeting: where you're aiming (mouse/stick), blended with where you're running
  bestPassTarget(p) {
    let aim = p.lastAim ? norm(p.lastAim.x, p.lastAim.y) : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    const sp = Math.hypot(p.vel.x, p.vel.y);
    if (sp > 70) {
      const blended = norm(aim.x * 0.68 + (p.vel.x / sp) * 0.32, aim.y * 0.68 + (p.vel.y / sp) * 0.32);
      if (blended.x || blended.y) aim = blended;
    }
    let best = null, bs = -1e9, nearest = null, nd = 1e9;
    for (const m of this.teams[p.team]) {
      if (m === p || m.state !== 'play') continue;
      const dx = m.pos.x - p.pos.x, dy = m.pos.y - p.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) continue;
      const dir = { x: dx / d, y: dy / d };
      const dot = dir.x * aim.x + dir.y * aim.y;
      if (d < nd) { nd = d; nearest = m; }
      if (dot < CONFIG.pass.cone) continue;
      const s = dot * 2.2 - d * 0.0012 - (m.isGoalie ? 0.8 : 0);
      if (s > bs) { bs = s; best = m; }
    }
    return best || nearest;
  }

  tryPass(p, forced, bounce) {
    const b = this.ball;
    if (b.carrier !== p) return;
    const target = (forced && forced.state === 'play') ? forced : this.bestPassTarget(p);
    if (!target) return;
    const d = dist(p.pos.x, p.pos.y, target.pos.x, target.pos.y);
    const lead = {
      x: target.pos.x + target.vel.x * CONFIG.pass.lead * (d / CONFIG.pass.speed),
      y: target.pos.y + target.vel.y * CONFIG.pass.lead * (d / CONFIG.pass.speed),
    };
    b.launchPass(p, target, lead, bounce); // arc height scales with distance; goalie auto-rainbows
    p.scoopCd = 0.25;
    p.charging = false; p.charge = 0;
    AudioSys.pass();
  }

  // E key: send the best off-ball teammate hard to the net for a give-and-go
  callCut(team) {
    if (this.ball.carrier === null || this.ball.carrier.team !== team) return;
    const net = this.attackNet(team);
    let best = null, bd = 1e9;
    for (const m of this.teams[team]) {
      if (m.isGoalie || m.state !== 'play' || m === this.ball.carrier || m.controlled) continue;
      if (m.ai.cutting > 0) continue;
      const d = dist(m.pos.x, m.pos.y, net.x, net.cy);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return;
    best.ai.cutting = CONFIG.ai.cutTime * 1.3;
    best.ai.cutY = this.rng.range(-45, 45);
    Effects.burst(best.pos.x, best.pos.y, { n: 6, color: '#7fd0ff', spd: 120, life: 0.4 });
    AudioSys.tick();
  }

  // manual (human) aim mapping — pure, no rng, safe for render previews
  manualAim(p, netIdx) {
    const net = CONFIG.goals[netIdx], cy = net.cy;
    const a = p.lastAim;
    if (!p.controlled || !a) return null;
    if (a.mouse && Input.enabled) {
      // pointing at the goal mouth: aim exactly where the cursor sits on the goal plane
      const gp = Input.goalPlane(netIdx);
      if (gp && Math.abs(gp.ty - cy) < 85 && gp.tz > -12 && gp.tz < 95) {
        return { ty: clamp(gp.ty, cy - 40, cy + 40), tz: clamp(gp.tz, 4, 56) };
      }
      // pointing at the floor: low shot toward that spot, clamped onto the cage
      const m = Input.mouseRink();
      const ty = clamp(m.y, cy - 44, cy + 44);
      const depth = Math.max(0, (net.x - m.x) * net.f);
      return { ty, tz: clamp(6 + depth * 1.1, 4, 56) };
    }
    if (Math.hypot(a.x, a.y) > 0.01) {
      const n = norm(a.x, a.y);
      return { ty: cy + n.y * 48, tz: 8 + Math.max(0, n.x * -net.f) * 44 };
    }
    return null;
  }

  aimTarget(p, netIdx) {
    const manual = this.manualAim(p, netIdx);
    if (manual) return manual;
    const net = CONFIG.goals[netIdx], cy = net.cy;
    const g = this.goalies[netIdx];
    const side = g.pos.y > cy ? -1 : 1;
    // corners low mostly; tz 48 is the bardown gamble (uncovered band, but scatter can ping it out)
    return { ty: cy + side * this.rng.range(24, 38), tz: this.rng.pick([6, 8, 10, 12, 40, 48]) };
  }

  fireShot(p, charge, special) {
    const b = this.ball;
    if (b.carrier !== p) return;
    if (special && !this.specialsEnabled) special = null;
    const netIdx = 1 - p.team;
    const net = CONFIG.goals[netIdx];
    const mods = this.getMods(p.team);
    const S = CONFIG.shot;
    const quick = (this.time - p.catchTime) < CONFIG.pass.quickWindow;
    let { ty, tz } = this.aimTarget(p, netIdx);
    const sht = p.teamDef.sht * p.ratings.sht; // per-player shooting rating
    let err = lerp(S.errMax, S.errMin, charge) * mods.err / sht;
    if (this.mode === 'p1' && p.team === this.humanTeam) err *= this.diff.shotErr; // house rules
    if (p.onFire) err *= CONFIG.fire.playerShotErr; // hot hand barely misses
    if (quick) err *= CONFIG.pass.quickErr;
    if (special) err *= CONFIG.special.errMult * (mods.desperation ? CONFIG.rubber.despErrMult : 1);
    ty += this.rng.range(-err, err);
    tz = Math.max(2, tz + this.rng.range(-err * 0.55, err * 0.55));
    if (special && mods.desperation) {
      ty = clamp(ty, net.cy - 38, net.cy + 38);
      tz = clamp(tz, 4, CONFIG.bar.lo + 2);
    }
    let speed = lerp(S.minSpeed, S.maxSpeed, charge) * sht;
    if (p.turboActive) speed *= S.turboMult;
    if (mods.onFire) speed *= S.fireMult;
    if (p.onFire) speed *= CONFIG.fire.playerShotSpeed;
    if (quick) speed *= CONFIG.pass.quickSpeed;
    if (special) speed *= CONFIG.special.speedMult;
    b.launchShot(p, netIdx, ty, tz, Math.min(speed, 1500), special, quick);
    b.shot.creaseViolation = dist(p.pos.x, p.pos.y, net.x, net.cy) < CONFIG.crease.r;
    p.scoopCd = 0.3;
    this.stats.shots[p.team]++;
    AudioSys.shoot(charge);
    if (quick && this.rng.chance(0.7)) Effects.announce('quick', { size: 38, y: 250, life: 0.9 });
    if (special) {
      this.stats.specials[p.team]++;
      Effects.announce('special', { size: 46, color: '#ffd24a', life: 1.1 });
    }
  }

  registerHit(hitter) {
    if (!this.hitsEnabled) return;
    const H = CONFIG.hit;
    let victim = null, bd = 1e9;
    for (const v of this.players) {
      if (v === hitter || v.team === hitter.team || v.state === 'benched') continue;
      if (v.jumpZ > CONFIG.jump.dodgeZ) continue; // hopped the check
      const d = dist(hitter.pos.x, hitter.pos.y, v.pos.x, v.pos.y);
      if (d > H.range + v.r) continue;
      const a = angTo(hitter.pos.x, hitter.pos.y, v.pos.x, v.pos.y);
      if (Math.abs(angDiff(hitter.facing, a)) > H.arc) continue;
      if (d < bd) { bd = d; victim = v; }
    }
    if (!victim) return;
    const spd = Math.hypot(hitter.vel.x, hitter.vel.y);
    let power = (0.8 + (spd / CONFIG.player.maxSpeed) * 0.5) * hitter.teamDef.pwr * hitter.ratings.pwr;
    if (hitter.turboActive) power += H.turboPower;
    this.applyHit(hitter, victim, power, {});
  }

  // shared takedown resolution for checks and flying tackles.
  // Box rule: ordinary cross-checks SHOVE you off your line (you keep your feet,
  // usually the ball too); only big hits and tackles put bodies on the floor.
  applyHit(hitter, victim, power, opts) {
    const H = CONFIG.hit, BB = CONFIG.body;
    if (victim.spinT > 0 && !opts.tackle) return; // spun off the check
    const late = victim.state === 'down';
    const dir = norm(victim.pos.x - hitter.pos.x, victim.pos.y - hitter.pos.y);
    const hadBall = this.ball.carrier === victim;
    if (!opts.tackle && !late && power < BB.shovePower) {
      victim.staggerT = BB.shoveStagger;
      victim.vel.x += dir.x * BB.shovePush * power;
      victim.vel.y += dir.y * BB.shovePush * power;
      this.stats.hits[hitter.team]++;
      AudioSys.thud(power * 0.7);
      Effects.burst(victim.pos.x, victim.pos.y, { n: 6, color: '#ffffff', spd: 150, life: 0.3 });
      if (hadBall && this.rng.chance(BB.shoveFumble + this.getMods(hitter.team).fumbleBonus * 0.5 - (victim.ratings.hands - 1) * 0.6)) {
        const a2 = Math.atan2(dir.y, dir.x) + this.rng.range(-0.7, 0.7);
        this.ball.drop(Math.cos(a2) * 220, Math.sin(a2) * 220, this.rng.range(80, 200));
        this.ball.syncPrev();
        victim.scoopCd = 0.4;
      }
      return;
    }
    victim.knockDown(dir.x, dir.y, power);
    if (hadBall) {
      const fum = H.fumbleBase + this.getMods(hitter.team).fumbleBonus + (opts.tackle ? 0.15 : 0) - (victim.ratings.hands - 1) * 0.6;
      if (this.rng.chance(Math.min(0.98, fum))) {
        const a2 = Math.atan2(dir.y, dir.x) + this.rng.range(-0.9, 0.9);
        const pop = this.rng.range(H.fumblePop[0], H.fumblePop[1]) * (opts.tackle ? 1.25 : 1);
        this.ball.drop(Math.cos(a2) * pop, Math.sin(a2) * pop, this.rng.range(150, 310));
        this.ball.z = 10;
        this.ball.syncPrev();
        victim.scoopCd = 0.5;
      }
    }
    this.stats.hits[hitter.team]++;
    Effects.addShake(H.shake * power * (opts.tackle ? 1.1 : 0.8));
    Effects.burst(victim.pos.x, victim.pos.y, { n: opts.tackle ? 20 : 12, color: '#ffffff', spd: opts.tackle ? 300 : 220, life: 0.45 });
    AudioSys.thud(power);
    if (opts.tackle) Effects.announce('tackle', { size: 52, life: 1.2 });
    else if (late) Effects.announce('latehit', { size: 40, color: '#ff8855', life: 1.0 });
    else if (power > H.bigPowerAt && this.rng.chance(0.6)) Effects.announce('bighit', { size: 48, life: 1.1 });
    else if (this.rng.chance(0.18)) Effects.announce('hit', { size: 36, life: 0.8, y: 250 });
    if (this.penaltiesEnabled) {
      let heat = 0;
      if (victim.isGoalie) heat += CONFIG.penalty.heatGoalie * (opts.tackle ? 1.5 : 1);
      if (late) heat += CONFIG.penalty.heatLate;
      if (heat > 0) {
        this.penaltyHeat[hitter.team] += heat;
        if (this.penaltyHeat[hitter.team] >= CONFIG.penalty.threshold) this.triggerPowerPlay(hitter);
      }
    }
  }

  triggerPowerPlay(offender) {
    this.penaltyHeat[offender.team] = 0;
    if (this.powerPlay) return;
    if (this.ball.carrier === offender) this.ball.drop(this.rng.range(-80, 80), this.rng.range(-80, 80));
    offender.state = 'benched';
    offender.pos.x = CONFIG.center.x + (offender.team === 0 ? -210 : 210);
    offender.pos.y = CONFIG.rink.y - 22;
    offender.vel.x = offender.vel.y = 0;
    this.powerPlay = { team: 1 - offender.team, t: CONFIG.penalty.ppTime, player: offender };
    this.stats.pps[1 - offender.team]++;
    AudioSys.whistle();
    Effects.announce('powerplay', { size: 52, color: '#ff5555', life: 1.6 });
    if (this.controlled === offender) { this.setControlled(null); this.updateControl(); }
    if (this.controlled2 === offender) { this.setControlled2(null); this.updateControl2(); }
  }
  endPowerPlay() {
    const p = this.powerPlay && this.powerPlay.player;
    if (p) {
      p.state = 'play';
      p.pos.y = CONFIG.rink.y + 40;
      p.vel.x = p.vel.y = 0;
      p.scoopCd = 0.3;
    }
    this.powerPlay = null;
  }

  // ---- resolution ----

  onPossession(p) {
    if (this.possession !== p.team) {
      this.possession = p.team;
      this.shotClock = CONFIG.clockCfg.shotClock;
      this.lastBeep = -1;
    }
  }

  resolve(dt) {
    const b = this.ball;
    if (b.state === 'shot' || b.state === 'pass' || b.state === 'loose') {
      this.goalieBody(b);
      this.checkCrossings();
      this.netWalls(b);
      this.postBounce(b);
    }
    if (b.state === 'loose') {
      let best = null, bd = 1e9;
      for (const p of this.players) {
        if (p.state !== 'play' || p.scoopCd > 0 || p.jumpZ > 8) continue;
        const reach = p.isGoalie ? CONFIG.player.pickupR + 4 : CONFIG.player.pickupR;
        const d = dist(p.pos.x, p.pos.y, b.pos.x, b.pos.y);
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (best && b.z < CONFIG.ballPhys.pickupZ) {
        if (best.isGoalie) b.hold(best); else b.attach(best);
        AudioSys.scoop();
      }
    } else if (b.state === 'pass') {
      // lobs sail over everyone; nothing gets picked right off the stick either
      const lobSafe = (b.lob && b.z > CONFIG.pass.lobSafeZ) || b.passT < CONFIG.pass.launchGrace;
      for (const p of this.players) {
        if (p.state !== 'play' || p === b.lastTouch || p.isGoalie) continue;
        const d = dist(p.pos.x, p.pos.y, b.pos.x, b.pos.y);
        if (p.team === b.passTeam) {
          if (p !== b.passTo && d < CONFIG.pass.catchR * 0.7 && b.z < 30) { b.attach(p); AudioSys.catchBall(); break; }
        } else if (this.interceptEnabled && !lobSafe && d < CONFIG.pass.interceptR + p.r * 0.4) {
          if (this.rng.chance(CONFIG.pass.interceptP)) {
            b.attach(p);
            this.stats.steals[p.team]++;
            Effects.announce('steal', { size: 40, life: 0.9 });
            AudioSys.catchBall();
            break;
          }
        }
      }
    }
  }

  goalieBody(b) {
    for (const g of this.goalies) {
      if (g.state !== 'play') continue;
      const d = dist(b.pos.x, b.pos.y, g.pos.x, g.pos.y);
      if (d > g.r + 4) continue;
      // body stops low/mid shots only — high heat must beat the glove at the plane check
      if (b.state === 'shot' && b.z > CONFIG.goalie.bodyH) continue;
      if (b.z > CONFIG.goalie.coverH) continue;
      if (b.state === 'shot') { this.resolveSave(g, b.shot); return; }
      if (b.state === 'pass') {
        if (b.passTeam !== g.team) { b.hold(g); AudioSys.catchBall(); }
        else if (b.passTo === g) { b.hold(g); AudioSys.catchBall(); }
        return;
      }
      if (b.state === 'loose' && g.scoopCd <= 0) { b.hold(g); AudioSys.scoop(); return; }
    }
  }

  netWalls(b) {
    for (const net of CONFIG.goals) {
      const box = this.netBoxes[net.i], half = CONFIG.net.mouthW / 2;
      if (Math.abs(b.pos.y - net.cy) < half) {
        const backX = net.f > 0 ? box.x : box.x + box.w;
        if ((b.pos.x - backX) * net.f < 7 && (b.pos.x - backX) * net.f > -CONFIG.net.depth - 10) {
          b.pos.x = backX + net.f * 7;
          if (b.vel.x * net.f < 0) b.vel.x *= -0.5;
        }
      } else {
        collideAABB(b.pos, b.vel, 7, box, 0.6);
      }
    }
  }

  postBounce(b) {
    for (const post of this.posts) {
      const d = dist(b.pos.x, b.pos.y, post.x, post.y);
      const min = 7 + CONFIG.net.postR;
      if (d >= min || b.z > CONFIG.bar.hi) continue;
      const n = norm(b.pos.x - post.x, b.pos.y - post.y);
      b.pos.x = post.x + n.x * min;
      b.pos.y = post.y + n.y * min;
      const vn = b.vel.x * n.x + b.vel.y * n.y;
      if (vn < 0) {
        b.vel.x -= 1.75 * vn * n.x;
        b.vel.y -= 1.75 * vn * n.y;
        if (b.state === 'shot') { this.resetShotClockOnNet(b.shot); b.state = 'loose'; b.shot = null; }
        AudioSys.post();
        Effects.addShake(2.5);
      }
    }
  }

  checkCrossings() {
    const b = this.ball;
    for (const net of CONFIG.goals) {
      const before = (b.prev.x - net.x) * net.f, after = (b.pos.x - net.x) * net.f;
      if (before <= 0 || after > 0) continue;
      const t = before / (before - after);
      const yc = lerp(b.prev.y, b.pos.y, t);
      const half = CONFIG.net.mouthW / 2;
      if (Math.abs(yc - net.cy) > half + CONFIG.net.postR + 7) {
        if (b.state === 'shot') { b.state = 'loose'; b.shot = null; b.vz = -60; }
        continue;
      }
      this.resolveNetArrival(net, yc);
      return;
    }
  }

  resolveNetArrival(net, yc) {
    const b = this.ball, B = CONFIG.bar, half = CONFIG.net.mouthW / 2, cy = net.cy;
    const z = b.z, shot = b.state === 'shot' ? b.shot : null;
    const dL = Math.abs(yc - (cy - half)), dR = Math.abs(yc - (cy + half));
    if (Math.abs(yc - cy) > half - 2) {
      if (dL < 9 || dR < 9) return this.ironOut(net, yc, shot, false);
      if (b.state === 'shot') { b.state = 'loose'; b.shot = null; }
      return;
    }
    if (z > B.hi) {
      if (b.state === 'shot') { b.state = 'loose'; b.shot = null; b.z = Math.min(z, 30); }
      return;
    }
    if (z > B.in) return this.ironOut(net, yc, shot, true);
    const bardown = z > B.lo;
    const g = this.goalies[net.i];
    if (!bardown && g.state === 'play') {
      const G = CONFIG.goalie;
      if (Math.abs(yc - g.pos.y) <= G.coverW / 2 && z <= G.coverH) return this.resolveSave(g, shot);
    }
    this.goalScored(net, bardown, shot);
  }

  ironOut(net, yc, shot, isBar) {
    const b = this.ball;
    this.resetShotClockOnNet(shot);
    b.state = 'loose'; b.shot = null;
    b.pos.x = net.x + net.f * 11;
    b.pos.y = yc;
    b.syncPrev();
    const sp = Math.max(190, Math.hypot(b.vel.x, b.vel.y) * 0.38);
    const a = Math.atan2(this.rng.range(-0.8, 0.8), net.f);
    b.vel.x = Math.cos(a) * sp;
    b.vel.y = Math.sin(a) * sp;
    b.z = Math.min(b.z, CONFIG.bar.hi - 2);
    b.vz = this.rng.range(40, 150); // pinged balls hop
    AudioSys.post();
    Effects.addShake(3.5);
    Effects.burst(net.x, yc, { n: 8, color: '#e8eef5', spd: 170, life: 0.35 });
  }

  resolveSave(g, shot) {
    const b = this.ball;
    this.resetShotClockOnNet(shot);
    this.stats.saves[g.team]++;
    g.savePose = 0.55;
    g.saveSide = (b.pos.y - g.pos.y) >= 0 ? 1 : -1;
    const net = this.defendNet(g.team);
    const catches = b.state !== 'shot' || this.rng.chance(CONFIG.shot.catchChance);
    if (catches) {
      b.hold(g);
    } else {
      // rebound must escape the crease or the goalie just re-scoops it forever
      const a = Math.atan2(this.rng.range(-1.0, 1.0), net.f);
      const sp = this.rng.range(CONFIG.shot.reboundSpeed[0], CONFIG.shot.reboundSpeed[1]);
      b.carrier = null; b.passTo = null; b.shot = null;
      b.state = 'loose';
      b.pos.x = g.pos.x + net.f * (g.r + 16);
      b.pos.y = g.pos.y + this.rng.range(-10, 10);
      b.syncPrev();
      b.vel.x = Math.cos(a) * sp;
      b.vel.y = Math.sin(a) * sp;
      b.z = this.rng.range(2, 12);
      b.vz = this.rng.range(90, 240); // rebounds kick up off the pads
      b.lastTouch = g; b.lastTouchTeam = g.team;
      g.scoopCd = 0.8;
    }
    if (shot) {
      const big = shot.special || shot.speed > 1050;
      AudioSys.denied();
      Effects.burst(g.pos.x, g.pos.y, { n: 10, color: '#ffffff', spd: 180, life: 0.4 });
      if (big) Effects.announce(this.rng.chance(0.5) ? 'bigsave' : 'save', { size: 44, color: '#7fd0ff', life: 1.0 });
      else if (this.rng.chance(0.25)) Effects.announce('save', { size: 38, color: '#7fd0ff', life: 0.85 });
    }
  }

  resetShotClockOnNet(shot) {
    if (shot && this.possession === shot.team) {
      this.shotClock = CONFIG.clockCfg.shotClock;
      this.lastBeep = -1;
    }
  }

  goalScored(net, bardown, shot) {
    const b = this.ball;
    const team = 1 - net.i;
    // crease violation: released from inside, or any attacker STANDING in the crease.
    // Bodies sliding in (down/diving) after a clean release are legal — dives stay legal.
    let waved = !!(shot && shot.creaseViolation);
    if (!waved) for (const p of this.teams[team]) {
      if (p.isGoalie || p.state !== 'play') continue;
      if (dist(p.pos.x, p.pos.y, net.x, net.cy) < CONFIG.crease.r - p.r * 0.5) { waved = true; break; }
    }
    if (waved) {
      Effects.announce('noGoal', { size: 52, color: '#ff5555', life: 1.8 });
      AudioSys.buzzer();
      Effects.flash(0.22);
      b.hold(this.goalies[net.i]);
      return;
    }
    this.score[team]++;
    if (bardown) this.stats.bardowns[team]++;
    const lead = this.score[team] - this.score[1 - team];
    if (lead > this.stats.biggestLead[team]) this.stats.biggestLead[team] = lead;
    this.unanswered[team]++;
    this.unanswered[1 - team] = 0;
    // NBA-Jam individual heat: the scorer builds a personal streak; opponents cool off
    if (this.fireEnabled) {
      const F = CONFIG.fire, scorer = shot && shot.shooter;
      for (const p of this.teams[1 - team]) { p.heat = 0; p.onFire = false; }
      if (scorer && scorer.team === team) {
        scorer.heat++;
        if (!scorer.onFire && scorer.heat >= F.onFire) {
          scorer.onFire = true;
          AudioSys.riser();
          Effects.announce('fire', { size: 56, color: '#ff9930', life: 2.0 });
        } else if (scorer.heat === F.heatUp) {
          Effects.announce('heatup', { size: 44, color: '#ffb14a', life: 1.4, y: 250 });
        }
      }
    }
    if (this.fireEnabled) {
      if (this.fire[1 - team]) { this.fire[1 - team] = false; Effects.announce('fireout', { size: 30, y: 250, life: 1.0 }); }
      if (!this.fire[team] && this.unanswered[team] >= CONFIG.fire.unanswered) {
        this.fire[team] = true;
        this.stats.fires[team]++;
        AudioSys.riser();
        Effects.announce('fire', { size: 56, color: '#ff9930', life: 2.0 });
      }
    }
    if (this.specialsEnabled && bardown) {
      for (const p of this.teams[team]) p.turbo = CONFIG.player.turboMax;
    }
    const td = this.teamDefs[team];
    b.state = 'dead'; b.shot = null; b.carrier = null; b.passTo = null;
    b.pos.x = net.x - net.f * 10;
    b.pos.y = clamp(b.pos.y, net.cy - 30, net.cy + 30);
    b.vel.x = -net.f * 60; b.vel.y = 0;
    b.syncPrev();
    this.possession = -1;
    if (shot && shot.shooter && shot.shooter.isGoalie && shot.shooter.team === team) {
      AudioSys.bardown();
      Effects.announce('goalieGoal', { size: 64, color: '#ffd24a', life: 2.6 });
      Effects.addShake(12);
    } else if (bardown) {
      AudioSys.bardown();
      Effects.announce('bardown', { size: 66, color: '#ffd24a', life: 2.0 });
    } else if (shot && shot.special) {
      AudioSys.goalHorn();
      Effects.announce('special', { size: 62, color: '#ffd24a', life: 2.0 });
    } else {
      AudioSys.goalHorn();
      Effects.announce('goal', { size: 60, color: td.color, life: 1.8 });
    }
    // entering desperation territory
    if (this.rubberEnabled && this.score[team] - this.score[1 - team] === CONFIG.rubber.desperationAt)
      Effects.announce('desperation', { size: 44, color: '#ff5555', life: 2.0, y: 380 });
    Effects.burst(net.x, net.cy, { n: 42, color: td.color, spd: 400, life: 0.9, size: 4 });
    Effects.burst(net.x, net.cy, { n: 20, color: '#ffffff', spd: 250, life: 0.7 });
    Effects.addShake(9);
    Effects.flash(0.3);
    Effects.punch(0.05);
    Effects.slowmo(0.4, 0.35);
    if (this.powerPlay && this.powerPlay.team === team) this.endPowerPlay();
    if (this.ot) this.pendingGameOver = true;
    this.state = 'goal';
    this.stateT = 0;
  }

  shotClockViolation() {
    AudioSys.whistle();
    Effects.announce('shotclock', { size: 44, color: '#ffcc44', life: 1.3 });
    const t = this.possession, other = 1 - t;
    const b = this.ball;
    let best = null, bd = 1e9;
    for (const p of this.teams[other]) {
      if (p.isGoalie || p.state !== 'play') continue;
      const d = dist(p.pos.x, p.pos.y, b.pos.x, b.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) b.attach(best);
    else { b.drop(0, 0); this.shotClock = CONFIG.clockCfg.shotClock; this.possession = other; }
  }

  endQuarter() {
    AudioSys.buzzer();
    this.clock = 0;
    if (this.quarter >= CONFIG.clockCfg.quarters) {
      if (this.otEnabled && this.score[0] === this.score[1]) {
        this.ot = true;
        this.quarter++;
        this.clock = CONFIG.clockCfg.quarterLen * 10; // effectively untimed: next goal wins
        Effects.announce('ot', { size: 50, color: '#ffd24a', life: 2.5 });
        this.setupFaceoff();
      } else this.endGame();
    } else {
      Effects.popup('END OF Q' + this.quarter, { size: 48, life: 1.6 });
      this.state = 'break';
      this.stateT = 0;
    }
  }

  endGame() {
    this.over = true;
    this.state = 'over';
    const w = this.score[0] === this.score[1] ? -1 : (this.score[0] > this.score[1] ? 0 : 1);
    this.winner = w;
    Effects.popup('FINAL', { size: 64, color: '#ffffff', life: 3.0 });
    AudioSys.buzzer();
  }
}
