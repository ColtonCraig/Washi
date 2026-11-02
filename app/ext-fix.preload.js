'use strict';
/* Runs in extension pages and background workers, after electron-chrome-extensions sets up chrome.*: fill in the
   standard constants real Chrome has and the engine leaves undefined. Okta's plugin uses chrome.tabs.TAB_ID_NONE in
   its sign-in rules; with it undefined Chrome rejects them and the plugin's background falls over (blank popup,
   "We're having trouble launching your app"). */
const { contextBridge } = require('electron');
const fix = () => {
  /* the engine finishes by freezing chrome; whichever of us runs first, fill the constants in just before that (or now, if it already ran) */
  const C0 = globalThis.chrome;
  if (!C0 || !C0.tabs || !Object.isFrozen(C0)) { const freeze = Object.freeze; Object.freeze = function (o) { if (o && o === globalThis.chrome) { Object.freeze = freeze; try { apply(); } catch {} } return freeze.call(this, o); }; }
  apply();
  function apply() {
  const c = globalThis.chrome; if (!c) return;
  const set = (o, k, v) => { try { if (o && o[k] === undefined) Object.defineProperty(o, k, { value: v, enumerable: true }); } catch {} };
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
  if (globalThis.__washiDebugExt) console.log('washi-ext-fix', typeof c.tabs, c.tabs && c.tabs.TAB_ID_NONE, Object.isFrozen(c));
  }
};
let dbg = false; try { dbg = !!(process.env && process.env.WASHI_DEBUG_EXT); } catch {}
const isExt = () => { try { return process.type === 'service-worker' || (globalThis.location && String(location.href).startsWith('chrome-extension://')); } catch { return false; } };   // a worker has no location yet: ask process.type, like the engine does
try { if (isExt()) { if (dbg) contextBridge.executeInMainWorld({ func: () => { globalThis.__washiDebugExt = true; } }); contextBridge.executeInMainWorld({ func: fix }); } } catch (e) { try { console.error('washi ext-fix', e && e.message); } catch {} }
