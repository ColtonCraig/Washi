'use strict';
/* Bookmarks from other browsers. Chromium browsers (Chrome, Brave, Edge, Arc, Dia, Helium, Vivaldi, Opera, Chromium)
   keep them in a plain "Bookmarks" JSON file per profile, which is read directly. Safari and Firefox can export an
   HTML bookmarks file, which is read here too. Nothing is changed in the other browser and nothing leaves your Mac.
   Every result is a plain tree: { type:'bm', url, title } | { type:'folder', name, kids:[…] } */
const fs = require('fs'), path = require('path'), os = require('os');

const SUPPORT = () => process.env.WASHI_BM_ROOT || path.join(os.homedir(), 'Library', 'Application Support');
const BROWSERS = [
  ['chrome', 'Chrome', 'Google/Chrome'], ['brave', 'Brave', 'BraveSoftware/Brave-Browser'], ['edge', 'Edge', 'Microsoft Edge'],
  ['arc', 'Arc', 'Arc/User Data'], ['dia', 'Dia', 'Dia/User Data'], ['helium', 'Helium', 'net.imput.helium'],
  ['vivaldi', 'Vivaldi', 'Vivaldi'], ['opera', 'Opera', 'com.operasoftware.Opera'], ['chromium', 'Chromium', 'Chromium']
];
const MAX_BYTES = 32 * 1024 * 1024, MAX_ITEMS = 20000, MAX_DEPTH = 12;
const okURL = u => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 8192;
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/* profile folders inside a browser's data folder that hold a Bookmarks file */
function profiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names.filter(n => n === 'Default' || /^Profile \d+$/.test(n)).sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : +a.slice(8) - +b.slice(8)))) {
    const f = path.join(dir, n, 'Bookmarks');
    if (fs.existsSync(f)) out.push({ dir: n, file: f });
  }
  if (!out.length && fs.existsSync(path.join(dir, 'Bookmarks'))) out.push({ dir: '', file: path.join(dir, 'Bookmarks') });   // Opera keeps it at the top
  let names2 = {}; try { const ls = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8')); names2 = (ls.profile && ls.profile.info_cache) || {}; } catch {}
  return out.map(p => ({ ...p, name: clip((names2[p.dir] && names2[p.dir].name) || (p.dir === 'Default' || !p.dir ? 'Default' : p.dir), 40) }));
}

/* Chromium's JSON: roots.bookmark_bar / other / synced, each { children:[ {type:'url',name,url} | {type:'folder',name,children} ] } */
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

/* Netscape bookmark HTML (Safari, Firefox, Chrome and most others export this) */
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
  /* exports usually wrap everything in one "Bookmarks" or "Bookmarks Menu" folder: look inside it */
  while (kids.length === 1 && kids[0].type === 'folder' && kids[0] !== barFolder) kids = kids[0].kids;
  const bar = barFolder && barFolder.kids.length ? barFolder.kids : [];
  const strip = list => list.filter(x => x !== barFolder).map(x => x.type === 'folder' ? { ...x, kids: strip(x.kids) } : x).filter(x => x.type === 'bm' || x.kids.length);
  return { bar, other: strip(kids), count: n };
}

function scan() {
  const out = [];
  for (const [key, name, rel] of BROWSERS) {
    for (const p of profiles(path.join(SUPPORT(), rel))) {
      let count = 0;
      try { const st = fs.statSync(p.file); if (st.size > MAX_BYTES) continue; count = fromChromium(JSON.parse(fs.readFileSync(p.file, 'utf8'))).count; } catch { continue; }
      if (count) out.push({ key: key + ':' + (p.dir || '-'), browser: name, profile: p.name, count, file: p.file });
    }
  }
  return out;
}
function readFile(file) {
  const st = fs.statSync(file); if (!st.isFile() || st.size > MAX_BYTES) throw new Error('That file is too big to be bookmarks.');
  const text = fs.readFileSync(file, 'utf8');
  return /^\s*\{/.test(text) ? fromChromium(JSON.parse(text)) : fromHTML(text);
}
module.exports = { scan, readFile, fromChromium, fromHTML, BROWSERS };
