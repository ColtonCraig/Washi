'use strict';
/* Every shortcut in app/shortcuts.js is on the menu bar (keys only work from the menu): a shortcut that isn't there
   silently does nothing, which is how Reader mode's ⌥⌘R and the sticky note's ⇧⌘K went missing. No browser needed. */
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const ids = [...fs.readFileSync(path.join(__dirname, '..', 'app', 'shortcuts.js'), 'utf8').matchAll(/^\s*\['(\w+)', '[^']+', '(\w+)', '([^']*)'\]/gm)].map(m => ({ id: m[1], menu: m[2], key: m[3] }));
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), at = main.indexOf('function buildMenu'), menu = main.slice(at, main.indexOf('\n}\n', at));
ok(ids.length > 30, `read the shortcut list (${ids.length} actions)`);
const missing = ids.filter(a => !new RegExp(`['"]${a.id}['"]`).test(menu));
ok(!missing.length, 'every shortcut is on the menu bar' + (missing.length ? ': missing ' + missing.map(a => a.id).join(', ') : ''));
const dup = ids.filter(a => a.key).map(a => a.key).filter((k, i, all) => all.indexOf(k) !== i && !/^CmdOrCtrl$/.test(k));
ok(!dup.length, 'no two actions share a default key' + (dup.length ? ': ' + dup.join(', ') : ''));
for (const id of ['reader', 'notes', 'today']) ok(ids.some(a => a.id === id), `${id} has a shortcut`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
