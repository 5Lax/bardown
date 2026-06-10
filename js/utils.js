const HAS_DOM = typeof document !== 'undefined';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const len = (x, y) => Math.hypot(x, y);

function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}
function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// frame-rate independent exponential damping
function damp(v, rate, dt) { return v * Math.exp(-rate * dt); }
function approach(v, target, maxDelta) {
  return v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
}
function fmtClock(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// seeded RNG (mulberry32) — all game-logic randomness goes through this
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

// keep a circle of radius r inside the rounded-rect rink; reflect velocity on contact.
// returns impact speed (0 = no contact) so callers can play board sounds / dust.
function collideBoards(pos, vel, r, rest) {
  const rk = CONFIG.rink, cr = rk.corner;
  const qx = clamp(pos.x, rk.x + cr, rk.x + rk.w - cr);
  const qy = clamp(pos.y, rk.y + cr, rk.y + rk.h - cr);
  let dx = pos.x - qx, dy = pos.y - qy;
  const d = Math.hypot(dx, dy), lim = cr - r;
  if (d <= lim) return 0;
  if (d < 1e-9) { dx = 1; dy = 0; }
  const nx = dx / (d || 1), ny = dy / (d || 1);
  pos.x = qx + nx * lim;
  pos.y = qy + ny * lim;
  const vn = vel.x * nx + vel.y * ny;
  if (vn > 0) {
    vel.x -= (1 + rest) * vn * nx;
    vel.y -= (1 + rest) * vn * ny;
    return vn;
  }
  return 0.01;
}

// push a circle out of an AABB (net boxes). returns true on contact.
function collideAABB(pos, vel, r, box, rest) {
  const cx = clamp(pos.x, box.x, box.x + box.w);
  const cy = clamp(pos.y, box.y, box.y + box.h);
  let dx = pos.x - cx, dy = pos.y - cy;
  let d = Math.hypot(dx, dy);
  if (d >= r) return false;
  if (d < 1e-9) { // center inside box: push out the nearest face
    const l = pos.x - box.x, rt = box.x + box.w - pos.x, tp = pos.y - box.y, bt = box.y + box.h - pos.y;
    const m = Math.min(l, rt, tp, bt);
    if (m === l) { dx = -1; dy = 0; } else if (m === rt) { dx = 1; dy = 0; }
    else if (m === tp) { dx = 0; dy = -1; } else { dx = 0; dy = 1; }
    d = 0;
  } else { dx /= d; dy /= d; }
  pos.x = cx + dx * r;
  pos.y = cy + dy * r;
  const vn = vel.x * dx + vel.y * dy;
  if (vn < 0) {
    vel.x -= (1 + rest) * vn * dx;
    vel.y -= (1 + rest) * vn * dy;
  }
  return true;
}
