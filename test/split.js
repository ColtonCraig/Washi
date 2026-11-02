'use strict';
/* Split pairs and folders, driven with a real mouse (XTest) the way you'd use them. */
const { start, sleep, ok: ok0, shot: shot0, done, skipSetup } = require('./lib');
const { execSync } = require('child_process');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const shot = n => shot0(n);
const ok = ok0;
const color = (x, y) => { shot0('px'); const [r, g, b] = JSON.parse(execSync(`python3 -c "from PIL import Image;im=Image.open('/tmp/px.png').convert('RGB');print(list(im.getpixel((${Math.round(x)},${Math.round(y)}))))"`)); return g > r + 8 && g > b + 8 ? 'green' : b > r + 8 && b >= g ? 'blue' : r > g + 8 && r >= b ? 'pink' : `other(${r},${g},${b})`; };
(async () => {
  const bb = await start(); const { ui, sb, ov, pages } = bb; const find = s => pages().find(p => p.url().includes(s));
  await skipSetup(bb);
  const st = () => ui.evaluate(() => ({ split: R.split, a: R.a, b: R.b, focus: R.focus, pairs: S.pairs, root: sp().tabs, folders: sp().folders.map(f => ({ id: f.id, tabs: f.tabs, open: f.open })) }));
  const rectOf = sel => sb.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const scr = (r, fx = .5, fy = .5) => [60 + r.x + r.w * fx, 57 + 44 + r.y + r.h * fy];
  const dragSb = async (sel, tx, ty, hold = .3) => { const [x, y] = scr(await rectOf(sel)); ptr(`drag ${x} ${y} ${tx} ${ty} ${hold}`); ptr('up'); await sleep(900); };
  // three tabs: p1 green, p2 blue, p3 pink
  await ui.evaluate(() => { openTab('http://localhost:8765/p3.html', { bg: true }); openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); });
  await sleep(2000);
  const ids = await ui.evaluate(() => Object.fromEntries(Object.entries(S.tabs).map(([k, v]) => [v.url.match(/p(\d)\.html/)?.[1] || 'x', k])));
  const L = await ui.evaluate(() => layout());
  const left = [60 + L.a.x + L.a.w / 2, 57 + L.a.y + 300], right = [60 + L.stage.x + L.stage.w * .75, 57 + L.a.y + 300];
  for (let i = 0; i < 24 && color(...left) !== 'green'; i++) await sleep(250);    // slow machines take a moment to paint
  ok(await color(...left) === 'green', 'p1 shows full-window (green)');
  // ---------- SPLIT PAIR ----------
  await dragSb(`.tab[data-id="${ids[2]}"]`, 60 + L.stage.x + L.stage.w * .85, 57 + 450);
  let s = await st();
  ok(s.split && s.a === ids[1] && s.b === ids[2] && s.pairs.length === 1, 'dragging p2 to the right zone made a pair next to p1: ' + JSON.stringify([s.a, s.b, s.pairs]));
  ok(await sb.$$eval('.tabs>.pair', e => e.length) === 1 && await sb.$$eval('.tabs>.pair>.tab', e => e.length) === 2, 'sidebar shows ONE combined card with both tabs');
  ok(await sb.$$eval('.tabs>.tab', e => e.length) === 1, 'the unrelated tab is left outside the card');
  const L2 = await ui.evaluate(() => layout()); const l2 = [60 + L2.a.x + L2.a.w / 2, 57 + 400], r2 = [60 + L2.b.x + L2.b.w / 2, 57 + 400];
  ok(await color(...l2) === 'green' && await color(...r2) === 'blue', 'left pane green, right pane blue (both have content)');
  shot('g1');
  // clicking either half must not blank anything
  for (const k of [1, 2, 1, 2]) {
    await sb.click(`.pair>.tab:nth-child(${k})`); await sleep(500); s = await st();
    ok(s.split && s.a && s.b && s.a !== s.b && s.focus === (k === 1 ? 'a' : 'b'), `clicked half ${k}: split kept, panes distinct, focus ${s.focus}`);
  }
  ok(await color(...l2) === 'green' && await color(...r2) === 'blue', 'after clicking halves, both panes still have their pages');
  // clicking a tab outside the pair leaves split, pair stays
  await sb.click(`.tabs>.tab[data-id="${ids[3]}"]`); await sleep(700); s = await st();
  ok(!s.split && s.a === ids[3] && s.pairs.length === 1, 'outside tab shown full-window, pair kept');
  ok(await color(...l2) === 'pink' && await color(...r2) === 'pink', 'full pink across both sample points');
  ok(await sb.$$eval('.tabs>.pair', e => e.length) === 1, 'pair card still in sidebar');
  await sb.click('.pair>.tab:nth-child(2)'); await sleep(700); s = await st();
  ok(s.split && s.b === ids[2], 'clicking the pair brings the split back');
  ok(await color(...l2) === 'green' && await color(...r2) === 'blue', 'split pages restored');
  // close one half with its own X
  await sb.hover('.pair>.tab:nth-child(1)'); await sb.click('.pair>.tab:nth-child(1) .x'); await sleep(1100); s = await st();
  ok(!s.split && s.a === ids[2] && !s.b && s.pairs.length === 0, 'closed left half: other tab is alone and full: ' + JSON.stringify([s.split, s.a, s.pairs]));
  ok(await color(...l2) === 'blue' && await color(...r2) === 'blue', 'remaining page fills the whole window');
  ok(await sb.$$eval('.pair', e => e.length) === 0, 'card gone from sidebar');
  // ---------- repeated split/close cycles ----------
  for (let i = 0; i < 3; i++) {
    await ui.evaluate(() => openTab('http://localhost:8765/p3.html', { bg: true })); await sleep(900);
    const src = await ui.evaluate(() => spaceTabs(sp()).find(x => x !== R.a && !pairOf(x)));
    const L3 = await ui.evaluate(() => layout());
    await dragSb(`.tabs>.tab[data-id="${src}"]`, 60 + L3.stage.x + L3.stage.w * .15, 57 + 450);
    s = await st(); ok(s.split && s.pairs.length === 1 && s.a === src, `cycle ${i}: split made`);
    await sb.hover('.pair>.tab:nth-child(2)'); await sb.click('.pair>.tab:nth-child(2) .x'); await sleep(1000); s = await st();
    ok(!s.split && s.a && !s.b && s.pairs.length === 0, `cycle ${i}: close one -> single`);
  }
  // ---------- FOLDERS ----------
  await ui.evaluate(() => { const s = sp(); s.folders.push({ id: 'fA', name: 'Reading', open: true, tabs: [] }); s.tabs.unshift('f:fA'); s.folders.push({ id: 'fB', name: 'Work', open: true, tabs: [] }); s.tabs.push('f:fB'); render(); save(); });
  await sleep(700);
  await ui.evaluate(() => { for (const u of ['p1', 'p2', 'p3', 'p1']) openTab('http://localhost:8765/' + u + '.html', { bg: true }); }); await sleep(1500);
  let root = await sb.$$eval('.tabs>.tab', e => e.map(x => x.dataset.id));
  console.log('root tabs', root.length);
  // drag a tab into folder A (body/header)
  const hdrA = await rectOf('.fold[data-fid="fA"] .fh'); const [hx, hy] = scr(hdrA, .5, .6);
  await dragSb(`.tabs>.tab[data-id="${root[0]}"]`, hx, hy); s = await st();
  ok(s.folders.find(f => f.id === 'fA').tabs.includes(root[0]), 'dragging a tab onto a folder header puts it inside: ' + JSON.stringify(s.folders));
  // drag another into the open folder body (below the first one)
  const inA = await rectOf('.fold[data-fid="fA"] .fl'); const [bx, by] = scr(inA, .5, .85);
  await dragSb(`.tabs>.tab[data-id="${root[1]}"]`, bx, by); s = await st();
  ok(s.folders.find(f => f.id === 'fA').tabs.length === 2, 'second tab dropped into the open folder body: ' + JSON.stringify(s.folders.find(f => f.id === 'fA').tabs));
  // drag the first tab out of the folder to root
  const lastRoot = await sb.$$eval('.tabs>.tab', e => e.map(x => x.dataset.id)); const lr = await rectOf(`.tabs>.tab[data-id="${lastRoot[lastRoot.length - 1]}"]`); const [ox, oy] = scr(lr, .5, .9);
  const fa = s.folders.find(f => f.id === 'fA').tabs[0];
  await dragSb(`.fold[data-fid="fA"] .tab[data-id="${fa}"]`, ox, oy); s = await st();
  ok(!s.folders.find(f => f.id === 'fA').tabs.includes(fa) && s.root.includes(fa), 'dragging a tab out of the folder returns it to the list');
  // reorder folders: drag folder B header above folder A
  const ha = await rectOf('.fold[data-fid="fA"] .fh'); const [ax, ay] = scr(ha, .5, .1);
  await dragSb('.fold[data-fid="fB"] .fh', ax, ay - 6); s = await st();
  ok(s.root.indexOf('f:fB') < s.root.indexOf('f:fA'), 'folder dragged above another folder: ' + JSON.stringify(s.root.filter(k => k.startsWith('f:'))));
  // collapse folder A with the active tab inside: only that tab shows
  const inFolder = s.folders.find(f => f.id === 'fA').tabs;
  await sb.click(`.fold[data-fid="fA"] .tab[data-id="${inFolder[0]}"]`); await sleep(500);
  await sb.click('.fold[data-fid="fA"] .fh'); await sleep(700);
  const h1 = await sb.$$eval('.fold[data-fid="fA"] .fl>.tab', e => e.map(x => [x.dataset.id, Math.round(x.getBoundingClientRect().height)]));
  ok(h1.filter(x => x[1] > 20).length === 1 && h1.find(x => x[0] === inFolder[0])[1] > 20, 'collapsed folder keeps only the active tab visible: ' + JSON.stringify(h1));
  // go to another tab: the peeked one disappears
  await sb.click(`.tabs>.tab[data-id="${lastRoot[0] === fa ? lastRoot[1] : lastRoot[0]}"]`); await sleep(800);
  const h2 = await sb.$$eval('.fold[data-fid="fA"] .fl>.tab', e => e.map(x => x.offsetHeight));
  ok(h2.every(x => x === 0), 'leaving the tab hides it again: ' + JSON.stringify(h2));
  shot('g3');
  // select a hidden tab from the command bar path (selectTab) -> folder peeks it
  await ui.evaluate(id => selectTab(id), inFolder[1] || inFolder[0]); await sleep(800);
  const h3 = await sb.$$eval('.fold[data-fid="fA"] .fl>.tab', e => e.filter(x => x.getBoundingClientRect().height > 20).length);
  ok(h3 === 1, 'selecting a tab inside a collapsed folder reveals just that tab');
  // pair a folder tab with a root tab (cross-container) and check the card sits once
  const ft = (await st()).folders.find(f => f.id === 'fA').tabs[0], rt = (await st()).root.find(k => !k.startsWith('f:') && k !== ft);
  await ui.evaluate(([a, b]) => { makePair(a, b); showTab(b); placePanes(); commit(true); }, [ft, rt]); await sleep(900);
  ok(await sb.$$eval('.pair', e => e.length) === 1 && await sb.$$eval(`.tab[data-id="${ft}"]`, e => e.length) === 1 && await sb.$$eval(`.tab[data-id="${rt}"]`, e => e.length) === 1, 'cross-folder pair appears as one card, members not duplicated');
  // ---------- SIDEBAR HOVER ----------
  await ui.click('#bSide'); await sleep(900);
  ok(await sb.evaluate(() => document.body.classList.contains('float')), 'sidebar floating');
  const isOpen = () => sb.evaluate(() => document.body.classList.contains('open'));
  const until = async (want, max = 1500) => { const t = Date.now(); while (Date.now() - t < max) { if (await isOpen() === want) return Date.now() - t; await sleep(10); } return -1; };
  for (let round = 0; round < 3; round++) {
    ptr('move 700 500'); await sleep(400);
    await sb.evaluate(() => { window.__f = []; const go = t => { __f.push(t); if (__f.length < 40) requestAnimationFrame(go); }; requestAnimationFrame(go); });
    ptr('move 66 500'); const tOpen = await until(true);
    ok(tOpen >= 0 && tOpen < 150, `round ${round + 1}: sidebar pops out right away (${tOpen}ms incl. test overhead)`);
    await sleep(320); if (round === 0) shot('g4');
    const gap = await sb.evaluate(() => Math.max(...__f.slice(1).map((t, i) => t - __f[i])));
    ok(gap < 40, `round ${round + 1}: slide-in has no dropped frames (longest frame ${gap.toFixed(0)}ms)`);
    ptr('move 200 400'); await sleep(400);
    ok(await isOpen(), `round ${round + 1}: stays open while the pointer is on the sheet`);
    ptr('move 900 500'); const tClose = await until(false);
    ok(tClose >= 0 && tClose < 450, `round ${round + 1}: slides away soon after the pointer leaves (${tClose}ms)`);
  }
  ptr('move 400 500'); await sleep(500);
  ok(!(await isOpen()), 'moving around the page does not open it');
  await ui.click('#bSide'); await sleep(900);
  ok(await sb.evaluate(() => document.body.classList.contains('docked')), 'docked again');
  await sleep(600);
  shot('g2');
  await bb.stop(); done();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
