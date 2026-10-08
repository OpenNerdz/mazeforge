// The top bar and viewport controls: presets, seeds and remix, undo, camera views, toggles, the More menu,
// clean mode and keyboard shortcuts.
import { PRESETS } from '../core/settings.js';
import { LAYOUT_NAMES } from '../core/layouts.js';
import { Rng } from '../core/random.js';
import { withDefaults } from './state.js';
import { $, $$, LS, toast, safeName, fitBars, esc, randSeed } from './dom.js';

export function createShell(app, panel) {
  const { viewer } = app, P = () => app.store.P;

  const setPanel = open => {
    document.body.classList.toggle('panel-open', open);
    $('#panelBackdrop').classList.toggle('hidden', !open);
    $('#panelToggle').setAttribute('aria-expanded', String(open));
    $('#panelToggle').setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
    (open ? $('#tabs button.on') || $('#filter') : $('#panelToggle')).focus();
  };
  $('#panelToggle').onclick = () => setPanel(!document.body.classList.contains('panel-open'));
  $('#panelBackdrop').onclick = () => setPanel(false);
  addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('panel-open')) setPanel(false); });

  // ---- presets
  function presetList() {
    const user = LS.get('presets', {});
    $('#preset').innerHTML = `<option value="">Presets…</option><optgroup label="Built-in">${Object.keys(PRESETS).map(n => `<option value="b:${n}">${n}</option>`).join('')}</optgroup>`
      + (Object.keys(user).length ? `<optgroup label="Mine">${Object.keys(user).map(n => `<option value="u:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    $('#presetMobile').innerHTML = $('#preset').innerHTML;
  }
  $('#preset').onchange = () => {
    const v = $('#preset').value; if (!v) return;
    const kind = v[0], n = v.slice(2);
    const next = withDefaults(kind === 'b' ? structuredClone(PRESETS[n]) : structuredClone(LS.get('presets', {})[n]));
    if (kind === 'b') { next.seed = P().seed; next.name = safeName(n.toLowerCase()); }         // built-ins keep your seed
    app.load(next); $('#preset').value = ''; toast(`Loaded “${n}”`);
  };
  $('#savePreset').onclick = () => {
    const n = prompt('Preset name:', P().name)?.trim(); if (!n) return;
    const u = LS.get('presets', {}); if (u[n] && !confirm(`Replace your preset “${n}”?`)) return;
    u[n] = structuredClone(P()); LS.set('presets', u); presetList(); toast(`Saved preset “${n}”`, 'ok');
  };
  $('#presetMobile').onchange = () => {
    $('#preset').value = $('#presetMobile').value;
    $('#preset').dispatchEvent(new Event('change'));
    $('#presetMobile').value = '';
  };
  presetList();

  // ---- seeds, remix, undo, name
  function remix() {
    const R = new Rng(randSeed()), layout = R.pick(['stacked', 'towers', 'cantilever', 'beam', 'slab']);
    Object.assign(P(), {
      layout, seed: randSeed(), width: layout === 'beam' ? R.pick([40, 48]) : R.pick([20, 20, 24, 30]),
      fins: layout === 'stacked' ? R.f() < 0.7 : R.f() < 0.2, reliefMax: R.int(2, 6), splitChance: R.uniform(0.3, 0.9), ledgeChance: R.uniform(0.2, 0.8),
      portholes: R.int(0, 2), grilles: R.int(0, 3), hazards: R.int(0, 1), channels: R.int(0, 2), doorways: R.int(0, 1), windows: R.int(0, 2),
      numberText: layout === 'slab' || R.f() < 0.25 ? String(R.int(1, 8)) : '', numberHeight: layout === 'slab' ? 28 : 21,
      streakStrength: R.uniform(0.7, 1.5), cracks: R.int(1, 5), moss: R.uniform(0.5, 1.6), backLayout: 'auto',
      ivyAmount: R.pick([0.15, 0.35, 0.6, 0.9]), ivyBranching: R.uniform(0.03, 0.12), ivyWander: R.uniform(0.25, 0.8), ivyClimb: R.uniform(0.1, 0.8),
      ivyLeaves: R.uniform(0.2, 0.9), ivyLength: R.int(10, 40), ivyVariation: R.int(1, 999),
    });
    app.changed(); toast(`Remixed: ${LAYOUT_NAMES[layout]}`);
  }
  $('#reseed').onclick = () => { P().seed = randSeed(); app.changed(); };
  $('#remix').onclick = remix;
  const undo = d => { if (app.store.undo(d)) { app.sync(); app.regenerate(); } };
  $('#undo').onclick = () => undo(-1); $('#redo').onclick = () => undo(1);
  $('#name').onchange = () => { P().name = safeName($('#name').value); $('#name').value = P().name; app.store.commit(); };

  // ---- viewport
  const pressed = (b, on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  $$('#views button').forEach(b => {
    pressed(b, b.classList.contains('on'));
    b.onclick = () => { $$('#views button').forEach(x => pressed(x, x === b)); viewer.view(b.dataset.v); };
  });
  const toggle = (id, fn, on) => { const b = $(id); pressed(b, on); b.onclick = () => { pressed(b, !b.classList.contains('on')); fn(b.classList.contains('on')); }; };
  toggle('#tShadow', v => viewer.setShadows(v), true);
  toggle('#tGrid', v => viewer.setGrid(v), false);
  toggle('#tSpin', v => { viewer.autoRotate = v; }, false);
  toggle('#tMarker', v => viewer.setMarker(v), true);
  $('#shot').onclick = () => { const a = document.createElement('a'); a.href = viewer.screenshot(); a.download = safeName(P().name) + '.png'; a.click(); };
  // the orange part of a slider's track follows its value (Firefox draws this itself)
  const fill = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  const sun = () => { fill($('#sunAz')); fill($('#sunEl')); viewer.setSun(+$('#sunAz').value, +$('#sunEl').value); };
  $('#sunAz').oninput = sun; $('#sunEl').oninput = sun;
  $('#tiles').oninput = () => { fill($('#tiles')); $('#tilesOut').textContent = $('#tiles').value; app.regenerate(); };
  ['#sunAz', '#sunEl', '#tiles'].forEach(id => fill($(id)));

  // ---- More menu
  const menu = $('#moreMenu');
  const setMenu = open => { menu.classList.toggle('on', open); $('#more').setAttribute('aria-expanded', String(open)); };
  $('#more').onclick = e => { e.stopPropagation(); setMenu(!menu.classList.contains('on')); };
  menu.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', e => { if (!menu.contains(e.target)) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('on')) { setMenu(false); $('#more').focus(); } });
  $('#shortcuts').onclick = () => $('#dlgKeys').showModal();
  menu.querySelectorAll('[data-click]').forEach(b => { b.onclick = () => $(b.dataset.click).click(); });

  // dialogs: the close and cancel buttons are plain buttons, so Enter in a field runs the dialog's main action
  $$('dialog [data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });

  // ---- clean UI: hides the less-used controls (see body.clean in the CSS); simple settings only
  function setClean(on) {
    panel.setClean(on); document.body.classList.toggle('clean', on); pressed($('#clean'), on);
    requestAnimationFrame(fitBars);
  }
  $('#clean').onclick = () => setClean(!panel.clean);
  $('#cleanMenu').onclick = () => setClean(!panel.clean);
  setClean(panel.clean);

  // ---- keyboard
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const busy = document.querySelector('dialog[open], .picker');            // shortcuts never act behind a dialog or the block picker
    if (mod && k === 's') {                                                   // also from a text field: finish the edit, then save
      e.preventDefault(); if (busy) return;
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.(); $('#save').click(); return;
    }
    if (busy || /** @type {HTMLElement} */ (e.target).matches('input, select, textarea')) return;
    if (mod && k === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
    else if (mod && k === 'y') { e.preventDefault(); undo(1); }
    else if (mod) return;
    else if (k === 'r') $('#reseed').click();
    else if (k === 'm') remix();
    else if (k === 'b') $('#seeds').click();
    else if (k === 'e') $('#export').click();
    else if (k === 'p') $('#shot').click();
    else if (k === 'c') setClean(!panel.clean);
    else if (k === '?') $('#dlgKeys').showModal();
    else if ('123456'.includes(k)) $$('#views button')[+k - 1]?.click();
  });
}
