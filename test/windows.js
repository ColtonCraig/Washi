'use strict';
/* Two windows, one browser: each window keeps its own tabs and folders, but everything else is the same Washi.
   A setting changed in one shows in the other at once (look, top bar, sidebar width, search engine). After an update,
   What's new shows once, not in every window. A new window starts with the sidebar the way you had it last. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup } = require('./lib');
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
(async () => {
  let b = await start(); await skipSetup(b); let w1 = b.ui;
  const shells = () => b.pages().filter(p => p.url().endsWith('/index.html'));
  const newWin = async () => { const n = shells().length; await w1.evaluate(() => B.setupAct({ type: 'test:focus' })); K('down:Control_L tap:n up:Control_L'); for (let i = 0; i < 30 && shells().length <= n; i++) await sleep(200); if (shells().length <= n) { console.log('  NOTE the virtual keyboard lost ⌘N (CI): New Window from the menu instead (test/shortcuts.js checks ⌘N itself)'); await w1.evaluate(() => B.setupAct({ type: 'test:newwin' })); for (let i = 0; i < 40 && shells().length <= n; i++) await sleep(250); } await sleep(1500); return shells().find(p => p !== w1 && !seen.has(p)); };
  const seen = new Set();
  await w1.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1200);
  const w2 = await newWin(); seen.add(w2); ok(!!w2, 'a second window');
  await w2.evaluate(() => openTab('http://localhost:8765/p2.html')); await sleep(1200);
  const urls = p => p.evaluate(() => Object.values(S.tabs).map(t => t.url.replace(/^.*\//, '')).sort().join(','));
  ok(await urls(w1) === 'p1.html' && await urls(w2) === 'p2.html', `each window has its own tabs (${await urls(w1)} | ${await urls(w2)})`);

  // a setting changed in one window: the other follows at once
  await w1.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'dark', wobble: true, engine: 'ddg' } }));
  await w1.evaluate(() => TOOLBAR.save({ toolsOff: ['note', 'boost'] }));
  await w1.evaluate(() => { S.prefs.sbW = 320; B.sbMode({ docked: docked(), w: 320, resize: true }); render(); save(); });
  const look = p => p.evaluate(() => ({ cls: document.documentElement.className, tools: [...document.getElementById('tools').children].filter(e => e.dataset.tool && !e.hasAttribute('data-off')).map(e => e.dataset.tool).join(','), eng: S.prefs.engine, sb: Math.round(layout().a.x) }));
  let a, c; for (let i = 0; i < 20; i++) { a = await look(w1); c = await look(w2); if (JSON.stringify(a) === JSON.stringify(c)) break; await sleep(200); }
  ok(JSON.stringify(a) === JSON.stringify(c) && /dark/.test(c.cls) && /scrapbook/.test(c.cls) && !/note|boost/.test(c.tools) && c.eng === 'ddg', 'the other window follows: dark Scrapbook, the same top bar, search engine and sidebar width: ' + JSON.stringify(c));

  // a new window starts with the sidebar the way you had it (floating here)
  await w2.evaluate(() => { if (S.dock) toggleSide(); }); await sleep(900);
  const w3 = await newWin(); seen.add(w3);
  ok(!!w3 && await w3.evaluate(() => S.dock === false), 'a new window starts with the sidebar floating, like the last one');
  await w3.evaluate(() => { if (!S.dock) toggleSide(); }); await sleep(2500);   // (let that settle in every window first)

  // after an update, with both windows coming back: What's new once
  await w1.evaluate(() => { S.prefs.seenVer = '1.1.0'; S.prefs.showNews = true; save(); }); await sleep(1600);
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); await sleep(5000);
  const sh = b.pages().filter(p => p.url().endsWith('/index.html'));
  const ovs = b.pages().filter(p => /overlay\.html/.test(p.url()));
  let shown = 0; for (const o of ovs) if (await o.evaluate(() => !!document.querySelector('.nw .ttl')).catch(() => false)) shown++;
  ok(sh.length >= 2 && shown === 1, `after an update with ${sh.length} windows back, What's new shows in one of them (${shown})`);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
