// Small DOM helpers shared by the UI modules.

/** @type {(s: string, root?: ParentNode) => any} */
export const $ = (s, root = document) => root.querySelector(s);
/** @type {(s: string, root?: ParentNode) => NodeListOf<any>} */
export const $$ = (s, root = document) => root.querySelectorAll(s);
export const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const safeName = s => (s || 'wall').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'wall';
export const randSeed = () => (Math.random() * 1e6) | 0;
// bytes -> base64, in slices: one String.fromCharCode call per byte would overflow the call stack on big files
export const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

// a JSON request to the local server; its { error } becomes the thrown message
export async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}

// per-viewer preferences in localStorage (silently unavailable in private windows)
export const LS = {
  get(k, d) { try { const v = localStorage.getItem('mss.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mss.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// popovers sit in the top layer: re-showing one moves it above anything opened since, such as a modal dialog
function raise(el) {
  if (!el.showPopover) return;                                          // no popover support: a plain fixed element
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
}

export function toast(msg, kind = '') {
  const box = $('#toasts');
  if ([...box.children].some(c => c.textContent === msg)) return;      // the same message is already showing
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
  raise(box);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, kind === 'err' ? 6000 : 3200);
}
export const copyText = (text, done = 'Copied') => navigator.clipboard.writeText(text).then(() => toast(done, 'ok'), () => toast('Could not copy', 'err'));

export function download(bytes, name, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// block names and icons (a sprite from the texture atlas, 32 tiles per row)
export const nice = k => k.replace(/\|.*/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export function icon(library, k) {
  const t = library[k.split('|')[0]]?.icon;
  return t === undefined ? '<i class="tx"></i>' : `<i class="tx" style="--x:${t % 32};--y:${Math.floor(t / 32)}"></i>`;
}

// tooltips for anything with data-tip: one floating element, so they are never clipped by a scrolling panel
export function installTooltips() {
  // icon-only buttons are named by their tip, including ones drawn later (details card, palette chips, folder list)
  const name = root => [root, ...root.querySelectorAll('button[data-tip]')].forEach(b => {
    if (b.matches?.('button[data-tip]') && !b.hasAttribute('aria-label')) b.setAttribute('aria-label', b.dataset.tip);
  });
  name(document);
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n instanceof Element) name(n); })))
    .observe(document.body, { childList: true, subtree: true });
  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.popover = 'manual'; document.body.appendChild(tip); raise(tip);
  const show = e => {
    const t = e.target.closest?.('[data-tip]'); if (!t) return;
    if (e.type === 'focusin' && !e.target.matches(':focus-visible')) return;  // a click focuses too: tips follow the keyboard only
    if (document.querySelector('dialog[open]')) { tip.classList.remove('on'); raise(tip); void tip.offsetWidth; }  // above the dialog
    tip.textContent = t.dataset.tip; tip.classList.add('on');
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 12)) + 'px';
    tip.style.top = (r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  };
  const hide = e => { const t = e.target.closest?.('[data-tip]'); if (t && !t.contains(e.relatedTarget)) tip.classList.remove('on'); };
  document.addEventListener('mousedown', () => tip.classList.remove('on'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') tip.classList.remove('on'); });
  document.addEventListener('mouseover', show); document.addEventListener('focusin', show);
  document.addEventListener('mouseout', hide); document.addEventListener('focusout', hide);
}

// Bars marked data-fit-max collapse one step at a time (labels shorten, then hide, then wrap) until their
// contents fit; the CSS decides what each step does through [data-fit~="n"].
function fitBar(el) {
  const max = +el.dataset.fitMax, cs = getComputedStyle(el), gap = parseFloat(cs.columnGap) || 0, pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const need = () => {
    const kids = [...el.children].filter(c => c.getClientRects().length && getComputedStyle(c).position !== 'absolute');
    return kids.reduce((a, c) => a + c.offsetWidth, 0) + gap * Math.max(0, kids.length - 1) + pad;
  };
  let n = 0; el.dataset.fit = '';
  while (n < max && need() > el.clientWidth + 0.5) el.dataset.fit += ' ' + ++n;
}
export const fitBars = () => $$('[data-fit-max]').forEach(fitBar);
export function installFitBars(...extra) {
  const ro = new ResizeObserver(() => requestAnimationFrame(fitBars));
  [...$$('[data-fit-max]'), ...extra].forEach(el => ro.observe(el));
  document.fonts?.ready.then(fitBars);
}
