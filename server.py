#!/usr/bin/env python3
"""Maze Structure Studio — local server.

Serves the web app and saves generated .schem files straight into the
WorldEdit schematics folders it finds on this PC. Only listens on 127.0.0.1.
"""
import base64, glob, json, mimetypes, os, re, sys, threading, urllib.request, webbrowser
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


def find_targets():
    pats = [
        '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances/*/minecraft/config/worldedit',
        '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances/*/.minecraft/config/worldedit',
        '.local/share/PrismLauncher/instances/*/minecraft/config/worldedit',
        '.local/share/PrismLauncher/instances/*/.minecraft/config/worldedit',
        '.minecraft/config/worldedit',
        'Desktop/*/config/worldedit', 'Desktop/*/*/config/worldedit',
        'Documents/*/config/worldedit',
    ]
    out, seen = [], set()
    for p in pats:
        for d in sorted(glob.glob(str(HOME / p))):
            d = Path(d).resolve()
            sch = d / 'schematics'
            if sch in seen:
                continue
            seen.add(sch)
            root = d.parent.parent
            label = root.parent.name if root.name in ('minecraft', '.minecraft') else root.name
            kind = 'Prism instance' if 'instances' in d.parts else ('Server' if (root / 'server.properties').exists() else 'Minecraft')
            out.append({'path': str(sch), 'label': f'{label} — {kind}', 'default': 'maze' in label.lower()})
    out.append({'path': str(EXPORTS), 'label': 'Studio exports folder', 'default': False})
    return out


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
        if self.path == '/api/ping':
            return self._json(200, {'ok': True, 'app': 'maze-structure-studio'})
        if self.path == '/api/targets':
            return self._json(200, {'targets': find_targets()})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/save':
            return self._json(404, {'error': 'not found'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > 64 * 1024 * 1024:
                return self._json(413, {'error': 'too large'})
            req = json.loads(self.rfile.read(n))
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
