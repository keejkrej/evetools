#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$desktop_dir/scripts/stage.sh"
"$desktop_dir/scripts/build-launcher.sh"
cd "$desktop_dir"
if [ -d dist/Evedraw.app ]; then
  "$lsregister" -u "$desktop_dir/dist/Evedraw.app" >/dev/null 2>&1 || true
fi
rm -rf dist/Evedraw.app
rm -rf build/native-package-assets
mkdir -p dist build/native-package-assets
pnpm exec native validate app.zon
pnpm exec native package \
  --target macos \
  --binary build/Evedraw \
  --assets "$desktop_dir/build/native-package-assets" \
  --output dist/Evedraw.app \
  --web-engine system \
  --web-layer include
mkdir -p dist/Evedraw.app/Contents/Resources/assets
cp -R assets/. dist/Evedraw.app/Contents/Resources/assets/
codesign --force --deep --sign - dist/Evedraw.app
codesign --verify --deep --strict dist/Evedraw.app
# A build artifact is not an installed application and must not compete with
# /Applications/Evedraw.app for custom-scheme callbacks during local testing.
"$lsregister" -u "$desktop_dir/dist/Evedraw.app" >/dev/null 2>&1 || true
