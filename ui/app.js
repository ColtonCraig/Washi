'use strict';
const B = window.washi;
const { esc, hostOf, hueOf, palOf, ic, zoneAt, KEYS, PAL, palFor, applyTheme, prefsOf, searchTpl, suggestTpl, bang, fmtKey } = window.BL;
BL.setup();
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RMQ = matchMedia('(prefers-reduced-motion: reduce)').matches, calm = () => RMQ || BL.motion.off;
const uid = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const TOP = 38, M = 8, SB_W = 232, GAP = 8, MIN_PANE = 300, BMH = 40;
const sbW = () => Math.max(200, Math.min(380, Math.round((S && S.prefs.sbW) || SB_W)));

/* ---------- state ---------- */
let S;                                    // persisted
const R = { a: null, b: null, focus: 'a', split: false, media: {}, npHide: null, readable: {}, reading: {}, loading: {}, audible: {}, muted: {}, blocked: {}, boosted: {}, notice: {}, canBack: {}, canFwd: {}, live: {}, menuTab: null, menuSpace: null, promptCb: null, keys: {}, downloads: [] };
const fresh = () => ({ tabs: {}, pins: [], pairs: [], cur: 'home', history: [], closed: [], archive: [], dock: true, prefs: prefsOf({}),
  spaces: [{ id: 'home', name: 'Home', h: 40, tabs: [], folders: [], act: null }, { id: 'work', name: 'Work', h: 255, tabs: [], folders: [] }, { id: 'play', name: 'Play', h: 340, tabs: [], folders: [] }] });
function sanitize(s) {
  s.tabs = s.tabs || {}; s.pins = (s.pins || []).filter(id => s.tabs[id]); s.history = (s.history || []).filter(h => h && h.url); s.closed = s.closed || []; s.archive = s.archive || [];
  for (const id in s.tabs) if (!s.tabs[id].seen) s.tabs[id].seen = Date.now();
  s.dock = s.dock !== undefined ? !!s.dock : s.side !== 'hidden'; s.prefs = prefsOf(s.prefs);
  if (!(s.prefs.look >= 2)) { s.prefs.wobble = false; s.prefs.look = 2; }   // 0.10: the calmer look starts with straight scraps (you can turn wonky back on)
  s.spaces = (s.spaces || []).filter(x => x && x.id);
  if (!s.spaces.length) return fresh();
  for (const sp of s.spaces) {
    if (!PAL[sp.h]) sp.h = KEYS[0];
    if (sp.custom && typeof sp.custom !== 'object') sp.custom = null;
    sp.folders = (sp.folders || []).filter(f => f && f.id).map(f => ({ ...f, tabs: (f.tabs || []).slice() }));
    tidyFolders(sp, s.tabs);
    if (sp.act && !s.tabs[sp.act]) sp.act = null;
  }
  s.pairs = (s.pairs || []).filter(p => Array.isArray(p) && p.length === 2 && p[0] !== p[1] && s.tabs[p[0]] && s.tabs[p[1]] && !s.pins.includes(p[0]) && !s.pins.includes(p[1])
    && s.spaces.some(sp => { const all = spaceTabs(sp); return all.includes(p[0]) && all.includes(p[1]); }));
  const seen = new Set(); s.pairs = s.pairs.filter(p => { if (seen.has(p[0]) || seen.has(p[1])) return false; seen.add(p[0]); seen.add(p[1]); return true; });
  s.ratios = Object.fromEntries(Object.entries(s.ratios || {}).filter(([k, v]) => s.pairs.some(p => p.join('|') === k) && v > 0 && v < 1));
  if (!s.spaces.some(x => x.id === s.cur)) s.cur = s.spaces[0].id;
  return s;
}
let saveT;
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = 0; doSave(); }, 900); };
/* What's saved is split in two: this window's own tabs, pins and folders (each window has its own), and what every
   window shares (settings, the list of spaces, archive, recently closed, bookmarks). History is kept by the main
   process and changed in small steps, so a long history never slows down a click. */
const smallFav = f => (f && f.length > 2500 ? null : f || null);
const META = x => ({ id: x.id, name: x.name, h: x.h, custom: x.custom || null, isolated: !!x.isolated, note: x.note || '' });   // the space's sticky note travels with it to every window
const doSave = () => {
  const mine = { tabs: S.tabs, pins: S.pins, pairs: S.pairs, ratios: S.ratios || {}, cur: S.cur, dock: S.dock, focus: !!S.focusMode, spaces: Object.fromEntries(S.spaces.map(x => [x.id, { tabs: x.tabs, folders: x.folders, act: x.act || null }])) };
  const shared = { prefs: S.prefs, spaces: S.spaces.map(META), closed: S.closed.slice(0, 25), archive: S.archive.slice(0, 300), bookmarks: S.bookmarks || [] };
  B.stateSave(JSON.stringify(mine), JSON.stringify(shared));
};
function hist(op) {                                    // change history here, and tell the main process (which tells other windows)
  histLocal(op); B.histOp(op);
}
function histLocal(op) {
  if (op.t === 'add') { S.history = [op.e, ...S.history.filter(h => h.url !== op.e.url)].slice(0, 3000); }
  else if (op.t === 'upd') { const h = S.history.find(x => x.url === op.url); if (h) { if (op.title !== undefined) h.title = op.title; if (op.fav !== undefined) h.fav = op.fav; } }
  else if (op.t === 'del') S.history = S.history.filter(h => h.url !== op.url);
  else if (op.t === 'clear') S.history = [];
  else if (op.t === 'merge') S.history = histMerge(S.history, op.list || []);
}
/* history from another browser joins yours: each page once (keeping the newest visit), newest first. Same as the main process. */
function histMerge(have, add) {
  const by = new Map(); for (const h of have) if (h && h.url) by.set(h.url, h);
  for (const h of add) { if (!h || typeof h.url !== 'string' || !/^https?:/i.test(h.url)) continue; const o = by.get(h.url); if (!o) by.set(h.url, { url: h.url, title: String(h.title || '').slice(0, 300), t: +h.t || 0 }); else if ((+h.t || 0) > (o.t || 0)) by.set(h.url, { ...o, t: +h.t, title: o.title || h.title }); }
  return [...by.values()].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 3000);
}
B.onHistOp(op => { if (S && op) histLocal(op); });
/* another window changed something everyone shares */
B.onShared(ch => {
  if (!S || !ch) return;
  if (ch.prefs) { const was = barMode(); S.prefs = prefsOf(ch.prefs); theme(); syncMain(); if (barMode() !== was) { barKey = ''; placePanes(); commit(false, false, true); } }
  if (ch.closed) S.closed = ch.closed;
  if (ch.archive) S.archive = ch.archive;
  if (ch.bookmarks) { S.bookmarks = ch.bookmarks; if (window.BOOKMARKS) BOOKMARKS.refresh(); }
  if (ch.spaces) {
    const metas = ch.spaces.filter(m => m && m.id), ids = new Set(metas.map(m => m.id));
    for (const s of S.spaces.filter(x => !ids.has(x.id))) for (const t of spaceTabs(s)) { dissolve(t); B.tabClose(t); delete S.tabs[t]; delete R.live[t]; }
    S.spaces = metas.map(m => {
      const s = S.spaces.find(x => x.id === m.id);
      if (!s) return { ...m, tabs: [], folders: [], act: null };
      if (!!s.isolated !== !!m.isolated) for (const t of spaceTabs(s)) { B.tabClose(t); R.live[t] = false; }   // the login jar changed: pages reopen in the new one
      return Object.assign(s, { name: m.name, h: m.h, custom: m.custom || null, isolated: !!m.isolated, note: m.note || '' });
    });
    if (!S.spaces.some(x => x.id === S.cur)) { S.cur = S.spaces[0].id; switchSpace(S.cur, { boot: true }); }
    theme();
  }
  render();
});
addEventListener('beforeunload', () => { if (saveT) { clearTimeout(saveT); doSave(); } });
const sp = () => S.spaces.find(s => s.id === S.cur);
/* ---------- folders (they can hold tabs and other folders, up to 3 deep) ---------- */
const MAX_DEPTH = 3;
const folderOf = (s, k) => s.folders.find(f => 'f:' + f.id === k) || null;
const flat = (s, keys, seen = new Set()) => keys.flatMap(k => { if (!k.startsWith('f:')) return [k]; if (seen.has(k)) return []; seen.add(k); const f = folderOf(s, k); return f ? flat(s, f.tabs, seen) : []; });
const spaceTabs = s => flat(s, s.tabs);   // every tab in the space, in visual order
const parentOf = (s, key) => { if (s.tabs.includes(key)) return null; return s.folders.find(f => f.tabs.includes(key)) || null; };
const depthOf = (s, f) => { let d = 1; for (let p = parentOf(s, 'f:' + f.id); p && d < 10; p = parentOf(s, 'f:' + p.id)) d++; return d; };
const heightOf = (s, f, guard = 0) => 1 + Math.max(0, ...f.tabs.filter(k => k.startsWith('f:')).map(k => folderOf(s, k)).filter(Boolean).map(c => guard > 8 ? 0 : heightOf(s, c, guard + 1)));
/* every folder sits in exactly one place, nothing loops, nothing is deeper than MAX_DEPTH, gone tabs are dropped */
function tidyFolders(sp, tabs) {
  const ids = new Set(sp.folders.map(f => f.id)), used = new Set(), placed = new Set();
  const ok = k => k.startsWith('f:') ? ids.has(k.slice(2)) : !!tabs[k];
  const walk = (keys, depth) => keys.filter(k => {
    if (!ok(k) || used.has(k)) return false;
    if (k.startsWith('f:')) {
      if (depth > MAX_DEPTH) return false;
      used.add(k); placed.add(k); const f = sp.folders.find(x => 'f:' + x.id === k); f.tabs = walk(f.tabs, depth + 1);
    } else used.add(k);
    return true;
  });
  sp.tabs = walk(sp.tabs || [], 1);
  for (const f of sp.folders) if (!placed.has('f:' + f.id)) { sp.tabs.push('f:' + f.id); placed.add('f:' + f.id); f.tabs = walk(f.tabs, 2); }   // lost or too deep: back to the top level
}
const pairOf = id => S.pairs.find(p => p.includes(id)) || null;
const dissolve = id => { S.pairs = S.pairs.filter(p => !p.includes(id)); };
const spaceOf = id => S.spaces.find(s => spaceTabs(s).includes(id));
const focusedId = () => (R.focus === 'b' && R.split && R.b) ? R.b : R.a;
const label = t => t.name || t.title || hostOf(t.url) || 'New tab';   // a name you gave it wins

function toURL(v) {
  v = v.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(about|data|file|view-source):/i.test(v)) return v;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(v) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(v)) return 'http://' + v;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(v)) return 'https://' + v;
  const b = bang(v); if (b) return b.url;
  return searchTpl(S.prefs).replace('%s', encodeURIComponent(v));
}
const spaceInfo = s => s && s.isolated ? { id: s.id, isolated: true } : null;
const keyHint = id => fmtKey(R.keys[id] || '');

/* ---------- dom refs + layout ---------- */
const stage = $('#stage'), pa = $('#pa'), pb = $('#pb'), gutter = $('#gutter');
const urlEl = $('#url'), urlTxt = $('#urlTxt'), bBack = $('#bBack'), bFwd = $('#bFwd'), bReload = $('#bReload'), bSplit = $('#bSplit'), bSide = $('#bSide'), bShield = $('#bShield'), bDl = $('#bDl'), bBoost = $('#bBoost'), bStar = $('#bStar'), bRead = $('#bRead'), bNote = $('#bNote'), bmbar = $('#bmbar');

/* Focus mode floats the sidebar for a while without changing your choice to dock it */
const docked = () => S.dock && !S.focusMode;
/* Layout is plain math, shared by the card frames here and the page views in the main process. */
function layout() {
  const W = innerWidth, H = innerHeight;
  const x = docked() ? sbW() + 4 : M + 4, y = S.focusMode ? (R.focusPeek ? TOP : M - 2) : TOP + (barAlways() ? BMH : 0), w = W - x - M, h = H - y - M;
  const L = { stage: { x, y, w, h }, split: R.split };
  if (R.split) { const room = w - GAP, r = Math.min(Math.max(R.ratio || .5, MIN_PANE / room), 1 - MIN_PANE / room), pa = Math.round(room * r); L.a = { x, y, w: pa, h }; L.b = { x: x + pa + GAP, y, w: room - pa, h }; L.gap = { x: x + pa, y, w: GAP, h }; }
  else { L.a = { x, y, w, h }; L.b = { x: x + w, y, w: 0, h }; }
  return L;
}
const toR = r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) });
function placePanes() {
  const L = layout();
  for (const [el, r] of [[pa, L.a], [pb, L.b]]) { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; }
  pb.classList.toggle('off', !R.split);
  gutter.hidden = !R.split; if (L.gap) { gutter.style.left = L.gap.x + 'px'; gutter.style.top = L.gap.y + 'px'; gutter.style.width = L.gap.w + 'px'; gutter.style.height = L.gap.h + 'px'; }
  stage.classList.toggle('split', R.split);
  placeBar(L);
  B.layoutInfo(L);
  return L;
}

/* ---------- state for the sidebar view ---------- */
let pushQ = false;
/* the card at the bottom of the sidebar: the most recent tab with something playing (or paused a moment ago),
   unless it's the one you're looking at */
function nowPlaying() {
  const shown = new Set([R.a, R.split ? R.b : null]); let best = null;
  for (const id in R.media) { const m = R.media[id], t = S.tabs[id]; if (!t) { delete R.media[id]; continue; } if (shown.has(id) || id === R.npHide) continue; if (!m.playing && Date.now() - m.at > 20 * 60 * 1000) continue; if (!best || (m.playing && !best.m.playing) || (m.playing === best.m.playing && m.at > best.m.at)) best = { id, m }; }
  if (!best) return null; const t = S.tabs[best.id];
  return { id: best.id, title: best.m.title || label(t), artist: best.m.artist || hostOf(t.url), art: best.m.art || '', fav: t.fav || null, url: t.url, playing: !!best.m.playing, video: !!best.m.video };
}
function pushState() {
  if (pushQ || !S) return; pushQ = true;
  requestAnimationFrame(() => {
    pushQ = false;
    const s = sp(), ids = new Set([...S.pins, ...spaceTabs(s)]), tabs = {};
    for (const id of ids) { const t = S.tabs[id]; if (t) tabs[id] = { title: label(t), url: t.url, fav: t.fav || null, loading: !!R.loading[id], audible: !!R.audible[id], muted: !!R.muted[id], live: !!R.live[id], unread: !!t.unread, notice: R.notice[id] || null }; }
    B.sbState({ h: s.h, pal: palFor(s), theme: S.prefs, cur: S.cur, name: s.name, spaces: S.spaces.map(x => ({ id: x.id, name: x.name, h: x.h, pal: palFor(x) })), np: nowPlaying(), pins: S.pins, order: s.tabs, pairs: S.pairs.filter(p => spaceOf(p[0]) === s), folders: s.folders, tabs, a: R.a, b: R.split ? R.b : null, focus: R.focus, split: R.split, docked: S.dock });
  });
}
/* the extension buttons talk to the session of the space you're in */
const extPart = () => { const s = sp(); return s && s.isolated ? 'persist:space-' + s.id : 'washi-pages'; };
function updateChrome() {
  bNote.classList.toggle('has', !!(sp().note || '').trim()); bNote.title = `Sticky note for ${sp().name} (${keyHint('notes')})`;
  const xl = document.getElementById('exts'); if (xl && S && xl.getAttribute('partition') !== extPart()) xl.setAttribute('partition', extPart());
  const id = focusedId(), t = id && S.tabs[id];
  if (!t) { urlTxt.innerHTML = '<span class="ph">Type an address or search</span>'; $('#lk').innerHTML = ic('search', 15); }
  else {
    let host = t.url, path = '', secure = false;
    try { const u = new URL(t.url); host = u.host.replace(/^www\./, ''); path = (u.pathname + u.search).replace(/^\/$/, ''); secure = u.protocol === 'https:'; } catch {}
    urlTxt.innerHTML = esc(host) + (path ? `<span>${esc(path.length > 70 ? path.slice(0, 70) + '…' : path)}</span>` : '');
    const n = R.notice[id];
    $('#lk').innerHTML = ic(n === 'danger' || n === 'insecure' ? 'warn' : secure ? 'lock' : 'globe', 15);
    urlEl.classList.toggle('warn', n === 'danger' || n === 'insecure' || (!secure && /^http:/.test(t.url)));
  }
  const web = !!(t && /^https?:/.test(t.url) && !R.notice[id]);
  const bk = !!(web && bmByUrl(t.url)); bStar.disabled = !web; if (bStar.classList.contains('on') !== bk) { bStar.classList.toggle('on', bk); if (bk && !calm()) bStar.firstElementChild.animate([{ transform: 'scale(.6) rotate(-30deg)' }, { transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.34,1.5,.64,1)' }); }
  bStar.title = bk ? 'Edit this bookmark (⇧⌘D)' : 'Bookmark this page (⇧⌘D)';
  const rd = !!(id && R.reading[id]), ra = !!(id && (R.readable[id] || rd));
  if (bRead.hidden === ra) { bRead.hidden = !ra; if (ra && !calm()) bRead.animate([{ transform: 'scale(.5) rotate(-12deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' }); }
  bRead.classList.toggle('on', rd); bRead.title = rd ? `Reader: text size and font (${keyHint('reader')} to leave)` : `Reader mode (${keyHint('reader')})`;
  bBoost.disabled = !web; bBoost.classList.toggle('on', web && !!R.boosted[id]); bBoost.title = R.boosted[id] ? 'This site is boosted' : 'Boost this site: colors, font, hide things';
  const blocked = id ? R.blocked[id] || 0 : 0;
  bShield.querySelector('b').textContent = blocked > 99 ? '99+' : blocked || '';
  bShield.classList.toggle('off', S.prefs.blocking === 'off'); bShield.classList.toggle('n', blocked > 0);
  bShield.title = S.prefs.blocking === 'off' ? 'Blocking is off' : `${blocked} ads and trackers blocked on this page`;
  const act = R.downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
  bDl.querySelector('b').textContent = act.length > 1 ? String(act.length) : '';
  bDl.classList.toggle('new', !act.length && R.downloads.some(d => d.state === 'completed' && d.at > (S.prefs.dlSeen || 0)));
  bDl.title = act.length ? `Downloading ${act.length === 1 ? act[0].name : act.length + ' files'}` : 'Downloads';
  const tot = act.reduce((a, d) => a + (d.total || 0), 0), got = act.reduce((a, d) => a + (d.received || 0), 0);
  bDl.style.setProperty('--p', act.length && tot ? (got / tot).toFixed(3) : act.length ? .15 : 0); bDl.classList.toggle('busy', !!act.length);
  bBack.disabled = !id || !R.canBack[id]; bFwd.disabled = !id || !R.canFwd[id]; bReload.disabled = !id;
  const ld = !!(id && R.loading[id]);
  urlEl.classList.toggle('loading', ld);
  bReload.innerHTML = ic(ld ? 'close' : 'reload'); bReload.title = ld ? 'Stop loading' : 'Reload (⌘R)';
  bSplit.classList.toggle('on', R.split); bSide.classList.toggle('on', S.dock); $('#edge').hidden = docked();
  pa.classList.toggle('has', !!R.a); pb.classList.toggle('has', !!(R.split && R.b));
  pa.classList.toggle('focus', R.focus === 'a'); pb.classList.toggle('focus', R.focus === 'b');
  $('#emptyTitle').textContent = `Nothing taped up in ${sp().name}`;
  document.title = t ? label(t) + ' · Washi' : 'Washi';
}
/* ---------- automatic folder icons: a folder you haven't picked an icon for gets a paper icon from its name and the
   sites in it (Okta, Jamf → tools; Docs, Drive → reading; Budget → money…). Picking one yourself always wins. ---------- */
const ICON_WORDS = [
  ['tools', /\b(admin|console|mdm|tools?|it|okta|jamf|kandji|iru|hexnode|intune|maas360|addigy|mosyle|devices?|help ?desk|support|tickets?|servicenow|zendesk|freshservice)\b/],
  ['code', /\b(code|dev|developer|github|gitlab|git|bitbucket|repos?|engineering|api|stack ?overflow|vercel|netlify|aws|cloudflare)\b/],
  ['book', /\b(docs?|drive|notes?|wiki|confluence|notion|reading|read|books?|learn|learning|school|study|courses?|articles?|research)\b/],
  ['chart', /\b(data|dashboards?|analytics|reports?|metrics|numbers|sheets?|stats|kpis?|datadog|grafana|looker|tableau)\b/],
  ['money', /\b(money|bank|banking|finance|budget|expenses?|bills?|tax|taxes|invoices?|payroll|rippling|gusto|shopping|shop|amazon|crypto)\b/],
  ['cal', /\b(calendar|plans?|planning|meetings?|schedule|events?|agenda|todo|to-do|tasks?|projects?|jira|asana|linear|trello)\b/],
  ['plane', /\b(travel|trips?|flights?|hotels?|vacation|holiday|airbnb|booking|maps?)\b/],
  ['music', /\b(music|songs?|spotify|playlists?|podcasts?|soundcloud|bandcamp|vinyl|records?)\b/],
  ['camera', /\b(photos?|pictures?|video|videos|youtube|vimeo|netflix|watch|movies?|tv|camera)\b/],
  ['game', /\b(games?|gaming|steam|twitch|play|xbox|playstation|nintendo)\b/],
  ['palette', /\b(design|art|figma|dribbble|behance|inspo|inspiration|ideas board|canva|fonts?)\b/],
  ['news', /\b(news|feeds?|rss|headlines|reddit|blogs?|newsletters?|press)\b/],
  ['home', /\b(home|house|family|kids|personal|life|chores|recipes?|cooking)\b/],
  ['case', /\b(work|job|jobs|office|company|team|clients?|hr|careers?|hudl|slack|zoom|teams)\b/],
  ['bulb', /\b(ideas?|brainstorm|someday|inbox|later|misc)\b/],
  ['heart', /\b(favou?rites?|faves?|loved?|health|fitness|gym|wellness)\b/],
  ['cloud', /\b(cloud|storage|backups?|dropbox|icloud|onedrive|box)\b/],
  ['sprout', /\b(garden|plants?|growing|grow|habits?)\b/],
  ['search', /\b(search|find|lookups?|references?)\b/]
];
function guessIcon(s, f) {
  const hosts = (f.tabs || []).filter(k => !k.startsWith('f:') && S.tabs[k]).map(k => hostOf(S.tabs[k].url).replace(/\.(com|org|net|io|co|app|dev)$/, '').replace(/\./g, ' '));
  const name = String(f.name || '').toLowerCase(), sites = hosts.join(' ').toLowerCase();
  let pick = null; for (const [icon, re] of ICON_WORDS) { const m = re.exec(name); if (m && (!pick || m.index < pick.at)) pick = { icon, at: m.index }; }
  if (pick) return 'p:' + pick.icon;                                       // the name says most, and its first word most of all
  const votes = {}; for (const h of hosts) for (const [icon, re] of ICON_WORDS) if (re.test(h.toLowerCase())) { votes[icon] = (votes[icon] || 0) + 1; break; }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= Math.max(1, Math.ceil(hosts.length / 3)) && sites ? 'p:' + best[0] : null;
}
function autoIcons() {
  for (const s of S.spaces) for (const f of s.folders || []) {
    if (f.live || f.iconPicked || (f.icon && !f.iconAuto)) continue;      // live folders have their own; yours stays yours
    const g = guessIcon(s, f); if (g !== (f.icon || null)) { f.icon = g; f.iconAuto = !!g; }
  }
}
const render = () => { if (S) autoIcons(); updateChrome(); pushState(); if (window.TODAY) TODAY.draw(); };
const theme = () => { applyTheme(S.prefs, palFor(sp())); readerRestyle(); };
const look = () => ({ pal: palFor(sp()), theme: S.prefs });
const syncMain = () => { const p = S.prefs; B.prefsSync({ mode: p.mode, search: searchTpl(p), gpc: !!p.gpc, askDownload: !!p.askDownload, httpsFirst: !!p.httpsFirst, safety: !!p.safety, blocking: p.blocking, dns: p.dns, clearOnExit: !!p.clearOnExit, autoPip: !!p.autoPip, suggest: !!p.suggest, scrapLinks: !!p.scrapLinks, confirmQuit: p.confirmQuit !== false, muteSites: (p.muteSites || []).slice(0, 200), keys: p.keys || {} }); refreshKeys(); };
async function refreshKeys() { try { const k = await B.keysList(); R.keys = {}; for (const a of k.actions) R.keys[a.id] = k.custom[a.id] !== undefined ? k.custom[a.id] : a.def; } catch {} }

/* ---------- native page views ---------- */
let seq = 0;
async function commit(focusPage, animate, keepB) {
  const my = ++seq, a = R.a, b = (R.split || keepB) ? R.b : null;
  updateChrome();                                                       // address label and buttons change immediately
  for (const id of [a, b]) if (id && S.tabs[id]) {
    if (!R.live[id]) await B.tabEnsure(id, S.tabs[id].url, S.pins.includes(id) ? null : spaceInfo(spaceOf(id)));   // only new or sleeping tabs need a round trip
    R.live[id] = true; S.tabs[id].seen = Date.now();
  }
  if (my !== seq) return;
  const L = layout();
  await B.panes({ a: a ? { id: a, rect: toR(L.a) } : null, b: b ? { id: b, rect: toR(L.b), hide: !R.split } : null, focus: R.focus, animate: !!animate && !calm(), space: spaceInfo(sp()) }, !!focusPage);
  render();
}
let rzT;
addEventListener('resize', () => {
  if (!S) return;
  stage.classList.add('instant'); placePanes(); commit(false, false, true);
  clearTimeout(rzT); rzT = setTimeout(() => stage.classList.remove('instant'), 150);
});

/* ---------- tabs ---------- */
/* What the page area shows for a tab: its split pair (both halves), or just the tab. Never the same tab in both panes. */
const pairKey = P => P[0] + '|' + P[1];
function showTab(id) {
  const P = pairOf(id), s = spaceOf(id);
  if (P) { R.split = true; R.a = P[0]; R.b = P[1]; R.focus = id === P[1] ? 'b' : 'a'; R.ratio = (S.ratios || {})[pairKey(P)] || .5; }
  else if (R.split && (id === R.a || id === R.b)) R.focus = id === R.b ? 'b' : 'a';
  else { R.split = false; R.b = null; R.a = id; R.focus = 'a'; R.ratio = .5; }
  if (s) s.act = id;
  for (const x of [R.a, R.b]) if (x && S.tabs[x]) { S.tabs[x].seen = Date.now(); if (S.tabs[x].unread) S.tabs[x].unread = false; }
}
function unsplit(keep) { R.split = false; R.b = null; R.focus = 'a'; R.a = keep || R.a; }
function selectTab(id, o = {}) {
  if (!S.tabs[id]) return;
  const s = spaceOf(id);
  if (s && s.id !== S.cur) return switchSpace(s.id, { want: id });
  showTab(id); placePanes();
  commit(o.focusPage !== false); save();
}
function openTab(url, o = {}) {
  const s = sp(), id = uid('t');
  S.tabs[id] = { url, title: hostOf(url), seen: Date.now() };
  const into = R.intoFolder && s.folders.find(f => f.id === R.intoFolder); R.intoFolder = null;
  const end = S.prefs.newTabPos === 'bottom';
  if (into) { into.tabs[end ? 'push' : 'unshift'](id); into.open = true; } else s.tabs[end ? 'push' : 'unshift'](id);
  B.sbFx({ type: 'new', id });
  if (o.bg) { render(); save(); } else selectTab(id);
}
function navigate(url) { const id = focusedId(); if (!id) return openTab(url); S.tabs[id].url = url; B.tabNav(id, url); }
function dropFromLists(id) { for (const s of S.spaces) { s.tabs = s.tabs.filter(x => x !== id); s.folders.forEach(f => f.tabs = f.tabs.filter(x => x !== id)); } S.pins = S.pins.filter(x => x !== id); }
const folderPath = (s, f) => { const names = [f.name]; for (let p = parentOf(s, 'f:' + f.id); p && names.length < 5; p = parentOf(s, 'f:' + p.id)) names.unshift(p.name); return names.join(' › '); };
function fallbackFor(id) {
  const s = spaceOf(id) || sp(), list = spaceTabs(s), i = list.indexOf(id), rest = list.filter(x => x !== id);
  return rest[Math.min(Math.max(i, 0), rest.length - 1)] || null;
}
function closeTab(id, o = {}) {
  if (!id || !S.tabs[id]) return;
  const shown = R.a === id || R.b === id, partner = R.split && shown ? (R.a === id ? R.b : R.a) : null;
  if (S.pins.includes(id)) {                                  // pinned tabs unload instead of disappearing
    B.tabClose(id); R.live[id] = false;
    if (shown) { const s = sp(); const nx = partner || ((s.act && s.act !== id && S.tabs[s.act]) ? s.act : (spaceTabs(s)[0] || null)); R.split = false; R.b = null; R.a = null; if (nx) showTab(nx); placePanes(); }
    commit(true); return;
  }
  const t = S.tabs[id], s = spaceOf(id);
  S.closed.unshift({ url: t.url, title: t.title, space: s && s.id });
  const next = partner || fallbackFor(id);
  const finish = () => {
    dissolve(id); dropFromLists(id); delete S.tabs[id]; B.tabClose(id); delete R.live[id];
    if (shown) { R.split = false; R.b = null; R.a = null; R.focus = 'a'; if (next && S.tabs[next]) showTab(next); placePanes(); }   // the other half takes the whole window
    commit(true); save();
  };
  if (o.noFx || !docked()) return finish();
  B.sbFx({ type: 'close', id }); setTimeout(finish, 280);
}
function reopenClosed() { const c = S.closed.shift(); if (!c) return; if (c.space && S.spaces.some(x => x.id === c.space) && c.space !== S.cur) switchSpace(c.space, { quiet: true }); openTab(c.url); }

/* ---------- spaces ---------- */
function switchSpace(id, o = {}) {
  if (id === S.cur && !o.want && !o.boot) return;
  const from = S.spaces.findIndex(x => x.id === S.cur), to = S.spaces.findIndex(x => x.id === id), target = S.spaces[to];
  const doit = () => {
    S.cur = id; const s = sp(); theme();
    R.split = false; R.b = null; R.focus = 'a'; R.a = null;
    const list = spaceTabs(s), want = o.want || (s.act && list.includes(s.act) ? s.act : list[0]) || null;
    if (want) showTab(want);
    placePanes(); B.sbFx({ type: 'swap', dir: o.quiet || o.boot ? 0 : (to > from ? 1 : -1) }); commit(true); save();
  };
  doit();                    // instant: the page changes right away, the sidebar slides its list in from the side you're going
}
function promptFor(title, value, cb) { R.promptCb = cb; B.overlayOpen({ mode: 'prompt', title, value: value || '', ...look(), tabs: [], actions: [], history: [] }); }
function addSpace() {
  if (S.spaces.length >= 6) return;
  promptFor('Name this space', '', name => {
    const used = new Set(S.spaces.map(x => x.h)), h = KEYS.find(k => !used.has(k)) || KEYS[S.spaces.length % KEYS.length];
    const s = { id: uid('s'), name: name.slice(0, 12), h, tabs: [], folders: [] };
    S.spaces.push(s); switchSpace(s.id);
  });
}
function deleteSpace(id) {
  if (S.spaces.length < 2) return;
  const s = S.spaces.find(x => x.id === id);
  for (const t of spaceTabs(s)) { dissolve(t); B.tabClose(t); delete S.tabs[t]; delete R.live[t]; }
  S.spaces = S.spaces.filter(x => x !== s);
  if (S.cur === id) switchSpace(S.spaces[0].id, { boot: true }); else { render(); save(); }
}

/* ---------- split, sidebar ---------- */
function makePair(a, b) {
  if (!a || !b || a === b || S.pins.includes(a) || S.pins.includes(b)) return false;
  const sa = spaceOf(a), sb = spaceOf(b); if (!sa || sa !== sb) return false;
  dissolve(a); dissolve(b); S.pairs.push([a, b]); return true;
}
function toggleSplit() {
  if (R.split) { unsplit(focusedId()); placePanes(); commit(true); save(); return; }     // back to one page; the pair stays in the sidebar
  const cur = R.a; if (!cur) return;
  if (pairOf(cur)) { showTab(cur); placePanes(); commit(true); save(); return; }
  const cand = spaceTabs(sp()).find(x => x !== cur && !pairOf(x)) || S.pins.find(x => x !== cur) || null;
  if (!cand) { B.fx({ type: 'toast', text: 'Open another tab first, then split.' }); return; }
  if (makePair(cur, cand)) showTab(cand); else { R.split = true; R.b = cand; R.focus = 'b'; }
  placePanes(); commit(true); save();
}
function separate(id) {
  const P = pairOf(id); if (!P) return;
  const keep = R.split && (R.a === P[0]) ? focusedId() : null;
  dissolve(id); if (keep) { unsplit(keep); placePanes(); commit(true); } else render(); save();
}
function toggleSide() {
  if (S.focusMode) { S.dock = true; return focusMode(false); }        // docking the sidebar is a way out of Focus mode
  S.dock = !S.dock; B.sbMode({ docked: S.dock, w: sbW() });
  placePanes(); commit(false, true, true); save();
}
/* ---------- Focus mode (⌥⌘F): the page gets the whole window; point at the top for the top bar ---------- */
function focusMode(on = !S.focusMode, quiet) {
  if (!!S.focusMode === !!on && !quiet) return;
  S.focusMode = !!on; R.focusPeek = false;
  document.body.classList.toggle('focus', S.focusMode); document.body.classList.remove('peek');
  B.focusSet({ on: S.focusMode }); B.sbMode({ docked: docked(), w: sbW() });
  placePanes(); commit(false, !quiet, true); updateChrome(); save();
  if (!quiet && S.focusMode) B.fx({ type: 'toast', text: `Focus mode: point at the top for the bar · ${keyHint('focus') || '⌥⌘F'} to leave`, short: true });
}
B.onFocusPeek(p => { if (!S || !S.focusMode) return; R.focusPeek = !!p; document.body.classList.toggle('peek', R.focusPeek); placePanes(); commit(false, true, true); });

/* ---------- pin, move, folders ---------- */
function pinToggle(id) {
  if (!id) return;
  const shown = R.a === id || R.b === id;
  if (S.pins.includes(id)) { S.pins = S.pins.filter(x => x !== id); sp().tabs.unshift(id); }
  else {
    if (S.pins.length >= 8) return;
    const s = spaceOf(id), P = pairOf(id); dissolve(id); dropFromLists(id); S.pins.push(id); if (s && s.act === id) s.act = null;
    if (shown && R.split) { unsplit(id); placePanes(); commit(true); }
    else if (P) render();
  }
  render(); save();
}
function moveToSpace(id, target) {
  const t = S.spaces.find(x => x.id === target); if (!t) return;
  const shown = R.a === id || R.b === id, partner = R.split && shown ? (R.a === id ? R.b : R.a) : null, next = partner || fallbackFor(id);
  const from = spaceOf(id); dissolve(id); dropFromLists(id); t.tabs.unshift(id);
  if (!!(from && from.isolated) !== !!t.isolated || (t.isolated && from !== t)) { B.tabClose(id); R.live[id] = false; }   // different login jar: the page reopens in the new one
  if (shown) { R.split = false; R.b = null; R.a = null; if (next && S.tabs[next]) showTab(next); placePanes(); }
  commit(true); save();
}
function moveToFolder(id, fid) {
  const s = spaceOf(id) || sp(); dropFromLists(id);
  const f = s.folders.find(x => x.id === fid);
  if (f) { f.tabs.unshift(id); f.open = true; } else s.tabs.unshift(id);
  render(); save();
}
function newFolder(thenMove, parentId) {
  promptFor('Name this folder', '', name => {
    const f = { id: uid('f'), name: name.slice(0, 20), open: true, tabs: [] };
    const s = sp(), parent = parentId && s.folders.find(x => x.id === parentId);
    s.folders.push(f);
    if (parent && depthOf(s, parent) < MAX_DEPTH) { parent.tabs.unshift('f:' + f.id); parent.open = true; } else s.tabs.unshift('f:' + f.id);
    if (thenMove) moveToFolder(thenMove, f.id); else { render(); save(); }
  });
}
/* ---------- live folders: GitHub pull requests or an RSS/Atom feed, kept up to date ----------
   Each item is a tab (not loaded until you click it). New ones get an unread dot; items that leave the source go
   away unless you have them open; a tab you drag out of the folder is yours to keep. */
const LIVE_EVERY = 10 * 60 * 1000;
function newLiveFolder(kind) {
  promptFor(kind === 'github' ? 'GitHub repository for pull requests (owner/repo)' : 'Feed address (RSS or Atom)', '', async v => {
    if (!v || !v.trim()) return;
    const r = await B.setupAct({ type: 'live:fetch', kind, src: v });
    if (!r || !r.ok) { B.fx({ type: 'toast', text: (r && r.error) || 'Couldn\'t load it.' }); return; }
    const s = sp(), f = { id: uid('f'), name: (kind === 'github' ? r.name + ' PRs' : r.name || hostOf(r.src)).slice(0, 20), open: true, tabs: [], live: { kind, src: r.src, at: Date.now(), error: null } };
    s.folders.push(f); s.tabs.unshift('f:' + f.id);
    mergeLive(s, f, r.items, true); render(); save();
    B.fx({ type: 'toast', text: `${f.name}: ${r.items.length} item${r.items.length === 1 ? '' : 's'}. It updates by itself.`, short: true });
  });
}
function mergeLive(s, f, items, first) {
  const tag = k => f.id + '|' + k, inFolder = new Set(f.tabs);
  const have = new Map(); for (const id of spaceTabs(s)) { const t = S.tabs[id]; if (t && t.live && t.live.startsWith(f.id + '|')) have.set(t.live, id); }
  const want = new Set(items.map(i => tag(i.key))), shown = new Set([R.a, R.b]), order = [];
  for (const it of items) {
    const id = have.get(tag(it.key));
    if (id) { if (inFolder.has(id)) order.push(id); const t = S.tabs[id]; if (!R.live[id]) { t.title = it.title; t.url = it.url; } }   // never yank a page you're reading
    else { const nid = uid('t'); S.tabs[nid] = { url: it.url, title: it.title, seen: first ? Date.now() - 1000 : Date.now(), live: tag(it.key), unread: !first }; order.push(nid); }
  }
  for (const [key, id] of have) if (!want.has(key) && inFolder.has(id) && !shown.has(id)) { dissolve(id); dropFromLists(id); delete S.tabs[id]; B.tabClose(id); delete R.live[id]; }
  const kept = new Set(order); f.tabs = [...order, ...f.tabs.filter(k => !kept.has(k) && (k.startsWith('f:') || S.tabs[k]))];   // anything else you dropped in stays, after the feed
}
let liveBusy = false;
async function refreshLive(force, only) {
  if (liveBusy || !S) return; liveBusy = true;
  try {
    for (const s of S.spaces) for (const f of s.folders) {
      if (!f.live || (only && f.id !== only) || (!force && Date.now() - (f.live.at || 0) < LIVE_EVERY)) continue;
      const r = await B.setupAct({ type: 'live:fetch', kind: f.live.kind, src: f.live.src });
      if (!S.spaces.includes(s) || !s.folders.includes(f)) continue;
      f.live.at = Date.now(); f.live.error = r && r.ok ? null : (r && r.error) || 'Couldn\'t update.';
      if (r && r.ok) mergeLive(s, f, r.items, false);
    }
  } finally { liveBusy = false; }
  render(); save();
}
setInterval(() => refreshLive(false), 60 * 1000);
function folderMenu(fid) {
  const f = sp().folders.find(x => x.id === fid); if (!f) return;
  R.menuFolder = fid;
  const s = sp(), inner = depthOf(s, f) < MAX_DEPTH, nested = !!parentOf(s, 'f:' + fid);
  const liveItems = f.live ? [{ label: 'Refresh Now', id: 'fm:refresh' }, { label: 'Mark All as Read', id: 'fm:read' }, { label: 'Stop Updating (keep tabs)', id: 'fm:unlive' }, { type: 'separator' }] : [];
  B.popupMenu([...liveItems, { label: 'New Tab in Folder', id: 'fm:new' }, { label: 'New Folder Inside…', id: 'fm:sub', enabled: inner }, { label: f.open ? 'Collapse' : 'Expand', id: 'fm:toggle' }, { label: 'Rename…', id: 'fm:rename' }, ...(f.live ? [] : [{ label: 'Icon and Color…', id: 'fm:look' }]),
    ...(nested ? [{ label: 'Move Out of Folder', id: 'fm:out' }] : []), { type: 'separator' }, { label: 'Ungroup (keep tabs)', id: 'fm:ungroup' }, { label: 'Delete Folder and Close Tabs', id: 'fm:delete' }]);
}
/* a sidebar folder's emoji and color, picked in a small paper card next to it; changes show as you pick */
function folderLook(fid, at) {
  const f = sp().folders.find(x => x.id === fid); if (!f || f.live) return;
  const x = at && Number.isFinite(at.x) ? Math.round(at.x) : (docked() ? 16 : 24), y = at && Number.isFinite(at.y) ? Math.round(at.y + TOP) : TOP + 120;
  const h = 372, top = Math.min(y, innerHeight - h - 8);
  B.panel('flook', { x: Math.max(4, x - 6), y: Math.max(TOP, top), w: 300, h }, { id: fid, name: f.name, icon: f.icon || null, color: f.color || null, ...look() });
}
function removeFolder(fid, closeTabs) {
  const s = sp(), f = s.folders.find(x => x.id === fid); if (!f) return;
  const key = 'f:' + fid, parent = parentOf(s, key), list = parent ? parent.tabs : s.tabs, i = list.indexOf(key);
  if (closeTabs) {
    const inside = flat(s, [key]), subs = new Set(); const mark = x => { subs.add(x.id); x.tabs.filter(k => k.startsWith('f:')).forEach(k => { const c = folderOf(s, k); if (c && !subs.has(c.id)) mark(c); }); }; mark(f);
    list.splice(i < 0 ? 0 : i, 1); s.folders = s.folders.filter(x => !subs.has(x.id));
    for (const t of inside) closeTab(t, { noFx: true });
    if (!inside.length) { render(); save(); }
  } else {                                                // ungroup: everything inside (tabs and folders) takes the folder's place
    list.splice(i < 0 ? 0 : i, 1, ...f.tabs); s.folders = s.folders.filter(x => x !== f); render(); save();
  }
}
function folderOut(fid) {                                 // a nested folder moves up one level, just below its parent
  const s = sp(), key = 'f:' + fid, parent = parentOf(s, key); if (!parent) return;
  parent.tabs = parent.tabs.filter(k => k !== key);
  const up = parentOf(s, 'f:' + parent.id), list = up ? up.tabs : s.tabs; list.splice(list.indexOf('f:' + parent.id) + 1, 0, key);
  render(); save();
}
/* the sidebar sends the whole arrangement after a drag: root order (tab ids, 'p:a|b' pairs, 'f:id' folders) and each folder's tabs */
function applyLayout(m) {
  const s = sp(), all = new Set(spaceTabs(s));
  const expand = keys => (keys || []).flatMap(k => k.startsWith('p:') ? k.slice(2).split('|') : [k]);
  const seen = new Set(), fids = new Set(s.folders.map(f => 'f:' + f.id));
  const clean = keys => keys.filter(k => { if (k.startsWith('f:') ? !fids.has(k) : !all.has(k)) return false; if (seen.has(k)) return false; seen.add(k); return true; });
  const before = JSON.stringify([s.tabs, s.folders.map(f => f.tabs)]);
  const root = clean(expand(m.root)), fl = {};
  for (const f of s.folders) fl[f.id] = clean(expand((m.folders || {})[f.id]));
  for (const k of all) if (!seen.has(k)) root.push(k);                    // anything the sidebar did not know about stays put
  for (const k of fids) if (!seen.has(k)) root.push(k);
  s.tabs = root; for (const f of s.folders) f.tabs = fl[f.id];
  const tabsNow = Object.fromEntries([...all].map(id => [id, 1]));
  tidyFolders(s, tabsNow);                                               // a folder dropped into itself or too deep goes back to the top level
  if (JSON.stringify([s.tabs, s.folders.map(f => f.tabs)]) === before) return render();
  render(); save();
}

/* ---------- resize a split by dragging the gap between the two pages ---------- */
gutter.addEventListener('pointerdown', e => {
  if (e.button || !R.split) return;
  e.preventDefault(); gutter.setPointerCapture(e.pointerId); gutter.classList.add('drag'); document.body.classList.add('resizing'); stage.classList.add('instant');
  const L = layout(), room = L.stage.w - GAP, x0 = L.stage.x; let raf = 0, last = e.clientX;
  const move = ev => { last = ev.clientX; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; R.ratio = (last - x0 - GAP / 2) / room; placePanes(); commit(false, false, true); }); };
  const up = () => {
    gutter.removeEventListener('pointermove', move); gutter.removeEventListener('pointerup', up); gutter.removeEventListener('pointercancel', up);
    gutter.classList.remove('drag'); document.body.classList.remove('resizing'); stage.classList.remove('instant');
    const Lx = layout(); R.ratio = Lx.a.w / (Lx.stage.w - GAP);                       // keep what the limits allowed
    const P = pairOf(R.a); if (P) { S.ratios = S.ratios || {}; S.ratios[pairKey(P)] = +R.ratio.toFixed(4); } save();
  };
  gutter.addEventListener('pointermove', move); gutter.addEventListener('pointerup', up); gutter.addEventListener('pointercancel', up);
});
gutter.addEventListener('dblclick', () => {
  if (!R.split) return; R.ratio = .5; const P = pairOf(R.a); if (P && S.ratios) delete S.ratios[pairKey(P)];
  stage.classList.remove('instant'); placePanes(); commit(false, true, true); save();
});

/* ---------- drop a tab onto the page area ---------- */
function handleDrop(m) {
  if (m.cancel || !S.tabs[m.id]) return;
  const z = zoneAt(layout(), m.x, m.y); if (!z) return;
  const id = m.id, cur = R.a;
  if (z.id === 'splitL' || z.id === 'splitR') {
    if (!cur || id === cur) { showTab(id); }
    else {
      const left = z.id === 'splitL' ? id : cur, right = z.id === 'splitL' ? cur : id;
      if (makePair(left, right)) showTab(id);
      else { dissolve(id); R.split = true; R.a = left; R.b = right; R.focus = id === right ? 'b' : 'a'; }   // temporary split (pinned tabs can't pair)
    }
  } else if (z.id === 'replace') showTab(id);
  else if (z.id === 'replaceA' || z.id === 'replaceB') {
    const slotB = z.id === 'replaceB', other = slotB ? R.a : R.b;
    if (id === other) { const t = R.a; R.a = R.b; R.b = t; R.focus = slotB ? 'b' : 'a'; if (pairOf(R.a)) { const P = pairOf(R.a); P.reverse(); } }       // dropped on its own partner: swap sides
    else if (id === (slotB ? R.b : R.a)) return;
    else {
      const old = slotB ? R.b : R.a; dissolve(old);
      const l = slotB ? other : id, r = slotB ? id : other;
      if (makePair(l, r)) showTab(id); else { dissolve(id); R.split = true; R.a = l; R.b = r; R.focus = slotB ? 'b' : 'a'; }
    }
  }
  placePanes(); commit(true); save();
}

/* ---------- command bar ---------- */
function openCmd(mode) {
  const f = focusedId(), cur = f && S.tabs[f];
  const tabs = [...new Set([...S.pins, ...spaceTabs(sp()), ...S.spaces.flatMap(spaceTabs)])].filter(id => S.tabs[id]).map(id => ({ id, title: label(S.tabs[id]), url: S.tabs[id].url, fav: S.tabs[id].fav || null, space: S.pins.includes(id) ? 'Pinned' : (spaceOf(id) || {}).name || '' }));
  const A = (id, label, key) => ({ id, label, hint: keyHint(key || id) });
  const actions = [
    A('split', 'Toggle split view'), A('sidebar', 'Pin or float the sidebar'), A('pin', 'Pin or unpin this tab'), A('reopen', 'Reopen closed tab'),
    A('find', 'Find on this page'), A('copyurl', 'Copy page address'), A('history', 'Show history'), A('archive', 'Show archived tabs'), A('downloads', 'Show downloads'), A('reader', 'Reader mode'), A('focus', 'Focus mode (hide the top bar and sidebar)'), A('notes', 'Sticky note for this space'), A('tidy', 'Tidy up tabs'), A('clear', 'Clear tabs (keeps pins and folders)'),
    A('newspace', 'New space'), A('rename', 'Rename this space'), A('delspace', 'Delete this space'), A('newfolder', 'New folder'),
    A('mute', 'Mute or unmute this tab'), A('pip', 'Picture in picture'), A('print', 'Print this page'), A('devtools', 'Open developer tools'),
    A('livegh', 'New live folder: GitHub pull requests', 'none'), A('livefeed', 'New live folder: RSS or Atom feed', 'none'), A('boost', 'Boost this site (colors, font, hide things)', 'none'), A('today', 'Show Today'), A('apps', 'Add apps to sign in to', 'none'), A('bookmark', 'Bookmark this page'), A('bookmarks', 'Show bookmarks'), A('bookmarkbar', 'Always show the bookmarks bar'), A('bmimport', 'Import bookmarks from another browser', 'none'), A('scrap', 'New little scrap'), A('arc', 'Import from Arc', 'none'), A('settings', 'Settings'), A('keys', 'Change keyboard shortcuts', 'none'), A('guide', 'Show the quick-start guide', 'none'), A('setupagain', 'Run the welcome setup again', 'none')
  ];
  B.overlayOpen({ mode: mode === 'this' && !cur ? 'new' : mode, ...look(), value: mode === 'this' && cur ? cur.url : '', tabs, actions,
    history: S.history.slice(0, 400).map(h => ({ url: h.url, title: h.title })), archive: S.archive.slice(0, 100).map(a => ({ url: a.url, title: a.title })), bookmarks: bmFlat().slice(0, 3000), suggest: suggestTpl(S.prefs) });
}
function runAction(id) {
  const f = focusedId();
  ({
    split: toggleSplit, sidebar: toggleSide, pin: () => pinToggle(f), reopen: reopenClosed, newspace: addSpace, newfolder: () => newFolder(null),
    rename: () => promptFor('Rename this space', sp().name, n => { sp().name = n.slice(0, 12); render(); save(); }),
    delspace: () => deleteSpace(S.cur), copyurl, devtools: () => f && B.tabAct(f, 'devtools'), settings: () => openSetup('settings'), guide: () => openSetup('guide'), setupagain: () => openSetup('onboard'),
    keys: () => openSetup('settings', 'keys'), boost: openBoost, livegh: () => newLiveFolder('github'), today: showToday, reader: () => readerToggle(), focus: () => focusMode(), notes: openNote, tidy: () => tidy(S.cur), clear: () => clearTabs(S.cur), apps: () => openSetup('settings', 'apps'), bookmark: bmStar, bookmarks: () => openSheet('bookmarks'), bookmarkbar: bmToggleBar, bmimport: () => openSetup('settings', 'bookmarks'), livefeed: () => newLiveFolder('feed'), scrap: () => B.scrapOpen(''), arc: () => openSetup('settings', 'import'), find: openFind, history: () => openSheet('history'), archive: () => openSheet('archive'), downloads: () => openSheet('downloads'),
    mute: () => f && B.tabAct(f, 'mute'), pip: () => f && B.tabAct(f, 'pip'), print: () => f && B.tabAct(f, 'print')
  })[id]?.();
}
function copyurl() { const f = focusedId(); if (!f) return; B.copy(S.tabs[f].url); B.fx({ type: 'toast', text: 'Copied the page address', short: true }); }
function openFind() { if (!focusedId()) return; B.panel('find', null, {}); }
/* history, archived tabs and downloads: paper sheets in the overlay */
async function openSheet(kind, extra) {
  if (kind === 'bookmarks') { R.bmSheet = true; return B.overlayOpen({ mode: 'sheet', kind, items: S.bookmarks, folders: bmFolders(), favs: bmFavs(true), ...look(), ...(extra || {}) }); }
  if (kind === 'downloads') { S.prefs.dlSeen = Date.now(); save(); updateChrome(); }
  const items = kind === 'history' ? S.history.slice(0, 3000) : kind === 'archive' ? S.archive : await B.dlList();
  B.overlayOpen({ mode: 'sheet', kind, items, ...look(), ...(extra || {}) });
}
/* ---------- welcome setup, settings and the quick-start guide (drawn in the overlay) ---------- */
/* after an update: "Fresh off the press" shows what's new since the version you had (once, in the first window) */
async function whatsNew() {
  let v = ''; try { v = (await B.setupInfo()).version || ''; } catch {}
  if (!v) return;
  const seen = S.prefs.seenVer, news = window.WHATSNEW || [], vn = x => String(x || '0').split('.').map(n => parseInt(n, 10) || 0);
  const newer = (a, b) => { const x = vn(a), y = vn(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  if (seen === v) return;
  const wasSetUp = S.prefs.done; S.prefs.seenVer = v; save();
  if (!wasSetUp) return;                                              // a new install gets the welcome instead
  const since = seen || (news[1] && news[1].v) || '0.0.0';             // from before this page existed: show this release
  if (!newer(v, since) || !news.some(r => newer(r.v, since) && !newer(r.v, v))) return;
  setTimeout(() => openSetup('news', since), 900);
}
async function openSetup(page, section) {
  let info = {}; try { info = await B.setupInfo(); R.info = info; } catch {}
  B.overlayOpen({ mode: 'setup', page, section, apps: appsPresent(), keys: R.keys, prefs: S.prefs, spaces: S.spaces.map(x => ({ id: x.id, name: x.name, h: x.h, custom: x.custom || null, isolated: !!x.isolated })), cur: S.cur, dock: S.dock, info, ...look(), tabs: [], actions: [], history: [] });
}
/* ---------- Reader mode: the article as a sheet of Washi paper over the page ---------- */
function readerLook() {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim(), rgb = (k, a) => `rgba(${v(k).split(/\s+/).join(',')},${a})`;
  const r = S.prefs.reader || {};
  return { desk: v('--desk'), paper: v('--white') || v('--paper'), ink: v('--ink'), ink2: v('--ink2'), line: rgb('--inkc', .14), wash: rgb('--inkc', .06), tape: v('--tape'), tapeInk: v('--tape'),
    dark: document.documentElement.classList.contains('dark'), scrap: !!S.prefs.wobble, face: r.face || 'serif', size: r.size || 19, width: r.width || 720 };
}
async function readerToggle(force) {
  const id = focusedId(); if (!id || (!R.readable[id] && !R.reading[id])) return;
  const on = force !== undefined ? force : !R.reading[id];
  const r = await B.readerSet(id, on, readerLook());
  if (on && !r.ok) B.fx({ type: 'toast', text: 'Couldn\'t find an article on this page', short: true });
}
function readerRestyle() { if (!S) return; for (const id of [R.a, R.b]) if (id && R.reading[id]) B.readerSet(id, true, readerLook()); }
function readerPanel() {
  const r = bRead.getBoundingClientRect(), p = S.prefs.reader || {};
  B.panel('reader', { x: Math.round(Math.max(8, r.right - 262)), y: Math.round(r.bottom + 2), w: 280, h: 196 }, { face: p.face || 'serif', size: p.size || 19, ...look() });
}
/* ---------- a sticky note for each space ---------- */
function openNote() {
  const r = bNote.getBoundingClientRect(), s = sp();
  B.panel('notes', { x: Math.round(Math.max(8, Math.min(innerWidth - 348, r.right - 300))), y: Math.round(r.bottom + 2), w: 340, h: 392 }, { text: s.note || '', name: s.name, ...look() });
}
bNote.addEventListener('click', openNote);
bRead.addEventListener('click', () => { const id = focusedId(); if (id && R.reading[id]) readerPanel(); else readerToggle(true); });
B.onSetupMsg(m => {
  if (!S) return;
  if (m.type === 'prefs') {
    for (const k in m.patch) { if (k === 'light' || k === 'dark') S.prefs[k] = { ...S.prefs[k], ...m.patch[k] }; else S.prefs[k] = m.patch[k]; }
    theme(); syncMain(); render(); save();
    if ('bookmarkBar' in m.patch || 'mode' in m.patch || 'light' in m.patch || 'dark' in m.patch) { barKey = ''; placePanes(); commit(false, false, true); }
  } else if (m.type === 'space') {
    const x = S.spaces.find(z => z.id === m.id); if (!x) return;
    if (m.h !== undefined && PAL[m.h]) { x.h = m.h; x.custom = null; }
    if (m.custom) { x.custom = { ...(x.custom || {}), ...m.custom }; for (const k in x.custom) if (!x.custom[k]) delete x.custom[k]; if (!Object.keys(x.custom).length) x.custom = null; }
    if (x.id === S.cur) theme(); render(); save();
  } else if (m.type === 'dock') { if (S.dock !== !!m.dock) toggleSide(); }
  else if (m.type === 'cleared') { hist({ t: 'clear' }); S.closed = []; save(); }
  else if (m.type === 'isolate') {
    const x = S.spaces.find(z => z.id === m.id); if (!x || !!x.isolated === !!m.on) return;
    x.isolated = !!m.on; for (const t of spaceTabs(x)) { B.tabClose(t); R.live[t] = false; }      // pages reopen with the space's own logins
    if (x.id === S.cur) commit(true); render(); save();
  } else if (m.type === 'sheet') sheetAct(m);
  else if (m.type === 'arcImport') importArc(m).then(r => B.setupReply({ type: 'arcDone', ...r }));
  else if (m.type === 'peekAdopt') adoptPeek();
  else if (m.type === 'note') { const s = sp(); s.note = String(m.text || '').slice(0, 20000); bNote.classList.toggle('has', !!s.note.trim()); save(); }
  else if (m.type === 'reader') {
    if (m.exit) return readerToggle(false);
    const r = S.prefs.reader = { ...(S.prefs.reader || {}) };
    if (m.face === 'serif' || m.face === 'sans') r.face = m.face;
    if (Number.isFinite(+m.size)) r.size = Math.max(14, Math.min(26, Math.round(+m.size)));
    save(); readerRestyle();
  }
  else if (m.type === 'folderLook') { const f = S.spaces.flatMap(x => x.folders).find(x => x.id === m.id); if (f && !f.live) { if (m.icon !== undefined) { f.icon = m.icon ? String(m.icon).slice(0, 16) : null; f.iconPicked = true; f.iconAuto = false; } if (m.color !== undefined) f.color = BMK.okColor(m.color) ? m.color : null; render(); save(); } }
  else if (m.type === 'bm') bmMsg(m);
  else if (m.type === 'apps') addApps(m.picks || []);
  else if (m.type === 'openUrl' && /^https:\/\//.test(m.url || '')) { B.overlayCancel(); openTab(m.url); }
  else if (m.type === 'bmImport') B.setupReply({ type: 'bmDone', ...bmImport(m.data, m.name) });
});
function sheetAct(m) {
  if (m.act === 'open' && m.url) openTab(m.url);
  else if (m.act === 'forget' && m.url) hist({ t: 'del', url: m.url });
  else if (m.act === 'forgetAll') hist({ t: 'clear' });
  else if (m.act === 'restore') { const i = S.archive.findIndex(a => a.at === m.at && a.url === m.url); if (i > -1) { const [a] = S.archive.splice(i, 1); if (a.space && a.space !== S.cur && S.spaces.some(x => x.id === a.space)) switchSpace(a.space, { quiet: true }); openTab(a.url); save(); } }
  else if (m.act === 'unarchive') { const i = S.archive.findIndex(a => a.at === m.at && a.url === m.url); if (i > -1) S.archive.splice(i, 1); save(); }
  else if (m.act === 'clearArchive') { S.archive = []; save(); }
}
/* ---------- bring in an Arc sidebar: spaces, pinned tabs, folders (nested), split views and favorites ----------
   Pages aren't loaded until you click them. Running it twice doesn't duplicate anything: tabs already in a space are
   skipped and folders with the same name at the same level are filled in rather than copied. */
async function importArc(o) {
  const r = await B.setupAct({ type: 'arc:read', path: o.path });
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'Couldn\'t read Arc\'s sidebar file.' };
  const want = new Set(o.keys || []), now = Date.now(), n = { spaces: 0, tabs: 0, folders: 0, pins: 0, skipped: 0 }, pairs = [];
  const newTab = t => { const id = uid('t'); S.tabs[id] = { url: t.url, title: t.title || hostOf(t.url), seen: now }; n.tabs++; return id; };
  let first = null;
  for (const as of r.spaces) {
    if (!want.has(as.key)) continue;
    const name = as.name.slice(0, 12);
    let s = S.spaces.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!s) {
      if (S.spaces.length >= 6) { n.skipped++; continue; }
      const used = new Set(S.spaces.map(x => x.h)), h = KEYS.find(k => !used.has(k)) || KEYS[S.spaces.length % KEYS.length];
      s = { id: uid('s'), name, h, tabs: [], folders: [] }; S.spaces.push(s); n.spaces++;
    }
    first = first || s;
    const urls = new Set(spaceTabs(s).map(id => S.tabs[id].url));
    const build = (nodes, depth, list) => {                    // list: the existing keys at this level (to merge same-named folders)
      const out = [];
      for (const nd of nodes) {
        if (nd.type === 'tab') { if (urls.has(nd.url)) continue; urls.add(nd.url); out.push(newTab(nd)); }
        else if (nd.type === 'pair') { const ids = nd.tabs.filter(t => !urls.has(t.url)).map(t => { urls.add(t.url); return newTab(t); }); out.push(...ids); if (ids.length === 2) pairs.push(ids); }
        else if (nd.type === 'folder') {
          if (depth > MAX_DEPTH) { out.push(...build(nd.children, depth, out)); continue; }    // deeper than Washi's 3 levels: its tabs join the folder above
          const same = [...list, ...out].filter(k => k.startsWith('f:')).map(k => folderOf(s, k)).find(f => f && f.name.toLowerCase() === nd.name.slice(0, 20).toLowerCase());
          if (same) { same.tabs.push(...build(nd.children, depth + 1, same.tabs)); continue; }
          const f = { id: uid('f'), name: nd.name.slice(0, 20), open: false, tabs: [] };
          s.folders.push(f); f.tabs = build(nd.children, depth + 1, f.tabs);
          if (!f.tabs.length && nd.children.length) { s.folders = s.folders.filter(x => x !== f); continue; }   // everything in it was already here
          out.push('f:' + f.id); n.folders++;
        }
      }
      return out;
    };
    const top = build(as.pinned, 1, s.tabs), extra = o.unpinned ? build(as.unpinned, 1, s.tabs) : [];
    s.tabs = [...top, ...extra, ...s.tabs];
  }
  if (o.favorites !== false) {
    const have = new Set(S.pins.map(id => S.tabs[id] && S.tabs[id].url)), over = [];
    for (const f of r.favorites) { if (have.has(f.url)) continue; have.add(f.url); if (S.pins.length < 8) { S.pins.push(newTab(f)); n.pins++; n.tabs--; } else over.push(f); }
    if (over.length) {                                        // more favorites than pin slots: they wait in a folder
      const s = first || sp(), f = { id: uid('f'), name: 'Arc favorites', open: false, tabs: over.map(newTab) };
      s.folders.push(f); s.tabs.unshift('f:' + f.id); n.folders++;
    }
  }
  for (const [a, b] of pairs) makePair(a, b);
  render(); save();
  const parts = [n.spaces && `${n.spaces} space${n.spaces > 1 ? 's' : ''}`, n.tabs && `${n.tabs} tab${n.tabs > 1 ? 's' : ''}`, n.folders && `${n.folders} folder${n.folders > 1 ? 's' : ''}`, n.pins && `${n.pins} pinned favorite${n.pins > 1 ? 's' : ''}`].filter(Boolean);
  return { ok: true, ...n, text: parts.length ? 'Brought in ' + parts.join(', ').replace(/, ([^,]*)$/, ' and $1') + ' from Arc.' : 'Everything from Arc was already here.' };
}
B.onScrapAdopt(async ({ sid }) => {                 // a little scrap becomes a real tab in the space you're in
  if (!S) return;
  const id = uid('t'), s = sp();
  const r = await B.scrapAdopt(sid, id, spaceInfo(s)); if (!r) return;
  if (r.reload) { if (/^https?:/.test(r.url)) openTab(r.url); return; }
  S.tabs[id] = { url: r.url, title: r.title || hostOf(r.url), seen: Date.now() }; R.live[id] = true;
  s.tabs.unshift(id); B.sbFx({ type: 'new', id }); selectTab(id);
});
async function adoptPeek() {                     // the peeked page becomes a real tab, keeping its scroll and state
  const id = uid('t'), s = sp();
  const r = await B.peekAdopt(id, spaceInfo(s)); if (!r) return;
  S.tabs[id] = { url: r.url, title: r.title || hostOf(r.url), seen: Date.now() }; R.live[id] = true;
  s.tabs.unshift(id); B.sbFx({ type: 'new', id }); selectTab(id);
}
B.onOverlayResult(r => {
  if (!S) return;
  if (r.kind === 'cmd') { if (r.cmd === 'settings:privacy') openSetup('settings', 'privacy'); else if (r.cmd === 'settings:passwords') openSetup('settings', 'passwords'); else if (/^[a-z]+$/.test(r.cmd || '')) runAction(r.cmd); return; }
  if (r.kind === 'setup') {
    const first = !S.prefs.done; S.prefs.done = true; save();
    B.setupInfo().then(i => { R.info = i; render(); }).catch(() => {});            // a GitHub token may have been added
    if (first) showToday();                                                           // first run: the Today page, with your apps to sign in to
    return;
  }
  R.bmSheet = false;
  if (r.kind === 'url') { const u = toURL(r.value); if (r.mode === 'this' && focusedId()) navigate(u); else openTab(u); }
  else if (r.kind === 'tab') selectTab(r.id);
  else if (r.kind === 'action') runAction(r.id);
  else if (r.kind === 'prompt') { const cb = R.promptCb; R.promptCb = null; cb && cb(r.value); }
});
B.onOverlayCancel(() => { R.promptCb = null; R.intoFolder = null; R.bmSheet = false; });

/* ---------- native menus, requested from the sidebar ---------- */
function tabMenu(id) {
  const pinned = S.pins.includes(id), s = spaceOf(id) || sp(), items = [{ label: pinned ? 'Unpin' : 'Pin', id: 'pin' }, { label: 'Rename…', id: 'rename' }, ...(S.tabs[id] && S.tabs[id].name ? [{ label: 'Use the Page\'s Title', id: 'unname' }] : []), { label: 'Duplicate', id: 'dup' }, { label: 'Copy Address', id: 'copy' }, { type: 'separator' }];
  if (!pinned) {
    const others = S.spaces.filter(x => x.id !== s.id);
    if (others.length) items.push({ label: 'Move to Space', submenu: others.map(x => ({ label: x.name, id: 'mv:' + x.id })) });
    items.push({ label: 'Move to Folder', submenu: [...s.folders.map(f => ({ label: folderPath(s, f), id: 'fo:' + f.id })).sort((a, b) => a.label.localeCompare(b.label)), { label: 'New Folder…', id: 'fo:new' }] });
    if (s.folders.some(f => f.tabs.includes(id))) items.push({ label: 'Remove from Folder', id: 'fo:none' });
  }
  const host = hostOf(S.tabs[id] && S.tabs[id].url || '');
  if (host) items.push({ type: 'separator' }, { label: (S.prefs.muteSites || []).includes(host) ? `Unmute ${host}` : `Mute ${host}`, id: 'mutesite' });
  if (pairOf(id)) items.push({ type: 'separator' }, { label: 'Separate Split', id: 'sep' });
  items.push({ type: 'separator' }, { label: pinned ? 'Unload' : 'Close', id: 'close' });
  R.menuTab = id; B.popupMenu(items);
}
function spaceMenu(id) {
  R.menuSpace = id;
  const loose = looseTabs(S.spaces.find(x => x.id === id)).length;
  B.popupMenu([{ label: 'Tidy Up Tabs', id: 'sp:tidy', enabled: loose > 1 }, { label: `Clear ${loose || ''} Tab${loose === 1 ? '' : 's'} (keeps pins and folders)`.replace('  ', ' '), id: 'sp:clear', enabled: loose > 0 }, { type: 'separator' },
    { label: 'Rename…', id: 'sp:rename' }, { label: 'Color', submenu: KEYS.map(k => ({ label: PAL[k].n, id: 'sp:color:' + k })) }, { type: 'separator' }, { label: 'Delete Space', id: 'sp:del', enabled: S.spaces.length > 1 }]);
}
B.onMenu(id => menuClick(id));
function menuClick(id) {
  if (!S) return;
  const t = R.menuTab, s = R.menuSpace;
  if (id === 'pin') pinToggle(t);
  else if (id === 'sep') separate(t);
  else if (id.startsWith('fm:')) { const fid = R.menuFolder, f = sp().folders.find(x => x.id === fid); if (!f) return; const k = id.slice(3);
    if (k === 'new') { R.intoFolder = fid; openCmd('new'); } else if (k === 'toggle') { f.open = !f.open; render(); save(); }
    else if (k === 'rename') promptFor('Rename this folder', f.name, n => { f.name = n.slice(0, 20); render(); save(); })
    else if (k === 'look') folderLook(fid, null)
    else if (k === 'ungroup') removeFolder(fid, false); else if (k === 'delete') removeFolder(fid, true);
    else if (k === 'sub') newFolder(null, fid); else if (k === 'out') folderOut(fid);
    else if (k === 'refresh') refreshLive(true, fid);
    else if (k === 'read') { for (const id of flat(sp(), f.tabs)) if (S.tabs[id]) S.tabs[id].unread = false; render(); save(); }
    else if (k === 'unlive') { delete f.live; for (const id of flat(sp(), f.tabs)) if (S.tabs[id]) { delete S.tabs[id].live; delete S.tabs[id].unread; } render(); save(); } }
  else if (id.startsWith('bm:')) bmMenuClick(id.slice(3));
  else if (id === 'nf:plain') newFolder(null); else if (id === 'nf:github') newLiveFolder('github'); else if (id === 'nf:feed') newLiveFolder('feed');
  else if (id === 'rename') { const tb = S.tabs[t]; if (tb) promptFor(S.pins.includes(t) ? 'Rename this pin' : 'Rename this tab', tb.name || tb.title || '', n => { n = String(n || '').trim().slice(0, 80); tb.name = n && n !== tb.title ? n : undefined; render(); save(); }); }
  else if (id === 'unname') { const tb = S.tabs[t]; if (tb) { delete tb.name; render(); save(); } }
  else if (id === 'dup') openTab(S.tabs[t].url);
  else if (id === 'copy') B.copy(S.tabs[t].url);
  else if (id === 'close') closeTab(t, { noFx: true });
  else if (id.startsWith('mv:')) moveToSpace(t, id.slice(3));
  else if (id === 'fo:new') newFolder(t);
  else if (id === 'fo:none') moveToFolder(t, null);
  else if (id.startsWith('fo:')) moveToFolder(t, id.slice(3));
  else if (id === 'sp:rename') promptFor('Rename this space', S.spaces.find(x => x.id === s).name, n => { S.spaces.find(x => x.id === s).name = n.slice(0, 12); render(); save(); });
  else if (id === 'sp:del') deleteSpace(s);
  else if (id === 'sp:tidy') tidy(s);
  else if (id === 'sp:clear') clearTabs(s);
  else if (id === 'mutesite') muteSite(hostOf(S.tabs[t] && S.tabs[t].url || ''));
  else if (id.startsWith('sp:color:')) { const sc = S.spaces.find(x => x.id === s); sc.h = +id.slice(9); sc.custom = null; if (s === S.cur) theme(); render(); save(); }
}

/* ---------- events from the sidebar view, the menu and the page views ---------- */
B.onIntent(m => {
  if (!S) return;
  switch (m.type) {
    case 'select': selectTab(m.id); break;
    case 'close': closeTab(m.id, { noFx: true }); break;
    case 'newtab': openCmd('new'); break;
    case 'folder': { const f = sp().folders.find(x => x.id === m.id); if (f) { f.open = !f.open; render(); save(); } break; }
    case 'space': switchSpace(m.id); break;
    case 'np': { const id = m.id; if (!S.tabs[id]) break; if (m.act === 'toggle') { B.tabAct(id, 'mediaToggle'); if (R.media[id]) { R.media[id].playing = !R.media[id].playing; R.media[id].at = Date.now(); } pushState(); } else if (m.act === 'open') selectTab(id); else if (m.act === 'hide') { R.npHide = id; pushState(); } break; }
    case 'addspace': addSpace(); break;
    case 'ctxTab': tabMenu(m.id); break;
    case 'ctxSpace': spaceMenu(m.id); break;
    case 'layout': applyLayout(m); break;
    case 'newfolder': newFolder(null); break;
    case 'nfMenu': R.menuFolder = null; B.popupMenu([{ label: 'New Folder…', id: 'nf:plain' }, { type: 'separator' }, { label: 'New Live Folder: GitHub Pull Requests…', id: 'nf:github' }, { label: 'New Live Folder: RSS or Atom Feed…', id: 'nf:feed' }]); break;
    case 'ctxFolder': folderMenu(m.id); break;
    case 'folderNew': { const f = sp().folders.find(x => x.id === m.id); if (f) { R.intoFolder = f.id; openCmd('new'); } break; }
    case 'dropTab': handleDrop(m); break;
    case 'mute': B.tabAct(m.id, 'mute'); break;
    case 'warm': warm(m.id); break;
    case 'today': showToday(); break;
    case 'tidy': tidy(S.cur); break;
    case 'tabpeek': { const t = m.id && S.tabs[m.id]; if (!t || S.prefs.tabPeek === false || m.id === focusedId()) { B.tabPeek(null); break; } B.tabPeek({ id: m.id, y: (+m.y || 0) + TOP, h: +m.h || 36, title: label(t), url: t.url, fav: t.fav || null, live: !!R.live[m.id], ...look() }); break; }
    case 'rename': if (S.tabs[m.id]) { R.menuTab = m.id; menuClick('rename'); } break;
    case 'sbw': { const w = Math.max(200, Math.min(380, Math.round(+m.w || SB_W))); if (w !== S.prefs.sbW) { S.prefs.sbW = w; B.sbMode({ docked: docked(), w, resize: true }); stage.classList.add('instant'); placePanes(); commit(false, false, true); clearTimeout(rzT); rzT = setTimeout(() => stage.classList.remove('instant'), 150); } if (m.done) { save(); syncMain(); } break; }
    case 'folderLook': folderLook(m.id, m); break;
    case 'pinOrder': { const ids = Array.isArray(m.ids) ? m.ids.filter(id => S.pins.includes(id)) : []; if (ids.length === S.pins.length && new Set(ids).size === ids.length) { S.pins = ids; render(); save(); } break; }
  }
});
B.onSbReady(() => { if (!S) return; B.sbMode({ docked: docked(), w: sbW() }); pushState(); });   // before boot finishes, boot pushes the first state itself
/* ---------- Ctrl-Tab: recent tabs as a row of cards. A quick tap flips back to the last tab without showing anything. ---------- */
let SW = null;
function switcher(d) {
  if (!SW) {
    const cur = focusedId();
    const list = [...new Set([...S.pins, ...spaceTabs(sp())])].filter(id => S.tabs[id]).sort((x, y) => (x === cur ? -1 : y === cur ? 1 : (S.tabs[y].seen || 0) - (S.tabs[x].seen || 0)));
    if (list.length < 2) return;
    SW = { list, i: 0, shown: false };
    SW.t = setTimeout(() => { if (SW) { SW.shown = true; showSwitch(); } }, 140);
  }
  SW.i = (SW.i + d + SW.list.length) % SW.list.length;
  if (SW.shown) showSwitch();
}
function showSwitch() {
  const items = SW.list.map(id => { const t = S.tabs[id]; return { id, title: label(t), url: t.url, fav: t.fav || null, pin: S.pins.includes(id) }; });
  B.fx({ type: 'switch', items, index: SW.i, ...look() });
}
function switchEnd(pick) {
  if (!SW) return; clearTimeout(SW.t);
  const id = pick !== undefined ? SW.list[pick] : SW.list[SW.i], shown = SW.shown; SW = null;
  if (shown) B.fx({ type: 'switchEnd' });
  if (id && pick !== null) selectTab(id);
}
const cycle = d => { const list = [...S.pins, ...spaceTabs(sp())]; if (!list.length) return; const i = list.indexOf(focusedId()); selectTab(list[(i + d + list.length) % list.length]); };
B.onCmd(n => {
  if (!S) return;
  if (n === 'boost:undo') { B.setupAct({ type: 'boost:undoLast' }); return; }
  if (n === 'switch:next' || n === 'switch:prev') return switcher(n === 'switch:next' ? 1 : -1);
  if (n === 'switch:commit') return switchEnd(); if (n === 'switch:cancel') return switchEnd(null);
  if (n.startsWith('switch:pick:')) return switchEnd(+n.slice(12));
  if (n === 'edge:off' || n === 'edge:on') { $('#edge').classList.toggle('away', n === 'edge:off'); return; }
  if (n === 'settings') return openSetup('settings'); if (n === 'settings:updates') return openSetup('settings', 'help'); if (n === 'settings:keys') return openSetup('settings', 'keys'); if (n === 'guide') return openSetup('guide');
  if (['find', 'copyurl', 'history', 'archive', 'downloads', 'newfolder', 'bookmark', 'bookmarks', 'bookmarkbar', 'today', 'reader', 'notes', 'focus'].includes(n)) return runAction(n);
  if (n === 'tidy:undo') { const sn = tidySnap; tidySnap = null; if (sn) restoreSnap(sn); return; }
  if (n === 'bm:undo') return bmUndo(); if (n === 'setupagain') return openSetup('onboard'); if (n === 'whatsnew') return openSetup('news');
  if (n === 'newtab') openCmd('new'); else if (n === 'location') openCmd('this');
  else if (n === 'close') closeTab(focusedId()); else if (n === 'reopen') reopenClosed();
  else if (n === 'split') toggleSplit(); else if (n === 'sidebar') toggleSide(); else if (n === 'newspace') addSpace();
  else if (n === 'pin') pinToggle(focusedId()); else if (n === 'nexttab') cycle(1); else if (n === 'prevtab') cycle(-1);
  else if (n.startsWith('space:')) { const s = S.spaces[+n.slice(6) - 1]; if (s) switchSpace(s.id); }
  else if (n.startsWith('pin:')) { const id = S.pins[+n.slice(4) - 1]; if (id) selectTab(id); }
});
const early = [];                                   // links handed over (e.g. from other apps) before startup finished
B.onOpenRequest(({ url, bg, split }) => {
  if (!S) return early.push([url, bg]);
  if (!split) return openTab(url, { bg });
  const cur = focusedId(); openTab(url, { bg: true }); const id = sp().tabs.find(k => !k.startsWith('f:') && S.tabs[k] && S.tabs[k].url === url);
  if (cur && id && !S.pins.includes(cur) && makePair(cur, id)) { showTab(id); placePanes(); commit(true); save(); } else if (id) selectTab(id);
});
B.onPaneFocus(w => { R.focus = w; if (S) render(); });
B.onTab(({ id, ...p }) => {
  if (!S) return;
  const t = S.tabs[id]; if (!t) return;
  if (p.closeMe) return closeTab(id, { noFx: true });
  if (p.url !== undefined) {
    t.url = p.url; if (t.app) t.appSeen = true;
    if (/^https?:/.test(p.url) && !p.notice && (!S.history[0] || S.history[0].url !== p.url)) {          // every page you land on is history, including the first one in a tab
      hist({ t: 'add', e: { url: p.url, title: t.title, fav: smallFav(t.fav), t: Date.now() } });
    }
  }
  if (p.title !== undefined) { t.title = p.title; const h = S.history.find(x => x.url === t.url); if (h && h.title !== p.title) hist({ t: 'upd', url: t.url, title: p.title }); }
  if (p.fav !== undefined) { t.fav = p.fav; const h = S.history.find(x => x.url === t.url), f = smallFav(p.fav); if (h && h.fav !== f) hist({ t: 'upd', url: t.url, fav: f }); }
  if (p.notice !== undefined) R.notice[id] = p.notice;
  for (const k of ['loading', 'audible', 'muted', 'blocked', 'boosted', 'canBack', 'canFwd', 'readable', 'reading']) if (p[k] !== undefined) R[k][id] = p[k];
  if (p.media !== undefined) { if (p.media) { R.media[id] = { ...p.media, at: Date.now() }; if (p.media.playing && R.npHide === id) R.npHide = null; } else delete R.media[id]; pushState(); }
  render(); save();
});

/* ---------- bookmarks: shared by every window. The bar is always shown, shown on hover, or hidden (Settings). ---------- */
const BM_MAX_DEPTH = 8;
function* bmWalk(list = S.bookmarks, parent = null) { for (const n of list) { yield [n, list, parent]; if (n.type === 'folder') yield* bmWalk(n.kids, n); } }
const bmFind = id => { for (const x of bmWalk()) if (x[0].id === id) return { node: x[0], list: x[1], parent: x[2] }; return null; };
const bmByUrl = url => { if (!url || !S.bookmarks.length) return null; for (const [n] of bmWalk()) if (n.type === 'bm' && n.url === url) return n; return null; };
function bmFolders() { const out = [], walk = (l, depth, path) => { for (const n of l) if (n.type === 'folder') { out.push({ id: n.id, name: n.name, path: path ? path + ' › ' + n.name : n.name, depth }); walk(n.kids, depth + 1, path ? path + ' › ' + n.name : n.name); } }; walk(S.bookmarks, 0, ''); return out; }
function bmFlat() { const out = [], walk = (l, path) => { for (const n of l) { if (n.type === 'folder') walk(n.kids, path ? path + ' › ' + n.name : n.name); else out.push({ url: n.url, title: n.title || hostOf(n.url), path: path || 'Bookmarks bar' }); } }; walk(S.bookmarks, ''); return out; }
const bmCount = f => f.kids.reduce((a, k) => a + (k.type === 'folder' ? bmCount(k) : 1), 0);
const bmDepth = n => n.type === 'folder' ? 1 + Math.max(0, ...n.kids.map(bmDepth)) : 0;
const levelOf = n => { let d = 0; for (let p = bmFind(n.id)?.parent; p && d < 20; p = bmFind(p.id)?.parent) d++; return d; };
/* favicons: the bookmark's own, or the one history has for that page or site */
function bmFavs(all) {
  const byUrl = new Map(), byHost = new Map();
  for (const h of S.history) if (h.fav) { if (!byUrl.has(h.url)) byUrl.set(h.url, h.fav); const k = hostOf(h.url); if (!byHost.has(k)) byHost.set(k, h.fav); }
  for (const t of Object.values(S.tabs)) if (t.fav && t.fav.length < 2500) { if (!byUrl.has(t.url)) byUrl.set(t.url, t.fav); const k = hostOf(t.url); if (!byHost.has(k)) byHost.set(k, t.fav); }
  const out = {}, list = all ? [...bmWalk()].map(x => x[0]) : S.bookmarks;
  for (const n of list) if (n.type === 'bm' && !n.fav) { const f = byUrl.get(n.url) || byHost.get(hostOf(n.url)); if (f) out[n.url] = f; }
  return out;
}
const barMode = () => S.prefs.bookmarkBar || 'hover';
const barAlways = () => !!S && barMode() === 'always';
const light = () => S.bookmarks.map(n => n.type === 'folder' ? { id: n.id, type: 'folder', name: n.name, icon: n.icon || null, color: n.color || null, n: bmCount(n) } : n);
let barKey = '', barW = 0;
function placeBar(L) {
  const on = barAlways(); document.body.classList.toggle('bm-always', on);
  if (!on) { barKey = ''; bmbar.innerHTML = ''; return; }
  const s = L.stage; bmbar.style.left = s.x + 'px'; bmbar.style.top = TOP + 'px'; bmbar.style.width = s.w + 'px'; bmbar.style.height = BMH + 'px';
  const key = JSON.stringify(S.bookmarks.map(n => [n.id, n.title || n.name, n.icon, n.color, n.url, n.type === 'folder' ? bmCount(n) : 0, !!n.fav])) + S.prefs.mode;
  if (key !== barKey) { barKey = key; BMK.draw(bmbar, light(), bmFavs(), bmAct); barW = s.w; }
  else if (barW !== s.w) { barW = s.w; BMK.fit(bmbar); }
}
function bmChanged() {
  barKey = ''; placePanes(); updateChrome(); save();
  if (R.bmSheet) B.setupReply({ type: 'bmTree', items: S.bookmarks, folders: bmFolders(), favs: bmFavs(true) });
}
window.BOOKMARKS = { refresh: () => { barKey = ''; placePanes(); updateChrome(); if (R.bmSheet) B.setupReply({ type: 'bmTree', items: S.bookmarks, folders: bmFolders(), favs: bmFavs(true) }); } };
/* hover mode: resting on the top bar for a moment shows the bar over the top of the page */
const topbar = $('.topbar'); let hoverT = 0;
/* On hover: rest the pointer on an empty part of the top bar (not the address or a button), or touch its bottom edge
   just above the page. Passing through on the way to the menu bar or a button doesn't open it. */
let barAt = null;
const showBar = () => { if (!S.focusMode) B.bmHover({ items: light(), favs: bmFavs(), ...look() }); };
topbar.addEventListener('pointermove', e => {
  if (!S || barMode() !== 'hover' || !S.bookmarks.length || window.__macDrag) return;   // (tests: on a Mac the drag area sends nothing)
  const edge = e.clientY >= TOP - 6, calm = !e.target.closest('#url,button,input,a');
  if (barAt && Math.hypot(e.clientX - barAt.x, e.clientY - barAt.y) < 4 && !edge) return;     // still resting: keep the timer
  barAt = { x: e.clientX, y: e.clientY }; clearTimeout(hoverT);
  if (edge || calm) hoverT = setTimeout(showBar, edge ? 80 : 240);
});
topbar.addEventListener('pointerleave', () => { clearTimeout(hoverT); barAt = null; });
/* the bottom edge of the top bar: a strip that isn't part of the window-drag area, so it hears the pointer on a Mac */
const bmEdge = $('#bmEdge'); let edgeT = 0;
bmEdge.addEventListener('pointerenter', () => { if (!S || barMode() !== 'hover' || !S.bookmarks.length) return; clearTimeout(edgeT); edgeT = setTimeout(showBar, 70); });
bmEdge.addEventListener('pointerleave', () => clearTimeout(edgeT));
bmEdge.addEventListener('pointerdown', () => clearTimeout(edgeT));
B.onBmEdge(() => { if (S && barMode() === 'hover' && S.bookmarks.length ) showBar(); });   // the pointer left the page upward
topbar.addEventListener('pointerdown', () => { clearTimeout(hoverT); barAt = null; });
B.onBmAct(m => { if (S) bmAct(m); });

function bmOpen(n, bg) {
  if (!n || n.type !== 'bm') return;
  const here = [...S.pins, ...spaceTabs(sp())].find(id => S.tabs[id] && S.tabs[id].url === n.url);
  if (here && !bg) return selectTab(here);
  openTab(n.url, { bg });
}
function bmFolderMenu(f) {
  const items = f.kids.slice(0, 400).map(k => k.type === 'folder' ? { label: BL.menuIcon(k.icon) + k.name, submenu: bmFolderMenu(k) } : { label: (k.title || hostOf(k.url)).slice(0, 70), id: 'bm:o:' + k.id });
  const n = f.kids.filter(k => k.type === 'bm').length;
  if (!items.length) return [{ label: 'Empty', id: 'bm:none', enabled: false }];
  if (n > 1) items.push({ type: 'separator' }, { label: `Open All ${n} in New Tabs`, id: 'bm:all:' + f.id });
  return items;
}
function bmAct(m) {
  const x = m.id && bmFind(m.id), n = x && x.node, at = { x: m.x, y: m.y };
  if (m.act === 'open') return bmOpen(n, m.bg);
  if (m.act === 'folder' && n) return B.popupMenu(bmFolderMenu(n), at);
  if (m.act === 'more') { const hid = S.bookmarks.filter(k => (m.ids || []).includes(k.id)); return B.popupMenu(hid.map(k => k.type === 'folder' ? { label: BL.menuIcon(k.icon) + k.name, submenu: bmFolderMenu(k) } : { label: (k.title || hostOf(k.url)).slice(0, 70), id: 'bm:o:' + k.id }), at); }
  if (m.act === 'move') return bmMove(m.id, m.target, m.into, m.before);
  if (m.act === 'ctx') {
    R.bmCtx = n ? n.id : null;
    const mode = barMode(), show = [{ type: 'separator' }, { label: 'Show Bookmarks Bar', submenu: [['always', 'Always'], ['hover', 'When I Point at the Top'], ['hidden', 'Never']].map(([v, l]) => ({ label: l, id: 'bm:mode:' + v, checked: mode === v })) }, { label: 'Manage Bookmarks…', id: 'bm:manage' }];
    if (!n) return B.popupMenu([{ label: 'Bookmark This Page', id: 'bm:add', enabled: canStar() }, { label: 'New Folder…', id: 'bm:newf' }, ...show], at);
    if (n.type === 'folder') return B.popupMenu([{ label: `Open All (${bmCount(n)})`, id: 'bm:all:' + n.id, enabled: bmCount(n) > 0 }, { type: 'separator' }, { label: 'Edit…', id: 'bm:edit:' + n.id }, { label: 'New Folder Inside…', id: 'bm:newf:' + n.id, enabled: levelOf(n) < BM_MAX_DEPTH - 1 }, { type: 'separator' }, { label: 'Delete Folder', id: 'bm:del:' + n.id }, ...show], at);
    return B.popupMenu([{ label: 'Open', id: 'bm:o:' + n.id }, { label: 'Open in New Tab', id: 'bm:bg:' + n.id }, { label: 'Copy Address', id: 'bm:copy:' + n.id }, { type: 'separator' }, { label: 'Edit…', id: 'bm:edit:' + n.id }, { label: 'Delete', id: 'bm:del:' + n.id }, ...show], at);
  }
}
function bmMenuClick(k) {
  const id = k.replace(/^[a-z]+:/, ''), x = bmFind(id), n = x && x.node;
  if (k.startsWith('o:')) bmOpen(n);
  else if (k.startsWith('bg:')) bmOpen(n, true);
  else if (k.startsWith('all:') && n) { const list = n.kids.filter(c => c.type === 'bm'); list.forEach((c, i) => openTab(c.url, { bg: i > 0 })); }
  else if (k.startsWith('copy:') && n) { B.copy(n.url); B.fx({ type: 'toast', text: 'Copied the address', short: true }); }
  else if (k.startsWith('edit:') && n) bmEdit(n);
  else if (k.startsWith('del:') && n) bmDelete(n.id);
  else if (k === 'add') bmStar();
  else if (k === 'newf' || k.startsWith('newf:')) bmNewFolder(k.startsWith('newf:') ? id : null);
  else if (k.startsWith('mode:')) bmSetMode(k.slice(5));
  else if (k === 'manage') openSheet('bookmarks');
}
function bmSetMode(v) {
  if (!['always', 'hover', 'hidden'].includes(v) || barMode() === v) return;
  if (v === 'always') S.prefs.barLast = barMode();          // ⇧⌘B goes back to this
  S.prefs.bookmarkBar = v; placePanes(); commit(false, false, true); save(); syncMain();
}
function bmToggleBar() {
  const v = barAlways() ? (S.prefs.barLast === 'hidden' ? 'hidden' : 'hover') : 'always'; bmSetMode(v); if (v !== 'always') S.prefs.barLast = v;
  B.fx({ type: 'toast', text: v === 'always' ? 'Bookmarks bar is always shown' : v === 'hover' ? 'Bookmarks bar shows when you point at the top' : 'Bookmarks bar is hidden', short: true });
}
const canStar = () => { const id = focusedId(), t = id && S.tabs[id]; return !!(t && /^https?:/.test(t.url) && !R.notice[id]); };
/* ☆ or ⇧⌘D: bookmark the page (at the end of the bar) and open the editor, or edit it if it's already there */
function bmStar() {
  const id = focusedId(), t = id && S.tabs[id]; if (!canStar()) return;
  let n = bmByUrl(t.url), fresh = false;
  if (!n) { n = { id: uid('b'), type: 'bm', url: t.url, title: label(t).slice(0, 200), fav: smallFav(t.fav) }; S.bookmarks.push(n); fresh = true; bmChanged(); }
  bmEdit(n, { fresh, star: true });
}
function bmEdit(n, o = {}) {
  const x = bmFind(n.id); if (!x) return;
  const isF = n.type === 'folder', r = bStar.getBoundingClientRect(), h = isF ? 348 : 244;
  const near = o.star || !barAlways() ? { x: Math.round(Math.max(8, Math.min(innerWidth - 380, r.right - 350))), y: Math.round(r.bottom + 2) } : { x: Math.round((innerWidth - 372) / 2), y: TOP + BMH };
  B.panel('bmedit', { x: near.x, y: near.y, w: 372, h }, { node: isF ? { id: n.id, type: 'folder', name: n.name, icon: n.icon || null, color: n.color || null } : n, exclude: isF ? [...bmWalk([n])].filter(y => y[0].type === 'folder').map(y => y[0].id) : [], folders: bmFolders(), parent: x.parent ? x.parent.id : '', fresh: !!o.fresh, ...look() });
}
function bmNewFolder(parentId) {
  const p = parentId && bmFind(parentId), list = p ? p.node.kids : S.bookmarks;
  const f = { id: uid('b'), type: 'folder', name: 'New folder', icon: null, color: null, kids: [] };
  list.push(f); bmChanged(); bmEdit(f, { fresh: true });
}
/* moving: before or after another item (in its folder), or into a folder. A folder can't go inside itself. */
function bmMove(id, target, into, before) {
  const a = bmFind(id), b = bmFind(target); if (!a || !b || id === target) return;
  for (let p = b.node; p; p = bmFind(p.id)?.parent) if (p.id === id) return;              // target is inside what's moving
  if (into && b.node.type === 'folder') {
    if (a.node.type === 'folder' && levelOf(b.node) + 1 + bmDepth(a.node) > BM_MAX_DEPTH) return;
    a.list.splice(a.list.indexOf(a.node), 1); b.node.kids.push(a.node);
  } else {
    if (a.node.type === 'folder' && (b.parent ? levelOf(b.parent) + 1 : 0) + bmDepth(a.node) > BM_MAX_DEPTH) return;
    a.list.splice(a.list.indexOf(a.node), 1);
    const i = b.list.indexOf(b.node); b.list.splice(before ? i : i + 1, 0, a.node);
  }
  bmChanged();
}
let bmLast = null;
function bmDelete(id) {
  const x = bmFind(id); if (!x) return;
  const i = x.list.indexOf(x.node); x.list.splice(i, 1);
  bmLast = { node: x.node, parent: x.parent ? x.parent.id : null, i };
  bmChanged();
  const what = x.node.type === 'folder' ? `Deleted “${x.node.name}”` + (bmCount(x.node) ? ` and ${bmCount(x.node)} inside` : '') : 'Removed the bookmark';
  B.fx({ type: 'toast', text: what, action: { label: 'Undo', cmd: 'bm:undo' } });
}
function bmUndo() {
  if (!bmLast) return; const { node, parent, i } = bmLast; bmLast = null;
  const p = parent && bmFind(parent), list = p ? p.node.kids : S.bookmarks;
  list.splice(Math.min(i, list.length), 0, node); bmChanged();
}
/* from the edit form, the sheet and the bar strip in the overlay */
function bmMsg(m) {
  const x = m.id && bmFind(m.id), n = x && x.node;
  if (m.act === 'save' && n) {
    const p = m.patch || {};
    if (n.type === 'folder') { n.name = String(p.name || 'Folder').slice(0, 40); n.icon = p.icon ? String(p.icon).slice(0, 16) : null; n.color = BMK.okColor(p.color) ? p.color : null; }
    else { if (/^https?:\/\/\S+$/i.test(p.url || '') && p.url.length < 8192) { if (p.url !== n.url) n.fav = null; n.url = p.url; } n.title = String(p.title || '').slice(0, 200) || hostOf(n.url); }
    const now = x.parent ? x.parent.id : '';
    if ((p.parent || '') !== now) {
      const to = p.parent ? bmFind(p.parent) : null;
      let ok = !p.parent || (to && to.node.type === 'folder');
      if (ok && to) for (let q = to.node; q; q = bmFind(q.id)?.parent) if (q.id === n.id) ok = false;
      if (ok && n.type === 'folder' && to && levelOf(to.node) + 1 + bmDepth(n) > BM_MAX_DEPTH) ok = false;
      if (ok) { x.list.splice(x.list.indexOf(n), 1); (to ? to.node.kids : S.bookmarks).push(n); }
    }
    bmChanged();
  }
  else if (m.act === 'del' && n) bmDelete(n.id);
  else if (m.act === 'discard' && n && n.type === 'folder' && !n.kids.length) { x.list.splice(x.list.indexOf(n), 1); bmChanged(); }   // "New folder" you cancelled
  else if (m.act === 'open' && n) bmOpen(n, m.bg);
  else if (m.act === 'move') bmMove(m.id, m.target, m.into, m.before);
  else if (m.act === 'newf') bmNewFolderQuiet(m.parent || null);
  else if (m.act === 'import') openSetup('settings', 'bookmarks');
}
function bmNewFolderQuiet(parentId) {                     // from the sheet: the new folder is edited right there
  const p = parentId && bmFind(parentId), list = p ? p.node.kids : S.bookmarks;
  const f = { id: uid('b'), type: 'folder', name: 'New folder', icon: null, color: null, kids: [] };
  list.push(f); bmChanged(); B.setupReply({ type: 'bmFresh', id: f.id });
}
/* bring in bookmarks from another browser. Their bookmarks bar joins yours; everything else goes in a folder.
   Running it twice adds nothing twice: bookmarks you already have are skipped, same-named folders are filled in. */
function bmImport(data, name) {
  if (!data || !Array.isArray(data.bar) || !Array.isArray(data.other)) return { ok: false, error: 'Couldn\'t read those bookmarks.' };
  const hl = Array.isArray(data.history) ? data.history.filter(h => h && typeof h.url === 'string' && /^https?:\/\//i.test(h.url)).slice(0, 3000) : [];
  const knownPages = new Set(S.history.map(h => h.url)), newPages = new Set(hl.map(h => h.url).filter(u => !knownPages.has(u))).size;
  if (hl.length) hist({ t: 'merge', list: hl.map(h => ({ url: h.url, title: String(h.title || '').slice(0, 300), t: +h.t || 0 })) });
  name = String(name || 'another browser').slice(0, 30);
  const have = new Set([...bmWalk()].filter(x => x[0].type === 'bm').map(x => x[0].url)), n = { bm: 0, f: 0 };
  const merge = (nodes, into, depth) => {
    for (const nd of nodes) {
      if (!nd || typeof nd !== 'object') continue;
      if (nd.type === 'bm') { if (!/^https?:\/\/\S+$/i.test(nd.url || '') || have.has(nd.url)) continue; have.add(nd.url); into.push({ id: uid('b'), type: 'bm', url: String(nd.url).slice(0, 8192), title: String(nd.title || '').slice(0, 200) || hostOf(nd.url) }); n.bm++; }
      else if (nd.type === 'folder' && Array.isArray(nd.kids)) {
        if (depth >= BM_MAX_DEPTH) { merge(nd.kids, into, depth); continue; }         // deeper than Washi keeps: its bookmarks join the folder above
        const nm = String(nd.name || 'Folder').slice(0, 40);
        const same = into.find(k => k.type === 'folder' && k.name.toLowerCase() === nm.toLowerCase());
        if (same) { merge(nd.kids, same.kids, depth + 1); continue; }
        const f = { id: uid('b'), type: 'folder', name: nm, icon: null, color: null, kids: [] };
        merge(nd.kids, f.kids, depth + 1);
        if (f.kids.length) { into.push(f); n.f++; }
      }
    }
  };
  merge(data.bar, S.bookmarks, 0);
  if (data.other.length) merge([{ type: 'folder', name: data.bar.length ? `More from ${name}` : `From ${name}`, kids: data.other }], S.bookmarks, 0);
  bmChanged();
  const pw = data.pw && (+data.pw.added || 0) + (+data.pw.updated || 0);
  if (!n.bm && !newPages && !pw) return { ok: true, n: 0, pages: 0, text: `Everything from ${name} was already here.` };
  const parts = [n.bm && `${n.bm} bookmark${n.bm > 1 ? 's' : ''}${n.f ? ` in ${n.f} folder${n.f > 1 ? 's' : ''}` : ''}`, newPages && `${newPages.toLocaleString()} page${newPages > 1 ? 's' : ''} of history`, pw && `${pw} password${pw > 1 ? 's' : ''}`].filter(Boolean);
  if (parts.length > 2) parts.splice(0, parts.length - 1, parts.slice(0, -1).join(', '));
  return { ok: true, n: n.bm, pages: newPages, text: `Brought in ${parts.join(' and ')} from ${name}.` };
}
bStar.addEventListener('click', bmStar);

/* ---------- your apps (picked in setup or Settings › Apps) ----------
   Each becomes a pinned tab, or (for a space that keeps its own logins) a tab in that space's "Apps" folder, so it
   signs in with that space's cookies. The Today page lists the ones you haven't signed in to yet. */
const appCat = () => BL.appsFor(R.info);
const appTabsOf = id => Object.keys(S.tabs).filter(k => S.tabs[k].app === id && (S.pins.includes(k) || S.spaces.some(x => spaceTabs(x).includes(k))));
const appsPresent = () => appCat().map(a => a.id).filter(id => appTabsOf(id).length);
function addApps(picks) {
  const cat = appCat(), now = Date.now(); let n = 0;
  S.prefs.apps = { ...(S.prefs.apps || {}) };
  for (const p of picks) {
    const a = cat.find(x => x.id === p.id); if (!a || appTabsOf(a.id).length) continue;
    const home = p.space ? S.spaces.find(x => x.id === p.space && x.isolated) : null;
    const id = uid('t'); S.tabs[id] = { url: a.url, title: a.n, seen: now - 1000 + n, app: a.id, fav: BL.appIcon(a) };
    if (!home && S.pins.length < 12) S.pins.push(id);
    else {
      const s = home || sp();
      let f = s.folders.find(x => x.name === 'Apps');
      if (!f) { f = { id: uid('f'), name: 'Apps', open: true, tabs: [] }; s.folders.push(f); s.tabs.unshift('f:' + f.id); }
      f.tabs.push(id);
    }
    S.prefs.apps[a.id] = { space: home ? home.id : '', at: now };
    n++;
  }
  if (!n) return;
  S.prefs.appsHide = false;
  render(); save(); syncMain();
  B.fx({ type: 'toast', text: `Added ${n} app${n > 1 ? 's' : ''}. Sign in to each one from Today.`, short: true });
}
/* the Today page: shown whenever no page is open in this space (and after setup) */
function showToday() {
  if (!S) return;
  R.split = false; R.b = null; R.a = null; R.focus = 'a';
  placePanes(); commit(false); render();
}

/* ---------- top bar ---------- */
bSide.addEventListener('click', toggleSide);
bBack.addEventListener('click', () => { const id = focusedId(); id && B.tabAct(id, 'back'); });
bFwd.addEventListener('click', () => { const id = focusedId(); id && B.tabAct(id, 'forward'); });
bReload.addEventListener('click', () => { const id = focusedId(); if (!id) return; if (!R.loading[id]) bReload.firstElementChild.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 520, easing: 'cubic-bezier(.34,1.3,.64,1)' }); B.tabAct(id, R.loading[id] ? 'stop' : 'reload'); });
bSplit.addEventListener('click', toggleSplit);
bShield.addEventListener('click', async () => {
  const r = bShield.getBoundingClientRect(), info = await B.setupAct({ type: 'blocking:info' });
  B.panel('shield', { x: Math.round(r.right - 306), y: Math.round(r.bottom + 2), w: 324, h: info.origin ? 318 : 258 }, { ...info, ...look() });
});
bDl.addEventListener('click', () => openSheet('downloads'));
bBoost.addEventListener('click', openBoost);
async function openBoost() {
  const id = focusedId(); if (!id || bBoost.disabled) return;
  const info = await B.setupAct({ type: 'boost:info' }); if (!info || !info.host) return;
  const r = bBoost.getBoundingClientRect();
  B.panel('boost', { x: Math.round(Math.max(8, r.right - 340)), y: Math.round(r.bottom + 2), w: 356, h: 414 }, { ...info, ...look() });
}
/* a download starting flies into the downloads stamp as a paper slip; finishing stamps a check on it */
let dlKnown = null;
function dlFly(d) {
  const r = bDl.getBoundingClientRect(), L = layout(), P = R.split && R.focus === 'b' && L.b ? L.b : L.a || L.stage;
  const ext = (String(d.name || '').match(/\.([a-z0-9]{1,4})$/i) || [, ''])[1].toUpperCase();
  B.fx({ type: 'dlfly', from: { x: P.x + P.w / 2, y: P.y + Math.min(P.h / 2, 260) }, to: { x: r.x + r.width / 2, y: r.y + r.height / 2 }, ext, ...look() });
  clearTimeout(bDl._land); bDl._land = setTimeout(() => { bDl.classList.remove('land'); void bDl.offsetWidth; bDl.classList.add('land'); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 760);
}
function dlSeenList(list) {
  const was = dlKnown; dlKnown = new Map(list.map(d => [d.id, d.state]));
  if (!was) return;
  for (const d of list) {
    if (!was.has(d.id) && d.state === 'progressing') dlFly(d);
    else if (d.state === 'completed' && was.get(d.id) && was.get(d.id) !== 'completed') { clearTimeout(bDl._done); bDl.classList.remove('done'); void bDl.offsetWidth; bDl.classList.add('done'); bDl._done = setTimeout(() => bDl.classList.remove('done'), 2600); }
  }
}
bDl.addEventListener('animationend', e => { if (e.animationName === 'dlland') bDl.classList.remove('land'); });
B.onDl(list => { R.downloads = list || []; dlSeenList(R.downloads); if (S) updateChrome(); });
urlEl.addEventListener('click', () => openCmd('this'));
for (const [el, w] of [[pa, 'a'], [pb, 'b']]) el.addEventListener('pointerdown', () => { if (R.split && R.focus !== w) { R.focus = w; commit(true); } });

/* ---------- waking tabs ahead of time, so switching to them doesn't wait on the network ---------- */
function warm(id) {
  if (!S.tabs[id] || R.live[id]) return;
  R.live[id] = true; B.tabEnsure(id, S.tabs[id].url, S.pins.includes(id) ? null : spaceInfo(spaceOf(id))); render();
}
function warmRecent() {                     // after launch, quietly wake the few tabs you used most recently
  const shown = new Set([R.a, R.b]);
  const list = [...S.pins, ...S.spaces.flatMap(spaceTabs)].filter(id => S.tabs[id] && !shown.has(id) && !R.live[id]).sort((x, y) => (S.tabs[y].seen || 0) - (S.tabs[x].seen || 0)).slice(0, 3);
  list.forEach((id, i) => setTimeout(() => warm(id), 1500 + i * 700));
}
/* ---------- tidy-up: sleeping tabs free memory, old tabs move to the archive (both optional, in Settings) ---------- */
function sleepTabs() {
  const mins = +S.prefs.sleep; if (!mins) return;
  const cutoff = Date.now() - mins * 60000, shown = new Set([R.a, R.split ? R.b : null]);
  let n = 0;
  for (const id in R.live) if (R.live[id] && !shown.has(id) && !R.audible[id] && S.tabs[id] && (S.tabs[id].seen || 0) < cutoff) { B.tabClose(id); R.live[id] = false; n++; }
  if (n) render();
}
/* ---------- Tidy up (like Dia): loose tabs from the same site go into a folder; ones you haven't opened in half a day
   go to the Archive. Clear closes the loose tabs (pins and folders stay). Both can be undone from the toast. ---------- */
/* the site a page belongs to (docs.google.com and drive.google.com are both google.com), and a nice name for it */
const SLD2 = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/;
function siteOf(u) { const h = hostOf(u); if (!h || /^[\d.]+$|:/.test(h) || !h.includes('.')) return h; const p = h.split('.'); return p.slice(SLD2.test(h) ? -3 : -2).join('.'); }
const NICE = { github: 'GitHub', gitlab: 'GitLab', youtube: 'YouTube', linkedin: 'LinkedIn', okta: 'Okta', atlassian: 'Atlassian', google: 'Google', microsoft: 'Microsoft', office: 'Office', apple: 'Apple', openai: 'OpenAI', chatgpt: 'ChatGPT', reddit: 'Reddit', figma: 'Figma', notion: 'Notion', slack: 'Slack', zoom: 'Zoom', amazon: 'Amazon', nytimes: 'NYTimes', icloud: 'iCloud' };
const siteName = h => { const k = h.split('.')[0]; return (NICE[k] || k.charAt(0).toUpperCase() + k.slice(1)).slice(0, 20); };
const looseTabs = s => !s ? [] : s.tabs.filter(k => !k.startsWith('f:') && S.tabs[k] && !pairOf(k));
let tidySnap = null;
function snapSpace(s) { const ids = new Set([...s.tabs, ...s.folders.flatMap(f => f.tabs)].filter(k => !k.startsWith('f:'))); return { sid: s.id, tabs: s.tabs.slice(), folders: JSON.parse(JSON.stringify(s.folders)), archive: S.archive.slice(), map: Object.fromEntries([...ids].filter(k => S.tabs[k]).map(k => [k, { ...S.tabs[k] }])) }; }
function restoreSnap(snap) {
  const s = S.spaces.find(x => x.id === snap.sid); if (!s) return;
  for (const [k, t] of Object.entries(snap.map)) if (!S.tabs[k]) { S.tabs[k] = t; R.live[k] = false; }
  s.tabs = snap.tabs.filter(k => k.startsWith('f:') ? snap.folders.some(f => 'f:' + f.id === k) : S.tabs[k]); s.folders = snap.folders; S.archive = snap.archive;
  render(); save(); B.fx({ type: 'toast', text: 'Put back the way it was', short: true });
}
function tidy(sid) {
  const s = S.spaces.find(x => x.id === (sid || S.cur)); if (!s) return;
  const snap = snapSpace(s), shown = new Set([R.a, R.b]), cutoff = Date.now() - 12 * 3600000;
  let archived = 0, grouped = 0; const made = [];
  for (const id of looseTabs(s)) {
    const t = S.tabs[id]; if (shown.has(id) || R.audible[id] || (t.seen || 0) > cutoff) continue;
    S.archive.unshift({ url: t.url, title: t.title, fav: t.fav || null, space: s.id, at: Date.now() });
    dropFromLists(id); delete S.tabs[id]; B.tabClose(id); delete R.live[id]; archived++;
  }
  const by = new Map(); for (const id of looseTabs(s)) { const h = siteOf(S.tabs[id].url); if (h) by.set(h, [...(by.get(h) || []), id]); }
  for (const [h, ids] of by) {
    if (ids.length < 3) continue;
    const fid = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const name = siteName(h);
    s.folders.push({ id: fid, name, open: false, tabs: ids.slice() });
    s.tabs = s.tabs.filter(k => !ids.includes(k)); s.tabs.splice(Math.min(...ids.map(k => snap.tabs.indexOf(k)).filter(i => i > -1), s.tabs.length), 0, 'f:' + fid);
    grouped += ids.length; made.push(name);
  }
  if (!archived && !grouped) { B.fx({ type: 'toast', text: 'Already tidy ✨', short: true }); return; }
  S.archive = S.archive.slice(0, 300); tidySnap = snap; render(); save();
  const bits = [grouped ? `grouped ${grouped} into ${made.length === 1 ? made[0] : made.length + ' folders'}` : '', archived ? `archived ${archived} you hadn't opened today` : ''].filter(Boolean).join(', ');
  B.fx({ type: 'toast', text: 'Tidied: ' + bits, action: { label: 'Undo', cmd: 'tidy:undo' } });
}
function clearTabs(sid) {
  const s = S.spaces.find(x => x.id === (sid || S.cur)); if (!s) return;
  const ids = looseTabs(s); if (!ids.length) return;
  const snap = snapSpace(s);
  for (const id of ids) { dropFromLists(id); delete S.tabs[id]; B.tabClose(id); delete R.live[id]; }
  tidySnap = snap; render(); save();
  if (s.id === S.cur && !focusedId()) showToday();
  B.fx({ type: 'toast', text: `Cleared ${ids.length} tab${ids.length > 1 ? 's' : ''}`, action: { label: 'Undo', cmd: 'tidy:undo' } });
}
function muteSite(h) {
  if (!h) return; const L = S.prefs.muteSites = (S.prefs.muteSites || []).slice(), i = L.indexOf(h), on = i < 0;
  if (on) L.push(h); else L.splice(i, 1);
  save(); syncMain();
  for (const [id, t] of Object.entries(S.tabs)) if (hostOf(t.url) === h && R.live[id] && !!R.muted[id] !== on) B.tabAct(id, 'mute');
  B.fx({ type: 'toast', text: on ? `${h} is muted in every tab` : `${h} can play sound again`, short: true });
}
function archiveTabs() {
  const hrs = +S.prefs.archive; if (!hrs) return;
  const cutoff = Date.now() - hrs * 3600000, shown = new Set([R.a, R.b]), out = [];
  for (const s of S.spaces) for (const id of s.tabs.filter(k => !k.startsWith('f:'))) {
    const t = S.tabs[id]; if (!t || shown.has(id) || (t.seen || 0) > cutoff || R.audible[id]) continue;
    const P = pairOf(id); if (P && P.some(x => shown.has(x) || (S.tabs[x] && (S.tabs[x].seen || 0) > cutoff))) continue;
    out.push([s, id]);
  }
  for (const [s, id] of out) {
    const t = S.tabs[id]; S.archive.unshift({ url: t.url, title: t.title, fav: t.fav || null, space: s.id, at: Date.now() });
    dissolve(id); dropFromLists(id); delete S.tabs[id]; B.tabClose(id); delete R.live[id];
  }
  if (out.length) { S.archive = S.archive.slice(0, 300); render(); save(); B.fx({ type: 'toast', text: `Archived ${out.length} tab${out.length > 1 ? 's' : ''} you hadn't opened in a while`, action: { label: 'Show', cmd: 'archive' } }); }
}
setInterval(() => { if (S) sleepTabs(); }, 60 * 1000);
setInterval(() => { if (S) archiveTabs(); }, 10 * 60 * 1000);

/* ---------- boot ---------- */
(async () => {
  let raw = {}; try { raw = (await B.stateLoad()) || {}; } catch {}
  try { R.info = (await B.setupInfo()) || {}; } catch { R.info = {}; }
  BL.loadIcons(B, BL.appsFor(R.info)).then(() => window.TODAY && TODAY.redraw());   // app icons from this Mac's cache (Today, new pins)
  window.WID = raw.wid || 'w1';
  const J = x => { try { return x ? JSON.parse(x) : null; } catch { return null; } };
  const sh = J(raw.shared), mine = J(raw.win) || {}, legacy = J(raw.legacy);
  let start;
  if (sh && Array.isArray(sh.spaces) && sh.spaces.length) {
    start = { tabs: mine.tabs || {}, pins: mine.pins || [], pairs: mine.pairs || [], ratios: mine.ratios || {}, cur: mine.cur || sh.spaces[0].id, dock: mine.dock, focusMode: !!mine.focus, prefs: sh.prefs, closed: sh.closed || [], archive: sh.archive || [], bookmarks: sh.bookmarks || [],
      spaces: sh.spaces.map(m => ({ ...m, ...((mine.spaces || {})[m.id] || { tabs: [], folders: [], act: null }) })) };
  } else start = legacy || fresh();                     // first launch, or an older profile (one window, everything in state.json)
  try { S = sanitize(start); } catch { S = fresh(); }
  S.bookmarks = Array.isArray(S.bookmarks) ? S.bookmarks : [];
  const H = J(raw.hist);
  S.history = Array.isArray(H) && H.length ? H : (legacy && Array.isArray(legacy.history) ? legacy.history : []);
  S.history = S.history.map(h => (h.fav && h.fav.length > 2500 ? { ...h, fav: null } : h));
  if (!(Array.isArray(H) && H.length) && S.history.length) B.histOp({ t: 'set', list: S.history });
  if (!sh) save();                                      // write the new split files right away
  theme(); syncMain();
  if (S.focusMode) { document.body.classList.add('focus'); B.focusSet({ on: true }); }
  await B.sbMode({ docked: docked(), w: sbW() });
  stage.classList.add('instant'); placePanes();
  const s = sp(), list = spaceTabs(s);
  const want = (s.act && list.includes(s.act) ? s.act : list[0]) || null;
  if (want) showTab(want);
  placePanes(); await commit(true); pushState();
  setTimeout(() => stage.classList.remove('instant'), 100);
  for (const [u, bg] of early.splice(0)) openTab(u, { bg });
  try { R.downloads = await B.dlList(); dlSeenList(R.downloads); updateChrome(); } catch {}
  setTimeout(archiveTabs, 15000);
  warmRecent();
  setTimeout(() => refreshLive(false), 4000);
  if (!S.prefs.done) setTimeout(() => openSetup('onboard'), 450);
  else if (S.prefs.startup === 'home' && S.prefs.home) openTab(toURL(S.prefs.home));
  whatsNew();
})();
