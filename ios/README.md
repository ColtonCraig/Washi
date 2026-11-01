# Washi for iPhone

The same Washi, made for the iPhone and the iPhone Duo: spaces (each can keep its own logins), pinned tabs, folders, the
command bar with !bangs, bookmarks (folders with emoji and colours), history, ad and tracker blocking, and the paper look.
On a big screen (the Duo opened up, an iPad, or a phone on its side) it switches to the Mac-style layout: sidebar beside
the page, top bar, bookmarks bar, and split view with a gap you can drag.

## Put it on your phone (free, with your Apple ID)
1. On your Mac, install **Xcode** from the App Store (free).
2. Get the latest code in Terminal:
   `cd ~ && (git -C washi-src pull || git clone https://github.com/ColtonCraig/Washi.git washi-src)`
   then `open ~/washi-src/ios/Washi.xcodeproj`
3. In Xcode: **Xcode › Settings › Accounts › +** and sign in with your Apple ID.
4. Click **Washi** at the top of the left column → **Signing & Capabilities** → **Team**: pick *Colton Craig (Personal Team)*.
   (If it says the bundle identifier is taken, change it to `com.coltoncraig.washi2`.)
5. On the iPhone: plug it into the Mac, tap **Trust**. Then **Settings › Privacy & Security › Developer Mode › On** (it restarts).
6. In Xcode's top bar pick your iPhone, then press **▶** (⌘R).
7. The first time only: on the iPhone, **Settings › General › VPN & Device Management** → your Apple ID → **Trust**.

With a free Apple ID the app stops opening after 7 days: open Xcode and press ▶ again (your tabs and bookmarks stay).
With the Apple Developer Program ($99/year) it can come through TestFlight instead and update itself.

## Tests
Every push that touches `ios/` builds the app and runs the tests on an iPhone 17 simulator (portrait, and on its side for
the big-screen layout) and an iPad mini (standing in for the Duo opened up). Screenshots land on the `ci-shots-0/1` branches.
