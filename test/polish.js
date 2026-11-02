'use strict';
/* The 0.15 round of fixes, the way a person uses them: the hand cursor on clickable things, "Your apps" icons showing
   at once, a long pasted address in the command bar, getting back to Today, reordering pins, a folder's emoji and color,
   resizing the docked sidebar, the floating sidebar sliding in, the thinner top bar, and the quick-start drawing. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
process.env.WASHI_APPS_TEST = 'http://localhost:8765';
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57, TOP = 38;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-polish-'));
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  let b = await start({ profile }); let { ui, sb, ov } = b;
  // ---------- 1. setup: "Your apps" icons show without clicking anything ----------
  await sleep(1000);
  await ov.evaluate(() => [...document.querySelectorAll('.crumb')].find(c => c.textContent === 'Your apps').click());
  const t0 = Date.now(); let icons = null;
  for (let i = 0; i < 30; i++) { icons = await ov.evaluate(() => [...document.querySelectorAll('.apptile .aicon')].map(a => a.querySelector('img') ? 'img' : a.querySelector('.wait') ? 'wait' : 'letter')); if (icons.every(x => x === 'img')) break; await sleep(100); }
  ok(icons.length === 4 && icons.every(x => x === 'img'), `every app tile gets its icon by itself, nothing to click (${Date.now() - t0}ms): ${icons}`);
  ok(await ov.evaluate(() => getComputedStyle(document.querySelector('.apptile')).cursor) === 'pointer', 'the app tiles show the hand cursor');
  ok(await ov.evaluate(() => getComputedStyle(document.querySelector('.next')).cursor) === 'pointer', 'and so do the setup buttons');
  await audit(ov, 'Your apps');
  shot('pol-apps');
  await ov.evaluate(() => [...document.querySelectorAll('.crumb')].find(c => c.textContent === 'Quick start').click()); await sleep(1500);
  await audit(ov, 'quick-start guide');
  ok(await ov.evaluate(() => { const f = document.querySelector('.mb [data-t="folder"]'); return !!f && !!f.querySelector('.fd .chv') && f.querySelectorAll('.fdl .tb').length === 2; }), 'the guide draws a folder like the real one (chevron, icon, count, tabs inside)');
  shot('pol-guide');
  await ov.evaluate(() => SETUP.finish()); await sleep(1200);
  await ov.evaluate(() => { const c = document.getElementById('cmd'); if (c.classList.contains('on')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  // opening setup again: the icons are already on this Mac
  await ui.evaluate(() => openSetup('settings', 'apps')); await sleep(400);
  ok(await ov.evaluate(() => [...document.querySelectorAll('#sec-apps .apptile .aicon')].every(a => a.querySelector('img'))), 'next time the icons are there straight away (kept on this Mac)');
  await ov.evaluate(() => SETUP.finish()); await sleep(600);

  // ---------- 2. thinner top bar, hand cursors ----------
  ok(await ui.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().height) === TOP, 'the top bar is 38px (was 44)');
  ok(await ui.evaluate(() => getComputedStyle(document.getElementById('bSide')).cursor) === 'pointer' && await ui.evaluate(() => getComputedStyle(document.getElementById('bFwd')).cursor) === 'default' && await sb.evaluate(() => getComputedStyle(document.getElementById('nt')).cursor) === 'pointer', 'the hand cursor on top-bar and sidebar buttons (and not on a greyed-out one)');
  await audit(ui, 'top bar'); await audit(sb, 'sidebar');

  // ---------- 3. a long address pasted into the command bar ----------
  const long = 'https://idmsa.apple.com/IDMSWebAuth/signin?appIdKey=97c4d644ed86b35db118d013fd741ad3d0a72050e8be33cfac3b1e9d9e1e3bb5&path=%2Fsignin%3FfromFlow%3Dtrue&rv=0&language=en&segment=S';
  await ui.evaluate(() => openCmd('new')); await sleep(500);
  await ui.evaluate(t => B.copy(t), long); await sleep(200);
  execSync(`python3 ${__dirname}/ptr.py keys "down:Control_L tap:v up:Control_L"`); await sleep(700);
  const box = await ov.evaluate(() => { const r = document.querySelector('.cmd .box').getBoundingClientRect(); return { l: r.left, r: r.right, W: innerWidth, q: document.getElementById('q').value.length }; });
  ok(box.q === long.length && box.l >= 0 && box.r <= box.W, `a long pasted address stays inside the window (box ${Math.round(box.l)}..${Math.round(box.r)} of ${box.W})`);
  await audit(ov, 'command bar with a long address'); shot('pol-paste');
  execSync(`python3 ${__dirname}/ptr.py keys "tap:Return"`); await sleep(1500);
  ok(await ui.evaluate(u => S.tabs[focusedId()] && S.tabs[focusedId()].url.startsWith('https://idmsa.apple.com/IDMSWebAuth/signin') || (R.a && S.tabs[R.a].url.includes('idmsa')), long), 'Return opens it');

  // ---------- 4. Today, any time ----------
  for (const p of ['p1', 'p2', 'p3']) await ui.evaluate(u => openTab('http://localhost:8765/' + u + '.html'), p);
  await sleep(1500);
  const rectOf = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const sbClick = async sel => { const r = await rectOf(sb, sel); ptr(`move ${X0 + r.x + r.w / 2} ${Y0 + TOP + r.y + r.h / 2}`); await sleep(80); ptr('down'); ptr('up'); await sleep(700); };
  await sbClick('#td');
  ok(await ui.evaluate(() => !R.a && !document.getElementById('today').hidden) && await sb.evaluate(() => document.getElementById('td').classList.contains('on')), 'the ☀ button in the sidebar shows Today, with tabs open (and lights up)');
  ok(await sb.evaluate(() => document.getElementById('td').title) === 'Today (⇧⌘H)', 'its tooltip says what it is');
  shot('pol-today');
  await sbClick('.tabs .tab');
  ok(await ui.evaluate(() => !!R.a && document.getElementById('today').hidden) && !(await sb.evaluate(() => document.getElementById('td').classList.contains('on'))), 'clicking a tab goes back to it');
  await sbClick('#sname');
  ok(await ui.evaluate(() => !R.a && !document.getElementById('today').hidden), 'clicking the space\'s name shows Today too');

  // ---------- 5. reorder pins by dragging ----------
  await ui.evaluate(() => { for (const id of spaceTabs(sp()).slice(0, 3)) pinToggle(id); });
  await sleep(900);
  let pins = await ui.evaluate(() => S.pins.map(id => S.tabs[id].url.match(/p\d/)[0]));
  const p3 = await rectOf(sb, `.pin[data-id="${await ui.evaluate(() => S.pins[2])}"]`), p1 = await rectOf(sb, `.pin[data-id="${await ui.evaluate(() => S.pins[0])}"]`);
  ptr(`drag ${X0 + p3.x + p3.w / 2} ${Y0 + TOP + p3.y + p3.h / 2} ${X0 + p1.x + 6} ${Y0 + TOP + p1.y + p1.h / 2} 0.3`); ptr('up'); await sleep(900);
  const pins2 = await ui.evaluate(() => S.pins.map(id => S.tabs[id].url.match(/p\d/)[0]));
  ok(pins2.join() === [pins[2], pins[0], pins[1]].join(), `dragging the last pin onto the first one's left half puts it first: ${pins} → ${pins2}`);
  ok(await sb.evaluate(() => [...document.querySelectorAll('.pin')].map(p => p.dataset.id).join()) === await ui.evaluate(() => S.pins.join()), 'the sidebar shows the new order');
  ok(await sb.evaluate(() => getComputedStyle(document.querySelector('.pin')).cursor) === 'pointer', 'pins show the hand cursor');

  // ---------- 6. a folder's emoji and color ----------
  await ui.evaluate(() => { const s = sp(); s.folders.push({ id: 'fX', name: 'Drive and Docs', open: true, tabs: [] }); s.tabs.push('f:fX'); render(); save(); });
  await sleep(800);
  await sbClick('.fold[data-fid="fX"] .fi');
  ok(await ov.evaluate(() => document.querySelector('.panel.on.flook, .panel.flook.on') !== null || document.getElementById('panel').classList.contains('flook')), 'clicking the folder\'s icon opens its icon-and-color card');
  ok(await ui.evaluate(() => sp().folders.find(f => f.id === 'fX').open), 'and doesn\'t fold the folder up');
  await audit(ov, 'folder icon-and-color card'); shot('pol-flook');
  await ov.click('#femo .emo-b[data-e="🛠️"]'); await ov.click('#fcol .col-b[data-c="#3d63ff"]'); await sleep(400);
  let f = await ui.evaluate(() => sp().folders.find(x => x.id === 'fX'));
  ok(f.icon === '🛠️' && f.color === '#3d63ff', 'picking an emoji and a color sets them');
  ok(await sb.evaluate(() => { const e = document.querySelector('.fold[data-fid="fX"]'); return e.classList.contains('tinted') && e.querySelector('.fi .emo').textContent === '🛠️' && getComputedStyle(e).getPropertyValue('--fc').trim() === '#3d63ff'; }), 'the sidebar shows the emoji and the folder takes the color, as you pick');
  await ov.fill('#fein', '🚀'); await sleep(300);
  ok((await ui.evaluate(() => sp().folders.find(x => x.id === 'fX').icon)) === '🚀', 'any emoji can be typed in');
  await ov.click('#fdone'); await sleep(400);
  ok(!(await ov.evaluate(() => document.getElementById('panel').classList.contains('on'))), 'Done closes it');
  shot('pol-folder');

  // ---------- 7. resize the docked sidebar ----------
  const g = await rectOf(sb, '#grip');
  ok(await sb.evaluate(() => getComputedStyle(document.getElementById('grip')).cursor) === 'col-resize', 'the sidebar\'s edge shows the resize cursor');
  ptr(`drag ${X0 + g.x + 3} ${Y0 + TOP + 300} ${X0 + g.x + 3 + 70} ${Y0 + TOP + 300} 0.3`); ptr('up'); await sleep(900);
  let w = await ui.evaluate(() => [S.prefs.sbW, layout().stage.x]), sbw = await sb.evaluate(() => innerWidth);
  ok(Math.abs(w[0] - 302) <= 3 && sbw === w[0] && w[1] === w[0] + 4, `dragging its edge 70px makes the sidebar wider (${w[0]}px), the page moves over with it`);
  // the real page view, not just the plan: its left edge is where the page colour starts on screen
  shot('pol-px'); const px = execSync(`python3 -c "from PIL import Image;im=Image.open('/tmp/pol-px.png').convert('RGB');y=${Y0 + TOP + 640};d=im.getpixel((${X0}+8,y));print([x for x in range(${X0}+8,${X0}+800) if sum(abs(a-b) for a,b in zip(im.getpixel((x,y)),d))>45][:1])"`).toString();
  const pageX = (JSON.parse(px)[0] || 0) - X0;
  ok(Math.abs(pageX - (w[0] + 4)) <= 3, `and the actual page on screen moves over too (page starts at ${pageX}px)`);
  await audit(sb, 'wider sidebar'); shot('pol-wide');
  ptr(`drag ${X0 + w[0] - 3} ${Y0 + TOP + 300} ${X0 + 60} ${Y0 + TOP + 300} 0.3`); ptr('up'); await sleep(900);
  ok((await ui.evaluate(() => S.prefs.sbW)) === 200, 'it stops at 200px narrow');
  await audit(sb, 'narrow sidebar');
  const g2 = await rectOf(sb, '#grip'); ptr(`move ${X0 + g2.x + 3} ${Y0 + TOP + 300}`); ptr('down'); ptr('up'); await sleep(60); ptr('down'); ptr('up'); await sleep(900);
  ok((await ui.evaluate(() => S.prefs.sbW)) === 232, 'double-clicking the edge puts it back to normal');
  ptr(`drag ${X0 + 229} ${Y0 + TOP + 300} ${X0 + 229 + 40} ${Y0 + TOP + 300} 0.3`); ptr('up'); await sleep(1200);
  const keep = await ui.evaluate(() => S.prefs.sbW);

  // ---------- 8. the floating sidebar slides in quickly ----------
  await ui.evaluate(() => toggleSide()); await sleep(900);
  ok(await ui.evaluate(() => !S.dock) && await sb.evaluate(() => document.body.classList.contains('float')), 'sidebar floating');
  ptr(`move ${X0 + 400} ${Y0 + 300}`); await sleep(500);
  const tIn = Date.now(); ptr(`move ${X0 + 3} ${Y0 + 300}`);
  let shown = false; for (let i = 0; i < 40 && !shown; i++) { shown = await sb.evaluate(() => { const r = document.getElementById('sheet').getBoundingClientRect(); return document.body.classList.contains('open') && r.left >= 0 && r.left < 12; }); if (!shown) await sleep(15); }
  ok(shown && Date.now() - tIn < 500, `touching the left edge slides it in (fully in ${Date.now() - tIn}ms)`);
  shot('pol-float');
  ptr(`move ${X0 + 700} ${Y0 + 300}`); await sleep(900);
  ok(!(await sb.evaluate(() => document.body.classList.contains('open'))), 'moving away slides it back out');
  await ui.evaluate(() => toggleSide()); await sleep(800);

  // ---------- 9. after a restart ----------
  await b.stop(); b = await start({ profile, fresh: false }); ({ ui, sb, ov } = b); await sleep(2200);
  const after = await ui.evaluate(() => ({ w: S.prefs.sbW, pins: S.pins.map(id => S.tabs[id].url.match(/p\d/)[0]).join(), f: sp().folders.find(x => x.id === 'fX') }));
  ok(after.w === keep && after.pins === pins2.join() && after.f.icon === '🚀' && after.f.color === '#3d63ff', 'the sidebar width, pin order and folder look are all still there after quitting');
  ok(await sb.evaluate(() => innerWidth) === keep, 'and the sidebar opens at that width');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
