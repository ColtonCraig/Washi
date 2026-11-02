'use strict';
/* Tab peek (like Dia): resting the real pointer on a sidebar tab for a moment shows a polaroid of it beside the
   sidebar (a snapshot of the page, its title and site); it follows you down the list straight away, goes when you leave,
   not for the tab you're on, a sleeping tab shows its icon instead, it never takes the keyboard, and Settings can turn it
   off. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57, TOP = 38;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
(async () => {
  const b = await start(); const { ui, sb, ov } = b; await skipSetup(b);
  for (const p of ['p1', 'p2', 'p3']) { await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), p); await sleep(900); }
  await ui.evaluate(() => { const id = 't' + Math.random().toString(36).slice(2, 8); S.tabs[id] = { url: 'https://example.org/sleepy', title: 'A sleeping tab', seen: Date.now() }; sp().tabs.push(id); render(); });
  await sleep(1500);
  const tabAt = title => sb.evaluate(t => { const e = [...document.querySelectorAll('.tab')].find(x => x.querySelector('.ttl').textContent === t); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: e.dataset.id }; }, title);
  const peek = () => ov.evaluate(() => { const e = document.getElementById('tpk'); if (!e || !e.classList.contains('on')) return null; const im = e.querySelector('img'); return { title: e.querySelector('b').textContent, site: e.querySelector('span').textContent, img: !!im && im.src.startsWith('data:image/jpeg') && im.naturalWidth > 100, sleeping: /Sleeping/.test(e.innerText), focus: document.hasFocus() }; });
  const move = (r) => ptr(`move ${X0 + r.x} ${Y0 + TOP + r.y}`);
  const waitPeek = async (want, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await peek(); if (want(p)) return [p, Date.now() - t0]; await sleep(50); } return [await peek(), -1]; };
  const L = await ui.evaluate(() => layout());
  ptr(`move ${X0 + L.stage.x + 300} ${Y0 + 400}`); ptr('down'); ptr('up'); await sleep(400);   // the page has the keyboard
  const pg = b.pages().filter(x => x.url().includes('/p3.html')).pop();
  let r = await tabAt('Test page 2'); move(r); await sleep(250);
  ok(!(await peek()), 'just passing over a tab shows nothing yet');
  let [p, t] = await waitPeek(x => x);
  ok(p && p.title === 'Test page 2' && p.site === 'localhost:8765' && p.img, `resting on it shows a polaroid with a snapshot, its title and site (after ${t}ms)`);
  ok(p && await pg.evaluate(() => document.hasFocus()), 'it doesn\'t take the keyboard (the page keeps it)');
  const ob = await ui.evaluate(() => 0); void ob;
  await sleep(350);   // after its fade-in
  await audit(ov, 'tab peek'); shot('tabpeek-light');
  r = await tabAt('Test page 1'); move(r);
  [p, t] = await waitPeek(x => x && x.title === 'Test page 1', 600);
  ok(t >= 0 && t < 500, `moving to the next tab, it follows straight away (${t}ms)`);
  r = await tabAt('A sleeping tab'); move(r);
  [p] = await waitPeek(x => x && x.title === 'A sleeping tab');
  ok(p && !p.img && p.sleeping, 'a sleeping tab shows its icon and says it\'s sleeping (no snapshot to show)');
  ptr(`move ${X0 + L.stage.x + 300} ${Y0 + 400}`);
  [p, t] = await waitPeek(x => !x, 800);
  ok(t >= 0, `leaving the sidebar puts it away (${t}ms)`);
  await sleep(300);
  r = await tabAt('Test page 3'); move(r); await sleep(1300);
  ok(!(await peek()), 'the tab you\'re on doesn\'t get a peek (you can already see it)');
  for (const [nm, pt] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), pt); await sleep(500);
    ptr(`move ${X0 + L.stage.x + 300} ${Y0 + 400}`); await sleep(400);
    r = await tabAt('Test page 2'); move(r); [p] = await waitPeek(x => x);
    ok(!!p, `${nm}: the peek shows`); await sleep(350); await audit(ov, `tab peek, ${nm}`); shot('tabpeek-' + nm.replace(/ /g, '-'));
  }
  ptr(`move ${X0 + L.stage.x + 300} ${Y0 + 400}`); await sleep(500);
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { tabPeek: false } })); await sleep(400);
  r = await tabAt('Test page 1'); move(r); await sleep(1300);
  ok(!(await peek()), 'Settings can turn tab previews off');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
