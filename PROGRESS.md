# BARDOWN — Build Progress

## Phase 0 — Setup (2026-06-10)
- Project created. Tech call: vanilla JS + Canvas 2D (no Phaser) — placeholder shapes don't need a sprite engine, and DOM-free game logic runs headlessly in Node for automated playtests.
- CLAUDE.md spec written. Test harness plan: `node tools/headless-test.js` + browser preview after every phase.

## Phase 1 — Core game ✅ (2026-06-10)
**Built:** rink w/ rounded boards (ball never leaves play), intent-driven player movement, ball states (carried/loose/pass/shot/held/dead), snap-target passing w/ homing + lead, hold-to-charge shooting with z-height goal-mouth model (posts, crossbar bands, bardown-in vs ping-out), goalie AI w/ arc positioning + reflex slide + catch/rebound/outlet, crease wave-offs ("NO GOAL"), shot clock w/ beeps + violation turnovers, 4×2:00 quarters, simple faceoffs, scoreboard HUD, popups/particles/shake plumbing, synth SFX engine. Phase 2-5 features behind explicit flags in Game constructor.
**Tests:** `node tools/headless-test.js` → full CPU game, FINAL 6-3, 208 shots, 6 bardowns, 0 invariant violations, PASS. Browser: 0 console errors, 120 s in-page sim clean, frame render verified (tools/shot-phase1.png).
**Notes:** goalies save ~80% — too strong for Blitz pacing, deferring balance to Phase 5. Preview window rAF throttling means screenshots are captured via manual `Render.draw` + `canvas.toDataURL`.

## Phase 2 — Hitting, turbo, switching, CPU AI ✅ (2026-06-10)
**Built/enabled:** Blitz hits (hit anyone, anytime — knockdown ragdolls w/ dizzy stars, 78% fumble pops, turbo hits, late hits while down), turbo meter w/ drain/regen, pass interceptions, auto player switching w/ hysteresis + SPACE manual switch on D + hold-G goalie takeover, full CPU brains (carrier drive/orbit/weave + shoot/pass decisions, off-ball slots + cuts, on-ball pressure + man marking, loose-ball chase pairs, goalie outlet passes).
**Tuning during build:** first sim showed 700 hits/game (everyone permanently on the floor) and interceptions eating half of all passes — cut AI hit aggression 0.55→0.28 (off-ball 0.12), interceptP 0.85→0.6 → ~460 hits/game, still gloriously violent but offense functions.
**Bug fixed:** downed carrier who survives the fumble roll now cradles the ball with him instead of leaving it frozen mid-air.
**Tests:** 4-game headless batch — 4/4 FINAL, 0 violations (incl. a 1-7 blowout, good rubber-band test case). Human-control layer verified in-browser via synthetic KeyboardEvents: move/turbo/charge/shoot/pass/manual-switch/goalie-hold all exercise correct code paths, 0 console errors. Action frame: tools/shot-phase2.png.

## Phase 3 — Comeback engine & specials ✅ (2026-06-10)
**Built/enabled:** rubber-banding (+speed/+accuracy/+turbo-regen per goal of deficit, leading CPU reacts slower, 3+ deficit = extra fumbles, 5+ = DESPERATION with near-automatic specials), ON FIRE on 3 unanswered (unlimited turbo, faster/truer shots, ember glow), special shots — behind-the-back (tap pass while charging), between-the-legs (tap check while charging), **dive shot** (turbo+shoot sprinting at the crease; body legally slides into the crease after a clean release — crease rule now keys off release point + standing attackers), bardown bonus (full team turbo refill), faceoff mash mini-battle (~2 s, READY→MASH meters), penalty heat → 30 s power plays (goalie abuse + late hits; offender benched, 4v5, ends early on PP goal).
**Tests:** 4-game batch PASS, 0 violations — specials/fires/power-plays all firing organically (2-14 specials, 0-2 PPs per game). Comeback batch (spotted 0-5 deficit): trailing CPU **won 2 of 4** — winnable, never guaranteed. Browser: staged 0-5 comeback reached 5-5 in 200 s with 1 fire + 1 PP drawn, 0 console errors.

## Phase 4 — Presentation ✅ (2026-06-10)
**Built:** title screen (skewed gradient logo, live attract-mode CPU game behind smoked glass, controls sheet), two-step team select for all 8 squads (color chips + SPD/PWR/SHT bars), game-over screen with full stat table + ENTER rematch / ESC menu, OVERTIME next-goal-wins, synth music loop (bass + hats @126bpm) starting with each game, crowd noise that swells on goals. Announcer line variety, screen shake, goal slowmo/flash/zoom-punch, particles, and SFX were built through P1-P3 and are all live. Exposed `BARDOWN.tick(dt)` so automated tests can drive menu/game frames without rAF (hidden preview windows throttle rAF).
**Bug fixed:** `Input.pressed('pause')` was consuming the ESC press before the game-over handler could see it (`&&` evaluation order) — ESC-to-menu from the final screen now works.
**Tests:** menu flow driven end-to-end via synthetic keys (title→select→game, picks honored: home 2 away 7), forced Q4 tie → OT → golden goal FINAL 7-6, and an organic OT game appeared in the regression batch (Q5, 7-6). 3-game batch PASS, 0 violations, 0 console errors. Captures: tools/shot-title.jpg, shot-select.jpg, shot-gameover.jpg.

## Phase 5 — Feel tuning ✅ (2026-06-10)
**Process:** iterated CONFIG → `node tools/headless-test.js batch 6/8` → measure (goals, shots, hits, game length, comeback outcomes). Four rounds.
**What actually mattered (bugs found by the data, not knobs):**
1. The goalie *body-block* check (28 px radius, full height) was saving everything before the goal-mouth math ran → shrank to r+4 and capped at z≤34 so high heat must beat the glove at the plane.
2. Rebounds popped out *inside the crease*, where attackers are physically excluded → the goalie re-scooped every rebound and putbacks didn't exist. Rebounds now leave at 300-560 px/s with a goalie scoop cooldown.
3. CPU top-shelf aims (tz 46-48) cleared both body and glove → 19-bardown games. Glove coverage raised to the bar (coverH 47); tz≈48 is now a deliberate bardown gamble that scatter can ping out.
**Final numbers (16 fresh-seed games):** ~15-17 combined goals, ~195 shots, ~430 hits, ~5 bardowns, specials/fires/power-plays all occur organically, full game ≈ 8.8 min (kept the spec's true 2:00 quarters; stoppages trimmed to 1.2-1.5 s). Comeback batches (spotted 0-5): trailing team outscored the leader in 6/6 games, winning outright 1-2 per batch, with most losses by 1-2 — winnable to the buzzer, never scripted.
**Determinism:** browser replay of seed 9090 matched the Node sim stat-for-stat (5-7, shots 106/82, hits 244/160).

## Ship state
All 5 phases complete.
- **Hosted:** https://5lax.github.io/bardown/ (GitHub Pages, repo github.com/5Lax/bardown, deploys on push to main)
- **Local:** double-click `PLAY.bat`, or open `index.html` directly, or `node tools/serve.js` → http://localhost:8347
- `?test=1&seed=N` = CPU autotest mode. Headless CI: `node tools/headless-test.js batch 6` → RESULT: PASS, zero invariant violations.

## 3D renderer — "real graphics, real people" (2026-06-10)
**Built:** WebGL view layer (`js/render3d.js`, Three.js r147 vendored) targeting the NFL Blitz look: procedural low-poly humanoid players (numbered jerseys via canvas textures, team-shell helmets w/ cages, lacrosse sticks with loop heads), full animation set (run cycle w/ lean, cradle rock, charge windup + release whip, cross-check thrust, Blitz launch ragdolls with splayed limbs, prone dives, goalie crouch + spread-on-shot), 3D arena (striped turf w/ painted lines/creases/logo, kickplate boards + glass + stanchions, real net frames with crossbar at the exact sim height, 4-tier bobbing crowd on concrete terraces, fog), broadcast follow camera with shake/FOV-punch, 3D aim reticle on the goal mouth + pass-target marker, goal confetti and turbo trails mapped from the existing Effects system.
**Architecture:** the 2D sim is untouched — render3d maps rink px coords to world space; the old 2D renderer still draws every HUD/popup/menu on a transparent overlay (`Render.worldless`), and remains fully playable via `?classic=1`. Mouse aim raycasts through the camera to the floor plane so stick-aim math is identical in both views.
**Iteration:** 3 screenshot rounds — fixed drone-high camera → broadcast angle, jersey numbers on wrong box faces (rigs face +X), floating crowd → terraces, dark helmet blobs → team shells, +18% player scale.
**Tests:** headless batch PASS (sim untouched), 0 console errors, 2.06 ms/frame full tick (sim+render), raycast aim verified, goal/title/action frames captured (tools/shot-3d-*.jpg).

## Blast Lacrosse pass — camera, bodies, controls (2026-06-10)
User supplied Blast Lacrosse (PS1) + NFL Blitz reference shots. Three changes:
1. **Camera** swapped from sideline broadcast to the Blast end-on view: parked behind the human team's end, floor running up-screen, tracking the ball down the length of the rink — your own net sits in the foreground (seen through its mesh) on defense, and attacking is a close-up at the far crease. Floor wordmark (home team, Bandits-style) painted oriented for this camera.
2. **Bodies** went from voxel-toys to articulated low-poly athletes: hip/knee and shoulder/elbow joints (real knee flexion in the run cycle), tapered limb segments, 8 skin tones (deterministic per player), short-sleeve jerseys with bare forearms + gloves, shorts/socks/shoes, helmet brim + cage, two-hand stick grips per pose, goalie crouch with leg pads. Controlled player gets a Blitz-style floating "4 JOHNSON" name tag (24 fictional surnames) — fixed to persist while you're knocked down.
3. **Controls** collapsed to the advertised WASD + mouse + SPACE (+SHIFT turbo): L-click charge/shoot, R-click check, specials = tap SPACE / R-click while charging, dive = SHIFT+click at the crease. Faceoff mash now also accepts clicks. Legacy keys still work silently.
**Tests:** headless batch PASS (sim untouched), 0 console errors across all captures, name-tag visibility verified, frames: tools/shot-blast-*.jpg.

## Control rework + curved bodies (2026-06-10)
Per user feedback on the Blast view:
- **Camera-relative movement:** W now drives at the opposing net, ASD around it (input rotates only in 3D mode; classic 2D keeps screen axes). Arrows-aim rotated to match.
- **SPACE = jump** (new sim mechanic): v0 255/grav 780 hop (~0.65 s air). Airborne players dodge cross-checks entirely (jumpZ > 10), can't scoop or throw checks, and a shot released mid-air is a JUMP SHOT special. CPU carriers hop pressure occasionally. Goalies grounded. Invariant added.
- **Always-turbo:** meter and button retired; base speed 295→358, accel 3200. `turboActive` now just means "at sprint" (gates hit power, trails, dives). Re-tuned check: 18.5 combined goals (in band), steals dropped (faster legs beat lanes), specials nearly doubled — dive now auto-triggers on any sprinting release near the crease.
- **One-button offense:** LMB tap (<0.14 s) = pass / switch on D; hold = charge, release = rip. RMB check. While charging, tap RMB = behind-the-back (moving) / between-the-legs (still). Gamepad keeps dedicated A-pass.
- **Rounder athletes:** capsule torsos with wrap-around numbered jerseys (number at u=0.5 + split seam), capsule limbs, sphere heads under domed team helmets with brim+cage, neck, rounded gloves/cleats, cylinder shorts. Jump tuck pose; name tag rides jumpZ.
**Tests:** isolated control diagnostics in-browser (W vector +144,0 toward enemy net; charge engages at the 0.14 s threshold; tap-pass launches; jump peak 36-42, clean landings; airborne dodge), 4-game headless batch PASS 0 violations, 0 console errors.

## Tackles, cradle, Blitz bodies, directional passing (2026-06-10)
- **Flying body tackle (double right-click):** new `tackling` player state — horizontal launch at 560 px/s along your aim, first contact gets pancaked through shared `applyHit` at 1.55× power (+fumble bonus, +goalie penalty heat, TRUCKED!/PANCAKED! announcer lines); whiff and you land face-down for 0.4 s. Single R-click = normal check (first click of a double still swings — it reads as check-into-tackle). AI on-ball defenders launch from mid-range occasionally. Goalies can't tackle.
- **Check animation** is now a violent sweep: torso whips 0.85→-0.7 rad through the swing window, stick thrusts out 10 units.
- **Real cradle:** stick carried upright by the helmet (head up at ~60°), rocking at 7 Hz with the top hand high and bottom hand at the waist — the ball visibly rides the pocket. Run cycle gained torso counter-rotation and bent-elbow arm pump.
- **Bodies, round 3:** V-taper (broad jersey chest capsule over a narrow waist), deltoid spheres, longer legs. Reads NFL-Blitz-athletic at the gameplay camera.
- **Directional passing:** target choice now blends your aim direction (mouse) 68/32 with your running direction and weights direction much harder than distance — click at a teammate while cutting and the pass goes where you mean it.
**Tests:** human double-click path verified end-to-end in-browser (check → tackle at 571 px/s → whiff lands down), AI tackle captured mid-flight (tools/shot-tackle.jpg), headless batches PASS 0 violations (~22 combined goals — tackle fumbles added chaos, still in band), 0 console errors.

## Human scoring fix — "why can't I score?" (2026-06-10)
**Diagnosis (measured, not guessed):** the human's shot-height mapping (mouse depth past the goal line on the floor) was built for the overhead camera; from the Blast end camera that region is perspective-crushed, so virtually every human shot mapped to low-center — the exact zone the goalie's body block eats. The CPU never used that mapping (goalie-aware corner auto-aim). Second blocker, exposed by a simulated-shooting harness: goalie coverage (52 wide) + slide speed over a typical flight covers the ENTIRE 84-wide mouth — a squared goalie was mathematically unbeatable on placement from range (16-shot corner-snipe test: 14 saves, 0 wide, 2 goals).
**Fixes:**
- **WYSIWYG aiming:** mouse ray now intersects the goal plane — put the cursor on the spot in the mouth (the reticle sits exactly under it) and the shot targets that spot. Floor-pointing falls back to a low shot, clamped onto the cage.
- **House rules (1P only, CPU-vs-CPU untouched):** goalie freezes 0.24 s on the human's release then reacts at 0.72×; human shot scatter ×0.85.
- chargeTime 0.62→0.5 (less windup exposure to checks). CPU rebalance: shootQuality 0.34→0.39, goalie lateral speed knob re-wired (CONFIG.goalie.reflexSpeed had silently died in the always-turbo change — goalies were inheriting runner speed) and set to 262.
**Results:** simulated human corner-shots from 310-440 px: **13% → 33% conversion** (closer = placement-only). CPU-vs-CPU 24 combined goals, comeback batch from 0-5 still produces 1-4 goal finals. All PASS, 0 violations.

## Post-ship fix (2026-06-10)
Main loop gained a setInterval watchdog: embedded webviews / occluded windows can suppress requestAnimationFrame entirely, which left the canvas frozen black (this is what made the in-app preview panel look dead). If rAF goes stale >250 ms, a 30 Hz timer drives the same tick(). Verified: game clock now advances in a fully hidden preview window.
