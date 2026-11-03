'use strict';
/* Washi: main process. Owns the window, the native page views, and the three interface views
   (shell = desk + top bar, C.sidebar, C.overlay = command bar / sheets / panels / effects). */
const { app, BrowserWindow, WebContentsView, Menu, session, shell, dialog, nativeTheme, clipboard, screen, systemPreferences } = require('electron');

if (!process.argv.includes('--no-sandbox')) app.enableSandbox();   // every renderer runs sandboxed (the flag only exists for the Linux test container, which runs as root)
app.setName('Washi');
if (app.isPackaged) { app.commandLine.removeSwitch('remote-debugging-port'); app.commandLine.removeSwitch('remote-debugging-pipe'); }

const path = require('path');
const fs = require('fs');
const store = require('./app/store');
const proto = require('./app/protocol');
const sec = require('./app/security');
const web = require('./app/web');
const blocker = require('./app/blocker');
const arc = require('./app/arc');
const boost = require('./app/boost');
const reader = require('./app/reader');
const live = require('./app/live');
const bmimport = require('./app/bmimport');
const bmFiles = new Map();                         // other browsers' data found by a scan (the interface only gets keys)
const arcOK = new Set();                          // Arc sidebar files the user picked themselves (besides the usual place)
const os = require('os');
const pages = require('./app/pages');
const keys = require('./app/shortcuts');
const updater = require('./app/updater');
const vault = require('./app/vault');
const autofill = require('./app/autofill');
const exts = require('./app/extensions');

const EDGE = 12, TOP = 38, SB_W = 232, SB_PAD = 16;
const P = { search: 'https://www.google.com/search?q=%s', mode: 'light', autoPip: true, keys: {}, suggest: true };
let uiSes = null, recording = false;
const alive = w => w && !w.isDestroyed();
/* ---------- windows: each one has its own shell, sidebar, overlay and tabs ----------
   C is "the window being handled right now". Everything a window owns is pinned to it: its events, its IPC and its
   timers set C before running, so the code below reads like there's only one window. */
const W = new Map();                                     // window id (kept across launches) → context
const newCtx = wid => ({ wid, win: null, overlay: null, sidebar: null, overlayOpen: false, panelOpen: null, dragging: false, menuOpen: false, fxTimer: null,
  sbDocked: true, sbShown: false, lastIn: 0, lastLayout: null, curSpace: null, tabs: new Map(), panes: { a: null, b: null, focus: 'a' }, peek: null,
  sbClosing: null, sbHideT: null, lastLook: null, switching: false, pollA: null, pollB: null, bmShown: false, bmPoll: null });
let C = newCtx('none'), lastMain = null;
function ctxOf(wc) {
  if (!wc) return null;
  for (const c of W.values()) {
    if (!alive(c.win)) continue;
    if (c.win.webContents === wc || (c.sidebar && c.sidebar.webContents === wc) || (c.overlay && c.overlay.webContents === wc) || (c.peek && c.peek.wc === wc)) return c;
    for (const t of c.tabs.values()) if (t.wc === wc) return c;
  }
  return null;
}
const pin = (c, em) => { const e0 = em.emit; em.emit = function (...a) { C = c; return e0.apply(this, a); }; };
const later = (fn, ms) => { const c = C; return setTimeout(() => { C = c; fn(); }, ms); };
const useMain = () => { if (lastMain && alive(lastMain.win)) C = lastMain; else { const c = [...W.values()].find(x => alive(x.win)); if (c) C = c; } };
const ON = (ch, fn) => sec.on(ch, (e, ...a) => { const c = ctxOf(e.sender); if (c) C = c; else useMain(); return fn(e, ...a); });
const HANDLE = (ch, fn) => sec.handle(ch, (e, ...a) => { const c = ctxOf(e.sender); if (c) C = c; else useMain(); return fn(e, ...a); });
const toUI = (ch, ...a) => { if (alive(C && C.win)) C.win.webContents.send(ch, ...a); };
const toSide = (ch, ...a) => { if (C.sidebar && !C.sidebar.webContents.isDestroyed()) C.sidebar.webContents.send(ch, ...a); };
const toOverlay = (ch, ...a) => { if (C.overlay && !C.overlay.webContents.isDestroyed()) C.overlay.webContents.send(ch, ...a); };
const rr = r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) });
const nav = wc => { const h = wc.navigationHistory; return { canBack: h.canGoBack(), canFwd: h.canGoForward() }; };
const goBack = wc => wc.navigationHistory.goBack();
const goFwd = wc => wc.navigationHistory.goForward();
const token = () => require('crypto').randomBytes(12).toString('hex');
const searchURL = q => P.search.replace('%s', encodeURIComponent(q));
function activeTab() { const s = C.panes[C.panes.focus] || C.panes.a; return s && C.tabs.get(s.id); }

/* ---------- crash log ---------- */
const logCrash = (w, d) => { try { fs.appendFileSync(store.file('crash.log'), new Date().toISOString() + ' ' + w + ' ' + JSON.stringify(d) + '\n'); } catch {} };
process.on('uncaughtException', e => logCrash('main', String(e && e.stack || e)));
app.on('child-process-gone', (_, d) => { if (d.reason !== 'clean-exit') logCrash('child', d); });

/* ---------- notices shown inside a tab (didn't load / not secure / dangerous) ---------- */
function notice(t, kind, url, extra) {
  t.tok = token(); t.failed = url; t.notice = { kind, url };
  const html = kind === 'danger' ? pages.dangerous(url, extra, t.tok) : kind === 'insecure' ? pages.insecure(url, t.tok) : pages.failed(url, extra, t.tok);
  let host = url; try { host = new URL(url).host; } catch {}
  toUI('tab:event', { id: t.id, url, title: host, notice: kind });
  t.wc.loadURL(html).catch(() => {});
}
function internal(t, url) {                    // a button on one of our notices was pressed
  let u; try { u = new URL(url); } catch { return; }
  if (u.searchParams.get('k') !== t.tok || !t.notice) return;              // must carry this tab's one-time token
  const { kind, url: target } = t.notice; t.tok = null;
  const host = (() => { try { return new URL(target).hostname; } catch { return ''; } })();
  const action = u.pathname.slice(1);
  if (action === 'retry') go(t.wc, target).catch(() => {});
  else if (action === 'back') { t.notice = null; if (t.wc.navigationHistory.canGoBack()) goBack(t.wc); else if (t.isScrap) t.win.close(); else toUI('tab:event', { id: t.id, closeMe: true }); }   // nowhere to go back to: close the tab, like Chrome
  else if (action === 'insecure' && kind === 'insecure') { web.httpOK.add(host); go(t.wc, target.replace(/^https:/, 'http:')).catch(() => {}); }
  else if (action === 'proceed' && kind === 'danger') { web.riskOK.add(host); go(t.wc, target).catch(() => {}); }
}
web.bind({ win: () => C.win, toast: f => showFx({ type: 'toast', ...f }), downloads: () => { const l = web.listDownloads(); toUI('dl:update', l); toOverlay('dl:update', l); }, onPerm: () => toOverlay('perms:update', web.listPerms()),
  danger: (wc, url, why) => { const c = ctxOf(wc); if (c) C = c; const t = [...C.tabs.values()].find(x => x.wc === wc) || [...scraps.values()].find(x => x.wc === wc); if (t) notice(t, 'danger', url, why); else if (C.peek && C.peek.wc === wc) wc.loadURL(pages.dangerous(url, why, 'x')); } });
blocker.onStats((id, n) => { for (const c of W.values()) { const t = [...c.tabs.values()].find(x => x.wc.id === id); if (t) { C = c; toUI('tab:event', { id: t.id, blocked: n }); return; } } });

/* ---------- page views ---------- */
const PIP_ON = `(() => { const v = [...document.querySelectorAll('video')].filter(v => !v.paused && v.readyState > 2 && !v.disablePictureInPicture).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!v) return false; if (document.pictureInPictureElement === v) return true; return v.requestPictureInPicture().then(() => true, () => false); })()`;
const PIP_OFF = `(document.pictureInPictureElement ? document.exitPictureInPicture().then(() => true, () => false) : false)`;
const tabWaiters = [];
function ensureTab(id, url, space) {
  if (C.tabs.has(id)) return C.tabs.get(id);
  const ses = web.pageSession(space);                        // the tab's own space decides its login jar (null = the shared one)
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: ses, safeDialogs: true, spellcheck: true } });
  try { view.setBorderRadius(10); } catch {}
  const t = { id, view, wc: view.webContents, rect: null, visible: false, lastInput: 0, playing: false };
  C.tabs.set(id, t);
  view.setVisible(false);
  C.win.contentView.addChildView(view, 0);
  hook(t);
  { const at = activeTab(); exts.addTab(t.wc, C.win, at && at.wc); }
  const w = tabWaiters.shift(); if (w) w(t);                      // an extension asked for this tab (chrome.tabs.create)
  if (url) go(t.wc, url).catch(() => {});
  return t;
}
const OK_SCHEMES = new Set(['http:', 'https:', 'about:', 'data:', 'blob:', 'file:', 'view-source:', 'chrome:', 'devtools:', 'chrome-extension:']);
const askedApps = new Map();
async function external(url, wc) {             // links to other apps (mailto:, zoommtg:, slack:…) ask before leaving the browser
  let u; try { u = new URL(url); } catch { return; }
  if (u.protocol === 'javascript:') return;
  const from = (() => { try { return new URL(wc.getURL()).host; } catch { return 'This page'; } })(), key = from + '|' + u.protocol;
  if (!askedApps.has(key)) {
    const r = await dialog.showMessageBox(C.win, { type: 'question', message: `Open this link in another app?`, detail: `${from} wants to open a “${u.protocol.slice(0, -1)}” link:\n${url.slice(0, 160)}`, buttons: ['Open', 'Cancel'], defaultId: 0, cancelId: 1, checkboxLabel: `Always allow ${from} to open these links`, checkboxChecked: false });
    if (r.response !== 0) return; if (r.checkboxChecked) askedApps.set(key, true);
  }
  shell.openExternal(url).catch(() => {});
}
function go(wc, url) { web.matchUA(wc, url); return wc.loadURL(url); }   // load a web address with the right identity for it
function hook(t) {
  const { wc, id } = t, c = C; t.ctx = c; pin(c, wc);
  const send = p => toUI('tab:event', { id, ...p });
  wc.on('render-process-gone', (_, d) => { logCrash('tab', d); if (d.reason !== 'clean-exit' && !wc.isDestroyed()) { send({ crashed: true }); later(() => { try { wc.reload(); } catch {} }, 300); } });
  wc.on('input-event', (_, i) => { if (/^(mouseDown|keyDown|rawKeyDown|touchStart|gestureTap)$/.test(i.type)) t.lastInput = Date.now(); });
  wc.on('before-input-event', switchKeys);
  boost.watch(wc); wc.on('did-navigate', (_, url) => send({ boosted: boost.isOn(url) }));
  wc.on('page-title-updated', (_, title) => { if (!pages.isNotice(wc.getURL())) send({ title }); });
  wc.on('page-favicon-updated', (_, favs) => { if (favs[0] && /^(https?|data):/.test(favs[0])) send({ fav: favs[0] }); });
  wc.on('did-start-loading', () => send({ loading: true }));
  wc.on('did-stop-loading', () => {
    send({ loading: false, ...(pages.isNotice(wc.getURL()) ? {} : { url: wc.getURL() }), ...nav(wc) });
    if (/^https?:/.test(wc.getURL())) reader.able(wc).then(a => { if (!wc.isDestroyed()) send({ readable: a }); });   // Reader mode offered on articles
  });
  wc.on('did-navigate', (_, url) => { if (!pages.isNotice(url)) { t.failed = null; t.notice = null; web.upgraded.delete(wc.id); } send({ ...(pages.isNotice(url) ? {} : { url, notice: null }), ...nav(wc), blocked: 0 }); });
  wc.on('did-navigate-in-page', (_, url, isMain) => { if (isMain) { send({ url, ...nav(wc) }); reader.isOn(wc).then(on => { if (!on) later(() => reader.able(wc).then(a => { if (!wc.isDestroyed()) send({ readable: a }); }), 700); }); } });
  wc.on('did-start-navigation', d => { if (d.isMainFrame && !d.isSameDocument) send({ reading: false, readable: false, media: null }); });
  wc.on('media-started-playing', () => { t.playing = true; send({ audible: true }); mediaInfo(t, send); });
  wc.on('did-navigate', (_, url) => { let h = ''; try { h = new URL(url).host.replace(/^www\./, ''); } catch {} const m = (P.muteSites || []).includes(h); if (m !== t.siteMuted) { t.siteMuted = m; wc.setAudioMuted(m); send({ muted: m }); } });   // "Mute this site" covers every tab on it
  wc.on('media-paused', () => { t.playing = false; send({ audible: false }); later(() => mediaInfo(t, send), 150); });
  wc.on('page-title-updated', () => { if (t.playing) later(() => mediaInfo(t, send), 400); });   // the next song
  wc.on('audio-state-changed', e => send({ audible: !!e.audible }));
  wc.on('found-in-page', (_, r) => { if (C.panelOpen === 'find' && activeTab() === t) toOverlay('find:result', { active: r.activeMatchOrdinal, total: r.matches }); });
  wc.on('zoom-changed', () => later(() => showZoom(wc), 0));
  wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) web.matchUA(wc, d.url); });
  wc.on('will-redirect', (d) => { if (d.isMainFrame && web.needsUA(wc, d.url) && d.method !== 'POST') { d.preventDefault(); go(wc, d.url).catch(() => {}); } });
  wc.on('will-navigate', (e, url) => {
    web.matchUA(wc, url);
    if (pages.isInternal(url)) { e.preventDefault(); internal(t, url); return; }
    let p = ''; try { p = new URL(url).protocol; } catch {}
    if (p && !OK_SCHEMES.has(p)) { e.preventDefault(); external(url, wc); }
  });
  wc.on('did-fail-load', (_, code, desc, url, isMain) => {
    if (!isMain || code === -3 || code === 0) return;
    if (code === -20 && web.isDangerStop(url)) return;   // stopped because it's dangerous: the warning page is on its way
    const from = web.upgraded.get(wc.id);
    if (from && url.startsWith('https://') && url.slice(8) === from.slice(7) && code <= -100 && code > -400) { web.upgraded.delete(wc.id); return notice(t, 'insecure', from); }   // https-first didn't work for this site
    notice(t, 'failed', url, desc.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()));
  });
  wc.setWindowOpenHandler(({ url, disposition, features }) => {
    C = c;
    let p = ''; try { p = new URL(url).protocol; } catch {}
    if (p && !OK_SCHEMES.has(p)) { external(url, wc); return { action: 'deny' }; }
    const gesture = Date.now() - t.lastInput < 1500;
    if (disposition === 'new-window' && features) {                         // real popups (sign-in windows and such)
      if (!gesture) { blockedPopup(t, url); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: { parent: C.win, width: 520, height: 680, webPreferences: { sandbox: true, contextIsolation: true } } };
    }
    if (!gesture && disposition !== 'background-tab') { blockedPopup(t, url); return { action: 'deny' }; }
    if (disposition === 'new-window') { openPeek(url); return { action: 'deny' }; }      // shift-click: peek at it
    toUI('tab:openRequest', { url, from: id, bg: disposition === 'background-tab' });
    return { action: 'deny' };
  });
  wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape' && C.panelOpen === 'find') { e.preventDefault(); closeOverlay(); } });
  wc.on('context-menu', (_, p) => {
    const open = (url, bg) => toUI('tab:openRequest', { url, from: id, bg });
    const m = [];
    if (p.misspelledWord) { for (const s of p.dictionarySuggestions.slice(0, 5)) m.push({ label: s, click: () => wc.replaceMisspelling(s) }); if (m.length) m.push({ type: 'separator' }); m.push({ label: 'Add to Dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' }); }
    if (p.linkURL) m.push({ label: 'Open Link in New Tab', click: () => open(p.linkURL, true) }, { label: 'Peek at Link', click: () => openPeek(p.linkURL) }, { label: 'Open Link in Split View', click: () => toUI('tab:openRequest', { url: p.linkURL, from: id, split: true }) }, { label: 'Copy Link', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.mediaType === 'image') m.push({ label: 'Open Image in New Tab', click: () => open(p.srcURL, true) }, { label: 'Copy Image', click: () => wc.copyImageAt(p.x, p.y) }, { label: 'Save Image…', click: () => wc.downloadURL(p.srcURL) }, { type: 'separator' });
    if (p.mediaType === 'video') m.push({ label: 'Picture in Picture', click: () => wc.executeJavaScript(PIP_ON, true).catch(() => {}) }, { type: 'separator' });
    if (p.isEditable) m.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }, { type: 'separator' });
    else if (p.selectionText) {
      const s = p.selectionText.trim().replace(/\s+/g, ' ');
      m.push({ role: 'copy' }, { label: `Search for “${s.length > 24 ? s.slice(0, 24) + '…' : s}”`, click: () => open(searchURL(s)) }, { type: 'separator' });
    }
    const xm = exts.menuItems(wc, p); if (xm.length) m.push(...xm, { type: 'separator' });   // extensions' own menu items
    const n = nav(wc);
    m.push({ label: 'Back', enabled: n.canBack, click: () => goBack(wc) }, { label: 'Forward', enabled: n.canFwd, click: () => goFwd(wc) }, { label: 'Reload', click: () => reloadTab(t) }, { type: 'separator' },
      { label: 'Print…', click: () => wc.print({}, () => {}) }, { label: 'View Page Source', click: () => open('view-source:' + wc.getURL()) }, { label: 'Inspect Element', click: () => wc.inspectElement(p.x, p.y) });
    C.menuOpen = true; const mc = C; Menu.buildFromTemplate(m).popup({ window: C.win, callback: () => { C = mc; C.menuOpen = false; } });
  });
}
function reloadTab(t) { if (t.notice) go(t.wc, t.notice.url).catch(() => {}); else t.wc.reload(); }
let popupToast = 0;
function blockedPopup(t, url) {
  toUI('tab:event', { id: t.id, popupBlocked: url });
  if (Date.now() - popupToast > 4000) { popupToast = Date.now(); let h = ''; try { h = new URL(t.wc.getURL()).host; } catch {} showFx({ type: 'toast', text: `Blocked a pop-up${h ? ' from ' + h : ''}`, action: { label: 'Open it', cmd: 'openUrl', url } }); }
}
let zoomT = 0;
function showZoom(wc) { const z = Math.round(wc.getZoomFactor() * 100); if (Date.now() - zoomT < 60) return; zoomT = Date.now(); showFx({ type: 'toast', text: `Zoom ${z}%`, short: true }); }

/* Page views snap to their rect: one setBounds per layout change. The shell animates the paper frames around them. */
const setRect = (t, r) => { t.rect = rr(r); t.view.setBounds(t.rect); };
function applyPanes() {
  const want = new Map();
  for (const k of ['a', 'b']) { const s = C.panes[k]; if (s && C.tabs.has(s.id)) want.set(s.id, s); }
  for (const [id, t] of C.tabs) {
    const s = want.get(id);
    if (!s) {
      if (t.visible) { t.view.setVisible(false); t.visible = false; if (P.autoPip && t.playing) t.wc.executeJavaScript(PIP_ON, true).then(r => { t.pip = !!r; }).catch(() => {}); }   // keep watching in a floating window
      continue;
    }
    const to = rr(s.rect);
    if (!t.rect || t.rect.x !== to.x || t.rect.y !== to.y || t.rect.width !== to.width || t.rect.height !== to.height) setRect(t, to);
    const vis = !s.hide;
    if (t.visible !== vis) { t.view.setVisible(vis); t.visible = vis; if (vis && t.pip) { t.pip = false; t.wc.executeJavaScript(PIP_OFF, true).catch(() => {}); } }
  }
}
function focusPage() {
  if (C.overlayOpen) return;
  const t = activeTab();
  if (t) t.wc.focus(); else if (alive(C && C.win)) C.win.webContents.focus();
}

HANDLE('emoji:panel', () => {                      // the Mac's own emoji picker (types into whatever has focus)
  try { if (app.isEmojiPanelSupported()) { app.showEmojiPanel(); return true; } } catch {} return false;
});
/* Reader mode for a tab: on (with the look), off, or restyle while on */
HANDLE('reader:set', async (_, id, on, look) => {
  const t = C.tabs.get(id); if (!t || t.wc.isDestroyed()) return { ok: false };
  if (!on) { await reader.hide(t.wc); toUI('tab:event', { id, reading: false }); return { ok: true, on: false }; }
  const r = await reader.show(t.wc, look); toUI('tab:event', { id, reading: !!r.ok }); return { ...r, on: !!r.ok };
});
HANDLE('tab:ensure', (_, id, url, space) => { ensureTab(id, url, space); return true; });
HANDLE('panes:set', (_, p, fp) => {
  const before = activeTab(); C.panes = p; if (p.space) C.curSpace = p.space; applyPanes();
  if (C.panelOpen === 'find' && activeTab() !== before) closeOverlay();
  vaultFollow();
  const at = activeTab(); if (at) { exts.selectTab(at.wc, C.win); toUI('ext:tab', at.wc.id); }   // the extension buttons act on this window's tab (not whichever window had focus last)
  if (fp) focusPage(); return true;
});
ON('tab:close', (_, id) => {
  const t = C.tabs.get(id); if (!t) return;
  C.tabs.delete(id); thumbs.delete(id);
  try { C.win.contentView.removeChildView(t.view); } catch {}
  try { t.wc.close(); } catch {}
});
ON('tab:nav', (_, id, url) => { const t = C.tabs.get(id); if (t) { t.notice = null; go(t.wc, url).catch(() => {}); } });
ON('tab:act', (_, id, a) => tabAct(C.tabs.get(id), a));
/* ---------- Now playing: what a tab is playing (the page's media session if it has one), and play/pause from the sidebar ---------- */
const MEDIA_INFO = `(() => { const m = navigator.mediaSession && navigator.mediaSession.metadata, all = [...document.querySelectorAll('video,audio')], v = all.find(e => !e.paused) || all.find(e => e.currentTime > 0) || all[0];
  if (!v && !m) return null; const art = m && m.artwork && m.artwork.length ? String(m.artwork[m.artwork.length - 1].src || '') : '';
  return { title: String(m && m.title || '').slice(0, 140), artist: String(m && (m.artist || m.album) || '').slice(0, 140), art: /^https?:/.test(art) ? art.slice(0, 2000) : '', playing: !!(v && !v.paused), video: !!(v && v.tagName === 'VIDEO') }; })()`;
function mediaInfo(t, send) { const wc = t.wc; if (!wc || wc.isDestroyed()) return; wc.executeJavaScript(MEDIA_INFO).then(m => { if (!wc.isDestroyed()) send({ media: m ? { ...m, playing: m.playing || !!t.playing } : (t.playing ? { title: '', artist: '', art: '', playing: true } : null) }); }).catch(() => {}); }
const MEDIA_TOGGLE = `(() => { const all = [...document.querySelectorAll('video,audio')], p = all.find(e => !e.paused); if (p) { p.pause(); return 'paused'; } const v = all.find(e => e.currentTime > 0) || all[0]; if (v) { v.play(); return 'playing'; } return 'none'; })()`;
async function mediaToggle(t) {
  const wc = t.wc; if (!wc || wc.isDestroyed()) return;
  let r = await wc.executeJavaScript(MEDIA_TOGGLE, true).catch(() => 'none');
  if (r === 'none') for (const f of wc.mainFrame.framesInSubtree) { if (f === wc.mainFrame) continue; r = await f.executeJavaScript(MEDIA_TOGGLE, true).catch(() => 'none'); if (r !== 'none') break; }   // a player in a frame
}
function tabAct(t, a) {
  if (!t) return; const wc = t.wc;
  if (a === 'back') goBack(wc); else if (a === 'forward') goFwd(wc);
  else if (a === 'reload') reloadTab(t); else if (a === 'hardreload') wc.reloadIgnoringCache();
  else if (a === 'stop') wc.stop(); else if (a === 'devtools') wc.toggleDevTools();
  else if (a === 'mute') { wc.setAudioMuted(!wc.isAudioMuted()); toUI('tab:event', { id: t.id, muted: wc.isAudioMuted() }); }
  else if (a === 'pip') wc.executeJavaScript(`document.pictureInPictureElement ? (document.exitPictureInPicture(), 'off') : ${PIP_ON}`, true).then(r => { if (r === false) showFx({ type: 'toast', text: 'No playing video on this page', short: true }); }).catch(() => {});
  else if (a === 'print') wc.print({}, () => {});
  else if (a === 'mediaToggle') mediaToggle(t);
  else if (a === 'zoomin' || a === 'zoomout' || a === 'zoomreset') { const steps = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5], z = wc.getZoomFactor(); const i = steps.findIndex(s => s >= z - .001); wc.setZoomFactor(a === 'zoomreset' ? 1 : a === 'zoomin' ? steps[Math.min(steps.length - 1, (steps[i] > z + .001 ? i : i + 1))] : steps[Math.max(0, i - 1)]); showZoom(wc); }
}
ON('copy', (_, s) => clipboard.writeText(String(s)));
ON('reveal', (_, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });
/* ---------- what's saved: each window's own tabs and folders, plus what all windows share ----------
   Shared (prefs, the list of spaces, archive, closed tabs, bookmarks) is merged key by key: a window only sends the
   keys it changed, and the others are told about them. History is kept here and changed by small steps. */
let shared = null; const known = new Map();             // window id → { key: JSON it last sent or was told }
const sharedNow = () => { if (!shared) { try { shared = JSON.parse(store.read('shared.json') || 'null'); } catch {} } return shared; };
HANDLE('state:load', () => {
  const wid = C.wid, sh = sharedNow();
  known.set(wid, Object.fromEntries(Object.entries(sh || {}).map(([k, v]) => [k, JSON.stringify(v)])));
  return { win: store.read(`win-${wid}.json`), shared: sh ? JSON.stringify(sh) : null, legacy: !sh ? store.read('state.json') : null, hist: JSON.stringify(histNow()), wid, windows: W.size };
});
ON('state:save', (_, w, sh) => {
  if (typeof w === 'string' && w.length < 20e6) store.writeSoon(`win-${C.wid}.json`, w);
  let o; try { o = JSON.parse(sh); } catch { return; }
  if (!o || typeof o !== 'object') return;
  const mine = known.get(C.wid) || {}, changed = {};
  for (const k of ['prefs', 'spaces', 'closed', 'archive', 'bookmarks']) {
    if (!(k in o)) continue; const str = JSON.stringify(o[k]);
    if (str !== mine[k]) { mine[k] = str; changed[k] = o[k]; }
  }
  known.set(C.wid, mine);
  if (!Object.keys(changed).length) return;
  shared = { ...(sharedNow() || {}), ...changed }; store.writeSoon('shared.json', JSON.stringify(shared));
  const from = C;
  for (const c of W.values()) if (c !== from && alive(c.win)) { const k = known.get(c.wid) || {}; for (const x in changed) k[x] = JSON.stringify(changed[x]); known.set(c.wid, k); c.win.webContents.send('shared:update', changed); }
});
let HIST = null, histT = null;
function histNow() {
  if (!HIST) { try { HIST = JSON.parse(store.read('history.json') || '[]'); } catch { HIST = []; } if (!Array.isArray(HIST)) HIST = []; }
  return HIST;
}
/* history from another browser joins yours: each page once (keeping the newest visit), newest first */
function histMerge(have, add) {
  const by = new Map(); for (const h of have) if (h && h.url) by.set(h.url, h);
  for (const h of add) { if (!h || typeof h.url !== 'string' || !/^https?:/i.test(h.url)) continue; const o = by.get(h.url); if (!o) by.set(h.url, { url: h.url, title: String(h.title || '').slice(0, 300), t: +h.t || 0 }); else if ((+h.t || 0) > (o.t || 0)) by.set(h.url, { ...o, t: +h.t, title: o.title || h.title }); }
  return [...by.values()].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 3000);
}
function histApply(op) {
  const H = histNow();
  if (op.t === 'add' && op.e && op.e.url) { HIST = [op.e, ...H.filter(h => h.url !== op.e.url)].slice(0, 3000); }
  else if (op.t === 'upd') { const h = H.find(x => x.url === op.url); if (h) { if (op.title !== undefined) h.title = op.title; if (op.fav !== undefined) h.fav = op.fav; } }
  else if (op.t === 'del') HIST = H.filter(h => h.url !== op.url);
  else if (op.t === 'clear') HIST = [];
  else if (op.t === 'set' && Array.isArray(op.list)) HIST = op.list.slice(0, 3000);
  else if (op.t === 'merge' && Array.isArray(op.list)) HIST = histMerge(H, op.list);
}
ON('hist:op', (_, op) => {
  if (!op || typeof op !== 'object') return;
  histApply(op);
  clearTimeout(histT); histT = setTimeout(() => store.writeSoon('history.json', JSON.stringify(HIST)), 1000);
  const from = C; for (const c of W.values()) if (c !== from && alive(c.win)) c.win.webContents.send('hist:op', op);
});
ON('menu:popup', (_, tpl, pos) => {
  const mc = C; if (!alive(C && C.win) || !Array.isArray(tpl)) return;
  const wire = items => items.map(i => i.type === 'separator' ? i : i.submenu ? { label: String(i.label), submenu: wire(i.submenu) } : { label: String(i.label), type: i.checked !== undefined ? 'checkbox' : 'normal', checked: !!i.checked, enabled: i.enabled !== false, click: () => { C = mc; toUI('menu:click', i.id); } });
  C.menuOpen = true;
  const at = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? { x: Math.round(pos.x), y: Math.round(pos.y) } : {};
  Menu.buildFromTemplate(wire(tpl)).popup({ window: C.win, ...at, callback: () => { C = mc; C.menuOpen = false; if (C.sbShown) sbLeaveSoon(350); } });
});

/* ---------- sidebar view: docked, or floating and revealed by hovering the left edge ---------- */
/* Floating: the sidebar view always sits in place, slid off to the left so only a thin strip of it stays over the
   desk edge. Moving a view never repaints it, so the sheet is ready to slide in the instant the pointer touches the strip.
   The C.sidebar page itself reports pointer enter/leave (no polling). */
const sbW = () => Math.max(200, Math.min(380, Math.round(C.sbW || SB_W)));   // you can drag the docked sidebar wider or narrower
const sbFW = () => sbW() + SB_PAD;
const sbTop = () => C.focus ? 0 : TOP;                  // Focus mode: no top bar, the floating sidebar runs the full height
function sbBounds() {
  const T = sbTop(), [, h] = C.win.getContentSize(), H = Math.max(0, h - T);
  if (C.sbDocked) return { x: 0, y: T, width: sbW(), height: H };
  return { x: C.sbShown || C.sbClosing ? 0 : EDGE - sbFW(), y: T, width: sbFW(), height: H };
}
function applySidebar() { if (!alive(C && C.win) || !C.sidebar) return; C.sidebar.setBounds(sbBounds()); C.sidebar.setVisible(true); }
function sbMode() { toSide('sb:mode', { docked: C.sbDocked, open: C.sbDocked || C.sbShown, top: sbTop() }); toUI('cmd', C.sbShown ? 'edge:off' : 'edge:on'); }
function showSb() {
  clearTimeout(C.sbHideT); if (C.sbShown) return;
  C.sbShown = true; clearTimeout(C.sbClosing); C.sbClosing = null; applySidebar(); sbMode();
}
function hideSb() {
  if (!C.sbShown) return; C.sbShown = false; sbMode();
  clearTimeout(C.sbClosing); C.sbClosing = later(() => { C.sbClosing = null; if (!C.sbShown && !C.sbDocked) applySidebar(); }, 190);   // after the slide-out
}
function pointerInSb() {
  if (!alive(C && C.win)) return false;
  const p = screen.getCursorScreenPoint(), b = C.win.getContentBounds(), x = p.x - b.x, y = p.y - b.y;
  return x >= -2 && x < sbFW() && y >= sbTop() - 4 && y < b.height + 2;
}
function sbLeaveSoon(ms = 200) { clearTimeout(C.sbHideT); C.sbHideT = later(() => { if (!C.dragging && !C.menuOpen && !pointerInSb()) hideSb(); }, ms); }
ON('sb:hover', (_, inside) => {
  if (C.sbDocked) return;
  if (inside) { if (C.sbShown || C.win.isFocused()) showSb(); else sbMode(); }   // not now: the sidebar takes back its head start
  else if (C.sbShown && !C.dragging && !C.menuOpen) sbLeaveSoon();
});
HANDLE('side:set', (_, m) => {
  if (Number.isFinite(m.w)) C.sbW = m.w;
  if (m.resize) { applySidebar(); return true; }                     // just the width, while you drag its edge
  C.sbDocked = !!m.docked; C.sbShown = false; applySidebar(); sbMode(); return true;
});
/* ---------- Focus mode: the page gets the whole window. Pointing at the top edge brings the top bar back (the page
   moves down for it); moving away puts it away again. The traffic lights hide with the top bar. ---------- */
function focusLights(c) { if (process.platform === 'darwin' && alive(c.win)) try { c.win.setWindowButtonVisibility(!c.focus || !!c.focusPeek); } catch {} }
ON('focus:set', (_, d) => {
  const c = C; c.focus = !!(d && d.on); c.focusPeek = false; clearInterval(c.focusPoll); c.focusPoll = null;
  focusLights(c); applySidebar(); sbMode();
  if (!c.focus) return;
  let away = 0;
  c.focusPoll = setInterval(() => {
    if (!c.focus || !alive(c.win)) { clearInterval(c.focusPoll); return; }
    if (!c.win.isFocused() || c.overlayOpen || c.menuOpen || c.dragging) { away = 0; return; }
    const p = screen.getCursorScreenPoint(), b = c.win.getContentBounds(), x = p.x - b.x, y = p.y - b.y, inside = x >= 0 && x < b.width;
    if (!c.focusPeek) { if (inside && y >= -1 && y <= 5) { c.focusPeek = true; away = 0; focusLights(c); C = c; toUI('focus:peek', true); } return; }
    C = c; if ((inside && y >= -6 && y < TOP + 14) || (c.bmShown && pointerNearBar())) { away = 0; return; }   // on the top bar, or on the bookmarks bar it brought out
    if ((away += 120) >= 360) { if (c.bmShown) bmHide(); c.focusPeek = false; focusLights(c); C = c; toUI('focus:peek', false); }
  }, 120);
});
ON('sb:state', (_, s) => { C.lastLook = { theme: s.theme, pal: s.pal }; toSide('sb:state', s); });
ON('sb:fx', (_, f) => toSide('sb:fx', f));
ON('sb:ready', () => { sbMode(); toUI('sb:ready'); });
ON('sb:intent', (_, m) => toUI('sb:intent', m));
ON('layout:info', (_, l) => { C.lastLayout = l; if (C.panelOpen === 'find') placeFind(); });

/* ---------- drag a tab out of the sidebar to split ---------- */
ON('drag:msg', (_, m) => {
  if (!C.overlay || C.overlayOpen) return;
  if (m.type === 'start') { vaultYield(); bmHide(true); C.dragging = true; clearTimeout(C.fxTimer); fitOverlay(); C.overlay.setVisible(true); toOverlay('overlay:drag', { ...m, layout: C.lastLayout }); }
  else if (m.type === 'move') toOverlay('overlay:drag', m);
  else if (m.type === 'end') {
    C.dragging = false; toOverlay('overlay:drag', { type: 'end' }); if (C.sbShown) sbLeaveSoon(350);
    later(() => { if (!C.dragging && !C.overlayOpen) C.overlay.setVisible(false); }, 700);
    toUI('sb:intent', { type: 'dropTab', id: m.id, x: m.x, y: m.y, cancel: !!m.cancel });
  }
});

/* ---------- overlay: command bar, sheets, panels (find, shield), peek, effects ---------- */
function fitOverlay() { const [w, h] = C.win.getContentSize(); C.overlay.setBounds({ x: 0, y: 0, width: w, height: h }); }
/* ---------- Ctrl-Tab: flip through recent tabs. Works wherever the keyboard is (a page or Washi's own views). ---------- */
function switchKeys(e, i) {
  if (i.type === 'keyDown' && i.key === 'Tab' && i.control && !i.meta && !i.alt) {
    /* Not preventDefault: Chromium drops every key-up after a key the browser swallowed, and we need Ctrl's key-up to
       know when to switch. Pages have no default action for Ctrl-Tab, so letting it through is harmless. */
    if (!C.overlayOpen && !C.dragging) { C.switching = true; toUI('cmd', i.shift ? 'switch:prev' : 'switch:next'); }
    return;
  }
  if (!C.switching) return;
  if (i.type === 'keyUp' && (i.key === 'Control' || !i.control)) { C.switching = false; toUI('cmd', 'switch:commit'); }
  else if (i.type === 'keyDown' && i.key === 'Escape') { e.preventDefault(); C.switching = false; toUI('cmd', 'switch:cancel'); }
}
/* tab peek: a polaroid of a tab beside the sidebar while you rest on it (drawn by the overlay, which never takes focus here) */
const thumbs = new Map();                                // tab id -> { at, img }
let peekSeq = 0;
ON('tab:peek', async (_, d) => {
  const my = ++peekSeq;
  if (!d || !d.id) { if (C.tabPeekOn) { C.tabPeekOn = false; if (!C.overlayOpen && !C.dragging && !C.bmShown && Date.now() >= (C.toastUntil || 0)) { toOverlay('overlay:fx', { type: 'tabpeekOff' }); later(() => { if (!C.tabPeekOn && !C.overlayOpen && !C.bmShown && Date.now() >= (C.toastUntil || 0)) C.overlay.setVisible(false); }, 140); } } return; }
  if (C.overlayOpen || C.dragging || C.bmShown || !C.overlay || Date.now() < (C.toastUntil || 0) || !alive(C.win)) return;
  const t = C.tabs.get(d.id); let img = null;
  if (t && !t.wc.isDestroyed() && !t.wc.isLoading()) {
    const c = thumbs.get(d.id);
    if (c && Date.now() - c.at < 20000) img = c.img;
    else { try { const shot = await t.wc.capturePage(); if (!shot.isEmpty()) { img = shot.resize({ width: 520 }).toJPEG(78).toString('base64'); thumbs.set(d.id, { at: Date.now(), img }); } } catch {} }
  }
  if (my !== peekSeq) return;                            // you moved on meanwhile
  const sb = C.sidebar ? C.sidebar.getBounds() : { x: 0, width: 0 }, [W, H] = C.win.getContentSize();
  const w = 288, h = img ? 252 : 132, x = Math.min(W - w - 8, Math.max(0, sb.x) + sb.width + 6), y = Math.max(TOP + 4, Math.min(H - h - 8, Math.round(d.y + d.h / 2 - 40)));
  clearTimeout(C.fxTimer); C.tabPeekOn = true;
  C.overlay.setBounds(rr({ x, y, width: w, height: h })); C.overlay.setVisible(true);
  toOverlay('overlay:fx', { type: 'tabpeek', img: img ? 'data:image/jpeg;base64,' + img : null, title: String(d.title || '').slice(0, 200), url: String(d.url || '').slice(0, 500), fav: d.fav || null, pal: d.pal, theme: d.theme, arrowY: Math.round(d.y + d.h / 2 - y) });
});
/* an update is downloaded: a postcard in the window you're using offers to restart (Settings › Help: or just install it
   when you quit). Waits for a moment when nothing else is open; "Later" doesn't ask again for that version. */
let updLater = null, updT = 0;
function offerUpdate(s, tries = 0) {
  clearTimeout(updT);
  if (!s || s.status !== 'ready' || updLater === s.version || P.updates === 'quiet') return;
  const fw = BrowserWindow.getFocusedWindow(), c = (fw && [...W.values()].find(x => x.win === fw)) || (lastMain && alive(lastMain.win) ? lastMain : null);
  if (!c || c.overlayOpen || c.dragging || recording || (c.win && !c.win.isFocused())) { if (tries < 400) updT = later(() => offerUpdate(s, tries + 1), 3000); return; }   // when you're back, and not in the middle of something
  C = c; toUI('update:card', { version: s.version, notes: s.notes || '' });
}
function showFx(f) {
  C.tabPeekOn = false; C.coachOn = false;
  if (f.type === 'switchEnd') { if (!C.overlayOpen && !C.dragging && C.overlay) { toOverlay('overlay:fx', f); C.overlay.setVisible(false); } return; }
  if (C.overlayOpen || C.dragging || !C.overlay || !alive(C && C.win)) return;
  if (C.bmShown) bmHide();
  const [w, h] = C.win.getContentSize();
  C.overlay.setBounds(f.type === 'toast' ? { x: Math.round((w - 520) / 2), y: h - 100, width: 520, height: 88 } : { x: 0, y: 0, width: w, height: h });
  C.overlay.setVisible(true);
  toOverlay('overlay:fx', f);
  clearTimeout(C.fxTimer);
  if (f.type === 'switch') return;                          // stays up until Ctrl is let go
  const ms = f.type === 'toast' ? (f.short ? 1600 : f.action || f.reveal ? 6000 : 4200) : 1000;
  C.toastUntil = f.type === 'toast' ? Date.now() + ms : 0;
  C.fxTimer = later(() => { C.toastUntil = 0; if (!C.overlayOpen && !C.dragging) C.overlay.setVisible(false); }, ms);
}
ON('toast:act', (_, a) => { clearTimeout(C.fxTimer); C.toastUntil = 0; C.overlay.setVisible(false); if (a && a.cmd === 'openUrl' && /^https?:/.test(a.url)) toUI('tab:openRequest', { url: a.url }); else if (a && a.cmd === 'update:install') updater.install(); else if (a && a.cmd === 'reveal' && a.path && fs.existsSync(a.path)) shell.showItemInFolder(a.path); else if (a && a.cmd === 'snap:save') snapSave(); else if (a && typeof a.cmd === 'string') toUI('cmd', a.cmd); });
function closeOverlay() {
  if (C.panelOpen === 'find') { const t = activeTab(); if (t) t.wc.stopFindInPage('keepSelection'); }
  const pw = C.panelOpen === 'pwmenu' ? C.pwWc : null, pk = C.pkResolve; C.pkResolve = null; C.pwSave = null;
  if (pk) pk({ act: 'cancel' });
  if (pw) { C.panelOpen = null; if (!pw.isDestroyed()) autofill.hideMenu(pw); }
  if (C.peek) closePeek(true);
  C.overlayOpen = false; C.panelOpen = null; C.overlay.setVisible(false); toOverlay('overlay:closed'); focusPage();
}
ON('fx', (_, f) => showFx(f));
/* "Show me" from What's new: a paper note pointing at the thing to click (it doesn't take the keyboard or the page) */
ON('coach:show', (_, d) => {
  if (!d || !d.rect || C.overlayOpen || C.dragging || !alive(C.win)) return;
  if (C.bmShown) bmHide(true);
  const [w, h] = C.win.getContentSize(), cw = 352, ch = 184, r = d.rect;   // room around the note for its shadow
  let x = Math.round(Math.min(Math.max(0, r.x + r.w / 2 - cw * .75), w - cw)), y = Math.round(r.y + r.h - 6);
  if (y + ch > h) y = Math.max(0, Math.round(r.y - ch + 6));
  clearTimeout(C.fxTimer); C.toastUntil = 0; C.coachOn = true;
  C.overlay.setBounds({ x, y, width: cw, height: ch }); C.overlay.setVisible(true);
  toOverlay('overlay:init', { mode: 'coach', ...d, ax: Math.round(r.x + r.w / 2 - x), up: r.y < y });
});
ON('coach:hide', () => { toUI('coach:hide'); if (!C.coachOn) return; C.coachOn = false; if (!C.overlayOpen && !C.dragging) C.overlay.setVisible(false); toOverlay('coach:hide'); });
/* ---------- Snapshot: freeze the page, drag a box (or the whole page), copied straight away; Save from the toast ---------- */
HANDLE('snap:capture', async () => {
  const t = activeTab(); if (!t || !t.rect || t.wc.isDestroyed()) return null;
  try { const img = await t.wc.capturePage(); if (img.isEmpty()) return null; C.snapImg = img; C.snapRect = { ...t.rect }; C.snapTitle = t.wc.getTitle(); return { url: img.toDataURL(), rect: C.snapRect }; } catch { return null; }
});
HANDLE('snap:take', (_, r) => {
  const img = C.snapImg, R0 = C.snapRect; if (!img || !R0 || !r) return null;
  const sz = img.getSize(), k = sz.width / R0.width, cl = (v, m) => Math.max(0, Math.min(m, Math.round(v)));
  const x = cl(r.x * k, sz.width - 1), y = cl(r.y * k, sz.height - 1), w = Math.max(1, Math.min(sz.width - x, Math.round(r.w * k))), h = Math.max(1, Math.min(sz.height - y, Math.round(r.h * k)));
  const crop = img.crop({ x, y, width: w, height: h }); const png = crop.toPNG(); clipboard.write([new (require('electron').ClipboardItem)({ 'image/png': new Blob([png], { type: 'image/png' }) })]).catch(e => console.error('snapshot copy', e.message)); C.snapLast = crop; C.snapImg = null;
  const small = crop.getSize().width > 560 ? crop.resize({ width: 560 }) : crop;
  return { url: small.toDataURL(), w, h };
});
function snapSave() {
  const img = C.snapLast; if (!img) return;
  const d = new Date(), p2 = n => String(n).padStart(2, '0'), name = `Washi Snapshot ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} at ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.png`;
  const dest = path.join(app.getPath('downloads'), name);
  try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, img.toPNG()); showFx({ type: 'toast', text: 'Saved to Downloads', reveal: dest }); } catch (e) { showFx({ type: 'toast', text: 'Couldn\'t save it: ' + e.message }); }
}
HANDLE('overlay:open', (_, payload) => {
  vaultYield();
  if (C.peek) closePeek(true); bmHide(true);
  C.overlayOpen = true; C.panelOpen = null; C.coachOn = false; clearTimeout(C.fxTimer);
  fitOverlay(); C.overlay.setVisible(true); C.overlay.webContents.focus();
  toOverlay('overlay:init', payload);
  return true;
});
/* small panels that sit over part of the window (find bar, blocking popover), so the page stays usable */
HANDLE('overlay:panel', (_, kind, rect, data) => {
  if (C.dragging) return false;
  vaultYield();
  if (C.peek) closePeek(true); bmHide(true);
  C.overlayOpen = true; C.panelOpen = kind; C.coachOn = false; clearTimeout(C.fxTimer);
  if (kind === 'find') placeFind(); else C.overlay.setBounds(rr({ x: rect.x, y: rect.y, width: rect.w, height: rect.h }));
  C.overlay.setVisible(true); C.overlay.webContents.focus();
  toOverlay('overlay:init', { mode: 'panel', kind, data });
  return true;
});
function placeFind() {
  if (!C.lastLayout || !C.overlay) return;
  const r = (C.lastLayout.split && C.panes.focus === 'b' ? C.lastLayout.b : C.lastLayout.a) || C.lastLayout.stage;
  C.overlay.setBounds(rr({ x: r.x + r.w - 396, y: r.y + 10, width: 386, height: 64 }));
}
ON('find:query', (_, q) => {
  const t = activeTab(); if (!t) return;
  if (!q || !q.text) { t.wc.stopFindInPage('clearSelection'); toOverlay('find:result', { active: 0, total: 0 }); return; }
  t.wc.findInPage(String(q.text).slice(0, 300), { forward: q.dir !== -1, findNext: !!q.next, matchCase: false });
});
ON('overlay:result', (_, r) => { closeOverlay(); toUI('overlay:result', r); });
ON('overlay:cancel', () => { closeOverlay(); toUI('overlay:cancel'); });

/* ---------- bookmarks bar "on hover": a strip in the overlay, just under the top bar, while the pointer is near ----------
   The shell asks for it after the pointer rests on the top bar; it goes away shortly after the pointer leaves both. */
const BM_H = 50;                                  // the 40px strip plus room for its shadow
function bmStripRect() {
  const s = C.lastLayout ? C.lastLayout.stage : (() => { const [w] = C.win.getContentSize(); return { x: 12, w: w - 24 }; })();
  return { x: s.x, y: TOP, width: s.w, height: BM_H };
}
function pointerNearBar() {
  if (!alive(C && C.win)) return false;
  const p = screen.getCursorScreenPoint(), b = C.win.getContentBounds(), x = p.x - b.x, y = p.y - b.y, r = bmStripRect();
  return (y >= -2 && y < TOP && x >= 0 && x < b.width) || (x >= r.x && x < r.x + r.width && y >= TOP - 2 && y < TOP + BM_H - 4);
}
function bmHide(keepOverlay) {
  if (!C.bmShown) return; C.bmShown = false; clearInterval(C.bmPoll); C.bmPoll = null;
  toOverlay('bm:hide');
  clearTimeout(C.bmOffT);
  if (!keepOverlay && !C.overlayOpen && !C.dragging && C.overlay) C.bmOffT = later(() => { if (!C.bmShown && !C.overlayOpen && !C.dragging && Date.now() >= (C.toastUntil || 0)) C.overlay.setVisible(false); }, 130);   // after it slides away
}
ON('bm:hover', (_, d) => {
  if (!d) return bmHide();
  if (C.overlayOpen || C.dragging || !C.overlay || !alive(C.win) || !C.win.isFocused() || C.menuOpen) return;
  if (Date.now() < (C.toastUntil || 0)) return;                    // a toast (e.g. "Removed the bookmark · Undo") is using the overlay
  if (C.bmShown) return;                                           // already showing: never redraw it under the pointer
  clearTimeout(C.fxTimer); clearTimeout(C.bmOffT);
  const r = rr(bmStripRect());
  C.bmShown = true; C.tabPeekOn = false; C.overlay.setBounds(r); C.overlay.setVisible(true);
  toOverlay('overlay:init', { mode: 'bmbar', ...d, w: r.width });
  clearInterval(C.bmPoll); const c = C; let away = 0;
  c.bmPoll = setInterval(() => {
    C = c; if (!c.bmShown || !alive(c.win)) { clearInterval(c.bmPoll); return; }
    if (c.menuOpen || pointerNearBar()) { away = 0; return; }
    if ((away += 100) >= 300 || !c.win.isFocused()) bmHide();
  }, 100);
});
require('electron').ipcMain.on('washi-page', (e, type, d) => {   // a page says the pointer left it through the top, or Reader mode was asked to leave (page-preload.js)
  if (type === 'reader') { for (const c of W.values()) for (const t of c.tabs.values()) if (t.wc === e.sender && alive(c.win)) { C = c; if (d && d.act === 'leave') reader.hide(t.wc).then(() => toUI('tab:event', { id: t.id, reading: false })); else if (d && d.act === 'look') toUI('cmd', 'reader:look'); return; } return; }
  if (type !== 'topExit') return;
  for (const c of W.values()) for (const t of c.tabs.values()) if (t.wc === e.sender && t.visible && alive(c.win) && c.win.isFocused()) {
    /* only if the pointer settles just above the page (the lower part of the top bar), not up at the address label you're about to click */
    clearTimeout(c.bmExitT);
    c.bmExitT = later(() => { if (!alive(c.win) || !c.win.isFocused()) return; const p = screen.getCursorScreenPoint(), b = c.win.getContentBounds(), y = p.y - b.y, x = p.x - b.x; if (y >= TOP - 14 && y < TOP + 2 && x >= 0 && x < b.width) { C = c; toUI('bm:edge'); } }, 140);
    return;
  }
});
ON('bm:act', (_, m) => {                               // something was clicked on the strip: the shell knows the bookmarks
  if (!m || typeof m !== 'object') return;
  const r = C.bmShown ? bmStripRect() : { x: 0, y: 0 };
  if (m.act === 'open' || m.act === 'move') { if (m.act === 'open') bmHide(); }
  toUI('bm:act', { ...m, x: (+m.x || 0) + r.x, y: (+m.y || 0) + r.y });
});

/* app icons for "Your apps": fetched once from the site (via Google's icon service) and kept on this Mac, so the tiles
   show at once next time. Returned as data: URLs. */
const ICONS = store.readJSON('app-icons.json', {});
async function iconOf(x) {
  const okURL = u => { try { const p = new URL(u); return p.protocol === 'https:' || (!app.isPackaged && /^http:\/\/(localhost|127\.0\.0\.1):/.test(u)); } catch { return false; } };
  let host = ''; try { host = new URL(x.url).hostname; } catch { return null; }
  const tries = [x.icon, 'https://www.google.com/s2/favicons?sz=64&domain=' + host, 'https://' + host + '/favicon.ico'].filter(u => u && okURL(u));
  for (const u of tries) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
      const r = await session.defaultSession.fetch(u, { signal: ctl.signal, credentials: 'omit' }); clearTimeout(tm);
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok || !/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|webp|gif)$/.test(type)) continue;
      const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 200000) continue;
      return `data:${type === 'image/vnd.microsoft.icon' ? 'image/x-icon' : type};base64,${buf.toString('base64')}`;
    } catch {}
  }
  return null;
}
async function appIcons(list) {
  const out = {}, now = Date.now(); let changed = false;
  await Promise.all(list.filter(x => x && typeof x.id === 'string' && typeof x.url === 'string').map(async x => {
    const c = ICONS[x.id];
    if (c && c.u === (x.icon || x.url) && now - c.at < 30 * 864e5) { out[x.id] = c.d; return; }
    const d = await iconOf(x); if (d) { out[x.id] = d; ICONS[x.id] = { u: x.icon || x.url, d, at: now }; changed = true; } else if (c) out[x.id] = c.d;
  }));
  if (changed) store.writeSoon('app-icons.json', JSON.stringify(ICONS));
  return out;
}
const pwUndo = new Map(), pkUndo = new Map();
/* Touch ID before showing, copying or exporting a password (Macs without Touch ID: Washi's own Settings click is the check) */
async function vaultGate(reason) {
  if (!app.isPackaged && process.env.WASHI_TEST_UV === '1') return process.env.WASHI_TEST_GATE !== 'deny';
  if (process.platform !== 'darwin') return true;
  try { if (!systemPreferences.canPromptTouchID()) return true; await systemPreferences.promptTouchID(reason); return true; } catch { return false; }
}
/* ---------- Chrome extensions (app/extensions.js does the work; these connect it to Washi's tabs and windows) ---------- */
const PERM_WORDS = { tabs: 'see your open tabs', history: 'read your browsing history', bookmarks: 'read and change your bookmarks', cookies: 'read and change cookies', downloads: 'manage your downloads', clipboardRead: 'read what you copy', clipboardWrite: 'change what you copy', geolocation: 'know your location', notifications: 'show notifications', nativeMessaging: 'talk to apps on your Mac', webRequest: 'see what pages load', declarativeNetRequest: 'block or change what pages load', management: 'manage your other extensions', privacy: 'change privacy settings', proxy: 'change how you connect to the internet', debugger: 'take control of pages' };
let extMenuT = 0;
exts.bind({
  createTab: (d, ses) => new Promise(res => {
    useMain(); { const pp = exts.popupNow(), wid = d && typeof d.windowId === 'number' ? d.windowId : null; const c = [...W.values()].find(x => alive(x.win) && ((wid != null && wid >= 0 && x.win.id === wid) || (wid == null && pp && pp.parent === x.win))); if (c) C = c; }   // in the window the extension asked for, or the one its popup is in
    const url = typeof d.url === 'string' && d.url ? d.url : 'about:blank';
    const fn = t => { clearTimeout(tm); res([t.wc, C.win]); };
    const tm = setTimeout(() => { const i = tabWaiters.indexOf(fn); if (i > -1) tabWaiters.splice(i, 1); res(null); }, 4000);
    tabWaiters.push(fn); toUI('tab:openRequest', { url, bg: d.active === false }); void ses;
  }),
  selectTab: wc => { for (const c of W.values()) for (const [id, t] of c.tabs) if (t.wc === wc) { C = c; toUI('sb:intent', { type: 'select', id }); return; } },
  removeTab: wc => { for (const c of W.values()) for (const [id, t] of c.tabs) if (t.wc === wc) { C = c; toUI('sb:intent', { type: 'close', id }); return; } },
  confirm: async d => {
    if (!app.isPackaged && process.env.WASHI_TEST_EXT_ALLOW === '1') return { action: 'allow' };   // tests can't press a native dialog's button
    useMain(); const m = d.manifest || {}, name = d.localizedName || m.name || 'this extension';
    const perms = [...new Set([...(m.permissions || []), ...(m.optional_permissions || [])].map(p => PERM_WORDS[p]).filter(Boolean))];
    const hosts = [...(m.host_permissions || []), ...((m.content_scripts || []).flatMap(c => c.matches || []))];
    const everywhere = hosts.some(h => /<all_urls>|^\*:\/\/\*\/|^https?:\/\/\*\//.test(h));
    const what = [everywhere ? 'read and change everything on the websites you visit' : hosts.length ? `read and change pages on ${[...new Set(hosts.map(h => h.replace(/^\*?:?\/\/|\/\*$/g, '').replace(/^\*\./, '')))].slice(0, 3).join(', ')}` : null, ...perms].filter(Boolean);
    const r = await dialog.showMessageBox(C.win, { type: 'question', message: `Add “${name}” to Washi?`, detail: (what.length ? 'It will be able to:\n• ' + what.join('\n• ') : 'It doesn\'t ask for any special access.') + '\n\nOnly add extensions you trust. You can remove it any time in Settings › Extensions.', buttons: ['Add Extension', 'Cancel'], defaultId: 0, cancelId: 1, icon: d.icon && !d.icon.isEmpty && !d.icon.isEmpty() ? d.icon : undefined });
    if (r.response === 0) later(() => showFx({ type: 'toast', text: `Added ${name}`, short: true }), 600);
    return { action: r.response === 0 ? 'allow' : 'deny' };
  },
  changed: () => { clearTimeout(extMenuT); extMenuT = setTimeout(() => { if (!recording) buildMenu(); }, 300); for (const c of W.values()) if (alive(c.win)) { c.win.webContents.send('ext:changed', exts.list()); if (c.overlay) c.overlay.webContents.send('ext:changed', exts.list()); } }
});

/* ---------- saved passwords and passkeys: the account menu, the "Save password?" card and the passkey card ----------
   app/autofill.js decides what to show; these place it in the overlay. The menu never takes focus from the page, so you
   can keep typing; the passkey card does (it's a question that needs an answer). */
const findTab = wc => { for (const c of W.values()) { if (!alive(c.win)) continue; for (const t of c.tabs.values()) if (t.wc === wc) return { c, t }; } return null; };
const rectKey = t => t && t.rect ? [t.rect.x, t.rect.y, t.rect.width, t.rect.height].join() : '';
function vaultYield() {                                   // something else wants the overlay: put the menu or card away
  if (C.panelOpen === 'pwmenu') { const w = C.pwWc; C.panelOpen = null; C.overlayOpen = false; if (w && !w.isDestroyed()) autofill.hideMenu(w); }
  else if (C.panelOpen === 'pwsave') { C.panelOpen = null; C.overlayOpen = false; C.pwSave = null; }
  else if (C.panelOpen === 'pk' && C.pkResolve) { const r = C.pkResolve; C.pkResolve = null; C.panelOpen = null; C.overlayOpen = false; r({ act: 'cancel' }); }
}
function vaultFollow() {                                  // the layout changed: the menu goes away, the save card moves along
  if (C.panelOpen === 'pwmenu') { const f = C.pwWc && findTab(C.pwWc); if (!f || !f.t.visible || rectKey(f.t) !== C.pwRect) closeOverlay(); }
  else if (C.panelOpen === 'pwsave' && C.pwSave) { const f = findTab(C.pwSave.wc); if (!f || !f.t.visible) closeOverlay(); else placeSave(); }
}
function placeSave() {
  const s = C.lastLayout ? C.lastLayout.stage : (() => { const [w, h] = C.win.getContentSize(); return { x: 12, y: TOP, w: w - 24, h: h - TOP - 12 }; })();
  C.overlay.setBounds(rr({ x: s.x + s.w - 372, y: s.y + 6, width: 366, height: 236 }));
}
autofill.bind({
  tab: findTab,
  focus: s => { C = s.c; if (!s.wc.isDestroyed()) s.wc.focus(); },
  menu(s, d) {
    C = s.c; const t = s.t;
    if (!alive(C.win) || !t.visible || !t.rect || C.dragging || (C.overlayOpen && C.panelOpen !== 'pwmenu')) return;
    bmHide(true);
    const z = t.wc.getZoomFactor(), n = d.items.length, r = d.rect;
    const w = 312, h = 64 + Math.min(n, 5) * 48;                   // items, the footer, room for the shadow
    const fx = t.rect.x + r.x * z, fy = t.rect.y + r.y * z, fh = r.h * z, [W0, H0] = C.win.getContentSize();
    let y = fy + fh + 2; if (y + h > H0 - 6) y = Math.max(6, fy - h - 2);
    const x = Math.max(6, Math.min(W0 - w - 6, fx - 6));
    C.overlayOpen = true; C.panelOpen = 'pwmenu'; C.pwWc = t.wc; C.pwRect = rectKey(t); clearTimeout(C.fxTimer); C.toastUntil = 0;
    C.overlay.setBounds(rr({ x, y, width: w, height: h })); C.overlay.setVisible(true);
    toOverlay('overlay:init', { ...(C.lastLook || {}), ...d, what: d.kind, mode: 'vault', kind: 'menu' });
  },
  menuKey(s, key) { C = s.c; if (C.panelOpen === 'pwmenu' && C.pwWc === s.wc) toOverlay('vault:key', key); },
  hideMenu(wc) { const f = findTab(wc); if (!f) return; C = f.c; if (C.panelOpen === 'pwmenu' && C.pwWc === wc) { C.panelOpen = null; C.overlayOpen = false; C.overlay.setVisible(false); toOverlay('overlay:closed'); } },
  save(s, d) {
    C = s.c; const c = C; let tries = 0;
    const show = () => {
      C = c; if (!alive(C.win) || s.wc.isDestroyed()) return;
      if ((C.overlayOpen && C.panelOpen !== 'pwmenu' && C.panelOpen !== 'pwsave') || !s.t.visible) { if (++tries < 60) later(show, 1000); return; }   // wait for the command bar to close, or for you to come back to that tab
      vaultYield(); bmHide(true);
      C.overlayOpen = true; C.panelOpen = 'pwsave'; C.pwSave = { wc: s.wc, token: d.token }; clearTimeout(C.fxTimer); C.toastUntil = 0;
      placeSave(); C.overlay.setVisible(true);
      toOverlay('overlay:init', { ...(C.lastLook || {}), ...d, what: d.kind, mode: 'vault', kind: 'save' });
      const tok = d.token; later(() => { if (C.panelOpen === 'pwsave' && C.pwSave && C.pwSave.token === tok) closeOverlay(); }, 45000);
    };
    show();
  },
  passkey(s, d) {
    return new Promise(res => {
      C = s.c; if (!alive(C.win)) return res({ act: 'cancel' });
      if (C.overlayOpen) { if (C.panelOpen === 'pwmenu' || C.panelOpen === 'pwsave' || C.panelOpen === 'pk') vaultYield(); else { closeOverlay(); toUI('overlay:cancel'); } }
      if (C.peek) closePeek(true); bmHide(true);
      C.overlayOpen = true; C.panelOpen = 'pk'; C.pkResolve = res; C.pkWc = s.wc; clearTimeout(C.fxTimer); C.toastUntil = 0;
      fitOverlay(); C.overlay.setVisible(true); C.overlay.webContents.focus();
      const st = C.lastLayout ? C.lastLayout.stage : null;
      toOverlay('overlay:init', { ...(C.lastLook || {}), ...d, what: d.kind, mode: 'vault', kind: 'pk', host: new URL(s.origin).host, stage: st, touch: process.platform === 'darwin' && (() => { try { return systemPreferences.canPromptTouchID(); } catch { return false; } })() });
    });
  }
});
ON('vault:pick', (_, ch) => { if (C.panelOpen !== 'pwmenu' || !C.pwWc || C.pwWc.isDestroyed()) return; const wc = C.pwWc; C.panelOpen = null; C.overlayOpen = false; C.overlay.setVisible(false); wc.focus(); autofill.pick(wc, ch && typeof ch === 'object' ? { id: typeof ch.id === 'string' ? ch.id : null, gen: !!ch.gen } : null); });
ON('vault:sel', (_, sel) => { if (C.panelOpen === 'pwmenu' && C.pwWc) autofill.menuSel(C.pwWc, +sel); });
ON('vault:pk', (_, a) => { const r = C.pkResolve; if (!r) return; C.pkResolve = null; C.panelOpen = null; closeOverlay(); if (C.pkWc && !C.pkWc.isDestroyed()) C.pkWc.focus(); r(a && typeof a === 'object' ? { act: String(a.act), id: typeof a.id === 'string' ? a.id : null } : { act: 'cancel' }); });
HANDLE('vault:save', (_, a) => { const r = autofill.answer(a); if (C.panelOpen === 'pwsave') closeOverlay(); return r; });

/* peek: look at a link in a floating paper card without opening a tab */
function peekRect() {
  const s = C.lastLayout ? C.lastLayout.stage : (() => { const [w, h] = C.win.getContentSize(); return { x: 12, y: TOP, w: w - 24, h: h - TOP - 12 }; })();
  const w = Math.min(s.w - 80, 1100), h = s.h - 86;
  return { x: Math.round(s.x + (s.w - w) / 2), y: Math.round(s.y + 62), w: Math.round(w), h: Math.round(h) };
}
function openPeek(url) {
  if (!alive(C && C.win) || !/^https?:/.test(url)) return;
  if (C.peek) closePeek(true);
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: web.pageSession(C.curSpace), safeDialogs: true } });
  try { view.setBorderRadius(10); } catch {}
  const wc = view.webContents, r = peekRect(), pc = C; pin(pc, wc);
  C.peek = { view, wc, url };
  C.overlayOpen = true; C.panelOpen = 'peek'; clearTimeout(C.fxTimer);
  fitOverlay(); C.overlay.setVisible(true);
  C.win.contentView.addChildView(view);                         // above the overlay, inside the paper card it draws
  view.setBounds(rr({ x: r.x, y: r.y, width: r.w, height: r.h }));
  const info = () => { if (!wc.isDestroyed()) toOverlay('peek:info', { url: wc.getURL() || url, title: wc.getTitle(), loading: wc.isLoading() }); };
  for (const ev of ['did-start-loading', 'did-stop-loading', 'page-title-updated', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, info);
  wc.setWindowOpenHandler(({ url: u }) => { C = pc; if (/^https?:/.test(u)) toUI('tab:openRequest', { url: u }); return { action: 'deny' }; });
  wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') { e.preventDefault(); closeOverlay(); } });
  wc.on('before-input-event', switchKeys); boost.watch(wc);
  wc.on('did-start-navigation', d => { if (d.isMainFrame && !d.isSameDocument) web.matchUA(wc, d.url); });
  wc.on('will-redirect', d => { if (d.isMainFrame && web.needsUA(wc, d.url) && d.method !== 'POST') { d.preventDefault(); web.matchUA(wc, d.url); wc.loadURL(d.url).catch(() => {}); } });
  toOverlay('overlay:init', { mode: 'peek', rect: r, url });
  web.matchUA(wc, url);
  wc.loadURL(url).catch(() => {});
  wc.focus();
}
function closePeek(destroy) {
  if (!C.peek) return; const p = C.peek; C.peek = null;
  try { C.win.contentView.removeChildView(p.view); } catch {}
  if (destroy) try { p.wc.close(); } catch {}
  toOverlay('peek:closed');
}
ON('peek:open', (_, url) => openPeek(url));
HANDLE('peek:adopt', (_, id, space) => {               // "Open as tab": the peeked page becomes a real tab, keeping its state
  if (!C.peek || C.tabs.has(id)) return null;
  const p = C.peek; C.peek = null;
  try { C.win.contentView.removeChildView(p.view); } catch {}
  p.wc.removeAllListeners('did-start-loading'); p.wc.removeAllListeners('did-stop-loading'); p.wc.removeAllListeners('page-title-updated'); p.wc.removeAllListeners('did-navigate'); p.wc.removeAllListeners('did-navigate-in-page'); p.wc.removeAllListeners('before-input-event');
  const t = { id, view: p.view, wc: p.wc, rect: null, visible: false, lastInput: Date.now(), playing: false };
  C.tabs.set(id, t); p.view.setVisible(false); try { p.view.setBorderRadius(10); } catch {} C.win.contentView.addChildView(p.view, 0); hook(t);
  C.overlayOpen = false; C.panelOpen = null; C.overlay.setVisible(false);
  void space;
  return { url: p.wc.getURL(), title: p.wc.getTitle() };
});

/* ---------- Little scraps: a small throwaway window for a quick look at a link ----------
   ⌥⌘N opens one (or links from other apps, if you choose that in Settings). "Open in Washi" (⌘O) moves the page into
   your C.sidebar as a real tab without reloading it; closing the window throws it away. */
const scraps = new Map();                                  // scrap window's webContents id → scrap
const SCRAP_TOP = 48;
function openScrap(url) {
  const pb = alive(C && C.win) ? C.win.getBounds() : { x: 80, y: 80, width: 1200, height: 800 }, n = scraps.size % 6;
  const w = 860, h = 620;
  const sw = new BrowserWindow({ width: w, height: h, x: Math.round(pb.x + (pb.width - w) / 2 + n * 26), y: Math.round(pb.y + 64 + n * 26), minWidth: 460, minHeight: 320,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 17 }, autoHideMenuBar: true, backgroundColor: '#fbf6ea', show: false, title: 'Little scrap',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, session: uiSes, spellcheck: false } });
  sec.trustUI(sw.webContents);
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: web.pageSession(C.curSpace), safeDialogs: true, spellcheck: true } });
  try { view.setBorderRadius(10); } catch {}
  sw.contentView.addChildView(view);
  const wc = view.webContents, sid = sw.webContents.id;
  const sc = { isScrap: true, win: sw, view, wc, space: C.curSpace, adopted: false, tok: null, notice: null };
  scraps.set(sid, sc);
  const place = () => { if (sw.isDestroyed()) return; const [cw, ch] = sw.getContentSize(); view.setBounds({ x: 8, y: SCRAP_TOP, width: Math.max(0, cw - 16), height: Math.max(0, ch - SCRAP_TOP - 8) }); };
  sw.on('resize', place); place();
  const info = () => { if (!wc.isDestroyed() && !sw.isDestroyed()) sw.webContents.send('scrap:info', { url: pages.isNotice(wc.getURL()) ? (sc.notice && sc.notice.url) || '' : wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), ...nav(wc), search: P.search, look: C.lastLook }); };
  const L = sc.listeners = {
    'did-start-loading': info, 'did-stop-loading': info, 'page-title-updated': info, 'did-navigate': info, 'did-navigate-in-page': info,
    'did-start-navigation': d => { if (d.isMainFrame && !d.isSameDocument) web.matchUA(wc, d.url); },
    'will-navigate': (e, u) => { web.matchUA(wc, u); if (pages.isInternal(u)) { e.preventDefault(); internal(sc, u); return; } let pr = ''; try { pr = new URL(u).protocol; } catch {} if (pr && !OK_SCHEMES.has(pr)) { e.preventDefault(); external(u, wc); } },
    'did-fail-load': (_, code, desc, u, isMain) => { if (isMain && code !== -3 && code !== 0 && !(code === -20 && web.isDangerStop(u))) notice(sc, 'failed', u, desc.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())); }
  };
  for (const k in L) wc.on(k, L[k]);
  boost.watch(wc);
  wc.setWindowOpenHandler(({ url: u }) => { useMain(); if (/^https?:/.test(u)) toUI('tab:openRequest', { url: u }); return { action: 'deny' }; });   // new windows from a scrap open as tabs in Washi
  sw.webContents.loadURL(proto.url('scrap.html'));
  sw.webContents.once('did-finish-load', () => { info(); if (!url) sw.webContents.send('scrap:focus'); });
  sw.once('ready-to-show', () => sw.show());
  sw.on('closed', () => { scraps.delete(sid); if (!sc.adopted && !wc.isDestroyed()) wc.close(); });
  if (url) go(wc, url).catch(() => {});
  return sc;
}
const scrapOf = w => w && [...scraps.values()].find(s => s.win === w);
ON('scrap:open', (_, url) => openScrap(typeof url === 'string' && /^https?:/.test(url) ? url : ''));
ON('scrap:act', (e, a) => {
  const sc = scraps.get(e.sender.id); if (!sc || !a) return;
  const wc = sc.wc;
  if (a.type === 'go' && typeof a.url === 'string' && /^(https?:|about:blank)/.test(a.url)) { sc.notice = null; go(wc, a.url).catch(() => {}); wc.focus(); }
  else if (a.type === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (a.type === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  else if (a.type === 'reload') wc.isLoading() ? wc.stop() : wc.reload();
  else if (a.type === 'adopt') toUI('scrap:adopt', { sid: e.sender.id });
  else if (a.type === 'copy') clipboard.writeText(wc.getURL());
  else if (a.type === 'close') sc.win.close();
});
/* the shell gave the page a tab id and a space: move the page into the main window, keeping it as it is */
HANDLE('scrap:adopt', (_, sid, id, space) => {
  const sc = scraps.get(sid); if (!sc || C.tabs.has(id) || sc.wc.isDestroyed()) return null;
  const r = { url: pages.isNotice(sc.wc.getURL()) ? (sc.notice && sc.notice.url) || '' : sc.wc.getURL(), title: sc.wc.getTitle() };
  if (web.pageSession(space) !== sc.wc.session) { sc.win.close(); return { ...r, reload: true }; }   // a different login jar: open it fresh there
  sc.adopted = true;
  for (const k in sc.listeners) sc.wc.removeListener(k, sc.listeners[k]);
  try { sc.win.contentView.removeChildView(sc.view); } catch {}
  const t = { id, view: sc.view, wc: sc.wc, rect: null, visible: false, lastInput: Date.now(), playing: false };
  C.tabs.set(id, t); sc.view.setVisible(false); try { sc.view.setBorderRadius(10); } catch {}
  C.win.contentView.addChildView(sc.view, 0); hook(t);
  sc.win.close(); if (alive(C && C.win)) { C.win.show(); C.win.focus(); }
  return r;
});

/* ---------- settings coming from the interface ---------- */
let menuKeys = '';
ON('prefs:sync', (_, p) => {
  Object.assign(P, p);
  try { nativeTheme.themeSource = P.mode === 'auto' ? 'system' : P.mode === 'dark' ? 'dark' : 'light'; } catch {}   // sites that support dark mode follow along
  web.configure({ gpc: p.gpc, askDownload: p.askDownload, httpsFirst: p.httpsFirst, safety: p.safety, blocking: p.blocking, clearOnExit: p.clearOnExit, dns: p.dns });
  autofill.configure({ save: p.pwSave !== false, fill: p.pwFill !== false, passkeys: p.passkeys !== false });
  const k = JSON.stringify(P.keys || {}); if (k !== menuKeys && !recording) { menuKeys = k; buildMenu(); }
});
ON('keys:recording', (_, on) => {                        // while a shortcut is being recorded, the menu mustn't grab the keys
  recording = !!on;
  if (recording) Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: app.name, submenu: [{ role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'paste' }] }]));
  else { menuKeys = JSON.stringify(P.keys || {}); buildMenu(); }
});
HANDLE('keys:list', () => ({ actions: keys.ACTIONS, custom: P.keys || {} }));
ON('setup:msg', (_, m) => toUI('setup:msg', m));
ON('setup:reply', (_, m) => toOverlay('setup:event', m));     // the shell answering something the setup sheet asked for
const isDefault = () => { try { return app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http'); } catch { return false; } };
HANDLE('setup:info', () => ({ packaged: app.isPackaged, isDefault: isDefault(), version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, update: updater.state(), lists: blocker.listDate(), perms: web.listPerms(), ghToken: live.tokenHas(), appsTest: !app.isPackaged && process.env.WASHI_APPS_TEST ? process.env.WASHI_APPS_TEST : null }));
HANDLE('setup:act', async (_, a) => {
  if (a.type === 'defaultBrowser') {
    if (!app.isPackaged) return { ok: false, isDefault: false, why: 'dev' };
    app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https');
    await new Promise(r => later(r, 1500));                    // macOS asks the user to confirm; check again after
    return { ok: true, isDefault: isDefault() };
  }
  if (a.type === 'clearData') { await web.clearData(a); if (a.history) toUI('setup:msg', { type: 'cleared' }); return { ok: true }; }
  if (a.type === 'startFresh') { closeOverlay(); later(startFresh, 50); return { ok: true }; }
  if (a.type === 'perm:reset') { web.resetPerm(a.origin, a.perm); return web.listPerms(); }
  if (a.type === 'perms') return web.listPerms();
  if (a.type === 'perf') return perfReport();
  if (a.type === 'boost:info') { const t = activeTab(), host = t ? boost.hostOf(t.wc.getURL()) : ''; return { host, boost: boost.get(host) }; }
  if (a.type === 'boost:undoLast') { const t = activeTab(); if (t) a = { type: 'boost:set', host: boost.hostOf(t.wc.getURL()), patch: { undoZap: true } }; else return null; }
  if (a.type === 'boost:set') {
    const b = boost.set(a.host, a.patch || {});
    const here = C; for (const c of W.values()) for (const w of [...c.tabs.values(), ...(c.peek ? [c.peek] : [])]) if (!w.wc.isDestroyed() && boost.hostOf(w.wc.getURL()) === a.host) { C = c; boost.apply(w.wc); if (w.id) toUI('tab:event', { id: w.id, boosted: boost.isOn(w.wc.getURL()) }); }
    C = here;
    for (const w of scraps.values()) if (!w.wc.isDestroyed() && boost.hostOf(w.wc.getURL()) === a.host) { boost.apply(w.wc); if (w.id) toUI('tab:event', { id: w.id, boosted: boost.isOn(w.wc.getURL()) }); }
    return { host: a.host, boost: b };
  }
  if (a.type === 'boost:zap') {
    const t = activeTab(); if (!t) return { n: 0 };
    const host = boost.hostOf(t.wc.getURL()); if (!host) return { n: 0 };
    closeOverlay(); t.wc.focus();
    const c0 = C; const n = await boost.zap(t.wc); C = c0;
    toUI('tab:event', { id: t.id, boosted: boost.isOn(t.wc.getURL()) });
    if (n) showFx({ type: 'toast', text: `Hid ${n} thing${n > 1 ? 's' : ''} on ${host}`, action: { label: 'Undo', cmd: 'boost:undo' } });
    return { n };
  }
  /* are you signed in to these apps? (a cookie that's only there when you are, in the right space's cookie jar) */
  if (a.type === 'apps:status') {
    const out = {};
    for (const x of Array.isArray(a.apps) ? a.apps.slice(0, 40) : []) {
      const ck = x && x.cookie; if (!ck || typeof ck.url !== 'string' || !/^https?:\/\/[^/]+/.test(ck.url) || typeof ck.name !== 'string') continue;
      try {
        const list = await web.pageSession(x.space || null).cookies.get({ url: ck.url, name: ck.name });
        out[x.id] = list.some(c => c.value && (ck.value === undefined || c.value === ck.value) && (!c.expirationDate || c.expirationDate * 1000 > Date.now()));
      } catch { out[x.id] = false; }
    }
    return out;
  }
  if (a.type === 'github:today') return live.githubToday();
  if (a.type === 'live:fetch') return live.fetchLive(a.kind === 'github' ? 'github' : 'feed', a.src);
  if (a.type === 'github:token') return live.tokenSet(a.value);
  if (a.type === 'arc:scan') return arc.scan(arcOK.has(a.path) ? a.path : undefined);
  if (a.type === 'arc:read') { try { return { ok: true, ...arc.read(arcOK.has(a.path) ? a.path : undefined) }; } catch (e) { return { ok: false, error: e.message }; } }
  if (a.type === 'arc:pick') {
    const r = await dialog.showOpenDialog(C.win, { title: 'Choose Arc\'s C.sidebar file', message: 'Pick StorableSidebar.json (in Library › Application Support › Arc)', defaultPath: arc.where(), properties: ['openFile', 'showHiddenFiles'], filters: [{ name: 'Arc sidebar', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    arcOK.add(r.filePaths[0]); return arc.scan(r.filePaths[0]);
  }
  if (a.type === 'bm:scan') { const list = bmimport.scan(); bmFiles.clear(); for (const x of list) bmFiles.set(x.key, x.src); return list.map(({ src, ...x }) => x); }
  if (a.type === 'bm:read') { const f = bmFiles.get(a.key); if (!f) return { ok: false, error: 'Couldn\'t find that browser any more.' }; try { return { ok: true, ...bmimport.read(f) }; } catch (e) { return { ok: false, error: e.message }; } }
  if (a.type === 'bm:pick') {
    const safari = a.kind === 'safari';
    const r = !app.isPackaged && process.env.WASHI_TEST_PICK ? { canceled: false, filePaths: [process.env.WASHI_TEST_PICK] }      // tests can't click a file dialog
      : await dialog.showOpenDialog(C.win, safari ? { title: 'Choose Safari\'s export', message: 'In Safari: File › Export Browsing Data to File…, then pick the .zip it saved', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'Safari export', extensions: ['zip'] }] }
        : { title: 'Choose a bookmarks file', message: 'Pick Safari\'s export (.zip) or a bookmarks file from another browser (.html)', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'Bookmarks', extensions: ['zip', 'html', 'htm', 'json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0], name = /\.zip$/i.test(f) ? 'Safari' : path.basename(f).replace(/\.[^.]+$/, '').slice(0, 30);
    try {
      const { passwordsCSV, ...got } = bmimport.readFile(f);
      let pw = null; if (passwordsCSV) { const x = vault.importCSV(passwordsCSV); if (x.ok) pw = { added: x.added, updated: x.updated }; }   // passwords go straight into the encrypted store, never to the interface
      return { ok: true, name, ...got, pw };
    } catch (e) { return { ok: false, error: e.message || 'Couldn\'t read that file.' }; }
  }
  if (a.type === 'apps:icons') return appIcons(Array.isArray(a.list) ? a.list.slice(0, 40) : []);
  if (a.type === 'ext:list') return { ok: exts.available(), list: exts.list() };
  if (a.type === 'ext:remove') return { ok: await exts.remove(String(a.id || '')) };
  if (a.type === 'ext:store') { toUI('tab:openRequest', { url: 'https://chromewebstore.google.com/' }); return { ok: true }; }
  if (a.type === 'ext:options') { const e = exts.list().find(x => x.id === a.id); if (e && e.options) toUI('tab:openRequest', { url: e.options }); return { ok: !!(e && e.options) }; }
  /* ---------- Settings › Passwords ---------- */
  if (a.type === 'pw:list') return vault.list();
  if (a.type === 'pw:reveal' || a.type === 'pw:copy') {
    const l = vault.get(String(a.id || '')); if (!l) return { ok: false };
    if (!(await vaultGate('see a saved password'))) return { ok: false, denied: true };
    if (a.type === 'pw:reveal') return { ok: true, pass: l.pass };
    clipboard.writeText(l.pass); const was = l.pass;
    setTimeout(() => { try { if (clipboard.readText() === was) clipboard.writeText(''); } catch {} }, 60000);   // don't leave it on the clipboard
    return { ok: true };
  }
  if (a.type === 'pw:edit') return { ok: vault.edit(String(a.id || ''), { user: typeof a.user === 'string' ? a.user : undefined, pass: typeof a.pass === 'string' ? a.pass : undefined, origin: typeof a.site === 'string' ? a.site : undefined }) };
  if (a.type === 'pw:add') { const o = vault.normOrigin(a.site); if (!o) return { ok: false, error: 'That doesn\'t look like a website address.' }; if (!a.pass) return { ok: false, error: 'Type the password.' }; return { ok: !!vault.upsert(o, String(a.user || ''), String(a.pass)) }; }
  if (a.type === 'pw:delete') { const l = vault.remove(String(a.id || '')); if (!l) return { ok: false }; const tok = token(); pwUndo.set(tok, l); setTimeout(() => pwUndo.delete(tok), 120000); return { ok: true, undo: tok }; }
  if (a.type === 'pw:undo') { const l = pwUndo.get(String(a.undo || '')); if (l) { pwUndo.delete(a.undo); vault.restore(l); } return { ok: !!l }; }
  if (a.type === 'pw:never') { vault.never(String(a.origin || ''), false); return { ok: true }; }
  if (a.type === 'pk:delete') { const p = vault.removePasskey(String(a.id || '')); if (!p) return { ok: false }; const tok = token(); pkUndo.set(tok, p); setTimeout(() => pkUndo.delete(tok), 120000); return { ok: true, undo: tok }; }
  if (a.type === 'pk:undo') { const p = pkUndo.get(String(a.undo || '')); if (p) { pkUndo.delete(a.undo); vault.restorePasskey(p); } return { ok: !!p }; }
  if (a.type === 'pw:import') {
    const r = !app.isPackaged && process.env.WASHI_TEST_PICK_PW ? { canceled: false, filePaths: [process.env.WASHI_TEST_PICK_PW] }
      : await dialog.showOpenDialog(C.win, { title: 'Import passwords', message: 'Pick a passwords export (.csv) from Chrome, Firefox, 1Password, Bitwarden… or Safari\'s export (.zip)', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'Passwords', extensions: ['csv', 'zip'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    try {
      let text;
      if (/\.zip$/i.test(f)) { text = bmimport.readFile(f).passwordsCSV; if (!text) return { ok: false, error: 'That export has no passwords in it. In Safari, tick Passwords when you export.' }; }
      else { if (fs.statSync(f).size > 32 * 1024 * 1024) return { ok: false, error: 'That file is too big.' }; text = fs.readFileSync(f, 'utf8'); }
      return vault.importCSV(text);
    } catch (e) { return { ok: false, error: e.message || 'Couldn\'t read that file.' }; }
  }
  if (a.type === 'pw:export') {
    if (!vault.list().logins.length) return { ok: false, error: 'No passwords to export.' };
    if (!(await vaultGate('export your saved passwords'))) return { ok: false, denied: true };
    const r = !app.isPackaged && process.env.WASHI_TEST_SAVE_PW ? { canceled: false, filePath: process.env.WASHI_TEST_SAVE_PW }
      : await dialog.showSaveDialog(C.win, { title: 'Export passwords', message: 'Anyone who opens this file can read your passwords. Delete it when you\'re done.', defaultPath: path.join(app.getPath('documents'), 'Washi Passwords.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    try { fs.writeFileSync(r.filePath, vault.exportCSV(), { mode: 0o600 }); return { ok: true, n: vault.list().logins.length }; } catch (e) { return { ok: false, error: e.message }; }
  }
  if (a.type === 'update:check') return updater.check();
  if (a.type === 'update:install') { updater.install(); return { ok: true }; }
  if (a.type === 'update:later') { const s = updater.state(); updLater = (typeof a.version === 'string' && a.version) || (s && s.version); return { ok: true }; }
  if (a.type === 'test:update' && !app.isPackaged) { if (!a.again) updLater = null; offerUpdate({ status: 'ready', version: String(a.version || '9.9.9'), notes: String(a.notes || '') }); return { ok: true }; }
  if (a.type === 'test:popup' && !app.isPackaged) { const p = exts.popupNow(); if (!p) return { open: false }; let wid = null; for (const [k, c] of W) if (c.win === p.parent) wid = k; return { open: true, wid, id: p.extensionId }; }   // tests: which window an extension popup opened in
  if (a.type === 'test:focus' && !app.isPackaged) { C.win.focus(); return { focused: BrowserWindow.getFocusedWindow() === C.win }; }
  if (a.type === 'test:extcmds' && !app.isPackaged) return exts.commands();
  if (a.type === 'test:block' && !app.isPackaged) { let r = null; const hit = blocker.onRequest({ url: String(a.url), resourceType: 'xhr', referrer: String(a.page), webContentsId: null }, x => { r = x; }); return { blocked: !!(hit && r && (r.cancel || r.redirectURL)) }; }   // tests: would this request be blocked on that page?
  if (a.type === 'lists:refresh') { const r = await blocker.refresh(true); return { ...r, at: blocker.listDate() }; }
  if (a.type === 'blocking:site') { blocker.setException(a.host, !a.block); const t = activeTab(); if (t) t.wc.reloadIgnoringCache(); return { ok: true }; }   // not from the cache: ads that loaded while blocking was off mustn't come back
  if (a.type === 'blocking:info') { const t = activeTab(); let host = '', origin = ''; try { const u = new URL(t.wc.getURL()); host = u.hostname.replace(/^www\./, ''); if (/^https?:$/.test(u.protocol)) origin = u.origin; } catch {} return { host, origin, net: origin ? web.permOf(origin, 'local-network') : null, count: t ? blocker.countFor(t.wc.id) : 0, allowed: blocker.allowedOn(host), mode: blocker.getMode() }; }
  if (a.type === 'perm:set') { web.setPerm(a.origin, a.perm, a.v); if (a.reload) { const t = activeTab(); if (t && (() => { try { return new URL(t.wc.getURL()).origin; } catch { return ''; } })() === a.origin) t.wc.reload(); } return web.listPerms(); }
  return { ok: false };
});
/* ---------- speed check (Settings → Help) ---------- */
let lagMax = 0, lagAt = Date.now();
setInterval(() => { const now = Date.now(), d = now - lagAt - 250; lagAt = now; if (d > lagMax) lagMax = d; }, 250).unref?.();
async function perfReport() {
  const c0 = C; lagMax = 0; await new Promise(r => later(r, 3000)); C = c0;
  const m = app.getAppMetrics(), byPid = new Map(m.map(x => [x.pid, x]));
  const pct = x => Math.round((x && x.cpu ? x.cpu.percentCPUUsage : 0) * 10) / 10, mb = x => Math.round(((x && x.memory ? x.memory.workingSetSize : 0) / 1024));
  const sum = list => ({ cpu: Math.round(list.reduce((a, x) => a + pct(x), 0) * 10) / 10, mem: list.reduce((a, x) => a + mb(x), 0) });
  const uiPids = new Set([C.win, C.sidebar, C.overlay].filter(Boolean).map(v => (v.webContents || v).getOSProcessId()));
  const pageProcs = []; let top = null;
  for (const t of C.tabs.values()) {
    if (t.wc.isDestroyed()) continue; const x = byPid.get(t.wc.getOSProcessId()); if (!x) continue;
    pageProcs.push(x); if (!top || pct(x) > top.cpu) top = { title: (t.wc.getTitle() || t.wc.getURL()).slice(0, 40), cpu: pct(x) };
  }
  const gs = app.getGPUFeatureStatus(), gpu = /^enabled/.test(gs.gpu_compositing || '');
  const r = { gpu, lagMax: Math.round(lagMax), ui: sum(m.filter(x => uiPids.has(x.pid)).concat(m.filter(x => x.type === 'Browser'))), pages: { ...sum([...new Set(pageProcs)]), n: C.tabs.size },
    gpuProc: sum(m.filter(x => x.type === 'GPU')), top };
  r.text = [`Washi ${app.getVersion()} · Chromium ${process.versions.chrome} · ${process.platform} ${process.arch} · ${os.release()}`,
    `GPU: ${JSON.stringify(gs)}`, `Main-process worst stall: ${r.lagMax} ms`, `Interface: ${r.ui.cpu}% CPU, ${r.ui.mem} MB`,
    `Pages (${r.pages.n}): ${r.pages.cpu}% CPU, ${r.pages.mem} MB; busiest: ${top ? top.title + ' ' + top.cpu + '%' : '-'}`, `GPU process: ${r.gpuProc.cpu}% CPU, ${r.gpuProc.mem} MB`,
    `Processes: ${m.map(x => `${x.type}:${pct(x)}%/${mb(x)}MB`).join(' ')}`, `Blocking: ${blocker.getMode()} · C.sidebar ${C.sbDocked ? 'docked' : 'floating'}`].join('\n');
  return r;
}
HANDLE('dl:list', () => web.listDownloads());
ON('dl:act', (_, id, a) => web.dlAct(id, a));
HANDLE('suggest', async (_, q, tpl) => {                // search suggestions for the command bar
  if (!P.suggest || !q || q.length > 200 || !tpl) return [];
  if (!app.isPackaged && process.env.WASHI_TEST_SUGGEST) tpl = process.env.WASHI_TEST_SUGGEST;   // tests: the local test server, never the real search engine
  try {
    const ctl = new AbortController(); const tm = later(() => ctl.abort(), 1500);
    const r = await session.defaultSession.fetch(tpl.replace('%s', encodeURIComponent(q)), { signal: ctl.signal, credentials: 'omit' }); clearTimeout(tm);
    const j = JSON.parse(await r.text()); const list = Array.isArray(j) ? j[1] : (j.suggestions || []).map(s => s.phrase || s);
    return (Array.isArray(list) ? list : []).map(s => typeof s === 'string' ? s : s && (s.phrase || s.q)).filter(s => typeof s === 'string').slice(0, 6);
  } catch { return []; }
});

/* ---------- window + interface views ---------- */
function uiView(page) {
  const v = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, session: uiSes, spellcheck: false } });
  v.setBackgroundColor('#00000000'); sec.trustUI(v.webContents); pin(C, v.webContents); v.webContents.on('before-input-event', switchKeys); v.webContents.loadURL(proto.url(page)); return v;
}
/* the list of open windows (and where they were), so a restart or an update brings every one of them back */
const WINS = () => { const w = store.readJSON('windows.json', null); return w && Array.isArray(w.order) ? w : { order: [], bounds: {} }; };
const saveWins = w => store.writeJSON('windows.json', w);
let appQuitting = false;
/* ---------- reopen a closed window (⇧⌘T when the last thing you closed was a window) ---------- */
HANDLE('win:closed', () => { const cw = store.readJSON('closed-windows.json', []); return cw[0] ? { at: cw[0].at } : null; });
HANDLE('win:reopen', () => {
  const cw = store.readJSON('closed-windows.json', []), x = cw.shift(); if (!x) return false;
  store.writeJSON('closed-windows.json', cw);
  const wid = W.has(x.wid) ? 'w' + Date.now().toString(36) : x.wid;
  store.write(`win-${wid}.json`, x.data); const w = WINS(); if (x.bounds) w.bounds[wid] = x.bounds; saveWins(w);
  createWindow(wid); return true;
});
function createWindow(wid, o = {}) {
  wid = wid || 'w' + Date.now().toString(36);
  const list = WINS(); if (!list.order.includes(wid)) { list.order.push(wid); saveWins(list); }
  let b = list.bounds[wid] || (wid === 'w1' ? store.readJSON('bounds.json', {}) : {});
  if (o.cascade && lastMain && alive(lastMain.win)) { const p = lastMain.win.getBounds(); b = { x: p.x + 28, y: p.y + 28, width: p.width, height: p.height }; }
  const c = newCtx(wid); W.set(wid, c); C = c; lastMain = c;
  c.win = new BrowserWindow({
    width: b.width || 1320, height: b.height || 840, x: b.x, y: b.y, minWidth: 760, minHeight: 500,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 }, backgroundColor: '#fdd3ae', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, session: uiSes, spellcheck: false, additionalArguments: ['--washi-window=' + wid] }
  });
  pin(c, c.win); pin(c, c.win.webContents);
  sec.trustUI(c.win.webContents); c.win.webContents.on('before-input-event', switchKeys);
  c.win.on('focus', () => { lastMain = c; try { const s = c.panes && (c.panes[c.panes.focus] || c.panes.a), t = s && c.tabs.get(s.id); if (t && !t.wc.isDestroyed()) exts.selectTab(t.wc, c.win); } catch {} });   // extensions: this is the current window now
  c.win.on('blur', () => { if (C.switching) { C.switching = false; toUI('cmd', 'switch:cancel'); } if (C.bmShown && !C.menuOpen) bmHide(); });
  c.win.loadURL(proto.url('index.html'));
  c.win.once('ready-to-show', () => { c.win.show(); if (o.cascade) c.win.focus(); });
  c.sidebar = uiView('sidebar.html'); c.win.contentView.addChildView(c.sidebar); applySidebar();
  c.overlay = uiView('overlay.html'); c.win.contentView.addChildView(c.overlay); c.overlay.setVisible(false);
  c.win.on('resize', () => { applySidebar(); if (C.bmShown) bmHide(); if (C.overlayOpen && !C.panelOpen) fitOverlay(); if (C.panelOpen === 'find') placeFind(); if (C.peek) { const r = peekRect(); C.peek.view.setBounds(rr({ x: r.x, y: r.y, width: r.w, height: r.h })); toOverlay('overlay:init', { mode: 'peek', rect: r, url: C.peek.wc.getURL(), resize: true }); } });
  const keepBounds = () => { if (!alive(c.win)) return; const w = WINS(); w.bounds[wid] = c.win.getNormalBounds(); saveWins(w); };
  c.win.on('moved', keepBounds); c.win.on('resized', keepBounds);
  c.win.on('close', keepBounds);
  c.win.on('closed', () => {
    clearInterval(c.pollA); clearInterval(c.pollB); clearInterval(c.focusPoll);
    for (const t of c.tabs.values()) try { if (!t.wc.isDestroyed()) t.wc.close(); } catch {}
    c.win = null; c.overlay = null; c.sidebar = null; c.tabs.clear(); c.peek = null; W.delete(wid); known.delete(wid);
    if (lastMain === c) lastMain = [...W.values()].find(x => alive(x.win)) || null;
    if (!appQuitting && W.size) {                         // you closed this window on purpose: forget it (the last window is always kept)
      const w = WINS(), data = store.read(`win-${wid}.json`);
      if (data && /"tabs":\{"/.test(data)) { const cw = store.readJSON('closed-windows.json', []); cw.unshift({ wid, at: Date.now(), data, bounds: w.bounds[wid] || null }); store.writeJSON('closed-windows.json', cw.slice(0, 5)); }   // ⇧⌘T can bring it back
      w.order = w.order.filter(x => x !== wid); delete w.bounds[wid]; saveWins(w); store.remove(`win-${wid}.json`);
    }
  });
  c.pollB = setInterval(() => {                      // split view: which pane did the user click into?
    C = c; if (!c.win || !c.panes.b) return;
    for (const k of ['a', 'b']) { const t = c.panes[k] && c.tabs.get(c.panes[k].id); if (t && t.wc.isFocused() && c.panes.focus !== k) { c.panes.focus = k; toUI('pane:focus', k); } }
  }, 200);
  return c;
}
/* The interface has its own session: it may only load its own files and images (favicons); nothing else leaves it. */
function setupUISession() {
  uiSes = session.fromPartition('washi-ui');
  proto.serve(uiSes);
  uiSes.webRequest.onBeforeRequest((d, cb) => {
    if (/^(washi|data|devtools|crx):/.test(d.url) || (d.resourceType === 'image' && /^https?:/.test(d.url))) return cb({});
    cb({ cancel: true });
  });
  exts.handleUI(uiSes);                                            // extension icons in the top bar (crx://)
  uiSes.setPermissionRequestHandler((_, __, cb) => cb(false));
  uiSes.setPermissionCheckHandler(() => false);
}

/* ---------- start fresh ---------- */
async function wipeData() {
  for (const n of fs.readdirSync(app.getPath('userData')).filter(f => /^win-.*\.json$/.test(f))) store.remove(n);
  for (const n of ['state.json', 'shared.json', 'windows.json', 'history.json', 'bounds.json', 'crash.log', 'site-permissions.json', 'downloads.json', 'blocking-exceptions.json']) store.remove(n);
  await web.clearData({ cookies: true, cache: true });
  try { await session.defaultSession.clearStorageData(); } catch {}
}
async function startFresh() {
  const r = await dialog.showMessageBox(C.win, { type: 'warning', buttons: ['Start Fresh', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Start Washi from scratch?', detail: 'This erases your C.tabs, spaces, settings, site permissions and cookies, then reopens Washi as if it was just installed.' });
  if (r.response !== 0) return;
  await wipeData(); app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--fresh') }); app.exit(0);
}

/* ---------- menu bar, built from the shortcut list so custom keys show up everywhere ---------- */
const MAIN_ACTIONS = { reload: 'reload', hardreload: 'hardreload', zoomin: 'zoomin', zoomout: 'zoomout', zoomreset: 'zoomreset', devtools: 'devtools', back: 'back', forward: 'forward', print: 'print', mute: 'mute', pip: 'pip' };
const SCRAP_ACTIONS = { reload: 'reload', hardreload: 'hardreload', zoomin: 'zoomin', zoomout: 'zoomout', zoomreset: 'zoomreset', devtools: 'devtools', back: 'back', forward: 'forward', print: 'print' };
function run(id) {
  const fw = BrowserWindow.getFocusedWindow(), fc = fw && [...W.values()].find(c => c.win === fw); if (fc) C = fc; else useMain();
  if (id === 'newwindow') return createWindow(null, { cascade: true });
  if (id === 'closewindow') { if (fw) fw.close(); return; }
  if (id === 'scrap') return openScrap('');
  const sc = scrapOf(BrowserWindow.getFocusedWindow());
  if (sc) {                                                 // a little scrap has the keyboard: these keys act on it
    if (SCRAP_ACTIONS[id]) return tabAct(sc, SCRAP_ACTIONS[id]);
    if (id === 'close') return sc.win.close();
    if (id === 'scrapadopt') return toUI('scrap:adopt', { sid: sc.win.webContents.id });
    if (id === 'location') return sc.win.webContents.send('scrap:focus');
    if (id === 'copyurl') return clipboard.writeText(sc.wc.getURL());
    if (alive(C && C.win)) { C.win.show(); C.win.focus(); }            // anything else belongs to the main window
  }
  if (id === 'scrapadopt') return;
  if (MAIN_ACTIONS[id]) return tabAct(activeTab(), MAIN_ACTIONS[id]);
  if (id === 'findnext' || id === 'findprev') { if (C.panelOpen === 'find') return toOverlay('find:step', id === 'findnext' ? 1 : -1); return toUI('cmd', 'find'); }
  toUI('cmd', id);
}
function buildMenu() {
  const item = id => { const a = keys.ACTIONS.find(x => x.id === id), acc = keys.keyFor(id, P.keys); return { label: a.label, accelerator: acc || undefined, click: () => run(id) }; };
  const group = m => keys.ACTIONS.filter(a => a.menu === m).map(a => a.id);
  /* extensions' own shortcuts (manifest "commands"), unless one would take a Washi shortcut */
  const norm = a => { const p = String(a || '').split('+'); const k = p.pop().toUpperCase(); const mods = p.map(m => { m = m.toLowerCase(); return /^(cmdorctrl|commandorcontrol)$/.test(m) ? (process.platform === 'darwin' ? 'cmd' : 'ctrl') : /^(cmd|command|super|meta)$/.test(m) ? 'cmd' : /^(ctrl|control)$/.test(m) ? 'ctrl' : /^(alt|option)$/.test(m) ? 'alt' : m; }).sort(); return [...mods, k].join('+'); };
  const taken = new Set(keys.ACTIONS.map(a => keys.keyFor(a.id, P.keys)).filter(Boolean).map(norm));
  const ecmds = exts.commands().filter(c => { const n = norm(c.accel); if (taken.has(n)) return false; taken.add(n); return true; });
  exts.noteShortcuts(ecmds);
  const extItems = ecmds.map(c => ({ label: c.label, accelerator: c.accel, click: () => { const fw = BrowserWindow.getFocusedWindow(), fc = fw && [...W.values()].find(x => x.win === fw); if (fc) C = fc; else useMain(); const at = alive(C && C.win) ? activeTab() : null; if (c.action) toUI('ext:open', c.id); else exts.runCommand(c.id, c.name, at && at.wc); } }));
  const tpl = [
    { label: app.name, submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => toUI('cmd', 'settings:updates') }, { type: 'separator' }, item('settings'), { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { label: 'Start Fresh…', click: startFresh }, { type: 'separator' }, { label: `Quit ${app.name}`, accelerator: 'CmdOrCtrl+Q', click: (_, __, ev) => askQuit(ev) }] },
    { label: 'File', submenu: [...['newtab', 'newwindow', 'scrap', 'scrapadopt', 'location', 'newspace', 'newfolder'].map(item), { type: 'separator' }, item('closewindow'), { type: 'separator' }, ...['close', 'reopen', 'pin'].map(item), { type: 'separator' }, item('print')] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }, { type: 'separator' }, ...['find', 'findnext', 'findprev'].map(item), { type: 'separator' }, item('copyurl')] },
    { label: 'View', submenu: [item('today'), item('reader'), item('notes'), item('focus'), item('snapshot'), { type: 'separator' }, ...['sidebar', 'split'].map(item), { type: 'separator' }, ...['reload', 'hardreload'].map(item), { type: 'separator' }, ...['zoomin', 'zoomout', 'zoomreset'].map(item), { type: 'separator' }, ...['mute', 'pip'].map(item), { type: 'separator' }, item('devtools'), { role: 'togglefullscreen' }, ...(extItems.length ? [{ type: 'separator' }, { label: 'Extension Shortcuts', submenu: extItems }] : [])] },
    { label: 'History', submenu: [...['back', 'forward'].map(item), { type: 'separator' }, ...['history', 'archive', 'downloads'].map(item)] },
    { label: 'Bookmarks', submenu: [...['bookmark', 'bookmarks', 'bookmarkbar'].map(item)] },
    { label: 'Spaces', submenu: [...['nexttab', 'prevtab'].map(item), { type: 'separator' }, ...group('spaces').filter(i => i.startsWith('space:')).map(item), { type: 'separator' }, ...group('spaces').filter(i => i.startsWith('pin:')).map(item)] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [item('whatsnew'), { label: 'Quick-Start Guide', click: () => toUI('cmd', 'guide') }, { label: 'Keyboard Shortcuts', click: () => toUI('cmd', 'settings:keys') }, { label: 'Run Welcome Setup Again', click: () => toUI('cmd', 'setupagain') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------- app lifecycle ---------- */
const pendingUrls = [];
app.on('open-url', (e, url) => { e.preventDefault(); if (alive(C && C.win) && P.scrapLinks && /^https?:/.test(url)) openScrap(url); else if (alive(C && C.win)) toUI('tab:openRequest', { url }); else pendingUrls.push(url); });   // links from other apps
app.whenReady().then(async () => {
  if (process.argv.includes('--fresh')) await wipeData();
  setupUISession();
  autofill.init();
  web.setup(session.defaultSession);
  await Promise.race([exts.enable(session.defaultSession, { primary: true }), new Promise(r => setTimeout(r, 2500))]);   // extensions load before the first pages
  blocker.init();
  if (process.platform === 'darwin' && !app.isPackaged) try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}   // the built app gets it from icon.icns
  buildMenu();
  const order = WINS().order; if (!order.length) createWindow('w1'); else for (const wid of order) createWindow(wid);
  C.win.webContents.once('did-finish-load', () => later(() => { for (const u of pendingUrls.splice(0)) toUI('tab:openRequest', { url: u }); }, 1200));
  updater.start(s => { for (const c of W.values()) if (alive(c.win)) { c.win.webContents.send('update:state', s); if (c.overlay) c.overlay.webContents.send('update:state', s); } if (s.status === 'ready') offerUpdate(s); });
  later(() => blocker.refresh(false), 60 * 1000);                     // fresh blocklists, quietly, a minute after start
  setInterval(() => blocker.refresh(false), 12 * 3600 * 1000);
});
/* ⌘Q twice to quit (a stray ⌘Q, meant for ⌘W or ⌘A, doesn't lose your windows). Quit from the menu with the mouse,
   the Dock or a restart for an update quits straight away. Settings › Basics can turn it off. */
let quitAskAt = 0;
function askQuit(ev) {
  const byKey = !!(ev && ev.triggeredByAccelerator);
  if (!byKey || P.confirmQuit === false || !alive(C && C.win)) return app.quit();
  if (Date.now() - quitAskAt < 1800) { quitAskAt = 0; return app.quit(); }
  quitAskAt = Date.now();
  showFx({ type: 'toast', text: `Press ${process.platform === 'darwin' ? '⌘Q' : 'Ctrl+Q'} again to quit`, short: true });
}
let quitting = false;
app.on('before-quit', e => {
  appQuitting = true; if (HIST) { clearTimeout(histT); store.write('history.json', JSON.stringify(HIST)); }
  store.flush(); updater.onQuit();
  if (quitting || !web.P.clearOnExit) return;
  e.preventDefault(); quitting = true;
  web.clearData({ cookies: true, cache: true }).finally(() => app.quit());
});
app.on('will-quit', e => {                          // let a save that is still being written finish first
  store.flush();
  if (store.pending()) { e.preventDefault(); Promise.race([store.idle(), new Promise(r => later(r, 1500))]).then(() => { store.flush(); app.exit(0); }); }
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!W.size) createWindow(WINS().order[0] || 'w1'); });
