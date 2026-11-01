'use strict';
/* Makes a pretend ~/Library/Application Support with Chrome (two profiles), Brave, an empty Dia and Firefox, plus a
   Safari export .zip, all in the real on-disk formats. Usage: node make-browsers.js <root> <safari.zip> */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const [root, zip] = process.argv.slice(2);
const mk = (dir, files) => { fs.mkdirSync(dir, { recursive: true }); for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), typeof v === 'string' ? v : JSON.stringify(v)); };
const now = Date.now(), chromeT = ms => (ms + 11644473600000) * 1000;
function chromeHistory(file, rows) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE urls(id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL)');
  const ins = db.prepare('INSERT INTO urls(url, title, last_visit_time, hidden) VALUES(?, ?, ?, ?)');
  for (const [u, t, ago, hidden] of rows) ins.run(u, t, chromeT(now - ago), hidden ? 1 : 0);
  db.close();
}
const chrome = path.join(root, 'Google/Chrome');
mk(path.join(chrome, 'Default'), { Bookmarks: { roots: {
  bookmark_bar: { children: [{ type: 'url', name: 'Chrome One', url: 'http://localhost:8765/p1.html?c1' }, { type: 'folder', name: 'Dev', children: [{ type: 'url', name: 'Chrome Dev', url: 'http://localhost:8765/p2.html?c2' }, { type: 'folder', name: 'Deeper', children: [{ type: 'url', name: 'Deep', url: 'http://localhost:8765/p3.html?c3' }] }] }, { type: 'url', name: 'Script', url: 'javascript:alert(1)' }] },
  other: { children: [{ type: 'url', name: 'Other One', url: 'http://localhost:8765/links.html?o1' }] }, synced: { children: [] } } } });
chromeHistory(path.join(chrome, 'Default', 'History'), [['https://chrome-history.example/a', 'Chrome visited A', 60e3], ['https://chrome-history.example/b', 'Chrome visited B', 3600e3], ['https://hidden.example/', 'Hidden', 1e3, true], ['chrome://settings', 'Settings', 1e3]]);
mk(path.join(chrome, 'Profile 1'), { Bookmarks: { roots: { bookmark_bar: { children: [{ type: 'url', name: 'Work thing', url: 'http://localhost:8765/p1.html?w' }] }, other: { children: [] } } } });
fs.writeFileSync(path.join(chrome, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Colton' }, 'Profile 1': { name: 'Work' } } } }));
mk(path.join(root, 'BraveSoftware/Brave-Browser/Default'), { Bookmarks: { roots: { bookmark_bar: { children: [{ type: 'url', name: 'Brave One', url: 'http://localhost:8765/p2.html?b1' }] }, other: { children: [] } } } });
mk(path.join(root, 'Dia/User Data/Default'), { Bookmarks: { roots: { bookmark_bar: { children: [] }, other: { children: [] } } } });   // empty: not listed
// Firefox
const ff = path.join(root, 'Firefox'), prof = path.join(ff, 'Profiles', 'ab12cd.default-release');
fs.mkdirSync(prof, { recursive: true });
fs.writeFileSync(path.join(ff, 'profiles.ini'), '[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/ab12cd.default-release\nDefault=1\n');
{
  const db = new DatabaseSync(path.join(prof, 'places.sqlite'));
  db.exec('CREATE TABLE moz_places(id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, hidden INTEGER DEFAULT 0 NOT NULL, last_visit_date INTEGER)');
  db.exec('CREATE TABLE moz_bookmarks(id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER DEFAULT NULL, parent INTEGER, position INTEGER, title LONGVARCHAR, guid TEXT)');
  const p = db.prepare('INSERT INTO moz_places(id, url, title, hidden, last_visit_date) VALUES(?, ?, ?, ?, ?)');
  p.run(1, 'https://firefox-history.example/x', 'Firefox visited X', 0, (now - 120e3) * 1000);
  p.run(2, 'http://localhost:8765/p3.html?ff', 'Fox toolbar', 0, null);
  p.run(3, 'http://localhost:8765/links.html?ffm', 'Fox menu', 0, null);
  const b = db.prepare('INSERT INTO moz_bookmarks(id, type, fk, parent, position, title, guid) VALUES(?, ?, ?, ?, ?, ?, ?)');
  b.run(1, 2, null, 0, 0, '', 'root________'); b.run(2, 2, null, 1, 0, 'menu', 'menu________'); b.run(3, 2, null, 1, 1, 'toolbar', 'toolbar_____'); b.run(4, 2, null, 1, 2, 'unfiled', 'unfiled_____');
  b.run(10, 1, 2, 3, 0, 'Fox toolbar', 'aaaaaaaaaaa1'); b.run(11, 1, 3, 2, 0, 'Fox menu', 'aaaaaaaaaaa2');
  db.close();
}
// Safari export zip: Bookmarks.html + History.json (one per profile)
const sdir = path.join(path.dirname(zip), 'Safari Export');
mk(sdir, {
  'Bookmarks.html': '<!DOCTYPE NETSCAPE-Bookmark-file-1><H1>Bookmarks</H1><DL><p><DT><H3>Favorites</H3><DL><p><DT><A HREF="http://localhost:8765/p2.html?safari">Safari fav</A></DL><p><DT><H3>Reading</H3><DL><p><DT><A HREF="https://read.example/">Read later</A></DL></DL>',
  'History.json': { metadata: { browser_name: 'Safari', data_type: 'history', schema_version: 1 }, history: [{ url: 'https://safari-history.example/one', title: 'Safari visited one', time_usec: (now - 30e3) * 1000, visit_count: 3 }, { url: 'https://safari-history.example/broken', title: 'Failed', time_usec: (now - 40e3) * 1000, latest_visit_was_load_failure: true }] },
  'History - Work.json': { metadata: { data_type: 'history' }, history: [{ url: 'https://safari-history.example/work', title: 'Safari work page', time_usec: (now - 50e3) * 1000 }] },
  'Passwords.csv': 'Title,URL,Username,Password\nx,https://x.example,u,p\n'
});
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'Safari Export'], { cwd: path.dirname(zip) });
