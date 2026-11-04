'use strict';
/* Diagnostic (not a pass/fail test): install a real extension from the Chrome Web Store on GitHub's Mac, open its
   popup and record everything: its manifest permissions, which chrome.* APIs it touches that are missing, console
   errors from its popup and background worker, where the popup window lands, and screenshots.
   Usage: EXT_ID=<id> node test/diag-ext.js   (needs the internet; .github/workflows/diag.yml) */
const fs = require('fs'), os = require('os'), path = require('path');
process.env.WASHI_TEST_EXT_ALLOW = '1'; process.env.WASHI_DEBUG_EXT = '1';
const { start, sleep, shot } = require('./lib');
const ID = process.env.EXT_ID || 'glnpjglilkicbckjpbgcfkogebgllemb';
const OUT = process.env.WASHI_SHOTS || os.tmpdir();
const say = (k, v) => console.log(`## ${k}: ${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-diag-')); const V = { popup: null };
  let b = await start({ profile, sandbox: process.platform === 'darwin' }); const { ui } = b;
  const page = async (s, n = 60) => { for (let i = 0; i < n; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(250); } return null; };
  await ui.evaluate(u => openTab(u), `https://chromewebstore.google.com/detail/${ID}`); await sleep(7000);
  const store = await page('chromewebstore.google.com');
  for (let i = 0; i < 40; i++) { const t = await store.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Add to (Chrome|Washi)/i.test(x.textContent)); if (b) { b.click(); return 1; } return 0; }).catch(() => 0); if (t) break; await sleep(500); }
  let L = null; for (let i = 0; i < 90; i++) { L = await ui.evaluate(() => B.setupAct({ type: 'ext:list' })); if (L.list.some(e => e.id === ID)) break; await sleep(1000); }
  say('installed', L.list.map(e => e.name + ' ' + e.version));
  if (!L.list.some(e => e.id === ID)) {                  // why not: what the store page says, and what Washi logged
    say('store page', await store.evaluate(() => ({ buttons: [...document.querySelectorAll('button')].map(x => x.textContent.trim()).filter(t => t && t.length < 40).slice(0, 12), notes: [...document.querySelectorAll('[role=alert],[role=status],h1,h2')].map(x => x.textContent.trim().slice(0, 160)).filter(Boolean).slice(0, 8) })).catch(e => 'unreadable: ' + e.message));
    say('main log', b.log().split('\n').filter(l => /extension|crx|web.?store|install|manifest|error/i.test(l)).slice(-25).join('\n'));
  }
  const dir = path.join(profile, 'Extensions', ID); let man = null;
  try { const v = fs.readdirSync(dir).filter(x => !x.startsWith('.'))[0]; man = JSON.parse(fs.readFileSync(path.join(dir, v, 'manifest.json'), 'utf8')); say('manifest', { mv: man.manifest_version, permissions: man.permissions, optional: man.optional_permissions, host: man.host_permissions, bg: man.background, popup: (man.action || man.browser_action || {}).default_popup, externally_connectable: man.externally_connectable, commands: man.commands });
    // which chrome.* APIs its code mentions
    const apis = new Set(); const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/chrome\.([a-zA-Z]+)\.([a-zA-Z]+)/g)) apis.add(m[1] + '.' + m[2]); } }; walk(path.join(dir, v)); say('apis used', [...apis].sort());
    try { const sw = fs.readFileSync(path.join(dir, v, man.background.service_worker), 'utf8'); const hits = []; const scan = d => { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) scan(q); else if (/\.js$/.test(f)) { const t = fs.readFileSync(q, 'utf8'); let i = -1; while ((i = t.indexOf('updateSessionRules', i + 1)) > -1 && hits.length < 8) hits.push(f + ': ' + t.slice(Math.max(0, i - 700), i + 200)); } } }; scan(path.join(dir, v)); say('code around updateSessionRules', hits.slice(0, 2));
    const look = (needle, before, after, max) => { const out = []; const scan2 = d => { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) scan2(q); else if (/\.(js|html)$/.test(f)) { const t = fs.readFileSync(q, 'utf8'); let i = -1; while ((i = t.indexOf(needle, i + 1)) > -1 && out.length < max) out.push(f + ': ' + t.slice(Math.max(0, i - before), i + after)); } } }; scan2(path.join(dir, v)); return out; };
    for (const n of (process.env.EXT_LOOK || '').split('|').filter(Boolean)) say('code: ' + n, look(n, 500, 500, 4));
    say('SigningInError in its code', look('SigningInError', 1400, 300, 8));
    say('SigningIn.html in its code', look('SigningIn.html', 900, 600, 6));
    say('SigningIn page', look('<script', 0, 400, 3).filter(x => /^SigningIn/.test(x))); const imp = [...sw.matchAll(/importScripts\(([^)]*)\)/g)].map(m => m[1]); say('worker imports', imp); } catch (e) { say('worker read', e.message); }
  } catch (e) { say('manifest error', e.message); }
  // a page it works on, then its popup
  const early = [];
  const ctx = ui.context(); ctx.on('page', p => { if (/chrome-extension:/.test(p.url()) || true) { p.on('console', m => early.push(p.url().slice(0, 60) + ' ' + m.type() + ': ' + m.text())); p.on('pageerror', e => early.push(p.url().slice(0, 60) + ' pageerror: ' + e.message)); } });
  const ORG = process.env.EXT_ORG || 'https://hudl.okta.com/';
  const nav = []; ctx.on('page', p => p.on('framenavigated', f => { if (f === p.mainFrame()) nav.push(f.url().slice(0, 160)); }));
  for (const u of [ORG, 'https://idmsa.apple.com/', 'https://github.com/login']) { await ui.evaluate(u => openTab(u), u); await sleep(7000); }
  say('navigations', nav.slice(0, 40));
  say('tabs after visiting login pages', await ui.evaluate(() => Object.values(S.tabs).map(t => t.url)));
  const btn = await ui.evaluate(id => { const e = document.getElementById('exts').shadowRoot.querySelector(`[id="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); e.click(); return { x: r.x, y: r.y, w: r.width }; }, ID);
  const mark = b.log().length;
  say('button', btn);
  say('action', await ui.evaluate(id => B.setupAct({ type: 'test:action', id }), ID).catch(e => e.message));
  await sleep(4000);
  say('after the click: worker', b.log().slice(mark).split('\n').filter(l => /ext-sw|crx|popup|onClicked|openPopup/i.test(l) && !/contextMenus\.update|tabs\.query|tabs\.get |Receiving end/.test(l)).map(l => l.slice(0, 600)).slice(0, 40));
  say('after the click: tabs', await ui.evaluate(() => Object.values(S.tabs).map(t => t.url.slice(0, 90))));
  const popPath = man && (man.action || man.browser_action || {}).default_popup;
  // the popup Washi opened (an extension can change its page per tab, e.g. React DevTools on a site that uses React)
  let pu = ''; for (let i = 0; i < 40 && !pu; i++) { const q = await ui.evaluate(() => B.setupAct({ type: 'test:popup' })).catch(() => null); if (q && q.open && q.url) pu = q.url; else await sleep(250); }
  const pop = pu ? await page(pu.split('#')[0], 40) : popPath ? await page('chrome-extension://' + ID + '/' + String(popPath).replace(/^\//, ''), 20) : null;
  say('popup page', pop ? pop.url() : 'never opened');
  if (pop) {
    const msgs = []; pop.on('console', m => msgs.push(m.type() + ': ' + m.text())); pop.on('pageerror', e => msgs.push('pageerror: ' + e.message));
    await sleep(8000);
    V.popup = await pop.evaluate(() => ({ text: document.body.innerText.trim().length, html: document.body.innerHTML.length, url: location.pathname })).catch(() => null);
    say('popup', await pop.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, text: document.body.innerText.slice(0, 600), html: document.body.innerHTML.length, missing: ['privacy', 'webRequest', 'webNavigation', 'management', 'cookies', 'tabs', 'windows', 'storage', 'runtime', 'identity', 'scripting', 'alarms', 'idle', 'declarativeNetRequest'].filter(k => !chrome[k]) })).catch(e => 'eval failed ' + e.message));
    say('window', await ui.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, avail: [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight] })));
    say('popup console', msgs.slice(0, 60));
    say('page consoles', early.filter(l => /okta|chrome-extension|rror/i.test(l) && !/ERR_BLOCKED_BY_CLIENT/.test(l)).slice(0, 80));
    try { await pop.screenshot({ path: path.join(OUT, 'diag-popup.png') }); } catch (e) { say('popup screenshot failed', e.message); }
  }
  shot('diag-screen');
  // with the extension installed: does YouTube still play, opened directly and clicked from the home page?
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/']) {
    await ui.evaluate(u => openTab(u), u); await sleep(9000);
    const yp = b.pages().filter(x => x.url().includes('youtube.com')).pop(); if (!yp) { say('youtube', 'no page'); continue; }
    const ym = []; yp.on('console', m => { if (/error/.test(m.type())) ym.push(m.text().slice(0, 200)); }); yp.on('pageerror', e => ym.push('pageerror: ' + e.message.slice(0, 200)));
    if (u.endsWith('.com/')) { const r = await yp.evaluate(() => { const a = document.querySelector('a#thumbnail[href*="watch"], a[href*="/watch?v="]'); if (!a) return null; a.scrollIntoView(); const q = a.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }).catch(() => null); say('home thumbnail', r); if (r) { await yp.mouse.click(r.x, r.y); await sleep(9000); } }
    say('youtube with extension ' + u, await yp.evaluate(() => { const v = document.querySelector('video'); return { url: location.href, v: v && { rs: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(1), w: v.videoWidth, err: v.error && v.error.code }, playerErr: (document.querySelector('.ytp-error') || {}).textContent || '' }; }).catch(e => e.message));
    say('youtube console', ym.slice(0, 12));
  }
  await sleep(1500);
  say('worker log', b.log().split('\n').filter(l => /ext-sw/.test(l) && !/Receiving end does not exist|webNavigation\.on|tabs\.onUpdated|Skipped url|\(result\)|tabs\.query|tabs\.get /.test(l)).map(l => l.slice(0, 900)).slice(0, 120));
  // and after a restart (installed extensions load at start): does the popup work then?
  V.log1 = b.log();
  await b.stop(); b = await start({ profile, fresh: false, sandbox: process.platform === 'darwin' }); await sleep(5000);
  const ui2 = b.ui; await ui2.evaluate(() => openTab('https://example.com/')); await sleep(3000);
  await ui2.evaluate(id => { const e = document.getElementById('exts').shadowRoot.querySelector(`[id="${id}"]`); if (e) e.click(); }, ID);
  let pop2 = null; for (let i = 0; i < 40 && !pop2; i++) { pop2 = b.pages().filter(x => x.url().startsWith('chrome-extension://' + ID)).pop(); if (!pop2) await sleep(250); }
  if (pop2) { await sleep(6000); say('after restart: popup', await pop2.evaluate(() => ({ outerWidth, outerHeight, text: document.body.innerText.slice(0, 300) })).catch(e => e.message)); } else say('after restart: popup', 'never opened');
  say('after restart: worker errors', b.log().split('\n').filter(l => /ext-sw/.test(l) && /"level":3|Uncaught/.test(l)).map(l => l.slice(0, 500)).slice(0, 20));
  // the verdict, for the sweep (ext-sweep.yml)
  const logs = ((V.log1 || '') + '\n' + b.log()).split('\n').filter(l => /ext-sw/.test(l) && /"level":3/.test(l) && /Uncaught/.test(l) && /is not a function|Cannot read properties of undefined|is not defined|not supported/.test(l)).map(l => (l.match(/"message":"([^"]{0,160})/) || [])[1]);
  const why = [];
  if (!L || !L.list.some(e => e.id === ID)) why.push('did not install');
  if (popPath && (!V.popup || (V.popup.text < 2 && V.popup.html < 400))) why.push('popup blank or never opened');
  for (const l of [...new Set(logs)].slice(0, 4)) why.push('background: ' + l);
  console.log(`## VERDICT ${ID} ${man ? (man.name || '').replace(/__MSG_.*__/, '') : ''}: ${why.length ? 'BROKEN: ' + why.join(' | ') : 'ok'}`);
  await b.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
