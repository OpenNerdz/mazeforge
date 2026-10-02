# Development

[Contribution guidelines](../CONTRIBUTING.md) · [Release guide](RELEASING.md)

## Architecture

The app is plain JavaScript modules served as they are: there is no build step, and Python 3 is the only thing needed to run it.

- **Generation runs in a background worker** (`web/worker.js`). The page sends the settings; the worker generates the design,
  turns it into a mesh and sends both back without copying them. Only the newest settings are ever built: changes made during
  a build collapse into one follow-up request, so dragging a slider stays smooth.
- **Meshing** (`web/core/mesh.js`) keeps only block faces that can be seen and merges neighbouring faces with the same texture
  into one quad (greedy meshing). Each vertex is four 16-bit numbers: position plus texture layer and face direction.
  The shader works out normals and texture coordinates from those.
- **Rendering** (`web/ui/viewer.js`, three.js). All block textures come from one atlas and sit in a single texture array,
  so each of the three passes (opaque, cut-out for leaves, vines and bars, and glass) is a single draw call. Frames are drawn only when
  something changes, and shadows are redrawn only when the structure or the sun moves.
- **Determinism**: every random choice comes from the seed, and most come from a fixed roll per block position, so a slider only
  changes the blocks it affects. The tests fingerprint the exact output of several designs.

## Development commands

Requires Node.js 22+ and Python 3.10+. The committed app runs without a build step;
its bundled three.js renderer is included.

```sh
npm ci
npm test                     # generation, schematic round trips, seams, weathering, meshes
npm run test:server          # local HTTP boundary and saves in disposable directories
npm run check                # JavaScript lint and type checks
uvx ruff check               # Python lint (or install Ruff separately)
python3 tools/build_preview.py  # regenerate original release preview materials
npm run vendor              # rebuild the renderer after updating three.js
npm run package             # portable ZIP + SHA256SUMS.txt in dist/
```

The original preview atlas is deterministic. The in-app texture importer reads only the client JAR you select and stores its preview
in the ignored `web/local-textures/` directory; see [texture setup](TEXTURES.md).
Never commit or distribute imported game assets. The packaging script uses an explicit
file allowlist, so personal exports, folder paths, game assets, dependencies and Git
metadata are excluded even when present in your working folder.

GitHub Actions runs lint, type checks, generation tests, local server tests on Linux,
Windows and macOS, a dependency audit, preview reproducibility, packaging, and secret scans.
See [the release guide](RELEASING.md) for packaging and publishing,
[CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidance and
[SECURITY.md](../SECURITY.md) for reporting security issues.

