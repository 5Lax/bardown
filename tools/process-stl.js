#!/usr/bin/env node
// Inspect + decimate a binary STL into a tiny shared geometry for the lacrosse sticks.
// Stage 1 (inspect): node tools/process-stl.js "<path>"
// Stage 2 (build):   node tools/process-stl.js "<path>" build <targetTris>
'use strict';
const fs = require('fs');

const path = process.argv[2];
const mode = process.argv[3] || 'inspect';
const target = +(process.argv[4] || 2400);

const buf = fs.readFileSync(path);
// binary STL: 80-byte header, uint32 count, then 50 bytes/triangle
const nTri = buf.readUInt32LE(80);
const isBinary = buf.length === 84 + nTri * 50;
if (!isBinary) { console.error('Not a binary STL (or unexpected layout). length=' + buf.length); process.exit(1); }

// read all triangles → flat vertex list
const verts = new Float32Array(nTri * 9);
let off = 84;
for (let i = 0; i < nTri; i++) {
  off += 12; // skip face normal
  for (let v = 0; v < 9; v++) { verts[i * 9 + v] = buf.readFloatLE(off); off += 4; }
  off += 2; // attribute byte count
}

const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < verts.length; i += 3) {
  for (let a = 0; a < 3; a++) {
    const c = verts[i + a];
    if (c < min[a]) min[a] = c;
    if (c > max[a]) max[a] = c;
  }
}
const dim = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
console.log(`triangles: ${nTri}`);
console.log(`bbox dims (x,y,z): ${dim.map(d => d.toFixed(1)).join(', ')}`);
console.log(`longest axis: ${['x', 'y', 'z'][dim.indexOf(Math.max(...dim))]}`);

if (mode !== 'build') process.exit(0);

// --- robust decimation: vertex clustering on a grid sized to hit ~target triangles ---
// Snap each vertex to a grid cell, keep one representative per cell, rebuild faces,
// drop degenerate (collapsed) triangles. Bulletproof on messy CAD meshes.
function build(gridN) {
  const cell = Math.max(dim[0], dim[1], dim[2]) / gridN;
  const rep = new Map();         // cellKey -> new vertex index
  const outV = [];               // flat xyz of representatives
  const keyOf = (x, y, z) => {
    const ix = Math.floor((x - min[0]) / cell);
    const iy = Math.floor((y - min[1]) / cell);
    const iz = Math.floor((z - min[2]) / cell);
    return ix + ',' + iy + ',' + iz;
  };
  const idxOf = (x, y, z) => {
    const k = keyOf(x, y, z);
    let id = rep.get(k);
    if (id === undefined) { id = outV.length / 3; rep.set(k, id); outV.push(x, y, z); }
    return id;
  };
  const tris = [];
  for (let i = 0; i < verts.length; i += 9) {
    const a = idxOf(verts[i], verts[i + 1], verts[i + 2]);
    const b = idxOf(verts[i + 3], verts[i + 4], verts[i + 5]);
    const c = idxOf(verts[i + 6], verts[i + 7], verts[i + 8]);
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { outV, tris };
}

// binary-search the grid resolution to land near the target triangle count
let lo = 8, hi = 160, best = null;
for (let it = 0; it < 9; it++) {
  const g = Math.round((lo + hi) / 2);
  const r = build(g);
  const t = r.tris.length / 3;
  best = { g, r, t };
  if (t > target) hi = g; else lo = g;
}
const { outV, tris } = best.r;
const triCount = tris.length / 3;

// recenter on the bbox center, scale so the LONGEST axis = 1 (renderer scales to taste)
const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
const scale = 1 / Math.max(dim[0], dim[1], dim[2]);
const pos = [];
for (let i = 0; i < outV.length; i += 3) {
  pos.push(
    +((outV[i] - ctr[0]) * scale).toFixed(4),
    +((outV[i + 1] - ctr[1]) * scale).toFixed(4),
    +((outV[i + 2] - ctr[2]) * scale).toFixed(4));
}
const out = `// Auto-generated from ${path.split(/[\\/]/).pop()} — decimated lacrosse head, normalized to unit length.\n`
  + `window.STICK_HEAD = { dim: [${dim.map(d => +d.toFixed(2)).join(',')}], pos: [${pos.join(',')}], idx: [${tris.join(',')}] };\n`;
const outPath = require('path').join(__dirname, '..', 'vendor', 'stickhead.js');
fs.writeFileSync(outPath, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`built ${triCount} tris, ${pos.length / 3} verts → vendor/stickhead.js (${kb} KB)`);
