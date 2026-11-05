# Washi for Dia

Washi's look and feel inside [Dia](https://www.diabrowser.com): paper, cards, tape, handwriting, Scrapbook, Washi's
animations, a Washi new tab, Now Playing, folder icons and more. It's built on
[DiaTweaks](https://github.com/JaceThings/DiaTweaks) by JaceThings. `get.sh` downloads DiaTweaks from its own repo,
adds Washi's tweaks (`Patches/`) and builds the two together on your Mac.

## Install on a new Mac

You need Dia in **Applications**, signed in and opened at least once.

1. Open **Terminal** and paste:

   ```
   curl -fsSL https://raw.githubusercontent.com/ColtonCraig/Washi/main/dia-tweaks/get.sh | bash
   ```

   - If a window asks to install Apple's **command line tools**, click **Install**, wait for it to finish, then paste
     the line again.
   - The first run also sets up Rust and takes a few minutes. Dia quits and opens again at the end.
2. In Dia, open **Settings › Patches › Washi** and turn **Washi** on. Every Washi option is on that page, with a
   drawing of what it changes. Pick your paper, tape and appearance at the top.
3. Load the extension once (Washi's new tab, Reader, Snapshot and Notes). `get.sh` put it in
   **Documents › Washi for Dia**:
   - In Dia, go to `chrome://extensions` and turn on **Developer mode** (top right).
   - Click **Load unpacked** and choose **Documents › Washi for Dia**.
   - Pin the Washi button from the puzzle piece in the toolbar.

## Update

Paste the same line again. It updates DiaTweaks and Washi's tweaks together, and the extension folder too. If the
extension changed, click ↻ on its card in `chrome://extensions`.

When Dia updates itself, the first launch asks for your Mac password once to trust the new Dia. That's DiaTweaks
re-signing it.

## If something goes wrong

- **A Washi option misbehaves:** turn it off on the Washi page. Turning off **Washi** at the top turns off all of them.
- **Dia won't start, or you want the plain Dia back:** in Terminal:

  ```
  ~/Library/Application\ Support/DiaPatches/bin/diatweaks restore
  ```

  Add `--purge` to also remove DiaTweaks' files. Then run the install line again whenever you want Washi back.
- **A toast still looks like Dia's:** Washi writes what Dia's toast window is made of to
  `~/Library/Logs/DiaTweaks-Washi-toast.txt` the first time one shows. Send that file over and it can be fixed.
- **"Permission denied" on a work Mac:** Dia was probably installed by IT and is owned by the system. Install Dia
  yourself from diabrowser.com (drag it to Applications), or ask IT, then run the line again.

## What's in `Patches/`

One folder per tweak, each a DiaTweaks patch (`DP_PATCH`). All of them are options of **Washi** (`WashiPaper`) and do
nothing while it's off. `WashiShared` holds the switches and helpers they share, and `WashiLook` the Settings page
(the look picker, each space's colors and the drawings). `WashiGuide` is the quick-start guide (Help › Washi
Quick-start Guide). Each pushed change is built on a Mac by `.github/workflows/dia-tweaks.yml`.
