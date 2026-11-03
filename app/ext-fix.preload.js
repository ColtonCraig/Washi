'use strict';
/* Runs in extension pages and background workers, after electron-chrome-extensions sets up chrome.*: fill in the
   standard constants real Chrome has and the engine leaves undefined. Okta's plugin uses chrome.tabs.TAB_ID_NONE in
   its sign-in rules; with it undefined Chrome rejects them and the plugin's background falls over (blank popup,
   "We're having trouble launching your app"). */
const { contextBridge } = require('electron');
const fix = (policy) => {
  /* the engine finishes by freezing chrome; whichever of us runs first, fill the constants in just before that (or now, if it already ran) */
  const C0 = globalThis.chrome;
  /* this preload runs before the engine's (extensions.js registers it first): wait for the engine to finish and fill
     the gaps just before it freezes chrome, so nothing of ours gets in the way of what it adds. If the engine never
     runs here, fill them in anyway once this script is done. */
  if (!C0 || !Object.isFrozen(C0)) { const freeze = Object.freeze; let done = false; Object.freeze = function (o) { if (!done && o && o === globalThis.chrome) { done = true; Object.freeze = freeze; try { apply(); } catch {} } return freeze.call(this, o); }; setTimeout(() => { if (!done) { done = true; Object.freeze = freeze; try { apply(); } catch {} } }, 0); }
  else apply();
  function apply() {
  const c = globalThis.chrome; if (!c) return;
  const set = (o, k, v) => { try { if (o && o[k] === undefined) Object.defineProperty(o, k, { value: v, enumerable: true, configurable: true }); } catch (e) { if (globalThis.__washiDebugExt) console.log('washi-ext-fix set', k, e && e.message); } };
  set(c.tabs, 'TAB_ID_NONE', -1); set(c.tabs, 'TAB_INDEX_NONE', -1); set(c.tabs, 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND', 2);
  set(c.windows, 'WINDOW_ID_NONE', -1); set(c.windows, 'WINDOW_ID_CURRENT', -2);
  /* events: honour the filters Chrome supports (webNavigation's url filters, tabs.onUpdated's), and answer hasListener
     — the engine passes every event to every listener and throws on hasListener. Okta's plugin listens to
     webNavigation.onBeforeNavigate with a url filter for its app-launch links; without the filter it took over
     every page you opened (SigningIn → "We're having trouble launching your app"). */
  const urlOk = (url, filters) => {
    if (!Array.isArray(filters) || !filters.length) return true;
    let u; try { u = new URL(url); } catch { return false; }
    const host = u.hostname, path = u.pathname, q = u.search.replace(/^\?/, ''), full = u.href.replace(/#.*$/, ''), op = u.origin + u.pathname;
    const port = +u.port || ({ 'http:': 80, 'https:': 443, 'ftp:': 21 }[u.protocol] || 0);
    const re = s => { try { return new RegExp(s); } catch { return null; } };
    return filters.some(f => {
      if (!f || typeof f !== 'object') return false;
      const chk = [
        ['hostContains', v => ('.' + host).includes(v)], ['hostEquals', v => host === v], ['hostPrefix', v => host.startsWith(v)], ['hostSuffix', v => host.endsWith(v)],
        ['pathContains', v => path.includes(v)], ['pathEquals', v => path === v], ['pathPrefix', v => path.startsWith(v)], ['pathSuffix', v => path.endsWith(v)],
        ['queryContains', v => q.includes(v)], ['queryEquals', v => q === v], ['queryPrefix', v => q.startsWith(v)], ['querySuffix', v => q.endsWith(v)],
        ['urlContains', v => full.includes(v)], ['urlEquals', v => full === v], ['urlPrefix', v => full.startsWith(v)], ['urlSuffix', v => full.endsWith(v)],
        ['urlMatches', v => { const r = re(v); return !!r && r.test(full); }], ['originAndPathMatches', v => { const r = re(v); return !!r && r.test(op); }],
        ['schemes', v => Array.isArray(v) && v.includes(u.protocol.replace(/:$/, ''))],
        ['ports', v => Array.isArray(v) && v.some(x => Array.isArray(x) ? port >= x[0] && port <= x[1] : port === x)]
      ];
      return chk.every(([k, fn]) => f[k] === undefined || fn(f[k]));
    });
  };
  const pat = p => { if (p === '<all_urls>') return /^(https?|wss?|ftp|file):/; const m = /^(\*|https?|wss?|ftp|file):\/\/(\*|\*\.[^/]+|[^/*]+)?(\/.*)$/.exec(p); if (!m) return null; const sch = m[1] === '*' ? '(https?|wss?)' : m[1], h = !m[2] ? '' : m[2] === '*' ? '[^/]+' : m[2].startsWith('*.') ? '([^/]+\\.)?' + m[2].slice(2).replace(/[.]/g, '\\.') : m[2].replace(/[.]/g, '\\.'); return new RegExp('^' + sch + ':\\/\\/' + h + '(:\\d+)?' + m[3].replace(/[.?+^$()|[\]{}\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); };
  const wrapEvent = (ev, filterOf) => {
    if (!ev || typeof ev.addListener !== 'function' || ev.__washi) return;
    const add = ev.addListener.bind(ev), rem = typeof ev.removeListener === 'function' ? ev.removeListener.bind(ev) : null, map = new Map();
    try {
      Object.defineProperty(ev, '__washi', { value: true });
      ev.addListener = (cb, ...more) => { if (typeof cb !== 'function' || map.has(cb)) return; const ok = filterOf ? filterOf(more[0]) : null; const w = ok ? (...args) => { if (ok(...args)) return cb(...args); } : cb; map.set(cb, w); add(w); };
      ev.removeListener = cb => { const w = map.get(cb); if (!w) return; map.delete(cb); if (rem) rem(w); };
      ev.hasListener = cb => map.has(cb);
      ev.hasListeners = () => map.size > 0;
    } catch {}
  };
  const navFilter = f => f && Array.isArray(f.url) && f.url.length ? d => urlOk(d && d.url, f.url) : null;
  if (c.webNavigation) for (const k of Object.keys(c.webNavigation)) if (/^on[A-Z]/.test(k)) wrapEvent(c.webNavigation[k], navFilter);
  if (c.tabs && c.tabs.onUpdated) wrapEvent(c.tabs.onUpdated, f => {
    if (!f || typeof f !== 'object') return null; const res = Array.isArray(f.urls) ? f.urls.map(pat).filter(Boolean) : null, props = Array.isArray(f.properties) ? f.properties : null;
    return (id, info, tab) => (f.tabId === undefined || id === f.tabId) && (f.windowId === undefined || (tab && tab.windowId === f.windowId)) && (!res || (tab && res.some(r => r.test(tab.url || '')))) && (!props || props.some(k => info && k in info));
  });
  for (const api of Object.values(c)) if (api && typeof api === 'object') for (const v of Object.values(api)) if (v && typeof v === 'object' && typeof v.addListener === 'function' && v.constructor && v.constructor.name === 'ExtensionEvent') wrapEvent(v, null);
  /* chrome.privacy isn't in the engine, and asking chrome.permissions about it throws ("'privacy' is not a recognized
     permission") where Chrome answers. Okta's plugin asks once you're signed in (to offer turning off the browser's own
     password saving), and the throw left its popup on grey placeholders forever. Washi answers like Chrome: the
     permission is granted and the browser's password saving is already handled (Washi's own vault, Settings ›
     Passwords). */
  const UNSUPPORTED = new Set(['privacy']);
  const later = (v, cb) => { if (typeof cb === 'function') { try { cb(v); } catch {} return undefined; } return Promise.resolve(v); };
  const setting = (value) => { const ls = new Set(); return { get: (d, cb) => later({ value, levelOfControl: 'controllable_by_this_extension' }, typeof d === 'function' ? d : cb), set: (d, cb) => later(undefined, cb), clear: (d, cb) => later(undefined, cb), onChange: { addListener: f => ls.add(f), removeListener: f => ls.delete(f), hasListener: f => ls.has(f), hasListeners: () => ls.size > 0 } }; };
  /* the engine's own chrome.privacy settings are stubs whose get() never answers: Okta's plugin waits on
     passwordSavingEnabled.get() once you're signed in, so its popup sat on grey placeholders. Make them answer. */
  const VAL = { passwordSavingEnabled: false, autofillAddressEnabled: false, autofillCreditCardEnabled: false, autofillEnabled: false, safeBrowsingEnabled: true, searchSuggestEnabled: true, spellingServiceEnabled: false, translationServiceEnabled: false, networkPredictionEnabled: true, webRTCIPHandlingPolicy: 'default', thirdPartyCookiesAllowed: true, hyperlinkAuditingEnabled: false, referrersEnabled: true, doNotTrackEnabled: false, protectedContentEnabled: true };
  if (c.privacy) for (const grp of ['services', 'network', 'websites']) {
    let g = c.privacy[grp]; if (!g || typeof g !== 'object') { g = {}; try { c.privacy[grp] = g; } catch {} }
    for (const k of Object.keys(VAL)) { const want = setting(VAL[k]); const cur = g[k];
      if (cur && typeof cur === 'object') { for (const m of ['get', 'set', 'clear']) try { cur[m] = want[m]; } catch {} if (!cur.onChange || typeof cur.onChange.hasListener !== 'function') try { cur.onChange = want.onChange; } catch {} }
      else if (({ services: /^(password|autofill|safeBrowsing|searchSuggest|spelling|translation)/, network: /^(networkPrediction|webRTC)/, websites: /^(thirdParty|hyperlink|referrers|doNotTrack|protectedContent)/ })[grp].test(k)) try { g[k] = want; } catch {} }
  }
  /* chrome.storage.managed: the engine hands back the extension's own local storage as if it were company policy. Chrome
     gives {} unless an admin set something: use what your Mac's Chrome policy has for this extension, read-only. */
  if (c.storage && !c.storage.__washiManaged) {
    let mine = {}; try { mine = (JSON.parse(policy || '{}') || {})[c.runtime && c.runtime.id] || {}; } catch {}
    const pick = k => { if (k == null) return { ...mine }; const o = {}; const ks = typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(k); for (const x of ks) if (x in mine) o[x] = mine[x]; else if (k && typeof k === 'object' && !Array.isArray(k)) o[x] = k[x]; return o; };
    const ro = cb => { const e = new Error('This is a read-only store.'); if (typeof cb === 'function') { try { cb(); } catch {} return undefined; } return Promise.reject(e); };
    const ls = new Set();
    const managed = { get: (k, cb) => { if (typeof k === 'function') { cb = k; k = null; } return later(pick(k), cb); }, getBytesInUse: (k, cb) => { if (typeof k === 'function') { cb = k; k = null; } return later(JSON.stringify(pick(k)).length, cb); }, set: (_, cb) => ro(cb), remove: (_, cb) => ro(cb), clear: cb => ro(cb), onChanged: { addListener: f => ls.add(f), removeListener: f => ls.delete(f), hasListener: f => ls.has(f), hasListeners: () => ls.size > 0 } };
    try { Object.defineProperty(c.storage, 'managed', { value: managed, enumerable: true, configurable: true }); } catch { try { c.storage.managed = managed; } catch {} }
    try { Object.defineProperty(c.storage, '__washiManaged', { value: true }); } catch {}
  }
  if (!c.privacy) set(c, 'privacy', { services: { passwordSavingEnabled: setting(false), autofillAddressEnabled: setting(false), autofillCreditCardEnabled: setting(false), autofillEnabled: setting(false), safeBrowsingEnabled: setting(true), searchSuggestEnabled: setting(true), spellingServiceEnabled: setting(false), translationServiceEnabled: setting(false) },
    network: { networkPredictionEnabled: setting(true), webRTCIPHandlingPolicy: setting('default') }, websites: { thirdPartyCookiesAllowed: setting(true), hyperlinkAuditingEnabled: setting(false), referrersEnabled: setting(true), doNotTrackEnabled: setting(false), protectedContentEnabled: setting(true) }, IPHandlingPolicy: { DEFAULT: 'default' } });
  const P = c.permissions;
  if (P && !P.__washi) {
    const strip = o => { const q = { ...(o || {}) }; const had = Array.isArray(q.permissions) && q.permissions.some(k => UNSUPPORTED.has(k)); if (Array.isArray(q.permissions)) q.permissions = q.permissions.filter(k => !UNSUPPORTED.has(k)); return { q, had, empty: !(q.permissions && q.permissions.length) && !(q.origins && q.origins.length) }; };
    const wrapP = (name, whenOnly) => { const f = P[name]; if (typeof f !== 'function') return; const base = f.bind(P);
      const w = function (o, cb) { const { q, had, empty } = strip(o); if (had && empty) return later(whenOnly, cb); return typeof cb === 'function' ? base(q, cb) : base(q); };
      try { P[name] = w; } catch {} if (P[name] !== w) try { Object.defineProperty(P, name, { value: w, configurable: true, writable: true }); } catch {} };
    wrapP('contains', true); wrapP('request', true); wrapP('remove', false);
    try { Object.defineProperty(P, '__washi', { value: true }); } catch {}
  }
  if (c.extension && typeof c.extension.isAllowedIncognitoAccess !== 'function') { try { c.extension.isAllowedIncognitoAccess = cb => later(false, cb); } catch {} }
  if (c.extension && typeof c.extension.isAllowedFileSchemeAccess !== 'function') { try { c.extension.isAllowedFileSchemeAccess = cb => later(false, cb); } catch {} }
  if (c.tabs && typeof c.tabs.highlight !== 'function' && typeof c.tabs.update === 'function') { try { c.tabs.highlight = (info, cb) => { const ix = [].concat(info && info.tabs).filter(x => x !== undefined); const p = c.tabs.query({ windowId: info && info.windowId }).then(ts => { const t = ts.find(t => t.index === ix[0]); return t ? c.tabs.update(t.id, { active: true }) : null; }).then(() => c.windows && c.windows.get && info && info.windowId ? c.windows.get(info.windowId) : undefined); if (typeof cb === 'function') { p.then(cb, () => cb()); return; } return p; }; } catch {} }
  /* extension.getViews: the engine answers [] even for the page asking; Chrome lists it (popup code checks "am I the popup?") */
  if (c.extension && typeof c.extension.getViews === 'function' && !c.extension.__washiViews && globalThis.window === globalThis) {
    const gv = c.extension.getViews.bind(c.extension);
    const mine = () => { try { const m = c.runtime.getManifest(), pop = ((m.action || m.browser_action || {}).default_popup || '').replace(/^\//, ''); return pop && location.pathname.replace(/^\//, '') === pop.split('?')[0] ? 'popup' : 'tab'; } catch { return 'tab'; } };
    try { c.extension.getViews = f => { let v = []; try { v = gv(f) || []; } catch {} const t = f && f.type; if (!v.includes(window) && (!t || t === mine())) v = [...v, window]; return v; }; Object.defineProperty(c.extension, '__washiViews', { value: true }); } catch {}
  }
  /* chrome.idle and chrome.identity aren't in the engine: an extension that asked for them (1Password asks for idle) got
     undefined and could fall over. idle answers "active" (Washi doesn't track that); identity gives the standard
     redirect URL and says interactive sign-in flows aren't supported, rather than leaving the extension hanging. */
  let perms = []; try { const m = c.runtime.getManifest(); perms = [...(m.permissions || []), ...(m.optional_permissions || [])]; } catch {}
  const ev = () => { const ls = new Set(); return { addListener: f => ls.add(f), removeListener: f => ls.delete(f), hasListener: f => ls.has(f), hasListeners: () => ls.size > 0 }; };
  if (!c.idle) set(c, 'idle', { queryState: (t, cb) => later('active', cb), setDetectionInterval: () => {}, getAutoLockDelay: cb => later(0, cb), onStateChanged: ev(), IdleState: { ACTIVE: 'active', IDLE: 'idle', LOCKED: 'locked' } });
  if (!c.identity) { const no = cb => { const e = new Error('Sign-in through chrome.identity isn\'t supported in Washi.'); if (typeof cb === 'function') { try { cb(); } catch {} return undefined; } return Promise.reject(e); };
    set(c, 'identity', { getRedirectURL: p => `https://${c.runtime.id}.chromiumapp.org/${p || ''}`, launchWebAuthFlow: (d, cb) => no(cb), getAuthToken: (d, cb) => no(typeof d === 'function' ? d : cb), removeCachedAuthToken: (d, cb) => later(undefined, cb), clearAllCachedAuthTokens: cb => later(undefined, cb), getProfileUserInfo: (d, cb) => later({ email: '', id: '' }, typeof d === 'function' ? d : cb), getAccounts: cb => later([], cb), onSignInChanged: ev() }); }
  /* the engine also has Chrome's newer `browser` namespace, but only with its built-in APIs: no windows, commands, cookies,
     contextMenus… Extensions that prefer `browser` when it exists (1Password, uBlock Origin Lite) fell over at start
     ("Cannot read properties of undefined (reading 'WINDOW_ID_NONE')"), leaving blank popups. In Chrome `browser` is
     the same object as `chrome`: make it so here. */
  try {
    const br = globalThis.browser;
    if (br !== c) {
      let swapped = false;
      try { Object.defineProperty(globalThis, 'browser', { value: c, configurable: true, writable: true, enumerable: false }); swapped = globalThis.browser === c; } catch {}
      if (!swapped && br && typeof br === 'object') for (const k of Object.keys(c)) { if (br[k] === undefined) try { Object.defineProperty(br, k, { value: c[k], enumerable: true, configurable: true }); } catch { try { br[k] = c[k]; } catch {} } }
    }
  } catch {}
  if (globalThis.__washiDebugExt) console.log('washi-ext-fix', typeof c.tabs, c.tabs && c.tabs.TAB_ID_NONE, Object.isFrozen(c));
  }
};
let dbg = false; try { dbg = !!(process.env && process.env.WASHI_DEBUG_EXT); } catch {}
const isExt = () => { try { return process.type === 'service-worker' || (globalThis.location && String(location.href).startsWith('chrome-extension://')); } catch { return false; } };   // a worker has no location yet: ask process.type, like the engine does
try { if (isExt()) { if (dbg) contextBridge.executeInMainWorld({ func: () => { globalThis.__washiDebugExt = true; } }); let pol = '{}'; try { pol = (process.env && process.env.WASHI_EXT_POLICY) || '{}'; } catch {} contextBridge.executeInMainWorld({ func: fix, args: [pol] }); } } catch (e) { try { console.error('washi ext-fix', e && e.message); } catch {} }
