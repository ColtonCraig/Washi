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
  process.env.WASHI_EXT_POLICY = JSON.stringify({ [id]: { orgUrl: 'https://example.okta.com' } });   // what a company's Chrome policy (MDM) would give it
  b = await start({ profile, fresh: false, sandbox: SB }); const { ui } = b; await sleep(1500);
  for (let i = 0; i < 40; i++) { const L = await ui.evaluate(() => B.setupAct({ type: 'ext:list' })).catch(() => null); if (L && L.list && L.list.some(e => e.id === id)) break; await sleep(250); }   // extensions loaded
  const page = async s => { for (let i = 0; i < 40; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } return null; };
  await ui.evaluate(() => openTab('http://127.0.0.1:8765/org/login')); await sleep(1500);
  await ui.evaluate(id => openTab(`chrome-extension://${id}/options.html`), id); await sleep(1500);
  const ep = await page(`chrome-extension://${id}/options.html`);
  for (let i = 0; i < 3 && ep && !(await ep.evaluate(() => !!(chrome.cookies && chrome.cookies.getAll)).catch(() => false)); i++) { console.log('  NOTE the extension page loaded before its APIs were ready: reloading'); await ep.reload(); await sleep(1200); }
  ok(!!ep, 'the extension page opens');
  const bg = await ep.evaluate(() => new Promise(r => chrome.runtime.sendMessage('org', r)));
  console.log('  bg:', JSON.stringify(bg));
  if (SB || bg) ok(bg && bg.ok && /sidl=L/.test(bg.cookie) && /sids=S/.test(bg.cookie) && /sidn=N/.test(bg.cookie), 'its background worker reaches the site signed in (all its cookies)');
  const pg = await ep.evaluate(() => fetch('http://127.0.0.1:8765/org/me', { credentials: 'include' }).then(r => r.json()).then(j => ({ ok: true, ...j }), e => ({ ok: false, err: String(e) })));
  console.log('  page:', JSON.stringify(pg));
  ok(pg && pg.ok && /sidl=L/.test(pg.cookie) && /sidn=N/.test(pg.cookie), 'and so do its pages (popup, options)');
  const ck = await ep.evaluate(() => !chrome.cookies ? ['(no chrome.cookies here: ' + location.href + ' ' + Object.keys(chrome).join(',') + ')'] : new Promise(r => chrome.cookies.getAll({ domain: '127.0.0.1' }, c => r((c || []).map(x => x.name).sort())))).catch(e => ['(' + e.message + ')']);
  ok(ck.join() === 'sidl,sidn,sids', 'chrome.cookies sees them: ' + ck);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(2000);
  const pr = await ep.evaluate(() => new Promise(r => chrome.runtime.sendMessage('probe', r)));
  const pp = await ep.evaluate(async () => { const out = await (async () => { const o = {}; const T = (k, f) => Promise.race([Promise.resolve().then(f), new Promise((_, j) => setTimeout(() => j(new Error('hung')), 2500))]).then(v => { o[k] = v === undefined ? 'ok' : JSON.stringify(v).slice(0, 80); }, e => { o[k] = 'ERR ' + String(e && e.message || e).slice(0, 100); });
      await T('getViews', () => chrome.extension.getViews().length); await T('cookies.getAllCookieStores', () => chrome.cookies.getAllCookieStores()); await T('windows.getCurrent', () => chrome.windows.getCurrent().then(w => w && w.id)); await T('tabs.query', () => chrome.tabs.query({ active: true, currentWindow: true }).then(x => x.length)); await T('storage.session', () => chrome.storage.session.get(null));
      await T('port', () => new Promise(res => { const p = chrome.runtime.connect({ name: 'x' }); p.onMessage.addListener(m => res(m)); p.onDisconnect.addListener(() => res('disconnected')); p.postMessage('hi'); }));
      await T('management.getSelf', () => chrome.management.getSelf().then(m => m && m.id)); await T('privacy.passwordSavingEnabled.get', () => new Promise(r => chrome.privacy.services.passwordSavingEnabled.get({}, d => r(d && d.value))));
      await T('i18n.getMessage', () => typeof chrome.i18n.getMessage('x')); await T('i18n.getUILanguage', () => chrome.i18n.getUILanguage()); await T('runtime.getPlatformInfo', () => chrome.runtime.getPlatformInfo().then(p => p.os)); await T('windows.getLastFocused', () => chrome.windows.getLastFocused().then(w => w && w.id));
      await T('tabs.query lastFocusedWindow', () => chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(x => x.length)); await T('tabs.getCurrent', () => chrome.tabs.getCurrent().then(t => t ? 'tab' : 'none')); await T('storage.local.getBytesInUse', () => chrome.storage.local.getBytesInUse ? chrome.storage.local.getBytesInUse(null) : 'missing');
      await T('storage.managed (company policy)', () => chrome.storage.managed.get('orgUrl').then(o => o.orgUrl === 'https://example.okta.com' ? o.orgUrl : 'ERR ' + JSON.stringify(o))); await T('storage.managed is read-only', () => chrome.storage.managed.set({ a: 1 }).then(() => 'ERR wrote', () => 'refused'));
      await T('browser namespace', () => typeof browser === 'undefined' || browser === chrome ? 'ok' : 'ERR browser.* lacks ' + ['windows', 'commands', 'cookies', 'contextMenus'].filter(k => !browser[k]).join(','));
      await T('permissions.request (no gesture)', () => chrome.permissions.contains({ permissions: ['privacy'] }));
      return o; })(); return out; });
  console.log('  Privacy: ' + await ep.evaluate(() => { const p = chrome.privacy; return typeof p + ' ' + (p ? Object.keys(p) + ' / ' + String(p.services && p.services.passwordSavingEnabled && p.services.passwordSavingEnabled.get).slice(0, 200) : ''); }));
  for (const [where, r] of [['background', pr], ['page', pp]]) { const bad = Object.entries(r || {}).filter(([k, v]) => /^ERR|undefined/.test(v)); console.log(`  Probe ${where}: ` + (r ? Object.entries(r).map(([k, v]) => k + '=' + v).join(' | ') : 'no answer')); if (where === 'background' && !SB) { console.log('  NOTE background workers only get the extension APIs with the sandbox on (Electron issue 54322): checked on a Mac (macchecks.yml)'); continue; } ok(r && !bad.length, `${where}: every chrome.* call Okta's plugin makes answers` + (bad.length ? ' — not: ' + bad.map(x => x.join(' ')).join('; ') : '')); }
  // after the background worker has gone idle (Chrome stops it after ~30s), the popup still gets answers: it wakes up
  await ui.evaluate(() => closeTab(focusedId())); await sleep(500);
  await ui.evaluate(() => { for (const id of Object.keys(S.tabs)) if (/^chrome-extension/.test(S.tabs[id].url)) closeTab(id); }); await sleep(300);
  const idle = +(process.env.IDLE_S || 45); console.log(`  (waiting ${idle}s for the worker to go idle)`);
  const st0 = await ui.evaluate(() => 0); await sleep(idle * 1000);
  console.log('  Status: ' + b.log().split('\n').filter(l => /ext-status/.test(l)).slice(-3).join(' / ').slice(0, 400));
  await ui.evaluate(id => openTab(`chrome-extension://${id}/options.html`), id); await sleep(1200);
  const ep2 = await page(`chrome-extension://${id}/options.html`);
  const t0 = Date.now(); const wake = await ep2.evaluate(() => Promise.race([new Promise(r => chrome.runtime.sendMessage('org', r)), new Promise(r => setTimeout(() => r('no answer'), 8000))]));
  ok(wake && wake.ok && /sidl=L/.test(wake.cookie), `after the worker goes idle, a message still wakes it and gets an answer (${Date.now() - t0}ms: ${JSON.stringify(wake).slice(0, 80)})`);
  const port = await ep2.evaluate(() => Promise.race([new Promise(res => { const p = chrome.runtime.connect({ name: 'y' }); p.onMessage.addListener(m => res(m)); p.postMessage('again'); }), new Promise(r => setTimeout(() => r('no answer'), 8000))]));
  ok(port && port.echo === 'again', 'and so does a port (runtime.connect): ' + JSON.stringify(port));
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
