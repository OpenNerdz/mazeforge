// The Blocks tab: the auto palette's block set, the nine shade bands, the detail blocks and the block picker.
import { effectivePalette } from '../core/palette.js';
import { ROLES, BAND_TONES } from './schema.js';
import { $, LS, toast, nice, icon, esc } from './dom.js';

export function createPaletteEditor(app, control) {
  const { library } = app, P = () => app.store.P;
  const blockKeys = Object.keys(library).sort();
  const categories = ['All', ...[...new Set(Object.values(library).map(e => e.cat))].sort((a, b) => Number(a === 'Other') - Number(b === 'Other') || a.localeCompare(b))];
  const edited = () => { app.store.commit(); paint(); app.regenerate(); };
  let root = null;

  function build(body) {
    root = body;
    const add = it => body.appendChild(control(it));
    const auto = p => p.autoPalette;
    add({ k: 'autoPalette', type: 'toggle', label: 'Auto palette', help: 'Pick any blocks — they are sorted light → dark by their real texture colour and used in the right places automatically.' });
    body.insertAdjacentHTML('beforeend', '<div id="autoBlocks" class="autoblocks"></div>');
    add({ k: 'autoContrast', type: 'range', label: 'Contrast', min: 0.3, max: 2.5, step: 0.05, when: auto, help: 'Higher uses your darker blocks more; lower keeps the wall light.' });
    add({ adv: true, k: 'autoSpread', type: 'range', label: 'Variety', min: 0, max: 0.35, step: 0.01, when: auto, help: 'How much neighbouring shades mix within each band.' });
    add({ adv: true, k: 'autoSatMax', type: 'range', label: 'Accent threshold', min: 0, max: 0.8, step: 0.01, when: auto, help: 'Blocks more colourful than this are kept for paint, rust and hazard details instead of the main surface.' });
    add({ k: 'autoRoles', type: 'toggle', label: 'Auto detail blocks', when: auto, help: 'Choose grime, rust, paint, hazard… blocks from your set. Picking one by hand locks it.' });
    body.insertAdjacentHTML('beforeend', `<div class="paltools" id="palTools"><button class="btn" id="palFromManual" data-tip="Fill the block set from the manual bands and detail blocks">Use manual blocks</button><button class="btn" id="palToManual" data-tip="Freeze the automatic result into the manual palette">Copy to manual</button></div>
      <div class="subhead" id="bandsHead"></div><div id="bands" class="stack"></div><div class="subhead">Detail blocks</div><div id="roles" class="stack"></div>`);
    body.querySelector('#palFromManual').onclick = () => {
      const pal = P().palette;
      P().autoBlocks = [...new Set([...pal.bands.flat(), ...['grime', 'deep', 'rust', 'paint', 'paint2', 'hazardA', 'hazardB'].map(k => pal[k])])].filter(k => library[k] && !library[k].id.includes('iron_bars'));
      edited(); toast('Block set filled from the manual palette');
    };
    body.querySelector('#palToManual').onclick = () => {
      P().palette = structuredClone(effectivePalette(P(), library).palette); P().autoPalette = false;
      app.store.commit(); app.sync(); app.regenerate(); toast('Automatic palette copied to manual — edit freely');
    };
  }

  /** @param {string} k @param {{ remove?: () => void, extra?: string }} [opts] */
  function chip(k, { remove, extra = '' } = {}) {
    const c = document.createElement('span'); c.className = 'chip'; c.dataset.tip = library[k]?.id || k;
    c.innerHTML = `${icon(library, k)}${esc(nice(k))}${extra}${remove ? `<button type="button" data-tip="Remove" aria-label="Remove ${esc(nice(k))}">×</button>` : ''}`;
    if (remove) c.querySelector('button').onclick = remove;
    return c;
  }
  const addButton = (label, onPick) => {
    const b = document.createElement('button'); b.className = 'add'; b.textContent = label;
    b.onclick = e => pick(e.currentTarget, onPick); return b;
  };

  function paint() {
    if (!root) return;
    const eff = effectivePalette(P(), library), on = P().autoPalette;
    // ---- the auto palette's block set, light -> dark
    const ab = root.querySelector('#autoBlocks'); ab.innerHTML = ''; ab.classList.toggle('hidden', !on);
    root.querySelector('#palTools').classList.toggle('hidden', !on);
    if (on) {
      ab.insertAdjacentHTML('beforeend', `<div class="subhead">Your blocks (${eff.sorted.length}) · light → dark</div>`);
      const wrap = document.createElement('div'); wrap.className = 'chips';
      for (const e of eff.sorted) {
        const extra = `<i class="lbar" data-tip="Lightness ${e.L.toFixed(0)}"><b style="height:${Math.max(8, e.L)}%"></b></i>${e.accent ? '<em class="badge" data-tip="Colourful: used for details, not the main surface">accent</em>' : ''}`;
        wrap.appendChild(chip(e.k, { extra, remove: () => { P().autoBlocks = P().autoBlocks.filter(x => x !== e.k); edited(); } }));
      }
      wrap.appendChild(addButton('+ Add blocks', k => { if (!P().autoBlocks.includes(k)) P().autoBlocks.push(k); edited(); }));
      ab.appendChild(wrap);
    }
    // ---- shade bands
    root.querySelector('#bandsHead').textContent = on ? 'Shade bands (automatic)' : 'Shade bands · sun-bleached → darkest stains';
    const bands = root.querySelector('#bands'); bands.innerHTML = '';
    (on ? eff.palette.bands : P().palette.bands).forEach((band, bi) => {
      const row = document.createElement('div'); row.className = 'band' + (on ? ' auto' : ''); row.dataset.search = 'palette band tone block';
      row.innerHTML = `<div class="tone" style="background:${BAND_TONES[bi]}" data-tip="Band ${bi + 1}"></div><div class="chips"></div>`;
      const chips = row.querySelector('.chips');
      band.forEach((k, i) => chips.appendChild(chip(k, on ? {} : { remove: () => { band.splice(i, 1); edited(); } })));
      if (!on) chips.appendChild(addButton('+ Add', k => { band.push(k); edited(); }));
      bands.appendChild(row);
    });
    // ---- detail roles
    const roles = root.querySelector('#roles'); roles.innerHTML = '';
    const autoRoles = on && P().autoRoles;
    for (const [k, label] of ROLES) {
      const val = eff.palette[k], locked = autoRoles && P().roleLock[k], isAuto = autoRoles && eff.auto.has(k);
      const r = document.createElement('div'); r.className = 'role'; r.dataset.search = ('palette ' + label).toLowerCase();
      r.innerHTML = `<label>${label}${isAuto ? ' <em class="badge auto">auto</em>' : ''}${locked ? ' <em class="badge set" data-tip="Unlock (back to automatic)">set ↺</em>' : ''}</label><button class="blockpick">${icon(library, val)}<span>${esc(nice(val))}</span></button>`;
      r.querySelector('button').onclick = e => pick(e.currentTarget, b => { if (autoRoles) P().roleLock[k] = b; else P().palette[k] = b; edited(); });
      r.querySelector('.badge.set')?.addEventListener('click', () => { delete P().roleLock[k]; edited(); });
      roles.appendChild(r);
    }
  }

  // the block picker: search, categories, full cubes only. Esc or a click outside closes it.
  function pick(anchor, cb) {
    document.querySelector('.picker')?.remove();
    const p = document.createElement('div'); p.className = 'picker'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Choose a block');
    p.innerHTML = `<div class="pk-top"><input aria-label="Search blocks" placeholder="Search ${blockKeys.length} blocks…" spellcheck="false"><label class="pk-full" data-tip="Full cubes suit walls best; turn off to see stairs, slabs, plants, glass…"><input type="checkbox"> Full blocks only</label></div>
      <div class="pk-cats"></div><div class="list"></div><div class="pk-foot"></div>`;
    const list = $('.list', p), inp = $('.pk-top input', p), full = $('.pk-full input', p), cats = $('.pk-cats', p), foot = $('.pk-foot', p);
    let cat = LS.get('pickCat', 'All'); if (!categories.includes(cat)) cat = 'All';
    full.checked = LS.get('pickFull', true);
    cats.innerHTML = categories.map(c => `<button type="button" data-c="${c}">${c}</button>`).join('');
    const fill = () => {
      const q = inp.value.trim().toLowerCase().replace(/ /g, '_');
      cats.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.c === cat); b.setAttribute('aria-pressed', String(b.dataset.c === cat)); });
      const shown = blockKeys.filter(k => {
        const e = library[k];
        if (full.checked && !e.full) return false;
        return q ? k.includes(q) || e.cat.toLowerCase().includes(q.replace(/_/g, ' ')) : cat === 'All' || e.cat === cat;
      });
      list.innerHTML = shown.map(k => { const e = library[k]; return `<button type="button" class="opt${e.full ? '' : ' partial'}" data-k="${k}" data-tip="${e.id}${e.full ? '' : ' — not a full cube'}" aria-label="${esc(nice(k))}${e.full ? '' : ', not a full cube'}">${icon(library, k)}<span>${esc(nice(k))}</span></button>`; }).join('');
      foot.textContent = `${shown.length} block${shown.length === 1 ? '' : 's'}${q ? ' matching' : cat !== 'All' ? ' in ' + cat : ''}${full.checked ? ' · full cubes' : ''}`;
    };
    const close = () => { p.remove(); document.removeEventListener('mousedown', outside); anchor.focus(); };
    const outside = e => { if (!p.contains(/** @type {Node} */ (e.target))) { p.remove(); document.removeEventListener('mousedown', outside); } };
    // keyboard: Enter in the search picks the first match, arrows move through the two-column list
    p.addEventListener('keydown', e => {
      const opts = [...list.querySelectorAll('.opt')], at = opts.indexOf(document.activeElement);
      const step = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target === inp && opts.length) { e.preventDefault(); opts[0].click(); }
      else if (e.key === 'ArrowDown' && e.target === inp) { e.preventDefault(); opts[0]?.focus(); }
      else if (step && at >= 0) { e.preventDefault(); (at + step < 0 ? inp : opts[Math.min(opts.length - 1, at + step)]).focus(); }
    });
    list.onclick = e => { const o = e.target.closest('.opt'); if (o) { close(); cb(o.dataset.k); } };
    cats.onclick = e => { const c = e.target.dataset?.c; if (c) { cat = c; LS.set('pickCat', c); inp.value = ''; fill(); } };
    full.onchange = () => { LS.set('pickFull', full.checked); fill(); };
    inp.oninput = fill; fill();
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();                                // below the button, kept on screen (narrow windows shrink it)
    p.style.left = Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + 'px';
    p.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - p.offsetHeight - 8)) + 'px';
    inp.focus();
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }

  return { build, paint };
}
