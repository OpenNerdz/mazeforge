#!/usr/bin/env bash
# Start Maze Structure Studio on macOS (double-click in Finder)
cd "$(dirname "$0")" && exec python3 server.py "$@"
