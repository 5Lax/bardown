// Intent-driven entities: AI or Input fills p.intent each step; update() consumes it.
class Player {
  constructor(game, team, idx, isGoalie) {
    this.game = game; this.team = team; this.idx = idx; this.isGoalie = !!isGoalie;
    this.teamDef = game.teamDefs[team];
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
    this.catchTime = -99; this.lastAim = null; this.controlled = false;
    this.ai = { decideT: 0, spot: null, cutT: 0, cutting: 0, plan: 'drive', chargeAim: 0, wantCharge: 0.7, holdT: 0 };
    this.resetIntent();
  }
  resetIntent() {
    this.intent = { mx: 0, my: 0, aim: null, turbo: false, pass: false, passTo: null, shootHold: false, hit: false, jump: false, tackle: false };
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
          g.applyHit(this, v, CONFIG.tackle.power * this.teamDef.pwr, { tackle: true });
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

    // movement
    let maxSpd = P.maxSpeed * this.teamDef.spd * mods.speed * (mods.onFire ? CONFIG.fire.speed : 1);
    let accel = P.accel;
    if (this.charging) maxSpd *= P.chargeSlow;
    if (this.hasBall) maxSpd *= P.carrySlow;
    if (this.isGoalie) { maxSpd *= 0.82; }
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
        else if (!this.charging) g.tryPass(this, it.passTo);
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
  constructor(game, team) { super(game, team, 5, true); this.holdT = 0; this.manual = false; }
  update(dt) {
    super.update(dt);
    if (this.state !== 'play') return;
    // tethered to the crease (even under manual control)
    const net = this.game.defendNet(this.team), G = CONFIG.goalie;
    const d = dist(this.pos.x, this.pos.y, net.x, net.cy);
    if (d > G.roamR) {
      const n = norm(this.pos.x - net.x, this.pos.y - net.cy);
      this.pos.x = net.x + n.x * G.roamR;
      this.pos.y = net.cy + n.y * G.roamR;
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
  }
  syncPrev() { this.prev.x = this.pos.x; this.prev.y = this.pos.y; }

  attach(p) {
    this.state = 'carried'; this.carrier = p; this.passTo = null; this.shot = null;
    this.z = 10; this.vel.x = 0; this.vel.y = 0;
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
  drop(vx, vy) {
    this.carrier = null; this.passTo = null; this.shot = null;
    this.state = 'loose';
    this.vel.x = vx; this.vel.y = vy;
  }
  launchPass(from, to, lead) {
    const S = CONFIG.pass;
    this.carrier = null; this.state = 'pass';
    this.passTo = to; this.passTeam = from.team;
    this.lastTouchTeam = from.team; this.lastTouch = from;
    const d = norm(lead.x - this.pos.x, lead.y - this.pos.y);
    this.vel.x = d.x * S.speed; this.vel.y = d.y * S.speed;
    this.z = 12;
  }
  launchShot(shooter, netIdx, ty, tz, speed, special, quick) {
    const net = CONFIG.goals[netIdx];
    this.carrier = null; this.passTo = null;
    this.state = 'shot';
    this.lastTouchTeam = shooter.team; this.lastTouch = shooter;
    const d = norm(net.x - this.pos.x, ty - this.pos.y);
    this.vel.x = d.x * speed; this.vel.y = d.y * speed;
    const total = Math.max(20, dist(this.pos.x, this.pos.y, net.x, ty));
    this.shot = { net: netIdx, ty, tz, z0: CONFIG.shot.z0, total, traveled: 0, speed, special: special || null, quick: !!quick, team: shooter.team, shooter };
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
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.vel.x = damp(this.vel.x, 0.9, dt);
        this.vel.y = damp(this.vel.y, 0.9, dt);
        this.z = damp(this.z, 8, dt);
        if (collideBoards(this.pos, this.vel, 7, CONFIG.rink.restitution) > 150) AudioSys.thud(0.5);
        break;
      }
      case 'pass': {
        const t = this.passTo, S = CONFIG.pass;
        if (!t || (t.state !== 'play' && t.state !== 'diving')) {
          this.state = 'loose'; this.passTo = null; break;
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
        if (dd < S.catchR) {
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
        if (s.traveled > s.total + CONFIG.shot.maxRange) { this.state = 'loose'; this.shot = null; this.z = 0; }
        if (collideBoards(this.pos, this.vel, 7, CONFIG.rink.restitution) > 0) {
          this.state = 'loose'; this.shot = null; this.z = Math.min(this.z, 20);
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
