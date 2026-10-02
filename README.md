# MazeForge

**[Download the latest release — Windows, macOS and Linux](https://github.com/OpenNerdz/mazeforge/releases/latest)**

Design weathered walls and seeded mazes for Minecraft Java Edition. Preview in 3D
and export WorldEdit schematics. Runs locally in your browser; no account or Python
installation is needed for desktop downloads.

> **Beta:** features and compatibility are still being tested. Back up your world before pasting structures.

## Get started

1. Choose the desktop archive for your system from the release linked above.
2. Extract the entire archive and open the app listed below.
3. Your browser opens MazeForge. Choose a preset and adjust **Shape**, **Detail**, **Weather** and **Blocks**.

| System | Archive ending | Open |
| --- | --- | --- |
| Windows 10/11, x64 | `windows-x64.zip` | `MazeForge.exe` |
| macOS, Apple Silicon | `macos-arm64.zip` | `MazeForge.app` |
| macOS, Intel | `macos-x64.zip` | `MazeForge.app` |
| Linux, x64 | `linux-x64.tar.gz` | `MazeForge` |

Use a current Chrome, Edge or Firefox browser with WebGL 2 enabled. Desktop builds
are tested on Windows, macOS 15 and Ubuntu 22.04. Linux requires glibc 2.35+;
Alpine/musl and ARM Linux are not supported by these binaries.

**First launch:** builds are unsigned. Windows SmartScreen, macOS **System Settings
→ Privacy & Security**, or your Linux file manager may ask for approval. Only
approve files you trust from this repository; do not disable system protections.

Use **More → Quit MazeForge** to stop the app. Closing the browser tab leaves it
running; opening the app again reopens the workspace.

![MazeForge workspace with a weathered wall in the 3D preview](docs/screenshot.png)

## Save to Minecraft

1. Select **Save to Minecraft** and choose your WorldEdit schematic folder. Use
   **Find game folders** for standard installations, or **Browse** for a custom location.
2. Save your design. You can also use **More → Download .schem** and place the file manually.
3. In Minecraft, stand at the orange paste marker shown in the preview, face north,
   and run the commands shown in the app. For a file saved as `studio/<name>`:

```text
//schem load studio/<name>
//paste -a
```

Requires **Minecraft Java Edition and a matching WorldEdit version**. Exported
blocks must exist in your game version; Bedrock and legacy formats are not supported.

The bundled preview library targets 1.20.1 and uses original artwork. For your
installed version's textures and block catalog, use **More → Minecraft textures
→ Choose client JAR**. See [texture setup](docs/TEXTURES.md) for file locations.

## Design tools

- Walls, corners, junctions and mazes with an optional central glade.
- Towers, passages, broken tops, lettering, rain streaks, moss and ivy.
- Custom palettes, matching wall seams and repeatable designs from seeds.
- Share codes, batch exports and aligned chunks for large builds.

The [user guide](docs/USER_GUIDE.md) covers controls, shortcuts, sharing and local
data locations. Settings and imported textures stay on your computer; the app has
no telemetry or cloud backend. Saving writes only to selected folders and preserves
existing schematics unless you enable **Overwrite**.

## Help

| Problem | What to check |
| --- | --- |
| Asked to install Python | Choose a desktop archive; the source ZIP requires Python. |
| Blank preview | Extract every file, enable hardware acceleration and WebGL 2, then reload. |
| Port already in use | Close another copy of MazeForge or the program using port 8765. |
| Unknown blocks in Minecraft | Import your game's client JAR and select blocks available in that version. |
| Folder picker unavailable | Paste the full schematic folder path. |

[Report a bug](https://github.com/OpenNerdz/mazeforge/issues): include your app
version, operating system, browser and steps to reproduce. Remove personal paths
from screenshots. Report security concerns through [private vulnerability reporting](https://github.com/OpenNerdz/mazeforge/security/advisories/new).

## Development

To run without a desktop build, follow [Run from source](docs/USER_GUIDE.md#run-from-source)
(Python 3.10+). For code changes, see [Contributing](CONTRIBUTING.md), the
[development guide](docs/DEVELOPMENT.md) and the [release guide](docs/RELEASING.md).
Release changes are recorded in the [changelog](CHANGELOG.md).

## License

Code and original artwork: [MIT](LICENSE). Dependencies: [third-party notices](THIRD_PARTY_NOTICES.md).
Imported Minecraft assets remain the property of their owners and are not distributed with MazeForge.

**Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.**
