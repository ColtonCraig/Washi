'use strict';
/* app/ext-fix.preload.js, checked without a browser: extensions get Chrome's constants, and their event listeners get
   Chrome's filters (webNavigation url filters, tabs.onUpdated urls/properties) and hasListener. Okta's plugin listens
   to onBeforeNavigate for its app-launch links only; without the filter it took over every page. */
const fs = require('fs'), path = require('path');
let fixFn, pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ext-fix.preload.js'), 'utf8');
const req = n => n === 'electron' ? { contextBridge: { executeInMainWorld: ({ func }) => { fixFn = func; } } } : require(n);
const proc = Object.assign(Object.create(process), { type: 'service-worker', env: {} });
class ExtensionEvent { constructor() { this.ls = []; } addListener(cb) { this.ls.push(cb); } removeListener(cb) { this.ls = this.ls.filter(x => x !== cb); } fire(...a) { this.ls.forEach(f => f(...a)); } hasListener() { throw new Error('Method not implemented.'); } }
const nav = { onBeforeNavigate: new ExtensionEvent(), onCompleted: new ExtensionEvent() }, tabs = { onUpdated: new ExtensionEvent(), onCreated: new ExtensionEvent() };
globalThis.chrome = { webNavigation: nav, tabs, windows: {} };
new Function('require', 'process', src)(req, proc);
ok(typeof fixFn === 'function', 'the fix runs in extension background workers (no location there yet)');
fixFn(); Object.freeze(globalThis.chrome);
ok(chrome.tabs.TAB_ID_NONE === -1 && chrome.tabs.TAB_INDEX_NONE === -1 && chrome.windows.WINDOW_ID_NONE === -1 && chrome.windows.WINDOW_ID_CURRENT === -2, 'Chrome\'s constants are there');
const got = [], cb = d => got.push(d.url);
nav.onBeforeNavigate.addListener(cb, { url: [{ urlMatches: 'okta-personal-app/.*/launch' }, { hostSuffix: '.okta.com', pathPrefix: '/app/' }] });
for (const u of ['https://hudl.okta.com/', 'https://idmsa.apple.com/signin', 'https://hudl.okta.com/app/slack/abc/sso', 'https://x.example.com/okta-personal-app/9/launch']) nav.onBeforeNavigate.fire({ url: u });
ok(JSON.stringify(got) === JSON.stringify(['https://hudl.okta.com/app/slack/abc/sso', 'https://x.example.com/okta-personal-app/9/launch']), 'a webNavigation listener with a url filter only hears matching pages (not hudl.okta.com itself, not Apple sign-in): ' + JSON.stringify(got));
ok(nav.onBeforeNavigate.hasListener(cb) && nav.onBeforeNavigate.hasListeners() && !tabs.onCreated.hasListener(cb), 'hasListener / hasListeners answer instead of throwing');
nav.onBeforeNavigate.removeListener(cb); nav.onBeforeNavigate.fire({ url: 'https://hudl.okta.com/app/a' });
ok(got.length === 2 && !nav.onBeforeNavigate.hasListeners(), 'removeListener takes the filtered listener off');
const g2 = []; tabs.onUpdated.addListener((id, info, tab) => g2.push(id), { urls: ['*://*.okta.com/*'], properties: ['status'] });
tabs.onUpdated.fire(1, { status: 'complete' }, { url: 'https://hudl.okta.com/' }); tabs.onUpdated.fire(2, { title: 'x' }, { url: 'https://hudl.okta.com/' }); tabs.onUpdated.fire(3, { status: 'complete' }, { url: 'https://github.com/' });
ok(JSON.stringify(g2) === '[1]', 'tabs.onUpdated honours urls and properties filters: ' + JSON.stringify(g2));
const g3 = []; nav.onCompleted.addListener(d => g3.push(d.url)); nav.onCompleted.fire({ url: 'https://any.com/' });
ok(g3.length === 1, 'a listener without a filter hears everything, as before');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
