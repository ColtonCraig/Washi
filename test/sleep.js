'use strict';
/* Sleeping tabs (to free memory) wake up as if they'd never slept: the back/forward history and the scroll position are
   kept. Clicking a tab the moment it starts to sleep keeps it awake. A pinned tab you ⌘W keeps its history too. */
const { start, sleep, ok, done, skipSetup } = require('./lib');
(async () => {
  const b = await start(); const { ui } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1500);
  const id = await ui.evaluate(() => focusedId());
  await ui.evaluate(() => navigate('http://localhost:8765/links.html')); await sleep(1200);
  await ui.evaluate(() => navigate('http://localhost:8765/article.html')); await sleep(1500);
  const art = b.pages().find(p => p.url().includes('/article.html'));
  await art.evaluate(() => scrollTo(0, 600)); await sleep(300);
  const y0 = await art.evaluate(() => scrollY);
  const other = await ui.evaluate(id => Object.keys(S.tabs).find(k => k !== id), id);
  await ui.evaluate(o => selectTab(o), other); await sleep(600);
  await ui.evaluate(id => { B.tabSleep(id); R.live[id] = false; render(); }, id);
  const asleep = async () => await ui.evaluate(() => B.setupAct({ type: 'test:metrics' }).then(m => m.tabsLive)) === 1 && !b.pages().some(p => p.url().includes('/article.html'));
  let gone = false; for (let i = 0; i < 40 && !(gone = await asleep()); i++) await sleep(200);
  ok(gone, 'the tab sleeps: its page is gone from memory');
  await ui.evaluate(id => selectTab(id), id);
  let w = null, y1 = null; for (let i = 0; i < 40; i++) { w = b.pages().filter(p => p.url().includes('/article.html')).pop(); y1 = w && await w.evaluate(() => document.readyState === 'complete' ? scrollY : null).catch(() => null); if (y1 != null && Math.abs(y1 - y0) < 30) break; await sleep(200); }
  ok(w && Math.abs(y1 - y0) < 30, `waking it, the page is back where you'd scrolled to (${y0} → ${y1})`);
  const backTo = async re => { await ui.evaluate(() => B.tabAct(focusedId(), 'back')); let u = ''; for (let i = 0; i < 30; i++) { u = await ui.evaluate(() => S.tabs[focusedId()].url); if (re.test(u)) break; await sleep(200); } return u; };
  let u = await backTo(/links\.html/); ok(/links\.html/.test(u), 'and Back still goes to the page before it' + (/links/.test(u) ? '' : ': ' + u));
  u = await backTo(/p1\.html/); ok(/p1\.html/.test(u), 'and the one before that' + (/p1/.test(u) ? '' : ': ' + u));
  // clicked right as it starts to sleep: it stays awake
  await ui.evaluate(o => selectTab(o), other); await sleep(600);
  await ui.evaluate(id => { B.tabSleep(id); R.live[id] = false; selectTab(id); }, id); await sleep(1500);
  const pg = b.pages().filter(p => /p1\.html|links\.html/.test(p.url())).pop();
  ok(!!pg && await pg.evaluate(() => document.readyState === 'complete' && document.body.innerText.length > 5).catch(() => false), 'clicked the moment it falls asleep, it stays awake and shows its page');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
