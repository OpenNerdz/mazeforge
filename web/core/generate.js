// Entry points: one design from a set of settings, and the scene the viewport shows for it.
import { pieceMask } from './pieces.js';
import { buildFootprint } from './footprint.js';
import { applyIvy } from './ivy.js';
import { rotateGrid, composeGrids } from './grid.js';

export function generate(P) {
  const g = buildFootprint(P, pieceMask(P));
  if (P.ivy) applyIvy(g, P);
  return g;
}

// the design itself (exported) and what the viewport shows (tiles, or a corner with walls attached);
// origin: where the design sits in what is shown
export function buildScene(P, tiles) {
  if (P.piece === 'straight') {
    const shown = Array.from({ length: tiles }, (_, k) => generate({ ...P, seed: P.seed + k * 17 }));
    return { design: shown[0], shown, origin: [0, 0] };
  }
  const design = generate(P);
  if (P.piece !== 'corner' || !P.cornerPreview) return { design, shown: [design], origin: [0, 0] };
  // straight walls on both arms: west of the south-facing arm, and north of the east-facing arm
  const wall = s => generate({ ...P, piece: 'straight', width: 20, seed: P.seed + s });
  const a = wall(101), b = rotateGrid(wall(202), 3), L = design.W, D = P.thickness;
  const both = composeGrids([{ g: design, x: 0, z: 0 }, { g: a, x: -a.W, z: L - D }, { g: b, x: L - D, z: -b.D }]);
  return { design, shown: [both], origin: both.origin };
}
