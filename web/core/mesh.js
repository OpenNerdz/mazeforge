// Turns block grids into GPU-ready vertex buffers. Only faces that touch an open neighbour are kept, and
// neighbouring faces with the same texture merge into one quad (greedy meshing), so a flat wall costs a few
// triangles instead of twelve per block. Three parts come out: opaque, cut-out (alpha tested: leaves, vines,
// bars, plants) and blended (glass, ice).
//
// A vertex is 4 × int16: x, y, z in 1/16 blocks, and layer + FACE × face, where face is 0–5 for +x -x +y -y +z -z and
// 6–7 for the two diagonal planes of a plant; the shader works out the normal and texture coordinates from it.
// Every quad is two plain triangles. Texture tiles are renumbered into the layers the scene actually uses.

export const HUES = 32;                                       // colour tiles for blocks the library doesn't know
export const UNIT = 16;                                       // vertex units per block
export const FACE = 4096;                                     // face code multiplier in the 4th vertex component
const CUBE = 1, BOX = 2, CROSS = 3, VINE = 4;
const PASSES = 3, OPAQUE = 0, CUT = 1, BLEND = 2;
const BAR_BOX = { h: [0, 0, 7, 16, 16, 9], z: [7, 0, 0, 9, 16, 16], v: [7, 0, 7, 9, 16, 9] };
const VINE_AT = { n: [2, 1], s: [2, 15], e: [0, 15], w: [0, 1] };   // letter = side of the wall: [axis, offset in 1/16]

export function tileCount(library) {
  let n = 0;
  for (const e of Object.values(library)) for (const t of e.faces || [e.icon]) n = Math.max(n, t + 1);
  return n;
}

// how one block key is drawn: shape, pass, whether it hides its neighbours' faces, a tile per face (+x -x +y -y +z -z)
function describe(key, library, tiles) {
  const [base, variant] = key.split('|'), e = library[base];
  if (!e) {
    let h = 0; for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { shape: CUBE, pass: OPAQUE, occludes: true, tiles: Array(6).fill(tiles + h % HUES) };
  }
  const pass = e.alpha === 'blend' ? BLEND : e.alpha === 'cut' || variant !== undefined || e.shape === 'cross' ? CUT : OPAQUE;
  const faces = e.faces && e.shape !== 'cross' && base !== 'vine' ? e.faces : Array(6).fill(e.icon);
  const d = { pass, occludes: variant === undefined && e.full, tiles: faces, shape: CUBE };
  if (base === 'vine') Object.assign(d, { shape: VINE, sides: variant || 'n' });
  else if (variant && BAR_BOX[variant]) Object.assign(d, { shape: BOX, box: BAR_BOX[variant] });
  else if (e.shape === 'cross') d.shape = CROSS;
  else if (e.shape === 'box') Object.assign(d, { shape: BOX, box: e.box.map(v => Math.round(v * UNIT)) });
  return d;
}

// growable int16 vertex buffer for one pass: plain triangles, two per quad
class Part {
  constructor() { this.v = new Int16Array(6144); this.n = 0; this.corners = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; }
  // four corners [x, y, z], counter-clockwise seen from the front
  face(a, b, c, d, layer, face) {
    const w = layer + FACE * face;
    if (this.n + 24 > this.v.length) { const g = new Int16Array(this.v.length * 2); g.set(this.v); this.v = g; }
    this.vert(a, w); this.vert(b, w); this.vert(c, w); this.vert(a, w); this.vert(c, w); this.vert(d, w);
  }
  vert(p, w) { const v = this.v, n = this.n; v[n] = p[0]; v[n + 1] = p[1]; v[n + 2] = p[2]; v[n + 3] = w; this.n = n + 4; }
  // an axis-aligned quad on plane `at` of axis d, spanning [u0, u1) × [v0, v1) of the other two axes; neg: facing -d
  quad(d, at, u0, u1, v0, v1, neg, layer) {
    const u = (d + 1) % 3, v = 3 - d - u, c = this.corners;                       // reused: no garbage per quad
    const P = (k, a, b) => { const p = c[k]; p[d] = at; p[u] = a; p[v] = b; return p; };
    if (neg) this.face(P(0, u0, v0), P(1, u0, v1), P(2, u1, v1), P(3, u1, v0), layer, d * 2 + 1);
    else this.face(P(0, u0, v0), P(1, u1, v0), P(2, u1, v1), P(3, u0, v1), layer, d * 2);
  }
  done() { return this.n ? this.v.slice(0, this.n) : null; }
}

// grids: [{W, H, D, data, keys}] laid side by side along +x. Vertices are in the row's own block grid;
// offset is where to put it so the row is centred on x = 0 and the first grid on z = 0.
// only: show just this block (base key), as if everything else were air.
export function buildMesh(grids, library, { only = null } = {}) {
  const tiles = tileCount(library), parts = Array.from({ length: PASSES }, () => new Part());
  const layers = new Map(), layerOf = t => { let l = layers.get(t); if (l === undefined) layers.set(t, l = layers.size); return l; };
  const cache = new Map();
  let ox = 0, H = 0, D = 0;
  for (const g of grids) {
    meshGrid(g, ox, parts, layerOf, k => {
      if (k === 'air' || (only && k.split('|')[0] !== only)) return null;
      if (!cache.has(k)) cache.set(k, describe(k, library, tiles));
      return cache.get(k);
    });
    ox += g.W; H = Math.max(H, g.H); D = Math.max(D, g.D);
  }
  return {
    parts: parts.map(p => p.done()), tiles: Uint16Array.from(layers.keys()),
    size: [ox, H, D], offset: [-Math.floor(ox / 2), 0, -Math.floor(grids[0].D / 2)],
  };
}

function meshGrid({ W, H, D, data, keys }, ox, parts, layerOf, describeKey) {
  const info = keys.map(describeKey), n = info.length;
  // per key: 0 = not a cube, else pass + 1; whether it hides faces; tile per face
  const cube = new Uint8Array(n), occ = new Uint8Array(n), face = new Int32Array(n * 6), blend = new Uint8Array(n);
  info.forEach((d, i) => {
    if (!d) return;
    occ[i] = d.occludes ? 1 : 0; blend[i] = d.pass === BLEND ? 1 : 0;
    if (d.shape === CUBE) { cube[i] = d.pass + 1; for (let f = 0; f < 6; f++) face[i * 6 + f] = layerOf(d.tiles[f]); }
  });
  const dims = [W, H, D], stride = [1, D * W, W], U = UNIT;                        // index = x + y*D*W + z*W

  // ---- cubes: greedy quads, one axis at a time; one pass over a slice finds its faces both ways
  const o = [ox * U, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3, nu = dims[u], nv = dims[v], sd = stride[d], su = stride[u], sv = stride[v];
    const masks = [new Int32Array(nu * nv), new Int32Array(nu * nv)], [m0, m1] = masks;          // faces towards +d, -d
    for (let s = 0; s < dims[d]; s++) {
      const f = d * 2, last = s === dims[d] - 1, any = [false, false];
      for (let j = 0, m = 0; j < nv; j++) for (let i = 0, k = s * sd + j * sv; i < nu; i++, m++, k += su) {
        const a = data[k], c = cube[a];
        m0[m] = m1[m] = 0;
        if (!c) continue;
        const b0 = last ? 0 : data[k + sd], b1 = s === 0 ? 0 : data[k - sd];
        if (!occ[b0] && !(a === b0 && blend[a])) { m0[m] = (c << 16) | (face[a * 6 + f] + 1); any[0] = true; }
        if (!occ[b1] && !(a === b1 && blend[a])) { m1[m] = (c << 16) | (face[a * 6 + f + 1] + 1); any[1] = true; }
      }
      for (let neg = 0; neg < 2; neg++) {
        if (!any[neg]) continue;
        const mask = masks[neg], at = (neg ? s : s + 1) * U;
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu;) {
          const val = mask[i + j * nu];
          if (!val) { i++; continue; }
          let w = 1; while (i + w < nu && mask[i + w + j * nu] === val) w++;
          let h = 1;
          grow: for (; j + h < nv; h++) for (let q = 0; q < w; q++) if (mask[i + q + (j + h) * nu] !== val) break grow;
          for (let r = 0; r < h; r++) mask.fill(0, i + (j + r) * nu, i + w + (j + r) * nu);
          parts[(val >> 16) - 1].quad(d, at + o[d], i * U + o[u], (i + w) * U + o[u], j * U + o[v], (j + h) * U + o[v], neg, (val & 0xffff) - 1);
          i += w;
        }
      }
    }
  }

  // ---- everything else, block by block
  const at = (x, y, z) => (y * D + z) * W + x;
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const a = data[at(x, y, z)], di = info[a];
    if (!di || di.shape === CUBE) continue;
    const part = parts[di.pass], X = (ox + x) * U, Y = y * U, Z = z * U, p = [X, Y, Z];
    if (di.shape === BOX) {
      const b = di.box, cell = [x, y, z];
      for (let f = 0; f < 6; f++) {
        const d = f >> 1, neg = f & 1, u = (d + 1) % 3, v = (d + 2) % 3, plane = neg ? b[d] : b[d + 3];
        if (plane === (neg ? 0 : U)) {                                                // on the block's boundary: may be hidden
          const q = cell.slice(); q[d] += neg ? -1 : 1;
          if (q[d] >= 0 && q[d] < [W, H, D][d] && occ[data[at(q[0], q[1], q[2])]]) continue;
        }
        part.quad(d, p[d] + plane, p[u] + b[u], p[u] + b[u + 3], p[v] + b[v], p[v] + b[v + 3], neg, layerOf(di.tiles[f]));
      }
    } else if (di.shape === CROSS) {                                                   // two planes corner to corner
      const l = layerOf(di.tiles[0]);
      part.face([X, Y, Z], [X + U, Y, Z + U], [X + U, Y + U, Z + U], [X, Y + U, Z], l, 6);
      part.face([X, Y, Z + U], [X + U, Y, Z], [X + U, Y + U, Z], [X, Y + U, Z + U], l, 7);
    } else {                                                                           // vine: a plane just off each wall it hugs
      const l = layerOf(di.tiles[0]);
      for (const side of di.sides) {
        const [d, off] = VINE_AT[side], u = (d + 1) % 3, v = (d + 2) % 3;
        part.quad(d, p[d] + off, p[u], p[u] + U, p[v], p[v] + U, 0, l);
      }
    }
  }
}
