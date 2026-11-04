#!/bin/bash
# Install (or update) Washi on a Mac, from the latest release. For friends:
#   curl -fsSL https://raw.githubusercontent.com/ColtonCraig/Washi/main/scripts/get-washi.sh | bash
# It picks the right build for your Mac, checks the download against the release list and Washi's own code signature, puts Washi in
# /Applications and opens it. Running it again updates to the newest version.
set -euo pipefail
REL="https://github.com/ColtonCraig/Washi-releases/releases/latest/download"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || die "Washi is a Mac app: run this on a Mac."
case "$(uname -m)" in arm64) ARCH=arm64 ;; x86_64) ARCH=x64 ;; *) die "Unknown Mac chip: $(uname -m)" ;; esac
# A Terminal running under Rosetta on an Apple chip still says x86_64: ask the hardware.
[ "$ARCH" = x64 ] && [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = 1 ] && ARCH=arm64

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say "Finding the newest Washi…"
curl -fsSL "$REL/latest.json" -o "$TMP/latest.json" || die "Couldn't reach GitHub. Check your internet and try again."
read -r VER NAME SHA < <(osascript -l JavaScript -e "
  const j = JSON.parse($.NSString.stringWithContentsOfFileEncodingError('$TMP/latest.json', 4, null).js);
  const p = JSON.parse(j.payload || JSON.stringify(j)), f = p.files['$ARCH'];
  p.version + ' ' + f.name + ' ' + f.sha256") || die "The release list looks wrong. Tell Colton."
[ -n "$SHA" ] || die "No $ARCH build in the latest release. Tell Colton."

say "Downloading Washi $VER for $([ $ARCH = arm64 ] && echo 'Apple chip' || echo 'Intel')…"
curl -fL --progress-bar "$REL/$NAME" -o "$TMP/$NAME" || die "The download failed. Try again."
GOT="$(shasum -a 256 "$TMP/$NAME" | cut -d' ' -f1)"
[ "$GOT" = "$SHA" ] || die "The download doesn't match the release (it may be damaged). Nothing was installed."

mkdir -p "$TMP/app"; ditto -x -k "$TMP/$NAME" "$TMP/app"
[ -d "$TMP/app/Washi.app" ] || die "The download didn't contain Washi.app. Tell Colton."
codesign --verify --deep --strict "$TMP/app/Washi.app" 2>/dev/null && codesign -dvv "$TMP/app/Washi.app" 2>&1 | grep -q "Authority=Washi (Colton Craig)" \
  || die "This copy isn't signed by Washi. Nothing was installed. Tell Colton."
if pgrep -xq Washi; then say "Closing Washi to update it (your tabs come back)…"; osascript -e 'quit app "Washi"' || true
  for _ in $(seq 1 20); do pgrep -xq Washi || break; sleep 0.5; done; fi
DEST=/Applications; [ -w "$DEST" ] || DEST="$HOME/Applications"; mkdir -p "$DEST"
rm -rf "$DEST/Washi.app"; ditto "$TMP/app/Washi.app" "$DEST/Washi.app"
xattr -dr com.apple.quarantine "$DEST/Washi.app" 2>/dev/null || true   # downloaded by curl, not a browser: no "unidentified developer" prompt
say "Washi $VER is in $DEST. Opening it…"
open "$DEST/Washi.app"
