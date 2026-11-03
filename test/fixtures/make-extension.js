'use strict';
/* A small Chrome extension (MV3) installed the way the Chrome Web Store installs one: <profile>/Extensions/<id>/<version>_0
   with a "key" in its manifest. It has a toolbar button with a badge and a popup that opens a tab, a background
   service worker, a content script that asks the background which tab is active, a context-menu item and an options page.
   Usage: node make-extension.js <profileDir>   (prints the extension id) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' }), key = der.toString('base64');
const id = [...crypto.createHash('sha256').update(der).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
const dir = path.join(process.argv[2], 'Extensions', id, '1.0.0_0');
fs.mkdirSync(dir, { recursive: true });
/* a real 32x32 PNG: a green circle on transparent */
function makePng(n = 32) {
  const zlib = require('zlib'), rows = [];
  for (let y = 0; y < n; y++) { const r = [0]; for (let x = 0; x < n; x++) { const d = Math.hypot(x - n / 2 + .5, y - n / 2 + .5); r.push(31, 157, 87, d < n / 2 - 1 ? 255 : 0); } rows.push(Buffer.from(r)); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(n, 0); ih.writeUInt32BE(n, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const png = makePng();
const files = {
  'manifest.json': JSON.stringify({ manifest_version: 3, name: 'Washi Test Helper', version: '1.0.0', description: 'A test extension for Washi.', key,
    action: { default_title: 'Test helper', default_popup: 'popup.html', default_icon: { 16: 'icon.png', 32: 'icon.png' } }, icons: { 16: 'icon.png', 32: 'icon.png', 128: 'icon.png' },
    background: { service_worker: 'bg.js', ...(process.argv.includes('--module') ? { type: 'module' } : {}) }, permissions: ['tabs', 'storage', 'contextMenus', 'cookies', 'unlimitedStorage', 'webRequest', 'webNavigation', 'scripting', 'declarativeNetRequestWithHostAccess', 'webRequestAuthProvider', 'idle', 'identity'], optional_permissions: ['privacy'], host_permissions: ['http://127.0.0.1:8765/*', 'http://localhost:8765/*'],
    content_scripts: [{ matches: ['http://localhost:8765/*'], js: ['content.js'], run_at: 'document_idle' }], options_page: 'options.html' }, null, 1),
  'bg.js': `self.atStart = (['windows', 'commands', 'cookies', 'contextMenus', 'action', 'privacy', 'webNavigation'].filter(k => !chrome[k]).join(',') || 'all there') + (typeof browser !== 'undefined' && browser !== chrome ? ' (but browser.* is not chrome.*)' : '');
self.probe = async () => { const out = {}; const T = (k, f) => Promise.race([Promise.resolve().then(f), new Promise((_, j) => setTimeout(() => j(new Error('hung')), 2500))]).then(v => { out[k] = v === undefined ? 'ok' : JSON.stringify(v).slice(0, 80); }, e => { out[k] = 'ERR ' + String(e && e.message || e).slice(0, 260); });
  const [tb] = await chrome.tabs.query({ url: 'http://localhost:8765/*' }).catch(() => []); const tid = tb ? tb.id : -1;
  await T('cookies.getAllCookieStores', () => chrome.cookies.getAllCookieStores()); await T('cookies.get', () => chrome.cookies.get({ url: 'http://127.0.0.1:8765/', name: 'sidl' }).then(c => c && c.value)); await T('cookies.getAll', () => chrome.cookies.getAll({ domain: '127.0.0.1' }).then(c => c.length));
  await T('storage.session', () => chrome.storage.session.set({ a: 1 }).then(() => chrome.storage.session.get('a'))); await T('storage.local', () => chrome.storage.local.set({ b: 2 }).then(() => chrome.storage.local.get('b'))); await T('storage.onChanged', () => typeof chrome.storage.onChanged.addListener);
  await T('windows.getAll', () => chrome.windows.getAll({ populate: true }).then(w => w.length)); await T('windows.getCurrent', () => chrome.windows.getCurrent().then(w => w && w.id)); await T('windows.WINDOW_ID_NONE', () => chrome.windows.WINDOW_ID_NONE); await T('windows.onFocusChanged', () => typeof chrome.windows.onFocusChanged.addListener); await T('windows.onRemoved', () => typeof chrome.windows.onRemoved.addListener);
  await T('tabs.query', () => chrome.tabs.query({}).then(x => x.length)); await T('tabs.get', () => chrome.tabs.get(tid).then(t => t.url)); await T('tabs.TAB_ID_NONE', () => chrome.tabs.TAB_ID_NONE); await T('tabs.sendMessage', () => chrome.tabs.sendMessage(tid, 'ping')); await T('tabs.onReplaced', () => typeof chrome.tabs.onReplaced.addListener); await T('tabs.highlight', () => typeof chrome.tabs.highlight);
  await T('webNavigation.getAllFrames', () => chrome.webNavigation.getAllFrames({ tabId: tid }).then(f => f && f.length)); await T('webNavigation.getFrame', () => chrome.webNavigation.getFrame({ tabId: tid, frameId: 0 }).then(f => f && f.url));
  await T('scripting.executeScript', () => chrome.scripting.executeScript({ target: { tabId: tid }, func: () => location.pathname }).then(r => r && r[0] && r[0].result)); await T('scripting.insertCSS', () => chrome.scripting.insertCSS({ target: { tabId: tid }, css: 'html{}' }));
  await T('scripting.registerContentScripts', () => chrome.scripting.registerContentScripts([{ id: 'p1', matches: ['http://localhost:8765/*'], js: ['content.js'], runAt: 'document_end' }])); await T('scripting.getRegisteredContentScripts', () => chrome.scripting.getRegisteredContentScripts().then(x => x.length)); await T('scripting.unregisterContentScripts', () => chrome.scripting.unregisterContentScripts({ ids: ['p1'] }));
  await T('dnr.getSessionRules', () => chrome.declarativeNetRequest.getSessionRules()); await T('dnr.updateSessionRules', () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [7], addRules: [{ id: 7, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'x-okta', operation: 'set', value: '1' }] }, condition: { urlFilter: '127.0.0.1:8765/org/', tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ['xmlhttprequest'] } }] }));
  await T('dnr.updateDynamicRules', () => chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [8] })); await T('dnr.HeaderOperation', () => chrome.declarativeNetRequest.HeaderOperation && chrome.declarativeNetRequest.HeaderOperation.SET);
  await T('webRequest.onBeforeRequest', () => { chrome.webRequest.onBeforeRequest.addListener(() => {}, { urls: ['<all_urls>'] }); return 'ok'; }); await T('webRequest.onAuthRequired', () => { chrome.webRequest.onAuthRequired.addListener(() => {}, { urls: ['<all_urls>'] }, ['asyncBlocking']); return 'ok'; }); await T('webRequest.onHeadersReceived', () => { chrome.webRequest.onHeadersReceived.addListener(() => {}, { urls: ['<all_urls>'] }, ['responseHeaders', 'extraHeaders']); return 'ok'; });
  await T('action.getUserSettings', () => chrome.action.getUserSettings()); await T('action.setBadgeText', () => chrome.action.setBadgeText({ text: 'OK' })); await T('action.openPopup', () => typeof chrome.action.openPopup);
  await T('contextMenus.removeAll', () => new Promise(r => chrome.contextMenus.removeAll(() => r('ok')))); await T('contextMenus.create', () => chrome.contextMenus.create({ id: 'probe', title: 'Probe', contexts: ['page'] }));
  await T('extension.isAllowedIncognitoAccess', () => chrome.extension.isAllowedIncognitoAccess());
  await T('permissions.contains', () => chrome.permissions.contains({ permissions: ['privacy'] })); await T('permissions.getAll', () => chrome.permissions.getAll().then(p => p.permissions.length)); await T('privacy', () => typeof chrome.privacy);
  await T('privacy.passwordSavingEnabled.get', () => new Promise(r => chrome.privacy.services.passwordSavingEnabled.get({}, d => r(d && d.value)))); await T('storage.managed', () => chrome.storage.managed.get(null).then(o => o.orgUrl || 'ERR ' + JSON.stringify(o)));
  await T('idle.queryState', () => chrome.idle.queryState(60)); await T('identity.getRedirectURL', () => (chrome.identity.getRedirectURL('cb').endsWith('.chromiumapp.org/cb') ? 'ok' : 'ERR ' + chrome.identity.getRedirectURL('cb')));
  await T('runtime.setUninstallURL', () => chrome.runtime.setUninstallURL('')); await T('runtime.getManifest', () => chrome.runtime.getManifest().version); await T('runtime.getURL', () => chrome.runtime.getURL('x')); await T('runtime.onConnect', () => typeof chrome.runtime.onConnect.addListener);
  await T('fetch org (cookies, no CORS)', () => fetch('http://127.0.0.1:8765/org/me', { credentials: 'include' }).then(r => r.json()).then(j => j.cookie));
  out.atStart = self.atStart; out.browserNs = typeof browser === 'undefined' || browser === chrome ? 'ok' : 'ERR browser.* lacks ' + ['windows', 'commands', 'cookies', 'tabs', 'contextMenus'].filter(k => !browser[k]).join(','); if (/not chrome/.test(out.atStart)) out.atStart = 'ERR ' + out.atStart;
  return out; };
chrome.runtime.onConnect.addListener(p => p.onMessage.addListener(m => p.postMessage({ echo: m })));
chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create({ id: 'washi-test', title: 'Washi test item', contexts: ['page'] }));
chrome.action.setBadgeText({ text: 'OK' }); chrome.action.setBadgeBackgroundColor({ color: '#1f9d57' });
chrome.runtime.onMessage.addListener((m, s, reply) => { if (m === 'probe') { probe().then(reply); return true; }
    if (m === 'org') { fetch('http://127.0.0.1:8765/org/me', { credentials: 'include' }).then(r => r.json()).then(j => reply({ ok: true, ...j }), e => reply({ ok: false, err: String(e) })); return true; } });
chrome.runtime.onMessage.addListener((m, s, reply) => { if (m === 'tabs') { let bad = null; try { const r = chrome.action.setBadgeText({ text: 'OK' }); if (r && r.catch) r.catch(e => { self.badErr = String(e && e.message || e); }); } catch (e) { bad = String(e && e.message || e); } self.badErr = bad; chrome.tabs.query({ active: true, currentWindow: true }).then(t => reply({ active: t.map(x => x.url), me: s.tab && s.tab.url, tid: s.tab ? typeof s.tab.id + ':' + s.tab.id : 'no tab', action: typeof chrome.action, badge: self.badErr || null, keys: Object.keys(chrome).join(',') })); return true; } });`,
  'content.js': `chrome.runtime.onMessage.addListener((m, s, r) => { if (m === 'ping') r('pong'); });
document.documentElement.dataset.washiExt = 'ran';
chrome.runtime.sendMessage('tabs', r => { document.documentElement.dataset.washiTabs = JSON.stringify(r || null); });`,
  'popup.html': `<!doctype html><html><body style="width:240px;height:90px;margin:0;padding:12px;font:14px system-ui"><p id="t">Hello from the extension</p><button id="open">Open page 2</button><script src="popup.js"></script></body></html>`,
  'popup.js': `document.getElementById('open').onclick = () => { document.body.dataset.r = 'clicked'; try { chrome.tabs.create({ url: 'http://localhost:8765/p2.html?fromext=1' }).then(t => { document.body.dataset.r = 'created ' + (t && t.id); }, e => { document.body.dataset.r = 'error ' + e.message; }); } catch (e) { document.body.dataset.r = 'threw ' + e.message; } };`,
  'options.html': `<!doctype html><title>Helper options</title><h1 id="o">Helper options</h1>`,
  'icon.png': png
};
if (process.argv.includes('--module')) { files['first.js'] = "self.atFirst = ['windows', 'commands', 'cookies', 'contextMenus'].filter(k => !chrome[k]).join(',') || 'all there';\nexport const x = 1;\n"; files['bg.js'] = "import { x } from './first.js';\n" + files['bg.js'].replace('out.atStart = self.atStart;', 'out.atStart = self.atStart + \' / first: \' + self.atFirst;'); }
for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), v);
console.log(id);
