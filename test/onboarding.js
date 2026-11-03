'use strict';
/* First launch: the welcome setup, every step, then Settings and the guide; then a second launch that must NOT show setup again. */
const { start, sleep, ok, shot, done, AUDIT } = require('./lib');
(async () => {
  const b = await start(); const { ui, sb, ov } = b;
  await sleep(1200);
  ok(await ov.evaluate(() => document.getElementById('setup').classList.contains('on')), 'onboarding opens on first launch');
  shot('onb-o0');
  await ov.click('text=Let\'s set it up'); await sleep(900); shot('onb-o1');
  // dark mode
  await ov.click('.seg.modes .sg[data-v="dark"]'); await sleep(500); shot('onb-o1d');
  ok(await ui.evaluate(() => document.documentElement.classList.contains('dark') && S.prefs.mode === 'dark'), 'dark mode applied to the window + saved in prefs');
  ok(await sb.evaluate(() => document.documentElement.classList.contains('dark')), 'sidebar went dark too');
  await ov.click('.pz[data-id="midnight"]'); await sleep(300);
  ok(await ui.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()) === '#22273a', 'Midnight paper preset applied');
  await ov.click('.pal[data-h="300"]'); await sleep(300);
  ok(await ui.evaluate(() => sp().h) === 300, 'Home space recolored to Grape');
  await ov.evaluate(() => { const i = document.querySelectorAll('.cf .hex')[2]; i.value = '#ff00aa'; i.dispatchEvent(new Event('change')); }); await sleep(300);
  ok(await ui.evaluate(() => (sp().custom || {}).desk) === '#ff00aa', 'custom desk color via hex field');
  shot('onb-o1e');
  await ov.click('.cf .rs.vis'); await sleep(200);
  await ov.click('.seg.modes .sg[data-v="light"]'); await sleep(400);
  await ov.click('.sw >> nth=1'); await sleep(200);
  ok(await ui.evaluate(() => S.prefs.wobble === true), 'wonky scraps toggle (off by default) turns on');
  await ov.click('.sw >> nth=1');
  await ov.click('.next'); await sleep(900); shot('onb-o2');
  await ov.click('.seg.grid .sg[data-v="duckduckgo"]'); await sleep(200);
  ok(await ui.evaluate(() => toURL('cats are cool')) === 'https://duckduckgo.com/?q=cats%20are%20cool', 'search engine choice used by the address bar');
  await ov.click('.seg.grid .sg[data-v="custom"]'); await sleep(200);
  await ov.fill('.tf .txt', 'nope'); await ov.press('.tf .txt', 'Enter'); await sleep(200);
  ok((await ov.textContent('.tf .err')).length > 5, 'bad custom search URL rejected with a message');
  await ov.fill('.tf .txt', 'https://kagi.com/search?q=%s'); await ov.press('.tf .txt', 'Enter'); await sleep(300);
  ok(await ui.evaluate(() => toURL('x')) === 'https://kagi.com/search?q=x', 'custom search URL works');
  await ov.click('.seg.grid .sg[data-v="google"]'); await sleep(200);
  await ov.click('text=Floating'); await sleep(900);
  ok(await ui.evaluate(() => S.dock === false) && await sb.evaluate(() => document.body.classList.contains('float')), 'sidebar set to floating from setup');
  await ov.click('text=Pinned'); await sleep(700);
  await ov.click('.next'); await sleep(1200); shot('onb-apps');
  ok(await ov.evaluate(() => document.querySelectorAll('.apptile').length >= 4 && !!document.querySelector('.bmi')), 'the "Your apps" step offers apps to sign in to and bringing your stuff over');
  await ov.click('.next'); await sleep(1400); shot('onb-tour');
  const tour = await ov.evaluate(() => [...document.querySelectorAll('.tourg .tc b')].map(e => e.firstChild.textContent));
  ok(tour.length >= 14 && ['Focus mode', 'Reader', 'Sticky notes', 'Snapshot', 'Chrome extensions', 'Your top bar'].every(t => tour.includes(t)), 'a "What it does" step shows everything Washi offers: ' + tour.join(', '));
  { const a = await ov.evaluate(AUDIT); ok(!a.length, 'and nothing on it is cut off' + (a.length ? '\n      ' + a.slice(0, 5).join('\n      ') : '')); }
  await ov.click('.next'); await sleep(2200); shot('onb-o3');
  await ov.hover('.gl[data-t="pair"]'); await sleep(300);
  ok(await ov.evaluate(() => document.querySelector('.mb [data-t="pair"]').classList.contains('lite')), 'hovering a guide note lights up its spot');
  shot('onb-o3h');
  await ov.click('.next'); await sleep(1200); shot('onb-o4');
  await ov.click('text=Start browsing'); await sleep(1200);
  ok(await ui.evaluate(() => S.prefs.done === true), 'onboarding marked done');
  ok(await ui.evaluate(() => !document.getElementById('today').hidden && /Good (morning|afternoon|evening)|Up late/.test(document.querySelector('.thead h1').textContent)), 'first run ends on the Today page');
  shot('onb-o5');
  // settings
  await ui.evaluate(() => openSetup('settings')); await sleep(1200); shot('onb-s1');
  await ov.click('.rail button[data-s="privacy"]'); await sleep(900); shot('onb-s2');
  await ov.keyboard.press('Escape'); await sleep(600);
  ok(!(await ov.evaluate(() => document.getElementById('setup').classList.contains('on'))), 'Esc closes settings');
  await ui.evaluate(() => openSetup('guide')); await sleep(2200); shot('onb-g5');
  await ov.click('text=Got it'); await sleep(600);
  // second launch with the same profile
  await ui.evaluate(() => { S.prefs.startup = 'home'; S.prefs.home = 'localhost:8765/p3.html'; doSave(); }); await sleep(600);
  const profile = b.profile; await b.stop();
  const c = await start({ profile, fresh: false });
  await sleep(1500);
  ok(!(await c.ov.evaluate(() => document.getElementById('setup').classList.contains('on'))), 'second launch: setup does not show again');
  ok(await c.ui.evaluate(() => Object.values(S.tabs).some(t => t.url.includes('/p3.html'))), 'second launch: homepage opened');
  await c.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
