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

## Post-ship fix (2026-06-10)
Main loop gained a setInterval watchdog: embedded webviews / occluded windows can suppress requestAnimationFrame entirely, which left the canvas frozen black (this is what made the in-app preview panel look dead). If rAF goes stale >250 ms, a 30 Hz timer drives the same tick(). Verified: game clock now advances in a fully hidden preview window.
