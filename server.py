#!/usr/bin/env python3
"""MazeForge — local server.

Serves the web app and saves generated .schem files straight into the
WorldEdit schematics folders it finds on this PC. Only listens on 127.0.0.1.
"""
import base64
import contextlib
import ctypes
import glob
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import threading
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOME = Path.home()
FROZEN = getattr(sys, 'frozen', False)
IS_WIN, IS_MAC = sys.platform.startswith('win'), sys.platform == 'darwin'
BUNDLE = Path(__file__).resolve().parent


def workspace_dir():
    """Keep desktop data outside temporary bundles and read-only app installations."""
    if not FROZEN:
        return BUNDLE
    if IS_WIN:
        return Path(os.environ.get('LOCALAPPDATA') or HOME / 'AppData/Local') / 'MazeForge'
    if IS_MAC:
        return HOME / 'Library/Application Support/MazeForge'
    return Path(os.environ.get('XDG_DATA_HOME') or HOME / '.local/share') / 'mazeforge'


APP = workspace_dir()
WEB = BUNDLE / 'web'
EXPORTS = APP / 'exports'
PORT = 8765
DISCOVERED = []
SAFE = re.compile(r'^[A-Za-z0-9_\-]{0,60}$')
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/json', '.json')


# ---------------------------------------------------------------- folder discovery
# Every launcher keeps its instances somewhere different, on every OS. We gather
# candidate "game folders" (the folder that holds mods/, config/, saves/) from all
# the usual places, then work out where WorldEdit keeps its schematics in each.

CUSTOM_FILE = APP / 'folders.json'          # extra folders the user added in the app


def local_textures():
    return APP / 'local-textures' if FROZEN else WEB / 'local-textures'


def data_dirs():
    """Per-user application data folders for this OS (where launchers live)."""
    if IS_WIN:
        env = os.environ
        return [Path(p) for p in {env.get('APPDATA') or HOME / 'AppData/Roaming',
                                  env.get('LOCALAPPDATA') or HOME / 'AppData/Local'}]
    if IS_MAC:
        return [HOME / 'Library/Application Support']
    xdg = os.environ.get('XDG_DATA_HOME')
    out = [Path(xdg) if xdg else HOME / '.local/share', HOME / '.config']
    # Flatpak installs keep their data in a sandbox
    for app_id in ('org.prismlauncher.PrismLauncher', 'org.polymc.PolyMC', 'org.multimc.MultiMC',
                   'com.modrinth.ModrinthApp', 'com.modrinth.theseus', 'com.atlauncher.ATLauncher', 'io.gdevs.GDLauncher'):
        app = HOME / '.var/app' / app_id
        if is_dir(app):
            out += [app / 'data', app / 'config', app / '.local/share']
    return out


def gl(base, pat):
    """glob pat under base, treating base literally (instance names can contain [ ] etc.)."""
    return sorted(glob.glob(os.path.join(glob.escape(str(base)), pat)))


def cfg_value(path, key):
    try:
        for line in Path(path).read_text(errors='ignore').splitlines():
            if line.startswith(key + '='):
                return line.split('=', 1)[1].strip()
    except OSError:
        pass
    return None


# launcher folder names (as found inside the data dirs) -> (label, instance folder pattern)
LAUNCHERS = [
    ('PrismLauncher', 'Prism', 'instances/*'),
    ('org.prismlauncher.PrismLauncher', 'Prism', 'instances/*'),
    ('PolyMC', 'PolyMC', 'instances/*'),
    ('multimc', 'MultiMC', 'instances/*'),
    ('MultiMC', 'MultiMC', 'instances/*'),
    ('ModrinthApp', 'Modrinth', 'profiles/*'),
    ('com.modrinth.theseus', 'Modrinth', 'profiles/*'),
    ('ATLauncher', 'ATLauncher', 'instances/*'),
    ('gdlauncher_next', 'GDLauncher', 'instances/*'),
    ('gdlauncher_carbon/data', 'GDLauncher', 'instances/*/instance'),
    ('.technic', 'Technic', 'modpacks/*'),
    ('technic', 'Technic', 'modpacks/*'),
    ('Feather/user-mods', 'Feather', '*'),
]


def launcher_roots():
    """(label, instance glob) pairs for every launcher install we can find."""
    roots = []
    for base in data_dirs():
        for folder, label, pat in LAUNCHERS:
            d = base / folder
            if is_dir(d):
                roots.append((label, d, pat))
                # Prism / MultiMC / PolyMC let you move the instances folder
                for cfg in ('prismlauncher.cfg', 'multimc.cfg', 'polymc.cfg'):
                    inst = cfg_value(d / cfg, 'InstanceDir')
                    if inst:
                        p = Path(inst) if Path(inst).is_absolute() else d / inst
                        roots.append((label, p, '*'))
    # CurseForge keeps instances in the user folder
    for d in [HOME / 'curseforge/minecraft/Instances', HOME / 'Documents/Curse/Minecraft/Instances']:
        roots.append(('CurseForge', d, '*'))
    return roots


def game_dir(inst):
    """An instance folder -> the folder the game actually runs in."""
    for sub in ('minecraft', '.minecraft'):
        if is_dir(inst / sub):
            return inst / sub
    return inst


def instance_name(inst):
    n = cfg_value(inst / 'instance.cfg', 'name')
    if not n:
        try:
            n = json.loads((inst / 'profile.json').read_text()).get('name')
        except Exception:  # noqa: BLE001
            n = None
    return n or inst.name


def is_dir(p):
    """Path.is_dir that treats an unreadable folder as missing instead of raising (Python 3.12+ raises)."""
    try:
        return p.is_dir()
    except OSError:
        return False


def looks_like_game(d):
    try:
        return any((d / s).exists() for s in ('mods', 'config', 'saves', 'options.txt', 'server.properties', 'plugins'))
    except OSError:
        return False


def schem_folders(g):
    """Where WorldEdit reads schematics from in game folder g: [(path, has_worldedit)]."""
    out = []
    for plug in ('WorldEdit', 'FastAsyncWorldEdit'):          # Bukkit / Paper / Spigot servers
        if is_dir(g / 'plugins' / plug):
            out.append((g / 'plugins' / plug / 'schematics', True))
    has = is_dir(g / 'config/worldedit')
    if not has and is_dir(g / 'mods'):
        with contextlib.suppress(OSError):
            has = any(re.search(r'worldedit|fawe', f.name, re.I) for f in (g / 'mods').iterdir())
    if has or not out:
        out.append((g / 'config/worldedit/schematics', has))
    return out


def load_custom():
    try:
        return [p for p in json.loads(CUSTOM_FILE.read_text()) if isinstance(p, str)]
    except Exception:  # noqa: BLE001
        return []


def save_custom(paths):
    CUSTOM_FILE.write_text(json.dumps(sorted(set(paths)), indent=1))


def find_targets(discover=False):
    out, seen = [dict(t) for t in DISCOVERED], {os.path.normcase(t['path']) for t in DISCOVERED}

    def add(g, label, kind, custom=None):
        try:
            g = g.resolve()
        except OSError:
            return
        if label.lower() in ('run', 'server', 'minecraft', '.minecraft', 'instance') and label != 'Minecraft':
            label = g.parent.name
        for sch, has in schem_folders(g):
            key = os.path.normcase(str(sch))
            if key in seen:
                continue
            seen.add(key)
            has = has or bool(custom)
            out.append({'path': str(sch), 'label': label, 'kind': kind, 'worldedit': has, 'custom': custom,
                        'default': has and 'maze' in label.lower()})

    if discover:
        # vanilla launcher (also used by the Microsoft Store / Xbox app launcher)
        for base in data_dirs():
            for name in ('.minecraft', 'minecraft'):
                if is_dir(base / name) and looks_like_game(base / name):
                    add(base / name, 'Minecraft', 'Official launcher')
        if not IS_WIN and not IS_MAC and is_dir(HOME / '.minecraft'):
            add(HOME / '.minecraft', 'Minecraft', 'Official launcher')

        for label, root, pat in launcher_roots():
            for inst in gl(root, pat):
                inst = Path(inst)
                if is_dir(inst) and looks_like_game(game_dir(inst)):
                    add(game_dir(inst), instance_name(inst), label)

        DISCOVERED[:] = [dict(t) for t in out]

    # folders the user added by hand
    for c in load_custom():
        p = Path(c)
        if not is_dir(p):
            out.append({'path': c, 'label': p.name or c, 'kind': 'Added folder — not found', 'worldedit': False,
                        'custom': c, 'missing': True, 'default': False})
            continue
        if looks_like_game(game_dir(p)):
            add(game_dir(p), instance_name(p), 'Added folder', c)
        elif any(looks_like_game(game_dir(Path(i))) for i in gl(p, '*')):
            for i in sorted(gl(p, '*')):     # an instances folder: take each one
                if looks_like_game(game_dir(Path(i))):
                    add(game_dir(Path(i)), instance_name(Path(i)), 'Added folder', c)
        else:                                               # a plain folder: save straight into it
            key = os.path.normcase(str(p.resolve()))
            if key not in seen:
                seen.add(key)
                out.append({'path': str(p.resolve()), 'label': p.name, 'kind': 'Added folder', 'worldedit': True,
                            'custom': c, 'default': False})

    out.sort(key=lambda t: (not t['worldedit'], t['kind'] == 'Added folder — not found', t['label'].lower()))
    # nothing marked as the default: pick the only WorldEdit folder, if there is exactly one
    we = [t for t in out if t['worldedit'] and not t.get('missing')]
    if not any(t['default'] for t in out) and len(we) == 1:
        we[0]['default'] = True
    out.append({'path': str(EXPORTS), 'label': 'Studio exports folder', 'kind': 'This app', 'worldedit': True,
                'custom': None, 'default': False})
    for t in out:                                   # short form for the list: ~ for home, launcher sandbox trimmed
        p = t['path']
        if p.startswith(str(HOME)):
            p = '~' + p[len(str(HOME)):]
        t['short'] = re.sub(r'^~[\\/]\.var[\\/]app[\\/][^\\/]+[\\/]data', '~', p)
    return out


def local_request(h):
    """Only accept requests made by the studio page itself (blocks other websites and DNS rebinding)."""
    host = (h.headers.get('Host') or '').lower()
    if host not in (f'127.0.0.1:{PORT}', f'localhost:{PORT}'):
        return False
    origin = h.headers.get('Origin')
    return origin is None or origin.lower() in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def log_message(self, fmt, *args):
        if sys.stderr and args and isinstance(args[0], str) and '/api/' in args[0]:
            sys.stderr.write('[studio] ' + (fmt % args) + '\n')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')           # always revalidated, so updates show at once
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not local_request(self):
            return self._json(403, {'error': 'forbidden'})
        if self.path == '/api/ping':
            return self._json(200, {'ok': True, 'app': 'mazeforge', 'desktop': FROZEN})
        if self.path == '/api/assets':
            local = all((local_textures() / f).is_file() for f in ('atlas.png', 'library.json'))
            return self._json(200, {'local': local})
        if self.path.startswith('/local-textures/'):
            name = self.path.removeprefix('/local-textures/')
            folder = local_textures()
            path = folder / name
            if name not in ('atlas.png', 'library.json', 'metadata.json') or folder.is_symlink() or not path.resolve().is_relative_to(folder.resolve()):
                return self._json(403, {'error': 'forbidden'})
            if not path.is_file():
                return self._json(404, {'error': 'not found'})
            data = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png' if name.endswith('.png') else 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        if self.path in ('/api/targets', '/api/targets?discover=1'):
            return self._json(200, {'targets': find_targets(discover=self.path.endswith('?discover=1'))})
        if not Path(self.translate_path(self.path)).resolve().is_relative_to(WEB.resolve()):
            return self._json(403, {'error': 'forbidden'})
        return super().do_GET()

    def do_HEAD(self):
        if not local_request(self):
            self.send_response(403)
            self.end_headers()
            return None
        return super().do_HEAD()

    def do_POST(self):
        if self.path not in ('/api/save', '/api/folders', '/api/pick', '/api/textures', '/api/quit'):
            return self._json(404, {'error': 'not found'})
        # JSON only: a cross-site page can't send that without a CORS preflight, which we never answer
        if not local_request(self) or not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return self._json(403, {'error': 'forbidden'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n < 0:
                return self._json(400, {'error': 'invalid content length'})
            if n > 64 * 1024 * 1024:
                return self._json(413, {'error': 'too large'})
            req = json.loads(self.rfile.read(n) or b'{}')
            if not isinstance(req, dict):
                return self._json(400, {'error': 'expected a JSON object'})
            if self.path == '/api/quit':
                if not FROZEN:
                    return self._json(404, {'error': 'not available'})
                self._json(200, {'ok': True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return None
            if self.path == '/api/textures':
                return self._textures(req)
            if self.path == '/api/pick':
                return self._json(200, {'path': pick_folder()})
            if self.path == '/api/folders':
                return self._folders(req)
            name, sub = req.get('name', ''), req.get('subfolder', '')
            if not isinstance(name, str) or not isinstance(sub, str) or not name or not SAFE.fullmatch(name) or not SAFE.fullmatch(sub):
                return self._json(400, {'error': 'invalid file or folder name'})
            if not isinstance(req.get('targets'), list) or not all(isinstance(t, str) for t in req['targets']):
                return self._json(400, {'error': 'expected a list of target folders'})
            data = base64.b64decode(req['data'], validate=True)
            if data[:2] != b'\x1f\x8b':
                return self._json(400, {'error': 'not a gzip schematic'})
            allowed = {t['path'] for t in find_targets()}
            results = []
            for t in dict.fromkeys(req['targets']):
                if t not in allowed:
                    results.append({'path': t, 'ok': False, 'error': 'folder not allowed'})
                    continue
                folder = Path(t) / sub if sub else Path(t)
                dest = folder / f'{name}.schem'
                try:
                    if not dest.resolve().is_relative_to(Path(t).resolve()):
                        results.append({'path': str(dest), 'ok': False, 'error': 'path leaves the selected folder'})
                        continue
                    if dest.exists() and not req.get('overwrite'):
                        results.append({'path': str(dest), 'ok': False, 'error': f'{name}.schem already exists (tick Overwrite)'})
                        continue
                    folder.mkdir(parents=True, exist_ok=True)
                    with tempfile.NamedTemporaryFile(dir=folder, suffix='.schem.tmp', delete=False) as f:
                        tmp = Path(f.name)
                    try:
                        tmp.write_bytes(data)
                        os.replace(tmp, dest)
                    finally:
                        tmp.unlink(missing_ok=True)
                    results.append({'path': str(dest), 'ok': True})
                except OSError as e:
                    results.append({'path': str(dest), 'ok': False, 'error': str(e)})
            # keep a copy in the studio's own exports folder whenever a save went through
            if any(r['ok'] for r in results):
                with contextlib.suppress(OSError):
                    EXPORTS.mkdir(exist_ok=True)
                    (EXPORTS / f'{name}.schem').write_bytes(data)
            return self._json(200, {'results': results})
        except (ValueError, TypeError, KeyError):
            return self._json(400, {'error': 'invalid request data'})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {'error': str(e)})

    def _textures(self, req):
        local = local_textures()
        if local.is_symlink():
            return self._json(400, {'error': 'local texture folder must be inside the app'})
        if req.get('reset') is True:
            for name in ('atlas.png', 'library.json', 'metadata.json'):
                (local / name).unlink(missing_ok=True)
            return self._json(200, {'ok': True})
        library, metadata = req.get('library'), req.get('metadata')
        if not isinstance(library, dict) or not 1 <= len(library) <= 10000 or not isinstance(metadata, dict):
            return self._json(400, {'error': 'invalid texture library'})
        if not isinstance(metadata.get('dataVersion'), int) or not 1952 <= metadata['dataVersion'] <= 100000:
            return self._json(400, {'error': 'unsupported game version'})
        if not isinstance(metadata.get('version'), str) or len(metadata['version']) > 60:
            return self._json(400, {'error': 'invalid game version'})
        for key, entry in library.items():
            if not re.fullmatch(r'[a-z0-9_]{1,100}', key) or key in ('__proto__', 'constructor', 'prototype'):
                return self._json(400, {'error': 'invalid block name'})
            if not isinstance(entry, dict) or entry.get('id') != f'minecraft:{key}' or not re.fullmatch(r'#[0-9a-fA-F]{6}', str(entry.get('color'))):
                return self._json(400, {'error': 'invalid block metadata'})
            tiles = entry.get('faces', [entry.get('icon')])
            if not isinstance(tiles, list) or not 1 <= len(tiles) <= 6 or not all(isinstance(t, int) and 0 <= t < 4096 for t in tiles):
                return self._json(400, {'error': 'invalid texture index'})
        atlas = base64.b64decode(req.get('atlas', ''), validate=True)
        if len(atlas) < 24 or atlas[:8] != b'\x89PNG\r\n\x1a\n' or int.from_bytes(atlas[16:20], 'big') != 512:
            return self._json(400, {'error': 'invalid preview atlas'})
        height = int.from_bytes(atlas[20:24], 'big')
        if not 16 <= height <= 2048 or height % 16:
            return self._json(400, {'error': 'invalid preview dimensions'})
        local.mkdir(exist_ok=True)
        # Write only these three fixed files, never archive paths or user-provided names.
        with tempfile.TemporaryDirectory(dir=local.parent) as staging:
            stage = Path(staging)
            (stage / 'atlas.png').write_bytes(atlas)
            (stage / 'library.json').write_text(json.dumps(library, separators=(',', ':')))
            (stage / 'metadata.json').write_text(json.dumps(metadata))
            for name in ('atlas.png', 'library.json', 'metadata.json'):
                os.replace(stage / name, local / name)
        return self._json(200, {'ok': True})

    def _folders(self, req):
        paths = load_custom()
        if req.get('add'):
            p = Path(os.path.expandvars(os.path.expanduser(str(req['add']).strip().strip('"'))))
            if not p.is_absolute():
                return self._json(400, {'error': 'use a full path, e.g. ' + (r'C:\Users\you\AppData\Roaming\.minecraft' if IS_WIN else '~/.minecraft')})
            if not is_dir(p):
                return self._json(400, {'error': f'folder not found: {p}'})
            before = {t['path'] for t in find_targets()}
            save_custom(paths + [str(p.resolve())])
            added = [t['path'] for t in find_targets() if t['path'] not in before]
            return self._json(200, {'targets': find_targets(), 'added': added})
        if req.get('remove'):
            save_custom([c for c in paths if c != req['remove']])
        return self._json(200, {'targets': find_targets()})


# Linux: ask the desktop's own file chooser (KDE / GNOME / ...) through the XDG portal
PORTAL_PICK = r"""
import sys, urllib.parse
from gi.repository import Gio, GLib
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
token = 'mss' + str(abs(hash(GLib.get_monotonic_time())))
sender = bus.get_unique_name()[1:].replace('.', '_')
path = f'/org/freedesktop/portal/desktop/request/{sender}/{token}'
loop, out = GLib.MainLoop(), {}
def done(conn, snd, obj, iface, sig, params):
    code, res = params.unpack()
    uris = res.get('uris') or []
    out['p'] = urllib.parse.unquote(urllib.parse.urlparse(uris[0]).path) if code == 0 and uris else ''
    loop.quit()
bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response', path, None, 0, done)
opts = {'handle_token': GLib.Variant('s', token), 'directory': GLib.Variant('b', True), 'modal': GLib.Variant('b', True)}
bus.call_sync('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.FileChooser',
              'OpenFile', GLib.Variant('(ssa{sv})', ('', 'Choose a Minecraft folder', opts)), None, 0, -1, None)
loop.run()
print(out.get('p', ''))
"""

# Windows: tk's askdirectory is the standard Explorer "Select Folder" dialog there
TK_PICK = ('import tkinter as t, tkinter.filedialog as f; r = t.Tk(); r.withdraw(); r.attributes("-topmost", True); '
           'print(f.askdirectory(title="Choose a Minecraft folder") or "")')
WIN_PICK = ('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; '
            'Add-Type -AssemblyName System.Windows.Forms; '
            '$picker = New-Object System.Windows.Forms.FolderBrowserDialog; '
            '$picker.Description = "Choose a Minecraft folder"; '
            'if ($picker.ShowDialog() -eq "OK") { [Console]::WriteLine($picker.SelectedPath) }')


def external_env():
    """System folder pickers and browsers must use system libraries, not bundled ones."""
    env = os.environ.copy()
    if FROZEN:
        if 'LD_LIBRARY_PATH_ORIG' in env:
            env['LD_LIBRARY_PATH'] = env['LD_LIBRARY_PATH_ORIG']
        else:
            env.pop('LD_LIBRARY_PATH', None)
    return env


def run_system(cmd, **kwargs):
    if FROZEN and IS_WIN:
        # Restore Windows' normal DLL lookup for external programs.
        ctypes.windll.kernel32.SetDllDirectoryW(None)
        kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
    return subprocess.run(cmd, env=external_env(), check=False, **kwargs)


def pick_folder():
    """Open this PC's own folder picker; returns the chosen path or ''."""
    if IS_WIN:
        tries = [['powershell.exe', '-NoProfile', '-STA', '-Command', WIN_PICK]] if FROZEN else [[sys.executable, '-c', TK_PICK]]
    elif IS_MAC:
        tries = [['osascript', '-e', 'POSIX path of (choose folder with prompt "Choose a Minecraft folder")']]
    else:
        kde = 'KDE' in os.environ.get('XDG_CURRENT_DESKTOP', '').upper()
        tries = [] if FROZEN else [[sys.executable, '-c', PORTAL_PICK]]
        tries += [['kdialog', '--getexistingdirectory', str(HOME), '--title', 'Choose a Minecraft folder']] if kde else []
        tries += [['zenity', '--file-selection', '--directory', '--title=Choose a Minecraft folder'],
                  ['kdialog', '--getexistingdirectory', str(HOME)]]
        if not FROZEN:
            tries.append([sys.executable, '-c', TK_PICK])
    for cmd in tries:
        try:
            r = run_system(cmd, capture_output=True, text=True, encoding='utf-8', timeout=600)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if r.returncode == 0:
            return r.stdout.strip()
        if r.returncode == 1 and (not r.stderr.strip() or 'cancel' in r.stderr.lower()):   # cancelled
            return ''
    raise RuntimeError('no folder picker available here — paste the path instead')


def already_running():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/ping', timeout=1) as r:
            return json.loads(r.read()).get('app') == 'mazeforge'
    except Exception:  # noqa: BLE001
        return False


def open_workspace(url):
    if FROZEN and not IS_WIN and not IS_MAC:
        subprocess.Popen(['xdg-open', url], env=external_env())
    else:
        webbrowser.open(url)


def main():
    APP.mkdir(parents=True, exist_ok=True, mode=0o700)
    url = f'http://127.0.0.1:{PORT}/'
    open_browser = '--no-browser' not in sys.argv
    if already_running():
        print('Studio already running at', url)
        if open_browser:
            open_workspace(url)
        return
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print('MazeForge running at', url, '(Ctrl+C to stop)')
    if open_browser:
        threading.Timer(0.6, lambda: open_workspace(url)).start()
    with contextlib.suppress(KeyboardInterrupt):
        srv.serve_forever()
    srv.server_close()


if __name__ == '__main__':
    try:
        main()
    except OSError:
        if not FROZEN:
            raise
        message = ('MazeForge could not start. Another program may be using port 8765, '
                   'or your application data folder may not be writable. '
                   'Close other copies of MazeForge and try again.')
        if IS_WIN:
            ctypes.windll.user32.MessageBoxW(None, message, 'MazeForge — Could not start', 0x10)
        elif IS_MAC:
            run_system(['osascript', '-e', f'display alert "MazeForge could not start" message "{message}" as critical'])
        else:
            with contextlib.suppress(OSError):
                run_system(['zenity', '--error', '--title=MazeForge', '--text=' + message])
            print(message, file=sys.stderr)
        sys.exit(1)
