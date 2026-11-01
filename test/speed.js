'use strict';
/* Settings → Help → Speed check runs and reports every part. */
const { start, sleep, ok, done, skipSetup, shot } = require('./lib');
(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  await ui.evaluate(() => openSetup('settings', 'help')); await sleep(1500);
  await ov.click('text=Run a speed check'); await sleep(4200);
  const rows = await ov.evaluate(() => [...document.querySelectorAll('.srow')].map(r => r.textContent));
  console.log('  ' + rows.join('\n  '));
  ok(rows.length === 6, 'speed check shows 6 lines');
  ok(rows.some(r => /Web pages \(1 awake\)/.test(r)) && rows.some(r => /Busiest page.*Test page 1/.test(r)), 'it finds the open page');
  await ov.click('text=Copy report'); await sleep(300);
  const sb2 = await ov.evaluate(() => { const [a, c] = document.querySelectorAll('.speed-btns button'); return [a.getBoundingClientRect().right, c.getBoundingClientRect().x, getComputedStyle(c).position]; });
  ok(sb2[1] > sb2[0] && sb2[2] === 'static', 'buttons sit side by side: ' + JSON.stringify(sb2));
  shot('speed'); await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
