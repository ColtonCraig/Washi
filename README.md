# Washi

A browser made of paper scraps. A vertical sidebar like Arc, built on Chromium, for the Mac.

## Install it as a real Mac app
```
npm install        # once per new version
npm run app        # builds Washi and puts it in /Applications, then opens it
```
After that, open Washi from the Dock, Spotlight or Launchpad like any app; no Terminal needed. When you get a new version, run the same two commands again. Your tabs and settings stay put.

## Run it from source (for testing changes)
```
npm start          # your normal profile
npm run fresh      # start from scratch: shows the welcome setup again
```
Washi → **Start Fresh…** in the menu bar does the same thing as `npm run fresh`.

## What's inside
- **Sidebar.** Spaces with their own colors, pinned tabs, folders (drag tabs in and out, collapse them, the tab you're on stays visible), and split cards. Pin it, or let it float and hover the left edge.
- **Split view.** Drag a tab onto the page. Split tabs stay together on one card.
- **Command bar (⌘T).** Search with suggestions, go to an address, find any tab, history or archived tab, and run any command. It understands !bangs: `!yt`, `!w`, `!gh`, `!a`, `!m` and 22 more.
- **Peek.** Shift-click a link, or right-click → Peek, to look at it in a floating card. **Open as tab** keeps it.
- **Find (⌘F), History (⌘Y), Archive (⌥⌘A), Downloads (⌥⌘L).**
- **Tidy-up.** Optional archive for tabs you haven't opened in a while. Sleeping tabs to save memory. Picture in picture when you switch away from a video.
- **Make it yours.** Light, dark or match your Mac. Paper and ink colors, each space's colors, texture, tilt, animations. **Every keyboard shortcut is editable** (Settings → Shortcuts).
- **Private and secure.** Ad and tracker blocking, phishing and malware warnings (checked on your Mac), HTTPS-first, secure DNS, a pop-up blocker, permissions remembered per site, and separate logins per space. Full details in [docs/SECURITY.md](docs/SECURITY.md).

## Keyboard
These are the defaults; change any of them in Settings → Shortcuts.

| | |
|---|---|
| ⌘T new scrap · ⌘L edit address | ⌘W close · ⇧⌘T reopen |
| ⌘D pin · ⌘S pin/float sidebar | ⌘\ split view |
| ⌘F find · ⇧⌘C copy address | ⌘Y history · ⌥⌘A archive · ⌥⌘L downloads |
| ⌃1–6 spaces · ⌘1–8 pinned tabs | ⌃⌘M mute · ⌃⌘P picture in picture |
| ⌘, settings | Help → Quick-Start Guide |

## Tests
`npm test` runs everything:
- `split`: split pairs and folders, driven by a real mouse
- `audit`: every screen, light and dark, checked for anything clipped
- `preview`: every Look control updates the live preview
- `features`: blocking, pop-ups, find, peek, history, archive, sleeping tabs, downloads, mute, bangs, suggestions, shortcut editor, separate logins
- `security`: walled-off interface, HTTPS-first, phishing warnings, remembered permissions, headers
- `onboarding`: the whole welcome setup, then a second launch
- `perf`: start-up time, idle CPU, memory, tab-switch speed

On Linux they need xvfb. The runner points two test hostnames at localhost.

## Build the Mac app
```
npm run dist       # fresh blocklists, then Washi.dmg + .zip for Apple silicon and Intel in dist/
```
Installing from a download and automatic, signed self-updates (no Apple Developer account needed): see [docs/UPDATES.md](docs/UPDATES.md).
`npm run lists` rebuilds the bundled blocklists. `npm run icon` re-renders the app icon; `npm run icon -- B` switches to another logo from `build/logo-options` (A tape roll, B taped globe, C tape star).

## Layout
- `main.js`: window, tabs, sidebar, overlay, peek, find, menus
- `app/`: security, the `washi://` scheme, web sessions (permissions, https-first, blocking, downloads), blocklists, phishing set, shortcuts, updater, storage
- `ui/`: the paper interface (shell, sidebar, overlay: command bar, setup, settings, sheets, panels)
- `resources/lists/`: bundled blocklists
- `build/`: icon, installer background, macOS entitlements
- `test/`: end-to-end tests and their local test server
