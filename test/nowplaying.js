'use strict';
/* Now playing: music playing in a tab you're not looking at shows as a little paper ticket in the sidebar: the song
   and artist from the page (its media session), its artwork, a moving equaliser. A real click on pause pauses the page
   (and the button turns to play); play resumes it; clicking the ticket takes you to the tab (and the ticket goes away
   while you're on it); × hides it. Light, dark, Scrapbook; nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const X0 = 60, Y0 = 57, TOP = 38;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, sb } = b; await skipSetup(b);
  await ui.evaluate(() => openTab('http://localhost:8765/music.html')); await sleep(1800);
  const music = b.pages().find(p => p.url().includes('/music.html'));
  await music.evaluate(() => document.getElementById('a').play()); await sleep(1200);
  const np = () => sb.evaluate(() => { const e = document.getElementById('np'); return { shown: !e.hidden && getComputedStyle(e).display !== 'none', title: document.getElementById('npTitle').textContent, sub: document.getElementById('npSub').textContent, playing: e.classList.contains('playing'), art: getComputedStyle(document.getElementById('npImg')).backgroundImage, btn: document.getElementById('npPlay').getAttribute('aria-label') }; });
  ok(!(await np()).shown, 'while you\'re on the playing tab, no ticket (you can see it)');
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1500);
  let n = await np();
  ok(n.shown && n.title === 'Folded Afternoon' && n.sub === 'The Washi Band', `another tab: the ticket shows the song and artist (${n.title} · ${n.sub})`);
  ok(/mail\.png/.test(n.art), 'with its artwork');
  ok(n.playing && n.btn === 'Pause', 'the equaliser moves and the button pauses');
  await audit(sb, 'sidebar with Now playing'); shot('np-light');
  const rect = s => sb.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, s);
  const click = async s => { const r = await rect(s); ptr(`move ${X0 + r.x} ${Y0 + TOP + r.y}`); await sleep(120); ptr('down'); ptr('up'); };
  await click('#npPlay'); await sleep(1000);
  ok(await music.evaluate(() => document.getElementById('a').paused), 'a real click on pause pauses the page');
  n = await np(); ok(n.shown && !n.playing && n.btn === 'Play', 'the ticket stays, now with play');
  await click('#npPlay'); await sleep(1000);
  ok(!(await music.evaluate(() => document.getElementById('a').paused)) && (await np()).playing, 'play resumes it');
  for (const [nm, p] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(x => B.setupMsg({ type: 'prefs', patch: x }), p); await sleep(500);
    await audit(sb, `Now playing, ${nm}`); shot('np-' + nm.replace(/ /g, '-'));
  }
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(300);
  // narrow sidebar: still fits
  await sb.evaluate(() => B.intent({ type: 'sbw', w: 200, done: true })); await sleep(700);
  await audit(sb, 'Now playing in a 200px sidebar');
  await sb.evaluate(() => B.intent({ type: 'sbw', w: 232, done: true })); await sleep(500);
  await click('#npOpen'); await sleep(1000);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.includes('/music.html')) && !(await np()).shown, 'clicking the ticket takes you to the tab, and it steps aside');
  await ui.evaluate(() => selectTab(Object.keys(S.tabs).find(k => S.tabs[k].url.includes('p1.html')))); await sleep(1000);
  ok((await np()).shown, 'back on another tab, it\'s there again');
  const xr = await rect('#npX'); ptr(`move ${X0 + xr.x - 60} ${Y0 + TOP + xr.y}`); await sleep(200); ptr(`move ${X0 + xr.x} ${Y0 + TOP + xr.y}`); await sleep(200); ptr('down'); ptr('up'); await sleep(700);
  ok(!(await np()).shown, '× hides it');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
