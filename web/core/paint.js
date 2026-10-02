// The shared final pass: rain -> dirt, then a block for every solid cell.
import { Rng, roll } from './random.js';
import { vnoise } from './noise.js';
import { shadeBlock } from './skin.js';
import { simulateWater } from './water.js';
import { keyTable } from './grid.js';

// 1 or 2 = distance to the nearest open side (dirt gathers along edges), 9 = well inside
function edgeDist(solid, x, y, z) {
  for (let d = 1; d <= 2; d++) if (!solid(x, y, z + d) || !solid(x, y, z - d) || !solid(x + d, y, z) || !solid(x - d, y, z)) return d;
  return 9;
}

// Tops (ledges, wall top) get their own weathering in x AND z, instead of inheriting the face's columns,
// which used to repeat one block across the whole thickness. Rain collects up here: more grime and moss.
function makeTop(W, D, P, seed) {
  const R = new Rng(seed >>> 0), pal = P.palette;
  const n1 = vnoise(W, D, 9, R), n2 = vnoise(W, D, 2.6, R), wet = vnoise(W, D, 5.5, R), pick = vnoise(W, D, P.patchSize, R).map(v => v * 2.7);
  const V = new Float32Array(W * D);
  for (let i = 0; i < W * D; i++) {
    const puddle = Math.max(0, wet[i] - 0.58) / 0.42;
    V[i] = P.baseTone + 0.1 + 0.2 * (n1[i] - 0.5) + 0.1 * (n2[i] - 0.5) + P.speckle * (R.f() - 0.5) + 0.45 * puddle;
  }
  return {
    block(x, y, z, edgeDist, water = 0) {
      const i = x * D + z, r = salt => roll(seed, (y * W + x) * D + z, salt);
      let b = shadeBlock(pal, V[i] + water + (edgeDist <= 1 ? 0.06 : 0), pick[i], r(0));   // dirt collects along the edges
      const puddle = Math.max(0, wet[i] - 0.58) / 0.42;
      if (r(1) < (0.05 + 0.5 * puddle + 0.8 * water) * P.moss) b = pal.grime;
      else if (r(2) < 0.015 + 0.02 * P.chips) b = pal.crack;
      return b;
    },
  };
}

// Shared final pass for straight walls and corners: water -> dirt, then a block for every solid cell.
// faceFn(x, y, z, open, wet) picks the block for a side-facing surface.
export function paint(W, H, D, occ, P, faceFn) {
  const at = (x, y, z) => (y * D + z) * W + x;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && occ[at(x, y, z)] === 1;
  const water = simulateWater(W, H, D, occ, P, new Rng(P.seed * 53 + 11));
  const roof = makeTop(W, D, P, P.seed * 17 + 5), k = P.streakStrength;
  const { keys, id } = keyTable(), data = new Uint16Array(W * H * D), dirt = new Float32Array(W * H * D);
  const o = { n: false, s: false, e: false, w: false, u: false, d: false };           // which sides are open (reused)
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = at(x, y, z); if (!occ[i]) continue;
    o.n = !solid(x, y, z - 1); o.s = !solid(x, y, z + 1); o.e = !solid(x + 1, y, z); o.w = !solid(x - 1, y, z); o.u = !solid(x, y + 1, z); o.d = !solid(x, y - 1, z);
    const side = o.n || o.s || o.e || o.w;
    let b;
    if (!side && !o.u && !o.d) b = P.palette.interior;
    else if (o.u && !side) { dirt[i] = Math.min(0.5, k * 0.12 * Math.log1p(Math.max(0, water.through[i] - 1) / 3)); b = roof.block(x, y, z, edgeDist(solid, x, y, z), dirt[i]); }
    else {
      const f = water.flow[i], washed = 1 - P.washing * f / (f + 25);             // heavy flow washes the centre clean
      const sun = o.s ? 1 - 0.35 * P.sunDrying : o.n ? 1 + 0.3 * P.sunDrying : 1;  // south faces dry out, north stay damp
      dirt[i] = Math.min(0.5, k * 0.22 * Math.log1p(f / 1.5) * washed * sun);
      b = faceFn(x, y, z, o, dirt[i]);
    }
    data[i] = id(b);
  }
  return { data, keys, id, dirt, at };
}
