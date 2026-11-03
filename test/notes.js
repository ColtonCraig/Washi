'use strict';
/* A sticky note for each space: a real click on the note stamp opens lined paper in the space's colour, typing (real
   keyboard) saves as you go, Escape closes it, the stamp shows the space has a note, each space has its own, it's
   there after a restart, and the shortcut opens it. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const type = s => { for (const ch of s) K(ch === ' ' ? 'tap:space' : /[A-Z]/.test(ch) ? `down:Shift_L tap:${ch.toLowerCase()} up:Shift_L` : ch === '\n' ? 'tap:Return' : ch === ',' ? 'tap:comma' : ch === '.' ? 'tap:period' : 'tap:' + ch); };
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
(async () => {
  let b = await start(); let { ui, ov } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  const stamp = () => ui.evaluate(() => { const e = document.getElementById('bNote'), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, has: e.classList.contains('has') }; });
  const open = async () => { const s = await stamp(); ptr(`move ${X0 + s.x} ${Y0 + s.y}`); await sleep(80); ptr('down'); ptr('up'); await sleep(800); };
  ok(!(await stamp()).has, 'no note yet: the stamp is plain');
  await open();
  const n = await ov.evaluate(() => { const p = document.querySelector('.panel.on .pop.note'); return p && { head: p.querySelector('.nh').textContent, focus: document.activeElement && document.activeElement.id === 'ntx' }; });
  ok(n && n.head === 'Home' && n.focus, 'clicking the note stamp opens the Home space\'s sticky note, ready to type');
  type('Call IT about the Q4 refresh\nOrder 12 MacBooks');
  await sleep(900);
  ok(await ui.evaluate(() => sp().note) === 'Call IT about the Q4 refresh\nOrder 12 MacBooks', 'typing saves as you go');
  ok(await ov.evaluate(() => document.getElementById('nsv').textContent === 'Saved'), 'and says Saved');
  await audit(ov, 'sticky note'); shot('note-light');
  K('tap:Escape'); await sleep(600);
  ok(!(await ov.evaluate(() => !!document.querySelector('.panel.on .pop.note'))) && (await stamp()).has, 'Escape puts it away, and the stamp shows Home has a note');
  await ui.evaluate(() => switchSpace('work')); await sleep(900);
  ok(!(await stamp()).has, 'another space has its own (empty) note');
  await open();
  ok(await ov.evaluate(() => document.querySelector('.pop.note .nh').textContent === 'Work' && document.getElementById('ntx').value === ''), 'Work\'s note is empty and named Work');
  type('Okta admin tasks'); await sleep(800); K('tap:Escape'); await sleep(500);
  await ui.evaluate(() => switchSpace('home')); await sleep(900);
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    await open(); await audit(ov, `sticky note, ${nm}`); shot('note-' + nm.replace(/ /g, '-')); K('tap:Escape'); await sleep(500);
  }
  const profile = b.profile; await b.stop();
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(2500);
  console.log('  notes after restart', JSON.stringify(await ui.evaluate(() => S.spaces.map(x => [x.id, x.note]))));
  ok(await ui.evaluate(() => S.spaces.find(x => x.id === 'home').note === 'Call IT about the Q4 refresh\nOrder 12 MacBooks' && S.spaces.find(x => x.id === 'work').note === 'Okta admin tasks'), 'both notes are there after a restart');
  { const L = await ui.evaluate(() => layout().stage); ptr(`move ${X0 + L.x + 300} ${Y0 + 400}`); ptr('down'); ptr('up'); await sleep(300); }
  K('down:Control_L down:Shift_L tap:k up:Shift_L up:Control_L'); await sleep(900);
  ok(await ov.evaluate(() => !!document.querySelector('.panel.on .pop.note')), 'the shortcut opens it');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
