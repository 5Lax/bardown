// BARDOWN — every gameplay number lives here. Phase 5 tuning touches this file only.
const CONFIG = {
  canvas: { w: 1280, h: 720 },

  // Blast-scale floor — takes real time to traverse. Same center (640,415) so world
  // offsets stay valid; classic 2D fit-scales; render3d derives everything from this.
  rink: { x: -260, y: 15, w: 1800, h: 800, corner: 150, restitution: 0.72 },

  net:   { inset: 110, mouthW: 84, mouthH: 52, depth: 24, postR: 5 },
  // z bands at the goal plane: 0..barLo clean (goalie may block), barLo..barIn = in off the iron
  // (BARDOWN), barIn..barHi = ping out, > barHi sails over the cage.
  bar:   { lo: 47, in: 50, hi: 53 },
  crease:{ r: 92 },

  player: {
    // Blitz movement: near-instant acceleration, hard stops, razor cuts — no ice-skating drift
    r: 15, accel: 4300, frict: 10.5, maxSpeed: 362,
    carrySlow: 0.97, chargeSlow: 0.55,
    turboMult: 1.45, turboAccel: 3650, turboMax: 100, turboDrain: 36, turboRegen: 22, turboMin: 8,
    pickupR: 25, scoopCd: 0.45,
  },
  ballPhys: { grav: 920, bounce: 0.55, deadVz: 60, pickupZ: 38, scoopZ: 20 },
  jump: { v0: 255, grav: 780, dodgeZ: 10 },
  // double right-click: launch horizontally and pancake whoever you touch. Whiff = you eat floor.
  tackle: { window: 0.35, cd: 1.3, speed: 560, time: 0.5, power: 1.55, selfDown: 0.4 },
  // SHIFT tap: spin dodge — slips checks and braced bodies, but NOT flying tackles
  spin: { time: 0.32, cd: 1.1, boost: 1.18, minSpeed: 80 },
  // box-lacrosse body play: a set player is a wall. Sprint into one and you stop,
  // get ridden toward the boards, or stumble. This is also what makes picks work.
  body: { setSpeed: 60, hardVn: 140, stumbleVn: 320, staggerT: 0.38, funnel: 85,
          shovePower: 1.05, shovePush: 340, shoveFumble: 0.18, shoveStagger: 0.4 },
  goalie: {
    r: 19, coverW: 52, coverH: 47, bodyH: 34, arcR: 30, maxLateral: 36,
    reflexSpeed: 208, holdTime: 0.85, roamR: 86, retrieveR: 380, bombChance: 0.03, mass: 1.7,
  },

  pass: {
    speed: 1180, homing: 10, catchR: 26, lead: 0.55, cone: 0.25,
    quickWindow: 0.34, quickSpeed: 1.3, quickErr: 0.7, interceptR: 16, interceptP: 0.62,
    // EVERY pass arcs now: base = normal feed, high = SHIFT saucer, goalie = rainbow outlet
    lobPeakBase: 46, lobPeakHigh: 78, lobPeakGoalie: 105, lobSafeZ: 34, launchGrace: 0.05,
  },
  shot: {
    minSpeed: 850, maxSpeed: 1400, chargeTime: 0.5, z0: 12,
    errMax: 34, errMin: 5, maxRange: 760,
    catchChance: 0.3, reboundSpeed: [300, 560],
    turboMult: 1.1, fireMult: 1.2,
  },

  hit: {
    range: 48, arc: 1.05, cooldown: 0.55, lunge: 330,
    knockTime: 0.85, slide: 470, fumbleBase: 0.78, fumblePop: [240, 430],
    turboPower: 0.4, shake: 7, bigPowerAt: 1.25,
  },

  // celebration/break are long enough for after-the-whistle violence (entities keep running)
  clockCfg: { quarterLen: 120, quarters: 4, shotClock: 30, beepAt: 5, goalCelebration: 2.4, breakTime: 2.2, faceoffDrop: 0.5 },

  faceoff: { readyTime: 0.4, mashTime: 0.9, cpuRate: 7.5, cpuRateJitter: 2.5, popSpeed: [180, 320] },

  penalty: { heatGoalie: 1.0, heatLate: 1.5, threshold: 3, decay: 0.14, ppTime: 30 },

  rubber: {
    maxGoals: 5, speedPerGoal: 0.022, errPerGoal: 0.07, turboPerGoal: 0.16,
    cpuReactPerGoal: 0.045, fumbleAt3: 0.17, desperationAt: 5,
    despErrMult: 0.15, despGoalieMult: 0.4,
  },
  fire: { unanswered: 3, speed: 1.08, shotErr: 0.7 },

  special: { errMult: 0.5, speedMult: 1.25, cooldown: 1.5, minCharge: 0.35, diveRange: 270, diveTime: 0.55, diveBoost: 430 },

  ai: {
    decide: 0.13, reactBase: 0.10,
    shootRange: 350, shootQuality: 0.36, forceShotAt: 3.2,
    passPressure: 88, openDist: 85, cutEvery: [2.5, 6.0], cutTime: 1.0,
    hitRange: 44, hitAggro: 0.28, offBallAggro: 0.12, defGap: 34, chasePair: 2,
    pickEvery: [4, 8], pickTime: 1.2,
    cpuChargeMin: 0.5, cpuChargeMax: 0.95, turboUseAt: 35,
  },

  switchCfg: { hysteresis: 1.25 },

  // house rules vs the human in 1P, scaled by difficulty. goalieDelay = freeze after your
  // release, goalieReflex = his slide speed after that, shotErr = your scatter multiplier,
  // cpuReact = added CPU decision lag, cpuAggro = CPU hit/tackle appetite.
  difficulty: {
    ROOKIE: { goalieDelay: 0.34, goalieReflex: 0.5,  shotErr: 0.7,  cpuReact: 0.08,  cpuAggro: 0.65 },
    ARCADE: { goalieDelay: 0.24, goalieReflex: 0.72, shotErr: 0.85, cpuReact: 0,     cpuAggro: 1 },
    INSANE: { goalieDelay: 0.1,  goalieReflex: 0.95, shotErr: 1.0,  cpuReact: -0.03, cpuAggro: 1.3 },
  },

  teams: [
    { city: 'BAYPORT',      name: 'RIPTIDE',       color: '#ff7a1a', color2: '#13283f', trim: '#ffd9b0', spd: 1.02, pwr: 0.98, sht: 1.00 },
    { city: 'GLACIER BAY',  name: 'YETIS',         color: '#4fd6ff', color2: '#0e2a33', trim: '#e8feff', spd: 1.00, pwr: 1.00, sht: 1.00 },
    { city: 'STEEL CITY',   name: 'SLEDGEHAMMERS', color: '#c0c8d0', color2: '#5c0f14', trim: '#ff3b30', spd: 0.96, pwr: 1.06, sht: 0.98 },
    { city: 'NEON VALLEY',  name: 'VIPERS',        color: '#39ff6a', color2: '#101010', trim: '#baffce', spd: 1.05, pwr: 0.94, sht: 1.01 },
    { city: 'BAYOU',        name: 'GATORS',        color: '#1fb868', color2: '#2e2607', trim: '#ffd24a', spd: 0.98, pwr: 1.03, sht: 0.99 },
    { city: 'CRIMSON COAST',name: 'CRUSH',         color: '#ff3355', color2: '#26060d', trim: '#ffc2cf', spd: 1.01, pwr: 1.01, sht: 0.98 },
    { city: 'IRON PINES',   name: 'LUMBERJACKS',   color: '#b5651d', color2: '#1d2b1a', trim: '#9ee37d', spd: 0.95, pwr: 1.07, sht: 0.98 },
    { city: 'VOLT CITY',    name: 'VOLTAGE',       color: '#ffe23a', color2: '#1a1440', trim: '#9a8cff', spd: 1.04, pwr: 0.96, sht: 1.02 },
  ],
};

// derived geometry
CONFIG.goals = (() => {
  const r = CONFIG.rink, cy = r.y + r.h / 2;
  return [
    { x: r.x + CONFIG.net.inset,        cy, f: 1 },   // left net, faces into rink (+x); defended by team 0
    { x: r.x + r.w - CONFIG.net.inset,  cy, f: -1 },  // right net; defended by team 1
  ];
})();
CONFIG.center = { x: CONFIG.rink.x + CONFIG.rink.w / 2, y: CONFIG.rink.y + CONFIG.rink.h / 2 };
