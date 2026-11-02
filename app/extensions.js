'use strict';
/* Chrome extensions: install from the Chrome Web Store ("Add to Chrome" works on chromewebstore.google.com, after
   Washi asks you), keep them updated, and give them the chrome.* APIs they expect (tabs, action buttons and popups,
   context menus, cookies, storage…). Built on electron-chrome-web-store and electron-chrome-extensions (MIT).
   Extensions are installed once (in Washi's profile, "Extensions") and loaded into every space's session, so they
   work in spaces that keep their own logins too. */
const { app, session } = require('electron');
const path = require('path'), fs = require('fs');

let ECE = null, CWS = null, setResolver = null;
try {
  ({ ElectronChromeExtensions: ECE, setSessionPartitionResolver: setResolver } = require('electron-chrome-extensions'));
  CWS = require('electron-chrome-web-store');
} catch (e) { console.error('extensions unavailable:', e.message); }

const DEFAULT_PART = 'washi-pages';                       // what the toolbar calls the shared page session
const dir = () => path.join(app.getPath('userData'), 'Extensions');
const all = new Map();                                    // session -> ElectronChromeExtensions
const P = { on: true };
let quiet = 0;                                            // adding a tab makes the library call it "activated"; Washi decides what's active
let ui = { createTab: async () => null, selectTab() {}, removeTab() {}, confirm: async () => ({ action: 'deny' }), changed() {} };
const testUnpacked = () => !app.isPackaged && !!process.env.WASHI_TEST_EXT;

if (setResolver) setResolver(p => (p === DEFAULT_PART || !p ? session.defaultSession : session.fromPartition(p)));
const partitionOf = ses => ses === session.defaultSession ? DEFAULT_PART : [...all.keys()].includes(ses) && ses.storagePath ? 'persist:' + path.basename(ses.storagePath) : DEFAULT_PART;

async function enable(ses, { primary = false } = {}) {
  if (!ECE || !CWS || all.has(ses)) return all.get(ses) || null;
  const x = new ECE({
    session: ses,
    createTab: d => ui.createTab(d, ses),
    selectTab: wc => { if (!quiet) ui.selectTab(wc); },        // only when an extension asks (not when a tab is merely added)
    removeTab: wc => ui.removeTab(wc),
    createWindow: async d => { const url = Array.isArray(d.url) ? d.url[0] : d.url; const r = await ui.createTab({ url: url || 'about:blank', active: true }, ses); return r ? r[1] : null; },
    removeWindow: () => {}
  });
  all.set(ses, x);
  x.on('browser-action-popup-created', p => fitPopup(p));
  if (!app.isPackaged && process.env.WASHI_DEBUG_EXT) ses.serviceWorkers.on('console-message', (_, m) => console.error('ext-sw', JSON.stringify(m).slice(0, 3000)));
  if (!app.isPackaged && process.env.WASHI_DEBUG_EXT) setTimeout(() => { try { console.error('ext-pre', JSON.stringify(ses.getPreloadScripts().map(p => [p.type, p.id, require('path').basename(p.filePath)]))); console.error('ext-run', JSON.stringify(ses.serviceWorkers.getAllRunning())); } catch (e) { console.error('ext-dbg', e.message); } }, 6000);
  if (!app.isPackaged && process.env.WASHI_DEBUG_EXT) ses.serviceWorkers.on('running-status-changed', d => console.error('ext-status', JSON.stringify(d)));
  const changed = () => ui.changed();
  ses.extensions.on('extension-loaded', changed); ses.extensions.on('extension-unloaded', changed);
  try {
    await CWS.installChromeWebStore({
      session: ses, extensionsPath: dir(), loadExtensions: true, autoUpdate: primary,
      allowUnpackedExtensions: testUnpacked(),
      beforeInstall: d => (primary ? ui.confirm(d) : Promise.resolve({ action: 'deny' })).then(r => { if (r && r.action === 'allow') setTimeout(() => syncAll(), 400); return r; })
    });
  } catch (e) { console.error('extensions: web store', e.message); }
  return x;
}
/* Extension popups: size them to their page, under their button, on screen. Chromium's "preferred size" signal
   doesn't always arrive (then the popup stays a 25px square, or opens huge and blank), so measure the page ourselves
   the way Chrome sizes popups (up to 800x600), and keep the window inside the screen. */
const { screen } = require('electron');
function placePopup(p) {
  const w = p.browserWindow; if (!w || w.isDestroyed() || !p.parent || p.parent.isDestroyed()) return;
  const b = w.getBounds(), wa = screen.getDisplayMatching(p.parent.getBounds()).workArea;
  const x = Math.max(wa.x + 4, Math.min(b.x, wa.x + wa.width - b.width - 4)), y = Math.max(wa.y + 4, Math.min(b.y, wa.y + wa.height - b.height - 4));
  if (x !== b.x || y !== b.y) w.setBounds({ ...b, x, y });
}
function fitPopup(p) {
  const w = p.browserWindow; if (!w || w.isDestroyed()) return;
  p.on('moved', () => placePopup(p));
  const measure = async tries => {
    if (p.isDestroyed() || w.isDestroyed()) return;
    const [cw, ch] = w.getSize();
    if (cw > 40 && ch > 40 && !p.hidden) { placePopup(p); return; }          // Chromium sized it: just keep it on screen
    try {
      p.setSize({ width: 800, height: 600 }); await new Promise(r => setTimeout(r, 120));
      if (p.isDestroyed() || w.isDestroyed()) return;
      const r = await w.webContents.executeJavaScript(`(() => { const b = document.body, d = document.documentElement; if (!b) return null; const br = b.getBoundingClientRect(), kids = [...b.children].map(e => e.getBoundingClientRect()); const right = Math.max(br.right, ...kids.map(k => k.right)), bottom = Math.max(br.bottom, ...kids.map(k => k.bottom)); const cs = getComputedStyle(b); return { width: Math.ceil(Math.min(right + parseFloat(cs.marginRight || 0), 800)), height: Math.ceil(Math.min(bottom + parseFloat(cs.marginBottom || 0), 600)) }; })()`);
      if (p.isDestroyed()) return;
      if (r && r.width > 30 && r.height > 20) { p.setSize(r); p.updatePosition(); placePopup(p); if (p.hidden) p.show(); }
      else if (tries > 0) setTimeout(() => measure(tries - 1), 300);
    } catch { if (tries > 0) setTimeout(() => measure(tries - 1), 300); }
  };
  w.webContents.once('did-finish-load', () => setTimeout(() => measure(4), 250));
}
/* an extension installed in one space's session also loads in the others */
async function syncAll() {
  for (const ses of all.keys()) { try { await CWS.loadAllExtensions(ses, dir(), { allowUnpacked: testUnpacked() }); } catch {} }
  ui.changed();
}
function list() {
  const ses = session.defaultSession;
  if (!ses.extensions) return [];
  return ses.extensions.getAllExtensions().filter(e => e.manifest && !e.manifest.theme).map(e => {
    const m = e.manifest, opt = (m.options_ui && m.options_ui.page) || m.options_page || null;
    const name = /^__MSG_/.test(m.name || '') ? (m.short_name && !/^__MSG_/.test(m.short_name) ? m.short_name : e.name) : (m.name || e.name);
    return { id: e.id, name: String(name || e.id).slice(0, 80), version: String(m.version || ''), description: /^__MSG_/.test(m.description || '') ? '' : String(m.description || '').slice(0, 160), options: opt ? `chrome-extension://${e.id}/${String(opt).replace(/^\//, '')}` : null, action: !!(m.action || m.browser_action) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
async function remove(id) {
  if (!CWS || typeof id !== 'string' || !/^[a-p]{32}$/.test(id)) return false;
  for (const ses of all.keys()) { try { if (ses.extensions.getExtension(id)) ses.extensions.removeExtension(id); } catch {} }
  try { await CWS.uninstallExtension(id, { session: session.defaultSession, extensionsPath: dir() }); } catch (e) { console.error('extensions: remove', e.message); return false; }
  ui.changed(); return true;
}
const forSession = ses => all.get(ses) || null;
function addTab(wc, win, active) { const x = all.get(wc.session); if (!x) return; quiet++; try { x.addTab(wc, win); if (active && !active.isDestroyed() && active.session === wc.session && active !== wc) x.selectTab(active); } catch {} finally { quiet--; } }
function selectTab(wc) { const x = wc && all.get(wc.session); if (!x) return; quiet++; try { x.selectTab(wc); } catch {} finally { quiet--; } }   // Washi telling it: no echo back
function menuItems(wc, params) { const x = all.get(wc.session); if (!x) return []; try { return x.getContextMenuItems(wc, params) || []; } catch { return []; } }
const handleUI = ses => { if (ECE) try { ECE.handleCRXProtocol(ses); } catch (e) { console.error('extensions: crx protocol', e.message); } };
module.exports = { enable, syncAll, list, remove, forSession, addTab, selectTab, menuItems, handleUI, partitionOf, available: () => !!(ECE && CWS), dir, P, DEFAULT_PART, bind: h => { ui = { ...ui, ...h }; } };
void fs;
