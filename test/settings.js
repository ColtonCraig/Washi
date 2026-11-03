'use strict';
/* Settings, every section in every look (nothing cut off, the rail follows along to the very bottom), and the choices in
   Settings › Features doing what they say, each set with a real click: Focus mode's top bar and sidebar staying away,
   Reader's font and size, Now playing, swiping between spaces, snapshots also saved, the star's bookmarks bar, the Tidy
   offer; "What's new after an update" off. */
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  let b = await start(); let { ui, ov, sb } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1800);
  const click = async (x, y) => { ptr(`move ${X0 + x} ${Y0 + y}`); await sleep(80); ptr('down'); ptr('up'); await sleep(350); };
  /* a choice in Settings by its field heading and button label, clicked for real */
  const choose = async (field, label) => {
    const r = await ov.evaluate(([f, l]) => { const fl = [...document.querySelectorAll('.sheet.set .fld')].find(x => x.querySelector('h4') && x.querySelector('h4').textContent.startsWith(f)); if (!fl) return null;
      const el = [...fl.querySelectorAll('.sg, .tgl')].find(x => (x.querySelector('b') || x).textContent.trim() === l); if (!el) return null; const t = el.classList.contains('tgl') ? el.querySelector('.sw') : el; t.scrollIntoView({ block: 'center' }); return true; }, [field, label]);
    if (!r) return false; await sleep(350);
    const p = await ov.evaluate(([f, l]) => { const fl = [...document.querySelectorAll('.sheet.set .fld')].find(x => x.querySelector('h4').textContent.startsWith(f)); const el = [...fl.querySelectorAll('.sg, .tgl')].find(x => (x.querySelector('b') || x).textContent.trim() === l); const t = el.classList.contains('tgl') ? el.querySelector('.sw') : el; const q = t.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, [field, label]);
    const o = await ui.evaluate(() => { const r = document.querySelector('.stage') ? null : null; return { x: 0, y: 0 }; });
    await click(p.x + o.x, p.y + o.y); return true;
  };
  const pref = k => ui.evaluate(k => S.prefs[k], k);
  const openSet = async sec => { await ui.evaluate(s => openSetup('settings', s), sec); await sleep(1200); };
  const closeSet = async () => { await ov.evaluate(() => document.querySelector('.sheet.set .xx').click()); await sleep(600); };

  // ---------- every section, every look ----------
  await openSet();
  const secs = await ov.evaluate(() => [...document.querySelectorAll('.sheet.set .sec')].map(s => s.id));
  ok(secs.includes('sec-toolbar') && secs.includes('sec-features'), 'Settings has Top bar and Features: ' + secs.map(s => s.slice(4)).join(' '));
  for (const [nm, p] of [['light', {}], ['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    if (Object.keys(p).length) { await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(400); }
    let bad = [];
    for (const id of secs) { await ov.evaluate(i => document.getElementById(i).scrollIntoView(), id); await sleep(120); const a = await ov.evaluate(AUDIT); if (a.length) bad.push(id + ': ' + a.slice(0, 2).join(' / ')); if (nm === 'light' || nm === 'dark Scrapbook') shot(`set-${nm.replace(/ /g, '-')}-${id.slice(4)}`); }
    ok(!bad.length, `${nm}: every section of Settings, nothing cut off` + (bad.length ? '\n      ' + bad.slice(0, 6).join('\n      ') : ''));
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  await ov.evaluate(() => { const s = document.querySelector('.sheet.set .scroll'); s.scrollTop = s.scrollHeight; }); await sleep(500);
  ok(await ov.evaluate(() => document.querySelector('.sheet.set .rail .on').dataset.s) === 'help', 'scrolled to the very bottom, the rail marks Help (the last section)');
  // a narrow window
  ptr('resize 900 640'); await sleep(900);
  await openSet('features'); await audit(ov, 'Settings › Features in a small window'); shot('set-small-features');
  ptr('resize 1320 840'); await sleep(900);
  await openSet('features'); await audit(ov, 'Settings › Features'); shot('set-features');

  // ---------- Focus mode: the top bar stays away ----------
  ok(await choose('Focus mode', 'Top bar stays away') && await pref('focusBar') === 'off', 'Focus mode › "Top bar stays away" (real click)');
  ok(await choose('Focus mode', 'Sidebar stays away') && await pref('focusSide') === 'off', 'Focus mode › "Sidebar stays away"');
  await closeSet();
  await ui.evaluate(() => focusMode(true)); await sleep(900);
  ptr(`move ${X0 + 600} ${Y0 + 2}`); await sleep(900);
  ok(!(await ui.evaluate(() => document.body.classList.contains('peek'))), 'in Focus mode, pointing at the top no longer brings the bar');
  ptr(`move ${X0 + 2} ${Y0 + 400}`); await sleep(900);
  ok(!(await sb.evaluate(() => document.body.classList.contains('open'))), 'and the left edge no longer slides the sidebar in');
  ptr(`move ${X0 + 600} ${Y0 + 400}`); await sleep(300);
  await ui.evaluate(() => focusMode(false)); await sleep(700);
  await openSet('features');
  await choose('Focus mode', 'Top bar peeks in'); await choose('Focus mode', 'Sidebar slides in'); await closeSet();
  await ui.evaluate(() => focusMode(true)); await sleep(900);
  ptr(`move ${X0 + 600} ${Y0 + 2}`); let pk = false; for (let i = 0; i < 30 && !pk; i++) { pk = await ui.evaluate(() => document.body.classList.contains('peek')); if (!pk) await sleep(60); }
  ok(pk, 'switched back: the top edge brings the bar again');
  ptr(`move ${X0 + 600} ${Y0 + 400}`); await sleep(700); await ui.evaluate(() => focusMode(false)); await sleep(700);

  // ---------- Reader ----------
  await openSet('features');
  ok(await choose('Reader', 'Sans') && (await pref('reader')).face === 'sans', 'Reader › Sans');
  ok(await choose('Reader', 'Large') && (await pref('reader')).size === 22, 'Reader › Large (22px)');
  await closeSet();
  await ui.evaluate(() => navigate('http://localhost:8765/article.html')); await sleep(2000);
  await ui.evaluate(() => readerToggle(true)); await sleep(1200);
  const art = b.pages().find(p => p.url().includes('/article.html'));
  const sh = await art.evaluate(() => { const h = document.querySelector('washi-reader'); if (!h) return null; const cs = getComputedStyle(h.shadowRoot.querySelector('.sheet')); return { size: cs.fontSize, font: cs.fontFamily }; });
  ok(sh && sh.size === '22px' && !/Georgia|New York/.test(sh.font), `an article opens in Reader in Sans at 22px (${sh && sh.size})`);
  await ui.evaluate(() => readerToggle(false)); await sleep(500);
  await ui.evaluate(() => navigate('http://localhost:8765/p1.html')); await sleep(1200);

  // ---------- Now playing ----------
  await ui.evaluate(() => openTab('http://localhost:8765/music.html')); await sleep(1800);
  const music = b.pages().find(p => p.url().includes('/music.html'));
  await music.evaluate(() => document.getElementById('a').play()); await sleep(800);
  await ui.evaluate(() => { const id = Object.keys(S.tabs).find(k => /p1\.html/.test(S.tabs[k].url)); selectTab(id); }); await sleep(1500);
  const np = () => sb.evaluate(() => { const e = document.getElementById('np'); return !e.hidden && getComputedStyle(e).display !== 'none'; });
  ok(await np(), 'music in another tab: the Now playing ticket shows');
  await openSet('features');
  ok(await choose('Now playing', 'Show what\'s playing in the sidebar') && await pref('nowPlaying') === false, 'Now playing › switched off');
  await closeSet(); await sleep(500);
  ok(!(await np()), 'and the ticket goes');
  await music.evaluate(() => document.getElementById('a').pause());

  // ---------- swiping between spaces ----------
  await openSet('features'); await choose('Spaces', 'Swipe between spaces'); await closeSet();
  ok(await pref('swipe') === false, 'Spaces › Swipe between spaces switched off');
  const cur0 = await ui.evaluate(() => S.cur);
  ptr(`move ${X0 + 140} ${Y0 + 400}`); await sleep(200); ptr('hscroll 14'); await sleep(900);
  ok(await ui.evaluate(() => S.cur) === cur0, 'swiping on the sidebar no longer changes the space');

  // ---------- the star's bookmarks bar ----------
  await ui.evaluate(() => { S.bookmarks.push({ type: 'bm', id: 'sbm1', title: 'Page two', url: 'http://localhost:8765/p2.html' }); bmChanged(); }); await sleep(300);
  await openSet('features'); await choose('Bookmarks', 'Rest on the star for the bookmarks bar'); await closeSet();
  const st = await ui.evaluate(() => { const r = document.getElementById('bStar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + st.x} ${Y0 + st.y}`); await sleep(1100);
  ok(!(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on'))) && await pref('starBar') === false, 'resting on the star no longer brings out the bar (switched off)');
  ptr(`move ${X0 + 600} ${Y0 + 400}`); await sleep(400);

  // ---------- the Tidy offer ----------
  await ui.evaluate(() => { for (let i = 0; i < 11; i++) openTab('http://localhost:8765/p3.html?n=' + i, { bg: true }); }); await sleep(1500);
  ok(await sb.evaluate(() => !document.getElementById('tidy').hidden), 'with lots of loose tabs, Tidy is offered');
  await openSet('features'); await choose('Tidying', 'Offer to tidy up a busy sidebar'); await closeSet(); await sleep(500);
  ok(await sb.evaluate(() => document.getElementById('tidy').hidden), 'switched off: no Tidy button');

  // ---------- snapshots also saved ----------
  await openSet('features'); ok(await choose('Snapshot', 'Copy and save') && await pref('snapSave') === 'save', 'Snapshot › Copy and save'); await closeSet();
  const dl = fs.existsSync(path.join(os.homedir(), 'Downloads')) ? path.join(os.homedir(), 'Downloads') : os.homedir(), before = fs.existsSync(dl) ? fs.readdirSync(dl).filter(f => /^Washi Snapshot/.test(f)).length : 0;
  await ui.evaluate(() => { const id = Object.keys(S.tabs).find(k => /p1\.html/.test(S.tabs[k].url)); selectTab(id); }); await sleep(800);
  await ui.evaluate(() => snapshot()); await sleep(1200); await ov.keyboard.press('Enter'); await sleep(3200);
  const after = fs.existsSync(dl) ? fs.readdirSync(dl).filter(f => /^Washi Snapshot/.test(f)).length : 0;
  ok(after === before + 1, `a snapshot is copied and saved to Downloads straight away (${before} → ${after})`);

  // ---------- What's new after updates: off ----------
  await openSet('help'); await choose('After an update', 'Show what\'s new'); await closeSet();
  ok(await pref('showNews') === false, 'Help › Show what\'s new after an update, switched off');
  const profile = b.profile; await b.stop();
  const shp = path.join(profile, 'shared.json'), shj = JSON.parse(fs.readFileSync(shp, 'utf8')); shj.prefs.seenVer = '0.15.1'; fs.writeFileSync(shp, JSON.stringify(shj));
  b = await start({ profile, fresh: false }); ({ ui, ov, sb } = b); await sleep(3500);
  ok(!(await ov.evaluate(() => !!document.querySelector('#setup.on .sheet.nw'))), 'after an "update", What\'s new stays closed');
  ok(await ui.evaluate(() => S.prefs.focusBar === 'peek' && S.prefs.swipe === false && S.prefs.reader.size === 22), 'every choice is still set after a restart');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
