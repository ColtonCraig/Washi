'use strict';
const B = window.washi;
const { esc, hostOf, hueOf, palOf, ic, zoneAt, KEYS, PAL, palFor, applyTheme, prefsOf, searchTpl, suggestTpl, bang, fmtKey } = window.BL;
BL.setup();
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RMQ = matchMedia('(prefers-reduced-motion: reduce)').matches, calm = () => RMQ || BL.motion.off;
const uid = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const TOP = 52, M = 12, SB_W = 248, GAP = 12;

/* ---------- state ---------- */
let S;                                    // persisted
const R = { a: null, b: null, focus: 'a', split: false, loading: {}, audible: {}, muted: {}, blocked: {}, boosted: {}, notice: {}, canBack: {}, canFwd: {}, live: {}, menuTab: null, menuSpace: null, promptCb: null, keys: {}, downloads: [] };
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
  if (!s.spaces.some(x => x.id === s.cur)) s.cur = s.spaces[0].id;
  return s;
}
let saveT;
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = 0; doSave(); }, 900); };
/* History lives in its own file and is only written when it changes, so a long history never slows down ordinary clicks. */
let HV = 1, HVsaved = 0;
const histChanged = () => { HV++; save(); };
const smallFav = f => (f && f.length > 2500 ? null : f || null);
const doSave = () => {
  if (HV !== HVsaved) { HVsaved = HV; B.histSave(JSON.stringify(S.history.slice(0, 3000))); }
  B.stateSave(JSON.stringify({ tabs: S.tabs, pins: S.pins, spaces: S.spaces, pairs: S.pairs, prefs: S.prefs, cur: S.cur, closed: S.closed.slice(0, 25), archive: S.archive.slice(0, 300), dock: S.dock }));
};
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
const label = t => t.title || hostOf(t.url) || 'New tab';

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
const stage = $('#stage'), pa = $('#pa'), pb = $('#pb');
const urlEl = $('#url'), urlTxt = $('#urlTxt'), bBack = $('#bBack'), bFwd = $('#bFwd'), bReload = $('#bReload'), bSplit = $('#bSplit'), bSide = $('#bSide'), bShield = $('#bShield'), bDl = $('#bDl'), bBoost = $('#bBoost');

/* Layout is plain math, shared by the card frames here and the page views in the main process. */
function layout() {
  const W = innerWidth, H = innerHeight;
  const x = S.dock ? SB_W + 10 : M + 4, y = TOP, w = W - x - M - 4, h = H - y - M - 2;
  const L = { stage: { x, y, w, h }, split: R.split };
  if (R.split) { const pw = (w - GAP - 4) / 2; L.a = { x, y, w: pw, h }; L.b = { x: x + pw + GAP + 4, y, w: pw, h }; }
  else { L.a = { x, y, w, h }; L.b = { x: x + w, y, w: 0, h }; }
  return L;
}
const toR = r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) });
function placePanes() {
  const L = layout();
  for (const [el, r] of [[pa, L.a], [pb, L.b]]) { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; }
  pb.classList.toggle('off', !R.split);
  stage.classList.toggle('split', R.split);
  B.layoutInfo(L);
  return L;
}

/* ---------- state for the sidebar view ---------- */
let pushQ = false;
function pushState() {
  if (pushQ || !S) return; pushQ = true;
  requestAnimationFrame(() => {
    pushQ = false;
    const s = sp(), ids = new Set([...S.pins, ...spaceTabs(s)]), tabs = {};
    for (const id of ids) { const t = S.tabs[id]; if (t) tabs[id] = { title: label(t), url: t.url, fav: t.fav || null, loading: !!R.loading[id], audible: !!R.audible[id], muted: !!R.muted[id], live: !!R.live[id], unread: !!t.unread, notice: R.notice[id] || null }; }
    B.sbState({ h: s.h, pal: palFor(s), theme: S.prefs, cur: S.cur, name: s.name, spaces: S.spaces.map(x => ({ id: x.id, name: x.name, h: x.h, pal: palFor(x) })), pins: S.pins, order: s.tabs, pairs: S.pairs.filter(p => spaceOf(p[0]) === s), folders: s.folders, tabs, a: R.a, b: R.split ? R.b : null, focus: R.focus, split: R.split, docked: S.dock });
  });
}
function updateChrome() {
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
  bBoost.disabled = !web; bBoost.classList.toggle('on', web && !!R.boosted[id]); bBoost.title = R.boosted[id] ? 'This site is boosted' : 'Boost this site: colors, font, hide things';
  const blocked = id ? R.blocked[id] || 0 : 0;
  bShield.querySelector('b').textContent = blocked > 99 ? '99+' : blocked || '';
  bShield.classList.toggle('off', S.prefs.blocking === 'off'); bShield.classList.toggle('n', blocked > 0);
  bShield.title = S.prefs.blocking === 'off' ? 'Blocking is off' : `${blocked} ads and trackers blocked on this page`;
  const act = R.downloads.filter(d => d.state === 'progressing' || d.state === 'paused'), recent = R.downloads.some(d => Date.now() - d.at < 6 * 3600 * 1000);
  bDl.hidden = !act.length && !recent;
  const tot = act.reduce((a, d) => a + (d.total || 0), 0), got = act.reduce((a, d) => a + (d.received || 0), 0);
  bDl.style.setProperty('--p', act.length && tot ? (got / tot).toFixed(3) : act.length ? .15 : 0); bDl.classList.toggle('busy', !!act.length);
  bBack.disabled = !id || !R.canBack[id]; bFwd.disabled = !id || !R.canFwd[id]; bReload.disabled = !id;
  const ld = !!(id && R.loading[id]);
  urlEl.classList.toggle('loading', ld);
  bReload.innerHTML = ic(ld ? 'close' : 'reload'); bReload.title = ld ? 'Stop loading' : 'Reload (⌘R)';
  bSplit.classList.toggle('on', R.split); bSide.classList.toggle('on', S.dock); $('#edge').hidden = S.dock;
  pa.classList.toggle('has', !!R.a); pb.classList.toggle('has', !!(R.split && R.b));
  pa.classList.toggle('focus', R.focus === 'a'); pb.classList.toggle('focus', R.focus === 'b');
  $('#emptyTitle').textContent = `Nothing taped up in ${sp().name}`;
  document.title = t ? label(t) + ' · Washi' : 'Washi';
}
const render = () => { updateChrome(); pushState(); };
const theme = () => applyTheme(S.prefs, palFor(sp()));
const look = () => ({ pal: palFor(sp()), theme: S.prefs });
const syncMain = () => { const p = S.prefs; B.prefsSync({ mode: p.mode, search: searchTpl(p), gpc: !!p.gpc, askDownload: !!p.askDownload, httpsFirst: !!p.httpsFirst, safety: !!p.safety, blocking: p.blocking, dns: p.dns, clearOnExit: !!p.clearOnExit, autoPip: !!p.autoPip, suggest: !!p.suggest, scrapLinks: !!p.scrapLinks, keys: p.keys || {} }); refreshKeys(); };
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
function showTab(id) {
  const P = pairOf(id), s = spaceOf(id);
  if (P) { R.split = true; R.a = P[0]; R.b = P[1]; R.focus = id === P[1] ? 'b' : 'a'; }
  else if (R.split && (id === R.a || id === R.b)) R.focus = id === R.b ? 'b' : 'a';
  else { R.split = false; R.b = null; R.a = id; R.focus = 'a'; }
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
  if (into) { into.tabs.unshift(id); into.open = true; } else s.tabs.unshift(id);
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
  if (o.noFx || !S.dock) return finish();
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
  S.dock = !S.dock; B.sbMode({ docked: S.dock });
  placePanes(); commit(false, true, true); save();
}

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
  B.popupMenu([...liveItems, { label: 'New Tab in Folder', id: 'fm:new' }, { label: 'New Folder Inside…', id: 'fm:sub', enabled: inner }, { label: f.open ? 'Collapse' : 'Expand', id: 'fm:toggle' }, { label: 'Rename…', id: 'fm:rename' },
    ...(nested ? [{ label: 'Move Out of Folder', id: 'fm:out' }] : []), { type: 'separator' }, { label: 'Ungroup (keep tabs)', id: 'fm:ungroup' }, { label: 'Delete Folder and Close Tabs', id: 'fm:delete' }]);
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
    A('find', 'Find on this page'), A('copyurl', 'Copy page address'), A('history', 'Show history'), A('archive', 'Show archived tabs'), A('downloads', 'Show downloads'),
    A('newspace', 'New space'), A('rename', 'Rename this space'), A('delspace', 'Delete this space'), A('newfolder', 'New folder'),
    A('mute', 'Mute or unmute this tab'), A('pip', 'Picture in picture'), A('print', 'Print this page'), A('devtools', 'Open developer tools'),
    A('livegh', 'New live folder: GitHub pull requests', 'none'), A('livefeed', 'New live folder: RSS or Atom feed', 'none'), A('boost', 'Boost this site (colors, font, hide things)', 'none'), A('scrap', 'New little scrap'), A('arc', 'Import from Arc', 'none'), A('settings', 'Settings'), A('keys', 'Change keyboard shortcuts', 'none'), A('guide', 'Show the quick-start guide', 'none'), A('setupagain', 'Run the welcome setup again', 'none')
  ];
  B.overlayOpen({ mode: mode === 'this' && !cur ? 'new' : mode, ...look(), value: mode === 'this' && cur ? cur.url : '', tabs, actions,
    history: S.history.slice(0, 400).map(h => ({ url: h.url, title: h.title })), archive: S.archive.slice(0, 100).map(a => ({ url: a.url, title: a.title })), suggest: suggestTpl(S.prefs) });
}
function runAction(id) {
  const f = focusedId();
  ({
    split: toggleSplit, sidebar: toggleSide, pin: () => pinToggle(f), reopen: reopenClosed, newspace: addSpace, newfolder: () => newFolder(null),
    rename: () => promptFor('Rename this space', sp().name, n => { sp().name = n.slice(0, 12); render(); save(); }),
    delspace: () => deleteSpace(S.cur), copyurl, devtools: () => f && B.tabAct(f, 'devtools'), settings: () => openSetup('settings'), guide: () => openSetup('guide'), setupagain: () => openSetup('onboard'),
    keys: () => openSetup('settings', 'keys'), boost: openBoost, livegh: () => newLiveFolder('github'), livefeed: () => newLiveFolder('feed'), scrap: () => B.scrapOpen(''), arc: () => openSetup('settings', 'import'), find: openFind, history: () => openSheet('history'), archive: () => openSheet('archive'), downloads: () => openSheet('downloads'),
    mute: () => f && B.tabAct(f, 'mute'), pip: () => f && B.tabAct(f, 'pip'), print: () => f && B.tabAct(f, 'print')
  })[id]?.();
}
function copyurl() { const f = focusedId(); if (!f) return; B.copy(S.tabs[f].url); B.fx({ type: 'toast', text: 'Copied the page address', short: true }); }
function openFind() { if (!focusedId()) return; B.panel('find', null, {}); }
/* history, archived tabs and downloads: paper sheets in the overlay */
async function openSheet(kind, extra) {
  const items = kind === 'history' ? S.history.slice(0, 3000) : kind === 'archive' ? S.archive : await B.dlList();
  B.overlayOpen({ mode: 'sheet', kind, items, ...look(), ...(extra || {}) });
}
/* ---------- welcome setup, settings and the quick-start guide (drawn in the overlay) ---------- */
async function openSetup(page, section) {
  let info = {}; try { info = await B.setupInfo(); } catch {}
  B.overlayOpen({ mode: 'setup', page, section, keys: R.keys, prefs: S.prefs, spaces: S.spaces.map(x => ({ id: x.id, name: x.name, h: x.h, custom: x.custom || null, isolated: !!x.isolated })), cur: S.cur, dock: S.dock, info, ...look(), tabs: [], actions: [], history: [] });
}
B.onSetupMsg(m => {
  if (!S) return;
  if (m.type === 'prefs') {
    for (const k in m.patch) { if (k === 'light' || k === 'dark') S.prefs[k] = { ...S.prefs[k], ...m.patch[k] }; else S.prefs[k] = m.patch[k]; }
    theme(); syncMain(); render(); save();
  } else if (m.type === 'space') {
    const x = S.spaces.find(z => z.id === m.id); if (!x) return;
    if (m.h !== undefined && PAL[m.h]) { x.h = m.h; x.custom = null; }
    if (m.custom) { x.custom = { ...(x.custom || {}), ...m.custom }; for (const k in x.custom) if (!x.custom[k]) delete x.custom[k]; if (!Object.keys(x.custom).length) x.custom = null; }
    if (x.id === S.cur) theme(); render(); save();
  } else if (m.type === 'dock') { if (S.dock !== !!m.dock) toggleSide(); }
  else if (m.type === 'cleared') { S.history = []; S.closed = []; histChanged(); }
  else if (m.type === 'isolate') {
    const x = S.spaces.find(z => z.id === m.id); if (!x || !!x.isolated === !!m.on) return;
    x.isolated = !!m.on; for (const t of spaceTabs(x)) { B.tabClose(t); R.live[t] = false; }      // pages reopen with the space's own logins
    if (x.id === S.cur) commit(true); render(); save();
  } else if (m.type === 'sheet') sheetAct(m);
  else if (m.type === 'arcImport') importArc(m).then(r => B.setupReply({ type: 'arcDone', ...r }));
  else if (m.type === 'peekAdopt') adoptPeek();
});
function sheetAct(m) {
  if (m.act === 'open' && m.url) openTab(m.url);
  else if (m.act === 'forget' && m.url) { S.history = S.history.filter(h => h.url !== m.url); histChanged(); }
  else if (m.act === 'forgetAll') { S.history = []; histChanged(); }
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
  if (r.kind === 'cmd') { if (r.cmd === 'settings:privacy') openSetup('settings', 'privacy'); return; }
  if (r.kind === 'setup') {
    const first = !S.prefs.done; S.prefs.done = true; save();
    if (first && !spaceTabs(sp()).length && !S.pins.length) setTimeout(() => openCmd('new'), 350);     // first run: go straight to typing an address
    return;
  }
  if (r.kind === 'url') { const u = toURL(r.value); if (r.mode === 'this' && focusedId()) navigate(u); else openTab(u); }
  else if (r.kind === 'tab') selectTab(r.id);
  else if (r.kind === 'action') runAction(r.id);
  else if (r.kind === 'prompt') { const cb = R.promptCb; R.promptCb = null; cb && cb(r.value); }
});
B.onOverlayCancel(() => { R.promptCb = null; R.intoFolder = null; });

/* ---------- native menus, requested from the sidebar ---------- */
function tabMenu(id) {
  const pinned = S.pins.includes(id), s = spaceOf(id) || sp(), items = [{ label: pinned ? 'Unpin' : 'Pin', id: 'pin' }, { label: 'Duplicate', id: 'dup' }, { label: 'Copy Address', id: 'copy' }, { type: 'separator' }];
  if (!pinned) {
    const others = S.spaces.filter(x => x.id !== s.id);
    if (others.length) items.push({ label: 'Move to Space', submenu: others.map(x => ({ label: x.name, id: 'mv:' + x.id })) });
    items.push({ label: 'Move to Folder', submenu: [...s.folders.map(f => ({ label: folderPath(s, f), id: 'fo:' + f.id })).sort((a, b) => a.label.localeCompare(b.label)), { label: 'New Folder…', id: 'fo:new' }] });
    if (s.folders.some(f => f.tabs.includes(id))) items.push({ label: 'Remove from Folder', id: 'fo:none' });
  }
  if (pairOf(id)) items.push({ type: 'separator' }, { label: 'Separate Split', id: 'sep' });
  items.push({ type: 'separator' }, { label: pinned ? 'Unload' : 'Close', id: 'close' });
  R.menuTab = id; B.popupMenu(items);
}
function spaceMenu(id) {
  R.menuSpace = id;
  B.popupMenu([{ label: 'Rename…', id: 'sp:rename' }, { label: 'Color', submenu: KEYS.map(k => ({ label: PAL[k].n, id: 'sp:color:' + k })) }, { type: 'separator' }, { label: 'Delete Space', id: 'sp:del', enabled: S.spaces.length > 1 }]);
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
    else if (k === 'ungroup') removeFolder(fid, false); else if (k === 'delete') removeFolder(fid, true);
    else if (k === 'sub') newFolder(null, fid); else if (k === 'out') folderOut(fid);
    else if (k === 'refresh') refreshLive(true, fid);
    else if (k === 'read') { for (const id of flat(sp(), f.tabs)) if (S.tabs[id]) S.tabs[id].unread = false; render(); save(); }
    else if (k === 'unlive') { delete f.live; for (const id of flat(sp(), f.tabs)) if (S.tabs[id]) { delete S.tabs[id].live; delete S.tabs[id].unread; } render(); save(); } }
  else if (id === 'nf:plain') newFolder(null); else if (id === 'nf:github') newLiveFolder('github'); else if (id === 'nf:feed') newLiveFolder('feed');
  else if (id === 'dup') openTab(S.tabs[t].url);
  else if (id === 'copy') B.copy(S.tabs[t].url);
  else if (id === 'close') closeTab(t, { noFx: true });
  else if (id.startsWith('mv:')) moveToSpace(t, id.slice(3));
  else if (id === 'fo:new') newFolder(t);
  else if (id === 'fo:none') moveToFolder(t, null);
  else if (id.startsWith('fo:')) moveToFolder(t, id.slice(3));
  else if (id === 'sp:rename') promptFor('Rename this space', S.spaces.find(x => x.id === s).name, n => { S.spaces.find(x => x.id === s).name = n.slice(0, 12); render(); save(); });
  else if (id === 'sp:del') deleteSpace(s);
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
  }
});
B.onSbReady(() => { if (!S) return; B.sbMode({ docked: S.dock }); pushState(); });   // before boot finishes, boot pushes the first state itself
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
  if (['find', 'copyurl', 'history', 'archive', 'downloads', 'newfolder'].includes(n)) return runAction(n); if (n === 'setupagain') return openSetup('onboard');
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
    t.url = p.url;
    if (/^https?:/.test(p.url) && !p.notice && (!S.history[0] || S.history[0].url !== p.url)) {          // every page you land on is history, including the first one in a tab
      S.history = S.history.filter(h => h.url !== p.url); S.history.unshift({ url: p.url, title: t.title, fav: smallFav(t.fav), t: Date.now() }); if (S.history.length > 3000) S.history.length = 3000; HV++;
    }
  }
  if (p.title !== undefined) { t.title = p.title; const h = S.history.find(x => x.url === t.url); if (h && h.title !== p.title) { h.title = p.title; HV++; } }
  if (p.fav !== undefined) { t.fav = p.fav; const h = S.history.find(x => x.url === t.url), f = smallFav(p.fav); if (h && h.fav !== f) { h.fav = f; HV++; } }
  if (p.notice !== undefined) R.notice[id] = p.notice;
  for (const k of ['loading', 'audible', 'muted', 'blocked', 'boosted', 'canBack', 'canFwd']) if (p[k] !== undefined) R[k][id] = p[k];
  render(); save();
});

/* ---------- top bar ---------- */
bSide.addEventListener('click', toggleSide);
bBack.addEventListener('click', () => { const id = focusedId(); id && B.tabAct(id, 'back'); });
bFwd.addEventListener('click', () => { const id = focusedId(); id && B.tabAct(id, 'forward'); });
bReload.addEventListener('click', () => { const id = focusedId(); if (!id) return; if (!R.loading[id]) bReload.firstElementChild.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 520, easing: 'cubic-bezier(.34,1.3,.64,1)' }); B.tabAct(id, R.loading[id] ? 'stop' : 'reload'); });
bSplit.addEventListener('click', toggleSplit);
bShield.addEventListener('click', async () => {
  const r = bShield.getBoundingClientRect(), info = await B.setupAct({ type: 'blocking:info' });
  B.panel('shield', { x: Math.round(r.right - 306), y: Math.round(r.bottom + 2), w: 324, h: 258 }, { ...info, ...look() });
});
bDl.addEventListener('click', () => openSheet('downloads'));
bBoost.addEventListener('click', openBoost);
async function openBoost() {
  const id = focusedId(); if (!id || bBoost.disabled) return;
  const info = await B.setupAct({ type: 'boost:info' }); if (!info || !info.host) return;
  const r = bBoost.getBoundingClientRect();
  B.panel('boost', { x: Math.round(Math.max(8, r.right - 340)), y: Math.round(r.bottom + 2), w: 356, h: 414 }, { ...info, ...look() });
}
B.onDl(list => { R.downloads = list || []; if (S) updateChrome(); });
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
  let raw = null; try { raw = await B.stateLoad(); } catch {}
  let hist = null;
  const [rs, rh] = Array.isArray(raw) ? raw : [raw, null];
  try { S = sanitize(rs ? JSON.parse(rs) : fresh()); } catch { S = fresh(); }
  try { const h = rh ? JSON.parse(rh) : null; if (Array.isArray(h)) hist = h; } catch {}
  if (hist) S.history = hist; else HV++;                 // older profiles kept history inside state.json: move it out on the next save
  S.history = (S.history || []).map(h => (h.fav && h.fav.length > 2500 ? { ...h, fav: null } : h));
  theme(); syncMain();
  await B.sbMode({ docked: S.dock });
  stage.classList.add('instant'); placePanes();
  const s = sp(), list = spaceTabs(s);
  const want = (s.act && list.includes(s.act) ? s.act : list[0]) || null;
  if (want) showTab(want);
  placePanes(); await commit(true); pushState();
  setTimeout(() => stage.classList.remove('instant'), 100);
  for (const [u, bg] of early.splice(0)) openTab(u, { bg });
  try { R.downloads = await B.dlList(); updateChrome(); } catch {}
  setTimeout(archiveTabs, 15000);
  warmRecent();
  setTimeout(() => refreshLive(false), 4000);
  if (!S.prefs.done) setTimeout(() => openSetup('onboard'), 450);
  else if (S.prefs.startup === 'home' && S.prefs.home) openTab(toURL(S.prefs.home));
})();
