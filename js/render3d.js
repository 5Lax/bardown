// WebGL view layer (Three.js r147, global THREE). The 2D sim in game.js stays the
// source of truth — this maps rink coords (x,y in px, z height) onto a 3D arena:
// worldX = x-640, worldY = height, worldZ = y-415. Rigs face +X at yaw 0; yaw = -facing.
// Camera is Blast-Lacrosse style: parked behind the human team's end, looking down
// the length of the floor (+x = up-screen). Cosmetic Math.random only; never game.rng.
const Render3D = {
  active: false,
  game: null, t: 0, hype: 0,

  SKINS: [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5a3825, 0xa26b3d, 0x7a4a28, 0xd9a06b],
  NAMES: ['JOHNSON', 'BARNES', 'RIVERA', 'OKAFOR', 'LACROIX', 'KOWALSKI', 'TANAKA', 'MURPHY',
    'DIAZ', 'SINGH', 'PETROV', 'HALE', 'NDIAYE', 'CARTER', 'MAKI', 'ROSSI',
    'DUBOIS', 'KIM', 'ANDERSEN', 'WALSH', 'CRUZ', 'IVERSEN', 'BLACKBIRD', 'VANCE'],
  NUMBERS: [4, 7, 13, 22, 88, 30],

  init(canvas) {
    if (typeof THREE === 'undefined' || !HAS_DOM) return false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    } catch (e) { return false; }
    this.renderer.setSize(CONFIG.canvas.w, CONFIG.canvas.h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x0b0d12);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b0d12, 1900, 3400);
    this.camera = new THREE.PerspectiveCamera(46, CONFIG.canvas.w / CONFIG.canvas.h, 10, 4000);
    this.camera.position.set(-500, 290, 0);
    this.camTarget = new THREE.Vector3(0, 12, 0);
    this.camPos = new THREE.Vector3(-500, 290, 0);
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1c1e26, 0.95));
    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(300, 640, 240);
    this.scene.add(dir);
    const spot = new THREE.SpotLight(0xfff2dd, 0.55, 0, Math.PI / 3.2, 0.5);
    spot.position.set(0, 720, 180);
    this.scene.add(spot);

    this.buildBoards();
    this.buildNets();
    this.buildCrowd();
    this.buildBallAndFx();
    this.active = true;
    return true;
  },

  W(x, y, h) { return new THREE.Vector3(x - 640, h || 0, y - 415); },

  // ---- static arena ----

  boardPath(spacing, inset) {
    const r = CONFIG.rink, cr = r.corner - (inset || 0);
    const x0 = r.x - (inset || 0), y0 = r.y - (inset || 0);
    const w = r.w + 2 * (inset || 0), h = r.h + 2 * (inset || 0);
    const pts = [];
    const seg = (fn, len) => {
      const n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i < n; i++) pts.push(fn(i / n));
    };
    const arc = (cx, cy, a0) => (t) => {
      const a = a0 + t * Math.PI / 2;
      return { x: cx + Math.cos(a) * cr, y: cy + Math.sin(a) * cr, a: a + Math.PI / 2 };
    };
    seg(t => ({ x: x0 + cr + t * (w - 2 * cr), y: y0, a: 0 }), w - 2 * cr);
    seg(arc(x0 + w - cr, y0 + cr, -Math.PI / 2), cr * Math.PI / 2);
    seg(t => ({ x: x0 + w, y: y0 + cr + t * (h - 2 * cr), a: Math.PI / 2 }), h - 2 * cr);
    seg(arc(x0 + w - cr, y0 + h - cr, 0), cr * Math.PI / 2);
    seg(t => ({ x: x0 + w - cr - t * (w - 2 * cr), y: y0 + h, a: Math.PI }), w - 2 * cr);
    seg(arc(x0 + cr, y0 + h - cr, Math.PI / 2), cr * Math.PI / 2);
    seg(t => ({ x: x0, y: y0 + h - cr - t * (h - 2 * cr), a: -Math.PI / 2 }), h - 2 * cr);
    seg(arc(x0 + cr, y0 + cr, Math.PI), cr * Math.PI / 2);
    return pts;
  },

  buildBoards() {
    const g = new THREE.Group();
    const pts = this.boardPath(13, 0);
    const kickMat = new THREE.MeshLambertMaterial({ color: 0xb98f2c });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xdde5ee });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.13, depthWrite: false });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });
    const kickGeo = new THREE.BoxGeometry(15, 10, 4);
    const wallGeo = new THREE.BoxGeometry(15, 26, 4);
    const glassGeo = new THREE.BoxGeometry(15, 40, 2.4);
    const postGeo = new THREE.CylinderGeometry(0.9, 0.9, 78, 6);
    pts.forEach((p, i) => {
      const yaw = -p.a;
      const k = new THREE.Mesh(kickGeo, kickMat);
      k.position.copy(this.W(p.x, p.y, 5)); k.rotation.y = yaw; g.add(k);
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.copy(this.W(p.x, p.y, 23)); w.rotation.y = yaw; g.add(w);
      const gl = new THREE.Mesh(glassGeo, glassMat);
      gl.position.copy(this.W(p.x, p.y, 56)); gl.rotation.y = yaw; g.add(gl);
      if (i % 5 === 0) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.copy(this.W(p.x, p.y, 39)); g.add(post);
      }
    });
    this.scene.add(g);
  },

  buildNets() {
    const postMat = new THREE.MeshLambertMaterial({ color: 0xff3b30 });
    const meshTex = this.gridTexture();
    const netMat = new THREE.MeshLambertMaterial({ map: meshTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    for (const net of CONFIG.goals) {
      const grp = new THREE.Group();
      const half = CONFIG.net.mouthW / 2, H = CONFIG.net.mouthH, dep = CONFIG.net.depth;
      const post = new THREE.CylinderGeometry(2.6, 2.6, H, 8);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(post, postMat);
        p.position.copy(this.W(net.x, net.cy + s * half, H / 2));
        grp.add(p);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, half * 2 + 5, 8), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.copy(this.W(net.x, net.cy, H));
      grp.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, H * 1.12), netMat);
      back.position.copy(this.W(net.x - net.f * dep, net.cy, H * 0.45));
      back.rotation.y = Math.PI / 2;
      back.rotation.x = net.f * 0.32;
      grp.add(back);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(dep, H * 0.96), netMat);
        side.position.copy(this.W(net.x - net.f * dep / 2, net.cy + s * half, H * 0.46));
        grp.add(side);
      }
      this.scene.add(grp);
    }
  },

  buildCrowd() {
    const terracePts = [];
    for (let tier = 0; tier < 4; tier++) {
      for (const p of this.boardPath(13, 40 + tier * 27)) terracePts.push({ ...p, tier });
    }
    const terrace = new THREE.InstancedMesh(
      new THREE.BoxGeometry(15, 26, 30),
      new THREE.MeshLambertMaterial({ color: 0x1b1e27 }),
      terracePts.length
    );
    const tm = new THREE.Matrix4(), te = new THREE.Euler();
    terracePts.forEach((p, i) => {
      te.set(0, -p.a, 0);
      tm.makeRotationFromEuler(te);
      tm.setPosition(p.x - 640, 36 + p.tier * 24 - 21, p.y - 415);
      terrace.setMatrixAt(i, tm);
    });
    this.scene.add(terrace);

    const pts = [];
    for (let tier = 0; tier < 4; tier++) {
      for (const p of this.boardPath(26, 40 + tier * 27)) {
        pts.push({ ...p, h: 36 + tier * 24 });
      }
    }
    this.crowd = new THREE.InstancedMesh(
      new THREE.BoxGeometry(9, 17, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      pts.length
    );
    this.crowdPts = pts;
    this.crowdPhase = pts.map(() => Math.random() * Math.PI * 2);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x - 640, p.h, p.y - 415);
      this.crowd.setMatrixAt(i, m);
    });
    this.scene.add(this.crowd);
  },

  paintCrowd(game) {
    const c = new THREE.Color();
    const cols = [game.teamDefs[0].color, game.teamDefs[1].color];
    this.crowdPts.forEach((p, i) => {
      const r = Math.random();
      if (r < 0.14) c.set(cols[0]);
      else if (r < 0.28) c.set(cols[1]);
      else { const v = 0.22 + Math.random() * 0.3; c.setRGB(v, v, v * 1.08); }
      this.crowd.setColorAt(i, c);
    });
    this.crowd.instanceColor.needsUpdate = true;
  },

  buildBallAndFx() {
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0xff8c1a, emissive: 0x331500 })
    );
    this.scene.add(this.ballMesh);
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(6, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.ghosts = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: 0 }));
      this.scene.add(m);
      this.ghosts.push({ m, life: 0 });
    }
    this.ghostIdx = 0; this.ghostCd = 0;
    this.sprites = [];
    this.spriteMats = new Map();
    for (let i = 0; i < 240; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true }));
      s.visible = false;
      this.scene.add(s);
      this.sprites.push(s);
    }
    this.trailQuads = [];
    for (let i = 0; i < 120; i++) {
      const q = new THREE.Mesh(new THREE.CircleGeometry(5, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      q.rotation.x = -Math.PI / 2;
      q.visible = false;
      this.scene.add(q);
      this.trailQuads.push(q);
    }
    this.reticle = new THREE.Mesh(new THREE.TorusGeometry(6.5, 1.1, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9 }));
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.passMarker = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 4),
      new THREE.MeshBasicMaterial({ color: 0x7fd0ff }));
    this.passMarker.rotation.x = Math.PI;
    this.passMarker.visible = false;
    this.scene.add(this.passMarker);
  },

  // ---- textures ----

  gridTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(235,240,248,0.9)';
    x.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return t;
  },

  floorTexture(game) {
    const FW = CONFIG.rink.w + 280, FH = CONFIG.rink.h + 270;
    const c = document.createElement('canvas');
    c.width = 2048; c.height = Math.round(2048 * FH / FW);
    const x = c.getContext('2d');
    const sx = c.width / FW, sy = c.height / FH;
    const X = (wx) => (wx - 640 + FW / 2) * sx, Y = (wy) => (wy - 415 + FH / 2) * sy;
    x.fillStyle = '#14171f';
    x.fillRect(0, 0, c.width, c.height);
    const r = CONFIG.rink;
    const rr = (px, py, pw, ph, rad) => {
      x.beginPath();
      x.moveTo(X(px + rad), Y(py));
      x.arcTo(X(px + pw), Y(py), X(px + pw), Y(py + ph), rad * sx);
      x.arcTo(X(px + pw), Y(py + ph), X(px), Y(py + ph), rad * sx);
      x.arcTo(X(px), Y(py + ph), X(px), Y(py), rad * sx);
      x.arcTo(X(px), Y(py), X(px + pw), Y(py), rad * sx);
      x.closePath();
    };
    rr(r.x, r.y, r.w, r.h, r.corner);
    x.fillStyle = '#23584a';
    x.fill();
    x.save();
    x.clip();
    for (let i = 0; i < 14; i++) {
      if (i % 2) continue;
      x.fillStyle = 'rgba(255,255,255,0.025)';
      x.fillRect(X(r.x + (r.w / 14) * i), Y(r.y), (r.w / 14) * sx, r.h * sy);
    }
    const cx = CONFIG.center.x, cy = CONFIG.center.y;
    x.lineWidth = 4 * sx;
    x.strokeStyle = 'rgba(240,246,252,0.75)';
    x.beginPath(); x.moveTo(X(cx), Y(r.y)); x.lineTo(X(cx), Y(r.y + r.h)); x.stroke();
    x.beginPath(); x.ellipse(X(cx), Y(cy), 60 * sx, 60 * sy, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(240,246,252,0.8)';
    x.beginPath(); x.ellipse(X(cx), Y(cy), 6 * sx, 6 * sy, 0, 0, Math.PI * 2); x.fill();
    for (const net of CONFIG.goals) {
      const td = game ? game.teamDefs[net.i] : CONFIG.teams[net.i];
      x.fillStyle = Render.alpha(td.color, 0.22);
      x.beginPath(); x.ellipse(X(net.x), Y(net.cy), CONFIG.crease.r * sx, CONFIG.crease.r * sy, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = Render.alpha(td.color, 0.85);
      x.beginPath(); x.ellipse(X(net.x), Y(net.cy), CONFIG.crease.r * sx, CONFIG.crease.r * sy, 0, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = '#ff5050';
      x.beginPath();
      x.moveTo(X(net.x), Y(net.cy - CONFIG.net.mouthW / 2));
      x.lineTo(X(net.x), Y(net.cy + CONFIG.net.mouthW / 2));
      x.stroke();
    }
    // home-team wordmark, oriented to read from the end camera (screen-up = +x)
    if (game) {
      const home = game.teamDefs[0];
      x.save();
      x.translate(X(cx), Y(cy));
      x.rotate(Math.PI / 2);
      x.transform(1, 0, -0.16, 1, 0, 0);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `900 ${120 * sy}px "Arial Black",Impact,sans-serif`;
      x.fillStyle = Render.alpha(home.color, 0.16);
      x.fillText(home.name, 0, 0);
      x.strokeStyle = Render.alpha(home.color2, 0.25);
      x.lineWidth = 3 * sx;
      x.strokeText(home.name, 0, 0);
      x.font = `900 ${34 * sy}px "Arial Black",Impact,sans-serif`;
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillText('BARDOWN', 0, 105 * sy);
      x.restore();
    }
    x.restore();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return { tex: t, FW, FH };
  },

  // wrap-around jersey for capsule torsos: number at u=0.5 and split across the u=0 seam
  jerseyCanvas(td, number) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = td.color;
    x.fillRect(0, 0, 256, 128);
    x.fillStyle = td.color2;
    x.fillRect(0, 0, 256, 24);
    x.fillStyle = td.trim;
    x.fillRect(0, 100, 256, 8);
    x.font = '900 52px "Arial Black",Impact,sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const nx of [0, 128, 256]) {
      x.lineWidth = 7; x.strokeStyle = td.color2;
      x.strokeText(String(number), nx, 64);
      x.fillStyle = '#ffffff';
      x.fillText(String(number), nx, 64);
    }
    return new THREE.CanvasTexture(c);
  },

  nameTag(p) {
    const num = this.NUMBERS[p.idx % 6];
    const ti = Math.max(0, CONFIG.teams.indexOf(p.teamDef));
    const name = this.NAMES[(ti * 7 + p.idx * 5) % this.NAMES.length];
    const c = document.createElement('canvas');
    c.width = 256; c.height = 56;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(8,10,14,0.72)';
    const w = 246, h = 44, rx = 10;
    x.beginPath();
    x.moveTo(5 + rx, 6);
    x.arcTo(5 + w, 6, 5 + w, 6 + h, rx);
    x.arcTo(5 + w, 6 + h, 5, 6 + h, rx);
    x.arcTo(5, 6 + h, 5, 6, rx);
    x.arcTo(5, 6, 5 + w, 6, rx);
    x.fill();
    x.fillStyle = p.teamDef.color;
    x.fillRect(12, 14, 8, 28);
    x.font = '900 28px "Arial Black",Impact,sans-serif';
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff';
    x.fillText(num + '  ' + name, 30, 30);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(64, 14, 1);
    return s;
  },

  // ---- player rigs (articulated low-poly humans) ----

  // decimated RC1 lacrosse head (vendor/stickhead.js), built once and shared by every
  // stick. Normalized to unit length; rotated so the throat→scoop axis runs along +X.
  headGeometry() {
    if (this._headGeo !== undefined) return this._headGeo;
    if (typeof window === 'undefined' || !window.STICK_HEAD) { this._headGeo = null; return null; }
    const H = window.STICK_HEAD;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(H.pos, 3));
    g.setIndex(H.idx);
    g.computeVertexNormals();
    g.rotateY(Math.PI / 2); // STL long axis (Z) → stick local +X
    this._headGeo = g;
    return g;
  },

  makeRig(p) {
    const td = p.teamDef;
    const goalie = p.isGoalie;
    const wide = goalie ? 1.5 : 1.0;
    const padR = goalie ? 1.9 : 1.0;
    const ti = Math.max(0, CONFIG.teams.indexOf(td));
    const skinCol = this.SKINS[(ti * 3 + p.idx * 7) % this.SKINS.length];

    const g = new THREE.Group();
    const upper = new THREE.Group();
    g.add(upper);
    const jersey = new THREE.MeshLambertMaterial({ map: this.jerseyCanvas(td, this.NUMBERS[p.idx % 6]) });
    const plain = new THREE.MeshLambertMaterial({ color: td.color });
    const dark = new THREE.MeshLambertMaterial({ color: td.color2 });
    const trim = new THREE.MeshLambertMaterial({ color: td.trim });
    const skin = new THREE.MeshLambertMaterial({ color: skinCol });
    const shoe = new THREE.MeshLambertMaterial({ color: 0x16181d });
    const glove = new THREE.MeshLambertMaterial({ color: 0x222630 });

    // legs: hip pivot → thigh → knee pivot → shin → shoe (capsules = rounded muscle)
    // Blitz proportions: 8½-foot superheroes — huge chest, cartoon forearms, thick legs
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0, 24, side * 6.2 * wide);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(4.4 * padR, 6.5, 3, 9), goalie ? trim : dark);
      thigh.position.y = -6;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -13;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(3.1 * padR, 6.5, 3, 9), goalie ? trim : new THREE.MeshLambertMaterial({ color: td.trim }));
      shin.position.y = -5.8;
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(2.7, 4.8, 2, 8), shoe);
      foot.rotation.z = Math.PI / 2;
      foot.position.set(2.5, -11.8, 0);
      knee.add(foot);
      g.add(hip);
      return { hip, knee };
    };
    const legL = mkLeg(-1), legR = mkLeg(1);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 9.6, 9, 12), dark);
    shorts.scale.z = 1.3 * wide;
    shorts.position.set(0, 24, 0);
    g.add(shorts);

    // organic torso: one smooth lathed profile — hips, waist pinch, massive chest, taper
    const profile = [
      [6.7, 0], [6.0, 4.5], [6.6, 8.5], [8.3, 13], [8.7, 16.5], [7.7, 19.5], [4.3, 21.5],
    ].map(q => new THREE.Vector2(q[0], q[1]));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), jersey);
    torso.scale.z = 1.45 * wide;
    torso.position.set(0, 24.5, 0);
    upper.add(torso);
    for (const s of [-1, 1]) {
      const delt = new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 8), plain);
      delt.position.set(0, 43.5, s * 15 * wide);
      upper.add(delt);
    }
    // shoulder roll
    const pads = new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 17 * wide, 3, 10), plain);
    pads.rotation.x = Math.PI / 2;
    pads.position.set(0, 45, 0);
    upper.add(pads);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.5, 3.5, 8), skin);
    neck.position.set(0, 48, 0);
    upper.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(6.0, 16, 12), skin);
    head.position.set(0.7, 53.4, 0);
    upper.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(6.9, 16, 12), plain);
    helmet.scale.set(1.04, 0.9, 1.04);
    helmet.position.set(0.3, 54.6, 0);
    upper.add(helmet);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.8, 9.5), plain);
    brim.position.set(6.6, 55.4, 0);
    upper.add(brim);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.4, 8.8),
      new THREE.MeshLambertMaterial({ color: 0x16181d }));
    cage.position.set(6.4, 51.4, 0);
    upper.add(cage);

    // arms: shoulder pivot → cannonball sleeve → elbow pivot → comic forearm → big glove
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0, 43, side * (15 * wide));
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(3.8, 5.5, 3, 9), plain);
      up.position.y = -4.8;
      sh.add(up);
      const el = new THREE.Group();
      el.position.y = -10.5;
      sh.add(el);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 5, 3, 9), skin);
      fore.position.y = -4.4;
      el.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(3.8, 9, 8), glove);
      hand.scale.y = 1.15;
      hand.position.y = -10.4;
      el.add(hand);
      upper.add(sh);
      return { sh, el };
    };
    const armL = mkArm(-1), armR = mkArm(1);

    // stick
    const stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 38, 6),
      new THREE.MeshLambertMaterial({ color: 0xc9cfd8 }));
    shaft.rotation.z = Math.PI / 2;
    stick.add(shaft);
    const headGeo = this.headGeometry();
    if (headGeo) {
      // the real RC1 head — shared geometry, tinted to the team's trim color
      const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: td.trim, side: THREE.DoubleSide }));
      const L = goalie ? 19 : 15;
      head.scale.setScalar(L);
      head.position.set(goalie ? 23 : 21, 0, 0);
      stick.add(head);
    } else {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(goalie ? 7.5 : 5.5, 1.1, 6, 14), trim);
      loop.position.set(21, 0, 0);
      stick.add(loop);
      const pocket = new THREE.Mesh(new THREE.CircleGeometry(goalie ? 6.6 : 4.7, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      pocket.position.set(21, 0, 0);
      stick.add(pocket);
    }
    g.add(stick);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.15, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.6;
    this.scene.add(shadow);

    const marker = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    marker.rotation.x = Math.PI;
    marker.visible = false;
    this.scene.add(marker);
    const tag = this.nameTag(p);
    tag.visible = false;
    this.scene.add(tag);

    g.scale.setScalar(goalie ? 1.15 : 1.22);
    this.scene.add(g);
    return { g, upper, legL, legR, armL, armR, stick, shadow, marker, tag, jersey,
      phase: Math.random() * 6, launch: 0, wasDown: false, releaseT: 0, prevCharging: false, stickTip: new THREE.Vector3() };
  },

  setGame(game) {
    // free GPU resources from the previous game's rigs/floor (the arena is built once and kept)
    const dispose = (root) => root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        if (o.material.dispose) o.material.dispose();
      }
    });
    if (this.rigs) {
      for (const r of this.rigs.values()) {
        for (const o of [r.g, r.shadow, r.marker, r.tag]) { this.scene.remove(o); dispose(o); }
      }
    }
    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      dispose(this.floorMesh);
    }
    const { tex, FW, FH } = this.floorTexture(game);
    this.floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH),
      new THREE.MeshLambertMaterial({ map: tex }));
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.floorMesh);
    this.rigs = new Map();
    for (const p of game.players) this.rigs.set(p, this.makeRig(p));
    this.paintCrowd(game);
    this.game = game;
  },

  // ---- per-frame ----

  zeroPose(rig) {
    for (const leg of [rig.legL, rig.legR]) { leg.hip.rotation.set(0, 0, 0); leg.knee.rotation.set(0, 0, 0); }
    for (const arm of [rig.armL, rig.armR]) { arm.sh.rotation.set(0, 0, 0); arm.el.rotation.set(0, 0, 0); }
    rig.upper.rotation.set(0, 0, 0);
    rig.upper.position.set(0, 0, 0);
  },

  syncRig(p, rig, dt) {
    const g = rig.g, t = this.t;
    const spd = Math.hypot(p.vel.x, p.vel.y);
    g.position.set(p.pos.x - 640, 0, p.pos.y - 415);
    rig.shadow.position.set(g.position.x, 0.6, g.position.z);
    rig.marker.visible = false;
    rig.tag.visible = false;

    const mods = this.game.getMods(p.team);
    rig.jersey.emissive = rig.jersey.emissive || new THREE.Color(0);
    rig.jersey.emissive.setHex(mods.onFire ? 0x662200 : 0x000000);
    if (mods.onFire && Math.random() < 0.25)
      Effects.burst(p.pos.x, p.pos.y, { n: 1, color: '#ff9930', spd: 40, life: 0.5, size: 3, drag: 1 });
    if (p.turboActive && Math.random() < 0.5) Effects.trail(p.pos.x, p.pos.y, p.teamDef.color, 6);

    if (p.controlled && this.game.mode !== 'cpu') {
      rig.marker.visible = true;
      rig.marker.position.set(g.position.x, 74 + p.jumpZ + Math.sin(t * 5) * 3, g.position.z);
      rig.marker.rotation.y = t * 2;
      rig.tag.visible = true;
      rig.tag.position.set(g.position.x, 88 + p.jumpZ, g.position.z);
    }

    this.zeroPose(rig);

    if (p.state === 'down') {
      if (!rig.wasDown) { rig.wasDown = true; rig.launch = 0; }
      rig.launch += dt;
      const fly = Math.min(1, rig.launch / 0.3);
      const slideYaw = -Math.atan2(p.vel.y, p.vel.x || 0.01);
      g.position.y = Math.sin(Math.min(fly, 1) * Math.PI) * 15;
      g.rotation.set(0, slideYaw + (p.knockT > 0.35 ? p.knockT * 7 : 0), 0);
      g.rotateZ(1.5 * fly);
      rig.legL.hip.rotation.x = 0.7; rig.legL.knee.rotation.x = 0.9;
      rig.legR.hip.rotation.x = -0.5; rig.legR.knee.rotation.x = 0.7;
      rig.armL.sh.rotation.z = 1.6; rig.armL.el.rotation.x = 0.5;
      rig.armR.sh.rotation.z = -1.6; rig.armR.el.rotation.x = 0.4;
      rig.stick.position.set(6, 4, 10);
      rig.stick.rotation.set(0, 0.8, 0);
      return;
    }
    rig.wasDown = false;

    if (p.state === 'diving') {
      const yaw = -Math.atan2(p.vel.y, p.vel.x || 0.01);
      g.position.y = 7;
      g.rotation.set(0, yaw, 0);
      g.rotateZ(1.35);
      rig.armL.sh.rotation.z = 2.7;
      rig.armR.sh.rotation.z = -2.7;
      rig.stick.position.set(26, 14, 0);
      rig.stick.rotation.set(0, 0, 0.2);
      this.updateStickTip(rig);
      return;
    }

    if (p.state === 'tackling') {
      // full-extension flying tackle: superman, arms wide for the wrap
      const prog = clamp(1 - p.tackleT / CONFIG.tackle.time, 0, 1);
      const yaw = -Math.atan2(p.vel.y, p.vel.x || 0.01);
      g.position.y = 9 + Math.sin(prog * Math.PI) * 7;
      g.rotation.set(0, yaw, 0);
      g.rotateZ(1.42);
      rig.armL.sh.rotation.set(0, 0, 2.95); rig.armL.el.rotation.x = 0.25;
      rig.armR.sh.rotation.set(0, 0, -2.95); rig.armR.el.rotation.x = 0.25;
      rig.legL.hip.rotation.x = 0.25; rig.legL.knee.rotation.x = 0.3;
      rig.legR.hip.rotation.x = -0.2; rig.legR.knee.rotation.x = 0.4;
      rig.stick.position.set(-6, 6, 10);
      rig.stick.rotation.set(0, 0.9, 0.4);
      return;
    }

    g.rotation.set(0, -p.facing, 0);
    if (p.spinT > 0) g.rotation.y += (1 - p.spinT / CONFIG.spin.time) * Math.PI * 2; // spin-o-rama
    // Blitz gait: huge strides, fast cycle, big bounce, hard sprint lean
    rig.phase += spd * dt * 0.072;
    const runK = clamp(spd / 280, 0, 1);
    const ph = rig.phase;
    g.position.y = Math.abs(Math.sin(ph)) * 2.8 * runK + p.jumpZ;
    g.rotateZ(-runK * 0.2 * (p.isGoalie ? 0.3 : 1));
    if (p.jumpZ > 4) {
      rig.legL.hip.rotation.x = -0.35;
      rig.legR.hip.rotation.x = -0.35;
      rig.legL.knee.rotation.x = 1.2;
      rig.legR.knee.rotation.x = 1.2;
    } else {
      rig.legL.hip.rotation.x = Math.sin(ph) * 1.05 * runK;
      rig.legR.hip.rotation.x = -Math.sin(ph) * 1.05 * runK;
      rig.legL.knee.rotation.x = Math.max(0.08, -Math.sin(ph)) * 1.3 * runK + 0.06;
      rig.legR.knee.rotation.x = Math.max(0.08, Math.sin(ph)) * 1.3 * runK + 0.06;
    }

    const hasBall = p.__hasBall !== undefined ? p.__hasBall : this.game.ball.carrier === p;
    const swinging = p.hitCd > CONFIG.hit.cooldown - 0.18;
    if (rig.prevCharging && !p.charging) rig.releaseT = 0.18;
    rig.prevCharging = p.charging;
    rig.releaseT = Math.max(0, rig.releaseT - dt);

    if (p.isGoalie) {
      const ball = this.game.ball;
      const threat = ball.state === 'shot' && ball.shot && ball.shot.net === p.team &&
        dist(ball.pos.x, ball.pos.y, p.pos.x, p.pos.y) < 300;
      // crouch
      rig.upper.position.y = -3;
      rig.upper.rotation.z = -0.16;
      rig.legL.hip.rotation.x = -0.45; rig.legL.knee.rotation.x = 0.85;
      rig.legR.hip.rotation.x = -0.45; rig.legR.knee.rotation.x = 0.85;
      if (p.savePose > 0) {
        // desperation lunge toward the save side — shows you WHERE he beat you
        const k = p.savePose / 0.55, s = p.saveSide;
        rig.upper.rotation.x = -s * 0.55 * k;
        rig.upper.position.y = -3 - 3.5 * k;
        rig.armL.sh.rotation.z = 1.1 + (s < 0 ? 1.7 * k : 0.2);
        rig.armR.sh.rotation.z = -1.1 - (s > 0 ? 1.7 * k : 0.2);
        rig.legL.hip.rotation.z = 0.55 * k;
        rig.legR.hip.rotation.z = -0.55 * k;
        rig.stick.position.set(10, 16, s * 15 * k);
        rig.stick.rotation.set(0, 0, 0.6);
      } else if (threat) {
        rig.armL.sh.rotation.z = 2.1; rig.armR.sh.rotation.z = -2.1;
        rig.legL.hip.rotation.z = 0.55; rig.legR.hip.rotation.z = -0.55;
        rig.stick.position.set(12, 30, 0);
        rig.stick.rotation.set(0, 0, 1.2);
      } else {
        rig.armL.sh.rotation.set(0.5, 0, 0.5); rig.armL.el.rotation.x = 0.7;
        rig.armR.sh.rotation.set(0.5, 0, -0.5); rig.armR.el.rotation.x = 0.7;
        rig.stick.position.set(12, 6, 4);
        rig.stick.rotation.set(0, 0, -1.15);
      }
    } else if (swinging) {
      // violent cross-check: torso whips through the swing, stick thrusts out
      const swT = clamp((CONFIG.hit.cooldown - p.hitCd) / 0.18, 0, 1);
      rig.upper.rotation.y = lerp(0.85, -0.7, swT);
      rig.upper.rotation.z = -0.4;
      rig.armL.sh.rotation.set(-1.35, 0, 0.4); rig.armL.el.rotation.x = 0.2;
      rig.armR.sh.rotation.set(-1.35, 0, -0.4); rig.armR.el.rotation.x = 0.2;
      rig.stick.position.set(9 + swT * 10, 30, 0);
      rig.stick.rotation.set(0, Math.PI / 2 + lerp(-0.5, 0.45, swT), 0);
    } else if (p.charging) {
      const wind = 0.45 + p.charge * 0.9;
      rig.upper.rotation.y = wind * 0.55;
      rig.armL.sh.rotation.set(0.5, 0, 0.5); rig.armL.el.rotation.x = 0.9;
      rig.armR.sh.rotation.set(-0.8, 0, -0.4); rig.armR.el.rotation.x = 0.5;
      rig.stick.position.set(-4, 34, 9);
      rig.stick.rotation.set(0, -wind, 0.25);
    } else if (rig.releaseT > 0) {
      const k = rig.releaseT / 0.18;
      rig.upper.rotation.y = -0.55 * (1 - k);
      rig.armL.sh.rotation.set(-0.9, 0, 0.3);
      rig.armR.sh.rotation.set(-1.4, 0, -0.2); rig.armR.el.rotation.x = 0.15;
      rig.stick.position.set(17, 31, -4);
      rig.stick.rotation.set(0, 0.9 * (1 - k), -0.3);
    } else if (hasBall && (p.scoopAnim > 0 || p.catchAnim > 0)) {
      // gather animations: scoop sweeps the turf, snag reaches up
      if (p.scoopAnim > 0) {
        const k = p.scoopAnim / 0.25;
        rig.upper.rotation.z = -0.5 * k;
        rig.armL.sh.rotation.set(-0.9, 0, 0.4); rig.armL.el.rotation.x = 0.9;
        rig.armR.sh.rotation.set(-0.7, 0, -0.3); rig.armR.el.rotation.x = 0.4;
        rig.stick.position.set(15, 8 + (1 - k) * 18, 4);
        rig.stick.rotation.set(0, -0.2, -0.6 * k);
      } else {
        const k = p.catchAnim / 0.22;
        rig.armL.sh.rotation.set(-1.6 * k - 0.4, 0, 0.5); rig.armL.el.rotation.x = 0.5;
        rig.armR.sh.rotation.set(0.3, 0, -0.3); rig.armR.el.rotation.x = 0.6;
        rig.stick.position.set(7, 30 + 10 * k, 6);
        rig.stick.rotation.set(0, -0.4, 1.0 + 0.5 * k);
      }
    } else if (hasBall) {
      // box cradle, by the biomechanics: TOP hand (R) bent ~90° brings the head up by the
      // helmet like a dumbbell curl; BOTTOM hand (L) holds the butt loose at the hip; the
      // wrist-driven rock is locked to the stride (curl opposite the lead foot).
      const cad = runK > 0.15 ? Math.sin(ph) : Math.sin(t * 6);
      const rock = cad * 0.5;
      rig.upper.rotation.y = 0.26 - Math.sin(ph) * 0.12 * runK; // bladed to protect the stick
      // top hand: upper arm up across the chest, forearm vertical, elbow ~90°
      rig.armR.sh.rotation.set(-1.9, 0.15, -0.5); rig.armR.el.rotation.x = 1.7 + rock * 0.2;
      // bottom hand: low and loose on the butt at the hip
      rig.armL.sh.rotation.set(0.4, 0, 0.6); rig.armL.el.rotation.x = 1.15;
      // stick near-vertical, head up by the right ear; wrist rock twists the shaft
      rig.stick.position.set(7, 40, 7.5);
      rig.stick.rotation.set(0.12 + rock * 0.16, -0.32, 1.42 + rock * 0.12);
    } else {
      // natural run: torso counter-rotates the stride, arms pump with bent elbows
      rig.upper.rotation.y = -Math.sin(ph) * 0.26 * runK;
      rig.armL.sh.rotation.x = Math.sin(ph) * 0.9 * runK + 0.2;
      rig.armR.sh.rotation.x = -Math.sin(ph) * 0.9 * runK + 0.2;
      rig.armL.el.rotation.x = 0.85; rig.armR.el.rotation.x = 0.85;
      rig.armL.sh.rotation.z = 0.16; rig.armR.sh.rotation.z = -0.16;
      rig.stick.position.set(10, 24, 5);
      rig.stick.rotation.set(0, -0.3, 0.55);
    }
    // athletic forward lean (skaters never stand bolt upright; stronger at sprint)
    if (!p.isGoalie && !swinging) rig.upper.rotation.z += -0.1 - runK * 0.12;
    this.updateStickTip(rig);
  },

  updateStickTip(rig) {
    rig.g.updateMatrixWorld();
    rig.stickTip.set(21, 0, 0);
    rig.stickTip.applyMatrix4(rig.stick.matrixWorld);
  },

  syncBall(game) {
    const b = game.ball;
    if ((b.state === 'carried' || b.state === 'held') && b.carrier) {
      const rig = this.rigs.get(b.carrier);
      if (rig) this.ballMesh.position.copy(rig.stickTip).add(new THREE.Vector3(0, 2, 0));
    } else {
      this.ballMesh.position.set(b.pos.x - 640, Math.max(5, b.z + 5), b.pos.y - 415);
    }
    this.ballShadow.position.set(this.ballMesh.position.x, 0.7, this.ballMesh.position.z);
    const h = clamp(this.ballMesh.position.y / 60, 0, 1);
    this.ballShadow.material.opacity = 0.38 - h * 0.2;
    this.ghostCd -= 1;
    if (b.state === 'shot' && this.ghostCd <= 0) {
      this.ghostCd = 2;
      const gh = this.ghosts[this.ghostIdx++ % this.ghosts.length];
      gh.m.position.copy(this.ballMesh.position);
      gh.life = 0.28;
    }
    for (const gh of this.ghosts) {
      gh.life = Math.max(0, gh.life - 1 / 60);
      gh.m.material.opacity = (gh.life / 0.28) * 0.45;
      gh.m.visible = gh.life > 0;
    }
  },

  syncFx(game) {
    const ps = Effects.particles;
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      if (i >= ps.length) { s.visible = false; continue; }
      const p = ps[i];
      let mat = this.spriteMats.get(p.color);
      if (!mat) { mat = new THREE.SpriteMaterial({ color: new THREE.Color(p.color), transparent: true }); this.spriteMats.set(p.color, mat); }
      s.material = mat;
      const a = 1 - p.t / p.life;
      s.material.opacity = Math.max(0, a);
      s.visible = true;
      s.position.set(p.x - 640, 8 + (p.t / p.life) * 26, p.y - 415);
      const sz = p.size * 2.2;
      s.scale.set(sz, sz, 1);
    }
    const ts = Effects.trails;
    for (let i = 0; i < this.trailQuads.length; i++) {
      const q = this.trailQuads[i];
      if (i >= ts.length) { q.visible = false; continue; }
      const tr = ts[i];
      const a = 1 - tr.t / tr.life;
      q.visible = true;
      q.material.color.set(tr.color);
      q.material.opacity = a * 0.3;
      q.position.set(tr.x - 640, 1.1 + i * 0.004, tr.y - 415);
      q.scale.setScalar(Math.max(0.2, tr.size / 5 * a));
    }
    this.reticle.visible = false;
    this.passMarker.visible = false;
    const c = game.controlled;
    if (game.mode === 'p1' && c && game.ball.carrier === c) {
      const aim = game.manualAim(c, 1 - c.team);
      if (aim) {
        const net = CONFIG.goals[1 - c.team];
        this.reticle.visible = true;
        this.reticle.position.set(net.x - 640 + net.f * 2, aim.tz, aim.ty - 415);
        this.reticle.rotation.y = Math.PI / 2;
        const pulse = 1 + Math.sin(this.t * 9) * 0.08;
        this.reticle.scale.setScalar(pulse);
      }
      const target = game.bestPassTarget(c);
      if (target) {
        this.passMarker.visible = true;
        this.passMarker.position.set(target.pos.x - 640, 66 + Math.sin(this.t * 6) * 3, target.pos.y - 415);
        this.passMarker.rotation.y = this.t * 3;
      }
    }
  },

  syncCrowd(game, dt) {
    if (game.state === 'goal' && game.stateT < 0.1) this.hype = 1;
    this.hype = Math.max(0, this.hype - dt * 0.55);
    const amp = 2 + this.hype * 9;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.crowdPts.length; i++) {
      const p = this.crowdPts[i];
      const bob = Math.max(0, Math.sin(this.t * (6 + this.hype * 5) + this.crowdPhase[i])) * amp * (0.25 + this.hype);
      m.makeTranslation(p.x - 640, p.h + bob, p.y - 415);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  },

  // Blast-style end camera: parked behind the human end, looking up-floor (+x).
  // All extents derive from CONFIG.rink so floor-size changes stay one-line.
  syncCamera(game, dt) {
    const b = game.ball;
    const rw = CONFIG.rink.w / 2, rh = CONFIG.rink.h / 2;
    const bx = clamp(b.pos.x - 640, -rw, rw);
    const bz = clamp(b.pos.y - 415, -rh, rh);
    const want = new THREE.Vector3(clamp(bx - 430, -(rw + 120), rw - 560), 352, bz * 0.28);
    const wantT = new THREE.Vector3(clamp(bx + 185, -(rw - 60), rw - 25), 10, clamp(bz * 0.62, -(rh - 80), rh - 80));
    const k = Math.min(1, dt * 3.4);
    this.camPos.lerp(want, k);
    this.camTarget.lerp(wantT, k);
    this.camera.position.copy(this.camPos);
    this.camera.position.z += Effects.shakeX * 0.8;
    this.camera.position.y += Effects.shakeY * 0.8;
    this.camera.lookAt(this.camTarget);
    this.camera.fov = 46 - Effects.zoom * 55;
    this.camera.updateProjectionMatrix();
  },

  mouseToRink(mx, my) {
    if (!this.active) return null;
    const ndc = new THREE.Vector2((mx / CONFIG.canvas.w) * 2 - 1, -((my / CONFIG.canvas.h) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, pt)) return null;
    return { x: pt.x + 640, y: pt.z + 415 };
  },

  // WYSIWYG shooting: ray vs the vertical goal plane — point at the mouth, hit that spot
  mouseToGoalPlane(mx, my, netIdx) {
    if (!this.active) return null;
    const net = CONFIG.goals[netIdx];
    const ndc = new THREE.Vector2((mx / CONFIG.canvas.w) * 2 - 1, -((my / CONFIG.canvas.h) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -(net.x - 640));
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, pt)) return null;
    return { ty: pt.z + 415, tz: pt.y };
  },

  // ---- instant replay (view-side only; the sim never pauses) ----

  snapshot(game) {
    return {
      ball: {
        x: game.ball.pos.x, y: game.ball.pos.y, z: game.ball.z, state: game.ball.state,
        carrierIdx: game.ball.carrier ? game.players.indexOf(game.ball.carrier) : -1,
      },
      players: game.players.map(p => ({
        team: p.team, idx: p.idx, isGoalie: p.isGoalie, teamDef: p.teamDef, r: p.r,
        pos: { x: p.pos.x, y: p.pos.y }, vel: { x: p.vel.x, y: p.vel.y },
        facing: p.facing, state: p.state, knockT: p.knockT, jumpZ: p.jumpZ,
        charging: p.charging, charge: p.charge, hitCd: p.hitCd, tackleT: p.tackleT,
        turboActive: false, controlled: false,
        savePose: p.savePose || 0, saveSide: p.saveSide || 1,
        scoopAnim: p.scoopAnim || 0, catchAnim: p.catchAnim || 0,
        spinT: p.spinT || 0, staggerT: p.staggerT || 0,
        __hasBall: game.ball.carrier === p,
      })),
    };
  },

  renderReplay(game, dt) {
    const rp = this.replay;
    rp.idx += dt * 60 * 0.45; // slow-mo
    if (rp.idx >= rp.frames.length || game.state !== 'goal') { this.replay = null; return; }
    const f = rp.frames[Math.floor(rp.idx)];
    f.players.forEach((proxy, i) => {
      const rig = this.rigs.get(game.players[i]);
      if (rig) this.syncRig(proxy, rig, dt);
    });
    const bp = f.ball;
    if ((bp.state === 'carried' || bp.state === 'held') && bp.carrierIdx >= 0) {
      const rig = this.rigs.get(game.players[bp.carrierIdx]);
      if (rig) this.ballMesh.position.copy(rig.stickTip).add(new THREE.Vector3(0, 2, 0));
    } else {
      this.ballMesh.position.set(bp.x - 640, Math.max(5, bp.z + 5), bp.y - 415);
    }
    this.ballShadow.position.set(this.ballMesh.position.x, 0.7, this.ballMesh.position.z);
    for (const gh of this.ghosts) gh.m.visible = false;
    for (const s of this.sprites) s.visible = false;
    for (const q of this.trailQuads) q.visible = false;
    this.reticle.visible = false;
    this.passMarker.visible = false;
    // low corner cam behind the net that just got beaten
    const rw = CONFIG.rink.w / 2;
    const side = game.ball.pos.x > 640 ? 1 : -1;
    this.camera.position.set(side * (rw + 45), 92, 165);
    this.camera.lookAt(side * (rw - 280), 24, -10);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  },

  render(game, dt) {
    if (!this.active || !game) return;
    if (game !== this.game) { this.setGame(game); this.history = []; this.replay = null; this.lastState = ''; }
    this.t += dt;
    if (!this.history) this.history = [];
    if (game.state === 'goal' && this.lastState !== 'goal' && this.history.length > 24) {
      this.replay = { frames: this.history.slice(-150), idx: 0 };
    }
    this.lastState = game.state;
    if (this.replay) { this.renderReplay(game, dt); return; }
    if (game.state === 'play' || game.state === 'goal' || game.state === 'break') {
      this.history.push(this.snapshot(game));
      if (this.history.length > 160) this.history.shift();
    }
    for (const p of game.players) {
      const rig = this.rigs.get(p);
      if (rig) this.syncRig(p, rig, dt);
    }
    this.syncBall(game);
    this.syncFx(game);
    this.syncCrowd(game, dt);
    this.syncCamera(game, dt);
    this.renderer.render(this.scene, this.camera);
  },
};
