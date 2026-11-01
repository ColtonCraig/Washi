'use strict';
/* Builds the blocklists that ship inside the app (so blocking works on first launch, offline).
   The browser refreshes them in the background every few days.   Run: npm run lists */
const fs = require('fs'), path = require('path');
const { FiltersEngine, adsAndTrackingLists, fullLists } = require('@ghostery/adblocker');
const phish = require('../app/phish');
const OUT = path.join(__dirname, '..', 'resources', 'lists');
const SOURCES = require('../app/lists.json');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  for (const [name, urls] of [['standard', adsAndTrackingLists], ['strict', fullLists]]) {
    const e = await FiltersEngine.fromLists(fetch, urls, { loadCosmeticFilters: true, loadNetworkFilters: true, enableCompression: true });
    const buf = e.serialize(); fs.writeFileSync(path.join(OUT, name + '.bin'), buf);
    console.log(`${name}: ${(buf.length / 1e6).toFixed(1)} MB`);
  }
  const bad = (await Promise.all(SOURCES.badware.map(u => fetch(u).then(r => r.text())))).join('\n');
  const se = FiltersEngine.parse(bad, { loadCosmeticFilters: false }); fs.writeFileSync(path.join(OUT, 'safety.bin'), se.serialize());
  const ph = (await Promise.all(SOURCES.phishing.map(u => fetch(u).then(r => r.text())))).join('\n');
  const pb = phish.build(ph); fs.writeFileSync(path.join(OUT, 'phish.bin'), pb);
  console.log(`safety rules + ${pb.length / 8} phishing domains in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  fs.writeFileSync(path.join(OUT, 'built.json'), JSON.stringify({ at: new Date().toISOString() }));
})().catch(e => { console.error(e); process.exit(1); });
