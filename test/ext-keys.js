'use strict';
/* Extensions with two windows, and their own shortcuts. A popup opens in the window whose button you clicked, even
   when the other window had focus last (it used to jump to the other window, even across Mac desktops). The
   shortcut an extension asks for in its manifest (Okta's ⇧⌘O; here ⇧⌘Y) opens its popup in the window you're in;
   other commands reach chrome.commands.onCommand; ones that would take a Washi shortcut are skipped. */
const fs = require('fs'), os = require('os'), path = require('path'); const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, shot } = require('./lib');
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const SB = process.platform === 'darwin' || process.env.WASHI_SANDBOX === '1';
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-extkeys-'));
  let b = await start({ profile, sandbox: SB }); await skipSetup(b); await b.stop();
  const id = execSync(`node ${__dirname}/fixtures/make-extension.js ${profile}`).toString().trim();
  b = await start({ profile, fresh: false, sandbox: SB }); const w1 = b.ui; await sleep(1500);
  for (let i = 0; i < 40; i++) { const L = await w1.evaluate(() => B.setupAct({ type: 'ext:list' })).catch(() => null); if (L && L.list && L.list.some(e => e.id === id)) break; await sleep(250); }
  const shells = () => b.pages().filter(p => p.url().endsWith('/index.html'));
  const popup = () => w1.evaluate(() => B.setupAct({ type: 'test:popup' }));
  const waitPopup = async want => { let p; for (let i = 0; i < 40; i++) { p = await popup(); if (p.open === want) return p; await sleep(150); } return p; };
  const closePopup = async () => { K('tap:Escape'); await sleep(300); const p = b.pages().find(x => x.url().includes(id + '/popup.html')); if (p) await p.evaluate(() => window.close()).catch(() => {}); await waitPopup(false); };
  await w1.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  const wid1 = await w1.evaluate(() => window.WID);

  // a second window, which now has focus
  K('down:Control_L tap:n up:Control_L'); await sleep(3000);
  if (!shells().find(p => p !== w1)) { console.log('  NOTE the first ⌘N was lost by the virtual keyboard (happens on CI now and then): pressed again'); K('down:Control_L tap:n up:Control_L'); await sleep(3000); }
  const w2 = shells().find(p => p !== w1); ok(!!w2, 'a second window');
  await w2.evaluate(() => openTab('http://localhost:8765/p2.html')); await sleep(1800);
  const wid2 = await w2.evaluate(() => window.WID);

  // the button in the first window opens the popup there, though the second window had focus last
  await w1.evaluate(id => document.getElementById('exts').shadowRoot.querySelector(`[id="${id}"]`).click(), id);
  let p = await waitPopup(true);
  ok(p.open && p.wid === wid1, `the first window's button opens the popup in the first window (${p.wid}, not ${wid2})`);
  { let pp = null; for (let i = 0; i < 30 && !pp; i++) { pp = b.pages().find(x => x.url().includes(id + '/popup.html')); if (!pp) await sleep(150); }
    const n1 = await w1.evaluate(() => Object.keys(S.tabs).length), n2 = await w2.evaluate(() => Object.keys(S.tabs).length);
    if (pp) { for (let i = 0; i < 30; i++) { if (await pp.evaluate(() => !!document.getElementById('open') && document.readyState === 'complete').catch(() => false)) break; await sleep(150); } await pp.evaluate(() => document.getElementById('open').click()).catch(() => {}); }
    for (let i = 0; i < 40; i++) { if (await w1.evaluate(() => Object.values(S.tabs).some(t => /fromext=1/.test(t.url))) || await w2.evaluate(() => Object.values(S.tabs).some(t => /fromext=1/.test(t.url)))) break; await sleep(150); } await sleep(300);
    const pr = pp ? await pp.evaluate(() => document.body.dataset.r || '').catch(() => '') : '';
    if (!SB && /is not a function/.test(pr)) console.log('  NOTE without the sandbox this machine\'s popups get no chrome.tabs (like test/extensions.js): checked sandboxed (test.yml shard 1, macchecks.yml)'); else
    ok(await w1.evaluate(n => Object.keys(S.tabs).length === n + 1 && Object.values(S.tabs).some(t => /fromext=1/.test(t.url)), n1) && await w2.evaluate(n => Object.keys(S.tabs).length === n, n2), 'a tab the popup opens lands in that same window: ' + JSON.stringify([n1, n2, await w1.evaluate(() => Object.values(S.tabs).map(t => t.url)), await w2.evaluate(() => Object.values(S.tabs).map(t => t.url)), !!pp])); }
  await closePopup();
  await w2.evaluate(id => document.getElementById('exts').shadowRoot.querySelector(`[id="${id}"]`).click(), id);
  p = await waitPopup(true);
  ok(p.open && p.wid === wid2, `and the second window's opens it in the second (${p.wid})`);
  await closePopup();
  ok(await w1.evaluate(() => +document.getElementById('exts').getAttribute('tab') > 0) && await w1.evaluate(() => document.getElementById('exts').getAttribute('tab')) !== await w2.evaluate(() => document.getElementById('exts').getAttribute('tab')), 'each window\'s buttons follow that window\'s own tab');

  // its own shortcut (⇧⌘Y on a Mac, Ctrl+Shift+Y here), in the window you're in
  const cmds = await w1.evaluate(() => B.setupAct({ type: 'test:extcmds' }));
  ok(cmds.some(c => c.name === '_execute_action' && /Shift\+Y$/.test(c.accel)) && cmds.some(c => c.name === 'say-hi'), 'its shortcuts are on the menu (View › Extension Shortcuts): ' + cmds.map(c => c.label + ' ' + c.accel).join(', '));
  const L2 = await w2.evaluate(() => layout().stage); ptr(`move ${60 + L2.x + 300} ${57 + L2.y + 300}`); ptr('down'); ptr('up'); await sleep(500);
  const fz = await w2.evaluate(() => B.setupAct({ type: 'test:focus' })); if (!fz.focused) console.log('  NOTE the virtual screen has no window manager, so Washi asked for the second window to be focused');
  K('down:Control_L down:Shift_L tap:y up:Shift_L up:Control_L');
  p = await waitPopup(true);
  ok(p.open && p.wid === wid2, `its shortcut opens its popup, in the window you're in (${p.wid})`);
  shot('ext-keys-popup');
  K('down:Control_L down:Shift_L tap:y up:Shift_L up:Control_L'); await sleep(200);
  p = await waitPopup(false);
  ok(!p.open, 'pressing it again closes it');
  if (SB) {
    K('down:Alt_L down:Shift_L tap:h up:Shift_L up:Alt_L'); await sleep(1200);
    await w2.evaluate(id => openTab(`chrome-extension://${id}/options.html`), id); await sleep(1500);
    const op = b.pages().filter(x => x.url().includes(id + '/options.html')).pop();
    const last = op && await op.evaluate(() => chrome.storage.local.get('lastCommand').then(r => r.lastCommand || ''));
    ok(/^say-hi /.test(last || ''), `another command reaches chrome.commands.onCommand (${last})`);
  } else console.log('  NOTE chrome.commands.onCommand needs the background worker\'s APIs (sandbox on): checked sandboxed (test.yml shard 1, macchecks.yml)');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
