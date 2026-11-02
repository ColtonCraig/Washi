'use strict';
/* Several windows: ⌘N opens a new, empty window (same spaces, its own tabs and folders). Settings, space names,
   history and the archive are shared and update live in the other window. Quitting brings every window back as it
   was; closing a window on purpose forgets it; closing the last one keeps it. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-windows-'));
(async () => {
  let b = await start({ profile }); await skipSetup(b);
  const shells = () => b.pages().filter(p => p.url().endsWith('/index.html'));
  const byWid = async () => { const out = {}; for (const p of shells()) out[await p.evaluate(() => window.WID)] = p; return out; };
  let w1 = b.ui;
  await w1.evaluate(() => { openTab('http://localhost:8765/p1.html'); openTab('http://localhost:8765/p2.html'); const s = sp(); s.folders.push({ id: 'fOne', name: 'One', open: true, tabs: [] }); s.tabs.push('f:fOne'); render(); save(); });
  await sleep(1500);
  // 1. ⌘N (real keys) opens a second, empty window
  K('down:Control_L tap:n up:Control_L'); await sleep(3000);
  ok(shells().length === 2, '⌘N opens a new window');
  const all = await byWid(), wids = Object.keys(all), w2id = wids.find(x => x !== 'w1'), w2 = all[w2id];
  await sleep(800);
  ok(await w2.evaluate(() => spaceTabs(sp()).length === 0 && sp().folders.length === 0 && !S.pins.length), 'the new window starts empty: no tabs or folders');
  ok(await w2.evaluate(() => S.spaces.map(x => x.name).join()) === await w1.evaluate(() => S.spaces.map(x => x.name).join()), 'it has the same spaces');
  ok(!(await w2.evaluate(() => !!document.querySelector('#bSide'))) === false && !(await b.pages().find(p => p.url().endsWith('overlay.html') && p !== b.ov)?.evaluate(() => window.SETUP && SETUP.isOpen())), 'no welcome setup in a new window');
  // 2. its own tabs and folders, and the first window doesn't change
  await w2.evaluate(() => { openTab('http://localhost:8765/p3.html'); const s = sp(); s.folders.push({ id: 'fTwo', name: 'Two', open: true, tabs: [] }); s.tabs.push('f:fTwo'); render(); save(); }); await sleep(1500);
  ok(await w1.evaluate(() => sp().folders.map(f => f.name).join()) === 'One' && await w2.evaluate(() => sp().folders.map(f => f.name).join()) === 'Two', 'each window keeps its own folders in the same space');
  ok(await w1.evaluate(() => spaceTabs(sp()).length) === 2 && await w2.evaluate(() => spaceTabs(sp()).length) === 1, 'and its own tabs');

  // the second window works on its own: its sidebar, its command bar
  await w2.evaluate(() => openTab('http://localhost:8765/links.html')); await sleep(1200);
  let sb2 = null; for (const p of b.pages().filter(p => p.url().endsWith('/sidebar.html'))) if (await p.evaluate(() => document.querySelectorAll('.tab').length) === 2) sb2 = p;
  ok(!!sb2, 'the second window has its own sidebar');
  await sb2.click('.tab:not(.on)'); await sleep(900);
  ok(await w2.evaluate(() => S.tabs[R.a].url.endsWith('/p3.html')) && await w1.evaluate(() => S.tabs[R.a].url.endsWith('/p2.html')), 'clicking a tab there switches that window only');
  await w2.evaluate(() => openCmd('new')); await sleep(600);
  const ovs = b.pages().filter(p => p.url().endsWith('/overlay.html')); let open = 0; for (const p of ovs) if (await p.evaluate(() => document.getElementById('cmd').classList.contains('on'))) open++;
  ok(open === 1, 'its command bar opens in that window only');
  for (const p of ovs) await p.evaluate(() => document.getElementById('cmd').classList.contains('on') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await sleep(500);
  shot('windows-two');
  // 3. shared things update live in the other window
  await w2.evaluate(() => { S.spaces.find(x => x.id === 'work').name = 'Job'; render(); save(); }); await sleep(1600);
  ok(await w1.evaluate(() => S.spaces.find(x => x.id === 'work').name) === 'Job', 'renaming a space in one window renames it in the other');
  await w1.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'dark' } })); await sleep(1600);
  ok(await w2.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode set in one window applies to the other');
  ok(await w1.evaluate(() => S.history.some(h => h.url.endsWith('/p3.html'))), 'history from one window shows up in the other');
  await w2.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'light' } })); await sleep(1200);
  // 4. a new space made in one window appears in the other (empty there)
  await w1.evaluate(() => { const s = { id: 'sNew', name: 'Side', h: 150, tabs: [], folders: [] }; S.spaces.push(s); render(); save(); }); await sleep(1600);
  ok(await w2.evaluate(() => S.spaces.some(x => x.id === 'sNew' && x.name === 'Side')), 'a new space shows up in every window');
  // 5. quit (real ⌘Q) and start again: both windows come back as they were
  await w1.evaluate(() => doSave()); await w2.evaluate(() => doSave()); await sleep(800);
  K('down:Control_L tap:q up:Control_L'); await sleep(2500);
  try { await b.stop(); } catch {}
  b = await start({ profile, fresh: false, port: 9223 }); await sleep(3500);
  let r = await byWid();
  ok(Object.keys(r).sort().join() === ['w1', w2id].sort().join(), 'after quitting, both windows come back: ' + Object.keys(r).join());
  ok(await r.w1.evaluate(() => sp().folders.map(f => f.name).join() + '|' + spaceTabs(sp()).length) === 'One|2' && await r[w2id].evaluate(() => sp().folders.map(f => f.name).join() + '|' + spaceTabs(sp()).length) === 'Two|2', 'each with its own folders and tabs');
  // 6. closing a window on purpose (real ⌘⇧W) forgets it
  await r[w2id].bringToFront(); await r[w2id].evaluate(() => 0);
  const w2wc = r[w2id];
  await w2wc.click('#url').catch(() => {}); await sleep(300); await w2wc.keyboard.press('Escape').catch(() => {});
  K('down:Control_L down:Shift_L tap:w up:Shift_L up:Control_L'); await sleep(1500);
  const left = Object.keys(await byWid());
  ok(left.length === 1, 'closing a window with ⌘⇧W closes just that window: ' + left);
  const gone = `win-${left[0] === 'w1' ? w2id : 'w1'}.json`; let wl = [];
  for (let i = 0; i < 30; i++) { try { wl = JSON.parse(fs.readFileSync(path.join(profile, 'windows.json'), 'utf8')).order; } catch {} if (wl.length === 1 && !fs.existsSync(path.join(profile, gone))) break; await sleep(200); }   // saving is batched
  ok(wl.length === 1 && !fs.existsSync(path.join(profile, gone)), 'and it isn\'t restored next time');
  // 7. closing the last window keeps it
  K('down:Control_L down:Shift_L tap:w up:Shift_L up:Control_L'); await sleep(2500);
  try { await b.stop(); } catch {}
  b = await start({ profile, fresh: false, port: 9224 }); await sleep(3000);
  r = await byWid();
  ok(Object.keys(r).length === 1 && await Object.values(r)[0].evaluate(() => spaceTabs(sp()).length) > 0, 'closing the last window keeps it and its tabs for next time');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
