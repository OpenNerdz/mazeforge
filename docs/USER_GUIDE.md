# User guide

[Back to the README](../README.md) · [Texture setup](TEXTURES.md)

## Workspace


The top bar contains presets, undo and redo, seed controls, sharing and saving.
The left panel has **Shape**, **Detail**, **Weather** and **Blocks** tabs. Enable
**Advanced settings** for fine control, or use the search box to find a setting.
Double-click a slider to reset it. Orange dots mark changed settings.

The details card shows paste commands and a material list. Select a block to isolate
it in the preview, or copy the list for a survival build. **Clean UI** hides secondary
controls. Settings and custom presets are remembered in your browser.

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| R | New seed | Ctrl+S | Save to Minecraft |
| M | Remix | E | Download `.schem` |
| B | Seed browser | P | Screenshot |
| C | Clean UI | 1–6 | Camera views |
| ? | Shortcuts | Ctrl+Z / Ctrl+Shift+Z | Undo / redo |

Share links point to the local app address: the recipient must start their own copy
of MazeForge before opening the link. Existing `MSS1` share codes and saved
browser settings remain compatible.

## Saving and privacy

**Save to Minecraft** shows folders you have added. **Find game folders** checks
standard launcher locations only when clicked, including the official launcher,
Prism, MultiMC, PolyMC, CurseForge, Modrinth App, ATLauncher, GDLauncher and Technic.
It does not search Documents, Desktop or unrelated folders. Portable, moved and
custom game or server installations can be added using **Browse** or a full path.
WorldEdit mod and plugin folders are recognized inside the selected installation;
you can also choose a schematic folder directly.

Saving writes only to the folders you select. Existing schematics are preserved unless you enable **Overwrite**. For large designs, enable chunked saving and paste each chunk
from the same marked position. A copy of successful saves is retained in `exports/`.
Added folder paths are stored locally in `folders.json`; both are excluded from Git.

Desktop downloads keep `folders.json`, `exports/` and `local-textures/` in your
own application data folder, so updates and moving the app preserve your data:

| System | Local data folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\MazeForge` |
| macOS | `~/Library/Application Support/MazeForge` |
| Linux | `$XDG_DATA_HOME/mazeforge`, or `~/.local/share/mazeforge` |

The source version keeps this data beside the app (`web/local-textures/` for imports).

The server binds to `127.0.0.1`, accepts local host/origin requests, and serves only
the web directory. No files or settings are uploaded. Keep it running on your own
computer; it is a desktop companion, not an internet-facing server.

## Generation controls

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


## Run from source

The source ZIP (`mazeforge-<version>.zip`, without an OS name) requires
[Python 3.10 or newer](https://www.python.org/downloads/). Start `start.bat` on
Windows, `bash start.command` on macOS or `bash start.sh` on Linux. Stop it with
**Ctrl+C** in its terminal. Node.js and npm are needed only for development.
