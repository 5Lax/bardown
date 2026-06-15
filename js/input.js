// Keyboard + mouse + gamepad → named actions. `pressed()` auto-consumes so a
// press fires game logic exactly once even with multiple physics steps per frame.
const Input = {
  keys: Object.create(null),
  mouse: { x: CONFIG.center.x, y: CONFIG.center.y, down: false, rdown: false, lastMove: -1e9,
           mdown: false, mlx: 0, mly: 0, mdx: 0, mdy: 0, mdragged: false, wheel: 0, mClick: false },
  press: Object.create(null), // edge-triggered, consumed on read
  padIndex: null, pad: null, padPrev: Object.create(null),
  canvas: null, enabled: HAS_DOM,

  init(canvas) {
    if (!HAS_DOM) return;
    this.canvas = canvas;
    const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    window.addEventListener('keydown', e => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) { this.keys[e.code] = true; this.press[e.code] = true; AudioSys.init(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.down = this.mouse.rdown = false; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (CONFIG.canvas.w / r.width);
      this.mouse.y = (e.clientY - r.top) * (CONFIG.canvas.h / r.height);
      this.mouse.lastMove = performance.now();
      if (this.mouse.mdown) { // middle-drag orbits the camera
        this.mouse.mdx += e.clientX - this.mouse.mlx;
        this.mouse.mdy += e.clientY - this.mouse.mly;
        if (Math.abs(e.clientX - this.mouse.mlx) + Math.abs(e.clientY - this.mouse.mly) > 2) this.mouse.mdragged = true;
      }
      this.mouse.mlx = e.clientX; this.mouse.mly = e.clientY;
    });
    canvas.addEventListener('mousedown', e => {
      AudioSys.init();
      if (e.button === 0) { this.mouse.down = true; this.press.MouseL = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.press.MouseR = true; }
      if (e.button === 1) { this.mouse.mdown = true; this.mouse.mdragged = false; this.mouse.mlx = e.clientX; this.mouse.mly = e.clientY; e.preventDefault(); }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
      if (e.button === 1) { this.mouse.mdown = false; if (!this.mouse.mdragged) this.mouse.mClick = true; } // tap = reset view
    });
    canvas.addEventListener('wheel', e => { this.mouse.wheel += e.deltaY > 0 ? 1 : -1; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('gamepadconnected', e => { this.padIndex = e.gamepad.index; });
  },

  // call once per render frame, before physics steps
  update() {
    if (!HAS_DOM) return;
    // in 3D mode the mouse aims through the camera: raycast to rink coords
    this.mouse.rink = (typeof Render3D !== 'undefined' && Render3D.active)
      ? Render3D.mouseToRink(this.mouse.x, this.mouse.y) : null;
    this.pad = null;
    if (this.padIndex !== null && navigator.getGamepads) {
      const p = navigator.getGamepads()[this.padIndex];
      if (p && p.connected) this.pad = p;
    }
    if (this.pad) {
      for (const [name, btn] of Object.entries({ PadA: 0, PadB: 1, PadX: 2, PadY: 3, PadLB: 4, PadRB: 5, PadStart: 9, PadUp: 12 })) {
        const down = this.pad.buttons[btn] && this.pad.buttons[btn].pressed;
        if (down && !this.padPrev[name]) this.press[name] = true;
        this.padPrev[name] = down;
      }
    }
  },

  axis(n) { return this.pad && Math.abs(this.pad.axes[n] || 0) > 0.22 ? this.pad.axes[n] : 0; },
  padBtn(n) { return !!(this.pad && this.pad.buttons[n] && this.pad.buttons[n].pressed); },

  // source: 'all' (1P merges everything) | 'kbm' (P1 in 2P) | 'pad' (P2 in 2P)
  move(source) {
    const kb = source !== 'pad', pd = source !== 'kbm';
    let x, y;
    if (typeof Render3D !== 'undefined' && Render3D.active) {
      // end camera looks up-floor (+x): W / stick-up = at the far net, A/D strafe across
      x = (kb ? (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0) : 0) - (pd ? this.axis(1) : 0);
      y = (kb ? (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0) : 0) + (pd ? this.axis(0) : 0);
    } else {
      x = (kb ? (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0) : 0) + (pd ? this.axis(0) : 0);
      y = (kb ? (this.keys.KeyS ? 1 : 0) - (this.keys.KeyW ? 1 : 0) : 0) + (pd ? this.axis(1) : 0);
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  },

  // camera control deltas, consumed once per frame by Render3D: orbit drag, zoom, reset tap
  cameraInput() {
    const m = this.mouse;
    const out = { dx: m.mdx, dy: m.mdy, wheel: m.wheel, reset: m.mClick };
    m.mdx = 0; m.mdy = 0; m.wheel = 0; m.mClick = false;
    return out;
  },

  // mouse position in rink coordinates (3D: floor raycast; 2D: inverse of the fit-scale)
  mouseRink() {
    if (this.mouse.rink) return this.mouse.rink;
    if (typeof Render !== 'undefined' && !Render.worldless && Render.classicScale) {
      const s = Render.classicScale, C = CONFIG.canvas;
      return {
        x: CONFIG.center.x + (this.mouse.x - C.w / 2) / s,
        y: CONFIG.center.y + (this.mouse.y - (C.h + 110) / 2) / s,
      };
    }
    return { x: this.mouse.x, y: this.mouse.y };
  },
  // mouse projected onto a goal's vertical plane (3D only)
  goalPlane(netIdx) {
    return (typeof Render3D !== 'undefined' && Render3D.active)
      ? Render3D.mouseToGoalPlane(this.mouse.x, this.mouse.y, netIdx) : null;
  },

  // aim priority: right stick > recent mouse > arrows > null (auto-aim)
  aimFor(p, source) {
    const kb = source !== 'pad', pd = source !== 'kbm';
    const in3d = typeof Render3D !== 'undefined' && Render3D.active;
    if (pd) {
      const sx = this.axis(2), sy = this.axis(3);
      if (Math.hypot(sx, sy) > 0.3) {
        return in3d ? { x: -sy, y: sx, mouse: false } : { x: sx, y: sy, mouse: false };
      }
    }
    if (!kb) return null;
    if (performance.now() - this.mouse.lastMove < 2500) {
      const m = this.mouseRink();
      return { x: m.x - p.pos.x, y: m.y - p.pos.y, mouse: true };
    }
    let ax, ay;
    if (in3d) {
      ax = (this.keys.ArrowUp ? 1 : 0) - (this.keys.ArrowDown ? 1 : 0);
      ay = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0);
    } else {
      ax = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0);
      ay = (this.keys.ArrowDown ? 1 : 0) - (this.keys.ArrowUp ? 1 : 0);
    }
    if (ax || ay) return { x: ax, y: ay, mouse: false };
    return null;
  },

  held(action, source) {
    const kb = source !== 'pad', pd = source !== 'kbm';
    switch (action) {
      case 'shoot': return !!((kb && (this.keys.KeyJ || this.mouse.down)) || (pd && this.padBtn(2)));
      case 'turbo': return !!((kb && (this.keys.ShiftLeft || this.keys.ShiftRight)) || (pd && (this.padBtn(7) || this.padBtn(5))));
      case 'goalie': return !!((kb && this.keys.KeyG) || (pd && this.padBtn(4)));
      case 'pass': return !!((kb && this.keys.Space) || (pd && this.padBtn(0)));
      default: return false;
    }
  },
  pressed(action, source) {
    const kb = source !== 'pad', pd = source !== 'kbm';
    const eat = (...codes) => {
      let hit = false;
      for (const c of codes) {
        if (c.startsWith('Pad') ? !pd : !kb) continue;
        if (this.press[c]) { this.press[c] = false; hit = true; }
      }
      return hit;
    };
    switch (action) {
      case 'pass': return eat('PadA');
      case 'jump': return eat('Space', 'PadY');
      case 'shoot': return eat('KeyJ', 'MouseL', 'PadX');
      case 'hit': return eat('KeyK', 'MouseR', 'PadB');
      case 'cut': return eat('KeyE', 'PadUp');
      case 'mod': return eat('ShiftLeft', 'ShiftRight', 'PadRB');
      case 'pause': return eat('KeyP', 'Escape', 'PadStart');
      case 'mute': return eat('KeyM');
      case 'confirm': return eat('Enter', 'Space', 'PadA');
      case 'back': return eat('Escape', 'PadB');
      case 'up': return eat('KeyW', 'ArrowUp');
      case 'down': return eat('KeyS', 'ArrowDown');
      case 'left': return eat('KeyA', 'ArrowLeft');
      case 'right': return eat('KeyD', 'ArrowRight');
      default: return false;
    }
  },
};
