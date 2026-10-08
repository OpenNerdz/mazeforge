# Changelog

## 2.0.1-beta.3

- Relief carved from two faces no longer cuts a slot right through a wall at corners, junctions and maze wall
  tips, leaving a thin stranded plate: the solid core behind each recess is now kept.
- Maze wall tips at the start or end of an outline are recognised as wall ends, so they follow their wall's
  height and end detailing instead of standing up to 69 blocks above or below it.
- **Designs change:** existing seeds and share codes now build slightly different walls, mostly at corners,
  junctions and maze tips. A straight wall's shape changes only within four blocks of its ends, though its ivy
  grows differently.

## 2.0.1-beta.2

- Feature the current beta in GitHub’s Latest release slot and use a lasting download link.
- Validate desktop builds on pull requests and group routine dependency updates into monthly batches.
- Document release verification and publishing.
- Messages and tooltips now appear above open dialogs instead of behind their dimmed backdrop.
- Enter in a dialog field runs the dialog's main action (Save, Load, Export) instead of closing it.
- Ctrl+S saves from a text field too, and single-key shortcuts no longer act behind an open dialog.
- The Save dialog offers Download .schem; the seed browser can page back; batch export stops when closed and reports failures.
- Settings sections, seed thumbnails and the block picker work from the keyboard; the picker closes with Esc.
- Phones: the details card is visible again, dialogs fit the screen, and New seed, Undo and Redo are in the More menu.
- Medium-width windows no longer cut off the settings tabs and switches; slider fills match their values.
- Tiles is disabled for pieces it does not affect; switching tabs scrolls to the top; empty searches say so.
- Higher-contrast help text, named dialogs and icon buttons, and toggle states for screen readers.
- Startup builds the first design once instead of twice.
- Designs too large for a browser tab stop with a clear message instead of running out of memory.
- A damaged .schem file is rejected at once instead of freezing the page; an opened file is preview-only, since
  writing it back would lose block states, modded blocks and block entities.
- Moss carpet is left out for game versions before 1.17, which do not have it.
- Long design names no longer give chunked saves colliding file names.
- Local server: an unreadable folder no longer breaks folder discovery or saving; Find game folders no longer
  lists Windows folders twice; missing files get a 404 instead of a dropped connection; HEAD requests get the
  same host check as GET; failed writes leave no temporary files; a folder listed twice is written once.
- Designs build 15–50% faster and their 3D preview meshes about 30% faster, with identical output.

## 2.0.1-beta.1

- Standalone Windows, macOS (Apple Silicon and Intel) and Linux downloads with Python bundled.
- Persistent per-user desktop data and a Quit action in the workspace.
- Clearly label the app and documentation as beta software with expected bugs.
- Add a visible issue-reporting link in the workspace on desktop and mobile.
- Mark public releases as prereleases while testing continues.

## 2.0.0 (beta)

First public beta release, under the name **MazeForge**. Bugs are expected while testing continues.

- Updated identity, app icon, documentation and portable release packaging.
- Vanilla-only default palettes, original preview materials and authentic textures imported from an explicitly selected Java client JAR.
- Version-aware block catalogs and schematic metadata; save discovery only on request.
- Generation and greedy meshing in a background worker; bundled three.js renderer and texture atlas.
- Straight walls, corners, junctions and seeded mazes, with weathering, ivy, seam matching and face controls.
- WorldEdit schematic downloads, local saving, aligned chunks, batch exports and compatible share codes.
- Accessible control names, reduced-motion support and a visible startup error message.
- Local HTTP input validation, restricted save paths and atomic writes.
- Regression tests, server boundary tests, cross-platform CI, secret scanning and dependency checks.

## Earlier development

Previous commits document the private development of the generator and interface.
Public packages include original preview artwork; locally imported game textures
are excluded from distribution.
