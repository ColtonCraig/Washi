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
  '/article.html': (q, r) => { r.setHeader('content-type', 'text/html'); return '<!doctype html><html><head><meta charset="utf-8"><title>How Washi Tape Is Made — Paper Weekly</title><meta property="og:site_name" content="Paper Weekly"><style>body{font-family:Arial;background:#eee}nav,aside{background:#c00;color:#fff}</style></head>\n<body><nav id="topnav">Home · News · Shop · Subscribe now!</nav><aside class="ad">BUY NOW 50% OFF</aside><script>window.siteScript = 1;</script>\n<article><h1>How Washi Tape Is Made</h1><p class="byline">By June Tanaka</p><p>1. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>2. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>3. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><h2>Pulp and fibre</h2><figure><img src="/icon/a.png" width="320" height="200" alt="pulp"><figcaption>Kozo fibre drying in the sun.</figcaption></figure><p>4. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>5. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>6. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><blockquote>Good tape tears by hand, cleanly, every time.</blockquote><p>7. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>8. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>9. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>10. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>11. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p><a href="/p2.html" onclick="alert(1)">Read more about paper</a></p></article>\n<footer>© Paper Weekly · <a href="/p3.html">Privacy</a></footer></body></html>'; },
  '/article-csp.html': (q, r) => { r.setHeader('content-type', 'text/html'); r.setHeader('content-security-policy', "default-src 'self'; style-src 'self'; script-src 'none'"); return '<!doctype html><html><head><meta charset="utf-8"><title>How Washi Tape Is Made — Paper Weekly</title><meta property="og:site_name" content="Paper Weekly"><style>body{font-family:Arial;background:#eee}nav,aside{background:#c00;color:#fff}</style></head>\n<body><nav id="topnav">Home · News · Shop · Subscribe now!</nav><aside class="ad">BUY NOW 50% OFF</aside><script>window.siteScript = 1;</script>\n<article><h1>How Washi Tape Is Made</h1><p class="byline">By June Tanaka</p><p>1. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>2. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>3. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><h2>Pulp and fibre</h2><figure><img src="/icon/a.png" width="320" height="200" alt="pulp"><figcaption>Kozo fibre drying in the sun.</figcaption></figure><p>4. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>5. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>6. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><blockquote>Good tape tears by hand, cleanly, every time.</blockquote><p>7. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>8. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>9. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>10. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p>11. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look. The paper was folded twice and tucked into the back of the notebook, where nobody would think to look.</p><p><a href="/p2.html" onclick="alert(1)">Read more about paper</a></p></article>\n<footer>© Paper Weekly · <a href="/p3.html">Privacy</a></footer></body></html>'; },
  '/dl': (q, r) => { r.setHeader('content-disposition', 'attachment; filename="washi-test.txt"'); r.setHeader('content-type', 'text/plain'); return 'hello from a download\n'.repeat(50); },
  '/sugg': (q) => { const u = new URL(q.url, 'http://x'); const s = u.searchParams.get('q') || ''; return JSON.stringify([s, [s + ' recipes', s + ' near me', s + ' history']]); },
  '/echo': (q) => `<title>echo</title><pre id=h>${JSON.stringify(q.headers)}</pre>`,
  '/ua': (q) => `<title>ua</title><pre id=h>${(q.headers['user-agent'] || '').replace(/</g, '')}</pre><script>document.title = 'ua|' + navigator.userAgent + '|' + document.getElementById('h').textContent</script>`,
  '/go-ua': (q, r) => { r.statusCode = 302; r.setHeader('location', 'http://127.0.0.1:8765/ua'); return ''; },
  '/boost.html': () => `<!doctype html><title>Boost me</title><body style="margin:0;font:18px Arial,sans-serif;background:#fff"><header id="top" style="padding:20px 40px;background:#36c;color:#fff"><h1 style="margin:0">Boost me</h1></header>
    <main style="padding:20px 40px"><p id="txt">Some ordinary words on an ordinary page.</p><div class="ad-slot" style="width:400px;height:160px;background:#f0c;color:#fff;display:grid;place-items:center">ANNOYING AD</div>
    <ul><li class="item">one</li><li class="item">two</li><li class="item">three</li></ul><button id="b" onclick="document.title='clicked'">a button</button></main></body>`,
  '/cookie.html': () => page('Cookie', '#fff', '<script>document.title = "cookie:" + document.cookie</script>'),
  /* saved passwords: a sign-in form (right password: "hunter2"), a sign-up form, a two-step sign-in, an SPA sign-in */
  '/login.html': () => page('Sign in', '#fff', '<form id=f action="/signin" method="post"><input id=u name=login autocomplete="username" placeholder="Username"><input id=p type=password name=password autocomplete="current-password"><button id=go>Sign in</button></form><p id=v></p><script>document.getElementById("u").addEventListener("input",e=>document.getElementById("v").textContent="react:"+e.target.value)</script>'),
  '/signup.html': () => page('Sign up', '#fff', '<form action="/welcome" method="get"><input id=e type=email name=email placeholder="Email"><input id=n1 type=password name=pw autocomplete="new-password"><input id=n2 type=password name=pw2 autocomplete="new-password"><button id=go>Create account</button></form>'),
  '/step1.html': () => page('Step one', '#fff', '<form action="/step2.html" method="get"><input id=u type=email name=identifier autocomplete="username"><button id=go>Next</button></form>'),
  '/step2.html': (q) => { const u = new URL(q.url, 'http://x').searchParams.get('identifier') || ''; return page('Step two', '#fff', `<form action="/welcome" method="get"><input type=email name=identifier autocomplete="username" value="${u.replace(/[^\w@.+-]/g, '')}" hidden><input id=p type=password name=pw autocomplete="current-password"><button id=go>Sign in</button></form>`); },
  '/spa.html': () => page('App sign in', '#fff', '<div id=box><input id=u autocomplete="username"><input id=p type=password><button id=go type=button onclick="setTimeout(()=>{document.getElementById(\'box\').innerHTML=\'<h2 id=hi>Signed in</h2>\'},200)">Sign in</button></div>'),
  '/welcome': () => page('Welcome', 'hsl(140 60% 92%)', '<p id=w>You are signed in.</p>'),
  /* passkeys: registers and signs in with WebAuthn and really checks the signature (ES256) in the page */
  '/webauthn.html': () => `<!doctype html><title>Passkeys</title><body style="font:20px system-ui;padding:30px"><h1>Passkey site</h1>
    <button id=reg>Register</button> <button id=log>Sign in</button> <button id=log2>Sign in (this account)</button> <button id=caps>Caps</button><pre id=out></pre>
    <script>
    const out = m => { document.getElementById('out').textContent = m; document.title = m; };
    const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    const unb = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    let keys = JSON.parse(localStorage.keys || '{}');
    document.getElementById('reg').onclick = async () => {
      try {
        const c = await navigator.credentials.create({ publicKey: { rp: { name: 'Test', id: 'localhost' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'colton@example.com', displayName: 'Colton' }, challenge: crypto.getRandomValues(new Uint8Array(32)), pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' } } });
        keys[c.id] = b64(c.response.getPublicKey()); localStorage.keys = JSON.stringify(keys); out('registered:' + c.id.length);
      } catch (e) { out('reg-error:' + e.name); document.getElementById('out').dataset.msg = e.message; }
    };
    async function signIn(allow) {
      try {
        const ch = crypto.getRandomValues(new Uint8Array(32));
        const a = await navigator.credentials.get({ publicKey: { rpId: 'localhost', challenge: ch, userVerification: 'preferred', allowCredentials: allow ? Object.keys(keys).map(id => ({ type: 'public-key', id: unb(id) })) : [] } });
        const spki = keys[a.id]; if (!spki) return out('unknown-key');
        const key = await crypto.subtle.importKey('spki', unb(spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const cd = JSON.parse(new TextDecoder().decode(a.response.clientDataJSON));
        const hash = await crypto.subtle.digest('SHA-256', a.response.clientDataJSON);
        const data = new Uint8Array([...new Uint8Array(a.response.authenticatorData), ...new Uint8Array(hash)]);
        const der = new Uint8Array(a.response.signature); let i = 2; const rl = der[i + 1]; let r = der.slice(i + 2, i + 2 + rl); i += 2 + rl; const sl = der[i + 1]; let s = der.slice(i + 2, i + 2 + sl);
        const fix = x => { while (x.length > 32 && x[0] === 0) x = x.slice(1); const o = new Uint8Array(32); o.set(x, 32 - x.length); return o; };
        const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, new Uint8Array([...fix(r), ...fix(s)]), data);
        const flags = new Uint8Array(a.response.authenticatorData)[32], count = new DataView(a.response.authenticatorData).getUint32(33);
        out((ok && cd.type === 'webauthn.get' && cd.challenge === b64(ch) ? 'signed-in' : 'bad-signature') + ':uv=' + ((flags & 4) ? 1 : 0) + ':count=' + count + ':user=' + (a.response.userHandle ? a.response.userHandle.byteLength : 0));
      } catch (e) { out('get-error:' + e.name); document.getElementById('out').dataset.msg = e.message; }
    }
    document.getElementById('log').onclick = () => signIn(false);
    document.getElementById('log2').onclick = () => signIn(true);
    document.getElementById('caps').onclick = async () => out('caps:' + (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) + ':' + (await PublicKeyCredential.isConditionalMediationAvailable()));
    </script>`
};
/* fake GitHub + feeds for test/live.js: /live/set?prs=1,2,3&items=a,b changes what they return */
const LIVE = { prs: [1, 2, 3], items: ['a', 'b', 'c'], auth: '' };
/* fake update server for test/update.js: files from $UPD_DIR, and a switch to serve broken update info */
let updMode = 'good';
const srv = http.createServer((q, r) => {
  /* a sign-in "org" for extensions that call their own server with your session, like the Okta plugin: /org/login
     sets session cookies (Lax, Strict and None), /org/me answers with which came back, and no CORS headers */
  if (q.url.startsWith('/org/login')) { r.setHeader('set-cookie', ['sidl=L; Path=/; SameSite=Lax', 'sids=S; Path=/; SameSite=Strict', 'sidn=N; Path=/; SameSite=None; Secure']); r.setHeader('content-type', 'text/html'); return r.end('<title>Org</title><h1>Signed in</h1>'); }
  if (q.url.startsWith('/org/me')) { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ cookie: q.headers.cookie || '', origin: q.headers.origin || '', site: q.headers['sec-fetch-site'] || '' })); }
  if (q.url.startsWith('/signin') && q.method === 'POST') {          // the sign-in form: right password → welcome, wrong → the form again
    let b = ''; q.on('data', c => { b += c; }); q.on('end', () => { const f = new URLSearchParams(b); r.setHeader('content-type', 'text/html');
      if (f.get('password') === 'hunter2') { r.statusCode = 303; r.setHeader('location', '/welcome'); return r.end(); }
      r.end(routes['/login.html']().replace('<h1>Sign in</h1>', '<h1>Sign in</h1><p id=bad>Wrong password</p>')); });
    return;
  }
  if (q.url.startsWith('/live/set?')) { const u = new URL(q.url, 'http://x'); if (u.searchParams.has('prs')) LIVE.prs = u.searchParams.get('prs').split(',').filter(Boolean).map(Number); if (u.searchParams.has('items')) LIVE.items = u.searchParams.get('items').split(',').filter(Boolean); return r.end('ok'); }
  if (q.url === '/live/auth') return r.end(LIVE.auth);
  /* pretend apps for test/today.js: /app/<name> is "signed out" until /app/<name>?login=1 sets its cookie */
  if (q.url.startsWith('/icon/')) {                          // app icons for the setup test (a tiny red PNG), a little slow like the real web
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwGIGBgYGBgAGSkC/pbbXXsAAAAASUVORK5CYII=', 'base64');
    return setTimeout(() => { r.setHeader('content-type', 'image/png'); r.end(png); }, 400);
  }
  if (q.url.startsWith('/app/')) {
    const u = new URL(q.url, 'http://x'), name = u.pathname.split('/')[2] || 'x', ck = (q.headers.cookie || '').includes('test_' + name + '=');
    if (u.searchParams.get('login') === '1') r.setHeader('set-cookie', 'test_' + name + '=yes; Path=/; Max-Age=86400');
    const inn = ck || u.searchParams.get('login') === '1';
    if (name === 'tasks' && !inn && !u.pathname.includes('/login')) { r.statusCode = 302; r.setHeader('location', '/app/tasks/login'); return r.end(); }
    r.setHeader('content-type', 'text/html');
    return r.end(page(`${name}${inn ? ' inbox' : ' sign in'}`, inn ? '#e6f6e9' : '#fff3e0', `<p id="state">${inn ? 'signed in' : 'please sign in'}</p><a id="go" href="/app/${name}${name === 'tasks' ? '/home' : ''}?login=1">Sign in</a>`));
  }
  /* GitHub search for the Today page: /gh/search/issues?q=… */
  if (q.url.startsWith('/gh/search/issues')) {
    LIVE.auth = q.headers.authorization || '';
    if (LIVE.ghDown) { r.statusCode = 503; return r.end('{"message":"down"}'); }
    const query = decodeURIComponent(new URL(q.url, 'http://x').searchParams.get('q') || ''), rev = /review-requested:@me/.test(query);
    const items = rev ? [{ number: 41, title: 'Add dark mode toggle', draft: false }, { number: 42, title: 'Fix <script> escaping', draft: false }] : [{ number: 7, title: 'My work in progress', draft: true }];
    r.setHeader('content-type', 'application/json');
    return r.end(JSON.stringify({ total_count: items.length, items: items.map(i => ({ ...i, html_url: 'http://localhost:8765/p2.html?pr=' + i.number, repository_url: 'https://api.github.com/repos/acme/widgets', updated_at: new Date().toISOString() })) }));
  }
  if (q.url.startsWith('/gh/down?')) { LIVE.ghDown = q.url.endsWith('=1'); return r.end('ok'); }
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
  if (q.url.startsWith('/tone.wav')) {                  // 20 seconds of a quiet tone, for Now playing
    const rate = 8000, n = rate * 20, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 330) * 1200), 44 + i * 2);
    r.setHeader('content-type', 'audio/wav'); return r.end(b);
  }
  if (q.url.startsWith('/heavy.html')) {               // a page that uses memory like a real site (a big page, scripts holding data, a timer)
    r.setHeader('content-type', 'text/html');
    return r.end(`<!doctype html><title>Heavy ${q.url.split('?')[1] || ''}</title><body style="font:14px system-ui"><h1>Heavy page</h1><div id="d"></div>
<script>window.__data = Array.from({ length: 160000 }, (_, i) => ({ i, s: 'item ' + i + ' ' + Math.random() })); const d = document.getElementById('d'); for (let i = 0; i < 3000; i++) { const p = document.createElement('p'); p.textContent = 'Paragraph ' + i + ' with some ordinary text to make the page a real size.'; d.append(p); } setInterval(() => { window.__tick = (window.__tick || 0) + 1; }, 1000);</script></body>`);
  }
  if (q.url.startsWith('/music-evil.html')) {          // a page that lies about what's playing (Now playing must take nothing on trust)
    r.setHeader('content-type', 'text/html');
    return r.end(`<!doctype html><title>Evil Radio</title><body><audio id="a" src="/tone.wav" loop></audio>
<script>Object.defineProperty(Navigator.prototype, 'mediaSession', { get() { return { metadata: { title: 'T'.repeat(5000), artist: { toString() { return 'obj'; } }, artwork: [{ src: 'javascript:alert(1)' }] } }; } });</script></body>`);
  }
  if (q.url.startsWith('/music.html')) {
    r.setHeader('content-type', 'text/html');
    return r.end(`<!doctype html><title>Paper Radio</title><body style="background:#f3e9ff;font:20px system-ui"><h1>Paper Radio</h1><audio id="a" src="/tone.wav" loop></audio><button id="go" onclick="a.play()">Play</button>
<script>navigator.mediaSession.metadata = new MediaMetadata({ title: 'Folded Afternoon', artist: 'The Washi Band', artwork: [{ src: 'http://localhost:8765/icon/mail.png', sizes: '96x96', type: 'image/png' }] });</script></body>`);
  }
  if (q.url.startsWith('/dlslow')) {                    // a download that takes ~2.4s, so its progress can be seen
    const name = (q.url.match(/name=([\w.-]+)/) || [, 'washi-slow.pdf'])[1], chunk = Buffer.alloc(16384, 97), n = 8;
    r.setHeader('content-disposition', `attachment; filename="${name}"`); r.setHeader('content-type', 'application/octet-stream'); r.setHeader('content-length', String(chunk.length * n));
    let i = 0; const t = setInterval(() => { r.write(chunk); if (++i === n) { clearInterval(t); r.end(); } }, 300); q.on('close', () => clearInterval(t)); return;
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
