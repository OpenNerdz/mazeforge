import { generate, DEFAULTS, PRESETS, LAYOUT_NAMES, PIECES, Rng } from './gen.js';
import { buildScene } from './worker.js';
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
P.palette = Object.assign(clone(DEFAULTS.palette), P.palette || {}); P.roleLock ||= {}; P.faceOverrides ||= {};
const effPal = () => effectivePalette(P, library).palette;
const viewer = new Viewer($('#view'), library);

// ------------------------------------------------------------------ schema
const FONTS = ['Maze Block', 'Impact', 'Arial Black', 'Verdana', 'Georgia', 'Trebuchet MS', 'Courier New', 'DejaVu Sans', 'Liberation Sans', 'monospace', 'serif'];
const SCHEMA = [
  { id: 'structure', title: 'Structure', ico: 'cube', tab: 'shape', items: [
    { k: 'piece', type: 'select', label: 'Piece', options: PIECES, help: 'Single wall pieces, junctions, or a whole generated maze.' },
    { k: 'cornerPreview', type: 'toggle', label: 'Show attached walls', when: P => P.piece === 'corner', help: 'Preview the corner with a straight wall on each arm (only the corner is exported).' },
    { k: 'layout', type: 'select', label: 'Layout', options: LAYOUT_NAMES, help: 'The overall massing of the wall.' },
    { k: 'seed', type: 'seed', label: 'Seed', help: 'Same seed + same settings = same wall, every time.' },
    { k: 'width', type: 'range', label: 'Width / arm length', min: 8, max: 96, step: 1, unit: 'blocks', when: P => P.piece !== 'maze', help: 'For corners and junctions: overall size, measured on the outside.' },
    { k: 'thickness', type: 'range', label: 'Thickness', min: 6, max: 48, step: 1, unit: 'blocks', when: P => P.piece !== 'maze' },
    { k: 'seamMatch', type: 'toggle', label: 'Seam matching', when: P => P.piece === 'straight', help: 'Both ends of every wall get the same joint profile and height, so walls with different seeds line up where they meet. Try Tile × to see.' },
    { adv: true, k: 'seamPattern', type: 'range', label: 'Seam pattern', min: 0, max: 50, step: 1, when: P => P.piece === 'straight' && P.seamMatch, help: 'Use the same pattern number for every wall in one run.' },
  ]},
  { id: 'skyline', title: 'Height & skyline', ico: 'skyline', tab: 'shape', items: [
    { k: 'heightMin', type: 'range', label: 'Min height', min: 16, max: 200, step: 1, unit: 'blocks' },
    { k: 'heightMax', type: 'range', label: 'Max height', min: 16, max: 200, step: 1, unit: 'blocks', help: 'The skyline varies between min and max.' },
    { k: 'skylineRough', type: 'range', label: 'Skyline roughness', min: 0, max: 1, step: 0.01, help: 'Each top slab drops by its own amount, so the top steps up and down instead of running level.' },
    { k: 'skylineSlope', type: 'range', label: 'Skyline slope', min: -1, max: 1, step: 0.01, help: 'Leans the whole skyline down to the left (−) or right (+), in steps that follow the slabs.' },
    { k: 'ruin', type: 'range', label: 'Broken tops', min: 0, max: 1, step: 0.01, help: 'Knocks ragged chunks out of the wall top, mostly at its edges. Rain and ivy follow the broken shape.' },
  ]},
  { id: 'maze', title: 'Maze', ico: 'maze', tab: 'shape', when: P => P.piece === 'maze', items: [
    { k: 'mazeCols', type: 'range', label: 'Cells across', min: 2, max: 16, step: 1, when: P => P.piece === 'maze' },
    { k: 'mazeRows', type: 'range', label: 'Cells deep', min: 2, max: 16, step: 1, when: P => P.piece === 'maze' },
    { k: 'mazeCorridor', type: 'range', label: 'Corridor width', min: 3, max: 30, step: 1, unit: 'blocks', when: P => P.piece === 'maze' },
    { k: 'mazeWall', type: 'range', label: 'Wall thickness', min: 4, max: 30, step: 1, unit: 'blocks', when: P => P.piece === 'maze' },
    { k: 'mazeBraid', type: 'range', label: 'Loops', min: 0, max: 1, step: 0.01, when: P => P.piece === 'maze', help: 'Share of dead ends opened up into loops (0 = a perfect maze with one route).' },
    { k: 'glade', type: 'toggle', label: 'Glade', when: P => P.piece === 'maze', help: 'An open square in the middle with a gate in each side.' },
    { k: 'gladeSize', type: 'range', label: 'Glade size', min: 1, max: 6, step: 1, unit: 'cells', when: P => P.piece === 'maze' && P.glade },
  ]},
  { id: 'faces', title: 'Faces', ico: 'faces', tab: 'shape', when: P => P.piece !== 'maze', custom: 'faces' },
  { id: 'layoutx', title: 'Layout options', ico: 'sliders', tab: 'shape', items: [
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
    { k: '_none', type: 'note', label: 'Stacked tiers has no extra options — see Slabs & relief.', when: P => P.layout === 'stacked' && !['towers', 'cantilever', 'beam', 'slab'].includes(P.backLayout) },
  ]},
  { id: 'back', title: 'Back & ends', ico: 'back', tab: 'shape', items: [
    { k: 'doubleSided', type: 'toggle', label: 'Detailed back', help: 'Give the back its own design (otherwise flat but weathered).' },
    { k: 'backLayout', type: 'select', label: 'Back layout', options: { auto: 'Random', same: 'Same as front', ...LAYOUT_NAMES }, when: P => P.doubleSided },
    { adv: true, k: 'backSeedOffset', type: 'range', label: 'Back variation', min: 1, max: 9999, step: 1, when: P => P.doubleSided, help: 'Changes the back without touching the front.' },
    { adv: true, k: 'backFeatures', type: 'select', label: 'Back features', options: { same: 'Same as front', fewer: 'Fewer', none: 'None' }, when: P => P.doubleSided },
    { adv: true, k: 'minCore', type: 'range', label: 'Min core', min: 2, max: 12, step: 1, unit: 'blocks', help: 'Solid thickness kept between front and back relief.' },
    { adv: true, k: 'endDetail', type: 'toggle', label: 'End-face detail', help: 'Give the two ends their own slab design (joints line up with the front). Off = flat but weathered.' },
    { adv: true, k: 'endRelief', type: 'range', label: 'End relief', min: 0, max: 5, step: 1, unit: 'blocks', when: P => P.endDetail, help: 'How far the end-face slabs step in and out.' },
  ]},
  { id: 'base', title: 'Base', ico: 'base', tab: 'shape', items: [
    { k: 'fins', type: 'toggle', label: 'Buttress fins' },
    { adv: true, k: 'finHeightMin', type: 'range', label: 'Fin zone min', min: 4, max: 60, step: 1, when: P => P.fins },
    { adv: true, k: 'finHeightMax', type: 'range', label: 'Fin zone max', min: 4, max: 60, step: 1, when: P => P.fins },
    { adv: true, k: 'finWidth', type: 'range', label: 'Fin width', min: 1, max: 6, step: 1, when: P => P.fins },
    { adv: true, k: 'finGapMin', type: 'range', label: 'Fin gap min', min: 1, max: 12, step: 1, when: P => P.fins },
    { adv: true, k: 'finGapMax', type: 'range', label: 'Fin gap max', min: 1, max: 12, step: 1, when: P => P.fins },
    { adv: true, k: 'plinthHeight', type: 'range', label: 'Plinth height', min: 0, max: 6, step: 1 },
    { adv: true, k: 'plinthDepth', type: 'range', label: 'Plinth depth', min: 0, max: 6, step: 1, when: P => P.plinthHeight > 0 },
  ]},
  { id: 'massing', title: 'Slabs & relief', ico: 'slabs', tab: 'detail', items: [
    { k: 'reliefMax', type: 'range', label: 'Relief depth', min: 0, max: 10, step: 1, unit: 'blocks', help: 'How far slabs step in and out.' },
    { k: 'panelContrast', type: 'range', label: 'Panel distinction', min: 0, max: 1, step: 0.01, help: 'Makes every slab stand out: its own shade and block, calmer texture inside, deeper and darker joints between slabs.' },
    { k: 'panelDetail', type: 'range', label: 'Panel detail', min: 0, max: 1, step: 0.01, help: 'Share of big slabs given inset panels, pilaster strips or a formwork grid.' },
    { adv: true, k: 'tierMin', type: 'range', label: 'Tier height min', min: 3, max: 40, step: 1 },
    { adv: true, k: 'tierMax', type: 'range', label: 'Tier height max', min: 3, max: 40, step: 1 },
    { adv: true, k: 'splitChance', type: 'range', label: 'Slab splitting', min: 0, max: 1, step: 0.01, help: 'Chance a tier is split into 2–3 slabs.' },
    { adv: true, k: 'minSlab', type: 'range', label: 'Min slab width', min: 3, max: 24, step: 1 },
    { adv: true, k: 'slabTarget', type: 'range', label: 'Typical slab width', min: 5, max: 40, step: 1, unit: 'blocks', help: 'Wide walls split into more slabs so they never become big flat panels.' },
    { adv: true, k: 'bayWidth', type: 'range', label: 'Bay width', min: 8, max: 60, step: 1, unit: 'blocks', help: 'Wide walls are built as independent bays, each with its own depth, joints and skyline.' },
    { adv: true, k: 'bayRelief', type: 'range', label: 'Bay relief', min: 0, max: 8, step: 1, unit: 'blocks', help: 'How far whole bays step forward or back from each other.' },
    { adv: true, k: 'ledgeChance', type: 'range', label: 'Ledge caps', min: 0, max: 1, step: 0.01, help: 'Projecting band on top of slabs.' },
    { adv: true, k: 'jointDepth', type: 'range', label: 'Joint depth', min: 0, max: 3, step: 1 },
    { adv: true, k: 'grooveDepth', type: 'range', label: 'Groove depth', min: 0, max: 6, step: 1 },
    { adv: true, k: 'formlineChance', type: 'range', label: 'Formwork lines', min: 0, max: 1, step: 0.01 },
  ]},
  { id: 'features', title: 'Features', ico: 'target', tab: 'detail', items: [
    { k: 'portholes', type: 'range', label: 'Port-holes', min: 0, max: 8, step: 1 },
    { adv: true, k: 'portholeRadius', type: 'range', label: 'Port-hole radius', min: 1, max: 5, step: 1, when: P => P.portholes > 0 },
    { k: 'grilles', type: 'range', label: 'Vent grilles', min: 0, max: 12, step: 1 },
    { adv: true, k: 'grilleMin', type: 'range', label: 'Grille size min', min: 3, max: 12, step: 1, when: P => P.grilles > 0 },
    { adv: true, k: 'grilleMax', type: 'range', label: 'Grille size max', min: 3, max: 12, step: 1, when: P => P.grilles > 0 },
    { k: 'hazards', type: 'range', label: 'Hazard panels', min: 0, max: 6, step: 1 },
    { adv: true, k: 'hazardStripe', type: 'range', label: 'Stripe width', min: 1, max: 4, step: 1, when: P => P.hazards > 0 },
    { adv: true, k: 'hazardWear', type: 'range', label: 'Stripe wear', min: 0, max: 0.6, step: 0.01, when: P => P.hazards > 0 },
    { k: 'channels', type: 'range', label: 'Service channels', min: 0, max: 8, step: 1 },
    { adv: true, k: 'channelPairs', type: 'toggle', label: 'Twin channels', when: P => P.channels > 0 },
    { k: 'doorways', type: 'range', label: 'Doorways', min: 0, max: 6, step: 1 },
    { adv: true, k: 'doorWidth', type: 'range', label: 'Door width', min: 1, max: 12, step: 1, when: P => P.doorways > 0 },
    { adv: true, k: 'doorHeight', type: 'range', label: 'Door height', min: 2, max: 20, step: 1, when: P => P.doorways > 0 },
    { adv: true, k: 'doorDepth', type: 'range', label: 'Door depth', min: 2, max: 20, step: 1, when: P => P.doorways > 0 },
    { k: 'windows', type: 'range', label: 'Small windows', min: 0, max: 12, step: 1 },
    { adv: true, k: 'tieChance', type: 'range', label: 'Tie-hole slabs', min: 0, max: 1, step: 0.01, help: 'Share of slabs with formwork tie-holes.' },
    { adv: true, k: 'tieSpacing', type: 'range', label: 'Tie-hole spacing', min: 3, max: 10, step: 1 },
  ]},
  { id: 'lettering', title: 'Sector lettering', ico: 'type', tab: 'detail', items: [
    { k: 'numberText', type: 'text', label: 'Text', help: 'Numbers or letters, e.g. 5, 7, A2. Leave empty for none.' },
    { k: 'numberFont', type: 'select', label: 'Font', options: Object.fromEntries(FONTS.map(f => [f, f])), help: 'Maze Block is the film-style stencil (digits).' },
    { k: 'numberHeight', type: 'range', label: 'Height', min: 5, max: 90, step: 1, unit: 'blocks' },
    { k: 'numberPosX', type: 'range', label: 'Position X', min: 0, max: 1, step: 0.01 },
    { k: 'numberPosY', type: 'range', label: 'Position Y', min: 0, max: 1, step: 0.01 },
    { k: 'numberStyle', type: 'select', label: 'Style', options: { painted: 'Painted', raised: 'Raised', inset: 'Inset' } },
    { k: 'numberSide', type: 'select', label: 'Side', options: { front: 'Front', back: 'Back', both: 'Both' } },
    { adv: true, k: 'numberWidth', type: 'range', label: 'Width', min: 0.4, max: 2.5, step: 0.05, unit: '×' },
    { adv: true, k: 'numberWear', type: 'range', label: 'Paint wear', min: 0, max: 0.8, step: 0.01 },
    { adv: true, k: 'paintVariation', type: 'range', label: 'Paint variation', min: 0, max: 1, step: 0.01, help: 'Mix of the secondary paint block.' },
  ]},
  { id: 'rain', title: 'Rain & dirt', ico: 'rain', tab: 'weather', items: [
    { k: 'streakStrength', type: 'range', label: 'Rain dirt', min: 0, max: 2.5, step: 0.01, help: 'How much dirt rainwater leaves where it runs off tops and down faces.' },
    { k: 'windDir', type: 'range', label: 'Wind from', min: 0, max: 359, step: 1, unit: 'degrees', help: '0 = north, 90 = east, 180 = south (the side the fronts face), 270 = west.' },
    { k: 'windRain', type: 'range', label: 'Wind-driven rain', min: 0, max: 1.5, step: 0.01, help: 'Rain blown onto the faces that look into the wind; sheltered faces stay dry.' },
    { k: 'sunDrying', type: 'range', label: 'Sun drying', min: 0, max: 1, step: 0.01, help: 'South faces dry out and stay cleaner; north faces stay damp and greener.' },
    { adv: true, k: 'streakLength', type: 'range', label: 'Streak length', min: 4, max: 90, step: 1, help: 'How far water runs down a face before it soaks in.' },
    { adv: true, k: 'streakCoverage', type: 'range', label: 'Drip spread', min: 0, max: 1, step: 0.01, help: '0 = water gathers into a few heavy drips; 1 = it spills evenly along every edge.' },
    { adv: true, k: 'soffitCreep', type: 'range', label: 'Soffit creep', min: 0, max: 1, step: 0.01, help: 'Water clinging to ledge undersides and running back to stain the wall just below.' },
    { adv: true, k: 'washing', type: 'range', label: 'Washing', min: 0, max: 1, step: 0.01, help: 'Heavy flows wash the middle of a streak clean, leaving darker edges and tails.' },
  ]},
  { id: 'weather', title: 'Surface & wear', ico: 'drop', tab: 'weather', items: [
    { k: 'baseTone', type: 'range', label: 'Base tone', min: -0.2, max: 0.8, step: 0.01, help: 'Lower = lighter, sun-bleached concrete.' },
    { k: 'moss', type: 'range', label: 'Moss', min: 0, max: 3, step: 0.05 },
    { k: 'cracks', type: 'range', label: 'Cracks', min: 0, max: 20, step: 1 },
    { k: 'rust', type: 'range', label: 'Rust amount', min: 0, max: 2, step: 0.01 },
    { adv: true, k: 'grimeHeight', type: 'range', label: 'Ground grime height', min: 0, max: 40, step: 1 },
    { adv: true, k: 'grimeStrength', type: 'range', label: 'Ground grime', min: 0, max: 1, step: 0.01 },
    { adv: true, k: 'panelTone', type: 'range', label: 'Slab tone variation', min: 0, max: 0.25, step: 0.005 },
    { adv: true, k: 'largeNoise', type: 'range', label: 'Large blotches', min: 0, max: 0.5, step: 0.01 },
    { adv: true, k: 'fineNoise', type: 'range', label: 'Fine mottling', min: 0, max: 0.4, step: 0.01 },
    { adv: true, k: 'speckle', type: 'range', label: 'Speckle', min: 0, max: 0.3, step: 0.01 },
    { adv: true, k: 'patchSize', type: 'range', label: 'Material patch size', min: 0.6, max: 8, step: 0.1 },
    { adv: true, k: 'crackRust', type: 'range', label: 'Rusty cracks', min: 0, max: 1, step: 0.01 },
    { adv: true, k: 'chips', type: 'range', label: 'Chipped corners', min: 0, max: 1, step: 0.01 },
    { adv: true, k: 'pockmarks', type: 'range', label: 'Pockmarks', min: 0, max: 0.06, step: 0.001 },
  ]},
  { id: 'ivy', title: 'Ivy & vines', ico: 'leaf', tab: 'weather', items: [
    { k: 'ivy', type: 'toggle', label: 'Grow ivy', help: 'Vines, leaf clumps and moss grown onto the finished structure.' },
    { k: 'ivyOvergrowth', type: 'range', label: 'Overgrowth', min: 0, max: 1, step: 0.01, when: P => P.ivy, help: 'Master control: more strands, longer reach. 1 = heavily overgrown.' },
    { k: 'ivyAmount', type: 'range', label: 'Hanging growth', min: 0, max: 1, step: 0.01, when: P => P.ivy, help: 'How often ivy takes root on ledges and the wall top and grows down.' },
    { k: 'ivyClimb', type: 'range', label: 'Climbing from ground', min: 0, max: 1, step: 0.01, when: P => P.ivy },
    { k: 'ivyLeaves', type: 'range', label: 'Leaf clumps', min: 0, max: 1, step: 0.01, when: P => P.ivy, help: 'Bushy leaves spilling over ledges above the vines.' },
    { k: 'ivyLeafBlock', type: 'select', label: 'Leaf block', when: P => P.ivy, options: { azalea_leaves: 'Azalea (+ flowering)', oak_leaves: 'Oak', dark_oak_leaves: 'Dark oak', jungle_leaves: 'Jungle', spruce_leaves: 'Spruce', mangrove_leaves: 'Mangrove', birch_leaves: 'Birch' } },
    { adv: true, k: 'ivyLength', type: 'range', label: 'Hanging reach', min: 2, max: 70, step: 1, unit: 'blocks', when: P => P.ivy, help: 'How far hanging strands can grow (they reach further in shade).' },
    { adv: true, k: 'ivyWidth', type: 'range', label: 'Clump width', min: 0, max: 12, step: 1, when: P => P.ivy, help: 'Strands per root clump.' },
    { adv: true, k: 'ivyClimbHeight', type: 'range', label: 'Climb height', min: 2, max: 70, step: 1, unit: 'blocks', when: P => P.ivy },
    { adv: true, k: 'ivyMoss', type: 'range', label: 'Moss on ledges', min: 0, max: 1, step: 0.01, when: P => P.ivy },
    { adv: true, k: 'ivyBranching', type: 'range', label: 'Branching', min: 0, max: 0.25, step: 0.005, when: P => P.ivy, help: 'How often a strand sends out a thinner side shoot.' },
    { adv: true, k: 'ivyWander', type: 'range', label: 'Wander', min: 0, max: 1.5, step: 0.01, when: P => P.ivy, help: 'How much strands drift sideways instead of running straight up or down.' },
    { adv: true, k: 'ivyShade', type: 'range', label: 'Shade & damp preference', min: 0, max: 1.5, step: 0.01, when: P => P.ivy, help: 'Higher = ivy crowds into shaded, damp spots (north faces, grooves, under ledges, stained areas) and avoids dry sun.' },
    { adv: true, k: 'ivyDryShade', type: 'range', label: 'Dry-shade growth', min: 0, max: 1, step: 0.01, when: P => P.ivy, help: 'Lets ivy take hold on dry but shaded walls too, not only where rain keeps them damp.' },
    { adv: true, k: 'ivyCluster', type: 'range', label: 'Clustering', min: 2, max: 24, step: 1, when: P => P.ivy, help: 'Bigger = ivy gathers in fewer, larger overgrown areas.' },
    { adv: true, k: 'ivyVariation', type: 'range', label: 'Ivy variation', min: 1, max: 999, step: 1, when: P => P.ivy, help: 'Re-rolls the ivy without changing the wall.' },
  ]},
  { id: 'palette', title: 'Block palette', ico: 'palette', tab: 'blocks', custom: 'palette' },
];
const ROLES = [
  ['grime', 'Grime / moss'], ['crack', 'Cracks'], ['deep', 'Deep shadow'], ['rust', 'Rust'], ['rust2', 'Rust fade'],
  ['paint', 'Paint'], ['paint2', 'Paint (secondary)'], ['porthole', 'Port-hole metal'], ['grilleFrame', 'Grille frame'],
  ['hazardA', 'Hazard stripe A'], ['hazardB', 'Hazard stripe B'], ['interior', 'Hidden interior'],
];
const BAND_TONES = ['#d6d6d6', '#c3c3c3', '#afafaf', '#9d9d9d', '#8a8a8a', '#777', '#636363', '#4d4d4d', '#393939'];

// ------------------------------------------------------------------ controls
const ctlEls = new Map(), ctlOf = new WeakMap();
const closedSecs = new Set(LS.get('closed', []));                     // sections start open; remember the ones closed
let tab = LS.get('tab', 'shape'), advanced = LS.get('advanced', false), clean = LS.get('clean', false);
const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function buildControls() {
  const root = $('#controls'); root.innerHTML = ''; ctlEls.clear();
  for (const sec of SCHEMA) {
    const el = document.createElement('section'); el.className = 'sec' + (closedSecs.has(sec.id) ? ' closed' : ''); el.dataset.id = sec.id; el.dataset.tab = sec.tab;
    el.innerHTML = `<div class="sec-h"><span class="ico"><svg class="i"><use href="#i-${sec.ico}"/></svg></span>${sec.title}<span class="chev"><svg class="i"><use href="#i-chev"/></svg></span><button class="reset" data-tip="Reset this section to its defaults">Reset</button></div><div class="sec-b"></div>`;
    el._sec = sec;
    el.querySelector('.sec-h').addEventListener('click', e => {
      if (e.target.classList.contains('reset')) return;
      el.classList.toggle('closed'); el.classList.contains('closed') ? closedSecs.add(sec.id) : closedSecs.delete(sec.id); LS.set('closed', [...closedSecs]);
    });
    el.querySelector('.reset').addEventListener('click', () => {
      if (sec.custom === 'palette') { P.palette = clone(DEFAULTS.palette); for (const k of ['autoPalette', 'autoRoles', 'autoContrast', 'autoSpread', 'autoSatMax', 'roleLock', 'autoBlocks']) P[k] = clone(DEFAULTS[k]); }
      else if (sec.custom === 'faces') P.faceOverrides = {};
      else for (const it of sec.items) if (it.k in DEFAULTS && it.k !== 'seed') P[it.k] = clone(DEFAULTS[it.k]);
      commit(); syncControls(); regenerate();
    });
    const body = el.querySelector('.sec-b');
    if (sec.custom === 'palette') buildPalette(body);
    else if (sec.custom === 'faces') { facesEl = body; renderFaces(); }
    else for (const it of sec.items) body.appendChild(makeCtl(it));
    const more = document.createElement('button'); more.className = 'more'; more.onclick = () => setAdvanced(true);
    body.appendChild(more);
    root.appendChild(el);
  }
  syncControls();
}
function makeCtl(it) {
  const d = document.createElement('div'); d.className = 'ctl'; d.dataset.search = (it.label + ' ' + (it.help || '')).toLowerCase();
  const help = '', tip = it.help ? ` <i class="tip" tabindex="0" data-tip="${esc(it.help)}">?</i>` : '';
  if (it.type === 'range') {
    d.innerHTML = `<label>${it.label}${it.unit ? ` <span class="unit">${it.unit}</span>` : ''}${tip}</label><input class="val" type="number" step="${it.step}"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}">`;
    const [num, rng] = d.querySelectorAll('input');
    const set = (v, fin) => { v = Math.max(it.min, Math.min(it.max, +v)); if (Number.isNaN(v)) return; P[it.k] = v; enforce(it.k); paint(); regenerate(); if (it.k.startsWith('auto')) paintPalette(); if (fin) commit(); };
    const paint = () => { rng.value = P[it.k]; num.value = P[it.k]; rng.style.setProperty('--p', ((P[it.k] - it.min) / (it.max - it.min) * 100) + '%'); mark(d, it.k); };
    rng.addEventListener('input', () => set(rng.value)); rng.addEventListener('change', () => commit());
    num.addEventListener('change', () => set(num.value, true));
    rng.addEventListener('dblclick', () => set(DEFAULTS[it.k], true));
    ctlEls.set(it.k, { paint, it, el: d });
  } else if (it.type === 'toggle') {
    d.innerHTML = `<label>${it.label}${tip}</label><label class="switch"><input type="checkbox"><span></span></label>`;
    const cb = d.querySelector('input');
    cb.addEventListener('change', () => { P[it.k] = cb.checked; commit(); syncControls(); regenerate(); });
    ctlEls.set(it.k, { paint: () => { cb.checked = !!P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'select') {
    d.innerHTML = `<label>${it.label}${tip}</label><select>${Object.entries(it.options).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const s = d.querySelector('select');
    s.addEventListener('change', () => { P[it.k] = s.value; if (it.k === 'piece') P.faceOverrides = {}; if (it.k === 'layout' && s.value === 'beam' && P.width < 30) P.width = 40; commit(); syncControls(); regenerate(); });
    ctlEls.set(it.k, { paint: () => { s.value = P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'text') {
    d.innerHTML = `<label>${it.label}${tip}</label><input type="text" maxlength="6" spellcheck="false">`;
    const t = d.querySelector('input');
    t.addEventListener('input', () => { P[it.k] = t.value.trim(); regenerate(); }); t.addEventListener('change', () => commit());
    ctlEls.set(it.k, { paint: () => { if (document.activeElement !== t) t.value = P[it.k]; mark(d, it.k); }, it, el: d });
  } else if (it.type === 'seed') {
    d.innerHTML = `<label>${it.label}${tip}</label><div class="seedrow"><input type="number"><button data-tip="Previous seed"><svg class="i"><use href="#i-left"/></svg></button><button data-tip="Next seed"><svg class="i"><use href="#i-right"/></svg></button><button data-tip="Random seed"><svg class="i"><use href="#i-dice"/></svg></button></div>`;
    const [inp] = d.querySelectorAll('input'), [prev, next, dice] = d.querySelectorAll('button');
    const set = v => { P.seed = (v | 0) >>> 0 ? (v | 0) : 1; commit(); syncControls(); regenerate(); };
    inp.addEventListener('change', () => set(+inp.value));
    prev.onclick = () => set(P.seed - 1); next.onclick = () => set(P.seed + 1); dice.onclick = () => set(randSeed());
    ctlEls.set(it.k, { paint: () => { inp.value = P.seed; }, it, el: d });
  } else if (it.type === 'note') {
    d.innerHTML = `<div class="help" style="margin:0">${it.label}</div>`;
    ctlEls.set(it.k, { paint: () => {}, it, el: d });
  }
  ctlOf.set(d, it); if (it.adv) d.classList.add('adv');
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
  for (const [, c] of ctlEls) c.paint();
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
  add({ adv: true, k: 'autoSpread', type: 'range', label: 'Variety', min: 0, max: 0.35, step: 0.01, when: auto, help: 'How much neighbouring shades mix within each band.' });
  add({ adv: true, k: 'autoSatMax', type: 'range', label: 'Accent threshold', min: 0, max: 0.8, step: 0.01, when: auto, help: 'Blocks more colourful than this are kept for paint, rust and hazard details instead of the main surface.' });
  add({ k: 'autoRoles', type: 'toggle', label: 'Auto detail blocks', when: auto, help: 'Choose grime, rust, paint, hazard… blocks from your set. Picking one by hand locks it.' });
  const tools = document.createElement('div'); tools.className = 'paltools'; tools.id = 'palTools';
  tools.innerHTML = `<button class="btn" id="palFromManual" data-tip="Fill the block set from the manual bands and detail blocks">Use manual blocks</button><button class="btn" id="palToManual" data-tip="Freeze the automatic result into the manual palette">Copy to manual</button>`;
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
  const c = document.createElement('span'); c.className = 'chip ' + cls; c.dataset.tip = library[k]?.id || k;
  c.innerHTML = `<img src="${tex(k)}" alt="">${nice(k)}${extra}${remove ? '<button data-tip="Remove">×</button>' : ''}`;
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
      const extra = `<i class="lbar" data-tip="Lightness ${e.L.toFixed(0)}"><b style="height:${Math.max(8, e.L)}%"></b></i>${e.accent ? '<em class="badge" data-tip="Colourful: used for details, not the main surface">accent</em>' : ''}`;
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
    row.innerHTML = `<div class="tone" style="background:${BAND_TONES[bi]}" data-tip="Band ${bi + 1}"></div><div class="chips"></div>`;
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
    r.innerHTML = `<label>${label}${isAuto ? ' <em class="badge auto">auto</em>' : ''}${locked ? ' <em class="badge set" data-tip="Unlock (back to automatic)">set ↺</em>' : ''}</label><button class="blockpick"><img class="sw" src="${tex(val)}" alt=""><span>${nice(val)}</span></button>`;
    r.querySelector('button').onclick = e => pickBlock(e.currentTarget, b => { if (autoRoles) P.roleLock[k] = b; else P.palette[k] = b; commit(); paintPalette(); regenerate(); });
    r.querySelector('.badge.set')?.addEventListener('click', () => { delete P.roleLock[k]; commit(); paintPalette(); regenerate(); });
    roles.appendChild(r);
  }
}
function pickBlock(anchor, cb) {
  document.querySelector('.picker')?.remove();
  const p = document.createElement('div'); p.className = 'picker';
  p.innerHTML = `<div class="pk-top"><input placeholder="Search ${blockKeys.length} blocks…" spellcheck="false"><label class="pk-full" data-tip="Full cubes suit walls best; turn off to see stairs, slabs, plants, glass…"><input type="checkbox"> Full blocks only</label></div>
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
      o.dataset.tip = e.id + (e.full ? '' : ' — not a full cube');
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

// ------------------------------------------------------------------ faces: per-face layout / seed
let facesEl = null, faceList = [];
const DIRNAME = { s: 'south', e: 'east', n: 'north', w: 'west' };
function renderFaces() {
  if (!facesEl) return;
  facesEl.innerHTML = '';
  if (P.piece === 'maze') { facesEl.innerHTML = '<div class="help" style="margin:0">A whole maze has too many faces to set one by one — use Remix or the seed.</div>'; return; }
  if (!faceList.length) return;
  facesEl.insertAdjacentHTML('beforeend', '<div class="help" style="margin:0 0 6px">Give one face its own layout or variation without changing the others.</div>');
  const opts = { '': 'Auto', ...LAYOUT_NAMES };
  faceList.forEach((f, n) => {
    const ov = P.faceOverrides[f.i] || {}, r = document.createElement('div');
    r.className = 'role face' + (ov.layout || ov.seed ? ' changed' : ''); r.dataset.search = `face ${DIRNAME[f.dir]} layout seed`;
    r.innerHTML = `<label>${f.primary ? 'Front' : 'Face ' + (n + 1)} <span style="color:var(--faint)">${DIRNAME[f.dir]} · ${f.len}</span></label>
      <div class="facectl"><select>${Object.entries(opts).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select><button data-tip="Previous variation"><svg class="i"><use href="#i-left"/></svg></button><output>${ov.seed | 0}</output><button data-tip="Next variation"><svg class="i"><use href="#i-right"/></svg></button></div>`;
    const sel = r.querySelector('select'), [prev, next] = r.querySelectorAll('button');
    sel.value = ov.layout || '';
    const set = o => { const v = { ...ov, ...o }; if (!v.layout) delete v.layout; if (!v.seed) delete v.seed; P.faceOverrides = { ...P.faceOverrides, [f.i]: v }; if (!Object.keys(v).length) delete P.faceOverrides[f.i]; commit(); regenerate(); };
    sel.onchange = () => set({ layout: sel.value });
    prev.onclick = () => set({ seed: (ov.seed | 0) - 1 }); next.onclick = () => set({ seed: (ov.seed | 0) + 1 });
    facesEl.appendChild(r);
  });
}

// ------------------------------------------------------------------ history
let hist = [JSON.stringify(P)], hpos = 0;
function commit() {
  const s = JSON.stringify(P);
  if (s === hist[hpos]) return;
  hist = hist.slice(0, hpos + 1); hist.push(s); if (hist.length > 150) hist.shift(); hpos = hist.length - 1;
  LS.set('current', P); updateUndo();
}
function undo(d) { const n = hpos + d; if (n < 0 || n >= hist.length) return; hpos = n; P = JSON.parse(hist[hpos]); P.faceOverrides ||= {}; LS.set('current', P); syncControls(); regenerate(); }
function updateUndo() { $('#undo').disabled = hpos <= 0; $('#redo').disabled = hpos >= hist.length - 1; }

// ------------------------------------------------------------------ generation
let current = null, timer = 0, viewing = false, firstShow = true;
// generation runs in a worker; only the newest request is shown (falls back to the main thread)
let worker = null, reqId = 0;
try { worker = new Worker('worker.js', { type: 'module' }); } catch { worker = null; }
function show(scene, ms) {
  current = scene.design;
  const corner = P.piece === 'corner', sameKind = (viewer.isoDir != null) === corner;
  viewer.isoDir = corner ? [0.8, 0.5, 0.9] : null;                    // corners: look at the outer (south + east) faces
  const o = scene.origin || [0, 0];
  const shown = viewer.show(scene.shown, { keepCamera: !firstShow && sameKind, marker: [o[0], o[1] + current.D] }); firstShow = false;
  showStats(current, ms, shown);
  const fl = JSON.stringify(current.faceList || []);
  if (fl !== JSON.stringify(faceList)) { faceList = current.faceList || []; renderFaces(); }
  $('#busy').classList.remove('on');
}
if (worker) worker.onmessage = ({ data }) => {
  if (data.id !== reqId || viewing) return;                            // an older request finished late
  if (data.error) { toast('Generation failed: ' + data.error, 'err'); $('#busy').classList.remove('on'); return; }
  show(data.scene, data.ms);
};
function regenerate() {
  if (viewing) return;
  clearTimeout(timer); $('#busy').classList.add('on');
  timer = setTimeout(() => {
    const Pn = { ...P, palette: effPal() }, tiles = +$('#tiles').value;
    if (worker) { worker.postMessage({ id: ++reqId, P: Pn, tiles }); return; }
    try { const t0 = performance.now(), scene = buildScene(Pn, tiles); show(scene, performance.now() - t0); }
    catch (e) { console.error(e); toast('Generation failed: ' + e.message, 'err'); $('#busy').classList.remove('on'); }
  }, 30);
}
const stackText = n => { const st = Math.floor(n / 64), r = n % 64, sh = n / 1728; return sh >= 1 ? `${sh.toFixed(1)} shulkers` : st ? `${st} st${r ? ' + ' + r : ''}` : `${n}`; };
function materialList(g) {
  const counts = new Map();
  for (let i = 0; i < g.data.length; i++) { const v = g.data[i]; if (v) { const k = g.keys[v].split('|')[0]; counts.set(k, (counts.get(k) || 0) + 1); } }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
// details card: a one-line summary that opens to paste commands and the block list
let bomAll = false;
function showStats(g, ms, shown) {
  const rows = materialList(g), total = rows.reduce((a, r) => a + r[1], 0), open = LS.get('statsOpen', false);
  if (viewer.isolated && !rows.some(([k]) => k === viewer.isolated)) viewer.isolate(null);
  const sf = safeName(LS.get('subfolder', 'studio')), load = `//schem load ${sf ? sf + '/' : ''}${safeName(P.name)}`;
  const time = ms < 1000 ? ms.toFixed(0) + ' ms' : (ms / 1000).toFixed(1) + ' s', list = bomAll ? rows : rows.slice(0, 8);
  const pct = n => { const v = n / total * 100; return v >= 1 ? v.toFixed(0) + '%' : '<1%'; };
  const el = $('#stats'); el.classList.toggle('min', !open);
  el.innerHTML = `<button class="st-head" id="statsToggle"><b>${g.W} × ${g.H} × ${g.D}</b><span>${total.toLocaleString()} blocks</span><svg class="i"><use href="#i-chev"/></svg></button>
    <div class="st-body">
      <p class="st-meta">${rows.length} block types${g.faces ? ` · ${g.faces} faces` : ''} · built in ${time}</p>
      ${viewing ? '' : `<div class="st-paste"><p>Stand on the <b>paste spot</b>, face north, then:</p>
        <div class="cmd"><code>${load}</code><button class="btn icon quiet" data-copy="${load}" data-tip="Copy"><svg class="i"><use href="#i-copy"/></svg></button></div>
        <div class="cmd"><code>//paste -a</code><button class="btn icon quiet" data-copy="//paste -a" data-tip="Copy"><svg class="i"><use href="#i-copy"/></svg></button></div></div>`}
      <div class="st-sub"><span>Blocks</span><button class="linkbtn" id="copyBom" data-tip="Copy the list with stack counts, for a survival build">Copy list</button></div>
      <div class="bom">${list.map(([k, n]) => `<button class="bom-row${viewer.isolated === k ? ' on' : ''}" data-k="${k}" data-tip="${n.toLocaleString()} blocks · ${stackText(n)} — click to show only this block">
        <i class="fill" style="width:${n / rows[0][1] * 100}%"></i><img src="${tex(k)}" alt=""><span>${nice(k)}</span><b>${n.toLocaleString()}</b><em>${pct(n)}</em></button>`).join('')}</div>
      ${rows.length > 8 ? `<button class="linkbtn more-bom" id="bomAll">${bomAll ? 'Show fewer' : `Show all ${rows.length}`}</button>` : ''}
      ${viewer.isolated ? `<button class="linkbtn" id="bomClear">Show all blocks in 3D</button>` : ''}
    </div>`;
  const redraw = () => showStats(g, ms, shown);
  $('#statsToggle').onclick = () => { LS.set('statsOpen', !open); redraw(); };
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied', 'ok'), () => toast('Could not copy', 'err')));
  el.querySelectorAll('.bom-row').forEach(b => b.onclick = () => { viewer.isolate(viewer.isolated === b.dataset.k ? null : b.dataset.k); redraw(); });
  if ($('#bomAll')) $('#bomAll').onclick = () => { bomAll = !bomAll; redraw(); };
  if ($('#bomClear')) $('#bomClear').onclick = () => { viewer.isolate(null); redraw(); };
  $('#copyBom').onclick = () => {
    const txt = `${P.name} — ${g.W}×${g.H}×${g.D}, ${total.toLocaleString()} blocks\n` + rows.map(([k, n]) => `${String(n).padStart(7)}  ${nice(k).padEnd(28)} ${n >= 64 ? stackText(n) : ''}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Block list copied', 'ok'), () => toast('Could not copy', 'err'));
  };
}

// ------------------------------------------------------------------ export & save
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const safeName = s => (s || 'wall').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'wall';
function download(bytes, name, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let targets = [];
function renderTargets(keep) {
  const sel = keep || new Set(LS.get('targets', targets.filter(t => t.default).map(t => t.path)));
  const row = (t, i) => `<label class="target${t.missing ? ' missing' : ''}"><input type="checkbox" data-i="${i}" ${sel.has(t.path) && !t.missing ? 'checked' : ''} ${t.missing ? 'disabled' : ''}>`
    + `<b><span>${esc(t.label)}</span><span class="kind">${esc(t.kind)}</span></b>`
    + (t.custom ? `<button type="button" class="btn icon quiet rm" data-rm="${esc(t.custom)}" data-tip="Remove this added folder"><svg class="i"><use href="#i-x"/></svg></button>` : '')
    + `<small title="${esc(t.path)}">&lrm;${esc(t.short || t.path)}&lrm;</small></label>`;
  const ready = targets.map((t, i) => [t, i]).filter(([t]) => t.worldedit || t.missing), later = targets.map((t, i) => [t, i]).filter(([t]) => !t.worldedit && !t.missing);
  $('#targets').innerHTML = (ready.some(([t]) => t.kind !== 'This app') ? ready.map(([t, i]) => row(t, i)).join('') : '<p class="muted">No WorldEdit folders found. Add one below, or use Download.</p>')
    + (later.length ? `<details ${later.some(([t]) => sel.has(t.path)) ? 'open' : ''}><summary>${later.length} more instance${later.length > 1 ? 's' : ''} without WorldEdit yet</summary>${later.map(([t, i]) => row(t, i)).join('')}</details>` : '');
}
async function loadTargets() {
  try { targets = (await (await fetch('/api/targets')).json()).targets || []; } catch { targets = []; }
  renderTargets();
}
async function folders(body) {
  const r = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
async function addFolder(path) {
  if (!path.trim()) return;
  const keep = new Set(chosenTargets());
  try {
    const j = await folders({ add: path }); targets = j.targets; j.added.forEach(p => keep.add(p));
    renderTargets(keep); $('#addPath').value = '';
    toast(j.added.length ? `Added ${j.added.length} folder${j.added.length > 1 ? 's' : ''}` : 'Already in the list', 'ok');
  } catch (err) { toast(err.message, 'err'); }
}
$('#addFolder').onclick = () => addFolder($('#addPath').value);
$('#addPath').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addFolder($('#addPath').value); } };
$('#pickFolder').onclick = async () => {
  try {
    const r = await fetch('/api/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText);
    if (j.path) addFolder(j.path);
  } catch (err) { toast(err.message, 'err'); $('#addPath').focus(); }
};
$('#rescan').onclick = async () => { const keep = new Set(chosenTargets()); await loadTargets(); renderTargets(keep); toast(`Found ${targets.length - 1} folder${targets.length === 2 ? '' : 's'}`, 'ok'); };
$('#targets').addEventListener('click', async e => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  e.preventDefault(); const keep = new Set(chosenTargets());
  try { targets = (await folders({ remove: b.dataset.rm })).targets; renderTargets(keep); } catch (err) { toast(err.message, 'err'); }
});
const chosenTargets = () => [...document.querySelectorAll('#targets input:checked')].map(c => targets[+c.dataset.i]?.path).filter(Boolean);
async function saveBytes(bytes, name) {
  const body = { name: safeName(name), subfolder: safeName($('#subfolder').value || ''), overwrite: $('#overwrite').checked, targets: chosenTargets(), data: b64(bytes) };
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j.results;
}
$('#export').onclick = async () => { if (!current) return; download(await writeSchem(current, library), safeName(P.name) + '.schem'); toast(`Downloaded ${safeName(P.name)}.schem`, 'ok'); };
$('#save').onclick = async () => {
  await loadTargets(); $('#subfolder').value = LS.get('subfolder', 'studio'); updateHint(); $('#dlgSave').showModal();
};
// big designs split into chunks; every chunk keeps its place relative to the same standing spot,
// so pasting them all from the orange marker rebuilds the whole thing
function chunks(g, size) {
  const out = [], nx = Math.ceil(g.W / size), nz = Math.ceil(g.D / size);
  for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) {
    const x0 = cx * size, z0 = cz * size, W = Math.min(size, g.W - x0), D = Math.min(size, g.D - z0), H = g.H;
    const data = new Uint16Array(W * H * D);
    for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) data[(y * D + z) * W + x] = g.data[(y * g.D + z0 + z) * g.W + x0 + x];
    if (!data.some(v => v)) continue;
    out.push({ g: { W, H, D, data, keys: g.keys }, off: [x0, 0, z0 - g.D], name: `${P.name}_r${cz + 1}c${cx + 1}` });
  }
  return out;
}
const updateHint = () => {
  const sf = safeName($('#subfolder').value), pre = sf ? sf + '/' : '', size = Math.max(16, +$('#chunkSize').value | 0);
  const big = current && Math.max(current.W, current.D) > 64;
  $('#chunkRow').classList.toggle('hidden', !current); if (big && !$('#chunked').dataset.touched) $('#chunked').checked = true;
  if ($('#chunked').checked && current) {
    const n = chunks(current, size).length;
    $('#loadHint').textContent = `${n} files: ${pre}${safeName(P.name)}_r1c1 … — stand on the marker, then for each: //schem load <file> and //paste -a (same spot every time)`;
  } else $('#loadHint').textContent = `//schem load ${pre}${safeName(P.name)} then //paste -a`;
};
$('#subfolder').oninput = updateHint; $('#chunkSize').oninput = updateHint;
$('#chunked').onchange = () => { $('#chunked').dataset.touched = 1; updateHint(); };
$('#doSave').onclick = async e => {
  e.preventDefault();
  LS.set('targets', chosenTargets()); LS.set('subfolder', $('#subfolder').value);
  if (!chosenTargets().length) return toast('Pick at least one folder', 'err');
  try {
    const parts = $('#chunked').checked ? chunks(current, Math.max(16, +$('#chunkSize').value | 0)) : [{ g: current, off: [0, 0, -current.D], name: P.name }];
    let ok = 0, bad = [];
    for (const c of parts) {
      const res = await saveBytes(await writeSchem(c.g, library, c.off), c.name);
      ok += res.every(r => r.ok) ? 1 : 0; bad.push(...res.filter(r => !r.ok));
    }
    $('#dlgSave').close();
    const what = parts.length > 1 ? `${parts.length} chunks` : `${safeName(P.name)}.schem`;
    toast(bad.length ? `Saved ${ok}/${parts.length}, failed: ${bad[0].error}` : `Saved ${what}`, bad.length ? 'err' : 'ok');
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

// ------------------------------------------------------------------ share codes
// settings that differ from the defaults, deflated and base64url-encoded: "MSS1.<data>"
const b64url = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function shareCode() {
  const diff = {};
  for (const k in P) if (JSON.stringify(P[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = P[k];
  return 'MSS1.' + b64url(await pipe(new TextEncoder().encode(JSON.stringify(diff)), new CompressionStream('deflate-raw')));
}
async function loadCode(code) {
  const m = /MSS1\.([A-Za-z0-9_-]+)/.exec(code || ''); if (!m) throw new Error('not a share code');
  const src = JSON.parse(new TextDecoder().decode(await pipe(unb64url(m[1]), new DecompressionStream('deflate-raw'))));
  P = Object.assign(clone(DEFAULTS), src); P.palette = Object.assign(clone(DEFAULTS.palette), src.palette || {}); P.roleLock ||= {}; P.faceOverrides ||= {};
  commit(); syncControls(); regenerate();
}
$('#share').onclick = async () => {
  const code = await shareCode();
  $('#shareCode').value = code; $('#shareLink').value = `${location.origin}${location.pathname}#${code}`; $('#shareIn').value = '';
  $('#dlgShare').showModal();
};
const copyField = id => navigator.clipboard.writeText($(id).value).then(() => toast('Copied', 'ok'), () => { $(id).select(); toast('Press Ctrl+C to copy'); });
$('#copyCode').onclick = e => { e.preventDefault(); copyField('#shareCode'); };
$('#copyLink').onclick = e => { e.preventDefault(); copyField('#shareLink'); };
$('#loadShare').onclick = async e => {
  e.preventDefault();
  try { await loadCode($('#shareIn').value); $('#dlgShare').close(); toast('Design loaded', 'ok'); } catch (err) { toast('Could not load: ' + err.message, 'err'); }
};

// ------------------------------------------------------------------ seed browser
const hexRGB = new Map();
const rgbOf = k => { const b = k.split('|')[0]; if (!hexRGB.has(b)) { const h = library[b]?.color || '#888888'; hexRGB.set(b, [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))); } return hexRGB.get(b); };
// a quick 2D preview: walls seen from the front, mazes from above; nearer = brighter
function thumbnail(g) {
  const top = P.piece === 'maze' || P.piece === 'cross' || P.piece === 'tee';
  const { W, H, D, data, keys } = g, at = (x, y, z) => (y * D + z) * W + x;
  const w = W, h = top ? D : H, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  for (let u = 0; u < w; u++) for (let v = 0; v < h; v++) {
    let c = [18, 20, 22], shade = 1;
    if (top) { for (let y = H - 1; y >= 0; y--) { const k = data[at(u, y, v)]; if (k) { c = rgbOf(keys[k]); shade = 0.45 + 0.55 * y / H; break; } } }
    else { const y = H - 1 - v; for (let z = D - 1; z >= 0; z--) { const k = data[at(u, y, z)]; if (k) { c = rgbOf(keys[k]); shade = 1 - 0.04 * (D - 1 - z); break; } } }
    const o = (v * w + u) * 4; img.data[o] = c[0] * shade; img.data[o + 1] = c[1] * shade; img.data[o + 2] = c[2] * shade; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return cv;
}
let seedWorker = null, seedBase = 0, seedJob = 0;
function openSeeds(start) {
  seedBase = start; const job = ++seedJob, grid = $('#seedGrid'); grid.innerHTML = '';
  const Pn = { ...P, palette: effPal(), ivy: P.ivy }, seeds = Array.from({ length: 12 }, (_, i) => start + i);
  const cards = seeds.map(sd => {
    const c = document.createElement('div'); c.className = 'seedcard' + (sd === P.seed ? ' cur' : ''); c.innerHTML = `<div class="wait">…</div><span>${sd}</span>`;
    c.onclick = () => { P.seed = sd; commit(); syncControls(); regenerate(); $('#dlgSeeds').close(); toast(`Seed ${sd}`); };
    grid.appendChild(c); return c;
  });
  const done = (i, g) => { if (job !== seedJob) return; cards[i].querySelector('.wait')?.remove(); cards[i].prepend(thumbnail(g)); };
  if (!seedWorker) { try { seedWorker = new Worker('worker.js', { type: 'module' }); } catch { seedWorker = null; } }
  if (seedWorker) {
    let i = 0;
    const next = () => { if (i >= seeds.length || job !== seedJob) return; seedWorker.postMessage({ id: i, P: { ...Pn, seed: seeds[i] }, tiles: 1 }); };
    seedWorker.onmessage = ({ data }) => { if (data.scene) done(data.id, data.scene.design); i++; next(); };
    next();
  } else seeds.forEach((sd, i) => setTimeout(() => done(i, generate({ ...Pn, seed: sd })), i * 30));
}
$('#seeds').onclick = () => { $('#dlgSeeds').showModal(); openSeeds(P.seed); };
$('#seedMore').onclick = e => { e.preventDefault(); openSeeds(seedBase + 12); };

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
    ivyAmount: R.pick([0.15, 0.35, 0.6, 0.9]), ivyBranching: R.uniform(0.03, 0.12), ivyWander: R.uniform(0.25, 0.8), ivyClimb: R.uniform(0.1, 0.8), ivyLeaves: R.uniform(0.2, 0.9), ivyLength: R.int(10, 40), ivyVariation: R.int(1, 999),
  });
  commit(); syncControls(); regenerate(); toast(`Remixed: ${LAYOUT_NAMES[layout]}`);
}
$('#reseed').onclick = () => { P.seed = randSeed(); commit(); syncControls(); regenerate(); };
$('#remix').onclick = remix;
$('#undo').onclick = () => undo(-1); $('#redo').onclick = () => undo(1);
$('#name').onchange = () => { P.name = safeName($('#name').value); $('#name').value = P.name; commit(); };

// ------------------------------------------------------------------ responsive bars
// Bars marked data-fit-max collapse one step at a time (labels shorten, then hide, then wrap) until their
// contents fit; the CSS decides what each step does through [data-fit~="n"].
function fitBar(el) {
  const max = +el.dataset.fitMax, cs = getComputedStyle(el), gap = parseFloat(cs.columnGap) || 0, pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const need = () => { const kids = [...el.children].filter(c => c.getClientRects().length && getComputedStyle(c).position !== 'absolute'); return kids.reduce((a, c) => a + c.offsetWidth, 0) + gap * Math.max(0, kids.length - 1) + pad; };
  let n = 0; el.dataset.fit = '';
  while (n < max && need() > el.clientWidth + 0.5) el.dataset.fit += ' ' + ++n;
}
const fitBars = () => document.querySelectorAll('[data-fit-max]').forEach(fitBar);
const fitObserver = new ResizeObserver(() => requestAnimationFrame(fitBars));
document.querySelectorAll('[data-fit-max]').forEach(el => fitObserver.observe(el));
fitObserver.observe($('#stats'));
document.fonts?.ready.then(fitBars);

// ------------------------------------------------------------------ viewport UI
document.querySelectorAll('#views button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#views button').forEach(x => x.classList.toggle('on', x === b)); viewer.view(b.dataset.v);
});
const tog = (id, fn, init) => { const b = $(id); b.classList.toggle('on', init); b.onclick = () => { b.classList.toggle('on'); fn(b.classList.contains('on')); }; };
tog('#tShadow', v => viewer.setShadows(v), true);
tog('#tGrid', v => viewer.setGrid(v), false);
tog('#tSpin', v => viewer.autoRotate = v, false);
tog('#tMarker', v => viewer.setMarker(v), true);
$('#shot').onclick = () => { const a = document.createElement('a'); a.href = viewer.screenshot(); a.download = safeName(P.name) + '.png'; a.click(); };
const sun = () => viewer.setSun(+$('#sunAz').value, +$('#sunEl').value);
$('#sunAz').oninput = sun; $('#sunEl').oninput = sun;
$('#tiles').oninput = () => { $('#tilesOut').textContent = $('#tiles').value; regenerate(); };
// what the panel shows: the current tab (or every tab while searching), simple or advanced controls,
// and only controls that apply to the current design
function applyFilter() {
  const q = $('#filter').value.trim().toLowerCase();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', !q && b.dataset.t === tab));
  document.querySelectorAll('.sec').forEach(sec => {
    const def = sec._sec, title = sec.querySelector('.sec-h').textContent.toLowerCase();
    let show = (q || def.tab === tab) && (!def.when || def.when(P)), any = false, extra = 0;
    sec.querySelectorAll('.ctl, .band, .role').forEach(c => {
      const hit = !q || (c.dataset.search || '').includes(q) || title.includes(q), it = ctlOf.get(c);
      const applies = !it?.when || it.when(P), simpleOk = (advanced && !clean) || q || !it?.adv;
      if (c.classList.contains('ctl')) c.classList.toggle('hidden', !(hit && applies && simpleOk));
      else c.style.display = hit ? '' : 'none';
      if (hit && applies && simpleOk) any = true;
      if (hit && applies && !simpleOk) extra++;
    });
    if (def.custom === 'faces') any = !q || 'faces layout seed'.includes(q);
    const more = sec.querySelector('.more');
    if (more) { more.textContent = `+ ${extra} more setting${extra === 1 ? '' : 's'}`; more.classList.toggle('hidden', !extra); }
    sec.style.display = show && (any || extra) ? '' : 'none';
    if (q && any) sec.classList.remove('closed');
  });
}
function setTab(t) { tab = t; LS.set('tab', t); $('#filter').value = ''; applyFilter(); $('.panel').scrollTop = 0; }
function setAdvanced(on) { advanced = on; LS.set('advanced', on); $('#advanced').checked = on; applyFilter(); }
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.t));
$('#advanced').checked = advanced; $('#advanced').onchange = () => setAdvanced($('#advanced').checked);
$('#filter').oninput = applyFilter;
const setAllSections = open => {
  document.querySelectorAll('.sec').forEach(sec => { sec.classList.toggle('closed', !open); open ? closedSecs.delete(sec.dataset.id) : closedSecs.add(sec.dataset.id); });
  LS.set('closed', [...closedSecs]);
};
$('#expandAll').onclick = () => setAllSections(true);
$('#collapseAll').onclick = () => setAllSections(false);

addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); undo(1); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); $('#save').click(); }
  else if (k === 'r') $('#reseed').click();
  else if (k === 'm') remix();
  else if (k === 'b') $('#seeds').click();
  else if (k === 'e') $('#export').click();
  else if (k === 'p') $('#shot').click();
  else if (k === '?') $('#dlgKeys').showModal();
  else if (k === 'c' && !e.ctrlKey && !e.metaKey) setClean(!clean);
  else if ('123456'.includes(k)) document.querySelectorAll('#views button')[+k - 1]?.click();
});

// tooltips for the ? icons (one floating element, so they are never clipped by the scrolling panel)
const tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl);
const showTip = e => {
  const t = e.target.closest?.('[data-tip]'); if (!t) return;
  tipEl.textContent = t.dataset.tip; tipEl.classList.add('on');
  const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 12)) + 'px';
  tipEl.style.top = (r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
};
const hideTip = e => { const t = e.target.closest?.('[data-tip]'); if (t && !t.contains(e.relatedTarget)) tipEl.classList.remove('on'); };
document.addEventListener('mousedown', () => tipEl.classList.remove('on'));
document.addEventListener('mouseover', showTip); document.addEventListener('focusin', showTip);
document.addEventListener('mouseout', hideTip); document.addEventListener('focusout', hideTip);

// "More" menu in the top bar
const menu = $('#moreMenu');
$('#more').onclick = e => { e.stopPropagation(); menu.classList.toggle('on'); };
menu.addEventListener('click', () => menu.classList.remove('on'));
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.remove('on'); });
$('#shortcuts').onclick = () => $('#dlgKeys').showModal();
menu.querySelectorAll('[data-click]').forEach(b => b.onclick = () => $(b.dataset.click).click());

// clean UI: hides the less-used controls (see body.clean in the CSS); simple settings only
function setClean(on) {
  clean = on; LS.set('clean', on); document.body.classList.toggle('clean', on); $('#clean').classList.toggle('on', on);
  applyFilter(); requestAnimationFrame(fitBars);
}
$('#clean').onclick = () => setClean(!clean);
$('#cleanMenu').onclick = () => setClean(!clean);

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

buildControls(); presetList(); setClean(clean);
if (location.hash.includes('MSS1.')) {
  try { await loadCode(location.hash); toast('Design loaded from link', 'ok'); } catch (err) { toast('Link code invalid: ' + err.message, 'err'); }
  history.replaceState(null, '', location.pathname);
}
regenerate();
window.__studio = { viewer };   // handy for debugging from the console
setTimeout(() => viewer.view('iso', 0), 60);
