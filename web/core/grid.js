// Block grids {W, H, D, data, keys}: data is Uint16 indexed (y*D + z)*W + x, keys[0] is always air.

// block ids for a grid: keys[0] is always air
export function keyTable(keys = ['air']) {
  const idx = new Map(keys.map((k, i) => [k, i]));
  return { keys, id(b) { let v = idx.get(b); if (v === undefined) { v = keys.length; keys.push(b); idx.set(b, v); } return v; } };
}

export function trimTop(W, H, D, data) {
  let top = 0;
  for (let y = H - 1; y >= 0 && !top; y--) for (let i = y * D * W, e = i + D * W; i < e; i++) if (data[i]) { top = y + 1; break; }
  return top;
}
const TURN = { n: 'e', e: 's', s: 'w', w: 'n' };
function turnKey(k, q) {
  const [base, v] = k.split('|');
  if (v === undefined || q % 4 === 0) return k;
  if (v === 'h' || v === 'z') return base + '|' + ((q % 2) ? (v === 'h' ? 'z' : 'h') : v);
  if (v === 'v') return k;
  let letters = [...v];
  for (let i = 0; i < q % 4; i++) letters = letters.map(c => TURN[c] || c);
  return base + '|' + letters.sort().join('');
}
// q quarter turns clockwise, seen from above (north -> east -> south -> west)
export function rotateGrid(g, q) {
  q = ((q % 4) + 4) % 4;
  if (!q) return g;
  const { W, H, D, data } = g;
  const W2 = q % 2 ? D : W, D2 = q % 2 ? W : D;
  const out = new Uint16Array(W2 * H * D2), dirt = g.dirt && new Float32Array(W2 * H * D2);
  const keys = g.keys.map(k => turnKey(k, q));
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = data[(y * D + z) * W + x]; if (!v) continue;
    let nx = x, nz = z;
    if (q === 1) { nx = D - 1 - z; nz = x; }
    else if (q === 2) { nx = W - 1 - x; nz = D - 1 - z; }
    else { nx = z; nz = W - 1 - x; }
    out[(y * D2 + nz) * W2 + nx] = v;
    if (dirt) dirt[(y * D2 + nz) * W2 + nx] = g.dirt[(y * D + z) * W + x];
  }
  return { ...g, W: W2, D: D2, data: out, dirt, keys };
}
// pieces: [{ g, x, z }] -> one grid covering all of them
export function composeGrids(pieces) {
  const x0 = Math.min(...pieces.map(p => p.x)), z0 = Math.min(...pieces.map(p => p.z));
  const W = Math.max(...pieces.map(p => p.x + p.g.W)) - x0, D = Math.max(...pieces.map(p => p.z + p.g.D)) - z0, H = Math.max(...pieces.map(p => p.g.H));
  const data = new Uint16Array(W * H * D), { keys, id } = keyTable();
  for (const { g, x, z } of pieces) {
    const map = g.keys.map(k => id(k));
    for (let y = 0; y < g.H; y++) for (let zz = 0; zz < g.D; zz++) for (let xx = 0; xx < g.W; xx++) {
      const v = g.data[(y * g.D + zz) * g.W + xx]; if (v) data[(y * D + zz + z - z0) * W + xx + x - x0] = map[v];
    }
  }
  return { W, H, D, data, keys, origin: [pieces[0].x - x0, pieces[0].z - z0] };
}

// blocks of each type, most used first: [[key, count], …] (variants such as vine|n count as their block)
export function blockCounts({ data, keys }) {
  const n = new Float64Array(keys.length);
  for (let i = 0; i < data.length; i++) n[data[i]]++;
  const by = new Map();
  keys.forEach((k, i) => { if (i && n[i]) { const b = k.split('|')[0]; by.set(b, (by.get(b) || 0) + n[i]); } });
  return [...by].sort((a, b) => b[1] - a[1]);
}
