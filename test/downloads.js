'use strict';
/* Downloads: the stamp is always in the top bar; a download starting sends a paper slip (with its file type) from the
   page in an arc into the stamp, which squashes as it lands; the ring fills while it downloads and a tape tab counts
   them when there are several; finishing stamps a check on it and leaves a dot until you look; clicking the stamp
   (real pointer) lists them and clears the dot. No "Downloaded" toast on top of all that. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;

(async () => {
  let b = await start(); let { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  const btn = () => ui.evaluate(() => { const e = document.getElementById('bDl'), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, hidden: e.hidden || r.width === 0, cls: e.className, badge: e.querySelector('b').textContent, p: +getComputedStyle(e).getPropertyValue('--p') || 0, cursor: getComputedStyle(e).cursor }; });
  let B0 = await btn();
  ok(!B0.hidden && B0.cursor === 'pointer', 'the downloads stamp is always in the top bar (before anything is downloaded), with a pointer cursor');
  const a0 = await ui.evaluate(AUDIT); ok(!a0.length, 'top bar: nothing cut off' + (a0.length ? ' ' + a0.slice(0, 4).join(' | ') : ''));

  // watch the slip fly (overlay) and the stamp's classes (shell)
  await ov.evaluate(() => { window.__slip = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('dlslip')) { const at = performance.now(); const tick = () => { if (!n.isConnected) return; const r = n.getBoundingClientRect(); window.__slip.push({ t: Math.round(performance.now() - at), x: r.x + r.width / 2, y: r.y + r.height / 2, o: +getComputedStyle(n).opacity, text: n.textContent }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }).observe(document.body, { childList: true }); });
  await ui.evaluate(() => { window.__cls = new Set(); new MutationObserver(() => document.getElementById('bDl').classList.forEach(c => window.__cls.add(c))).observe(document.getElementById('bDl'), { attributes: true, attributeFilter: ['class'] }); });
  const L = await ui.evaluate(() => layout());

  // ---------- one download: the slip ----------
  await ui.evaluate(() => navigate('http://localhost:8765/dlslow?name=report.pdf'));
  await sleep(450); shot('dl-flying');
  await sleep(700);
  const S = await ov.evaluate(() => window.__slip);
  ok(S.length > 10, `a paper slip flies when the download starts (${S.length} frames)`);
  if (S.length > 10) {
    const vis = S.filter(f => f.o > .5), first = vis[0], last = S[S.length - 1], top = Math.min(...S.map(f => f.y));
    ok(/PDF/.test(first.text), 'it carries the file type (PDF)');
    ok(Math.abs(first.x - (L.a.x + L.a.w / 2)) < 40 && first.y > L.a.y + 60, `it starts on the page (${Math.round(first.x)},${Math.round(first.y)})`);
    ok(Math.hypot(last.x - B0.x, last.y - B0.y) < 24, `and ends on the downloads stamp (${Math.round(last.x)},${Math.round(last.y)} vs ${Math.round(B0.x)},${Math.round(B0.y)})`);
    ok(top < Math.min(first.y, B0.y), 'in an arc, not a straight line');
    ok(S[S.length - 1].t >= 600 && S[S.length - 1].t <= 1100, `quick (${S[S.length - 1].t}ms)`);
  }
  ok(await ov.evaluate(() => !document.querySelector('.dlslip')), 'the slip is gone after it lands');
  ok(await ui.evaluate(() => window.__cls.has('land')), 'the stamp squashes as the slip lands');
  let B1 = await btn();
  ok(/busy/.test(B1.cls) && B1.p > 0 && B1.p < 1, `while downloading, the ring fills (${B1.p})`);

  // ---------- a second one at the same time: the count ----------
  await ui.evaluate(() => navigate('http://localhost:8765/dlslow?name=photos.zip')); await sleep(500);
  B1 = await btn();
  ok(B1.badge === '2', `two at once: the tape tab says 2 (${JSON.stringify(B1.badge)})`);
  const a1 = await ui.evaluate(AUDIT); ok(!a1.length, 'with the count: nothing cut off' + (a1.length ? ' ' + a1.slice(0, 4).join(' | ') : ''));
  shot('dl-two');

  // ---------- finished ----------
  for (let i = 0; i < 40; i++) { const d = await ui.evaluate(() => R.downloads.filter(x => /report|photos/.test(x.name)).map(x => x.state)); if (d.length === 2 && d.every(s => s === 'completed')) break; await sleep(200); }
  await sleep(300);
  const B2 = await btn();
  ok(await ui.evaluate(() => window.__cls.has('done')) && /done/.test(B2.cls), 'finishing stamps a check on it');
  ok(await ui.evaluate(() => +getComputedStyle(document.querySelector('#bDl .ok')).opacity > .5), 'the check is visible');
  shot('dl-done');
  ok(!/busy/.test(B2.cls) && B2.badge === '', 'the ring and count go away');
  ok(await ov.evaluate(() => !/Downloaded/.test(document.getElementById('toast').textContent) || !document.getElementById('toast').classList.contains('on')), 'no "Downloaded" toast piled on top');
  await sleep(2600);
  const B3 = await btn();
  ok(!/done/.test(B3.cls) && /new/.test(B3.cls), 'the check fades, a dot stays until you look');

  // ---------- open the list with a real click ----------
  ptr(`move ${X0 + B3.x} ${Y0 + B3.y}`); await sleep(150); ptr('down'); ptr('up'); await sleep(1000);
  const names = await ov.evaluate(() => [...document.querySelectorAll('#sheet .row.dl b')].map(e => e.textContent));
  ok(names.includes('report.pdf') && names.includes('photos.zip'), 'clicking the stamp lists them: ' + names.slice(0, 4).join(', '));
  const a2 = await ov.evaluate(AUDIT); ok(!a2.length, 'downloads list: nothing cut off' + (a2.length ? ' ' + a2.slice(0, 4).join(' | ') : ''));
  shot('dl-sheet');
  await ov.keyboard.press('Escape'); await sleep(500);
  ok(!/new/.test((await btn()).cls), 'and the dot is gone');

  // ---------- dark ----------
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'dark' } })); await sleep(700);
  await ov.evaluate(() => { window.__slip = []; });
  await ui.evaluate(() => navigate('http://localhost:8765/dlslow?name=notes.txt')); await sleep(450); shot('dl-flying-dark');
  await sleep(600);
  ok((await ov.evaluate(() => window.__slip.length)) > 10, 'dark: the slip flies too');
  ok(await ui.evaluate(() => document.documentElement.classList.contains('dark')), 'and the window really is dark');
  for (let i = 0; i < 20 && (await ui.evaluate(() => R.downloads.some(x => x.name === 'notes.txt' && x.state !== 'completed'))); i++) await sleep(250);

  // ---------- after a restart: no slips for old downloads, the stamp is still there ----------
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(2500);
  ok(await ov.evaluate(() => !document.querySelector('.dlslip')), 'after a restart, old downloads don\'t fly again');
  ok(!(await btn()).hidden, 'and the stamp is there');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
