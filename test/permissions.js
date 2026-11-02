'use strict';
/* "Apps on this Mac" (Chrome's Local network access): Okta FastPass checks it before talking to Okta Verify on
   localhost. Until you decide, the page is told it may try (so it doesn't give up with "the browser is blocking");
   the shield popover has a switch for the site you're on (real click) that saves allow/block and reloads; blocked
   sites are told "denied"; Settings › Privacy shows the choice and flips it with a click. Checked light, dark and
   Scrapbook, nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57;
const NAMES = ['local-network-access', 'local-network', 'loopback-network'];
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(2200);
  const page = () => b.pages().filter(x => x.url().startsWith('http://localhost:8765/p1')).pop();
  const ask = () => page().evaluate(async n => { const o = {}; for (const k of n) { try { o[k] = (await navigator.permissions.query({ name: k })).state; } catch (e) { o[k] = 'unsupported'; } } return o; }, NAMES);
  let q = await ask();
  ok(Object.values(q).some(v => v === 'granted') && !Object.values(q).includes('denied'), 'before you decide, the page may try to reach apps on this Mac (not told "blocked"): ' + JSON.stringify(q));

  const openShield = async () => { const r = await ui.evaluate(() => { const e = document.getElementById('bShield').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }); ptr(`move ${X0 + r.x} ${Y0 + r.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(900); };
  const row = () => ov.evaluate(() => { const s = document.getElementById('netsw'); if (!s) return null; const r = s.getBoundingClientRect(); return { on: s.classList.contains('on'), sub: s.closest('.tgl').querySelector('small').textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const ovAt = () => ui.evaluate(() => { const e = document.getElementById('bShield').getBoundingClientRect(); return { x: Math.round(e.right - 306), y: Math.round(e.bottom + 2) }; });

  // ---------- the switch in the shield popover ----------
  await openShield();
  let r = await row();
  ok(r && !r.on && /asks/.test(r.sub), 'the shield popover has "Apps on this Mac" for this site, off and asking: ' + (r && r.sub));
  await audit(ov, 'shield popover with the switch'); shot('perm-pop');
  const o = await ovAt();
  const before = await page().evaluate(() => performance.timeOrigin);
  ptr(`move ${X0 + o.x + r.x} ${Y0 + o.y + r.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(2200);
  ok(await ui.evaluate(() => B.setupAct({ type: 'perm:set', origin: 'x', perm: 'x', v: 'x' }).then(l => (l.find(e => e.origin === 'http://localhost:8765') || {}).perms)).then(p => p && p['local-network'] === 'allow'), 'clicking it allows the site (saved)');
  ok((await page().evaluate(() => performance.timeOrigin)) !== before, 'and reloads the page so it can try again');
  q = await ask(); ok(!Object.values(q).includes('denied'), 'allowed: the page is told it may: ' + JSON.stringify(q));

  await openShield(); r = await row();
  ok(r && r.on && /Allowed/.test(r.sub), 'the popover shows it allowed');
  ptr(`move ${X0 + o.x + r.x} ${Y0 + o.y + r.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(2200);
  q = await ask(); ok(Object.values(q).some(v => v === 'denied'), 'switched off: the page is told it\'s blocked: ' + JSON.stringify(q));

  // ---------- Settings › Privacy ----------
  await ui.evaluate(() => openSetup('settings', 'privacy')); await sleep(1500);
  const chip = await ov.evaluate(() => { const c = [...document.querySelectorAll('.perm .chip')].find(x => /Apps on this Mac/.test(x.textContent)); if (!c) return null; c.scrollIntoView({ block: 'center' }); return c.textContent; });
  ok(/✕ Apps on this Mac/.test(chip || ''), 'Settings › Privacy lists it as blocked: ' + chip);
  await sleep(300);
  const cr = await ov.evaluate(() => { const c = [...document.querySelectorAll('.perm .chip')].find(x => /Apps on this Mac/.test(x.textContent)), r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ptr(`move ${X0 + cr.x} ${Y0 + cr.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(800);
  ok(/✓ Apps on this Mac/.test(await ov.evaluate(() => [...document.querySelectorAll('.perm .chip')].find(x => /Apps on this Mac/.test(x.textContent)).textContent)), 'clicking the choice flips it to allowed');
  await audit(ov, 'Settings › Privacy'); shot('perm-settings');
  await ov.evaluate(() => SETUP.finish()); await sleep(700);

  // ---------- every look ----------
  for (const [name, patch] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(p => B.setupMsg({ type: 'prefs', patch: p }), patch); await sleep(700);
    await openShield();
    ok(!!(await row()), `${name}: the switch is there`);
    await audit(ov, `shield popover, ${name}`); shot('perm-pop-' + name.replace(/ /g, '-'));
    await ov.keyboard.press('Escape'); await sleep(400);
  }
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
