#!/bin/bash
# Washi for Dia: DiaTweaks (https://github.com/JaceThings/DiaTweaks, by JaceThings) with Washi's own tweaks added,
# built and installed on this Mac. Run it again to update both.
#   curl -fsSL https://raw.githubusercontent.com/ColtonCraig/Washi/main/dia-tweaks/get.sh | bash
# DiaTweaks' code comes straight from its repo on this Mac; none of it is copied into Washi's.
set -euo pipefail
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || die "This is for a Mac."
[ -d /Applications/Dia.app ] || die "Dia isn't in Applications. Get it from https://www.diabrowser.com, then run this again."
if ! xcode-select -p >/dev/null 2>&1 || ! command -v clang >/dev/null 2>&1; then
  say "Washi needs Apple's command line tools to build. Click Install in the window that opens, then run this again."
  xcode-select --install 2>/dev/null || true; exit 1
fi
# The diatweaks command (Dia updates from its Settings) is built with Rust: set it up quietly if it isn't here.
PATH="$PATH:$HOME/.cargo/bin"
if ! command -v cargo >/dev/null; then say "Setting up Rust (once, a minute or two)…"; curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal >/dev/null; fi

W="$HOME/Library/Application Support/WashiDia"; mkdir -p "$W"
say "Getting DiaTweaks…"
if [ -d "$W/diatweaks/.git" ]; then git -C "$W/diatweaks" fetch -q --depth 1 origin main && git -C "$W/diatweaks" reset -q --hard FETCH_HEAD && git -C "$W/diatweaks" clean -qfd
else rm -rf "$W/diatweaks"; git clone -q --depth 1 https://github.com/JaceThings/DiaTweaks "$W/diatweaks"; fi
say "Getting Washi's tweaks…"
rm -rf "$W/washi"; git clone -q --depth 1 https://github.com/ColtonCraig/Washi "$W/washi"
cp -R "$W/washi/dia-tweaks/Patches/"* "$W/diatweaks/src/dylib/Patches/"
# DiaTweaks' own updater would put its plain build back over this one (Washi's tweaks gone): it looks somewhere with
# no releases instead, and this script is how both update.
sed -i '' 's|https://api.github.com/repos/JaceThings/DiaTweaks/releases/latest|https://api.github.com/repos/ColtonCraig/Washi/releases/tags/dia-tweaks-none|' "$W/diatweaks/src/diapatch/main.m"
defaults write com.diapatches devTools -bool YES          # lets Washi's tweaks be checked against Dia's real views
say "Building and installing (Dia will quit and open again)…"
cd "$W/diatweaks" && ./install.sh --yes
say "Done. Washi's tweaks are in Dia's Settings › DiaTweaks › Window."
