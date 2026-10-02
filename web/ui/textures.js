import { importTextures } from '../core/texture-import.js';
import { $, toast } from './dom.js';

export function createTextureImport(app) {
  $('#textures').onclick = () => $('#dlgTextures').showModal();
  $('#chooseTextures').onclick = () => $('#textureFile').click();
  $('#textureFile').onchange = async () => {
    const file = $('#textureFile').files[0]; if (!file) return;
    const button = $('#chooseTextures'), status = $('#textureStatus');
    button.disabled = true;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('Choose a client JAR smaller than 128 MB.');
      status.textContent = 'Reading the selected archive…';
      const result = await importTextures(await file.arrayBuffer(), app.library,
        n => { status.textContent = `Importing textures… ${Math.round(n * 100)}%`; });
      const bytes = new Uint8Array(await result.atlas.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const response = await fetch('/api/textures', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library: result.library, atlas: btoa(binary), metadata: result.metadata }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save the local textures.');
      status.textContent = `Imported Minecraft ${result.metadata.version}. Reloading your workspace…`;
      location.reload();
    } catch (err) { status.textContent = err.message; toast('Texture import failed: ' + err.message, 'err'); }
    finally { button.disabled = false; $('#textureFile').value = ''; }
  };
  $('#resetTextures').onclick = async () => {
    try {
      const response = await fetch('/api/textures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
      if (!response.ok) throw new Error('Could not reset local textures.');
      location.reload();
    } catch (err) { toast(err.message, 'err'); }
  };
}
