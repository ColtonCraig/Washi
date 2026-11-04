'use strict';
/* Washi updates itself.
   Every release ships with the newest Electron (and so Chromium's latest security fixes). Washi checks a small signed
   file, latest.json, published next to each release; if there's a newer version it downloads the Mac app in the
   background, checks it, and asks you to restart. Quitting Washi also installs a waiting update.

   Why trust the download: latest.json is signed with Washi's private release key (kept as a GitHub secret) and the app
   carries the matching public key (app/update-key.pub), so nobody else can publish an update. The file's SHA-256 must
   match the signed one, and the unpacked app must be Washi (same bundle id, same version) before it is installed.
   This works without an Apple Developer account; see docs/UPDATES.md. */
const { app, session } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const pkg = require('../package.json');

const FEED = process.env.WASHI_UPDATE_FEED || (pkg.washi && pkg.washi.updates) || '';
const KEYFILE = path.join(__dirname, 'update-key.pub');
const ACTIVE = () => (app.isPackaged || process.env.WASHI_UPDATE_FORCE === '1') && /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(FEED) && fs.existsSync(KEYFILE);
const BUNDLE_ID = (pkg.build && pkg.build.appId) || 'app.washi.browser';

let state = { status: 'idle', version: null, error: null, checked: null, percent: 0 }, notify = () => {}, staged = null, busy = false, timer = null;
const set = s => { state = { ...state, ...s }; notify(state); };
const dir = () => path.join(app.getPath('userData'), 'updates');
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, out, err) => (e ? rej(new Error((err || e.message).toString().trim().slice(0, 200))) : res(String(out)))));

/* 1.2.10 > 1.2.9; plain numbers only (no pre-releases) */
function newer(a, b) {
  const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
/* the signed manifest: { payload: "<json text>", sig: "<base64 ed25519 signature of payload>" } */
function verifyManifest(m) {
  if (!m || typeof m.payload !== 'string' || typeof m.sig !== 'string') throw new Error('update info is malformed');
  const key = crypto.createPublicKey(fs.readFileSync(KEYFILE, 'utf8'));
  if (!crypto.verify(null, Buffer.from(m.payload, 'utf8'), key, Buffer.from(m.sig, 'base64'))) throw new Error('update info failed its signature check');
  const p = JSON.parse(m.payload);
  if (!p || typeof p.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(p.version) || typeof p.files !== 'object') throw new Error('update info is malformed');
  return p;
}
const archKey = () => (process.arch === 'arm64' ? 'arm64' : 'x64');
const fileURL = name => new URL(encodeURIComponent(name), FEED).toString();
const ses = () => session.fromPartition('washi-updates', { cache: false });

async function download(url, to, want) {
  const r = await ses().fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  const total = +r.headers.get('content-length') || want.size || 0;
  const h = crypto.createHash('sha256'), out = fs.createWriteStream(to);
  let got = 0, last = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    h.update(value); got += value.length;
    if (!out.write(value)) await new Promise(res => out.once('drain', res));
    const pct = total ? Math.min(99, Math.floor(got / total * 100)) : 0;
    if (pct !== last) { last = pct; set({ percent: pct }); }
  }
  await new Promise((res, rej) => out.end(e => (e ? rej(e) : res())));
  if (want.size && got !== want.size) throw new Error('download was incomplete');
  if (h.digest('hex') !== String(want.sha256).toLowerCase()) throw new Error('download failed its integrity check');
}
async function unpack(zip, into, version) {
  fs.rmSync(into, { recursive: true, force: true }); fs.mkdirSync(into, { recursive: true });
  if (process.platform === 'darwin') await run('/usr/bin/ditto', ['-x', '-k', zip, into]); else await run('unzip', ['-q', zip, '-d', into]);
  const appDir = fs.readdirSync(into).filter(n => n.endsWith('.app')).map(n => path.join(into, n))[0];
  if (!appDir) throw new Error('the download has no app inside');
  const plist = path.join(appDir, 'Contents', 'Info.plist');
  if (process.platform === 'darwin') {
    const id = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist])).trim();
    const ver = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', plist])).trim();
    if (id !== BUNDLE_ID || ver !== version) throw new Error('the download is not the expected Washi version');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appDir]);
  } else {
    const txt = fs.readFileSync(plist, 'utf8');
    if (!txt.includes(BUNDLE_ID) || !txt.includes(version)) throw new Error('the download is not the expected Washi version');
  }
  return appDir;
}

async function check() {
  if (!ACTIVE()) { set({ status: 'dev' }); return state; }
  if (busy || state.status === 'ready') return state;
  busy = true; set({ status: 'checking', error: null });
  try {
    const r = await ses().fetch(FEED + (FEED.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) { set({ status: 'current', checked: Date.now() }); return state; }   // nothing published yet
    if (!r.ok) throw new Error(`update server answered ${r.status}`);
    const m = verifyManifest(await r.json());
    if (!newer(m.version, app.getVersion())) { set({ status: 'current', checked: Date.now(), version: null }); return state; }
    const f = m.files[archKey()];
    if (!f || !f.name || !/^[0-9a-f]{64}$/i.test(f.sha256 || '')) throw new Error('no download for this Mac');
    set({ status: 'downloading', version: m.version, percent: 0 });
    fs.mkdirSync(dir(), { recursive: true });
    const zip = path.join(dir(), `Washi-${m.version}.zip`);
    await download(fileURL(f.name), zip, f);
    const appDir = await unpack(zip, path.join(dir(), m.version), m.version);
    fs.rmSync(zip, { force: true });
    staged = { version: m.version, appDir, notes: m.notes || '' };
    set({ status: 'ready', version: m.version, notes: staged.notes, checked: Date.now(), percent: 100 });
  } catch (e) {
    set({ status: 'error', error: String(e && e.message || e).slice(0, 200), checked: Date.now() - 25 * 60e3 });   // (try again in a few minutes, not half an hour)
  } finally { busy = false; }
  return state;
}

/* the app being replaced: /Applications/Washi.app (tests point this somewhere else) */
function currentBundle() {
  if (process.env.WASHI_UPDATE_TARGET) return process.env.WASHI_UPDATE_TARGET;
  return path.resolve(app.getPath('exe'), '..', '..', '..');
}
/* Swap the app after Washi has quit, then (optionally) open the new one. Runs as a tiny detached shell script so it
   outlives Washi. If anything goes wrong the old app is put back. */
function install({ relaunch = true } = {}) {
  if (!staged || state.status !== 'ready') return false;
  const dest = currentBundle();
  if (/\/AppTranslocation\//.test(dest) || !dest.endsWith('.app')) { set({ status: 'error', error: 'Move Washi into your Applications folder so it can update itself.' }); return false; }
  try { fs.accessSync(path.dirname(dest), fs.constants.W_OK); } catch { set({ status: 'error', error: `Washi can't write to ${path.dirname(dest)}.` }); return false; }
  const script = path.join(os.tmpdir(), `washi-update-${process.pid}.sh`);
  fs.writeFileSync(script, `#!/bin/bash
# Washi update helper: waits for Washi to quit, swaps in the new app, opens it.
PID="$1"; NEW="$2"; DEST="$3"; RELAUNCH="$4"
for i in $(seq 1 150); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
OLD="$DEST.old-$$"
mv "$DEST" "$OLD" || exit 1
if command -v ditto >/dev/null; then ditto "$NEW" "$DEST"; else cp -R "$NEW" "$DEST"; fi
if [ $? -ne 0 ] || [ ! -d "$DEST/Contents" ]; then rm -rf "$DEST"; mv "$OLD" "$DEST"; exit 1; fi
rm -rf "$OLD" "$NEW"
command -v xattr >/dev/null && xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
[ "$RELAUNCH" = "1" ] && command -v open >/dev/null && open "$DEST"
rm -f "$0"
`, { mode: 0o700 });
  const child = spawn('/bin/bash', [script, String(process.pid), staged.appDir, dest, relaunch ? '1' : '0'], { detached: true, stdio: 'ignore' });
  child.unref();
  staged = null; state = { ...state, status: 'installing' };
  return true;
}

function start(onState) {
  notify = onState || notify;
  if (!ACTIVE()) { set({ status: 'dev' }); return; }
  try { fs.rmSync(dir(), { recursive: true, force: true }); } catch {}          // leftovers from an earlier run
  /* noticed quickly: a little after launch, every half hour, when the Mac wakes up, and when you come back to Washi
     after a while (a timer doesn't tick while the Mac sleeps, so "every few hours" could mean not today) */
  if (!app.isPackaged && process.env.WASHI_UPDATE_MANUAL === '1') return;     // tests that check by hand, step by step
  setTimeout(check, 15e3);
  clearInterval(timer); timer = setInterval(check, 30 * 60e3);
  const stale = ms => Date.now() - (state.checked || 0) > ms && state.status !== 'ready' && !busy;
  try { const { powerMonitor } = require('electron'); for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => setTimeout(() => { if (stale(60e3)) check(); }, 20e3)); } catch {}
  app.on('browser-window-focus', () => { if (stale(10 * 60e3)) check(); });
  app.on('did-become-active', () => { if (stale(10 * 60e3)) check(); });
}
/* quitting with an update waiting installs it (without reopening) */
function onQuit() { if (state.status === 'ready') install({ relaunch: false }); }
module.exports = { start, check, install: () => { if (install({ relaunch: true })) app.quit(); }, onQuit, state: () => state, newer, verifyManifest };
