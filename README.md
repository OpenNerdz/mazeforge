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

## Corner pieces
Set **Piece → Corner (L-shape)**. Width becomes the arm length (measured on the outside). The outer faces
(south + east) are one continuous design that wraps round the corner; the inner corner has its own design.
*Show attached walls* previews it joined to straight walls (only the corner itself is exported).
Paste it like the straight walls: stand in front of the left end facing north, `//paste -a`.

## Rain & dirt
Dirt comes from a rain simulation: rain lands on every top open to the sky, flows across each top to a few
low drip points and runs down the face below — wandering, widening, landing on ledges that stick out and
dripping again from their edges. Sheltered areas under overhangs stay clean. The same wet paths drive the
moss and the ivy. Controls: *Rain dirt*, *Streak length*, *Drip spread* (Weathering).

## Ivy & vines
A growth simulation run on the finished structure: strands take root on the ground, ledges and cracks, then
wander over the real surfaces — branching, wrapping round corners and thinning into tendrils. Growth is drawn
to shade and damp (north faces, grooves, under ledges, low down, along the darker stained blocks) and dies back
in dry sun; leafy mats form where it is densest and moss gathers on the ledges it crosses. Every vine is attached to a real wall face (or hangs
from the vine above it) and leaves are exported as persistent, so nothing decays or drops after pasting.

## Shortcuts
R new seed · M remix · E download · P screenshot · 1–6 camera views · Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+S save
Double-click a slider to reset it. Orange dots mark settings changed from default.

## Files
- `web/` — the app (generator `gen.js`, viewer `viewer.js`, schematic I/O `schem.js`)
- `exports/` — a copy of everything you save
- `server.py` — local server (127.0.0.1 only; writes only into detected WorldEdit folders)

## Block library
Every vanilla 1.20.1 block (plus Create cut stones) is available in the palette picker, with real textures.
The picker defaults to *Full blocks only* (best for walls) — untick it for stairs, slabs, glass, plants, etc.
If you update Minecraft or Create, rebuild the library with: `python3 tools/build_library.py`
