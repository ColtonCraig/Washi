'use strict';
/* Focus mode (⌥⌘F, real keys): the top bar and sidebar get out of the way and the page fills the window (checked on
   screen, not just in the plan). Pointing at the top edge brings the top bar back and moves the page down for it;
   moving away puts it away. The left edge still slides the sidebar in. Leaving puts everything back (docked
   sidebar too). It's remembered after a restart. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
const px = (x, y) => { execSync('import -window root /tmp/focus-px.png'); return JSON.parse(execSync(`python3 -c "from PIL import Image;im=Image.open('/tmp/focus-px.png').convert('RGB');print(list(im.getpixel((${Math.round(x)},${Math.round(y)}))))"`)); };
const green = p => p[1] > p[0] + 8 && p[1] > p[2] + 8;
const FOCUS = 'down:Control_L down:Alt_L tap:f up:Alt_L up:Control_L';

(async () => {
  let b = await start(); let { ui, sb, ov } = b; await skipSetup(b);
  await ui.evaluate(() => { openTab('http://localhost:8765/p2.html', { bg: true }); openTab('http://localhost:8765/p1.html'); }); await sleep(1800);
  const L0 = await ui.evaluate(() => layout().stage);
  ok(await ui.evaluate(() => S.dock) && L0.x > 200, 'starts with the sidebar docked');
  const mid = { x: L0.x + L0.w / 2, y: 400 };
  ptr(`move ${X0 + mid.x} ${Y0 + mid.y}`); ptr('down'); ptr('up'); await sleep(300);
  K(FOCUS); await sleep(1100);
  const L1 = await ui.evaluate(() => layout().stage);
  ok(await ui.evaluate(() => document.body.classList.contains('focus') && S.focusMode), '⌥⌘F turns on Focus mode');
  ok(L1.x <= 14 && L1.y <= 8 && L1.w > L0.w + 150, `the page gets the whole window (${JSON.stringify(L1)})`);
  ok(green(px(X0 + 30, Y0 + 30)) && green(px(X0 + L1.x + L1.w - 30, Y0 + 20)), 'on screen too: the page reaches the top corners');
  ok(await ui.evaluate(() => +getComputedStyle(document.querySelector('.topbar')).opacity < .1), 'the top bar is out of the way');
  ok(await sb.evaluate(() => document.body.classList.contains('float') && innerHeight > 800), 'the sidebar floats, full height');
  ok(await ov.evaluate(() => /Focus mode/.test(document.getElementById('toast').textContent)), 'a note says how to get the bar and how to leave');
  await sleep(1800); shot('focus-on');
  // the top edge brings the top bar back, moving away puts it away
  ptr(`move ${X0 + mid.x} ${Y0 + 2}`); let t0 = Date.now(), peek = false;
  while (Date.now() - t0 < 1200 && !(peek = await ui.evaluate(() => document.body.classList.contains('peek')))) await sleep(40);
  ok(peek, `pointing at the top edge brings the top bar back (${Date.now() - t0}ms)`);
  await sleep(450);
  ok((await ui.evaluate(() => layout().stage.y)) === 38 && await ui.evaluate(() => +getComputedStyle(document.querySelector('.topbar')).opacity > .9), 'the page moves down for it and the bar shows');
  ok(green(px(X0 + mid.x, Y0 + 45)) && !green(px(X0 + mid.x, Y0 + 19)), 'on screen: the bar is above the page, not under it');
  await audit(ui, 'top bar in Focus mode'); shot('focus-peek');
  const u = await ui.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + u.x} ${Y0 + u.y}`); await sleep(300);
  ok(await ui.evaluate(() => document.body.classList.contains('peek')), 'it stays while you point at it');
  ptr('down'); ptr('up'); await sleep(700);
  ok(await ov.evaluate(() => document.getElementById('cmd').classList.contains('on')), 'and the address works (opens the command bar)');
  K('tap:Escape'); await sleep(500);
  ok(!(await ov.evaluate(() => document.getElementById('cmd').classList.contains('on'))), 'Escape closes the command bar');
  // the star brings the bookmarks bar out, in Focus mode too, and it stays while you use it
  await ui.evaluate(() => { S.bookmarks.push({ type: 'bm', id: 'fbm1', title: 'Page two', url: 'http://localhost:8765/p2.html' }); bmChanged(); }); await sleep(300);
  ptr(`move ${X0 + mid.x} ${Y0 + 2}`); await sleep(700);
  const st = await ui.evaluate(() => { const r = document.getElementById('bStar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + st.x} ${Y0 + st.y}`); await sleep(60); await ui.evaluate(() => B.bmHover(null)); await sleep(400);   // (the bar may already be out from resting on the top bar: start from hidden)
  ptr(`move ${X0 + st.x + 1} ${Y0 + st.y}`); await ui.evaluate(() => document.getElementById('bStar').dispatchEvent(new PointerEvent('pointerenter'))); t0 = Date.now(); let bar = false;
  while (Date.now() - t0 < 1500 && !(bar = await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on') && !document.getElementById('bmstrip').classList.contains('out')))) await sleep(40);
  ok(bar, `resting on the star brings out the bookmarks bar in Focus mode (${Date.now() - t0}ms)`);
  ptr(`move ${X0 + mid.x} ${Y0 + 52}`); await sleep(900);
  ok(await ui.evaluate(() => document.body.classList.contains('peek')) && await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on') && !document.getElementById('bmstrip').classList.contains('out')), 'moving onto the bar keeps the bar and the top bar out');
  await audit(ov, 'bookmarks bar in Focus mode'); shot('focus-bmbar');
  ptr(`move ${X0 + mid.x} ${Y0 + 500}`); t0 = Date.now();
  while (Date.now() - t0 < 2000 && await ui.evaluate(() => document.body.classList.contains('peek'))) await sleep(40);
  ok(!(await ui.evaluate(() => document.body.classList.contains('peek'))) && (await ui.evaluate(() => layout().stage.y)) <= 8, `moving back into the page puts it away (${Date.now() - t0}ms)`);
  // the left edge still slides the sidebar in
  ptr(`move ${X0 + 3} ${Y0 + 400}`); let open = false; for (let i = 0; i < 25 && !open; i++) { open = await sb.evaluate(() => document.body.classList.contains('open')); if (!open) await sleep(40); }
  ok(open, 'the left edge slides the sidebar in');
  await sleep(400); await audit(sb, 'sidebar in Focus mode'); shot('focus-sidebar');
  ptr(`move ${X0 + mid.x} ${Y0 + 500}`); await sleep(800);
  // every look
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    ptr(`move ${X0 + mid.x} ${Y0 + 2}`); await sleep(900);
    ok(await ui.evaluate(() => document.body.classList.contains('peek')), `${nm}: the top edge brings the bar`);
    await audit(ui, `Focus mode, ${nm}`); shot('focus-' + nm.replace(/ /g, '-'));
    ptr(`move ${X0 + mid.x} ${Y0 + 500}`); await sleep(1200);
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  // remembered after a restart
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, sb, ov } = b); await sleep(2500);
  ok(await ui.evaluate(() => S.focusMode && document.body.classList.contains('focus') && layout().stage.y <= 8), 'still in Focus mode after a restart');
  // leaving puts everything back
  { const L = await ui.evaluate(() => layout().stage); ptr(`move ${X0 + L.x + 300} ${Y0 + 400}`); ptr('down'); ptr('up'); await sleep(300); }
  K(FOCUS); await sleep(1100);
  const L2 = await ui.evaluate(() => layout().stage);
  ok(await ui.evaluate(() => !S.focusMode && !document.body.classList.contains('focus')) && L2.y === 38 && L2.x > 200, `⌥⌘F again leaves it: top bar and docked sidebar are back (${JSON.stringify(L2)})`);
  ok(await sb.evaluate(() => document.body.classList.contains('docked')), 'the sidebar is docked again');
  // from the command bar
  await ui.evaluate(() => openCmd('new')); await sleep(500);
  await ov.evaluate(() => { const i = document.getElementById('q'); i.value = 'focus mode'; i.dispatchEvent(new Event('input')); }); await sleep(400);
  const fr = await ov.evaluate(() => { const r = [...document.querySelectorAll('#res .r')].find(x => /Focus mode/.test(x.textContent)); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  ok(!!fr, 'typing "focus mode" lists the action');
  if (fr) { ptr(`move ${X0 + fr.x} ${Y0 + fr.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(1000); }
  ok(await ui.evaluate(() => S.focusMode), 'the command bar has it too');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
