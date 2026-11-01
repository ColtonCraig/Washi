# How Washi keeps you safe

Washi is built on **Chromium**, the same engine as Chrome, Edge, Brave and Arc. Pages are rendered, sandboxed and isolated by Chromium's own code.
On top of that, Washi adds these protections:

## The engine stays current
- Washi ships with **Electron 45.2.1 (Chromium 156)**. Every Washi release moves to the newest Electron, which carries Chromium's latest security fixes.
- Washi **updates itself** (see [UPDATES.md](UPDATES.md)): new versions download in the background and you choose when to restart.

## Pages can't reach Washi
- Every web page runs in Chromium's **sandbox**, with **context isolation**, and **no access to Node.js or to Washi's own code**.
- Washi's own interface is served from a private `washi://` address with a strict **Content Security Policy**. It runs in its **own session**, which can't load anything from the internet except favicons.
- Every message to the main process is checked: only Washi's own interface may send them. Messages from anywhere else are refused.
- Pages can't press Washi's buttons. The "Continue" and "Back to safety" buttons on Washi's warning pages use one-time tokens.
- `<webview>` tags are refused everywhere.

## Protection while you browse
- **Dangerous-site warnings.** Every page is checked against about 390,000 known phishing domains and uBlock Origin's malware/scam list. The check happens **on your Mac**: no URL is ever sent anywhere. The lists refresh every few days.
- **Ad and tracker blocking.** EasyList, EasyPrivacy and the uBlock Origin lists are built in (Standard). Strict mode also hides cookie banners. You can turn blocking off for one site from the shield.
- **HTTPS-first.** Plain http addresses are upgraded to https. If a site can't do https, Washi asks before loading it insecurely.
- **Secure DNS.** Automatic by default, or Cloudflare, Quad9 or Google.
- **Pop-up blocker.** Pages can only open windows right after you click or type.
- **Permissions are asked, remembered per site, and listed in Settings.** This covers camera, microphone, location, notifications and the rest. USB, HID and serial devices are refused.
- **Links to other apps** (zoom:, slack:, mailto:…) ask first.
- **Downloads are quarantined**, like in Chrome and Safari, so macOS Gatekeeper checks them before they run.
- Washi sends **Global Privacy Control** and **Do Not Track**. Websites see a plain Chrome identity, except Google's sign-in pages, which get Washi's honest identity (`Washi/x Chrome/x Electron/x`), because Google blocks sign-in from apps that look exactly like Chrome but aren't.
- Optional: separate logins per space, and clearing cookies when Washi quits.

## The app itself
Washi is built with Electron's hardening switches ("fuses") set:
- no running as plain Node;
- no inspector flags;
- no `NODE_OPTIONS`;
- cookies encrypted with the macOS Keychain;
- the app archive integrity-checked, and code loaded only from it;
- no extra privileges for `file://`.

Release builds also:
- refuse remote debugging;
- run with Apple's **hardened runtime**;
- are **signed and notarized**.

## What Washi doesn't have yet
Washi runs on Electron, which embeds Chromium's engine but not the full Chrome browser layer. So these aren't available yet:
- Chrome Web Store extensions;
- Chrome's password manager and autofill;
- Google Safe Browsing (Washi's local lists cover phishing and malware instead);
- DRM video, such as Netflix.

The plan for these is to move the engine to a Chromium fork once Washi is ready for other people. The interface carries over unchanged.
