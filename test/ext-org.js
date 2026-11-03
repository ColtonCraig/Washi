'use strict';
/* Extensions that talk to their own server with your session (the Okta plugin's app list): with host permission, an
   extension's background and pages get the site's cookies (Lax and Strict too, as in Chrome) and no CORS wall. */
const fs = require('fs'), os = require('os'), path = require('path'); const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup } = require('./lib');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-org-'));
  const SB = process.platform === 'darwin';
  let b = await start({ profile, sandbox: SB }); await skipSetup(b); await b.stop();
  const id = execSync(`node ${__dirname}/fixtures/make-extension.js ${profile}`).toString().trim();
  b = await start({ profile, fresh: false, sandbox: SB }); const { ui } = b; await sleep(2500);
  const page = async s => { for (let i = 0; i < 40; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } return null; };
  await ui.evaluate(() => openTab('http://127.0.0.1:8765/org/login')); await sleep(1500);
  await ui.evaluate(id => openTab(`chrome-extension://${id}/options.html`), id); await sleep(1500);
  const ep = await page(`chrome-extension://${id}/options.html`);
  ok(!!ep, 'the extension page opens');
  const bg = await ep.evaluate(() => new Promise(r => chrome.runtime.sendMessage('org', r)));
  console.log('  bg:', JSON.stringify(bg));
  ok(bg && bg.ok && /sidl=L/.test(bg.cookie) && /sids=S/.test(bg.cookie) && /sidn=N/.test(bg.cookie), 'its background worker reaches the site signed in (all its cookies)');
  const pg = await ep.evaluate(() => fetch('http://127.0.0.1:8765/org/me', { credentials: 'include' }).then(r => r.json()).then(j => ({ ok: true, ...j }), e => ({ ok: false, err: String(e) })));
  console.log('  page:', JSON.stringify(pg));
  ok(pg && pg.ok && /sidl=L/.test(pg.cookie) && /sidn=N/.test(pg.cookie), 'and so do its pages (popup, options)');
  const ck = await ep.evaluate(() => new Promise(r => chrome.cookies.getAll({ domain: '127.0.0.1' }, c => r((c || []).map(x => x.name).sort()))));
  ok(ck.join() === 'sidl,sidn,sids', 'chrome.cookies sees them: ' + ck);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(2000);
  const pr = await ep.evaluate(() => new Promise(r => chrome.runtime.sendMessage('probe', r)));
  const pp = await ep.evaluate(async () => { const out = await (async () => { const o = {}; const T = (k, f) => Promise.race([Promise.resolve().then(f), new Promise((_, j) => setTimeout(() => j(new Error('hung')), 2500))]).then(v => { o[k] = v === undefined ? 'ok' : JSON.stringify(v).slice(0, 80); }, e => { o[k] = 'ERR ' + String(e && e.message || e).slice(0, 100); });
      await T('getViews', () => chrome.extension.getViews().length); await T('cookies.getAllCookieStores', () => chrome.cookies.getAllCookieStores()); await T('windows.getCurrent', () => chrome.windows.getCurrent().then(w => w && w.id)); await T('tabs.query', () => chrome.tabs.query({ active: true, currentWindow: true }).then(x => x.length)); await T('storage.session', () => chrome.storage.session.get(null));
      await T('port', () => new Promise(res => { const p = chrome.runtime.connect({ name: 'x' }); p.onMessage.addListener(m => res(m)); p.onDisconnect.addListener(() => res('disconnected')); p.postMessage('hi'); }));
      await T('permissions.request (no gesture)', () => chrome.permissions.contains({ permissions: ['privacy'] }));
      return o; })(); return out; });
  for (const [where, r] of [['background', pr], ['page', pp]]) { const bad = Object.entries(r || {}).filter(([k, v]) => /^ERR|undefined/.test(v)); console.log(`  Probe ${where}: ` + (r ? Object.entries(r).map(([k, v]) => k + '=' + v).join(' | ') : 'no answer')); ok(r && !bad.length, `${where}: every chrome.* call Okta's plugin makes answers` + (bad.length ? ' — not: ' + bad.map(x => x.join(' ')).join('; ') : '')); }
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
