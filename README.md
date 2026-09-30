# Maze Structure Studio

Design, preview and export Maze Runner-style wall structures for Minecraft (WorldEdit `.schem`, 1.20.1 + Create).

## Start
- App menu → **Maze Structure Studio**, or run `./start.sh` (opens in your browser at http://127.0.0.1:8765).
- To stop the background server: right-click the app entry → *Stop Studio server*.

## Workflow
1. Pick a **preset** or a **layout**, then tweak any control — the 3D preview updates instantly.
2. **New seed** (R) or **Remix** (M) for fresh variations; **Tile ×** previews sections side by side.
3. **Save to Minecraft** (Ctrl+S) writes straight into the WorldEdit schematics folders it finds
   (default subfolder `studio`). In-game: `//schem load studio/<name>` then `//paste -a` while facing north.
4. **Batch…** exports many seeded variants at once (optionally numbered 1, 2, 3…).
5. **Open .schem** previews any existing Sponge schematic.

## Pieces & whole mazes
**Piece** picks the footprint: *Straight*, *Corner (L-shape)*, *T-junction*, *Crossroads* or *Whole maze*.
Every piece is built by the same footprint builder: the outline is traced into faces, each face gets its own
design, ends are capped, and corners wrap one design round continuously. Width is the arm length (outside).
*Show attached walls* previews junctions joined to straight walls (only the piece itself is exported).
**Whole maze** (Maze section) generates a seeded maze: grid size, corridor and wall width, *Loops* (how many
dead ends get opened up) and an optional central **Glade** with a gate in each side.
Paste any piece like the straight walls: stand at the front-left corner facing north, `//paste -a`.

## Panels
*Panel distinction* (Massing & relief) makes every slab read as its own cast panel: its own shade and
block, calmer texture inside, and deeper, darker joints between slabs. 0 keeps the blended look.

## Seed browser
**Seeds…** (B) shows 12 thumbnails of the current settings with different seeds; click one to use it,
*Next 12* for more. Generation runs in a background worker, so big mazes never freeze the UI.

## Rain & dirt
Dirt comes from a rain simulation: rain lands on every top open to the sky, flows across each top to a few
low drip points and runs down the face below — wandering, widening, landing on ledges that stick out and
dripping again from their edges. Water also creeps back along the undersides of ledges (*Soffit creep*),
wind drives rain onto the faces it blows at (*Wind from*, *Wind-driven rain*), sun dries the south faces
(*Sun drying*) and heavy flow washes the middle of a streak cleaner than its edges (*Washing*).
Sheltered areas under overhangs stay clean. The same wet paths drive the moss and the ivy.
Each block's randomness is fixed per position, so moving a rain slider only changes blocks the water reaches.

## Ivy & vines
A growth simulation run on the finished structure: strands take root on the ground, ledges and cracks, then
wander over the real surfaces — branching, wrapping round corners and thinning into tendrils. Growth is drawn
to shade and damp (north faces, grooves, under ledges, low down, along the darker stained blocks) and dies back
in dry sun; leafy mats form where it is densest and moss gathers on the ledges it crosses. Every vine is attached to a real wall face (or hangs
from the vine above it) and leaves are exported as persistent, so nothing decays or drops after pasting.

## Shortcuts
R new seed · M remix · B seed browser · E download · P screenshot · 1–6 camera views · Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+S save
Double-click a slider to reset it. Orange dots mark settings changed from default.

## Files
- `web/` — the app (generator `gen.js`, background `worker.js`, viewer `viewer.js`, schematic I/O `schem.js`)
- `tests/run.mjs` — regression tests, run with `node tests/run.mjs` (all presets & pieces, vines, holes, roundtrip, rain)
- `exports/` — a copy of everything you save
- `server.py` — local server (127.0.0.1 only; writes only into detected WorldEdit folders)

## Block library
Every vanilla 1.20.1 block (plus Create cut stones) is available in the palette picker, with real textures.
The picker defaults to *Full blocks only* (best for walls) — untick it for stairs, slabs, glass, plants, etc.
If you update Minecraft or Create, rebuild the library with: `python3 tools/build_library.py`
