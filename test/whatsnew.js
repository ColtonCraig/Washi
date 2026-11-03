'use strict';
/* "Fresh off the press": the first start after an update shows what's new since the version you had, on paper:
   a card per feature with what it does, how to use it, its shortcut, and "Try it" (a real click runs it). Got it closes
   it and it doesn't come back; Help › What's New and Settings › Help bring it any time, with earlier updates a click
   away. A brand-new install gets the welcome instead. Light, dark, Scrapbook, a small window; nothing cut off. */
const { execSync } = require('child_process'); const fs = require('fs'), path = require('path');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const VERSION = require('../package.json').version;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
const sheetOn = ov => ov.evaluate(() => !!document.querySelector('#setup.on .sheet.nw'));

(async () => {
  // a new install: the welcome, not the news
  let b = await start(); let { ui, ov } = b; await sleep(1800);
  ok(!(await sheetOn(ov)) && await ov.evaluate(() => !!document.querySelector('#setup.on')), 'a brand-new install gets the welcome, not "what\'s new"');
  await skipSetup(b); const profile = b.profile; await b.stop();
  // pretend the last version you ran was 0.15.1
  const shp = path.join(profile, 'shared.json'), sh = JSON.parse(fs.readFileSync(shp, 'utf8')); sh.prefs.seenVer = '0.15.1'; fs.writeFileSync(shp, JSON.stringify(sh));
  b = await start({ profile, fresh: false }); ({ ui, ov } = b);
  let on = false; for (let i = 0; i < 30 && !on; i++) { on = await sheetOn(ov); if (!on) await sleep(200); }
  ok(on, `after the update (0.15.1 → ${VERSION}) "Fresh off the press" opens by itself`);
  await sleep(1200);
  const info = await ov.evaluate(() => ({ title: document.querySelector('.nw .ttl').textContent, stamp: document.querySelector('.nw .stampv').textContent, cards: [...document.querySelectorAll('.nw .nwc h5')].map(e => e.textContent), vers: [...document.querySelectorAll('.nw .nwv span')].map(e => e.textContent), keys: [...document.querySelectorAll('.nw .nwc kbd')].map(e => e.textContent), tries: document.querySelectorAll('.nw .nwc .btn').length }));
  const want = await ov.evaluate(v => window.WHATSNEW.filter(r => { const n = x => x.split('.').map(Number); const a = n(r.v), s = n('0.15.1'), c = n(v); const gt = (p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; return gt(a, s) > 0 && gt(a, c) <= 0; }).flatMap(r => r.items.map(i => i.title)), VERSION);
  ok(info.title === 'Fresh off the press' && info.stamp === 'Washi ' + VERSION, `titled "${info.title}", stamped ${info.stamp}`);
  ok(want.length && JSON.stringify(info.cards) === JSON.stringify(want), `it shows everything new since 0.15.1 (${info.cards.length} cards, ${info.vers.length + 1} releases)`);
  ok(info.keys.length >= 2 && info.keys.every(k => k.length >= 2), 'with the shortcuts, as you have them set: ' + info.keys.join(' '));
  ok(info.tries >= 2, `and "Try it" buttons (${info.tries})`);
  await audit(ov, 'Fresh off the press'); shot('news-light');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(300);
    await ui.evaluate(() => openSetup('news', '0.15.1')); await sleep(1400);
    await audit(ov, `Fresh off the press, ${nm}`); shot('news-' + nm.replace(/ /g, '-'));
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  ptr('resize 900 640'); await sleep(900);
  await ui.evaluate(() => openSetup('news', '0.15.1')); await sleep(1400);
  await audit(ov, 'Fresh off the press in a small window'); shot('news-small');
  ptr('resize 1320 840'); await sleep(900);
  // "Try it" runs it (real click)
  await ui.evaluate(() => openSetup('news', '0.15.1')); await sleep(1400);
  const tr = await ov.evaluate(() => { const c = [...document.querySelectorAll('.nw .nwc')].find(x => /sticky note/i.test(x.textContent)); if (!c) return null; const btn = c.querySelector('.btn'); btn.scrollIntoView({ block: 'center' }); const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (tr) { await sleep(300); for (let i = 0, last = ''; i < 30; i++) { const now = await ov.evaluate(() => JSON.stringify([...document.querySelectorAll('.nw .nwc')].find(x => /sticky note/i.test(x.textContent)).querySelector('.btn').getBoundingClientRect())); if (now === last) break; last = now; await sleep(100); }   // cards drop in one after another: wait until it has landed
    const t2 = await ov.evaluate(() => { const r = [...document.querySelectorAll('.nw .nwc')].find(x => /sticky note/i.test(x.textContent)).querySelector('.btn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); ptr(`move ${X0 + t2.x} ${Y0 + t2.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(1400); }
  ok(!!tr && await ov.evaluate(() => !!document.querySelector('.panel.on .pop.note')), '"Try it" on the sticky note opens it');
  await ov.keyboard.press('Escape'); await sleep(500);
  // Got it, and it doesn't come back
  await ui.evaluate(() => openSetup('news')); await sleep(1300);
  const more = await ov.evaluate(() => { const l = [...document.querySelectorAll('.nw .lnk')].find(x => /Earlier/.test(x.textContent)); if (!l) return 0; l.click(); return document.querySelectorAll('.nw .nwold .nwc').length; });
  ok(more > 0, `opened any time (Help › What's New), "Earlier updates" shows older releases (${more} more cards)`);
  ok(await ov.evaluate(() => { const b = [...document.querySelectorAll('.nw footer .btn')].find(x => x.textContent === 'Got it'); b.click(); return true; }), 'Got it');
  await sleep(800); ok(!(await sheetOn(ov)), 'closes it');
  await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(2800);
  ok(!(await sheetOn(ov)), 'next start: it doesn\'t come back');
  await ui.evaluate(() => openSetup('settings', 'help')); await sleep(1300);
  ok(await ov.evaluate(() => [...document.querySelectorAll('#sec-help .btn')].some(b => /What.s new/.test(b.textContent))), 'Settings › Help has "What\'s new" too');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
