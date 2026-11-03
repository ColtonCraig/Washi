'use strict';
/* End-to-end checks for the browsing features: blocking, popups, find, peek, history, archive, sleeping tabs,
   downloads, mute, bangs, suggestions, shortcuts, separate logins per space. */
const { start, sleep, ok, shot, done, skipSetup } = require('./lib');
const BASE = 'http://localhost:8765';
(async () => {
  const b = await start(); const { ui, sb, ov, pages } = b;
  await skipSetup(b);
  const st = () => ui.evaluate(() => ({ a: R.a, b: R.b, split: R.split, tabs: Object.keys(S.tabs).length, urls: Object.values(S.tabs).map(t => t.url) }));
  const pageWith = s => pages().find(p => p.url().includes(s));
  const open = async (u, wait = 1500) => { await ui.evaluate(u => openTab(u), u); await sleep(wait); };

  // ---------- ads and trackers ----------
  await open(BASE + '/trackers.html', 1500);
  let blocked = 0; for (let i = 0; i < 40 && (blocked = await ui.evaluate(() => R.blocked[R.a] || 0)) < 3; i++) await sleep(250);   // a cold first start is slower
  await sleep(400); blocked = await ui.evaluate(() => R.blocked[R.a] || 0);
  ok(blocked >= 3, `trackers page: ${blocked} ads/trackers blocked`);
  ok((await ui.evaluate(() => document.querySelector('#bShield b').textContent)) === String(blocked), 'shield shows the count');
  await ui.click('#bShield'); await sleep(900); shot('feat-shield');
  ok(await ov.evaluate(() => document.querySelector('.pop .big b')?.textContent) === String(blocked), 'shield popover shows the count for this site');
  await ov.click('#sitesw'); await sleep(2500);
  ok(await ui.evaluate(() => (R.blocked[R.a] || 0) === 0), 'turning blocking off for localhost: nothing blocked after reload');
  await ui.click('#bShield'); await sleep(800); await ov.click('#sitesw'); await sleep(1500);
  for (let i = 0; i < 40 && (await ui.evaluate(() => R.blocked[R.a] || 0)) < 3; i++) await sleep(250);   // a slow network (CI) can take a moment
  ok(await ui.evaluate(() => (R.blocked[R.a] || 0) >= 3), 'turning it back on blocks again');

  // ---------- popup blocker ----------
  const before = (await st()).tabs;
  await open(BASE + '/popup.html', 1800);
  ok((await st()).tabs === before + 1, 'a page opening a pop-up by itself is blocked');
  const pp = pageWith('/popup.html'); await pp.click('#b'); await sleep(1200);
  ok((await st()).urls.filter(u => u.endsWith('/p2.html')).length >= 1, 'a pop-up you click for opens as a tab');

  // ---------- find on page ----------
  await open(BASE + '/p1.html');
  await ui.evaluate(() => B.panel('find', null, {})); await sleep(700);
  await ov.keyboard.type('findme'); await sleep(900); shot('feat-find');
  ok((await ov.evaluate(() => document.getElementById('fc').textContent)) === '1 of 3', 'find: "1 of 3" matches');
  await ov.keyboard.press('Enter'); await sleep(500);
  ok((await ov.evaluate(() => document.getElementById('fc').textContent)) === '2 of 3', 'find: Enter goes to the next match');
  await ov.keyboard.press('Escape'); await sleep(500);
  ok(!(await ov.evaluate(() => document.getElementById('panel').classList.contains('on'))), 'find: esc closes the bar');

  // ---------- peek ----------
  await open(BASE + '/links.html');
  const lp = pageWith('/links.html'); await lp.click('#l', { modifiers: ['Shift'] }); await sleep(1600); shot('feat-peek');
  ok(await ov.evaluate(() => document.getElementById('peek').classList.contains('on')), 'shift-click opens the link in a peek card');
  ok(!!pageWith('/p2.html') && (await st()).urls.filter(u => u.endsWith('/links.html')).length === 1, 'peek did not add a tab');
  const tabsBefore = (await st()).tabs;
  await ov.click('#pkopen'); await sleep(1500);
  const s1 = await st();
  ok(s1.tabs === tabsBefore + 1 && (await ui.evaluate(() => S.tabs[R.a].url)).endsWith('/p2.html'), 'Open as tab turns the peek into a real tab and shows it');

  // ---------- history sheet ----------
  await ui.evaluate(() => openSheet('history')); await sleep(1000); shot('feat-history');
  const rows = await ov.evaluate(() => document.querySelectorAll('#sheet .row').length);
  ok(rows >= 4, `history sheet lists visited pages (${rows})`);
  ok(await ov.evaluate(() => document.querySelector('#sheet .day').textContent) === 'Today', 'history is grouped by day');
  await ov.fill('#sq', 'trackers'); await sleep(300);
  ok(await ov.evaluate(() => document.querySelectorAll('#sheet .row').length) === 1, 'history search filters');
  await ov.hover('#sheet .row'); await ov.click('#sheet .row [data-a="forget"]'); await sleep(500);
  ok(!(await ui.evaluate(() => S.history.some(h => h.url.includes('trackers')))), 'removing a history entry works');
  await ov.keyboard.press('Escape'); await sleep(500);

  // ---------- archive ----------
  await ui.evaluate(() => { S.prefs.archive = 12; const old = Date.now() - 13 * 3600e3; for (const id of spaceTabs(sp())) if (id !== R.a && id !== R.b) S.tabs[id].seen = old; archiveTabs(); });
  await sleep(800);
  const arch = await ui.evaluate(() => S.archive.length);
  ok(arch >= 3, `tabs not opened in 12 hours were archived (${arch})`);
  await ui.evaluate(() => openSheet('archive')); await sleep(900); shot('feat-archive');
  const n0 = await ui.evaluate(() => spaceTabs(sp()).length);
  await ov.click('#sheet .row'); await sleep(1500);
  ok(await ui.evaluate(n => spaceTabs(sp()).length === n + 1, n0), 'restoring from the archive brings the tab back');
  await ui.evaluate(() => { S.prefs.archive = 0; });

  // ---------- sleeping tabs ----------
  await open(BASE + '/p3.html'); await open(BASE + '/p1.html');
  const sleeper = await ui.evaluate(() => spaceTabs(sp()).find(id => id !== R.a && R.live[id]));
  await ui.evaluate(id => { S.prefs.sleep = 15; S.tabs[id].seen = Date.now() - 20 * 60e3; sleepTabs(); }, sleeper); await sleep(600);
  ok(await ui.evaluate(id => R.live[id] === false, sleeper), 'an unused tab goes to sleep');
  ok(await sb.evaluate(id => { const e = document.querySelector(`.tab[data-id="${id}"]`), f = e && e.querySelector('.fav'); return !!e && e.classList.contains('asleep') && (!f || (getComputedStyle(f).opacity === '1' && getComputedStyle(f).filter === 'none')); }, sleeper), 'the sleeping tab keeps its colours in the sidebar (no greying)');
  await ui.evaluate(id => selectTab(id), sleeper); await sleep(1500);
  ok(await ui.evaluate(id => R.live[id] === true && R.a === id, sleeper), 'clicking a sleeping tab wakes it up');

  // ---------- downloads ----------
  await ui.evaluate(() => navigate('http://localhost:8765/dl')); await sleep(2500);
  const dls = await ui.evaluate(() => R.downloads);
  ok(dls.length >= 1 && dls[0].state === 'completed' && dls[0].name.startsWith('washi-test'), 'a download completes into Downloads');
  ok(await ui.evaluate(() => !document.getElementById('bDl').hidden), 'downloads stamp appears in the top bar');
  await ui.click('#bDl'); await sleep(900); shot('feat-downloads');
  ok(await ov.evaluate(() => /washi-test/.test(document.querySelector('#sheet .row.dl b').textContent)), 'downloads sheet lists the file');
  await ov.keyboard.press('Escape'); await sleep(400);

  // ---------- mute ----------
  await ui.evaluate(() => B.tabAct(R.a, 'mute')); await sleep(400);
  ok(await ui.evaluate(() => R.muted[R.a] === true), 'mute a tab');
  await ui.evaluate(() => B.tabAct(R.a, 'mute')); await sleep(300);

  // ---------- bangs + suggestions ----------
  ok(await ui.evaluate(() => toURL('!yt paper craft')) === 'https://www.youtube.com/results?search_query=paper%20craft', '!yt bang searches YouTube');
  ok(await ui.evaluate(() => toURL('ducks !w')) === 'https://en.wikipedia.org/w/index.php?search=ducks', 'trailing !w bang searches Wikipedia');
  const sug = await ui.evaluate(() => B.suggest('cat', 'http://localhost:8765/sugg?q=%s'));
  ok(Array.isArray(sug) && sug[0] === 'cat recipes', 'search suggestions come back from the engine');
  await ui.evaluate(() => openCmd('new')); await sleep(600);
  await ov.evaluate(() => { D.suggest = 'http://localhost:8765/sugg?q=%s'; }); await ov.keyboard.type('paper'); await sleep(900); shot('feat-suggest');
  ok(await ov.evaluate(() => [...document.querySelectorAll('#res .r .lb')].some(e => e.textContent === 'paper recipes')), 'suggestions show in the command bar');
  await ov.fill('#q', '!gh washi'); await sleep(300);
  ok(await ov.evaluate(() => document.querySelector('#res .r .lb').textContent) === 'Search GitHub for “washi”', 'command bar explains the bang');
  await ov.keyboard.press('Escape'); await sleep(400);

  // ---------- shortcuts editor ----------
  await ui.evaluate(() => openSetup('settings', 'keys')); await sleep(1500); shot('feat-keys');
  const chipFor = label => ov.evaluateHandle(l => [...document.querySelectorAll('.krow')].find(r => r.querySelector('.kl').textContent === l).querySelector('.kchip'), label);
  await (await chipFor('Find on Page…')).click(); await sleep(300);
  await ov.keyboard.press('Meta+Alt+KeyK'); await sleep(600);
  ok(await ui.evaluate(() => S.prefs.keys.find === 'Alt+CmdOrCtrl+K'), 'record a new shortcut (⌥⌘K for Find)');
  ok(await ui.evaluate(() => R.keys.find === 'Alt+CmdOrCtrl+K'), 'the menu bar now uses it');
  await (await chipFor('Print…')).click(); await sleep(300); await ov.keyboard.press('Meta+Alt+KeyK'); await sleep(600);
  ok(await ui.evaluate(() => S.prefs.keys.print === 'Alt+CmdOrCtrl+K' && S.prefs.keys.find === ''), 'taking a key from another action clears it there');
  ok(await ov.evaluate(() => /Find on Page/.test(document.querySelector('.knote').textContent)), 'and says so');
  await ov.click('text=Reset all shortcuts'); await sleep(500);
  ok(await ui.evaluate(() => Object.keys(S.prefs.keys).length === 0), 'reset all shortcuts');
  await ov.keyboard.press('Escape'); await sleep(600);

  // ---------- separate logins per space ----------
  await open(BASE + '/cookie.html'); const cp = pageWith('/cookie.html');
  await cp.evaluate(() => { document.cookie = 'who=home; max-age=3600'; });
  await ui.evaluate(() => { const w = S.spaces.find(s => s.id === 'work'); B.setupMsg({ type: 'isolate', id: 'work', on: true }); }); await sleep(500);
  await ui.evaluate(() => switchSpace('work', { quiet: true })); await sleep(600);
  await ui.evaluate(() => openTab('http://localhost:8765/cookie.html')); await sleep(1500);
  const wt = await ui.evaluate(() => S.tabs[R.a].title);
  ok(wt === 'cookie:', `a space with separate logins doesn't see the other space's cookies ("${wt}")`);
  await ui.evaluate(() => switchSpace('home', { quiet: true })); await sleep(600);
  await ui.evaluate(() => openTab('http://localhost:8765/cookie.html')); await sleep(1500);
  const ht = await ui.evaluate(() => S.tabs[R.a].title + ' / ' + S.tabs[R.a].url + ' / cur=' + S.cur); ok(ht.startsWith('cookie:who=home'), 'the normal space still has its cookie: ' + ht);

  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
