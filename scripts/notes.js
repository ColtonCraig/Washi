'use strict';
/* The release's highlights, from ui/whatsnew.js (what the update postcard lists): the big items' titles, then fixes.
   Usage: node scripts/notes.js <version>   (prints one line per highlight, at most 5) */
const path = require('path');
global.window = {}; require(path.join(__dirname, '..', 'ui', 'whatsnew.js'));
const v = process.argv[2], r = (window.WHATSNEW || []).find(x => x.v === v);
if (!r) { console.log('Fixes and polish.'); process.exit(0); }
const lines = [...(r.items || []).map(i => i.title), ...(r.fixes || []).map(f => f.replace(/\s*\(.*?\)/g, '').split(/[.:]/)[0].trim())].filter(Boolean).slice(0, 5);
console.log(lines.join('\n'));
