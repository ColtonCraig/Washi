# Washi backlog (running tally)
Rule: nothing is "done" until it's tested with real clicks/drags (see `test/`), matches the paper design and animations, and works with every other feature.

## What other browsers have, and where Washi stands (research, Oct 2026)
| Feature people love | Who has it | Washi |
|---|---|---|
| Vertical sidebar, spaces, pinned tabs, folders | Arc, Zen, Dia | ✅ |
| Split view | Arc, Zen, Vivaldi | ✅ pairs that stay together |
| Command bar (tabs, history, actions) | Arc, Zen | ✅ + search suggestions + !bangs |
| Peek / Glance (preview a link in a floating card) | Arc, Zen | ✅ shift-click or right-click → Peek |
| Auto-archive old tabs | Arc | ✅ optional, Archive sheet (⌥⌘A) |
| Sleeping tabs (save memory) | Zen, Edge | ✅ default 1 hour |
| Built-in ad/tracker blocking | Helium (uBlock), Brave | ✅ Standard / Strict, per-site switch |
| Phishing/malware warnings | Chrome (Safe Browsing) | ✅ local lists, nothing sent anywhere |
| HTTPS-first | Chrome, Firefox | ✅ |
| Secure DNS | Chrome, Firefox | ✅ |
| !bangs | Helium, DuckDuckGo | ✅ 27 built in |
| Custom keyboard shortcuts | Zen, Dia | ✅ every action |
| Container tabs / profiles (separate logins) | Zen, Arc | ✅ per space |
| Picture in picture when switching tabs | Arc, Dia | ✅ |
| Find in page, history, downloads | everyone | ✅ |
| Little Arc (quick throwaway window) | Arc | ✅ Little scraps (⌥⌘N, ⌘O keeps it) |
| Boosts (per-site CSS/colors) | Arc, Zen | ✅ tint, font, zap, your own CSS |
| Reader mode | Safari, Firefox | ⬜ later |
| Import from Arc | Arc, Zen | ✅ spaces, pins, nested folders, splits, favorites |
| Import from Chrome / Safari | Arc, Zen | ✅ bookmarks: Chrome, Brave, Edge, Arc, Dia, Helium, Vivaldi, Opera read directly; Safari/Firefox via their HTML export |
| Bookmarks bar + folders | everyone; hover bar in Dia/Helium | ✅ always / on hover / hidden, emoji + colour folders, bookmarks sheet |
| Several windows, each with its own tabs | Dia, Arc | ✅ restored after quit and updates |
| Resizable split | Arc, Zen, Vivaldi | ✅ drag the gap, remembered per pair |
| Ctrl-Tab recent-tab switcher | Arc | ✅ |
| Folders inside folders | Arc | ✅ up to 3 deep |
| Live folders (GitHub PRs, feeds) | Arc | ✅ |
| Easels (whiteboards) | Arc | ⬜ later |
| Extensions (1Password, etc.) | Chromium browsers | ⬜ needs the Chromium fork (see below) |
| Password manager + autofill | Chrome, Safari | ⬜ needs the Chromium fork |
| Sync between devices | Chrome, Firefox, Zen | ⬜ much later |

## Done and tested
- v4: split pairs, full folders, sidebar hover reveal, Start Fresh
- v5: welcome setup, quick-start guide, Settings, dark mode, deep color customization
- v6 (this one): renamed to Washi; Electron 45 (current Chromium); security hardening; blocking; safety lists; https-first;
  secure DNS; remembered site permissions; popup blocker; peek; find; history/archive/downloads sheets; sleeping tabs;
  mute; picture in picture; bangs; suggestions; shortcut editor; separate logins per space; auto-update plumbing;
  clipping audit of every screen; idle CPU fix

## Done (0.12.2–0.12.3)
- The installer window (the .dmg) is a taped-up paper sheet: "Hi! Let's tape Washi in.", a dashed arrow from Washi to Applications, and a sticky note explaining Open Anyway for the first launch. Finder itself lays the window out at build time (hand-written window settings stopped showing backgrounds on macOS 26); checked with a real Finder screenshot on every change

## Done (0.12.1)
- Washi is signed with its own (free, self-made) certificate instead of ad hoc, so macOS remembers "Always Allow" for the Keychain and keeps site permissions across updates (one last Keychain prompt after updating to 0.12.1)

## Washi for iPhone (first version, tested on iPhone 17 + iPad mini simulators)
- SwiftUI + WebKit app in `ios/`: spaces (Work keeps its own logins), pins, folders, swipe to close/pin, command bar with !bangs, bookmarks with emoji/colour folders, history, EasyList/EasyPrivacy blocking (per-site off), desktop-site toggle, find on page, share, pop-up sign-ins keep working, pull to refresh, site icons, everything saved between launches
- Phone layout (Duo folded): page + bottom bar, sidebar slides in. Big-screen layout (Duo open, iPad, phone on its side): full-width top bar, docked sidebar, bookmarks bar, split view with a draggable gap (the sidebar becomes a drawer when two pages need the room). Folding/turning switches instantly and keeps the page
- Install with Xcode and a free Apple ID (ios/README.md). Not on a real Duo yet: GitHub has no Duo simulator
- Paused (Nov 2026): the free Apple ID means re-installing from Xcode every 7 days and leaving Developer Mode on. Picks back up if/when there's an Apple Developer account (then TestFlight, no cable)
- [ ] Confirm on Colton's Duo (fold/unfold, both screens)
- [ ] Later on iPhone: TestFlight (needs the $99 developer account), downloads, search suggestions, reader mode, sync with the Mac

## Done and tested (0.12)
- Bookmarks: ☆ next to the address and ⇧⌘D add/edit; the bar is Always (a slim row above the pages), On hover (rest on the top bar, a paper strip drops over the page and goes when you leave) or Hidden (⇧⌘B flips Always on and back); » for what doesn't fit; drag chips to reorder or onto a folder; folders open as menus with Open All; right-click for edit/delete/new folder/bar mode
- Bookmark folders: any emoji (16 quick picks or type your own) or the plain paper folder, 7 colours; nest as deep as 8; a folder can't go inside itself
- Bookmarks sheet (⌥⌘B): open/close folders, search, drag rows to reorder or into folders, edit in place, delete with Undo, new folder
- Import bookmarks: finds Chrome/Brave/Edge/Arc/Dia/Helium/Vivaldi/Opera profiles by name; HTML exports from Safari/Firefox; their bar joins yours, the rest goes in a folder, nothing is doubled on a second import, scripts are dropped
- Bookmarks are shared by every window and update live; the command bar searches them
- Several windows (⌘N): each has its own tabs, folders and pins in the same spaces; settings, spaces, history, archive and bookmarks are shared; every window comes back after quitting or an update; closing one on purpose forgets it
- Split view: drag the gap between the pages to resize (300 px minimum each), remembered per pair, double-click evens it out
- Slimmer frame: 44 px top bar, 232 px sidebar, 8 px margins; every button kept
- New scraps can go to the top or the bottom of the sidebar (Settings › Tabs)

## Done and tested (0.11): what Arc people miss most (from r/ArcBrowser and Dia coverage)
- Folders inside folders (3 levels): drag folders into folders, the bottom edge of a folder means "after it", collapsed folders show just the path to the open tab, loops and too-deep saves repair themselves
- Import from Arc: reads Arc's own sidebar file, merges spaces by name, folders stay nested (a 4th level folds into the 3rd), split views become pairs, favorites become pins, easels/arc:// skipped, running it twice adds nothing; Settings › Import and in the welcome setup
- Ctrl-Tab: recent tabs as cards, quick tap flips back, Shift reverses, Esc cancels, works from pages or Washi's own views (tested with real key presses)
- Little scraps: ⌥⌘N, address field, back/forward/reload, ⌘O / "Open in Washi" moves the page into the sidebar without reloading, ⌘W throws it away, new windows open as tabs, optional: links from other apps open in one
- Boosts: tint, font, zap (pick with the mouse, Esc when done, Undo), your own CSS; per site, survives reloads/restarts, switch off or remove cleanly
- Live folders: GitHub pull requests (token for private repos, kept in the Keychain) or RSS/Atom; new items get a dot and a "N new" count; items leaving the source go unless open; errors show on the folder

## Done and tested (0.10)
- Calmer look (~30% less decoration), same paper identity: soft desk tints, flat top-bar buttons, light address field, soft page shadows, no idle animations, no confetti, handwriting only for titles, straight scraps by default (Wonky scraps still in Settings)
- Motion made purposeful and quicker: gentler spring, 0.2–0.3 s transitions; switching spaces is now instant (was a 0.8 s full-screen wipe that delayed the page by 0.33 s); sidebar list slides in from the side you're going

## Done and tested (v9)
- Washi updates itself: signed latest.json + SHA-256 + bundle checks, background download, Restart or install-on-quit, rollback if the swap fails. Tested end to end (forged, edited and corrupted updates are refused)
- Release workflow: GitHub's Mac machines build Apple silicon + Intel, make .dmg (first install) and .zip (updates), publish to washi-releases
- Mac-shaped logo options D–H that fill Apple's icon shape; Colton picked H (refined tape star)
- Live: code in ColtonCraig/Washi (private), downloads + updates in ColtonCraig/Washi-releases; 0.9.0 published and verified (signature + SHA-256 checked from the public download link)

## Done and tested (v8)
- Google sign-in fixed: on Google's account pages Washi now says honestly what it is (header and page JavaScript match), which is what Google needs to let a Chromium-based app sign in. Tested across typed addresses, links and redirects
- Floating sidebar: no more polling; opens on the first pixel of the edge (~10 ms), slides in 0.28 s, leaves 0.2 s after the pointer does, no stagger, no repaint
- Lived-in profile speed: history saved separately and only when it changes (was a 6 MB write on every click with 3,000 history entries); saves happen off the main thread
- Settings → Help → Speed check (graphics acceleration, busiest page, worst stall, copyable report)

## Done and tested (v7)
- Sidebar redesign for readability: plain tabs, full-contrast titles, calm floating sheet (no dashed frame), snappy 150–180 ms motion
- Folder button clipping (the floating sheet's inner dashed frame); audit now also catches frames drawn inside boxes
- Instant tab highlight on click, wake-on-hover for sleeping tabs, 3 most recent tabs woken at launch, lighter saves, drag work once per frame
- New logo: tape roll (options B globe, C star in build/logo-options)
- `npm run app`: builds + installs Washi.app into /Applications

## Next (in this order)
- [ ] Confirm on Colton's Mac: Google sign-in (Gmail, Drive, Calendar), Microsoft 365 / Okta / Slack sign-in work end to end
- [ ] Passwords for work: the biggest everyday gap. Option A: Washi's own password saver using the macOS Keychain. Option B: the Chromium fork (real extensions like 1Password). Decide with Colton
- [ ] Import passwords and history from other browsers (with the password work)
- [ ] Reorder pinned tabs by dragging
- [ ] Reader mode
- [ ] Apple Developer ID signing + notarizing (removes the one-time Open Anyway step; needed before sharing Washi)
- [ ] Longer term: move the engine to a Chromium fork for extensions + password autofill (interface carries over)

## Can't test in the Linux test container (Mac-only)
- Default-browser prompt and opening links from other apps (built app only)
- Download quarantine flag (Gatekeeper)
- Auto-update (signed, published app only)
- Real Google sign-in (Google isn't reachable from the test container; the identity logic is tested locally)
- GPU-accelerated animation smoothness (the container renders in software at 30 fps)
- Links from other apps opening in a little scrap (macOS open-url; built app as default browser)
- The macOS Keychain for the GitHub token (tests use Chromium's plain-text store on Linux)
