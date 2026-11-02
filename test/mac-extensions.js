'use strict';
/* On a real Mac (GitHub's macOS runner), sandbox on, like Washi on your Mac:
   1. the test extension's background worker gets the full Chrome APIs (badge on its top-bar button, context menu)
   2. the real Chrome Web Store: open Dark Reader's page, press "Add to Washi", it installs and works on a page, then remove it.
   Usage: node test/mac-extensions.js   (needs the internet) */
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
process.env.WASHI_TEST_EXT_ALLOW = '1';
const { start, sleep, ok, done, skipSetup, shot } = require('./lib');
const DARK = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-macext-'));
  let b = await start({ profile, sandbox: true }); await skipSetup(b); await b.stop();
  const id = execSync(`node ${__dirname}/fixtures/make-extension.js ${profile}`).toString().trim();
  b = await start({ profile, fresh: false, sandbox: true }); const { ui, ov } = b; await sleep(3000);
  const page = async s => { for (let i = 0; i < 60; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(250); } return null; };
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(4000);
  const p1 = await page('/p1.html');
  const cs = JSON.parse(await p1.evaluate(() => document.documentElement.dataset.washiTabs || 'null') || 'null');
  ok(cs && /contextMenus/.test(cs.keys), 'macOS (sandboxed): the background worker gets the full Chrome APIs: ' + (cs && cs.keys));
  let badge = false; for (let i = 0; i < 20 && !badge; i++) { badge = await ui.evaluate(() => { const b = document.getElementById('exts').shadowRoot.querySelector('button'); return !!b && [...b.querySelectorAll('*'), b].some(e => /OK/.test(e.textContent)); }); if (!badge) await sleep(250); }
  ok(badge, 'macOS: the badge it set shows on its top-bar button');
  // the real Chrome Web Store
  await ui.evaluate(u => openTab(u), `https://chromewebstore.google.com/detail/${DARK}`); await sleep(6000);
  const store = await page('chromewebstore.google.com');
  ok(!!store, 'macOS: the Chrome Web Store opens');
  let btnText = '';
  for (let i = 0; i < 40; i++) { btnText = await store.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Add to (Chrome|Washi)|Remove from (Chrome|Washi)|Switch to Chrome|Get Chrome/i.test(x.textContent)); return b ? b.textContent.trim() : ''; }).catch(() => ''); if (btnText) break; await sleep(500); }
  ok(/Add to (Chrome|Washi)/i.test(btnText), 'macOS: the store offers "Add to Washi": ' + btnText);
  shot('mac-store');
  if (!/Add to (Chrome|Washi)/i.test(btnText)) {                         // say what the store showed instead, then stop here
    const D = process.env.WASHI_SHOTS || os.tmpdir();
    try { await store.screenshot({ path: path.join(D, 'mac-store-page.png') }); } catch {}
    const info = await store.evaluate(() => ({ url: location.href, ua: navigator.userAgent, uad: navigator.userAgentData && navigator.userAgentData.brands, wsp: typeof (window.chrome && chrome.webstorePrivate), mgmt: typeof (window.chrome && chrome.management), buttons: [...document.querySelectorAll('button,[role=button]')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 25), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 900) })).catch(e => ({ err: e.message }));
    console.log('  store page: ' + JSON.stringify(info, null, 1));
    await b.stop(); done(); return;
  }
  await store.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add to (Chrome|Washi)/i.test(x.textContent)).click());
  let L = null; for (let i = 0; i < 90; i++) { L = await ui.evaluate(() => B.setupAct({ type: 'ext:list' })); if (L.list.some(e => e.id === 'eimadpbcbfnmbkopoojfekhnkhdbieeh')) break; await sleep(1000); }
  ok(L.list.some(e => e.id === DARK), 'macOS: pressing it installs Dark Reader: ' + L.list.map(e => e.name).join(', '));
  await ui.evaluate(() => openTab('http://localhost:8765/p3.html')); await sleep(5000);
  const p3 = await page('/p3.html');
  let dark = false; for (let i = 0; i < 20 && !dark; i++) { dark = await p3.evaluate(() => !!document.querySelector('style.darkreader, meta[name="darkreader"]')).catch(() => false); if (!dark) await sleep(500); }
  ok(dark, 'macOS: Dark Reader works on pages in Washi');
  shot('mac-dark');
  // its toolbar button opens its popup, and the popup gets Chrome's APIs (on Linux CI, without the sandbox, it doesn't)
  await ui.evaluate(d => { const b = document.getElementById('exts').shadowRoot.querySelector(`[id="${d}"]`); b && b.click(); }, DARK);
  const pop = await page('chrome-extension://' + DARK);
  ok(!!pop, 'macOS: its button opens its popup');
  if (pop) { let api = false; for (let i = 0; i < 20 && !api; i++) { api = await pop.evaluate(() => typeof chrome.tabs.create === 'function' && typeof chrome.tabs.query === 'function').catch(() => false); if (!api) await sleep(300); } ok(api, 'macOS: the popup has chrome.tabs (it can open tabs)'); shot('mac-dark-popup'); }
  await ui.evaluate(() => openSetup('settings', 'extensions')); await sleep(1500);
  ok(await ov.evaluate(() => /Dark Reader/i.test(document.querySelector('#sec-extensions').innerText)), 'macOS: Settings lists it');
  ok(await ui.evaluate(d => B.setupAct({ type: 'ext:remove', id: d }).then(r => r.ok), DARK), 'macOS: and it can be removed');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
