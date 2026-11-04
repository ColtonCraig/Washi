'use strict';
/* Washi's own interface is served from washi://app/… instead of file://.
   That is Electron's recommended setup: the UI gets a real origin, a strict CSP, and no file:// super-powers. */
const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const SCHEME = 'washi';
const ROOT = path.join(__dirname, '..', 'ui');
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  { scheme: 'crx', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);   // extension icons in the top bar and Settings

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
function serve(ses) {
  ses.protocol.handle(SCHEME, async req => {
    const u = new URL(req.url);
    if (u.host !== 'app') return new Response('Not found', { status: 404 });
    const p = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (!p.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });     // no climbing out of ui/
    try {
      const r = await net.fetch(pathToFileURL(p).toString());
      if (!r.ok) return new Response('Not found', { status: 404 });
      return new Response(r.body, { headers: { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'", 'cross-origin-resource-policy': 'same-origin' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}
const url = page => `${SCHEME}://app/${page}`;
module.exports = { SCHEME, serve, url, ORIGIN: `${SCHEME}://app` };
