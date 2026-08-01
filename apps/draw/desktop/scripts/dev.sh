#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$desktop_dir/scripts/stage.sh"
"$desktop_dir/scripts/build-launcher.sh"
EVEDRAW_DESKTOP_RESOURCE_ROOT="$desktop_dir" "$desktop_dir/build/Evedraw"
