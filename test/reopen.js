'use strict';
/* ⇧⌘T (real keys) brings back whatever you closed last: a tab; a folder you deleted with its tabs (name, icon, colour
   and all, in one go, not tab by tab); a whole window you closed with ⌘⇧W (its tabs and folders). In that order of
   closing, newest first. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, shot } = require('./lib');
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const REOPEN = 'down:Control_L down:Shift_L tap:t up:Shift_L up:Control_L';

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  const shells = () => b.pages().filter(p => p.url().endsWith('/index.html'));
  await ui.evaluate(() => { openTab('http://localhost:8765/p1.html'); openTab('http://localhost:8765/p2.html'); }); await sleep(1500);
  const urls = p => p.evaluate(() => spaceTabs(sp()).map(id => S.tabs[id].url.replace('http://localhost:8765', '')));
  const focusPage = async () => { const L = await ui.evaluate(() => layout().stage); ptr(`move ${X0 + L.x + 300} ${Y0 + 400}`); ptr('down'); ptr('up'); await sleep(250); };
  // a tab
  await ui.evaluate(() => closeTab(spaceTabs(sp()).find(id => S.tabs[id].url.endsWith('/p2.html')))); await sleep(900);
  ok(!(await urls(ui)).includes('/p2.html'), '(closed a tab)');
  await focusPage(); K(REOPEN); await sleep(1500);
  ok((await urls(ui)).includes('/p2.html'), '⇧⌘T brings the tab back');
  // a folder with its tabs
  await ui.evaluate(() => {
    const s = sp(), ids = ['/p3.html', '/links.html', '/p1.html?x=1'].map(u => { const id = uid('t'); S.tabs[id] = { url: 'http://localhost:8765' + u, title: u, seen: Date.now() }; return id; });
    s.folders.push({ id: 'fW', name: 'Work stuff', icon: 'p:heart', iconPicked: true, color: '#3d63ff', open: true, tabs: ids }); s.tabs.push('f:fW'); render(); save();
  }); await sleep(800);
  await ui.evaluate(() => removeFolder('fW', true)); await sleep(1000);
  ok(await ui.evaluate(() => !sp().folders.some(f => f.name === 'Work stuff')), '(deleted a folder and its 3 tabs)');
  await focusPage(); K(REOPEN); await sleep(1500);
  const f = await ui.evaluate(() => { const f = sp().folders.find(x => x.name === 'Work stuff'); return f && { icon: f.icon, color: f.color, tabs: f.tabs.map(id => S.tabs[id] && S.tabs[id].url.replace('http://localhost:8765', '')) }; });
  ok(f && f.icon === 'p:heart' && f.color === '#3d63ff' && JSON.stringify(f.tabs) === JSON.stringify(['/p3.html', '/links.html', '/p1.html?x=1']), '⇧⌘T brings the whole folder back in one go: name, icon, colour and its 3 tabs');
  ok(await ov.evaluate(() => /Brought back “Work stuff” \(3 tabs\)/.test(document.getElementById('toast').textContent)), 'and says so');
  ok(await ui.evaluate(() => !S.closed.some(c => /links\.html/.test(c.url || ''))), 'its tabs aren\'t left over to reopen one by one');
  // a window
  K('down:Control_L tap:n up:Control_L'); await sleep(3000);
  ok(shells().length === 2, '(opened a second window)');
  const w2 = shells().find(p => p !== ui);
  await w2.evaluate(() => { openTab('http://localhost:8765/p3.html?w=2'); const s = sp(); s.folders.push({ id: 'fX', name: 'Second', open: true, tabs: [] }); s.tabs.push('f:fX'); render(); save(); }); await sleep(2000);
  K('down:Control_L down:Shift_L tap:w up:Shift_L up:Control_L'); await sleep(2000);
  ok(shells().length === 1, '(closed it with ⌘⇧W)');
  await focusPage(); K(REOPEN); await sleep(3500);
  ok(shells().length === 2, '⇧⌘T brings the window back');
  const back = shells().find(p => p !== ui);
  ok(back && (await urls(back)).includes('/p3.html?w=2') && await back.evaluate(() => sp().folders.some(f => f.name === 'Second')), 'with its tabs and folders');
  shot('reopen-window');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
