// Floor plans: every piece is a 2D footprint of wall columns (1 = wall), index x*D + z.
import { Rng } from './random.js';

export const PIECES = { straight: 'Straight wall', corner: 'Corner (L-shape)', tee: 'T-junction', cross: 'Crossroads', maze: 'Whole maze' };
export function pieceMask(P) {
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
