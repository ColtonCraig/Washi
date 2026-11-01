'use strict';
/* Reads Arc's sidebar (spaces, pinned tabs, folders, favorites) straight from the file Arc keeps on your Mac:
   ~/Library/Application Support/Arc/StorableSidebar.json. Nothing is changed in Arc and nothing leaves your Mac.
   The format (as used by open-source Arc exporters):
     sidebar.containers[i] where the container after the one marked "global" holds:
       spaces: [ "id", { id, title, newContainerIDs: [ {pinned:{}}, "<containerId>", {unpinned:{}}, "<containerId>" ] }, ... ]
               (older files: containerIDs: [ "pinned", "<id>", "unpinned", "<id>" ])
       items:  [ "id", { id, title, parentID, childrenIds, data: { tab: { savedURL, savedTitle } } | { list: {} } | { splitView: {} } ... }, ... ]
       topAppsContainerIDs: [ {default:true} | "default", "<containerId>", ... ]   ← favorites */
const fs = require('fs'), path = require('path'), os = require('os');

const DEFAULT = path.join(os.homedir(), 'Library', 'Application Support', 'Arc', 'StorableSidebar.json');
const where = () => process.env.WASHI_ARC_FILE || DEFAULT;
const MAX_BYTES = 64 * 1024 * 1024;
const okURL = u => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 8192;
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function load(file) {
  file = file || where();
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > MAX_BYTES) throw new Error('That doesn\'t look like Arc\'s sidebar file.');
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/* pairs like [ {pinned:{}}, "abc", {unpinned:{}}, "def" ] or [ "pinned", "abc", ... ] → { pinned: "abc", unpinned: "def" } */
function slots(list) {
  const out = {};
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < list.length - 1; i++) {
    const k = list[i], v = list[i + 1];
    const name = typeof k === 'string' ? k : k && typeof k === 'object' ? Object.keys(k)[0] : null;
    if ((name === 'pinned' || name === 'unpinned' || name === 'default') && typeof v === 'string') { if (!out[name]) out[name] = v; i++; }
  }
  return out;
}

function parse(data) {
  const containers = data && data.sidebar && Array.isArray(data.sidebar.containers) ? data.sidebar.containers : null;
  if (!containers) throw new Error('That doesn\'t look like Arc\'s sidebar file.');
  const gi = containers.findIndex(c => c && typeof c === 'object' && 'global' in c);
  const main = (gi > -1 && containers[gi + 1] && containers[gi + 1].spaces) ? containers[gi + 1] : containers.find(c => c && Array.isArray(c.spaces) && Array.isArray(c.items));
  if (!main) throw new Error('No spaces found in that file.');
  const items = new Map();
  for (const it of main.items || []) if (it && typeof it === 'object' && typeof it.id === 'string') items.set(it.id, it);
  const childrenOf = id => {
    const p = items.get(id), ids = p && Array.isArray(p.childrenIds) ? p.childrenIds.filter(x => typeof x === 'string') : null;
    if (ids && ids.length) return ids.map(x => items.get(x)).filter(Boolean);
    return [...items.values()].filter(x => x.parentID === id);
  };
  const stats = { tabs: 0, folders: 0 };
  const tree = (id, depth = 0, seen = new Set()) => {
    const out = [];
    if (depth > 12) return out;
    for (const it of childrenOf(id)) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const d = it.data || {};
      if (d.tab) {
        const url = d.tab.savedURL; if (!okURL(url)) continue;
        out.push({ type: 'tab', url, title: clip(it.title || d.tab.savedTitle || '', 200) }); stats.tabs++;
      } else if (d.splitView) {
        const kids = tree(it.id, depth + 1, seen).filter(x => x.type === 'tab');
        if (kids.length === 2) out.push({ type: 'pair', tabs: kids }); else out.push(...kids);
      } else if (d.list || (Array.isArray(it.childrenIds) && it.childrenIds.length && !d.easel && !d.note && !d.itemContainer)) {
        out.push({ type: 'folder', name: clip(it.title || 'Folder', 40), children: tree(it.id, depth + 1, seen) }); stats.folders++;
      }
      /* easels, notes and anything else Arc-only are skipped */
    }
    return out;
  };
  const count = nodes => nodes.reduce((a, n) => { if (n.type === 'tab') a.tabs++; else if (n.type === 'pair') a.tabs += 2; else { a.folders++; const c = count(n.children); a.tabs += c.tabs; a.folders += c.folders; } return a; }, { tabs: 0, folders: 0 });
  const spaces = [];
  let n = 1;
  for (const s of main.spaces || []) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string') continue;
    const sl = slots(s.newContainerIDs || s.containerIDs);
    const pinned = sl.pinned ? tree(sl.pinned) : [], unpinned = sl.unpinned ? tree(sl.unpinned) : [];
    const name = clip(s.title || ('Space ' + n++), 24);
    spaces.push({ key: s.id, name, pinned, unpinned, counts: { pinned: count(pinned), unpinned: count(unpinned) } });
  }
  const fav = slots(main.topAppsContainerIDs).default;
  const favorites = fav ? tree(fav).flatMap(x => x.type === 'tab' ? [x] : x.type === 'pair' ? x.tabs : []) : [];
  if (!spaces.length) throw new Error('No spaces found in that file.');
  return { spaces, favorites };
}

/* a short description for the Settings screen, without sending every tab across */
function scan(file) {
  try {
    const f = file || where();
    if (!fs.existsSync(f)) return { found: false, path: f };
    const { data } = load(f), r = parse(data);
    return { found: true, path: f, favorites: r.favorites.length, spaces: r.spaces.map(s => ({ key: s.key, name: s.name, pinned: s.counts.pinned, unpinned: s.counts.unpinned })) };
  } catch (e) { return { found: false, path: file || where(), error: e.message }; }
}
function read(file) { const { data } = load(file); return parse(data); }
module.exports = { scan, read, parse, where };
