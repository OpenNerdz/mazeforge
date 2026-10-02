// The Faces section: give any one face of a piece its own layout or variation.
import { LAYOUT_NAMES } from '../core/layouts.js';

const DIRNAME = { s: 'south', e: 'east', n: 'north', w: 'west' };

export function createFaces(app) {
  let el = null, list = [], shown = '';
  const P = () => app.store.P;

  function render() {
    if (!el) return;
    el.innerHTML = '';
    if (P().piece === 'maze') { el.innerHTML = '<div class="help" style="margin:0">A whole maze has too many faces to set one by one — use Remix or the seed.</div>'; return; }
    if (!list.length) return;
    el.insertAdjacentHTML('beforeend', '<div class="help" style="margin:0 0 6px">Give one face its own layout or variation without changing the others.</div>');
    const opts = { '': 'Auto', ...LAYOUT_NAMES };
    list.forEach((f, n) => {
      const ov = P().faceOverrides[f.i] || {}, r = document.createElement('div');
      r.className = 'role face' + (ov.layout || ov.seed ? ' changed' : ''); r.dataset.search = `face ${DIRNAME[f.dir]} layout seed`;
      r.innerHTML = `<label>${f.primary ? 'Front' : 'Face ' + (n + 1)} <span style="color:var(--faint)">${DIRNAME[f.dir]} · ${f.len}</span></label>
        <div class="facectl"><select>${Object.entries(opts).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select><button data-tip="Previous variation"><svg class="i"><use href="#i-left"/></svg></button><output>${ov.seed | 0}</output><button data-tip="Next variation"><svg class="i"><use href="#i-right"/></svg></button></div>`;
      const sel = r.querySelector('select'), [prev, next] = r.querySelectorAll('button');
      sel.setAttribute('aria-label', `Layout for face ${n + 1}, ${DIRNAME[f.dir]}`);
      prev.setAttribute('aria-label', `Previous variation for face ${n + 1}`);
      next.setAttribute('aria-label', `Next variation for face ${n + 1}`);
      sel.value = ov.layout || '';
      const set = o => {
        const v = { ...ov, ...o }; if (!v.layout) delete v.layout; if (!v.seed) delete v.seed;
        P().faceOverrides = { ...P().faceOverrides, [f.i]: v }; if (!Object.keys(v).length) delete P().faceOverrides[f.i];
        app.store.commit(); app.regenerate();
      };
      sel.onchange = () => set({ layout: sel.value });
      prev.onclick = () => set({ seed: (ov.seed | 0) - 1 }); next.onclick = () => set({ seed: (ov.seed | 0) + 1 });
      el.appendChild(r);
    });
  }
  return {
    mount(body) { el = body; render(); },
    render,
    // a new design came in: redraw only when its faces differ
    update(faceList = []) { const s = JSON.stringify(faceList); if (s !== shown) { shown = s; list = faceList; render(); } },
  };
}
