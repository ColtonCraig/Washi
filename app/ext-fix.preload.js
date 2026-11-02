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
  if (globalThis.__washiDebugExt) console.log('washi-ext-fix', typeof c.tabs, c.tabs && c.tabs.TAB_ID_NONE, Object.isFrozen(c));
  }
};
let dbg = false; try { dbg = !!(process.env && process.env.WASHI_DEBUG_EXT); } catch {}
const isExt = () => { try { return process.type === 'service-worker' || (globalThis.location && String(location.href).startsWith('chrome-extension://')); } catch { return false; } };   // a worker has no location yet: ask process.type, like the engine does
try { if (isExt()) { if (dbg) contextBridge.executeInMainWorld({ func: () => { globalThis.__washiDebugExt = true; } }); contextBridge.executeInMainWorld({ func: fix }); } } catch (e) { try { console.error('washi ext-fix', e && e.message); } catch {} }
