'use strict';
/* History, archived tabs and downloads: big paper sheets, searchable, keyboard friendly. */
window.SHEETS = (() => {
  const B = window.washi, { esc, ic, hostOf, favHTML } = window.BL;
  const root = document.getElementById('sheet');
  let kind = null, items = [], q = '', open_ = false, limit = 200;
  const send = m => B.setupMsg({ type: 'sheet', ...m });
  const day = t => { const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === now.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); };
  const time = t => t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const size = n => !n ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  const TITLES = { history: ['History', 'Every page you\'ve visited, newest first.'], archive: ['Archive', 'Tabs Washi tidied away because you hadn\'t opened them in a while. Bring any back with one click.'], downloads: ['Downloads', 'Files you\'ve downloaded. They\'re checked by macOS before they open.'] };

  function rows() {
    const lq = q.toLowerCase(), match = x => !lq || ((x.title || '') + ' ' + (x.url || '') + ' ' + (x.name || '')).toLowerCase().includes(lq);
    const list = items.filter(match);
    if (!list.length) return `<p class="empty">${q ? 'Nothing matches “' + esc(q) + '”.' : kind === 'history' ? 'No history yet.' : kind === 'archive' ? 'Nothing archived. Turn on tidying in Settings → Tabs to have old tabs move here.' : 'No downloads yet.'}</p>`;
    let h = '', last = '';
    for (const [i, x] of list.slice(0, limit).entries()) {
      const g = kind === 'downloads' ? day(x.at) : day(x.t || x.at || 0);
      if (g !== last && (x.t || x.at)) { h += `<h4 class="day">${g}</h4>`; last = g; }
      if (kind === 'downloads') {
        const pct = x.total ? Math.round(x.received / x.total * 100) : 0, live = x.state === 'progressing' || x.state === 'paused';
        const st = live ? `${size(x.received)} of ${size(x.total) || '?'}${x.state === 'paused' ? ' · paused' : ''}` : x.state === 'completed' ? (x.exists ? size(x.total || x.received) : 'Moved or deleted') : x.state === 'cancelled' ? 'Cancelled' : 'Failed';
        h += `<div class="row dl ${x.state}${x.exists === false ? ' gone' : ''}" data-i="${i}" style="--i:${Math.min(i, 12)}"><span class="ficon">${ic('download', 18)}</span><span class="tx"><b>${esc(x.name)}</b><small>${esc(st)} · ${esc(hostOf(x.url))}</small>${live ? `<i class="bar"><i style="width:${pct}%"></i></i>` : ''}</span>
          <span class="acts">${live ? `<button data-a="${x.state === 'paused' ? 'resume' : 'pause'}">${x.state === 'paused' ? 'Resume' : 'Pause'}</button><button data-a="cancel">Cancel</button>` : x.state === 'completed' && x.exists ? `<button data-a="open">Open</button><button data-a="reveal">Show in Finder</button>` : ''}${live ? '' : `<button class="ix" data-a="remove" title="Remove from list" aria-label="Remove from list">${ic('close', 14)}</button>`}</span></div>`;
      } else {
        const t = { title: x.title || hostOf(x.url), url: x.url, fav: x.fav };
        h += `<div class="row" data-i="${i}" style="--i:${Math.min(i, 12)}" tabindex="0">${favHTML(t)}<span class="tx"><b>${esc(t.title)}</b><small>${esc(hostOf(x.url))}</small></span><span class="when">${time(x.t || x.at)}</span>
          <span class="acts">${kind === 'archive' ? `<button data-a="restore">Restore</button>` : ''}<button class="ix" data-a="${kind === 'archive' ? 'unarchive' : 'forget'}" title="Remove" aria-label="Remove">${ic('close', 14)}</button></span></div>`;
      }
    }
    if (list.length > limit) h += `<button class="more" id="more">Show more (${list.length - limit} left)</button>`;
    return h;
  }
  let shown = [];
  function draw(keepScroll) {
    const body = root.querySelector('.slist'); if (!body) return;
    const st = body.scrollTop; body.innerHTML = rows(); if (keepScroll) body.scrollTop = st;
    const lq = q.toLowerCase(); shown = items.filter(x => !lq || ((x.title || '') + ' ' + (x.url || '') + ' ' + (x.name || '')).toLowerCase().includes(lq));
    const m = document.getElementById('more'); if (m) m.onclick = () => { limit += 300; draw(true); };
  }
  /* ---------- bookmarks: folders open and close, drag to reorder, edit in place ---------- */
  let BM = null;                                           // { items, folders, favs, open:Set, editing }
  const bmSend = m => B.setupMsg({ type: 'bm', ...m });
  const findBm = (id, list = BM.items, parent = null) => { for (const n of list) { if (n.id === id) return { node: n, parent }; if (n.type === 'folder') { const r = findBm(id, n.kids || [], n); if (r) return r; } } return null; };
  function bmDraw(keepScroll) {
    const body = root.querySelector('.slist'); if (!body) return;
    const st = body.scrollTop;
    body.innerHTML = BMK.tree(BM.items, BM.open, q, BM.favs);
    if (BM.editing) {
      const row = body.querySelector(`.brow[data-id="${BM.editing.id}"]`), x = findBm(BM.editing.id);
      if (row && x) {
        const box = document.createElement('div'); box.className = 'bmedit-in'; box.style.setProperty('--d', row.style.getPropertyValue('--d'));
        const n = x.node, d = { node: n, folders: BM.folders, parent: x.parent ? x.parent.id : '', fresh: BM.editing.fresh };
        box.innerHTML = BMK.form(d); row.after(box); row.classList.add('editing');
        BMK.wireForm(box, d, {
          save: patch => { BM.editing = null; bmSend({ act: 'save', id: n.id, patch }); },
          del: () => { BM.editing = null; bmSend({ act: 'del', id: n.id }); },
          cancel: () => { const f = BM.editing; BM.editing = null; if (f && f.fresh && n.type === 'folder') bmSend({ act: 'discard', id: n.id }); else bmDraw(true); }
        });
        if (!keepScroll) box.scrollIntoView({ block: 'nearest' });
      }
    }
    if (keepScroll) body.scrollTop = st;
  }
  function bmOpen(d) {
    BM = { items: d.items || [], folders: d.folders || [], favs: d.favs || {}, open: BM ? BM.open : new Set(), editing: null };
    root.innerHTML = `<div class="sheet lst bookmarks" tabindex="-1"><i class="tp l"></i><i class="tp r"></i>
      <header class="shead"><h2 class="ttl">Bookmarks</h2><p class="lead">Drag to reorder, or onto a folder to put it inside. Right-click the bar for more.</p><button class="xx" aria-label="Close">×</button>
        <div class="sbar">${ic('search', 16)}<input id="sq" type="text" placeholder="Search bookmarks" spellcheck="false" aria-label="Search bookmarks">
          <button class="btn small" id="bnewf">${ic('folder', 14)}New folder</button><button class="btn small plain" id="bimp">Import…</button></div></header>
      <div class="slist btree" role="tree"></div></div>`;
    root.classList.add('on'); bmDraw();
    root.querySelector('.xx').onclick = close;
    const sq = document.getElementById('sq'); sq.addEventListener('input', () => { q = sq.value.trim(); BM.editing = null; bmDraw(); }); setTimeout(() => sq.focus(), 40);
    document.getElementById('bnewf').onclick = () => bmSend({ act: 'newf' });
    document.getElementById('bimp').onclick = () => bmSend({ act: 'import' });
    const list = root.querySelector('.slist');
    list.addEventListener('click', e => {
      if (list._dragged || e.target.closest('.bmedit-in')) return;
      const row = e.target.closest('.brow'); if (!row) return; const x = findBm(row.dataset.id); if (!x) return;
      const a = e.target.closest('[data-a]'), n = x.node;
      if (a && a.dataset.a === 'edit') { BM.editing = BM.editing && BM.editing.id === n.id ? null : { id: n.id }; bmDraw(true); return; }
      if (a && a.dataset.a === 'del') { row.classList.add('gone'); setTimeout(() => bmSend({ act: 'del', id: n.id }), 160); return; }
      if (n.type === 'folder') { BM.open.has(n.id) ? BM.open.delete(n.id) : BM.open.add(n.id); bmDraw(true); return; }
      bmSend({ act: 'open', id: n.id, bg: e.metaKey }); if (!e.metaKey) close();
    });
    BMK.dragSort(list, '.brow', 'y', m => { if (!q) { if (m.into) BM.open.add(m.target); bmSend(m); } });
  }
  B.onSetupEvent(e => {
    if (!open_ || kind !== 'bookmarks' || !e) return;
    if (e.type === 'bmTree') { BM.items = e.items || []; BM.folders = e.folders || []; BM.favs = e.favs || BM.favs; bmDraw(true); }
    else if (e.type === 'bmFresh') { const x = findBm(e.id); if (x && x.parent) BM.open.add(x.parent.id); BM.editing = { id: e.id, fresh: true }; bmDraw(); }
  });
  function open(d) {
    if (d.kind === 'bookmarks') { kind = 'bookmarks'; q = ''; open_ = true; items = []; return bmOpen(d); }
    kind = d.kind; items = d.items || []; q = ''; limit = 200; open_ = true;
    const [title, lead] = TITLES[kind];
    root.innerHTML = `<div class="sheet lst ${kind}" tabindex="-1"><i class="tp l"></i><i class="tp r"></i>
      <header class="shead"><h2 class="ttl">${title}</h2><p class="lead">${lead}</p><button class="xx" aria-label="Close">×</button>
        <div class="sbar">${ic('search', 16)}<input id="sq" type="text" placeholder="Search ${title.toLowerCase()}" spellcheck="false" aria-label="Search ${title.toLowerCase()}">${kind !== 'downloads' || items.length ? `<button class="btn warn small" id="sclear">${kind === 'history' ? 'Clear all history' : kind === 'archive' ? 'Empty archive' : 'Clear list'}</button>` : ''}</div></header>
      <div class="slist" role="list"></div></div>`;
    root.classList.add('on'); draw();
    root.querySelector('.xx').onclick = close;
    const sq = document.getElementById('sq'); sq.addEventListener('input', () => { q = sq.value.trim(); limit = 200; draw(); }); setTimeout(() => sq.focus(), 40);
    const sc = document.getElementById('sclear'); let armed = false;
    if (sc) sc.onclick = () => {
      if (!armed) { armed = true; sc.textContent = 'Click again to confirm'; setTimeout(() => { armed = false; if (sc.isConnected) sc.textContent = kind === 'history' ? 'Clear all history' : kind === 'archive' ? 'Empty archive' : 'Clear list'; }, 3000); return; }
      if (kind === 'history') { send({ act: 'forgetAll' }); items = []; } else if (kind === 'archive') { send({ act: 'clearArchive' }); items = []; } else { B.dlAct('', 'clear'); items = items.filter(x => x.state === 'progressing' || x.state === 'paused'); }
      draw();
    };
    root.querySelector('.slist').addEventListener('click', e => {
      const row = e.target.closest('.row'); if (!row) return; const x = shown[+row.dataset.i]; if (!x) return;
      const a = e.target.closest('[data-a]');
      if (kind === 'downloads') { if (a) { B.dlAct(x.id, a.dataset.a); if (a.dataset.a === 'remove') { items = items.filter(y => y !== x); draw(true); } } else if (x.state === 'completed' && x.exists) B.dlAct(x.id, 'open'); return; }
      if (a && a.dataset.a === 'forget') { send({ act: 'forget', url: x.url }); items = items.filter(y => y.url !== x.url); row.classList.add('gone'); setTimeout(() => draw(true), 200); return; }
      if (a && a.dataset.a === 'unarchive') { send({ act: 'unarchive', url: x.url, at: x.at }); items = items.filter(y => y !== x); draw(true); return; }
      if (kind === 'archive') { send({ act: 'restore', url: x.url, at: x.at }); close(); return; }
      send({ act: 'open', url: x.url }); close();
    });
  }
  B.onDl(list => { if (open_ && kind === 'downloads') { items = list; draw(true); } });
  function close(quiet) {
    if (!open_) return; open_ = false;
    const s = root.querySelector('.sheet');
    const done = () => { root.classList.remove('on'); root.innerHTML = ''; };
    if (quiet === true || !s || window.BL.motion.off) done(); else s.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(24px) rotate(1.5deg)' }], { duration: 180, fill: 'forwards' }).onfinish = done;
    if (quiet !== true) B.overlayCancel();
  }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (document.activeElement && document.activeElement.closest('.bmedit-in')) return;
    const list = [...root.querySelectorAll('.row')]; if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || list[0]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && i > -1) { e.preventDefault(); list[i].click(); }
    else if (e.key === 'Enter' && document.activeElement.id === 'sq') { e.preventDefault(); list[0].click(); }
  }
  return { open, close, key, isOpen: () => open_ };
})();
