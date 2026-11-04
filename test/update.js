'use strict';
/* Self-updating: finds a newer signed release, downloads and checks it, swaps the app when Washi quits.
   Refuses update info with a bad signature and downloads that don't match. Uses a fake app bundle and local server. */
const { sleep, ok, done } = require('./lib');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process');
const UPD = process.env.UPD_DIR, KEY = process.env.WASHI_TEST_RELEASE_KEY;
if (!KEY || !fs.existsSync(KEY) || !fs.statSync(KEY).size) { console.log('  (skipped: needs the release key, which only lives on the release machine)'); process.exit(0); }
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-upd-'));
// the "installed" app, and the new version in the release
const mkApp = (dir, ver, mark) => { fs.mkdirSync(path.join(dir, 'Washi.app', 'Contents'), { recursive: true }); fs.writeFileSync(path.join(dir, 'Washi.app', 'Contents', 'Info.plist'), `<plist><key>CFBundleIdentifier</key><string>app.washi.browser</string><key>CFBundleShortVersionString</key><string>${ver}</string></plist>`); fs.writeFileSync(path.join(dir, 'Washi.app', 'Contents', 'mark'), mark); };
mkApp(path.join(T, 'Applications'), '0.9.0', 'old');
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-rel-')); mkApp(build, '9.9.9', 'new');
for (const f of fs.readdirSync(UPD)) fs.rmSync(path.join(UPD, f));
execSync(`cd ${build} && zip -qr ${UPD}/Washi-9.9.9-arm64.zip Washi.app && cp ${UPD}/Washi-9.9.9-arm64.zip ${UPD}/Washi-9.9.9-x64.zip`);
execSync(`node ${__dirname}/../scripts/release-manifest.js 9.9.9 ${UPD} ${UPD}/Washi-9.9.9-arm64.zip ${UPD}/Washi-9.9.9-x64.zip "test release"`, { env: { ...process.env, WASHI_UPDATE_KEY: fs.readFileSync(KEY, 'utf8') } });
const good = JSON.parse(fs.readFileSync(path.join(UPD, 'latest.json'), 'utf8'));
// broken variants
const other = crypto.generateKeyPairSync('ed25519').privateKey;
fs.writeFileSync(path.join(UPD, 'latest-forged.json'), JSON.stringify({ payload: good.payload, sig: crypto.sign(null, Buffer.from(good.payload), other).toString('base64') }));
const p2 = JSON.parse(good.payload); p2.files.arm64.sha256 = p2.files.x64.sha256 = '0'.repeat(64);
fs.writeFileSync(path.join(UPD, 'latest-edited.json'), JSON.stringify({ payload: JSON.stringify(p2), sig: good.sig }));
const p3 = JSON.parse(good.payload); p3.files.arm64.name = p3.files.x64.name = 'Washi-9.9.9-arm64.zip'; p3.files.arm64.sha256 = p3.files.x64.sha256 = 'a'.repeat(64);
const k = crypto.createPrivateKey(fs.readFileSync(KEY, 'utf8'));
fs.writeFileSync(path.join(UPD, 'latest-badhash.json'), JSON.stringify({ payload: JSON.stringify(p3), sig: crypto.sign(null, Buffer.from(JSON.stringify(p3)), k).toString('base64') }));
const mode = m => execSync(`curl -s http://localhost:8765/updates/mode?${m}`);

process.env.WASHI_UPDATE_FORCE = '1'; process.env.WASHI_UPDATE_MANUAL = '1'; process.env.WASHI_UPDATE_FEED = 'http://localhost:8765/updates/latest.json';
process.env.WASHI_UPDATE_TARGET = path.join(T, 'Applications', 'Washi.app');
const { start, skipSetup } = require('./lib');
(async () => {
  const b = await start(); const { ui } = b; await skipSetup(b);
  const check = () => ui.evaluate(() => B.setupAct({ type: 'update:check' }));
  const wait = async want => { for (let i = 0; i < 60; i++) { const s = await ui.evaluate(() => B.setupInfo().then(i => i.update)); if (want.includes(s.status)) return s; await sleep(250); } return ui.evaluate(() => B.setupInfo().then(i => i.update)); };
  for (const [m, re, what] of [['forged', /signature/, 'update info signed by someone else is refused'], ['edited', /signature/, 'update info that was edited after signing is refused'], ['badhash', /integrity/, 'a download that doesn\'t match its signed fingerprint is refused']]) {
    mode(m); await check(); const s = await wait(['error', 'ready', 'current']);
    ok(s.status === 'error' && re.test(s.error), `${what} (${s.error})`);
  }
  ok(fs.readFileSync(path.join(T, 'Applications', 'Washi.app', 'Contents', 'mark'), 'utf8') === 'old', 'the installed app was left alone');
  mode('good'); await check(); const s = await wait(['ready', 'error']);
  ok(s.status === 'ready' && s.version === '9.9.9', `a real newer release downloads and is ready (${s.status} ${s.version || s.error || ''})`);
  await ui.evaluate(() => B.setupAct({ type: 'update:install' }));
  let swapped = false; for (let i = 0; i < 40 && !swapped; i++) { await sleep(250); try { swapped = fs.readFileSync(path.join(T, 'Applications', 'Washi.app', 'Contents', 'mark'), 'utf8') === 'new'; } catch {} }
  ok(swapped, 'Restart quits Washi and puts the new version in place');
  ok(fs.readdirSync(path.join(T, 'Applications')).join() === 'Washi.app', 'nothing left behind next to the app');
  try { await b.stop(); } catch {}
  done();
})().catch(e => { console.error(e); process.exit(1); });
