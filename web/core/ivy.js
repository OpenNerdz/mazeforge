// A growth simulation: vines start from roots (ground, ledges, cracks), wander over the real surfaces of
// the structure, branch, wrap round corners and thin out. Growth is drawn to shade and damp (north
// faces, grooves, under ledges, low down and along the darker stained blocks) and dies back in dry sun.
import { Rng } from './random.js';
import { vnoise } from './noise.js';
import { keyTable } from './grid.js';

const SOFT = k => k.includes('|') || k.endsWith('_leaves') || k === 'moss_carpet';
const FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };            // direction from the vine to its wall
const ORIENT = { s: 1.0, e: 0.68, w: 0.68, n: 0.55 };
const SIDES = ['e', 'n', 's', 'w'];                                          // the order faces are tried in                      // wall to the south = a north-facing, shaded face
export function applyIvy(g, P) {
  const { W, H, D, data, keys } = g;
  const R = new Rng((P.seed * 131 + (P.ivyVariation || 1) * 977) >>> 0);
  const at = (x, y, z) => (y * D + z) * W + x;
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
  const kid = keyTable(keys).id;
  const soft = keys.map(SOFT), solidAt = new Uint8Array(data.length);          // vines and leaves are only written at the end
  for (let i = 0; i < data.length; i++) if (data[i] && !soft[data[i]]) solidAt[i] = 1;
  const solid = (x, y, z) => inb(x, y, z) && solidAt[at(x, y, z)] === 1;
  const free = (x, y, z) => inb(x, y, z) && data[at(x, y, z)] === 0;

  // dampness of each block type: darker shade bands and grime / crack blocks read as wet
  const pal = P.palette, dampOf = new Map(), dry = P.ivyDryShade ?? 0, og = 1 + 2 * (P.ivyOvergrowth ?? 0);   // og: master multiplier
  (pal.bands || []).forEach((band, b) => band.forEach(k => { if (!dampOf.has(k)) dampOf.set(k, b / 8); }));
  for (const r of ['grime', 'crack', 'deep', 'rust2']) if (pal[r]) dampOf.set(pal[r], 0.95);
  const dampKey = Float64Array.from(keys, k => dampOf.get(k) ?? 0.4);
  const damp = (x, y, z) => {                                         // wet streaks from the rain simulation, plus dark blocks
    const i = at(x, y, z), v = data[i]; if (!v) return 0;
    return Math.max(dry, g.dirt ? Math.min(1, 0.35 * dampKey[v] + 1.6 * g.dirt[i]) : dampKey[v]);
  };
  const shadeK = P.ivyShade ?? 0.7;
  const cl = vnoise(W, D, Math.max(2, P.ivyCluster), R);
  const clump = (x, z) => cl[Math.max(0, Math.min(W - 1, x)) * D + Math.max(0, Math.min(D - 1, z))];
  // how welcoming a spot is for ivy growing on the wall in direction f
  const suit = (x, y, z, f) => {
    const [fx, fz] = FACE[f];
    let shelter = 0;
    for (let k = 1; k <= 6; k++) if (solid(x, y + k, z)) { shelter = 0.55 * (1 - (k - 1) / 6); break; }
    const sides = Number(solid(x, y, z - 1)) + Number(solid(x, y, z + 1)) + Number(solid(x + 1, y, z)) + Number(solid(x - 1, y, z));
    const groove = sides >= 2 ? 0.22 : 0;
    const low = 1 + 0.55 * Math.max(0, 1 - y / 22);
    const s = ORIENT[f] * (0.3 + 0.7 * damp(x + fx, y, z + fz)) * (1 + shelter + groove) * low * (0.55 + 0.9 * clump(x, z));
    return Math.pow(s, shadeK);                                            // shadeK = 0: grows anywhere; 1: strongly selective
  };
  const faceTo = (x, y, z) => { let f = ''; for (let i = 0; i < 4; i++) { const c = SIDES[i]; if (solid(x + FACE[c][0], y, z + FACE[c][1])) f += c; } return f; };

  const vines = new Map(), leaves = new Map(), carpets = new Set();
  const addVine = (x, y, z) => {
    if (!free(x, y, z)) return false;
    const f = faceTo(x, y, z), k = at(x, y, z);
    if (leaves.has(k)) return false;
    const hanging = !f;
    if (hanging && !vines.has(at(x, y + 1, z))) return false;               // hanging vines need a vine above
    vines.set(k, f || vines.get(at(x, y + 1, z)));
    return true;
  };

  // one growing strand
  const grow = (x, y, z, f, dir, energy, lateral) => {
    let hang = 0, steps = 0;
    const stack = [];
    while (energy > 0 && steps++ < 400) {
      if (!addVine(x, y, z)) break;
      if (vines.size > 60000) return;
      const here = faceTo(x, y, z);
      if (here && !here.includes(f)) f = here[0];
      const [fx, fz] = here ? FACE[f] : [0, 0];
      // ledge top next to the strand: moss / leaf clumps where the vine spills over
      if (solid(x, y - 1, z) && here && R.f() < P.ivyMoss * 0.4) carpets.add(at(x - fz, y, z + fx));
      if (dir > 0 && here && !solid(x + fx, y + 1, z + fz) && R.f() < P.ivyLeaves * 0.8) {   // reached the top of a wall face
        for (let n = R.int(1, 4); n--;) leafAt(x + fx + R.int(-1, 1) * (fz ? 1 : 0), y + 1 + (R.f() < 0.3 ? 1 : 0), z + fz + R.int(-1, 1) * (fx ? 1 : 0));
      }
      // candidate moves
      const tx = -fz, tz = fx, cand = [];
      const push = (nx, ny, nz, nf, w, hangMove) => {
        if (!free(nx, ny, nz)) return;
        const att = faceTo(nx, ny, nz);
        if (!att && !(hangMove && hang < 3)) return;
        const ff = att ? (att.includes(nf) ? nf : att[0]) : f;
        cand.push({ nx, ny, nz, nf: ff, w: w * (att ? suit(nx, ny, nz, ff) : 0.35), hanging: !att });
      };
      push(x, y + dir, z, f, 3.2, dir < 0);
      const blockedV = !free(x, y + dir, z);                             // stopped by an overhang / floor
      for (const sgn of [1, -1]) {
        const lx = x + tx * sgn, lz = z + tz * sgn, lw = (sgn === lateral ? 1.4 : 0.5) * P.ivyWander * (blockedV ? 0.3 : 1);
        if (solid(lx, y, lz)) push(x, y, z, sgn > 0 ? faceOf(tx, tz) : faceOf(-tx, -tz), lw * 0.6);      // inner corner: turn onto the new wall
        else if (here && !solid(lx + fx, y, lz + fz)) push(lx + fx, y, lz + fz, faceOf(-tx * sgn, -tz * sgn), lw * 0.8); // outer corner: wrap round
        else push(lx, y, lz, f, lw);
      }
      if (!cand.length) break;
      let tot = 0; for (const c of cand) tot += c.w;
      if (tot <= 0) break;
      let r = R.f() * tot, pick = cand[0];
      for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break; } }
      if (pick.nx === x && pick.ny === y && pick.nz === z) { f = pick.nf; energy -= 0.5; continue; }
      hang = pick.hanging ? hang + 1 : 0;
      const s = pick.hanging ? 0.4 : suit(pick.nx, pick.ny, pick.nz, pick.nf);
      energy -= 1.35 / (0.45 + s) * (vines.has(at(pick.nx, pick.ny, pick.nz)) ? 2 : 1) * (blockedV && pick.ny === y ? 2.5 : 1);
      if (R.f() < 0.1) lateral = -lateral;
      // branch: a thinner side shoot
      if (R.f() < P.ivyBranching && energy > 4) stack.push([x, y, z, f, R.f() < 0.8 ? dir : -dir, energy * R.uniform(0.35, 0.6), R.f() < 0.5 ? 1 : -1]);
      x = pick.nx; y = pick.ny; z = pick.nz; f = pick.nf;
    }
    for (const b of stack) grow(...b);
  };
  const faceOf = (dx, dz) => dx > 0 ? 'e' : dx < 0 ? 'w' : dz > 0 ? 's' : 'n';
  const leafAt = (x, y, z) => { if (free(x, y, z) && !vines.has(at(x, y, z))) leaves.set(at(x, y, z), R.f() < 0.22 ? leafB : leafA); };
  const leafA = P.ivyLeafBlock || 'azalea_leaves', leafB = leafA === 'azalea_leaves' ? 'flowering_azalea_leaves' : leafA;

  // roots: gather spots, weighted by how welcoming they are
  const drapes = [], roots = [], cracks = [];
  const nearWall = new Uint8Array(data.length);                     // air with a wall beside it: the only places to look
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = at(x, y, z); if (!solidAt[i]) continue;
    if (x > 0) nearWall[i - 1] = 1; if (x < W - 1) nearWall[i + 1] = 1; if (z > 0) nearWall[i - W] = 1; if (z < D - 1) nearWall[i + W] = 1;
  }
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!nearWall[at(x, y, z)] || !free(x, y, z)) continue;
    for (let s = 0; s < 4; s++) {
      const f = SIDES[s], [fx, fz] = FACE[f];
      if (!solid(x + fx, y, z + fz)) continue;
      const topEdge = !solid(x + fx, y + 1, z + fz), underLedge = solid(x, y + 1, z);
      if ((topEdge || underLedge) && y > 4) drapes.push([x, y, z, f]);
      else if ((y === 0 || solid(x, y - 1, z)) && y <= 3) roots.push([x, y, z, f]);
      else if (damp(x + fx, y, z + fz) > 0.85 && y > 6) cracks.push([x, y, z, f]);
    }
  }
  const sow = (list, rate, dir, energy, width) => {
    for (const [x, y, z, f] of list) {
      const s = suit(x, y, z, f);
      if (R.f() >= rate * s) continue;
      const [fx, fz] = FACE[f], tx = -fz, tz = fx, w = R.int(0, Math.max(0, width));
      for (let k = -w; k <= w; k++) {                                    // a clump of strands, longer in the middle
        const prof = 1 - Math.pow(Math.abs(k) / (w + 1), 1.5);
        const sx = x + tx * k, sz = z + tz * k;
        if (!free(sx, y, sz) || !solid(sx + fx, y, sz + fz)) continue;
        grow(sx, y, sz, f, dir, energy * (0.3 + 0.7 * prof) * R.uniform(0.6, 1.25), R.f() < 0.5 ? 1 : -1);
      }
      if (dir < 0 && !solid(x + fx, y + 1, z + fz) && R.f() < P.ivyLeaves) {   // leaves spilling over the ledge above a drape
        for (let n = R.int(1, 5); n--;) leafAt(x + fx + R.int(-1, 1) * (fz ? 1 : 0), y + 1 + (R.f() < 0.25 ? 1 : 0), z + fz + R.int(-1, 1) * (fx ? 1 : 0));
        if (R.f() < 0.5) leafAt(x, y + 1, z);
      }
    }
  };
  const reach = Math.sqrt(og);
  sow(drapes, P.ivyAmount * 0.06 * og, -1, P.ivyLength * reach, P.ivyWidth);
  sow(roots, P.ivyClimb * 0.10 * og, 1, P.ivyClimbHeight * reach, P.ivyWidth + 1);
  sow(cracks, P.ivyAmount * 0.008 * og, R.f() < 0.5 ? 1 : -1, P.ivyLength * 0.45 * reach, 1);

  // dense mats get leafy: swap some vines for leaves pressed against the wall
  const isVine = new Uint8Array(data.length); for (const k of vines.keys()) isVine[k] = 1;
  for (const [k] of vines) {
    const x = k % W, z = Math.floor(k / W) % D, y = Math.floor(k / (W * D));
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (isVine[at(x + dx, y + dy, z + dz)] === 1) n++;
    const holdsHanging = isVine[at(x, y - 1, z)] === 1 && !faceTo(x, y - 1, z);
    if (n >= 8 && !holdsHanging && R.f() < P.ivyLeaves * 0.18 && faceTo(x, y, z)) leaves.set(k, R.f() < 0.22 ? leafB : leafA);
  }
  for (const [k, fs] of vines) if (!leaves.has(k)) data[k] = kid('vine|' + [...fs].sort().join(''));
  for (const [k, b] of leaves) if (!data[k]) data[k] = kid(b);
  for (const k of carpets) {
    const x = k % W, z = Math.floor(k / W) % D, y = Math.floor(k / (W * D));
    // the roll is taken either way, so games without moss carpet (before 1.17) get the same ivy, just no carpets
    if (inb(x, y, z) && !data[k] && solid(x, y - 1, z) && R.f() < 0.7 && P.mossCarpet !== false) data[k] = kid('moss_carpet');
  }
  return g;
}
