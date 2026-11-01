'use strict';
/* Little scraps: ⌥⌘N opens a small window, you type an address, browse, then "Open in Washi" moves the page into the
   sidebar without reloading it (or ⌘W throws it away). Links that open new windows go to Washi. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process');
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
(async () => {
  const b = await start(); const { ui } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1200);
  const scrapUI = () => b.pages().filter(p => p.url().endsWith('/scrap.html'));
  const tabCount = () => ui.evaluate(() => Object.keys(S.tabs).length);
  const n0 = await tabCount();

  // 1. ⌥⌘N (real keys) opens a little scrap with the address field ready
  K('down:Control_L down:Alt_L tap:n up:Alt_L up:Control_L'); await sleep(1800);
  ok(scrapUI().length === 1, '⌥⌘N opens a little scrap window');
  const su = scrapUI()[0];
  ok(await su.evaluate(() => document.activeElement && document.activeElement.id === 'q'), 'its address field is ready to type in');
  shot('scrap-empty');
  let a = await su.evaluate(AUDIT); ok(!a.length, 'scrap toolbar: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  // 2. type an address
  await su.fill('#q', 'localhost:8765/p2.html'); await su.press('#q', 'Enter'); await sleep(1500);
  let pg = b.pages().find(p => p.url().endsWith('/p2.html'));
  ok(!!pg, 'typing an address loads it in the scrap');
  ok(await su.evaluate(() => document.getElementById('q').value) === 'localhost:8765/p2.html', 'the toolbar shows where you are');
  await pg.evaluate(() => { window.__keep = 42; window.scrollTo(0, 0); });
  // 3. browse: link to p3, then back
  await su.fill('#q', 'localhost:8765/p3.html'); await su.press('#q', 'Enter'); await sleep(1300);
  ok(!(await su.evaluate(() => document.getElementById('back').disabled)), 'back is available after navigating');
  await su.click('#back'); await sleep(1200);
  pg = b.pages().find(p => p.url().endsWith('/p2.html'));
  ok(!!pg && await su.evaluate(() => /p2\.html$/.test(document.getElementById('q').value)), 'back works');
  await pg.evaluate(() => { window.__keep = 42; });
  shot('scrap-page');
  // 4. a link that opens a new window goes to Washi as a tab
  await pg.click('a[target=_blank]'); await sleep(1300);
  ok(await tabCount() === n0 + 1, 'a link that opens a new window opens as a tab in Washi');
  // 5. Open in Washi: same page, not reloaded, now a selected tab; the scrap window closes
  await su.click('#keep'); await sleep(1400);
  ok(scrapUI().length === 0, 'Open in Washi closes the scrap window');
  ok(await tabCount() === n0 + 2 && await ui.evaluate(() => S.tabs[R.a].url.endsWith('/p2.html')), 'and the page is now the selected tab in the sidebar');
  pg = b.pages().find(p => p.url().endsWith('/p2.html'));
  ok(pg && await pg.evaluate(() => window.__keep) === 42, 'it moved without reloading (its state is still there)');

  // 6. a scrap opened with a link; ⌘W (real keys) throws it away
  await ui.evaluate(() => B.scrapOpen('http://localhost:8765/links.html')); await sleep(1800);
  ok(scrapUI().length === 1 && !!b.pages().find(p => p.url().endsWith('/links.html')), 'a scrap can open straight to a link');
  K('down:Control_L tap:w up:Control_L'); await sleep(1200);
  ok(scrapUI().length === 0 && !b.pages().find(p => p.url().endsWith('/links.html')), '⌘W in a scrap closes it and its page');
  ok(await tabCount() === n0 + 2, 'closing a scrap doesn\'t touch your tabs');
  // 7. ⌘O (real keys) keeps it, like the button
  await ui.evaluate(() => B.scrapOpen('http://localhost:8765/trackers.html')); await sleep(1800);
  K('down:Control_L tap:o up:Control_L'); await sleep(1400);
  ok(scrapUI().length === 0 && await ui.evaluate(() => S.tabs[R.a].url.endsWith('/trackers.html')), '⌘O moves the scrap into Washi');
  // 8. a page that fails to load shows the paper notice, inside the scrap
  await ui.evaluate(() => B.scrapOpen('http://localhost:1/nothing')); await sleep(2200);
  ok(!!b.pages().find(p => p.url().startsWith('data:text/html')), 'a page that can\'t load shows the notice in the scrap');
  await scrapUI()[0].evaluate(() => window.close ? 0 : 0);
  // 9. command bar action
  await ui.evaluate(() => openCmd('new')); await sleep(500); await b.ov.keyboard.type('little scrap'); await sleep(400);
  const lbs = await b.ov.evaluate(() => [...document.querySelectorAll('#res .r .lb')].map(e => e.textContent));
  ok(lbs.slice(0, 3).includes('New little scrap'), 'the command bar has "New little scrap"');
  await b.ov.keyboard.press('Escape');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
