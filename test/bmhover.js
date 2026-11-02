'use strict';
/* Bookmarks bar "on hover", the way it behaves on a Mac: the top bar is a window-drag area and macOS sends no pointer
   events from it, so Washi can't rely on them (window.__macDrag makes this machine act the same). It must still come
   down: moving up out of the page, or resting on the top bar's bottom edge. It goes away when you move off, and
   doesn't come down while you work in the page. Light, dark, Standard and Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => { S.bookmarks = ['Okta', 'Jamf Pro', 'Iru', 'Hexnode', 'Slack Admin', 'GitHub'].map((t, i) => ({ id: 'b' + i, type: 'bm', title: t, url: 'http://localhost:8765/p2.html?b=' + i })); bmChanged(); B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'hover' } }); window.__macDrag = true; });
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1800);
  const L = await ui.evaluate(() => layout()), url = await ui.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const on = () => ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')).catch(() => false);
  const waitOn = async (want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await on()) === want) return Date.now() - t0; await sleep(40); } return -1; };
  const mx = L.stage.x + L.stage.w / 2;
  const away = async () => { ptr(`move ${X0 + mx} ${Y0 + 500}`); await waitOn(false, 1500); await sleep(300); };

  for (const [look, patch] of [['light', {}], ['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(p => B.setupMsg({ type: 'prefs', patch: p }), patch); await sleep(600);
    await away();
    // 1. move up out of the page, stopping just above it
    ptr(`move ${X0 + mx} ${Y0 + 200}`); await sleep(120);
    for (const y of [120, 70, 46, 40, 35]) { ptr(`move ${X0 + mx} ${Y0 + y}`); await sleep(25); }
    let t = await waitOn(true, 900);
    ok(t >= 0, `${look}: moving up out of the page brings the bar down (${t}ms)`);
    await sleep(400); await audit(ov, `${look}: the bar`); shot('bmh-' + look.replace(/ /g, '-'));
    // it stays while you're on it, goes when you leave
    const chip = await ov.evaluate(() => { const r = document.querySelector('#bmin .bm').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const sr = await ui.evaluate(() => layout().stage);
    ptr(`move ${X0 + sr.x + chip.x} ${Y0 + 38 + chip.y}`); await sleep(500);
    ok(await on(), `${look}: it stays while you point at it`);
    ptr(`move ${X0 + mx} ${Y0 + 420}`); t = await waitOn(false, 1200);
    ok(t >= 0, `${look}: and goes when you move back into the page (${t}ms)`);
    await sleep(300);
    // 2. resting on the top bar's bottom edge (coming from the side, not from the page)
    ptr(`move ${X0 + 100} ${Y0 + 300}`); await sleep(150); ptr(`move ${X0 + 100} ${Y0 + 19}`); await sleep(150); ptr(`move ${X0 + L.stage.x + 60} ${Y0 + 19}`); await sleep(200);
    ok(!(await on()), `${look}: (coming along the top bar from the side: nothing yet)`);
    ptr(`move ${X0 + L.stage.x + 60} ${Y0 + 36}`);
    t = await waitOn(true, 900);
    ok(t >= 0, `${look}: resting on the top bar's bottom edge brings it down (${t}ms)`);
    await away();
  }
  // working in the page doesn't bring it down
  ptr(`move ${X0 + mx} ${Y0 + 300}`); await sleep(100);
  for (let i = 0; i < 6; i++) { ptr(`move ${X0 + mx + i * 30} ${Y0 + 60 + i * 5}`); await sleep(60); }
  ok(!(await on()), 'moving around inside the page, even near the top, doesn\'t bring it down');
  // the address label still works with the edge strip there
  ptr(`move ${X0 + url.x} ${Y0 + url.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(700);
  ok(await ov.evaluate(() => document.getElementById('cmd').classList.contains('on')), 'clicking the address label still opens the command bar');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
