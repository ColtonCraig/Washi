'use strict';
/* Ctrl-Tab: hold Ctrl and tap Tab to walk back through recent tabs as cards; let go to switch. A quick tap flips to
   the previous tab with no cards. Shift goes the other way, Esc cancels, clicking a card works, and it works whether
   the keyboard is in a page or in Washi's own sidebar. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process');
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);     // real keyboard events (like a person), not synthetic page events
(async () => {
  const b = await start(); const { ui, ov, sb } = b; await skipSetup(b);
  const names = ['p1', 'p2', 'p3', 'links', 'trackers'];
  for (const n of names) { await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), n); await sleep(700); }
  const id = n => ui.evaluate(u => Object.keys(S.tabs).find(k => S.tabs[k].url.endsWith('/' + u + '.html')), n);
  // visit in this order so "recent" is: trackers (current), p3, links, p1, p2
  for (const n of ['p2', 'p1', 'links', 'p3', 'trackers']) { await ui.evaluate(i => selectTab(i), await id(n)); await sleep(350); }
  const cur = () => ui.evaluate(() => S.tabs[R.a].url.split('/').pop().replace('.html', ''));
  const page = () => b.pages().find(p => p.url().endsWith('/' + 'trackers.html'));
  const kb = async (p, fn) => { await p.bringToFront?.(); await fn(p.keyboard); };
  const cards = () => ov.evaluate(() => { const t = document.getElementById('sw'); return { on: t.classList.contains('on'), names: [...t.querySelectorAll('.swc b')].map(x => x.textContent), sel: [...t.querySelectorAll('.swc')].findIndex(x => x.classList.contains('on')) }; });

  // 1. quick tap from inside the page: back to the previous tab, no cards
  let p = page(); await p.click('body');
  K('down:Control_L tap:Tab up:Control_L'); await sleep(500);
  ok(await cur() === 'p3', 'a quick Ctrl-Tab flips to the tab you were on before: ' + await cur());
  ok(!(await cards()).on, 'no cards flash up for a quick tap');
  // and again: back to trackers (it toggles between the two most recent)
  p = b.pages().find(x => x.url().endsWith('/p3.html')); await p.click('body');
  K('down:Control_L tap:Tab up:Control_L'); await sleep(500);
  ok(await cur() === 'trackers', 'tapping again goes back');

  // 2. hold Ctrl, tap Tab three times: cards appear in recent order and the 3rd most recent is picked on release
  p = page(); await p.click('body');
  K('down:Control_L tap:Tab'); await sleep(300);
  let c = await cards();
  ok(c.on && c.names[0] === 'Trackers' && c.names[1] === 'Test page 3' && c.sel === 1, 'holding Ctrl shows the recent tabs as cards, newest first: ' + JSON.stringify(c));
  K('tap:Tab tap:Tab'); await sleep(250);
  c = await cards(); ok(c.sel === 3 && c.names[3] === 'Test page 1', 'each Tab moves along: ' + c.names[c.sel]);
  shot('switcher');
  const a = await ov.evaluate(AUDIT); ok(!a.length, 'switcher cards: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  // shift goes back one
  K('down:Shift_L tap:Tab up:Shift_L'); await sleep(200);
  c = await cards(); ok(c.sel === 2, 'Shift-Tab goes back one');
  K('up:Control_L'); await sleep(600);
  ok(await cur() === 'links' && !(await cards()).on, 'letting go of Ctrl switches to the picked tab and the cards go away: ' + await cur());

  // 3. Esc cancels
  p = b.pages().find(x => x.url().endsWith('/links.html')); await p.click('body');
  K('down:Control_L tap:Tab sleep:0.25 tap:Tab sleep:0.2 tap:Escape sleep:0.2 up:Control_L'); await sleep(500);
  ok(await cur() === 'links' && !(await cards()).on, 'Esc cancels: still on the same tab');

  // 4. clicking a card picks it
  K('down:Control_L tap:Tab'); await sleep(300);
  const box = await ov.$eval('#sw .swc:nth-child(4)', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const want = await ov.$eval('#sw .swc:nth-child(4) b', e => e.textContent);
  execSync(`python3 ${__dirname}/ptr.py move ${60 + box[0]} ${57 + box[1]}`); execSync(`python3 ${__dirname}/ptr.py down`); execSync(`python3 ${__dirname}/ptr.py up`); await sleep(400); K('up:Control_L'); await sleep(500);
  ok(await ui.evaluate(() => S.tabs[R.a].title) === want, 'clicking a card switches to it: ' + want);

  // 5. from the sidebar (keyboard focus in Washi's own view)
  const before = await cur();
  const tr = await sb.$eval('.tab:not(.on)', e => { const r = e.getBoundingClientRect(); return [r.x + 40, r.y + r.height / 2, e.dataset.id]; });
  execSync(`python3 ${__dirname}/ptr.py move ${60 + tr[0]} ${57 + 38 + tr[1]}`); execSync(`python3 ${__dirname}/ptr.py down`); execSync(`python3 ${__dirname}/ptr.py up`); await sleep(600);
  const clicked = await cur();
  K('down:Control_L tap:Tab up:Control_L'); await sleep(500);
  ok(clicked !== before && await cur() === before, 'works with the keyboard in the sidebar too (flips back to ' + before + ')');
  // 6. no cards / no change with a single tab in the space
  await ui.evaluate(() => switchSpace('work', { quiet: true })); await sleep(500);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html?solo')); await sleep(900);
  p = b.pages().find(x => x.url().endsWith('?solo')); await p.click('body');
  K('down:Control_L tap:Tab'); await sleep(300); const solo = await cards(); await p.keyboard.up('Control'); await sleep(300);
  ok(!solo.on && await ui.evaluate(() => S.tabs[R.a].url.endsWith('?solo')), 'one tab in the space: nothing happens');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
