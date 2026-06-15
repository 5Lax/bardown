# BARDOWN — Physics Tuning Reference

**Every value below lives in one file: [`js/config.js`](js/config.js) (the `CONFIG` object).** Edit a number, save, reload the page. No build step.
To see the live values any time, open the browser console and run `BARDOWN.physics()`.

After changing anything, sanity-check with: `node tools/headless-test.js batch 6` (wants ~14–22 combined goals, all games finishing, `RESULT: PASS`).

---

## Skating / movement — `CONFIG.player`
| field | now | ↑ raises it = |
|---|---|---|
| `maxSpeed` | 362 | top running speed (everyone is always at sprint) |
| `accel` | 4300 | snappier starts/cuts (lower = floatier, more drift) |
| `frict` | 10.5 | harder stops (lower = ice-skating glide) |
| `r` | 15 | body size / collision radius |

## Jumping — `CONFIG.jump`
| field | now | effect |
|---|---|---|
| `v0` | 375 | launch speed. Peak height = `v0² / (2·grav)` ≈ **70**. Set 430 for the old big hop, 320 for a small one |
| `grav` | 1000 | fall speed (higher = snappier, shorter airtime) |
| `dodgeZ` | 11 | height you must clear to dodge a check |

## The ball (loose) — `CONFIG.ballPhys`
| field | now | effect |
|---|---|---|
| `grav` | 1050 | how fast it falls (higher = less floaty) |
| `bounce` | 0.62 | bounciness off the floor (1 = never loses height) |
| `roll` | 0.42 | rolling friction — **lower = skitters around longer / never stops** |
| `pickupZ` / `scoopZ` | 40 / 22 | max height to catch / to scoop off the turf |

## Passing — `CONFIG.pass`
| field | now | effect |
|---|---|---|
| `speed` | 1180 | pass velocity |
| `arcPerDist` | 0.135 | **arc height per unit distance** — higher = rainbow-ier feeds |
| `arcMin` / `arcMax` | 30 / 165 | clamp on normal pass arc height |
| `arcGoalie` / `arcGoalieMax` | 0.24 / 270 | goalie outlet rainbows (higher) |
| `lobSafeZ` | 36 | above this height a pass can't be intercepted |
| `interceptR` / `interceptP` | 16 / 0.62 | pick-off reach / chance |
| `quickWindow` | 0.34 | catch-and-shoot window for one-timers |

## Shooting — `CONFIG.shot`
| field | now | effect |
|---|---|---|
| `minSpeed` / `maxSpeed` | 850 / 1400 | shot speed at no-charge / full-charge |
| `chargeTime` | 0.5 | seconds to fully wind up |
| `errMax` / `errMin` | 34 / 5 | aim scatter at no-charge / full-charge (lower = more accurate) |

## Goalie — `CONFIG.goalie`  *(the main scoring dial)*
| field | now | effect |
|---|---|---|
| `reflexSpeed` | 216 | how fast he slides post-to-post — **the #1 save/goal knob. Lower = more goals** |
| `coverW` / `coverH` | 52 / 47 | how much net his body covers (wider = fewer goals) |
| `roamR` / `retrieveR` | 86 / 380 | how far he strays / how far he'll chase a loose ball |
| `bombChance` | 0.03 | chance per possession he tries a full-court shot |

## Hitting, tackles, body play — `CONFIG.hit` / `tackle` / `spin` / `body`
| field | now | effect |
|---|---|---|
| `hit.fumbleBase` | 0.78 | chance a check knocks the ball loose |
| `hit.bigPowerAt` | 1.25 | power threshold for a "DEMOLISHED" launch |
| `tackle.power` / `tackle.selfDown` | 1.55 / 0.4 | tackle force / how long you eat floor on a whiff |
| `spin.cd` | 1.1 | spin-dodge cooldown |
| `body.setSpeed` | 60 | below this speed a defender becomes an immovable "wall" (picks!) |
| `body.shovePower` | 1.05 | checks under this power shove instead of flatten |

## Comebacks & fire — `CONFIG.rubber` / `CONFIG.fire`
| field | now | effect |
|---|---|---|
| `rubber.speedPerGoal` | 0.022 | trailing-team speed boost per goal of deficit |
| `rubber.desperationAt` | 5 | deficit at which special shots go near-automatic |
| `fire.unanswered` | 3 | team goals in a row to set the whole team ON FIRE |
| `fire.onFire` | 3 | **personal** goals in a row to catch fire (NBA-Jam style) |
| `fire.heatUp` | 2 | personal goals to start "HEATING UP" |

## Difficulty (1-player only) — `CONFIG.difficulty.{ROOKIE,ARCADE,INSANE}`
| field | effect |
|---|---|
| `goalieDelay` | seconds the CPU goalie freezes on your shot release (higher = easier for you) |
| `goalieReflex` | his slide speed vs your shots (lower = easier) |
| `shotErr` | your shot scatter multiplier (lower = you're more accurate) |
| `cpuReact` / `cpuAggro` | CPU reaction lag / hit appetite |

---
**Quickest feel tweaks:** more scoring → lower `goalie.reflexSpeed`. Floatier movement → lower `player.frict`. Bigger hops → raise `jump.v0`. Livelier ball → lower `ballPhys.roll`.
