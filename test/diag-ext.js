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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-diag-'));
  let b = await start({ profile, sandbox: process.platform === 'darwin' }); const { ui } = b;
  const page = async (s, n = 60) => { for (let i = 0; i < n; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(250); } return null; };
  await ui.evaluate(u => openTab(u), `https://chromewebstore.google.com/detail/${ID}`); await sleep(7000);
  const store = await page('chromewebstore.google.com');
  for (let i = 0; i < 40; i++) { const t = await store.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Add to (Chrome|Washi)/i.test(x.textContent)); if (b) { b.click(); return 1; } return 0; }).catch(() => 0); if (t) break; await sleep(500); }
  let L = null; for (let i = 0; i < 90; i++) { L = await ui.evaluate(() => B.setupAct({ type: 'ext:list' })); if (L.list.some(e => e.id === ID)) break; await sleep(1000); }
  say('installed', L.list.map(e => e.name + ' ' + e.version));
  const dir = path.join(profile, 'Extensions', ID); let man = null;
  try { const v = fs.readdirSync(dir).filter(x => !x.startsWith('.'))[0]; man = JSON.parse(fs.readFileSync(path.join(dir, v, 'manifest.json'), 'utf8')); say('manifest', { mv: man.manifest_version, permissions: man.permissions, optional: man.optional_permissions, host: man.host_permissions, bg: man.background, popup: (man.action || man.browser_action || {}).default_popup, externally_connectable: man.externally_connectable });
    // which chrome.* APIs its code mentions
    const apis = new Set(); const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/chrome\.([a-zA-Z]+)\.([a-zA-Z]+)/g)) apis.add(m[1] + '.' + m[2]); } }; walk(path.join(dir, v)); say('apis used', [...apis].sort());
    try { const sw = fs.readFileSync(path.join(dir, v, man.background.service_worker), 'utf8'); const hits = []; const scan = d => { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) scan(q); else if (/\.js$/.test(f)) { const t = fs.readFileSync(q, 'utf8'); let i = -1; while ((i = t.indexOf('tabIds', i + 1)) > -1 && hits.length < 8) hits.push(f + ': ' + t.slice(Math.max(0, i - 300), i + 160)); } } }; scan(path.join(dir, v)); say('tabIds in its worker', hits); const imp = [...sw.matchAll(/importScripts\(([^)]*)\)/g)].map(m => m[1]); say('worker imports', imp); } catch (e) { say('worker read', e.message); }
  } catch (e) { say('manifest error', e.message); }
  // a page it works on, then its popup
  const early = [];
  const ctx = ui.context(); ctx.on('page', p => { if (/chrome-extension:/.test(p.url()) || true) { p.on('console', m => early.push(p.url().slice(0, 60) + ' ' + m.type() + ': ' + m.text())); p.on('pageerror', e => early.push(p.url().slice(0, 60) + ' pageerror: ' + e.message)); } });
  for (const u of ['https://www.okta.com/', 'https://idmsa.apple.com/', 'https://github.com/login']) { await ui.evaluate(u => openTab(u), u); await sleep(5000); }
  say('tabs after visiting login pages', await ui.evaluate(() => Object.values(S.tabs).map(t => t.url)));
  const btn = await ui.evaluate(id => { const e = document.getElementById('exts').shadowRoot.querySelector(`[id="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); e.click(); return { x: r.x, y: r.y, w: r.width }; }, ID);
  say('button', btn);
  const pop = await page('chrome-extension://' + ID, 40);
  say('popup page', pop ? pop.url() : 'never opened');
  if (pop) {
    const msgs = []; pop.on('console', m => msgs.push(m.type() + ': ' + m.text())); pop.on('pageerror', e => msgs.push('pageerror: ' + e.message));
    await sleep(8000);
    say('popup', await pop.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, text: document.body.innerText.slice(0, 600), html: document.body.innerHTML.length, missing: ['privacy', 'webRequest', 'webNavigation', 'management', 'cookies', 'tabs', 'windows', 'storage', 'runtime', 'identity', 'scripting', 'alarms', 'idle', 'declarativeNetRequest'].filter(k => !chrome[k]) })).catch(e => 'eval failed ' + e.message));
    say('window', await ui.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, avail: [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight] })));
    say('popup console', msgs.slice(0, 60));
    say('page consoles', early.filter(l => /error|Error|chrome-extension/.test(l)).slice(0, 60));
    try { await pop.screenshot({ path: path.join(OUT, 'diag-popup.png') }); } catch (e) { say('popup screenshot failed', e.message); }
  }
  shot('diag-screen');
  await sleep(1500);
  say('worker errors', b.log().split('\n').filter(l => /ext-sw/.test(l) && /rror|Invalid|undefined|null|washi-ext-fix/.test(l)).slice(0, 30));
  await b.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
