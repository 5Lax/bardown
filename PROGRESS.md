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

## Feature wave — outlet fix, mayhem, and all six suggestions (2026-06-11)
**Outlet-camping exploit fixed:** goalie passes are now lobs that arc to z≈74 — interceptions skip while the ball is above 26 or within 0.05 s of launch, and pressured goalies outlet in 0.3 s instead of 0.85 s. Verified by staging a camper 50 px from the goalie: outlet sailed over him to a teammate. Root-cause bonus: CPU teams had been exploiting each other the same way — 30-50 "steals"/game were stolen outlets, which had been inflating scoring; rebalanced (goalie lateral 238, CPU shoot quality 0.36) to ~15-16 combined goals through legitimate offense.
**After-the-whistle mayhem:** entities (and your inputs) keep running through goal celebrations (now 2.4 s) and quarter breaks (2.2 s) — hits, tackles, and jumps after the whistle, exactly like Blitz. Late-hit penalty heat still applies, so celebration violence carries risk.
**All six suggestions implemented:**
1. **E = call a cut** — best off-ball teammate darts to the net (D-pad up on pad).
2. **Difficulty select** — ROOKIE/ARCADE/INSANE cards after team select; scales the 1P house rules + CPU reaction/aggression. CPU-vs-CPU and 2P unaffected.
3. **Save anims + instant replay** — goalies lunge toward the side they saved; every goal triggers a 2-s slow-mo behind-the-net replay (view-side ring buffer, letterboxed, blinking REPLAY stamp; the sim never pauses, so post-whistle mayhem continues under it).
4. **Local 2P** — title-menu mode; P1 keyboard+mouse vs P2 gamepad (Input is source-split); fair fight, no assists for either side.
5. **Voice announcer** — speechSynthesis reads the big calls (goals, bardowns, tackles, fire, power plays); M mutes it with everything else.
6. **Playoffs** — 8-team single-elimination bracket; other series sim by team strength; bracket screen between rounds; CHAMPIONS celebration or an early ELIMINATED exit.
**Organic bodies round 4:** lathed one-piece torso profile (hips→waist→chest→shoulder taper), heads set slightly forward, athletic hunch baseline, smoother spheres.
**Verification:** feature-by-feature browser evals (outlet escape, cut, difficulty application, replay engagement + capture, full playoff run to a championship, 2P boot without a pad), headless batches PASS with 0 violations. **Adversarial review fleet** (20 agents over the diff): 16 findings → 2 confirmed after refutation passes — a replay last-frame off-by-one and a THREE.js dispose leak on rematch — both fixed and re-verified.

## Blitz-look wave: big floor, superhero bodies, two-man booth, live ball (2026-06-11)
Research first (user asked for video comparison; used written/frame analysis): Blitz players were ~8½ ft "superheroes" with "synthol-laden" proportions and theatrical, instant-speed movement.
- **Floor +20%** (1440×640, same world center so nothing else moved; classic 2D now fit-scales, mouse inverse-mapped). Ball speeds scaled up ~12% to keep flight-time geometry; goalie/AI retuned → 14.4 combined goals, 5/5 sims finish incl. OT.
- **Blitz movement:** accel 3200→4300 + friction 10.5 = near-instant starts, hard stops, razor cuts. Run cycle amped: stride 1.05 rad, knee drive 1.3, double bounce, 0.2 rad sprint lean, big arm pump.
- **Blitz bodies:** chest profile +25%, deltoids 5.2, comic forearms (r 2.1→3.2) + big gloves, thicker thighs/shins, bigger head/helmet, overall scale 1.22. They read as bulky cartoons now.
- **Two-man booth:** play-by-play voice (deep, fast, interrupts himself) + color analyst (different voice, waits his turn, quips ~1.5 s after big calls from a 30-line banter table — goals, tackles, robberies, sin-bin jokes). Analyst lines show as closed-caption subtitles. NOTE: user asked for Rabil/Kessenich — used the duo *dynamic* with original personas instead (real-person likeness).
- **Live ball:** loose balls have real vertical physics (gravity 920, restitution 0.55, bounce SFX) — fumbles pop and bounce, faceoffs toss the ball up into a scramble, rebounds kick off the pads, wide shots fall and skitter. Pickups: low ball = scoop-off-the-turf animation, high ball = reach-up snag (catchable to z 38); lob catches get the reach too.
**Tests:** headless 5/5 PASS 0 violations; browser: booth subtitle live, ball bounce observed (vz 185), 0 errors. Frame: tools/shot-blitzlook.jpg.

## Box-defense wave: walls, shoves, picks, one-timers + SHIFT moves (2026-06-11)
From the Blitz/Blast/NHL-26 controls comparison, the two missing crossovers landed:
- **SHIFT tap = spin dodge** (Blitz juke energy): 0.32 s spin-o-rama, slips checks AND braced bodies, beaten only by flying tackles. Needs the ball + movement; 1.1 s cooldown.
- **SHIFT + click = saucer pass** (NHL R1): any player can now lob over the defense; CPU carriers saucer long cross-floor feeds.
**Defense finally plays like box lacrosse** (user: "you don't run through anybody — you get knocked over or pushed down the side; it's pick-and-rolls and one-timers"):
- **Braced bodies are walls**: a set player (speed < 60) gets 3× collision mass; running into one strips your through-velocity entirely (verified: 350 px/s carrier → 0). Defenders ride carriers toward the boards (lateral funnel), and sprinting into a wall costs a 0.38 s stumble.
- **Two-tier contact**: checks under 1.05 power SHOVE (stagger + displacement, 18% fumble, victim keeps his feet) — knockdowns now reserved for big hits, late hits, and tackles. Floor-flopping chaos became positional physicality.
- **Middle is a no-fly zone**: on-ball defenders check/tackle 1.6× more against lane-drivers.
- **AI pick-and-roll**: off-ball attackers periodically plant on the on-ball defender (the wall physics make the pick mechanically real), then roll to the cage; carriers prioritize hitting the roll man (+70 pass score).
- **One-timers are the scoring channel**: CPU rips quick releases within 0.2 s of a catch near the cage; quick-stick shots face a goalie at 0.75× reflex (caught mid-slide) with scatter tightened (quickErr 0.7, window 0.34).
**Balance journey:** the wave initially cratered scoring to 10.5 (fumble-goals gone, drives stoned — working as intended); recovered through the box-authentic channel (pass-first AI at pressure 88 + the one-timer reflex cut) → **15.9 combined goals over an 8-game batch, every game within 1-3, two organic OTs, 8/8 finished, 0 violations.**
**Verified in-browser:** spin trigger, saucer launch, wall stoppage (350→0), shove-vs-knockdown split, 0 console errors.

## Mythical-arena wave: Zelda music, rainbow passes, giant floor, living goalies (2026-06-12)
- **Music**: synthwave loop replaced with an original heroic adventure theme — G-major dual-triangle lead (chorus-detuned, plucky), warm bass roots, soft timpani pulse @140 bpm, 8-bar loop. Fun and mythical, still 100% synthesized.
- **All passes arc now**: three flight heights — normal feeds peak 46, SHIFT saucers 78, goalie outlets rainbow at 105 (verified peak z=117 in-browser). Chest-high passes (z<34) stay interceptable so pass defense still exists; intercept radius/odds bumped to compensate.
- **Giant floor**: 1800×800 (was 1440×640) — Blast-scale, takes real time to wrap the court. Camera raised/pulled back, fog extended, everything else derives from CONFIG. Ball speeds +11%. Result: shots/game fell 185→130 with conversion UP (18.2 combined goals, 6/6 finished) — fewer, better chances; the structured feel.
- **Goalies live**: manual goalie (hold G) is fully untethered — wander the whole floor, charge, RIP a full-court shot; the AI tether is now a soft pull, and AI goalies leave the crease (leash 380) to retrieve uncontested loose balls down the side (verified: goalie traveled 250 out, scooped, rainbow-outletted). AI goalies occasionally (3%/hold) wind up a full-court bomb. CPU shooters know when a cage is empty (goalie >220 out): +0.5 shot quality and they'll bomb from up to 1100 away — wandering is a real gamble. Goalie goals get their own announcer moment (GOALIE GOOOOAL?!) + booth banter.
**Tests:** 6/6 headless PASS 0 violations; in-browser: retrieve + rainbow verified, tune builds, 0 errors. Frame: tools/shot-giant.jpg.

## Real RC1 stick head + broadcast announcer (2026-06-15)
- **Announcer** reworked toward a real-broadcast feel (still browser TTS — can't be an actual person): `pickVoices()` ranks the deepest sportscaster-style voices the browser exposes; play-by-play is always amped (slower on the call, deep-but-lifted pitch) with the crowd swelling underneath every call; analyst stays dry. Async `onvoiceschanged` hook. The true-quality path remains recorded clips (system not built yet).
- **Real lacrosse head asset pipeline** (user supplied a 12.1MB / 254k-tri RC1 head STL): built `tools/process-stl.js` — parses binary STL, grid-vertex-clusters to ~2.4k tris (binary-searches grid resolution to hit target), recenters/normalizes, emits `vendor/stickhead.js` (48KB, 0.4% of source). `Render3D.headGeometry()` shares one BufferGeometry across all 12 sticks, tinted team-trim, fallback torus if absent. Verified in isolation (silhouette clearly reads as a head — scoop/sidewalls/throat survived) and at gameplay distance (tools/shot-realstick.jpg). Sim bundle unaffected (render3d/stickhead not in headless). This is the textbook game pipeline: ship a decimated derivative, never the multi-MB source.

## Feel pass: high/bounce passes, live ball, big jumps, real cradle (2026-06-15)
- **Pass arcs scale with distance** (`arcPerDist` 0.135, clamp 30–165; goalie 0.24 → 270): full-floor feeds rainbow high (verified ~97+ on a 1000px throw, was capped 78). **SHIFT+pass = bounce/skip pass** (gravity-driven, gets under sticks; low & interceptable) — the counterpart to the high arc that goes over. CPU skips occasional short passes; long passes auto-arc.
- **Ball never sits still**: loose-ball rolling friction cut (damp 0.9→0.42), gravity up (920→1050), bounce up (0.55→0.62). It drops, bounces hard, skitters; gravity always applies so it can't hover. Verified: dropped from z=80 it fell and was scooped within 2s.
- **Big Blast jumps**: `jump.v0` 255→430, grav 780→1000 → peak ~92–94 (was ~42). Clears checks, jump-shots over a set goalie, leaps the crease. Invariant cap raised to 130.
- **Biomechanically-correct cradle** (researched): top hand bent ~90° brings the head up by the helmet like a dumbbell curl, bottom hand loose at the hip on the butt, wrist-rock locked to the stride (curl opposite the lead foot). Stronger forward run lean. Verified close-up (tools/cradle1) + at distance (tools/shot-jumpfeel).
- **Balance:** 5-game batch 15.8 combined goals, 5/5 finished, 0 violations; comeback batch (0-5 down) trailing team won 2/4, closed the rest to ≤4.

## Jump trim, fire mechanics, cinematic replay, tuning ref (2026-06-15)
- **Jump lowered**: `jump.v0` 430→375 → peak ~92→**72** (verified). Still clears checks / jump-shots.
- **NBA-Jam individual ON FIRE**: each player tracks a personal goal streak (`player.heat`). 2 in a row = "HEATING UP!", 3 = catches fire (`player.onFire`) — flaming ball + body glow, shots near-unmissable (`fire.playerShotErr` 0.4, `playerShotSpeed` 1.15, goalie reflex ×0.7), until the opponent scores. Coexists with the existing whole-team ON FIRE (3 unanswered). Verified progression goal→HEATING UP→goal→ON FIRE with the right announcer calls + voice lines (BOOMSHAKALAKA etc.).
- **Cinematic goal replay**: the behind-net cam now sweeps across the goal mouth and dollies in over the slow-mo instead of sitting static (`rp.side` captured at goal; pan+push-in from progress). Screenshot: tools/shot-replay-cam.jpg.
- **Tuning reference**: new `TUNING.md` maps the main physics knobs (movement, jump, ball, pass, shot, goalie, hits, fire, difficulty) → current value → what raising it does; all live in `js/config.js`. Added `BARDOWN.physics()` console dump.
- **Tests:** 5-game batch 13.8 combined goals, 5/5 finished, 0 violations.

## Arcade music, head flip, one-timer, box-goalie armor, camera control (2026-06-15)
- **Music** rewritten from the heroic theme to an aggressive arcade loop: gritty square-wave lead riff in E minor @158, pumping octave saw bass, kick/snare/hat backbeat. NFL-Blitz/NBA-Jam hype, still synthesized.
- **Stick head** was on backwards: added `rotateX(π)` to the shared geometry (flip around the shaft) and sized it up (runner 15→19, goalie 19→23). Verified isolated — reads as a clean RC1 head.
- **One-timer**: hold L-click (or pad shoot) while a pass is incoming to your controlled player → `oneTimerArmed`; on the catch it rips instantly (within 0.16 s) with the quick-shot bonus. Verified end-to-end in 1P.
- **Box-goalie armor**: goalies now wear hockey-style gear (big chest protector, belly pad, shoulder caps, oversized leg pads, blocker, throat guard) — researched box-goalie equipment, they read as the big padded keeper now.
- **Camera control**: mouse-wheel zoom (`camZoom` 0.5–2.2), middle-drag orbit (yaw/pitch), middle-click reset. Recomputed in spherical coords on top of the auto-follow base. Verified: wheel zoomed (cam moved 223u), drag yawed, click reset.
- **Tests:** 4-game batch 14.5 combined goals, 4/4 finished, 0 violations (one-timer/goalie/camera are human- or render-only, sim untouched).

## Head orientation fix, widened goalie head, per-player ratings (2026-06-15)
- **Stick heads were genuinely backwards** — last turn's `rotateX(π)` was the wrong axis. Diagnosed by rendering three candidate flips on a shaft side-by-side; the end-for-end `rotateY` flip (scoop at the far end, throat at the shaft) was clearly correct. Net rotation is now `rotateY(-π/2)`. Also confirmed via a head-on render that the player BODIES face correctly (the "players backwards" feeling was the backwards head + seeing backs on the end-cam, which is normal for Blast view).
- **Goalie head** is now a widened, bigger version of the RC1 (non-uniform scale: wider pocket, more depth).
- **Per-player ratings**: each runner gets a position archetype — SNP (sniper, +shot), PLY (playmaker, +pass/+hands), ENF (enforcer, +power −shot), TWO (two-way), SPD (speedster, +speed) — plus a small deterministic jitter (no game.rng). Drives max speed (337–430 spread verified), accel, carry speed, hit/tackle power, shot speed+accuracy, pass speed, and fumble resistance. Shown as SPD/PWR/SHT/PAS/HND mini-bars on the controlled player's name tag; `BARDOWN.roster()` dumps the league.
- **Tests:** 6-game batch 11.7 combined goals, 6/6 finished, 0 violations (ratings are net-neutral on average so balance held).

## Post-ship fix (2026-06-10)
Main loop gained a setInterval watchdog: embedded webviews / occluded windows can suppress requestAnimationFrame entirely, which left the canvas frozen black (this is what made the in-app preview panel look dead). If rAF goes stale >250 ms, a 30 Hz timer drives the same tick(). Verified: game clock now advances in a fully hidden preview window.
