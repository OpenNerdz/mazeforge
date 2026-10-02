#!/usr/bin/env python3
"""Bundle Python and allowlisted web assets into native, offline desktop downloads."""
import hashlib
import importlib.metadata
import json
import platform
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

from package_release import ROOT, release_files


def main():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    system = {'win32': 'windows', 'darwin': 'macos'}.get(sys.platform, 'linux')
    arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64'
    name = f'mazeforge-{version}-{system}-{arch}'
    build, out = ROOT / 'build/desktop', ROOT / 'dist/desktop'
    if build.exists():
        shutil.rmtree(build)
    build.mkdir(parents=True)
    out.mkdir(parents=True, exist_ok=True)
    resources = build / 'resources'
    resources.mkdir()
    for source in release_files():
        relative = source.relative_to(ROOT)
        if relative.parts[0] == 'web' or source.name in ('README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md'):
            dest = resources / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    licenses = resources / 'licenses'
    shutil.copytree(ROOT / 'tools/runtime-licenses', licenses)
    python_license = Path(sys.base_prefix) / ('LICENSE.txt' if system == 'windows' else 'lib/python3.12/LICENSE.txt')
    if not python_license.is_file():
        python_license = Path(sys.base_prefix) / 'LICENSE.txt'
    if not python_license.is_file():
        raise FileNotFoundError('The Python runtime license must accompany desktop downloads.')
    shutil.copyfile(python_license, licenses / 'PYTHON-LICENSE.txt')
    dist = importlib.metadata.distribution('pyinstaller')
    license_file = next(f for f in dist.files if str(f).endswith('/COPYING.txt'))
    shutil.copyfile(dist.locate_file(license_file), licenses / 'PYINSTALLER-LICENSE.txt')
    command = [sys.executable, '-m', 'PyInstaller', '--clean', '--noconfirm', '--noupx',
               '--name', 'MazeForge', '--distpath', str(build / 'native'),
               '--workpath', str(build / 'work'), '--specpath', str(build)]
    command += ['--onedir', '--windowed', '--osx-bundle-identifier', 'io.opennerdz.mazeforge'] if system == 'macos' else ['--onefile']
    if system == 'windows':
        command += ['--windowed', '--icon', str(ROOT / 'tools/icons/mazeforge.ico')]
    if system == 'macos':
        iconset = build / 'MazeForge.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                icon = iconset / f'icon_{size}x{size}{"@2x" if scale == 2 else ""}.png'
                subprocess.run(['sips', '-z', str(size * scale), str(size * scale),
                                str(ROOT / 'tools/icons/mazeforge.png'), '--out', str(icon)], check=True, capture_output=True)
        icns = build / 'MazeForge.icns'
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(icns)], check=True)
        command += ['--icon', str(icns)]
    for resource in sorted(resources.iterdir()):
        command += ['--add-data', f'{resource}:{resource.name}']
    subprocess.run(command + [str(ROOT / 'server.py')], check=True, cwd=ROOT)
    stage = build / name
    stage.mkdir()
    executable = 'MazeForge.exe' if system == 'windows' else 'MazeForge'
    if system == 'macos':
        shutil.copytree(build / 'native/MazeForge.app', stage / 'MazeForge.app', symlinks=True)
        executable = 'MazeForge.app'
    else:
        shutil.copyfile(build / 'native' / executable, stage / executable)
        (stage / executable).chmod(0o755)
    for source in release_files():
        relative = source.relative_to(ROOT)
        if relative.parts[0] == 'docs' or (len(relative.parts) == 1 and source.suffix == '.md'):
            dest = stage / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    shutil.copyfile(ROOT / 'LICENSE', stage / 'LICENSE')
    shutil.copytree(licenses, stage / 'licenses')
    (stage / 'START-HERE.txt').write_text(
        f'MazeForge {version} — Beta\n\nExtract the entire download, then double-click {executable}.\n'
        'Your default browser opens automatically. No Python installation, terminal or account is needed.\n'
        'Choose More > Quit MazeForge to stop the app. Closing a browser tab leaves it running.\n\n'
        'Bugs are expected. Back up your Minecraft world before pasting structures.\n'
        'Report bugs: https://github.com/OpenNerdz/mazeforge/issues\n\n'
        'These beta builds are unsigned. Windows and macOS may require first-launch approval.\n'
        'On Linux your file manager may ask permission to run an executable.\n'
        'See README.md for setup and docs/USER_GUIDE.md for local data locations.\n', encoding='utf-8')
    if system == 'macos':
        archive = out / f'{name}.zip'
        subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(stage), str(archive)], check=True)
    elif system == 'linux':
        archive = out / f'{name}.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(stage, arcname=name)
    else:
        archive = out / f'{name}.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    zip_out.write(path, f'{name}/{path.relative_to(stage).as_posix()}')
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (out / f'{name}.sha256').write_text(f'{checksum}  {archive.name}\n')
    print(f'Desktop archive: {archive}')


if __name__ == '__main__':
    main()
