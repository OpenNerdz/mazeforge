import { $, toast, api } from './dom.js';

export async function createDesktop() {
  try {
    const response = await fetch('/api/ping');
    if (!response.ok || !(await response.json()).desktop) return;
    const button = $('#quitApp');
    button.classList.remove('hidden');
    button.onclick = async () => {
      try {
        await api('/api/quit', {});
        document.body.replaceChildren();
        const message = document.createElement('p');
        message.style.cssText = 'margin:48px;text-align:center';
        message.textContent = 'MazeForge is closed. You can close this tab. Double-click the app to start again.';
        document.body.append(message);
      } catch { toast('Could not quit MazeForge.', 'err'); }
    };
  } catch { /* The source and static versions do not need desktop controls. */ }
}
