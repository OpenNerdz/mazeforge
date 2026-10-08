"""Exercise the local HTTP boundary using disposable folders; never scan or write game installs."""
import base64
import gzip
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from tools.build_preview import png

find_targets = server.find_targets          # the real one: setUp replaces it with a fixed list


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.web = self.root / 'web'
        self.web.mkdir()
        (self.web / 'index.html').write_text('MazeForge')
        self.target = self.root / 'schematics'
        self.target.mkdir()
        self.patches = [patch.object(server, 'WEB', self.web),
                        patch.object(server, 'EXPORTS', self.root / 'exports'),
                        patch.object(server, 'CUSTOM_FILE', self.root / 'folders.json'),
                        patch.object(server, 'find_targets', return_value=[{'path': str(self.target)}])]
        for p in self.patches:
            p.start()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.port = self.http.server_port
        self.port_patch = patch.object(server, 'PORT', self.port)
        self.port_patch.start()
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.port_patch.stop()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        try:
            defaults = {'Host': f'127.0.0.1:{self.port}', 'Content-Type': 'application/json'}
            defaults.update(headers or {})
            conn.request(method, path, json.dumps(body) if body is not None else None, defaults)
            response = conn.getresponse()
            return response.status, response.read(), dict(response.getheaders())
        finally:
            conn.close()

    def save_body(self, **extra):
        return {'name': 'wall', 'subfolder': 'studio', 'targets': [str(self.target)],
                'data': base64.b64encode(gzip.compress(b'test fixture')).decode(), **extra}

    def test_local_page_and_asset_selection(self):
        code, body, headers = self.request('GET', '/')
        self.assertEqual((code, body), (200, b'MazeForge'))
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(json.loads(self.request('GET', '/api/assets')[1]), {'local': False})
        local = self.web / 'local-textures'
        local.mkdir()
        (local / 'atlas.png').touch()
        self.assertEqual(json.loads(self.request('GET', '/api/assets')[1]), {'local': False})
        (local / 'library.json').write_text('{}')
        self.assertEqual(json.loads(self.request('GET', '/api/assets')[1]), {'local': True})

    def test_request_boundary(self):
        self.assertEqual(self.request('GET', '/api/targets', headers={'Origin': 'https://example.invalid'})[0], 403)
        self.assertEqual(self.request('GET', '/', headers={'Host': 'example.invalid'})[0], 403)
        self.assertEqual(self.request('POST', '/api/save', self.save_body(), {'Content-Type': 'text/plain'})[0], 403)
        self.assertEqual(self.request('POST', '/api/unknown', {})[0], 404)
        self.assertEqual(self.request('HEAD', '/', headers={'Host': 'example.invalid'})[0], 403)
        self.assertEqual(self.request('GET', '/missing.js')[0], 404)     # logging an error must not drop the reply

    def test_invalid_payloads(self):
        for body in [[], self.save_body(name='wall\n'), self.save_body(name='../wall'),
                     self.save_body(subfolder='../outside'), self.save_body(targets='folder'),
                     self.save_body(data='invalid!'), self.save_body(data='dGVzdA==')]:
            with self.subTest(body=body):
                self.assertEqual(self.request('POST', '/api/save', body)[0], 400)
        self.assertEqual(self.request('POST', '/api/save', headers={'Content-Length': '-1'})[0], 400)
        self.assertEqual(self.request('POST', '/api/save', headers={'Content-Length': str(65 * 1024 * 1024)})[0], 413)

    def test_save_overwrite_and_allowed_folders(self):
        body = self.save_body()
        code, result, _ = self.request('POST', '/api/save', body)
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(result)['results'][0]['ok'])
        dest = self.target / 'studio/wall.schem'
        self.assertEqual(dest.read_bytes(), base64.b64decode(body['data']))
        self.assertEqual((self.root / 'exports/wall.schem').read_bytes(), dest.read_bytes())
        self.assertFalse(json.loads(self.request('POST', '/api/save', body)[1])['results'][0]['ok'])
        self.assertTrue(json.loads(self.request('POST', '/api/save', self.save_body(overwrite=True))[1])['results'][0]['ok'])
        result = json.loads(self.request('POST', '/api/save', self.save_body(targets=[str(self.root)]))[1])
        self.assertFalse(result['results'][0]['ok'])

    def test_a_folder_listed_twice_is_written_once(self):
        result = json.loads(self.request('POST', '/api/save', self.save_body(targets=[str(self.target)] * 2))[1])['results']
        self.assertEqual([r['ok'] for r in result], [True])

    def test_unreadable_folders_do_not_break_the_list(self):
        readable, locked = self.root / 'readable', self.root / 'locked'
        readable.mkdir()
        locked.mkdir()
        (self.root / 'folders.json').write_text(json.dumps([str(readable), str(locked)]))
        is_dir = Path.is_dir

        def guarded(path):
            if path == locked:
                raise PermissionError(13, 'Permission denied', str(path))
            return is_dir(path)
        with patch.object(Path, 'is_dir', guarded):
            targets = find_targets()
        self.assertIn(str(readable.resolve()), [t['path'] for t in targets])
        self.assertTrue(next(t for t in targets if t['path'] == str(locked))['missing'])

    def test_rescans_do_not_duplicate_folders_on_case_insensitive_systems(self):
        game = self.root / 'Data/.minecraft'
        (game / 'saves').mkdir(parents=True)
        with patch.object(server, 'data_dirs', return_value=[self.root / 'Data']), patch.object(server, 'HOME', self.root), \
                patch.object(server, 'DISCOVERED', []), patch.object(server.os.path, 'normcase', str.lower):
            find_targets(discover=True)
            labels = [t['label'] for t in find_targets(discover=True)]
        self.assertEqual(labels.count('Minecraft'), 1)

    def test_symlinks_stay_inside_the_selected_folder(self):
        outside = self.root / 'outside'
        outside.mkdir()
        try:
            (self.target / 'studio').symlink_to(outside, target_is_directory=True)
            (self.web / 'outside').symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest('Creating symlinks is unavailable on this system')
        result = json.loads(self.request('POST', '/api/save', self.save_body())[1])
        self.assertFalse(result['results'][0]['ok'])
        self.assertFalse((outside / 'wall.schem').exists())
        self.assertEqual(self.request('GET', '/outside/')[0], 403)

    def test_discovery_is_explicit(self):
        with patch.object(server, 'find_targets', return_value=[]) as targets:
            self.request('GET', '/api/targets')
            targets.assert_called_with(discover=False)
            self.request('GET', '/api/targets?discover=1')
            targets.assert_called_with(discover=True)

    def test_local_texture_storage_and_reset(self):
        payload = {'metadata': {'version': '1.20.1', 'dataVersion': 3465},
                   'library': {'stone': {'id': 'minecraft:stone', 'color': '#808080', 'icon': 0, 'full': True}},
                   'atlas': base64.b64encode(png(512, 16, bytes(512 * 16 * 4))).decode()}
        self.assertEqual(self.request('POST', '/api/textures', payload)[0], 200)
        local = self.web / 'local-textures'
        self.assertTrue((local / 'atlas.png').is_file())
        self.assertEqual(json.loads((local / 'metadata.json').read_text())['dataVersion'], 3465)
        self.assertFalse((self.root / 'exports').exists())
        bad = dict(payload, metadata={'version': 'legacy', 'dataVersion': 100})
        self.assertEqual(self.request('POST', '/api/textures', bad)[0], 400)
        self.assertEqual(self.request('POST', '/api/textures', {'reset': True})[0], 200)
        self.assertFalse((local / 'atlas.png').exists())

    def test_desktop_textures_are_persistent_and_private(self):
        state = self.root / 'desktop-state'
        state.mkdir()
        with patch.object(server, 'FROZEN', True), patch.object(server, 'APP', state):
            payload = {'metadata': {'version': '1.20.1', 'dataVersion': 3465},
                       'library': {'stone': {'id': 'minecraft:stone', 'color': '#808080', 'icon': 0, 'full': True}},
                       'atlas': base64.b64encode(png(512, 16, bytes(512 * 16 * 4))).decode()}
            self.assertEqual(self.request('POST', '/api/textures', payload)[0], 200)
            self.assertTrue((state / 'local-textures/atlas.png').is_file())
            self.assertFalse((self.web / 'local-textures').exists())
            self.assertEqual(self.request('GET', '/local-textures/atlas.png')[0], 200)
            self.assertEqual(json.loads(self.request('GET', '/local-textures/metadata.json')[1])['dataVersion'], 3465)
            self.assertEqual(self.request('GET', '/local-textures/../folders.json')[0], 403)
            self.assertEqual(self.request('GET', '/local-textures/')[0], 403)

    def test_desktop_shutdown_requires_local_json(self):
        with patch.object(server, 'FROZEN', True), patch.object(self.http, 'shutdown') as shutdown:
            self.assertEqual(self.request('POST', '/api/quit', {}, {'Origin': 'https://example.invalid'})[0], 403)
            self.assertEqual(self.request('POST', '/api/quit', {}, {'Content-Type': 'text/plain'})[0], 403)
            shutdown.assert_not_called()
            self.assertEqual(self.request('POST', '/api/quit', {})[0], 200)
            for _ in range(100):
                if shutdown.called:
                    break
                threading.Event().wait(0.01)
            shutdown.assert_called_once()


if __name__ == '__main__':
    unittest.main()
