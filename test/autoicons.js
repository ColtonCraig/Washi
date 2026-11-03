'use strict';
/* Automatic folder icons: a folder you haven't picked an icon for gets a paper icon from its name (MDM → tools,
   Drive and Docs → reading, Budget → money, Travel → plane) or, failing that, from the sites in it (GitHub tabs →
   code). Renaming updates it. One you picked yourself (even the plain folder) never changes. The sidebar draws them.
   Light, dark, Scrapbook; nothing cut off. */
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, sb } = b; await skipSetup(b);
  await ui.evaluate(() => {
    const s = sp(), add = (id, name, tabs = []) => { s.folders.push({ id, name, open: true, tabs }); s.tabs.push('f:' + id); };
    for (const [id, u] of [['g1', 'https://github.com/acme/a'], ['g2', 'https://github.com/acme/b'], ['g3', 'http://localhost:8765/p1.html']]) S.tabs[id] = { url: u, title: id, seen: Date.now() };
    add('fa', 'MDM'); add('fb', 'Drive and Docs'); add('fc', 'Budget'); add('fd', 'Stuff', ['g1', 'g2', 'g3']); add('fe', 'Misc 2'); add('ff', 'Travel plans');
    render(); save();
  }); await sleep(900);
  const icons = () => ui.evaluate(() => Object.fromEntries(sp().folders.map(f => [f.name, f.icon || null])));
  let I = await icons();
  ok(I['MDM'] === 'p:tools' && I['Drive and Docs'] === 'p:book' && I['Budget'] === 'p:money' && I['Travel plans'] === 'p:plane', 'from the name: ' + JSON.stringify(I));
  ok(I['Stuff'] === 'p:code', 'from the sites in it (GitHub tabs → code)');
  ok(I['Misc 2'] === 'p:bulb' || I['Misc 2'] === null, 'a name that says little gets something sensible or the plain folder');
  ok(await sb.evaluate(() => !!document.querySelector('.fold[data-fid="fa"] .fi svg.pi use[href="#pi-tools"]') && !!document.querySelector('.fold[data-fid="fd"] .fi use[href="#pi-code"]')), 'the sidebar draws them');
  await audit(sb, 'sidebar with automatic icons'); shot('autoicons');
  // renaming updates an automatic one
  await ui.evaluate(() => { sp().folders.find(f => f.id === 'fe').name = 'Music'; render(); save(); }); await sleep(500);
  ok((await icons())['Music'] === 'p:music', 'renaming updates it (Misc 2 → Music → music note)');
  // yours stays yours
  await ui.evaluate(() => { B.setupMsg({ type: 'folderLook', id: 'fa', icon: 'p:heart' }); B.setupMsg({ type: 'folderLook', id: 'fb', icon: null }); }); await sleep(500);
  await ui.evaluate(() => { const fs = sp().folders; fs.find(f => f.id === 'fa').name = 'Code'; fs.find(f => f.id === 'fb').name = 'Photos'; render(); save(); }); await sleep(500);
  I = await icons();
  ok(I['Code'] === 'p:heart' && I['Photos'] === null, 'an icon you picked (even the plain folder) never changes on its own: ' + JSON.stringify({ Code: I['Code'], Photos: I['Photos'] }));
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    await audit(sb, `automatic icons, ${nm}`); shot('autoicons-' + nm.replace(/ /g, '-'));
  }
  // remembered
  const profile = b.profile; await b.stop();
  const b2 = await start({ profile, fresh: false }); await sleep(2500);
  ok((await b2.ui.evaluate(() => sp().folders.find(f => f.id === 'fa').icon)) === 'p:heart', 'still yours after a restart');
  await b2.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
