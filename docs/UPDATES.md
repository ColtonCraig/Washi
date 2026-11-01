# How Washi installs and updates

## Installing (once)
1. Open the **Releases** page of the `washi-releases` repository on GitHub.
2. Download `Washi-<version>-arm64.dmg` (Apple silicon: M1 and newer) or `-x64.dmg` (Intel Macs).
3. Open it and drag **Washi** onto **Applications**.
4. The first time you open it, macOS says it can't verify the developer (Washi isn't signed with a paid Apple
   Developer ID yet). Click **Done**, then go to **System Settings → Privacy & Security**, scroll down, and click
   **Open Anyway** next to Washi. You only do this once.

Your tabs, spaces, history and settings live in `~/Library/Application Support/Washi`, not inside the app, so
replacing the app never touches them.

## Updating (automatic)
- About 15 seconds after launch, and every 4 hours, Washi checks `latest.json` in the newest release.
- If there's a newer version it downloads in the background. A note appears: **Washi x.y.z is ready → Restart**.
  If you'd rather not restart now, it installs the next time you quit.
- **Settings → Help → Updates** shows the status and has a **Check for updates** button.

### Why an update can be trusted
- `latest.json` is signed with Washi's private release key (an Ed25519 key kept only as the `WASHI_UPDATE_KEY`
  GitHub secret). The app carries the public half (`app/update-key.pub`) and refuses anything not signed by it.
- The signed file lists each download's size and SHA-256. A download that doesn't match is thrown away.
- Before installing, Washi checks that the unpacked app is Washi (`app.washi.browser`) at the promised version, and
  that its code signature verifies. If replacing the app fails partway, the old one is put back.
- Updates can never go backwards to an older version.

## Publishing a new version (what Claude does)
1. Bump `version` in `package.json`, commit, and tag it: `git tag -a v0.9.1 -m "What changed"`, then push the tag.
2. The **Release** workflow builds both Macs on GitHub's Mac machines, signs them (ad hoc), makes the `.zip`
   (for updates) and `.dmg` (for first installs), signs `latest.json`, and publishes everything to `washi-releases`.
3. Installed copies pick it up within 4 hours, or right away with **Check for updates**.

### One-time setup
- Private repository `washi` (this code) and public repository `washi-releases` (only finished downloads).
- In `washi` → Settings → Secrets and variables → Actions:
  - secret `WASHI_UPDATE_KEY`: the private release key (PEM)
  - secret `RELEASES_TOKEN`: a fine-grained personal access token with **Contents: Read and write** on
    `washi-releases` only
  - variable `RELEASES_REPO`: `<your-username>/washi-releases`
- `package.json` → `washi.updates`: `https://github.com/<your-username>/washi-releases/releases/latest/download/latest.json`

## Later: Apple Developer ID ($99/year)
Signing with a Developer ID and notarizing removes the one-time "Open Anyway" step and is needed before other people
install Washi. The update system above keeps working unchanged; the workflow only gains a signing step.

## Building on your own Mac (developer route)
`npm install && npm run app` builds and installs into /Applications. That copy updates itself too.
