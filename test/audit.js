'use strict';
/* Clipping audit: walks every screen and reports anything cut off by its container or the window. */
const { start, sleep, ok, AUDIT, done, shot } = require('./lib');
(async () => {
  const b = await start();
  const { ui, sb, ov } = b;
  const report = async (where, page) => { const r = await page.evaluate(AUDIT); ok(r.length === 0, `${where}: nothing clipped` + (r.length ? '\n      ' + r.slice(0, 12).join('\n      ') : '')); };
  for (const mode of ['light', 'dark']) {
    if (await ov.evaluate(() => SETUP.isOpen())) { await ov.evaluate(() => SETUP.finish()); await sleep(700); }
    await ui.evaluate(m => { S.prefs.mode = m; theme(); openSetup('onboard'); }, mode); await sleep(1200);
    for (const [i, n] of ['hello', 'look', 'basics', 'guide', 'done'].entries()) {
      if (i === 1) { await ov.click('.cta .btn'); await sleep(900); } else if (i) { await ov.click('.crumb >> nth=' + i); await sleep(i === 3 ? 2200 : 900); }
      await report(`setup ${n} (${mode})`, ov); shot(`audit-${mode}-${n}`);
      if (n === 'look' || n === 'basics') { await ov.evaluate(() => { const p = document.querySelector('.pg'); p.scrollTop = p.scrollHeight; }); await sleep(300); await report(`setup ${n} scrolled (${mode})`, ov); }
    }
    await ov.evaluate(() => SETUP.finish()); await sleep(600);
  }
  await ui.evaluate(() => openSetup('settings')); await sleep(900);
  for (let y = 0; y < 12; y++) { await report('settings @' + y, ov); const end = await ov.evaluate(() => { const s = document.querySelector('.scroll'); const was = s.scrollTop; s.scrollTop += s.clientHeight * .8; return s.scrollTop === was; }); await sleep(250); if (end) break; }
  await ov.evaluate(() => SETUP.finish()); await sleep(600);
  await ui.evaluate(() => openSetup('guide')); await sleep(2000);
  await report('guide sheet', ov); shot('audit-guide');
  await ov.evaluate(() => SETUP.finish()); await sleep(600);
  // the browser itself, crowded: long titles, pins, folder, pair
  await ui.evaluate(() => {
    for (let i = 0; i < 9; i++) openTab('http://localhost:8765/p' + (i % 3 + 1) + '.html?really-long-title-' + 'x'.repeat(i * 8), { bg: true });
    const s = sp(), ids = spaceTabs(s);
    s.folders.push({ id: 'fq', name: 'A folder with a very long name indeed', open: true, tabs: [] }); s.tabs.push('f:fq'); moveToFolder(ids[3], 'fq');
    for (const id of ids.slice(5, 9)) pinToggle(id);
    makePair(ids[0], ids[1]); showTab(ids[0]); placePanes(); commit(true);
  });
  await sleep(1800);
  await report('sidebar docked', sb); await report('shell', ui); shot('audit-browser');
  await ui.evaluate(() => openCmd('new')); await sleep(700); await report('command bar', ov); await ov.keyboard.press('Escape'); await sleep(400);
  await ui.evaluate(() => toggleSide()); await sleep(900);
  const { execSync } = require('child_process'); const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
  ptr('move 700 500'); await sleep(300); ptr('move 63 500'); await sleep(1100);
  ok(await sb.evaluate(() => document.body.classList.contains('open')), 'floating sidebar opened by hovering the edge');
  await report('sidebar floating', sb);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
