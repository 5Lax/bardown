// CPU brains. Discrete decisions tick on p.ai.decideT (reaction-scaled);
// steering recomputes every step. All randomness via game.rng (deterministic).
const AI = {
  // offensive slots relative to the attacked net (f = into-rink direction)
  slots(net) {
    const f = net.f, cy = net.cy;
    return [
      { x: net.x + f * 335, y: cy },        // point
      { x: net.x + f * 250, y: cy - 168 },  // wing L
      { x: net.x + f * 250, y: cy + 168 },  // wing R
      { x: net.x + f * 148, y: cy - 76 },   // crease L
      { x: net.x + f * 148, y: cy + 76 },   // crease R
    ];
  },

  update(game, dt) {
    for (let t = 0; t < 2; t++) {
      const onBall = this.onBallDefender(game, t);
      for (const p of game.teams[t]) {
        if (p.controlled || p.state !== 'play') continue;
        p.ai.decideT -= dt;
        const tick = p.ai.decideT <= 0;
        if (tick) p.ai.decideT = CONFIG.ai.decide + game.aiReaction(t) + game.rng.range(0, 0.05);
        if (p.isGoalie) this.goalie(game, p, dt, tick);
        else this.runner(game, p, dt, tick, onBall);
      }
    }
  },

  onBallDefender(game, team) {
    const c = game.ball.carrier;
    if (!c || c.team === team) return null;
    let best = null, bd = 1e9;
    for (const p of game.teams[team]) {
      if (p.isGoalie || p.state !== 'play') continue;
      const d = dist(p.pos.x, p.pos.y, c.pos.x, c.pos.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  },

  moveTo(p, x, y, sprint) {
    const dx = x - p.pos.x, dy = y - p.pos.y, d = Math.hypot(dx, dy);
    if (d < 6) return;
    const s = Math.min(1, d / 40);
    p.intent.mx = dx / d * s;
    p.intent.my = dy / d * s;
    if (sprint && p.game.turboEnabled && p.turbo > CONFIG.ai.turboUseAt) p.intent.turbo = true;
  },

  openness(game, mate) {
    let m = 1e9;
    for (const o of game.teams[1 - mate.team]) {
      if (o.state !== 'play') continue;
      m = Math.min(m, dist(o.pos.x, o.pos.y, mate.pos.x, mate.pos.y));
    }
    return m;
  },

  runner(game, p, dt, tick, onBall) {
    const ball = game.ball, c = ball.carrier;
    const myBall = c && c.team === p.team;
    if (c === p) return this.carrier(game, p, dt, tick);
    if (ball.state === 'loose' || ball.state === 'pass' || ball.state === 'shot') {
      // two nearest runners chase a loose ball, rest keep shape
      if (ball.state === 'loose' && this.chaseRank(game, p) < CONFIG.ai.chasePair) {
        const lead = 0.25;
        return this.moveTo(p, ball.pos.x + ball.vel.x * lead, ball.pos.y + ball.vel.y * lead, true);
      }
    }
    if (myBall) this.offBall(game, p, dt, tick);
    else this.defense(game, p, dt, tick, onBall);
  },

  chaseRank(game, p) {
    const ball = game.ball;
    const d = dist(p.pos.x, p.pos.y, ball.pos.x, ball.pos.y);
    let rank = 0;
    for (const q of game.teams[p.team]) {
      if (q === p || q.isGoalie || q.state !== 'play') continue;
      if (dist(q.pos.x, q.pos.y, ball.pos.x, ball.pos.y) < d) rank++;
    }
    return rank;
  },

  carrier(game, p, dt, tick) {
    const A = CONFIG.ai, net = game.attackNet(p.team);
    const dNet = dist(p.pos.x, p.pos.y, net.x, net.cy);
    const front = ((p.pos.x - net.x) * net.f) / Math.max(1, dNet); // 1 = dead-on, <0 behind net
    p.intent.aim = { x: net.x - p.pos.x, y: net.cy - p.pos.y };

    // continue an in-progress windup
    if (p.ai.shooting) {
      p.intent.shootHold = p.charge < p.ai.wantCharge;
      p.intent.mx = p.intent.my = 0;
      if (!p.charging && p.charge === 0 && !p.intent.shootHold) p.ai.shooting = false;
      return;
    }

    // ONE-TIMER: fresh off a catch near the cage, rip it before the goalie re-sets
    if (game.time - p.catchTime < CONFIG.pass.quickWindow * 0.6 && dNet < 320 && front > 0.3) {
      p.ai.shooting = true;
      p.ai.wantCharge = 0.35;
      p.intent.shootHold = true;
      return;
    }

    if (tick) {
      const mods = game.getMods(p.team);
      // desperation dives (and the occasional showboat one)
      if (game.specialsEnabled && dNet < CONFIG.special.diveRange && front > 0.35) {
        const diveP = mods.desperation ? 0.3 : 0.025;
        if (game.rng.chance(diveP) && game.startDive(p, mods.desperation)) return;
      }
      const press = this.openness(game, p);
      // hop an incoming check when a defender is breathing on you
      if (press < 46 && p.jumpZ === 0 && game.rng.chance(0.16)) p.intent.jump = true;
      const q = (1 - dNet / 560) * 0.62
        + clamp(front, 0, 1) * 0.30
        - (press < 55 ? 0.18 : 0)
        + game.rng.range(-0.08, 0.08);
      const clockPanic = game.shotClock < A.forceShotAt;
      if ((q > A.shootQuality && dNet < A.shootRange && front > 0.2) || (clockPanic && front > 0)) {
        p.ai.shooting = true;
        p.ai.wantCharge = clockPanic ? 0.55 : game.rng.range(A.cpuChargeMin, A.cpuChargeMax);
        if (game.specialsEnabled && game.rng.chance(mods.desperation ? 0.55 : 0.08))
          p.pendingSpecial = game.rng.pick(['btb', 'btl']);
        p.intent.shootHold = true;
        return;
      }
      if (press < A.passPressure && !clockPanic) {
        let best = null, bs = -1e9;
        for (const m of game.teams[p.team]) {
          if (m === p || m.isGoalie || m.state !== 'play') continue;
          const open = this.openness(game, m);
          const mNet = dist(m.pos.x, m.pos.y, net.x, net.cy);
          let score = open * 1.0 - mNet * 0.25 + game.rng.range(0, 25);
          if (m.ai.cutting > 0) score += 70; // hit the roll man — that's the play
          if (open > A.openDist * 0.7 && score > bs) { bs = score; best = m; }
        }
        if (best && game.rng.chance(0.75)) {
          p.intent.pass = true;
          p.intent.passTo = best;
          p.intent.passLob = dist(p.pos.x, p.pos.y, best.pos.x, best.pos.y) > 340 && game.rng.chance(0.6);
          return;
        }
      }
      // re-plan drive arc
      p.ai.plan = game.rng.chance(0.7) ? 'drive' : 'orbit';
      p.ai.side = p.ai.side || game.rng.sign();
      if (game.rng.chance(0.25)) p.ai.side *= -1;
    }

    // movement: arc in toward the net mouth, weaving
    const urgency = game.shotClock < 7;
    const targetR = urgency ? CONFIG.crease.r + 55 : CONFIG.crease.r + (p.ai.plan === 'orbit' ? 150 : 75);
    const curA = Math.atan2(p.pos.y - net.cy, p.pos.x - net.x);
    const frontA = net.f > 0 ? 0 : Math.PI;
    let wantA = frontA + (p.ai.side || 1) * 0.55 + Math.sin(game.time * 2.1 + p.idx * 1.7) * 0.35;
    wantA = curA + angDiff(curA, wantA) * 0.4;
    this.moveTo(p, net.x + Math.cos(wantA) * targetR, net.cy + Math.sin(wantA) * targetR, urgency);
  },

  offBall(game, p, dt, tick) {
    const net = game.attackNet(p.team);
    const ball = game.ball;
    if (ball.state === 'pass' && ball.passTo === p) return this.moveTo(p, ball.pos.x, ball.pos.y, false);
    const A = CONFIG.ai;
    // pick-and-roll: plant a wall on the on-ball defender, then roll to the cage
    if (p.ai.picking > 0) {
      p.ai.picking -= dt;
      const def = this.onBallDefender(game, 1 - p.team);
      const c = game.ball.carrier;
      if (def && c) {
        const toC = norm(c.pos.x - def.pos.x, c.pos.y - def.pos.y);
        const px = def.pos.x + toC.x * (def.r + p.r + 2);
        const py = def.pos.y + toC.y * (def.r + p.r + 2);
        if (dist(p.pos.x, p.pos.y, px, py) > 14) this.moveTo(p, px, py, true);
        // close enough: STAND — being set IS the pick, the body-wall does the rest
      }
      if (p.ai.picking <= 0) { p.ai.cutting = A.cutTime; p.ai.cutY = game.rng.range(-50, 50); }
      return;
    }
    if (p.ai.cutting > 0) {
      p.ai.cutting -= dt;
      return this.moveTo(p, net.x + net.f * 95, net.cy + (p.ai.cutY || 0), true);
    }
    if (tick) {
      p.ai.cutT -= CONFIG.ai.decide;
      if (p.ai.cutT <= 0 && game.rng.chance(0.5)) {
        p.ai.cutT = game.rng.range(A.cutEvery[0], A.cutEvery[1]);
        p.ai.cutting = A.cutTime;
        p.ai.cutY = game.rng.range(-50, 50);
      }
      p.ai.pickT = (p.ai.pickT === undefined ? game.rng.range(2, 5) : p.ai.pickT) - CONFIG.ai.decide;
      if (p.ai.pickT <= 0) {
        p.ai.pickT = game.rng.range(A.pickEvery[0], A.pickEvery[1]);
        const def = this.onBallDefender(game, 1 - p.team);
        if (def && dist(p.pos.x, p.pos.y, def.pos.x, def.pos.y) < 280 && game.rng.chance(0.7)) {
          p.ai.picking = A.pickTime;
        }
      }
      const slot = this.slots(net)[p.idx % 5];
      p.ai.spot = { x: slot.x + game.rng.range(-22, 22), y: slot.y + game.rng.range(-22, 22) };
    }
    if (p.ai.spot) this.moveTo(p, p.ai.spot.x, p.ai.spot.y, false);
    p.intent.aim = { x: ball.pos.x - p.pos.x, y: ball.pos.y - p.pos.y };
  },

  defense(game, p, dt, tick, onBall) {
    const net = game.defendNet(p.team);
    const c = game.ball.carrier;
    const A = CONFIG.ai;
    if (c && p === onBall) {
      // press the carrier, stay goal-side
      const n = norm(net.x - c.pos.x, net.cy - c.pos.y);
      this.moveTo(p, c.pos.x + n.x * A.defGap, c.pos.y + n.y * A.defGap, true);
      p.intent.aim = { x: c.pos.x - p.pos.x, y: c.pos.y - p.pos.y };
      if (game.hitsEnabled && tick) {
        const d = dist(p.pos.x, p.pos.y, c.pos.x, c.pos.y);
        // the middle of the floor is a no-fly zone: defenders punish lane-drivers hardest
        const laneMult = Math.abs(c.pos.y - CONFIG.center.y) < 130 ? 1.6 : 1;
        if (d > 50 && d < 105 && p.tackleCd <= 0 && game.rng.chance(0.09 * game.aiAggro(p.team) * laneMult)) {
          p.intent.aim = { x: c.pos.x - p.pos.x, y: c.pos.y - p.pos.y };
          p.intent.tackle = true;
        } else if (d < A.hitRange + 14 && game.rng.chance(A.hitAggro * game.aiAggro(p.team) * laneMult)) p.intent.hit = true;
      }
      return;
    }
    // man up by jersey number, stay goal-side; sag to crease if mark is the carrier
    const marks = game.teams[1 - p.team];
    let mark = null;
    for (const m of marks) if (!m.isGoalie && m.state !== 'benched' && m.idx === p.idx) { mark = m; break; }
    if (!mark || mark === c) {
      this.moveTo(p, net.x + net.f * 120, net.cy + (p.idx - 2) * 38, false);
      return;
    }
    const n = norm(net.x - mark.pos.x, net.cy - mark.pos.y);
    this.moveTo(p, mark.pos.x + n.x * 26, mark.pos.y + n.y * 26, false);
    if (game.hitsEnabled && tick && !mark.isGoalie && mark.state === 'play') {
      const d = dist(p.pos.x, p.pos.y, mark.pos.x, mark.pos.y);
      if (d < A.hitRange && game.rng.chance(A.offBallAggro * game.aiAggro(p.team))) p.intent.hit = true;
    }
  },

  goalie(game, p, dt, tick) {
    const net = game.defendNet(p.team), G = CONFIG.goalie, ball = game.ball;
    if (ball.state === 'held' && ball.carrier === p) {
      p.holdT += dt;
      p.intent.aim = { x: net.f, y: 0 };
      // campers force a fast outlet; the lob (automatic for goalies) sails over them
      const pressured = this.openness(game, p) < 75;
      if (p.holdT > (pressured ? 0.3 : G.holdTime)) {
        let best = null, bs = -1e9;
        for (const m of game.teams[p.team]) {
          if (m === p || m.state !== 'play') continue;
          const dd = dist(p.pos.x, p.pos.y, m.pos.x, m.pos.y);
          const open = AI.openness(game, m);
          const fwd = (m.pos.x - p.pos.x) * net.f;
          const s = open + fwd * 0.35 - (dd < 130 ? 80 : 0);
          if (s > bs) { bs = s; best = m; }
        }
        if (best) game.tryPass(p, best);
      }
      return;
    }
    // loose ball in my crease: scoop it
    if (ball.state === 'loose' && dist(ball.pos.x, ball.pos.y, net.x, net.cy) < CONFIG.crease.r) {
      return this.moveTo(p, ball.pos.x, ball.pos.y, false);
    }
    // square up: arc position toward the ball, slide to predicted shot target
    let ty = ball.pos.y, tx = ball.pos.x;
    let reflex = 1;
    if (ball.state === 'shot' && ball.shot && ball.shot.net === game.netIndex(net)) {
      ty = ball.shot.ty; tx = net.x + net.f * 200;
      reflex = game.goalieReflex(p.team, ball.shot);
    }
    const a = clamp(Math.atan2(ty - net.cy, (tx - net.x) * net.f) , -0.95, 0.95);
    const gx = net.x + Math.cos(a) * G.arcR * net.f;
    const gy = net.cy + Math.sin(a) * G.arcR + clamp(ty - net.cy, -G.maxLateral, G.maxLateral) * 0.35;
    const dx = gx - p.pos.x, dy = gy - p.pos.y, d = Math.hypot(dx, dy);
    if (d > 2) {
      p.intent.mx = dx / d * Math.min(1, d / 14) * reflex;
      p.intent.my = dy / d * Math.min(1, d / 14) * reflex;
    }
    p.intent.aim = { x: ball.pos.x - p.pos.x, y: ball.pos.y - p.pos.y };
  },
};
