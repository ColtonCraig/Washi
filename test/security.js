'use strict';
/* Security checks: pages can't reach Washi's internals, the interface can't reach the internet,
   https-first, dangerous-site warnings, remembered permissions, sandboxed pages. */
const { start, sleep, ok, shot, done, skipSetup } = require('./lib');
const fs = require('fs'), path = require('path'), os = require('os');
const PHISH = fs.readFileSync(path.join(__dirname, 'fixtures', 'phish-sample.txt'), 'utf8').trim().split('\n')[0];
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-sec-'));
  fs.writeFileSync(path.join(profile, 'site-permissions.json'), JSON.stringify({ 'http://localhost:8765': { geolocation: 'block' } }));
  const b = await start({ profile }); const { ui, ov, pages } = b;
  await skipSetup(b);
  const pageWith = s => pages().find(p => p.url().includes(s));
  const cur = () => ui.evaluate(() => ({ url: S.tabs[R.a].url, title: S.tabs[R.a].title, notice: R.notice[R.a] || null }));
  const go = async (u, w = 2500) => { await ui.evaluate(u => openTab(u), u); await sleep(w); };

  // ---------- the interface is walled off ----------
  const uiFetch = await ui.evaluate(() => fetch('http://localhost:8765/p1.html').then(() => 'loaded', () => 'blocked'));
  ok(uiFetch === 'blocked', 'Washi\'s own interface can\'t fetch from the internet');
  ok(await ui.evaluate(() => location.protocol) === 'washi:', 'interface is served from washi://, not file://');
  await go('http://localhost:8765/p1.html', 1800);
  const pg = pageWith('/p1.html');
  ok(await pg.evaluate(() => typeof window.washi === 'undefined' && typeof require === 'undefined' && typeof process === 'undefined'), 'web pages get no access to Washi or Node');
  await pg.evaluate(() => { location.href = 'https://washi.internal/proceed?k=guess'; }); await sleep(800);
  ok((await cur()).url.endsWith('/p1.html'), 'pages can\'t press Washi\'s own buttons (washi.internal is blocked)');

  // ---------- https-first ----------
  await go('http://washi-http.example:8765/p1.html', 3500); shot('sec-insecure');
  let c = await cur();
  ok(c.notice === 'insecure', `a plain-http site is tried over https first, then Washi asks (${c.notice})`);
  const ip = pages().find(p => p.url().startsWith('data:text/html'));
  await ip.click('a.ghost'); await sleep(2000);
  c = await cur();
  ok(c.url === 'http://washi-http.example:8765/p1.html' && c.title === 'Test page 1', 'choosing "Continue" loads the http site');
  ok(await ui.evaluate(() => document.getElementById('url').classList.contains('warn')), 'address label marks it not secure');

  // ---------- dangerous sites ----------
  await go(`http://${PHISH}:8765/p1.html`, 2500); shot('sec-danger');
  c = await cur();
  ok(c.notice === 'danger', `a known phishing site (${PHISH}) gets the warning instead of loading`);
  const dp = pages().find(p => p.url().startsWith('data:text/html') && p !== ip);
  ok(/Deceptive site ahead/.test(await dp.textContent('h1')), 'warning page says what\'s going on');
  await dp.click('a.btn'); await sleep(1200);
  c = await cur();
  ok(!(await ui.evaluate(p => Object.values(S.tabs).some(t => t.url.includes(p)), PHISH)), 'Back to safety closes the dangerous tab (nothing to go back to)');

  // ---------- remembered permissions ----------
  await go('http://localhost:8765/p2.html', 1500);
  const p2 = pageWith('/p2.html');
  const geo = await p2.evaluate(() => new Promise(r => navigator.geolocation.getCurrentPosition(() => r('granted'), e => r('denied:' + e.code), { timeout: 3000 })));
  ok(geo === 'denied:1', 'a site you blocked from your location is refused without asking again');
  await ui.evaluate(() => openSetup('settings', 'privacy')); await sleep(1500); shot('sec-perms');
  ok(await ov.evaluate(() => [...document.querySelectorAll('.perm b')].some(b => b.textContent.includes('localhost:8765'))), 'Settings lists the site and its permission');
  const permsNow = async () => { for (let i = 0; i < 20; i++) { try { return JSON.parse(fs.readFileSync(path.join(profile, 'site-permissions.json'), 'utf8')); } catch {} await sleep(150); } return {}; };
  const chipT = () => ov.evaluate(() => document.querySelector('.perm .chip').textContent.trim());
  const was = await chipT();
  await ov.click('.perm .chip'); await sleep(500);
  const now = await chipT();
  ok(/^✕/.test(was) && /^✓/.test(now), `clicking the choice flips it (${was} → ${now})`);
  await ov.evaluate(() => [...document.querySelectorAll('.perm .lnk')].find(b => b.textContent === 'Reset').click()); await sleep(500);
  ok(!(await permsNow())['http://localhost:8765'], 'Reset forgets the site');
  await ov.keyboard.press('Escape'); await sleep(500);

  // ---------- settings reach the main process ----------
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { gpc: true } })); await sleep(300);
  await go('http://localhost:8765/echo', 1500);
  const hdr = JSON.parse(await pageWith('/echo').textContent('#h'));
  ok(hdr['sec-gpc'] === '1' && !/Electron|washi/i.test(hdr['user-agent']), 'privacy header sent; user agent doesn\'t reveal Electron or Washi');

  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
