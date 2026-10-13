#!/bin/bash
# Stable entrypoint: rebuild a stale recorder before use, then preserve its exit status.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_file="$repo_dir/scripts/record-game-window.swift"
binary_file="$repo_dir/artifacts/betalot/bin/record-game-window"
if [[ ! -x "$binary_file" || "$source_file" -nt "$binary_file" ]]; then
  mkdir -p "$(dirname "$binary_file")" /tmp/betalot-swift-cache
  xcrun swiftc -parse-as-library -module-cache-path /tmp/betalot-swift-cache \
    "$source_file" -o "$binary_file"
fi
exec "$binary_file" "$@"
