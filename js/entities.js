// Per-position archetypes so each runner feels distinct (multipliers on team base ratings).
// idx 0..4 = sniper, playmaker, enforcer, two-way, speedster. spd=run, pwr=hit, sht=shoot,
// pass=feed speed, hands=stickwork (carry speed + fumble resistance).
const ARCHETYPES = [
  { role: 'SNP', spd: 0.98, pwr: 0.92, sht: 1.15, pass: 1.00, hands: 1.06 },
  { role: 'PLY', spd: 1.03, pwr: 0.90, sht: 1.00, pass: 1.15, hands: 1.14 },
  { role: 'ENF', spd: 0.93, pwr: 1.17, sht: 0.93, pass: 0.95, hands: 0.94 },
  { role: 'TWO', spd: 1.00, pwr: 1.05, sht: 1.03, pass: 1.00, hands: 1.00 },
  { role: 'SPD', spd: 1.15, pwr: 0.95, sht: 0.98, pass: 1.00, hands: 1.08 },
];

// Intent-driven entities: AI or Input fills p.intent each step; update() consumes it.
class Player {
  constructor(game, team, idx, isGoalie) {
    this.game = game; this.team = team; this.idx = idx; this.isGoalie = !!isGoalie;
    this.teamDef = game.teamDefs[team];
    this.ratings = this.rollRatings(team, idx, this.isGoalie);
    const P = CONFIG.player, G = CONFIG.goalie;
    this.r = this.isGoalie ? G.r : P.r;
    this.mass = this.isGoalie ? G.mass : 1;
    this.pos = { x: 0, y: 0 }; this.vel = { x: 0, y: 0 };
    this.facing = team === 0 ? 0 : Math.PI;
    this.state = 'play';            // play | down | diving | benched
    this.turbo = P.turboMax; this.turboActive = false;
    this.jumpZ = 0; this.jumpVz = 0;
    this.charge = 0; this.charging = false; this.pendingSpecial = null;
    this.hitCd = 0; this.scoopCd = 0; this.knockT = 0; this.diveT = 0; this.benchT = 0;
    this.tackleT = 0; this.tackleCd = 0;
    this.spinT = 0; this.spinCd = 0; this.staggerT = 0;
    this.catchTime = -99; this.lastAim = null; this.controlled = false;
    this.scoopAnim = 0; this.catchAnim = 0;
    this.heat = 0; this.onFire = false; // NBA-Jam personal hot streak
    this.oneTimerArmed = false;         // holding shoot as a pass arrives = instant one-timer
    this.ai = { decideT: 0, spot: null, cutT: 0, cutting: 0, plan: 'drive', chargeAim: 0, wantCharge: 0.7, holdT: 0 };
    this.resetIntent();
  }
  // deterministic per-player ratings (no game.rng, so the sim stays reproducible)
  rollRatings(team, idx, isGoalie) {
    if (isGoalie) return { role: 'GK', spd: 1, pwr: 1, sht: 1, pass: 1, hands: 1 };
    const a = ARCHETYPES[idx % 5];
    const jit = (salt) => { const h = Math.sin((team * 131 + idx * 977 + salt * 53 + 7) * 12.9898) * 43758.5453; return (h - Math.floor(h) - 0.5) * 0.07; };
    return { role: a.role, spd: a.spd + jit(1), pwr: a.pwr + jit(2), sht: a.sht + jit(3), pass: a.pass + jit(4) * 0.6, hands: a.hands + jit(5) * 0.6 };
  }

  resetIntent() {
    this.intent = { mx: 0, my: 0, aim: null, turbo: false, pass: false, passTo: null, passLob: false, shootHold: false, hit: false, jump: false, tackle: false, spin: false };
  }
  get hasBall() { return this.game.ball.carrier === this; }

  knockDown(dx, dy, power) {
    if (this.state === 'benched') return;
    const H = CONFIG.hit;
    this.state = 'down';
    this.knockT = H.knockTime * (0.75 + power * 0.45);
    const n = norm(dx, dy);
    this.vel.x = n.x * H.slide * power;
    this.vel.y = n.y * H.slide * power;
    this.charging = false; this.charge = 0; this.pendingSpecial = null;
    this.turboActive = false;
  }

  update(dt) {
    const P = CONFIG.player, g = this.game, mods = g.getMods(this.team);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.scoopCd = Math.max(0, this.scoopCd - dt);
    this.tackleCd = Math.max(0, this.tackleCd - dt);
    this.scoopAnim = Math.max(0, this.scoopAnim - dt);
    this.catchAnim = Math.max(0, this.catchAnim - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);

    if (this.state === 'benched') { this.vel.x = this.vel.y = 0; return; }

    if (this.state === 'down') {
      this.knockT -= dt;
      this.vel.x = damp(this.vel.x, 3.2, dt); this.vel.y = damp(this.vel.y, 3.2, dt);
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt;
      collideBoards(this.pos, this.vel, this.r, 0.4);
      if (this.knockT <= 0) { this.state = 'play'; this.scoopCd = Math.max(this.scoopCd, 0.15); }
      return;
    }

    if (this.state === 'diving') {
      this.diveT -= dt;
      this.vel.x = damp(this.vel.x, 1.8, dt); this.vel.y = damp(this.vel.y, 1.8, dt);
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt;
      collideBoards(this.pos, this.vel, this.r, 0.4);
      if (!this.diveReleased && this.hasBall && this.diveT < CONFIG.special.diveTime - 0.16) {
        this.diveReleased = true;
        g.fireShot(this, 0.85, 'dive');
      }
      if (this.diveT <= 0) { this.state = 'down'; this.knockT = 0.45; }
      return;
    }

    if (this.state === 'tackling') {
      this.tackleT -= dt;
      this.vel.x = damp(this.vel.x, 1.1, dt); this.vel.y = damp(this.vel.y, 1.1, dt);
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt;
      collideBoards(this.pos, this.vel, this.r, 0.4);
      for (const v of g.players) {
        if (v.team === this.team || v.state !== 'play' || v.jumpZ > CONFIG.jump.dodgeZ) continue;
        if (dist(this.pos.x, this.pos.y, v.pos.x, v.pos.y) < this.r + v.r + 6) {
          g.applyHit(this, v, CONFIG.tackle.power * this.teamDef.pwr * this.ratings.pwr, { tackle: true });
          this.tackleT = Math.min(this.tackleT, 0.1);
          break;
        }
      }
      if (this.tackleT <= 0) { this.state = 'down'; this.knockT = CONFIG.tackle.selfDown; }
      return;
    }

    const it = this.intent;
    if (it.aim) this.lastAim = it.aim;
    const moving = Math.hypot(it.mx, it.my) > 0.1;

    // always-turbo: everyone runs hot; turboActive just flags "at sprint" for hits/trails/dives
    this.turboActive = Math.hypot(this.vel.x, this.vel.y) > P.maxSpeed * 0.7;

    // jump: hop checks, jump shots. Goalies stay grounded.
    if (it.jump && !this.isGoalie && this.jumpZ <= 0 && this.jumpVz === 0) {
      this.jumpVz = CONFIG.jump.v0;
      AudioSys.jumpSfx();
    }
    if (this.jumpZ > 0 || this.jumpVz !== 0) {
      this.jumpZ += this.jumpVz * dt;
      this.jumpVz -= CONFIG.jump.grav * dt;
      if (this.jumpZ <= 0) {
        this.jumpZ = 0; this.jumpVz = 0;
        Effects.burst(this.pos.x, this.pos.y, { n: 4, color: '#cfd6cf', spd: 90, life: 0.3, size: 2 });
      }
    }

    // spin dodge: slip through contact for a beat (tackles still get you)
    if (it.spin && this.hasBall && this.spinCd <= 0 && this.state === 'play'
        && Math.hypot(this.vel.x, this.vel.y) > CONFIG.spin.minSpeed) {
      this.spinT = CONFIG.spin.time;
      this.spinCd = CONFIG.spin.cd;
      this.vel.x *= CONFIG.spin.boost;
      this.vel.y *= CONFIG.spin.boost;
      AudioSys.jumpSfx();
    }

    // movement — per-player speed rating folds into the team base
    let maxSpd = P.maxSpeed * this.teamDef.spd * this.ratings.spd * mods.speed * (mods.onFire ? CONFIG.fire.speed : 1);
    let accel = P.accel * (0.85 + this.ratings.spd * 0.15);
    if (this.staggerT > 0) { accel *= 0.45; maxSpd *= 0.75; } // bodied: legs gone for a beat
    if (this.charging) maxSpd *= P.chargeSlow;
    if (this.hasBall) maxSpd *= P.carrySlow * this.ratings.hands; // good hands carry faster
    if (this.isGoalie) maxSpd = CONFIG.goalie.reflexSpeed; // the real save-or-goal dial
    this.vel.x += it.mx * accel * dt;
    this.vel.y += it.my * accel * dt;
    this.vel.x = damp(this.vel.x, P.frict, dt);
    this.vel.y = damp(this.vel.y, P.frict, dt);
    const spd = Math.hypot(this.vel.x, this.vel.y);
    if (spd > maxSpd) { this.vel.x *= maxSpd / spd; this.vel.y *= maxSpd / spd; }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // facing: aim wins, else movement
    if (it.aim && Math.hypot(it.aim.x, it.aim.y) > 0.01) this.facing = Math.atan2(it.aim.y, it.aim.x);
    else if (moving) this.facing = Math.atan2(this.vel.y, this.vel.x);

    // actions
    if (this.hasBall) {
      // ONE-TIMER: you were holding shoot as the pass arrived → rip it the instant you catch
      if (this.oneTimerArmed && (g.time - this.catchTime) < 0.16) {
        this.oneTimerArmed = false;
        this.charging = false; this.charge = 0;
        g.fireShot(this, 0.55, null);
        this.resetIntent();
        return;
      }
      this.oneTimerArmed = false;
      if (it.shootHold) {
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt / CONFIG.shot.chargeTime);
      } else if (this.charging) {
        let special = this.pendingSpecial;
        if (!special && this.jumpZ > CONFIG.jump.dodgeZ) special = 'jump';
        const sp = Math.hypot(this.vel.x, this.vel.y);
        if (!special && g.specialsEnabled && this.jumpZ === 0 && sp > CONFIG.player.maxSpeed * 0.72 && g.startDive(this)) {
          // sprinting release at the crease turns into a dive — startDive fires the shot mid-air
        } else {
          g.fireShot(this, Math.max(0.25, this.charge), special);
        }
        this.charging = false; this.charge = 0; this.pendingSpecial = null;
      }
      if (it.pass) {
        if (this.charging && g.specialsEnabled) { this.pendingSpecial = 'btb'; }
        else if (!this.charging) g.tryPass(this, it.passTo, it.passLob);
      }
      if (it.hit && this.charging && g.specialsEnabled)
        this.pendingSpecial = Math.hypot(this.vel.x, this.vel.y) > 100 ? 'btb' : 'btl';
    } else {
      this.charging = false; this.charge = 0;
    }
    if (it.tackle && !this.hasBall && g.hitsEnabled) this.startTackle();
    else if (it.hit && !this.hasBall && g.hitsEnabled) this.tryHit();
    else if (it.hit && this.hasBall && !this.charging && g.hitsEnabled) this.tryHit(); // ball-carrier can throw shoulders too

    // boards, nets, crease
    if (collideBoards(this.pos, this.vel, this.r, 0.35) > 240) Effects.addShake(2);
    for (const box of g.netBoxes) collideAABB(this.pos, this.vel, this.r, box, 0.2);
    if (!this.isGoalie && this.state === 'play') {
      const net = g.attackNet(this.team);
      const d = dist(this.pos.x, this.pos.y, net.x, net.cy), lim = CONFIG.crease.r + this.r * 0.4;
      if (d < lim) {
        const n = norm(this.pos.x - net.x, this.pos.y - net.cy);
        this.pos.x = net.x + n.x * lim;
        this.pos.y = net.cy + n.y * lim;
        const vn = this.vel.x * n.x + this.vel.y * n.y;
        if (vn < 0) { this.vel.x -= vn * n.x; this.vel.y -= vn * n.y; }
      }
    }
    this.resetIntent();
  }

  startTackle() {
    const T = CONFIG.tackle;
    if (this.state !== 'play' || this.tackleCd > 0 || this.jumpZ > CONFIG.jump.dodgeZ || this.isGoalie) return;
    this.state = 'tackling';
    this.tackleT = T.time;
    this.tackleCd = T.cd;
    this.charging = false; this.charge = 0;
    const it = this.intent;
    // launch where you're aiming first, else where you're running, else where you face
    let dir;
    if (it.aim && Math.hypot(it.aim.x, it.aim.y) > 0.01) dir = norm(it.aim.x, it.aim.y);
    else if (Math.hypot(it.mx, it.my) > 0.2) dir = norm(it.mx, it.my);
    else dir = { x: Math.cos(this.facing), y: Math.sin(this.facing) };
    this.facing = Math.atan2(dir.y, dir.x);
    this.vel.x = this.vel.x * 0.3 + dir.x * T.speed;
    this.vel.y = this.vel.y * 0.3 + dir.y * T.speed;
    AudioSys.jumpSfx();
  }

  tryHit() {
    const g = this.game, H = CONFIG.hit;
    if (this.hitCd > 0 || this.state !== 'play' || this.jumpZ > CONFIG.jump.dodgeZ) return;
    this.hitCd = H.cooldown;
    // lunge
    const f = this.facing;
    const boost = this.turboActive ? 1.25 : 1;
    this.vel.x += Math.cos(f) * H.lunge * boost;
    this.vel.y += Math.sin(f) * H.lunge * boost;
    g.registerHit(this);
  }
}

class Goalie extends Player {
  constructor(game, team) {
    super(game, team, 5, true);
    this.holdT = 0; this.manual = false; this.savePose = 0; this.saveSide = 1;
    this.retrieving = false;
  }
  update(dt) {
    this.savePose = Math.max(0, this.savePose - dt);
    super.update(dt);
    if (this.state !== 'play') return;
    // soft tether: AI goalies get pulled home (longer leash while retrieving a loose
    // ball); a manually-controlled goalie can wander the whole floor — his net is open.
    if (this.manual) return;
    const net = this.game.defendNet(this.team), G = CONFIG.goalie;
    const lim = this.retrieving ? G.retrieveR : G.roamR;
    const d = dist(this.pos.x, this.pos.y, net.x, net.cy);
    if (d > lim) {
      const n = norm(this.pos.x - net.x, this.pos.y - net.cy);
      const pull = Math.min(d - lim, 260 * dt);
      this.pos.x -= n.x * pull;
      this.pos.y -= n.y * pull;
    }
  }
}

class Ball {
  constructor(game) {
    this.game = game;
    this.pos = { x: CONFIG.center.x, y: CONFIG.center.y };
    this.prev = { x: this.pos.x, y: this.pos.y };
    this.vel = { x: 0, y: 0 };
    this.z = 0;
    this.state = 'loose'; // loose | carried | pass | shot | held | dead
    this.carrier = null; this.passTo = null; this.passTeam = -1;
    this.shot = null; this.lastTouchTeam = -1; this.lastTouch = null;
    this.lob = false; this.bounce = false; this.passT = 0; this.lobT = 0.3;
    this.lobPeak = 46;
    this.vz = 0;
  }
  syncPrev() { this.prev.x = this.pos.x; this.prev.y = this.pos.y; }

  attach(p) {
    // how he gathers it: low ball = scoop off the turf, high ball = snag out of the air
    if (this.state === 'loose') {
      if (this.z < CONFIG.ballPhys.scoopZ) p.scoopAnim = 0.25; else p.catchAnim = 0.22;
    } else if (this.state === 'pass' && this.z > 24) p.catchAnim = 0.22;
    this.state = 'carried'; this.carrier = p; this.passTo = null; this.shot = null;
    this.z = 10; this.vz = 0; this.vel.x = 0; this.vel.y = 0;
    this.lastTouchTeam = p.team; this.lastTouch = p;
    p.catchTime = this.game.time;
    this.game.onPossession(p);
  }
  hold(goalie) {
    this.state = 'held'; this.carrier = goalie; this.passTo = null; this.shot = null;
    this.z = 12; this.vel.x = 0; this.vel.y = 0;
    this.lastTouchTeam = goalie.team; this.lastTouch = goalie;
    goalie.holdT = 0;
    this.game.onPossession(goalie);
  }
  drop(vx, vy, vz) {
    this.carrier = null; this.passTo = null; this.shot = null;
    this.state = 'loose';
    this.vel.x = vx; this.vel.y = vy;
    if (vz !== undefined) this.vz = vz;
  }
  launchPass(from, to, lead, bounce) {
    const S = CONFIG.pass;
    this.carrier = null; this.state = 'pass';
    this.passTo = to; this.passTeam = from.team;
    this.lastTouchTeam = from.team; this.lastTouch = from;
    const dir = norm(lead.x - this.pos.x, lead.y - this.pos.y);
    const dd = dist(this.pos.x, this.pos.y, lead.x, lead.y);
    const ps = S.speed * (from.ratings ? from.ratings.pass : 1); // crisper feeds from playmakers
    this.vel.x = dir.x * ps; this.vel.y = dir.y * ps;
    this.z = 12;
    this.passT = 0;
    this.lobT = Math.max(0.25, dd / ps);
    this.bounce = !!bounce && !from.isGoalie;
    if (this.bounce) {
      // skip pass: low launch, gravity bounces it to the target under raised sticks
      this.lob = false;
      this.vz = 40;
    } else {
      // arc height scales with throw distance; goalies rainbow it even higher
      this.lob = true;
      this.lobPeak = from.isGoalie
        ? Math.min(S.arcGoalieMax, Math.max(95, dd * S.arcGoalie))
        : clamp(dd * S.arcPerDist, S.arcMin, S.arcMax);
    }
  }
  launchShot(shooter, netIdx, ty, tz, speed, special, quick) {
    const net = CONFIG.goals[netIdx];
    this.carrier = null; this.passTo = null;
    this.state = 'shot';
    this.lastTouchTeam = shooter.team; this.lastTouch = shooter;
    const d = norm(net.x - this.pos.x, ty - this.pos.y);
    this.vel.x = d.x * speed; this.vel.y = d.y * speed;
    const total = Math.max(20, dist(this.pos.x, this.pos.y, net.x, ty));
    this.shot = { net: netIdx, ty, tz, z0: CONFIG.shot.z0, total, traveled: 0, speed, special: special || null, quick: !!quick, team: shooter.team, shooter, t0: this.game.time };
    this.z = CONFIG.shot.z0;
  }

  update(dt) {
    const g = this.game;
    this.syncPrev();
    switch (this.state) {
      case 'carried': case 'held': {
        const c = this.carrier;
        if (!c || c.state === 'benched') { this.drop(0, 0); break; }
        const off = c.r + 8;
        this.pos.x = c.pos.x + Math.cos(c.facing) * off;
        this.pos.y = c.pos.y + Math.sin(c.facing) * off;
        this.z = 10;
        this.syncPrev();
        break;
      }
      case 'loose': {
        // a real india-rubber ball: it drops, bounces hard, and skitters with low friction
        const BP = CONFIG.ballPhys;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.vel.x = damp(this.vel.x, BP.roll, dt);
        this.vel.y = damp(this.vel.y, BP.roll, dt);
        this.z += this.vz * dt;
        this.vz -= BP.grav * dt;
        if (this.z <= 0) {
          this.z = 0;
          if (this.vz < -BP.deadVz) {
            this.vz = -this.vz * BP.bounce;
            AudioSys.bounce(Math.min(1, this.vz / 300));
          } else this.vz = 0;
        }
        if (collideBoards(this.pos, this.vel, 7, CONFIG.rink.restitution) > 150) AudioSys.thud(0.5);
        break;
      }
      case 'pass': {
        const t = this.passTo, S = CONFIG.pass;
        if (!t || (t.state !== 'play' && t.state !== 'diving')) {
          this.state = 'loose'; this.passTo = null; break;
        }
        this.passT += dt;
        if (this.bounce) {
          // gravity skip — homes horizontally while bouncing off the floor
          this.z += this.vz * dt;
          this.vz -= CONFIG.ballPhys.grav * dt;
          if (this.z <= 0) { this.z = 0; if (this.vz < -40) { this.vz = -this.vz * 0.55; AudioSys.bounce(0.4); } else this.vz = 0; }
        } else {
          this.z = 12 + Math.sin(clamp(this.passT / this.lobT, 0, 1) * Math.PI) * (this.lobPeak || 46);
        }
        const dd = dist(this.pos.x, this.pos.y, t.pos.x, t.pos.y);
        const lead = {
          x: t.pos.x + t.vel.x * S.lead * (dd / S.speed),
          y: t.pos.y + t.vel.y * S.lead * (dd / S.speed),
        };
        const want = norm(lead.x - this.pos.x, lead.y - this.pos.y);
        const k = Math.min(1, S.homing * dt);
        this.vel.x += (want.x * S.speed - this.vel.x) * k;
        this.vel.y += (want.y * S.speed - this.vel.y) * k;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        collideBoards(this.pos, this.vel, 7, CONFIG.rink.restitution);
        const catchable = this.bounce ? this.z < 30
          : (this.z < S.lobSafeZ || this.passT > this.lobT * 0.85);
        if (dd < S.catchR && catchable) {
          this.attach(t);
          AudioSys.catchBall();
        }
        break;
      }
      case 'shot': {
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        const s = this.shot;
        s.traveled += s.speed * dt;
        this.z = lerp(s.z0, s.tz, clamp(s.traveled / s.total, 0, 1));
        Effects.trail(this.pos.x, this.pos.y, '#ffb14a', 4);
        if (s.traveled > s.total + CONFIG.shot.maxRange) { this.state = 'loose'; this.shot = null; this.vz = -40; }
        if (collideBoards(this.pos, this.vel, 7, CONFIG.rink.restitution) > 0) {
          this.state = 'loose'; this.shot = null; this.vz = this.z > 18 ? -30 : 60;
        }
        break;
      }
      case 'dead': {
        this.vel.x = damp(this.vel.x, 9, dt);
        this.vel.y = damp(this.vel.y, 9, dt);
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.z = damp(this.z, 10, dt);
        break;
      }
    }
  }
}
