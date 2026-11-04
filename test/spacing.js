'use strict';
/* Spacing, everywhere: nothing touches or runs into its neighbour (GAPS in lib.js: boxes overlapping or closer than 4px)
   and nothing is cut off (AUDIT), on every Settings section, sheet, page and command bar, and every card that opens
   from the top bar (note, bookmark, Boost, blocking, downloads, find, the update postcard, tab peek): in a big and a
   small window, light and dark, Standard and Scrapbook. Cards are as tall as what's on them (no empty space). */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, GAPS, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
(async () => {
  const b = await start(); await skipSetup(b); const { ui, ov, sb } = b;
  await ui.evaluate(() => openTab('http://localhost:8765/article.html')); await sleep(2500);
  const all = new Map(); const rec = async (p, where) => { for (const g of await p.evaluate(GAPS)) if (!all.has(g)) all.set(g, where); for (const g of await p.evaluate(AUDIT)) if (!all.has('cut off: ' + g)) all.set('cut off: ' + g, where); };
  const click = async sel => { const r = await ui.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return q.width ? { x: q.x + q.width / 2, y: q.y + q.height / 2 } : null; }, sel); if (!r) return false; ptr(`move ${X0 + r.x} ${Y0 + r.y}`); await sleep(80); ptr('down'); ptr('up'); await sleep(1100); return true; };
  const looks = [['light', { mode: 'light', wobble: false }], ['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]];
  let empty = [];
  for (const [W, H] of [[1440, 900], [900, 640]]) {
    ptr(`resize ${W} ${H}`); await sleep(800);
    for (const [nm, p] of looks) {
      await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(300);
      const tag = `${W}x${H} ${nm}`;
      await rec(ui, tag + ' window');
      for (const w of [200, 380, 260]) { await ui.evaluate(w => { S.prefs.sbW = w; B.sbMode({ docked: docked(), w, resize: true }); render(); }, w); await sleep(500); await rec(sb, tag + ` sidebar ${w}px`); }   // every sidebar width
      // Settings opens on Look, with Look lit in the list
      await ui.evaluate(() => openSetup('settings')); await sleep(1300);
      const lit = await ov.evaluate(() => document.querySelector('.rail button.on')?.dataset.s);
      if (lit !== 'look') empty.push(`${tag}: Settings opened with "${lit}" lit, not Look`);
      const secs = await ov.evaluate(() => [...document.querySelectorAll('.rail button')].map(x => x.dataset.s));
      for (const s of secs) { await ov.evaluate(s => { const sc = document.querySelector('.set .scroll'); sc.scrollTop = document.getElementById('sec-' + s).offsetTop - 4; }, s); await sleep(200); await rec(ov, tag + ' Settings › ' + s); }
      ptr('keys tap:Escape'); await sleep(500);
      for (const k of ['history', 'downloads', 'archive', 'bookmarks']) { await ui.evaluate(k => openSheet(k), k); await sleep(1100); await rec(ov, tag + ' ' + k); ptr('keys tap:Escape'); await sleep(500); }
      for (const pg of [['guide'], ['news', '0.15.1'], ['onboard']]) { await ui.evaluate(a => openSetup(...a), pg); await sleep(1400); await rec(ov, tag + ' ' + pg[0]); if (pg[0] === 'onboard') await ov.evaluate(() => window.SETUP.finish()); else ptr('keys tap:Escape'); await sleep(500); }   // (the welcome setup doesn't close on Esc)
      await ui.evaluate(() => openCmd()); await sleep(700); await ov.keyboard.type('p'); await sleep(500); await rec(ov, tag + ' command bar'); ptr('keys tap:Escape'); await sleep(400);
      for (const s of ['#bNote', '#bStar', '#bBoost', '#bShield', '#bDl']) {
        if (await click(s)) { await sleep(400); await rec(ov, tag + ' ' + s);
          const gap = await ov.evaluate(() => { const p = document.querySelector('.panel.on .pop'); if (!p || p.classList.contains('note') || document.querySelector('.panel.on.notes')) return 0; const last = [...p.children].filter(c => c.offsetHeight && getComputedStyle(c).position !== 'absolute').pop(); return last ? Math.round(p.offsetHeight - (last.offsetTop + last.offsetHeight)) : 0; });
          if (gap > 28) empty.push(`${tag} ${s}: ${gap}px of empty card under its last line`);
          if (W === 900 && nm === 'light Scrapbook') shot('spacing-' + s.slice(1)); }
        ptr('keys tap:Escape'); await sleep(500);
      }
      await ui.evaluate(() => openFind()); await sleep(700); await rec(ov, tag + ' find'); ptr('keys tap:Escape'); await sleep(400);
      await ui.evaluate(() => B.setupAct({ type: 'test:update', version: '9.9.9', notes: 'A sleeping tab wakes up\nHover a tab' })); await sleep(1500); await rec(ov, tag + ' update postcard'); ptr('keys tap:Escape'); await sleep(400);
      const t = await sb.evaluate(() => { const e = document.querySelector('.tab'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
      if (t) { ptr(`move ${X0 + t.x} ${Y0 + 38 + t.y}`); await sleep(1600); await rec(ov, tag + ' tab peek'); ptr(`move ${X0 + 700} ${Y0 + 400}`); await sleep(400); }
    }
  }
  const list = [...all].map(([g, w]) => `${w}: ${g}`);
  ok(!list.length, 'nothing touches, overlaps or is cut off anywhere' + (list.length ? '\n      ' + list.slice(0, 25).join('\n      ') : ''));
  ok(!empty.length, 'Settings opens on Look, and every card is as tall as what\'s on it' + (empty.length ? '\n      ' + empty.join('\n      ') : ''));
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
