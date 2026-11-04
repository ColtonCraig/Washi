# Installing Washi

Washi is a Mac browser Colton made. It works on any Mac running macOS 12 (Monterey) or newer, Apple chip or Intel.

## Install

1. Open **Terminal** (press ⌘Space, type `Terminal`, press Return).
2. Paste this line and press Return:

   ```
   curl -fsSL https://raw.githubusercontent.com/ColtonCraig/Washi/main/scripts/get-washi.sh | bash
   ```

3. Washi opens when it's done (about a minute). It's in your Applications folder from then on.

The script picks the right build for your Mac, checks the download is exactly the one Colton released and is signed by Washi, then puts it in Applications. If anything doesn't match, it stops and installs nothing.

## Updates

Washi updates itself: when a new version is ready, a postcard appears in the corner. Click **Restart now** and you're on it. Running the line above again also updates it.

## Why Terminal and not a download?

Washi isn't on the App Store and isn't registered with Apple, so a Washi downloaded in Safari or Chrome gets the "can't be opened because Apple cannot check it" warning. Installing from Terminal skips that warning. Washi still checks every update's signature before installing it.

## Moving over from Chrome or Safari

Washi's first screen offers to bring over your bookmarks and history from Chrome, Arc, Brave, Edge or Safari. Passwords: Settings › Passwords › Import (Safari's export brings them along on its own). Chrome extensions install from the Chrome Web Store as usual.

## Uninstalling

Drag Washi from Applications to the Bin. To delete your Washi data too, also delete `~/Library/Application Support/Washi`.

## Something wrong?

Text Colton. If it's a crash, say what you were doing just before.
