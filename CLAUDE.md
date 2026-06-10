# BARDOWN — Arcade Box Lacrosse

NFL Blitz (1997) meets box lacrosse. NOT a simulation — over-the-top arcade: exaggerated hits, fast everything, minimal downtime, big comebacks. Prioritize game FEEL over visual fidelity.

## Tech decisions

- **Vanilla JS, classic script tags (no modules, no build step).** Game logic is DOM-free so the whole sim runs headlessly in Node for automated playtests. Open `index.html` directly (file:// works) or serve statically.
- **Two renderers, one sim.** Default view is WebGL (`js/render3d.js`, Three.js r147 vendored in `vendor/` — last UMD build, required for classic scripts): procedural low-poly NFL-Blitz-style player rigs, 3D arena, broadcast follow camera. `?classic=1` falls back to the original 2D Canvas renderer. The 2D `Render` still draws ALL UI (HUD/popups/menus) on a transparent overlay canvas in both modes (`Render.worldless`). The sim never depends on either renderer — render3d maps rink coords (x,y px + z height) to world (x-640, z, y-415); rigs face +X, yaw = -facing. Mouse aim in 3D raycasts to the floor plane (`Input.mouseRink()`). Renderers must never call `game.rng`.
- All game logic is deterministic via seeded RNG (`game.rng`); `Math.random()` is allowed for cosmetics only (particles, popup variety).
- Fixed timestep: physics at 120 Hz, render on rAF. `game.update(dt)` is pure w.r.t. DOM — never touch document/window/audio inside game logic without a `HAS_DOM`-style guard.
- Every gameplay number lives in `js/config.js` (CONFIG). No magic numbers in logic files — Phase 5 tuning happens in one place.

## Files (load order matters — see index.html)

| file | owns |
|---|---|
| `js/config.js` | CONFIG: all tunables, team definitions, derived geometry |
| `js/utils.js` | vec math, clamp/lerp, seeded RNG, rounded-rect board collision |
| `js/audio.js` | AudioSys: Web Audio synth SFX + music (all generated, zero assets). Every method guards `!this.ctx` |
| `js/input.js` | Input: keyboard + mouse + gamepad → named actions (`pressed` auto-consumes) |
| `js/effects.js` | Effects: popups/announcer, particles, screen shake, flash, slowmo, zoom punch |
| `js/entities.js` | Player, Goalie, Ball classes. Intent-driven: AI/Input set `p.intent`, `p.update` consumes |
| `js/ai.js` | CPU brains: carrier/off-ball/defense/goalie + difficulty & rubber-band knobs |
| `js/game.js` | Game: state machine, rules, possession, shot resolution, clocks, scoring, mods |
| `js/render.js` | All drawing: rink, entities, scoreboard/HUD, menus |
| `js/debug.js` | `window.BARDOWN` harness: install/simulate/invariants/summary |
| `js/main.js` | Boot, app state (menu/select/game/over), rAF loop, resize. Browser-only |
| `tools/headless-test.js` | Node runner: concatenates js files into a VM, sims full games, checks invariants |

## Geometry (logical canvas 1280×720)

- Rink: x 40..1240, y 140..690 (1200×550), corner radius 110, boards bounce everything — ball NEVER goes out of bounds, play never stops for that.
- Goals: left net plane x=150 (defended by team 0/HOME), right x=1130 (team 1/AWAY). Goal center y=415. Mouth: 84 wide (y 373..457), pseudo-height 52 (z). Net box extends 24 behind plane. Posts at mouth edges.
- Shots have a z (height) targeting a 2D goal-mouth plane (ty across, tz up). Crossbar band near z 47–53: in off the bar = **BARDOWN** goal; above = ping out. Goalie covers ~54×44 centered on his y — corners and top shelf are the open real estate.
- Crease: r=92 circle around goal center. Offensive players in state `play` are physically pushed out; knocked-down bodies and dive shots can slide in → goals with an attacker inside crease get waved off ("NO GOAL").
- Team t defends `CONFIG.goals[t]`, attacks `goals[1-t]`. HOME attacks right.

## Rules (box lacrosse, arcade-adapted)

- 5 runners + 1 goalie per team. 4 quarters × 120 s running clock (clock only runs in `play` state). 30 s shot clock — resets on possession change and on shot-on-goal; violation = instant turnover.
- Faceoffs only at quarter start and after goals: 2 s max button-mash mini-battle (Phase 3; simple drop before that).
- Hitting anyone, anytime, ball or no ball — no penalties except egregious repeat offenses (goalie abuse, late hits on downed players) → 30 s power play, offender benched, 4v5 (ends early if PP team scores).
- ON FIRE: 3 unanswered goals → whole team glows, unlimited turbo, faster/more accurate shots. Ends when opponent scores.
- Rubber-band (critical): trailing team gets +speed, +accuracy, +turbo regen per goal of deficit; leading CPU gets slower reactions; deficit 3+ → hits fumble more; 5+ → DESPERATION: special shots near-automatic. Leading team never debuffed in feel — trailing team just gets juiced.

## Controls

Primary surface (advertised): W = at the opposing net, ASD around (camera-relative in 3D; classic 2D keeps screen-relative) · mouse aims · L-click tap = pass / switch-on-D, hold >0.14 s = charge, release = shoot · R-click check · SPACE jump (airborne players dodge checks; release a shot mid-air = jump-shot special; goalies can't jump; can't scoop while airborne). Turbo is ALWAYS ON (`turboEnabled=false` hides the dead meter; `turboActive` now just means "at sprint speed" and gates hit-power/trails/dives). Dive auto-triggers on a sprinting release near the crease. Secondary: G hold = manual goalie, J/K legacy keys, arrows aim, P pause, M mute, gamepad A = dedicated pass.
Gamepad (Xbox): left stick run, right stick aim, A pass, X shoot, B hit, RT turbo, LB goalie, Start pause.
Aim→shot mapping: mouse y on net = placement; mouse depth past goal plane = height (top shelf). Stick: lateral = placement, push *through* the net = height.
Special shots while charging: tap SPACE = behind-the-back, tap R-click = between-the-legs; SHIFT+click sprinting near crease = dive shot.
Camera: Blast-Lacrosse end view — parked behind the human end, floor runs up-screen (+x); `Render3D.syncCamera` owns it.

## Debug API & testing protocol (run after EVERY phase)

`window.BARDOWN` (also global in Node): `.install(game)`, `.simulate(seconds)` → `{violations, state}` sync CPU-vs-CPU steps, `.summary()`, `.errors`.

1. `node tools/headless-test.js` — sims a full game + invariant checks (ball/players in bounds, no NaN, single carrier, clocks sane, roster counts). Must pass clean.
2. Browser preview: load `index.html`, check console for errors, screenshot, eval a sim.
3. URL params: `?test=1` CPU-vs-CPU autoplay, `?seed=N` reproducible.
4. Append results to PROGRESS.md.

## Phase plan

- [x] Phase 1: rink, movement, ball physics, passing, shooting+goalie, goals, scoreboard, shot clock, simple faceoff, basic CPU/goalie so it's playable
- [x] Phase 2: hitting/checking, turbo, player switching (auto+manual+goalie takeover), real CPU AI, interceptions — full game vs CPU
- [x] Phase 3: rubber-banding, ON FIRE, special shots, faceoff mash mini-game, power plays, bardown bonus
- [x] Phase 4: announcer popups, screen shake, particles, net-cam flash/slowmo, synth SFX+music, menus, team select (8 teams), OT
- [x] Phase 5: tuning loop — sim batches via headless harness; landed at ~8.8 min full game, ~15–17 combined goals, ~430 hits, comebacks from 0-5 down end within 1-3 goals (occasionally win)

## Conventions

- No external assets, no network, no deps. Sounds = Web Audio synthesis only.
- Classes/consts in classic scripts share global scope — keep names unique.
- Don't add comments narrating code; only constraints worth keeping.
- When tuning, change CONFIG only; re-run headless batch (`node tools/headless-test.js batch 6`) and record stats in PROGRESS.md. Comeback check: `batch 6 handicap 5`.
- Scoring balance hinges on three couplings found in Phase 5, beware when touching them: (1) the goalie **body block** (`goalieBody`, radius r+4, z ≤ `goalie.bodyH`) saves far more than the goal-plane check — widen it and scoring dies; (2) rebounds must leave the crease fast (`reboundSpeed` ≥ ~300 + `g.scoopCd` after) or the goalie re-scoops every rebound and putbacks vanish; (3) CPU `tz` aim choices vs `goalie.coverH`/`bar` bands decide how often top shelf is a free lane — coverH 47 reaches the bar, leaving tz≈48 as the bardown gamble only.
