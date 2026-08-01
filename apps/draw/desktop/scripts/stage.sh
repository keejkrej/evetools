#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_dir=$(CDPATH= cd -- "$desktop_dir/../../.." && pwd)
assets_dir="$desktop_dir/assets"
cache_dir="$desktop_dir/.cache"
node_version=22.23.1
node_archive="node-v${node_version}-darwin-arm64.tar.gz"
node_url="https://nodejs.org/dist/v${node_version}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) ;;
  *) echo "Desktop packaging requires Apple Silicon macOS." >&2; exit 1 ;;
esac

mkdir -p "$cache_dir" "$assets_dir"
pnpm --dir "$repo_dir" --filter @evetools/draw build

rm -rf "$assets_dir/server" "$assets_dir/node"
mkdir -p "$assets_dir/server/apps/draw/web/.next"
cp -R "$repo_dir/apps/draw/web/.next/standalone/." "$assets_dir/server/"
cp -R "$repo_dir/apps/draw/web/.next/static" "$assets_dir/server/apps/draw/web/.next/static"
cp -R "$repo_dir/apps/draw/web/public" "$assets_dir/server/apps/draw/web/public"

if [ ! -f "$cache_dir/$node_archive" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 \
    "$node_url/$node_archive" --output "$cache_dir/$node_archive"
fi
curl --fail --location --proto '=https' --tlsv1.2 \
  "$node_url/SHASUMS256.txt" --output "$cache_dir/SHASUMS256.txt"
(
  cd "$cache_dir"
  grep "  $node_archive\$" SHASUMS256.txt | shasum -a 256 -c -
)
mkdir -p "$assets_dir/node"
tar -xzf "$cache_dir/$node_archive" --strip-components=1 -C "$assets_dir/node"
test -x "$assets_dir/node/bin/node"
test -f "$assets_dir/node/LICENSE"
test -f "$assets_dir/server/apps/draw/web/server.js"
