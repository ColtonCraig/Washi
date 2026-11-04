'use strict';
/* Washi for Dia (the extension in dia/), loaded into real Chromium with real clicks and typing:
   the new tab (hello, search, apps: open, remove, add; the note stays; the look: dark, paper, tape color, Scrapbook)
   checked for clipping and touching in every look; the popup's Reader (opens on an article, esc leaves, a short page
   says so), Snapshot (copied and saved) and the site's note. The real extension only reaches a page when you click its
   button (activeTab); a test can't click the toolbar, so it runs a copy that may reach the test server's pages. */
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const { sleep, ok, done, AUDIT, GAPS, shot } = require('./lib');
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-dia-ext-'));
fs.cpSync(path.join(__dirname, '..', 'dia'), EXT, { recursive: true });
{ const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')); m.host_permissions = ['<all_urls>']; /* what activeTab gives the real one after a click; Snapshot needs it too */ fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(m)); }
const audit = async (p, what) => { const a = [...await p.evaluate(AUDIT), ...await p.evaluate(GAPS)]; ok(!a.length, what + ': nothing cut off or touching' + (a.length ? '\n      ' + a.slice(0, 8).join('\n      ') : '')); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-dia-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: false, viewport: { width: 1280, height: 820 }, acceptDownloads: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'] });
  let sw = ctx.serviceWorkers()[0]; for (let i = 0; i < 40 && !sw; i++) { await sleep(250); sw = ctx.serviceWorkers()[0]; }
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const id = sw.url().split('/')[2]; ok(/^[a-p]{32}$/.test(id), 'the extension loads');
  const errs = []; ctx.on('page', p => p.on('pageerror', e => errs.push(p.url().slice(0, 60) + ': ' + e.message)));

  // ---------- the new tab ----------
  const nt = await ctx.newPage(); nt.on('pageerror', e => errs.push('newtab: ' + e.message));
  await nt.goto(`chrome-extension://${id}/newtab.html`); await sleep(900);
  ok(/^(Good (morning|afternoon|evening)|Still up)$/.test(await nt.textContent('#greet')), 'the hello, in handwriting: ' + await nt.textContent('#greet'));
  ok(await nt.$$eval('#apps .app:not(.add)', a => a.length) === 7, 'seven apps to start');
  ok(await nt.evaluate(() => document.activeElement.id === 'q'), 'the search box has the cursor');
  await audit(nt, 'new tab, light'); shot('dia-newtab-light');
  // remove one, add one (real clicks and typing)
  await nt.click('#edit'); await sleep(300);
  ok(await nt.evaluate(() => document.body.classList.contains('editing')), 'the pen starts editing');
  await nt.click('#apps .app:nth-child(3) .x', { force: true }); await sleep(400);
  ok(await nt.$$eval('#apps .app:not(.add) b', a => a.map(x => x.textContent).join(',')) === 'Gmail,Calendar,GitHub,Notion,Slack,YouTube', 'the × removes an app (Drive)');
  await nt.click('#apps .app.add', { force: true }); await nt.fill('#addf input[name=u]', 'localhost:8765/p2.html'); await nt.fill('#addf input[name=n]', 'Test app'); await nt.click('#addf button[type=submit]'); await sleep(400);
  { const names = await nt.$$eval('#apps .app:not(.add) b', a => a.map(x => x.textContent)); ok(names.length === 7 && names.includes('Test app'), 'Add an app: it\'s there: ' + names.join(',')); }
  await nt.fill('#addf input[name=u]', 'not an address'); await nt.click('#addf button[type=submit]'); await sleep(200);
  ok(/doesn't look like a web address/.test(await nt.textContent('#addf .err')), 'a bad address says so');
  await audit(nt, 'new tab, editing'); shot('dia-newtab-edit');
  await nt.click('#edit'); await sleep(300);
  // the note stays
  await nt.click('#ntx'); await nt.keyboard.type('Buy washi tape'); await sleep(600);
  // the look
  await nt.click('#gear'); await sleep(400);
  ok(await nt.isVisible('#look'), 'the gear opens the Washi look');
  await audit(nt, 'the look card'); shot('dia-look');
  await nt.click('#look [data-mode=dark]'); await sleep(300);
  ok(await nt.evaluate(() => document.documentElement.classList.contains('dark') && getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() === '#2b2520'), 'Dark: Cocoa paper');
  await nt.click('#look [data-paper=midnight]'); await nt.click('#look [data-color="255"]'); await sleep(300);
  ok(await nt.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() === '#22273a' && getComputedStyle(document.documentElement).getPropertyValue('--tape').trim() === '#3d63ff'), 'Midnight paper, Blueberry tape');
  await nt.click('#look [data-sw=scrapbook]'); await sleep(300);
  ok(await nt.evaluate(() => document.documentElement.classList.contains('scrapbook')), 'Scrapbook on');
  await nt.fill('#nm', 'Colton'); await sleep(600);
  ok(/, Colton$/.test(await nt.textContent('#greet')), 'your name in the hello');
  await nt.keyboard.press('Escape'); await sleep(300);
  ok(!(await nt.isVisible('#look')), 'esc puts the look away');
  await audit(nt, 'new tab, dark Scrapbook'); shot('dia-newtab-dark-scrap');
  await nt.reload(); await sleep(900);
  ok(await nt.inputValue('#ntx') === 'Buy washi tape' && await nt.evaluate(() => document.documentElement.classList.contains('dark')), 'a new tab later: the note and the look are still there');
  await nt.setViewportSize({ width: 480, height: 760 }); await sleep(400); await audit(nt, 'new tab, a narrow window'); shot('dia-newtab-narrow');
  await nt.setViewportSize({ width: 1280, height: 820 });
  // an app opens its site, and the search box goes to an address
  await nt.click('#apps .app:not(.add) >> text=Test app'); await nt.waitForURL(/p2\.html/, { timeout: 5000 }).catch(() => {});
  ok(/localhost:8765\/p2\.html/.test(nt.url()), 'clicking an app opens it');
  await nt.goto(`chrome-extension://${id}/newtab.html`); await sleep(600);
  await nt.fill('#q', 'localhost:8765/p1.html'); await nt.keyboard.press('Enter'); await nt.waitForURL(/p1\.html/, { timeout: 5000 }).catch(() => {});
  ok(/localhost:8765\/p1\.html/.test(nt.url()), 'typing an address and Return goes there');
  await nt.goto(`chrome-extension://${id}/newtab.html`); await sleep(400);
  await nt.evaluate(() => chrome.storage.local.set({ look: { ...window.WASHI.look, mode: 'light', light: 'cream', color: 40, scrapbook: false } })); await sleep(300);

  // ---------- the popup on an article ----------
  const art = await ctx.newPage(); await art.goto('http://localhost:8765/article.html'); await sleep(800);
  const tabId = await sw.evaluate(() => new Promise(r => chrome.tabs.query({ url: 'http://localhost:8765/article.html' }, t => r(t[0].id))));
  const popup = async () => { const p = await ctx.newPage(); await p.setViewportSize({ width: 344, height: 640 }); await p.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`); await sleep(600); return p; };
  let pp = await popup();
  ok(await pp.textContent('#host') === 'localhost' && /Washi Tape/.test(await pp.textContent('#sub')), 'the popup names the site and the page');
  await audit(pp, 'popup, light'); shot('dia-popup');
  // the site's note: there next time
  await pp.click('#notebtn'); await pp.keyboard.type('Read later'); await sleep(700);
  await pp.close(); pp = await popup();
  ok(await pp.isVisible('#note') && await pp.inputValue('#note') === 'Read later', 'the site\'s note is there next time');
  await audit(pp, 'popup with a note'); shot('dia-popup-note');
  await pp.evaluate(() => chrome.storage.local.set({ look: { ...window.WASHI.look, mode: 'dark', scrapbook: true } })); await sleep(400);
  await audit(pp, 'popup, dark Scrapbook'); shot('dia-popup-dark');
  await pp.evaluate(() => chrome.storage.local.set({ look: { ...window.WASHI.look, mode: 'light', scrapbook: false } })); await sleep(300);
  await pp.click('#notebtn'); await sleep(300);
  ok(!(await pp.isVisible('#note')), 'Note again folds it away: ' + JSON.stringify(await pp.evaluate(() => [document.getElementById('notesec').hidden, document.getElementById('notebtn').className])));

  // ---------- Reader ----------
  await pp.evaluate(t => chrome.scripting.executeScript({ target: { tabId: t }, files: ['theme.js', 'vendor/Readability.js', 'vendor/Readability-readerable.js', 'reader-cs.js'] }), tabId); await sleep(900);
  ok(await art.evaluate(() => { const h = document.querySelector('washi-reader'); return !!h && /Washi Tape/.test(h.shadowRoot.querySelector('h1.t').textContent); }), 'Reader: the article on a sheet of paper');
  await art.bringToFront(); shot('dia-reader');
  await art.keyboard.press('Escape'); await sleep(400);
  ok(await art.evaluate(() => !document.querySelector('washi-reader')), 'esc leaves Reader');
  const short = await ctx.newPage(); await short.goto('http://localhost:8765/p1.html'); await sleep(500);
  const shortId = await sw.evaluate(() => new Promise(r => chrome.tabs.query({ url: 'http://localhost:8765/p1.html' }, t => r(t[0].id))));
  await pp.evaluate(t => chrome.scripting.executeScript({ target: { tabId: t }, files: ['theme.js', 'vendor/Readability.js', 'vendor/Readability-readerable.js', 'reader-cs.js'] }), shortId); await sleep(600);
  ok(await short.evaluate(() => !document.querySelector('washi-reader') && /works on articles/.test(document.querySelector('washi-toast') ? document.querySelector('washi-toast').shadowRoot.textContent : '')), 'a short page: Reader says it works on articles');

  // ---------- Snapshot (the popup in its own window, the article in front) ----------
  await art.bringToFront(); await sleep(300);
  const win = await sw.evaluate(async ({ id, t }) => { const w = await chrome.windows.create({ url: `chrome-extension://${id}/popup.html?tab=${t}`, type: 'popup', width: 360, height: 640 }); return w.id; }, { id, t: tabId }); await sleep(1200);
  const sp = ctx.pages().find(p => p.url().includes('popup.html?tab=' + tabId) && p !== pp);
  if (sp) { await sp.click('#snap'); await sleep(1800); }
  const dl = await sw.evaluate(() => new Promise(r => chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }, d => r(d[0] && /^data:image\/png/.test(d[0].url) && d[0].state !== 'interrupted' ? 'Snapshot localhost (a png).png' : ''))));   // (the test browser renames what it downloads)
  ok(!!sp && /Snapshot localhost .*\.png$/.test(dl) && /Saved to Downloads|Copied/.test(await sp.textContent('#say')), 'Snapshot: saved to Downloads (' + path.basename(dl || 'nothing') + ') ' + (sp ? await sp.textContent('#say') : 'no popup window: ' + ctx.pages().map(p => p.url().slice(0, 70)).join(' ')));
  await sw.evaluate(w => chrome.windows.remove(w), win).catch(() => {});

  // ---------- a browser page ----------
  const np = await ctx.newPage(); await np.goto('chrome://version'); await sleep(300);
  const npId = await sw.evaluate(() => new Promise(r => chrome.tabs.query({ url: 'chrome://version/' }, t => r(t[0] ? t[0].id : 0))));
  const pv = await ctx.newPage(); await pv.goto(`chrome-extension://${id}/popup.html?tab=${npId}`); await sleep(500);
  ok(/can't read or snap it/.test(await pv.textContent('#body')), 'on one of the browser\'s own pages the popup says what it can\'t do');

  ok(!errs.length, 'no errors on any page' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await ctx.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
