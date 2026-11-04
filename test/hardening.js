'use strict';
/* Hardening, checked from the outside like an attacker would try it: every view and page (tabs, popups, extension pages)
   is sandboxed with context isolation and no Node; web security is on everywhere; only Washi's own interface is
   trusted; a web page can't load Washi's interface and use it, can't open it in a window, can't reach file:// pages,
   can't talk to the main process's interface channels, and pages' own messages are refused; the app's Electron fuses
   switch off running as Node, NODE_OPTIONS and the inspector, and check the app's integrity. */
const fs = require('fs'), path = require('path');
const { start, sleep, ok, done, skipSetup } = require('./lib');
(async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')), F = (pkg.build || {}).electronFuses || {};
  ok(F.runAsNode === false && F.enableNodeOptionsEnvironmentVariable === false && F.enableNodeCliInspectArguments === false && F.enableEmbeddedAsarIntegrityValidation === true && F.onlyLoadAppFromAsar === true && F.enableCookieEncryption === true && F.grantFileProtocolExtraPrivileges === false,
    'the app is built with Electron\'s fuses locked down (no running as Node, no NODE_OPTIONS or inspector, integrity checked, cookies encrypted)');
  const b = await start(); const { ui } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1800);
  const pg = b.pages().find(p => p.url().includes('/p1.html'));
  // a page tries to open a popup and to load Washi's interface
  await pg.evaluate(() => { window.__w = window.open('http://localhost:8765/p3.html', 'pop', 'width=400,height=300'); }); await sleep(1500);
  const wc = await ui.evaluate(() => B.setupAct({ type: 'test:wcprefs' }));
  const unsafe = wc.filter(w => !(w.sandbox !== false && w.iso !== false && !w.node && !w.nodeSub && w.web && !w.insecure));
  ok(wc.length >= 4 && !unsafe.length, `every one of the ${wc.length} views and pages is sandboxed, isolated, without Node and with web security on` + (unsafe.length ? ': ' + JSON.stringify(unsafe.slice(0, 3)) : ''));
  const trusted = wc.filter(w => w.ui).map(w => w.url);
  ok(trusted.length && trusted.every(u => u.startsWith('washi://app/')), 'only Washi\'s own interface is trusted: ' + trusted.map(u => u.split('/').pop()).join(', '));
  // the page tries to reach Washi's interface
  const tries = await pg.evaluate(async () => {
    const out = {};
    try { const w = window.open('washi://app/index.html'); out.open = w && !w.closed ? 'opened' : 'blocked'; } catch (e) { out.open = 'blocked'; }
    try { const r = await fetch('washi://app/app.js'); out.fetch = r.ok ? 'read it' : 'blocked'; } catch (e) { out.fetch = 'blocked'; }
    try { const f = document.createElement('iframe'); f.src = 'washi://app/index.html'; document.body.append(f); await new Promise(r => setTimeout(r, 800)); out.frame = (() => { try { const d = f.contentDocument; return f.contentWindow.washi ? 'has the API' : d && d.getElementById('tools') ? 'loaded Washi' : 'blocked'; } catch { return 'blocked'; } })(); } catch { out.frame = 'blocked'; }
    try { const r = await fetch('file:///etc/hosts'); out.file = r.ok ? 'read it' : 'blocked'; } catch { out.file = 'blocked'; }
    out.ipc = typeof window.ipcRenderer === 'undefined' && typeof window.washi === 'undefined' && typeof require === 'undefined' ? 'none' : 'exposed';
    return out;
  });
  ok(tries.open !== 'opened', 'a page can\'t open Washi\'s interface in a window (' + tries.open + ')');
  ok(tries.fetch === 'blocked', 'or read its files (' + tries.fetch + ')');
  ok(tries.frame === 'blocked', 'or frame it and use it (' + tries.frame + ')');
  ok(tries.file === 'blocked', 'or read files on the Mac (' + tries.file + ')');
  ok(tries.ipc === 'none', 'and has no way to message Washi\'s internals');
  // loading the interface as a tab: it doesn't get Washi's powers
  await ui.evaluate(() => navigate('washi://app/index.html')); await sleep(1500);
  const tabUi = b.pages().filter(p => p.url() === 'washi://app/index.html');
  let powers = false; for (const p of tabUi) { const r = await p.evaluate(() => B.setupAct({ type: 'test:refused' })).then(x => x, () => null); if (r && p !== ui) powers = true; }
  ok(!powers, 'even loaded as a page, Washi\'s interface gets none of its powers');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
