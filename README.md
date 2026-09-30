# Maze Structure Studio

Design, preview and export Maze Runner-style concrete walls for Minecraft. Every wall is generated
from a seed with weathering, rain streaks and ivy, and saved as a WorldEdit schematic (`.schem`)
ready to paste. Targets Minecraft 1.20.1 with Create.

![Maze Structure Studio](docs/screenshot.png)

## Features

- **Pieces:** straight walls, corners, T-junctions, crossroads and whole seeded mazes with an optional glade.
- **Live 3D preview** with real block textures, camera views, shadows and a marker for where to stand when pasting.
- **Designed faces:** five panel layouts, skyline roughness and slope, broken tops, seam matching so neighbouring
  walls line up, and per-face overrides.
- **Weathering:** rain simulated with wind, drying and washing drives the dirt, moss and ivy.
  Ivy grows on real surfaces, so nothing floats.
- **Auto palette:** pick any blocks and they are sorted into shade bands and detail roles by their texture colour.
- **One-click save** into every WorldEdit folder on the PC, on Windows, macOS and Linux. Big designs can be split into chunks.
- **Seed browser, batch export and share codes:** each code holds a complete design in one short string.

## Quick start

The only requirement is Python 3. The app opens in your browser at <http://127.0.0.1:8765>.

| System  | Start |
|---------|-------|
| Windows | Double-click `start.bat` (install [Python](https://www.python.org/downloads/) first and tick *Add python.exe to PATH*) |
| macOS   | Double-click `start.command` |
| Linux   | Run `./start.sh`, or use the app menu entry |

In game, stand on the orange paste spot shown in the preview, face north, then run:

```
//schem load studio/<name>
//paste -a
```

## Using the app

- **Top bar:** design name, presets, undo, *New seed* / *Browse* / *Remix*, *Share*, *Clean* and **Save to Minecraft**.
- **Left panel:** four tabs, **Shape**, **Detail**, **Weather** and **Blocks**.
  - The main settings show first. Use *+ N more settings*, or turn on **Advanced settings**, to see the rest.
  - The search box looks through every tab.
  - Double-click a slider to reset it. Orange dots mark settings that differ from the defaults.
- **Details card** (bottom right) shows the paste commands and the block list.
  - Click a block to see only that block in 3D. Hover for stack counts.
  - *Copy list* copies the list for survival builds.
- **Clean UI** (press **C**) hides the less-used controls.
- The bars adapt to the window size: labels shorten, then hide, so nothing overlaps.

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| R | New seed | Ctrl+S | Save to Minecraft |
| M | Remix | E | Download `.schem` |
| B | Seed browser | P | Screenshot |
| C | Clean UI | 1–6 | Camera views |
| ? | All shortcuts | Ctrl+Z / Ctrl+Shift+Z | Undo / redo |

## Where it saves

*Save to Minecraft* searches the PC each time it opens (↻ searches again). It finds:

- the official launcher's `.minecraft` folder, including the Microsoft Store launcher
- instances from Prism, MultiMC and PolyMC (normal, Flatpak and portable installs, including moved instance folders),
  CurseForge, Modrinth App, ATLauncher, GDLauncher and Technic
- servers and game folders on the Desktop, in Documents, Downloads and OneDrive, and at the top level of each drive:
  - Forge and Fabric servers use `config/worldedit/schematics`
  - Paper and Spigot servers use `plugins/WorldEdit/schematics`

Instances that already have WorldEdit are listed first. Instances without it are under *more instances*:
you can save there too, and the file is ready once WorldEdit is added.

To add anything else, paste a folder path or press **Browse**, which opens your system's own folder picker.
You can add a game or server folder, a whole instances folder (every instance in it is added) or any plain folder.
Added folders are stored in `folders.json`.

A copy of every save is also kept in `exports/`.

## How generation works

<details>
<summary><b>Pieces and mazes</b></summary>

Every piece goes through the same footprint builder:

1. The outline is traced into faces.
2. Each face gets its own design.
3. The ends are capped.
4. Corners carry one design round continuously.

*Width* is the outside length of an arm. *Show attached walls* previews a junction joined to straight walls;
only the piece itself is exported.

**Whole maze** sets the grid size, corridor width and wall width, and *Loops* sets how many dead ends are opened up.
It can also add a central **Glade** with a gate in each side.
</details>

<details>
<summary><b>Skyline, seams and faces</b></summary>

- *Skyline roughness* steps the top slabs up and down.
- *Skyline slope* tilts the whole top one way.
- *Broken tops* knocks ragged chunks out of the top edges.
- *Seam matching* gives both ends of a straight wall the same joint profile. Walls with different seeds then line up
  end to end, as long as they use the same *Seam pattern*.
- The **Faces** section can give any single face its own layout or variation.
- *Panel distinction* makes every slab read as its own cast panel.
</details>

<details>
<summary><b>Rain, dirt and ivy</b></summary>

- **Where the rain goes.** Rain lands on every top open to the sky.
  - It collects at a few drip points and runs down the face below, spreading as it falls.
  - It drips again from any ledge it lands on.
  - It creeps back along the undersides of ledges.
- **What changes the dirt.** Wind drives rain onto the faces it blows at, and sun dries the south faces.
  Heavy flow washes the middle of a streak cleaner than its edges.
- **What grows.** The same wet paths decide where moss and ivy grow.
  - Ivy takes root on the ground, on ledges and in cracks.
  - It branches and wraps round corners.
  - It favours shade and damp.
- **Every vine is attached to something.** Each one sits on a real face, and leaves are exported as persistent,
  so nothing drops after pasting.
- **Sliders only change what they touch.** Each block's randomness is fixed to its position,
  so moving a rain slider changes only the blocks the water reaches.
</details>

## Project layout

```
server.py           local server: serves the app, finds WorldEdit folders, writes .schem files
start.sh / .bat / .command   launchers for Linux, Windows and macOS
web/
  index.html        UI markup and icon set
  app.js            UI, settings schema, saving and sharing
  gen.js            wall generator (footprints, skins, rain, ivy)
  worker.js         runs the generator off the main thread
  viewer.js         three.js preview
  palette.js        auto palette from texture colours
  schem.js          Sponge schematic v2 reader and writer
  textures/         block library and textures (built by tools/build_library.py)
  lib/              three.js (vendored)
tests/run.mjs       regression tests
tools/              block library builder
```

## Development

```sh
npm test                        # or: node tests/run.mjs
python3 server.py --no-browser  # start without opening a browser
```

The tests check:

- every preset and piece type, for floating vines, see-through holes and `.schem` round trips
- the corner geometry
- that the layouts really differ from each other
- seam matching and face overrides
- skyline controls
- the rain physics
- that sliders only change the blocks they touch
- that the same seed always gives the same result

GitHub Actions runs them on every push.

To rebuild the block library after updating Minecraft or Create, run `python3 tools/build_library.py`.
It reads the client jar and resolves each block's models and textures the same way the game does.

The server listens only on `127.0.0.1` and answers only the studio page itself.
It writes only `.schem` files, and only into the folders it lists.

## Notes

This repository includes Minecraft and Create textures for the preview. They belong to Mojang and the Create team,
so keep the repository private.
