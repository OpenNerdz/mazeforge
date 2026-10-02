// Rain lands on every top open to the sky, flows across each top towards its edges (gathering at low
// points, so it leaves at a few drip points) and runs down the face below: wandering, widening, landing
// on ledges that stick out (which drain again from their own edges) or dripping free where the wall
// steps back. Anything sheltered under an overhang stays dry. Returns water per block face / top.
import { vnoise } from './noise.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// occ: 1 = solid, index (y*D + z)*W + x
export function simulateWater(W, H, D, occ, P, R) {
  const at = (x, y, z) => (y * D + z) * W + x, layer = W * D;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && occ[at(x, y, z)] === 1;
  const flow = new Float32Array(W * H * D), through = new Float32Array(W * H * D);
  const isTop = (x, y, z) => solid(x, y, z) && !solid(x, y + 1, z);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = H - 1; y >= 0; y--) if (solid(x, y, z)) { through[at(x, y, z)] += 1; break; }
  const bump = vnoise(W, D, 3, R), focus = (1 - P.streakCoverage) * 4, decay = Math.exp(-1 / Math.max(2, P.streakLength));
  const runDown = (wx, y, wz, dx, dz, amt) => {                        // down the face of column (wx, wz), open towards (dx, dz)
    const tx = -dz, tz = dx;
    for (let yy = y; yy >= 0 && amt > 0.02; yy--) {
      if (yy < y) {
        if (solid(wx + dx, yy, wz + dz)) { through[at(wx + dx, yy, wz + dz)] += amt * 0.85; return; }   // lands on a ledge below
        if (!solid(wx, yy, wz)) {                                                                         // the wall steps back
          // some water clings to the soffit and creeps back to the recessed wall, staining it just below the ledge
          let k = 1; while (k <= 6 && !solid(wx - dx * k, yy, wz - dz * k) && solid(wx - dx * k, yy + 1, wz - dz * k)) k++;
          const creep = k <= 6 && solid(wx - dx * k, yy, wz - dz * k) ? amt * P.soffitCreep : 0;
          for (let j = 0; j < k && creep; j++) flow[at(wx - dx * j, yy + 1, wz - dz * j)] += creep * 0.5;
          if (creep) runDown(wx - dx * k, yy, wz - dz * k, dx, dz, creep);
          for (let y2 = yy - 1; y2 >= 0 && amt > creep; y2--) if (solid(wx, y2, wz)) { through[at(wx, y2, wz)] += (amt - creep) * 0.75; break; }
          return;
        }
      }
      flow[at(wx, yy, wz)] += amt;
      const spread = Math.min(0.45, (y - yy) * 0.03);                 // streaks widen as they run
      for (const s of [1, -1]) for (let r = 1; r <= 1; r++) {
        const hx = wx + tx * s * r, hz = wz + tz * s * r;
        if (!solid(hx, yy, hz) || solid(hx + dx, yy, hz + dz)) break;
        flow[at(hx, yy, hz)] += amt * spread / r;
      }
      if (R.f() < 0.05) {                                                // and wander a little
        const s = R.f() < 0.5 ? 1 : -1, nx = wx + tx * s, nz = wz + tz * s;
        if (solid(nx, yy, nz) && !solid(nx + dx, yy, nz + dz)) { wx = nx; wz = nz; }
      }
      amt *= decay;
    }
  };
  const dist = new Int32Array(W * D).fill(-1), height = new Float64Array(W * D);   // per top layer, index x*D + z
  for (let y = H - 1; y >= 0; y--) {
    const cells = [];
    for (let z = 0, i = y * layer; z < D; z++) for (let x = 0; x < W; x++, i++) if (occ[i] === 1 && (y === H - 1 || occ[i + layer] !== 1)) cells.push(x * D + z);
    if (!cells.length) continue;
    // distance to the nearest edge, roughened so water gathers at a few low points
    const q = [];
    for (const c of cells) { const x = Math.floor(c / D), z = c % D; if (DIRS4.some(([dx, dz]) => !solid(x + dx, y, z + dz))) { dist[c] = 0; q.push(c); } }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = Math.floor(c / D), z = c % D;
      for (const [dx, dz] of DIRS4) { const k = c + dx * D + dz; if (isTop(x + dx, y, z + dz) && dist[k] < 0) { dist[k] = dist[c] + 1; q.push(k); } }
    }
    for (const c of cells) height[c] = (dist[c] < 0 ? 99 : dist[c]) + focus * bump[c];
    cells.sort((a, b) => height[b] - height[a]);
    for (const c of cells) {
      const x = Math.floor(c / D), z = c % D, w = through[at(x, y, z)];
      if (w) {
        let best = -1, bh = height[c];
        for (const [dx, dz] of DIRS4) if (isTop(x + dx, y, z + dz) && height[c + dx * D + dz] < bh) { bh = height[c + dx * D + dz]; best = c + dx * D + dz; }
        if (best >= 0) through[at(Math.floor(best / D), y, best % D)] += w;
        else {
          const open = DIRS4.filter(([dx, dz]) => !solid(x + dx, y, z + dz));   // an edge low point: drip over
          for (const [dx, dz] of open) runDown(x, y, z, dx, dz, w / open.length);
        }
      }
    }
    for (const c of cells) dist[c] = -1;
  }
  if (P.windRain > 0) {
    const a = P.windDir * Math.PI / 180, sx = Math.sin(a), sz = -Math.cos(a);          // towards where the wind comes from
    const windward = DIRS4.map(([dx, dz]) => [dx, dz, dx * sx + dz * sz]).filter(d => d[2] > 0.2);   // faces that look into the wind
    for (let y = 1; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (occ[at(x, y, z)] !== 1) continue;
      for (const [dx, dz, facing] of windward) {
        if (solid(x + dx, y, z + dz)) continue;
        let open = true;                                                               // rain comes in at ~45° down
        for (let k = 1; k <= 12 && open; k++) if (solid(Math.round(x + dx + sx * k), y + k, Math.round(z + dz + sz * k))) open = false;
        if (open) flow[at(x, y, z)] += P.windRain * facing * 1.4;
      }
    }
  }
  return { flow, through };
}
