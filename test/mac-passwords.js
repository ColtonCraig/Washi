'use strict';
/* Run on a real Mac (GitHub's macOS runner): passwords with the real Keychain (safeStorage), and passkey requests
   answered with a clean no. Clicks go through the browser's own input (no X11 here). Usage: node test/mac-passwords.js */
const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, ok, done, skipSetup } = require('./lib');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-macpw-'));
(async () => {
  let b = await start({ profile }); let { ui, ov } = b; await skipSetup(b); await sleep(3000);   // let the first-run Today page settle (slow runners)
  const page = async s => { for (let i = 0; i < 40; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } throw new Error('no page ' + s); };
  const vault = () => ov.evaluate(() => document.getElementById('vault').className);
  const card = async w => { for (let i = 0; i < 60; i++) { if ((await vault()).includes(w)) return true; await sleep(200); } return false; };
  // passwords
  await ui.evaluate(() => openTab('http://localhost:8765/login.html')); await sleep(3000);
  const lp = await page('/login.html');
  for (let i = 0; i < 20 && !(await ui.evaluate(() => !!R.a && S.tabs[R.a] && /login/.test(S.tabs[R.a].url))); i++) await sleep(250);
  console.log('diag: store', JSON.stringify(await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))), 'preload in page:', await lp.evaluate(() => String(CredentialsContainer.prototype.get).slice(0, 12)));
  await lp.fill('#u', 'mac-user'); await lp.fill('#p', 'hunter2'); await lp.click('#go');
  ok(await card('save'), 'macOS: after signing in, Washi offers to save the password');
  if (!(await vault()).includes('save')) { console.log('diag: url', lp.url(), 'vault', await vault()); console.log(b.log().split('\n').filter(l => /pw-dbg/.test(l)).join('\n')); }
  await ov.click('.vault [data-a=save]'); await sleep(600);
  let L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.ok && L.logins.length === 1, 'macOS: saved, encrypted with the Keychain (store ready: ' + L.ok + ')');
  await lp.goto('http://localhost:8765/login.html'); await sleep(900);
  await lp.click('#u'); ok(await card('menu'), 'macOS: the account menu shows under the field');
  await ov.click('.vault .vi'); await sleep(600);
  ok(await lp.$eval('#p', e => e.value) === 'hunter2', 'macOS: picking it fills the password');
  // passkeys: Washi doesn't make them (Apple only lets approved browsers use iCloud ones): sites see none and hear no at once
  await ui.evaluate(() => openTab('http://localhost:8765/webauthn.html')); await sleep(2000);
  const wk = await page('/webauthn.html');
  await wk.click('#caps'); await sleep(500);
  ok(await wk.title() === 'caps:false:false', 'macOS: sites see no passkeys here: ' + await wk.title());
  const until = async re => { for (let i = 0; i < 40 && !re.test(await wk.title()); i++) await sleep(100); return wk.title(); };
  await wk.click('#reg'); ok(await until(/error|registered/) === 'reg-error:NotAllowedError' && !(await vault()).includes('pk'), 'macOS: saving a passkey: a clean no at once, no card');
  await wk.click('#log'); ok(await until(/error|signed/) === 'get-error:NotAllowedError', 'macOS: signing in with a passkey: a clean no at once, so the site offers another way');
  await b.stop();
  const disk = fs.readFileSync(path.join(profile, 'vault.json'), 'utf8');
  ok(!/hunter2|mac-user|localhost/.test(disk), 'macOS: nothing readable on disk');
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(1500);
  L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.logins.length === 1, 'macOS: still there after a restart (the Keychain key comes back)');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
