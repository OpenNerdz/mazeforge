// Background work — generating designs, building meshes and seed thumbnails — so the UI never stalls.
// P is the settings as the UI keeps them; the palette is resolved here.
//   { type: 'scene', P, tiles, only } -> { design, origin, counts, mesh, ms }   (the design and what the viewport shows;
//                                        only = mesh just one block type)
//   { type: 'mesh', grids?, only }    -> { mesh }     (re-mesh the last scene, or the given grids)
//   { type: 'design', P }             -> { design }   (just the design, for batch export)
//   { type: 'thumb', P, top }         -> { thumb: { w, h, pixels } }
import { loadLibrary } from './core/assets.js';
import { buildScene, generate } from './core/generate.js';
import { effectivePalette } from './core/palette.js';
import { buildMesh } from './core/mesh.js';
import { blockCounts } from './core/grid.js';

const library = loadLibrary();
let shown = null;                                                    // grids of the last scene, kept for re-meshing

self.onmessage = async ({ data: msg }) => {
  try {
    const lib = await library;
    if (msg.P) msg.P = { ...msg.P, palette: effectivePalette(msg.P, lib).palette, mossCarpet: !!lib.moss_carpet };  // as the generator wants them
    if (msg.type === 'scene') {
      const t0 = performance.now(), scene = buildScene(msg.P, msg.tiles), t1 = performance.now();
      shown = scene.shown;
      const mesh = buildMesh(shown, lib, { only: msg.only }), t2 = performance.now();
      const { dirt, ...design } = scene.design;
      design.data = design.data.slice();                             // a copy: the original stays here for re-meshing
      self.postMessage({ id: msg.id, design, origin: scene.origin, counts: blockCounts(design), mesh, ms: { gen: t1 - t0, mesh: t2 - t1 } },
        [design.data.buffer, ...meshBuffers(mesh)]);
    } else if (msg.type === 'mesh') {
      if (msg.grids) shown = msg.grids;
      const mesh = buildMesh(shown, lib, { only: msg.only });
      self.postMessage({ id: msg.id, mesh }, meshBuffers(mesh));
    } else if (msg.type === 'design') {
      const { dirt, ...design } = generate(msg.P);
      self.postMessage({ id: msg.id, design }, [design.data.buffer]);
    } else if (msg.type === 'thumb') {
      const thumb = thumbnail(generate(msg.P), lib, msg.top);
      self.postMessage({ id: msg.id, thumb }, [thumb.pixels.buffer]);
    }
  } catch (e) {
    self.postMessage({ id: msg.id, error: e.message });
  }
};

self.postMessage('ready');

const meshBuffers = mesh => [...mesh.parts.filter(Boolean).map(p => p.buffer), mesh.tiles.buffer];

// a quick 2D preview: walls seen from the front, mazes and junctions from above; nearer = brighter
function thumbnail({ W, H, D, data, keys }, lib, top) {
  const rgb = keys.map(k => { const h = lib[k.split('|')[0]]?.color || '#888888'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); });
  const at = (x, y, z) => (y * D + z) * W + x, w = W, h = top ? D : H, pixels = new Uint8ClampedArray(w * h * 4);
  for (let u = 0; u < w; u++) for (let v = 0; v < h; v++) {
    let c = [18, 20, 22], shade = 1;
    if (top) { for (let y = H - 1; y >= 0; y--) { const k = data[at(u, y, v)]; if (k) { c = rgb[k]; shade = 0.45 + 0.55 * y / H; break; } } }
    else { const y = H - 1 - v; for (let z = D - 1; z >= 0; z--) { const k = data[at(u, y, z)]; if (k) { c = rgb[k]; shade = 1 - 0.04 * (D - 1 - z); break; } } }
    const o = (v * w + u) * 4; pixels[o] = c[0] * shade; pixels[o + 1] = c[1] * shade; pixels[o + 2] = c[2] * shade; pixels[o + 3] = 255;
  }
  return { w, h, pixels };
}
