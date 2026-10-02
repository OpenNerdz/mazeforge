// Saving: Download, the Save to Minecraft dialog (folders found by the local server), chunked saves and batch export.
import { writeSchem } from '../core/schem.js';
import { $, $$, esc, LS, toast, safeName, download } from './dom.js';

const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}

// big designs split into chunks; every chunk keeps its place relative to the same standing spot,
// so pasting them all from the orange marker rebuilds the whole thing
function chunks(g, size, name) {
  const out = [], nx = Math.ceil(g.W / size), nz = Math.ceil(g.D / size);
  for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) {
    const x0 = cx * size, z0 = cz * size, W = Math.min(size, g.W - x0), D = Math.min(size, g.D - z0), H = g.H;
    const data = new Uint16Array(W * H * D);
    for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
      const src = (y * g.D + z0 + z) * g.W + x0;
      data.set(g.data.subarray(src, src + W), (y * D + z) * W);
    }
    if (data.some(v => v)) out.push({ g: { W, H, D, data, keys: g.keys }, off: [x0, 0, z0 - g.D], name: `${name}_r${cz + 1}c${cx + 1}` });
  }
  return out;
}

export function createSaving(app) {
  const { library } = app, P = () => app.store.P;
  let targets = [];

  function renderTargets(keep) {
    const sel = keep || new Set(LS.get('targets', targets.filter(t => t.default).map(t => t.path)));
    const row = (t, i) => `<label class="target${t.missing ? ' missing' : ''}"><input type="checkbox" data-i="${i}" ${sel.has(t.path) && !t.missing ? 'checked' : ''} ${t.missing ? 'disabled' : ''}>`
      + `<b><span>${esc(t.label)}</span><span class="kind">${esc(t.kind)}</span></b>`
      + (t.custom ? `<button type="button" class="btn icon quiet rm" data-rm="${esc(t.custom)}" data-tip="Remove this added folder"><svg class="i"><use href="#i-x"/></svg></button>` : '')
      + `<small title="${esc(t.path)}">&lrm;${esc(t.short || t.path)}&lrm;</small></label>`;
    const idx = targets.map((t, i) => [t, i]), ready = idx.filter(([t]) => t.worldedit || t.missing), later = idx.filter(([t]) => !t.worldedit && !t.missing);
    $('#targets').innerHTML = (ready.some(([t]) => t.kind !== 'This app') ? ready.map(([t, i]) => row(t, i)).join('') : '<p class="muted">No WorldEdit folders found. Add one below, or use Download.</p>')
      + (later.length ? `<details ${later.some(([t]) => sel.has(t.path)) ? 'open' : ''}><summary>${later.length} more instance${later.length > 1 ? 's' : ''} without WorldEdit yet</summary>${later.map(([t, i]) => row(t, i)).join('')}</details>` : '');
  }
  async function loadTargets(keep, discover = false) {
    try { targets = (await (await fetch('/api/targets' + (discover ? '?discover=1' : ''))).json()).targets || []; } catch { targets = []; }
    renderTargets(keep);
  }
  const chosen = () => [...$$('#targets input:checked')].map(c => targets[+c.dataset.i]?.path).filter(Boolean);
  async function addFolder(path) {
    if (!path.trim()) return;
    const keep = new Set(chosen());
    try {
      const j = await api('/api/folders', { add: path }); targets = j.targets; j.added.forEach(p => keep.add(p));
      renderTargets(keep); $('#addPath').value = '';
      toast(j.added.length ? `Added ${j.added.length} folder${j.added.length > 1 ? 's' : ''}` : 'Already in the list', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }
  async function saveBytes(bytes, name) {
    const body = { name: safeName(name), subfolder: safeName($('#subfolder').value || ''), overwrite: $('#overwrite').checked, targets: chosen(), data: b64(bytes) };
    return (await api('/api/save', body)).results;
  }
  const chunkSize = () => Math.max(16, +$('#chunkSize').value | 0);
  function updateHint() {
    const g = app.current, sf = safeName($('#subfolder').value), pre = sf ? sf + '/' : '', name = safeName(P().name);
    $('#chunkRow').classList.toggle('hidden', !g);
    if (g && Math.max(g.W, g.D) > 64 && !$('#chunked').dataset.touched) $('#chunked').checked = true;
    $('#loadHint').textContent = $('#chunked').checked && g
      ? `${chunks(g, chunkSize(), name).length} files: ${pre}${name}_r1c1 … — stand on the marker, then for each: //schem load <file> and //paste -a (same spot every time)`
      : `//schem load ${pre}${name} then //paste -a`;
  }

  $('#addFolder').onclick = () => addFolder($('#addPath').value);
  $('#addPath').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addFolder($('#addPath').value); } };
  $('#pickFolder').onclick = async () => {
    try { const { path } = await api('/api/pick', {}); if (path) addFolder(path); } catch (err) { toast(err.message, 'err'); $('#addPath').focus(); }
  };
  $('#rescan').onclick = async () => { await loadTargets(new Set(chosen()), true); toast(`Found ${targets.length - 1} folder${targets.length === 2 ? '' : 's'}`, 'ok'); };
  $('#targets').addEventListener('click', async e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    e.preventDefault(); const keep = new Set(chosen());
    try { targets = (await api('/api/folders', { remove: b.dataset.rm })).targets; renderTargets(keep); } catch (err) { toast(err.message, 'err'); }
  });
  $('#export').onclick = async () => {
    if (!app.current) return;
    const name = safeName(P().name); download(await writeSchem(app.current, library), name + '.schem'); toast(`Downloaded ${name}.schem`, 'ok');
  };
  $('#save').onclick = async () => { await loadTargets(); $('#subfolder').value = LS.get('subfolder', 'studio'); updateHint(); $('#dlgSave').showModal(); };
  $('#subfolder').oninput = updateHint; $('#chunkSize').oninput = updateHint;
  $('#chunked').onchange = () => { $('#chunked').dataset.touched = 1; updateHint(); };
  $('#doSave').onclick = async e => {
    e.preventDefault();
    LS.set('targets', chosen()); LS.set('subfolder', $('#subfolder').value);
    if (!chosen().length) return toast('Pick at least one folder', 'err');
    const g = app.current, parts = $('#chunked').checked ? chunks(g, chunkSize(), P().name) : [{ g, off: [0, 0, -g.D], name: P().name }];
    try {
      let ok = 0; const bad = [];
      for (const c of parts) {
        const res = await saveBytes(await writeSchem(c.g, library, c.off), c.name);
        if (res.every(r => r.ok)) ok++; bad.push(...res.filter(r => !r.ok));
      }
      $('#dlgSave').close();
      const what = parts.length > 1 ? `${parts.length} chunks` : `${safeName(P().name)}.schem`;
      toast(bad.length ? `Saved ${ok}/${parts.length}, failed: ${bad[0].error}` : `Saved ${what}`, bad.length ? 'err' : 'ok');
    } catch (err) { toast('Save failed: ' + err.message, 'err'); }
  };

  // batch export: variants of the current design, generated in the background one at a time
  $('#batch').onclick = async () => { await loadTargets(); $('#bSeed').value = P().seed; $('#bBar').style.width = '0'; $('#dlgBatch').showModal(); };
  $('#doBatch').onclick = async e => {
    e.preventDefault();
    const n = Math.max(1, Math.min(100, +$('#bCount').value)), s0 = +$('#bSeed').value, pat = $('#bPattern').value || '{name}_{n}';
    if (!chosen().length) return toast('Choose folders in “Save to Minecraft” first', 'err');
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const q = { ...app.store.P, seed: s0 + i }; if ($('#bNumbers').checked) q.numberText = String(i + 1);
      const name = pat.replace('{name}', P().name).replace('{n}', i + 1).replace('{seed}', s0 + i);
      try { const { design } = await app.engine.design(q); if ((await saveBytes(await writeSchem(design, library), name)).every(x => x.ok)) ok++; }
      catch (err) { toast(err.message, 'err'); break; }
      $('#bBar').style.width = ((i + 1) / n * 100) + '%';
    }
    toast(`Batch done: ${ok}/${n} saved`, ok === n ? 'ok' : 'err');
  };
}
