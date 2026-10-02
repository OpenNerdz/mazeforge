// The seed browser: twelve thumbnails of the current settings with neighbouring seeds.
import { $, toast } from './dom.js';

export function createSeeds(app) {
  let base = 0, job = 0;
  function open(start) {
    base = start; const my = ++job, grid = $('#seedGrid'), P = app.store.P;
    const top = ['maze', 'cross', 'tee'].includes(P.piece);
    grid.innerHTML = '';
    const seeds = Array.from({ length: 12 }, (_, i) => start + i);
    const cards = seeds.map(sd => {
      const c = document.createElement('div'); c.className = 'seedcard' + (sd === app.store.P.seed ? ' cur' : ''); c.innerHTML = `<div class="wait">…</div><span>${sd}</span>`;
      c.onclick = () => { app.store.P.seed = sd; app.changed(); $('#dlgSeeds').close(); toast(`Seed ${sd}`); };
      grid.appendChild(c); return c;
    });
    // one at a time, so choosing a seed (or paging on) never waits behind a queue of thumbnails
    (async () => {
      for (let i = 0; i < seeds.length && my === job && $('#dlgSeeds').open; i++) {
        const { thumb } = await app.engine.thumb({ ...P, seed: seeds[i] }, top);
        if (my !== job) return;
        const cv = document.createElement('canvas'); cv.width = thumb.w; cv.height = thumb.h;
        cv.getContext('2d').putImageData(new ImageData(thumb.pixels, thumb.w, thumb.h), 0, 0);
        cards[i].querySelector('.wait').remove(); cards[i].prepend(cv);
      }
    })().catch(err => toast(err.message, 'err'));
  }
  $('#seeds').onclick = () => { $('#dlgSeeds').showModal(); open(app.store.P.seed); };
  $('#seedMore').onclick = e => { e.preventDefault(); open(base + 12); };
  $('#dlgSeeds').addEventListener('close', () => { job++; });
}
