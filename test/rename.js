'use strict';
/* Rename a tab or pin (like Arc): double-click its name in the sidebar (real pointer) or Rename… in its menu; the name
   you give wins over the page's title everywhere (sidebar, command bar), survives navigation and restarts, and "Use the
   Page's Title" undoes it. ⌘Q twice to quit: the first press only shows a note. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57, TOP = 38;
(async () => {
  let b = await start(); let { ui, sb, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1600);
  const id = await ui.evaluate(() => focusedId());
  const r = await sb.evaluate(i => { const e = document.querySelector(`.tab[data-id="${i}"] .ttl`).getBoundingClientRect(); return { x: e.x + 20, y: e.y + e.height / 2 }; }, id);
  ptr(`move ${X0 + r.x} ${Y0 + TOP + r.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(60); ptr('down'); ptr('up'); await sleep(900);
  const pr = await ov.evaluate(() => { const c = document.getElementById('cmd'); return { on: c.classList.contains('on'), v: (document.querySelector('#cmd input') || {}).value }; });
  ok(pr.on && pr.v === 'Test page 1', 'double-clicking a tab\'s name asks for a new one (filled in with the current)');
  await ov.evaluate(() => { const i = document.querySelector('#cmd input'); i.select(); }); K('tap:BackSpace'); 
  for (const ch of 'Q4 plan') K(ch === ' ' ? 'tap:space' : /[A-Z]/.test(ch) ? `down:Shift_L tap:${ch.toLowerCase()} up:Shift_L` : 'tap:' + ch);
  K('tap:Return'); await sleep(800);
  ok(await sb.evaluate(i => document.querySelector(`.tab[data-id="${i}"] .ttl`).textContent, id) === 'Q4 plan', 'the sidebar shows the name you gave it');
  await ui.evaluate(() => navigate('http://localhost:8765/p2.html')); await sleep(1500);
  ok(await sb.evaluate(i => document.querySelector(`.tab[data-id="${i}"] .ttl`).textContent, id) === 'Q4 plan', 'and keeps it when the page changes');
  await ui.evaluate(() => openCmd('new')); await sleep(600);
  ok(await ov.evaluate(() => [...document.querySelectorAll('#cmd .r .lb')].some(e => e.textContent === 'Q4 plan')), 'the command bar finds it by its name');
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await sleep(400);
  await ui.evaluate(i => { pinToggle(i); }, id); await sleep(600);
  ok(await sb.evaluate(i => (document.querySelector(`.pin[data-id="${i}"]`) || {}).title || '', id).then(t => /Q4 plan/.test(t)), 'pinned, it keeps its name');
  await audit(sb, 'sidebar with a renamed tab');
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, sb, ov } = b); await sleep(2500);
  ok(await ui.evaluate(i => S.tabs[i] && S.tabs[i].name === 'Q4 plan', id), 'still named after a restart');
  await ui.evaluate(i => { R.menuTab = i; menuClick('unname'); }, id); await sleep(500);
  ok(await ui.evaluate(i => !S.tabs[i].name, id), '"Use the Page\'s Title" goes back to the page\'s own title');
  // ⌘Q twice (click the page first so the window has the keyboard)
  await ui.evaluate(() => openTab('http://localhost:8765/p3.html')); await sleep(1500);
  { const L = await ui.evaluate(() => layout().a); ptr(`move ${X0 + L.x + 300} ${Y0 + L.y + 400}`); ptr('down'); ptr('up'); await sleep(400); }
  K('down:Control_L tap:q up:Control_L'); await sleep(500);
  ok(await ov.evaluate(() => document.getElementById('toast').classList.contains('on') && /again to quit/.test(document.getElementById('toastTxt').textContent)) && await ui.evaluate(() => true).catch(() => false), 'the first ⌘Q only says "press again to quit" (Washi stays open)');
  await sleep(2200);
  K('down:Control_L tap:q up:Control_L'); await sleep(1200);
  ok(await ui.evaluate(() => true).then(() => true, () => false), 'a single press later still doesn\'t quit');
  K('down:Control_L tap:q up:Control_L'); await sleep(250); K('down:Control_L tap:q up:Control_L'); await sleep(2500);
  ok(await ui.evaluate(() => true).then(() => false, () => true), 'pressing it twice quits');
  try { await b.stop(); } catch {}
  done();
})().catch(e => { console.error(e); process.exit(1); });
function audit(p, what) { return p.evaluate(AUDIT).then(a => ok(!a.length, what + ': nothing cut off' + (a.length ? ' ' + a.slice(0, 4).join(' | ') : ''))); }
