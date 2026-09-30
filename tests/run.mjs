// Regression tests for the generator. Run with:  node tests/run.mjs
// Checks every preset and piece type for floating vines, see-through holes and .schem roundtrips,
// and checks that the rain simulation is physical (wind side gets wetter) and local (sliders only
// change the blocks they touch).
import { generate, DEFAULTS, PRESETS, PIECES } from '../web/gen.js';
import { effectivePalette } from '../web/palette.js';
import { writeSchem, readSchem } from '../web/schem.js';
import fs from 'fs';

const lib = JSON.parse(fs.readFileSync(new URL('../web/textures/library.json', import.meta.url)));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const params = extra => { const P = { ...structuredClone(DEFAULTS), ...structuredClone(extra) }; P.palette = effectivePalette(P, lib).palette; return P; };
const soft = k => k.includes('|') || k.endsWith('_leaves') || k === 'moss_carpet';
const OFF = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

async function inspect(name, P) {
  const t0 = performance.now(); const g = generate(P); const ms = performance.now() - t0;
  const { W, H, D, data, keys } = g, at = (x, y, z) => (y * D + z) * W + x;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && data[at(x, y, z)] && !soft(keys[data[at(x, y, z)]]);
  let floating = 0, holes = 0;
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = keys[data[at(x, y, z)]];
    if (!k.startsWith('vine|')) continue;
    const held = [...k.split('|')[1]].some(c => solid(x + OFF[c][0], y, z + OFF[c][1])) || (y + 1 < H && keys[data[at(x, y + 1, z)]].startsWith('vine|'));
    if (!held) floating++;
  }
  if (P.piece === 'straight') for (let x = 3; x < W - 3; x++) for (let y = 6; y < Math.min(60, H - 8); y++) {
    let any = false; for (let z = 0; z < D && !any; z++) any = solid(x, y, z);
    if (!any) holes++;
  }
  const back = await readSchem((await writeSchem(g, lib)).buffer);
  let same = back.W === W && back.H === H && back.D === D;
  for (let i = 0; i < data.length && same; i++) same = back.keys[back.data[i]] === keys[data[i]];
  const ok = check(!floating, `${name}: ${floating} floating vines`) & check(!holes, `${name}: ${holes} see-through holes`) & check(same, `${name}: schem roundtrip mismatch`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(34)} ${W}x${H}x${D} ${ms.toFixed(0).padStart(4)}ms`);
  return g;
}

// ---- structure invariants
for (const [name, pre] of Object.entries(PRESETS)) for (const seed of [1, 2]) await inspect(`preset "${name}" s${seed}`, params({ ...pre, seed }));
for (const piece of Object.keys(PIECES)) for (const layout of ['stacked', 'towers', 'cantilever'])
  await inspect(`${piece} ${layout}`, params({ piece, layout, seed: 3, width: piece === 'straight' ? 30 : 34 }));
{ // corner orientation: the outer faces are south (z = D-1) and east (x = W-1), the inner quadrant has no solid blocks
  const P = params({ piece: 'corner', seed: 1 }), g = generate(P), { W, H, D, data, keys } = g, T = P.thickness;
  let nw = 0; for (let y = 0; y < H; y++) for (let z = 0; z < D - T; z++) for (let x = 0; x < W - T; x++) { const v = data[(y * D + z) * W + x]; if (v && !soft(keys[v])) nw++; }
  check(nw === 0, `corner: ${nw} blocks in the inner quadrant`);
}

// ---- every straight wall has a real front and back (not just end caps), and the layout actually matters
for (const width of [12, 20, 24, 26, 40]) {
  const g = generate(params({ seed: 1, width }));
  check(g.faces === 2, `straight wall ${width} wide: ${g.faces} faces (want 2)`);
}
{ const sig = layout => { const g = generate(params({ seed: 1, ivy: false, layout })); return g.H + ":" + Array.from(g.data, v => g.keys[v]).join(); };
  const base = sig('stacked');
  for (const layout of ['towers', 'cantilever', 'beam', 'slab']) check(sig(layout) !== base, `layout "${layout}" builds the same wall as "stacked"`); }
console.log('ok   faces and layouts checked');

// ---- seam matching: the end columns of walls with different seeds have the same shape
{ const solidAt = g => (x, y, z) => { if (y >= g.H) return 0; const v = g.data[(y * g.D + z) * g.W + x]; return v && !soft(g.keys[v]) ? 1 : 0; };
  const edgeSig = g => { const s = solidAt(g), out = []; for (const x of [0, 1, g.W - 2, g.W - 1]) for (let y = 0; y < DEFAULTS.heightMax + 2; y++) for (let z = 0; z < g.D; z++) out.push(s(x, y, z)); return out.join(''); };
  const a = generate(params({ seed: 1, seamMatch: true, ivy: false })), b = generate(params({ seed: 2, seamMatch: true, ivy: false }));
  check(edgeSig(a) === edgeSig(b), 'seam matching: wall ends differ between seeds');
  const c = generate(params({ seed: 1, seamMatch: true, seamPattern: 5, ivy: false }));
  check(edgeSig(a) !== edgeSig(c), 'seam pattern has no effect'); }
// ---- face overrides only change their own face
{ const base = generate(params({ piece: 'corner', seed: 4, ivy: false })), fl = base.faceList;
  check(fl.length === 4, `corner: ${fl.length} faces listed`);
  const f = fl.find(q => !q.primary), g = generate(params({ piece: 'corner', seed: 4, ivy: false, faceOverrides: { [f.i]: { layout: 'towers' } } }));
  check(g.faceList.find(q => q.i === f.i).layout === 'towers', 'face override layout not applied');
  let diff = 0; for (let i = 0; i < g.data.length && g.H === base.H; i++) if (g.data[i] !== base.data[i]) diff++;
  check(g.H !== base.H || diff > 0, 'face override changed nothing'); }
// ---- skyline controls and broken tops actually change the top
{ const top = g => { let s = 0; for (let x = 0; x < g.W; x++) for (let z = 0; z < g.D; z++) for (let y = g.H - 1; y >= 0; y--) if (g.data[(y * g.D + z) * g.W + x]) { s += y; break; } return s; };
  const flat = top(generate(params({ seed: 3, ivy: false, skylineRough: 0 })));
  check(top(generate(params({ seed: 3, ivy: false, skylineRough: 1 }))) < flat, 'skyline roughness did not lower any tops');
  check(top(generate(params({ seed: 3, ivy: false, skylineRough: 0, ruin: 1 }))) < flat, 'broken tops removed nothing');
  check(top(generate(params({ seed: 3, ivy: false, skylineRough: 0, skylineSlope: 1 }))) < flat, 'skyline slope did nothing'); }
console.log('ok   seams, face overrides and skyline checked');

// ---- rain physics
const faceDirt = (g, dz) => { const { W, H, D, data, dirt } = g, at = (x, y, z) => (y * D + z) * W + x; let s = 0, n = 0;
  for (let y = 5; y < H; y++) for (let z = 0; z < D; z++) for (let x = 3; x < W - 3; x++) {
    if (!data[at(x, y, z)]) continue; const z2 = z + dz;
    if (z2 < 0 || z2 >= D || !data[at(x, y, z2)]) { s += dirt[at(x, y, z)]; n++; } }
  return s / n; };
{
  let calmS = 0, windS = 0, calmN = 0, windN = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const calm = generate(params({ ivy: false, seed, windRain: 0, sunDrying: 0 }));
    const wind = generate(params({ ivy: false, seed, windRain: 1, windDir: 180, sunDrying: 0 }));
    calmS += faceDirt(calm, 1); windS += faceDirt(wind, 1); calmN += faceDirt(calm, -1); windN += faceDirt(wind, -1);
  }
  check(windS > calmS * 1.3, `wind from the south should wet south faces (${calmS.toFixed(3)} -> ${windS.toFixed(3)})`);
  check(Math.abs(windN - calmN) < calmN * 0.1 + 1e-3, `wind from the south should leave north faces alone (${calmN.toFixed(3)} -> ${windN.toFixed(3)})`);
  const dry = generate(params({ ivy: false, seed: 1, windRain: 0, sunDrying: 1 })), wet = generate(params({ ivy: false, seed: 1, windRain: 0, sunDrying: 0 }));
  check(faceDirt(dry, 1) < faceDirt(wet, 1), 'sun drying should lower dirt on the sunny (south) face');
  console.log('ok   rain physics checked');
}

// ---- locality: a rain slider may only change blocks that are wet in either version
for (const [key, a, b] of [['streakLength', 32, 16], ['streakStrength', 1.05, 0.6], ['windRain', 0.35, 0.8]]) {
  const g1 = generate(params({ ivy: false, seed: 5, [key]: a })), g2 = generate(params({ ivy: false, seed: 5, [key]: b }));
  let dryChanged = 0;
  for (let i = 0; i < g1.data.length; i++)
    if (g1.dirt[i] === 0 && g2.dirt[i] === 0 && g1.keys[g1.data[i]] !== g2.keys[g2.data[i]]) dryChanged++;
  check(dryChanged === 0, `${key}: ${dryChanged} dry blocks changed`);
}
console.log('ok   slider locality checked');

// ---- determinism: same parameters, same blocks
{ const g1 = generate(params({ seed: 9 })), g2 = generate(params({ seed: 9 }));
  check(g1.data.every((v, i) => g1.keys[v] === g2.keys[g2.data[i]]), 'generate() is not deterministic'); }

if (fails.length) { console.log(`\n${fails.length} problem(s):\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('\nall tests passed');
