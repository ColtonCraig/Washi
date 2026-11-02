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
    background: { service_worker: 'bg.js' }, permissions: ['tabs', 'storage', 'contextMenus'],
    content_scripts: [{ matches: ['http://localhost:8765/*'], js: ['content.js'], run_at: 'document_idle' }], options_page: 'options.html' }, null, 1),
  'bg.js': `chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create({ id: 'washi-test', title: 'Washi test item', contexts: ['page'] }));
chrome.action.setBadgeText({ text: 'OK' }); chrome.action.setBadgeBackgroundColor({ color: '#1f9d57' });
chrome.runtime.onMessage.addListener((m, s, reply) => { if (m === 'tabs') { let bad = null; try { const r = chrome.action.setBadgeText({ text: 'OK' }); if (r && r.catch) r.catch(e => { self.badErr = String(e && e.message || e); }); } catch (e) { bad = String(e && e.message || e); } self.badErr = bad; chrome.tabs.query({ active: true, currentWindow: true }).then(t => reply({ active: t.map(x => x.url), me: s.tab && s.tab.url, action: typeof chrome.action, badge: self.badErr || null, keys: Object.keys(chrome).join(',') })); return true; } });`,
  'content.js': `document.documentElement.dataset.washiExt = 'ran';
chrome.runtime.sendMessage('tabs', r => { document.documentElement.dataset.washiTabs = JSON.stringify(r || null); });`,
  'popup.html': `<!doctype html><html><body style="width:240px;height:90px;margin:0;padding:12px;font:14px system-ui"><p id="t">Hello from the extension</p><button id="open">Open page 2</button><script src="popup.js"></script></body></html>`,
  'popup.js': `document.getElementById('open').onclick = () => { document.body.dataset.r = 'clicked'; try { chrome.tabs.create({ url: 'http://localhost:8765/p2.html?fromext=1' }).then(t => { document.body.dataset.r = 'created ' + (t && t.id); }, e => { document.body.dataset.r = 'error ' + e.message; }); } catch (e) { document.body.dataset.r = 'threw ' + e.message; } };`,
  'options.html': `<!doctype html><title>Helper options</title><h1 id="o">Helper options</h1>`,
  'icon.png': png
};
for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), v);
console.log(id);
