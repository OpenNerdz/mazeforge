// Layouts: the overall massing of one face, drawn onto a Skin.
import { splitWidth } from './skin.js';

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
    const ws = splitWidth(W - (n - 1) * (P.towerGap - 1), n, R, 4);
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
