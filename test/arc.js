'use strict';
/* Import from Arc: reads a real-format Arc sidebar file and brings spaces, pinned tabs, nested folders, split views and
   favorites into Washi. Checks merging by name, the 3-level limit, skipped Arc-only items, no duplicates on a second run,
   the Settings screen (nothing clipped) and the welcome-setup card. */
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-arc-')), file = path.join(tmp, 'StorableSidebar.json');
execSync(`node ${__dirname}/fixtures/make-arc.js ${file}`);
process.env.WASHI_ARC_FILE = file;
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
(async () => {
  let b = await start(); let { ui, ov, sb } = b; await skipSetup(b);
  // something already in Washi's Play space, to check it isn't doubled
  await ui.evaluate(() => { const s = S.spaces.find(x => x.id === 'play'); const id = 'tdup'; S.tabs[id] = { url: 'http://localhost:8765/p1.html?dup', title: 'dup', seen: Date.now() }; s.tabs.push(id); render(); });
  await ui.evaluate(() => openSetup('settings', 'import')); await sleep(1800);
  const rows = await ov.$$eval('.arow', r => r.map(x => [x.querySelector('b').textContent, x.querySelector('small').textContent, x.querySelector('.tag').textContent, x.classList.contains('on')]));
  ok(rows.length === 3, 'Settings → Import lists the 3 Arc spaces: ' + JSON.stringify(rows));
  ok(rows[0][2] === 'adds to Work' && rows[1][2] === 'new space' && rows[2][2] === 'adds to Play', 'it says which spaces merge and which are new');
  ok(rows[0][1].startsWith('7 tabs · 4 folders') && /\+1 unpinned/.test(rows[0][1]), 'counts per space are right (Arc-only easels and arc:// pages are left out): ' + rows[0][1]);
  ok(rows.every(r => r[3]), 'all three are picked (room for them)');
  shot('arc-settings');
  let a = await ov.evaluate(AUDIT); ok(!a.length, 'import screen: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  // turn on "also bring unpinned", then import
  await ov.click('.tgl:has-text("weren\'t pinned") .sw'); await sleep(200);
  await ov.click('button:has-text("Bring in 3 spaces")');
  await ov.waitForSelector('.arc .okay', { timeout: 6000 });
  const msg = await ov.$eval('.arc .okay', e => e.textContent);
  ok(/Brought in 1 space, 11 tabs, 4 folders and 2 pinned favorites from Arc/.test(msg), 'it reports what came over: ' + msg);
  const S1 = await ui.evaluate(() => {
    const t = id => S.tabs[id] && S.tabs[id].title, F = s => n => s.folders.find(f => f.name === n);
    const w = S.spaces.find(x => x.name === 'Work'), p = S.spaces.find(x => x.name === 'Personal'), g = S.spaces.find(x => x.name === 'Play');
    const proj = F(w)('Projects'), des = F(w)('Designs'), l3 = F(w)('Level3');
    return { spaces: S.spaces.map(x => x.name), workTop: w.tabs.map(k => k.startsWith('f:') ? 'F:' + w.folders.find(f => 'f:' + f.id === k).name : t(k)),
      proj: proj.tabs.map(k => k.startsWith('f:') ? 'F:' + folderOf(w, k).name : t(k)), des: des.tabs.map(k => k.startsWith('f:') ? 'F:' + folderOf(w, k).name : t(k)), l3: l3 && l3.tabs.map(t),
      level4: !!F(w)('Level4'), closed: !proj.open, pair: S.pairs.some(P => P.map(t).join() === 'Left half,Right half'), live: Object.keys(R.live).filter(k => R.live[k]).length,
      personal: p && p.tabs.map(k => k.startsWith('f:') ? 'F:' + folderOf(p, k).name : t(k)), trip: p && F(p)('Trip').tabs.map(t),
      play: g.tabs.map(t), pins: S.pins.map(t), allUrls: Object.values(S.tabs).map(x => x.url) };
  });
  ok(S1.spaces.join() === 'Home,Work,Play,Personal', 'Personal became a new space; Work and Play merged by name: ' + S1.spaces);
  ok(JSON.stringify(S1.workTop.slice(0, 5)) === JSON.stringify(['Work Inbox', 'F:Projects', 'Left half', 'Right half', 'Today tab']), 'Work: pinned tabs on top in Arc\'s order, then the unpinned one: ' + JSON.stringify(S1.workTop));
  ok(S1.proj.join() === 'Spec doc,F:Designs' && S1.des.join() === 'Design file,F:Level3', 'folders inside folders come over as nested folders');
  ok(S1.l3.join() === 'Deep link,Too deep' && !S1.level4, 'a 4th level folder is folded into the 3rd (Washi\'s limit): ' + S1.l3);
  ok(S1.pair, 'an Arc split view becomes a Washi split pair');
  ok(!S1.allUrls.some(u => /^arc:/.test(u)) && !S1.workTop.includes('Moodboard'), 'Arc-only items (easels, arc:// pages) are skipped');
  ok(S1.personal.join() === 'Recipes,F:Trip' && S1.trip.join() === 'Flights', 'Personal: tab + folder');
  ok(S1.play.join() === 'Game wiki,dup', 'Play: the tab that was already there is not doubled: ' + S1.play);
  ok(S1.pins.join() === 'Mail,Calendar', 'Arc favorites became pinned tabs');
  ok(S1.closed, 'imported folders start collapsed, to keep the sidebar tidy');
  ok(S1.live <= 1, 'nothing starts loading (pages load when clicked): ' + S1.live);
  // the sidebar draws the imported Work space
  await ov.keyboard.press('Escape'); await sleep(600);
  await ui.evaluate(() => switchSpace('work')); await sleep(900);
  await sb.click('.fold>.fh:has-text("Projects")'); await sleep(500); await sb.click('.fold>.fh:has-text("Designs")'); await sleep(500); await sb.click('.fold>.fh:has-text("Level3")'); await sleep(700);
  shot('arc-sidebar');
  a = await sb.evaluate(AUDIT); ok(!a.length, 'imported Work space in the sidebar: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  ok(await sb.$$eval('.fold .fold .fold .tab', e => e.length) === 2, 'three levels of folders show in the sidebar');
  // second run: nothing doubles up
  const nTabs = await ui.evaluate(() => Object.keys(S.tabs).length);
  await ui.evaluate(() => openSetup('settings', 'import')); await sleep(1600);
  const rows2 = await ov.$$eval('.arow .tag', r => r.map(x => x.textContent));
  ok(rows2.join() === 'adds to Work,adds to Personal,adds to Play', 'second time, all three merge: ' + rows2);
  await ov.click('button:has-text("Bring in 3 spaces")'); await ov.waitForSelector('.arc .okay', { timeout: 6000 });
  ok(await ov.$eval('.arc .okay', e => e.textContent) === '✓ Everything from Arc was already here.' && await ui.evaluate(n => Object.keys(S.tabs).length === n, nTabs), 'running it again adds nothing');
  await ov.keyboard.press('Escape'); await sleep(500);
  // command bar finds it
  await ui.evaluate(() => openCmd('new')); await sleep(500); await ov.keyboard.type('import from arc'); await sleep(400);
  const lbs = await ov.evaluate(() => [...document.querySelectorAll('#res .r .lb')].map(e => e.textContent));
  ok(lbs.slice(0, 3).includes('Import from Arc'), 'the command bar has "Import from Arc" near the top: ' + JSON.stringify(lbs.slice(0, 4)));
  await ov.keyboard.press('Escape'); await b.stop();

  // welcome setup: the "Coming from Arc?" card on the Basics step, and hidden when Arc isn't there
  b = await start({ port: 9223 }); ({ ui, ov } = b); await sleep(1500);
  await ov.click('button:has-text("Let\'s set it up")'); await sleep(700); await ov.click('.nav .next'); await sleep(900);
  ok(await ov.evaluate(() => { const f = [...document.querySelectorAll('.fld')].find(x => x.querySelector('h4').textContent === 'Coming from Arc?'); return f && !f.hidden && /Found 3 Arc spaces/.test(f.textContent); }), 'welcome setup offers to bring the Arc setup over');
  shot('arc-onboard');
  a = await ov.evaluate(AUDIT); ok(!a.length, 'welcome Basics step with the Arc card: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  await ov.click('button:has-text("Bring in my Arc setup")'); await ov.waitForSelector('.arc .okay', { timeout: 6000 });
  ok(await ui.evaluate(() => S.spaces.map(x => x.name).join()) === 'Home,Work,Play,Personal', 'one click in the welcome setup imports everything');
  await b.stop();
  process.env.WASHI_ARC_FILE = path.join(tmp, 'missing.json');
  b = await start({ port: 9224 }); ({ ui, ov } = b); await sleep(1500);
  await ov.click('button:has-text("Let\'s set it up")'); await sleep(700); await ov.click('.nav .next'); await sleep(1200);
  ok(await ov.evaluate(() => { const f = [...document.querySelectorAll('.fld')].find(x => x.querySelector('h4').textContent === 'Coming from Arc?'); return !f || f.hidden; }), 'no Arc on this Mac: the card stays hidden');
  await ov.evaluate(() => SETUP.finish()); await sleep(800);
  await ui.evaluate(() => openSetup('settings', 'import')); await sleep(1200);
  ok(await ov.evaluate(() => /Arc isn't on this Mac/.test(document.querySelector('.arc').textContent) && !!document.querySelector('.arc button')), 'Settings explains and offers to pick the file');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
