#!/usr/bin/env bash
# Start MazeForge on macOS (double-click in Finder)
cd "$(dirname "$0")" && exec python3 server.py "$@"
