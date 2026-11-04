'use strict';
/* Memory: a lived-in profile of 30 tabs (pages that use memory like real sites). Measures what Washi itself uses and
   what the pages use: right after a restart (only the tab you're looking at and a few recent ones are awake), after
   visiting every tab, and once tabs have gone to sleep. Prints the numbers (for before/after comparisons) and checks
   the ones Washi controls: restarts are light, sleeping really frees the pages, Washi's own interface stays small. */
const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, ok, done } = require('./lib');
const N = +(process.env.MEM_TABS || 30);
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-mem-'));
  const tabs = {}, ids = []; for (let i = 0; i < N; i++) { const id = 't' + i; ids.push(id); tabs[id] = { url: `http://localhost:8765/heavy.html?${i}`, title: 'Heavy ' + i, seen: Date.now() - i * 60000 }; }
  fs.writeFileSync(path.join(profile, 'state.json'), JSON.stringify({ tabs, pins: [], pairs: [], cur: 'home', dock: true, history: [], closed: [], archive: [], prefs: { done: true, seenVer: require('../package.json').version }, spaces: [{ id: 'home', name: 'Home', h: 18, tabs: ids, folders: [], act: 't0' }, { id: 'work', name: 'Work', h: 200, tabs: [], folders: [] }] }));
  const b = await start({ profile, fresh: false }); const { ui } = b;
  const m = () => ui.evaluate(() => B.setupAct({ type: 'test:metrics', split: true }));
  const say = (what, x) => console.log(`  Memory ${what}: ${x.total} MB in ${x.procs} processes, ${x.tabsLive} pages awake  ${JSON.stringify(x.by)}`);
  await sleep(9000);
  const a = await m(); say('after a restart', a);
  ok(a.tabsLive <= 4, `after a restart only a few of the ${N} tabs are awake (${a.tabsLive})`);
  for (const id of ids) { await ui.evaluate(id => selectTab(id), id); await sleep(250); }
  await ui.evaluate(id => selectTab(id), ids[0]); await sleep(6000);
  const v = await m(); say(`after visiting all ${N} tabs`, v);
  ok(v.tabsLive >= N - 1, `visited, all ${v.tabsLive} pages are awake`);
  const uiMB = x => Object.keys(x.by).filter(k => k.startsWith('ui')).reduce((s, k) => s + x.by[k], 0);
  // each interface view is one renderer (about 100-140 MB of fixed cost, most of it Chromium's own; its JS heap is ~3 MB).
  // What Washi controls is that they don't grow with your tabs: thumbnails, favicons and titles mustn't pile up in them.
  ok(Object.keys(v.by).filter(k => k.startsWith('ui')).every(k => v.by[k] < 200), 'each interface view stays under 200 MB: ' + Object.keys(v.by).filter(k => k.startsWith('ui')).map(k => k + ' ' + v.by[k]).join(', '));
  ok(uiMB(v) - uiMB(a) < 100, `and visiting ${N} tabs barely grows them: ${uiMB(a)} → ${uiMB(v)} MB`);
  // Memory saver: over the limit, the oldest idle tabs sleep first (never recent ones)
  await ui.evaluate(ids => { ids.forEach((id, i) => { if (id !== focusedId()) S.tabs[id].seen = Date.now() - (20 + i) * 60e3; }); S.tabs[ids[1]].seen = Date.now() - 60e3; }, ids);
  const r = await ui.evaluate(cap => B.setupAct({ type: 'test:memcheck', capMB: cap }), v.total - 600); await sleep(3000);
  const ms = await m(); say('after Memory saver', ms);
  const slept = await ui.evaluate(ids => ids.filter(id => !R.live[id]), ids);
  ok(r.over >= 600 && slept.length >= 4 && slept.length <= 6, `Memory saver: ${r.over} MB over the limit puts ${slept.length} idle tabs to sleep`);
  ok(slept.every(id => +id.slice(1) >= N - 7) && !slept.includes(ids[1]), 'the ones you used longest ago, never one from the last 10 minutes: ' + slept.join(' '));
  ok(ms.total < v.total, `${v.total} → ${ms.total} MB`);
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { memSaver: 'off' } })); await sleep(500);
  const off = await ui.evaluate(() => B.setupAct({ type: 'test:memcheck', capMB: 0 }));
  ok(off.over === 0, 'Memory saver off: nothing is put to sleep');
  // time passes: everything but the tab you're on has been idle for over an hour
  await ui.evaluate(() => { for (const id in S.tabs) if (id !== focusedId()) S.tabs[id].seen = Date.now() - 2 * 3600e3; sleepTabs(); }); await sleep(5000);
  const s2 = await m(); say('after tabs go to sleep', s2);
  ok(s2.tabsLive <= 2, `idle tabs go to sleep (${s2.tabsLive} awake)`);
  ok(s2.total < v.total * .5, `and that frees most of the memory: ${v.total} → ${s2.total} MB`);
  fs.writeFileSync(path.join(process.env.WASHI_SHOTS || os.tmpdir(), 'memory.json'), JSON.stringify({ restart: a, visited: v, slept: s2 }, null, 1));
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
