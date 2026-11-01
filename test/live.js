'use strict';
/* Live folders: a folder of GitHub pull requests or feed items that keeps itself up to date. New items get a dot,
   items that leave the source go away (unless open), what you drag out is yours, errors show on the folder, a token
   is sent for private repos, and it all survives a restart. Uses a fake GitHub and feeds on the local test server. */
process.env.WASHI_GITHUB_API = 'http://localhost:8765/gh'; process.env.WASHI_TEST_KEYRING = 'basic';
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const { execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const set = q => execSync(`curl -s "http://localhost:8765/live/set?${q}"`);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-live-'));
(async () => {
  set('prs=1,2,3&items=a,b,c');
  let b = await start({ profile, args: ['--password-store=basic'] }); let { ui, ov, sb } = b; await skipSetup(b);
  execSync(`python3 ${__dirname}/ptr.py move 1300 700`);      // keep the pointer off the sidebar, so nothing wakes up by hovering
  const prompt = async v => { await sleep(600); await ov.fill('#q', v); await ov.keyboard.press('Enter'); await sleep(1500); };
  const F = () => ui.evaluate(() => sp().folders.filter(f => f.live).map(f => ({ id: f.id, name: f.name, kind: f.live.kind, error: f.live.error, tabs: f.tabs.map(k => S.tabs[k] ? [S.tabs[k].title, !!S.tabs[k].unread] : [k]) })));
  // 1. from the folder button's menu
  const away = () => sb.mouse.move(-50, -50);        // a resting pointer wakes tabs that slide under it; keep it out of the way
  await away();
  await sb.click('#nf'); await away(); await sleep(300);           // the folder button offers live folders (native menu; pick its item)
  await ui.evaluate(() => menuClick('nf:github')); await prompt('acme/widgets');
  let f = (await F())[0];
  ok(f && f.name === 'widgets PRs' && f.kind === 'github', 'a GitHub live folder is made from owner/repo: ' + (f && f.name));
  ok(f.tabs.map(t => t[0]).join('|') === '#3 Fix thing 3 (draft)|#2 Fix thing 2 & <stuff>|#1 Fix thing 1', 'it lists the open pull requests, newest first: ' + JSON.stringify(f.tabs.map(t => t[0])));
  ok(f.tabs.every(t => !t[1]), 'the first batch isn\'t marked new');
  ok(await ui.evaluate(() => Object.values(R.live).filter(Boolean).length) === 0, 'nothing loads until you click it');
  // 2. the source changes: #4 opens, #1 merges
  set('prs=2,3,4'); await ui.evaluate(() => refreshLive(true)); await sleep(800);
  f = (await F())[0];
  ok(f.tabs[0][0] === '#4 Fix thing 4' && f.tabs[0][1] === true, 'a new pull request shows up on top, with a dot');
  ok(!f.tabs.some(t => /#1 /.test(t[0])), 'a merged one goes away');
  ok(await sb.$eval(`.fold[data-fid="${f.id}"]>.fh .ct`, e => e.textContent) === '1 new', 'the folder says "1 new"');
  ok(await sb.$$eval('.tab.unread', e => e.length) === 1, 'the new tab has a dot in the sidebar');
  shot('live-folder');
  let a = await sb.evaluate(AUDIT); ok(!a.length, 'live folder in the sidebar: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  // 3. open the new one: the dot goes; one that's open stays even if it leaves the source
  await sb.click('.tab.unread'); await away(); await sleep(1200); execSync(`python3 ${__dirname}/ptr.py move 1300 700`);
  ok(await sb.$$eval('.tab.unread', e => e.length) === 0 && await sb.$eval(`.fold[data-fid="${f.id}"]>.fh .ct`, e => e.textContent) === '3', 'opening it clears the dot and the count');
  set('prs=2,3'); await ui.evaluate(() => refreshLive(true)); await sleep(700);
  f = (await F())[0];
  ok(await ui.evaluate(fid => sp().folders.find(x => x.id === fid).tabs.some(k => S.tabs[k] && /pr=4$/.test(S.tabs[k].url)), f.id), 'a pull request you have open stays, even after it leaves the source');
  // 4. drag one out of the folder: it's yours, and it isn't duplicated
  await ui.evaluate(fid => { const s = sp(), fo = s.folders.find(x => x.id === fid), id = fo.tabs.find(k => /#2 /.test(S.tabs[k].title)); fo.tabs = fo.tabs.filter(k => k !== id); s.tabs.push(id); render(); }, f.id);
  await ui.evaluate(() => refreshLive(true)); await sleep(700);
  const n2 = await ui.evaluate(() => spaceTabs(sp()).filter(id => /#2 /.test(S.tabs[id].title)).length);
  ok(n2 === 1, 'a tab dragged out of the live folder stays put and isn\'t added again');
  // 5. RSS and Atom
  await ui.evaluate(() => newLiveFolder('feed')); await prompt('localhost:8765/feed.xml');
  let fs2 = await F(), rss = fs2.find(x => x.kind === 'feed');
  ok(rss && rss.name === 'Paper News & Notes' && rss.tabs.map(t => t[0]).join('|') === 'Story a — “quoted” & more|Story b — “quoted” & more|Story c — “quoted” & more', 'an RSS feed becomes a folder (titles decoded, nothing from the feed runs): ' + JSON.stringify(rss && rss.tabs));
  await ui.evaluate(() => newLiveFolder('feed')); await prompt('http://localhost:8765/atom.xml');
  const atom = (await F()).find(x => x.name === 'Atom Log');
  ok(atom && atom.tabs.map(t => t[0]).join('|') === 'First post|Second' && await ui.evaluate(() => Object.values(S.tabs).some(t => t.url === 'http://localhost:8765/p3.html?a=1')), 'an Atom feed works too, including relative links');
  // 6. errors: a bad repo doesn't make a folder and says why; a folder whose source breaks shows it
  const before = (await F()).length;
  await ui.evaluate(() => newLiveFolder('github')); await prompt('acme/nope');
  ok((await F()).length === before && /Can't see acme\/nope/.test(await ov.evaluate(() => document.getElementById('toastTxt').textContent)), 'a repo that can\'t be read makes no folder and says why');
  await ui.evaluate(fid => { sp().folders.find(x => x.id === fid).live.src = 'acme/gone'; }, f.id);
  await ui.evaluate(() => refreshLive(true)); await sleep(700);
  ok(/Can't see acme\/gone/.test((await F()).find(x => x.id === f.id).error) && await sb.$eval(`.fold[data-fid="${f.id}"]`, e => e.classList.contains('err')), 'when a source stops working, the folder shows a warning (and keeps its tabs)');
  await ui.evaluate(fid => { sp().folders.find(x => x.id === fid).live.src = 'acme/widgets'; }, f.id);
  // 7. a GitHub token (Settings › Tabs) is sent, and kept encrypted
  await ui.evaluate(() => openSetup('settings', 'apps')); await sleep(1300);
  await ov.fill('.ghk input', 'github_pat_TESTTOKEN1234567890abcdef'); await ov.click('.ghk button:has-text("Save")'); await sleep(500);
  const gk = await ov.evaluate(() => document.querySelector('.ghk').textContent);
  ok(/token is saved/.test(gk), 'saving a token says so: ' + gk);
  a = await ov.evaluate(AUDIT); ok(!a.length, 'Settings › Tabs with live folders: nothing clipped' + (a.length ? '\n      ' + a.join('\n      ') : ''));
  await ov.keyboard.press('Escape'); await sleep(500);
  await ui.evaluate(() => refreshLive(true)); await sleep(700);
  ok(execSync('curl -s http://localhost:8765/live/auth').toString() === 'Bearer github_pat_TESTTOKEN1234567890abcdef', 'the token is sent to GitHub');
  ok(!fs.readFileSync(path.join(profile, 'github-token.json'), 'utf8').includes('TESTTOKEN'), 'and it isn\'t stored in plain text');
  // 8. menu: mark all read, stop updating
  set('prs=2,3,5'); await ui.evaluate(() => refreshLive(true)); await sleep(600);
  ok((await F()).find(x => x.id === f.id).tabs.some(t => t[1]), 'a new item has a dot before marking');
  await ui.evaluate(fid => { R.menuFolder = fid; menuClick('fm:read'); }, f.id); await sleep(300);
  ok((await F()).find(x => x.id === f.id).tabs.every(t => !t[1]), 'Mark All as Read clears every dot');
  await ui.evaluate(fid => { R.menuFolder = fid; menuClick('fm:refresh'); }, f.id); await sleep(700);
  ok((await F()).find(x => x.id === f.id).tabs.length >= 3, 'Refresh Now works from the folder menu');
  // 9. survives a restart and keeps updating
  await ui.evaluate(() => doSave()); await sleep(500); await b.stop();
  set('prs=2,3,5,6');
  b = await start({ profile, fresh: false, port: 9223, args: ['--password-store=basic'] }); ({ ui, sb } = b); await sleep(6500);
  const after = await b.ui.evaluate(() => sp().folders.filter(f => f.live).map(f => f.name));
  ok(after.includes('widgets PRs') && after.includes('Paper News & Notes'), 'live folders survive a restart');
  await b.ui.evaluate(() => refreshLive(true)); await sleep(800);
  ok(await b.ui.evaluate(() => Object.values(S.tabs).some(t => t.title === '#6 Fix thing 6' && t.unread)), 'and keep updating afterwards');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
