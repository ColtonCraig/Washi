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
  '/boost.html': () => `<!doctype html><title>Boost me</title><body style="margin:0;font:18px Arial,sans-serif;background:#fff"><header id="top" style="padding:20px 40px;background:#36c;color:#fff"><h1 style="margin:0">Boost me</h1></header>
    <main style="padding:20px 40px"><p id="txt">Some ordinary words on an ordinary page.</p><div class="ad-slot" style="width:400px;height:160px;background:#f0c;color:#fff;display:grid;place-items:center">ANNOYING AD</div>
    <ul><li class="item">one</li><li class="item">two</li><li class="item">three</li></ul><button id="b" onclick="document.title='clicked'">a button</button></main></body>`,
  '/cookie.html': () => page('Cookie', '#fff', '<script>document.title = "cookie:" + document.cookie</script>')
};
/* fake GitHub + feeds for test/live.js: /live/set?prs=1,2,3&items=a,b changes what they return */
const LIVE = { prs: [1, 2, 3], items: ['a', 'b', 'c'], auth: '' };
/* fake update server for test/update.js: files from $UPD_DIR, and a switch to serve broken update info */
let updMode = 'good';
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/live/set?')) { const u = new URL(q.url, 'http://x'); if (u.searchParams.has('prs')) LIVE.prs = u.searchParams.get('prs').split(',').filter(Boolean).map(Number); if (u.searchParams.has('items')) LIVE.items = u.searchParams.get('items').split(',').filter(Boolean); return r.end('ok'); }
  if (q.url === '/live/auth') return r.end(LIVE.auth);
  if (q.url.startsWith('/gh/repos/')) {
    LIVE.auth = q.headers.authorization || '';
    if (!q.url.startsWith('/gh/repos/acme/widgets/pulls')) { r.statusCode = 404; return r.end('{"message":"Not Found"}'); }
    r.setHeader('content-type', 'application/json');
    return r.end(JSON.stringify(LIVE.prs.slice().reverse().map(n => ({ number: n, title: 'Fix thing ' + n + (n === 2 ? ' & <stuff>' : ''), html_url: 'http://localhost:8765/p1.html?pr=' + n, draft: n === 3 }))));
  }
  if (q.url.startsWith('/feed.xml')) {
    r.setHeader('content-type', 'application/rss+xml');
    return r.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Paper News &amp; Notes</title><link>http://localhost:8765/</link>${LIVE.items.map(i => `<item><title><![CDATA[Story ${i} — “quoted” &amp; more]]></title><link>http://localhost:8765/p2.html?story=${i}</link><guid>story-${i}</guid><description><![CDATA[<script>alert(1)</script>]]></description></item>`).join('')}</channel></rss>`);
  }
  if (q.url.startsWith('/atom.xml')) {
    r.setHeader('content-type', 'application/atom+xml');
    return r.end(`<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Log</title><entry><title type="html">First &lt;b&gt;post&lt;/b&gt;</title><link rel="alternate" href="/p3.html?a=1"/><id>urn:1</id></entry><entry><title>Second</title><link href="http://localhost:8765/p3.html?a=2"/><id>urn:2</id></entry></feed>`);
  }
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
