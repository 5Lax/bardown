#!/usr/bin/env node
// Headless playtest: concatenates the game scripts into a VM (no DOM), sims
// full CPU-vs-CPU games, reports invariant violations + game stats.
// Usage:  node tools/headless-test.js [batch N] [seed S] [seconds T]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['config', 'utils', 'audio', 'input', 'effects', 'entities', 'ai', 'game', 'render', 'debug'];
const src = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8')).join('\n;\n');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? +args[i + 1] : def;
};
const batch = getArg('batch', 1);
const baseSeed = getArg('seed', 1337);
const seconds = getArg('seconds', 720); // enough wall-clock to finish a full game incl. stoppages
const handicap = getArg('handicap', 0); // start team 1 up by N goals — comeback viability check

function runOne(seed) {
  const sandbox = { console, Math, JSON, isFinite, performance: { now: () => 0 } };
  vm.createContext(sandbox);
  const driver = `
    ${src}
    ;(() => {
      const g = new Game({ mode: 'cpu', home: 0, away: 1, seed: ${seed} });
      if (${handicap} > 0) { g.score[1] = ${handicap}; g.unanswered[1] = ${handicap}; }
      BARDOWN.install(g);
      globalThis.__result = BARDOWN.simulate(${seconds});
    })();
  `;
  vm.runInContext(driver, sandbox, { filename: 'bardown-bundle.js' });
  return sandbox.__result;
}

let failed = false;
const games = [];
for (let i = 0; i < batch; i++) {
  const seed = baseSeed + i * 7919;
  let res;
  try {
    res = runOne(seed);
  } catch (e) {
    console.error(`GAME ${i + 1} (seed ${seed}) CRASHED:`, e.stack || e);
    failed = true;
    continue;
  }
  games.push(res);
  const s = res.state;
  const line = `game ${i + 1} seed=${seed} | ${s.score[0]}-${s.score[1]} Q${s.quarter} ${s.over ? 'FINAL' : s.state} ` +
    `simTime=${res.simulated}s shots=${s.stats.shots} saves=${s.stats.saves} hits=${s.stats.hits} ` +
    `bardowns=${s.stats.bardowns} steals=${s.stats.steals} specials=${s.stats.specials} fires=${s.stats.fires} pps=${s.stats.pps}`;
  console.log(line);
  if (res.violations.length) {
    failed = true;
    console.error('  VIOLATIONS:');
    for (const v of res.violations) console.error('   - ' + v);
  }
}

if (games.length > 1) {
  const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  const goals = games.map(r => r.state.score[0] + r.state.score[1]);
  const shots = games.map(r => r.state.stats.shots[0] + r.state.stats.shots[1]);
  const hits = games.map(r => r.state.stats.hits[0] + r.state.stats.hits[1]);
  const lens = games.map(r => r.simulated);
  console.log(`\nBATCH AVG: goals=${avg(goals)} shots=${avg(shots)} hits=${avg(hits)} gameLen=${avg(lens)}s finished=${games.filter(r => r.state.over).length}/${games.length}`);
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
