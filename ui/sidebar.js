'use strict';
const B = window.washi;
const { esc, ic, favHTML, rot, PAL, palOf, applyTheme } = window.BL;
BL.setup();
const $ = (s, r = document) => r.querySelector(s);
const body = document.body, sheet = $('#sheet'), tabsEl = $('#tabs'), pinsEl = $('#pins'), spacesEl = $('#spaces'), sname = $('#sname');
const SB_W = 232, TOP = 44;
let ST = null, pending = null, dragging = false, hold = false, justDragged = false, swapping = true, slapId = null;
setTimeout(() => { swapping = false; }, 900);
let peekT;

/* ---------- keyed list sync, so hover and animations survive updates ---------- */
function syncList(parent, keys, make, up) {
  const have = new Map([...parent.children].map(c => [c.dataset.key, c]));
  for (const [k, c] of have) if (!keys.includes(k)) { c.remove(); have.delete(k); }
  let ref = parent.firstElementChild;
  keys.forEach((k, i) => {
    let c = have.get(k);
    if (!c) { c = make(k); c.dataset.key = k; c.style.setProperty('--i', i); if (slapId === k) { c.classList.add('slap'); slapId = null; requestAnimationFrame(() => c.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); } else if (swapping) c.classList.add('rise'); setTimeout(() => c.classList.remove('rise', 'slap'), 900); }
    up(c, k);
    if (c !== ref) parent.insertBefore(c, ref); else ref = ref.nextElementSibling;
  });
}
const setFav = (e, t) => {
  const key = (t.fav || '') + '|' + t.title + '|' + t.url;
  if (e._fk === key) return; e._fk = key;
  const f = e.querySelector('.fav'); if (f) f.outerHTML = favHTML(t);
};

/* ---------- elements ---------- */
let PLAN = { root: [], folders: {} };
const shownSet = () => ST ? new Set(ST.split ? [ST.a, ST.b] : [ST.a]) : new Set();
const isShown = k => { const sh = shownSet(); if (k.startsWith('f:')) return (PLAN.folders[k.slice(2)] || []).some(isShown); return k.startsWith('p:') ? k.slice(2).split('|').some(id => sh.has(id)) : sh.has(k); };
function mkTab(id) {
  const e = document.createElement('div');
  e.className = 'tab'; e.dataset.id = id; e.tabIndex = 0; e.setAttribute('role', 'tab');
  e.style.setProperty('--rot', rot(id).toFixed(2));
  e.innerHTML = `<span class="fav"></span><span class="ttl"></span><button class="snd" data-mute="${id}" aria-label="Mute tab">${ic('sound', 14)}</button><button class="x" data-x="${id}" aria-label="Close tab">${ic('close', 14)}</button>`;
  return e;
}
function upTab(e, id) {
  const t = ST.tabs[id]; if (!t) return;
  const on = focused(), also = other();
  e.querySelector('.ttl').textContent = t.title; setFav(e, t);
  e.classList.toggle('on', id === on); e.classList.toggle('also', id === also);
  e.classList.toggle('vis', shownSet().has(id));
  e.classList.toggle('audible', t.audible); e.classList.toggle('muted', !!t.muted); e.classList.toggle('loading', t.loading);
  e.classList.toggle('asleep', !t.live && id !== on && id !== also); e.classList.toggle('warn', t.notice === 'danger'); e.classList.toggle('unread', !!t.unread);
  const snd = e.querySelector('.snd'); if (snd && snd._m !== !!t.muted) { snd._m = !!t.muted; snd.innerHTML = ic(t.muted ? 'mute' : 'sound', 14); snd.setAttribute('aria-label', t.muted ? 'Unmute tab' : 'Mute tab'); }
}
/* two tabs that are split together live on one card */
function mkPair(k) {
  const e = document.createElement('div'); e.className = 'pair'; e.setAttribute('role', 'group');
  e.style.setProperty('--rot', rot(k).toFixed(2));
  for (const id of k.slice(2).split('|')) e.append(mkTab(id));
  if (!swapping) { e.classList.add('join'); setTimeout(() => e.classList.remove('join'), 800); }
  return e;
}
function upPair(e, k) {
  const ids = k.slice(2).split('|');
  [...e.querySelectorAll(':scope>.tab')].forEach((row, i) => upTab(row, ids[i]));
  e.classList.toggle('live', !!ST.split && ids.includes(ST.a));
  e.classList.toggle('vis', isShown(k));
}
function mkPin(id) { const e = document.createElement('button'); e.className = 'pin'; e.dataset.id = id; e.style.setProperty('--rot', rot(id).toFixed(2)); e.innerHTML = '<span class="fav"></span>'; return e; }
function upPin(e, id) {
  const t = ST.tabs[id]; if (!t) return; e.title = t.title; setFav(e, t);
  e.classList.toggle('on', id === focused()); e.classList.toggle('also', id === other()); e.classList.toggle('cold', !t.live);
}
function mkFold(k) {
  const e = document.createElement('div'); e.className = 'fold'; e.dataset.fid = k.slice(2);
  e.innerHTML = `<div class="fh" tabindex="0" role="button">${ic('chev', 14, 'chev')}<span class="fi">${ic('folder', 16)}</span><span class="fn"></span><span class="ct"></span><button class="fplus" title="New tab in folder" aria-label="New tab in folder">${ic('plus', 14)}</button></div><div class="fb"><div class="fl"></div></div>`;
  return e;
}
const countIn = fid => (PLAN.folders[fid] || []).reduce((n, k) => n + (k.startsWith('f:') ? countIn(k.slice(2)) : k.startsWith('p:') ? 2 : 1), 0);
function upFold(e, k) {
  const f = ST.folders.find(x => 'f:' + x.id === k); if (!f) return;
  const keys = PLAN.folders[f.id] || [];
  e.classList.toggle('open', !!f.open);
  const has = keys.some(isShown); e.classList.toggle('vis', has);
  e.classList.toggle('peek', !f.open && has);                            // collapsed, but the tab you're on stays in view
  e.querySelector('.fn').textContent = f.name;
  const unread = f.live ? (PLAN.folders[f.id] || []).filter(k => ST.tabs[k] && ST.tabs[k].unread).length : 0, ct = e.querySelector(':scope>.fh .ct');
  ct.textContent = unread ? unread + ' new' : countIn(f.id); ct.classList.toggle('new', !!unread);
  const fi = e.querySelector(':scope>.fh .fi'), kind = f.live ? (f.live.error ? 'warn' : 'live') : 'folder';
  if (fi.dataset.k !== kind) { fi.dataset.k = kind; fi.innerHTML = ic(kind, 16); }
  e.classList.toggle('live', !!f.live); e.classList.toggle('err', !!(f.live && f.live.error));
  e.querySelector(':scope>.fh').title = f.live ? (f.live.error ? `Couldn't update: ${f.live.error}` : `Live: ${f.live.kind === 'github' ? 'pull requests in ' + f.live.src : f.live.src}`) : '';
  syncList(e.querySelector(':scope>.fb>.fl'), keys, mkItem, upItem);
}
const mkItem = k => k.startsWith('f:') ? mkFold(k) : k.startsWith('p:') ? mkPair(k) : mkTab(k);
const upItem = (e, k) => k.startsWith('f:') ? upFold(e, k) : k.startsWith('p:') ? upPair(e, k) : upTab(e, k);
const focused = () => ST && (ST.focus === 'b' && ST.split && ST.b ? ST.b : ST.a);
const other = () => ST && ST.split ? (focused() === ST.b ? ST.a : ST.b) : null;

/* root order and each folder's tabs, with split pairs collapsed into one card where their first half sits */
function plan(s) {
  const pk = new Map(); for (const p of s.pairs || []) { const k = 'p:' + p[0] + '|' + p[1]; pk.set(p[0], k); pk.set(p[1], k); }
  const done = new Set();
  const P = { root: [], folders: {} }, seenF = new Set();
  const conv = ids => { const out = []; for (const id of ids) {
    if (id.startsWith('f:')) { const f = s.folders.find(x => 'f:' + x.id === id); if (!f || seenF.has(id)) continue; seenF.add(id); out.push(id); P.folders[f.id] = conv(f.tabs); continue; }
    if (!ST.tabs[id]) continue; const k = pk.get(id); if (k) { if (!done.has(k)) { done.add(k); out.push(k); } } else out.push(id); } return out; };
  P.root = conv(s.order);
  return P;
}

function apply(s) {
  ST = s; applyTheme(s.theme, s.pal); PLAN = plan(s);
  if (sname.textContent !== s.name) sname.textContent = s.name;
  syncList(pinsEl, s.pins, mkPin, upPin);
  syncList(tabsEl, PLAN.root, mkItem, upItem);
  syncList(spacesEl, [...s.spaces.map(x => x.id), '+'], k => {
    const e = document.createElement('button'); e.className = 'sp' + (k === '+' ? ' add' : ''); if (k === '+') { e.id = 'addSp'; e.title = 'New space (⇧⌘N)'; e.innerHTML = ic('plus', 16); } else e.innerHTML = '<span class="nm"></span>'; return e;
  }, (e, k) => {
    if (k === '+') return;
    const x = s.spaces.find(z => z.id === k); e.dataset.id = k; e.style.setProperty('--c', (x.pal || palOf(x.h)).tape); e.setAttribute('aria-label', x.name + ' space');
    e.querySelector('.nm').textContent = x.name; e.classList.toggle('on', k === s.cur);
  });
}
B.onSbState(s => { if (dragging || hold) pending = s; else apply(s); });
B.onSbMode(m => {
  const modeChange = body.classList.contains('docked') !== !!m.docked;
  body.classList.toggle('docked', !!m.docked); body.classList.toggle('float', !m.docked);
  if (modeChange) { body.classList.add('still'); requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('still'))); }
  body.classList.toggle('open', !!m.open);           // the sheet is already painted off to the side, so this starts sliding on the next frame
});
/* floating: tell the main process when the pointer arrives at the strip or leaves the sheet (no polling) */
let inside = false;
const hover = v => { if (v !== inside || v) { inside = v; if (body.classList.contains('float')) B.sbHover(v); } };
document.documentElement.addEventListener('pointerenter', () => hover(true));
addEventListener('pointermove', () => { if (!inside) hover(true); }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { if (!dragging) hover(false); });
addEventListener('blur', () => { inside = false; });
B.onSbFx(f => {
  if (f.type === 'new') slapId = f.id;
  else if (f.type === 'swap') { swapping = true; document.body.style.setProperty('--dx', (f.dir || 0) * 18 + 'px'); document.body.style.setProperty('--dy', f.dir ? '0px' : '6px'); setTimeout(() => { swapping = false; document.body.style.removeProperty('--dx'); document.body.style.removeProperty('--dy'); }, 600); }
  else if (f.type === 'close') { const el = tabsEl.querySelector(`.tab[data-id="${f.id}"]`); if (el) crumple(el); }
});

function crumple(el) { el.classList.add("crumple"); }

/* ---------- instant feedback: the clicked tab lights up right away, the real state follows a moment later ---------- */
function highlight(id) {
  if (!ST || ST.split || focused() === id) return;
  sheet.querySelectorAll('.tab.on,.pin.on').forEach(x => x.classList.remove('on'));
  sheet.querySelectorAll(`.tab[data-id="${id}"],.pin[data-id="${id}"]`).forEach(x => x.classList.add('on'));
}
let warmT = 0;                                       // resting on a sleeping tab starts waking it, so the click feels instant
sheet.addEventListener('pointerover', e => {
  const t = e.target.closest('.tab,.pin'); clearTimeout(warmT); if (!t || !ST) return;
  const tab = ST.tabs[t.dataset.id]; if (!tab || tab.live) return;
  warmT = setTimeout(() => B.intent({ type: 'warm', id: t.dataset.id }), 120);
});
/* ---------- clicks + menus ---------- */
sheet.addEventListener('click', e => {
  if (justDragged) return;
  const mu = e.target.closest('[data-mute]'); if (mu) { e.stopPropagation(); return B.intent({ type: 'mute', id: mu.dataset.mute }); }
  const x = e.target.closest('[data-x]');
  if (x) { e.stopPropagation(); const el = x.closest('.tab'); crumple(el); setTimeout(() => B.intent({ type: 'close', id: x.dataset.x }), 240); return; }
  if (e.target.closest('#nt')) return B.intent({ type: 'newtab' });
  const fp = e.target.closest('.fplus'); if (fp) return B.intent({ type: 'folderNew', id: fp.closest('.fold').dataset.fid });
  if (e.target.closest('#nf')) return B.intent({ type: 'nfMenu' });
  const fh = e.target.closest('.fh'); if (fh) return B.intent({ type: 'folder', id: fh.parentElement.dataset.fid });
  const t = e.target.closest('.tab,.pin'); if (t) { highlight(t.dataset.id); return B.intent({ type: 'select', id: t.dataset.id }); }
  const s = e.target.closest('.sp');
  if (s) { if (s.id === 'addSp') B.intent({ type: 'addspace' }); else B.intent({ type: 'space', id: s.dataset.id }); }
});
sheet.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tab')) { e.preventDefault(); B.intent({ type: 'select', id: e.target.dataset.id }); } });
sheet.addEventListener('contextmenu', e => {
  e.preventDefault();
  const t = e.target.closest('.tab,.pin'); if (t) return B.intent({ type: 'ctxTab', id: t.dataset.id });
  const fh = e.target.closest('.fh'); if (fh) return B.intent({ type: 'ctxFolder', id: fh.parentElement.dataset.fid });
  const s = e.target.closest('.sp[data-id]'); if (s) B.intent({ type: 'ctxSpace', id: s.dataset.id });
});

/* ---------- drag: move tabs, split cards and folders around (into and out of folders), or carry a tab out to the page area to split ---------- */
let drag = null;
const keysOf = c => [...c.children].map(x => x.dataset.key).filter(Boolean);
const flipItems = el => [...sheet.querySelectorAll('.tabs .tab,.tabs .pair,.tabs .fold')].filter(c => c !== el && !el.contains(c) && !(c.classList.contains('tab') && c.closest('.pair')));
sheet.addEventListener('pointerdown', e => {
  if (e.button || e.target.closest('.x,.fplus,.snd')) return;
  const fh = e.target.closest('.fh'), el = e.target.closest('.pair') || e.target.closest('.tab,.pin') || (fh && fh.parentElement); if (!el) return;
  const kind = el.classList.contains('pair') ? 'pair' : el.classList.contains('fold') ? 'fold' : el.classList.contains('pin') ? 'pin' : 'tab';
  drag = { el, kind, x0: e.clientX, y0: e.clientY, y: e.clientY, pid: e.pointerId, on: false, split: false, id: el.dataset.id, cont: null, idx: -1 };
});
function place(d) {
  const el = d.el, dy = d.y - d.y0;
  if (d.kind === 'pin') { el.style.transform = `translate(${d.x - d.x0}px,${dy}px) rotate(4deg)`; return; }
  const natural = el.getBoundingClientRect().top - (d.ty || 0);          // one read: where the row sits without our nudge
  d.ty = d.start + dy - natural;
  el.style.transform = `translateY(${d.ty}px) rotate(-1.5deg)`;
}
/* where would the card land? inside a folder (over its header or body) or between root items */
const MAX_DEPTH = 3;
const foldDepth = f => { let d = 0; for (let x = f; x && x !== tabsEl; x = x.parentElement) if (x.classList.contains('fold')) d++; return d; };
const foldHeight = f => 1 + Math.max(0, ...[...f.querySelectorAll(':scope>.fb>.fl>.fold')].map(foldHeight));
const shows = f => f.classList.contains('open') || f.classList.contains('peek') || f.classList.contains('drop');
/* the innermost folder under the pointer that can take what's being dragged (folders: not into themselves, not deeper than 3) */
function targetFold(d) {
  const el = d.el, y = d.y, h = d.kind === 'fold' ? (d.h ||= foldHeight(el)) : 0;
  let hit = null, header = false;
  for (const f of tabsEl.querySelectorAll('.fold')) {
    if (f === el || el.contains(f)) continue;
    if (f.parentElement && f.parentElement.closest('.fold') && !f.parentElement.closest('.fold').matches('.open,.peek,.drop')) continue;   // hidden inside a collapsed folder
    const hr = f.querySelector(':scope>.fh').getBoundingClientRect(), fr = f.getBoundingClientRect();
    if (y >= hr.top && y < hr.bottom) { hit = f; header = y < hr.top + hr.height * .3; }
    else if (y >= hr.bottom && y < fr.bottom - 7 && shows(f)) { hit = f; header = false; }  // later (deeper) matches win; a folder's bottom edge means "after it"
  }
  let into = hit && !header ? hit : hit && header ? hit.parentElement.closest('.fold') : null;
  const fits = f => !f || (d.kind !== 'fold' || foldDepth(f) + h <= MAX_DEPTH);
  while (into && !fits(into)) into = into.parentElement.closest('.fold');
  return into;
}
function reorder(d) {
  const el = d.el, y = d.y, into = targetFold(d);
  const cont = into ? into.querySelector(':scope>.fb>.fl') : tabsEl;
  const kids = [...cont.children].filter(c => c !== el);
  let idx = 0;
  for (const c of kids) { const r = c.getBoundingClientRect(), pv = (c.classList.contains('fold') && d.kind !== 'fold') ? r.top + 10 : r.top + r.height / 2; if (y > pv) idx++; else break; }
  if (cont === d.cont && idx === d.idx) return;
  tabsEl.querySelectorAll('.fold.drop').forEach(f => { if (f !== into && !(into && f.contains(into))) f.classList.remove('drop'); });
  for (let x = into; x; x = x.parentElement.closest('.fold')) x.classList.add('drop');
  if (into) into.classList.add('drop');
  const items = flipItems(el), first = new Map(items.map(c => [c, c.getBoundingClientRect().top]));
  cont.insertBefore(el, kids[idx] || null); d.cont = cont; d.idx = idx;
  for (const c of items) { const m = first.get(c) - c.getBoundingClientRect().top; if (Math.abs(m) > 1) c.animate([{ transform: `translateY(${m}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
}
addEventListener('pointermove', e => {
  const d = drag; if (!d) return; const dx = e.clientX - d.x0, dy = e.clientY - d.y0; d.x = e.clientX; d.y = e.clientY;
  const el = d.el;
  if (!d.on) {
    if (Math.hypot(dx, dy) < 6) return;
    d.on = true; dragging = true; d.start = el.getBoundingClientRect().top; el.classList.add('drag'); try { el.setPointerCapture(d.pid); } catch {}
    if (d.kind === 'fold') el.classList.add('lifting');
    d.ty = 0;
    if (d.kind !== 'pin') { const edge = () => {                            // keeps scrolling while the pointer rests near the top or bottom
      if (drag !== d) return; d.timer = requestAnimationFrame(edge);
      if (d.split) return; const r = tabsEl.getBoundingClientRect();
      if (d.y < r.top + 28 && tabsEl.scrollTop > 0) { tabsEl.scrollTop -= 7; frame(d); } else if (d.y > r.bottom - 28 && tabsEl.scrollTop < tabsEl.scrollHeight - tabsEl.clientHeight) { tabsEl.scrollTop += 7; frame(d); }
    }; d.timer = requestAnimationFrame(edge); }
  }
  const canSplit = d.kind === 'tab' || d.kind === 'pin', outside = canSplit && e.clientX > SB_W + 26;
  if (outside && !d.split) {
    d.split = true; el.style.transform = ''; el.classList.add('lifted');
    const t = ST.tabs[d.id]; B.drag({ type: 'start', id: d.id, tab: { title: t.title, url: t.url, fav: t.fav }, pal: ST.pal, theme: ST.theme });
  } else if (!outside && d.split) { d.split = false; el.classList.remove('lifted'); B.drag({ type: 'end', id: d.id, x: 0, y: 0, cancel: true }); }
  if (d.split) { d.mx = e.clientX; d.my = e.clientY + TOP; if (!d.q) d.q = requestAnimationFrame(() => { d.q = 0; if (drag === d && d.split) B.drag({ type: 'move', x: d.mx, y: d.my }); }); return; }
  if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; if (drag === d && !d.split) frame(d); });   // at most once per frame, however fast the mouse reports
});
function frame(d) { if (d.kind !== 'pin') reorder(d); place(d); }
function sendLayout() {
  const folders = {}; for (const f of tabsEl.querySelectorAll('.fold')) folders[f.dataset.fid] = keysOf(f.querySelector(':scope>.fb>.fl'));
  B.intent({ type: 'layout', root: keysOf(tabsEl), folders });
}
function endDrag(e, cancel) {
  const d = drag; drag = null; if (!d || !d.on) return;
  cancelAnimationFrame(d.timer); cancelAnimationFrame(d.raf); dragging = false; const el = d.el;
  tabsEl.querySelectorAll('.fold.drop').forEach(f => f.classList.remove('drop')); el.classList.remove('lifting');
  if (d.split) {
    B.drag({ type: 'end', id: d.id, x: e.clientX, y: e.clientY + TOP, cancel: !!cancel });
    el.classList.remove('lifted', 'drag'); el.style.transform = '';
  } else {
    const tr = el.style.transform; el.style.transform = ''; el.classList.remove('drag');
    el.animate([{ transform: tr }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (d.kind !== 'pin') sendLayout();
  }
  justDragged = true; setTimeout(() => { justDragged = false; }, 0);
  hold = true; setTimeout(() => { hold = false; if (pending) { apply(pending); pending = null; } }, 180);   // let the app's answer to the drop arrive before redrawing
}
addEventListener('pointerup', e => endDrag(e, false));
addEventListener('pointercancel', e => endDrag(e, true));

B.sbReady();
