// Auto palette: sort the chosen blocks by their real texture colour and assign
// shade bands + detail roles automatically.

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
// CIE L* (perceived lightness, 0–100), hue (deg), saturation (0–1)
export function analyze(hex) {
  const [r, g, b] = hexRgb(hex || '#808080');
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const L = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  let h = 0;
  if (d > 0) {
    const R = r / 255, G = g / 255, B = b / 255;
    h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { L, h, s };
}
const hueIn = (h, a, b) => a <= b ? h >= a && h <= b : h >= a || h <= b;

const ROLE_KEYS = ['grime', 'crack', 'deep', 'rust', 'rust2', 'paint', 'paint2', 'porthole', 'grilleFrame', 'hazardA', 'hazardB', 'interior'];

// returns { palette, sorted: [{k, L, h, s, r}], auto: Set(role) }
export function effectivePalette(P, library) {
  const base = P.palette;
  if (!P.autoPalette) return { palette: base, sorted: [], auto: new Set() };
  const keys = [...new Set((P.autoBlocks || []).filter(k => library[k]))];
  if (!keys.length) return { palette: base, sorted: [], auto: new Set() };
  const sorted = keys.map(k => ({ k, ...analyze(library[k].color) })).sort((a, b) => b.L - a.L);
  const Lmax = sorted[0].L, Lmin = sorted[sorted.length - 1].L, span = Math.max(1e-6, Lmax - Lmin);
  for (const e of sorted) e.r = (Lmax - e.L) / span;                 // 0 = lightest, 1 = darkest
  // shade bands only use neutral blocks; strongly coloured ones are kept as accents (paint, rust, hazard)
  const satMax = P.autoSatMax ?? 0.12;
  let pool = sorted.filter(e => e.s <= satMax);
  if (pool.length < Math.max(2, Math.ceil(sorted.length * 0.3))) {          // mostly colourful set: keep the calmest 70%
    const calm = new Set([...sorted].sort((a, b) => a.s - b.s).slice(0, Math.max(2, Math.ceil(sorted.length * 0.7))));
    pool = sorted.filter(e => calm.has(e));
  }
  const pmax = pool[0].L, pmin = pool[pool.length - 1].L, pspan = Math.max(1e-6, pmax - pmin);
  for (const e of pool) e.br = (pmax - e.L) / pspan;
  for (const e of sorted) e.accent = !pool.includes(e);

  // ---- shade bands: band i wants darkness i/8, bent by contrast
  const c = P.autoContrast ?? 1, spread = P.autoSpread ?? 0.08;
  const bands = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    // contrast 1 = even spread; >1 reaches the dark blocks sooner; <1 never uses the very darkest
    const want = Math.min(1, Math.pow(t, 1 / c)) * Math.min(1, 0.4 + 0.6 * c);
    const near = [...pool].sort((a, b) => Math.abs(a.br - want) - Math.abs(b.br - want));
    const best = Math.abs(near[0].br - want);
    bands.push(near.filter(e => Math.abs(e.br - want) <= best + spread).slice(0, 3).map(e => e.k));
  }

  // ---- roles, suggested from the chosen blocks (a role the user picked by hand wins)
  const pal = { ...base, bands };
  const auto = new Set();
  if (P.autoRoles) {
    const byDark = [...pool].sort((a, b) => b.br - a.br);
    const at = t => pool.reduce((best, e) => Math.abs(e.br - t) < Math.abs(best.br - t) ? e : best, pool[0]).k;
    const pickBy = (test, score) => { const c = sorted.filter(test); return c.length ? c.sort((a, b) => score(b) - score(a))[0].k : null; };
    const warmDark = pickBy(e => e.s > 0.12 && hueIn(e.h, 330, 45), e => e.r * 0.8 + Math.min(e.s, 0.3));
    const warmMid = pickBy(e => e.s > 0.12 && e.s < 0.35 && hueIn(e.h, 330, 50) && e.k !== warmDark, e => e.r - Math.abs(e.s - 0.2));
    const green = pickBy(e => e.s > 0.05 && hueIn(e.h, 60, 170), e => e.s * 0.5 + e.r * 0.5);
    const red = pickBy(e => e.s > 0.3 && hueIn(e.h, 340, 25), e => e.s);
    const yellow = pickBy(e => e.s > 0.35 && hueIn(e.h, 35, 70), e => e.s + e.L / 100);
    const sugg = {
      deep: byDark[0].k,
      grilleFrame: byDark[0].k,
      hazardB: byDark[0].k,
      crack: at(0.62),
      interior: at(0.5),
      grime: green || at(0.55),
      rust: warmDark,
      rust2: warmMid || at(0.7),
      porthole: warmDark,
      paint: red,
      paint2: warmDark,
      hazardA: yellow,
    };
    const locks = P.roleLock || {};
    for (const k of ROLE_KEYS) {
      if (locks[k]) { pal[k] = locks[k]; continue; }
      if (sugg[k]) { pal[k] = sugg[k]; auto.add(k); }
    }
  }
  return { palette: pal, sorted, auto };
}
