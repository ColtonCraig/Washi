'use strict';
/* Speed: start-up time, idle CPU (nothing should animate or poll while you read), memory, tab switching. */
const { start, sleep, ok, done, skipSetup } = require('./lib');
const fs = require('fs');
const ticks = () => { let t = 0; for (const p of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); if (!/electron/.test(c)) continue; const f = fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' '); t += +f[11] + +f[12]; } catch {} } return t; };
const rss = () => { let m = 0; for (const p of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); if (!/electron/.test(c)) continue; m += +(fs.readFileSync(`/proc/${p}/smaps_rollup`, 'utf8').match(/Pss:\s+(\d+)/) || [0, 0])[1] * 1024; } catch {} } return m; };
(async () => {
  const t0 = Date.now();
  const b = await start(); const { ui } = b;
  const ready = Date.now() - t0;
  ok(ready < 6000, `window up and interactive in ${ready} ms (xvfb, software rendering)`);
  await skipSetup(b);
  await ui.evaluate(() => { for (const p of ['p1', 'p2', 'p3']) openTab('http://localhost:8765/' + p + '.html'); });
  await sleep(4000);
  const a = ticks(); await sleep(10000); const used = (ticks() - a) / 100;          // seconds of CPU over 10 s
  ok(used / 10 < 0.04, `idle CPU with 3 tabs open: ${(used / 10 * 100).toFixed(1)}% of one core`);
  const mem = rss() / 1048576; ok(mem < 700, `memory for the whole browser with 3 tabs: ${mem.toFixed(0)} MB (proportional set size)`);
  const anim = await b.ui.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length) + await b.sb.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length);
  ok(anim === 0, `no endless animations running while idle (${anim})`);
  const ids = await ui.evaluate(() => spaceTabs(sp()));
  const sw = await ui.evaluate(async ids => { const t = performance.now(); for (let i = 0; i < 30; i++) { selectTab(ids[i % ids.length]); await new Promise(r => requestAnimationFrame(() => r())); } return (performance.now() - t) / 30; }, ids);
  ok(sw < 40, `switching tabs: ${sw.toFixed(1)} ms per switch`);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
