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
let ui = { createTab: async () => null, selectTab() {}, removeTab() {}, confirm: async () => ({ action: 'deny' }), changed() {} };
const testUnpacked = () => !app.isPackaged && !!process.env.WASHI_TEST_EXT;

if (setResolver) setResolver(p => (p === DEFAULT_PART || !p ? session.defaultSession : session.fromPartition(p)));
const partitionOf = ses => ses === session.defaultSession ? DEFAULT_PART : [...all.keys()].includes(ses) && ses.storagePath ? 'persist:' + path.basename(ses.storagePath) : DEFAULT_PART;

async function enable(ses, { primary = false } = {}) {
  if (!ECE || !CWS || all.has(ses)) return all.get(ses) || null;
  const x = new ECE({
    session: ses,
    createTab: d => ui.createTab(d, ses),
    selectTab: wc => ui.selectTab(wc),
    removeTab: wc => ui.removeTab(wc),
    createWindow: async d => { const url = Array.isArray(d.url) ? d.url[0] : d.url; const r = await ui.createTab({ url: url || 'about:blank', active: true }, ses); return r ? r[1] : null; },
    removeWindow: () => {}
  });
  all.set(ses, x);
  if (!app.isPackaged && process.env.WASHI_DEBUG_EXT) ses.serviceWorkers.on('console-message', (_, m) => console.error('ext-sw', JSON.stringify(m).slice(0, 400)));
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
function addTab(wc, win) { const x = all.get(wc.session); if (x) try { x.addTab(wc, win); } catch {} }
function selectTab(wc) { const x = wc && all.get(wc.session); if (x) try { x.selectTab(wc); } catch {} }
function menuItems(wc, params) { const x = all.get(wc.session); if (!x) return []; try { return x.getContextMenuItems(wc, params) || []; } catch { return []; } }
const handleUI = ses => { if (ECE) try { ECE.handleCRXProtocol(ses); } catch (e) { console.error('extensions: crx protocol', e.message); } };
module.exports = { enable, syncAll, list, remove, forSession, addTab, selectTab, menuItems, handleUI, partitionOf, available: () => !!(ECE && CWS), dir, P, DEFAULT_PART, bind: h => { ui = { ...ui, ...h }; } };
void fs;
