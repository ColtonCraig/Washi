'use strict';
/* Bookmarks and history from other browsers. Nothing is changed in the other browser and nothing leaves your Mac.
   - Chromium browsers (Chrome, Brave, Edge, Arc, Dia, Helium, Vivaldi, Opera, Chromium): each profile's "Bookmarks"
     (JSON) and "History" (a small SQLite database) are read directly.
   - Firefox: each profile's places.sqlite (bookmarks and history).
   - Safari keeps its files private, so you export them: File › Export Browsing Data to File… makes a .zip with
     Bookmarks.html and a History.json per profile. Any other browser's bookmarks .html export works too.
   Bookmarks come back as a plain tree: { type:'bm', url, title } | { type:'folder', name, kids:[…] }.
   History comes back as [{ url, title, t }] (t = last visit, ms), newest first. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');

const SUPPORT = () => process.env.WASHI_BM_ROOT || path.join(os.homedir(), 'Library', 'Application Support');
const BROWSERS = [
  ['chrome', 'Chrome', 'Google/Chrome'], ['brave', 'Brave', 'BraveSoftware/Brave-Browser'], ['edge', 'Edge', 'Microsoft Edge'],
  ['arc', 'Arc', 'Arc/User Data'], ['dia', 'Dia', 'Dia/User Data'], ['helium', 'Helium', 'net.imput.helium'],
  ['vivaldi', 'Vivaldi', 'Vivaldi'], ['opera', 'Opera', 'com.operasoftware.Opera'], ['chromium', 'Chromium', 'Chromium']
];
const MAX_BYTES = 32 * 1024 * 1024, MAX_ITEMS = 20000, MAX_DEPTH = 12, MAX_HISTORY = 3000, MAX_DB = 512 * 1024 * 1024, MAX_ZIP = 300 * 1024 * 1024;
const okURL = u => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 8192;
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const exists = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

/* ---------- SQLite (Chromium History, Firefox places) ----------
   The other browser may be open and holding the file, so a copy is read (with its journal), never the original. */
function withDB(file, fn) {
  const st = fs.statSync(file); if (st.size > MAX_DB) throw new Error('That history is too big to read.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-import-')), copy = path.join(tmp, 'db.sqlite');
  try {
    fs.copyFileSync(file, copy);
    for (const ext of ['-wal', '-shm']) if (exists(file + ext)) fs.copyFileSync(file + ext, copy + ext);
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(copy, { readOnly: false });   // read-write on the copy so a journal can be replayed
    try { return fn(db); } finally { db.close(); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
const CHROME_EPOCH = 11644473600000;   // Chromium counts microseconds from 1601 (divided down in SQL: too big for a JS number)
function chromiumHistory(file, countOnly) {
  return withDB(file, db => {
    if (countOnly) return db.prepare("SELECT COUNT(*) AS n FROM urls WHERE hidden = 0 AND url LIKE 'http%'").get().n;
    return db.prepare("SELECT url, title, last_visit_time / 1000 AS t FROM urls WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ?").all(MAX_HISTORY * 2)
      .filter(r => okURL(r.url)).slice(0, MAX_HISTORY).map(r => ({ url: r.url, title: clip(r.title, 200), t: Math.max(0, Math.round(Number(r.t) - CHROME_EPOCH)) }));
  });
}
function firefoxHistory(file, countOnly) {
  return withDB(file, db => {
    if (countOnly) return db.prepare("SELECT COUNT(*) AS n FROM moz_places WHERE hidden = 0 AND last_visit_date IS NOT NULL AND url LIKE 'http%'").get().n;
    return db.prepare("SELECT url, title, last_visit_date / 1000 AS t FROM moz_places WHERE hidden = 0 AND last_visit_date IS NOT NULL AND url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT ?").all(MAX_HISTORY * 2)
      .filter(r => okURL(r.url)).slice(0, MAX_HISTORY).map(r => ({ url: r.url, title: clip(r.title, 200), t: Math.round(Number(r.t)) }));
  });
}
/* Firefox bookmarks: the toolbar becomes your bar; the menu, "Other" and mobile ones go in folders */
function firefoxBookmarks(file) {
  return withDB(file, db => {
    const rows = db.prepare('SELECT b.id, b.type, b.parent, b.position, b.title, b.guid, p.url FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position').all();
    const kids = new Map(); for (const r of rows) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
    let n = 0;
    const walk = (id, d) => {
      const out = [];
      if (d > MAX_DEPTH) return out;
      for (const r of kids.get(id) || []) {
        if (n >= MAX_ITEMS) break;
        if (r.type === 1 && okURL(r.url)) { out.push({ type: 'bm', url: r.url, title: clip(r.title, 200) }); n++; }
        else if (r.type === 2) { const k = walk(r.id, d + 1); if (k.length) out.push({ type: 'folder', name: clip(r.title, 40) || 'Folder', kids: k }); }
      }
      return out;
    };
    const root = g => rows.find(r => r.guid === g);
    const bar = root('toolbar_____') ? walk(root('toolbar_____').id, 1) : [];
    const other = [['menu________', 'Bookmarks Menu'], ['unfiled_____', 'Other Bookmarks'], ['mobile______', 'Mobile Bookmarks']]
      .map(([g, name]) => root(g) ? { type: 'folder', name, kids: walk(root(g).id, 2) } : null).filter(f => f && f.kids.length);
    return { bar, other: other.length === 1 ? other[0].kids : other, count: n };
  });
}

/* ---------- Chromium bookmarks (JSON) ---------- */
function fromChromium(data) {
  const roots = data && data.roots; if (!roots || typeof roots !== 'object') throw new Error('That isn\'t a bookmarks file.');
  let n = 0;
  const walk = (list, d) => {
    const out = [];
    if (!Array.isArray(list) || d > MAX_DEPTH) return out;
    for (const x of list) {
      if (n >= MAX_ITEMS || !x || typeof x !== 'object') continue;
      if (x.type === 'url' && okURL(x.url)) { out.push({ type: 'bm', url: x.url, title: clip(x.name, 200) }); n++; }
      else if (x.type === 'folder') { const kids = walk(x.children, d + 1); if (kids.length) out.push({ type: 'folder', name: clip(x.name, 40) || 'Folder', kids }); }
    }
    return out;
  };
  return { bar: walk(roots.bookmark_bar && roots.bookmark_bar.children, 1), other: [...walk(roots.other && roots.other.children, 1), ...walk(roots.synced && roots.synced.children, 1)], count: n };
}

/* ---------- Netscape bookmark HTML (Safari, Firefox, Chrome and most others export this) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { try { return e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m; } catch { return m; } });
function fromHTML(html) {
  if (!/<dl/i.test(html) || !/<(a|h3)\b/i.test(html)) throw new Error('That isn\'t a bookmarks file.');
  const root = { kids: [] }, stack = [root]; let pending = null, n = 0, barFolder = null;
  const re = /<h3\b([^>]*)>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<dl\b[^>]*>|<\/dl>/gi;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0][0] === '<' && /^<h3/i.test(m[0])) {
      pending = { type: 'folder', name: clip(decode(m[2]), 40) || 'Folder', kids: [] };
      if (/PERSONAL_TOOLBAR_FOLDER/i.test(m[1]) || /^(bookmarks (bar|toolbar)|favou?rites( bar)?)$/i.test(pending.name)) barFolder = pending;
      top.kids.push(pending);
    } else if (/^<a/i.test(m[0])) {
      const h = m[3].match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i), url = h ? decode(h[1] ?? h[2]).trim() : '';
      if (okURL(url) && n < MAX_ITEMS) { top.kids.push({ type: 'bm', url, title: clip(decode(m[4]), 200) }); n++; }
    } else if (/^<dl/i.test(m[0])) { if (pending && stack.length <= MAX_DEPTH) { stack.push(pending); } else stack.push(top); pending = null; }
    else { if (stack.length > 1) stack.pop(); pending = null; }
  }
  const prune = list => list.filter(x => x.type === 'bm' || ((x.kids = prune(x.kids)), x.kids.length));
  let kids = prune(root.kids);
  while (kids.length === 1 && kids[0].type === 'folder' && kids[0] !== barFolder) kids = kids[0].kids;   // exports wrap everything in one folder
  const bar = barFolder && barFolder.kids.length ? barFolder.kids : [];
  const strip = list => list.filter(x => x !== barFolder).map(x => x.type === 'folder' ? { ...x, kids: strip(x.kids) } : x).filter(x => x.type === 'bm' || x.kids.length);
  return { bar, other: strip(kids), count: n };
}

/* ---------- Safari's export (and the history JSON inside it) ---------- */
/* History.json: { metadata:{ data_type:'history', … }, history:[{ url, title, time_usec, visit_count, … }] }.
   Field names are read loosely so a small format change in a later Safari doesn't break it. */
function fromHistoryJSON(text) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(j) ? j : Array.isArray(j && j.history) ? j.history : null;
  if (!list) return null;
  const when = r => { const us = r.time_usec ?? r.visit_time_usec ?? r.last_visit_time_usec; if (us != null) return Math.round(Number(us) / 1000); const ms = r.time_msec ?? r.time ?? r.lastVisited ?? r.last_visit_time; return ms != null ? Math.round(Number(ms) > 1e14 ? Number(ms) / 1000 : Number(ms)) : 0; };
  return list.filter(r => r && okURL(r.url) && !r.latest_visit_was_load_failure).map(r => ({ url: r.url, title: clip(r.title, 200), t: when(r) }));
}
function unzip(zip, into) {
  const st = fs.statSync(zip); if (st.size > MAX_ZIP) throw new Error('That export is too big.');
  if (process.platform === 'darwin') execFileSync('/usr/bin/ditto', ['-x', '-k', zip, into], { timeout: 60000 });
  else execFileSync('unzip', ['-q', '-o', zip, '-d', into], { timeout: 60000 });
}
function listFiles(dir, depth = 0) {
  if (depth > 4) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name.startsWith('__MACOSX') || e.name.startsWith('.') ? [] : e.isDirectory() ? listFiles(path.join(dir, e.name), depth + 1) : [path.join(dir, e.name)]);
}
function fromZip(zip) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-zip-'));
  try {
    try { unzip(zip, tmp); } catch { throw new Error('Couldn\'t open that .zip file.'); }
    const files = listFiles(tmp);
    let bm = { bar: [], other: [], count: 0 }, history = [], passwordsCSV = '';
    for (const f of files) {
      const lower = path.basename(f).toLowerCase();
      if (lower.endsWith('.csv') && fs.statSync(f).size < MAX_BYTES) { const t = fs.readFileSync(f, 'utf8'); if (/^\uFEFF?[^\n]*password/i.test(t)) passwordsCSV += (passwordsCSV ? '\n' + t.replace(/^[^\n]*\n/, '') : t); continue; }   // Safari's Passwords.csv (only ever handed to the password store)
      if (/\.html?$/.test(lower)) { try { const r = fromHTML(fs.readFileSync(f, 'utf8')); if (r.count > bm.count) bm = r; } catch {} }
      else if (lower.endsWith('.json') && fs.statSync(f).size < MAX_BYTES * 4) { const h = fromHistoryJSON(fs.readFileSync(f, 'utf8')); if (h) history.push(...h); }
    }
    if (!bm.count && !history.length && !passwordsCSV) throw new Error('No bookmarks, history or passwords in that export. In Safari, choose File › Export Browsing Data to File… and tick what you want.');
    return { ...bm, history: tidyHistory(history), passwordsCSV };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
/* newest first, each page once, a sensible amount */
function tidyHistory(list) {
  const seen = new Set();
  return list.sort((a, b) => b.t - a.t).filter(h => okURL(h.url) && !seen.has(h.url) && seen.add(h.url)).slice(0, MAX_HISTORY);
}

/* ---------- finding browsers on this Mac ---------- */
function chromiumProfiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names.filter(n => n === 'Default' || /^Profile \d+$/.test(n)).sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : +a.slice(8) - +b.slice(8)))) {
    const bm = path.join(dir, n, 'Bookmarks'), hist = path.join(dir, n, 'History');
    if (exists(bm) || exists(hist)) out.push({ dir: n, bm: exists(bm) ? bm : null, hist: exists(hist) ? hist : null });
  }
  if (!out.length && (exists(path.join(dir, 'Bookmarks')) || exists(path.join(dir, 'History')))) out.push({ dir: '', bm: exists(path.join(dir, 'Bookmarks')) ? path.join(dir, 'Bookmarks') : null, hist: exists(path.join(dir, 'History')) ? path.join(dir, 'History') : null });   // Opera keeps them at the top
  let info = {}; try { const ls = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8')); info = (ls.profile && ls.profile.info_cache) || {}; } catch {}
  return out.map(p => ({ ...p, name: clip((info[p.dir] && info[p.dir].name) || (p.dir === 'Default' || !p.dir ? 'Default' : p.dir), 40) }));
}
function firefoxProfiles() {
  const base = path.join(SUPPORT(), 'Firefox'), dir = path.join(base, 'Profiles');
  let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
  let ini = ''; try { ini = fs.readFileSync(path.join(base, 'profiles.ini'), 'utf8'); } catch {}
  const label = folder => { for (const sec of ini.split(/\n(?=\[)/)) if (new RegExp('^Path=(Profiles/)?' + folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm').test(sec)) { const m = sec.match(/^Name=(.*)$/m); if (m) return clip(m[1], 40); } return folder.replace(/^[a-z0-9]+\./, ''); };
  return names.filter(n => exists(path.join(dir, n, 'places.sqlite'))).map(n => ({ dir: n, places: path.join(dir, n, 'places.sqlite'), name: label(n) }));
}
/* what's here: one row per browser profile, with how many bookmarks and pages of history it has */
function scan() {
  const out = [];
  for (const [key, name, rel] of BROWSERS) {
    for (const p of chromiumProfiles(path.join(SUPPORT(), rel))) {
      let count = 0, history = 0;
      if (p.bm) try { if (fs.statSync(p.bm).size <= MAX_BYTES) count = fromChromium(JSON.parse(fs.readFileSync(p.bm, 'utf8'))).count; } catch {}
      if (p.hist) try { history = chromiumHistory(p.hist, true); } catch {}
      if (count || history) out.push({ key: key + ':' + (p.dir || '-'), browser: name, profile: p.name, count, history, src: { kind: 'chromium', bm: p.bm, hist: p.hist } });
    }
  }
  for (const p of firefoxProfiles()) {
    let count = 0, history = 0;
    try { count = firefoxBookmarks(p.places).count; } catch {}
    try { history = firefoxHistory(p.places, true); } catch {}
    if (count || history) out.push({ key: 'firefox:' + p.dir, browser: 'Firefox', profile: p.name, count, history, src: { kind: 'firefox', places: p.places } });
  }
  return out;
}
/* everything from one of the rows scan() found */
function read(src) {
  if (src.kind === 'chromium') {
    const bm = src.bm ? (() => { const st = fs.statSync(src.bm); if (st.size > MAX_BYTES) throw new Error('Those bookmarks are too big.'); return fromChromium(JSON.parse(fs.readFileSync(src.bm, 'utf8'))); })() : { bar: [], other: [], count: 0 };
    let history = []; if (src.hist) try { history = chromiumHistory(src.hist); } catch {}
    return { ...bm, history };
  }
  if (src.kind === 'firefox') {
    let bm = { bar: [], other: [], count: 0 }, history = [];
    try { bm = firefoxBookmarks(src.places); } catch {}
    try { history = firefoxHistory(src.places); } catch {}
    if (!bm.count && !history.length) throw new Error('Couldn\'t read Firefox\'s data. Quit Firefox and try again.');
    return { ...bm, history };
  }
  throw new Error('Unknown browser.');
}
/* a file you picked: Safari's .zip export, a bookmarks .html, or a Chromium Bookmarks file */
function readFile(file) {
  if (/\.zip$/i.test(file)) return fromZip(file);
  const st = fs.statSync(file); if (!st.isFile() || st.size > MAX_BYTES) throw new Error('That file is too big to be bookmarks.');
  const text = fs.readFileSync(file, 'utf8');
  if (/^\s*\{/.test(text)) { try { return { ...fromChromium(JSON.parse(text)), history: [] }; } catch {} const h = fromHistoryJSON(text); if (h) return { bar: [], other: [], count: 0, history: tidyHistory(h) }; throw new Error('That isn\'t a bookmarks file.'); }
  return { ...fromHTML(text), history: [] };
}
module.exports = { scan, read, readFile, fromChromium, fromHTML, fromHistoryJSON, fromZip, BROWSERS };
