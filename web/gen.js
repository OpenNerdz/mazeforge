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
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const px = height * ss * 1.45;
    ctx.font = `900 ${px}px "${fam}", sans-serif`;
    const tw = Math.ceil(ctx.measureText(text).width) + ss * 4;
    cv.width = tw; cv.height = Math.ceil(px * 1.5);
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
    let ranges = [[x0, x1]];
    if (this.segments) for (const cut of this.segments) ranges = ranges.flatMap(([a, b]) => cut > a && cut < b ? [[a, cut], [cut, b]] : [[a, b]]);
    const bays = [], gaps = [];
    for (const [a, b] of ranges) {
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
  plinth() {
    if (this.P.plinthHeight <= 0) return;
    for (let x = 0; x < this.W; x++) for (let y = 0; y < this.P.plinthHeight; y++) {
      const k = this.i(x, y); if (this.F[k] < NONE) this.F[k] = Math.min(this.F[k], this.P.plinthDepth);
    }
  }
  // ---------------------------------------------------------------- features
  free(x0, x1, y0, y1) {
    if (this.segments) for (const b of this.segments) if (x0 < b && x1 > b) return false;
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
    let hx0 = host ? host.x0 : 0, hx1 = host ? host.x1 : this.W;
    const hy0 = host ? host.y0 + 1 : 10, hy1 = host ? host.y1 - 1 : this.H - 10;
    if (this.segments) {                                   // keep lettering on one face of a corner
      const cuts = [0, ...this.segments, this.W]; let best = [hx0, hx1], bestW = -1;
      for (let i = 0; i < cuts.length - 1; i++) { const a = Math.max(hx0, cuts[i]), b = Math.min(hx1, cuts[i + 1]); if (b - a > bestW) { bestW = b - a; best = [a, b]; } }
      [hx0, hx1] = best;
    }
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
    for (let i = 0; i < W * H; i++) {
      const m = this.mono[i];
      if (m >= 0) V[i] += this.monos[m].tone;
      V[i] += P.largeNoise * (n1[i] - 0.5) + P.fineNoise * (n2[i] - 0.5) + P.speckle * (R.f() - 0.5);
      if (this.formline[i]) V[i] += 0.05;
      V[i] += this.dark[i];
      if (F[i] < NONE) V[i] += 0.03 * Math.max(0, Math.min(12, F[i] - 5));
      const y = i % H;
      if (P.grimeHeight > 0) V[i] += P.grimeStrength * Math.max(0, 1 - y / P.grimeHeight) * (0.5 + n4[i]);
      if (this.crack[i]) V[i] += 0.30;
    }
    const sn = vnoise(W, 1, 1.6, R);
    for (let x = 0; x < W; x++) {
      const strength = 0.06 + P.streakStrength * Math.pow(Math.max(0, Math.min(1, sn[x] * 1.5 - (0.45 + (0.5 - P.streakCoverage) * 0.6))), 1.5);
      const length = R.uniform(P.streakLength * 0.45, P.streakLength * 1.55);
      let run = 0;
      for (let y = H - 1; y >= 0; y--) {
        const i = this.i(x, y); if (F[i] === NONE) continue;
        const above = y + 1 < H ? F[i + 1] : NONE;
        if (above === NONE || above > F[i]) run = Math.max(run, strength * R.uniform(0.6, 1.2) * (above === NONE ? 1 : 0.8));
        else if (above < F[i]) run *= 0.35;
        V[i] += run; run *= Math.exp(-1 / length);
      }
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
  }
  faceBlock(x, y, face) {
    const P = this.P, pal = P.palette, R = this.R, i = this.i(x, y), V = this.V;
    if (face && this.special.has(i)) return this.special.get(i);
    const v = V[i] + (face ? 0 : 0.05);
    let band = BANDS.length - 1;
    for (let b = 0; b < BANDS.length; b++) if (v < BANDS[b]) { band = b; break; }
    const opts = pal.bands[band].length ? pal.bands[band] : nearestBand(pal.bands, band);
    let b = opts[Math.floor(((this.pick[i] + 0.12 * R.f()) % 1) * opts.length) % opts.length];
    const ru = this.rust[i], mossK = P.moss;
    if (face && ru > 0.7) b = pal.rust;
    else if (face && ru > 0.4) b = R.f() < 0.4 ? pal.rust : (pal.rust2 || pal.rust);
    else if (face && ru > 0.15 && R.f() < 0.6) b = pal.crack;
    else if (y < P.grimeHeight * 0.7 && R.f() < 0.5 * mossK * (1 - y / (P.grimeHeight * 0.7))) b = pal.grime;
    else if (V[i] > 0.5 && y < 30 && R.f() < 0.15 * mossK) b = pal.grime;
    else if (this.mono[i] === -2 && R.f() < 0.25 * mossK) b = pal.grime;
    if (this.crack[i] && face) b = R.f() < 0.8 ? pal.crack : pal.deep;
    return b;
  }
}
export const BANDS = [0.10, 0.18, 0.26, 0.34, 0.44, 0.54, 0.66, 0.80, 99];
function nearestBand(bands, i) {
  for (let d = 1; d < bands.length; d++) {
    if (bands[i - d] && bands[i - d].length) return bands[i - d];
    if (bands[i + d] && bands[i + d].length) return bands[i + d];
  }
  return ['stone'];
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
    block(x, z, edgeDist) {
      const i = x * D + z;
      const v = V[i] + (edgeDist <= 1 ? 0.06 : 0);                    // dirt collects along the edges
      let band = BANDS.length - 1;
      for (let b = 0; b < BANDS.length; b++) if (v < BANDS[b]) { band = b; break; }
      const opts = pal.bands[band].length ? pal.bands[band] : nearestBand(pal.bands, band);
      let b = opts[Math.floor(((pick[i] + 0.12 * R.f()) % 1) * opts.length) % opts.length];
      const puddle = Math.max(0, wet[i] - 0.58) / 0.42;
      if (R.f() < (0.05 + 0.5 * puddle) * P.moss) b = pal.grime;
      else if (R.f() < 0.015 + 0.02 * P.chips) b = pal.crack;
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
    s._tallSpan = spans[tallest];
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
  flat(s, front) {
    for (let x = 0; x < s.W; x++) for (let y = 0; y < s.H; y++) if (front.getF(s.W - 1 - x, y) < NONE) s.F[s.i(x, y)] = 0;
    s.monos.push({ x0: 0, x1: s.W, y0: 0, y1: s.H, f: 0, tone: 0, ties: false });
    for (let k = 0; k < s.F.length; k++) if (s.F[k] < NONE) s.mono[k] = 0;
  },
};
export const LAYOUT_NAMES = { stacked: 'Stacked tiers', towers: 'Twin towers', cantilever: 'Cantilever / overhang', beam: 'Beam & passage', slab: 'Sector slab' };

function buildSkin(W, H, seed, P, layout, feat, frontForFlat, segments) {
  const s = new Skin(W, H, seed, P);
  if (segments) s.segments = segments;
  if (layout === 'flat') LAYOUTS.flat(s, frontForFlat);
  else { LAYOUTS[layout](s); s.plinth(); s.features(feat); }
  s.weather();
  return s;
}

// ------------------------------------------------------------------ whole structure
export function generate(P) {
  const g = P.piece === 'corner' ? generateCorner(P) : generateStraight(P);
  if (P.ivy) applyIvy(g, P);
  return g;
}
function featBundle(P, side, k = 1) {
  const q = v => Math.round(v * k);
  const lettering = side === 'front' ? (P.numberSide !== 'back' ? P.numberText : '') : (P.numberSide !== 'front' ? P.numberText : '');
  return { doorways: q(P.doorways), hazards: q(P.hazards), portholes: q(P.portholes), grilles: q(P.grilles), windows: q(P.windows), channels: q(P.channels), lettering };
}
function backLayoutFor(P, W) {
  const br = new Rng(P.seed * 7919 + P.backSeedOffset + [...P.layout].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const pool = ['stacked', 'towers', 'cantilever', ...(W >= 30 ? ['beam'] : [])];
  return P.backLayout === 'auto' ? br.pick(pool) : P.backLayout === 'same' ? P.layout : P.backLayout;
}
const backK = P => P.backFeatures === 'none' ? 0 : P.backFeatures === 'fewer' ? 0.5 : 1;

function generateStraight(P) {
  const W = P.width, H = P.heightMax + 2, D = P.thickness;
  const feat = featBundle(P, 'front');
  const front = buildSkin(W, H, P.seed, P, P.layout, feat);
  let back;
  if (!P.doubleSided) back = buildSkin(W, H, P.seed + 1, P, 'flat', {}, front);
  else {
    const bl = backLayoutFor(P, W);
    back = buildSkin(W, H, P.seed + P.backSeedOffset, P, bl, featBundle(P, 'back', backK(P)));
    back.layoutName = bl;
  }
  return combine(front, back, W, H, D, P);
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

function combine(front, back, W, H, D, P) {
  const mid = D >> 1, core = Math.max(2, P.minCore);
  const has = new Uint8Array(W * H), zf = new Int16Array(W * H), zb = new Int16Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const i = x * H + y, ff = front.F[i], fb = back.F[(W - 1 - x) * H + y];
    has[i] = (ff < NONE || fb < NONE) ? 1 : 0;
    let a = ff < NONE ? D - 1 - ff : mid, b = fb < NONE ? fb : mid;
    b = Math.max(0, Math.min(b, a - (core - 1)));
    zf[i] = Math.max(a, b); zb[i] = b;
  }
  // each end face gets its own designed skin (width = thickness), with joints aligned to the front's tiers
  const ends = [endSkin(front, 0, H, D, P, 0), endSkin(front, W - 1, H, D, P, 1)];
  const relief = P.endDetail ? Math.max(0, P.endRelief ?? 2) : 0;
  const eF = (side, z, y) => {
    if (!relief) return 0;
    const v = ends[side].F[(side ? D - 1 - z : z) * H + y];
    return v >= NONE ? 0 : Math.min(v, relief);
  };
  const solid = (x, y, z) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D && has[x * H + y]
    && z >= zb[x * H + y] && z <= zf[x * H + y] && x >= eF(0, z, y) && x <= W - 1 - eF(1, z, y);
  const keys = ['air'], idx = new Map([['air', 0]]);
  const kid = b => { let v = idx.get(b); if (v === undefined) { v = keys.length; keys.push(b); idx.set(b, v); } return v; };
  const data = new Uint16Array(W * H * D);
  const at = (x, y, z) => (y * D + z) * W + x;   // schematic order: x fastest, then z, then y
  const roof = makeTop(W, D, P, P.seed * 17 + 5);
  const pal = P.palette;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const i = x * H + y; if (!has[i]) continue;
    for (let z = zb[i]; z <= zf[i]; z++) {
      if (!solid(x, y, z)) continue;
      const oF = !solid(x, y, z + 1), oB = !solid(x, y, z - 1), oL = !solid(x - 1, y, z), oR = !solid(x + 1, y, z);
      let b;
      const oU = !solid(x, y + 1, z);
      if (!(oF || oB || oL || oR) && !oU && solid(x, y - 1, z)) b = pal.interior;
      else if (oU && !(oF || oB || oL || oR)) {                   // top surface
        let e = 9; for (let d = 1; d <= 2 && e === 9; d++) if (!solid(x, y, z + d) || !solid(x, y, z - d) || !solid(x + d, y, z) || !solid(x - d, y, z)) e = d;
        b = roof.block(x, z, e);
      }
      else if (!oF && !oB && (oL || oR)) {                     // end face
        const side = oL && (!oR || x < W / 2) ? 0 : 1;
        b = ends[side].faceBlock(side ? D - 1 - z : z, y, true);
      }
      else if (z >= mid) b = front.faceBlock(x, y, z === zf[i]);
      else b = back.faceBlock(W - 1 - x, y, z === zb[i]);
      data[at(x, y, z)] = kid(b);
    }
  }
  for (const [side, sgn] of [[front, 1], [back, -1]]) {
    const place = (x, y, depth, b) => {
      const gx = sgn > 0 ? x : W - 1 - x, gz = sgn > 0 ? D - 1 - depth : depth;
      if (gx >= 0 && gx < W && y >= 0 && y < H && gz >= 0 && gz < D && data[at(gx, y, gz)] === 0) data[at(gx, y, gz)] = kid(b);
    };
    for (const { cx, cy, r, f } of side.bars) for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++)
      if (Math.hypot(x - cx, y - cy) <= r - 0.4 && (x - cx) % 2) place(x, y, f + 1, pal.bars + '|v');
    for (const { x, y, z } of side.louvre) place(x, y, z, pal.bars + '|h');
  }
  // trim empty rows at the top
  let top = 0;
  for (let y = 0; y < H; y++) for (let z = 0; z < D && top <= y; z++) for (let x = 0; x < W; x++) if (data[at(x, y, z)]) { top = y + 1; break; }
  return { W, H: top, D, data: data.subarray(0, top * D * W), keys, backLayout: back.layoutName };
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
  const out = new Uint16Array(W2 * H * D2);
  const keys = g.keys.map(k => turnKey(k, q));
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = data[(y * D + z) * W + x]; if (!v) continue;
    let nx = x, nz = z;
    if (q === 1) { nx = D - 1 - z; nz = x; }
    else if (q === 2) { nx = W - 1 - x; nz = D - 1 - z; }
    else { nx = z; nz = W - 1 - x; }
    out[(y * D2 + nz) * W2 + nx] = v;
  }
  return { ...g, W: W2, D: D2, data: out, keys };
}
// pieces: [{ g, x, z }] -> one grid covering all of them
export function composeGrids(pieces) {
  const x0 = Math.min(...pieces.map(p => p.x)), z0 = Math.min(...pieces.map(p => p.z));
  const W = Math.max(...pieces.map(p => p.x + p.g.W)) - x0, D = Math.max(...pieces.map(p => p.z + p.g.D)) - z0, H = Math.max(...pieces.map(p => p.g.H));
  const data = new Uint16Array(W * H * D), keys = ['air'], idx = new Map([['air', 0]]);
  for (const { g, x, z } of pieces) {
    const map = g.keys.map(k => { let v = idx.get(k); if (v === undefined) { v = keys.length; keys.push(k); idx.set(k, v); } return v; });
    for (let y = 0; y < g.H; y++) for (let zz = 0; zz < g.D; zz++) for (let xx = 0; xx < g.W; xx++) {
      const v = g.data[(y * g.D + zz) * g.W + xx]; if (v) data[(y * D + zz + z - z0) * W + xx + x - x0] = map[v];
    }
  }
  return { W, H, D, data, keys };
}

// ------------------------------------------------------------------ corner (L-shaped) piece
// Built with the outer corner at the origin (outer faces north + west), then turned 180° so that,
// like the straight walls, the outer face points south and continues round onto the east face.
function generateCorner(P) {
  const D = P.thickness, L = Math.max(P.width, D + 6), H = P.heightMax + 2, n = L - D, mid = D >> 1;
  const core = Math.max(2, P.minCore);
  const outer = buildSkin(2 * L, H, P.seed, P, P.layout, featBundle(P, 'front'), null, [L]);
  const innerLayout = P.doubleSided ? backLayoutFor(P, 2 * n) : 'stacked';
  const IP = P.doubleSided ? P : { ...P, reliefMax: 0, splitChance: 0.2, ledgeChance: 0 };
  const inner = buildSkin(2 * n, H, P.seed + P.backSeedOffset, IP, innerLayout, P.doubleSided ? featBundle(P, 'back', backK(P) * 0.6) : featBundle(P, 'back', 0), null, [n]);
  const endA = endSkin(outer, 0, H, D, P, 0), endB = endSkin(outer, 2 * L - 1, H, D, P, 1);
  const relief = P.endDetail ? Math.max(0, P.endRelief ?? 2) : 0;
  const clampF = v => v >= NONE ? null : Math.min(v, D - core - 1);
  const oF = (u, y) => clampF(outer.F[u * H + y]);
  const iF = (u, y) => clampF(inner.F[u * H + y]);
  const eFa = (e, y) => relief ? Math.min(relief, endA.F[e * H + y] >= NONE ? 0 : endA.F[e * H + y]) : 0;
  const eFb = (e, y) => relief ? Math.min(relief, endB.F[e * H + y] >= NONE ? 0 : endB.F[e * H + y]) : 0;
  const occ = new Uint8Array(L * H * L), at = (x, y, z) => (y * L + z) * L + x;
  for (let y = 0; y < H; y++) for (let z = 0; z < L; z++) for (let x = 0; x < L; x++) {
    const armA = z < D, armB = x < D;
    if (!armA && !armB) continue;
    const on = armA ? oF(L - 1 - x, y) : null, ow = armB ? oF(L + z, y) : null;   // outer depth (north / west)
    if (on === null && ow === null) continue;
    let ok = true;
    if (armA) ok &&= on === null ? z >= mid : z >= on;
    if (armB) ok &&= ow === null ? x >= mid : x >= ow;
    if (armA && !armB) {                          // arm A, inner face looks south
      const i = iF(n + x - D, y), lim = i === null ? D - 1 - mid : D - 1 - Math.min(i, D - core - (on ?? mid));
      ok &&= z <= lim; ok &&= x <= L - 1 - eFa(D - 1 - z, y);
    }
    if (armB && !armA) {                          // arm B, inner face looks east
      const i = iF(L - 1 - z, y), lim = i === null ? D - 1 - mid : D - 1 - Math.min(i, D - core - (ow ?? mid));
      ok &&= x <= lim; ok &&= z <= L - 1 - eFb(x, y);
    }
    if (ok) occ[at(x, y, z)] = 1;
  }
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < L && y < H && z < L && occ[at(x, y, z)] === 1;
  const keys = ['air'], idx = new Map([['air', 0]]);
  const kid = b => { let v = idx.get(b); if (v === undefined) { v = keys.length; keys.push(b); idx.set(b, v); } return v; };
  const data = new Uint16Array(L * H * L), pal = P.palette, roof = makeTop(L, L, P, P.seed * 17 + 5);
  for (let y = 0; y < H; y++) for (let z = 0; z < L; z++) for (let x = 0; x < L; x++) {
    if (!solid(x, y, z)) continue;
    const nN = !solid(x, y, z - 1), nW = !solid(x - 1, y, z), nS = !solid(x, y, z + 1), nE = !solid(x + 1, y, z);
    let b;
    const nU = !solid(x, y + 1, z);
    if (!(nN || nW || nS || nE || nU || !solid(x, y - 1, z))) b = pal.interior;
    else if (nU && !(nN || nW || nS || nE)) {
      let e = 9; for (let d = 1; d <= 2 && e === 9; d++) if (!solid(x, y, z + d) || !solid(x, y, z - d) || !solid(x + d, y, z) || !solid(x - d, y, z)) e = d;
      b = roof.block(x, z, e);
    }
    else if (nN && z < D) b = outer.faceBlock(L - 1 - x, y, true);
    else if (nW && x < D) b = outer.faceBlock(L + z, y, true);
    else if (nS && z < D && x >= D) b = inner.faceBlock(n + x - D, y, true);
    else if (nE && x < D && z >= D) b = inner.faceBlock(L - 1 - z, y, true);
    else if (nE && z < D) b = endA.faceBlock(D - 1 - z, y, true);
    else if (nS && x < D) b = endB.faceBlock(x, y, true);
    else b = z < D ? outer.faceBlock(L - 1 - x, y, false) : outer.faceBlock(L + z, y, false);
    data[at(x, y, z)] = kid(b);
  }
  // iron bars in port-holes and vent louvres, mapped from skin space to the world
  const place = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < L && y < H && z < L && !data[at(x, y, z)]) data[at(x, y, z)] = kid(b); };
  const mapOuter = (u, y, d, b) => u < L ? place(L - 1 - u, y, d, b) : place(d, y, u - L, b);
  const mapInner = (u, y, d, b) => u < n ? place(D - 1 - d, y, L - 1 - u, b) : place(D + (u - n), y, D - 1 - d, b);
  for (const [sk, map, W2, cut] of [[outer, mapOuter, 2 * L, L], [inner, mapInner, 2 * n, n]]) {
    for (const { cx, cy, r, f } of sk.bars) for (let u = cx - r; u <= cx + r; u++) for (let y = cy - r; y <= cy + r; y++)
      if (u >= 0 && u < W2 && Math.hypot(u - cx, y - cy) <= r - 0.4 && (u - cx) % 2) map(u, y, f + 1, pal.bars + '|v');
    for (const { x: u, y, z: d } of sk.louvre) {
      const alongX = sk === outer ? u < cut : u >= cut;
      map(u, y, d, pal.bars + (alongX ? '|h' : '|z'));
    }
  }
  const top = trimTop(L, H, L, data);
  const g = { W: L, H: top, D: L, data: data.subarray(0, top * L * L), keys, backLayout: innerLayout, corner: true, arm: L };
  return rotateGrid(g, 2);
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
  const idx = new Map(keys.map((k, i) => [k, i]));
  const kid = b => { let v = idx.get(b); if (v === undefined) { v = keys.length; keys.push(b); idx.set(b, v); } return v; };
  const soft = keys.map(SOFT);
  const solid = (x, y, z) => inb(x, y, z) && data[at(x, y, z)] !== 0 && !soft[data[at(x, y, z)]];
  const free = (x, y, z) => inb(x, y, z) && data[at(x, y, z)] === 0;

  // dampness of each block type: darker shade bands and grime / crack blocks read as wet
  const pal = P.palette, dampOf = new Map();
  (pal.bands || []).forEach((band, b) => band.forEach(k => { if (!dampOf.has(k)) dampOf.set(k, b / 8); }));
  for (const r of ['grime', 'crack', 'deep', 'rust2']) if (pal[r]) dampOf.set(pal[r], 0.95);
  const damp = (x, y, z) => { const v = data[at(x, y, z)]; return v ? (dampOf.get(keys[v]) ?? 0.4) : 0; };
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
  sow(drapes, P.ivyAmount * 0.06, -1, P.ivyLength, P.ivyWidth);
  sow(roots, P.ivyClimb * 0.10, 1, P.ivyClimbHeight, P.ivyWidth + 1);
  sow(cracks, P.ivyAmount * 0.008, R.f() < 0.5 ? 1 : -1, P.ivyLength * 0.45, 1);

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
  g.ivyCount = vines.size;
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
  reliefMax: 4, tierMin: 8, tierMax: 14, splitChance: 0.6, minSlab: 5, slabTarget: 11, panelDetail: 0.55, bayWidth: 20, bayRelief: 3, ledgeChance: 0.5, jointDepth: 1, grooveDepth: 2, formlineChance: 0.5,
  fins: true, finHeightMin: 15, finHeightMax: 22, finWidth: 2, finGapMin: 3, finGapMax: 5, plinthHeight: 2, plinthDepth: 2,
  towerCount: 2, towerGap: 2, towerGapDepth: 8, cubeWidth: 12, cubeHeight: 14, overhang: 5,
  passageHeight: 14, passageDepth: 14, beamHeight: 6, slabWidth: 16, slabHeight: 43,
  numberText: '', numberFont: 'Maze Block', numberHeight: 21, numberWidth: 1.0, numberPosX: 0.5, numberPosY: 0.5,
  numberWear: 0.16, numberStyle: 'painted', numberSide: 'front', paintVariation: 0.18,
  portholes: 0, portholeRadius: 2, grilles: 0, grilleMin: 3, grilleMax: 5, hazards: 0, hazardStripe: 2, hazardWear: 0.12,
  channels: 0, channelPairs: true, doorways: 0, doorWidth: 3, doorHeight: 5, doorDepth: 8, windows: 0,
  tieChance: 0.4, tieSpacing: 5,
  baseTone: 0.20, panelTone: 0.05, largeNoise: 0.16, fineNoise: 0.07, speckle: 0.05, patchSize: 2.2,
  streakStrength: 1.05, streakLength: 32, streakCoverage: 0.5, grimeHeight: 10, grimeStrength: 0.30, moss: 1.0,
  cracks: 2, crackRust: 0.4, rust: 1.0, chips: 0.5, pockmarks: 0.003,
  palette: DEFAULT_PALETTE,
  piece: 'straight', cornerPreview: true,
  ivy: true, ivyAmount: 0.35, ivyLength: 22, ivyWidth: 4, ivyClimb: 0.35, ivyClimbHeight: 14, ivyLeaves: 0.55, ivyMoss: 0.35, ivyCluster: 7, ivyVariation: 1, ivyLeafBlock: 'azalea_leaves', ivyBranching: 0.07, ivyWander: 0.45, ivyShade: 0.7,
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
  'Ruined low wall': { layout: 'stacked', heightMin: 30, heightMax: 42, cracks: 7, chips: 0.9, pockmarks: 0.02, moss: 2, streakStrength: 1.4, fins: false },
};
