'use strict';
/* Sites that always open in a space (Arc's Air Traffic Control): right-click a tab › Always Open okta.com in › Work
   (a real right-click and a real menu pick); that tab moves to Work; new okta.com links (and its subdomains) open in
   Work and take you there; other sites still open where you are; a link opened in the background goes to Work
   without moving you. Settings › Spaces lists it and × removes it. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57, TOP = 38;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, sb, ov } = b; await skipSetup(b);
  await ui.evaluate(() => { S.tabs.tOk = { url: 'http://okta.localhost:8765/p1.html', title: 'Okta', seen: Date.now() }; sp().tabs.unshift('tOk'); render(); save(); }); await sleep(800);
  const where = id => ui.evaluate(id => (spaceOf(id) || {}).id, id);
  // the tab's menu (a native menu: its items are checked here, and the pick goes the same way a click does)
  const items = await ui.evaluate(() => tabMenuItems('tOk'));
  const sub = items.find(i => /^Always Open okta\.localhost in$/.test(i.label));
  ok(sub && sub.submenu.filter(x => x.label).map(x => x.label).join() === 'Home,Work,Play,Any Space (as usual)' && sub.submenu.find(x => x.label === 'Any Space (as usual)').checked, 'the tab menu has "Always Open okta.localhost in" with each space (Any Space ticked)');
  await ui.evaluate(() => { R.menuTab = 'tOk'; menuClick('route:work'); });   // what picking Work in that menu sends
  await sleep(900);
  ok(await ui.evaluate(() => JSON.stringify(S.prefs.routes)) === JSON.stringify([{ host: 'okta.localhost', space: 'work' }]), 'picking Work saves the rule');
  ok(await where('tOk') === 'work', 'and that tab moves to Work');
  ok(await ov.evaluate(() => /okta\.localhost will always open in Work/.test(document.getElementById('toast').textContent)), 'it says so');
  await sleep(1500);
  // new links
  await ui.evaluate(() => switchSpace('home')); await sleep(800);
  await ui.evaluate(() => openTab('http://sso.okta.localhost:8765/p2.html')); await sleep(1200);
  ok(await ui.evaluate(() => S.cur) === 'work' && await ui.evaluate(() => S.tabs[focusedId()].url) === 'http://sso.okta.localhost:8765/p2.html', 'a new link to it (even a subdomain) opens in Work and takes you there');
  await ui.evaluate(() => switchSpace('home')); await sleep(800);
  await ui.evaluate(() => openTab('http://localhost:8765/p3.html')); await sleep(900);
  ok(await ui.evaluate(() => S.cur) === 'home', 'other sites still open right where you are');
  await ui.evaluate(() => openTab('http://okta.localhost:8765/p3.html?bg=1', { bg: true })); await sleep(900);
  ok(await ui.evaluate(() => S.cur === 'home' && spaceTabs(S.spaces.find(s => s.id === 'work')).some(id => S.tabs[id].url.endsWith('?bg=1'))), 'one opened in the background goes to Work without moving you');
  // Settings
  await ui.evaluate(() => openSetup('settings', 'spaces')); await sleep(1400);
  const chip = await ov.evaluate(() => { const c = [...document.querySelectorAll('.routes .chip')].find(x => /okta\.localhost/.test(x.textContent)); if (!c) return null; c.scrollIntoView({ block: 'center' }); return true; });
  ok(chip, 'Settings › Spaces lists it under Work');
  await audit(ov, 'Settings › Spaces with a rule'); shot('routes-settings');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }]]) { await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500); await audit(ov, `Settings › Spaces, ${nm}`); }
  await sleep(300);
  const r = await ov.evaluate(() => { const c = [...document.querySelectorAll('.routes .chip')].find(x => /okta\.localhost/.test(x.textContent)), b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  ptr(`move ${X0 + r.x} ${Y0 + r.y}`); await sleep(100); ptr('down'); ptr('up'); await sleep(700);
  ok(await ui.evaluate(() => !(S.prefs.routes || []).length), 'clicking × removes it');
  await ov.evaluate(() => SETUP.finish()); await sleep(600);
  await ui.evaluate(() => openTab('http://okta.localhost:8765/p1.html?after=1')); await sleep(900);
  ok(await ui.evaluate(() => S.cur) === 'home', 'and it opens where you are again');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
