'use strict';
/* Local pages for the end-to-end tests: plain pages, trackers, popups, downloads, links, suggestions, header echo. */
const http = require('http');
const page = (title, bg, body = '') => `<!doctype html><title>${title}</title><body style="font:28px system-ui;padding:40px;background:${bg}"><h1>${title}</h1><p>Served from localhost to check native views.</p>${body}</body>`;
const routes = {
  '/p1.html': () => page('Test page 1', 'hsl(110 70% 90%)', '<a href="/p1.html" target=_blank>open in new tab</a> <p>findme findme findme</p>'),
  '/p2.html': () => page('Test page 2', 'hsl(220 70% 90%)', '<a href="/p2.html" target=_blank>open in new tab</a>'),
  '/p3.html': () => page('Test page 3', 'hsl(330 70% 90%)', '<a href="/p3.html" target=_blank>open in new tab</a>'),
  '/trackers.html': () => page('Trackers', '#fff', '<img src="https://securepubads.g.doubleclick.net/pagead/ad.gif"><script src="https://www.google-analytics.com/analytics.js"></script><script src="https://connect.facebook.net/en_US/fbevents.js"></script><img src="https://pixel.quantserve.com/pixel.gif">'),
  '/popup.html': () => page('Popup', '#fff', '<button id=b onclick="window.open(\'/p2.html\')">open</button><script>setTimeout(() => window.open("/p3.html"), 300)</script>'),
  '/links.html': () => page('Links', '#fff', '<a id=l href="/p2.html">a link to peek at</a>'),
  '/dl': (q, r) => { r.setHeader('content-disposition', 'attachment; filename="washi-test.txt"'); r.setHeader('content-type', 'text/plain'); return 'hello from a download\n'.repeat(50); },
  '/sugg': (q) => { const u = new URL(q.url, 'http://x'); const s = u.searchParams.get('q') || ''; return JSON.stringify([s, [s + ' recipes', s + ' near me', s + ' history']]); },
  '/echo': (q) => `<title>echo</title><pre id=h>${JSON.stringify(q.headers)}</pre>`,
  '/ua': (q) => `<title>ua</title><pre id=h>${(q.headers['user-agent'] || '').replace(/</g, '')}</pre><script>document.title = 'ua|' + navigator.userAgent + '|' + document.getElementById('h').textContent</script>`,
  '/go-ua': (q, r) => { r.statusCode = 302; r.setHeader('location', 'http://127.0.0.1:8765/ua'); return ''; },
  '/cookie.html': () => page('Cookie', '#fff', '<script>document.title = "cookie:" + document.cookie</script>')
};
/* fake update server for test/update.js: files from $UPD_DIR, and a switch to serve broken update info */
let updMode = 'good';
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/updates/mode?')) { updMode = q.url.split('?')[1]; return r.end('ok'); }
  if (q.url.startsWith('/updates/')) {
    const fs = require('fs'), path = require('path'); let name = decodeURIComponent(q.url.slice(9).split('?')[0]);
    if (name === 'latest.json' && updMode !== 'good') name = 'latest-' + updMode + '.json';
    const f = path.join(process.env.UPD_DIR || '/nonexistent', path.basename(name));
    if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', name.endsWith('.json') ? 'application/json' : 'application/zip'); return r.end(fs.readFileSync(f));
  }
  const f = routes[q.url.split('?')[0]];
  if (!f) { r.statusCode = 404; return r.end('nope'); }
  const body = f(q, r); if (!r.getHeader('content-type')) r.setHeader('content-type', q.url.startsWith('/sugg') ? 'application/json' : 'text/html');
  r.end(body);
});
srv.listen(+process.env.PORT || 8765, () => console.log('test server on', srv.address().port));
