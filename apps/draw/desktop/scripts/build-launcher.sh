#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$desktop_dir/build"
xcrun swiftc \
  -O \
  -target arm64-apple-macos11.0 \
  -framework AppKit \
  -framework WebKit \
  "$desktop_dir/src/EvedrawApp.swift" \
  -o "$desktop_dir/build/Evedraw"
