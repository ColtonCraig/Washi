#!/bin/bash
# Makes the installer disk image with Washi's paper installer window. Usage: scripts/make-dmg.sh <Washi.app> <out.dmg>
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -c "import dmgbuild" 2>/dev/null || pip3 install -q --break-system-packages dmgbuild==1.6.5 || pip3 install -q dmgbuild==1.6.5
[ -f build/dmg-background.tiff ] || tiffutil -cathidpicheck build/dmg-background.png build/dmg-background@2x.png -out build/dmg-background.tiff
python3 -m dmgbuild -s build/dmg-settings.py -D app="$1" "Washi" "$2"
