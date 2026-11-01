'use strict';
/* Washi: main process. Owns the window, the native page views, and the three interface views
   (shell = desk + top bar, sidebar, overlay = command bar / sheets / panels / effects). */
const { app, BrowserWindow, WebContentsView, Menu, session, shell, dialog, nativeTheme, clipboard, screen } = require('electron');

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
const os = require('os');
const pages = require('./app/pages');
const keys = require('./app/shortcuts');
const updater = require('./app/updater');

const EDGE = 16, TOP = 52, SB_W = 248, SB_PAD = 20;
const P = { search: 'https://www.google.com/search?q=%s', mode: 'light', autoPip: true, keys: {}, suggest: true };
let win = null, overlay = null, sidebar = null, uiSes = null;
let overlayOpen = false, panelOpen = null, dragging = false, menuOpen = false, fxTimer = null, recording = false;
let sbDocked = true, sbShown = false, lastIn = 0, lastLayout = null, curSpace = null;
const tabs = new Map();                        // id -> { id, view, wc, rect, visible, lastInput, playing, pip, tok }
let panes = { a: null, b: null, focus: 'a' };
let peek = null;                                // { view, wc }
const alive = w => w && !w.isDestroyed();
const toUI = (ch, ...a) => { if (alive(win)) win.webContents.send(ch, ...a); };
const toSide = (ch, ...a) => { if (sidebar && !sidebar.webContents.isDestroyed()) sidebar.webContents.send(ch, ...a); };
const toOverlay = (ch, ...a) => { if (overlay && !overlay.webContents.isDestroyed()) overlay.webContents.send(ch, ...a); };
const rr = r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) });
const nav = wc => { const h = wc.navigationHistory; return { canBack: h.canGoBack(), canFwd: h.canGoForward() }; };
const goBack = wc => wc.navigationHistory.goBack();
const goFwd = wc => wc.navigationHistory.goForward();
const token = () => require('crypto').randomBytes(12).toString('hex');
const searchURL = q => P.search.replace('%s', encodeURIComponent(q));
function activeTab() { const s = panes[panes.focus] || panes.a; return s && tabs.get(s.id); }

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
  else if (action === 'back') { t.notice = null; if (t.wc.navigationHistory.canGoBack()) goBack(t.wc); else toUI('tab:event', { id: t.id, closeMe: true }); }   // nowhere to go back to: close the tab, like Chrome
  else if (action === 'insecure' && kind === 'insecure') { web.httpOK.add(host); go(t.wc, target.replace(/^https:/, 'http:')).catch(() => {}); }
  else if (action === 'proceed' && kind === 'danger') { web.riskOK.add(host); go(t.wc, target).catch(() => {}); }
}
web.bind({ win: () => win, toast: f => showFx({ type: 'toast', ...f }), downloads: () => { const l = web.listDownloads(); toUI('dl:update', l); toOverlay('dl:update', l); }, onPerm: () => toOverlay('perms:update', web.listPerms()),
  danger: (wc, url, why) => { const t = [...tabs.values()].find(x => x.wc === wc); if (t) notice(t, 'danger', url, why); else if (peek && peek.wc === wc) wc.loadURL(pages.dangerous(url, why, 'x')); } });
blocker.onStats((id, n) => { const t = [...tabs.values()].find(x => x.wc.id === id); if (t) toUI('tab:event', { id: t.id, blocked: n }); });

/* ---------- page views ---------- */
const PIP_ON = `(() => { const v = [...document.querySelectorAll('video')].filter(v => !v.paused && v.readyState > 2 && !v.disablePictureInPicture).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!v) return false; if (document.pictureInPictureElement === v) return true; return v.requestPictureInPicture().then(() => true, () => false); })()`;
const PIP_OFF = `(document.pictureInPictureElement ? document.exitPictureInPicture().then(() => true, () => false) : false)`;
function ensureTab(id, url, space) {
  if (tabs.has(id)) return tabs.get(id);
  const ses = web.pageSession(space);                        // the tab's own space decides its login jar (null = the shared one)
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: ses, safeDialogs: true, spellcheck: true } });
  try { view.setBorderRadius(12); } catch {}
  const t = { id, view, wc: view.webContents, rect: null, visible: false, lastInput: 0, playing: false };
  tabs.set(id, t);
  view.setVisible(false);
  win.contentView.addChildView(view, 0);
  hook(t);
  if (url) go(t.wc, url).catch(() => {});
  return t;
}
const OK_SCHEMES = new Set(['http:', 'https:', 'about:', 'data:', 'blob:', 'file:', 'view-source:', 'chrome:', 'devtools:']);
const askedApps = new Map();
async function external(url, wc) {             // links to other apps (mailto:, zoommtg:, slack:…) ask before leaving the browser
  let u; try { u = new URL(url); } catch { return; }
  if (u.protocol === 'javascript:') return;
  const from = (() => { try { return new URL(wc.getURL()).host; } catch { return 'This page'; } })(), key = from + '|' + u.protocol;
  if (!askedApps.has(key)) {
    const r = await dialog.showMessageBox(win, { type: 'question', message: `Open this link in another app?`, detail: `${from} wants to open a “${u.protocol.slice(0, -1)}” link:\n${url.slice(0, 160)}`, buttons: ['Open', 'Cancel'], defaultId: 0, cancelId: 1, checkboxLabel: `Always allow ${from} to open these links`, checkboxChecked: false });
    if (r.response !== 0) return; if (r.checkboxChecked) askedApps.set(key, true);
  }
  shell.openExternal(url).catch(() => {});
}
function go(wc, url) { web.matchUA(wc, url); return wc.loadURL(url); }   // load a web address with the right identity for it
function hook(t) {
  const { wc, id } = t;
  const send = p => toUI('tab:event', { id, ...p });
  wc.on('render-process-gone', (_, d) => { logCrash('tab', d); if (d.reason !== 'clean-exit' && !wc.isDestroyed()) { send({ crashed: true }); setTimeout(() => { try { wc.reload(); } catch {} }, 300); } });
  wc.on('input-event', (_, i) => { if (/^(mouseDown|keyDown|rawKeyDown|touchStart|gestureTap)$/.test(i.type)) t.lastInput = Date.now(); });
  wc.on('page-title-updated', (_, title) => { if (!pages.isNotice(wc.getURL())) send({ title }); });
  wc.on('page-favicon-updated', (_, favs) => { if (favs[0] && /^(https?|data):/.test(favs[0])) send({ fav: favs[0] }); });
  wc.on('did-start-loading', () => send({ loading: true }));
  wc.on('did-stop-loading', () => send({ loading: false, ...(pages.isNotice(wc.getURL()) ? {} : { url: wc.getURL() }), ...nav(wc) }));
  wc.on('did-navigate', (_, url) => { if (!pages.isNotice(url)) { t.failed = null; t.notice = null; web.upgraded.delete(wc.id); } send({ ...(pages.isNotice(url) ? {} : { url, notice: null }), ...nav(wc), blocked: 0 }); });
  wc.on('did-navigate-in-page', (_, url, isMain) => { if (isMain) send({ url, ...nav(wc) }); });
  wc.on('media-started-playing', () => { t.playing = true; send({ audible: true }); });
  wc.on('media-paused', () => { t.playing = false; send({ audible: false }); });
  wc.on('audio-state-changed', e => send({ audible: !!e.audible }));
  wc.on('found-in-page', (_, r) => { if (panelOpen === 'find' && activeTab() === t) toOverlay('find:result', { active: r.activeMatchOrdinal, total: r.matches }); });
  wc.on('zoom-changed', () => setTimeout(() => showZoom(wc), 0));
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
    const from = web.upgraded.get(wc.id);
    if (from && url.startsWith('https://') && url.slice(8) === from.slice(7) && code <= -100 && code > -400) { web.upgraded.delete(wc.id); return notice(t, 'insecure', from); }   // https-first didn't work for this site
    notice(t, 'failed', url, desc.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()));
  });
  wc.setWindowOpenHandler(({ url, disposition, features }) => {
    let p = ''; try { p = new URL(url).protocol; } catch {}
    if (p && !OK_SCHEMES.has(p)) { external(url, wc); return { action: 'deny' }; }
    const gesture = Date.now() - t.lastInput < 1500;
    if (disposition === 'new-window' && features) {                         // real popups (sign-in windows and such)
      if (!gesture) { blockedPopup(t, url); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 520, height: 680, webPreferences: { sandbox: true, contextIsolation: true } } };
    }
    if (!gesture && disposition !== 'background-tab') { blockedPopup(t, url); return { action: 'deny' }; }
    if (disposition === 'new-window') { openPeek(url); return { action: 'deny' }; }      // shift-click: peek at it
    toUI('tab:openRequest', { url, from: id, bg: disposition === 'background-tab' });
    return { action: 'deny' };
  });
  wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape' && panelOpen === 'find') { e.preventDefault(); closeOverlay(); } });
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
    const n = nav(wc);
    m.push({ label: 'Back', enabled: n.canBack, click: () => goBack(wc) }, { label: 'Forward', enabled: n.canFwd, click: () => goFwd(wc) }, { label: 'Reload', click: () => reloadTab(t) }, { type: 'separator' },
      { label: 'Print…', click: () => wc.print({}, () => {}) }, { label: 'View Page Source', click: () => open('view-source:' + wc.getURL()) }, { label: 'Inspect Element', click: () => wc.inspectElement(p.x, p.y) });
    menuOpen = true; Menu.buildFromTemplate(m).popup({ window: win, callback: () => { menuOpen = false; } });
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
  for (const k of ['a', 'b']) { const s = panes[k]; if (s && tabs.has(s.id)) want.set(s.id, s); }
  for (const [id, t] of tabs) {
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
  if (overlayOpen) return;
  const t = activeTab();
  if (t) t.wc.focus(); else if (alive(win)) win.webContents.focus();
}

sec.handle('tab:ensure', (_, id, url, space) => { ensureTab(id, url, space); return true; });
sec.handle('panes:set', (_, p, fp) => {
  const before = activeTab(); panes = p; if (p.space) curSpace = p.space; applyPanes();
  if (panelOpen === 'find' && activeTab() !== before) closeOverlay();
  if (fp) focusPage(); return true;
});
sec.on('tab:close', (_, id) => {
  const t = tabs.get(id); if (!t) return;
  tabs.delete(id);
  try { win.contentView.removeChildView(t.view); } catch {}
  try { t.wc.close(); } catch {}
});
sec.on('tab:nav', (_, id, url) => { const t = tabs.get(id); if (t) { t.notice = null; go(t.wc, url).catch(() => {}); } });
sec.on('tab:act', (_, id, a) => tabAct(tabs.get(id), a));
function tabAct(t, a) {
  if (!t) return; const wc = t.wc;
  if (a === 'back') goBack(wc); else if (a === 'forward') goFwd(wc);
  else if (a === 'reload') reloadTab(t); else if (a === 'hardreload') wc.reloadIgnoringCache();
  else if (a === 'stop') wc.stop(); else if (a === 'devtools') wc.toggleDevTools();
  else if (a === 'mute') { wc.setAudioMuted(!wc.isAudioMuted()); toUI('tab:event', { id: t.id, muted: wc.isAudioMuted() }); }
  else if (a === 'pip') wc.executeJavaScript(`document.pictureInPictureElement ? (document.exitPictureInPicture(), 'off') : ${PIP_ON}`, true).then(r => { if (r === false) showFx({ type: 'toast', text: 'No playing video on this page', short: true }); }).catch(() => {});
  else if (a === 'print') wc.print({}, () => {});
  else if (a === 'zoomin' || a === 'zoomout' || a === 'zoomreset') { const steps = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5], z = wc.getZoomFactor(); const i = steps.findIndex(s => s >= z - .001); wc.setZoomFactor(a === 'zoomreset' ? 1 : a === 'zoomin' ? steps[Math.min(steps.length - 1, (steps[i] > z + .001 ? i : i + 1))] : steps[Math.max(0, i - 1)]); showZoom(wc); }
}
sec.on('copy', (_, s) => clipboard.writeText(String(s)));
sec.on('reveal', (_, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });
sec.handle('state:load', () => [store.read('state.json'), store.read('history.json')]);
sec.on('state:save', (_, s) => { if (typeof s === 'string' && s.length < 20e6) store.writeSoon('state.json', s); });
sec.on('hist:save', (_, s) => { if (typeof s === 'string' && s.length < 40e6) store.writeSoon('history.json', s); });
sec.on('menu:popup', (_, tpl) => {
  const wire = items => items.map(i => i.type === 'separator' ? i : i.submenu ? { label: String(i.label), submenu: wire(i.submenu) } : { label: String(i.label), type: i.checked !== undefined ? 'checkbox' : 'normal', checked: !!i.checked, enabled: i.enabled !== false, click: () => toUI('menu:click', i.id) });
  menuOpen = true;
  Menu.buildFromTemplate(wire(tpl)).popup({ window: win, callback: () => { menuOpen = false; if (sbShown) sbLeaveSoon(350); } });
});

/* ---------- sidebar view: docked, or floating and revealed by hovering the left edge ---------- */
/* Floating: the sidebar view always sits in place, slid off to the left so only a thin strip of it stays over the
   desk edge. Moving a view never repaints it, so the sheet is ready to slide in the instant the pointer touches the strip.
   The sidebar page itself reports pointer enter/leave (no polling). */
const SB_FW = SB_W + SB_PAD;
let sbClosing = null, sbHideT = null;
function sbBounds() {
  const [, h] = win.getContentSize(), H = Math.max(0, h - TOP);
  if (sbDocked) return { x: 0, y: TOP, width: SB_W, height: H };
  return { x: sbShown || sbClosing ? 0 : EDGE - SB_FW, y: TOP, width: SB_FW, height: H };
}
function applySidebar() { if (!alive(win) || !sidebar) return; sidebar.setBounds(sbBounds()); sidebar.setVisible(true); }
function sbMode() { toSide('sb:mode', { docked: sbDocked, open: sbDocked || sbShown }); toUI('cmd', sbShown ? 'edge:off' : 'edge:on'); }
function showSb() {
  clearTimeout(sbHideT); if (sbShown) return;
  sbShown = true; clearTimeout(sbClosing); sbClosing = null; applySidebar(); sbMode();
}
function hideSb() {
  if (!sbShown) return; sbShown = false; sbMode();
  clearTimeout(sbClosing); sbClosing = setTimeout(() => { sbClosing = null; if (!sbShown && !sbDocked) applySidebar(); }, 190);   // after the slide-out
}
function pointerInSb() {
  if (!alive(win)) return false;
  const p = screen.getCursorScreenPoint(), b = win.getContentBounds(), x = p.x - b.x, y = p.y - b.y;
  return x >= -2 && x < SB_FW && y >= TOP - 4 && y < b.height + 2;
}
function sbLeaveSoon(ms = 200) { clearTimeout(sbHideT); sbHideT = setTimeout(() => { if (!dragging && !menuOpen && !pointerInSb()) hideSb(); }, ms); }
sec.on('sb:hover', (_, inside) => {
  if (sbDocked) return;
  if (inside) { if (sbShown || win.isFocused()) showSb(); }
  else if (sbShown && !dragging && !menuOpen) sbLeaveSoon();
});
sec.handle('side:set', (_, m) => { sbDocked = !!m.docked; sbShown = false; applySidebar(); sbMode(); return true; });
sec.on('sb:state', (_, s) => toSide('sb:state', s));
sec.on('sb:fx', (_, f) => toSide('sb:fx', f));
sec.on('sb:ready', () => { sbMode(); toUI('sb:ready'); });
sec.on('sb:intent', (_, m) => toUI('sb:intent', m));
sec.on('layout:info', (_, l) => { lastLayout = l; if (panelOpen === 'find') placeFind(); });

/* ---------- drag a tab out of the sidebar to split ---------- */
sec.on('drag:msg', (_, m) => {
  if (!overlay || overlayOpen) return;
  if (m.type === 'start') { dragging = true; clearTimeout(fxTimer); fitOverlay(); overlay.setVisible(true); toOverlay('overlay:drag', { ...m, layout: lastLayout }); }
  else if (m.type === 'move') toOverlay('overlay:drag', m);
  else if (m.type === 'end') {
    dragging = false; toOverlay('overlay:drag', { type: 'end' }); if (sbShown) sbLeaveSoon(350);
    setTimeout(() => { if (!dragging && !overlayOpen) overlay.setVisible(false); }, 700);
    toUI('sb:intent', { type: 'dropTab', id: m.id, x: m.x, y: m.y, cancel: !!m.cancel });
  }
});

/* ---------- overlay: command bar, sheets, panels (find, shield), peek, effects ---------- */
function fitOverlay() { const [w, h] = win.getContentSize(); overlay.setBounds({ x: 0, y: 0, width: w, height: h }); }
function showFx(f) {
  if (overlayOpen || dragging || !overlay || !alive(win)) return;
  const [w, h] = win.getContentSize();
  overlay.setBounds(f.type === 'toast' ? { x: Math.round((w - 520) / 2), y: h - 100, width: 520, height: 88 } : { x: 0, y: 0, width: w, height: h });
  overlay.setVisible(true);
  toOverlay('overlay:fx', f);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { if (!overlayOpen && !dragging) overlay.setVisible(false); }, f.type === 'toast' ? (f.short ? 1600 : f.action || f.reveal ? 6000 : 4200) : 1000);
}
sec.on('toast:act', (_, a) => { clearTimeout(fxTimer); overlay.setVisible(false); if (a && a.cmd === 'openUrl' && /^https?:/.test(a.url)) toUI('tab:openRequest', { url: a.url }); else if (a && a.cmd === 'update:install') updater.install(); else if (a && a.cmd === 'reveal' && a.path && fs.existsSync(a.path)) shell.showItemInFolder(a.path); else if (a && typeof a.cmd === 'string') toUI('cmd', a.cmd); });
function closeOverlay() {
  if (panelOpen === 'find') { const t = activeTab(); if (t) t.wc.stopFindInPage('keepSelection'); }
  if (peek) closePeek(true);
  overlayOpen = false; panelOpen = null; overlay.setVisible(false); toOverlay('overlay:closed'); focusPage();
}
sec.on('fx', (_, f) => showFx(f));
sec.handle('overlay:open', (_, payload) => {
  if (peek) closePeek(true);
  overlayOpen = true; panelOpen = null; clearTimeout(fxTimer);
  fitOverlay(); overlay.setVisible(true); overlay.webContents.focus();
  toOverlay('overlay:init', payload);
  return true;
});
/* small panels that sit over part of the window (find bar, blocking popover), so the page stays usable */
sec.handle('overlay:panel', (_, kind, rect, data) => {
  if (dragging) return false;
  if (peek) closePeek(true);
  overlayOpen = true; panelOpen = kind; clearTimeout(fxTimer);
  if (kind === 'find') placeFind(); else overlay.setBounds(rr({ x: rect.x, y: rect.y, width: rect.w, height: rect.h }));
  overlay.setVisible(true); overlay.webContents.focus();
  toOverlay('overlay:init', { mode: 'panel', kind, data });
  return true;
});
function placeFind() {
  if (!lastLayout || !overlay) return;
  const r = (lastLayout.split && panes.focus === 'b' ? lastLayout.b : lastLayout.a) || lastLayout.stage;
  overlay.setBounds(rr({ x: r.x + r.w - 396, y: r.y + 10, width: 386, height: 64 }));
}
sec.on('find:query', (_, q) => {
  const t = activeTab(); if (!t) return;
  if (!q || !q.text) { t.wc.stopFindInPage('clearSelection'); toOverlay('find:result', { active: 0, total: 0 }); return; }
  t.wc.findInPage(String(q.text).slice(0, 300), { forward: q.dir !== -1, findNext: !!q.next, matchCase: false });
});
sec.on('overlay:result', (_, r) => { closeOverlay(); toUI('overlay:result', r); });
sec.on('overlay:cancel', () => { closeOverlay(); toUI('overlay:cancel'); });

/* peek: look at a link in a floating paper card without opening a tab */
function peekRect() {
  const s = lastLayout ? lastLayout.stage : (() => { const [w, h] = win.getContentSize(); return { x: 12, y: TOP, w: w - 24, h: h - TOP - 12 }; })();
  const w = Math.min(s.w - 80, 1100), h = s.h - 86;
  return { x: Math.round(s.x + (s.w - w) / 2), y: Math.round(s.y + 62), w: Math.round(w), h: Math.round(h) };
}
function openPeek(url) {
  if (!alive(win) || !/^https?:/.test(url)) return;
  if (peek) closePeek(true);
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: web.pageSession(curSpace), safeDialogs: true } });
  try { view.setBorderRadius(10); } catch {}
  const wc = view.webContents, r = peekRect();
  peek = { view, wc, url };
  overlayOpen = true; panelOpen = 'peek'; clearTimeout(fxTimer);
  fitOverlay(); overlay.setVisible(true);
  win.contentView.addChildView(view);                         // above the overlay, inside the paper card it draws
  view.setBounds(rr({ x: r.x, y: r.y, width: r.w, height: r.h }));
  const info = () => { if (!wc.isDestroyed()) toOverlay('peek:info', { url: wc.getURL() || url, title: wc.getTitle(), loading: wc.isLoading() }); };
  for (const ev of ['did-start-loading', 'did-stop-loading', 'page-title-updated', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, info);
  wc.setWindowOpenHandler(({ url: u }) => { if (/^https?:/.test(u)) toUI('tab:openRequest', { url: u }); return { action: 'deny' }; });
  wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') { e.preventDefault(); closeOverlay(); } });
  wc.on('did-start-navigation', d => { if (d.isMainFrame && !d.isSameDocument) web.matchUA(wc, d.url); });
  wc.on('will-redirect', d => { if (d.isMainFrame && web.needsUA(wc, d.url) && d.method !== 'POST') { d.preventDefault(); web.matchUA(wc, d.url); wc.loadURL(d.url).catch(() => {}); } });
  toOverlay('overlay:init', { mode: 'peek', rect: r, url });
  web.matchUA(wc, url);
  wc.loadURL(url).catch(() => {});
  wc.focus();
}
function closePeek(destroy) {
  if (!peek) return; const p = peek; peek = null;
  try { win.contentView.removeChildView(p.view); } catch {}
  if (destroy) try { p.wc.close(); } catch {}
  toOverlay('peek:closed');
}
sec.on('peek:open', (_, url) => openPeek(url));
sec.handle('peek:adopt', (_, id, space) => {               // "Open as tab": the peeked page becomes a real tab, keeping its state
  if (!peek || tabs.has(id)) return null;
  const p = peek; peek = null;
  try { win.contentView.removeChildView(p.view); } catch {}
  p.wc.removeAllListeners('did-start-loading'); p.wc.removeAllListeners('did-stop-loading'); p.wc.removeAllListeners('page-title-updated'); p.wc.removeAllListeners('did-navigate'); p.wc.removeAllListeners('did-navigate-in-page'); p.wc.removeAllListeners('before-input-event');
  const t = { id, view: p.view, wc: p.wc, rect: null, visible: false, lastInput: Date.now(), playing: false };
  tabs.set(id, t); p.view.setVisible(false); try { p.view.setBorderRadius(12); } catch {} win.contentView.addChildView(p.view, 0); hook(t);
  overlayOpen = false; panelOpen = null; overlay.setVisible(false);
  void space;
  return { url: p.wc.getURL(), title: p.wc.getTitle() };
});

/* ---------- settings coming from the interface ---------- */
let menuKeys = '';
sec.on('prefs:sync', (_, p) => {
  Object.assign(P, p);
  try { nativeTheme.themeSource = P.mode === 'auto' ? 'system' : P.mode === 'dark' ? 'dark' : 'light'; } catch {}   // sites that support dark mode follow along
  web.configure({ gpc: p.gpc, askDownload: p.askDownload, httpsFirst: p.httpsFirst, safety: p.safety, blocking: p.blocking, clearOnExit: p.clearOnExit, dns: p.dns });
  const k = JSON.stringify(P.keys || {}); if (k !== menuKeys && !recording) { menuKeys = k; buildMenu(); }
});
sec.on('keys:recording', (_, on) => {                        // while a shortcut is being recorded, the menu mustn't grab the keys
  recording = !!on;
  if (recording) Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: app.name, submenu: [{ role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'paste' }] }]));
  else { menuKeys = JSON.stringify(P.keys || {}); buildMenu(); }
});
sec.handle('keys:list', () => ({ actions: keys.ACTIONS, custom: P.keys || {} }));
sec.on('setup:msg', (_, m) => toUI('setup:msg', m));
const isDefault = () => { try { return app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http'); } catch { return false; } };
sec.handle('setup:info', () => ({ packaged: app.isPackaged, isDefault: isDefault(), version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, update: updater.state(), lists: blocker.listDate(), perms: web.listPerms() }));
sec.handle('setup:act', async (_, a) => {
  if (a.type === 'defaultBrowser') {
    if (!app.isPackaged) return { ok: false, isDefault: false, why: 'dev' };
    app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https');
    await new Promise(r => setTimeout(r, 1500));                    // macOS asks the user to confirm; check again after
    return { ok: true, isDefault: isDefault() };
  }
  if (a.type === 'clearData') { await web.clearData(a); if (a.history) toUI('setup:msg', { type: 'cleared' }); return { ok: true }; }
  if (a.type === 'startFresh') { closeOverlay(); setTimeout(startFresh, 50); return { ok: true }; }
  if (a.type === 'perm:reset') { web.resetPerm(a.origin, a.perm); return web.listPerms(); }
  if (a.type === 'perms') return web.listPerms();
  if (a.type === 'perf') return perfReport();
  if (a.type === 'update:check') return updater.check();
  if (a.type === 'update:install') { updater.install(); return { ok: true }; }
  if (a.type === 'lists:refresh') { const r = await blocker.refresh(true); return { ...r, at: blocker.listDate() }; }
  if (a.type === 'blocking:site') { blocker.setException(a.host, !a.block); const t = activeTab(); if (t) t.wc.reload(); return { ok: true }; }
  if (a.type === 'blocking:info') { const t = activeTab(); let host = ''; try { host = new URL(t.wc.getURL()).hostname.replace(/^www\./, ''); } catch {} return { host, count: t ? blocker.countFor(t.wc.id) : 0, allowed: blocker.allowedOn(host), mode: blocker.getMode() }; }
  return { ok: false };
});
/* ---------- speed check (Settings → Help) ---------- */
let lagMax = 0, lagAt = Date.now();
setInterval(() => { const now = Date.now(), d = now - lagAt - 250; lagAt = now; if (d > lagMax) lagMax = d; }, 250).unref?.();
async function perfReport() {
  lagMax = 0; await new Promise(r => setTimeout(r, 3000));
  const m = app.getAppMetrics(), byPid = new Map(m.map(x => [x.pid, x]));
  const pct = x => Math.round((x && x.cpu ? x.cpu.percentCPUUsage : 0) * 10) / 10, mb = x => Math.round(((x && x.memory ? x.memory.workingSetSize : 0) / 1024));
  const sum = list => ({ cpu: Math.round(list.reduce((a, x) => a + pct(x), 0) * 10) / 10, mem: list.reduce((a, x) => a + mb(x), 0) });
  const uiPids = new Set([win, sidebar, overlay].filter(Boolean).map(v => (v.webContents || v).getOSProcessId()));
  const pageProcs = []; let top = null;
  for (const t of tabs.values()) {
    if (t.wc.isDestroyed()) continue; const x = byPid.get(t.wc.getOSProcessId()); if (!x) continue;
    pageProcs.push(x); if (!top || pct(x) > top.cpu) top = { title: (t.wc.getTitle() || t.wc.getURL()).slice(0, 40), cpu: pct(x) };
  }
  const gs = app.getGPUFeatureStatus(), gpu = /^enabled/.test(gs.gpu_compositing || '');
  const r = { gpu, lagMax: Math.round(lagMax), ui: sum(m.filter(x => uiPids.has(x.pid)).concat(m.filter(x => x.type === 'Browser'))), pages: { ...sum([...new Set(pageProcs)]), n: tabs.size },
    gpuProc: sum(m.filter(x => x.type === 'GPU')), top };
  r.text = [`Washi ${app.getVersion()} · Chromium ${process.versions.chrome} · ${process.platform} ${process.arch} · ${os.release()}`,
    `GPU: ${JSON.stringify(gs)}`, `Main-process worst stall: ${r.lagMax} ms`, `Interface: ${r.ui.cpu}% CPU, ${r.ui.mem} MB`,
    `Pages (${r.pages.n}): ${r.pages.cpu}% CPU, ${r.pages.mem} MB; busiest: ${top ? top.title + ' ' + top.cpu + '%' : '-'}`, `GPU process: ${r.gpuProc.cpu}% CPU, ${r.gpuProc.mem} MB`,
    `Processes: ${m.map(x => `${x.type}:${pct(x)}%/${mb(x)}MB`).join(' ')}`, `Blocking: ${blocker.getMode()} · sidebar ${sbDocked ? 'docked' : 'floating'}`].join('\n');
  return r;
}
sec.handle('dl:list', () => web.listDownloads());
sec.on('dl:act', (_, id, a) => web.dlAct(id, a));
sec.handle('suggest', async (_, q, tpl) => {                // search suggestions for the command bar
  if (!P.suggest || !q || q.length > 200 || !tpl) return [];
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 1500);
    const r = await session.defaultSession.fetch(tpl.replace('%s', encodeURIComponent(q)), { signal: ctl.signal, credentials: 'omit' }); clearTimeout(tm);
    const j = JSON.parse(await r.text()); const list = Array.isArray(j) ? j[1] : (j.suggestions || []).map(s => s.phrase || s);
    return (Array.isArray(list) ? list : []).map(s => typeof s === 'string' ? s : s && (s.phrase || s.q)).filter(s => typeof s === 'string').slice(0, 6);
  } catch { return []; }
});

/* ---------- window + interface views ---------- */
let pollA = null, pollB = null;
function uiView(page) {
  const v = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, session: uiSes, spellcheck: false } });
  v.setBackgroundColor('#00000000'); sec.trustUI(v.webContents); v.webContents.loadURL(proto.url(page)); return v;
}
function createWindow() {
  const b = store.readJSON('bounds.json', {});
  win = new BrowserWindow({
    width: b.width || 1320, height: b.height || 840, x: b.x, y: b.y, minWidth: 760, minHeight: 500,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 }, backgroundColor: '#ffb77c', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, session: uiSes, spellcheck: false }
  });
  sec.trustUI(win.webContents);
  win.loadURL(proto.url('index.html'));
  win.once('ready-to-show', () => win.show());
  sidebar = uiView('sidebar.html'); win.contentView.addChildView(sidebar); applySidebar();
  overlay = uiView('overlay.html'); win.contentView.addChildView(overlay); overlay.setVisible(false);
  win.on('resize', () => { applySidebar(); if (overlayOpen && !panelOpen) fitOverlay(); if (panelOpen === 'find') placeFind(); if (peek) { const r = peekRect(); peek.view.setBounds(rr({ x: r.x, y: r.y, width: r.w, height: r.h })); toOverlay('overlay:init', { mode: 'peek', rect: r, url: peek.wc.getURL(), resize: true }); } });
  win.on('close', () => store.writeJSON('bounds.json', win.getBounds()));
  win.on('closed', () => { win = null; overlay = null; sidebar = null; tabs.clear(); peek = null; clearInterval(pollA); clearInterval(pollB); });
  pollB = setInterval(() => {                      // split view: which pane did the user click into?
    if (!win || !panes.b) return;
    for (const k of ['a', 'b']) { const t = panes[k] && tabs.get(panes[k].id); if (t && t.wc.isFocused() && panes.focus !== k) { panes.focus = k; toUI('pane:focus', k); } }
  }, 200);
}
/* The interface has its own session: it may only load its own files and images (favicons); nothing else leaves it. */
function setupUISession() {
  uiSes = session.fromPartition('washi-ui');
  proto.serve(uiSes);
  uiSes.webRequest.onBeforeRequest((d, cb) => {
    if (/^(washi|data|devtools):/.test(d.url) || (d.resourceType === 'image' && /^https?:/.test(d.url))) return cb({});
    cb({ cancel: true });
  });
  uiSes.setPermissionRequestHandler((_, __, cb) => cb(false));
  uiSes.setPermissionCheckHandler(() => false);
}

/* ---------- start fresh ---------- */
async function wipeData() {
  for (const n of ['state.json', 'history.json', 'bounds.json', 'crash.log', 'site-permissions.json', 'downloads.json', 'blocking-exceptions.json']) store.remove(n);
  await web.clearData({ cookies: true, cache: true });
  try { await session.defaultSession.clearStorageData(); } catch {}
}
async function startFresh() {
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Start Fresh', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Start Washi from scratch?', detail: 'This erases your tabs, spaces, settings, site permissions and cookies, then reopens Washi as if it was just installed.' });
  if (r.response !== 0) return;
  await wipeData(); app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--fresh') }); app.exit(0);
}

/* ---------- menu bar, built from the shortcut list so custom keys show up everywhere ---------- */
const MAIN_ACTIONS = { reload: 'reload', hardreload: 'hardreload', zoomin: 'zoomin', zoomout: 'zoomout', zoomreset: 'zoomreset', devtools: 'devtools', back: 'back', forward: 'forward', print: 'print', mute: 'mute', pip: 'pip' };
function run(id) {
  if (MAIN_ACTIONS[id]) return tabAct(activeTab(), MAIN_ACTIONS[id]);
  if (id === 'findnext' || id === 'findprev') { if (panelOpen === 'find') return toOverlay('find:step', id === 'findnext' ? 1 : -1); return toUI('cmd', 'find'); }
  toUI('cmd', id);
}
function buildMenu() {
  const item = id => { const a = keys.ACTIONS.find(x => x.id === id), acc = keys.keyFor(id, P.keys); return { label: a.label, accelerator: acc || undefined, click: () => run(id) }; };
  const group = m => keys.ACTIONS.filter(a => a.menu === m).map(a => a.id);
  const tpl = [
    { label: app.name, submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => toUI('cmd', 'settings:updates') }, { type: 'separator' }, item('settings'), { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { label: 'Start Fresh…', click: startFresh }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [...['newtab', 'location', 'newspace', 'newfolder'].map(item), { type: 'separator' }, ...['close', 'reopen', 'pin'].map(item), { type: 'separator' }, item('print')] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }, { type: 'separator' }, ...['find', 'findnext', 'findprev'].map(item), { type: 'separator' }, item('copyurl')] },
    { label: 'View', submenu: [...['sidebar', 'split'].map(item), { type: 'separator' }, ...['reload', 'hardreload'].map(item), { type: 'separator' }, ...['zoomin', 'zoomout', 'zoomreset'].map(item), { type: 'separator' }, ...['mute', 'pip'].map(item), { type: 'separator' }, item('devtools'), { role: 'togglefullscreen' }] },
    { label: 'History', submenu: [...['back', 'forward'].map(item), { type: 'separator' }, ...['history', 'archive', 'downloads'].map(item)] },
    { label: 'Spaces', submenu: [...['nexttab', 'prevtab'].map(item), { type: 'separator' }, ...group('spaces').filter(i => i.startsWith('space:')).map(item), { type: 'separator' }, ...group('spaces').filter(i => i.startsWith('pin:')).map(item)] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Quick-Start Guide', click: () => toUI('cmd', 'guide') }, { label: 'Keyboard Shortcuts', click: () => toUI('cmd', 'settings:keys') }, { label: 'Run Welcome Setup Again', click: () => toUI('cmd', 'setupagain') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------- app lifecycle ---------- */
const pendingUrls = [];
app.on('open-url', (e, url) => { e.preventDefault(); if (alive(win)) toUI('tab:openRequest', { url }); else pendingUrls.push(url); });
app.whenReady().then(async () => {
  if (process.argv.includes('--fresh')) await wipeData();
  setupUISession();
  web.setup(session.defaultSession);
  blocker.init();
  if (process.platform === 'darwin' && !app.isPackaged) try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}   // the built app gets it from icon.icns
  buildMenu(); createWindow();
  win.webContents.once('did-finish-load', () => setTimeout(() => { for (const u of pendingUrls.splice(0)) toUI('tab:openRequest', { url: u }); }, 1200));
  updater.start(s => { toUI('update:state', s); toOverlay('update:state', s); if (s.status === 'ready') showFx({ type: 'toast', text: `Washi ${s.version} is ready`, action: { label: 'Restart', cmd: 'update:install' } }); });
  setTimeout(() => blocker.refresh(false), 60 * 1000);                     // fresh blocklists, quietly, a minute after start
  setInterval(() => blocker.refresh(false), 12 * 3600 * 1000);
});
let quitting = false;
app.on('before-quit', e => {
  store.flush(); updater.onQuit();
  if (quitting || !web.P.clearOnExit) return;
  e.preventDefault(); quitting = true;
  web.clearData({ cookies: true, cache: true }).finally(() => app.quit());
});
app.on('will-quit', e => {                          // let a save that is still being written finish first
  store.flush();
  if (store.pending()) { e.preventDefault(); Promise.race([store.idle(), new Promise(r => setTimeout(r, 1500))]).then(() => { store.flush(); app.exit(0); }); }
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
