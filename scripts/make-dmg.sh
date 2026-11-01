#!/bin/bash
# Makes the installer disk image with Washi's paper installer window. Usage: scripts/make-dmg.sh <Washi.app> <out.dmg>
# Finder itself lays out the window (background, icon spots, size), so it's saved in the format the current macOS reads.
set -euo pipefail
APP="$1"; OUT="$2"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W=680; H=440; TITLE=28                          # the art is 680x440; the window adds a title bar
WORK=$(mktemp -d); RW="$WORK/rw.dmg"; VOL="Washi"
SIZE=$(( $(du -sm "$APP" | cut -f1) + 40 ))
hdiutil create -quiet -size ${SIZE}m -fs HFS+ -volname "$VOL" -ov "$RW"
for v in "/Volumes/$VOL"*; do [ -d "$v" ] && hdiutil detach -quiet -force "$v" || true; done
DEV=$(hdiutil attach -readwrite -noverify -noautoopen "$RW" | awk '/Apple_HFS/ {print $1}')
M="/Volumes/$VOL"
ditto "$APP" "$M/Washi.app"
ln -s /Applications "$M/Applications"
mkdir "$M/.background"
tiffutil -cathidpicheck "$ROOT/build/dmg-background.png" "$ROOT/build/dmg-background@2x.png" -out "$M/.background/background.tiff" >/dev/null
cp "$ROOT/build/icon.icns" "$M/.VolumeIcon.icns"; SetFile -a C "$M" 2>/dev/null || xattr -wx com.apple.FinderInfo "0000000000000000040000000000000000000000000000000000000000000000" "$M"
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$VOL"
    open
    delay 1
    set w to container window
    set current view of w to icon view
    set toolbar visible of w to false
    set statusbar visible of w to false
    set pathbar visible of w to false
    set sidebar width of w to 0
    set the bounds of w to {200, 140, 200 + $W, 140 + $H + $TITLE}
    set o to the icon view options of w
    set arrangement of o to not arranged
    set icon size of o to 128
    set text size of o to 13
    set label position of o to bottom
    set shows item info of o to false
    set shows icon preview of o to false
    set background picture of o to file ".background:background.tiff"
    set position of item "Washi.app" of w to {180, 224}
    set position of item "Applications" of w to {500, 224}
    update without registering applications
    delay 2
    close
    open
    delay 2
    close
  end tell
end tell
APPLESCRIPT
for i in $(seq 1 20); do [ -f "$M/.DS_Store" ] && break; sleep 1; done   # Finder writes its settings a moment later
sleep 2
chmod -Rf go-w "$M" || true
sync
hdiutil detach -quiet "$DEV" || { sleep 3; hdiutil detach -force "$DEV"; }
rm -f "$OUT"
hdiutil convert -quiet "$RW" -format UDZO -imagekey zlib-level=9 -o "$OUT"
rm -rf "$WORK"
echo "made $OUT"
