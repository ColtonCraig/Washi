'use strict';
/* When an update has downloaded: a paper postcard at the bottom right of the window offers "Restart now" or "Later",
   with the release's highlights. Real clicks; Later (and Esc) don't ask again for that version; "Stay quiet" in Settings
   means no card (it installs on quit). Every look, a small window; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  const card = async () => { const o = await ui.evaluate(() => R.updRect || { x: 0, y: 0 }); return ov.evaluate(o => { const e = document.querySelector('.panel.on .pop.upd'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.innerText, x: r.x + o.x, y: r.y + o.y, w: r.width, h: r.height }; }, o); };
  const btnAt = async id => { const o = await ui.evaluate(() => R.updRect); const r = await ov.evaluate(id => { const q = document.getElementById(id).getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, id); return { x: X0 + o.x + r.x, y: Y0 + o.y + r.y }; };
  const offer = (again) => ui.evaluate(a => B.setupAct({ type: 'test:update', version: '9.9.9', notes: '- Tabs remember where you scrolled\n- A calmer Focus mode\n- Faster start', again: a }), !!again);
  const waitCard = async want => { let c; for (let i = 0; i < 40; i++) { c = await card(); if (!!c === want) return c; await sleep(100); } return c; };
  await offer(); let c = await waitCard(true);
  ok(c && /Fresh copy/.test(c.text) && /9\.9\.9/.test(c.text) && /Restart now/.test(c.text) && /Later/.test(c.text), 'a downloaded update shows a postcard: version, Restart now, Later');
  ok(c && /remember where you scrolled/.test(c.text), 'with the release\'s highlights');
  const win = await ui.evaluate(() => ({ w: innerWidth, h: innerHeight, L: layout().stage }));
  ok(c && c.x + c.w <= win.L.x + win.L.w + 2 && c.y + c.h <= win.L.y + win.L.h + 2 && c.x > win.w / 2 && c.y > win.h / 2, 'at the bottom right, over the page');
  await sleep(700); await audit(ov, 'update card'); shot('upd-light');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ov.evaluate(() => { const b = document.getElementById('ulater'); if (b) b.click(); }); await waitCard(false);
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    await offer(); await waitCard(true); await sleep(800); await audit(ov, 'update card, ' + nm); shot('upd-' + nm.replace(/ /g, '-'));
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  // Later, with a real click: it goes, and doesn't come back for this version
  { const p = await btnAt('ulater'); ptr(`move ${p.x} ${p.y}`); await sleep(100); ptr('down'); ptr('up'); }
  ok(!(await waitCard(false)), '"Later" (a real click) puts it away');
  await offer(true); await sleep(1200);
  ok(!(await card()), 'and it doesn\'t ask again for that version');
  // Esc counts as Later
  await ui.evaluate(() => B.setupAct({ type: 'test:update', version: '9.9.10' })); await waitCard(true); await sleep(400);
  K('tap:Escape'); ok(!(await waitCard(false)), 'Esc puts it away too');
  // Restart now
  await ui.evaluate(() => B.setupAct({ type: 'test:update', version: '9.9.11' })); c = await waitCard(true); await sleep(400);
  { const p = await btnAt('unow'); ptr(`move ${p.x} ${p.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(300); }
  ok(await ov.evaluate(() => { const b = document.getElementById('unow'); return !!b && b.disabled && /Restarting/.test(b.textContent); }), '"Restart now" starts the restart (installs it)');
  await ui.evaluate(() => B.overlayCancel()); await sleep(400);
  // Stay quiet
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { updates: 'quiet' } })); await sleep(400);
  await ui.evaluate(() => B.setupAct({ type: 'test:update', version: '9.9.12' })); await sleep(1500);
  ok(!(await card()), 'Settings › "Stay quiet": no card (it installs when you quit)');
  // a small window
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { updates: 'card' } })); await sleep(300);
  ptr('resize 760 560'); await sleep(1200);
  await ui.evaluate(() => B.setupAct({ type: 'test:update', version: '9.9.13' })); await waitCard(true); await sleep(800);
  await audit(ov, 'update card in a small window'); shot('upd-small');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
