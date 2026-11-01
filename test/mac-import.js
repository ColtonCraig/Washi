'use strict';
/* Run on a real Mac (GitHub's macOS runner) with Washi's own engine: ELECTRON_RUN_AS_NODE=1 electron test/mac-import.js
   Checks the importer with Apple's ditto (Safari zips) and Electron's built-in SQLite. */
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-import-')), root = path.join(tmp, 'Support'), zip = path.join(tmp, 'Safari Export.zip');
process.env.WASHI_BM_ROOT = root;
// make-browsers.js uses the zip command; on a Mac, also make the zip the way macOS does (ditto), like Safari's export
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'fixtures', 'make-browsers.js'), root, zip], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
const appleZip = path.join(tmp, 'Safari Export (ditto).zip');
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.join(tmp, 'Safari Export'), appleZip]);
const imp = require('../app/bmimport');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const s = imp.scan();
ok(s.length === 4 && s[0].history === 2, 'scan finds Chrome x2, Brave, Firefox with history counts: ' + JSON.stringify(s.map(x => [x.browser, x.count, x.history])));
const c = imp.read(s[0].src); ok(c.history.length === 2 && c.history[0].title === 'Chrome visited A', 'Chrome history read with the built-in SQLite');
const f = imp.read(s.find(x => x.browser === 'Firefox').src); ok(f.bar.length === 1 && f.history.length === 1, 'Firefox places read');
for (const z of [zip, appleZip]) { const r = imp.readFile(z); ok(r.count === 2 && r.history.length === 2, 'Safari export opened with ditto: ' + path.basename(z)); }
process.exit(fails ? 1 : 0);
