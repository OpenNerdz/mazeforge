// Generates designs off the main thread so the UI stays smooth, even for whole mazes.
import { generate, rotateGrid, composeGrids } from './gen.js';

// the design itself (exported) and what the viewport shows (tiles, or a corner with walls attached)
export function buildScene(P, tiles) {
  if (P.piece === 'straight') {
    const shown = Array.from({ length: tiles }, (_, k) => generate({ ...P, seed: P.seed + k * 17 }));
    return { design: shown[0], shown };
  }
  const design = generate(P);
  if (P.piece !== 'corner' || !P.cornerPreview) return { design, shown: [design] };
  // straight walls on both arms: west of the south-facing arm, and north of the east-facing arm
  const wall = s => generate({ ...P, piece: 'straight', width: 20, seed: P.seed + s });
  const a = wall(101), b = rotateGrid(wall(202), 3), L = design.W, D = P.thickness;
  return { design, shown: [composeGrids([{ g: design, x: 0, z: 0 }, { g: a, x: -a.W, z: L - D }, { g: b, x: L - D, z: -b.D }])] };
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = ({ data: { id, P, tiles } }) => {
    try {
      const t0 = performance.now(), scene = buildScene(P, tiles), ms = performance.now() - t0;
      const grids = [scene.design, ...scene.shown];
      const buffers = [...new Set(grids.flatMap(g => [g.data.buffer, g.dirt?.buffer]).filter(Boolean))];
      self.postMessage({ id, scene, ms }, buffers);
    } catch (e) { self.postMessage({ id, error: e.message }); }
  };
}
