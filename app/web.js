'use strict';
/* Everything about how web pages are loaded: user agent, permissions (remembered per site), privacy headers,
   HTTPS-first, dangerous-site checks, content blocking, downloads (with macOS quarantine), and popups. */
const { app, session, dialog, systemPreferences, shell } = require('electron');
const path = require('path'), fs = require('fs');
const { execFile } = require('child_process');
const store = require('./store');
const blocker = require('./blocker');

const P = { gpc: true, askDownload: false, httpsFirst: true, safety: true, blocking: 'standard', clearOnExit: false };
const httpOK = new Set();                 // hosts the user chose to visit over plain http this session
const riskOK = new Set();                 // hosts the user chose to open despite a danger warning this session
const upgraded = new Map();               // webContents id -> the http:// address we upgraded to https
const sessions = new Set();
let ui = { win: () => null, toast: () => {}, downloads: () => {}, onPerm: () => {}, danger: () => {} };

/* ---------- permissions, remembered per site ---------- */
const perms = store.readJSON('site-permissions.json', {});       // origin -> { perm: 'allow' | 'block' }
const savePerms = () => store.writeJSON('site-permissions.json', perms);
const SAFE = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'speaker-selection', 'storage-access', 'top-level-storage-access', 'window-management', 'background-sync', 'persistent-storage']);
const LABEL = { media: 'use your camera or microphone', geolocation: 'know your location', notifications: 'send you notifications', 'clipboard-read': 'see what you copy', midi: 'use MIDI devices', midiSysex: 'control MIDI devices',
  'display-capture': 'record your screen', 'idle-detection': 'know when you\'re away', hid: 'use HID devices', serial: 'use serial ports', usb: 'use USB devices', openExternal: 'open another app' };
const originOf = u => { try { return new URL(u).origin; } catch { return ''; } };
const asking = new Map();
async function decide(wc, perm, details) {
  const origin = originOf(details.requestingUrl || (wc && wc.getURL()) || '');
  if (!origin || origin === 'null') return false;
  const saved = (perms[origin] || {})[perm];
  if (saved) return saved === 'allow';
  const key = origin + '|' + perm;
  if (asking.has(key)) return asking.get(key);                      // one prompt per site and permission at a time
  const p = (async () => {
    let what = LABEL[perm] || perm;
    if (perm === 'media' && details.mediaTypes) what = details.mediaTypes.includes('video') ? (details.mediaTypes.includes('audio') ? 'use your camera and microphone' : 'use your camera') : 'use your microphone';
    const host = new URL(origin).host;
    const r = await dialog.showMessageBox(ui.win(), { type: 'question', message: `${host} wants to ${what}`, detail: 'Washi will remember your choice for this site. You can change it in Settings → Privacy.', buttons: ['Allow', 'Don\'t allow'], defaultId: 1, cancelId: 1 });
    const ok = r.response === 0;
    perms[origin] = { ...(perms[origin] || {}), [perm]: ok ? 'allow' : 'block' }; savePerms(); ui.onPerm();
    if (ok && perm === 'media' && process.platform === 'darwin' && details.mediaTypes) {   // macOS also has to agree
      for (const t of details.mediaTypes) { try { if (!(await systemPreferences.askForMediaAccess(t === 'video' ? 'camera' : 'microphone'))) return false; } catch {} }
    }
    return ok;
  })();
  asking.set(key, p); try { return await p; } finally { asking.delete(key); }
}
const listPerms = () => Object.entries(perms).map(([origin, p]) => ({ origin, perms: p })).sort((a, b) => a.origin.localeCompare(b.origin));
function resetPerm(origin, perm) { if (!perms[origin]) return; if (perm) delete perms[origin][perm]; else delete perms[origin]; if (perms[origin] && !Object.keys(perms[origin]).length) delete perms[origin]; savePerms(); }

/* ---------- address rules ---------- */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|.*\.local|.*\.localhost|.*\.test|.*\.internal|.*\.lan|.*\.home\.arpa)$/i;
const isIP = h => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
function upgradeable(u) { try { const x = new URL(u); return x.protocol === 'http:' && !LOCAL.test(x.hostname) && !isIP(x.hostname) && !httpOK.has(x.hostname); } catch { return false; } }

/* ---------- one request pipeline per session: internal links, dangerous sites, https-first, then blocking ---------- */
function pipeline(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    if (/^https:\/\/washi\.internal\//.test(d.url)) return cb({ cancel: true });       // only ever handled by the main process
    if (d.resourceType === 'mainFrame') {
      if (P.safety && !riskOK.has(hostOf(d.url))) {
        const why = blocker.danger(d.url);
        if (why) { cb({ cancel: true }); if (d.webContents) setImmediate(() => ui.danger(d.webContents, d.url, why)); return; }
      }
      if (P.httpsFirst && upgradeable(d.url)) {
        const to = 'https://' + d.url.slice(7);
        if (d.webContentsId != null) upgraded.set(d.webContentsId, d.url);
        return cb({ redirectURL: to });
      }
      if (d.webContentsId != null) blocker.resetStats(d.webContentsId);
      return cb({});
    }
    if (blocker.onRequest(d, cb)) return;
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    if (P.gpc) { h['Sec-GPC'] = '1'; h['DNT'] = '1'; }
    if (UA.full) { const want = uaFor(d.url); if (h['User-Agent'] !== want && (want === UA.full || /\sElectron\//.test(h['User-Agent'] || ''))) h['User-Agent'] = want; }   // see "who we say we are" below
    cb({ requestHeaders: h });
  });
}
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };

/* ---------- downloads ---------- */
const downloads = store.readJSON('downloads.json', []).slice(0, 100);
let dlSave = null; const saveDl = () => { clearTimeout(dlSave); dlSave = setTimeout(() => store.writeJSON('downloads.json', downloads.slice(0, 100)), 500); };
function quarantine(p, url) {                       // like Chrome: mark downloads so macOS Gatekeeper checks them before they run
  if (process.platform !== 'darwin') return;
  execFile('xattr', ['-p', 'com.apple.quarantine', p], err => {
    if (!err) return;
    execFile('xattr', ['-w', 'com.apple.quarantine', `0081;${Math.floor(Date.now() / 1000).toString(16)};Washi;`, p], () => {});
  });
  void url;
}
function onDownload(_, item) {
  const d = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: item.getFilename(), url: item.getURL(), path: '', state: 'progressing', received: 0, total: item.getTotalBytes(), at: Date.now() };
  if (!P.askDownload) {
    const dir = app.getPath('downloads'); const { name, ext } = path.parse(item.getFilename());
    let p = path.join(dir, name + ext), n = 1;
    while (fs.existsSync(p)) p = path.join(dir, `${name} (${n++})${ext}`);
    item.setSavePath(p);
  } else item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  downloads.unshift(d); live.set(d.id, item); ui.downloads(); saveDl();
  let tick = 0;
  item.on('updated', (__, st) => { d.state = st === 'interrupted' ? 'interrupted' : (item.isPaused() ? 'paused' : 'progressing'); d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.path = item.getSavePath(); const now = Date.now(); if (now - tick > 250) { tick = now; ui.downloads(); } });
  item.once('done', (__, st) => {
    d.state = st; d.received = item.getReceivedBytes(); d.path = item.getSavePath(); d.name = path.basename(d.path || d.name); live.delete(d.id); saveDl(); ui.downloads();
    if (st === 'completed') { quarantine(d.path, d.url); ui.toast({ text: `Downloaded ${d.name}`, reveal: d.path }); }
    else if (st === 'interrupted') ui.toast({ text: `Download failed: ${d.name}` });
  });
}
const live = new Map();
function dlAct(id, a) {
  const d = downloads.find(x => x.id === id); const item = live.get(id);
  if (a === 'cancel' && item) item.cancel();
  else if (a === 'pause' && item) item.pause(); else if (a === 'resume' && item && item.canResume()) item.resume();
  else if (a === 'open' && d && d.path && fs.existsSync(d.path)) shell.openPath(d.path);
  else if (a === 'reveal' && d && d.path) shell.showItemInFolder(d.path);
  else if (a === 'remove') { const i = downloads.findIndex(x => x.id === id); if (i > -1 && !live.has(id)) downloads.splice(i, 1); saveDl(); }
  else if (a === 'clear') { for (let i = downloads.length - 1; i >= 0; i--) if (!live.has(downloads[i].id)) downloads.splice(i, 1); saveDl(); }
  ui.downloads();
}
const listDownloads = () => downloads.map(d => ({ ...d, exists: d.state !== 'completed' || (d.path && fs.existsSync(d.path)) }));

/* ---------- who we say we are ----------
   Everywhere: a plain Chrome identity, so sites that sniff for "Electron" don't break.
   Google sign-in: Google refuses ("This browser or app may not be secure") a browser that looks exactly like Chrome but isn't.
   Sending the honest identity (Washi/x Chrome/x Electron/x) there, in the header AND to the page's own JavaScript, lets sign-in through.
   (Same fix as other Electron browsers, e.g. stablyai/orca #11518 → PR #36519.) */
const UA = { full: '', clean: '' };
const GOOGLE_AUTH = /^(accounts\.google\.com|accounts\.youtube\.com|accounts\.google\.[a-z.]+)$/i;
const TEST_AUTH = new Set((process.env.WASHI_AUTH_HOSTS || '').split(',').filter(Boolean));   // tests only
const googleAuth = u => { try { const x = new URL(u); return (x.protocol === 'https:' && GOOGLE_AUTH.test(x.hostname)) || TEST_AUTH.has(x.host); } catch { return false; } };
const uaFor = u => (googleAuth(u) ? UA.full : UA.clean);
const needsUA = (wc, url) => !!UA.full && !!wc && !wc.isDestroyed() && wc.getUserAgent() !== uaFor(url);
function matchUA(wc, url) {                          // call when a tab starts (or is redirected) to a new page
  if (!UA.full || !wc || wc.isDestroyed()) return;
  const want = uaFor(url);
  if (wc.getUserAgent() !== want) wc.setUserAgent(want);
}

/* ---------- set up a session for web pages (the default one, and each space that keeps its logins separate) ---------- */
function setup(ses) {
  if (sessions.has(ses)) return ses; sessions.add(ses);
  if (!UA.full) {
    const raw = ses.getUserAgent();
    UA.clean = raw.replace(/\s(Electron|bloom-browser|washi|Washi|Bloom)\/\S+/g, '');
    UA.full = /\sWashi\//.test(raw) ? raw : raw.replace(/\sChrome\//, ` Washi/${app.getVersion()} Chrome/`);
  }
  ses.setUserAgent(UA.clean);
  try { ses.setSpellCheckerEnabled(true); } catch {}
  ses.setPermissionRequestHandler((wc, perm, cb, details) => { if (SAFE.has(perm)) return cb(true); decide(wc, perm, details).then(cb, () => cb(false)); });
  ses.setPermissionCheckHandler((wc, perm, origin) => { if (SAFE.has(perm)) return true; return (perms[originOf(origin)] || {})[perm] === 'allow'; });
  ses.setDevicePermissionHandler(d => (perms[originOf(d.origin)] || {})[d.deviceType] === 'allow');
  for (const ev of ['select-hid-device', 'select-serial-port', 'select-usb-device']) ses.on(ev, (e, _d, cb) => { e.preventDefault(); try { cb(''); } catch { try { cb(); } catch {} } });
  pipeline(ses);
  ses.on('will-download', onDownload);
  blocker.cosmetics(require('electron').ipcMain, ses);
  return ses;
}
const pageSession = space => setup(space && space.isolated ? session.fromPartition('persist:space-' + space.id) : session.defaultSession);
async function clearData(o) {
  for (const ses of sessions) {
    if (o.cookies) await ses.clearStorageData().catch(() => {});
    if (o.cache) { await ses.clearCache().catch(() => {}); await ses.clearCodeCaches({}).catch(() => {}); }
  }
}

function configure(p) {
  Object.assign(P, p);
  blocker.setMode(P.blocking);
  try {                                             // Secure DNS (DNS over HTTPS)
    const servers = { cloudflare: ['https://chrome.cloudflare-dns.com/dns-query'], quad9: ['https://dns.quad9.net/dns-query'], google: ['https://dns.google/dns-query'] };
    if (p.dns !== undefined) app.configureHostResolver(p.dns === 'off' ? { secureDnsMode: 'off' } : servers[p.dns] ? { secureDnsMode: 'secure', secureDnsServers: servers[p.dns] } : { secureDnsMode: 'automatic' });
  } catch (e) { console.error('dns', e.message); }
}
module.exports = {
  P, UA, uaFor, googleAuth, matchUA, needsUA, setup, pageSession, configure, clearData, sessions, httpOK, riskOK, upgraded, upgradeable,
  listPerms, resetPerm, listDownloads, dlAct, bind: h => { ui = { ...ui, ...h }; }
};
