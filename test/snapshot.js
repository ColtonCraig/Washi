'use strict';
/* Snapshot (⇧⌘S, real keys): the page freezes under a soft veil with a paper hint; a real drag picks a box (its size
   shows); letting go copies exactly that part (read back from the clipboard: right size, the page's colour), it turns
   into a polaroid that drops into the corner, and a toast offers Save, which writes a PNG to Downloads. Enter takes the
   whole page; Esc stops without copying. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const clip = () => execSync(`python3 ${__dirname}/clip.py /tmp/washi-clip.png`).toString().trim();
const pix = (f, x, y) => JSON.parse(execSync(`python3 -c "from PIL import Image;im=Image.open('${f}').convert('RGB');print(list(im.getpixel((${x},${y}))))"`));
const X0 = 60, Y0 = 57;
const SNAP = 'down:Control_L down:Shift_L tap:s up:Shift_L up:Control_L';
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1800);
  const L = await ui.evaluate(() => layout().stage);
  const focusPage = async () => { ptr(`move ${X0 + L.x + 500} ${Y0 + L.y + 500}`); ptr('down'); ptr('up'); await sleep(250); };
  const snapOn = () => ov.evaluate(() => !!document.querySelector('.snap.on'));
  await focusPage(); K(SNAP); await sleep(1000);
  ok(await snapOn(), '⇧⌘S freezes the page for a snapshot');
  ok(await ov.evaluate(() => /Drag over what you want/.test(document.querySelector('.snap .shint').textContent)), 'with a paper hint: drag, ↩ whole page, esc stop');
  await audit(ov, 'snapshot screen'); shot('snap-ready');
  // a real drag
  const x0 = X0 + L.x + 120, y0 = Y0 + L.y + 220, x1 = x0 + 300, y1 = y0 + 160;
  ptr(`move ${x0} ${y0}`); ptr('down'); for (let i = 1; i <= 10; i++) { ptr(`move ${x0 + 30 * i} ${y0 + 16 * i}`); await sleep(20); }
  await sleep(200);
  ok(/300 × 160/.test(await ov.evaluate(() => document.querySelector('.snap .ssz').textContent)), 'dragging draws the box with its size (300 × 160)');
  shot('snap-drag'); await audit(ov, 'snapshot box');
  ptr('up'); await sleep(350); shot('snap-polaroid');
  ok(await ov.evaluate(() => !!document.querySelector('.snap .spol img')), 'letting go: it turns into a polaroid');
  const c = clip();
  ok(c === '300x160' && (p => p[1] > p[0] + 8 && p[1] > p[2] + 8)(pix('/tmp/washi-clip.png', 150, 140)), `exactly that part is on the clipboard (${c}, the page's green)`);
  await sleep(1600);
  ok(!(await snapOn()) && await ov.evaluate(() => /Snapshot copied/.test(document.getElementById('toast').textContent) && /Save/.test(document.getElementById('toastBtn').textContent)), 'then the toast: copied, with Save');
  await audit(ov, 'snapshot toast');
  // Save → Downloads
  const dl = fs.existsSync(path.join(os.homedir(), 'Downloads')) ? path.join(os.homedir(), 'Downloads') : os.homedir(), before = fs.existsSync(dl) ? fs.readdirSync(dl).filter(f => /^Washi Snapshot/.test(f)) : [];
  const tb = await ov.evaluate(() => { const r = document.getElementById('toastBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const ob = await ui.evaluate(() => innerHeight);
  ptr(`move ${X0 + Math.round((1320 - 520) / 2) + tb.x} ${Y0 + ob - 100 + tb.y}`); await sleep(150); ptr('down'); ptr('up'); await sleep(900);
  const after = fs.existsSync(dl) ? fs.readdirSync(dl).filter(f => /^Washi Snapshot/.test(f) && !before.includes(f)) : [];
  ok(after.length === 1 && /\.png$/.test(after[0]), 'Save puts a PNG in Downloads: ' + after[0]);
  if (after[0]) { const sz = execSync(`python3 -c "from PIL import Image;print('%dx%d' % Image.open('${path.join(dl, after[0])}').size)"`).toString().trim(); ok(sz === '300x160', 'the same picture (' + sz + ')'); fs.rmSync(path.join(dl, after[0])); }
  await sleep(1200);
  // Enter: the whole page; Esc: nothing
  await focusPage(); K(SNAP); await sleep(900); K('tap:Return'); await sleep(500);
  ok(clip() === `${L.w}x${L.h}`, `Enter takes the whole page (${L.w}x${L.h})`);
  await sleep(1800);
  await focusPage(); K(SNAP); await sleep(900);
  ptr(`move ${x0} ${y0}`); ptr('down'); ptr(`move ${x0 + 60} ${y0 + 60}`); await sleep(100); K('tap:Escape'); ptr('up'); await sleep(600);
  ok(!(await snapOn()) && clip() === `${L.w}x${L.h}`, 'Esc stops it without copying anything new');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    await focusPage(); K(SNAP); await sleep(900);
    await audit(ov, `snapshot, ${nm}`); shot('snap-' + nm.replace(/ /g, '-'));
    ptr(`move ${x0} ${y0}`); ptr('down'); ptr(`move ${x0 + 200} ${y0 + 120}`); await sleep(100); ptr('up'); await sleep(400); shot('snap-pol-' + nm.replace(/ /g, '-'));
    await sleep(2200);
  }
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
