'use strict';
/* How fast clicking and dragging tabs feels: click -> highlight, click -> page shown, and frame times while dragging. */
const { start, sleep, ok, done, skipSetup } = require('./lib');
const { execSync } = require('child_process');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a.replace(/\d+\.\d+/g, m => Math.round(+m)));
(async () => {
  const DSF = +(process.env.DSF || 1); const b = await start({ args: DSF > 1 ? ['--force-device-scale-factor=' + DSF] : [] }); const { ui, sb } = b; await skipSetup(b);
  await ui.evaluate(() => { for (let i = 0; i < 12; i++) openTab('http://localhost:8765/p' + (i % 3 + 1) + '.html?n=' + i, { bg: i > 0 }); });
  await sleep(2500);
  // make every tab live first so we measure switching, not page loading
  const ids = await ui.evaluate(() => spaceTabs(sp()));
  for (const id of ids) { await ui.evaluate(id => selectTab(id), id); await sleep(250); }
  await sleep(800);
  // instrument: shell records when it shows a tab; sidebar records when the highlight moves
  await ui.evaluate(() => { window.__shown = {}; new MutationObserver(() => { const id = R.a; if (id && !window.__shown[id + ':' + window.__round]) window.__shown[id + ':' + window.__round] = Date.now(); }).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true }); });
  await sb.evaluate(() => { window.__hl = {}; new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains('on') && m.target.dataset.id && !window.__hl[m.target.dataset.id + ':' + window.__round]) window.__hl[m.target.dataset.id + ':' + window.__round] = Date.now(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
  const hl = [], shown = [];
  for (let r = 0; r < 10; r++) {
    const id = ids[(r * 5 + 3) % ids.length];
    await sb.evaluate(r => { window.__round = r; }, r); await ui.evaluate(r => { window.__round = r; }, r);
    const t0 = await sb.evaluate(id => { const t = Date.now(); document.querySelector(`.tab[data-id="${id}"] .ttl`).click(); return t; }, id);
    await sleep(400);
    const h = await sb.evaluate(([id, r]) => window.__hl[id + ':' + r], [id, r]), s = await ui.evaluate(([id, r]) => window.__shown[id + ':' + r], [id, r]);
    if (h) hl.push(h - t0); if (s) shown.push(s - t0);
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  console.log('  click -> highlight', hl.join(','), ' | click -> page', shown.join(','));
  ok(avg(hl) < 30, `click → sidebar highlight: ${avg(hl).toFixed(1)} ms avg`);
  ok(avg(shown) < 60, `click → page shown: ${avg(shown).toFixed(1)} ms avg`);
  // drag a tab down through the list with a real mouse, counting slow frames in the sidebar
  await sb.evaluate(() => { window.__fr = []; let last = performance.now(); const loop = t => { window.__fr.push(t - last); last = t; if (window.__fr.length < 2000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); window.__mv = 0; window.__mvt = 0; addEventListener('pointermove', () => { const t = performance.now(); queueMicrotask(() => { window.__mvt += performance.now() - t; window.__mv++; }); }, true); });
  const r0 = await sb.$eval('#tabs .tab:nth-child(2)', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const W = await ui.evaluate(() => [screenX, screenY]); const X = v => W[0] + v * DSF, Y = v => W[1] + (38 + v) * DSF + (DSF > 1 ? 0 : 27);
  ptr(`move ${X(r0.x)} ${Y(r0.y)}`); await sleep(100); ptr('down');
  for (let i = 0; i < 90; i++) { ptr(`move ${X(r0.x) + (i % 2)} ${Y(r0.y + i * 4)}`); }
  ptr('up'); await sleep(800);
  const fr = await sb.evaluate(() => window.__fr.slice(5));
  const slow = fr.filter(f => f > 34).length;
  console.log(`  drag: ${fr.length} frames, worst ${Math.max(...fr).toFixed(0)} ms, ${slow} frames over 34 ms`);
  ok(slow <= 2, `dragging a tab: ${slow} dropped frames (worst ${Math.max(...fr).toFixed(0)} ms)`);
  // hover sweep: move the mouse up and down over the tabs (hover effects must stay smooth)
  await sb.evaluate(() => { window.__fr = []; let last = performance.now(); const loop = t => { window.__fr.push(t - last); last = t; if (window.__fr.length < 2000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  for (let k = 0; k < 3; k++) for (let i = 0; i < 60; i++) { ptr(`move ${X(r0.x)} ${Y(r0.y + (k % 2 ? 60 - i : i) * 8)}`); }
  await sleep(300);
  const hf = await sb.evaluate(() => window.__fr.slice(5)); const hs = hf.filter(f => f > 34).length;
  ok(hs <= 2, `hovering across tabs: ${hs} dropped frames (worst ${Math.max(...hf).toFixed(0)} ms)`);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
