import { $, toast } from './dom.js';

export async function createDesktop() {
  try {
    const response = await fetch('/api/ping');
    if (!response.ok || !(await response.json()).desktop) return;
    const button = $('#quitApp');
    button.classList.remove('hidden');
    button.onclick = async () => {
      try {
        const result = await fetch('/api/quit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!result.ok) throw new Error('Could not quit MazeForge.');
        document.body.replaceChildren();
        const message = document.createElement('p');
        message.style.cssText = 'margin:48px;text-align:center';
        message.textContent = 'MazeForge is closed. You can close this tab. Double-click the app to start again.';
        document.body.append(message);
      } catch (err) { toast(err.message, 'err'); }
    };
  } catch { /* The source and static versions do not need desktop controls. */ }
}
