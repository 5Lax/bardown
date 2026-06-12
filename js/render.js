// All drawing. Render NEVER calls game.rng (would desync the deterministic sim).
// worldless=true → 3D renderer owns the world; this canvas draws UI/popups/menus only.
const Render = {
  worldless: false,
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  draw(ctx, game) {
    const C = CONFIG.canvas;
    if (this.worldless) {
      ctx.clearRect(0, 0, C.w, C.h);
    } else {
      ctx.fillStyle = '#11141b';
      ctx.fillRect(0, 0, C.w, C.h);
      ctx.save();
      // the rink is bigger than the canvas now — fit-scale the classic 2D world view
      const fit = Math.min((C.w - 20) / (CONFIG.rink.w + 60), (C.h - 130) / (CONFIG.rink.h + 40));
      this.classicScale = fit;
      const z = (1 + Effects.zoom) * fit;
      ctx.translate(C.w / 2, (C.h + 110) / 2);
      ctx.scale(z, z);
      ctx.translate(-CONFIG.center.x + Effects.shakeX, -CONFIG.center.y + Effects.shakeY);
      this.rink(ctx, game);
      this.trails(ctx);
      for (const p of game.players) if (p !== game.ball.carrier) this.player(ctx, game, p);
      if (game.ball.carrier) this.player(ctx, game, game.ball.carrier);
      this.ballDraw(ctx, game);
      this.particles(ctx);
      ctx.restore();
    }
    this.hud(ctx, game);
    this.popups(ctx);
    // the color analyst's line, closed-caption style
    if (Effects.boothSub) {
      const a = Math.min(1, Effects.boothSub.t / 0.5);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'italic 700 19px Georgia,serif';
      const text = '“' + Effects.boothSub.text + '”';
      const w = ctx.measureText(text).width + 36;
      this.rr(ctx, (C.w - w) / 2, C.h - 64, w, 34, 9);
      ctx.fillStyle = 'rgba(8,10,14,0.7)';
      ctx.fill();
      ctx.fillStyle = '#cfd8e4';
      ctx.fillText(text, C.w / 2, C.h - 47);
      ctx.restore();
    }
    if (Effects.flashA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Effects.flashA.toFixed(3)})`;
      ctx.fillRect(0, 0, C.w, C.h);
    }
    this.overlays(ctx, game);
  },

  rink(ctx, game) {
    const r = CONFIG.rink;
    // floor
    this.rr(ctx, r.x, r.y, r.w, r.h, r.corner);
    const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, '#262c36');
    grad.addColorStop(0.5, '#2c333f');
    grad.addColorStop(1, '#262c36');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // center line + circle
    const c = CONFIG.center;
    ctx.strokeStyle = 'rgba(232,238,245,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(c.x, r.y); ctx.lineTo(c.x, r.y + r.h); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(232,238,245,0.35)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
    // BARDOWN floor logo
    ctx.font = 'italic 900 44px "Arial Black",Impact,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(232,238,245,0.05)';
    ctx.fillText('B A R D O W N', c.x, c.y - 140);
    // creases + nets
    for (const net of CONFIG.goals) {
      const td = game.teamDefs[net.i];
      ctx.fillStyle = this.alpha(td.color, 0.13);
      ctx.beginPath(); ctx.arc(net.x, net.cy, CONFIG.crease.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = this.alpha(td.color, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(net.x, net.cy, CONFIG.crease.r, 0, Math.PI * 2); ctx.stroke();
      this.net(ctx, game, net);
    }
    ctx.restore();
    // boards
    this.rr(ctx, r.x, r.y, r.w, r.h, r.corner);
    ctx.strokeStyle = '#9fb0c0';
    ctx.lineWidth = 5;
    ctx.stroke();
    this.rr(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, r.corner + 5);
    ctx.strokeStyle = 'rgba(159,176,192,0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();
  },

  net(ctx, game, net) {
    const half = CONFIG.net.mouthW / 2, dep = CONFIG.net.depth;
    const box = game.netBoxes[net.i];
    ctx.fillStyle = 'rgba(232,238,245,0.07)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(232,238,245,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = box.x + (box.w / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
      const y = box.y + (box.h / 4) * i;
      ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
    }
    // goal line
    ctx.strokeStyle = '#ff5050';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(net.x, net.cy - half); ctx.lineTo(net.x, net.cy + half); ctx.stroke();
    // posts
    ctx.fillStyle = '#e8eef5';
    for (const py of [net.cy - half, net.cy + half]) {
      ctx.beginPath(); ctx.arc(net.x, py, CONFIG.net.postR, 0, Math.PI * 2); ctx.fill();
    }
  },

  player(ctx, game, p) {
    if (p.state === 'benched') {
      ctx.fillStyle = this.alpha(p.teamDef.color, 0.5);
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.r * 0.8, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const td = p.teamDef;
    const mods = game.getMods(p.team);
    // turbo trail + fire glow (cosmetic, spawned at render time)
    if (p.turboActive && Math.random() < 0.55) Effects.trail(p.pos.x, p.pos.y, td.color, p.r * 0.6);
    if (mods.onFire && Math.random() < 0.3)
      Effects.burst(p.pos.x, p.pos.y - 6, { n: 1, color: Math.random() < 0.5 ? '#ff9930' : '#ffd24a', spd: 50, life: 0.5, size: 3, drag: 1 });
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y + 4, p.r * 0.95, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();

    if (p.state === 'down') {
      const spin = p.knockT * 9;
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(spin);
      ctx.fillStyle = td.color;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.25, p.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = td.color2; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      // dizzy stars
      ctx.fillStyle = 'rgba(255,255,160,0.9)';
      const a = p.knockT * 7;
      for (let i = 0; i < 3; i++) {
        const aa = a + i * 2.1;
        ctx.fillRect(p.pos.x + Math.cos(aa) * 16 - 1.5, p.pos.y - 18 + Math.sin(aa) * 5 - 1.5, 3, 3);
      }
      return;
    }
    if (p.state === 'diving') {
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(Math.atan2(p.vel.y, p.vel.x));
      ctx.fillStyle = td.color;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.5, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = td.color2; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      return;
    }
    // goalie pads
    if (p.isGoalie) {
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.facing + Math.PI / 2);
      ctx.fillStyle = td.trim;
      this.rr(ctx, -CONFIG.goalie.coverW * 0.42, -7, CONFIG.goalie.coverW * 0.84, 14, 6);
      ctx.fill();
      ctx.restore();
    }
    // body
    ctx.fillStyle = mods.onFire ? this.mix(td.color, '#ff9930', 0.5 + 0.5 * Math.sin(performance.now() / 90)) : td.color;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = td.color2;
    ctx.lineWidth = 3;
    ctx.stroke();
    // stick
    const sx = p.pos.x + Math.cos(p.facing) * (p.r + 11);
    const sy = p.pos.y + Math.sin(p.facing) * (p.r + 11);
    ctx.strokeStyle = td.trim;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.pos.x + Math.cos(p.facing) * p.r * 0.4, p.pos.y + Math.sin(p.facing) * p.r * 0.4); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.stroke();
    // controlled marker
    if (p.controlled) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.pos.x, p.pos.y - p.r - 16);
      ctx.lineTo(p.pos.x - 6, p.pos.y - p.r - 25);
      ctx.lineTo(p.pos.x + 6, p.pos.y - p.r - 25);
      ctx.closePath(); ctx.fill();
    }
    // charge bar
    if (p.charging && p.charge > 0.02) {
      const w = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.pos.x - w / 2, p.pos.y - p.r - 14, w, 6);
      ctx.fillStyle = p.charge > 0.85 ? '#ff4040' : '#ffd24a';
      ctx.fillRect(p.pos.x - w / 2 + 1, p.pos.y - p.r - 13, (w - 2) * p.charge, 4);
    }
  },

  ballDraw(ctx, game) {
    const b = game.ball;
    if (b.state === 'carried' || b.state === 'held') {
      const c = b.carrier;
      if (!c) return;
      const sx = c.pos.x + Math.cos(c.facing) * (c.r + 11);
      const sy = c.pos.y + Math.sin(c.facing) * (c.r + 11);
      ctx.fillStyle = '#ff8c1a';
      ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, Math.PI * 2); ctx.fill();
      // pass target hint for the human carrier
      if (c.controlled && game.mode !== 'cpu') {
        const t = game.bestPassTarget(c);
        if (t) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.moveTo(t.pos.x, t.pos.y - t.r - 12);
          ctx.lineTo(t.pos.x - 5, t.pos.y - t.r - 20);
          ctx.lineTo(t.pos.x + 5, t.pos.y - t.r - 20);
          ctx.closePath(); ctx.fill();
        }
        const at = game.manualAim(c, 1 - c.team);
        if (at) {
          const net = CONFIG.goals[1 - c.team];
          ctx.strokeStyle = 'rgba(255,140,26,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(net.x, at.ty, 5 + (at.tz / 58) * 9, 0, Math.PI * 2); ctx.stroke();
        }
      }
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(b.pos.x, b.pos.y + 3 + b.z * 0.18, 6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    const br = 7 * (1 + b.z * 0.006);
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y - b.z * 0.55, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a2d00';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },

  trails(ctx) {
    for (const t of Effects.trails) {
      const a = 1 - t.t / t.life;
      ctx.fillStyle = this.alpha(t.color, a * 0.3);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.size * a, 0, Math.PI * 2); ctx.fill();
    }
  },
  particles(ctx) {
    for (const p of Effects.particles) {
      const a = 1 - p.t / p.life;
      ctx.fillStyle = this.alpha(p.color, Math.max(0, a));
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  },

  hud(ctx, game) {
    const C = CONFIG.canvas, cx = C.w / 2;
    // scoreboard panel
    ctx.save();
    this.rr(ctx, cx - 360, 10, 720, 96, 14);
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,176,192,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const td0 = game.teamDefs[0], td1 = game.teamDefs[1];
    ctx.textBaseline = 'middle';
    // team chips
    for (const [t, td, x, align] of [[0, td0, cx - 340, 'left'], [1, td1, cx + 340, 'right']]) {
      ctx.fillStyle = td.color;
      ctx.fillRect(align === 'left' ? x : x - 14, 24, 14, 68);
      ctx.font = '900 26px "Arial Black",Impact,sans-serif';
      ctx.textAlign = align;
      ctx.fillStyle = game.fire[t] ? '#ff9930' : '#e8eef5';
      ctx.fillText(td.name, align === 'left' ? x + 24 : x - 24, 40);
      ctx.font = '900 44px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(game.score[t]), align === 'left' ? x + 24 : x - 24, 78);
      if (game.fire[t]) {
        ctx.font = '700 13px Arial';
        ctx.fillStyle = '#ff9930';
        ctx.fillText('ON FIRE', align === 'left' ? x + 90 : x - 90, 78);
      }
      if (game.possession === t && game.state === 'play') {
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath(); ctx.arc(align === 'left' ? x + 14 : x - 14, 100, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // game clock
    ctx.textAlign = 'center';
    ctx.font = '700 16px Arial';
    ctx.fillStyle = '#9fb0c0';
    ctx.fillText(game.ot ? 'OVERTIME' : 'QUARTER ' + game.quarter, cx, 30);
    ctx.font = '900 34px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = '#e8eef5';
    ctx.fillText(game.ot ? 'OT' : fmtClock(game.clock), cx, 60);
    // shot clock box
    const scActive = game.possession >= 0 && game.state === 'play';
    const sc = Math.max(0, Math.ceil(game.shotClock));
    const low = scActive && game.shotClock <= CONFIG.clockCfg.beepAt;
    this.rr(ctx, cx - 32, 74, 64, 28, 6);
    ctx.fillStyle = low && Math.floor(game.time * 4) % 2 === 0 ? 'rgba(255,40,40,0.85)' : 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.font = '900 21px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = low ? '#ffffff' : '#ff5050';
    ctx.fillText(scActive ? String(sc) : '–', cx, 89);
    // power play badge
    if (game.powerPlay) {
      const td = game.teamDefs[game.powerPlay.team];
      ctx.font = '900 17px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = td.color;
      ctx.fillText('POWER PLAY ' + fmtClock(game.powerPlay.t), cx, 122);
    }
    // turbo meter (controlled player)
    const p = game.controlled;
    if (p && game.mode === 'p1' && game.turboEnabled) {
      const x = 30, y = C.h - 44, w = 190;
      ctx.textAlign = 'left';
      ctx.font = '900 14px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#9fb0c0';
      ctx.fillText('TURBO', x, y - 12);
      this.rr(ctx, x, y, w, 14, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      const frac = game.getMods(p.team).onFire ? 1 : p.turbo / CONFIG.player.turboMax;
      if (frac > 0.02) {
        this.rr(ctx, x + 2, y + 2, (w - 4) * frac, 10, 5);
        ctx.fillStyle = game.getMods(p.team).onFire ? '#ff9930' : (frac < 0.25 ? '#ff5050' : '#4fd6ff');
        ctx.fill();
      }
    }
    ctx.restore();
  },

  popups(ctx) {
    const C = CONFIG.canvas;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let stack = 0;
    for (const p of Effects.popups) {
      const inT = Math.min(1, p.t / 0.12);
      const scale = 0.4 + 0.6 * (1 - Math.pow(1 - inT, 3)) + (p.t < 0.2 ? 0 : Math.sin(p.t * 3) * 0.01);
      const fade = p.t > p.life * 0.72 ? 1 - (p.t - p.life * 0.72) / (p.life * 0.28) : 1;
      ctx.save();
      ctx.translate(C.w / 2, p.y + stack);
      ctx.rotate(p.rot);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.font = `italic 900 ${p.size}px "Arial Black",Impact,sans-serif`;
      ctx.lineWidth = p.size / 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      if (p.sub) {
        ctx.font = '700 18px Arial';
        ctx.lineWidth = 4;
        ctx.strokeText(p.sub, 0, p.size * 0.75);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.sub, 0, p.size * 0.75);
      }
      ctx.restore();
      stack += p.size * 0.95 + 8;
    }
    ctx.restore();
  },

  overlays(ctx, game) {
    const C = CONFIG.canvas, cx = C.w / 2, cy = C.h / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (typeof Render3D !== 'undefined' && Render3D.replay) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, C.w, 52);
      ctx.fillRect(0, C.h - 52, C.w, 52);
      ctx.font = '900 24px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#ff3b30';
      const blink = Math.floor(performance.now() / 400) % 2 === 0;
      ctx.fillText((blink ? '● ' : '   ') + 'REPLAY', C.w - 130, C.h - 26);
    }
    if (game.state === 'faceoff') {
      ctx.font = '900 40px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#e8eef5';
      ctx.fillText('FACEOFF', cx, cy - 90);
      if (game.faceoffBattle) {
        const fb = game.faceoffBattle;
        if (!fb.go) {
          ctx.font = '900 30px "Arial Black",Impact,sans-serif';
          ctx.fillStyle = '#ffd24a';
          ctx.fillText('READY…', cx, cy - 50);
        } else {
          ctx.font = '900 34px "Arial Black",Impact,sans-serif';
          ctx.fillStyle = '#ff5050';
          ctx.fillText('MASH SPACE / CLICK!', cx, cy - 50);
          const w = 200;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(cx - w - 10, cy + 56, w, 12);
          ctx.fillRect(cx + 10, cy + 56, w, 12);
          ctx.fillStyle = game.teamDefs[game.humanTeam].color;
          ctx.fillRect(cx - 10 - Math.min(w, fb.mashes * 14), cy + 56, Math.min(w, fb.mashes * 14), 12);
          ctx.fillStyle = game.teamDefs[1 - game.humanTeam].color;
          ctx.fillRect(cx + 10, cy + 56, Math.min(w, fb.cpu * 14), 12);
        }
      }
    }
    if (game.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, C.w, C.h);
      ctx.font = '900 56px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#e8eef5';
      ctx.fillText('PAUSED', cx, cy - 20);
      ctx.font = '700 18px Arial';
      ctx.fillStyle = '#9fb0c0';
      ctx.fillText('P resume · M mute', cx, cy + 28);
    }
    if (game.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, C.w, C.h);
      const w = game.winner;
      ctx.font = '900 56px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('FINAL', cx, 120);
      ctx.font = '900 42px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = '#e8eef5';
      ctx.fillText(`${game.teamDefs[0].name} ${game.score[0]} — ${game.score[1]} ${game.teamDefs[1].name}`, cx, 180);
      if (w >= 0) {
        ctx.font = '900 28px "Arial Black",Impact,sans-serif';
        ctx.fillStyle = game.teamDefs[w].color;
        ctx.fillText(game.teamDefs[w].city + ' ' + game.teamDefs[w].name + ' WIN!', cx, 226);
      } else {
        ctx.font = '900 28px "Arial Black",Impact,sans-serif';
        ctx.fillStyle = '#9fb0c0';
        ctx.fillText('DEAD EVEN.', cx, 226);
      }
      const rows = [
        ['SHOTS', game.stats.shots], ['SAVES', game.stats.saves], ['HITS', game.stats.hits],
        ['BARDOWNS', game.stats.bardowns], ['SPECIALS', game.stats.specials], ['STEALS', game.stats.steals],
        ['BIGGEST LEAD', game.stats.biggestLead],
      ];
      let y = 286;
      ctx.font = '900 20px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = game.teamDefs[0].color; ctx.fillText(game.teamDefs[0].name, cx - 220, y);
      ctx.fillStyle = game.teamDefs[1].color; ctx.fillText(game.teamDefs[1].name, cx + 220, y);
      y += 36;
      for (const [label, vals] of rows) {
        ctx.font = '700 17px Arial';
        ctx.fillStyle = '#9fb0c0';
        ctx.fillText(label, cx, y);
        ctx.font = '900 19px "Arial Black",Impact,sans-serif';
        ctx.fillStyle = '#e8eef5';
        ctx.fillText(String(vals[0]), cx - 220, y);
        ctx.fillText(String(vals[1]), cx + 220, y);
        y += 31;
      }
      ctx.font = '700 19px Arial';
      ctx.fillStyle = '#9fb0c0';
      const playoffs = typeof BARDOWN !== 'undefined' && BARDOWN.app && BARDOWN.app.mode === 'playoffs';
      ctx.fillText(playoffs ? 'ENTER — back to the bracket' : 'ENTER — rematch    ·    ESC — menu', cx, y + 26);
    }
    if (game.mode === 'cpu') {
      ctx.font = '700 13px Arial';
      ctx.fillStyle = 'rgba(159,176,192,0.7)';
      ctx.fillText('CPU vs CPU', cx, C.h - 14);
    }
    if (AudioSys.muted && !game.over && !game.paused) {
      ctx.font = '700 13px Arial';
      ctx.fillStyle = 'rgba(159,176,192,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText('🔇 M = sound on', C.w - 16, C.h - 14);
      ctx.textAlign = 'center';
    }
  },

  title(ctx, app) {
    const C = CONFIG.canvas, cx = C.w / 2;
    this.draw(ctx, app.attract);
    ctx.fillStyle = this.worldless ? 'rgba(8,10,14,0.62)' : 'rgba(8,10,14,0.8)';
    ctx.fillRect(0, 0, C.w, C.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const t = performance.now() / 1000;
    ctx.save();
    ctx.translate(cx, 240);
    ctx.transform(1, 0, -0.18, 1, 0, 0); // speed-skew
    ctx.font = '900 148px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('BARDOWN', 6, 8);
    const grad = ctx.createLinearGradient(0, -70, 0, 70);
    grad.addColorStop(0, '#ffd24a');
    grad.addColorStop(0.55, '#ff7a1a');
    grad.addColorStop(1, '#ff3355');
    ctx.fillStyle = grad;
    ctx.fillText('BARDOWN', 0, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.strokeText('BARDOWN', 0, 0);
    ctx.restore();
    ctx.font = '900 26px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = '#7fd0ff';
    ctx.fillText('ARCADE  BOX  LACROSSE', cx, 330);
    const items = ['EXHIBITION', '2 PLAYER  (P2 on gamepad)', 'PLAYOFFS'];
    ctx.font = '900 26px "Arial Black",Impact,sans-serif';
    items.forEach((label, i) => {
      const sel = i === app.titleCursor;
      ctx.globalAlpha = sel ? 0.7 + 0.3 * Math.sin(t * 5) : 0.55;
      ctx.fillStyle = sel ? '#ffffff' : '#9fb0c0';
      ctx.fillText((sel ? '▶  ' : '') + label, cx, 398 + i * 36);
    });
    ctx.globalAlpha = 1;
    ctx.font = '700 15px Arial';
    ctx.fillStyle = '#9fb0c0';
    const rows = [
      'W attacks the far net · ASD run around it · mouse aims · always turbo',
      'LEFT-CLICK: tap = PASS (switch on D) · hold = power up, release = RIP IT',
      'RIGHT-CLICK check · DOUBLE R-CLICK flying tackle · SPACE jump · E call a cut',
      'SHIFT tap = SPIN DODGE · SHIFT + click = SAUCER PASS over the defense',
      'shoot mid-air = JUMP SHOT · charging + tap R-CLICK = showtime',
      'release at full sprint near the crease = DIVE · hold G = goalie',
    ];
    rows.forEach((s, i) => ctx.fillText(s, cx, 536 + i * 22));
    ctx.font = '700 13px Arial';
    ctx.fillStyle = 'rgba(159,176,192,0.6)';
    ctx.fillText('30-second shot clock · hit anyone, anytime · 3 unanswered = ON FIRE', cx, 650);
  },

  select(ctx, app) {
    const C = CONFIG.canvas, cx = C.w / 2;
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, C.w, C.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (app.selStage === 2) return this.difficulty(ctx, app);
    ctx.font = '900 44px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = app.selStage === 0 ? '#4fd6ff' : '#ff5050';
    const headers = app.mode === 'p2'
      ? ['PLAYER 1 — PICK YOUR SQUAD', 'PLAYER 2 — PICK YOUR SQUAD']
      : ['PICK YOUR SQUAD', 'PICK THE ENEMY'];
    ctx.fillText(headers[app.selStage], cx, 70);
    const cw = 268, ch = 168, gap = 18;
    const x0 = cx - (cw * 4 + gap * 3) / 2, y0 = 130;
    for (let i = 0; i < 8; i++) {
      const td = CONFIG.teams[i];
      const x = x0 + (i % 4) * (cw + gap), y = y0 + Math.floor(i / 4) * (ch + gap);
      this.rr(ctx, x, y, cw, ch, 12);
      ctx.fillStyle = td.color2;
      ctx.fill();
      ctx.strokeStyle = i === app.cursor ? '#ffffff' : 'rgba(159,176,192,0.3)';
      ctx.lineWidth = i === app.cursor ? 4 : 2;
      ctx.stroke();
      ctx.fillStyle = td.color;
      ctx.fillRect(x + 14, y + 14, 34, ch - 28);
      ctx.textAlign = 'left';
      ctx.font = '700 14px Arial';
      ctx.fillStyle = '#9fb0c0';
      ctx.fillText(td.city, x + 62, y + 34);
      ctx.font = `900 ${td.name.length > 10 ? 17 : 23}px "Arial Black",Impact,sans-serif`;
      ctx.fillStyle = '#e8eef5';
      ctx.fillText(td.name, x + 62, y + 62);
      const bars = [['SPD', td.spd], ['PWR', td.pwr], ['SHT', td.sht]];
      bars.forEach(([lab, v], bi) => {
        const by = y + 92 + bi * 22;
        ctx.font = '700 12px Arial';
        ctx.fillStyle = '#9fb0c0';
        ctx.fillText(lab, x + 62, by + 5);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 100, by, 140, 10);
        ctx.fillStyle = td.color;
        ctx.fillRect(x + 100, by, 140 * clamp((v - 0.88) / 0.24, 0.08, 1), 10);
      });
      if (app.selStage === 1 && i === app.selHome) {
        ctx.textAlign = 'center';
        ctx.font = '900 16px "Arial Black",Impact,sans-serif';
        ctx.fillStyle = '#4fd6ff';
        ctx.fillText('— YOU —', x + cw / 2, y + ch - 14);
      }
      ctx.textAlign = 'center';
    }
    ctx.font = '700 18px Arial';
    ctx.fillStyle = '#9fb0c0';
    ctx.fillText('WASD / arrows move · ENTER select · ESC back', cx, 680);
  },

  difficulty(ctx, app) {
    const C = CONFIG.canvas, cx = C.w / 2;
    ctx.font = '900 44px "Arial Black",Impact,sans-serif';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('HOW MUCH PAIN?', cx, 110);
    const cards = [
      ['ROOKIE', 'goalie naps on your shots · CPU pulls its punches', '#39ff6a'],
      ['ARCADE', 'the intended BARDOWN experience', '#4fd6ff'],
      ['INSANE', 'no mercy · CPU hunts you · goalie is awake', '#ff3355'],
    ];
    const cw = 320, ch = 200, gap = 30;
    const x0 = cx - (cw * 3 + gap * 2) / 2;
    cards.forEach(([name, blurb, color], i) => {
      const x = x0 + i * (cw + gap), y = 220;
      this.rr(ctx, x, y, cw, ch, 14);
      ctx.fillStyle = 'rgba(10,12,18,0.85)';
      ctx.fill();
      ctx.strokeStyle = i === app.diffIdx ? '#ffffff' : 'rgba(159,176,192,0.3)';
      ctx.lineWidth = i === app.diffIdx ? 4 : 2;
      ctx.stroke();
      ctx.font = '900 34px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(name, x + cw / 2, y + 64);
      ctx.font = '700 15px Arial';
      ctx.fillStyle = '#9fb0c0';
      const words = blurb.split(' · ');
      words.forEach((w, wi) => ctx.fillText(w, x + cw / 2, y + 112 + wi * 24));
    });
    ctx.font = '700 18px Arial';
    ctx.fillStyle = '#9fb0c0';
    ctx.fillText('A / D pick · ENTER ' + (app.mode === 'playoffs' ? 'start the playoffs' : 'face off') + ' · ESC back', cx, 560);
  },

  bracket(ctx, app) {
    const C = CONFIG.canvas, cx = C.w / 2;
    const br = app.bracket;
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, C.w, C.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!br) return;
    ctx.font = '900 44px "Arial Black",Impact,sans-serif';
    if (br.champion !== null) {
      const td = CONFIG.teams[br.champion];
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('🏆  CHAMPIONS  🏆', cx, 90);
      ctx.font = '900 56px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = td.color;
      ctx.fillText(td.city + ' ' + td.name, cx, 160);
      if (Math.random() < 0.12) Effects.burst(640 + (Math.random() - 0.5) * 700, 415 + (Math.random() - 0.5) * 200, { n: 14, color: Math.random() < 0.5 ? td.color : '#ffd24a', spd: 300, life: 1.0 });
    } else if (!br.alive) {
      ctx.fillStyle = '#ff5050';
      ctx.fillText('ELIMINATED', cx, 90);
      ctx.font = '700 20px Arial';
      ctx.fillStyle = '#9fb0c0';
      ctx.fillText('the ' + CONFIG.teams[br.user].name + ' go home early', cx, 135);
    } else {
      ctx.fillStyle = '#4fd6ff';
      ctx.fillText(['QUARTERFINALS', 'SEMIFINALS', 'THE CHAMPIONSHIP'][br.round], cx, 90);
    }
    // columns: QF, SF, F
    const colX = [240, 640, 1040];
    const titles = ['QUARTERFINALS', 'SEMIS', 'FINAL'];
    for (let r = 0; r < 3; r++) {
      ctx.font = '900 17px "Arial Black",Impact,sans-serif';
      ctx.fillStyle = 'rgba(159,176,192,0.7)';
      ctx.fillText(titles[r], colX[r], 200);
      const teams = br.rounds[r], res = br.results[r];
      const pairs = Math.max(teams.length / 2, res.length);
      for (let m = 0; m < pairs; m++) {
        const a = res[m] ? res[m].a : teams[m * 2];
        const b = res[m] ? res[m].b : teams[m * 2 + 1];
        if (a === undefined || b === undefined) continue;
        const y = 250 + m * (r === 0 ? 105 : r === 1 ? 210 : 0) + (r === 1 ? 50 : r === 2 ? 155 : 0);
        const mine = (a === br.user || b === br.user) && r === br.round && !res[m];
        this.rr(ctx, colX[r] - 160, y - 34, 320, 78, 10);
        ctx.fillStyle = 'rgba(10,12,18,0.85)';
        ctx.fill();
        ctx.strokeStyle = mine ? '#ffd24a' : 'rgba(159,176,192,0.25)';
        ctx.lineWidth = mine ? 3 : 1.5;
        ctx.stroke();
        for (const [slot, ti] of [[0, a], [1, b]]) {
          const td = CONFIG.teams[ti];
          const yy = y - 14 + slot * 32;
          ctx.fillStyle = td.color;
          ctx.fillRect(colX[r] - 148, yy - 9, 9, 20);
          ctx.textAlign = 'left';
          ctx.font = '900 16px "Arial Black",Impact,sans-serif';
          const won = res[m] && res[m].w === ti;
          ctx.fillStyle = res[m] ? (won ? '#ffffff' : 'rgba(159,176,192,0.55)') : '#e8eef5';
          ctx.fillText(td.name + (ti === br.user ? ' ★' : ''), colX[r] - 128, yy);
          if (res[m]) {
            ctx.textAlign = 'right';
            ctx.fillText(String(slot === 0 ? res[m].sa : res[m].sb), colX[r] + 142, yy);
          }
          ctx.textAlign = 'center';
        }
      }
    }
    ctx.font = '700 19px Arial';
    ctx.fillStyle = '#9fb0c0';
    ctx.fillText(br.champion !== null || !br.alive ? 'ENTER — back to title' : 'ENTER — play your matchup · ESC quit', cx, 690);
  },

  alpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
  },
  mix(h1, h2, t) {
    const c1 = [1, 3, 5].map(i => parseInt(h1.slice(i, i + 2), 16));
    const c2 = [1, 3, 5].map(i => parseInt(h2.slice(i, i + 2), 16));
    const m = c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  },
};
