#!/bin/bash
# Signs Washi.app with Washi's own certificate (see scripts/signing-identity.js). Usage: scripts/sign-mac.sh <App.app>...
set -euo pipefail
KC="$RUNNER_TEMP/washi-sign.keychain-db"; KP=$(openssl rand -hex 12)
if [ ! -f "$KC" ]; then
  P=$(node "$(dirname "$0")/signing-identity.js" open "$RUNNER_TEMP/washi.p12")
  security create-keychain -p "$KP" "$KC"
  security set-keychain-settings "$KC"
  security unlock-keychain -p "$KP" "$KC"
  security import "$RUNNER_TEMP/washi.p12" -k "$KC" -P "$P" -T /usr/bin/codesign >/dev/null
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KP" "$KC" >/dev/null
  security list-keychains -d user -s "$KC" $(security list-keychains -d user | tr -d '"')
  rm -f "$RUNNER_TEMP/washi.p12"
fi
ID=$(security find-identity -p codesigning "$KC" | awk '/Washi \(Colton Craig\)/ {print $2; exit}')
[ -n "$ID" ] || { echo "signing identity not found"; security find-identity "$KC"; exit 1; }
for APP in "$@"; do
  codesign --force --deep --sign "$ID" --keychain "$KC" --identifier com.coltoncraig.washi "$APP"
  codesign --verify --deep --strict "$APP"
  codesign -d -r- "$APP" 2>&1 | grep designated
done
