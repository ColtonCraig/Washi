#!/usr/bin/env bash
# Builds Washi and installs it into /Applications, so you can open it from the Dock, Spotlight or Launchpad.
# Run it again whenever you get a new version: it replaces the app, and your tabs and settings stay put
# (they live in ~/Library/Application Support/Washi, not inside the app).
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(uname)" = "Darwin" ] || { echo "This installs the Mac app; run it on your Mac."; exit 1; }
ARCH=$( [ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64 )
echo "→ Building Washi for ${ARCH}… (about a minute)"
rm -rf dist
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --$ARCH >/tmp/washi-build.log 2>&1 || { echo "Build failed. Details: /tmp/washi-build.log"; tail -20 /tmp/washi-build.log; exit 1; }
APP=$(ls -d dist/mac*/Washi.app | head -1)
echo "→ Signing it for this Mac"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
if pgrep -xq Washi; then echo "→ Quitting the running Washi"; osascript -e 'quit app "Washi"' >/dev/null 2>&1 || true; sleep 2; fi
echo "→ Installing to /Applications"
rm -rf /Applications/Washi.app
ditto "$APP" /Applications/Washi.app
xattr -dr com.apple.quarantine /Applications/Washi.app 2>/dev/null || true
echo "✓ Washi is installed. Opening it…"
open /Applications/Washi.app
