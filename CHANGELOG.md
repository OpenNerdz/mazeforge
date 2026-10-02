# Changelog

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
The first public release preserves those code changes while removing game texture
images and automated co-author trailers from the published history.
