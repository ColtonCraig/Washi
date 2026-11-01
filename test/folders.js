'use strict';
/* Folders inside folders, driven with a real mouse: drag a folder into a folder, tabs into the inner one, collapse
   behaviour, the 3-level limit, no folder inside itself, ungroup/move out/delete, and it all survives a restart. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-folders-'));
(async () => {
  const b = await start({ profile }); const { ui, sb } = b; await skipSetup(b);
  const st = () => ui.evaluate(() => ({ root: sp().tabs, F: Object.fromEntries(sp().folders.map(f => [f.id, f.tabs])), open: Object.fromEntries(sp().folders.map(f => [f.id, f.open])), a: R.a }));
  const rectOf = sel => sb.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const scr = (r, fx = .5, fy = .5) => [60 + r.x + r.w * fx, 57 + 52 + r.y + r.h * fy];
  const drag = async (sel, to, hold = .35) => { const [x, y] = scr(await rectOf(sel)); ptr(`drag ${x} ${y} ${to[0]} ${to[1]} ${hold}`); ptr('up'); await sleep(900); };
  for (const p of ['p1', 'p2', 'p3', 'trackers', 'links']) await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html', { bg: true }), p);
  await ui.evaluate(() => { const s = sp(); for (const [id, n] of [['fA', 'Projects'], ['fB', 'Clients'], ['fC', 'Archive']]) { s.folders.push({ id, name: n, open: true, tabs: [] }); s.tabs.push('f:' + id); } render(); save(); });
  await sleep(900);
  const T = (await st()).root.filter(k => !k.startsWith('f:'));

  // 1. drag folder B onto folder A's header: B goes inside A
  await drag('.fold[data-fid="fB"]>.fh', scr(await rectOf('.fold[data-fid="fA"]>.fh'), .5, .7));
  let s = await st();
  ok(s.F.fA.includes('f:fB') && !s.root.includes('f:fB'), 'a folder dragged onto another folder goes inside it: ' + JSON.stringify(s.F.fA));
  ok(await sb.$$eval('.fold[data-fid="fA"]>.fb>.fl>.fold[data-fid="fB"]', e => e.length) === 1, 'the sidebar draws it nested');

  // 2. drag a tab into the inner folder
  await drag(`.tabs>.tab[data-id="${T[0]}"]`, scr(await rectOf('.fold[data-fid="fB"]>.fh'), .5, .75));
  s = await st();
  ok(s.F.fB.includes(T[0]), 'a tab dropped on the inner folder goes into the inner folder');
  // and one into the outer folder's body, below the inner folder
  const inner = await rectOf('.fold[data-fid="fB"]'); await drag(`.tabs>.tab[data-id="${T[1]}"]`, [scr(inner)[0], 57 + 52 + inner.y + inner.h - 3]);
  s = await st();
  ok(s.F.fA.includes(T[1]) && !s.F.fB.includes(T[1]), 'a tab dropped on the inner folder\'s bottom edge lands after it, in the outer folder: ' + JSON.stringify(s.F));
  const outer = await rectOf('.fold[data-fid="fA"]'); await drag(`.tabs>.tab[data-id="${T[3]}"]`, [scr(outer)[0], 57 + 52 + outer.y + outer.h - 2]);
  s = await st(); ok(s.root.indexOf(T[3]) === s.root.indexOf('f:fA') + 1, 'and on the outer folder\'s bottom edge it lands after the outer folder');

  // 3. folder C into B (3 levels: A > B > C) works; nothing deeper is allowed
  await drag('.fold[data-fid="fC"]>.fh', scr(await rectOf('.fold[data-fid="fB"]>.fh'), .5, .75));
  s = await st();
  ok(s.F.fB.includes('f:fC'), 'third level: A › B › C');
  await ui.evaluate(() => { const s = sp(); s.folders.push({ id: 'fD', name: 'Deep', open: true, tabs: [] }); s.tabs.push('f:fD'); render(); });
  await sleep(700);
  await drag('.fold[data-fid="fD"]>.fh', scr(await rectOf('.fold[data-fid="fC"]>.fh'), .5, .75));
  s = await st();
  ok(!s.F.fC.includes('f:fD') && ((s.F.fB.includes('f:fD')) || s.root.includes('f:fD') || s.F.fA.includes('f:fD')), 'a 4th level is refused: the folder lands one level up instead: ' + JSON.stringify(s.F));
  // a folder can't go inside itself
  await drag('.fold[data-fid="fA"]>.fh', scr(await rectOf('.fold[data-fid="fC"]>.fh'), .5, .75));
  s = await st();
  ok(s.root.includes('f:fA') && !Object.values(s.F).some(l => l.includes('f:fA')), 'dragging a folder into its own child does nothing harmful');

  // 4. counts include everything inside
  const ctA = await sb.$eval('.fold[data-fid="fA"]>.fh .ct', e => e.textContent);
  ok(+ctA === (await ui.evaluate(() => flat(sp(), ['f:fA']).length)), `outer folder's count includes nested tabs (${ctA})`);

  // 5. collapse the outer folder while a tab in the inner one is open: only that tab (and its folder) shows
  await sb.click(`.fold[data-fid="fB"] .tab[data-id="${T[0]}"]`); await sleep(500);
  await sb.click('.fold[data-fid="fA"]>.fh'); await sleep(700);
  // what you can actually see: the element at each item's centre is that item (not clipped away by a collapsed parent)
  const vis = await sb.$$eval('.fold[data-fid="fA"] .tab, .fold[data-fid="fA"] .fold>.fh', e => e.filter(x => { const r = x.getBoundingClientRect(); if (r.height < 8) return false; const at = document.elementFromPoint(r.x + 30, r.y + r.height / 2); return at && (at === x || x.contains(at)); }).map(x => x.dataset.id || 'f:' + x.parentElement.dataset.fid));
  ok(vis.includes(T[0]) && vis.includes('f:fB') && !vis.includes(T[1]), 'collapsed outer folder shows just the path to the open tab (its siblings hide): ' + JSON.stringify(vis));
  shot('folders-collapsed');
  // switch to a root tab: the outer folder closes up completely
  await sb.click(`.tabs>.tab[data-id="${T[2]}"]`); await sleep(700);
  const vis2 = await sb.$$eval('.fold[data-fid="fA"]>.fb>.fl>*', e => e.filter(x => x.getBoundingClientRect().height > 12).length);
  ok(vis2 === 0, 'switching away hides everything inside the collapsed folder');
  await sb.click('.fold[data-fid="fA"]>.fh'); await sleep(700);
  shot('folders-open');
  const a = await sb.evaluate(AUDIT); ok(!a.length, 'nested folders: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));

  // 6. right-click menu actions: move B out of A, then ungroup B (its contents take its place)
  await ui.evaluate(() => { R.menuFolder = 'fB'; }); await ui.evaluate(() => B.intent ? 0 : 0);
  await ui.evaluate(() => folderOut('fB')); await sleep(400); s = await st();
  ok(s.root.indexOf('f:fB') === s.root.indexOf('f:fA') + 1 && !s.F.fA.includes('f:fB'), 'Move Out of Folder puts it right below its old parent');
  const inB = s.F.fB.slice();
  await ui.evaluate(() => removeFolder('fB', false)); await sleep(400); s = await st();
  ok(inB.every(k => s.root.includes(k)) && !s.root.includes('f:fB'), 'Ungroup keeps everything (tabs and the folder inside) in its place');

  // 7. delete a folder with a nested folder: everything inside closes
  await ui.evaluate(() => { const s = sp(); s.tabs = s.tabs.filter(k => k !== 'f:fC'); s.folders.find(f => f.id === 'fA').tabs.unshift('f:fC'); render(); });
  const inside = await ui.evaluate(() => flat(sp(), ['f:fA']));
  await ui.evaluate(() => removeFolder('fA', true)); await sleep(800); s = await st();
  ok(!s.root.includes('f:fA') && !('fA' in s.F) && !('fC' in s.F) && await ui.evaluate(ids => ids.every(id => !S.tabs[id]), inside), 'Delete Folder closes everything inside, including nested folders');

  // 8. survives a restart, and a broken saved arrangement repairs itself
  await ui.evaluate(() => { const s = sp(); s.folders.push({ id: 'fX', name: 'X', open: true, tabs: ['f:fY'] }, { id: 'fY', name: 'Y', open: true, tabs: ['f:fX'] }); s.tabs.push('f:fX'); doSave(); });
  await sleep(500); await b.stop();
  const b2 = await start({ profile, fresh: false, port: 9223 }); await sleep(2500);
  const s2 = await b2.ui.evaluate(() => ({ root: sp().tabs, F: Object.fromEntries(sp().folders.map(f => [f.id, f.tabs])) }));
  ok(s2.root.includes('f:fX') && s2.F.fX.includes('f:fY') && !s2.F.fY.includes('f:fX'), 'a looped arrangement (X in Y in X) is repaired on load: ' + JSON.stringify(s2.F));
  ok('fD' in s2.F, 'folders survive a restart');
  await b2.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
