'use strict';
/* Boosts: per-site colors, font, zapped elements (picked with the real mouse) and custom CSS. They stick across reloads
   and restarts, only touch that site, switch off cleanly, and the popover isn't clipped. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a), K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-boost-'));
(async () => {
  let b = await start({ profile }); let { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/boost.html')); await sleep(1500);
  const page = () => b.pages().find(p => p.url() === 'http://localhost:8765/boost.html');
  const css = (sel, prop) => page().evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
  const openPanel = async () => { await ui.click('#bBoost'); await sleep(800); };
  await openPanel();
  ok(await ov.evaluate(() => document.querySelector('.boostp .host').textContent) === 'localhost', 'the Boost popover opens for this site');
  shot('boost-panel');
  let a = await ov.evaluate(AUDIT); ok(!a.length, 'boost popover: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  // colors and font
  await ov.click('.tint[data-t="gray"]'); await sleep(500);
  ok(/grayscale\(1\)/.test(await css('html', 'filter')), 'Gray tint applies to the page');
  ok(await ui.evaluate(() => document.getElementById('bBoost').classList.contains('on')), 'the bolt in the top bar shows the site is boosted');
  await ov.click('.font[data-f="serif"]'); await sleep(500);
  ok(/New York|Iowan|Charter|Georgia/.test(await css('#txt', 'fontFamily')), 'Serif font applies');
  // custom CSS
  await ov.fill('#bcssv', 'h1 { color: rgb(255, 99, 71) !important }'); await sleep(900);
  ok(await css('h1', 'color') === 'rgb(255, 99, 71)', 'your own CSS applies as you type');
  // zap with the real mouse
  await ov.click('#bzap'); await sleep(900);
  const r = await page().evaluate(() => { const e = document.querySelector('.ad-slot').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  const L = await ui.evaluate(() => layout());
  const sx = 60 + L.a.x + r.x, sy = 57 + L.a.y + r.y;
  ptr(`move ${sx - 30} ${sy - 30}`); await sleep(150); ptr(`move ${sx} ${sy}`); await sleep(250);
  shot('boost-zap');
  ptr('down'); ptr('up'); await sleep(900);
  ok(await css('.ad-slot', 'display') === 'none', 'clicking an element in zap mode hides it');
  ok(await page().evaluate(() => document.title) === 'Boost me', 'the click doesn\'t reach the page');
  K('tap:Escape'); await sleep(800);
  ok(await page().evaluate(() => !document.querySelector('washi-zap')), 'Esc finishes zapping and removes the picker');
  ok(await ov.evaluate(() => document.getElementById('toast').classList.contains('on') && /Hid 1 thing on localhost/.test(document.getElementById('toastTxt').textContent)), 'a note says what was hidden, with Undo');
  // reload: everything sticks
  await ui.evaluate(() => B.tabAct(R.a, 'reload')); await sleep(1500);
  ok(await css('.ad-slot', 'display') === 'none' && /grayscale/.test(await css('html', 'filter')) && await css('h1', 'color') === 'rgb(255, 99, 71)', 'after a reload the boost is still there');
  // undo the zap
  await ui.evaluate(() => B.setupAct({ type: 'boost:undoLast' })); await sleep(600);
  ok(await css('.ad-slot', 'display') !== 'none', 'Undo brings the zapped element back');
  // other sites are untouched
  await ui.evaluate(() => openTab('http://127.0.0.1:8765/boost.html')); await sleep(1500);
  const other = b.pages().find(p => p.url() === 'http://127.0.0.1:8765/boost.html');
  ok(await other.evaluate(() => getComputedStyle(document.documentElement).filter) === 'none', 'another site has no boost');
  ok(!(await ui.evaluate(() => document.getElementById('bBoost').classList.contains('on'))), 'and the bolt is plain there');
  await ui.evaluate(() => selectTab(Object.keys(S.tabs).find(k => S.tabs[k].url.startsWith('http://localhost:8765/boost'))) ); await sleep(800);
  // zap again then restart: persists
  await openPanel(); await ov.click('#bzap'); await sleep(900);
  ptr(`move ${sx} ${sy}`); await sleep(250); ptr('down'); ptr('up'); await sleep(800); K('tap:Escape'); await sleep(600);
  await b.stop();
  b = await start({ profile, fresh: false, port: 9223 }); ({ ui, ov } = b); await sleep(2500);
  await ui.evaluate(() => selectTab(Object.keys(S.tabs).find(k => S.tabs[k].url === 'http://localhost:8765/boost.html'))); await sleep(1800);
  ok(await css('.ad-slot', 'display') === 'none' && /grayscale/.test(await css('html', 'filter')), 'boosts survive a restart');
  // switch off, then remove
  await openPanel(); await ov.click('#bon'); await sleep(600);
  ok(await css('html', 'filter') === 'none' && await css('.ad-slot', 'display') !== 'none', 'switching the boost off restores the site');
  await ov.click('#bon'); await sleep(500); ok(/grayscale/.test(await css('html', 'filter')), 'and back on');
  await ov.click('#breset'); await sleep(600);
  ok(await css('html', 'filter') === 'none' && !(await ui.evaluate(() => document.getElementById('bBoost').classList.contains('on'))), 'Remove this boost clears it');
  await ov.keyboard.press('Escape');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
