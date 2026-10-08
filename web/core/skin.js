// One designed face of a wall: a W×H grid of relief depths (F), slab ids and weathering fields,
// built up by the layouts and features, then turned into blocks by faceBlock().
import { Rng, roll } from './random.js';
import { vnoise, streakNoise } from './noise.js';
import { textMask } from './lettering.js';

export const NONE = 999;                                                     // no wall at this cell

export function splitWidth(total, n, R, minw) {
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
    const bays = [], gaps = [], wid = x1 - x0;
    if (wid < bw * 1.4) bays.push([x0, x1]);
    else {
      const n = Math.max(2, Math.round(wid / (bw * R.uniform(0.75, 1.25))));
      const ws = splitWidth(wid, n, R, Math.max(P.minSlab + 2, Math.round(bw * 0.45)));
      let xx = x0;
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
      const top = R.int(P.heightMin, P.heightMax);
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
const BANDS = [0.10, 0.18, 0.26, 0.34, 0.44, 0.54, 0.66, 0.80, 99];
// pick a block for darkness v from the palette's shade bands; pick = patch noise so neighbours match
export function shadeBlock(pal, v, pick, jitter) {
  let band = BANDS.length - 1;
  for (let b = 0; b < BANDS.length; b++) if (v < BANDS[b]) { band = b; break; }
  let opts = pal.bands[band];
  for (let d = 1; !opts.length && d < BANDS.length; d++) opts = pal.bands[band - d]?.length ? pal.bands[band - d] : pal.bands[band + d] || [];
  if (!opts.length) opts = ['stone'];
  return opts[Math.floor(((pick + 0.12 * jitter) % 1) * opts.length) % opts.length];
}
