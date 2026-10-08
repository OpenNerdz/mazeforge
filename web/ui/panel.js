// The settings panel: sections of controls built from the schema, tabs, search, simple / advanced / clean.
import { DEFAULTS } from '../core/settings.js';
import { SCHEMA } from './schema.js';
import { $, $$, esc, LS, randSeed } from './dom.js';
import { createPaletteEditor } from './palette-editor.js';
import { createFaces } from './faces.js';

const PAIRS = [['heightMin', 'heightMax'], ['tierMin', 'tierMax'], ['finHeightMin', 'finHeightMax'], ['finGapMin', 'finGapMax'], ['grilleMin', 'grilleMax']];
const PALETTE_KEYS = ['autoPalette', 'autoRoles', 'autoContrast', 'autoSpread', 'autoSatMax', 'roleLock', 'autoBlocks'];

export function createPanel(app) {
  const ctls = new Map(), itemOf = new WeakMap(), defOf = new WeakMap(); // key -> {paint}; control -> schema item; section -> its schema
  const closed = new Set(LS.get('closed', []));                        // sections start open; remember the ones closed
  let tab = LS.get('tab', 'shape'), advanced = LS.get('advanced', false), clean = LS.get('clean', false);
  const P = () => app.store.P;
  const changed = () => { app.store.commit(); sync(); app.regenerate(); };  // a discrete change: record, redraw, rebuild

  function mark(el, k) { el.classList.toggle('changed', JSON.stringify(P()[k]) !== JSON.stringify(DEFAULTS[k])); }
  // keep min <= max for paired sliders
  function enforce(k) {
    for (const [a, b] of PAIRS) {
      if (k === a && P()[a] > P()[b]) { P()[b] = P()[a]; ctls.get(b)?.paint(); }
      if (k === b && P()[b] < P()[a]) { P()[a] = P()[b]; ctls.get(a)?.paint(); }
    }
  }
  function control(it) {
    const d = document.createElement('div'); d.className = 'ctl' + (it.adv ? ' adv' : ''); d.dataset.search = (it.label + ' ' + (it.help || '')).toLowerCase();
    const tip = it.help ? ` <i class="tip" tabindex="0" role="img" aria-label="${esc(it.help)}" data-tip="${esc(it.help)}">?</i>` : '';
    let paint;
    if (it.type === 'range') {
      d.innerHTML = `<label>${it.label}${it.unit ? ` <span class="unit">${it.unit}</span>` : ''}${tip}</label><input class="val" type="number" step="${it.step}"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}">`;
      const [num, rng] = d.querySelectorAll('input');
      const set = (v, fin) => {
        v = Math.max(it.min, Math.min(it.max, +v)); if (Number.isNaN(v)) return;
        P()[it.k] = v; enforce(it.k); paint(); app.regenerate();
        if (it.k.startsWith('auto')) palette.paint();
        if (fin) app.store.commit();
      };
      paint = () => { rng.value = num.value = P()[it.k]; rng.style.setProperty('--p', ((P()[it.k] - it.min) / (it.max - it.min) * 100) + '%'); mark(d, it.k); };
      rng.addEventListener('input', () => set(rng.value)); rng.addEventListener('change', () => app.store.commit());
      num.addEventListener('change', () => set(num.value, true));
      rng.addEventListener('dblclick', () => set(DEFAULTS[it.k], true));
    } else if (it.type === 'toggle') {
      d.innerHTML = `<label>${it.label}${tip}</label><label class="switch"><input type="checkbox"><span></span></label>`;
      const cb = d.querySelector('input');
      cb.addEventListener('change', () => { P()[it.k] = cb.checked; changed(); });
      paint = () => { cb.checked = !!P()[it.k]; mark(d, it.k); };
    } else if (it.type === 'select') {
      d.innerHTML = `<label>${it.label}${tip}</label><select>${Object.entries(it.options).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
      const s = d.querySelector('select');
      s.addEventListener('change', () => {
        P()[it.k] = s.value;
        if (it.k === 'piece') P().faceOverrides = {};
        if (it.k === 'layout' && s.value === 'beam' && P().width < 30) P().width = 40;       // a passage needs room
        changed();
      });
      paint = () => { s.value = P()[it.k]; mark(d, it.k); };
    } else if (it.type === 'text') {
      d.innerHTML = `<label>${it.label}${tip}</label><input type="text" maxlength="6" spellcheck="false">`;
      const t = d.querySelector('input');
      t.addEventListener('input', () => { P()[it.k] = t.value.trim(); app.regenerate(); }); t.addEventListener('change', () => app.store.commit());
      paint = () => { if (document.activeElement !== t) t.value = P()[it.k]; mark(d, it.k); };
    } else if (it.type === 'seed') {
      d.innerHTML = `<label>${it.label}${tip}</label><div class="seedrow"><input type="number"><button data-tip="Previous seed"><svg class="i"><use href="#i-left"/></svg></button><button data-tip="Next seed"><svg class="i"><use href="#i-right"/></svg></button><button data-tip="Random seed"><svg class="i"><use href="#i-dice"/></svg></button></div>`;
      const inp = d.querySelector('input'), [prev, next, dice] = d.querySelectorAll('button');
      const set = v => { P().seed = (v | 0) >>> 0 ? (v | 0) : 1; changed(); };
      inp.addEventListener('change', () => set(+inp.value));
      prev.onclick = () => set(P().seed - 1); next.onclick = () => set(P().seed + 1); dice.onclick = () => set(randSeed());
      paint = () => { inp.value = P().seed; };
    } else {                                                                              // note
      d.innerHTML = `<div class="help" style="margin:0">${it.label}</div>`;
      paint = () => {};
    }
    d.querySelectorAll('input, select').forEach(input => input.setAttribute('aria-label', it.label));
    ctls.set(it.k, { paint }); itemOf.set(d, it);
    return d;
  }

  // ---- build
  const palette = createPaletteEditor(app, control);
  const faces = createFaces(app);
  const root = $('#controls');
  const syncOpen = sec => sec.querySelector('.sec-toggle').setAttribute('aria-expanded', String(!sec.classList.contains('closed')));
  for (const sec of SCHEMA) {
    const el = document.createElement('section'); el.className = 'sec' + (closed.has(sec.id) ? ' closed' : ''); el.dataset.id = sec.id; defOf.set(el, sec);
    el.innerHTML = `<div class="sec-h"><button type="button" class="sec-toggle" aria-controls="sec-${sec.id}"><span class="ico"><svg class="i"><use href="#i-${sec.ico}"/></svg></span><span class="sec-title">${sec.title}</span><span class="chev"><svg class="i"><use href="#i-chev"/></svg></span></button><button type="button" class="reset" data-tip="Reset ${esc(sec.title)} to its defaults">Reset</button></div><div class="sec-b" id="sec-${sec.id}"></div>`;
    el.querySelector('.sec-toggle').addEventListener('click', () => {
      el.classList.toggle('closed'); el.classList.contains('closed') ? closed.add(sec.id) : closed.delete(sec.id); LS.set('closed', [...closed]);
      syncOpen(el);
    });
    syncOpen(el);
    el.querySelector('.reset').addEventListener('click', () => {
      if (sec.custom === 'palette') { P().palette = structuredClone(DEFAULTS.palette); for (const k of PALETTE_KEYS) P()[k] = structuredClone(DEFAULTS[k]); }
      else if (sec.custom === 'faces') P().faceOverrides = {};
      else for (const it of sec.items) if (it.k in DEFAULTS && it.k !== 'seed') P()[it.k] = structuredClone(DEFAULTS[it.k]);
      changed();
    });
    const body = el.querySelector('.sec-b');
    if (sec.custom === 'palette') palette.build(body);
    else if (sec.custom === 'faces') faces.mount(body.appendChild(document.createElement('div')));
    else for (const it of sec.items) body.appendChild(control(it));
    const more = document.createElement('button'); more.className = 'more'; more.onclick = () => setAdvanced(true);
    body.appendChild(more);
    root.appendChild(el);
  }
  const none = document.createElement('p'); none.className = 'nomatch hidden'; root.appendChild(none);

  // ---- what shows: the current tab (or every tab while searching), simple or advanced, and only what applies
  function applyFilter() {
    const q = $('#filter').value.trim().toLowerCase();
    $$('#tabs button').forEach(b => { const on = !q && b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    let shown = 0;
    $$('.sec').forEach(sec => {
      const def = defOf.get(sec), title = sec.querySelector('.sec-title').textContent.toLowerCase();
      const show = (q || def.tab === tab) && (!def.when || def.when(P()));
      let any = false, extra = 0;
      sec.querySelectorAll('.ctl, .band, .role').forEach(c => {
        const hit = !q || (c.dataset.search || '').includes(q) || title.includes(q), it = itemOf.get(c);
        const applies = !it?.when || it.when(P()), simpleOk = (advanced && !clean) || q || !it?.adv;
        if (c.classList.contains('ctl')) c.classList.toggle('hidden', !(hit && applies && simpleOk));
        else c.style.display = hit ? '' : 'none';
        if (hit && applies && simpleOk) any = true;
        if (hit && applies && !simpleOk) extra++;
      });
      if (def.custom === 'faces') any = !q || 'faces layout seed'.includes(q);
      const more = sec.querySelector('.more');
      more.textContent = `+ ${extra} more setting${extra === 1 ? '' : 's'}`; more.classList.toggle('hidden', !extra);
      sec.style.display = show && (any || extra) ? '' : 'none';
      if (sec.style.display === '') shown++;
      if (q && any) { sec.classList.remove('closed'); syncOpen(sec); }
    });
    none.textContent = `No settings match “${$('#filter').value.trim()}”.`;
    none.classList.toggle('hidden', !q || shown > 0);
  }
  function setTab(t) { tab = t; LS.set('tab', t); $('#filter').value = ''; applyFilter(); root.scrollTop = 0; }
  function setAdvanced(on) { advanced = on; LS.set('advanced', on); $('#advanced').checked = on; applyFilter(); }
  function setAllSections(open) {
    $$('.sec').forEach(sec => { sec.classList.toggle('closed', !open); open ? closed.delete(sec.dataset.id) : closed.add(sec.dataset.id); syncOpen(sec); });
    LS.set('closed', [...closed]);
  }
  $$('#tabs button').forEach(b => { b.onclick = () => setTab(b.dataset.t); });
  $('#advanced').checked = advanced; $('#advanced').onchange = () => setAdvanced($('#advanced').checked);
  $('#filter').oninput = applyFilter;
  $('#expandAll').onclick = () => setAllSections(true);
  $('#collapseAll').onclick = () => setAllSections(false);

  // repaint every control from P
  function sync() {
    for (const c of ctls.values()) c.paint();
    palette.paint(); faces.render(); $('#name').value = P().name; app.updateUndo(); applyFilter();
  }
  return {
    sync, faces,
    get clean() { return clean; },
    setClean(on) { clean = on; LS.set('clean', on); applyFilter(); },
  };
}
