'use strict';
/* Google sign-in: on Google's account pages Washi must send its honest identity (header AND page JavaScript agree),
   and everywhere else a plain Chrome identity. 127.0.0.1:8765 stands in for accounts.google.com here. */
process.env.WASHI_AUTH_HOSTS = '127.0.0.1:8765';
const { start, sleep, ok, done, skipSetup } = require('./lib');
(async () => {
  const b = await start(); const { ui } = b;
  await skipSetup(b);
  const title = async () => ui.evaluate(() => S.tabs[R.a].title);
  const check = async (what, auth) => {
    const t = await title(); const [, nav, hdr] = t.split('|'); if (process.env.V) console.log(what, '| nav', nav, '| hdr', hdr);
    ok(!!nav && nav === hdr, `${what}: page JavaScript and request header agree`);
    if (auth) ok(/ Washi\/[\d.]+ Chrome\/.* Electron\/[\d.]+ /.test(hdr || ''), `${what}: honest identity sent (${(hdr || '').match(/Washi\/\S+|Electron\/\S+/g)})`);
    else ok(!/Electron|Washi/.test(hdr || ''), `${what}: plain Chrome identity`);
  };
  await ui.evaluate(() => openTab('http://localhost:8765/ua')); await sleep(1500);
  await check('ordinary site', false);
  await ui.evaluate(() => navigate('http://127.0.0.1:8765/ua')); await sleep(1500);
  await check('typed into the address bar → sign-in page', true);
  await ui.evaluate(() => navigate('http://localhost:8765/ua')); await sleep(1500);
  await check('back to an ordinary site', false);
  await ui.evaluate(() => navigate('http://localhost:8765/go-ua')); await sleep(1500);
  await check('redirected to the sign-in page', true);
  await ui.evaluate(() => openTab('http://localhost:8765/links.html')); await sleep(1200);
  const lp = b.pages().find(p => p.url().includes('/links.html'));
  await lp.evaluate(() => { const a = document.getElementById('l'); a.href = 'http://127.0.0.1:8765/ua'; a.click(); }); await sleep(1500);
  await check('clicked a link to the sign-in page', true);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
