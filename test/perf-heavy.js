'use strict';
/* Speed with a lived-in profile: 60 tabs and 3,000 history entries with icons (an old-style profile that kept history
   inside state.json). Clicking tabs must stay quick, and the main process (which routes every click and key) must
   never be blocked by saving. */
const { start, sleep, ok, done, skipSetup } = require('./lib');
const fs = require('fs'), os = require('os'), path = require('path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-heavy-'));
const fav = 'data:image/png;base64,' + 'A'.repeat(1800);
const tabs = {}, ids = [];
for (let i = 0; i < 60; i++) { const id = 't' + i; ids.push(id); tabs[id] = { url: `http://localhost:8765/p${1 + (i % 3)}.html?${i}`, title: 'Tab ' + i, fav, seen: Date.now() }; }
const history = Array.from({ length: 3000 }, (_, i) => ({ url: `https://example.com/page/${i}/some/longer/path?q=${i}`, title: 'A page with a fairly ordinary title number ' + i, fav, t: Date.now() - i * 60e3 }));
fs.writeFileSync(path.join(profile, 'state.json'), JSON.stringify({ tabs, pins: [], pairs: [], cur: 'home', dock: true, history, closed: [], archive: [],
  prefs: { done: true }, spaces: [{ id: 'home', name: 'Home', h: 18, tabs: ids, folders: [], act: 't0' }] }));
const before = fs.statSync(path.join(profile, 'state.json')).size;
(async () => {
  const b = await start({ profile, fresh: false }); const { ui } = b;
  await sleep(2500);
  ok(await ui.evaluate(() => S.history.length) === 3000, 'old profile: all 3,000 history entries loaded');
  const old = await ui.evaluate(() => { const t = performance.now(); JSON.stringify({ ...S, history: S.history }); return performance.now() - t; });
  console.log(`  (for comparison: the old save, with history inside, took ${old.toFixed(1)} ms in the window plus a ${(6).toFixed(0)} MB blocking disk write in the main process, after every click)`);
  // first visit to each tab starts its page (that has a cost: a new web page process); measure after they are awake
  for (let i = 0; i < 40; i++) { await ui.evaluate(id => selectTab(id), ids[(i * 7) % ids.length]); await sleep(120); }
  await sleep(2000);
  // main-process responsiveness while clicking through tabs as fast as possible
  const r = await ui.evaluate(async ids => {
    const lags = []; let stop = false;
    (async () => { while (!stop) { const t = performance.now(); await B.keysList(); lags.push(performance.now() - t); await new Promise(r => setTimeout(r, 16)); } })();
    const sw = []; for (let i = 0; i < 40; i++) { const t = performance.now(); selectTab(ids[(i * 7) % ids.length]); await new Promise(r => requestAnimationFrame(() => r())); sw.push(performance.now() - t); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 1500)); stop = true;
    const p = (a, q) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)];
    const t = performance.now(); doSave(); const save = performance.now() - t;
    return { sw50: p(sw, .5), sw95: p(sw, .95), lag95: p(lags, .95), lagMax: Math.max(...lags), save };
  }, ids);
  ok(r.sw95 < 50, `switching tabs: median ${r.sw50.toFixed(1)} ms, 95th percentile ${r.sw95.toFixed(1)} ms`);
  ok(r.lagMax < 60, `main process never stalls while you click (worst reply ${r.lagMax.toFixed(1)} ms, 95th pct ${r.lag95.toFixed(1)} ms)`);
  ok(r.save < 8, `saving after a click costs ${r.save.toFixed(1)} ms (history is no longer re-saved every time)`);
  await sleep(1500);
  const sz = n => fs.existsSync(path.join(profile, n)) ? fs.statSync(path.join(profile, n)).size : 0;
  const st = sz('win-w1.json') + sz('shared.json'), hs = sz('history.json');
  ok(hs > 0 && st > 0 && st < before / 10, `history moved to its own file (old state.json ${(before / 1e6).toFixed(1)} MB → window + shared files ${(st / 1e3).toFixed(0)} KB)`);
  await b.stop();
  const b2 = await start({ profile, fresh: false, port: 9223 }); await sleep(2500);
  ok(await b2.ui.evaluate(() => S.history.length) === 3000 && await b2.ui.evaluate(() => Object.keys(S.tabs).length) === 60, 'restart: tabs and history all come back');
  await b2.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
