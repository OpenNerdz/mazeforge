// The footprint builder: turns a floor plan into a finished, painted structure.
import { Rng, roll } from './random.js';
import { Skin, NONE, splitWidth } from './skin.js';
import { LAYOUTS } from './layouts.js';
import { paint } from './paint.js';
import { trimTop } from './grid.js';

// iron bars in port-holes and vent louvres; put(u, y, depth, variant) maps skin space to the world
function fixtures(skin, put) {
  for (const { cx, cy, r, f } of skin.bars) for (let u = cx - r; u <= cx + r; u++) for (let y = cy - r; y <= cy + r; y++)
    if (Math.hypot(u - cx, y - cy) <= r - 0.4 && (u - cx) % 2) put(u, y, f + 1, 'v');
  for (const { x, y, z } of skin.louvre) put(x, y, z, 'h');
}

function buildSkin(W, H, seed, P, layout, feat, u, span) {
  const s = new Skin(W, H, seed, P);
  LAYOUTS[layout](s); s.skyline(u, span); s.seam(); s.plinth(); s.features(feat);
  s.weather();
  return s;
}

function featBundle(P, side, k = 1) {
  const q = v => Math.round(v * k);
  const lettering = side === 'front' ? (P.numberSide !== 'back' ? P.numberText : '') : (P.numberSide !== 'front' ? P.numberText : '');
  return { doorways: q(P.doorways), hazards: q(P.hazards), portholes: q(P.portholes), grilles: q(P.grilles), windows: q(P.windows), channels: q(P.channels), lettering };
}
const backK = P => P.backFeatures === 'none' ? 0 : P.backFeatures === 'fewer' ? 0.5 : 1;

// The outline of the footprint is traced into loops of faces (walking with the viewer outside, so text reads
// left to right). Every straight run of the outline gets its own designed skin; short runs (wall ends) get an
// end skin whose joints follow their neighbour. Relief is carved inwards from each face, never cutting through
// the solid core, tops follow the nearest face, and the shared paint pass does rain, dirt and materials.
const N4 = [[0, 1], [1, 0], [0, -1], [-1, 0]];                                  // outward normals: s, e, n, w
const dirOf = (dx, dz) => N4.findIndex(([a, b]) => a === dx && b === dz);
function traceRuns(mask, W, D) {
  const inM = (x, z) => x >= 0 && z >= 0 && x < W && z < D && mask[x * D + z] === 1;
  const seen = new Uint8Array(W * D * 4), runs = [];
  let loopId = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let d0 = 0; d0 < 4; d0++) {
    if (!inM(x, z) || inM(x + N4[d0][0], z + N4[d0][1]) || seen[(x * D + z) * 4 + d0]) continue;
    const loop = [];
    let cx = x, cz = z, d = d0;
    do {
      seen[(cx * D + cz) * 4 + d] = 1; loop.push([cx, cz, d]);
      const [nx, nz] = N4[d], tx = nz, tz = -nx;                                // walking direction = viewer's right
      if (inM(cx + nx + tx, cz + nz + tz)) { cx += nx + tx; cz += nz + tz; d = dirOf(-tx, -tz); }   // inner corner
      else if (inM(cx + tx, cz + tz)) { cx += tx; cz += tz; }                                         // straight on
      else d = dirOf(tx, tz);                                                                         // outer corner
    } while (!(cx === x && cz === z && d === d0));
    let s0 = loop.findIndex((e, i) => e[2] !== loop[(i + loop.length - 1) % loop.length][2]);
    if (s0 < 0) s0 = 0;
    const ordered = loop.slice(s0).concat(loop.slice(0, s0));
    for (const e of ordered) {
      const last = runs[runs.length - 1];
      if (last && last.loop === loopId && last.d === e[2]) last.cells.push(e); else runs.push({ loop: loopId, d: e[2], cells: [e] });
    }
    loopId++;
  }
  return runs;
}
export function buildFootprint(P, { W, D, mask }) {
  const H = P.heightMax + 2, T = P.piece === 'maze' ? P.mazeWall : P.thickness, core = Math.max(2, P.minCore);
  const runs = traceRuns(mask, W, D);
  // --- a skin per face
  // a wall end: a short run capped between two faces that point in opposite directions (the tip of a wall)
  // When a face and its neighbour both look like ends (a wall about as wide as it is thick), the one closer
  // to the wall thickness is the end; on a tie the x-facing sides are, since straight walls run along x.
  const nb = i => [runs[(i + runs.length - 1) % runs.length], runs[(i + 1) % runs.length]];
  runs.forEach((r, i) => {
    const [prev, next] = nb(i);
    r.cand = r.cells.length <= T + 2 && prev.loop === r.loop && next.loop === r.loop && (prev.d + 2) % 4 === next.d;
    r.endScore = Math.abs(r.cells.length - T) + (r.d % 2 ? 0 : 0.5);
  });
  runs.forEach((r, i) => { r.isEnd = r.cand && nb(i).every(q => !q.cand || r.endScore <= q.endScore); });
  const isEnd = r => r.isEnd;
  let primary = -1;
  runs.forEach((r, i) => { if (r.d === 0 && !isEnd(r) && (primary < 0 || r.cells.length > runs[primary].cells.length)) primary = i; });
  if (primary < 0) primary = runs.reduce((b, r, i) => r.cells.length > runs[b].cells.length ? i : b, 0);
  const pool = ['stacked', 'towers', 'cantilever'];
  runs.forEach((r, i) => {
    if (isEnd(r)) return;
    const len = r.cells.length, u = k => r.cells[Math.max(0, Math.min(len - 1, k))][0] / Math.max(1, W - 1);
    const ov = P.faceOverrides?.[i] || {}, sd = ov.seed | 0;                  // per-face layout / seed tweaks
    if (i === primary) { r.skin = buildSkin(len, H, P.seed + sd, P, ov.layout || P.layout, featBundle(P, 'front'), u, W); r.layout = ov.layout || P.layout; return; }
    const br = new Rng(P.seed * 7919 + P.backSeedOffset + i * 104729);
    const layout = ov.layout || (!P.doubleSided ? 'stacked' : P.backLayout === 'auto' ? br.pick(len >= 30 ? [...pool, 'beam'] : pool) : P.backLayout === 'same' ? P.layout : P.backLayout);
    const opposite = r.d === 2 && P.piece !== 'maze' && i === runs.findIndex(q => q.d === 2 && !isEnd(q));
    const bp = P.doubleSided ? P : { ...P, reliefMax: 0, splitChance: 0.2, ledgeChance: 0 };
    const feat = featBundle(P, 'back', P.doubleSided ? backK(P) * (opposite ? 1 : 0.6) : 0);
    if (!opposite) feat.lettering = '';
    r.skin = buildSkin(len, H, P.seed + P.backSeedOffset + i * 7919 + sd, bp, layout, feat, u, W);
    r.layout = layout;
  });
  runs.forEach((r, i) => {                                                      // wall ends follow a neighbour's tiers
    if (!isEnd(r)) return;
    const prev = runs[(i + runs.length - 1) % runs.length], next = runs[(i + 1) % runs.length];
    const nb = prev.skin ? [prev.skin, prev.cells.length - 1] : next.skin ? [next.skin, 0] : null;
    r.skin = nb ? endSkin(nb[0], nb[1], H, r.cells.length, P, i) : buildSkin(r.cells.length, H, P.seed + i, P, 'stacked', featBundle(P, 'back', 0));
    r.end = true;
  });
  // --- every mask column belongs to its nearest face: `owner` picks the material (ends included),
  // `shaper` decides the height (faces only, so a wall end never pokes up above the wall)
  const nearest = pick => {
    const own = new Int32Array(W * D).fill(-1), u = new Int32Array(W * D), q = [];
    runs.forEach((r, ri) => { if (pick(r)) r.cells.forEach(([x, z], i) => { const k = x * D + z; if (own[k] < 0) { own[k] = ri; u[k] = i; q.push(k); } }); });
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = Math.floor(k / D), z = k % D;
      for (const [dx, dz] of N4) {
        const nx = x + dx, nz = z + dz, nk = nx * D + nz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D || !mask[nk] || own[nk] >= 0) continue;
        own[nk] = own[k]; u[nk] = u[k]; q.push(nk);
      }
    }
    return [own, u];
  };
  const [owner, ownU] = nearest(() => true), [shaper, shapeU] = runs.some(r => !r.isEnd) ? nearest(r => !r.isEnd) : [owner, ownU];
  const skinF = (ri, u, y) => runs[ri].skin.F[u * H + y];
  // --- solid where the shaping face has wall at this height...
  const occ = new Uint8Array(W * H * D), at = (x, y, z) => (y * D + z) * W + x;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const k = x * D + z; if (!mask[k]) continue;
    for (let y = 0; y < H; y++) if (skinF(shaper[k], shapeU[k], y) < NONE) occ[at(x, y, z)] = 1;
  }
  // --- ...then relief is carved in from every face (the primary first), keeping `core` solid blocks behind
  const endRelief = P.endDetail && !P.seamMatch ? Math.max(0, P.endRelief ?? 2) : 0;   // matched seams: ends are hidden, keep them flat
  const order = runs.map((_, i) => i).sort((a, b) => Number(a !== primary) - Number(b !== primary) || Number(!!runs[a].end) - Number(!!runs[b].end));
  for (const ri of order) {
    const r = runs[ri], [nx, nz] = N4[r.d];
    r.cells.forEach(([x, z], u) => {
      for (let y = 0; y < H; y++) {
        let f = skinF(ri, u, y); if (f >= NONE) continue;
        if (r.end) f = Math.min(f, endRelief);
        for (let k = 0; k < f; k++) {
          const cx = x - nx * k, cz = z - nz * k;
          if (cx < 0 || cz < 0 || cx >= W || cz >= D || !mask[cx * D + cz]) break;
          let behind = 0;
          for (let j = 1; j <= core; j++) { const bx = cx - nx * j, bz = cz - nz * j; if (bx >= 0 && bz >= 0 && bx < W && bz < D && occ[at(bx, y, bz)]) behind++; else break; }
          if (behind < core) break;
          occ[at(cx, y, cz)] = 0;
        }
      }
    });
  }
  if (P.ruin > 0) ruinTops(W, H, D, occ, mask, P);
  // --- materials: each exposed block takes its owning face's skin
  const { data, keys, id: kid, dirt } = paint(W, H, D, occ, P, (x, y, z, o, wet) => {
    const k = x * D + z, r = runs[owner[k]], out = 'senw'[r.d];
    return r.skin.faceBlock(ownU[k], y, o[out], wet);
  });
  // --- iron bars / louvres from each face's skin, placed in front of their recess
  runs.forEach(r => {
    if (r.end) return;
    const [nx, nz] = N4[r.d], alongX = nz !== 0;
    fixtures(r.skin, (u, y, dep, v) => {
      if (u < 0 || u >= r.cells.length) return;
      const [x, z] = r.cells[u], cx = x - nx * dep, cz = z - nz * dep;
      if (cx < 0 || cz < 0 || cx >= W || cz >= D || y < 0 || y >= H || data[at(cx, y, cz)]) return;
      data[at(cx, y, cz)] = kid(P.palette.bars + '|' + (v === 'h' && !alongX ? 'z' : v));
    });
  });
  const top = trimTop(W, H, D, data);
  const faces = runs.filter(r => !r.end).length;
  const faceList = runs.map((r, i) => r.end ? null : { i, dir: 'senw'[r.d], len: r.cells.length, layout: r.layout, primary: i === primary }).filter(Boolean);
  return { W, H: top, D, data: data.subarray(0, top * D * W), dirt: dirt.subarray(0, top * D * W), keys, faces, faceList };
}

// broken tops: ragged chunks knocked out of the wall top, mostly at the edges, never below half height
function ruinTops(W, H, D, occ, mask, P) {
  const at = (x, y, z) => (y * D + z) * W + x, k = P.ruin, R = new Rng((P.seed * 97 + 5) >>> 0);
  const th = new Int16Array(W * D).fill(-1);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = H - 1; y >= 0; y--) if (occ[at(x, y, z)]) { th[x * D + z] = y; break; }
  const edge = [];
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!mask[x * D + z] || th[x * D + z] < 0) continue;
    if (N4.some(([dx, dz]) => { const a = x + dx, b = z + dz; return a < 0 || b < 0 || a >= W || b >= D || !mask[a * D + b]; })) edge.push([x, z]);
  }
  if (!edge.length) return;
  const n = Math.round(edge.length / 26 * k * R.uniform(0.7, 1.3));
  for (let c = 0; c < n; c++) {
    const [cx, cz] = R.pick(edge), r = R.uniform(2.5, 3 + 7 * k), depth = R.uniform(3, 4 + 16 * k);
    for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let z = Math.floor(cz - r); z <= cz + r; z++) {
      if (x < 0 || z < 0 || x >= W || z >= D || th[x * D + z] < 0) continue;
      const q = Math.hypot(x - cx, z - cz) / r; if (q >= 1) continue;
      const t = th[x * D + z], dd = depth * (1 - Math.pow(q, 1.4)) * (0.7 + 0.6 * roll(P.seed, x * D + z, 91 + c));
      const nt = Math.max(Math.round(H * 0.5), t - Math.round(dd));
      for (let y = nt + 1; y <= t; y++) occ[at(x, y, z)] = 0;
      if (nt < t) th[x * D + z] = nt;
    }
  }
}
function endSkin(tierSkin, col, H, D, P, side) {
  const EP = { ...P, reliefMax: Math.max(0, P.endRelief ?? 2), tieChance: P.tieChance * 0.7, splitChance: 0.55,
    minSlab: Math.max(3, Math.floor(D / 4)), ledgeChance: 0.2, jointDepth: Math.min(1, P.jointDepth), cracks: Math.ceil(P.cracks / 2) };
  const s = new Skin(D, H, (P.seed * 31 + 7 + side * 1013) >>> 0, EP);
  // tier breaks follow the front's slabs at this end, so horizontal joints wrap around the corner
  const breaks = [0];
  for (let y = 1; y < H; y++) {
    const a = tierSkin.mono[col * H + y], b = tierSkin.mono[col * H + y - 1];
    if (a !== b && a >= 0 && y - breaks[breaks.length - 1] >= 4) breaks.push(y);
  }
  if (H - breaks[breaks.length - 1] < 3) breaks.pop();
  breaks.push(H);
  for (let t = 0; t < breaks.length - 1; t++) {
    const y0 = breaks[t], y1 = breaks[t + 1];
    const n = D >= 2 * EP.minSlab + 1 && s.R.f() < EP.splitChance ? 2 : 1;
    const ws = splitWidth(D, n, s.R, EP.minSlab);
    let z = 0; const fs = [];
    ws.forEach(w => { const f = s.R.int(0, EP.reliefMax); fs.push(f); s.block(z, z + w, y0, y1, f, { ledge: s.R.f() < EP.ledgeChance }); z += w + 1; });
    z = 0;
    ws.forEach((w, k) => { z += w; if (k < ws.length - 1) { s.groove(z, y0, y1, Math.max(fs[k], fs[k + 1]) + 1); z++; } });
  }
  s.weather();
  return s;
}
