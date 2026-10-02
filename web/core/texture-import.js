// Reads only the client JAR explicitly selected by the user. No archive paths are extracted to disk.
const TILE = 16, COLS = 32, LIMIT = 128 * 1024 * 1024;
const text = new TextDecoder();
const textureRef = value => typeof value === 'string' ? value : value?.sprite || null;

export function zipReader(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), files = new Map();
  if (bytes.length > LIMIT) throw new Error('Choose a client JAR smaller than 128 MB.');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end < bytes.length - 65557) throw new Error('This is not a supported JAR/ZIP archive.');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('The archive is incomplete.');
    const n = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const name = text.decode(bytes.subarray(p + 46, p + 46 + n));
    if (name === 'version.json' || name.startsWith('assets/minecraft/')) files.set(name, {
      method: view.getUint16(p + 10, true), size: view.getUint32(p + 24, true),
      packed: view.getUint32(p + 20, true), offset: view.getUint32(p + 42, true), encrypted: view.getUint16(p + 8, true) & 1,
    });
    p += 46 + n + extra + comment;
  }
  const read = async name => {
    const e = files.get(name); if (!e) return null;
    if (e.encrypted || e.size > 16 * 1024 * 1024 || e.offset + 30 > bytes.length) throw new Error('Unsupported archive entry.');
    if (view.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Invalid archive entry.');
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    if (start + e.packed > bytes.length) throw new Error('Truncated archive entry.');
    const data = bytes.subarray(start, start + e.packed);
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error('This archive uses an unsupported compression format.');
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > e.size || size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('Invalid archive entry size.'); }
      parts.push(value);
    }
    if (size !== e.size) throw new Error('The archive entry is incomplete.');
    const out = new Uint8Array(size); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  };
  return { names: [...files.keys()], read, json: async name => { const b = await read(name); return b ? JSON.parse(text.decode(b)) : null; } };
}

const refPath = (ref, kind) => {
  const [ns, path] = ref.includes(':') ? ref.split(':') : ['minecraft', ref];
  return `assets/${ns}/${kind}/${path}.${kind === 'textures' ? 'png' : 'json'}`;
};
const DIRECTIONS = ['east', 'west', 'up', 'down', 'south', 'north'];

export async function importTextures(buffer, preview, progress = (_fraction) => {}) {
  const archive = zipReader(buffer), version = await archive.json('version.json');
  if (!Number.isInteger(version?.world_version) || version.world_version < 1952) {
    throw new Error('Choose a modern Java Edition client JAR (1.14 or newer) with version metadata. Legacy and Bedrock archives use different formats.');
  }
  const names = archive.names.filter(n => n.startsWith('assets/minecraft/blockstates/') && n.endsWith('.json'));
  if (!names.length) throw new Error('No block models found. Choose the Minecraft client JAR, rather than a server or mod JAR.');
  const cache = new Map(), textureCache = new Map(), tiles = [], library = Object.create(null);
  const json = async path => {
    if (!cache.has(path)) cache.set(path, archive.json(path));
    return cache.get(path);
  };
  async function resolve(ref) {
    const textures = {}; let elements, cross = false, tintedCross = false;
    for (let depth = 0; ref && depth < 20; depth++) {
      cross ||= /(?:^|\/)(?:tinted_)?cross$/.test(ref);
      tintedCross ||= ref.endsWith('tinted_cross');
      const m = await json(refPath(ref, 'models')); if (!m) break;
      for (const [k, v] of Object.entries(m.textures || {})) if (!(k in textures)) textures[k] = v;
      if (!elements && m.elements) elements = m.elements;
      ref = m.parent;
    }
    const value = ref => {
      ref = textureRef(ref);
      for (let i = 0; ref?.startsWith('#') && i < 20; i++) ref = textureRef(textures[ref.slice(1)]);
      return ref?.startsWith('#') ? null : ref;
    };
    return { textures, elements, cross, tintedCross, value };
  }
  async function texture(ref, tint) {
    if (!ref) return null;
    const key = `${ref}:${tint || ''}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const bytes = await archive.read(refPath(ref, 'textures')); if (!bytes) return null;
    // Check PNG dimensions before decoding to keep imports bounded.
    if (bytes.length < 24 || new DataView(bytes.buffer, bytes.byteOffset).getUint32(0) !== 0x89504e47) return null;
    const header = new DataView(bytes.buffer, bytes.byteOffset);
    if (header.getUint32(16) > 4096 || header.getUint32(20) > 16384) throw new Error('A texture is too large to preview safely.');
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(TILE, TILE), ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.width, 0, 0, TILE, TILE); bitmap.close();
    const image = ctx.getImageData(0, 0, TILE, TILE), d = image.data;
    const rgb = [0, 0, 0]; let seen = 0, cut = false, blend = false;
    for (let p = 0; p < d.length; p += 4) {
      for (let c = 0; c < 3; c++) if (tint) d[p + c] = Math.round(d[p + c] * tint[c] / 255);
      cut ||= d[p + 3] < 128; blend ||= d[p + 3] > 0 && d[p + 3] < 250;
      if (d[p + 3]) { seen++; for (let c = 0; c < 3; c++) rgb[c] += d[p + c]; }
    }
    const info = { tile: tiles.length, cut, blend, color: '#' + rgb.map(c => Math.round(c / Math.max(1, seen)).toString(16).padStart(2, '0')).join('') };
    tiles.push(image); textureCache.set(key, info); return info;
  }
  for (let index = 0; index < names.length; index++) {
    const name = names[index].split('/').pop().slice(0, -5);
    if (!/^[a-z0-9_]+$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) continue;
    if (['air', 'cave_air', 'void_air', 'moving_piston'].includes(name)) continue;
    const bs = await json(names[index]), variants = Object.entries(bs.variants || {});
    const properties = Object.create(null);
    for (const [state] of variants) for (const pair of state.split(',')) {
      const [k, v] = pair.split('='); if (!v) continue;
      (properties[k] ||= []); if (!properties[k].includes(v)) properties[k].push(v);
    }
    const conditions = when => {
      for (const [k, v] of Object.entries(when || {})) {
        if (Array.isArray(v)) { v.forEach(conditions); continue; }
        if (typeof v !== 'string' && typeof v !== 'boolean') continue;
        properties[k] ||= [];
        for (const value of String(v).split('|')) if (!properties[k].includes(value)) properties[k].push(value);
      }
    };
    for (const part of bs.multipart || []) conditions(part.when);
    // Model variants list rendering properties only. Preserve the non-visual states needed for safe pasting.
    if (name.endsWith('_leaves')) {
      properties.distance = ['7']; properties.persistent = ['true', 'false'];
      if (version.world_version >= 3105) properties.waterlogged = ['false', 'true'];
    }
    if (name === 'iron_bars' || name === 'chain') properties.waterlogged = ['false', 'true'];
    if (name === 'iron_bars' || name === 'vine') {
      for (const dir of ['east', 'north', 'south', 'west']) properties[dir] = ['false', 'true'];
      if (name === 'vine') properties.up = ['false', 'true'];
    }
    const preferred = ['axis=y', 'facing=south', 'type=bottom', 'half=lower', 'shape=straight', 'lit=false', 'snowy=false', 'open=false', 'waterlogged=false', 'age=0'];
    variants.sort((a, b) => b[0].split(',').filter(s => preferred.includes(s)).length - a[0].split(',').filter(s => preferred.includes(s)).length);
    let chosen = variants[0]?.[1] || bs.multipart?.[0]?.apply;
    if (Array.isArray(chosen)) chosen = chosen[0];
    if (!chosen?.model) continue;
    const model = await resolve(chosen.model), { elements, textures, value, cross, tintedCross } = model;
    const fallback = textures.all || textures.side || textures.texture || textures.particle || Object.values(textures)[0];
    const biggest = elements?.length ? [...elements].sort((a, b) => b.to.reduce((n, v, i) => n * (v - b.from[i] + 1), 1) - a.to.reduce((n, v, i) => n * (v - a.from[i] + 1), 1))[0] : null;
    const box = elements?.length ? [0, 1, 2].map(i => Math.min(...elements.map(e => e.from[i]))).concat([0, 1, 2].map(i => Math.max(...elements.map(e => e.to[i])))) : [0, 0, 0, 16, 16, 16];
    const tinted = 'tintindex' in (biggest?.faces?.south || {}) || tintedCross;
    const tint = tinted ? name.includes('water') ? [63, 118, 228] : name.includes('leaves') || name === 'vine' ? [119, 171, 47] : [145, 189, 89] : null;
    const faces = [];
    for (const dir of DIRECTIONS) faces.push(await texture(value(cross ? textures.cross || fallback : biggest?.faces?.[dir]?.texture || fallback), tint));
    const base = faces.find(Boolean); if (!base) continue;
    const ids = faces.map(f => (f || base).tile), info = faces[4] || base;
    const shape = cross ? 'cross' : box.some((v, i) => v !== [0, 0, 0, 16, 16, 16][i]) ? 'box' : 'cube';
    const alpha = faces.some(f => f?.blend) && /glass|ice|water|slime|honey/.test(name) ? 'blend' : faces.some(f => f?.cut) || cross ? 'cut' : null;
    library[name] = { id: `minecraft:${name}`, color: info.color, cat: preview[name]?.cat || 'Other', icon: info.tile,
      full: shape === 'cube' && !alpha && Boolean(elements?.length) && !name.includes('stairs'), properties };
    if (new Set(ids).size > 1) library[name].faces = ids;
    if (shape !== 'cube') library[name].shape = shape;
    if (shape === 'box') library[name].box = box.map(v => v / 16);
    if (alpha) library[name].alpha = alpha;
    if (index % 20 === 0) progress(index / names.length);
  }
  if (!tiles.length || !library.stone) throw new Error('This client archive does not contain a usable block library.');
  const atlas = new OffscreenCanvas(COLS * TILE, Math.ceil(tiles.length / COLS) * TILE), ctx = atlas.getContext('2d');
  for (let i = 0; i < tiles.length; i++) ctx.putImageData(tiles[i], i % COLS * TILE, Math.floor(i / COLS) * TILE);
  return { library, atlas: await atlas.convertToBlob({ type: 'image/png' }), metadata: { version: version.id, dataVersion: version.world_version } };
}
