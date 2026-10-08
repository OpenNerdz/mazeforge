import { importTextures } from '../core/texture-import.js';
import { $, toast, b64, api } from './dom.js';

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
      const atlas = b64(new Uint8Array(await result.atlas.arrayBuffer()));
      await api('/api/textures', { library: result.library, atlas, metadata: result.metadata });
      status.textContent = `Imported Minecraft ${result.metadata.version}. Reloading your workspace…`;
      location.reload();
    } catch (err) { status.textContent = err.message; toast('Texture import failed: ' + err.message, 'err'); }
    finally { button.disabled = false; $('#textureFile').value = ''; }
  };
  $('#resetTextures').onclick = async () => {
    try {
      await api('/api/textures', { reset: true });
      location.reload();
    } catch (err) { toast('Could not reset local textures: ' + err.message, 'err'); }
  };
}
