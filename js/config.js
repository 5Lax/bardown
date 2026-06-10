// BARDOWN — every gameplay number lives here. Phase 5 tuning touches this file only.
const CONFIG = {
  canvas: { w: 1280, h: 720 },

  rink: { x: 40, y: 140, w: 1200, h: 550, corner: 110, restitution: 0.72 },

  net:   { inset: 110, mouthW: 84, mouthH: 52, depth: 24, postR: 5 },
  // z bands at the goal plane: 0..barLo clean (goalie may block), barLo..barIn = in off the iron
  // (BARDOWN), barIn..barHi = ping out, > barHi sails over the cage.
  bar:   { lo: 47, in: 50, hi: 53 },
  crease:{ r: 92 },

  player: {
    r: 15, accel: 2500, frict: 8.2, maxSpeed: 295,
    carrySlow: 0.97, chargeSlow: 0.55,
    turboMult: 1.45, turboAccel: 3650, turboMax: 100, turboDrain: 36, turboRegen: 22, turboMin: 8,
    pickupR: 25, scoopCd: 0.45,
  },
  goalie: {
    r: 19, coverW: 52, coverH: 47, bodyH: 34, arcR: 30, maxLateral: 36,
    reflexSpeed: 195, holdTime: 0.85, roamR: 86, mass: 1.7,
  },

  pass: {
    speed: 950, homing: 10, catchR: 26, lead: 0.55, cone: 0.25,
    quickWindow: 0.28, quickSpeed: 1.3, quickErr: 0.85, interceptR: 12, interceptP: 0.5,
  },
  shot: {
    minSpeed: 770, maxSpeed: 1260, chargeTime: 0.62, z0: 12,
    errMax: 34, errMin: 5, maxRange: 760,
    catchChance: 0.3, reboundSpeed: [300, 560],
    turboMult: 1.1, fireMult: 1.2,
  },

  hit: {
    range: 48, arc: 1.05, cooldown: 0.55, lunge: 330,
    knockTime: 0.85, slide: 470, fumbleBase: 0.78, fumblePop: [240, 430],
    turboPower: 0.4, shake: 7, bigPowerAt: 1.25,
  },

  clockCfg: { quarterLen: 120, quarters: 4, shotClock: 30, beepAt: 5, goalCelebration: 1.2, breakTime: 1.2, faceoffDrop: 0.5 },

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
    shootRange: 345, shootQuality: 0.34, forceShotAt: 3.2,
    passPressure: 70, openDist: 85, cutEvery: [2.5, 6.0], cutTime: 1.0,
    hitRange: 44, hitAggro: 0.28, offBallAggro: 0.12, defGap: 30, chasePair: 2,
    cpuChargeMin: 0.5, cpuChargeMax: 0.95, turboUseAt: 35,
  },

  switchCfg: { hysteresis: 1.25 },

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
