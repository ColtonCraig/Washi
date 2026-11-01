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
  function open(d) {
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
    const list = [...root.querySelectorAll('.row')]; if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || list[0]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && i > -1) { e.preventDefault(); list[i].click(); }
    else if (e.key === 'Enter' && document.activeElement.id === 'sq') { e.preventDefault(); list[0].click(); }
  }
  return { open, close, key, isOpen: () => open_ };
})();
