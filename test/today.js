'use strict';
/* Sign in to your apps, bringing bookmarks and history over (Safari's export, Chrome-type browsers, Firefox), and
   the Today page. Pretend apps live on the test server: /app/<name> is "signed out" until /app/<name>?login=1 sets its
   cookie. Everything is clicked with the real mouse where it matters, and every screen is checked for clipping. */
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-today-')), root = path.join(tmp, 'Support'), zip = path.join(tmp, 'Safari Export.zip');
execSync(`node ${__dirname}/fixtures/make-browsers.js "${root}" "${zip}"`, { stdio: 'ignore' });
Object.assign(process.env, { WASHI_APPS_TEST: 'http://localhost:8765', WASHI_GITHUB_API: 'http://localhost:8765/gh', WASHI_TEST_KEYRING: 'basic', WASHI_BM_ROOT: root, WASHI_TEST_PICK: zip });
const { start, sleep, ok, done, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const X0 = 60, Y0 = 57;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-today-p-'));
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : '')); };
const click = async (page, sel) => { const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); if (!r) throw new Error('not found: ' + sel); ptr(`move ${X0 + r.x} ${Y0 + r.y}`); await sleep(80); ptr('down'); ptr('up'); };
const today = ui => ui.evaluate(() => ({ shown: !document.getElementById('today').hidden, text: document.getElementById('today').innerText }));

(async () => {
  let b = await start({ profile }); let { ui, ov } = b;
  await sleep(1200);
  ok(await ov.evaluate(() => SETUP.isOpen()), 'setup opens on first launch');
  await ov.click('button:has-text("Let\'s set it up")'); await sleep(700);
  await ov.click('.next'); await sleep(900); await ov.click('.next'); await sleep(1300);
  ok(await ov.evaluate(() => document.querySelector('.crumb.on').textContent) === 'Your apps', 'after the basics comes "Your apps"');

  // ---------- 1. pick apps, one going to Work with its own logins ----------
  const tiles = await ov.evaluate(() => [...document.querySelectorAll('.apptile b')].map(e => e.textContent));
  ok(tiles.join() === 'Mail,Notes,Code,Tasks', 'the apps to pick from: ' + tiles);
  ok(await ov.evaluate(() => /Keep Work's logins separate/.test(document.querySelector('.pg').innerText)), 'it offers to keep Work\'s logins separate (like a work profile)');
  await click(ov, '.apptile[data-app="gmail"]'); await sleep(250);
  ok(await ov.evaluate(() => document.querySelector('.apptile[data-app="gmail"]').classList.contains('on') && document.querySelector('.apptile[data-app="gmail"] .atag').textContent === 'Pinned'), 'clicking an app picks it: Pinned');
  await click(ov, '.tgls .sw'); await sleep(400);
  ok(await ui.evaluate(() => S.spaces.find(x => x.id === 'work').isolated), 'Work now keeps its own logins');
  await click(ov, '.apptile[data-app="github"]'); await sleep(250);
  ok(await ov.evaluate(() => document.querySelector('.apptile[data-app="github"] .atag').textContent) === 'Work logins', 'a work app goes to Work\'s logins by default');
  await click(ov, '.apptile[data-app="linear"]'); await sleep(250);
  await click(ov, '.apptile[data-app="linear"] .atag'); await sleep(250);
  ok(await ov.evaluate(() => document.querySelector('.apptile[data-app="linear"] .atag').textContent) === 'Pinned', 'tapping the tag changes where it goes');
  await click(ov, '.apptile[data-app="notion"]'); await sleep(200); await click(ov, '.apptile[data-app="notion"]'); await sleep(200);
  ok(!(await ov.evaluate(() => document.querySelector('.apptile[data-app="notion"]').classList.contains('on'))), 'clicking again un-picks it');
  // ---------- 2. bring your stuff over: Safari's export, right on the same page ----------
  await sleep(500);
  const rows = await ov.evaluate(() => [...document.querySelectorAll('.bmrow')].map(r => r.querySelector('b').textContent + '/' + r.querySelector('small').textContent));
  ok(rows[0].startsWith('Safari/') && rows.some(r => r === 'Chrome/Colton · 4 bookmarks · 2 pages of history') && rows.some(r => r === 'Firefox/default-release · 2 bookmarks · 1 page of history') && rows.length === 5,
    'it finds Safari (export), Chrome (two profiles), Brave and Firefox, with bookmarks and history counts: ' + JSON.stringify(rows));
  await audit(ov, '"Your apps" step');
  shot('today-apps-step');
  await click(ov, '.bmrow:first-child .btn');
  await ov.waitForSelector('.bmi .okay', { timeout: 8000 });
  let msg = await ov.$eval('.bmi .okay', e => e.textContent);
  ok(/Brought in 2 bookmarks in 2 folders, 2 pages of history and 1 password from Safari/.test(msg), 'Safari\'s export comes in: bookmarks, history (failed loads left out) and its passwords, straight into the encrypted store: ' + msg);
  ok(await ui.evaluate(() => B.setupAct({ type: 'pw:list' }).then(l => l.logins.length === 1 && l.logins[0].host === 'x.example' && l.logins[0].user === 'u')), 'the password from Safari is saved (and Settings never sees it in plain text)');
  ok(await ui.evaluate(() => S.history.some(h => h.title === 'Safari visited one') && S.history.some(h => h.title === 'Safari work page') && !S.history.some(h => /broken/.test(h.url))), 'history from both Safari profiles joined Washi\'s');
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.title === 'Safari fav')), 'Safari\'s Favorites joined the bookmarks bar');
  // ---------- 3. leaving the step adds the apps ----------
  await ov.click('.next'); await sleep(1200);
  let st = await ui.evaluate(() => ({ pins: S.pins.map(id => S.tabs[id].title), work: (() => { const w = S.spaces.find(x => x.id === 'work'), f = w.folders.find(x => x.name === 'Apps'); return f && f.tabs.map(id => S.tabs[id].title); })(), apps: S.prefs.apps }));
  ok(st.pins.join() === 'Mail,Tasks', 'Mail and Tasks are pinned: ' + st.pins);
  ok(st.work && st.work.join() === 'Code', 'Code went in an "Apps" folder in Work, to use Work\'s logins');
  ok(Object.keys(st.apps).sort().join() === 'github,gmail,linear', 'Washi remembers which apps you picked');
  await ov.click('.crumb >> text=Your apps'); await sleep(900);
  ok(await ov.evaluate(() => ['gmail', 'github', 'linear'].every(id => document.querySelector(`.apptile[data-app="${id}"]`).disabled) && document.querySelector('.apptile[data-app="gmail"] .atag').textContent === 'Added'), 'going back shows them as added (nothing doubles up)');
  await ov.evaluate(() => SETUP.finish()); await sleep(1600);

  // ---------- 4. Today ----------
  let t = await today(ui);
  ok(t.shown && /Good (morning|afternoon|evening)|Up late/.test(t.text), 'setup ends on the Today page');
  ok(/Sign in to your apps\s*0 of 2/.test(t.text), 'it asks you to sign in to your pinned apps (0 of 2)');
  ok(/Pinned[\s\S]*Mail[\s\S]*Tasks/.test(t.text) && /Recently visited[\s\S]*Safari visited one/.test(t.text), 'it shows your pinned apps and what you visited recently');
  ok(/Bookmarks[\s\S]*Safari fav/.test(t.text) && /GitHub[\s\S]*Connect GitHub/.test(t.text), 'your bookmarks, and an offer to connect GitHub (you picked it)');
  await audit(ui, 'Today');
  shot('today-1');
  // search box opens the command bar
  await click(ui, '.tsearch'); await sleep(600);
  ok(await ov.evaluate(() => document.getElementById('cmd').classList.contains('on')), 'the search box opens the command bar');
  await ov.keyboard.press('Escape'); await sleep(500);
  // sign in to Mail with the real mouse: the app opens, you sign in, Today checks it off
  await click(ui, '.tapp[data-id="gmail"]'); await sleep(1500);
  ok(await ui.evaluate(() => S.tabs[focusedId()].app === 'gmail'), 'clicking Mail opens it');
  const mail = b.pages().find(p => p.url().includes('/app/mail'));
  ok(/please sign in/.test(await mail.textContent('#state')), 'Mail says you\'re signed out');
  await mail.click('#go'); await sleep(1200);
  ok(/signed in/.test(await mail.textContent('#state')), 'you sign in');
  K('down:Control_L down:Shift_L tap:h up:Shift_L up:Control_L'); await sleep(1500);
  t = await today(ui);
  ok(t.shown, '⇧⌘H goes back to Today');
  ok(/1 of 2/.test(t.text) && await ui.evaluate(() => document.querySelector('.tapp[data-id="gmail"]').classList.contains('ok')), 'Mail is checked off (signed in)');
  // Tasks has no sign-in cookie: it's checked off once its page isn't the sign-in page
  await click(ui, '.tapp[data-id="linear"]'); await sleep(1500);
  ok(/tasks sign in/.test(await ui.evaluate(() => S.tabs[focusedId()].title)) && (await ui.evaluate(() => S.tabs[focusedId()].url)).endsWith('/app/tasks/login'), 'Tasks sends you to its sign-in page');
  K('down:Control_L down:Shift_L tap:h up:Shift_L up:Control_L'); await sleep(1200);
  ok(!(await ui.evaluate(() => document.querySelector('.tapp[data-id="linear"]').classList.contains('ok'))), 'still on the sign-in page: not checked off');
  await click(ui, '.tapp[data-id="linear"]'); await sleep(1200);
  await b.pages().find(p => p.url().includes('/app/tasks')).click('#go'); await sleep(1300);
  await ui.evaluate(() => runAction('today')); await sleep(1300);
  t = await today(ui);
  ok(!/Sign in to your apps/.test(t.text), 'all signed in: the card goes away by itself');
  shot('today-2');
  // Code lives in Work with Work's own logins
  await ui.evaluate(() => switchSpace('work')); await sleep(1300);
  ok(await ui.evaluate(() => S.tabs[focusedId()].app === 'github'), 'switching to Work opens Code, its app');
  await ui.evaluate(() => runAction('today')); await sleep(1200);
  t = await today(ui);
  ok(/Sign in to your apps\s*2 of 3[\s\S]*Code/.test(t.text), 'Work\'s Today also lists Code, the app that lives in Work');
  await ui.evaluate(() => { const w = sp(), f = w.folders.find(x => x.name === 'Apps'); selectTab(f.tabs[0]); }); await sleep(1500);
  const code = b.pages().find(p => p.url().includes('/app/code'));
  await code.click('#go'); await sleep(1200);
  const jars = await ui.evaluate(async () => ({ work: await B.setupAct({ type: 'apps:status', apps: [{ id: 'github', cookie: { url: 'http://localhost:8765', name: 'test_code' }, space: { id: 'work', isolated: true } }] }), shared: await B.setupAct({ type: 'apps:status', apps: [{ id: 'github', cookie: { url: 'http://localhost:8765', name: 'test_code' }, space: null }] }) }));
  ok(jars.work.github === true && jars.shared.github === false, 'signing in to Code in Work stays in Work\'s cookie jar (your other spaces aren\'t signed in)');
  await ui.evaluate(() => switchSpace('home')); await sleep(1000);

  // ---------- 5. connect GitHub: pull requests waiting on you ----------
  await ui.evaluate(() => runAction('today')); await sleep(1000);
  await click(ui, '[data-a="ghConnect"]'); await sleep(1500);
  ok(await ov.evaluate(() => SETUP.isOpen() && document.querySelector('.rail button.on').dataset.s === 'apps'), 'Connect GitHub opens Settings › Apps');
  await audit(ov, 'Settings › Apps');
  shot('today-settings-apps');
  ok(await ov.evaluate(() => [...document.querySelectorAll('#sec-apps .apptile.have')].map(e => e.dataset.app).sort().join()) === 'github,gmail,linear', 'Settings › Apps shows what\'s already added');
  await ov.fill('#sec-apps .ghk input', 'ghp_' + 'x'.repeat(36)); await ov.click('#sec-apps .ghk button:has-text("Save")'); await sleep(500);
  ok(await ov.evaluate(() => /token is saved/.test(document.querySelector('#sec-apps .ghk').textContent)), 'the token is saved (in the Keychain on a Mac)');
  // add one more app from Settings
  await ov.click('#sec-apps .apptile[data-app="notion"]'); await sleep(200);
  ok(await ov.evaluate(() => document.querySelector('#sec-apps .apptile[data-app="notion"] .atag').textContent) === 'Work logins', 'Notes is a work app: it would go in Work');
  await ov.click('#sec-apps .apptile[data-app="notion"] .atag'); await sleep(200);
  ok(await ov.evaluate(() => document.querySelector('#sec-apps .sbtns .btn').textContent) === 'Add 1 app', 'the button says what it will do');
  await ov.click('#sec-apps .sbtns .btn'); await sleep(600);
  const pinsNow = await ui.evaluate(() => S.pins.map(id => S.tabs[id].app).join());
  ok(pinsNow === 'gmail,linear,notion', 'Notes is added from Settings: ' + pinsNow);
  await ov.evaluate(() => SETUP.finish()); await sleep(2500);
  t = await today(ui);
  ok(/Waiting on your review\s*2[\s\S]*Add dark mode toggle[\s\S]*Fix <script> escaping[\s\S]*Your open pull requests\s*1[\s\S]*My work in progress[\s\S]*acme\/widgets #7 · draft/.test(t.text), 'GitHub shows pull requests waiting on your review and your own (titles shown as text, not code)');
  ok(await ui.evaluate(() => !document.querySelector('#today script')), 'nothing from GitHub runs as code');
  ok(/Sign in to your apps\s*2 of 3/.test(t.text), 'the new app joins the sign-in list (2 of 3)');
  await audit(ui, 'Today with GitHub');
  shot('today-3');
  await click(ui, '.tgh .trow'); await sleep(1300);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.endsWith('?pr=41')), 'clicking a pull request opens it');
  // GitHub down: a clear message and Try again
  execSync('curl -s http://localhost:8765/gh/down?on=1');
  await ui.evaluate(() => runAction('today')); await sleep(600);
  await click(ui, '.tgh [data-a="ghRetry"]'); await sleep(1500);
  ok(/GitHub answered 503/.test((await today(ui)).text) && await ui.evaluate(() => !!document.querySelector('.tgh .tlink[data-a="ghRetry"]')), 'GitHub down: says so, with Try again');
  execSync('curl -s http://localhost:8765/gh/down?on=0');
  await click(ui, '.tgh .tlink[data-a="ghRetry"]'); await sleep(1500);
  ok(/Waiting on your review/.test((await today(ui)).text), 'and Try again works when it\'s back');
  // hide the sign-in card
  await click(ui, '[data-a="hideSign"]'); await sleep(500);
  ok(!/Sign in to your apps/.test((await today(ui)).text), 'Hide puts the sign-in card away');
  // a pinned app and a bookmark from Today
  await click(ui, '.tbm'); await sleep(1300);
  ok(await ui.evaluate(() => S.tabs[focusedId()].url.endsWith('?safari')), 'a bookmark on Today opens it');

  // ---------- 6. Chrome and Firefox: bookmarks and history ----------
  await ui.evaluate(() => openSetup('settings', 'bookmarks')); await sleep(1500);
  await ov.evaluate(() => [...document.querySelectorAll('#sec-bookmarks .bmrow')].find(r => /Colton/.test(r.textContent)).querySelector('.btn').click());
  await ov.waitForFunction(() => /from Chrome/.test((document.querySelector('#sec-bookmarks .bmi .okay') || {}).textContent || ''), null, { timeout: 8000 });
  msg = await ov.$eval('#sec-bookmarks .bmi .okay', e => e.textContent);
  ok(/Brought in 4 bookmarks in 3 folders and 2 pages of history from Chrome \(Colton\)/.test(msg), 'Chrome: bookmarks and history: ' + msg);
  ok(await ui.evaluate(() => { const i = S.history.findIndex(h => h.title === 'Chrome visited A'), j = S.history.findIndex(h => h.title === 'Chrome visited B'); return i > -1 && j > i && !S.history.some(h => /hidden\.example|chrome:\/\//.test(h.url)); }), 'Chrome history comes in newest first; hidden pages and chrome:// pages are left out');
  await ov.evaluate(() => [...document.querySelectorAll('#sec-bookmarks .bmrow')].find(r => /Colton/.test(r.textContent)).querySelector('.btn').click());
  await ov.waitForFunction(() => /already here/.test((document.querySelector('#sec-bookmarks .bmi .okay') || {}).textContent || ''), null, { timeout: 8000 });
  ok(true, 'importing Chrome again: "Everything from Chrome (Colton) was already here."');
  await ov.evaluate(() => [...document.querySelectorAll('#sec-bookmarks .bmrow')].find(r => /Firefox/.test(r.textContent)).querySelector('.btn').click());
  await ov.waitForFunction(() => /from Firefox/.test((document.querySelector('#sec-bookmarks .bmi .okay') || {}).textContent || ''), null, { timeout: 8000 });
  ok(await ui.evaluate(() => S.bookmarks.some(n => n.title === 'Fox toolbar') && S.bookmarks.some(n => n.type === 'folder' && n.name === 'More from Firefox' && n.kids.some(k => k.title === 'Fox menu')) && S.history.some(h => h.title === 'Firefox visited X')), 'Firefox: toolbar → bar, menu → folder, history joins');
  await audit(ov, 'Settings › Bookmarks import');
  shot('today-import');
  await ov.evaluate(() => SETUP.finish()); await sleep(800);
  const hcount = await ui.evaluate(() => S.history.length);

  // ---------- 7. look: narrow window, dark mode ----------
  await ui.evaluate(() => runAction('today')); await sleep(900);
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'dark' } })); await sleep(700);
  await audit(ui, 'Today in dark mode');
  shot('today-dark');
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { mode: 'light' } })); await sleep(400);
  await ui.setViewportSize({ width: 820, height: 640 }); await sleep(700);
  const cols = await ui.evaluate(() => [innerWidth, getComputedStyle(document.querySelector('.tgrid')).gridTemplateColumns, document.querySelector('.tgrid').className]);
  ok(cols[1].split(' ').length === 1, 'a narrow window stacks Today into one column: ' + JSON.stringify(cols));
  await audit(ui, 'Today in a narrow window');
  shot('today-narrow');
  await ui.setViewportSize({ width: 1320, height: 840 }); await sleep(500);

  // ---------- 8. after a restart ----------
  await b.stop(); b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(2000);
  st = await ui.evaluate(() => ({ apps: Object.keys(S.prefs.apps || {}).sort().join(), hide: S.prefs.appsHide, hist: S.history.length, pins: S.pins.length }));
  ok(st.apps === 'github,gmail,linear,notion' && st.hide === true && st.hist >= hcount && st.pins === 3, JSON.stringify([st, hcount]) + ' apps, the hidden card, imported history and pins are all still there after quitting');
  await ui.evaluate(() => runAction('today')); await sleep(1500);
  t = await today(ui);
  ok(t.shown && /Waiting on your review/.test(t.text), 'Today comes back with GitHub still connected');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
