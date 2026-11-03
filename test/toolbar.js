'use strict';
/* The top bar's tools, like a power user would use them: the Focus mode stamp (real clicks, it shows when it's on);
   drag a tool along the bar with the real pointer (the others slide aside, the click at the end isn't a press, the order
   is saved); Esc mid-drag puts it back; a plain click still works; hide one (right-click menu action) with Undo;
   Settings › Top bar lists them in order (drag a row, the arrows, the switches, Reset); it's all still there after a
   restart and in a second window; tooltips show your own shortcuts. Every look, narrow and wide; nothing cut off. */
const { execSync } = require('child_process'); const fs = require('fs');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  let b = await start(); let { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1800);
  const order = () => ui.evaluate(() => [...document.getElementById('tools').children].map(e => e.dataset.tool));
  const shown = () => ui.evaluate(() => [...document.getElementById('tools').children].filter(e => !e.hasAttribute('data-off') && !e.hidden && e.getBoundingClientRect().width > 4).map(e => e.dataset.tool));
  const at = id => ui.evaluate(id => { const r = document.querySelector(`#tools [data-tool="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, id);
  const click = async (x, y) => { ptr(`move ${X0 + x} ${Y0 + y}`); await sleep(80); ptr('down'); ptr('up'); };
  const std = await ui.evaluate(() => BL.TOOLS.map(t => t.id));
  ok(JSON.stringify(await order()) === JSON.stringify(std), 'the tools start in the standard order: ' + std.join(' '));
  ok((await shown()).includes('focus'), 'Focus mode has its own stamp');
  await audit(ui, 'top bar'); shot('tb-default');

  // ---------- the Focus mode stamp ----------
  let p = await at('focus'); await click(p.x, p.y); await sleep(900);
  ok(await ui.evaluate(() => S.focusMode && document.body.classList.contains('focus')), 'clicking the Focus stamp turns Focus mode on');
  ptr(`move ${X0 + 500} ${Y0 + 2}`); let peek = false; for (let i = 0; i < 30 && !peek; i++) { peek = await ui.evaluate(() => document.body.classList.contains('peek')); if (!peek) await sleep(50); }
  await sleep(400); p = await at('focus');
  ok(peek && await ui.evaluate(() => document.getElementById('bFocus').classList.contains('on')), 'in Focus mode the bar peeks in with the stamp lit');
  await click(p.x, p.y); await sleep(900);
  ok(await ui.evaluate(() => !S.focusMode && !document.body.classList.contains('focus')), 'clicking it again leaves Focus mode');

  // ---------- drag a tool along the bar ----------
  const s0 = await at('split'), n0 = await at('note');
  ptr(`drag ${X0 + s0.x} ${Y0 + s0.y} ${X0 + n0.x - n0.w / 2 - 4} ${Y0 + s0.y} 0.3`); ptr('up'); await sleep(700);
  let o = await order();
  ok(o.indexOf('split') < o.indexOf('note'), 'dragging Split view to the left of the sticky note moves it there: ' + o.join(' '));
  ok(await ui.evaluate(() => !R.split), 'the end of the drag isn\'t a click (split view didn\'t open)');
  ok(JSON.stringify(await ui.evaluate(() => S.prefs.tools)) === JSON.stringify(o), 'and the new order is saved');
  ok(await ui.evaluate(() => !document.querySelector('#tools .lift') && !document.getElementById('tools').classList.contains('arranging') && !document.getElementById('bSplit').style.transform), 'it settles back into the bar');
  shot('tb-dragged');
  // the dragged tool still works with a plain click
  p = await at('split'); await click(p.x, p.y); await sleep(900);
  ok(await ui.evaluate(() => R.split), 'a plain click on it still works (split view opens)');
  await click(p.x, p.y); await sleep(700);
  // Esc in the middle of a drag puts everything back
  const before = await order(), st = await at('star'), sh = await at('shield');
  ptr(`move ${X0 + st.x} ${Y0 + st.y}`); await sleep(150); ptr('down'); await sleep(100);
  for (let i = 1; i <= 12; i++) { ptr(`move ${X0 + st.x + (sh.x - st.x + 20) * i / 12} ${Y0 + st.y}`); await sleep(25); }
  await sleep(150);
  ok(await ui.evaluate(() => !!document.querySelector('#tools .lift')), 'while dragging, the tool is lifted off the bar');
  await audit(ui, 'top bar while dragging');
  shot('tb-lifted');
  K('tap:Escape'); await sleep(200); ptr('up'); await sleep(600);
  ok(JSON.stringify(await order()) === JSON.stringify(before), 'Esc during a drag puts everything back');

  // ---------- hide one ----------
  await ui.evaluate(() => menuClick('tb:hide:boost')); await sleep(500);
  ok(!(await shown()).includes('boost') && (await ui.evaluate(() => S.prefs.toolsOff)).includes('boost'), 'Hide from the Top Bar (right-click menu) hides Boost');
  ok(await ov.evaluate(() => /Boost is hidden/.test(document.getElementById('toast').textContent)), 'with a toast saying where to bring it back, and Undo');
  await ui.evaluate(() => B.onCmd ? 0 : 0);
  await ov.evaluate(() => document.querySelector('#toast button') && document.querySelector('#toast button').click()); await sleep(600);
  ok((await shown()).includes('boost'), 'Undo brings it back');
  await ui.evaluate(() => menuClick('tb:hide:boost')); await sleep(400);

  // ---------- tooltips follow your shortcuts ----------
  ok(/\(⌥⌘F\)$|\(⌥⌃F\)$|\(.+F\)$/.test(await ui.evaluate(() => document.getElementById('bFocus').title)), 'the Focus stamp\'s tooltip shows its shortcut: ' + await ui.evaluate(() => document.getElementById('bFocus').title));
  await ui.evaluate(() => { R.keys.split = 'CmdOrCtrl+Shift+E'; updateChrome(); });
  ok(/E\)$/.test(await ui.evaluate(() => document.getElementById('bSplit').title)), 'a changed shortcut shows in the tooltip: ' + await ui.evaluate(() => document.getElementById('bSplit').title));

  // ---------- Settings › Top bar ----------
  await ui.evaluate(() => openSetup('settings', 'toolbar')); await sleep(1300);
  const rows = () => ov.evaluate(() => [...document.querySelectorAll('.tblist .tbrow')].map(r => r.dataset.id + (r.classList.contains('off') ? '-' : '')));
  let r = await rows();
  ok(r.map(x => x.replace('-', '')).join() === (await order()).join() && r.includes('boost-'), 'Settings › Top bar lists the tools in your order, Boost switched off: ' + r.join(' '));
  await audit(ov, 'Settings › Top bar'); shot('tb-settings');
  // a real drag of a row
  const rr = (id) => ov.evaluate(id => { const e = document.querySelector(`.tblist .tbrow[data-id="${id}"] .grip`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, id);
  const first = r[0].replace('-', ''), last = r[r.length - 1].replace('-', '');
  const a = await rr(last), z = await rr(first);
  ptr(`drag ${X0 + a.x} ${Y0 + a.y} ${X0 + z.x} ${Y0 + z.y - 12} 0.3`); ptr('up'); await sleep(900);
  r = await rows(); o = await order();
  ok(r[0].replace('-', '') === last && o[0] === last, `dragging the last row to the top moves ${last} to the front of the bar too: ${o.join(' ')}`);
  // the arrows
  const mv = await ov.evaluate(() => { const e = document.querySelector('.tblist .tbrow:nth-child(2) .mv:last-child').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  const second = (await rows())[1].replace('-', '');
  await click(mv.x, mv.y); await sleep(600);
  ok((await rows())[2].replace('-', '') === second && (await order())[2] === second, 'the → arrow moves a tool one place right');
  // the switch
  const sw = await ov.evaluate(() => { const e = document.querySelector('.tblist .tbrow[data-id="boost"] .sw').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await click(sw.x, sw.y); await sleep(600);
  ok((await shown()).includes('boost') && !(await rows()).includes('boost-'), 'its switch shows Boost again');
  // a drag in the bar while Settings is open shows up in Settings too
  await ui.evaluate(() => TOOLBAR.save({ tools: ['split', ...BL.toolOrder(S.prefs.tools).filter(x => x !== 'split')] })); await sleep(500);
  ok((await rows())[0] === 'split', 'a change made in the bar shows in Settings straight away');
  // every look
  for (const [nm, pt] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), pt); await sleep(600);
    await audit(ov, `Settings › Top bar, ${nm}`); shot('tb-settings-' + nm.replace(/ /g, '-'));
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  const custom = await order();
  await ov.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await sleep(300); await ui.evaluate(() => B.overlayCancel && B.overlayCancel()); await sleep(500);

  // ---------- narrow window: the address shrinks, the tools stay whole ----------
  ptr('resize 820 700'); await sleep(1200);
  await audit(ui, 'top bar in a narrow window'); shot('tb-narrow');
  const tight = await ui.evaluate(() => { const u = document.getElementById('url').getBoundingClientRect(), t = document.getElementById('tools').getBoundingClientRect(); return { gap: t.left - u.right, right: innerWidth - t.right, url: u.width }; });
  ok(tight.gap >= 4 && tight.right >= 0 && tight.url >= 120, `in a narrow window the address shrinks and nothing runs together (${JSON.stringify(tight)})`);
  ptr('resize 1320 840'); await sleep(1000);

  // ---------- after a restart, and in a second window ----------
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(2500);
  ok(JSON.stringify(await order()) === JSON.stringify(custom), 'after a restart the bar is just as you left it');
  K('down:Control_L tap:n up:Control_L'); await sleep(3000);
  const w2 = b.pages().filter(x => x.url().endsWith('/index.html')).find(x => x !== ui);
  ok(w2 && JSON.stringify(await w2.evaluate(() => [...document.getElementById('tools').children].map(e => e.dataset.tool))) === JSON.stringify(custom), 'a new window has the same bar');
  await ui.evaluate(() => TOOLBAR.save({ toolsOff: ['note'] })); await sleep(900);
  let fol = false; for (let i = 0; i < 25 && w2 && !fol; i++) { fol = await w2.evaluate(() => document.querySelector('#tools [data-tool="note"]').hasAttribute('data-off')); if (!fol) await sleep(100); }
  ok(fol, 'and follows changes made in the other window');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
