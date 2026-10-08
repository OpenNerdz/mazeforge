// Regression tests. Run with:  npm test   (or node tests/run.mjs; add --update to accept new output fingerprints)
// Checks every preset and piece type for floating vines and carpets, see-through holes and .schem roundtrips, that the rain
// simulation is physical (wind side gets wetter) and local (sliders only change the blocks they touch), that the
// generator's output is unchanged (fingerprints), and that meshes draw exactly the visible block faces.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { generate } from '../web/core/generate.js';
import { DEFAULTS, PRESETS } from '../web/core/settings.js';
import { PIECES, pieceMask } from '../web/core/pieces.js';
import { effectivePalette } from '../web/core/palette.js';
import { writeSchem, readSchem, stateString } from '../web/core/schem.js';
import { zipReader } from '../web/core/texture-import.js';
import { buildMesh, UNIT, FACE } from '../web/core/mesh.js';
import { withDefaults } from '../web/ui/state.js';

const lib = JSON.parse(fs.readFileSync(new URL('../web/textures/library.json', import.meta.url), 'utf8'));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const params = extra => { const P = { ...structuredClone(DEFAULTS), ...structuredClone(extra) }; P.palette = effectivePalette(P, lib).palette; return P; };
const soft = k => k.includes('|') || k.endsWith('_leaves') || k === 'moss_carpet';
const OFF = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

// Imported settings respect the same bounds as the UI and keep supported presets intact.
{
  const bad = withDefaults({ width: 1e9, heightMax: Infinity, layout: 'unknown',
    palette: { deep: '<invalid>', bands: [[]] }, autoBlocks: ['stone', null], faceOverrides: { '0': { layout: 'towers', seed: 2 } } });
  check(bad.width === 96 && bad.heightMax === DEFAULTS.heightMax && bad.layout === DEFAULTS.layout, 'invalid imported dimensions/layout must be bounded');
  check(bad.palette.deep === DEFAULTS.palette.deep && bad.palette.bands[0].length > 0 && bad.autoBlocks.length === 1, 'invalid imported palettes must keep safe defaults');
  check(bad.faceOverrides[0].layout === 'towers', 'valid face overrides must survive importing');
  for (const [name, preset] of Object.entries(PRESETS)) {
    const loaded = withDefaults(preset);
    check(Object.entries(preset).every(([k, v]) => JSON.stringify(loaded[k]) === JSON.stringify(v)), `${name}: preset import changed settings`);
  }
  const oldLeaves = { oak_leaves: { id: 'minecraft:oak_leaves', properties: { distance: ['7'], persistent: ['true', 'false'] } } };
  check(stateString('oak_leaves', oldLeaves) === 'minecraft:oak_leaves[distance=7,persistent=true]', 'older leaf states must omit unsupported waterlogged property');
  try { zipReader(new ArrayBuffer(10)); check(false, 'invalid JAR must be rejected'); } catch { /* expected */ }
  const versioned = { ...lib };
  Object.defineProperty(versioned, 'dataVersion', { value: 3955 });
  const sample = { W: 1, H: 1, D: 1, keys: ['air', 'stone'], data: new Uint16Array([1]) };
  const decoded = await readSchem((await writeSchem(sample, versioned)).buffer);
  check(decoded.dataVersion === 3955, 'schematic must use the imported Minecraft data version');
  // a negative byte-array length once sent the reader back over the same bytes for ever
  const looping = new Uint8Array([10, 0, 0, 7, 0, 0, 0xff, 0xff, 0xff, 0xf9, 0, 0]);
  check(await readSchem(looping.buffer).then(() => false, () => true), 'a damaged schematic must be rejected, not read for ever');
  let tooBig = false;
  try { generate(params({ piece: 'maze', mazeCols: 16, mazeRows: 16, mazeCorridor: 30, mazeWall: 30, heightMax: 200 })); } catch { tooBig = true; }
  check(tooBig, 'a design too large for a browser tab must fail with a message');
  // games before 1.17 have no moss carpet: the same ivy, without carpets
  const P = params({ ...PRESETS['Overgrown wall'], seed: 2 }), withCarpet = generate(P), without = generate({ ...P, mossCarpet: false });
  const carpet = withCarpet.keys.indexOf('moss_carpet');
  check(carpet > 0 && !without.keys.includes('moss_carpet') && withCarpet.data.every((v, i) => v === carpet ? !without.data[i] : without.keys[without.data[i]] === withCarpet.keys[v]),
    'without moss carpet, only the carpets may differ');
}

async function inspect(name, P) {
  const t0 = performance.now(); const g = generate(P); const ms = performance.now() - t0;
  const { W, H, D, data, keys } = g, at = (x, y, z) => (y * D + z) * W + x;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && data[at(x, y, z)] && !soft(keys[data[at(x, y, z)]]);
  let floating = 0, holes = 0, carpets = 0;
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = keys[data[at(x, y, z)]];
    if (k === 'moss_carpet' && !solid(x, y - 1, z)) carpets++;
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
  const ok = check(!floating, `${name}: ${floating} floating vines`) & check(!carpets, `${name}: ${carpets} moss carpets not on a solid block`) & check(!holes, `${name}: ${holes} see-through holes`) & check(same, `${name}: schem roundtrip mismatch`);
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
// faces meeting at corners and wall tips must not cut a slot right through a wall: a cross-section of a wall
// (a footprint span no wider than the wall) all air, wall on both sides of it and wall above it
for (const name of ['Corner piece', 'Overgrown corner', 'T-junction', 'Twin towers', 'Maze with Glade']) for (const seed of [1, 2, 3]) {
  const P = params({ ...PRESETS[name], seed }), { W, H, D, data, keys } = generate(P), { mask } = pieceMask(P), T = P.piece === 'maze' ? P.mazeWall : P.thickness;
  const solid = (x, y, z) => { const v = data[(y * D + z) * W + x]; return v && !soft(keys[v]); };
  let slots = 0;
  for (const along of [0, 1]) for (let c = 1; c < (along ? W : D) - 1; c++) for (let a = 0, n = along ? D : W; a < n;) {
    const m = t => along ? mask[c * D + t] : mask[t * D + c], at = (cc, y, t) => along ? solid(cc, y, t) : solid(t, y, cc);
    if (!m(a)) { a++; continue; }
    let b = a; while (b < n && m(b)) b++;
    if (b - a <= T + 2) for (let y = 4; y < H - 6; y++) {
      let open = true, before = false, after = false, over = false;
      for (let t = a; t < b && open; t++) open = !at(c, y, t);
      if (!open) continue;
      for (let t = a; t < b; t++) { before ||= at(c - 1, y, t); after ||= at(c + 1, y, t); for (let yy = y + 1; yy < H && !over; yy++) over = at(c, yy, t); }
      if (before && after && over) slots++;
    }
    a = b;
  }
  check(!slots, `${name} s${seed}: ${slots} slot cells cut through a wall`);
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

// ---- fingerprints: the exact blocks of a few designs (a deliberate change to the generator needs --update)
{
  const file = new URL('fingerprints.json', import.meta.url), known = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const cases = { straight: {}, wide: { width: 96 }, corner: { piece: 'corner', width: 30 }, cross: { piece: 'cross', width: 56 },
    maze: PRESETS['Maze with Glade'], overgrown: PRESETS['Overgrown wall'], ruined: PRESETS['Ruined low wall'],
    features: { portholes: 2, grilles: 3, hazards: 1, channels: 2, doorways: 1, windows: 2, numberText: '7', layout: 'slab' } };
  const now = {};
  for (const [name, extra] of Object.entries(cases)) {
    const g = generate(params(extra));
    now[name] = createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).update(JSON.stringify([g.keys, g.W, g.H, g.D])).digest('hex').slice(0, 16);
    if (!process.argv.includes('--update')) check(known[name] === now[name], `fingerprint changed: ${name} (run with --update if intended)`);
  }
  if (process.argv.includes('--update')) fs.writeFileSync(file, JSON.stringify(now, null, 2) + '\n');
  console.log('ok   fingerprints checked');
}

// ---- meshes: every quad, split back into unit faces, must be exactly the set of visible cube faces
{
  const faceKey = (x, y, z, f) => `${x},${y},${z},${f}`;
  const e = k => lib[k.split('|')[0]], cube = k => k !== 'air' && !k.includes('|') && (!e(k) || !['box', 'cross'].includes(e(k).shape));
  // the faces a mesh draws: unit faces of every quad of the cube passes, keyed by the block in front of which they sit
  const drawn = (mesh, g) => {
    const out = new Map();
    mesh.parts.forEach(v => {
      if (!v) return;
      for (let q = 0; q < v.length; q += 24) {
        const w = v[q + 3], f = Math.floor(w / FACE), layer = w - f * FACE; if (f > 5) continue;
        const d = f >> 1, pts = [0, 4, 8, 20].map(o => [v[q + o], v[q + o + 1], v[q + o + 2]]);
        const lo = [0, 1, 2].map(a => Math.min(...pts.map(p => p[a]))), hi = [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])));
        if (lo.some(c => c % UNIT) || hi.some(c => c % UNIT)) continue;                // not a whole-block face (slabs, bars, vines)
        const plane = lo[d] / UNIT, cell = f & 1 ? plane : plane - 1, u = (d + 1) % 3, vv = (d + 2) % 3;
        for (let a = lo[u] / UNIT; a < hi[u] / UNIT; a++) for (let b = lo[vv] / UNIT; b < hi[vv] / UNIT; b++) {
          const c = [0, 0, 0]; c[d] = cell; c[u] = a; c[vv] = b;
          if (!cube(g.keys[g.data[(c[1] * g.D + c[2]) * g.W + c[0]]])) continue;             // a slab's or carpet's own face
          const k = faceKey(c[0], c[1], c[2], f); check(!out.has(k), `face drawn twice: ${k}`); out.set(k, mesh.tiles[layer]);
        }
      }
    });
    return out;
  };
  const expected = g => {
    const out = new Map(), at = (x, y, z) => (y * g.D + z) * g.W + x;
    const occ = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= g.W || y >= g.H || z >= g.D) return false; const k = g.keys[g.data[at(x, y, z)]]; return k !== 'air' && !k.includes('|') && (e(k)?.full ?? true); };
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let y = 0; y < g.H; y++) for (let z = 0; z < g.D; z++) for (let x = 0; x < g.W; x++) {
      const k = g.keys[g.data[at(x, y, z)]]; if (!cube(k)) continue;
      N.forEach(([dx, dy, dz], f) => {
        const nk = g.keys[g.data[at(x + dx, y + dy, z + dz)]] ?? 'air', inside = x + dx >= 0 && y + dy >= 0 && z + dz >= 0 && x + dx < g.W && y + dy < g.H && z + dz < g.D;
        if (occ(x + dx, y + dy, z + dz) || (inside && nk === k && e(k)?.alpha === 'blend')) return;
        out.set(faceKey(x, y, z, f), e(k) ? (e(k).faces || [])[f] ?? e(k).icon : null);
      });
    }
    return out;
  };
  const same = (g, label) => {
    const got = drawn(buildMesh([g], lib), g), want = expected(g);
    let missing = 0, extra = 0, wrongTex = 0;
    for (const [k, t] of want) { if (!got.has(k)) missing++; else if (t !== null && got.get(k) !== t) wrongTex++; }
    for (const k of got.keys()) if (!want.has(k)) extra++;
    check(!missing && !extra && !wrongTex, `${label}: ${missing} faces missing, ${extra} extra, ${wrongTex} with the wrong texture`);
  };
  const grid = (W, H, D, keys, fill) => { const data = new Uint16Array(W * H * D); for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) data[(y * D + z) * W + x] = fill(x, y, z); return { W, H, D, data, keys }; };
  const quads = g => buildMesh([g], lib).parts.reduce((a, v) => a + (v ? v.length / 24 : 0), 0);
  check(quads(grid(3, 3, 3, ['air', 'stone'], () => 1)) === 6, 'a solid 3×3×3 of one block should be 6 quads');
  check(quads(grid(2, 1, 1, ['air', 'stone', 'andesite'], x => x + 1)) === 10, 'two different blocks side by side should be 10 quads');
  same(grid(4, 3, 3, ['air', 'stone', 'glass', 'oak_leaves', 'oak_log', 'mod_block'], (x, y, z) => (x + y * 2 + z) % 6), 'mixed blocks');
  for (const name of ['Classic wall', 'Overgrown corner', 'Maze with Glade', 'Vent wall']) same(generate(params(PRESETS[name])), name);
  const only = buildMesh([generate(params({}))], lib, { only: 'mossy_stone_bricks' });
  check(only.tiles.length === 1 && only.tiles[0] === lib.mossy_stone_bricks.icon, 'isolating a block should mesh only that block');
  console.log('ok   meshes checked');
}

if (fails.length) { console.log(`\n${fails.length} problem(s):\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('\nall tests passed');
