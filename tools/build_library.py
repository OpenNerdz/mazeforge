#!/usr/bin/env python3
"""Build web/textures/library.json + face textures for every vanilla block (plus Create cut stones).

Reads the Minecraft client jar and resolves blockstate -> model -> parent chain -> textures,
the same way the game does, to get per-face textures, a render shape and tint info.
"""
import glob, io, json, os, re, sys, zipfile
from pathlib import Path
from PIL import Image

HOME = Path.home()
APP = Path(__file__).resolve().parent.parent
OUT = APP / 'web' / 'textures'
PRISM = HOME / '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher'
MC_JAR = PRISM / 'libraries/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar'
CREATE_JAR = next(iter(glob.glob(str(PRISM / 'instances/Maze Runner/minecraft/mods/create-fabric-*.jar'))), None)

SKIP = {'air', 'cave_air', 'void_air', 'moving_piston'}
# default biome tints (plains-ish) for grayscale textures
TINT = {'grass': '#91bd59', 'foliage': '#77ab2f', 'birch': '#80a755', 'spruce': '#619961', 'water': '#3f76e4', 'lily': '#208030', 'stem': '#8fb34a'}
def tint_for(name):
    if 'water' in name or name == 'bubble_column': return TINT['water']
    if name.startswith('birch_leaves'): return TINT['birch']
    if name.startswith('spruce_leaves'): return TINT['spruce']
    if name == 'lily_pad': return TINT['lily']
    if 'stem' in name and ('melon' in name or 'pumpkin' in name): return TINT['stem']
    if 'leaves' in name or name in ('vine',): return TINT['foliage']
    return TINT['grass']

CATS = [
    ('Concrete & terracotta', r'concrete|terracotta'),
    ('Wool & carpet', r'wool|carpet'),
    ('Glass', r'glass'),
    ('Wood', r'^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|crimson|warped|bamboo)_|planks|_log$|_wood$|stem$|hyphae|_door|trapdoor|fence|sign|bookshelf|barrel|crafting|lectern|composter|beehive|chest'),
    ('Metal & ore', r'iron|gold|copper|diamond|emerald|lapis|redstone|netherite|_ore$|raw_|amethyst|coal|anvil|chain|lantern|cauldron|hopper'),
    ('Nature', r'dirt|grass|sand(?!stone)|gravel|clay|moss(?!y)|leaves|flower|sapling|mushroom|coral|snow|ice$|^ice|mud$|vine|root|tulip|orchid|daisy|allium|poppy|dandelion|fern|bush|kelp|seagrass|cactus|pumpkin|melon|hay|sponge|azalea|lily|podzol|mycelium|farmland|dripleaf|sculk|nylium|wart|shroomlight|honey|slime'),
    ('Stone & masonry', r'stone|deepslate|andesite|diorite|granite|tuff|calcite|blackstone|basalt|cobble|brick|sandstone|prismarine|purpur|quartz|dripstone|obsidian|netherrack|bedrock|end_|magma|smooth|polished|chiseled|cut_|pillar'),
    ('Light', r'torch|lamp|froglight|glowstone|sea_lantern|candle|beacon|end_rod'),
]
def category(name):
    for cat, rx in CATS:
        if re.search(rx, name): return cat
    return 'Other'


class Jar:
    def __init__(self, path, ns):
        self.z = zipfile.ZipFile(path); self.ns = ns; self.names = set(self.z.namelist()); self.cache = {}
    def json(self, p):
        if p not in self.cache: self.cache[p] = json.loads(self.z.read(p)) if p in self.names else None
        return self.cache[p]
    def model(self, ref):
        ns, path = (ref.split(':', 1) + [None])[:2] if ':' in ref else ('minecraft', ref)
        return self.json(f'assets/{ns}/models/{path}.json'), ns
    def texture(self, ref):
        ns, path = ref.split(':', 1) if ':' in ref else ('minecraft', ref)
        p = f'assets/{ns}/textures/{path}.png'
        return self.z.read(p) if p in self.names else None


def resolve_model(jar, ref):
    """walk the parent chain; return merged textures, elements, parent names"""
    textures, elements, chain = {}, None, []
    seen = 0
    while ref and seen < 20:
        seen += 1
        m, _ = jar.model(ref)
        name = ref.split(':')[-1]; chain.append(name)
        if m is None: break
        for k, v in (m.get('textures') or {}).items(): textures.setdefault(k, v)
        if elements is None and 'elements' in m: elements = m['elements']
        ref = m.get('parent')
        if ref and ref.startswith('builtin/'): chain.append(ref); break
    def res(v, depth=0):
        while isinstance(v, str) and v.startswith('#') and depth < 10:
            v = textures.get(v[1:]); depth += 1
        return v
    return {k: res(v) for k, v in textures.items()}, elements, chain, res


def pick_variant(bs):
    if 'variants' in bs:
        vs = bs['variants']
        if '' in vs: key = ''
        else:
            pref = {'axis=y', 'facing=south', 'type=bottom', 'half=lower', 'half=bottom', 'shape=straight', 'lit=false',
                    'powered=false', 'snowy=false', 'open=false', 'waterlogged=false', 'age=0', 'north=false', 'east=false'}
            key = max(vs, key=lambda k: sum(p in pref for p in k.split(',')))
        v = vs[key]
        return (v[0] if isinstance(v, list) else v)['model']
    if 'multipart' in bs:
        a = bs['multipart'][0]['apply']
        return (a[0] if isinstance(a, list) else a)['model']
    return None


FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north']   # three.js box: +x -x +y -y +z -z

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mc = Jar(MC_JAR, 'minecraft')
    written = {}
    def save_tex(jar, ref, tint=None):
        if not ref: return None
        fname = ref.split(':')[-1].split('/')[-1] + ('' if not tint else '_' + tint[1:]) + '.png'
        if fname in written: return fname
        data = jar.texture(ref)
        if data is None: return None
        im = Image.open(io.BytesIO(data)).convert('RGBA')
        w = im.width; im = im.crop((0, 0, w, w)).resize((16, 16), Image.NEAREST) if w != 16 else im.crop((0, 0, 16, 16))
        if tint:
            tr, tg, tb = (int(tint[i:i + 2], 16) for i in (1, 3, 5))
            px = im.load()
            for y in range(16):
                for x in range(16):
                    r, g, b, a = px[x, y]; px[x, y] = (r * tr // 255, g * tg // 255, b * tb // 255, a)
        im.save(OUT / fname)
        alphas = [p[3] for p in im.getdata()]
        written[fname] = {'cut': any(a < 128 for a in alphas), 'blend': any(0 < a < 250 for a in alphas),
                          'avg': [sum(p[i] for p in im.getdata() if p[3] > 0) // max(1, sum(1 for p in im.getdata() if p[3] > 0)) for i in range(3)]}
        return fname

    lib = {}
    names = sorted(n for n in mc.names if n.startswith('assets/minecraft/blockstates/') and n.endswith('.json'))
    for n in names:
        name = n.split('/')[-1][:-5]
        if name in SKIP: continue
        bs = mc.json(n); mref = pick_variant(bs)
        if not mref: continue
        tex, elements, chain, res = resolve_model(mc, mref)
        shape = 'cube'
        if any(c.split('/')[-1] in ('cross', 'tinted_cross') for c in chain) or 'torch' in name: shape = 'cross'
        box = [0, 0, 0, 16, 16, 16]
        faces = {}
        if elements:
            mins = [min(e['from'][i] for e in elements) for i in range(3)]; maxs = [max(e['to'][i] for e in elements) for i in range(3)]
            box = mins + maxs
            biggest = max(elements, key=lambda e: (e['to'][0] - e['from'][0] + 1) * (e['to'][1] - e['from'][1] + 1) * (e['to'][2] - e['from'][2] + 1))
            for d, f in (biggest.get('faces') or {}).items():
                faces[d] = (res(f.get('texture')), 'tintindex' in f)
            if len(elements) == 2 and all(abs(e.get('rotation', {}).get('angle', 0)) == 45 for e in elements): shape = 'cross'
        if shape == 'cross':
            ref = tex.get('cross') or tex.get('plant') or tex.get('texture') or tex.get('particle')
            faces = {d: (ref, any(c.endswith('tinted_cross') for c in chain)) for d in FACE_ORDER}
        fallback = tex.get('all') or tex.get('side') or tex.get('texture') or tex.get('particle') or next((v for v in tex.values() if isinstance(v, str) and not v.startswith('#')), None)
        tinted_name = tint_for(name)
        files = []
        for d in FACE_ORDER:
            ref, tinted = faces.get(d, (None, False))
            ref = ref or fallback
            files.append(save_tex(mc, ref, tinted_name if tinted else None) if ref else None)
        if not any(files): continue
        base = next(f for f in files if f)
        files = [f or base for f in files]
        if shape == 'cube' and box != [0, 0, 0, 16, 16, 16]:
            shape = 'box'
        side = files[4]
        info = written[side]
        entry = {'id': f'minecraft:{name}', 'color': '#%02x%02x%02x' % tuple(info['avg']), 'cat': category(name), 'icon': side}
        if len(set(files)) > 1: entry['faces'] = files
        if shape != 'cube': entry['shape'] = shape
        if shape == 'box': entry['box'] = [round(v / 16, 4) for v in box]
        if any(written[f]['blend'] for f in files) and ('glass' in name or 'ice' in name or 'water' in name or 'slime' in name or 'honey' in name): entry['alpha'] = 'blend'
        elif any(written[f]['cut'] for f in files) or shape == 'cross': entry['alpha'] = 'cut'
        full = shape == 'cube' and entry.get('alpha') is None and elements is not None and 'stairs' not in name
        entry['full'] = full
        lib[name] = entry

    # Create cut stones (used by the default palettes)
    if CREATE_JAR:
        cj = Jar(CREATE_JAR, 'create')
        for stone in ['deepslate', 'scoria', 'andesite', 'tuff', 'calcite', 'limestone', 'scorchia', 'granite', 'diorite', 'dripstone', 'ochrum', 'veridium', 'asurine', 'crimsite']:
            key = f'cut_{stone}'
            ref = f'create:block/palettes/stone_types/cut/{stone}_cut'
            if f'assets/create/blockstates/{key}.json' not in cj.names: continue
            f = save_tex(cj, ref)
            if not f: continue
            info = written[f]
            lib[key] = {'id': f'create:{key}', 'color': '#%02x%02x%02x' % tuple(info['avg']), 'cat': 'Create', 'icon': f, 'full': True}
    # keep the legacy per-key texture files working (older saved palettes used textures/<key>.png)
    (OUT / 'library.json').write_text(json.dumps(lib, separators=(',', ':')))
    full = sum(1 for e in lib.values() if e['full'])
    print(f'{len(lib)} blocks ({full} full cubes), {len(written)} textures')


if __name__ == '__main__':
    main()
