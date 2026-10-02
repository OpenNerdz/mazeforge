#!/usr/bin/env python3
"""Generate original, deterministic preview materials. No game files or dependencies needed."""
import hashlib
import json
import random
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLS, TILE = 32, 16


def png(width, height, pixels):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def material(key, entry):
    rng = random.Random(hashlib.sha256(key.encode()).digest())
    rgb = [int(entry['color'][i:i + 2], 16) for i in (1, 3, 5)]
    pixels = bytearray()
    for y in range(TILE):
        for x in range(TILE):
            noise, alpha = rng.randint(-8, 8), 255
            if 'brick' in key or key.startswith('cut_'):
                if y % 8 == 0 or (x + (8 if y >= 8 else 0)) % 16 == 0:
                    noise -= 24
            elif any(word in key for word in ('planks', 'log', 'wood', 'stem')):
                noise += -16 if x % 6 == 0 else (x % 6) * 2
            elif 'wool' in key or 'carpet' in key:
                noise += 5 if (x + y) % 2 == 0 else -5
            if 'mossy' in key and rng.random() < 0.18:
                noise -= 10
            if entry.get('alpha') == 'blend':
                alpha = 110 if 'glass' in key else 175
                if x in (0, 15) or y in (0, 15):
                    alpha = 210
            elif entry.get('alpha') == 'cut':
                if 'glass' in key:
                    alpha = 255 if x in (0, 15) or y in (0, 15) or x == y else 0
                elif 'bars' in key or 'chain' in key:
                    alpha = 255 if x % 8 in (3, 4) or y % 8 == 3 else 0
                elif 'vine' in key:
                    alpha = 255 if x in (6, 7) or (y % 5 in (1, 2) and 3 <= x <= 11) else 0
                elif 'leaves' in key:
                    alpha = 255 if rng.random() > 0.16 else 0
                else:
                    alpha = 255 if (x - 8) ** 2 + (y - 7) ** 2 < 30 or (x in (7, 8) and y >= 7) else 0
            pixels.extend([max(0, min(255, c + noise)) for c in rgb] + [alpha])
    return pixels


def main():
    out = ROOT / 'web/textures'
    library = json.loads((out / 'library.json').read_text())
    tiles = {}
    for key, entry in sorted(library.items()):
        for tile in entry.get('faces', [entry['icon']]):
            tiles.setdefault(tile, (key, entry))
    width, height = COLS * TILE, ((max(tiles) + COLS) // COLS) * TILE
    pixels = bytearray(width * height * 4)
    for tile, (key, entry) in tiles.items():
        texture = material(key, entry)
        for y in range(TILE):
            offset = ((tile // COLS * TILE + y) * width + tile % COLS * TILE) * 4
            pixels[offset:offset + TILE * 4] = texture[y * TILE * 4:(y + 1) * TILE * 4]
    (out / 'atlas.png').write_bytes(png(width, height, pixels))
    print(f'Generated {len(tiles)} original preview materials for {len(library)} blocks.')


if __name__ == '__main__':
    main()
