// Browser boot + app state machine (title → select → game/bracket) + fixed-timestep loop.
if (HAS_DOM) (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);

  const MODES = ['exhibition', 'p2', 'playoffs'];
  const DIFFS = ['ROOKIE', 'ARCADE', 'INSANE'];
  const app = {
    state: 'title',          // title | select | bracket | game
    mode: 'exhibition',      // exhibition | p2 | playoffs
    game: null, attract: null,
    titleCursor: 0, cursor: 0, selStage: 0,
    selHome: 0, selAway: 1, diffIdx: 1,
    bracket: null,
  };

  function newSeed() { return params.get('seed') ? +params.get('seed') : ((Math.random() * 1e9) | 0); }

  function startGame(home, away, modeOverride) {
    app.game = new Game({
      mode: modeOverride || (params.get('test') ? 'cpu' : (app.mode === 'p2' ? 'p2' : 'p1')),
      home, away, seed: newSeed(), difficulty: DIFFS[app.diffIdx],
    });
    Effects.reset();
    BARDOWN.install(app.game);
    app.state = 'game';
    AudioSys.music(true);
    return app.game;
  }
  BARDOWN.startGame = (opts = {}) => startGame(
    opts.home !== undefined ? opts.home : app.selHome,
    opts.away !== undefined ? opts.away : app.selAway,
    opts.mode);
  BARDOWN.app = app;

  function toTitle() {
    app.state = 'title';
    app.bracket = null;
    AudioSys.music(false);
    if (!app.attract) {
      app.attract = new Game({ mode: 'cpu', home: 2, away: 7, seed: (Math.random() * 1e9) | 0 });
    }
  }

  // ---- playoffs ----
  function buildBracket() {
    const others = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => i !== app.selHome);
    for (let i = others.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [others[i], others[j]] = [others[j], others[i]];
    }
    app.bracket = {
      round: 0,                                   // 0 QF, 1 SF, 2 FINAL
      rounds: [[app.selHome, ...others], [], []], // flat pair lists per round
      results: [[], [], []],
      user: app.selHome, alive: true, champion: null,
    };
  }
  function teamStrength(i) { const t = CONFIG.teams[i]; return t.spd + t.pwr + t.sht; }
  function simResult(a, b) {
    const sa = teamStrength(a), sb = teamStrength(b);
    const aWins = Math.random() < sa / (sa + sb);
    let ga = 5 + ((Math.random() * 9) | 0), gb = 5 + ((Math.random() * 9) | 0);
    if (aWins && ga <= gb) ga = gb + 1;
    if (!aWins && gb <= ga) gb = ga + 1;
    return { a, b, sa: ga, sb: gb, w: aWins ? a : b };
  }
  function advanceBracket(userWon, score) {
    const br = app.bracket;
    const teams = br.rounds[br.round], res = br.results[br.round];
    res.push({ a: teams[0], b: teams[1], sa: score[0], sb: score[1], w: userWon ? teams[0] : teams[1] });
    for (let i = 2; i < teams.length; i += 2) res.push(simResult(teams[i], teams[i + 1]));
    if (!userWon) { br.alive = false; return; }
    if (br.round === 2) { br.champion = br.user; return; }
    const winners = res.map(r => r.w).filter(w => w !== br.user);
    br.round++;
    br.rounds[br.round] = [br.user, ...winners];
  }

  function resize() {
    const pad = 30;
    const glCanvas = document.getElementById('gl');
    const s = Math.min((innerWidth - pad) / CONFIG.canvas.w, (innerHeight - pad - 24) / CONFIG.canvas.h);
    for (const cv of [canvas, glCanvas]) {
      cv.style.width = (CONFIG.canvas.w * s) + 'px';
      cv.style.height = (CONFIG.canvas.h * s) + 'px';
    }
  }
  const glCanvas = document.getElementById('gl');
  const use3D = !params.get('classic') && typeof Render3D !== 'undefined' && Render3D.init(glCanvas);
  Render.worldless = use3D;
  if (!use3D) glCanvas.style.display = 'none';
  window.addEventListener('resize', resize);
  resize();
  Input.init(canvas);

  if (params.get('test')) startGame(0, 1);
  else toTitle();

  function menuStep() {
    if (app.state === 'title') {
      app.attract.update(1 / 60);
      if (Input.pressed('up')) { app.titleCursor = (app.titleCursor + 2) % 3; AudioSys.tick(); }
      if (Input.pressed('down')) { app.titleCursor = (app.titleCursor + 1) % 3; AudioSys.tick(); }
      if (Input.pressed('confirm')) {
        app.mode = MODES[app.titleCursor];
        app.state = 'select';
        app.selStage = 0;
        app.cursor = app.selHome;
        AudioSys.beep();
      }
      return;
    }
    if (app.state === 'bracket') {
      const br = app.bracket;
      if (Input.pressed('back')) return toTitle();
      if (Input.pressed('confirm')) {
        if (!br || br.champion !== null || !br.alive) return toTitle();
        const t = br.rounds[br.round];
        app.selAway = t[1];
        startGame(t[0], t[1], 'p1');
      }
      return;
    }
    // select
    if (app.selStage === 2) {
      if (Input.pressed('left')) { app.diffIdx = (app.diffIdx + 2) % 3; AudioSys.tick(); }
      if (Input.pressed('right')) { app.diffIdx = (app.diffIdx + 1) % 3; AudioSys.tick(); }
      if (Input.pressed('back')) { app.selStage = app.mode === 'playoffs' ? 0 : 1; app.cursor = app.selStage === 0 ? app.selHome : app.selAway; return; }
      if (Input.pressed('confirm')) {
        AudioSys.whistle();
        if (app.mode === 'playoffs') { buildBracket(); app.state = 'bracket'; }
        else startGame(app.selHome, app.selAway);
      }
      return;
    }
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
        AudioSys.catchBall();
        if (app.mode === 'playoffs') { app.selStage = 2; return; }
        app.selStage = 1;
        app.cursor = (app.cursor + 1) % 8;
      } else {
        app.selAway = app.cursor === app.selHome ? (app.cursor + 1) % 8 : app.cursor;
        AudioSys.catchBall();
        if (app.mode === 'p2') { AudioSys.whistle(); startGame(app.selHome, app.selAway); }
        else app.selStage = 2;
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
      else if (app.state === 'bracket') Render.bracket(ctx, app);
      return;
    }

    const game = app.game;
    if (!game.over && Input.pressed('pause')) game.paused = !game.paused;
    if (game.over) {
      if (app.mode === 'playoffs' && app.bracket && !game.bracketDone) {
        game.bracketDone = true;
        advanceBracket(game.winner === 0, game.score);
      }
      if (Input.pressed('confirm')) {
        if (app.mode === 'playoffs') { app.state = 'bracket'; return; }
        startGame(game.homeIdx, game.awayIdx);
      } else if (Input.pressed('back')) toTitle();
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
  // watchdog: embedded webviews / occluded windows can suppress rAF entirely
  setInterval(() => {
    const now = performance.now();
    if (now - lastFrameAt > 250) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(dt);
    }
  }, 33);
})();
