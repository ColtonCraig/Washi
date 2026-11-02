'use strict';
/* Tidy up (like Dia): with 10+ loose tabs the sidebar offers "Tidy up"; a real click puts tabs from the same site into
   a folder (docs. and drive.google.com together, nicely named) and sends ones you haven't opened today to the Archive;
   Undo puts everything back. Clear closes the loose tabs and keeps pins and folders, with Undo. Mute this site mutes
   every tab on it, now and later. Light, dark and Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57, TOP = 38;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, sb, ov } = b; await skipSetup(b);
  const OLD = Date.now() - 2 * 86400000;
  const seed = () => ui.evaluate(old => {
    const s = sp(), add = (url, title, seen) => { const id = 't' + Math.random().toString(36).slice(2, 9); S.tabs[id] = { url, title, seen }; s.tabs.push(id); return id; };
    for (const n of [1, 2, 3, 4]) add('https://github.com/acme/widgets/pull/' + n, 'PR ' + n, Date.now());
    add('https://docs.google.com/document/d/1', 'Plan doc', Date.now()); add('https://drive.google.com/drive/my-drive', 'Drive', Date.now()); add('https://docs.google.com/spreadsheets/d/2', 'Budget', Date.now());
    add('https://news.example.org/a', 'Old news', old); add('https://recipes.example.net/b', 'Old recipe', old); add('https://weather.example.com/c', 'Old weather', old);
    add('https://slack.com/app', 'Slack', Date.now()); add('https://zoom.us/j/1', 'Zoom', Date.now());
    render(); save();
  }, OLD);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  await seed(); await sleep(800);
  const chip = () => sb.evaluate(() => { const e = document.getElementById('tidy'), r = e.getBoundingClientRect(); return { shown: !e.hidden && r.width > 0, n: document.getElementById('tidyN').textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  let c = await chip();
  ok(c.shown && /13 tabs/.test(c.n), `with 10+ loose tabs the sidebar offers "Tidy up" (${c.n})`);
  await audit(sb, 'sidebar with Tidy up'); shot('tidy-chip');
  const before = await ui.evaluate(() => ({ tabs: sp().tabs.slice(), folders: sp().folders.length, archive: S.archive.length }));

  // ---------- tidy, with a real click ----------
  ptr(`move ${X0 + c.x} ${Y0 + TOP + c.y}`); await sleep(120); ptr('down'); ptr('up'); await sleep(900);
  const after = await ui.evaluate(() => ({ folders: sp().folders.map(f => [f.name, f.tabs.length, f.open]), loose: sp().tabs.filter(k => !k.startsWith('f:')).map(k => S.tabs[k].title), archive: S.archive.slice(0, 3).map(a => a.title) }));
  ok(after.folders.some(f => f[0] === 'GitHub' && f[1] === 4) && after.folders.some(f => f[0] === 'Google' && f[1] === 3), 'tabs from the same site go into one folder each, nicely named (GitHub; Google has Docs and Drive): ' + JSON.stringify(after.folders));
  ok(after.folders.every(f => f[2] === false), 'the new folders are folded up');
  ok(['Old news', 'Old recipe', 'Old weather'].every(t => after.archive.includes(t)) && !after.loose.some(t => /^Old/.test(t)), 'tabs you hadn\'t opened today go to the Archive');
  ok(after.loose.includes('Slack') && after.loose.includes('Zoom') && after.loose.includes('Test page 1'), 'everything else stays where it was (and the page you\'re on stays open)');
  const toast = await ov.evaluate(() => ({ on: document.getElementById('toast').classList.contains('on'), t: document.getElementById('toastTxt').textContent, btn: document.getElementById('toastBtn').textContent }));
  ok(toast.on && /Tidied/.test(toast.t) && toast.btn === 'Undo', 'a toast says what it did, with Undo: ' + toast.t);
  ok(!(await chip()).shown, 'and the chip goes away once it\'s tidy');
  await audit(sb, 'tidied sidebar'); shot('tidy-after');

  // ---------- Undo ----------
  await ui.evaluate(() => B.toastAct ? 0 : 0);
  await ov.evaluate(() => document.getElementById('toastBtn').click()); await sleep(800);
  const back = await ui.evaluate(() => ({ tabs: sp().tabs.slice(), folders: sp().folders.length, archive: S.archive.length }));
  ok(JSON.stringify(back) === JSON.stringify(before), 'Undo puts every tab back exactly as it was');

  // ---------- Mute this site ----------
  await ui.evaluate(() => openTab('http://localhost:8765/p3.html')); await sleep(1500);
  const p1 = await ui.evaluate(() => focusedId());
  await ui.evaluate(id => { R.menuTab = id; menuClick('mutesite'); }, p1); await sleep(700);
  ok(await ui.evaluate(id => R.muted[id] === true && S.prefs.muteSites.includes('localhost:8765'), p1), 'Mute this site mutes its tab: ' + JSON.stringify(await ui.evaluate(id => [R.muted[id], R.live[id], S.prefs.muteSites], p1)));
  await ui.evaluate(() => openTab('http://localhost:8765/p2.html')); await sleep(1600);
  const p2 = await ui.evaluate(() => focusedId());
  ok(await ui.evaluate(id => R.muted[id] === true, p2), 'and a new tab on the same site starts muted: ' + JSON.stringify(await ui.evaluate(id => [R.muted[id], R.live[id]], p2)));
  await ui.evaluate(id => { R.menuTab = id; menuClick('mutesite'); }, p2); await sleep(700);
  ok(await ui.evaluate(ids => ids.every(id => !R.muted[id]) && !S.prefs.muteSites.includes('localhost:8765'), [p1, p2]), 'Unmute gives every tab on it its sound back');

  // ---------- Clear ----------
  await ui.evaluate(() => { sp().pins = sp().pins || []; const id = sp().tabs.find(k => S.tabs[k] && S.tabs[k].title === 'Slack'); pinToggle(id); const s = sp(), keep = s.tabs.find(k => S.tabs[k] && S.tabs[k].title === 'Zoom'); s.folders.push({ id: 'fK', name: 'Keep', open: true, tabs: [keep] }); s.tabs = s.tabs.filter(k => k !== keep); s.tabs.push('f:fK'); render(); save(); }); await sleep(800);
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).catch(() => {}); await sleep(300);
  const keepF = await ui.evaluate(() => sp().folders.length), pins = await ui.evaluate(() => S.pins.length);
  await ui.evaluate(() => { R.menuSpace = S.cur; menuClick('sp:clear'); }); await sleep(900);
  const cl = await ui.evaluate(() => ({ loose: sp().tabs.filter(k => !k.startsWith('f:')).length, folders: sp().folders.length, pins: S.pins.length }));
  ok(cl.loose === 0 && cl.folders === keepF && keepF >= 1 && cl.pins === pins && pins >= 1, `Clear closes the loose tabs and keeps pins and folders (${JSON.stringify(cl)})`);
  const ct = await ov.evaluate(() => document.getElementById('toastTxt').textContent);
  ok(/Cleared 1[0-9] tabs/.test(ct), 'and says how many, with Undo: ' + ct);
  await ov.evaluate(() => document.getElementById('toastBtn').click()); await sleep(800);
  ok((await ui.evaluate(() => sp().tabs.filter(k => !k.startsWith('f:')).length)) >= 11, 'Undo brings them back');

  // ---------- every look ----------
  await seed(); await sleep(600);
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(p => B.setupMsg({ type: 'prefs', patch: p }), p); await sleep(600);
    ok((await chip()).shown, `${nm}: Tidy up is offered`); await audit(sb, `sidebar with Tidy up, ${nm}`); shot('tidy-' + nm.replace(/ /g, '-'));
  }
  for (const w of [200, 380]) { await sb.evaluate(w => B.intent({ type: 'sbw', w, done: true }), w); await sleep(700); await audit(sb, `Tidy up at a ${w}px sidebar`); }
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
