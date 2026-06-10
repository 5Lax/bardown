// WebGL view layer (Three.js r147, global THREE). The 2D sim in game.js stays the
// source of truth — this maps rink coords (x,y in px, z height) onto a 3D arena:
// worldX = x-640, worldY = height, worldZ = y-415. Rigs face +X at yaw 0; yaw = -facing.
// Cosmetic Math.random only. Never call game.rng here.
const Render3D = {
  active: false,
  game: null, t: 0, hype: 0,

  init(canvas) {
    if (typeof THREE === 'undefined' || !HAS_DOM) return false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    } catch (e) { return false; }
    this.renderer.setSize(CONFIG.canvas.w, CONFIG.canvas.h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x0b0d12);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b0d12, 1150, 2300);
    this.camera = new THREE.PerspectiveCamera(42, CONFIG.canvas.w / CONFIG.canvas.h, 10, 4000);
    this.camera.position.set(0, 430, 640);
    this.camTarget = new THREE.Vector3(0, 20, 0);
    this.camPos = new THREE.Vector3(0, 430, 640);
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

  // sample the rounded-rect board path; returns [{x,y,tangentAngle}]
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
    this.netGroups = [];
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
      // netting: two sides + sloped back
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
      this.netGroups.push(grp);
    }
  },

  buildCrowd() {
    // stepped concrete terraces under the fans
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
    // shot ghost trail
    this.ghosts = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: 0 }));
      this.scene.add(m);
      this.ghosts.push({ m, life: 0 });
    }
    this.ghostIdx = 0; this.ghostCd = 0;
    // particle sprites synced from Effects.particles
    this.sprites = [];
    this.spriteMats = new Map();
    for (let i = 0; i < 240; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true }));
      s.visible = false;
      this.scene.add(s);
      this.sprites.push(s);
    }
    // floor trail quads (turbo streaks) synced from Effects.trails
    this.trailQuads = [];
    for (let i = 0; i < 120; i++) {
      const q = new THREE.Mesh(new THREE.CircleGeometry(5, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      q.rotation.x = -Math.PI / 2;
      q.visible = false;
      this.scene.add(q);
      this.trailQuads.push(q);
    }
    // aim reticle + pass marker
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
    const FW = 1480, FH = 820; // world span the floor plane covers
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 1136;
    const x = c.getContext('2d');
    const sx = c.width / FW, sy = c.height / FH;
    const X = (wx) => (wx - 640 + FW / 2) * sx, Y = (wy) => (wy - 415 + FH / 2) * sy;
    // apron
    x.fillStyle = '#14171f';
    x.fillRect(0, 0, c.width, c.height);
    // turf
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
    // mow stripes
    for (let i = 0; i < 14; i++) {
      if (i % 2) continue;
      x.fillStyle = 'rgba(255,255,255,0.025)';
      x.fillRect(X(r.x + (r.w / 14) * i), Y(r.y), (r.w / 14) * sx, r.h * sy);
    }
    const cx = CONFIG.center.x, cy = CONFIG.center.y;
    x.lineWidth = 4 * sx;
    // center line + circle
    x.strokeStyle = 'rgba(240,246,252,0.75)';
    x.beginPath(); x.moveTo(X(cx), Y(r.y)); x.lineTo(X(cx), Y(r.y + r.h)); x.stroke();
    x.beginPath(); x.ellipse(X(cx), Y(cy), 60 * sx, 60 * sy, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(240,246,252,0.8)';
    x.beginPath(); x.ellipse(X(cx), Y(cy), 6 * sx, 6 * sy, 0, 0, Math.PI * 2); x.fill();
    // creases + goal lines
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
    // floor logo
    x.save();
    x.translate(X(cx), Y(cy - 145));
    x.transform(1, 0, -0.18, 1, 0, 0);
    x.font = `900 ${64 * sx}px "Arial Black",Impact,sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.fillText('BARDOWN', 0, 0);
    x.restore();
    x.restore();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return { tex: t, FW, FH };
  },

  jerseyCanvas(td, number) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = td.color;
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = td.color2;
    x.fillRect(0, 0, 128, 26); // shoulder yoke
    x.fillStyle = td.trim;
    x.fillRect(0, 98, 128, 8);
    x.font = '900 64px "Arial Black",Impact,sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = td.color2;
    x.strokeText(String(number), 64, 64);
    x.fillStyle = '#ffffff';
    x.fillText(String(number), 64, 64);
    return new THREE.CanvasTexture(c);
  },

  // ---- player rigs ----

  NUMBERS: [4, 7, 13, 22, 88, 30],

  makeRig(p) {
    const td = p.teamDef;
    const G = p.isGoalie ? 1.0 : 1.0;
    const wide = p.isGoalie ? 1.65 : 1.0;
    const g = new THREE.Group();
    const upper = new THREE.Group();
    g.add(upper);
    const jersey = new THREE.MeshLambertMaterial({ map: this.jerseyCanvas(td, this.NUMBERS[p.idx % 6]) });
    const plain = new THREE.MeshLambertMaterial({ color: td.color });
    const dark = new THREE.MeshLambertMaterial({ color: td.color2 });
    const trim = new THREE.MeshLambertMaterial({ color: td.trim });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a06b });

    const legGeo = new THREE.BoxGeometry(p.isGoalie ? 13 : 8, 20, p.isGoalie ? 11 : 8);
    legGeo.translate(0, -10, 0);
    const legL = new THREE.Mesh(legGeo, p.isGoalie ? trim : dark);
    const legR = new THREE.Mesh(legGeo, p.isGoalie ? trim : dark);
    legL.position.set(0, 20, -6 * wide);
    legR.position.set(0, 20, 6 * wide);
    g.add(legL); g.add(legR);

    const torsoMats = [jersey, jersey, dark, dark, plain, plain]; // numbers on chest (+x) and back (-x)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(15, 22, 24 * wide), torsoMats);
    torso.position.set(0, 31, 0);
    upper.add(torso);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(19, 9, 33 * wide), plain);
    shoulders.position.set(0, 41, 0);
    upper.add(shoulders);

    const armGeo = new THREE.BoxGeometry(6.5, 18, 6.5);
    armGeo.translate(0, -8, 0);
    const armL = new THREE.Mesh(armGeo, plain);
    const armR = new THREE.Mesh(armGeo, plain);
    armL.position.set(0, 40, -17 * wide);
    armR.position.set(0, 40, 17 * wide);
    upper.add(armL); upper.add(armR);

    const head = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 12), plain);
    head.position.set(0, 51, 0);
    upper.add(head);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 10),
      new THREE.MeshLambertMaterial({ color: 0x16181d }));
    cage.position.set(7, 50, 0);
    upper.add(cage);

    // stick
    const stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 36, 6),
      new THREE.MeshLambertMaterial({ color: 0xc9cfd8 }));
    shaft.rotation.z = Math.PI / 2;
    stick.add(shaft);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(p.isGoalie ? 7.5 : 5.5, 1.2, 6, 14), trim);
    loop.position.set(20, 0, 0);
    stick.add(loop);
    const pocket = new THREE.Mesh(new THREE.CircleGeometry(p.isGoalie ? 6.6 : 4.7, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    pocket.position.set(20, 0, 0);
    stick.add(pocket);
    g.add(stick);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.15, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.6;
    this.scene.add(shadow);

    const marker = new THREE.Mesh(new THREE.ConeGeometry(5.5, 11, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    marker.rotation.x = Math.PI;
    marker.visible = false;
    this.scene.add(marker);

    g.scale.setScalar(p.isGoalie ? 1.12 : 1.18);
    this.scene.add(g);
    return { g, upper, legL, legR, armL, armR, head, stick, shadow, marker, jersey,
      phase: Math.random() * 6, launch: 0, wasDown: false, releaseT: 0, prevCharging: false, stickTip: new THREE.Vector3() };
  },

  setGame(game) {
    if (this.rigs) {
      for (const r of this.rigs.values()) {
        this.scene.remove(r.g); this.scene.remove(r.shadow); this.scene.remove(r.marker);
      }
    }
    if (this.floorMesh) this.scene.remove(this.floorMesh);
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

  syncRig(p, rig, dt) {
    const g = rig.g, t = this.t;
    const spd = Math.hypot(p.vel.x, p.vel.y);
    g.position.set(p.pos.x - 640, 0, p.pos.y - 415);
    rig.shadow.position.set(g.position.x, 0.6, g.position.z);
    rig.marker.visible = false;

    // fire glow
    const mods = this.game.getMods(p.team);
    rig.jersey.emissive = rig.jersey.emissive || new THREE.Color(0);
    rig.jersey.emissive.setHex(mods.onFire ? 0x662200 : 0x000000);
    if (mods.onFire && Math.random() < 0.25)
      Effects.burst(p.pos.x, p.pos.y, { n: 1, color: '#ff9930', spd: 40, life: 0.5, size: 3, drag: 1 });
    if (p.turboActive && Math.random() < 0.5) Effects.trail(p.pos.x, p.pos.y, p.teamDef.color, 6);

    if (p.state === 'down') {
      if (!rig.wasDown) { rig.wasDown = true; rig.launch = 0; }
      rig.launch += dt;
      const fly = Math.min(1, rig.launch / 0.3);
      const slideYaw = -Math.atan2(p.vel.y, p.vel.x || 0.01);
      g.position.y = Math.sin(Math.min(fly, 1) * Math.PI) * 15;
      g.rotation.set(0, slideYaw + (p.knockT > 0.35 ? p.knockT * 7 : 0), 0);
      g.rotateZ(1.5 * fly);
      rig.legL.rotation.set(0.5, 0, 0.25);
      rig.legR.rotation.set(-0.4, 0, -0.25);
      rig.armL.rotation.set(0, 0, 1.1);
      rig.armR.rotation.set(0, 0, -1.1);
      rig.upper.rotation.set(0, 0, 0);
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
      rig.armL.rotation.set(0, 0, 2.6);
      rig.armR.rotation.set(0, 0, -2.6);
      rig.stick.position.set(26, 14, 0);
      rig.stick.rotation.set(0, 0, 0.2);
      this.updateStickTip(rig);
      return;
    }

    // upright
    g.rotation.set(0, -p.facing, 0);
    rig.phase += spd * dt * 0.055;
    const runK = clamp(spd / 220, 0, 1);
    g.position.y = Math.abs(Math.sin(rig.phase)) * 1.6 * runK;
    g.rotateZ(-runK * 0.13 * (p.isGoalie ? 0.3 : 1)); // lean into the run
    rig.legL.rotation.z = 0;
    rig.legR.rotation.z = 0;
    rig.legL.rotation.x = Math.sin(rig.phase) * 0.75 * runK;
    rig.legR.rotation.x = -Math.sin(rig.phase) * 0.75 * runK;
    rig.upper.rotation.set(0, 0, 0);

    const hasBall = this.game.ball.carrier === p;
    const swinging = p.hitCd > CONFIG.hit.cooldown - 0.18;
    if (rig.prevCharging && !p.charging) rig.releaseT = 0.18;
    rig.prevCharging = p.charging;
    rig.releaseT = Math.max(0, rig.releaseT - dt);

    if (p.isGoalie) {
      // crouched stance, paddle down; spread on incoming shots
      const ball = this.game.ball;
      const threat = ball.state === 'shot' && ball.shot && ball.shot.net === p.team &&
        dist(ball.pos.x, ball.pos.y, p.pos.x, p.pos.y) < 300;
      rig.upper.rotation.z = -0.18;
      rig.armL.rotation.z = threat ? 2.2 : 0.7;
      rig.armR.rotation.z = threat ? -2.2 : -0.7;
      rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
      rig.legL.rotation.z = threat ? 0.55 : 0.18;
      rig.legR.rotation.z = threat ? -0.55 : -0.18;
      rig.stick.position.set(13, threat ? 16 : 6, 8);
      rig.stick.rotation.set(0, 0, threat ? 0.4 : -1.1);
    } else if (swinging) {
      // cross-check thrust
      rig.upper.rotation.z = -0.3;
      rig.armL.rotation.set(0, 0, 1.5);
      rig.armR.rotation.set(0, 0, -1.5);
      rig.stick.position.set(15, 30, 0);
      rig.stick.rotation.set(0, Math.PI / 2, 0);
    } else if (p.charging) {
      const wind = 0.45 + p.charge * 0.9;
      rig.upper.rotation.y = wind * 0.5;
      rig.armL.rotation.set(0.3, 0, 0.5);
      rig.armR.rotation.set(-0.5, 0, -0.6);
      rig.stick.position.set(-4, 33, 9);
      rig.stick.rotation.set(0, -wind, 0.25);
    } else if (rig.releaseT > 0) {
      const k = rig.releaseT / 0.18;
      rig.upper.rotation.y = -0.5 * (1 - k);
      rig.armL.rotation.set(0, 0, 0.4);
      rig.armR.rotation.set(-1.2, 0, 0);
      rig.stick.position.set(17, 30, -4);
      rig.stick.rotation.set(0, 0.9 * (1 - k), -0.3);
    } else if (hasBall) {
      // cradle
      const rock = Math.sin(t * 6.5) * 0.14;
      rig.armL.rotation.set(0.5 + rock * 0.4, 0, 0.3);
      rig.armR.rotation.set(0.3, 0, -0.5);
      rig.stick.position.set(10, 28, 6);
      rig.stick.rotation.set(rock, -0.35, 0.35 + rock * 0.3);
    } else {
      rig.armL.rotation.set(Math.sin(rig.phase) * 0.3 * runK + 0.25, 0, 0.22);
      rig.armR.rotation.set(-Math.sin(rig.phase) * 0.3 * runK + 0.25, 0, -0.22);
      rig.stick.position.set(11, 24, 5);
      rig.stick.rotation.set(0, -0.3, 0.5);
    }
    this.updateStickTip(rig);

    if (p.controlled && this.game.mode === 'p1') {
      rig.marker.visible = true;
      rig.marker.position.set(g.position.x, 70 + Math.sin(t * 5) * 3, g.position.z);
      rig.marker.rotation.y = t * 2;
    }
  },

  updateStickTip(rig) {
    rig.g.updateMatrixWorld();
    rig.stickTip.set(20, 0, 0);
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
    // shot ghosts
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
    // particles → sprites
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
    // floor trails
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
    // aim reticle + pass marker
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
        this.passMarker.position.set(target.pos.x - 640, 62 + Math.sin(this.t * 6) * 3, target.pos.y - 415);
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

  syncCamera(game, dt) {
    const b = game.ball;
    const bx = clamp(b.pos.x - 640, -600, 600);
    const bz = clamp(b.pos.y - 415, -275, 275);
    const px = clamp(bx * 0.6, -285, 285);
    const want = new THREE.Vector3(px, 348, 588 + bz * 0.12);
    const wantT = new THREE.Vector3(clamp(bx * 0.85, -345, 345), 10, bz * 0.45);
    const k = Math.min(1, dt * 3.2);
    this.camPos.lerp(want, k);
    this.camTarget.lerp(wantT, k);
    this.camera.position.copy(this.camPos);
    this.camera.position.x += Effects.shakeX * 0.8;
    this.camera.position.y += Effects.shakeY * 0.8;
    this.camera.lookAt(this.camTarget);
    this.camera.fov = 39 - Effects.zoom * 55;
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

  render(game, dt) {
    if (!this.active || !game) return;
    if (game !== this.game) this.setGame(game);
    this.t += dt;
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
