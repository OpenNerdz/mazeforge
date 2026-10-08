// Sponge schematic (.schem) read/write — WorldEdit compatible (v2 write, v2/v3 read)
const DATA_VERSION = 3465; // Minecraft 1.20.1

// ---------------------------------------------------------------- NBT writer
class NbtWriter {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  need(k) { if (this.n + k > this.buf.length) { let s = this.buf.length * 2; while (s < this.n + k) s *= 2; const b = new Uint8Array(s); b.set(this.buf); this.buf = b; } }
  u8(v) { this.need(1); this.buf[this.n++] = v & 255; }
  i16(v) { this.need(2); new DataView(this.buf.buffer).setInt16(this.n, v); this.n += 2; }
  i32(v) { this.need(4); new DataView(this.buf.buffer).setInt32(this.n, v); this.n += 4; }
  str(s) { const e = new TextEncoder().encode(s); this.i16(e.length); this.bytes(e); }
  bytes(b) { this.need(b.length); this.buf.set(b, this.n); this.n += b.length; }
  out() { return this.buf.slice(0, this.n); }
}
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTES: 7, STRING: 8, LIST: 9, COMPOUND: 10, INTS: 11, LONGS: 12 };
function writeTag(w, t, v) {
  switch (t) {
    case T.BYTE: w.u8(v); break;
    case T.SHORT: w.i16(v); break;
    case T.INT: w.i32(v); break;
    case T.BYTES: w.i32(v.length); w.bytes(v); break;
    case T.STRING: w.str(v); break;
    case T.LIST: w.u8(v.type); w.i32(v.items.length); for (const it of v.items) writeTag(w, v.type, it); break;
    case T.COMPOUND: for (const [tt, k, vv] of v) { w.u8(tt); w.str(k); writeTag(w, tt, vv); } w.u8(0); break;
    case T.INTS: w.i32(v.length); for (const x of v) w.i32(x); break;
  }
}

export function stateString(key, library) {
  const [base, variant] = key.split('|');
  const id = library[base]?.id ?? (base.includes(':') ? base : 'minecraft:' + base);
  const state = props => {
    const valid = library[base]?.properties;
    const entries = Object.entries(props).filter(([k, v]) => !valid || valid[k]?.includes(String(v)));
    return id + (entries.length ? `[${entries.map(([k, v]) => `${k}=${v}`).join(',')}]` : '');
  };
  if (base === 'iron_bars') {
    const h = variant === 'h', z = variant === 'z';
    return state({ east: h, north: z, south: z, waterlogged: false, west: h });
  }
  if (base === 'chain') return state({ axis: variant === 'h' ? 'x' : variant === 'z' ? 'z' : 'y', waterlogged: false });
  if (base === 'vine') {
    const f = variant || 'n', has = c => f.includes(c);
    return state({ east: has('e'), north: has('n'), south: has('s'), up: false, west: has('w') });
  }
  if (base.endsWith('_leaves')) return state({ distance: 7, persistent: true, waterlogged: false });
  return id;
}

async function gzip(bytes) {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// grid: {W, H, D, data (Uint16, index (y*D+z)*W+x), keys}; offset = where the paste lands relative to the
// player (default: the structure's south-west corner is the block the player stands on, extending north/east)
export async function writeSchem(grid, library, offset = [0, 0, -grid.D]) {
  const { W, H, D, data, keys } = grid;
  const palIndex = new Map([['minecraft:air', 0]]);
  const keyToPal = keys.map(k => {
    const s = k === 'air' ? 'minecraft:air' : stateString(k, library);
    if (!palIndex.has(s)) palIndex.set(s, palIndex.size);
    return palIndex.get(s);
  });
  const vw = new NbtWriter();
  for (let i = 0; i < W * H * D; i++) {
    let v = keyToPal[data[i]];
    while (true) { const b = v & 0x7f; v >>>= 7; if (v) vw.u8(b | 0x80); else { vw.u8(b); break; } }
  }
  const root = [
    [T.INT, 'Version', 2], [T.INT, 'DataVersion', library.dataVersion || DATA_VERSION],
    [T.SHORT, 'Width', W], [T.SHORT, 'Height', H], [T.SHORT, 'Length', D],
    [T.INTS, 'Offset', [0, 0, 0]],
    [T.COMPOUND, 'Metadata', [[T.INT, 'WEOffsetX', offset[0]], [T.INT, 'WEOffsetY', offset[1]], [T.INT, 'WEOffsetZ', offset[2]]]],
    [T.INT, 'PaletteMax', palIndex.size],
    [T.COMPOUND, 'Palette', [...palIndex].map(([k, v]) => [T.INT, k, v])],
    [T.BYTES, 'BlockData', vw.out()],
    [T.LIST, 'BlockEntities', { type: T.COMPOUND, items: [] }],
  ];
  const w = new NbtWriter(); w.u8(T.COMPOUND); w.str('Schematic'); writeTag(w, T.COMPOUND, root);
  return gzip(w.out());
}

// ---------------------------------------------------------------- NBT reader
function readNBT(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 0;
  const td = new TextDecoder();
  // a length read from the file: never negative (that would loop back over the same bytes for ever) or past the end
  const count = size => { const n = dv.getInt32(p); p += 4; if (n < 0 || p + n * size > bytes.length) throw new RangeError('bad length'); return n; };
  const str = () => { const n = dv.getUint16(p); p += 2; const s = td.decode(bytes.subarray(p, p + n)); p += n; return s; };
  const pay = t => {
    switch (t) {
      case 1: return dv.getInt8(p++);
      case 2: { const v = dv.getInt16(p); p += 2; return v; }
      case 3: { const v = dv.getInt32(p); p += 4; return v; }
      case 4: { const v = dv.getBigInt64(p); p += 8; return v; }
      case 5: { const v = dv.getFloat32(p); p += 4; return v; }
      case 6: { const v = dv.getFloat64(p); p += 8; return v; }
      case 7: { const n = count(1); const v = bytes.subarray(p, p + n); p += n; return v; }
      case 8: return str();
      case 9: { const et = dv.getInt8(p++); const n = count(1); const a = []; for (let i = 0; i < n; i++) a.push(pay(et)); return a; }
      case 10: { const o = {}; for (let tt = dv.getInt8(p++); tt; tt = dv.getInt8(p++)) o[str()] = pay(tt); return o; }
      case 11: { const n = count(4); const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(p); p += 4; } return a; }
      case 12: { const n = count(8); const a = []; for (let i = 0; i < n; i++) { a.push(dv.getBigInt64(p)); p += 8; } return a; }
    }
  };
  const t = dv.getInt8(p++); str(); return pay(t);
}

export async function readSchem(buf) {
  let root;
  try { root = readNBT(await gunzip(new Uint8Array(buf))); } catch { throw new Error('The file is damaged or is not a schematic'); }
  if (root.Schematic) root = root.Schematic;               // v3 wraps everything
  const W = root.Width, H = root.Height, D = root.Length;
  const pal = root.Palette ?? root.Blocks?.Palette, bd = root.BlockData ?? root.Blocks?.Data;
  if (!pal || !bd) throw new Error('Not a Sponge schematic (.schem) file');
  const inv = [];
  for (const [state, i] of Object.entries(pal)) inv[i] = state;
  const keys = [], kmap = new Map();
  const toKey = s => {
    const [id, props = ''] = s.split('[');
    const base = id.replace(/^minecraft:/, '').replace(/^create:/, '');
    if (base === 'air' || base === 'cave_air' || base === 'void_air' || base === 'structure_void') return 'air';
    if (base === 'iron_bars' || base === 'chain') return base + (/east=true|west=true|axis=x/.test(props) ? '|h' : /north=true|south=true|axis=z/.test(props) ? '|z' : '|v');
    if (base === 'vine') { const f = ['e', 'n', 's', 'w'].filter(c => new RegExp({ e: 'east', n: 'north', s: 'south', w: 'west' }[c] + '=true').test(props)); return 'vine|' + (f.join('') || 'n'); }
    return base;
  };
  const palKey = inv.map(s => { const k = toKey(s); if (!kmap.has(k)) { kmap.set(k, keys.length); keys.push(k); } return kmap.get(k); });
  const data = new Uint16Array(W * H * D);
  let p = 0, i = 0;
  while (i < W * H * D && p < bd.length) {
    let v = 0, s = 0, b;
    do { b = bd[p++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80);
    data[i++] = palKey[v];
  }
  // make sure 'air' is index 0
  const airIdx = kmap.get('air');
  if (airIdx !== undefined && airIdx !== 0) {
    const k0 = keys[0]; keys[0] = 'air'; keys[airIdx] = k0;
    for (let j = 0; j < data.length; j++) { if (data[j] === airIdx) data[j] = 0; else if (data[j] === 0) data[j] = airIdx; }
  } else if (airIdx === undefined) {
    keys.unshift('air'); for (let j = 0; j < data.length; j++) data[j] += 1;
  }
  return { W, H, D, data, keys, dataVersion: root.DataVersion };
}
