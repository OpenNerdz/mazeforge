import { generate, DEFAULTS, PRESETS, LAYOUT_NAMES, BANDS, Rng } from './gen.js';
import { writeSchem, readSchem } from './schem.js';
import { Viewer } from './viewer.js';
import { effectivePalette } from './palette.js';

const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const LS = { get(k, d) { try { const v = localStorage.getItem('mss.' + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('mss.' + k, JSON.stringify(v)); } catch {} } };

const library = await (await fetch('textures/library.json')).json();
const blockKeys = Object.keys(library).sort();
const CATEGORIES = ['All', ...[...new Set(Object.values(library).map(e => e.cat))].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))];
const nice = k => k.replace(/\|.*/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const tex = k => { const e = library[k.split('|')[0]]; return e ? `textures/${e.icon}` : ''; };

let P = Object.assign(clone(DEFAULTS), LS.get('current', {}));
P.palette = Object.assign(clone(DEFAULTS.palette), P.palette || {}); P.roleLock ||= {};
const effPal = () => effectivePalette(P, library).palette;
const viewer = new Viewer($('#view'), library);

// ------------------------------------------------------------------ schema
const FONTS = ['Maze Block', 'Impact', 'Arial Black', 'Verdana', 'Georgia', 'Trebuchet MS', 'Courier New', 'DejaVu Sans', 'Liberation Sans', 'monospace', 'serif'];
const SCHEMA = [
  { id: 'structure', title: 'Structure', ico: '▣', items: [
    { k: 'layout', type: 'select', label: 'Layout', options: LAYOUT_NAMES, help: 'The overall massing of the wall.' },
    { k: 'seed', type: 'seed', label: 'Seed', help: 'Same seed + same settings = same wall, every time.' },
    { k: 'width', type: 'range', label: 'Width', min: 8, max: 96, step: 1, unit: 'blocks' },
    { k: 'heightMin', type: 'range', label: 'Min height', min: 16, max: 200, step: 1, unit: 'blocks' },
    { k: 'heightMax', type: 'range', label: 'Max height', min: 16, max: 200, step: 1, unit: 'blocks', help: 'The skyline varies between min and max.' },
    { k: 'thickness', type: 'range', label: 'Thickness', min: 6, max: 48, step: 1, unit: 'blocks' },
  ]},
  { id: 'back', title: 'Back & ends', ico: '◧', items: [
    { k: 'doubleSided', type: 'toggle', label: 'Detailed back', help: 'Give the back its own design (otherwise flat but weathered).' },
    { k: 'backLayout', type: 'select', label: 'Back layout', options: { auto: 'Random', same: 'Same as front', ...LAYOUT_NAMES }, when: P => P.doubleSided },
    { k: 'backSeedOffset', type: 'range', label: 'Back variation', min: 1, max: 9999, step: 1, when: P => P.doubleSided, help: 'Changes the back without touching the front.' },
    { k: 'backFeatures', type: 'select', label: 'Back features', options: { same: 'Same as front', fewer: 'Fewer', none: 'None' }, when: P => P.doubleSided },
    { k: 'minCore', type: 'range', label: 'Min core', min: 2, max: 12, step: 1, unit: 'blocks', help: 'Solid thickness kept between front and back relief.' },
    { k: 'endDetail', type: 'toggle', label: 'End-face detail', help: 'Give the two ends their own slab design (joints line up with the front). Off = flat but weathered.' },
    { k: 'endRelief', type: 'range', label: 'End relief', min: 0, max: 5, step: 1, unit: 'blocks', when: P => P.endDetail, help: 'How far the end-face slabs step in and out.' },
  ]},
  { id: 'massing', title: 'Massing & relief', ico: '▤', items: [
    { k: 'reliefMax', type: 'range', label: 'Relief depth', min: 0, max: 10, step: 1, unit: 'blocks', help: 'How far slabs step in and out.' },
    { k: 'tierMin', type: 'range', label: 'Tier height min', min: 3, max: 40, step: 1 },
    { k: 'tierMax', type: 'range', label: 'Tier height max', min: 3, max: 40, step: 1 },
    { k: 'splitChance', type: 'range', label: 'Slab splitting', min: 0, max: 1, step: 0.01, help: 'Chance a tier is split into 2–3 slabs.' },
    { k: 'minSlab', type: 'range', label: 'Min slab width', min: 3, max: 24, step: 1 },
    { k: 'ledgeChance', type: 'range', label: 'Ledge caps', min: 0, max: 1, step: 0.01, help: 'Projecting band on top of slabs.' },
    { k: 'jointDepth', type: 'range', label: 'Joint depth', min: 0, max: 3, step: 1 },
    { k: 'grooveDepth', type: 'range', label: 'Groove depth', min: 0, max: 6, step: 1 },
    { k: 'formlineChance', type: 'range', label: 'Formwork lines', min: 0, max: 1, step: 0.01 },
  ]},
  { id: 'base', title: 'Base', ico: '▁', items: [
    { k: 'fins', type: 'toggle', label: 'Buttress fins' },
    { k: 'finHeightMin', type: 'range', label: 'Fin zone min', min: 4, max: 60, step: 1, when: P => P.fins },
    { k: 'finHeightMax', type: 'range', label: 'Fin zone max', min: 4, max: 60, step: 1, when: P => P.fins },
    { k: 'finWidth', type: 'range', label: 'Fin width', min: 1, max: 6, step: 1, when: P => P.fins },
    { k: 'finGapMin', type: 'range', label: 'Fin gap min', min: 1, max: 12, step: 1, when: P => P.fins },
    { k: 'finGapMax', type: 'range', label: 'Fin gap max', min: 1, max: 12, step: 1, when: P => P.fins },
    { k: 'plinthHeight', type: 'range', label: 'Plinth height', min: 0, max: 6, step: 1 },
    { k: 'plinthDepth', type: 'range', label: 'Plinth depth', min: 0, max: 6, step: 1, when: P => P.plinthHeight > 0 },
  ]},
  { id: 'layoutx', title: 'Layout options', ico: '⚙', items: [
    { k: 'towerCount', type: 'range', label: 'Towers', min: 1, max: 6, step: 1, when: P => P.layout === 'towers' || P.backLayout === 'towers' },
    { k: 'towerGap', type: 'range', label: 'Gap width', min: 1, max: 12, step: 1, when: P => P.layout === 'towers' || P.backLayout === 'towers' },
    { k: 'towerGapDepth', type: 'range', label: 'Gap depth', min: 2, max: 20, step: 1, when: P => P.layout === 'towers' || P.backLayout === 'towers' },
    { k: 'cubeWidth', type: 'range', label: 'Cube width', min: 6, max: 60, step: 1, when: P => P.layout === 'cantilever' || P.backLayout === 'cantilever' },
    { k: 'cubeHeight', type: 'range', label: 'Cube height', min: 6, max: 40, step: 1, when: P => P.layout === 'cantilever' || P.backLayout === 'cantilever' },
    { k: 'overhang', type: 'range', label: 'Overhang', min: 1, max: 10, step: 1, when: P => P.layout === 'cantilever' || P.backLayout === 'cantilever' },
    { k: 'passageHeight', type: 'range', label: 'Passage height', min: 4, max: 40, step: 1, when: P => P.layout === 'beam' || P.backLayout === 'beam' },
    { k: 'passageDepth', type: 'range', label: 'Passage depth', min: 3, max: 30, step: 1, when: P => P.layout === 'beam' || P.backLayout === 'beam' },
    { k: 'beamHeight', type: 'range', label: 'Beam height', min: 2, max: 16, step: 1, when: P => P.layout === 'beam' || P.backLayout === 'beam' },
    { k: 'slabWidth', type: 'range', label: 'Slab width', min: 6, max: 90, step: 1, when: P => P.layout === 'slab' || P.backLayout === 'slab' },
    { k: 'slabHeight', type: 'range', label: 'Slab height', min: 10, max: 150, step: 1, when: P => P.layout === 'slab' || P.backLayout === 'slab' },
    { k: '_none', type: 'note', label: 'Stacked tiers has no extra options — see Massing.', when: P => P.layout === 'stacked' && !['towers', 'cantilever', 'beam', 'slab'].includes(P.backLayout) },
  ]},
  { id: 'lettering', title: 'Sector lettering', ico: '7', items: [
    { k: 'numberText', type: 'text', label: 'Text', help: 'Numbers or letters, e.g. 5, 7, A2. Leave empty for none.' },
    { k: 'numberFont', type: 'select', label: 'Font', options: Object.fromEntries(FONTS.map(f => [f, f])), help: 'Maze Block is the film-style stencil (digits).' },
    { k: 'numberHeight', type: 'range', label: 'Height', min: 5, max: 90, step: 1, unit: 'blocks' },
    { k: 'numberWidth', type: 'range', label: 'Width', min: 0.4, max: 2.5, step: 0.05, unit: '×' },
    { k: 'numberPosX', type: 'range', label: 'Position X', min: 0, max: 1, step: 0.01 },
    { k: 'numberPosY', type: 'range', label: 'Position Y', min: 0, max: 1, step: 0.01 },
    { k: 'numberStyle', type: 'select', label: 'Style', options: { painted: 'Painted', raised: 'Raised', inset: 'Inset' } },
    { k: 'numberSide', type: 'select', label: 'Side', options: { front: 'Front', back: 'Back', both: 'Both' } },
    { k: 'numberWear', type: 'range', label: 'Paint wear', min: 0, max: 0.8, step: 0.01 },
    { k: 'paintVariation', type: 'range', label: 'Paint variation', min: 0, max: 1, step: 0.01, help: 'Mix of the secondary paint block.' },
  ]},
  { id: 'features', title: 'Features', ico: '◎', items: [
    { k: 'portholes', type: 'range', label: 'Port-holes', min: 0, max: 8, step: 1 },
    { k: 'portholeRadius', type: 'range', label: 'Port-hole radius', min: 1, max: 5, step: 1, when: P => P.portholes > 0 },
    { k: 'grilles', type: 'range', label: 'Vent grilles', min: 0, max: 12, step: 1 },
    { k: 'grilleMin', type: 'range', label: 'Grille size min', min: 3, max: 12, step: 1, when: P => P.grilles > 0 },
    { k: 'grilleMax', type: 'range', label: 'Grille size max', min: 3, max: 12, step: 1, when: P => P.grilles > 0 },
    { k: 'hazards', type: 'range', label: 'Hazard panels', min: 0, max: 6, step: 1 },
    { k: 'hazardStripe', type: 'range', label: 'Stripe width', min: 1, max: 4, step: 1, when: P => P.hazards > 0 },
    { k: 'hazardWear', type: 'range', label: 'Stripe wear', min: 0, max: 0.6, step: 0.01, when: P => P.hazards > 0 },
    { k: 'channels', type: 'range', label: 'Service channels', min: 0, max: 8, step: 1 },
    { k: 'channelPairs', type: 'toggle', label: 'Twin channels', when: P => P.channels > 0 },
    { k: 'doorways', type: 'range', label: 'Doorways', min: 0, max: 6, step: 1 },
    { k: 'doorWidth', type: 'range', label: 'Door width', min: 1, max: 12, step: 1, when: P => P.doorways > 0 },
    { k: 'doorHeight', type: 'range', label: 'Door height', min: 2, max: 20, step: 1, when: P => P.doorways > 0 },
    { k: 'doorDepth', type: 'range', label: 'Door depth', min: 2, max: 20, step: 1, when: P => P.doorways > 0 },
    { k: 'windows', type: 'range', label: 'Small windows', min: 0, max: 12, step: 1 },
    { k: 'tieChance', type: 'range', label: 'Tie-hole slabs', min: 0, max: 1, step: 0.01, help: 'Share of slabs with formwork tie-holes.' },
    { k: 'tieSpacing', type: 'range', label: 'Tie-hole spacing', min: 3, max: 10, step: 1 },
  ]},
  { id: 'weather', title: 'Weathering', ico: '☂', items: [
    { k: 'baseTone', type: 'range', label: 'Base tone', min: -0.2, max: 0.8, step: 0.01, help: 'Lower = lighter, sun-bleached concrete.' },
    { k: 'panelTone', type: 'range', label: 'Slab tone variation', min: 0, max: 0.25, step: 0.005 },
    { k: 'largeNoise', type: 'range', label: 'Large blotches', min: 0, max: 0.5, step: 0.01 },
    { k: 'fineNoise', type: 'range', label: 'Fine mottling', min: 0, max: 0.4, step: 0.01 },
    { k: 'speckle', type: 'range', label: 'Speckle', min: 0, max: 0.3, step: 0.01 },
    { k: 'patchSize', type: 'range', label: 'Material patch size', min: 0.6, max: 8, step: 0.1 },
    { k: 'streakStrength', type: 'range', label: 'Water streaks', min: 0, max: 2.5, step: 0.01 },
    { k: 'streakLength', type: 'range', label: 'Streak length', min: 4, max: 90, step: 1 },
    { k: 'streakCoverage', type: 'range', label: 'Streak coverage', min: 0, max: 1, step: 0.01 },
    { k: 'grimeHeight', type: 'range', label: 'Ground grime height', min: 0, max: 40, step: 1 },
    { k: 'grimeStrength', type: 'range', label: 'Ground grime', min: 0, max: 1, step: 0.01 },
    { k: 'moss', type: 'range', label: 'Moss', min: 0, max: 3, step: 0.05 },
    { k: 'cracks', type: 'range', label: 'Cracks', min: 0, max: 20, step: 1 },
    { k: 'crackRust', type: 'range', label: 'Rusty cracks', min: 0, max: 1, step: 0.01 },
    { k: 'rust', type: 'range', label: 'Rust amount', min: 0, max: 2, step: 0.01 },
    { k: 'chips', type: 'range', label: 'Chipped corners', min: 0, max: 1, step: 0.01 },
    { k: 'pockmarks', type: 'range', label: 'Pockmarks', min: 0, max: 0.06, step: 0.001 },
  ]},
  { id: 'palette', title: 'Block palette', ico: '■', custom: 'palette' },
];
const ROLES = [
  ['grime', 'Grime / moss'], ['crack', 'Cracks'], ['deep', 'Deep shadow'], ['rust', 'Rust'], ['rust2', 'Rust fade'],
  ['paint', 'Paint'], ['paint2', 'Paint (secondary)'], ['porthole', 'Port-hole metal'], ['grilleFrame', 'Grille frame'],
  ['hazardA', 'Hazard stripe A'], ['hazardB', 'Hazard stripe B'], ['interior', 'Hidden interior'],
];
const BAND_TONES = ['#d6d6d6', '#c3c3c3', '#afafaf', '#9d9d9d', '#8a8a8a', '#777', '#636363', '#4d4d4d', '#393939'];

// ------------------------------------------------------------------ controls
const ctlEls = new Map();
const openSecs = new Set(LS.get('open', ['structure', 'massing', 'weather']));
function buildControls() {
  const root = $('#controls'); root.innerHTML = ''; ctlEls.clear();
  for (const sec of SCHEMA) {
    const el = document.createElement('section'); el.className = 'sec' + (openSecs.has(sec.id) ? '' : ' closed'); el.dataset.id = sec.id;
    el.innerHTML = `<div class="sec-h"><span class="ico">${sec.ico}</span>${sec.title}<button class="reset" title="Reset this section">Reset</button><span class="chev">▾</span></div><div class="sec-b"></div>`;
    el.querySelector('.sec-h').addEventListener('click', e => {
      if (e.target.classList.contains('reset')) return;
      el.classList.toggle('closed'); el.classList.contains('closed') ? openSecs.delete(sec.id) : openSecs.add(sec.id); LS.set('open', [...openSecs]);
    });
    el.querySelector('.reset').addEventListener('click', () => {
      if (sec.custom === 'palette') { P.palette = clone(DEFAULTS.palette); for (const k of ['autoPalette', 'autoRoles', 'autoContrast', 'autoSpread', 'autoSatMax', 'roleLock', 'autoBlocks']) P[k] = clone(DEFAULTS[k]); }
      else for (const it of sec.items) if (it.k in DEFAULTS && it.k !== 'seed') P[it.k] = clone(DEFAULTS[it.k]);
      commit(); syncControls(); regenerate();
    });
    const body = el.querySelector('.sec-b');
    if (sec.custom === 'palette') buildPalette(body);
    else for (const it of sec.items) body.appendChild(makeCtl(it));
    root.appendChild(el);
  }
  syncControls();
}
function makeCtl(it) {
  const d = document.createElement('div'); d.className = 'ctl'; d.dataset.search = (it.label + ' ' + (it.help || '')).toLowerCase();
  const help = it.help ? `<div class="help">${it.help}</div>` : '';
  if (it.type === 'range') {
    d.innerHTML = `<label>${it.label}${it.unit ? ` <span style="color:var(--faint)">(${it.unit})</span>` : ''}</label><input class="val" type="number" step="${it.step}"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}">${help}`;
    const [num, rng] = d.querySelectorAll('input');
    const set = (v, fin) => { v = Math.max(it.min, Math.min(it.max, +v)); if (Number.isNaN(v)) return; P[it.k] = v; enforce(it.k); paint(); regenerate(); if (it.k.startsWith('auto')) paintPalette(); if (fin) commit(); };
    const paint = () => { rng.value = P[it.k]; num.value = P[it.k]; rng.style.setProperty('--p', ((P[it.k] - it.min) / (it.max - it.min) * 100) + '%'); mark(d, it.k); };
    rng.addEventListener('input', () => set(rng.value)); rng.addEventListener('change', () => commit());
    num.addEventListener('change', () => set(num.value, true));
    rng.addEventListener('dblclick', () => set(DEFAULTS[it.k], true));
    ctlEls.set(it.k, { paint, it, el: d });
  } else if (it.type === 'toggle') {
    d.innerHTML = `<label>${it.label}</label><label class="switch"><input type="checkbox"><span></span></label>${help}`;
    const cb = d.querySelector('input');
    cb.addEventListener('change', () => { P[it.k] = cb.checked; commit(); syncControls(); regenerate(); });
    ctlEls.set(it.k, { paint: () => { cb.checked = !!P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'select') {
    d.innerHTML = `<label>${it.label}</label><select>${Object.entries(it.options).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>${help}`;
    const s = d.querySelector('select');
    s.addEventListener('change', () => { P[it.k] = s.value; if (it.k === 'layout' && s.value === 'beam' && P.width < 30) P.width = 40; commit(); syncControls(); regenerate(); });
    ctlEls.set(it.k, { paint: () => { s.value = P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'text') {
    d.innerHTML = `<label>${it.label}</label><input type="text" maxlength="6" spellcheck="false">${help}`;
    const t = d.querySelector('input');
    t.addEventListener('input', () => { P[it.k] = t.value.trim(); regenerate(); }); t.addEventListener('change', () => commit());
    ctlEls.set(it.k, { paint: () => { if (document.activeElement !== t) t.value = P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'seed') {
    d.innerHTML = `<label>${it.label}</label><div class="seedrow"><input type="number"><button title="Previous">‹</button><button title="Next">›</button><button title="Random">🎲</button></div>${help}`;
    const [inp] = d.querySelectorAll('input'), [prev, next, dice] = d.querySelectorAll('button');
    const set = v => { P.seed = (v | 0) >>> 0 ? (v | 0) : 1; commit(); syncControls(); regenerate(); };
    inp.addEventListener('change', () => set(+inp.value));
    prev.onclick = () => set(P.seed - 1); next.onclick = () => set(P.seed + 1); dice.onclick = () => set(randSeed());
    ctlEls.set(it.k, { paint: () => { inp.value = P.seed; }, it, el: d });
  } else if (it.type === 'note') {
    d.innerHTML = `<div class="help" style="margin:0">${it.label}</div>`;
    ctlEls.set(it.k, { paint: () => {}, it, el: d });
  }
  return d;
}
function mark(el, k) { el.classList.toggle('changed', JSON.stringify(P[k]) !== JSON.stringify(DEFAULTS[k])); }
function enforce(k) {
  const pairs = [['heightMin', 'heightMax'], ['tierMin', 'tierMax'], ['finHeightMin', 'finHeightMax'], ['finGapMin', 'finGapMax'], ['grilleMin', 'grilleMax']];
  for (const [a, b] of pairs) {
    if (k === a && P[a] > P[b]) { P[b] = P[a]; ctlEls.get(b)?.paint(); }
    if (k === b && P[b] < P[a]) { P[a] = P[b]; ctlEls.get(a)?.paint(); }
  }
}
function syncControls() {
  for (const [, c] of ctlEls) { c.paint(); if (c.it.when) c.el.classList.toggle('hidden', !c.it.when(P)); }
  paintPalette(); $('#name').value = P.name; updateUndo(); applyFilter();
}

// ------------------------------------------------------------------ palette editor
let palEl;
function buildPalette(body) {
  palEl = body;
  const add = it => { const el = makeCtl(it); body.appendChild(el); return el; };
  add({ k: 'autoPalette', type: 'toggle', label: 'Auto palette', help: 'Pick any blocks — they are sorted light → dark by their real texture colour and used in the right places automatically.' });
  const blocks = document.createElement('div'); blocks.id = 'autoBlocks'; blocks.className = 'autoblocks'; body.appendChild(blocks);
  const auto = P => P.autoPalette;
  add({ k: 'autoContrast', type: 'range', label: 'Contrast', min: 0.3, max: 2.5, step: 0.05, when: auto, help: 'Higher uses your darker blocks more; lower keeps the wall light.' });
  add({ k: 'autoSpread', type: 'range', label: 'Variety', min: 0, max: 0.35, step: 0.01, when: auto, help: 'How much neighbouring shades mix within each band.' });
  add({ k: 'autoSatMax', type: 'range', label: 'Accent threshold', min: 0, max: 0.8, step: 0.01, when: auto, help: 'Blocks more colourful than this are kept for paint, rust and hazard details instead of the main surface.' });
  add({ k: 'autoRoles', type: 'toggle', label: 'Auto detail blocks', when: auto, help: 'Choose grime, rust, paint, hazard… blocks from your set. Picking one by hand locks it.' });
  const tools = document.createElement('div'); tools.className = 'paltools'; tools.id = 'palTools';
  tools.innerHTML = `<button class="ghost" id="palFromManual" title="Fill the block set from the manual bands and detail blocks">Use manual blocks</button><button class="ghost" id="palToManual" title="Freeze the automatic result into the manual palette">Copy to manual</button>`;
  body.appendChild(tools);
  tools.querySelector('#palFromManual').onclick = () => {
    const pal = P.palette; P.autoBlocks = [...new Set([...pal.bands.flat(), ...['grime', 'deep', 'rust', 'paint', 'paint2', 'hazardA', 'hazardB'].map(k => pal[k])])].filter(k => library[k] && !library[k].id.includes('iron_bars'));
    commit(); paintPalette(); regenerate(); toast('Block set filled from the manual palette');
  };
  tools.querySelector('#palToManual').onclick = () => {
    P.palette = clone(effPal()); P.autoPalette = false; commit(); syncControls(); regenerate(); toast('Automatic palette copied to manual — edit freely');
  };
  body.insertAdjacentHTML('beforeend', `<div class="subhead" id="bandsHead"></div><div id="bands" style="display:grid;gap:6px"></div><div class="subhead">Detail blocks</div><div id="roles" style="display:grid;gap:6px"></div>`);
}
function chip(k, { remove, extra = '', cls = '' } = {}) {
  const c = document.createElement('span'); c.className = 'chip ' + cls; c.title = library[k]?.id || k;
  c.innerHTML = `<img src="${tex(k)}" alt="">${nice(k)}${extra}${remove ? '<button title="Remove">×</button>' : ''}`;
  if (remove) c.querySelector('button').onclick = remove;
  return c;
}
function paintPalette() {
  if (!palEl) return;
  const eff = effectivePalette(P, library), on = P.autoPalette;
  // --- auto block set, light -> dark
  const ab = palEl.querySelector('#autoBlocks'); ab.innerHTML = ''; ab.classList.toggle('hidden', !on);
  palEl.querySelector('#palTools').classList.toggle('hidden', !on);
  if (on) {
    const head = document.createElement('div'); head.className = 'subhead'; head.textContent = `Your blocks (${eff.sorted.length}) · light → dark`; ab.appendChild(head);
    const wrap = document.createElement('div'); wrap.className = 'chips';
    for (const e of eff.sorted) {
      const extra = `<i class="lbar" title="Lightness ${e.L.toFixed(0)}"><b style="height:${Math.max(8, e.L)}%"></b></i>${e.accent ? '<em class="badge" title="Colourful: used for details, not the main surface">accent</em>' : ''}`;
      wrap.appendChild(chip(e.k, { extra, remove: () => { P.autoBlocks = P.autoBlocks.filter(x => x !== e.k); commit(); paintPalette(); regenerate(); } }));
    }
    const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ Add blocks';
    add.onclick = ev => pickBlock(ev.currentTarget, k => { if (!P.autoBlocks.includes(k)) P.autoBlocks.push(k); commit(); paintPalette(); regenerate(); });
    wrap.appendChild(add); ab.appendChild(wrap);
  }
  // --- shade bands
  palEl.querySelector('#bandsHead').textContent = on ? 'Shade bands (automatic)' : 'Shade bands · sun-bleached → darkest stains';
  const bands = palEl.querySelector('#bands'); bands.innerHTML = '';
  const shown = on ? eff.palette.bands : P.palette.bands;
  shown.forEach((band, bi) => {
    const row = document.createElement('div'); row.className = 'band' + (on ? ' auto' : ''); row.dataset.search = 'palette band tone block';
    row.innerHTML = `<div class="tone" style="background:${BAND_TONES[bi]}" title="Band ${bi + 1}"></div><div class="chips"></div>`;
    const chips = row.querySelector('.chips');
    band.forEach((k, i) => chips.appendChild(chip(k, on ? {} : { remove: () => { band.splice(i, 1); commit(); paintPalette(); regenerate(); } })));
    if (!on) {
      const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ Add';
      add.onclick = e => pickBlock(e.currentTarget, k => { band.push(k); commit(); paintPalette(); regenerate(); });
      chips.appendChild(add);
    }
    bands.appendChild(row);
  });
  // --- detail roles
  const roles = palEl.querySelector('#roles'); roles.innerHTML = '';
  const autoRoles = on && P.autoRoles;
  for (const [k, label] of ROLES) {
    const val = eff.palette[k], locked = autoRoles && P.roleLock[k], isAuto = autoRoles && eff.auto.has(k);
    const r = document.createElement('div'); r.className = 'role'; r.dataset.search = ('palette ' + label).toLowerCase();
    r.innerHTML = `<label>${label}${isAuto ? ' <em class="badge auto">auto</em>' : ''}${locked ? ' <em class="badge set" title="Unlock (back to automatic)">set ↺</em>' : ''}</label><button class="blockpick"><img class="sw" src="${tex(val)}" alt=""><span>${nice(val)}</span></button>`;
    r.querySelector('button').onclick = e => pickBlock(e.currentTarget, b => { if (autoRoles) P.roleLock[k] = b; else P.palette[k] = b; commit(); paintPalette(); regenerate(); });
    r.querySelector('.badge.set')?.addEventListener('click', () => { delete P.roleLock[k]; commit(); paintPalette(); regenerate(); });
    roles.appendChild(r);
  }
}
function pickBlock(anchor, cb) {
  document.querySelector('.picker')?.remove();
  const p = document.createElement('div'); p.className = 'picker';
  p.innerHTML = `<div class="pk-top"><input placeholder="Search ${blockKeys.length} blocks…" spellcheck="false"><label class="pk-full" title="Full cubes suit walls best; turn off to see stairs, slabs, plants, glass…"><input type="checkbox"> Full blocks only</label></div>
    <div class="pk-cats"></div><div class="list"></div><div class="pk-foot"></div>`;
  const list = p.querySelector('.list'), inp = p.querySelector('.pk-top input'), full = p.querySelector('.pk-full input'), cats = p.querySelector('.pk-cats'), foot = p.querySelector('.pk-foot');
  let cat = LS.get('pickCat', 'All'); if (!CATEGORIES.includes(cat)) cat = 'All';
  full.checked = LS.get('pickFull', true);
  cats.innerHTML = CATEGORIES.map(c => `<button data-c="${c}">${c}</button>`).join('');
  const fill = () => {
    const q = inp.value.trim().toLowerCase().replace(/ /g, '_');
    cats.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === cat));
    list.innerHTML = ''; let n = 0;
    for (const k of blockKeys) {
      const e = library[k];
      if (full.checked && !e.full) continue;
      if (q ? !(k.includes(q) || e.cat.toLowerCase().includes(q.replace(/_/g, ' '))) : (cat !== 'All' && e.cat !== cat)) continue;
      const o = document.createElement('div'); o.className = 'opt' + (e.full ? '' : ' partial');
      o.title = e.id + (e.full ? '' : ' — not a full cube');
      o.innerHTML = `<img loading="lazy" src="${tex(k)}" alt="">${nice(k)}`;
      o.onclick = () => { p.remove(); cb(k); }; list.appendChild(o); n++;
    }
    foot.textContent = `${n} block${n === 1 ? '' : 's'}${q ? ' matching' : cat !== 'All' ? ' in ' + cat : ''}${full.checked ? ' · full cubes' : ''}`;
  };
  cats.onclick = e => { const c = e.target.dataset?.c; if (c) { cat = c; LS.set('pickCat', c); inp.value = ''; fill(); } };
  full.onchange = () => { LS.set('pickFull', full.checked); fill(); };
  inp.oninput = fill; fill();
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - 430)) + 'px'; p.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 490)) + 'px';
  inp.focus();
  setTimeout(() => document.addEventListener('mousedown', function h(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('mousedown', h); } }), 0);
}

// ------------------------------------------------------------------ history
let hist = [JSON.stringify(P)], hpos = 0;
function commit() {
  const s = JSON.stringify(P);
  if (s === hist[hpos]) return;
  hist = hist.slice(0, hpos + 1); hist.push(s); if (hist.length > 150) hist.shift(); hpos = hist.length - 1;
  LS.set('current', P); updateUndo();
}
function undo(d) { const n = hpos + d; if (n < 0 || n >= hist.length) return; hpos = n; P = JSON.parse(hist[hpos]); LS.set('current', P); syncControls(); regenerate(); }
function updateUndo() { $('#undo').disabled = hpos <= 0; $('#redo').disabled = hpos >= hist.length - 1; }

// ------------------------------------------------------------------ generation
let current = null, timer = 0, viewing = false, firstShow = true;
function regenerate() {
  if (viewing) return;
  clearTimeout(timer); $('#busy').classList.add('on');
  timer = setTimeout(() => {
    try {
      const t0 = performance.now();
      const tiles = +$('#tiles').value;
      const grids = [];
      const palette = effPal();
      for (let k = 0; k < tiles; k++) grids.push(generate({ ...P, palette, seed: P.seed + k * 17 }));
      const ms = performance.now() - t0;
      current = grids[0];
      const shown = viewer.show(grids, { keepCamera: !firstShow }); firstShow = false;
      showStats(current, ms, shown);
    } catch (e) { console.error(e); toast('Generation failed: ' + e.message, 'err'); }
    $('#busy').classList.remove('on');
  }, 30);
}
function showStats(g, ms, shown) {
  const counts = new Map(); let total = 0;
  for (let i = 0; i < g.data.length; i++) { const v = g.data[i]; if (v) { const k = g.keys[v].split('|')[0]; counts.set(k, (counts.get(k) || 0) + 1); total++; } }
  const rows = [...counts].sort((a, b) => b[1] - a[1]), max = rows[0]?.[1] || 1;
  $('#stats').innerHTML = `<h4>Structure</h4>
    <div class="kv"><div><b>${g.W}</b><span>wide</span></div><div><b>${g.H}</b><span>tall</span></div><div><b>${g.D}</b><span>thick</span></div>
    <div><b>${total.toLocaleString()}</b><span>blocks</span></div><div><b>${counts.size}</b><span>types</span></div><div><b>${ms < 1000 ? ms.toFixed(0) + 'ms' : (ms / 1000).toFixed(1) + 's'}</b><span>build</span></div></div>
    ${g.backLayout ? `<div class="help" style="color:var(--muted);margin:-4px 0 10px">Back: ${LAYOUT_NAMES[g.backLayout] || g.backLayout}</div>` : ''}
    <h4>Blocks</h4><div class="bom">${rows.map(([k, n]) => `<div><img src="${tex(k)}" alt=""><span>${nice(k)}</span><i>${n.toLocaleString()}</i><div class="bar"><b style="width:${n / max * 100}%"></b></div></div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ export & save
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const safeName = s => (s || 'wall').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'wall';
function download(bytes, name, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let targets = [];
async function loadTargets() {
  try { targets = (await (await fetch('/api/targets')).json()).targets; } catch { targets = []; }
  const sel = new Set(LS.get('targets', targets.filter(t => t.default).map(t => t.path)));
  $('#targets').innerHTML = targets.length ? targets.map((t, i) => `<label class="target"><input type="checkbox" data-i="${i}" ${sel.has(t.path) ? 'checked' : ''}><b>${t.label}</b><small>${t.path}</small></label>`).join('') : '<p class="muted">No WorldEdit folders found — use Download instead.</p>';
}
const chosenTargets = () => [...document.querySelectorAll('#targets input:checked')].map(c => targets[+c.dataset.i].path);
async function saveBytes(bytes, name) {
  const body = { name: safeName(name), subfolder: safeName($('#subfolder').value || ''), overwrite: $('#overwrite').checked, targets: chosenTargets(), data: b64(bytes) };
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j.results;
}
$('#export').onclick = async () => { if (!current) return; download(await writeSchem(current, library), safeName(P.name) + '.schem'); toast(`Downloaded ${safeName(P.name)}.schem`, 'ok'); };
$('#save').onclick = async () => {
  await loadTargets(); $('#subfolder').value = LS.get('subfolder', 'studio'); updateHint(); $('#dlgSave').showModal();
};
const updateHint = () => { const sf = safeName($('#subfolder').value); $('#loadHint').textContent = `//schem load ${sf ? sf + '/' : ''}${safeName(P.name)}`; };
$('#subfolder').oninput = updateHint;
$('#doSave').onclick = async e => {
  e.preventDefault();
  LS.set('targets', chosenTargets()); LS.set('subfolder', $('#subfolder').value);
  if (!chosenTargets().length) return toast('Pick at least one folder', 'err');
  try {
    const res = await saveBytes(await writeSchem(current, library), P.name);
    const ok = res.filter(r => r.ok).length, bad = res.filter(r => !r.ok);
    $('#dlgSave').close();
    toast(bad.length ? `Saved to ${ok}, failed ${bad.length}: ${bad[0].error}` : `Saved ${safeName(P.name)}.schem to ${ok} folder${ok > 1 ? 's' : ''}`, bad.length ? 'err' : 'ok');
  } catch (err) { toast('Save failed: ' + err.message, 'err'); }
};
$('#batch').onclick = async () => { await loadTargets(); $('#bSeed').value = P.seed; $('#bBar').style.width = '0'; $('#dlgBatch').showModal(); };
$('#doBatch').onclick = async e => {
  e.preventDefault();
  const n = Math.max(1, Math.min(100, +$('#bCount').value)), s0 = +$('#bSeed').value, pat = $('#bPattern').value || '{name}_{n}';
  if (!chosenTargets().length) return toast('Choose folders in “Save to Minecraft” first', 'err');
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const q = { ...P, palette: effPal(), seed: s0 + i }; if ($('#bNumbers').checked) q.numberText = String(i + 1);
    const g = generate(q), name = pat.replace('{name}', P.name).replace('{n}', i + 1).replace('{seed}', s0 + i);
    try { const r = await saveBytes(await writeSchem(g, library), name); if (r.every(x => x.ok)) ok++; } catch (err) { toast(err.message, 'err'); break; }
    $('#bBar').style.width = ((i + 1) / n * 100) + '%';
    await new Promise(r => setTimeout(r, 0));
  }
  toast(`Batch done: ${ok}/${n} saved`, ok === n ? 'ok' : 'err');
};

// ------------------------------------------------------------------ open .schem
$('#open').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async () => {
  const f = $('#fileIn').files[0]; if (!f) return;
  try {
    const g = await readSchem(await f.arrayBuffer());
    viewing = true; current = g;
    const shown = viewer.show([g], { keepCamera: false }); showStats(g, 0, shown);
    $('#bannerText').textContent = `Viewing ${f.name}`; $('#banner').classList.remove('hidden');
  } catch (e) { toast('Could not open: ' + e.message, 'err'); }
  $('#fileIn').value = '';
};
$('#bannerClose').onclick = () => { viewing = false; $('#banner').classList.add('hidden'); regenerate(); };

// ------------------------------------------------------------------ presets & remix
function presetList() {
  const user = LS.get('presets', {});
  $('#preset').innerHTML = `<option value="">Presets…</option><optgroup label="Built-in">${Object.keys(PRESETS).map(n => `<option value="b:${n}">${n}</option>`).join('')}</optgroup>` +
    (Object.keys(user).length ? `<optgroup label="Mine">${Object.keys(user).map(n => `<option value="u:${n}">${n}</option>`).join('')}</optgroup>` : '');
}
$('#preset').onchange = () => {
  const v = $('#preset').value; if (!v) return;
  const [t, n] = [v[0], v.slice(2)];
  const src = t === 'b' ? { ...clone(DEFAULTS), ...clone(PRESETS[n]) } : clone(LS.get('presets', {})[n]);
  const seed = P.seed; P = Object.assign(clone(DEFAULTS), src); P.palette = Object.assign(clone(DEFAULTS.palette), src.palette || {}); P.roleLock ||= {};
  if (t === 'b') { P.seed = seed; P.name = safeName(n.toLowerCase()); }
  commit(); syncControls(); regenerate(); $('#preset').value = ''; toast(`Loaded “${n}”`);
};
$('#savePreset').onclick = () => {
  const n = prompt('Preset name:', P.name); if (!n) return;
  const u = LS.get('presets', {}); u[n] = clone(P); LS.set('presets', u); presetList(); toast(`Saved preset “${n}”`, 'ok');
};
const randSeed = () => (Math.random() * 1e6) | 0;
function remix() {
  const R = new Rng(randSeed());
  const layout = R.pick(['stacked', 'towers', 'cantilever', 'beam', 'slab']);
  Object.assign(P, {
    layout, seed: randSeed(), width: layout === 'beam' ? R.pick([40, 48]) : R.pick([20, 20, 24, 30]),
    fins: layout === 'stacked' ? R.f() < 0.7 : R.f() < 0.2, reliefMax: R.int(2, 6), splitChance: R.uniform(0.3, 0.9), ledgeChance: R.uniform(0.2, 0.8),
    portholes: R.int(0, 2), grilles: R.int(0, 3), hazards: R.int(0, 1), channels: R.int(0, 2), doorways: R.int(0, 1), windows: R.int(0, 2),
    numberText: layout === 'slab' || R.f() < 0.25 ? String(R.int(1, 8)) : '', numberHeight: layout === 'slab' ? 28 : 21,
    streakStrength: R.uniform(0.7, 1.5), cracks: R.int(1, 5), moss: R.uniform(0.5, 1.6), backLayout: 'auto',
  });
  commit(); syncControls(); regenerate(); toast(`Remixed: ${LAYOUT_NAMES[layout]}`);
}
$('#reseed').onclick = () => { P.seed = randSeed(); commit(); syncControls(); regenerate(); };
$('#remix').onclick = remix;
$('#undo').onclick = () => undo(-1); $('#redo').onclick = () => undo(1);
$('#name').onchange = () => { P.name = safeName($('#name').value); $('#name').value = P.name; commit(); };

// ------------------------------------------------------------------ viewport UI
document.querySelectorAll('#views button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#views button').forEach(x => x.classList.toggle('on', x === b)); viewer.view(b.dataset.v);
});
const tog = (id, fn, init) => { const b = $(id); b.classList.toggle('on', init); b.onclick = () => { b.classList.toggle('on'); fn(b.classList.contains('on')); }; };
tog('#tShadow', v => viewer.setShadows(v), true);
tog('#tGrid', v => viewer.setGrid(v), false);
tog('#tSpin', v => viewer.autoRotate = v, false);
$('#shot').onclick = () => { const a = document.createElement('a'); a.href = viewer.screenshot(); a.download = safeName(P.name) + '.png'; a.click(); };
const sun = () => viewer.setSun(+$('#sunAz').value, +$('#sunEl').value);
$('#sunAz').oninput = sun; $('#sunEl').oninput = sun;
$('#tiles').oninput = () => { $('#tilesOut').textContent = $('#tiles').value; regenerate(); };
function applyFilter() {
  const q = $('#filter').value.trim().toLowerCase();
  document.querySelectorAll('.sec').forEach(sec => {
    let any = false;
    sec.querySelectorAll('.ctl, .band, .role').forEach(c => {
      const hit = !q || (c.dataset.search || '').includes(q) || sec.querySelector('.sec-h').textContent.toLowerCase().includes(q);
      if (c.classList.contains('ctl')) { const ctl = [...ctlEls.values()].find(x => x.el === c); const whenOk = !ctl?.it.when || ctl.it.when(P); c.classList.toggle('hidden', !hit || !whenOk); }
      else c.style.display = hit ? '' : 'none';
      if (hit) any = true;
    });
    sec.style.display = any ? '' : 'none';
    if (q && any) sec.classList.remove('closed');
  });
}
$('#filter').oninput = applyFilter;

addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); undo(1); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); $('#save').click(); }
  else if (k === 'r') $('#reseed').click();
  else if (k === 'm') remix();
  else if (k === 'e') $('#export').click();
  else if (k === 'p') $('#shot').click();
  else if ('123456'.includes(k)) document.querySelectorAll('#views button')[+k - 1]?.click();
});

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

buildControls(); presetList(); regenerate();
setTimeout(() => viewer.view('iso', 0), 60);
