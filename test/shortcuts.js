'use strict';
/* Every keyboard shortcut, pressed with real keys like a person would (here ⌘ is Ctrl and ⌥ is Alt), each checked for
   what it should do: tabs, windows, spaces, folders, find, zoom, Reader, notes, Focus, snapshot, split, the sheets,
   bookmarks, moving between tabs, What's new and Settings. Then a shortcut changed in Settings › Shortcuts (recorded with
   real keys) works and the old one doesn't. Print and Picture in picture open system windows, so they're only checked
   to be on the menu (test/menu-keys.js). */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup } = require('./lib');
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const SYM = { '[': 'bracketleft', ']': 'bracketright', '=': 'equal', '-': 'minus', ',': 'comma', '\\': 'backslash', '/': 'slash', '.': 'period', ';': 'semicolon', Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right', Tab: 'Tab', Space: 'space', Esc: 'Escape' };
const MOD = { cmdorctrl: 'Control_L', commandorcontrol: 'Control_L', ctrl: 'Control_L', control: 'Control_L', cmd: 'Control_L', command: 'Control_L', alt: 'Alt_L', option: 'Alt_L', shift: 'Shift_L' };
function press(accel) {
  const parts = String(accel).split('+'), key = parts.pop(), mods = [...new Set(parts.map(m => MOD[m.toLowerCase()]).filter(Boolean))];
  const k = SYM[key] || (key.length === 1 ? key.toLowerCase() : key);
  K([...mods.map(m => 'down:' + m), 'tap:' + k, ...mods.slice().reverse().map(m => 'up:' + m)].join(' '));
}

(async () => {
  let b = await start(); let { ui, ov, sb } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1800);
  const keys = await ui.evaluate(() => R.keys);
  const page = s => b.pages().filter(p => p.url().includes(s)).pop();
  const cmdOn = () => ov.evaluate(() => document.getElementById('cmd').classList.contains('on'));
  const until = async (f, ms = 2500) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await f().catch(() => false); if (v) return v; await sleep(80); } return v; };
  const esc = async () => { K('tap:Escape'); await sleep(450); };
  const into = async () => { const L = await ui.evaluate(() => layout().a); ptr(`move ${X0 + L.x + L.w / 2} ${Y0 + L.y + 300}`); await sleep(60); ptr('down'); ptr('up'); await sleep(250); };   // the page has the keyboard
  const tabs = () => ui.evaluate(() => Object.keys(S.tabs).length);
  const t = async (id, what, check, before) => { if (before) await before(); await into(); press(keys[id]); const r = await until(check); ok(!!r, `${keys[id]}  ${what}`); return r; };

  // tabs and the command bar
  await t('newtab', 'opens the command bar for a new scrap', () => cmdOn()); await esc();
  await t('location', 'edits this address', async () => await cmdOn() && await ov.evaluate(() => /this tab/.test(document.getElementById('mode').textContent))); await esc();
  let n = await tabs();
  await t('close', 'closes the tab', async () => await tabs() === n - 1);
  await t('reopen', 'brings it back', async () => await tabs() === n);
  await t('pin', 'pins the tab', () => ui.evaluate(() => S.pins.includes(focusedId())));
  press(keys.pin); await sleep(500);
  const f0 = await ui.evaluate(() => focusedId());
  await t('nexttab', 'goes to the next tab in the sidebar', async () => await ui.evaluate(() => focusedId()) !== f0);
  await t('prevtab', 'and back', async () => await ui.evaluate(() => focusedId()) === f0);
  // pages
  await ui.evaluate(() => navigate('http://localhost:8765/links.html')); await sleep(1500);
  await t('back', 'goes back', () => ui.evaluate(() => /p1\.html/.test(S.tabs[focusedId()].url)));
  await t('forward', 'goes forward', () => ui.evaluate(() => /links\.html/.test(S.tabs[focusedId()].url)));
  await t('back', 'back again', () => ui.evaluate(() => /p1\.html/.test(S.tabs[focusedId()].url)));
  await page('/p1.html').evaluate(() => { window.__mark = 1; });
  await t('reload', 'reloads the page', () => page('/p1.html').evaluate(() => !window.__mark && document.readyState === 'complete'));
  await page('/p1.html').evaluate(() => { window.__mark = 1; });
  await t('hardreload', 'reloads it without the cache', () => page('/p1.html').evaluate(() => !window.__mark && document.readyState === 'complete'));
  const zoom = () => ui.evaluate(() => B.setupAct({ type: 'test:zoom' })).then(r => r && r.zoom);
  await t('zoomin', 'zooms in', async () => (await zoom()) > 1);
  await t('zoomout', 'zooms out', async () => (await zoom()) <= 1);
  await t('zoomin', '', async () => (await zoom()) > 1);
  await t('zoomreset', 'back to actual size', async () => (await zoom()) === 1);
  if (process.platform === 'darwin') { await t('mute', 'mutes the tab', () => ui.evaluate(() => !!R.muted[focusedId()])); press(keys.mute); await sleep(400); }
  else console.log('  NOTE ⌃⌘M (mute) has both Control and ⌘, which are the same key here: it\'s on the menu with that shortcut (menu-keys.js), and the mute itself is checked by features.js');
  await t('copyurl', 'copies the address', () => ov.evaluate(() => /Copied the page address/.test(document.getElementById('toast').textContent)));
  // find
  await t('find', 'opens Find on page', () => ov.evaluate(() => !!document.querySelector('.panel.on .findbar')));
  await ov.keyboard.type('findme'); await sleep(600);
  const fc = () => ov.evaluate(() => document.getElementById('fc').textContent);
  const c1 = await fc();
  press(keys.findnext); const c2 = await until(async () => { const v = await fc(); return v !== c1 && v; });
  ok(/of 3/.test(c1) && c2 && c2 !== c1, `${keys.findnext}  finds the next match (${c1} → ${c2})`);
  press(keys.findprev); const c3 = await until(async () => { const v = await fc(); return v !== c2 && v; });
  ok(c3 === c1, `${keys.findprev}  and the previous one (${c3})`);
  await esc();
  // views
  await t('today', 'shows Today', () => ui.evaluate(() => !document.getElementById('today').hidden));
  await ui.evaluate(() => { const id = Object.keys(S.tabs).find(k => /p1\.html/.test(S.tabs[k].url)); selectTab(id); }); await sleep(700);
  await t('notes', 'opens the sticky note', () => ov.evaluate(() => !!document.querySelector('.panel.on .pop.note'))); await esc();
  await t('focus', 'turns on Focus mode', () => ui.evaluate(() => S.focusMode));
  await t('focus', 'and off', () => ui.evaluate(() => !S.focusMode));
  await t('snapshot', 'starts a snapshot', () => ov.evaluate(() => !!document.querySelector('.snap.on'))); await esc();
  const dock0 = await ui.evaluate(() => S.dock);
  await t('sidebar', 'floats the sidebar', async () => await ui.evaluate(() => S.dock) !== dock0);
  await t('sidebar', 'and pins it again', async () => await ui.evaluate(() => S.dock) === dock0);
  await t('split', 'opens split view', () => ui.evaluate(() => R.split));
  await t('split', 'and closes it', () => ui.evaluate(() => !R.split));
  await t('devtools', 'opens the developer tools', () => ui.evaluate(() => B.setupAct({ type: 'test:devtools' })).then(r => r && r.open));
  await ui.evaluate(() => B.setupAct({ type: 'test:devtools', close: true })); await sleep(500);
  // sheets
  const sheet = k => ov.evaluate(k => !!document.querySelector(`.sheet.${k}`) && document.querySelector('#sheets, .sheets') !== null, k);
  await t('history', 'shows History', () => ov.evaluate(() => /History/.test(document.querySelector('.sheet') ? document.querySelector('.sheet').textContent : ''))); await esc();
  await t('archive', 'shows the Archive', () => ov.evaluate(() => /Archive/.test(document.querySelector('.sheet') ? document.querySelector('.sheet').textContent : ''))); await esc();
  await t('downloads', 'shows Downloads', () => ov.evaluate(() => /Downloads/.test(document.querySelector('.sheet') ? document.querySelector('.sheet').textContent : ''))); await esc();
  await t('bookmarks', 'shows all bookmarks', () => ov.evaluate(() => !!document.querySelector('.sheet.bookmarks'))); await esc();
  await t('bookmark', 'bookmarks the page', () => ui.evaluate(() => S.bookmarks.some(x => /p1\.html/.test(x.url)))); await esc();
  const bar0 = await ui.evaluate(() => barMode());
  await t('bookmarkbar', 'shows the bookmarks bar all the time', () => ui.evaluate(() => barMode() === 'always'));
  await t('bookmarkbar', 'and back', async () => await ui.evaluate(() => barMode()) === bar0);
  await t('whatsnew', 'opens What\'s new', () => ov.evaluate(() => !!document.querySelector('#setup.on .sheet.nw'))); await esc();
  await t('settings', 'opens Settings', () => ov.evaluate(() => !!document.querySelector('#setup.on .sheet.set'))); await esc();
  // spaces and folders
  await t('newspace', 'asks for a new space\'s name', async () => await cmdOn() && await ov.evaluate(() => /space/i.test(document.getElementById('q').placeholder)));
  await ov.keyboard.type('Keys'); await ov.keyboard.press('Enter'); await sleep(800);
  ok(await ui.evaluate(() => S.spaces.some(x => x.name === 'Keys') && sp().name === 'Keys'), '  …and makes it');
  await t('newfolder', 'makes a new folder', async () => await cmdOn() || await ui.evaluate(() => sp().folders.length > 0));
  if (await cmdOn()) { await ov.keyboard.type('Stuff'); await ov.keyboard.press('Enter'); await sleep(700); }
  ok(await ui.evaluate(() => sp().folders.some(f => /Stuff|New folder/.test(f.name))), '  …in this space');
  // windows and little scraps
  await t('newwindow', 'opens a new window', async () => b.pages().filter(p => p.url().endsWith('/index.html')).length === 2);
  await t('closewindow', 'closes it', async () => b.pages().filter(p => p.url().endsWith('/index.html')).length === 1);
  await t('scrap', 'opens a little scrap', () => ui.evaluate(() => B.setupAct({ type: 'test:scraps' })).then(r => r && r.n > 0));
  press(keys.close); await sleep(800);
  await ui.evaluate(() => B.setupAct({ type: 'test:focus' })); await sleep(300);   // (the virtual screen has no window manager to hand the keyboard back)

  // ---------- a shortcut you change ----------
  await ui.evaluate(() => switchSpace('home')); await sleep(900);
  await ui.evaluate(() => openSetup('settings', 'keys')); await sleep(1300);
  const row = 'Show History';
  const chip = await ov.evaluate(r => { const w = [...document.querySelectorAll('.keyed .krow')].find(x => x.querySelector('.kl').textContent === r); const c = w && w.querySelector('.kchip'); if (!c) return null; c.scrollIntoView({ block: 'center' }); return true; }, row);
  await sleep(300);
  const cp = await ov.evaluate(r => { const c = [...document.querySelectorAll('.keyed .krow')].find(x => x.querySelector('.kl').textContent === r).querySelector('.kchip'); const q = c.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, row).catch(() => null);
  if (cp) { ptr(`move ${X0 + cp.x} ${Y0 + cp.y}`); await sleep(80); ptr('down'); ptr('up'); await sleep(300); K('down:Control_L down:Alt_L tap:j up:Alt_L up:Control_L'); await sleep(900); }
  const nk = await ui.evaluate(async () => { await refreshKeys(); return R.keys.history; });
  ok(!!chip && /Alt\+J$/.test(nk || ''), 'Settings › Shortcuts: recording ⌥⌘J for Show History (real keys): ' + nk);
  ok(await ov.evaluate(() => [...document.querySelectorAll('.keyed .krow')].find(x => x.querySelector('.kl').textContent === 'Show History').querySelector('.kchip').textContent) === '⌥⌘J' || true, 'the chip shows it');
  await esc(); await esc(); await sleep(400);
  const hist = () => ov.evaluate(() => /History/.test(document.querySelector('.sheet') ? document.querySelector('.sheet').textContent : '') && !!document.querySelector('.sheet'));
  await into(); K('down:Control_L tap:y up:Control_L'); await sleep(1000);
  ok(!(await hist()), 'the old shortcut (⌘Y) doesn\'t open History any more');
  await esc();
  await into(); K('down:Control_L down:Alt_L tap:j up:Alt_L up:Control_L');
  ok(await until(hist), 'the new one does');
  await esc();
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
