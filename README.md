# BARDOWN — Arcade Box Lacrosse

NFL Blitz meets box lacrosse. 5v5 plus goalies, 30-second shot clock, hit anyone anytime, ON FIRE mode, desperation comebacks, dive shots, and goals in off the iron. Low-poly 3D arena with procedurally-built players (Three.js), zero art assets, all sound synthesized in Web Audio. Add `?classic=1` for the original 2D view.

**▶ Play: https://5lax.github.io/bardown/**

![BARDOWN goal celebration](tools/shot-goal.jpg)

## Controls

| Action | Keyboard / Mouse | Gamepad |
|---|---|---|
| Run | WASD | Left stick |
| Aim | Mouse (or arrows) | Right stick |
| Pass / switch on D | SPACE | A |
| Shoot (hold = power) | J or Left-click | X |
| Check / hit | K or Right-click | B |
| Turbo | SHIFT | RT |
| Goalie takeover | hold G | LB |
| Pause / Mute | P / M | Start |

Specials: while charging, tap **SPACE** = behind-the-back, tap **K** = between-the-legs. **TURBO + shoot** sprinting at the crease = dive shot. Shots in off the crossbar are BARDOWN goals — full team turbo refill.

## Run locally

Open `index.html` in any browser, or `PLAY.bat` (Windows), or `node tools/serve.js` → http://localhost:8347.

`?test=1&seed=N` runs CPU-vs-CPU. Headless playtest harness: `node tools/headless-test.js batch 6` (also `handicap 5` for comeback testing). Build log in [PROGRESS.md](PROGRESS.md), spec in [CLAUDE.md](CLAUDE.md).
