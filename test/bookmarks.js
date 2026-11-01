'use strict';
/* Bookmarks: ☆ and ⇧⌘D, the edit popover, folders with emoji and colors, the bar in its three modes (always, on hover
   with the real pointer, hidden), reordering with the real mouse, the bookmarks sheet, the command bar, importing from
   Chromium browsers and HTML exports (no duplicates), sharing between windows, and surviving a restart. */
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-bmroot-'));
const chromeBm = { roots: {
  bookmark_bar: { children: [
    { type: 'url', name: 'Chrome One', url: 'http://localhost:8765/p1.html?c1' },
    { type: 'folder', name: 'Dev', children: [{ type: 'url', name: 'Chrome Dev', url: 'http://localhost:8765/p2.html?c2' }, { type: 'folder', name: 'Deeper', children: [{ type: 'url', name: 'Deep', url: 'http://localhost:8765/p3.html?c3' }] }] },
    { type: 'url', name: 'Script', url: 'javascript:alert(1)' }] },
  other: { children: [{ type: 'url', name: 'Other One', url: 'http://localhost:8765/links.html?o1' }] },
  synced: { children: [] } } };
const mk = (dir, data) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'Bookmarks'), JSON.stringify(data)); };
mk(path.join(root, 'Google/Chrome/Default'), chromeBm);
mk(path.join(root, 'Google/Chrome/Profile 1'), { roots: { bookmark_bar: { children: [{ type: 'url', name: 'Work thing', url: 'http://localhost:8765/p1.html?w' }] }, other: { children: [] } } });
fs.writeFileSync(path.join(root, 'Google/Chrome/Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Colton' }, 'Profile 1': { name: 'Work' } } } }));
mk(path.join(root, 'BraveSoftware/Brave-Browser/Default'), { roots: { bookmark_bar: { children: [{ type: 'url', name: 'Brave One', url: 'http://localhost:8765/p2.html?b1' }] }, other: { children: [] } } });
mk(path.join(root, 'Dia/User Data/Default'), { roots: { bookmark_bar: { children: [] }, other: { children: [] } } });   // empty: not listed
process.env.WASHI_BM_ROOT = root;
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const X0 = 60, Y0 = 57;                                       // where the window's content sits on the test screen
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-bm-'));
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : '')); };

(async () => {
  // the HTML parser (Safari, Firefox exports) on its own
  const imp = require('../app/bmimport');
  const ff = imp.fromHTML(`<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Bookmarks Menu</H3><DL><p><DT><A HREF="https://m.example/">Menu &amp; more</A><DT><A HREF="javascript:void(0)">bad</A></DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3><DL><p><DT><A HREF="https://t.example/">Toolbar</A><DT><H3>Sub</H3><DL><p><DT><A HREF="https://s.example/">S</A></DL><p></DL><p></DL>`);
  ok(ff.bar.map(x => x.title || x.name).join() === 'Toolbar,Sub' && ff.other[0].name === 'Bookmarks Menu' && ff.other[0].kids[0].title === 'Menu & more' && ff.count === 3, 'a Firefox HTML export: toolbar → bar, menu → folder, scripts dropped, entities decoded');
  const sf = imp.fromHTML('<DL><p><DT><H3>Favorites</H3><DL><p><DT><A HREF="https://f.example/">F</A></DL><p><DT><H3>Reading</H3><DL><p><DT><A HREF="https://r.example/">R</A></DL></DL>');
  ok(sf.bar.length === 1 && sf.other[0].name === 'Reading', 'a Safari export: Favorites → bar');
  let threw = false; try { imp.fromHTML('<html><body>hello</body></html>'); } catch { threw = true; }
  ok(threw, 'a file that isn\'t bookmarks is refused');

  let b = await start({ profile }); let { ui, ov } = b; await skipSetup(b);
  ok(await ui.evaluate(() => S.prefs.bookmarkBar) === 'hover', 'the bar shows on hover by default');
  for (const p of ['p1', 'p2', 'p3']) { await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), p); await sleep(700); }

  // 1. ☆ with the real mouse: bookmarks the page and opens the editor
  const sr = await ui.evaluate(() => { const r = document.getElementById('bStar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok(await ui.evaluate(() => !document.getElementById('bStar').disabled && !document.getElementById('bStar').classList.contains('on')), '☆ is there, empty, for a page that isn\'t bookmarked');
  ptr(`move ${X0 + sr.x} ${Y0 + sr.y}`); await sleep(150); ptr('down'); ptr('up'); await sleep(900);
  let st = await ui.evaluate(() => ({ n: S.bookmarks.length, url: S.bookmarks[0] && S.bookmarks[0].url, on: document.getElementById('bStar').classList.contains('on') }));
  ok(st.n === 1 && st.url.endsWith('/p3.html') && st.on, 'clicking ☆ bookmarks the page and fills the star');
  ok(await ov.evaluate(() => !!document.querySelector('.panel.on.bmedit .bmf')), 'the edit popover opens');
  await audit(ov, 'bookmark popover');
  shot('bm-popover');
  await ov.evaluate(() => { const f = document.querySelector('.bmf'); f.name.value = 'Page three'; f.requestSubmit(); }); await sleep(500);
  ok(await ui.evaluate(() => S.bookmarks[0].title) === 'Page three', 'renaming it in the popover saves');
  ok(await ov.evaluate(() => !document.querySelector('.panel.on')), 'Done closes the popover');
  // ⇧⌘D (real keys) on a bookmarked page edits it rather than adding twice
  K('down:Control_L down:Shift_L tap:d up:Shift_L up:Control_L'); await sleep(900);
  ok(await ui.evaluate(() => S.bookmarks.length) === 1 && await ov.evaluate(() => !!document.querySelector('.panel.on.bmedit')), '⇧⌘D on a bookmarked page opens its editor (no duplicate)');
  await ov.evaluate(() => document.querySelector('.bmf [data-x="cancel"]').click()); await sleep(400);
  // a bad address is refused
  await ui.evaluate(() => bmEdit(S.bookmarks[0])); await sleep(600);
  await ov.evaluate(() => { const f = document.querySelector('.bmf'); f.url.value = 'not an address'; f.requestSubmit(); }); await sleep(300);
  ok(await ov.evaluate(() => document.querySelector('.bmf input[name=url]').classList.contains('bad')) && (await ui.evaluate(() => S.bookmarks[0].url)).endsWith('/p3.html'), 'an address that isn\'t one is refused and nothing changes');
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await ui.evaluate(() => B.overlayCancel()); await sleep(400);

  // 2. folders: emoji and colour
  await ui.evaluate(() => { selectTab(spaceTabs(sp()).find(id => S.tabs[id].url.endsWith('/p1.html'))); }); await sleep(500);
  await ui.evaluate(() => bmStar()); await sleep(600); await ov.evaluate(() => document.querySelector('.bmf').requestSubmit()); await sleep(400);
  await ui.evaluate(() => bmNewFolder(null)); await sleep(700);
  ok(await ov.evaluate(() => document.querySelector('.panel.on.bmedit .ph b').textContent) === 'New folder', 'New Folder opens the editor straight away');
  await ov.evaluate(() => { const f = document.querySelector('.bmf'); f.name.value = 'Work'; f.querySelector('.emo-b[data-e="💼"]').click(); f.querySelector('.col-b[data-c="#3d63ff"]').click(); });
  await audit(ov, 'folder editor');
  shot('bm-folder-editor');
  await ov.evaluate(() => document.querySelector('.bmf').requestSubmit()); await sleep(500);
  let F = await ui.evaluate(() => S.bookmarks.find(n => n.type === 'folder'));
  ok(F && F.name === 'Work' && F.icon === '💼' && F.color === '#3d63ff', 'the folder keeps its name, emoji and colour');
  // own emoji typed in
  await ui.evaluate(() => bmEdit(S.bookmarks.find(n => n.type === 'folder'))); await sleep(600);
  await ov.evaluate(() => { const i = document.querySelector('.emo-in'); i.value = '🦊x'; i.dispatchEvent(new Event('input')); document.querySelector('.bmf').requestSubmit(); }); await sleep(400);
  ok(await ui.evaluate(() => S.bookmarks.find(n => n.type === 'folder').icon) === '🦊', 'you can type any emoji (one is kept)');
  // a fresh folder you cancel goes away
  await ui.evaluate(() => bmNewFolder(null)); await sleep(600); await ov.evaluate(() => document.querySelector('.bmf [data-x="cancel"]').click()); await sleep(400);
  ok(await ui.evaluate(() => S.bookmarks.filter(n => n.type === 'folder').length) === 1, 'cancelling a new folder doesn\'t leave an empty one behind');

  // 3. always shown: a slim bar above the pages
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'always' } })); await sleep(900);
  let L = await ui.evaluate(() => ({ y: layout().stage.y, bar: !!document.querySelector('#bmbar .bm'), shown: getComputedStyle(document.getElementById('bmbar')).display }));
  ok(L.y === 44 + 32 && L.bar && L.shown === 'flex', 'Always: the pages move down 32px and the bar is drawn above them');
  const ph = await b.pages().find(p => p.url().endsWith('/p1.html')).evaluate(() => innerHeight);
  ok(Math.abs(ph - await ui.evaluate(() => layout().a.h)) <= 1, `the page itself is resized to fit under the bar (${ph}px)`);
  ok(await ui.evaluate(() => { const c = document.querySelector('#bmbar .bm.fold'); return c.querySelector('.emo').textContent === '🦊' && getComputedStyle(c).getPropertyValue('--fc').trim() === '#3d63ff'; }), 'the folder chip shows its emoji and colour');
  await audit(ui, 'window with the bookmarks bar');
  shot('bm-bar-always');
  // lots of bookmarks: the ones that don't fit go behind »
  await ui.evaluate(() => { for (let i = 0; i < 30; i++) S.bookmarks.push({ id: 'many' + i, type: 'bm', url: 'http://localhost:8765/p2.html?n=' + i, title: 'A long bookmark name ' + i }); bmChanged(); }); await sleep(500);
  st = await ui.evaluate(() => { const bar = document.getElementById('bmbar'), more = bar.querySelector('.more'), r = bar.getBoundingClientRect(), vis = [...bar.querySelectorAll('.bm:not([hidden])')]; return { more: !more.hidden, inside: vis.every(c => c.getBoundingClientRect().right <= r.right + .5), hidden: bar._hidden.length }; });
  ok(st.more && st.inside && st.hidden > 10, `too many for the bar: » appears, ${st.hidden} wait behind it, nothing spills over`);
  await audit(ui, 'a full bookmarks bar');
  ok(await ui.evaluate(() => { const m = bmFolderMenu({ kids: S.bookmarks.filter(n => n.id.startsWith('many')).slice(0, 3) }); return m.length === 5 && m[4].id === 'bm:all:undefined'; }), 'folder menus list what\'s inside, with Open All');
  await ui.evaluate(() => { S.bookmarks = S.bookmarks.filter(n => !n.id.startsWith('many')); bmChanged(); }); await sleep(400);
  // a click on a bookmark switches to its tab if it's open, otherwise opens one
  await ui.evaluate(() => selectTab(spaceTabs(sp()).find(id => S.tabs[id].url.endsWith('/p2.html')))); await sleep(500);
  let c = await ui.evaluate(() => { const r = document.querySelector('#bmbar .bm:not(.fold)').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const nTabs = await ui.evaluate(() => spaceTabs(sp()).length);
  ptr(`move ${X0 + c.x} ${Y0 + c.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(800);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.endsWith('/p3.html') && spaceTabs(sp()).length) === nTabs, 'clicking a bookmark whose page is open switches to that tab');
  await ui.evaluate(() => { const t = spaceTabs(sp()).find(id => S.tabs[id].url.endsWith('/p3.html')); closeTab(t, { noFx: true }); }); await sleep(600);
  ptr(`move ${X0 + c.x} ${Y0 + c.y}`); ptr('down'); ptr('up'); await sleep(900);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.endsWith('/p3.html')), 'and opens it in a new tab when it isn\'t');
  // drag a chip along the bar with the real mouse
  const order0 = await ui.evaluate(() => S.bookmarks.map(n => n.title || n.name));
  const ch = await ui.evaluate(() => [...document.querySelectorAll('#bmbar .bm:not(.more)')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; }));
  execSync(`python3 ${__dirname}/ptr.py drag ${X0 + ch[0].x + 10} ${Y0 + ch[0].y} ${X0 + ch[2].x + ch[2].w - 4} ${Y0 + ch[2].y} .2`); ptr('up'); await sleep(600);
  const order1 = await ui.evaluate(() => S.bookmarks.map(n => n.title || n.name));
  ok(JSON.stringify(order1) === JSON.stringify([order0[1], order0[2], order0[0]]), `dragging the first chip to the end reorders the bar (${order1})`);
  // drop a bookmark onto the middle of the folder: it goes inside
  const ch2 = await ui.evaluate(() => [...document.querySelectorAll('#bmbar .bm:not(.more)')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width, f: e.classList.contains('fold') }; }));
  const fi = ch2.findIndex(x => x.f), bi = ch2.findIndex(x => !x.f);
  execSync(`python3 ${__dirname}/ptr.py drag ${X0 + ch2[bi].x + 10} ${Y0 + ch2[bi].y} ${X0 + ch2[fi].x + ch2[fi].w / 2} ${Y0 + ch2[fi].y} .2`); ptr('up'); await sleep(600);
  F = await ui.evaluate(() => S.bookmarks.find(n => n.type === 'folder'));
  ok(F.kids.length === 1 && await ui.evaluate(() => S.bookmarks.length) === 2, 'dropping a bookmark on a folder puts it inside');
  ptr(`move ${X0 + 600} ${Y0 + 500}`);

  // 4. on hover: point at the top bar with the real pointer
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'hover' } })); await sleep(900);
  ok(await ui.evaluate(() => layout().stage.y) === 44, 'On hover: the pages go back up to the top bar');
  const urlr = await ui.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(120);
  ok(!(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on'))), 'passing over the top bar quickly doesn\'t pop it open');
  await sleep(600);
  ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on') && document.querySelectorAll('#bmin .bm:not(.more)').length === 2), 'resting on the top bar shows the bar over the page');
  await audit(ov, 'bookmarks bar on hover');
  shot('bm-bar-hover');
  // move down onto the strip: it stays; click the bookmark there
  const sc = await ov.evaluate(() => { const r = document.querySelector('#bmin .bm:not(.fold)').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const stage = await ui.evaluate(() => layout().stage);
  ptr(`move ${X0 + stage.x + sc.x} ${Y0 + 44 + sc.y}`); await sleep(700);
  ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')), 'moving onto the strip keeps it open');
  await ui.evaluate(() => selectTab(spaceTabs(sp()).find(id => S.tabs[id].url.endsWith('/p2.html')))); await sleep(400);
  ptr('down'); ptr('up'); await sleep(900);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.endsWith('/p3.html')), 'clicking a bookmark on the strip opens it');
  ok(!(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on'))), 'and the strip goes away');
  // leave: it hides
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(800);
  ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')), 'pointing at the top bar again brings it back');
  ptr(`move ${X0 + 700} ${Y0 + 500}`); await sleep(800);
  ok(!(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on'))), 'moving down into the page hides it');
  // a toast while it's up doesn't fight it
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(800);
  await ui.evaluate(() => B.fx({ type: 'toast', text: 'hello', short: true })); await sleep(400);
  ok(await ov.evaluate(() => !document.getElementById('bmstrip').classList.contains('on') && document.getElementById('toast').classList.contains('on')), 'a toast takes over the overlay cleanly');
  ptr(`move ${X0 + 700} ${Y0 + 500}`); await sleep(1800);

  // 5. hidden: nothing appears
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'hidden' } })); await sleep(500);
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(900);
  ok(!(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on'))) && await ui.evaluate(() => layout().stage.y) === 44, 'Hidden: no bar, even on hover');
  ptr(`move ${X0 + 700} ${Y0 + 500}`);
  // ⇧⌘B (real keys) flips to always and back
  K('down:Control_L down:Shift_L tap:b up:Shift_L up:Control_L'); await sleep(700);
  ok(await ui.evaluate(() => S.prefs.bookmarkBar) === 'always', '⇧⌘B shows the bar');
  K('down:Control_L down:Shift_L tap:b up:Shift_L up:Control_L'); await sleep(700);
  ok(await ui.evaluate(() => S.prefs.bookmarkBar) === 'hidden', 'and again goes back to how it was (hidden)');

  // 6. the command bar finds bookmarks
  await ui.evaluate(() => { S.bookmarks.push({ id: 'zebra', type: 'bm', url: 'http://localhost:8765/links.html?zebra', title: 'Zebra crossing' }); bmChanged(); });
  await ui.evaluate(() => openCmd('new')); await sleep(500);
  await ov.fill('#q', 'zebra'); await sleep(300);
  const rows = await ov.evaluate(() => [...document.querySelectorAll('#res .rh')].map(e => e.textContent).join() + '|' + [...document.querySelectorAll('#res .r .lb')].map(e => e.textContent).join());
  ok(/bookmarks/.test(rows) && /Zebra crossing/.test(rows), 'typing in the command bar finds bookmarks: ' + rows);
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await ui.evaluate(() => B.overlayCancel()); await sleep(400);

  // 7. the bookmarks sheet
  await ui.evaluate(() => openSheet('bookmarks')); await sleep(900);
  let names = await ov.evaluate(() => [...document.querySelectorAll('.brow b')].map(e => e.textContent));
  ok(names.length === 3 && names.includes('Work') && names.includes('Zebra crossing'), 'the sheet lists the bar: ' + names);
  await audit(ov, 'bookmarks sheet');
  await ov.click('.brow.fold'); await sleep(300);
  names = await ov.evaluate(() => [...document.querySelectorAll('.brow')].map(e => e.querySelector('b').textContent + ':' + e.style.getPropertyValue('--d')));
  ok(names.length === 4 && names[names.indexOf('Work:0') + 1].endsWith(':1'), 'clicking a folder opens it, its bookmarks indented under it');
  shot('bm-sheet');
  // drag Zebra into the folder with the real mouse
  const rr = await ov.evaluate(() => [...document.querySelectorAll('.brow')].map(e => { const r = e.getBoundingClientRect(); return { n: e.querySelector('b').textContent, x: r.x + 120, y: r.y, h: r.height }; }));
  const z = rr.find(x => x.n === 'Zebra crossing'), w = rr.find(x => x.n.startsWith('🦊') || x.n === 'Work');
  execSync(`python3 ${__dirname}/ptr.py drag ${X0 + z.x} ${Y0 + z.y + z.h / 2} ${X0 + w.x} ${Y0 + w.y + w.h / 2} .25`); ptr('up'); await sleep(700);
  ok(await ui.evaluate(() => S.bookmarks.find(n => n.type === 'folder').kids.some(k => k.id === 'zebra')), 'dragging a row onto a folder in the sheet moves it inside');
  // edit in place
  await ov.evaluate(() => [...document.querySelectorAll('.brow')].find(e => e.querySelector('b').textContent === 'Zebra crossing').querySelector('[data-a=edit]').click()); await sleep(400);
  ok(await ov.evaluate(() => !!document.querySelector('.bmedit-in .bmf')), 'Edit opens the form right under the row');
  await audit(ov, 'editing in the sheet');
  await ov.evaluate(() => { const f = document.querySelector('.bmedit-in .bmf'); f.name.value = 'Zebra!'; f.parent.value = ''; f.requestSubmit(); }); await sleep(500);
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.title === 'Zebra!')), 'saving renames it and moves it back to the bar (In: Bookmarks bar)');
  ok(await ov.evaluate(() => [...document.querySelectorAll('.brow b')].some(e => e.textContent === 'Zebra!')), 'the sheet updates right away');
  // delete, then undo
  await ov.evaluate(() => [...document.querySelectorAll('.brow')].find(e => e.querySelector('b').textContent === 'Zebra!').querySelector('[data-a=del]').click()); await sleep(600);
  ok(!(await ui.evaluate(() => S.bookmarks.some(n => n.id === 'zebra'))), 'the × removes it');
  await ui.evaluate(() => bmUndo()); await sleep(300);
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.id === 'zebra')), 'Undo puts it back where it was');
  // new folder from the sheet is edited in place
  await ov.click('#bnewf'); await sleep(600);
  ok(await ov.evaluate(() => !!document.querySelector('.bmedit-in .bmf.isf')), 'New folder in the sheet opens its form in place');
  await ov.evaluate(() => document.querySelector('.bmedit-in [data-x="cancel"]').click()); await sleep(400);
  ok(await ui.evaluate(() => S.bookmarks.filter(n => n.type === 'folder').length) === 1, 'cancel removes the empty new folder');
  await ov.evaluate(() => document.querySelector('.sheet .xx').click()); await sleep(500);
  // a folder can't go inside itself
  await ui.evaluate(() => { const f = S.bookmarks.find(n => n.type === 'folder'); f.kids.push({ id: 'inner', type: 'folder', name: 'Inner', kids: [] }); bmChanged(); bmMove(f.id, 'inner', true); });
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.type === 'folder' && n.kids.some(k => k.id === 'inner'))), 'a folder can\'t be dropped inside itself');

  // 8. import from other browsers
  await ui.evaluate(() => openSetup('settings', 'bookmarks')); await sleep(1500);
  const found = await ov.evaluate(() => [...document.querySelectorAll('.bmrow')].map(r => r.querySelector('b').textContent + '/' + r.querySelector('small').textContent));
  ok(found.length === 3 && found[0] === 'Chrome/Colton · 4 bookmarks' && found[1] === 'Chrome/Work · 1 bookmark' && found[2] === 'Brave/Default · 1 bookmark', 'Settings › Bookmarks finds Chrome (both profiles, by name) and Brave, not the empty one: ' + found);
  await audit(ov, 'Settings › Bookmarks');
  shot('bm-settings');
  await ov.evaluate(() => document.querySelector('.bmrow .btn').click());
  await ov.waitForSelector('.bmi .okay', { timeout: 6000 });
  let msg = await ov.$eval('.bmi .okay', e => e.textContent);
  ok(/Brought in 4 bookmarks in 3 folders from Chrome/.test(msg), 'importing says what came over: ' + msg);
  const tree = await ui.evaluate(() => S.bookmarks.map(n => n.type === 'folder' ? n.name + '[' + n.kids.map(k => k.title || k.name + '[' + (k.kids || []).map(j => j.title || j.name).join() + ']').join() + ']' : n.title));
  ok(tree.includes('Chrome One') && tree.some(x => x.startsWith('Dev[Chrome Dev,Deeper[Deep]')) && tree.includes('More from Chrome (Colton)[Other One]') && !JSON.stringify(tree).includes('Script'), 'Chrome\'s bar joins yours (nested folders too), the rest goes in “More from Chrome”, scripts are left out: ' + JSON.stringify(tree));
  await ov.evaluate(() => document.querySelector('.bmrow .btn').click());
  await ov.waitForFunction(() => /already here/.test((document.querySelector('.bmi .okay') || {}).textContent || ''), null, { timeout: 6000 });
  ok(await ui.evaluate(() => [...bmWalk()].length) === await ui.evaluate(() => [...bmWalk()].length) && /already here/.test(await ov.$eval('.bmi .okay', e => e.textContent)), 'importing again adds nothing twice');
  const count1 = await ui.evaluate(() => [...bmWalk()].length);
  // the shell's merge with an HTML export
  const r2 = await ui.evaluate(d => bmImport(d, 'bookmarks_firefox'), { bar: ff.bar, other: ff.other });
  ok(r2.ok && r2.n === 3 && await ui.evaluate(() => [...bmWalk()].length) === count1 + 6, 'an exported HTML file merges in too: ' + r2.text);
  await ov.evaluate(() => document.querySelector('.set .xx').click()); await sleep(600);

  // 9. a second window shares the bookmarks, live
  K('down:Control_L tap:n up:Control_L'); await sleep(3000);
  const shells = b.pages().filter(p => p.url().endsWith('/index.html'));
  const w2 = await (async () => { for (const p of shells) if (await p.evaluate(() => window.WID) !== 'w1') return p; })();
  ok(!!w2 && await w2.evaluate(() => S.bookmarks.length) === await ui.evaluate(() => S.bookmarks.length), 'a new window has the same bookmarks');
  await w2.evaluate(() => { S.bookmarks.push({ id: 'fromw2', type: 'bm', url: 'http://localhost:8765/p2.html?w2', title: 'From window two' }); bmChanged(); }); await sleep(2000);
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.id === 'fromw2')), 'a bookmark added in one window shows up in the other');
  await w2.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'always' } })); await sleep(2000);
  ok(await ui.evaluate(() => document.body.classList.contains('bm-always') && layout().stage.y === 76), 'switching the bar to Always in one window applies to both');
  await w2.evaluate(() => window.close && 0);
  const finalCount = await ui.evaluate(() => [...bmWalk()].length);
  await sleep(1500);

  // 10. survives a restart
  await b.stop(); b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(1500);
  ok(await ui.evaluate(() => [...bmWalk()].length) === finalCount, `bookmarks are still there after quitting (${finalCount})`);
  ok(await ui.evaluate(() => { const f = S.bookmarks.find(n => n.type === 'folder' && n.icon === '🦊'); return f && f.color === '#3d63ff'; }), 'folders keep their emoji and colour');
  ok(await ui.evaluate(() => S.prefs.bookmarkBar === 'always' && layout().stage.y === 76 && !!document.querySelector('#bmbar .bm')), 'and the bar is still always shown');
  await audit(ui, 'after restart');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
