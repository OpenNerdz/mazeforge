# Security

MazeForge 2.x is the supported release series. Update to the latest release
before reporting a problem.

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/OpenNerdz/mazeforge/security/advisories/new)
when available. If it is unavailable, open an issue asking for a private reporting
channel without posting sensitive details. Include the affected version, expected
behavior and enough information for the maintainer to investigate safely.

Do not put credentials, personal file paths or private game files in public reports.

## Local data

The server listens on loopback, checks host/origin headers, and writes schematic
files only to discovered or explicitly added folders. It is intended for a single
user's own computer. Browser extensions and other software running as that user
may have access to the same local files and services.

`folders.json` stores added paths, `exports/` stores saved schematics, and
`web/local-textures/` stores imported game textures. These paths are ignored by
Git and excluded by the release allowlist. Browser storage holds settings and
presets. The app has no telemetry, account system, API keys or cloud backend.
