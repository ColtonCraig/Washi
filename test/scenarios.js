'use strict';
/* Everyday power-user moves, with real keys and the real pointer where a person would use them:
   close a tab in a folder and ⇧⌘T puts it back in that folder, in its place (with its own name); Close Other Tabs and
   Close Tabs Below, and Undo brings them all back in order; ⌘W on a pinned tab only unloads it; Move to Space; a
   folder's collapsed state, pins and the order survive a restart; Duplicate. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, shot } = require('./lib');
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
(async () => {
  let b = await start(); let { ui, ov, sb } = b; await skipSetup(b);
  const U = n => `http://localhost:8765/p${(n % 3) + 1}.html?n=${n}`;
  await ui.evaluate(() => { for (let i = 5; i >= 0; i--) openTab(`http://localhost:8765/p${(i % 3) + 1}.html?n=${i}`, { bg: true }); }); await sleep(1500);
  const list = () => ui.evaluate(() => sp().tabs.filter(k => !k.startsWith('f:')).map(k => (S.tabs[k].url.match(/n=(\d+)/) || [])[1]).join(','));
  const into = async () => { const L = await ui.evaluate(() => layout().a); ptr(`move ${X0 + L.x + L.w / 2} ${Y0 + L.y + 300}`); await sleep(60); ptr('down'); ptr('up'); await sleep(250); };
  const byN = n => ui.evaluate(n => Object.keys(S.tabs).find(k => new RegExp('n=' + n + '$').test(S.tabs[k].url)), String(n));

  // ---------- a tab in a folder comes back into it ----------
  await ui.evaluate(() => { const s = sp(); const ids = s.tabs.filter(k => !k.startsWith('f:')).slice(0, 3); const f = { id: 'fScn', name: 'Work stuff', open: true, tabs: ids }; s.tabs = s.tabs.filter(k => !ids.includes(k)); s.folders.push(f); s.tabs.unshift('f:fScn'); render(); save(); });
  await sleep(600);
  const ft = () => ui.evaluate(() => sp().folders.find(f => f.id === 'fScn').tabs.map(k => (S.tabs[k].url.match(/n=(\d+)/) || [])[1]).join(','));
  const f0 = await ft(); const mid = await ui.evaluate(() => sp().folders.find(f => f.id === 'fScn').tabs[1]);
  await ui.evaluate(id => { S.tabs[id].name = 'My middle tab'; selectTab(id); }, mid); await sleep(800);
  await into(); K('down:Control_L tap:w up:Control_L'); await sleep(800);
  ok((await ft()).split(',').length === 2, 'closing a tab in a folder takes it out: ' + await ft());
  await into(); K('down:Control_L down:Shift_L tap:t up:Shift_L up:Control_L'); await sleep(1200);
  ok(await ft() === f0, `⇧⌘T puts it back in its folder, in its place (${f0})`);
  ok(await ui.evaluate(() => sp().folders.find(f => f.id === 'fScn').tabs.some(k => S.tabs[k].name === 'My middle tab')), 'with the name you gave it');

  // ---------- Close Other Tabs / Close Tabs Below, and Undo ----------
  const l0 = await list(), first = (await ui.evaluate(() => sp().tabs.filter(k => !k.startsWith('f:'))[0]));
  await ui.evaluate(id => { R.menuTab = id; menuClick('closebelow'); }, first); await sleep(900);
  ok((await list()).split(',').length === 1, 'Close Tabs Below leaves just the first loose tab: ' + await list());
  ok(await ov.evaluate(() => /Closed \d+ tabs below/.test(document.getElementById('toast').textContent)), 'with a toast and Undo');
  await ov.evaluate(() => document.getElementById('toastBtn').click()); await sleep(2200);
  ok(await list() === l0, `Undo brings them all back, in order (${l0})`);
  const m = await ui.evaluate(() => sp().tabs.filter(k => !k.startsWith('f:'))[1]);
  await ui.evaluate(id => { R.menuTab = id; menuClick('closeothers'); }, m); await sleep(900);
  ok((await list()).split(',').length === 1 && await ui.evaluate(() => sp().folders.find(f => f.id === 'fScn').tabs.length === 3), 'Close Other Tabs closes the other loose tabs (the folder\'s are left alone)');
  await ov.evaluate(() => document.getElementById('toastBtn').click()); await sleep(2200);
  ok(await list() === l0, 'Undo again: all back');
  ok(await ui.evaluate(id => tabMenuItems(id).some(i => i.id === 'closeothers') && tabMenuItems(id).some(i => i.id === 'closebelow'), m), 'both are in the tab\'s menu');

  // ---------- pinned tabs ----------
  const pinId = await byN(0);
  await ui.evaluate(id => { if (!S.pins.includes(id)) pinToggle(id); selectTab(id); }, pinId); await sleep(900);
  await into(); K('down:Control_L tap:w up:Control_L'); await sleep(800);
  ok(await ui.evaluate(id => S.pins.includes(id) && !!S.tabs[id] && !R.live[id], pinId), '⌘W on a pinned tab unloads it: it stays pinned');
  await ui.evaluate(id => selectTab(id), pinId); await sleep(1200);
  ok(await ui.evaluate(id => R.live[id] && focusedId() === id, pinId), 'clicking it loads it again');

  // ---------- Move to Space ----------
  const mv = await byN(4);
  await ui.evaluate(id => { R.menuTab = id; menuClick('mv:work'); }, mv); await sleep(900);
  ok(await ui.evaluate(id => S.spaces.find(x => x.id === 'work').tabs.includes(id) && !S.spaces.find(x => x.id === 'home').tabs.includes(id), mv), 'Move to Space › Work moves it there');

  // ---------- Duplicate ----------
  const n0 = await ui.evaluate(() => Object.keys(S.tabs).length), d = await byN(5);
  await ui.evaluate(id => { R.menuTab = id; menuClick('dup'); }, d); await sleep(1200);
  ok(await ui.evaluate(n => Object.keys(S.tabs).length === n + 1 && Object.values(S.tabs).filter(t => /n=5$/.test(t.url)).length === 2, n0), 'Duplicate makes a second copy');

  // ---------- after a restart ----------
  await ui.evaluate(() => { sp().folders.find(f => f.id === 'fScn').open = false; render(); save(); }); await sleep(1300);
  const snap = await ui.evaluate(() => JSON.stringify({ order: sp().tabs, pins: S.pins, f: sp().folders.map(f => [f.id, f.open, f.tabs]) }));
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, ov, sb } = b); await sleep(2500);
  ok(await ui.evaluate(() => JSON.stringify({ order: sp().tabs, pins: S.pins, f: sp().folders.map(f => [f.id, f.open, f.tabs]) })) === snap, 'after a restart: the order, pins, and the collapsed folder are just as they were');
  ok(await sb.evaluate(() => { const f = document.querySelector('.fold[data-fid="fScn"]'); return !!f && /Work stuff/.test(f.textContent); }), 'and the sidebar shows the folder');
  shot('scenarios');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
