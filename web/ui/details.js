// The details card (bottom right): a one-line summary that opens to the paste commands and the block list.
import { $, LS, safeName, nice, icon, copyText, esc } from './dom.js';

const stackText = n => { const st = Math.floor(n / 64), r = n % 64, sh = n / 1728; return sh >= 1 ? `${sh.toFixed(1)} shulkers` : st ? `${st} st${r ? ' + ' + r : ''}` : `${n}`; };

export function createDetails(app) {
  let all = false, last = null;
  const el = $('#stats');

  // g: the design; rows: [[block, count], …] most used first; ms: build time (0 = an opened file)
  function show(g, rows, ms) {
    last = { g, rows, ms };
    const P = app.store.P, total = rows.reduce((a, r) => a + r[1], 0), open = LS.get('statsOpen', false), only = app.isolated;
    const sf = safeName(LS.get('subfolder', 'studio')), load = `//schem load ${sf ? sf + '/' : ''}${safeName(P.name)}`;
    const time = ms < 1000 ? ms.toFixed(0) + ' ms' : (ms / 1000).toFixed(1) + ' s', list = all ? rows : rows.slice(0, 8);
    const pct = n => { const v = n / total * 100; return v >= 1 ? v.toFixed(0) + '%' : '<1%'; };
    const copy = cmd => `<div class="cmd"><code>${cmd}</code><button class="btn icon quiet" data-copy="${cmd}" data-tip="Copy"><svg class="i"><use href="#i-copy"/></svg></button></div>`;
    el.classList.toggle('min', !open);
    el.innerHTML = `<button class="st-head" id="statsToggle"><b>${g.W} × ${g.H} × ${g.D}</b><span>${total.toLocaleString()} blocks</span><svg class="i"><use href="#i-chev"/></svg></button>
      <div class="st-body">
        <p class="st-meta">${rows.length} block types${g.faces ? ` · ${g.faces} faces` : ''}${ms ? ` · built in ${time}` : ''}</p>
        ${app.viewing ? '' : `<div class="st-paste"><p>Stand on the <b>paste spot</b>, face north, then:</p>${copy(load)}${copy('//paste -a')}</div>`}
        <div class="st-sub"><span>Blocks</span><button class="linkbtn" id="copyBom" data-tip="Copy the list with stack counts, for a survival build">Copy list</button></div>
        <div class="bom">${list.map(([k, n]) => `<button class="bom-row${only === k ? ' on' : ''}" data-k="${esc(k)}" data-tip="${n.toLocaleString()} blocks · ${stackText(n)} — click to show only this block">
          <i class="fill" style="width:${n / rows[0][1] * 100}%"></i>${icon(app.library, k)}<span>${esc(nice(k))}</span><b>${n.toLocaleString()}</b><em>${pct(n)}</em></button>`).join('')}</div>
        ${rows.length > 8 ? `<button class="linkbtn more-bom" id="bomAll">${all ? 'Show fewer' : `Show all ${rows.length}`}</button>` : ''}
        ${only ? '<button class="linkbtn" id="bomClear">Show all blocks in 3D</button>' : ''}
      </div>`;
    $('#statsToggle').onclick = () => { LS.set('statsOpen', !open); redraw(); };
    el.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copyText(b.dataset.copy); });
    el.querySelectorAll('.bom-row').forEach(b => { b.onclick = () => app.isolate(only === b.dataset.k ? null : b.dataset.k); });
    if (rows.length > 8) $('#bomAll').onclick = () => { all = !all; redraw(); };
    if (only) $('#bomClear').onclick = () => app.isolate(null);
    $('#copyBom').onclick = () => copyText(`${P.name} — ${g.W}×${g.H}×${g.D}, ${total.toLocaleString()} blocks\n`
      + rows.map(([k, n]) => `${String(n).padStart(7)}  ${nice(k).padEnd(28)} ${n >= 64 ? stackText(n) : ''}`).join('\n'), 'Block list copied');
  }
  const redraw = () => last && show(last.g, last.rows, last.ms);
  return { show, redraw };
}
