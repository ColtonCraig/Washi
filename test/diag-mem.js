'use strict';
/* Diagnostic (needs the internet): memory with real, heavy sites, on GitHub's Mac. Opens a dozen sites as tabs, visits
   each, and reports memory by kind of process; then puts the background ones to sleep the way Washi does and reports
   again. Usage: node test/diag-mem.js (from .github/workflows/mac-test.yml) */
const { start, sleep, skipSetup } = require('./lib');
const SITES = (process.env.SITES || 'https://en.wikipedia.org/wiki/Paper https://www.youtube.com/ https://www.reddit.com/ https://www.nytimes.com/ https://github.com/electron/electron https://www.amazon.com/ https://www.cnn.com/ https://news.ycombinator.com/ https://www.bbc.com/news https://stackoverflow.com/questions https://www.espn.com/ https://www.theverge.com/').split(/\s+/).filter(Boolean);
(async () => {
  const b = await start({ sandbox: process.platform === 'darwin' }); const { ui } = b; await skipSetup(b);
  const m = async label => { const r = await ui.evaluate(() => B.setupAct({ type: 'test:metrics', split: true })); console.log(`## ${label}: total ${r.total} MB, ${r.procs} processes, ${r.tabsLive} live tabs — ` + Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')); return r; };
  await sleep(2000); const empty = await m('empty window');
  await ui.evaluate(s => { for (const u of s.slice().reverse()) openTab(u, { bg: true }); }, SITES); await sleep(1000);
  const ids = await ui.evaluate(() => sp().tabs.filter(k => !k.startsWith('f:')));
  for (const id of ids) { await ui.evaluate(id => selectTab(id), id); await sleep(6000); }
  await sleep(5000); const all = await m(`${ids.length} real sites, all visited`);
  const per = await ui.evaluate(async () => { const out = []; for (const id of Object.keys(S.tabs)) out.push([S.tabs[id].url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), id]); return out; });
  await ui.evaluate(() => { const shown = new Set([R.a, R.b]); for (const id in R.live) if (R.live[id] && !shown.has(id)) { B.tabSleep(id); R.live[id] = false; } render(); }); await sleep(6000);
  const after = await m('background tabs asleep'); await sleep(30000); await m('30 s later');
  console.log(`## summary: Washi itself ${empty.total} MB; with ${ids.length} real sites ${all.total} MB (about ${Math.round((all.total - empty.total) / ids.length)} MB a tab); with the background ones asleep ${after.total} MB (${Math.round(100 - after.total / all.total * 100)}% less)`);
  void per; await b.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
