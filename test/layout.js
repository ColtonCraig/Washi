'use strict';
/* Resizable split (dragged with the real mouse), its limits and memory, the slimmer frame, and where new scraps go. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
(async () => {
  const b = await start(); const { ui, sb } = b; await skipSetup(b);
  for (const p of ['p1', 'p2', 'p3']) { await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), p); await sleep(700); }
  // 1. the frame is slimmer and every button is still there
  const top = await ui.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().height);
  ok(top === 44, `top bar is 44px (was 52): ${top}`);
  ok(await ui.evaluate(() => ['bSide', 'bBack', 'bFwd', 'bReload', 'bBoost', 'bShield', 'bSplit'].every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 28 && r.height >= 28; })), 'all the top-bar buttons are still there at full size');
  const L0 = await ui.evaluate(() => ({ ...layout(), iw: innerWidth }));
  ok(L0.stage.x === 236 && L0.iw - (L0.stage.x + L0.stage.w) === 8, `the page gets more room (starts at ${L0.stage.x}px, 8px margin on the right)`);
  let a = await ui.evaluate(AUDIT); ok(!a.length, 'top bar and frame: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  a = await sb.evaluate(AUDIT); ok(!a.length, 'slimmer sidebar: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  shot('layout-frame');
  // 2. make a split and drag the gap with the real mouse
  await ui.evaluate(() => { const ids = spaceTabs(sp()); makePair(ids[0], ids[1]); showTab(ids[1]); placePanes(); commit(true); }); await sleep(900);
  let L = await ui.evaluate(() => layout());
  ok(L.split && Math.abs(L.a.w - L.b.w) <= 1, 'a new split starts even');
  ok(await ui.evaluate(() => !document.getElementById('gutter').hidden), 'the gap between the pages can be grabbed');
  const gx = 60 + L.gap.x + L.gap.w / 2, gy = 57 + L.gap.y + 300;
  ptr(`move ${gx} ${gy}`); await sleep(300); shot('layout-gutter-hover');
  ptr('down'); for (let i = 1; i <= 20; i++) { ptr(`move ${gx + i * 10} ${gy}`); } await sleep(200); ptr('up'); await sleep(700);
  L = await ui.evaluate(() => layout());
  ok(Math.abs(L.a.w - L.b.w - 400) < 12, `dragging the gap 200px right makes the left page 200px wider (${Math.round(L.a.w)} vs ${Math.round(L.b.w)})`);
  const urls = await ui.evaluate(() => [S.tabs[R.a].url, S.tabs[R.b].url]);
  const pw = await Promise.all(urls.map(u => b.pages().find(p => p.url() === u).evaluate(() => innerWidth)));
  ok(pw.includes(Math.round(L.a.w)) && pw.includes(Math.round(L.b.w)), `the real pages are resized to match (${pw})`);
  // limits: can't squeeze a page below 300px
  const L2 = await ui.evaluate(() => layout()); const g2 = 60 + L2.gap.x + L2.gap.w / 2;
  ptr(`move ${g2} ${gy}`); ptr('down'); for (let i = 1; i <= 30; i++) ptr(`move ${g2 + i * 40} ${gy}`); ptr('up'); await sleep(600);
  L = await ui.evaluate(() => layout());
  ok(L.b.w >= 299, `a page never gets narrower than 300px (${Math.round(L.b.w)})`);
  // remembered per split, restored when you come back
  const saved = await ui.evaluate(() => Object.values(S.ratios)[0]);
  await ui.evaluate(() => selectTab(spaceTabs(sp())[2])); await sleep(500); await ui.evaluate(() => selectTab(spaceTabs(sp())[0])); await sleep(700);
  L = await ui.evaluate(() => layout());
  ok(L.split && Math.abs(L.a.w / (L.stage.w - 8) - saved) < .01, 'leaving and coming back keeps the size you chose');
  // double-click evens it out
  const L3 = await ui.evaluate(() => layout()); const g3 = 60 + L3.gap.x + L3.gap.w / 2;
  ptr(`move ${g3} ${gy}`); ptr('down'); ptr('up'); await sleep(80); ptr('down'); ptr('up'); await sleep(700);
  L = await ui.evaluate(() => layout());
  ok(Math.abs(L.a.w - L.b.w) <= 1, 'double-clicking the gap makes both halves even again');
  // 3. new scraps: top (default) or bottom
  ok(await ui.evaluate(() => { openTab('http://localhost:8765/links.html', { bg: true }); const s = sp(); return S.tabs[s.tabs[0]].url.endsWith('/links.html'); }), 'by default a new scrap goes to the top');
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { newTabPos: 'bottom' } })); await sleep(300);
  ok(await ui.evaluate(() => { openTab('http://localhost:8765/trackers.html', { bg: true }); const s = sp(); return S.tabs[s.tabs[s.tabs.length - 1]].url.endsWith('/trackers.html'); }), 'with "At the bottom" it goes to the end of the list');
  await ui.evaluate(() => openSetup('settings', 'tabs')); await sleep(1200);
  ok(await b.ov.evaluate(() => [...document.querySelectorAll('.fld h4')].some(h => h.textContent === 'New scraps go')), 'the choice is in Settings › Tabs');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
