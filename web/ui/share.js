// Share codes: the settings that differ from the defaults, deflated and base64url-encoded: "MSS1.<data>"
import { DEFAULTS } from '../core/settings.js';
import { withDefaults } from './state.js';
import { $, toast, copyText } from './dom.js';

const b64url = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function shareCode(P) {
  const diff = {};
  for (const k in P) if (JSON.stringify(P[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = P[k];
  return 'MSS1.' + b64url(await pipe(new TextEncoder().encode(JSON.stringify(diff)), new CompressionStream('deflate-raw')));
}
export async function readCode(code) {
  const m = /MSS1\.([A-Za-z0-9_-]+)/.exec(code || ''); if (!m) throw new Error('not a share code');
  return withDefaults(JSON.parse(new TextDecoder().decode(await pipe(unb64url(m[1]), new DecompressionStream('deflate-raw')))));
}

export function createSharing(app) {
  const load = async code => app.load(await readCode(code));
  $('#share').onclick = async () => {
    const code = await shareCode(app.store.P);
    $('#shareCode').value = code; $('#shareLink').value = `${location.origin}${location.pathname}#${code}`; $('#shareIn').value = '';
    $('#dlgShare').showModal();
  };
  $('#copyCode').onclick = e => { e.preventDefault(); copyText($('#shareCode').value); };
  $('#copyLink').onclick = e => { e.preventDefault(); copyText($('#shareLink').value); };
  $('#loadShare').onclick = async e => {
    e.preventDefault();
    try { await load($('#shareIn').value); $('#dlgShare').close(); toast('Design loaded', 'ok'); } catch (err) { toast('Could not load: ' + err.message, 'err'); }
  };
  // a design passed in the link: #MSS1.…
  return async () => {
    if (!location.hash.includes('MSS1.')) return;
    try { await load(location.hash); toast('Design loaded from link', 'ok'); } catch (err) { toast('Link code invalid: ' + err.message, 'err'); app.regenerate(); }
    history.replaceState(null, '', location.pathname);
  };
}
