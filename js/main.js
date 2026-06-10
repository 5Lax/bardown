// Browser boot + app state machine (title → select → game) + fixed-timestep loop.
if (HAS_DOM) (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);

  const app = {
    state: 'title',         // title | select | game
    game: null,
    attract: null,          // dimmed CPU game behind the title
    selStage: 0,            // 0 = pick your team, 1 = pick opponent
    selHome: 0, selAway: 1,
    cursor: 0,
  };

  function newSeed() { return params.get('seed') ? +params.get('seed') : ((Math.random() * 1e9) | 0); }

  function startGame(home, away) {
    app.game = new Game({ mode: params.get('test') ? 'cpu' : 'p1', home, away, seed: newSeed() });
    Effects.reset();
    BARDOWN.install(app.game);
    app.state = 'game';
    AudioSys.music(true);
    return app.game;
  }
  BARDOWN.startGame = (opts = {}) => startGame(opts.home !== undefined ? opts.home : app.selHome, opts.away !== undefined ? opts.away : app.selAway);
  BARDOWN.app = app;

  function toTitle() {
    app.state = 'title';
    AudioSys.music(false);
    if (!app.attract) {
      app.attract = new Game({ mode: 'cpu', home: 2, away: 7, seed: (Math.random() * 1e9) | 0 });
    }
  }

  const glCanvas = document.getElementById('gl');
  const use3D = !params.get('classic') && typeof Render3D !== 'undefined' && Render3D.init(glCanvas);
  Render.worldless = use3D;
  if (!use3D) glCanvas.style.display = 'none';

  function resize() {
    const pad = 30;
    const s = Math.min((innerWidth - pad) / CONFIG.canvas.w, (innerHeight - pad - 24) / CONFIG.canvas.h);
    for (const cv of [canvas, glCanvas]) {
      cv.style.width = (CONFIG.canvas.w * s) + 'px';
      cv.style.height = (CONFIG.canvas.h * s) + 'px';
    }
  }
  window.addEventListener('resize', resize);
  resize();
  Input.init(canvas);

  // ?test=1 jumps straight into a CPU game for automated checks
  if (params.get('test')) startGame(0, 1);
  else toTitle();

  function menuStep() {
    if (app.state === 'title') {
      app.attract.update(1 / 60);
      if (Input.pressed('confirm')) {
        app.state = 'select';
        app.selStage = 0;
        app.cursor = app.selHome;
        AudioSys.beep();
      }
      return;
    }
    // select
    const cols = 4;
    if (Input.pressed('left')) { app.cursor = (app.cursor + 7) % 8; AudioSys.tick(); }
    if (Input.pressed('right')) { app.cursor = (app.cursor + 1) % 8; AudioSys.tick(); }
    if (Input.pressed('up') || Input.pressed('down')) { app.cursor = (app.cursor + 4) % 8; AudioSys.tick(); }
    if (Input.pressed('back')) {
      if (app.selStage === 1) { app.selStage = 0; app.cursor = app.selHome; }
      else toTitle();
      return;
    }
    if (Input.pressed('confirm')) {
      if (app.selStage === 0) {
        app.selHome = app.cursor;
        app.selStage = 1;
        app.cursor = (app.cursor + 1) % 8;
        AudioSys.catchBall();
      } else {
        app.selAway = app.cursor === app.selHome ? (app.cursor + 1) % 8 : app.cursor;
        AudioSys.whistle();
        startGame(app.selHome, app.selAway);
      }
    }
  }

  const STEP = 1 / 120;
  let acc = 0;
  function tick(dt) {
    Input.update();
    if (Input.pressed('mute')) AudioSys.toggleMute();

    if (app.state !== 'game') {
      menuStep();
      Effects.update(dt);
      AudioSys.update(dt);
      if (use3D && app.state === 'title') Render3D.render(app.attract, dt);
      if (app.state === 'title') Render.title(ctx, app);
      else if (app.state === 'select') Render.select(ctx, app);
      return;
    }

    const game = app.game;
    if (!game.over && Input.pressed('pause')) game.paused = !game.paused;
    if (game.over) {
      if (Input.pressed('confirm')) startGame(game.homeIdx, game.awayIdx);
      else if (Input.pressed('back')) toTitle();
    }
    acc += dt * Effects.timeScale();
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      game.update(STEP);
      acc -= STEP;
      steps++;
    }
    Effects.update(dt);
    AudioSys.update(dt);
    if (use3D) Render3D.render(game, dt);
    Render.draw(ctx, game);
  }
  BARDOWN.tick = tick;
  // composite both canvases for automated screenshots
  BARDOWN.capture = (q) => {
    const t = document.createElement('canvas');
    t.width = CONFIG.canvas.w; t.height = CONFIG.canvas.h;
    const c = t.getContext('2d');
    c.fillStyle = '#0b0d12';
    c.fillRect(0, 0, t.width, t.height);
    if (use3D) c.drawImage(glCanvas, 0, 0, t.width, t.height);
    c.drawImage(canvas, 0, 0);
    return t.toDataURL('image/jpeg', q || 0.82).slice(23);
  };

  let last = performance.now(), lastFrameAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    lastFrameAt = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
  }
  requestAnimationFrame(frame);
  // watchdog: embedded webviews / occluded windows can suppress rAF entirely —
  // keep the loop alive on a timer whenever rAF goes stale
  setInterval(() => {
    const now = performance.now();
    if (now - lastFrameAt > 250) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(dt);
    }
  }, 33);
})();
