// Maze Structure Studio — procedural generator (port + extension of the Python generator)
export const NONE = 999;

// ------------------------------------------------------------------ random
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed) { this.r = mulberry32((seed >>> 0) ^ 0x9E3779B9); for (let i = 0; i < 4; i++) this.r(); }
  f() { return this.r(); }
  int(a, b) { return b <= a ? a : a + Math.floor(this.r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  uniform(a, b) { return a + (b - a) * this.r(); }
  normal(m = 0, s = 1) { const u = 1 - this.r(), v = this.r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
}

// a fixed random roll per position: a block keeps its roll whatever other settings change, so a slider
// only alters the blocks it actually affects (a shared random stream would reshuffle the whole wall)
export function roll(seed, i, salt) {
  let h = (seed ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(w, h, scale, rng) {
  scale = Math.max(0.5, scale);
  const gw = Math.floor(w / scale) + 3, gh = Math.floor(h / scale) + 3;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rng.f();
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    const xs = x / scale, x0 = Math.floor(xs); let fx = xs - x0; fx = fx * fx * (3 - 2 * fx);
    for (let y = 0; y < h; y++) {
      const ys = y / scale, y0 = Math.floor(ys); let fy = ys - y0; fy = fy * fy * (3 - 2 * fy);
      const a = g[x0 * gh + y0], b = g[(x0 + 1) * gh + y0], c = g[x0 * gh + y0 + 1], d = g[(x0 + 1) * gh + y0 + 1];
      out[x * h + y] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
}

// value noise stretched vertically (sy >> sx): used for rain striations
function streakNoise(w, h, R) {
  const cols = vnoise(w, Math.ceil(h / 7) + 2, 1.3, R), fine = vnoise(w, h, 1.1, R), out = new Float32Array(w * h), ch = Math.ceil(h / 7) + 2;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const t = y / 7, y0 = Math.floor(t), f = t - y0;
    out[x * h + y] = 0.8 * (cols[x * ch + y0] * (1 - f) + cols[x * ch + y0 + 1] * f) + 0.2 * fine[x * h + y];
  }
  return out;
}

function splitWidth(total, n, R, minw) {
  n = Math.max(1, Math.min(n, Math.floor((total + 1) / (minw + 1))));
  if (n === 1) return [total];
  const avail = total - (n - 1);
  for (let tries = 0; tries < 60; tries++) {
    const cuts = new Set();
    while (cuts.size < n - 1) cuts.add(R.int(minw, avail - minw));
    const cs = [...cuts].sort((a, b) => a - b);
    const ws = []; let prev = 0;
    for (const c of cs) { ws.push(c - prev); prev = c; }
    ws.push(avail - prev);
    if (ws.every(w => w >= minw)) return ws;
  }
  const base = Math.floor(avail / n), ws = Array(n).fill(base); ws[n - 1] += avail - base * n; return ws;
}

// ------------------------------------------------------------------ lettering
const FONT7 = {
  '0': ['0111110','1100011','1100111','1101011','1110011','1100011','0111110'],
  '1': ['0011000','0111000','0011000','0011000','0011000','0011000','0111100'],
  '2': ['0111110','1100011','0000011','0001110','0111000','1100000','1111111'],
  '3': ['1111110','0000011','0000011','0111110','0000011','0000011','1111110'],
  '4': ['0000110','0001110','0011110','0110110','1111111','0000110','0000110'],
  '5': ['1111111','1100000','1111110','0000011','0000011','1100011','0111110'],
  '6': ['0011110','0110000','1100000','1111110','1100011','1100011','0111110'],
  '7': ['1111111','0000011','0000110','0001100','0011000','0011000','0011000'],
  '8': ['0111110','1100011','1100011','0111110','1100011','1100011','0111110'],
  '9': ['0111110','1100011','1100011','0111111','0000011','0000110','0111100'],
};
const glyphCache = new Map();
export function textMask(text, font, height, widthScale) {
  const key = [text, font, height, widthScale].join('|');
  if (glyphCache.has(key)) return glyphCache.get(key);
  let res;
  const blockOk = font === 'Maze Block' && [...text].every(c => FONT7[c]);
  if (blockOk) {
    const cw = Math.max(3, Math.round(height * 0.5 * widthScale)), gap = Math.max(1, Math.round(height * 0.08));
    const W = text.length * cw + (text.length - 1) * gap, H = height;
    const m = new Uint8Array(W * H);
    [...text].forEach((ch, i) => {
      const rows = FONT7[ch];
      for (let x = 0; x < cw; x++) for (let y = 0; y < H; y++) {
        const c = Math.min(6, Math.floor(x / cw * 7)), r = Math.min(6, Math.floor((H - 1 - y) / H * 7));
        if (rows[r][c] === '1') m[(i * (cw + gap) + x) * H + y] = 1;
      }
    });
    res = { w: W, h: H, m };
  } else {
    const ss = 6, fam = font === 'Maze Block' ? 'Arial Black' : font;
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');   // works in a worker too
    let ctx = cv.getContext('2d', { willReadFrequently: true });
    const px = height * ss * 1.45;
    ctx.font = `900 ${px}px "${fam}", sans-serif`;
    const tw = Math.ceil(ctx.measureText(text).width) + ss * 4;
    cv.width = tw; cv.height = Math.ceil(px * 1.5);
    ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = `900 ${px}px "${fam}", sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, ss * 2, cv.height / 2);
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, x1 = 0, y0 = cv.height, y1 = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (img[(y * cv.width + x) * 4 + 3] > 100) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) { res = { w: 0, h: 0, m: new Uint8Array(0) }; }
    else {
      const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
      const H = height, W = Math.max(1, Math.round(bw / bh * height * widthScale));
      const m = new Uint8Array(W * H);
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const sx0 = x0 + Math.floor(x / W * bw), sx1 = x0 + Math.floor((x + 1) / W * bw);
        const sy0 = y0 + Math.floor((H - 1 - y) / H * bh), sy1 = y0 + Math.floor((H - y) / H * bh);
        let on = 0, tot = 0;
        for (let yy = sy0; yy <= Math.max(sy0, sy1 - 1); yy++) for (let xx = sx0; xx <= Math.max(sx0, sx1 - 1); xx++) {
          tot++; if (img[(yy * cv.width + xx) * 4 + 3] > 127) on++;
        }
        if (on / tot >= 0.5) m[x * H + y] = 1;
      }
      res = { w: W, h: H, m };
    }
  }
  glyphCache.set(key, res);
  return res;
}

// ------------------------------------------------------------------ one side of a wall
export class Skin {
  constructor(W, H, seed, P) {
    this.W = W; this.H = H; this.P = P; this.R = new Rng(seed); this.seed = seed;
    const n = W * H;
    this.F = new Int16Array(n).fill(NONE);
    this.mono = new Int32Array(n).fill(-1);
    this.monos = [];
    this.formline = new Uint8Array(n);
    this.dark = new Float32Array(n);
    this.crack = new Uint8Array(n);
    this.rust = new Float32Array(n);
    this.lock = new Uint8Array(n);
    this.special = new Map();
    this.bars = []; this.louvre = [];
    this.hero = -1;
    this.MAXF = 40;
  }
  i(x, y) { return x * this.H + y; }
  inb(x, y) { return x >= 0 && x < this.W && y >= 0 && y < this.H; }
  getF(x, y) { return this.inb(x, y) ? this.F[this.i(x, y)] : NONE; }
  setF(x, y, v) { if (this.inb(x, y)) this.F[this.i(x, y)] = Math.max(0, Math.min(v, this.MAXF)); }
  fchoice() { return this.R.int(0, Math.max(0, this.P.reliefMax)); }
  // how many slabs a span of width w splits into: grows with width so wide walls don't turn into big flat panels
  slabCount(w) {
    const P = this.P, R = this.R, maxN = Math.max(1, Math.floor((w + 1) / (P.minSlab + 1)));
    if (maxN === 1) return 1;
    const target = w / Math.max(P.minSlab + 1, P.slabTarget ?? 11);
    let n = Math.round(target * R.uniform(0.7, 1.3) * (0.35 + 0.9 * P.splitChance));
    if (n < 2 && R.f() < P.splitChance) n = 2;
    return Math.max(1, Math.min(maxN, n));
  }
  // surface detail on big slabs: recessed inset panels, pilaster strips or a panel grid
  panelize(id) {
    const P = this.P, R = this.R, m = this.monos[id];
    const w = m.x1 - m.x0, h = m.y1 - m.y0;
    if (w < 9 || h < 9 || R.f() >= (P.panelDetail ?? 0.55)) return;
    const own = (x, y) => this.mono[this.i(x, y)] === id && this.F[this.i(x, y)] === m.f;
    const kind = w >= 14 && R.f() < 0.3 ? 'pilasters' : R.pick(['inset', 'inset', 'grid']);
    if (kind === 'inset') {
      const fw = R.int(1, 2), y0 = m.y0 + 1 + fw, y1 = m.y1 - fw - (R.f() < 0.4 ? 1 : 0);
      for (let x = m.x0 + fw; x < m.x1 - fw; x++) for (let y = y0; y < y1; y++) if (own(x, y)) this.F[this.i(x, y)] = m.f + 1;
      if (R.f() < 0.35 && w >= 14) {                                   // double inset
        for (let x = m.x0 + fw + 2; x < m.x1 - fw - 2; x++) for (let y = y0 + 2; y < y1 - 2; y++) if (this.mono[this.i(x, y)] === id) this.F[this.i(x, y)] = m.f + 2;
      }
    } else if (kind === 'pilasters') {
      const sp = R.int(5, 8), pw = R.int(1, 2), off = R.int(1, 3), out = m.f >= 1;
      for (let x = m.x0; x < m.x1; x++) {
        const on = (x - m.x0 - off) % sp < pw && x - m.x0 >= off && m.x1 - x > 1;
        for (let y = m.y0 + 1; y < m.y1; y++) if (own(x, y)) {
          if (on && out) this.F[this.i(x, y)] = m.f - 1;
          else if (!on && !out) this.F[this.i(x, y)] = m.f + 1;
        }
      }
    } else {
      // a grid of recessed lines dividing the slab into formwork panels
      const cols = Math.max(2, Math.round(w / R.int(6, 9))), rows = Math.max(1, Math.round(h / R.int(6, 10)));
      const cw = w / cols, rh = h / rows;
      const edge = (v, size) => v > 0 && Math.floor(v / size) !== Math.floor((v - 1) / size);
      for (let x = m.x0 + 1; x < m.x1 - 1; x++) for (let y = m.y0 + 1; y < m.y1; y++) {
        if ((edge(x - m.x0, cw) || edge(y - m.y0, rh)) && own(x, y)) { this.F[this.i(x, y)] = m.f + 1; this.dark[this.i(x, y)] += 0.05; }
      }
    }
  }

  block(x0, x1, y0, y1, f, o = {}) {
    const R = this.R, P = this.P;
    x0 = Math.max(0, x0); x1 = Math.min(this.W, x1); y0 = Math.max(0, y0); y1 = Math.min(this.H, y1);
    if (x1 <= x0 || y1 <= y0) return -1;
    const id = this.monos.length;
    this.monos.push({ x0, x1, y0, y1, f, tone: o.tone ?? R.normal(0, P.panelTone), ties: o.ties ?? (R.f() < P.tieChance) });
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) { const k = this.i(x, y); this.F[k] = f; this.mono[k] = id; }
    if (o.joint !== false && P.jointDepth > 0) for (let x = x0; x < x1; x++) this.setF(x, y0, f + P.jointDepth);
    if (o.ledge && f >= 1 && y1 - y0 >= 6) {
      const lh = R.pick([1, 1, 2]);
      for (let x = x0; x < x1; x++) for (let y = y1 - lh; y < y1; y++) this.F[this.i(x, y)] = f - 1;
    }
    if (R.f() < P.formlineChance) {
      const per = R.int(5, 7);
      for (let y = y0 + per; y < y1 - 1; y += per) for (let x = x0; x < x1; x++) this.formline[this.i(x, y)] = 1;
    }
    return id;
  }
  groove(x, y0, y1, f) {
    if (x < 0 || x >= this.W) return;
    f += Math.round(2 * (this.P.panelContrast || 0));
    for (let y = Math.max(0, y0); y < Math.min(this.H, y1); y++) {
      const k = this.i(x, y); this.F[k] = Math.min(f, this.MAXF); this.dark[k] += 0.10; this.mono[k] = -2;
    }
  }
  // stack tiers between y and ytop in [x0, x1)
  stack(x0, x1, y, ytop, o = {}) {
    const R = this.R, P = this.P;
    const hmin = o.hmin ?? P.tierMin, hmax = Math.max(hmin, o.hmax ?? P.tierMax);
    const fpick = o.fpick ?? (() => this.fchoice());
    let prevF = new Map();
    while (y < ytop) {
      let h = R.int(hmin, hmax);
      if (R.f() < 0.15) h = Math.round(h * R.uniform(1.4, 1.9));        // the odd tall slab breaks the rhythm
      h = Math.min(h, ytop - y);
      if (ytop - (y + h) < 5) h = ytop - y;
      const n = o.split === false ? 1 : this.slabCount(x1 - x0);
      const ws = splitWidth(x1 - x0, n, R, P.minSlab);
      let xx = x0; const fs = [];
      for (const w of ws) {
        let f = fpick();
        if (prevF.get(xx + (w >> 1)) === f) f = Math.max(0, Math.min(P.reliefMax, f + R.pick([-2, 2])));
        fs.push(f);
        const id = this.block(xx, xx + w, y, y + h, f, { ledge: R.f() < P.ledgeChance });
        if (id >= 0) this.panelize(id);
        xx += w + 1;
      }
      xx = x0; const nf = new Map();
      ws.forEach((w, i) => { for (let k = 0; k < w; k++) nf.set(xx + k, fs[i]); xx += w; if (i < ws.length - 1) { this.groove(xx, y, y + h, Math.max(fs[i], fs[i + 1]) + P.grooveDepth); xx++; } });
      prevF = nf; y += h;
    }
  }
  // Wide walls are built as independent bays (like separate blocks set side by side): each bay has its own
  // depth offset, its own tier heights (so joints never run the whole width) and its own skyline.
  massing(x0, x1, y, crownY, o = {}) {
    const P = this.P, R = this.R, bw = Math.max(8, P.bayWidth ?? 20);
    const bays = [], gaps = [];
    for (const [a, b] of [[x0, x1]]) {
      const wid = b - a;
      if (wid < bw * 1.4) { bays.push([a, b]); continue; }
      const n = Math.max(2, Math.round(wid / (bw * R.uniform(0.75, 1.25))));
      const ws = splitWidth(wid, n, R, Math.max(P.minSlab + 2, Math.round(bw * 0.45)));
      let xx = a;
      ws.forEach((w, i) => { bays.push([xx, xx + w]); xx += w; if (i < ws.length - 1) { gaps.push(xx); xx++; } });
    }
    const multi = bays.length > 1, shifts = [];
    for (const [a, b] of bays) {
      const shift = multi ? R.int(0, Math.max(0, P.bayRelief ?? 3)) : 0; shifts.push(shift);
      const base = o.fpick || (() => this.fchoice());
      const fpick = () => Math.min(this.MAXF - 4, base() + shift);
      const cy = Math.max(y, crownY + (multi ? R.int(-8, 6) : 0));
      this.stack(a, b, y, cy, { fpick });
      this.crown(a, b, cy, { fshift: shift });
    }
    // deep vertical joints between bays, up to the lower neighbour's top
    const topOf = x => { for (let yy = this.H - 1; yy >= 0; yy--) if (this.getF(x, yy) < NONE) return yy + 1; return 0; };
    for (const g of gaps) {
      const t = Math.min(topOf(g - 1), topOf(g + 1));
      let deepest = 0; for (let yy = y; yy < t; yy++) deepest = Math.max(deepest, this.getF(g - 1, yy) < NONE ? this.getF(g - 1, yy) : 0, this.getF(g + 1, yy) < NONE ? this.getF(g + 1, yy) : 0);
      this.groove(g, y, t, Math.min(this.MAXF - 2, deepest + P.grooveDepth + 1));
    }
  }
  // final tier where each slab has its own top (skyline)
  crown(x0, x1, y, o = {}) {
    const R = this.R, P = this.P;
    const ws = splitWidth(x1 - x0, this.slabCount(x1 - x0), R, P.minSlab);
    let xx = x0; const tops = [], fs = [];
    for (const w of ws) {
      const top = R.int(o.topMin ?? P.heightMin, o.topMax ?? P.heightMax);
      tops.push(top);
      if (top - y > P.tierMax + 4) {                                   // tall: stack real tiers up to this slab's top
        const first = this.monos.length;
        const sh = o.fshift || 0;
        this.stack(xx, xx + w, y, top, { split: w >= 2 * P.minSlab + 1 && w > (P.slabTarget ?? 11) * 1.4, fpick: () => sh + this.fchoice() });
        fs.push(this.monos[first]?.f ?? 0);
      } else {
        const f = (o.fshift || 0) + this.fchoice(); fs.push(f);
        const id = this.block(xx, xx + w, y, top, f, { ledge: R.f() < P.ledgeChance * 0.7 });
        if (id >= 0) this.panelize(id);
      }
      xx += w + 1;
    }
    xx = x0;
    ws.forEach((w, i) => { xx += w; if (i < ws.length - 1) { this.groove(xx, y, Math.min(tops[i], tops[i + 1]), Math.max(fs[i], fs[i + 1]) + P.grooveDepth); xx++; } });
  }
  fins(x0, x1, zoneTop) {
    const R = this.R, P = this.P;
    let x = x0 + R.int(0, 2);
    while (x < x1) {
      const fw = Math.max(1, P.finWidth + R.int(-1, 0) + (R.f() < 0.3 ? 1 : 0));
      const top = zoneTop + R.int(-2, 2);
      for (let y = 0; y < top; y++) {
        const step = Math.max(0, Math.floor((y - (top - 7)) / 2));
        for (let k = x; k < Math.min(x1, x + fw); k++) this.setF(k, y, Math.min(this.getF(k, y), step));
      }
      x += fw + R.int(P.finGapMin, Math.max(P.finGapMin, P.finGapMax));
    }
  }
  // skyline: top slabs step down by a smooth amount that follows the world position (so front and back agree)
  // plus a little of their own (roughness), and the whole piece can lean one way (slope);
  // u(x) is the world position (0..1) of skin column x, span the piece's width in blocks
  skyline(u, span = this.W) {
    const P = this.P, rough = P.skylineRough || 0, slope = P.skylineSlope || 0;
    if (!rough && !slope) return;
    const { W, H, F } = this, top = new Int16Array(W).fill(-1), drop = new Float32Array(W);
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (F[this.i(x, y)] < NONE) { top[x] = y; break; }
    for (let x = 0; x < W; x++) {
      if (top[x] < 0) continue;
      const m = this.mono[this.i(x, top[x])];
      if (m === -2) { drop[x] = -1; continue; }                                  // grooves follow their neighbours
      const s = m >= 0 ? this.monos[m] : null, cx = s ? (s.x0 + s.x1 - 1) / 2 : x;
      const w = u ? u(Math.round(cx)) : cx / Math.max(1, W - 1), t = w * span / 11, i0 = Math.floor(t), fr = t - i0, sm = fr * fr * (3 - 2 * fr);
      const wn = roll(P.seed, i0, 82) * (1 - sm) + roll(P.seed, i0 + 1, 82) * sm;           // smooth noise along the world
      let d = rough * (18 * Math.pow(wn, 1.3) + 6 * roll(this.seed, m >= 0 ? m : 5000 + (x >> 2), 81));
      if (slope) d += Math.abs(slope) * 22 * (slope > 0 ? w : 1 - w);
      drop[x] = d;
    }
    for (let x = 0; x < W; x++) if (drop[x] < 0) drop[x] = Math.max(x > 0 ? drop[x - 1] : 0, x + 1 < W && drop[x + 1] >= 0 ? drop[x + 1] : 0);
    for (let x = 0; x < W; x++) {
      if (top[x] < 0) continue;
      const nt = Math.max(Math.round(top[x] * 0.5), top[x] - Math.round(drop[x]));
      for (let y = nt + 1; y <= top[x]; y++) F[this.i(x, y)] = NONE;
    }
  }
  // seam matching: the outermost columns get the same joint profile on every wall (it depends only on the
  // seam pattern number, not the seed), so walls with different seeds line up where they meet
  seam() {
    const P = this.P; if (!P.seamMatch) return;
    const { W, H } = this, sw = Math.min(2, W >> 3), pat = (P.seamPattern | 0) + 1;
    if (!sw) return;
    const top = P.heightMin + Math.round((P.heightMax - P.heightMin) * roll(pat, 0, 61));
    const joints = new Set(); for (let y = 8 + Math.round(roll(pat, 1, 61) * 4); y < top - 4; y += 9 + Math.round(roll(pat, y, 62) * 5)) joints.add(y);
    for (const x of [...Array(sw).keys(), ...Array.from({ length: sw }, (_, k) => W - 1 - k)]) for (let y = 0; y < H; y++) {
      const i = this.i(x, y);
      if (y >= top) { this.F[i] = NONE; continue; }
      this.F[i] = joints.has(y) ? 2 : 1; this.mono[i] = -1; this.lock[i] = 1;
    }
  }
  plinth() {
    if (this.P.plinthHeight <= 0) return;
    for (let x = 0; x < this.W; x++) for (let y = 0; y < this.P.plinthHeight; y++) {
      const k = this.i(x, y); if (this.F[k] < NONE) this.F[k] = Math.min(this.F[k], this.P.plinthDepth);
    }
  }
  // ---------------------------------------------------------------- features
  free(x0, x1, y0, y1) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
      if (!this.inb(x, y)) return false;
      const k = this.i(x, y); if (this.lock[k] || this.F[k] === NONE) return false;
    }
    return true;
  }
  opening(x0, x1, y0, y1, depth) {
    for (let x = Math.max(0, x0); x < Math.min(this.W, x1); x++) for (let y = Math.max(0, y0); y < Math.min(this.H, y1); y++) {
      const k = this.i(x, y); this.F[k] = Math.min(depth, this.MAXF); this.mono[k] = -3; this.dark[k] += 0.30; this.lock[k] = 1;
    }
  }
  channel(x, y0, y1) {
    if (x < 0 || x >= this.W) return;
    for (let y = y0; y < y1; y++) {
      if (!this.inb(x, y)) continue;
      const k = this.i(x, y); if (this.F[k] === NONE) continue;
      this.F[k] = Math.min(this.F[k] + 1, this.MAXF); this.dark[k] += 0.38; this.lock[k] = 1;
      if (this.R.f() < 0.05) this.rustStreak(x, x + 1, y, this.R.int(2, 5), 0.7);
    }
  }
  rustStreak(x0, x1, ytop, length, strength = 1) {
    const R = this.R; strength *= this.P.rust;
    for (let x = x0; x < x1; x++) {
      const ln = Math.floor(length * R.uniform(0.5, 1.1)); let cx = x;
      for (let d = 0; d < ln; d++) {
        const y = ytop - d;
        if (y < 0 || cx < 0 || cx >= this.W) break;
        if (R.f() < 0.22) continue;
        const k = this.i(cx, y);
        this.rust[k] = Math.max(this.rust[k], strength * Math.pow(1 - d / Math.max(1, ln), 0.7));
        if (R.f() < 0.12) cx += R.pick([-1, 1]);
      }
    }
  }
  porthole(cx, cy, r) {
    const f = this.getF(cx, cy), pal = this.P.palette;
    for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      if (!this.inb(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy), k = this.i(x, y);
      if (d <= r - 0.4) {
        if ((x - cx) % 2 === 0) { this.F[k] = f + 1; this.special.set(k, pal.porthole); }
        else { this.F[k] = f + 3; this.special.set(k, pal.deep); }
      } else if (d <= r + 0.6) { this.F[k] = Math.max(0, f - 1); this.special.set(k, pal.porthole); }
      else continue;
      this.lock[k] = 1;
    }
    this.bars.push({ cx, cy, r, f });
    const sx = cx + this.R.pick([-1, 0, 1]);
    this.rustStreak(sx, sx + this.R.pick([1, 2]), cy - r - 1, this.R.int(10, 24), 0.85);
  }
  grille(x0, x1, y0, y1) {
    const f = this.getF((x0 + x1) >> 1, (y0 + y1) >> 1), pal = this.P.palette;
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
      const k = this.i(x, y), edge = x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1;
      if (edge) { this.special.set(k, pal.grilleFrame); this.F[k] = f; }
      else { this.F[k] = f + 2; this.special.set(k, pal.deep); if ((y - y0) % 2 === 1) this.louvre.push({ x, y, z: f + 1 }); }
      this.lock[k] = 1;
    }
    this.rustStreak(x0 + 1, x1 - 1, y0 - 1, this.R.int(3, 8), 0.5);
  }
  hazard(x0, x1, y0, y1) {
    const pal = this.P.palette, sw = Math.max(1, this.P.hazardStripe);
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
      if (!this.inb(x, y)) continue;
      if (this.R.f() < this.P.hazardWear) continue;
      const k = this.i(x, y);
      this.special.set(k, Math.floor((x + y) / sw) % 2 ? pal.hazardB : pal.hazardA); this.lock[k] = 1;
    }
  }
  lettering(text) {
    const P = this.P;
    if (!text) return;
    const g = textMask(text, P.numberFont, Math.max(4, P.numberHeight), P.numberWidth);
    if (!g.w) return;
    // hero surface: layout-provided, else the biggest slab that fits
    let host = this.hero >= 0 ? this.monos[this.hero] : null;
    if (!host) {
      let best = -1;
      for (const m of this.monos) {
        const w = m.x1 - m.x0, h = m.y1 - m.y0;
        if (m.y0 < 6) continue;
        const score = Math.min(w / (g.w + 2), 1) * Math.min(h / (g.h + 2), 1) * 1000 + w * h / 100;
        if (score > best) { best = score; host = m; }
      }
    }
    const hx0 = host ? host.x0 : 0, hx1 = host ? host.x1 : this.W;
    const hy0 = host ? host.y0 + 1 : 10, hy1 = host ? host.y1 - 1 : this.H - 10;
    const x0 = Math.round(hx0 + (hx1 - hx0 - g.w) * P.numberPosX);
    const y0 = Math.round(hy0 + (hy1 - hy0 - g.h) * P.numberPosY);
    const wear = vnoise(this.W, this.H, 2.5, this.R);
    const pal = P.palette;
    for (let x = 0; x < g.w; x++) for (let y = 0; y < g.h; y++) {
      if (!g.m[x * g.h + y]) continue;
      const gx = x0 + x, gy = y0 + y;
      if (!this.inb(gx, gy)) continue;
      const k = this.i(gx, gy);
      if (this.F[k] === NONE) continue;
      if (wear[k] + 0.25 * this.R.f() < P.numberWear) continue;
      if (P.numberStyle === 'raised' && this.F[k] > 0) this.F[k] -= 1;
      if (P.numberStyle === 'inset') this.F[k] += 1;
      const alt = pal.paint2 && this.R.f() < P.paintVariation;
      this.special.set(k, alt ? pal.paint2 : pal.paint); this.lock[k] = 1;
    }
  }
  features(f) {
    const R = this.R, P = this.P, W = this.W;
    const tall = () => { let t = 0; for (let x = 0; x < W; x++) for (let y = this.H - 1; y >= 0; y--) if (this.getF(x, y) < NONE) { t = Math.max(t, y); break; } return t; };
    const top = tall();
    // doorways
    for (let n = 0; n < f.doorways; n++) for (let t = 0; t < 30; t++) {
      const w = P.doorWidth, h = P.doorHeight, x = R.int(1, Math.max(1, W - w - 1));
      if (!this.free(x - 1, x + w + 1, 0, h + 1)) continue;
      this.opening(x, x + w, 0, h, Math.max(this.getF(x, 1) + P.doorDepth, 6));
      for (let k = x - 1; k < x + w + 1; k++) if (this.inb(k, h)) { const i = this.i(k, h); this.F[i] = Math.max(0, this.F[i] - 1); this.lock[i] = 1; }
      break;
    }
    // hazard panels, low on the wall
    for (let n = 0; n < f.hazards; n++) for (let t = 0; t < 30; t++) {
      const w = R.int(3, 4), h = R.int(5, 12), x = R.int(0, Math.max(0, W - w));
      if (!this.free(x, x + w, 1, 1 + h)) continue;
      this.hazard(x, x + w, 1, 1 + h); break;
    }
    // portholes on slabs that stand proud
    for (let n = 0; n < f.portholes; n++) for (let t = 0; t < 40; t++) {
      const r = P.portholeRadius, m = R.pick(this.monos);
      if (!m || m.f < 1 || m.x1 - m.x0 < 2 * r + 5 || m.y1 - m.y0 < 2 * r + 5) continue;
      const cx = R.int(m.x0 + r + 2, m.x1 - r - 3), cy = m.y1 - r - R.int(2, 3);
      if (!this.free(cx - r - 1, cx + r + 2, cy - r - 1, cy + r + 2)) continue;
      this.porthole(cx, cy, r); break;
    }
    // vent grilles
    for (let n = 0; n < f.grilles; n++) for (let t = 0; t < 40; t++) {
      const m = R.pick(this.monos); if (!m) break;
      const gw = R.int(P.grilleMin, P.grilleMax), gh = R.int(P.grilleMin, P.grilleMax);
      if (m.x1 - m.x0 < gw + 2 || m.y1 - m.y0 < gh + 4 || m.y0 < 8) continue;
      const gx = R.int(m.x0 + 1, m.x1 - gw - 1), gy = R.int(m.y0 + 2, m.y1 - gh - 2);
      if (!this.free(gx, gx + gw, gy, gy + gh)) continue;
      this.grille(gx, gx + gw, gy, gy + gh); break;
    }
    // small windows
    for (let n = 0; n < f.windows; n++) for (let t = 0; t < 30; t++) {
      const s = R.int(2, 3), x = R.int(1, Math.max(1, W - s - 1)), y = R.int(14, Math.max(14, top - 12));
      if (!this.free(x, x + s, y, y + s)) continue;
      this.opening(x, x + s, y, y + s, this.getF(x, y) + 4); break;
    }
    // vertical service channels (pairs)
    for (let n = 0; n < f.channels; n++) {
      const x = R.int(2, Math.max(2, W - 5)), y0 = R.int(6, 14), y1 = Math.max(y0 + 10, top - R.int(2, 6));
      this.channel(x, y0, y1); if (P.channelPairs) this.channel(x + 2, y0 + R.int(0, 3), y1 - R.int(0, 3));
    }
    if (f.lettering) this.lettering(f.lettering);
  }

  // ---------------------------------------------------------------- weathering
  weather() {
    const W = this.W, H = this.H, F = this.F, R = this.R, P = this.P;
    for (const m of this.monos) {
      if (R.f() >= P.chips) continue;
      const yy = m.y1 - 1, side = R.int(0, 1);
      for (let k = 0; k < R.int(1, 3); k++) {
        const xx = side === 0 ? m.x0 + k : m.x1 - 1 - k;
        if (!this.inb(xx, yy)) continue;
        const i = this.i(xx, yy); if (!this.lock[i] && F[i] < this.MAXF - 1) F[i] += 1;
      }
    }
    for (let i = 0; i < W * H; i++) if (F[i] < this.MAXF - 1 && !this.lock[i] && R.f() < P.pockmarks) F[i] += 1;
    for (let c = 0; c < P.cracks; c++) {
      let cx = R.int(2, W - 3), cy = R.int(20, Math.max(21, P.heightMin - 6));
      const rusty = R.f() < P.crackRust;
      for (let s = 0, n = R.int(10, 26); s < n; s++) {
        if (this.inb(cx, cy) && F[this.i(cx, cy)] < NONE && !this.lock[this.i(cx, cy)]) {
          this.crack[this.i(cx, cy)] = 1;
          if (rusty && R.f() < 0.3) this.rustStreak(cx, cx + 1, cy, R.int(3, 9), 0.8);
        }
        cy -= 1; cx += R.pick([-1, 0, 0, 1]);
      }
    }
    const V = new Float32Array(W * H).fill(P.baseTone);
    const n1 = vnoise(W, H, 11, R), n2 = vnoise(W, H, 3, R), n4 = vnoise(W, H, 4, R);
    // panel distinction: each slab gets its own shade and block, with calmer noise inside it
    const pk = P.panelContrast || 0, calm = 1 - 0.6 * pk;
    for (let i = 0; i < W * H; i++) {
      const m = this.mono[i];
      if (m >= 0) V[i] += this.monos[m].tone + pk * 0.55 * (roll(this.seed, m, 71) - 0.5);
      V[i] += calm * (P.largeNoise * (n1[i] - 0.5) + P.fineNoise * (n2[i] - 0.5) + P.speckle * (R.f() - 0.5));
      if (m === -2) V[i] += 0.14 * pk;                                        // joints read as shadow lines
      if (this.formline[i]) V[i] += 0.05;
      V[i] += this.dark[i];
      if (F[i] < NONE) V[i] += 0.03 * Math.max(0, Math.min(12, F[i] - 5));
      const y = i % H;
      if (P.grimeHeight > 0) V[i] += P.grimeStrength * Math.max(0, 1 - y / P.grimeHeight) * (0.5 + n4[i]);
      if (this.crack[i]) V[i] += 0.30;
    }
    this.monos.forEach((m, id) => {
      if (!m.ties) return;
      const sp = P.tieSpacing;
      for (let tx = m.x0 + 2; tx < m.x1 - 1; tx += sp) for (let ty = m.y0 + 3; ty < m.y1 - 1; ty += sp) {
        const i = this.i(tx, ty);
        if (this.mono[i] === id && F[i] === m.f && !this.lock[i]) {
          V[i] += 0.30;
          if (R.f() < 0.18) this.rustStreak(tx, tx + 1, ty - 1, R.int(2, 6), 0.6);
        }
      }
    });
    this.V = V;
    this.pick = vnoise(W, H, P.patchSize, R).map(v => v * 2.7);
    if (pk > 0) for (let i = 0; i < W * H; i++) {
      const m = this.mono[i];
      if (m >= 0) this.pick[i] = this.pick[i] * (1 - pk) + roll(this.seed, m, 72) * 2.7 * pk;
    }
    this.striae = streakNoise(W, H, R);
  }
  faceBlock(x, y, face, wet = 0) {
    const P = this.P, pal = P.palette, i = this.i(x, y), V = this.V;
    if (face && this.special.has(i)) return this.special.get(i);
    const r = salt => roll(this.seed, i * 2 + (face ? 1 : 0), salt);
    const st = this.striae[i], w = wet * (0.55 + 0.9 * st);                   // water stains in vertical striations
    const pick = wet > 0.02 ? this.pick[i] * (1 - Math.min(1, wet * 4)) + st * 2.7 * Math.min(1, wet * 4) : this.pick[i];
    let b = shadeBlock(pal, V[i] + w + (face ? 0 : 0.05), pick, r(0));
    const ru = this.rust[i], mossK = P.moss, g = r(1);
    if (face && ru > 0.7) b = pal.rust;
    else if (face && ru > 0.4) b = g < 0.4 ? pal.rust : (pal.rust2 || pal.rust);
    else if (face && ru > 0.15 && g < 0.6) b = pal.crack;
    else if (y < P.grimeHeight * 0.7 && g < 0.5 * mossK * (1 - y / (P.grimeHeight * 0.7))) b = pal.grime;
    else if (w > 0.2 && st > 1 - (w - 0.2) * 1.6 * mossK) b = pal.grime;    // the wettest striations turn green
    else if (this.mono[i] === -2 && r(3) < 0.25 * mossK) b = pal.grime;
    if (this.crack[i] && face) b = r(4) < 0.8 ? pal.crack : pal.deep;
    return b;
  }
}
export const BANDS = [0.10, 0.18, 0.26, 0.34, 0.44, 0.54, 0.66, 0.80, 99];
// pick a block for darkness v from the palette's shade bands; pick = patch noise so neighbours match
function shadeBlock(pal, v, pick, jitter) {
  let band = BANDS.length - 1;
  for (let b = 0; b < BANDS.length; b++) if (v < BANDS[b]) { band = b; break; }
  let opts = pal.bands[band];
  for (let d = 1; !opts.length && d < BANDS.length; d++) opts = pal.bands[band - d]?.length ? pal.bands[band - d] : pal.bands[band + d] || [];
  if (!opts.length) opts = ['stone'];
  return opts[Math.floor(((pick + 0.12 * jitter) % 1) * opts.length) % opts.length];
}
// block ids for a grid: keys[0] is always air
function keyTable(keys = ['air']) {
  const idx = new Map(keys.map((k, i) => [k, i]));
  return { keys, id(b) { let v = idx.get(b); if (v === undefined) { v = keys.length; keys.push(b); idx.set(b, v); } return v; } };
}
// 1 or 2 = distance to the nearest open side (dirt gathers along edges), 9 = well inside
function edgeDist(solid, x, y, z) {
  for (let d = 1; d <= 2; d++) if (!solid(x, y, z + d) || !solid(x, y, z - d) || !solid(x + d, y, z) || !solid(x - d, y, z)) return d;
  return 9;
}
// depth of an end skin's relief at (e, y), limited to `relief`
const endDepth = (skin, e, y, relief) => { if (!relief) return 0; const v = skin.F[e * skin.H + y]; return v >= NONE ? 0 : Math.min(v, relief); };
// iron bars in port-holes and vent louvres; put(u, y, depth, variant) maps skin space to the world
function fixtures(skin, put) {
  for (const { cx, cy, r, f } of skin.bars) for (let u = cx - r; u <= cx + r; u++) for (let y = cy - r; y <= cy + r; y++)
    if (Math.hypot(u - cx, y - cy) <= r - 0.4 && (u - cx) % 2) put(u, y, f + 1, 'v');
  for (const { x, y, z } of skin.louvre) put(x, y, z, 'h');
}

// ------------------------------------------------------------------ top surfaces
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

// ------------------------------------------------------------------ layouts
export const LAYOUTS = {
  stacked(s) {
    const P = s.P, R = s.R, W = s.W;
    let y;
    if (P.fins) {
      y = R.int(P.finHeightMin, Math.max(P.finHeightMin, P.finHeightMax));
      s.block(0, W, 0, y, Math.min(P.reliefMax + 1, 6), { ties: false });
      s.fins(0, W, y);
    } else {
      y = R.int(4, 8); s.block(0, W, 0, y, R.int(2, 3), { ties: false });
    }
    s.massing(0, W, y, Math.max(y, P.heightMin - 12));
  },
  towers(s) {
    const P = s.P, R = s.R, W = s.W;
    const n = Math.max(1, Math.min(P.towerCount, Math.floor((W + P.towerGap) / (4 + P.towerGap))));
    const ws = splitWidth(W - (n - 1) * (P.towerGap - 1), n, R, 4).map(w => w);
    const spans = []; let x = 0;
    ws.forEach((w, i) => { spans.push([x, x + w]); x += w + (i < n - 1 ? P.towerGap : 0); });
    const tallest = R.int(0, n - 1);
    const tops = spans.map((_, i) => i === tallest ? R.int(P.heightMin, P.heightMax) : R.int(Math.max(20, P.heightMin - 16), Math.max(20, P.heightMax - 3)));
    for (let i = 0; i < n - 1; i++) {
      const g0 = spans[i][1], g1 = spans[i + 1][0];
      const gt = Math.min(tops[i], tops[i + 1]) - R.int(0, 8);
      s.block(g0, g1, 0, gt, P.towerGapDepth, { joint: false, ties: false });
      for (let gx = g0; gx < g1; gx++) for (let y = 0; y < s.H; y++) s.dark[s.i(gx, y)] += 0.2;
    }
    spans.forEach(([a, b], i) => {
      const hb = R.int(4, 8);
      s.block(a, b, 0, hb, R.int(3, 4), { ties: false });
      s.stack(a, b, hb, tops[i], { split: false, hmin: Math.max(5, P.tierMin - 1), hmax: Math.max(6, P.tierMax - 1) });
    });
    if (P.fins) s.fins(0, W, R.int(P.finHeightMin, P.finHeightMax));
  },
  cantilever(s) {
    const P = s.P, R = s.R, W = s.W;
    const hb = R.int(7, 10), o = P.overhang;
    s.block(0, W, 0, hb, o + 1, { ties: false });
    const cw = Math.min(W, P.cubeWidth), cx0 = R.pick([0, W - cw, R.int(2, Math.max(2, W - cw - 2))]);
    s.block(cx0 + 3, cx0 + cw - 3, 0, hb - 2, Math.max(1, o - 1));
    let y = hb; const h1 = P.cubeHeight;
    const cube = s.block(cx0, cx0 + cw, y, y + h1, 0, { ties: true });
    for (const [a, b] of [[0, cx0 - 1], [cx0 + cw + 1, W]]) if (b - a >= 3) s.stack(a, b, y, y + h1, { split: false, hmin: 6, hmax: 10, fpick: () => R.int(o - 1, o) });
    s.groove(cx0 - 1, y, y + h1, o + 1); s.groove(cx0 + cw, y, y + h1, o + 1);
    y += h1; const h2 = R.int(8, 12);
    s.block(cx0 - 2, cx0 + cw + 2, y, y + h2, 1, { ledge: true });
    for (const [a, b] of [[0, cx0 - 2], [cx0 + cw + 2, W]]) if (b - a >= 2) s.block(a, b, y, y + h2, Math.min(o, 3));
    y += h2;
    s.massing(0, W, y, Math.max(y, P.heightMin - 8), { fpick: () => R.int(2, Math.max(2, P.reliefMax)) });
    const m = s.monos[cube];
    s.rustStreak(m.x0 + R.int(2, Math.max(2, cw - 3)), m.x0 + R.int(2, Math.max(2, cw - 3)) + 2, m.y1 - 2, R.int(8, 13));
  },
  beam(s) {
    const P = s.P, R = s.R, W = s.W;
    const ho = P.passageHeight, p0 = R.int(3, 6), p1 = W - R.int(3, 6);
    s.block(0, p0, 0, ho, 2); s.block(p1, W, 0, ho, 2);
    s.opening(p0, p1, 0, ho, P.passageDepth);
    for (let k = 0; k < R.int(1, 3); k++) { const ix = R.int(p0 + 2, Math.max(p0 + 2, p1 - 6)); s.opening(ix, ix + R.int(2, 4), 0, ho - R.int(0, 3), Math.max(6, P.passageDepth - R.int(3, 5))); }
    const bh = P.beamHeight;
    s.block(0, W, ho, ho + bh, 0, { ties: true });
    for (let x = 0; x < W; x++) { s.F[s.i(x, ho)] = 0; }
    let y = ho + bh; const bh2 = R.int(4, 6);
    s.block(0, W, y, y + bh2, 3); y += bh2;
    const cut = R.int(Math.floor(W * 0.3), Math.floor(W * 0.65)), tall = R.int(0, 1);
    [[0, cut], [cut + 1, W]].forEach(([a, b], i) => {
      if (b - a < 3) return;
      const top = i === tall ? R.int(P.heightMin, P.heightMax) : R.int(Math.max(y + 6, P.heightMin - 14), Math.max(y + 6, P.heightMax - 6));
      s.stack(a, b, y, top, { fpick: () => R.int(2, Math.max(2, P.reliefMax)) });
    });
    s.groove(cut, y, P.heightMin - 12, 5);
  },
  slab(s) {
    const P = s.P, R = s.R, W = s.W;
    const sw = Math.min(W, P.slabWidth), sx0 = Math.round((W - sw) * R.uniform(0, 1));
    const hb = R.int(6, 10);
    s.block(0, W, 0, hb, R.int(2, 3), { ties: false });
    const sh = P.slabHeight;
    s.hero = s.block(sx0, sx0 + sw, hb, hb + sh, R.int(0, 1), { tone: -0.03 });
    for (const [a, b] of [[0, sx0 - 1], [sx0 + sw + 1, W]]) if (b - a >= 2) s.stack(a, b, hb, R.int(Math.max(hb + sh - 4, P.heightMin - 10), P.heightMax), { split: false });
    s.groove(sx0 - 1, hb, hb + sh, 5); s.groove(sx0 + sw, hb, hb + sh, 5);
    s.massing(sx0, sx0 + sw, hb + sh, Math.max(hb + sh, P.heightMin - 8));
  },
};
export const LAYOUT_NAMES = { stacked: 'Stacked tiers', towers: 'Twin towers', cantilever: 'Cantilever / overhang', beam: 'Beam & passage', slab: 'Sector slab' };

function buildSkin(W, H, seed, P, layout, feat, u, span) {
  const s = new Skin(W, H, seed, P);
  LAYOUTS[layout](s); s.skyline(u, span); s.seam(); s.plinth(); s.features(feat);
  s.weather();
  return s;
}

// ------------------------------------------------------------------ whole structure
export function generate(P) {
  const g = buildFootprint(P, pieceMask(P));
  if (P.ivy) applyIvy(g, P);
  return g;
}
function featBundle(P, side, k = 1) {
  const q = v => Math.round(v * k);
  const lettering = side === 'front' ? (P.numberSide !== 'back' ? P.numberText : '') : (P.numberSide !== 'front' ? P.numberText : '');
  return { doorways: q(P.doorways), hazards: q(P.hazards), portholes: q(P.portholes), grilles: q(P.grilles), windows: q(P.windows), channels: q(P.channels), lettering };
}
const backK = P => P.backFeatures === 'none' ? 0 : P.backFeatures === 'fewer' ? 0.5 : 1;

// ------------------------------------------------------------------ floor plans
// Every piece is a 2D footprint of wall columns (1 = wall). Front faces south (+z), like the schematics.
export const PIECES = { straight: 'Straight wall', corner: 'Corner (L-shape)', tee: 'T-junction', cross: 'Crossroads', maze: 'Whole maze' };
function pieceMask(P) {
  if (P.piece === 'maze') return mazeMask(P);
  const T = P.thickness, L = Math.max(P.width, T + 6);
  const rect = (W, D, f) => { const m = new Uint8Array(W * D); for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) m[x * D + z] = f(x, z) ? 1 : 0; return { W, D, mask: m }; };
  const mid = v => v >= (L - T) >> 1 && v < ((L - T) >> 1) + T;
  switch (P.piece) {
    case 'corner': return rect(L, L, (x, z) => z >= L - T || x >= L - T);            // outer faces south + east
    case 'tee': return rect(L, L, (x, z) => z >= L - T || mid(x));                    // bar along the south, stem north
    case 'cross': return rect(L, L, (x, z) => mid(x) || mid(z));
    default: return rect(P.width, T, () => true);
  }
}
// a seeded maze: cells joined by carving passages (recursive backtracker), optional loops and a Glade
function mazeMask(P) {
  const R = new Rng(P.seed * 3 + 1), C = P.mazeCols, Rw = P.mazeRows, cor = P.mazeCorridor, t = P.mazeWall, cell = cor + t;
  const W = C * cell + t, D = Rw * cell + t, m = new Uint8Array(W * D);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) m[x * D + z] = x % cell < t || z % cell < t ? 1 : 0;
  const open = (x0, x1, z0, z1) => { for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) m[x * D + z] = 0; };
  const between = (i, j, di, dj) => di ? open((i + (di > 0 ? 1 : 0)) * cell, (i + (di > 0 ? 1 : 0)) * cell + t, j * cell + t, (j + 1) * cell)
                                      : open(i * cell + t, (i + 1) * cell, (j + (dj > 0 ? 1 : 0)) * cell, (j + (dj > 0 ? 1 : 0)) * cell + t);
  const gs = P.glade ? Math.min(P.gladeSize, C - 2, Rw - 2) : 0, gi = (C - gs) >> 1, gj = (Rw - gs) >> 1;
  const inGlade = (i, j) => gs > 0 && i >= gi && i < gi + gs && j >= gj && j < gj + gs;
  const seen = new Uint8Array(C * Rw), N = [[1, 0], [-1, 0], [0, 1], [0, -1]], links = new Uint8Array(C * Rw);
  let start = [0, 0]; if (inGlade(0, 0)) start = [C - 1, Rw - 1];
  const stack = [start]; seen[start[0] * Rw + start[1]] = 1;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = N.map(([di, dj]) => [i + di, j + dj, di, dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < C && b < Rw && !seen[a * Rw + b] && !inGlade(a, b));
    if (!nb.length) { stack.pop(); continue; }
    const [a, b, di, dj] = nb[Math.floor(R.f() * nb.length)];
    between(i, j, di, dj); links[i * Rw + j]++; links[a * Rw + b]++; seen[a * Rw + b] = 1; stack.push([a, b]);
  }
  for (let i = 0; i < C; i++) for (let j = 0; j < Rw; j++) {                  // braid: knock through some dead ends
    if (links[i * Rw + j] !== 1 || inGlade(i, j) || R.f() >= P.mazeBraid) continue;
    const nb = N.filter(([di, dj]) => i + di >= 0 && j + dj >= 0 && i + di < C && j + dj < Rw && !inGlade(i + di, j + dj));
    const [di, dj] = nb[Math.floor(R.f() * nb.length)]; between(i, j, di, dj); links[i * Rw + j]++;
  }
  if (gs) {                                                                     // the Glade: an open square with a gate in each side
    open(gi * cell + t, (gi + gs) * cell, gj * cell + t, (gj + gs) * cell);
    const mi = gi + (gs >> 1), mj = gj + (gs >> 1);
    between(mi, gj, 0, -1); between(mi, gj + gs - 1, 0, 1); between(gi, mj, -1, 0); between(gi + gs - 1, mj, 1, 0);
  }
  return { W, D, mask: m };
}

// ------------------------------------------------------------------ footprint builder
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
function buildFootprint(P, { W, D, mask }) {
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
    const ov = (P.faceOverrides || {})[i] || {}, sd = ov.seed | 0;                  // per-face layout / seed tweaks
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
  const order = runs.map((_, i) => i).sort((a, b) => (a !== primary) - (b !== primary) || (runs[a].end ? 1 : 0) - (runs[b].end ? 1 : 0));
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
  const faces = runs.filter(r => !r.end).length, back = runs.find((r, i) => i !== primary && r.layout)?.layout;
  const faceList = runs.map((r, i) => r.end ? null : { i, dir: 'senw'[r.d], len: r.cells.length, layout: r.layout, primary: i === primary }).filter(Boolean);
  return { W, H: top, D, data: data.subarray(0, top * D * W), dirt: dirt.subarray(0, top * D * W), keys, backLayout: back, faces, faceList };
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

// ------------------------------------------------------------------ rain & dirt
// Rain lands on every top open to the sky, flows across each top towards its edges (gathering at low
// points, so it leaves at a few drip points) and runs down the face below: wandering, widening, landing
// on ledges that stick out (which drain again from their own edges) or dripping free where the wall
// steps back. Anything sheltered under an overhang stays dry. Returns water per block face / top.
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function simulateWater(W, H, D, solid, P, R) {
  const at = (x, y, z) => (y * D + z) * W + x;
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
  for (let y = H - 1; y >= 0; y--) {
    const cells = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (isTop(x, y, z)) cells.push([x, z]);
    if (!cells.length) continue;
    // distance to the nearest edge, roughened so water gathers at a few low points
    const dist = new Map(), q = [];
    for (const [x, z] of cells) if (DIRS4.some(([dx, dz]) => !solid(x + dx, y, z + dz))) { dist.set(x * D + z, 0); q.push([x, z]); }
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h], d = dist.get(x * D + z);
      for (const [dx, dz] of DIRS4) { const k = (x + dx) * D + z + dz; if (!dist.has(k) && isTop(x + dx, y, z + dz)) { dist.set(k, d + 1); q.push([x + dx, z + dz]); } }
    }
    const height = (x, z) => (dist.get(x * D + z) ?? 99) + focus * bump[x * D + z];
    cells.sort((a, b) => height(b[0], b[1]) - height(a[0], a[1]));
    for (const [x, z] of cells) {
      const w = through[at(x, y, z)]; if (!w) continue;
      let best = null, bh = height(x, z);
      for (const [dx, dz] of DIRS4) if (isTop(x + dx, y, z + dz) && height(x + dx, z + dz) < bh) { bh = height(x + dx, z + dz); best = [x + dx, z + dz]; }
      if (best) { through[at(best[0], y, best[1])] += w; continue; }
      const open = DIRS4.filter(([dx, dz]) => !solid(x + dx, y, z + dz));   // an edge low point: drip over
      for (const [dx, dz] of open) runDown(x, y, z, dx, dz, w / open.length);
    }
  }
  if (P.windRain > 0) {
    const a = P.windDir * Math.PI / 180, sx = Math.sin(a), sz = -Math.cos(a);          // towards where the wind comes from
    for (let y = 1; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!solid(x, y, z)) continue;
      for (const [dx, dz] of DIRS4) {
        const facing = dx * sx + dz * sz;
        if (facing <= 0.2 || solid(x + dx, y, z + dz)) continue;
        let open = true;                                                               // rain comes in at ~45° down
        for (let k = 1; k <= 12 && open; k++) if (solid(Math.round(x + dx + sx * k), y + k, Math.round(z + dz + sz * k))) open = false;
        if (open) flow[at(x, y, z)] += P.windRain * facing * 1.4;
      }
    }
  }
  return { flow, through };
}

// Shared final pass for straight walls and corners: water -> dirt, then a block for every solid cell.
// faceFn(x, y, z, open, wet) picks the block for a side-facing surface.
function paint(W, H, D, occ, P, faceFn) {
  const at = (x, y, z) => (y * D + z) * W + x;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && occ[at(x, y, z)] === 1;
  const water = simulateWater(W, H, D, solid, P, new Rng(P.seed * 53 + 11));
  const roof = makeTop(W, D, P, P.seed * 17 + 5), k = P.streakStrength;
  const { keys, id } = keyTable(), data = new Uint16Array(W * H * D), dirt = new Float32Array(W * H * D);
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = at(x, y, z); if (!occ[i]) continue;
    const o = { n: !solid(x, y, z - 1), s: !solid(x, y, z + 1), e: !solid(x + 1, y, z), w: !solid(x - 1, y, z), u: !solid(x, y + 1, z), d: !solid(x, y - 1, z) };
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

// ------------------------------------------------------------------ grids: trim, rotate, compose
function trimTop(W, H, D, data) {
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

// ------------------------------------------------------------------ ivy & vines
// A growth simulation: vines start from roots (ground, ledges, cracks), wander over the real surfaces of
// the structure, branch, wrap round corners and thin out. Growth is drawn to shade and damp (north
// faces, grooves, under ledges, low down and along the darker stained blocks) and dies back in dry sun.
const SOFT = k => k.includes('|') || k.endsWith('_leaves') || k === 'moss_carpet';
const FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };            // direction from the vine to its wall
const ORIENT = { s: 1.0, e: 0.68, w: 0.68, n: 0.55 };                      // wall to the south = a north-facing, shaded face
export function applyIvy(g, P) {
  const { W, H, D, data, keys } = g;
  const R = new Rng((P.seed * 131 + (P.ivyVariation || 1) * 977) >>> 0);
  const at = (x, y, z) => (y * D + z) * W + x;
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
  const kid = keyTable(keys).id;
  const soft = keys.map(SOFT);
  const solid = (x, y, z) => inb(x, y, z) && data[at(x, y, z)] !== 0 && !soft[data[at(x, y, z)]];
  const free = (x, y, z) => inb(x, y, z) && data[at(x, y, z)] === 0;

  // dampness of each block type: darker shade bands and grime / crack blocks read as wet
  const pal = P.palette, dampOf = new Map(), dry = P.ivyDryShade ?? 0, og = 1 + 2 * (P.ivyOvergrowth ?? 0);   // og: master multiplier
  (pal.bands || []).forEach((band, b) => band.forEach(k => { if (!dampOf.has(k)) dampOf.set(k, b / 8); }));
  for (const r of ['grime', 'crack', 'deep', 'rust2']) if (pal[r]) dampOf.set(pal[r], 0.95);
  const damp = (x, y, z) => {                                         // wet streaks from the rain simulation, plus dark blocks
    const v = data[at(x, y, z)]; if (!v) return 0;
    const b = dampOf.get(keys[v]) ?? 0.4;
    return Math.max(dry, g.dirt ? Math.min(1, 0.35 * b + 1.6 * g.dirt[at(x, y, z)]) : b);
  };
  const shadeK = P.ivyShade ?? 0.7;
  const cl = vnoise(W, D, Math.max(2, P.ivyCluster), R);
  const clump = (x, z) => cl[Math.max(0, Math.min(W - 1, x)) * D + Math.max(0, Math.min(D - 1, z))];
  // how welcoming a spot is for ivy growing on the wall in direction f
  const suit = (x, y, z, f) => {
    const [fx, fz] = FACE[f];
    let shelter = 0;
    for (let k = 1; k <= 6; k++) if (solid(x, y + k, z)) { shelter = 0.55 * (1 - (k - 1) / 6); break; }
    let sides = 0; for (const c in FACE) if (solid(x + FACE[c][0], y, z + FACE[c][1])) sides++;
    const groove = sides >= 2 ? 0.22 : 0;
    const low = 1 + 0.55 * Math.max(0, 1 - y / 22);
    const s = ORIENT[f] * (0.3 + 0.7 * damp(x + fx, y, z + fz)) * (1 + shelter + groove) * low * (0.55 + 0.9 * clump(x, z));
    return Math.pow(s, shadeK);                                            // shadeK = 0: grows anywhere; 1: strongly selective
  };
  const faceTo = (x, y, z) => { let f = ''; for (const c of 'ensw') if (solid(x + FACE[c][0], y, z + FACE[c][1])) f += c; return f; };

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
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!free(x, y, z)) continue;
    for (const f of 'ensw') {
      const [fx, fz] = FACE[f];
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
  for (const [k] of vines) {
    const x = k % W, z = Math.floor(k / W) % D, y = Math.floor(k / (W * D));
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (vines.has(at(x + dx, y + dy, z + dz))) n++;
    const holdsHanging = vines.has(at(x, y - 1, z)) && !faceTo(x, y - 1, z);
    if (n >= 8 && !holdsHanging && R.f() < P.ivyLeaves * 0.18 && faceTo(x, y, z)) leaves.set(k, R.f() < 0.22 ? leafB : leafA);
  }
  for (const [k, fs] of vines) if (!leaves.has(k)) data[k] = kid('vine|' + [...fs].sort().join(''));
  for (const [k, b] of leaves) if (!data[k]) data[k] = kid(b);
  for (const k of carpets) {
    const x = k % W, z = Math.floor(k / W) % D, y = Math.floor(k / (W * D));
    if (inb(x, y, z) && !data[k] && solid(x, y - 1, z) && R.f() < 0.7) data[k] = kid('moss_carpet');
  }
  return g;
}

// ------------------------------------------------------------------ defaults & presets
export const DEFAULT_PALETTE = {
  bands: [
    ['smooth_stone'], ['smooth_stone', 'andesite'], ['andesite', 'polished_andesite'], ['polished_andesite', 'stone'],
    ['stone', 'stone_bricks'], ['stone_bricks', 'cracked_stone_bricks', 'tuff'], ['cracked_stone_bricks', 'tuff'],
    ['tuff', 'cut_deepslate'], ['cut_deepslate'],
  ],
  grime: 'mossy_stone_bricks', crack: 'cracked_stone_bricks', deep: 'cut_deepslate', rust: 'cut_scoria', rust2: 'tuff',
  paint: 'red_terracotta', paint2: 'cut_scoria', porthole: 'cut_scoria', grilleFrame: 'cut_deepslate',
  hazardA: 'yellow_terracotta', hazardB: 'cut_deepslate', bars: 'iron_bars', interior: 'stone',
};
export const DEFAULTS = {
  name: 'my_wall', layout: 'stacked', seed: 1234, width: 20, heightMin: 70, heightMax: 74, thickness: 24,
  doubleSided: true, backLayout: 'auto', backSeedOffset: 9000, backFeatures: 'same', minCore: 4, endDetail: true, endRelief: 2,
  reliefMax: 4, tierMin: 8, tierMax: 14, splitChance: 0.6, minSlab: 5, slabTarget: 11, panelDetail: 0.55, skylineRough: 0.35, skylineSlope: 0, ruin: 0, seamMatch: false, seamPattern: 0, faceOverrides: {}, bayWidth: 20, bayRelief: 3, ledgeChance: 0.5, jointDepth: 1, grooveDepth: 2, formlineChance: 0.5,
  fins: true, finHeightMin: 15, finHeightMax: 22, finWidth: 2, finGapMin: 3, finGapMax: 5, plinthHeight: 2, plinthDepth: 2,
  towerCount: 2, towerGap: 2, towerGapDepth: 8, cubeWidth: 12, cubeHeight: 14, overhang: 5,
  passageHeight: 14, passageDepth: 14, beamHeight: 6, slabWidth: 16, slabHeight: 43,
  numberText: '', numberFont: 'Maze Block', numberHeight: 21, numberWidth: 1.0, numberPosX: 0.5, numberPosY: 0.5,
  numberWear: 0.16, numberStyle: 'painted', numberSide: 'front', paintVariation: 0.18,
  portholes: 0, portholeRadius: 2, grilles: 0, grilleMin: 3, grilleMax: 5, hazards: 0, hazardStripe: 2, hazardWear: 0.12,
  channels: 0, channelPairs: true, doorways: 0, doorWidth: 3, doorHeight: 5, doorDepth: 8, windows: 0,
  tieChance: 0.4, tieSpacing: 5,
  baseTone: 0.20, panelTone: 0.05, panelContrast: 0, largeNoise: 0.16, fineNoise: 0.07, speckle: 0.05, patchSize: 2.2,
  streakStrength: 1.05, streakLength: 32, streakCoverage: 0.35, windDir: 225, windRain: 0.35, soffitCreep: 0.6, sunDrying: 0.5, washing: 0.35, grimeHeight: 10, grimeStrength: 0.30, moss: 1.0,
  cracks: 2, crackRust: 0.4, rust: 1.0, chips: 0.5, pockmarks: 0.003,
  palette: DEFAULT_PALETTE,
  piece: 'straight', cornerPreview: true, mazeCols: 5, mazeRows: 5, mazeCorridor: 9, mazeWall: 8, mazeBraid: 0.15, glade: true, gladeSize: 1,
  ivy: true, ivyAmount: 0.35, ivyLength: 22, ivyWidth: 4, ivyClimb: 0.35, ivyClimbHeight: 14, ivyLeaves: 0.55, ivyMoss: 0.35, ivyCluster: 7, ivyVariation: 1, ivyLeafBlock: 'azalea_leaves', ivyBranching: 0.07, ivyWander: 0.45, ivyShade: 0.7, ivyOvergrowth: 0.25, ivyDryShade: 0.35,
  autoPalette: true, autoRoles: true, autoContrast: 1.0, autoSpread: 0.08, autoSatMax: 0.12, roleLock: {},
  autoBlocks: ['smooth_stone', 'andesite', 'polished_andesite', 'stone', 'stone_bricks', 'cracked_stone_bricks', 'tuff',
    'mossy_stone_bricks', 'cut_deepslate', 'cut_scoria', 'red_terracotta', 'yellow_terracotta'],
};
export const PRESETS = {
  'Classic wall': { layout: 'stacked', fins: true },
  'Classic sector 7': { layout: 'stacked', fins: true, numberText: '7', numberHeight: 21, numberWidth: 1.0, numberPosY: 0.45 },
  'Twin towers': { layout: 'towers', fins: false, channels: 1, grilles: 1 },
  'Cantilever block': { layout: 'cantilever', fins: false, portholes: 1, hazards: 1, reliefMax: 4 },
  'Vent wall': { layout: 'stacked', fins: false, grilles: 3, windows: 2, doorways: 1, channels: 1, reliefMax: 4, tierMin: 9, tierMax: 15 },
  'Beam passage (40 wide)': { layout: 'beam', width: 40, fins: false, portholes: 1, channels: 1 },
  'Sector slab 5': { layout: 'slab', fins: false, numberText: '5', numberHeight: 28, numberWidth: 1.0, doorways: 1 },
  'Glade door wall (60 wide)': { layout: 'towers', width: 60, towerCount: 3, towerGap: 6, towerGapDepth: 14, fins: true, channels: 2, heightMin: 72, heightMax: 76 },
  'Corner piece': { piece: 'corner', layout: 'stacked', width: 30, fins: true },
  'Overgrown corner': { piece: 'corner', layout: 'stacked', width: 30, fins: true, ivyAmount: 1, ivyClimb: 0.95, ivyLeaves: 0.9, ivyMoss: 0.7, ivyLength: 46, ivyClimbHeight: 30, ivyWidth: 7, ivyBranching: 0.1, moss: 1.8 },
  'Overgrown wall': { layout: 'stacked', fins: true, ivyAmount: 1, ivyClimb: 0.95, ivyLeaves: 0.9, ivyMoss: 0.7, ivyLength: 46, ivyClimbHeight: 30, ivyWidth: 7, ivyBranching: 0.1, moss: 1.8, streakStrength: 1.3 },
  'T-junction': { piece: 'tee', layout: 'stacked', width: 44, fins: true },
  'Crossroads': { piece: 'cross', layout: 'stacked', width: 56, fins: true },
  'Maze with Glade': { piece: 'maze', layout: 'stacked', mazeCols: 5, mazeRows: 5, mazeCorridor: 9, mazeWall: 8, glade: true, fins: false, ivyAmount: 0.45 },
  'Big maze (9×9)': { piece: 'maze', layout: 'stacked', mazeCols: 9, mazeRows: 9, mazeCorridor: 8, mazeWall: 6, glade: true, gladeSize: 3, fins: false, heightMin: 40, heightMax: 48, ivyAmount: 0.4 },
  'Ruined low wall': { layout: 'stacked', heightMin: 30, heightMax: 42, ruin: 0.6, skylineRough: 0.6, cracks: 7, chips: 0.9, pockmarks: 0.02, moss: 2, streakStrength: 1.4, fins: false },
};
