'use strict';
/* Content blocking (ads, trackers, and in Strict mode cookie banners) plus dangerous-site protection.
   Ships with ready-built lists so it works on first launch and offline; refreshes them in the background every few days. */
const { net } = require('electron');
const fs = require('fs'), path = require('path');
const { ElectronBlocker, Request, adsAndTrackingLists, fullLists } = require('@ghostery/adblocker-electron');
const PRELOAD_PATH = require.resolve('@ghostery/adblocker-electron-preload');
const phish = require('./phish');
const store = require('./store');
const SOURCES = require('./lists.json');

const BUNDLED = path.join(__dirname, '..', 'resources', 'lists');
const REFRESH_MS = 3 * 24 * 3600 * 1000;
const engines = { standard: null, strict: null, safety: null };
let phishSet = null, mode = 'standard';
const exceptions = new Set(store.readJSON('blocking-exceptions.json', []));   // hosts where the user turned blocking off
const stats = new Map();                                                      // webContents id -> { host, count }

function loadBin(name) {
  for (const dir of [store.file('lists'), BUNDLED]) {
    try { const buf = fs.readFileSync(path.join(dir, name + '.bin')); return { buf, from: dir }; } catch {}
  }
  return null;
}
function loadEngine(name) {
  const b = loadBin(name); if (!b) return null;
  try { return ElectronBlocker.deserialize(new Uint8Array(b.buf)); }
  catch { if (b.from !== BUNDLED) { try { return ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(path.join(BUNDLED, name + '.bin')))); } catch {} } return null; }
}
function ensure(name) { if (!engines[name]) engines[name] = loadEngine(name); return engines[name]; }
function init() {
  ensure('safety');
  const p = loadBin('phish'); if (p) phishSet = phish.load(p.buf);
  if (mode !== 'off') ensure(mode);
}
function setMode(m) { mode = ['off', 'standard', 'strict'].includes(m) ? m : 'standard'; if (mode !== 'off') ensure(mode); }
const active = () => mode === 'off' ? null : engines[mode];

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const topHost = d => { try { const wc = d.webContents; if (wc && !wc.isDestroyed()) return hostOf(wc.getURL()); } catch {} return hostOf(d.referrer || ''); };
const allowedOn = host => exceptions.has(host);

/* YouTube's player talks to YouTube's own servers for playback, stats and heartbeats; blocking any of those can leave
   the player blank (seen signed in). On YouTube, its own servers are left alone: ads are still stripped out of the page
   by the cosmetic filters, and other companies' trackers are still blocked. */
const YT_PAGE = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/, YT_OWN = /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com|ytimg\.com|ggpht\.com|youtubei\.googleapis\.com)$/;
const ytOwn = (page, url) => { if (!page || !YT_PAGE.test(page)) return false; try { return YT_OWN.test(new URL(url).hostname); } catch { return false; } };
/* subresource blocking; returns true when it answered the request */
function onRequest(d, cb) {
  const e = active(); if (!e || d.resourceType === 'mainFrame') return false;
  const host = topHost(d); if (host && allowedOn(host)) return false;
  if (ytOwn(host, d.url)) return false;
  let res = null;
  e.onBeforeRequest(d, r => { res = r; });                         // the engine answers synchronously
  if (res && (res.cancel || res.redirectURL)) {
    const id = d.webContentsId; if (id != null) { const s = stats.get(id) || { host, count: 0 }; if (s.host !== host) { s.host = host; s.count = 0; } s.count++; stats.set(id, s); bump(id, s.count); }
    cb(res); return true;
  }
  return false;
}
function onHeaders(d, cb) {
  const e = active(); if (!e || !(d.resourceType === 'mainFrame' || d.resourceType === 'subFrame')) return false;
  const host = topHost(d) || hostOf(d.url); if (allowedOn(host)) return false;
  let res = null; e.onHeadersReceived(d, r => { res = r; });
  if (res && res.responseHeaders) { cb(res); return true; }
  return false;
}
/* cosmetic filtering (hiding ad slots, cookie banners) needs a small script in each page frame */
const withCosmetics = new WeakSet(); let ipcReady = false;
function cosmetics(ipcMain, ses) {
  if (!withCosmetics.has(ses)) { withCosmetics.add(ses); ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD_PATH }); }
  if (ipcReady) return; ipcReady = true;
  ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => { const e = active(); if (!e || allowedOn(hostOf(url))) return; return e.onInjectCosmeticFilters(event, url, msg); });
  ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => { const e = active(); return e ? e.config.enableMutationObserver : false; });
}
let bump = () => {};
const onStats = fn => { bump = fn; };
const resetStats = id => stats.delete(id);
const countFor = id => (stats.get(id) || { count: 0 }).count;

/* Is this address known to be dangerous? Returns a reason, or null. */
function danger(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname;
  if (phishSet && phish.check(phishSet, host)) return 'phishing';
  const s = engines.safety;
  if (s) { try { const m = s.match(Request.fromRawDetails({ url, type: 'main_frame', sourceUrl: url })); if (m.match && !m.exception) return 'badware'; } catch {} }
  return null;
}

function setException(host, on) { if (on) exceptions.add(host); else exceptions.delete(host); store.writeJSON('blocking-exceptions.json', [...exceptions]); }

/* background refresh of every list, a few days apart */
async function refresh(force) {
  const meta = store.readJSON('lists/meta.json', {});
  if (!force && meta.at && Date.now() - meta.at < REFRESH_MS) return { skipped: true };
  const fetch = (u, o) => net.fetch(u, o);
  const dir = store.file('lists'); fs.mkdirSync(dir, { recursive: true });
  const put = (n, buf) => { const f = path.join(dir, n + '.bin'), tmp = f + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f); };
  try {
    for (const [name, urls] of [['standard', adsAndTrackingLists], ['strict', fullLists]]) {
      const e = await ElectronBlocker.fromLists(fetch, urls, { loadCosmeticFilters: true, loadNetworkFilters: true, enableCompression: true });
      put(name, e.serialize()); if (engines[name]) engines[name] = e;
    }
    const bad = (await Promise.all(SOURCES.badware.map(u => fetch(u).then(r => r.text())))).join('\n');
    const se = ElectronBlocker.parse(bad, { loadCosmeticFilters: false }); put('safety', se.serialize()); engines.safety = se;
    const ph = (await Promise.all(SOURCES.phishing.map(u => fetch(u).then(r => { if (!r.ok) throw new Error('phishing list ' + r.status); return r.text(); })))).join('\n');
    const pb = phish.build(ph); if (pb.length > 80000) { put('phish', pb); phishSet = phish.load(pb); }     // sanity check: never swap in a near-empty list
    store.writeJSON('lists/meta.json', { at: Date.now() });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function listDate() { const m = store.readJSON('lists/meta.json', null); if (m && m.at) return m.at; try { return Date.parse(JSON.parse(fs.readFileSync(path.join(BUNDLED, 'built.json'), 'utf8')).at); } catch { return null; } }

module.exports = { init, setMode, onRequest, onHeaders, cosmetics, onStats, resetStats, countFor, danger, setException, allowedOn, refresh, listDate, getMode: () => mode };
