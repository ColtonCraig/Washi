'use strict';
/* Runs in extension pages and background workers, after electron-chrome-extensions sets up chrome.*: fill in the
   standard constants real Chrome has and the engine leaves undefined. Okta's plugin uses chrome.tabs.TAB_ID_NONE in
   its sign-in rules; with it undefined Chrome rejects them and the plugin's background falls over (blank popup,
   "We're having trouble launching your app"). */
const { contextBridge } = require('electron');
const fix = () => {
  const c = globalThis.chrome; if (!c) return;
  const set = (o, k, v) => { try { if (o && o[k] === undefined) Object.defineProperty(o, k, { value: v, enumerable: true }); } catch {} };
  set(c.tabs, 'TAB_ID_NONE', -1); set(c.tabs, 'TAB_INDEX_NONE', -1); set(c.tabs, 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND', 2);
  set(c.windows, 'WINDOW_ID_NONE', -1); set(c.windows, 'WINDOW_ID_CURRENT', -2);
};
try { if (globalThis.location && location.protocol === 'chrome-extension:') contextBridge.executeInMainWorld({ func: fix }); } catch (e) { try { console.error('washi ext-fix', e && e.message); } catch {} }
