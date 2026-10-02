#!/usr/bin/env python3
"""Verify the real frozen app, persistent local assets, saving, relaunch and quitting."""
import base64
import gzip
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from build_preview import png

BASE = 'http://127.0.0.1:8765'


def request(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=2) as response:
        return response.read()


def main():
    exe = Path(sys.argv[1]).resolve()
    try:
        request('/api/ping')
    except (OSError, urllib.error.URLError):
        pass
    else:
        raise RuntimeError('Port 8765 must be free for the desktop smoke test.')
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, HOME=tmp, USERPROFILE=tmp, LOCALAPPDATA=tmp, XDG_DATA_HOME=tmp)
        # The frozen executable must run without a Python installation on PATH.
        env['PATH'] = ''
        processes = []
        try:
            for attempt in range(2):
                proc = subprocess.Popen([str(exe), '--no-browser'], env=env, cwd=tmp)
                processes.append(proc)
                for _ in range(120):
                    if proc.poll() is not None:
                        raise RuntimeError(f'Desktop executable exited early: {proc.returncode}')
                    try:
                        ping = json.loads(request('/api/ping'))
                        assert ping['desktop']
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.25)
                else:
                    raise RuntimeError('Desktop executable did not start.')
                page = request('/').decode()
                assert 'Bugs are expected.' in page and 'beta-notice' in page
                assert len(request('/textures/atlas.png')) > 1000
                assert b'createDesktop' in request('/ui/desktop.js')
                if attempt == 0:
                    atlas = png(512, 16, bytes(512 * 16 * 4))
                    payload = {'metadata': {'version': 'smoke-test', 'dataVersion': 3465},
                               'library': {'stone': {'id': 'minecraft:stone', 'color': '#808080', 'icon': 0, 'full': True}},
                               'atlas': base64.b64encode(atlas).decode()}
                    assert json.loads(request('/api/textures', payload))['ok']
                    target = next(t['path'] for t in json.loads(request('/api/targets'))['targets'] if t['kind'] == 'This app')
                    save = {'name': 'smoke', 'subfolder': '', 'targets': [target],
                            'data': base64.b64encode(gzip.compress(b'smoke test')).decode()}
                    assert json.loads(request('/api/save', save))['results'][0]['ok']
                    assert Path(target).is_relative_to(Path(tmp))
                    assert (Path(target) / 'smoke.schem').is_file()
                assert json.loads(request('/api/assets'))['local']
                assert json.loads(request('/local-textures/metadata.json'))['version'] == 'smoke-test'
                assert json.loads(request('/api/quit', {}))['ok']
                proc.wait(timeout=15)
                assert proc.returncode == 0
        finally:
            for proc in processes:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(timeout=15)
    print('Frozen app passed startup without Python on PATH, asset persistence, saving, relaunch and shutdown.')


if __name__ == '__main__':
    main()
