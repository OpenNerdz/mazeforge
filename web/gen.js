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
      let h = Math.min(R.int(hmin, hmax), ytop - y);
      if (ytop - (y + h) < 5) h = ytop - y;
      let n = 1;
      if (o.split !== false && x1 - x0 >= 2 * P.minSlab + 1) { if (R.f() < P.splitChance) n++; if (R.f() < P.splitChance * 0.45) n++; }
      const ws = splitWidth(x1 - x0, n, R, P.minSlab);
      let xx = x0; const fs = [];
      for (const w of ws) {
        let f = fpick();
        if (prevF.get(xx + (w >> 1)) === f) f = Math.max(0, Math.min(P.reliefMax, f + R.pick([-2, 2])));
        fs.push(f);
        this.block(xx, xx + w, y, y + h, f, { ledge: R.f() < P.ledgeChance });
        xx += w + 1;
      }
      xx = x0; const nf = new Map();
      ws.forEach((w, i) => { for (let k = 0; k < w; k++) nf.set(xx + k, fs[i]); xx += w; if (i < ws.length - 1) { this.groove(xx, y, y + h, Math.max(fs[i], fs[i + 1]) + P.grooveDepth); xx++; } });
      prevF = nf; y += h;
    }
  }
  // final tier where each slab has its own top (skyline)
  crown(x0, x1, y, o = {}) {
    const R = this.R, P = this.P;
    let n = 1;
    if (x1 - x0 >= 2 * P.minSlab + 1) { if (R.f() < P.splitChance) n++; if (R.f() < P.splitChance * 0.45) n++; }
    const ws = splitWidth(x1 - x0, n, R, P.minSlab);
    let xx = x0; const tops = [], fs = [];
    for (const w of ws) {
      const top = R.int(o.topMin ?? P.heightMin, o.topMax ?? P.heightMax);
      const f = this.fchoice(); fs.push(f); tops.push(top);
      this.block(xx, xx + w, y, top, f, { ledge: R.f() < P.ledgeChance * 0.7 });
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
    const hx0 = host ? host.x0 : 0, hx1 = host ? host.x1 : this.W, hy0 = host ? host.y0 + 1 : 10, hy1 = host ? host.y1 - 1 : this.H - 10;
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
    s.stack(0, W, y, Math.max(y, P.heightMin - 12));
    s.crown(0, W, Math.max(y, P.heightMin - 12));
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
    s.stack(0, W, y, Math.max(y, P.heightMin - 8), { fpick: () => R.int(2, Math.max(2, P.reliefMax)) });
    s.crown(0, W, Math.max(y, P.heightMin - 8));
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
    s.stack(sx0, sx0 + sw, hb + sh, Math.max(hb + sh, P.heightMin - 8));
    s.crown(sx0, sx0 + sw, Math.max(hb + sh, P.heightMin - 8));
  },
  flat(s, front) {
    for (let x = 0; x < s.W; x++) for (let y = 0; y < s.H; y++) if (front.getF(s.W - 1 - x, y) < NONE) s.F[s.i(x, y)] = 0;
    s.monos.push({ x0: 0, x1: s.W, y0: 0, y1: s.H, f: 0, tone: 0, ties: false });
    for (let k = 0; k < s.F.length; k++) if (s.F[k] < NONE) s.mono[k] = 0;
  },
};
export const LAYOUT_NAMES = { stacked: 'Stacked tiers', towers: 'Twin towers', cantilever: 'Cantilever / overhang', beam: 'Beam & passage', slab: 'Sector slab' };

function buildSkin(W, H, seed, P, layout, feat, frontForFlat) {
  const s = new Skin(W, H, seed, P);
  if (layout === 'flat') LAYOUTS.flat(s, frontForFlat);
  else { LAYOUTS[layout](s); s.plinth(); s.features(feat); }
  s.weather();
  return s;
}

// ------------------------------------------------------------------ whole structure
export function generate(P) {
  const W = P.width, H = P.heightMax + 2, D = P.thickness;
  const feat = { doorways: P.doorways, hazards: P.hazards, portholes: P.portholes, grilles: P.grilles, windows: P.windows, channels: P.channels, lettering: (P.numberSide !== 'back') ? P.numberText : '' };
  const front = buildSkin(W, H, P.seed, P, P.layout, feat);
  let back;
  if (!P.doubleSided) back = buildSkin(W, H, P.seed + 1, P, 'flat', {}, front);
  else {
    const br = new Rng(P.seed * 7919 + P.backSeedOffset + [...P.layout].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const pool = ['stacked', 'towers', 'cantilever', ...(W >= 30 ? ['beam'] : [])];
    const bl = P.backLayout === 'auto' ? br.pick(pool) : P.backLayout === 'same' ? P.layout : P.backLayout;
    const k = P.backFeatures === 'none' ? 0 : P.backFeatures === 'fewer' ? 0.5 : 1;
    const q = v => Math.round(v * k);
    const bfeat = { doorways: q(P.doorways), hazards: q(P.hazards), portholes: q(P.portholes), grilles: q(P.grilles), windows: q(P.windows), channels: q(P.channels), lettering: (P.numberSide !== 'front') ? P.numberText : '' };
    back = buildSkin(W, H, P.seed + P.backSeedOffset, P, bl, bfeat);
    back.layoutName = bl;
  }
  return combine(front, back, W, H, D, P);
}

function endSkin(front, W, H, D, P, side) {
  const EP = { ...P, reliefMax: Math.max(0, P.endRelief ?? 2), tieChance: P.tieChance * 0.7, splitChance: 0.55,
    minSlab: Math.max(3, Math.floor(D / 4)), ledgeChance: 0.2, jointDepth: Math.min(1, P.jointDepth), cracks: Math.ceil(P.cracks / 2) };
  const s = new Skin(D, H, (P.seed * 31 + 7 + side * 1013) >>> 0, EP);
  // tier breaks follow the front's slabs at this end, so horizontal joints wrap around the corner
  const fx = side ? W - 1 : 0, breaks = [0];
  for (let y = 1; y < H; y++) {
    const a = front.mono[fx * H + y], b = front.mono[fx * H + y - 1];
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
  const ends = [endSkin(front, W, H, D, P, 0), endSkin(front, W, H, D, P, 1)];
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
  const pal = P.palette;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const i = x * H + y; if (!has[i]) continue;
    for (let z = zb[i]; z <= zf[i]; z++) {
      if (!solid(x, y, z)) continue;
      const oF = !solid(x, y, z + 1), oB = !solid(x, y, z - 1), oL = !solid(x - 1, y, z), oR = !solid(x + 1, y, z);
      let b;
      if (!(oF || oB || oL || oR) && solid(x, y + 1, z) && solid(x, y - 1, z)) b = pal.interior;
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
  reliefMax: 4, tierMin: 8, tierMax: 14, splitChance: 0.6, minSlab: 5, ledgeChance: 0.5, jointDepth: 1, grooveDepth: 2, formlineChance: 0.5,
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
  'Ruined low wall': { layout: 'stacked', heightMin: 30, heightMax: 42, cracks: 7, chips: 0.9, pockmarks: 0.02, moss: 2, streakStrength: 1.4, fins: false },
};
