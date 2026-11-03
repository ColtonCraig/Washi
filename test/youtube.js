'use strict';
/* YouTube with blocking on: the player's own requests to YouTube (ad breaks, mid-roll info, stats, logging) go through,
   since blocking them can leave the player blank (seen signed in); other companies' ad servers are still blocked, and
   those same YouTube addresses are still blocked on other sites. Checked against the real lists Washi ships. */
const { start, sleep, ok, done, skipSetup } = require('./lib');
(async () => {
  const b = await start(); const { ui } = b; await skipSetup(b);
  const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const own = ['https://www.youtube.com/youtubei/v1/player/ad_break?prettyPrint=false', 'https://www.youtube.com/get_midroll_info?ei=x', 'https://www.youtube.com/api/stats/ads?ver=2', 'https://www.youtube.com/youtubei/v1/log_event?alt=json', 'https://www.youtube.com/pagead/adview?ai=x'];
  const blocked = (page, url) => ui.evaluate(([p, u]) => B.setupAct({ type: 'test:block', page: p, url: u }).then(r => r.blocked), [page, url]);
  for (const mode of ['standard', 'strict']) {
    await ui.evaluate(m => B.setupMsg({ type: 'prefs', patch: { blocking: m } }), mode); await sleep(800);
    ok(await blocked('https://example.com/', 'https://googleads.g.doubleclick.net/pagead/id'), `${mode}: the lists are on (an ad server is blocked)`);
    const r = []; for (const u of own) r.push(await blocked(YT, u));
    ok(r.every(x => !x), `${mode}: on YouTube, the player's own requests to YouTube go through (${r})`);
    ok(await blocked(YT, 'https://googleads.g.doubleclick.net/pagead/id') && await blocked(YT, 'https://static.doubleclick.net/instream/ad_status.js'), `${mode}: other companies' ad servers are still blocked on YouTube`);
    const el = []; for (const u of own.slice(0, 3)) el.push(await blocked('https://example.com/', u));
    ok(el.some(x => x), `${mode}: those YouTube ad addresses are still blocked on other sites (${el})`);
  }
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
