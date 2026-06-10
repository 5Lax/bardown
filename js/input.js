// Keyboard + mouse + gamepad → named actions. `pressed()` auto-consumes so a
// press fires game logic exactly once even with multiple physics steps per frame.
const Input = {
  keys: Object.create(null),
  mouse: { x: CONFIG.center.x, y: CONFIG.center.y, down: false, rdown: false, lastMove: -1e9 },
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
    });
    canvas.addEventListener('mousedown', e => {
      AudioSys.init();
      if (e.button === 0) { this.mouse.down = true; this.press.MouseL = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.press.MouseR = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('gamepadconnected', e => { this.padIndex = e.gamepad.index; });
  },

  // call once per render frame, before physics steps
  update() {
    if (!HAS_DOM) return;
    this.pad = null;
    if (this.padIndex !== null && navigator.getGamepads) {
      const p = navigator.getGamepads()[this.padIndex];
      if (p && p.connected) this.pad = p;
    }
    if (this.pad) {
      const map = { pass: 0, hit: 1, shoot: 2, fire: 3, goalie: 4, pause: 9, faceB: 0 };
      for (const [name, btn] of Object.entries({ PadA: 0, PadB: 1, PadX: 2, PadY: 3, PadLB: 4, PadRB: 5, PadStart: 9 })) {
        const down = this.pad.buttons[btn] && this.pad.buttons[btn].pressed;
        if (down && !this.padPrev[name]) this.press[name] = true;
        this.padPrev[name] = down;
      }
    }
  },

  axis(n) { return this.pad && Math.abs(this.pad.axes[n] || 0) > 0.22 ? this.pad.axes[n] : 0; },
  padBtn(n) { return !!(this.pad && this.pad.buttons[n] && this.pad.buttons[n].pressed); },

  move() {
    let x = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    let y = (this.keys.KeyS ? 1 : 0) - (this.keys.KeyW ? 1 : 0);
    x += this.axis(0); y += this.axis(1);
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  },

  // aim priority: right stick > recent mouse > arrows > null (auto-aim)
  aimFor(p) {
    const sx = this.axis(2), sy = this.axis(3);
    if (Math.hypot(sx, sy) > 0.3) return { x: sx, y: sy, mouse: false };
    if (performance.now() - this.mouse.lastMove < 2500)
      return { x: this.mouse.x - p.pos.x, y: this.mouse.y - p.pos.y, mouse: true };
    const ax = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0);
    const ay = (this.keys.ArrowDown ? 1 : 0) - (this.keys.ArrowUp ? 1 : 0);
    if (ax || ay) return { x: ax, y: ay, mouse: false };
    return null;
  },

  held(action) {
    switch (action) {
      case 'shoot': return !!(this.keys.KeyJ || this.mouse.down || this.padBtn(2));
      case 'turbo': return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.padBtn(7) || this.padBtn(5));
      case 'goalie': return !!(this.keys.KeyG || this.padBtn(4));
      case 'pass': return !!(this.keys.Space || this.padBtn(0));
      default: return false;
    }
  },
  pressed(action) {
    const eat = (...codes) => {
      let hit = false;
      for (const c of codes) if (this.press[c]) { this.press[c] = false; hit = true; }
      return hit;
    };
    switch (action) {
      case 'pass': return eat('Space', 'PadA');
      case 'shoot': return eat('KeyJ', 'MouseL', 'PadX');
      case 'hit': return eat('KeyK', 'MouseR', 'PadB');
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
