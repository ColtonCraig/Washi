'use strict';
/* Run on a real Mac (GitHub's macOS runner): passwords and passkeys with the real Keychain (safeStorage) and macOS's
   Touch ID API present (the runner has no sensor, so passkeys are used without user verification, as on a Mac
   without Touch ID). Clicks go through the browser's own input (no X11 here). Usage: node test/mac-passwords.js */
const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, ok, done, skipSetup } = require('./lib');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-macpw-'));
(async () => {
  let b = await start({ profile }); let { ui, ov } = b; await skipSetup(b);
  const page = async s => { for (let i = 0; i < 40; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } throw new Error('no page ' + s); };
  const vault = () => ov.evaluate(() => document.getElementById('vault').className);
  const card = async w => { for (let i = 0; i < 30; i++) { if ((await vault()).includes(w)) return true; await sleep(200); } return false; };
  // passwords
  await ui.evaluate(() => openTab('http://localhost:8765/login.html')); await sleep(2000);
  const lp = await page('/login.html');
  await lp.fill('#u', 'mac-user'); await lp.fill('#p', 'hunter2'); await lp.click('#go');
  ok(await card('save'), 'macOS: after signing in, Washi offers to save the password');
  await ov.click('.vault [data-a=save]'); await sleep(600);
  let L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.ok && L.logins.length === 1, 'macOS: saved, encrypted with the Keychain (store ready: ' + L.ok + ')');
  await lp.goto('http://localhost:8765/login.html'); await sleep(900);
  await lp.click('#u'); ok(await card('menu'), 'macOS: the account menu shows under the field');
  await ov.click('.vault .vi'); await sleep(600);
  ok(await lp.$eval('#p', e => e.value) === 'hunter2', 'macOS: picking it fills the password');
  // passkeys
  await ui.evaluate(() => openTab('http://localhost:8765/webauthn.html')); await sleep(2000);
  const wk = await page('/webauthn.html');
  await wk.click('#caps'); await sleep(500);
  ok(await wk.title() === 'caps:true:false', 'macOS: sites see passkey support');
  await wk.click('#reg'); ok(await card('pk'), 'macOS: the save-a-passkey card');
  await ov.click('.vault [data-a=create]'); await sleep(2000);
  ok(/^registered:/.test(await wk.title()), 'macOS: passkey saved: ' + await wk.title());
  await wk.click('#log'); await card('pk'); await ov.click('.vault .vlist .vi'); await sleep(2000);
  ok(/^signed-in:uv=[01]:count=/.test(await wk.title()), 'macOS: signed in with it, signature checked by the site: ' + await wk.title());
  await b.stop();
  const disk = fs.readFileSync(path.join(profile, 'vault.json'), 'utf8');
  ok(!/hunter2|mac-user|localhost/.test(disk), 'macOS: nothing readable on disk');
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(1500);
  L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.logins.length === 1 && L.passkeys.length === 1, 'macOS: still there after a restart (the Keychain key comes back)');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
