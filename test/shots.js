'use strict';
/* Screenshots of every main screen, light and dark, for design review (no assertions). OUT=dir */
const { start, sleep, skipSetup } = require('./lib');
const { execSync } = require('child_process'); const path = require('path'), fs = require('fs');
const OUT = process.env.OUT || '/tmp/washi-shots'; fs.mkdirSync(OUT, { recursive: true });
const snap = n => execSync(`import -window root ${path.join(OUT, n)}.png`);
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  for (const u of ['p1', 'p2', 'trackers']) { await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), u); await sleep(700); }
  await ui.evaluate(() => { const f = S.spaces[0]; }); await sleep(800);
  for (const mode of ['light', 'dark']) {
    await ui.evaluate(m => B.setupMsg({ type: 'prefs', patch: { mode: m } }), mode); await sleep(900);
    snap(mode + '-browser');
    await ui.evaluate(() => openCmd('new')); await sleep(700); await ov.keyboard.type('pap'); await sleep(500); snap(mode + '-command'); await ov.keyboard.press('Escape'); await sleep(500);
    await ui.evaluate(() => openSetup('settings')); await sleep(1300); snap(mode + '-settings'); await ov.keyboard.press('Escape'); await sleep(600);
    await ui.evaluate(() => { const ids = spaceTabs(sp()); makePair(ids[0], ids[1]); showTab(ids[1]); placePanes(); commit(true); }); await sleep(900); snap(mode + '-split');
    await ui.evaluate(() => { S.pairs = []; placePanes(); commit(true); }); await sleep(600);
    await ui.click('#bSide'); await sleep(800); ptr('move 700 500'); await sleep(300); ptr('move 66 500'); await sleep(800); snap(mode + '-float');
    ptr('move 900 500'); await sleep(600); await ui.click('#bSide'); await sleep(800);
    await ui.evaluate(() => openTab('')); await sleep(900); snap(mode + '-empty');
  }
  await b.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
