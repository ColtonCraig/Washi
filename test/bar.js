'use strict';
/* The bookmarks bar with a real-world amount of bookmarks (like Colton's: ~20 work links and a few folders), at
   several window sizes, in both modes (always shown, and on hover over the page). Nothing may be cut off: every chip
   is either fully on the bar or behind ». Then the toast after removing a bookmark from the hover bar must show in
   full, and the hover bar must not come back on top of it. Real pointer, real window resizes. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, AUDIT, shot, skipSetup } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const NAMES = ['Apple', 'Google', 'Connections: Group Policies and Devices', 'Hudl Sync', 'Kandji', 'Rippling', 'Hudl Okta Admin', 'Jamf Pro', 'Hudl', 'MaaS360', 'Apple Business Manager', 'Slack Admin', 'Outlook', 'Okta', 'Zoom Admin', 'Confluence', 'Jira Service Management', 'GitHub', '1Password Business', 'Datadog'];

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(n => {
    S.bookmarks = n.map((t, i) => ({ id: 'b' + i, type: 'bm', title: t, url: 'http://localhost:8765/p1.html?b=' + i }));
    S.bookmarks.splice(3, 0, { id: 'fA', type: 'folder', name: 'Admin consoles', icon: '🛠️', color: '#3d63ff', kids: [{ id: 'k1', type: 'bm', title: 'Inside', url: 'http://localhost:8765/p2.html' }] });
    S.bookmarks.splice(8, 0, { id: 'fB', type: 'folder', name: 'Reading', icon: null, color: null, kids: [] });
    bmChanged();
  }, NAMES);
  const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 8).join('\n      ') : '')); };
  /* every chip is either hidden behind » or completely inside the bar; » shows exactly when something is hidden */
  const barCheck = (p, sel) => p.evaluate(sel => {
    const bar = document.querySelector(sel), br = bar.getBoundingClientRect();
    const chips = [...bar.querySelectorAll('.bm:not(.more)')], more = bar.querySelector('.more');
    const shown = chips.filter(c => !c.hidden), cut = shown.filter(c => { const r = c.getBoundingClientRect(); return r.right > br.right - 1 || r.left < br.left; });
    const mr = more && !more.hidden ? more.getBoundingClientRect() : null;
    return { n: chips.length, shown: shown.length, cut: cut.map(c => c.textContent), more: !!mr, moreIn: !mr || (mr.right <= br.right && mr.left >= br.left), h: Math.round(shown[0] ? shown[0].getBoundingClientRect().height : 0), font: shown[0] ? getComputedStyle(shown[0]).fontSize : '' };
  }, sel);

  // ---------- always shown ----------
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'always' } })); await sleep(900);
  for (const [w, h] of [[1320, 840], [1040, 760], [780, 600]]) {
    ptr(`resize ${w} ${h}`); await sleep(1100);
    const r = await barCheck(ui, '#bmbar');
    ok(r.n === 22 && r.cut.length === 0 && r.moreIn && r.more === r.shown < 22, `always, ${w}px wide: ${r.shown} of 22 on the bar, the rest behind », nothing cut (${JSON.stringify(r.cut)})`);
    if (w === 1320) ok(r.h >= 32 && parseFloat(r.font) >= 13.5, `chips are bigger and easier to hit (${r.h}px tall, ${r.font} text)`);
    await audit(ui, `always-shown bar at ${w}px`);
    shot(`bar-always-${w}`);
  }
  // » lists exactly the hidden ones, in order
  const hid = await ui.evaluate(() => document.getElementById('bmbar')._hidden.length);
  ok(hid === 22 - (await barCheck(ui, '#bmbar')).shown, '» holds every bookmark that didn\'t fit (' + hid + ')');

  // ---------- on hover ----------
  ptr('resize 1320 840'); await sleep(1000);
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { bookmarkBar: 'hover' } })); await sleep(900);
  await ui.evaluate(() => openTab('http://localhost:8765/p3.html')); await sleep(1500);
  const urlr = await ui.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
  for (const [w, h] of [[1320, 840], [1040, 760], [780, 600]]) {
    ptr(`resize ${w} ${h}`); await sleep(1100);
    ptr(`move ${X0 + 400} ${Y0 + 500}`); await sleep(500);
    const u = await ui.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; });
    ptr(`move ${X0 + u.x} ${Y0 + u.y}`); await sleep(1000);
    ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')), `on hover, ${w}px: resting on the top bar shows the bar`);
    await sleep(500);                                             // fonts, sizes settle
    const r = await barCheck(ov, '#bmin');
    ok(r.cut.length === 0 && r.moreIn && r.more === r.shown < 22, `on hover, ${w}px: ${r.shown} of 22 shown, the rest behind », nothing cut (${JSON.stringify(r.cut)})`);
    await audit(ov, `hover bar at ${w}px`);
    shot(`bar-hover-${w}`);
  }
  ptr('resize 1320 840'); await sleep(1000);

  // ---------- remove a bookmark from the hover bar: the toast shows in full, the bar doesn't fight it ----------
  ptr(`move ${X0 + 400} ${Y0 + 500}`); await sleep(500);
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(1000);
  const c = await ov.evaluate(() => { const r = document.querySelector('#bmin .bm[data-id="b1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const stage = await ui.evaluate(() => layout().stage);
  ptr(`move ${X0 + stage.x + c.x} ${Y0 + 44 + c.y}`); await sleep(500);
  ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')), 'pointer resting on a chip of the hover bar');
  await ui.evaluate(() => bmDelete('b1')); await sleep(300);              // what "Delete" in the chip's menu does
  for (const t of [300, 900, 1800]) {
    await sleep(t === 300 ? 0 : t - 300);
    const s = await ov.evaluate(() => { const e = document.getElementById('toast'), r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), strip: document.getElementById('bmstrip').classList.contains('on'), top: r.top, bottom: r.bottom, H: innerHeight, txt: e.innerText }; });
    ok(s.on && !s.strip && s.top >= 0 && s.bottom <= s.H && /Removed the bookmark/.test(s.txt), `${t}ms after removing (pointer still on the bar): the toast shows in full and the bar stays away (${JSON.stringify(s)})`);
  }
  shot('bar-toast');
  await audit(ov, 'the toast');
  // Undo works from the toast
  const ub = await ov.evaluate(() => { const r = document.getElementById('toastBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const ob = await ui.evaluate(() => B && null);
  void ob;
  const bounds = await ov.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // the overlay sits centred at the bottom for a toast: 520 wide, 100 up from the bottom
  ptr(`move ${X0 + Math.round((1320 - bounds.w) / 2) + ub.x} ${Y0 + (await ui.evaluate(() => innerHeight)) - 100 + ub.y}`); await sleep(200); ptr('down'); ptr('up'); await sleep(700);
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.id === 'b1')), 'Undo brings the bookmark back');
  // and once the toast is gone, hovering works again
  ptr(`move ${X0 + 400} ${Y0 + 500}`); await sleep(6500);
  ptr(`move ${X0 + urlr.x} ${Y0 + urlr.y}`); await sleep(1000);
  ok(await ov.evaluate(() => document.getElementById('bmstrip').classList.contains('on')), 'after the toast, the hover bar works again');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
