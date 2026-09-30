#!/usr/bin/env python3
"""Maze Structure Studio — local server.

Serves the web app and saves generated .schem files straight into the
WorldEdit schematics folders it finds on this PC. Only listens on 127.0.0.1.
"""
import base64, glob, json, mimetypes, os, re, subprocess, sys, threading, urllib.request, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parent
WEB = APP / 'web'
EXPORTS = APP / 'exports'
HOME = Path.home()
PORT = 8765
SAFE = re.compile(r'^[A-Za-z0-9_\-]{0,60}$')
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/json', '.json')


# ---------------------------------------------------------------- folder discovery
# Every launcher keeps its instances somewhere different, on every OS. We gather
# candidate "game folders" (the folder that holds mods/, config/, saves/) from all
# the usual places, then work out where WorldEdit keeps its schematics in each.

CUSTOM_FILE = APP / 'folders.json'          # extra folders the user added in the app
IS_WIN, IS_MAC = sys.platform.startswith('win'), sys.platform == 'darwin'


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
    for app in gl(HOME, '.var/app/*'):
        out += [Path(app) / 'data', Path(app) / 'config', Path(app) / '.local/share']
    return out


def user_dirs():
    """Desktop / Documents / Downloads (incl. OneDrive-redirected ones on Windows)."""
    names = ['Desktop', 'Documents', 'Downloads', 'Games']
    out = [HOME / n for n in names]
    if IS_WIN:
        for od in gl(HOME, 'OneDrive*'):
            out += [Path(od) / n for n in names]
        # portable launchers are often dropped in C:\Games, C:\MultiMC, D:\Minecraft ...
        for drive in 'CDEFG':
            out.append(Path(f'{drive}:/'))
    return [d for d in out if d.is_dir()]


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
            if d.is_dir():
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
    for d in user_dirs():
        for od in gl(d, 'curseforge/minecraft/Instances'):
            roots.append(('CurseForge', Path(od), '*'))
    # portable Prism / MultiMC / PolyMC installs (a folder with its .cfg next to instances/)
    for d in user_dirs():
        for pat in ('*/', '*/*/'):
            for cfg in ('prismlauncher.cfg', 'multimc.cfg', 'polymc.cfg'):
                for hit in gl(d, pat + cfg):
                    home = Path(hit).parent
                    inst = cfg_value(hit, 'InstanceDir') or 'instances'
                    roots.append(('Prism' if cfg.startswith('prism') else 'MultiMC', home / inst, '*'))
    return roots


def game_dir(inst):
    """An instance folder -> the folder the game actually runs in."""
    for sub in ('minecraft', '.minecraft'):
        if (inst / sub).is_dir():
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


def looks_like_game(d):
    return any((d / s).exists() for s in ('mods', 'config', 'saves', 'options.txt', 'server.properties', 'plugins'))


def schem_folders(g):
    """Where WorldEdit reads schematics from in game folder g: [(path, has_worldedit)]."""
    out = []
    for plug in ('WorldEdit', 'FastAsyncWorldEdit'):          # Bukkit / Paper / Spigot servers
        if (g / 'plugins' / plug).is_dir():
            out.append((g / 'plugins' / plug / 'schematics', True))
    has = (g / 'config/worldedit').is_dir()
    if not has and (g / 'mods').is_dir():
        try:
            has = any(re.search(r'worldedit|fawe', f.name, re.I) for f in (g / 'mods').iterdir())
        except OSError:
            pass
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


def find_targets():
    out, seen = [], set()

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

    # vanilla launcher (also used by the Microsoft Store / Xbox app launcher)
    for base in data_dirs():
        for name in ('.minecraft', 'minecraft'):
            if (base / name).is_dir() and looks_like_game(base / name):
                add(base / name, 'Minecraft', 'Official launcher')
    if not IS_WIN and not IS_MAC and (HOME / '.minecraft').is_dir():
        add(HOME / '.minecraft', 'Minecraft', 'Official launcher')

    for label, root, pat in launcher_roots():
        for inst in gl(root, pat):
            inst = Path(inst)
            if inst.is_dir() and looks_like_game(game_dir(inst)):
                add(game_dir(inst), instance_name(inst), label)

    # loose game / server folders on the desktop, in documents etc.
    for d in user_dirs():
        if len(d.parts) == 1 or d.anchor == str(d):   # drive roots: only one level deep
            pats = ['*/server.properties', '*/*/config/worldedit']
        else:
            pats = ['*/server.properties', '*/*/server.properties', '*/config/worldedit', '*/*/config/worldedit']
        for pat in pats:
            for hit in gl(d, pat):
                h = Path(hit)
                g = h.parent if h.name == 'server.properties' else h.parent.parent
                add(g, g.name, 'Server' if (g / 'server.properties').exists() else 'Game folder')

    # folders the user added by hand
    for c in load_custom():
        p = Path(c)
        if not p.is_dir():
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
        if '/api/' in (args[0] if args else ''):
            sys.stderr.write('[studio] ' + (fmt % args) + '\n')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/') and self.path != '/api/ping' and not local_request(self):
            return self._json(403, {'error': 'forbidden'})
        if self.path == '/api/ping':
            return self._json(200, {'ok': True, 'app': 'maze-structure-studio'})
        if self.path == '/api/targets':
            return self._json(200, {'targets': find_targets()})
        return super().do_GET()

    def do_POST(self):
        if self.path not in ('/api/save', '/api/folders', '/api/pick'):
            return self._json(404, {'error': 'not found'})
        # JSON only: a cross-site page can't send that without a CORS preflight, which we never answer
        if not local_request(self) or not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return self._json(403, {'error': 'forbidden'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > 64 * 1024 * 1024:
                return self._json(413, {'error': 'too large'})
            req = json.loads(self.rfile.read(n) or b'{}')
            if self.path == '/api/pick':
                return self._json(200, {'path': pick_folder()})
            if self.path == '/api/folders':
                return self._folders(req)
            name, sub = req.get('name', ''), req.get('subfolder', '')
            if not name or not SAFE.match(name) or not SAFE.match(sub):
                return self._json(400, {'error': 'invalid file or folder name'})
            data = base64.b64decode(req['data'])
            if data[:2] != b'\x1f\x8b':
                return self._json(400, {'error': 'not a gzip schematic'})
            allowed = {t['path'] for t in find_targets()}
            results = []
            for t in req.get('targets', []):
                if t not in allowed:
                    results.append({'path': t, 'ok': False, 'error': 'folder not allowed'})
                    continue
                folder = Path(t) / sub if sub else Path(t)
                dest = folder / f'{name}.schem'
                try:
                    if dest.exists() and not req.get('overwrite'):
                        results.append({'path': str(dest), 'ok': False, 'error': f'{name}.schem already exists (tick Overwrite)'})
                        continue
                    folder.mkdir(parents=True, exist_ok=True)
                    tmp = dest.with_suffix('.schem.tmp')
                    tmp.write_bytes(data)
                    os.replace(tmp, dest)
                    results.append({'path': str(dest), 'ok': True})
                except OSError as e:
                    results.append({'path': str(dest), 'ok': False, 'error': str(e)})
            # keep a copy in the studio's own exports folder whenever a save went through
            if any(r['ok'] for r in results):
                EXPORTS.mkdir(exist_ok=True)
                (EXPORTS / f'{name}.schem').write_bytes(data)
            return self._json(200, {'results': results})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {'error': str(e)})

    def _folders(self, req):
        paths = load_custom()
        if req.get('add'):
            p = Path(os.path.expandvars(os.path.expanduser(str(req['add']).strip().strip('"'))))
            if not p.is_absolute():
                return self._json(400, {'error': 'use a full path, e.g. ' + (r'C:\Users\you\AppData\Roaming\.minecraft' if IS_WIN else '~/.minecraft')})
            if not p.is_dir():
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


def pick_folder():
    """Open this PC's own folder picker; returns the chosen path or ''."""
    if IS_WIN:
        tries = [[sys.executable, '-c', TK_PICK]]
    elif IS_MAC:
        tries = [['osascript', '-e', 'POSIX path of (choose folder with prompt "Choose a Minecraft folder")']]
    else:
        kde = 'KDE' in os.environ.get('XDG_CURRENT_DESKTOP', '').upper()
        tries = [[sys.executable, '-c', PORTAL_PICK]]
        tries += [['kdialog', '--getexistingdirectory', str(HOME), '--title', 'Choose a Minecraft folder']] if kde else []
        tries += [['zenity', '--file-selection', '--directory', '--title=Choose a Minecraft folder'],
                  ['kdialog', '--getexistingdirectory', str(HOME)], [sys.executable, '-c', TK_PICK]]
    for cmd in tries:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
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
            return json.loads(r.read()).get('app') == 'maze-structure-studio'
    except Exception:  # noqa: BLE001
        return False


def main():
    url = f'http://127.0.0.1:{PORT}/'
    open_browser = '--no-browser' not in sys.argv
    if already_running():
        print('Studio already running at', url)
        if open_browser:
            webbrowser.open(url)
        return
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print('Maze Structure Studio running at', url, '(Ctrl+C to stop)')
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
