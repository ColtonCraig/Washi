'use strict';
/* Scrapbook (Settings › Look): off by default (the clean look); turning it on with a real click puts tape on what's
   stuck down in every view: the tab you're on, pins, the address label, the command bar, toasts, Today's cards, and
   the second strip on Settings. Nothing gets cut off, light or dark. Off again takes it all away; it's remembered. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const tape = (p, sel, pseudo) => p.evaluate(([s, ps]) => { const e = document.querySelector(s); if (!e) return 'missing ' + s; const c = getComputedStyle(e, ps || null); return ps ? (c.content !== 'none' && c.display !== 'none' && parseFloat(c.width) > 8) : (c.display !== 'none' && e.getBoundingClientRect().width > 8); }, [sel, pseudo]);
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  let b = await start(); let { ui, sb, ov } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1500);
  await ui.evaluate(() => { const id = Object.keys(S.tabs).find(k => S.tabs[k].url.includes('p2')); pinToggle(id); }); await sleep(800);
  ok(await ui.evaluate(() => !document.documentElement.classList.contains('scrapbook')) && (await tape(sb, '.tab.on', '::before')) === false, 'off by default: the clean look, no tape on tabs');

  // ---------- turn it on in Settings with a real click ----------
  await ui.evaluate(() => openSetup('settings', 'look')); await sleep(1400);
  const sw = await ov.evaluate(() => { const t = [...document.querySelectorAll('.tgl')].find(x => /Scrapbook/.test(x.textContent)); if (!t) return null; t.scrollIntoView({ block: 'center' }); const s = t.querySelector('.sw'), r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, sub: t.querySelector('small').textContent }; });
  ok(!!sw && /tape/.test(sw.sub), 'Settings › Look has a Scrapbook switch that says what it does: ' + (sw && sw.sub));
  await sleep(300);
  const sw2 = await ov.evaluate(() => { const s = [...document.querySelectorAll('.tgl')].find(x => /Scrapbook/.test(x.textContent)).querySelector('.sw'), r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + sw2.x} ${Y0 + sw2.y}`); await sleep(120); ptr('down'); ptr('up'); await sleep(900);
  ok(await ui.evaluate(() => S.prefs.wobble === true), 'clicking it turns Scrapbook on');
  ok(await ov.evaluate(() => document.documentElement.classList.contains('scrapbook')), 'Settings itself goes scrapbook');
  ok(await tape(ov, '.setup .tp.r'), 'the Settings card gets its second strip of tape');
  await audit(ov, 'Settings in scrapbook'); shot('sb-settings');
  await ov.evaluate(() => SETUP.finish()); await sleep(900);

  // ---------- every view ----------
  ok(await ui.evaluate(() => document.documentElement.classList.contains('scrapbook')) && await sb.evaluate(() => document.documentElement.classList.contains('scrapbook')), 'the window and the sidebar go scrapbook too');
  ok(await tape(sb, '.tab.on', '::before'), 'the tab you\'re on is taped down');
  ok(await tape(sb, '.pin', '::after'), 'pins are taped down');
  ok(await tape(ui, '#url', '::before'), 'the address label has a strip of tape');
  await audit(ui, 'window in scrapbook'); await audit(sb, 'sidebar in scrapbook');
  // the tape on the first tab isn't cut off by the list it's in
  ok(await sb.evaluate(() => { const t = document.querySelector('.tabs>.tab.on, .tabs .tab.on'), L = document.querySelector('.tabs').getBoundingClientRect(), r = t.getBoundingClientRect(), c = getComputedStyle(t, '::before'); const w = parseFloat(c.width), h = parseFloat(c.height), ang = 20 * Math.PI / 180, half = (w * Math.sin(ang) + h * Math.cos(ang)) / 2; return r.top + parseFloat(c.top) + h / 2 - half >= L.top; }), 'the active tab\'s tape isn\'t clipped by the tab list');
  shot('sb-window');
  await ui.evaluate(() => openCmd('new')); await sleep(700);
  ok(await tape(ov, '.box .tp'), 'the command bar is taped up');
  await audit(ov, 'command bar in scrapbook'); shot('sb-cmd');
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await sleep(500);
  await ui.evaluate(() => B.fx({ type: 'toast', text: 'Taped up a test toast' })); await sleep(500);
  ok(await tape(ov, '.toast .tp'), 'toasts are taped up');
  await audit(ov, 'toast in scrapbook'); shot('sb-toast');
  await sleep(4000);
  await ui.evaluate(() => showToday()); await sleep(1200);
  ok(await tape(ui, '.tcard', '::before'), 'Today\'s cards are taped down');
  await audit(ui, 'Today in scrapbook'); shot('sb-today');

  // ---------- dark ----------
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'dark' } })); await sleep(800);
  await ui.evaluate(() => { const id = Object.keys(S.tabs).find(k => S.tabs[k].url.includes('p1')); selectTab(id); }); await sleep(900);
  ok(await sb.evaluate(() => document.documentElement.classList.contains('dark')) && await tape(sb, '.tab.on', '::before'), 'dark: still taped');
  await audit(sb, 'sidebar in dark scrapbook'); await audit(ui, 'window in dark scrapbook'); shot('sb-dark');

  // ---------- remembered, and off again ----------
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, sb, ov } = b); await sleep(2500);
  ok(await sb.evaluate(() => document.documentElement.classList.contains('scrapbook')), 'still scrapbook after a restart');
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(800);
  ok(await sb.evaluate(() => !document.documentElement.classList.contains('scrapbook')) && (await tape(sb, '.tab.on', '::before')) === false && (await tape(ui, '#url', '::before')) === false, 'turning it off takes the tape away');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
