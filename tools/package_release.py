#!/usr/bin/env python3
"""Build a portable release from an explicit allowlist, never personal files or local game assets."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ('README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CHANGELOG.md',
         'server.py', 'start.sh', 'start.command', 'start.bat',
         'docs/TEXTURES.md', 'docs/screenshot.png', 'docs/screenshot-maze.png')


def release_files():
    files = [ROOT / p for p in FILES]
    files += sorted((ROOT / 'web/core').glob('*.js')) + sorted((ROOT / 'web/ui').glob('*.js'))
    files += [ROOT / 'web' / p for p in ('index.html', 'styles.css', 'main.js', 'worker.js', 'icon.svg',
                                      'lib/three.js', 'textures/atlas.png', 'textures/library.json')]
    for path in files:
        if path.is_symlink():
            raise ValueError(f'Release inputs must not be symlinks: {path.relative_to(ROOT)}')
    return files


def main():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    name = f'mazeforge-{version}'
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    files = release_files()
    with zipfile.ZipFile(out / f'{name}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info = zipfile.ZipInfo(f'{name}/{path.relative_to(ROOT).as_posix()}', (2026, 1, 1, 0, 0, 0))
            executable = path.name in ('start.sh', 'start.command')
            info.create_system = 3
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    package = out / f'{name}.zip'
    (out / 'SHA256SUMS.txt').write_text(f'{hashlib.sha256(package.read_bytes()).hexdigest()}  {package.name}\n')
    print(f'{package.relative_to(ROOT)} ({package.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
