'use strict';
/* Swipe between spaces: two fingers sideways on the sidebar (real sideways scroll events) goes to the next or previous
   space; one long swipe moves one space, not three; at the first space a swipe further back just stretches and springs
   back; scrolling up and down still scrolls the tabs. The tabs follow your fingers a little on the way. Light, dark,
   Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, sb } = b; await skipSetup(b);
  await ui.evaluate(() => { for (let i = 1; i <= 30; i++) openTab('http://localhost:8765/p' + (1 + i % 3) + '.html?n=' + i, { bg: true }); }); await sleep(2500);
  const cur = () => ui.evaluate(() => S.cur), order = await ui.evaluate(() => S.spaces.map(s => s.id));
  ok(order.length >= 3 && await cur() === order[0], 'starts in the first space: ' + order.join(', '));
  ptr(`move ${X0 + 120} ${Y0 + 38 + 300}`); await sleep(200);
  ptr('hscroll 1'); await sleep(700);
  ok(await cur() === order[1], 'two fingers to the left (scroll right) goes to the next space: ' + await cur());
  ptr('hscroll 1'); await sleep(700);
  ok(await cur() === order[2], 'again: the one after');
  ptr('hscroll -1'); await sleep(700);
  ok(await cur() === order[1], 'the other way goes back');
  await sleep(400); ptr('hscroll -12 0.01'); await sleep(900);
  ok(await cur() === order[0], 'one long swipe with momentum moves one space, not several: ' + await cur());
  // at the first space: stretch and spring back
  await sleep(400); ptr('hscroll -1'); await sleep(900);
  ok(await cur() === order[0] && await sb.evaluate(() => getComputedStyle(document.getElementById('tabs')).transform === 'none'), 'at the first space it stays, and the tabs spring back');
  // the tabs follow the fingers on the way
  const follow = await sb.evaluate(async () => { const t = document.getElementById('tabs'); for (const d of [12, 14, 16]) document.getElementById('sheet').dispatchEvent(new WheelEvent('wheel', { deltaX: d, bubbles: true, cancelable: true })); await new Promise(r => requestAnimationFrame(r)); return new DOMMatrix(getComputedStyle(t).transform).m41; });
  ok(follow < -5, `the tabs follow your fingers a little (${follow.toFixed(1)}px)`);
  shot('swipe-follow'); await sleep(600);
  ok(await sb.evaluate(() => getComputedStyle(document.getElementById('tabs')).transform === 'none') && await cur() === order[0], 'a short swipe springs back and stays put');
  // up and down still scrolls the tab list
  ok(await sb.evaluate(() => { const t = document.getElementById('tabs'); return t.scrollHeight > t.clientHeight + 40; }), '(the tab list is long enough to scroll)');
  const t0 = await sb.evaluate(() => document.getElementById('tabs').scrollTop);
  ptr('vscroll 3'); await sleep(600);
  ok(await sb.evaluate(() => document.getElementById('tabs').scrollTop) > t0 && await cur() === order[0], 'scrolling up and down still scrolls the tabs');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    ptr('hscroll 1'); await sleep(700);
    ok(await cur() === order[1], `${nm}: swiping works`);
    await audit(sb, `sidebar after a swipe, ${nm}`); shot('swipe-' + nm.replace(/ /g, '-'));
    ptr('hscroll -1'); await sleep(900);
  }
  // animations off: it still switches, nothing moves on the way
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { motion: false } })); await sleep(400);
  ok(await sb.evaluate(() => { document.getElementById('sheet').dispatchEvent(new WheelEvent('wheel', { deltaX: 20, bubbles: true, cancelable: true })); return getComputedStyle(document.getElementById('tabs')).transform === 'none'; }), 'with animations off the tabs don\'t move while you swipe');
  await sleep(500); ptr('hscroll 1'); await sleep(700);
  ok(await cur() === order[1], 'and swiping still switches spaces');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
