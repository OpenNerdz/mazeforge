// MazeForge: wires the settings, the background worker, the 3D preview and the panels together.
import { assetBase, loadLibrary } from './core/assets.js';
import { tileCount } from './core/mesh.js';
import { readSchem } from './core/schem.js';
import { blockCounts } from './core/grid.js';
import { Viewer } from './ui/viewer.js';
import { Store, adaptPalette } from './ui/state.js';
import { createEngine } from './ui/engine.js';
import { createPanel } from './ui/panel.js';
import { createDetails } from './ui/details.js';
import { createSaving } from './ui/save.js';
import { createSharing } from './ui/share.js';
import { createSeeds } from './ui/seeds.js';
import { createShell } from './ui/shell.js';
import { createTextureImport } from './ui/textures.js';
import { createDesktop } from './ui/desktop.js';
import { $, toast, installTooltips, installFitBars } from './ui/dom.js';

async function start() {
// the worker starts on the first design straight away, while the page loads its textures and builds the UI
let panel, details, viewer, marker = null, firstShow = true, lastPiece = null, ready;
const whenReady = new Promise(r => { ready = r; });
const app = {
  store: new Store(() => app.updateUndo()),
  current: null,          // the design on show (what gets saved)
  viewing: false,         // showing an opened .schem instead of the design
  isolated: null,         // the one block type shown in 3D, if any
  engine: createEngine(scene => whenReady.then(() => showScene(scene)),
    err => { toast('Generation failed: ' + err.message, 'err'); $('#busy').classList.remove('on'); }),
  regenerate() {
    if (app.viewing) return;
    $('#busy').classList.add('on');
    app.engine.scene(() => ({ P: app.store.P, tiles: +$('#tiles').value, only: app.isolated }));
  },
  sync: () => panel.sync(),
  changed() { app.store.commit(); app.sync(); app.regenerate(); },
  load(P) { app.store.replace(adaptPalette(P, app.library)); app.sync(); app.regenerate(); },
  updateUndo() { $('#undo').disabled = !app.store.canUndo; $('#redo').disabled = !app.store.canRedo; },
  // show only one block type in 3D (null = everything)
  async isolate(block) {
    app.isolated = block;
    details.redraw();
    viewer.show((await app.engine.mesh(undefined, block)).mesh, { marker });
  },
};
if (!location.hash.includes('MSS1.')) app.regenerate();                // a design in the link is loaded below instead

const base = await assetBase();
const assets = Promise.all([
  loadLibrary(base),
  fetch(`${base}/atlas.png`).then(r => {
    if (!r.ok) throw new Error('The preview textures could not be loaded. Extract the complete release and restart.');
    return r.blob();
  }).then(createImageBitmap),
]);
// the first request goes out as soon as the worker listens, and is passed on once this thread is idle
await app.engine.ready;
await new Promise(r => setTimeout(r));
const [library, atlas] = await assets;
app.library = library;
adaptPalette(app.store.P, library);
app.viewer = viewer = new Viewer($('#view'), atlas, tileCount(library));

function showScene({ design, origin, counts, mesh, ms }) {
  if (app.viewing) return;
  app.current = design;
  const piece = app.store.P.piece, corner = piece === 'corner', sameKind = lastPiece === piece;
  lastPiece = piece;
  viewer.isoDir = corner ? [0.8, 0.5, 0.9] : null;                     // corners: look at the outer (south + east) faces
  marker = [origin[0], origin[1] + design.D];
  viewer.show(mesh, { keepCamera: !firstShow && sameKind, marker }); firstShow = false;
  if (app.isolated && !counts.some(([k]) => k === app.isolated)) app.isolate(null);
  details.show(design, counts, ms.gen + ms.mesh);
  panel.faces.update(design.faceList);
  $('#busy').classList.remove('on');
}

// open any .schem to look at it
$('#open').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async () => {
  const f = $('#fileIn').files[0]; if (!f) return;
  try {
    const g = await readSchem(await f.arrayBuffer());
    app.viewing = true; app.current = g; app.isolated = null; marker = null;
    viewer.show((await app.engine.mesh([g])).mesh, { keepCamera: false });
    details.show(g, blockCounts(g), 0);
    $('#bannerText').textContent = `Viewing ${f.name}`; $('#banner').classList.remove('hidden');
  } catch (e) { toast('Could not open: ' + e.message, 'err'); }
  $('#fileIn').value = '';
};
$('#bannerClose').onclick = () => { app.viewing = false; app.isolated = null; $('#banner').classList.add('hidden'); app.regenerate(); };

panel = createPanel(app);
details = createDetails(app);
createSaving(app);
createSeeds(app);
const loadLink = createSharing(app);
createShell(app, panel);
createTextureImport(app);
createDesktop();
installTooltips();
installFitBars($('#stats'));
app.sync();
app.regenerate();
ready();
$('#startup').remove();
await loadLink();
Object.assign(window, { __studio: { viewer } });                        // handy for debugging from the console

}
start().catch(err => {
  $('#busy').classList.remove('on');
  const status = $('#startup');
  status.classList.add('failed');
  status.textContent = `Could not start MazeForge. ${err.message} Use a current Chrome, Edge or Firefox browser with WebGL 2 enabled, then reload.`;
});
