// Public preview materials, or textures imported from this computer's own game files.
export async function assetBase() {
  try {
    const r = await fetch('/api/assets');
    if (r.ok && (await r.json()).local) return 'local-textures';
  } catch { /* A plain static host uses the bundled preview materials. */ }
  return 'textures';
}

export async function loadLibrary(base) {
  base ||= await assetBase();
  const r = await fetch(`${base}/library.json`);
  if (!r.ok) throw new Error('The block library could not be loaded. Extract the complete release and restart.');
  const library = await r.json();
  if (base === 'local-textures') try {
    const meta = await fetch(`${base}/metadata.json`).then(r => r.ok ? r.json() : null);
    if (Number.isInteger(meta?.dataVersion)) Object.defineProperty(library, 'dataVersion', { value: meta.dataVersion });
  } catch { /* Older local imports use the bundled library's data version. */ }
  return library;
}
