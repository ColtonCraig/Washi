'use strict';
/* Bookmarks, as drawn in the interface: the bar (in the window when it's always shown, in the overlay when it shows on
   hover), the edit form, and the list in the bookmarks sheet. This file only draws and reports what you did; the shell
   owns the bookmarks and does the work.
   A bookmark is { id, type:'bm', url, title, fav? }; a folder is { id, type:'folder', name, icon (an emoji or null),
   color (a hex or null), kids:[…] }. The bar gets "light" items: folders carry n (how many inside) instead of kids. */
window.BMK = (() => {
  const { esc, ic, favHTML, hostOf } = window.BL;
  const COLORS = [['', 'Paper'], ['#ff6a3d', 'Tangerine'], ['#e89a00', 'Honey'], ['#1f9d57', 'Clover'], ['#0e9f9f', 'Lagoon'], ['#3d63ff', 'Blueberry'], ['#7b46ff', 'Grape'], ['#ff3d8d', 'Bubblegum']];
  const EMOJI = ['📁', '⭐️', '💼', '🏠', '📚', '🛠️', '🎨', '🎵', '🎮', '🍳', '✈️', '💡', '📰', '💸', '❤️', '🌱'];
  const count = f => (f.kids || []).reduce((n, k) => n + (k.type === 'folder' ? count(k) : 1), 0);
  const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const folderIcon = (n, size = 15) => n.icon ? `<span class="emo">${esc(n.icon)}</span>` : ic('folder', size);

  function chip(n, favs) {
    if (n.type === 'folder') {
      const k = n.n !== undefined ? n.n : count(n);
      return `<button class="bm fold" data-id="${n.id}" title="${esc(n.name)} · ${k} inside" ${okColor(n.color) ? `style="--fc:${n.color}"` : ''}>${folderIcon(n)}<span class="t">${esc(n.name)}</span></button>`;
    }
    const f = n.fav || (favs && favs[n.url]) || null;
    return `<button class="bm" data-id="${n.id}" title="${esc(n.title || n.url)}\n${esc(n.url)}">${favHTML({ title: n.title || hostOf(n.url), url: n.url, fav: f })}<span class="t">${esc(n.title || hostOf(n.url))}</span></button>`;
  }

  /* Drag to reorder. axis 'x' (the bar) or 'y' (the sheet's list). Dropping on the middle of a folder puts it inside. */
  function dragSort(el, sel, axis, send) {
    let d = null;
    const pos = e => axis === 'x' ? e.clientX : e.clientY;
    const span = r => axis === 'x' ? [r.left, r.right] : [r.top, r.bottom];
    el.addEventListener('pointerdown', e => { const b = e.target.closest(sel); if (!b || e.button || e.target.closest('[data-a],input,select,textarea')) return; d = { b, p0: pos(e), on: false, pid: e.pointerId }; });
    el.addEventListener('pointermove', e => {
      if (!d) return;
      if (!d.on) { if (Math.abs(pos(e) - d.p0) < 6) return; d.on = true; d.b.classList.add('drag'); el.classList.add('dragging'); try { d.b.setPointerCapture(d.pid); } catch {} }
      d.b.style.transform = axis === 'x' ? `translateX(${pos(e) - d.p0}px)` : `translateY(${pos(e) - d.p0}px)`;
      const p = pos(e), over = [...el.querySelectorAll(sel)].find(x => { if (x === d.b || x.hidden) return false; const [a, z] = span(x.getBoundingClientRect()); return p >= a && p < z; });
      el.querySelectorAll('.into,.before,.after').forEach(x => x.classList.remove('into', 'before', 'after'));
      d.target = null;
      if (!over) return;
      const [a, z] = span(over.getBoundingClientRect()), w = z - a;
      if (over.classList.contains('fold') && p > a + w * .28 && p < z - w * .28 && !d.b.contains(over)) { over.classList.add('into'); d.target = over.dataset.id; d.into = true; }
      else { d.target = over.dataset.id; d.into = false; d.before = p < a + w / 2; over.classList.add(d.before ? 'before' : 'after'); }
    });
    const end = () => {
      if (!d) return; const x = d; d = null;
      x.b.classList.remove('drag'); x.b.style.transform = ''; el.classList.remove('dragging');
      el.querySelectorAll('.into,.before,.after').forEach(y => y.classList.remove('into', 'before', 'after'));
      if (!x.on) return;
      el._dragged = true; setTimeout(() => { el._dragged = false; }, 0);
      if (x.target && x.target !== x.b.dataset.id) send({ act: 'move', id: x.b.dataset.id, target: x.target, into: !!x.into, before: !!x.before });
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  /* the bar: items that don't fit go behind a » button */
  function draw(el, items, favs, send) {
    el.innerHTML = items.length ? items.map(n => chip(n, favs)).join('') + `<button class="bm more" hidden title="More bookmarks" aria-label="More bookmarks">${ic('more', 14)}</button>`
      : '<span class="bmhint">Bookmarks go here. Click ☆ next to the address, or press ⇧⌘D.</span>';
    fit(el);
    if (el._wired) return; el._wired = true;
    el.addEventListener('click', e => {
      const b = e.target.closest('.bm'); if (!b || el._dragged) return;
      const r = b.getBoundingClientRect();
      if (b.classList.contains('more')) return send({ act: 'more', ids: el._hidden || [], x: r.left, y: r.bottom + 2 });
      send({ act: b.classList.contains('fold') ? 'folder' : 'open', id: b.dataset.id, bg: e.metaKey || e.ctrlKey, x: r.left, y: r.bottom + 2 });
    });
    el.addEventListener('auxclick', e => { const b = e.target.closest('.bm:not(.fold):not(.more)'); if (b && e.button === 1) send({ act: 'open', id: b.dataset.id, bg: true }); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); const b = e.target.closest('.bm:not(.more)'); send({ act: 'ctx', id: b ? b.dataset.id : null, x: e.clientX, y: e.clientY }); });
    dragSort(el, '.bm:not(.more)', 'x', send);
  }
  function fit(el) {
    const more = el.querySelector('.more'), chips = [...el.querySelectorAll('.bm:not(.more)')];
    if (!more) { el._hidden = []; return; }
    chips.forEach(c => { c.hidden = false; }); more.hidden = true;
    const max = el.clientWidth, hidden = [];
    if (max && el.scrollWidth > max + 1) {
      more.hidden = false;
      for (let i = chips.length - 1; i >= 0 && el.scrollWidth > max + 1; i--) { chips[i].hidden = true; hidden.unshift(chips[i].dataset.id); }
    }
    el._hidden = hidden;
  }

  /* ---------- the edit form (the popover from ☆ and the bar, and inline in the bookmarks sheet) ----------
     d: { node, folders:[{id, path, depth}], parent (folder id or ''), fresh } → onSave({ title|name, url, icon, color, parent }) */
  function form(d) {
    const n = d.node, isF = n.type === 'folder';
    const kids = new Set(d.exclude || []); if (isF && n.kids) { const walk = f => { kids.add(f.id); (f.kids || []).forEach(k => k.type === 'folder' && walk(k)); }; walk(n); }
    const opts = [['', 'Bookmarks bar'], ...d.folders.filter(f => !kids.has(f.id)).map(f => [f.id, ' '.repeat(Math.min(f.depth, 4)) + f.name])];
    return `<form class="bmf${isF ? ' isf' : ''}" autocomplete="off">
      <label class="fl"><span>Name</span><input class="txt" name="name" value="${esc(isF ? n.name : n.title || '')}" maxlength="${isF ? 40 : 200}" spellcheck="false" placeholder="${isF ? 'Folder name' : esc(hostOf(n.url))}"></label>
      ${isF ? '' : `<label class="fl"><span>Address</span><input class="txt" name="url" value="${esc(n.url)}" spellcheck="false" placeholder="https://"></label>`}
      <label class="fl"><span>In</span><select name="parent">${opts.map(([v, l]) => `<option value="${v}"${v === (d.parent || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${isF ? `<div class="fl"><span>Icon</span><div class="emos">
        <button type="button" class="emo-b${n.icon ? '' : ' on'}" data-e="" title="Paper folder" aria-label="Paper folder">${ic('folder', 16)}</button>
        ${EMOJI.map(e => `<button type="button" class="emo-b${n.icon === e ? ' on' : ''}" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}
        <input class="emo-in" name="icon" value="${esc(n.icon && !EMOJI.includes(n.icon) ? n.icon : '')}" maxlength="8" placeholder="+" aria-label="Your own emoji" title="Type or paste any emoji (⌃⌘Space opens the emoji picker)"></div></div>
      <div class="fl"><span>Color</span><div class="cols">${COLORS.map(([c, nm]) => `<button type="button" class="col-b${(n.color || '') === c ? ' on' : ''}" data-c="${c}" title="${nm}" aria-label="${nm}"><i style="background:${c || 'var(--paper2,#efe6d2)'}"></i></button>`).join('')}</div></div>` : ''}
      <div class="fbtns"><button type="button" class="lnk warn" data-x="del">${isF ? 'Delete folder' : 'Remove'}</button><span class="fill"></span><button type="button" class="btn small plain" data-x="cancel">Cancel</button><button type="submit" class="btn small primary">Done</button></div>
    </form>`;
  }
  function wireForm(el, d, on) {
    const f = el.querySelector('.bmf'), n = d.node, isF = n.type === 'folder';
    let icon = n.icon || '', color = n.color || '';
    const pick = (cls, attr, v) => f.querySelectorAll(cls).forEach(b => b.classList.toggle('on', b.dataset[attr] === v));
    f.querySelectorAll('.emo-b').forEach(b => b.onclick = () => { icon = b.dataset.e; f.querySelector('.emo-in').value = ''; pick('.emo-b', 'e', icon); });
    const ein = f.querySelector('.emo-in');
    if (ein) ein.addEventListener('input', () => { const v = [...new Intl.Segmenter().segment(ein.value.trim())].map(s => s.segment)[0] || ''; if (v) { ein.value = v; icon = v; pick('.emo-b', 'e', '\u0000'); } else { icon = ''; pick('.emo-b', 'e', ''); } });
    f.querySelectorAll('.col-b').forEach(b => b.onclick = () => { color = b.dataset.c; pick('.col-b', 'c', color); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = f.name.value.trim(), parent = f.parent.value;
      if (isF) return on.save({ name: name || 'Folder', icon: icon || null, color: color || null, parent });
      let url = f.url.value.trim();
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^[^\s/]+\.[a-z]{2,}/i.test(url)) url = 'https://' + url;
      if (!/^https?:\/\/\S+$/i.test(url)) { f.url.classList.add('bad'); f.url.focus(); return; }
      on.save({ title: name, url, parent });
    });
    f.querySelector('[data-x="del"]').onclick = () => on.del();
    f.querySelector('[data-x="cancel"]').onclick = () => on.cancel();
    f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); on.cancel(); } else e.stopPropagation(); });
    const nm = f.name; setTimeout(() => { nm.focus(); if (d.fresh) nm.select(); }, 40);
  }

  /* ---------- the bookmarks sheet's list: folders open and close; a search shows matching bookmarks flat ---------- */
  function tree(list, open, q, favs) {
    const out = [];
    if (q) {
      const lq = q.toLowerCase(), walk = (l, path) => { for (const n of l) { if (n.type === 'folder') walk(n.kids || [], path ? path + ' › ' + n.name : n.name); else if (((n.title || '') + ' ' + n.url).toLowerCase().includes(lq)) out.push(row(n, 0, path)); } };
      walk(list, ''); return out.join('') || `<p class="empty">Nothing matches “${esc(q)}”.</p>`;
    }
    const walk = (l, depth) => { for (const n of l) { out.push(row(n, depth)); if (n.type === 'folder' && open.has(n.id)) { if ((n.kids || []).length) walk(n.kids, depth + 1); else out.push(`<p class="bempty" style="--d:${depth + 1}">Empty folder</p>`); } } };
    walk(list, 0);
    return out.join('') || '<p class="empty">No bookmarks yet. Click ☆ next to the address to add the page you\'re on, or bring them in from another browser.</p>';
    function row(n, depth, path) {
      if (n.type === 'folder') return `<div class="row brow fold${open.has(n.id) ? ' open' : ''}" data-id="${n.id}" style="--d:${depth}${okColor(n.color) ? ';--fc:' + n.color : ''}" tabindex="0">
        <span class="chev">${ic('fwd', 12)}</span><span class="fic">${folderIcon(n, 16)}</span><span class="tx"><b>${esc(n.name)}</b><small>${count(n)} inside</small></span>
        <span class="acts"><button data-a="edit">Edit</button><button class="ix" data-a="del" title="Delete folder" aria-label="Delete folder">${ic('close', 14)}</button></span></div>`;
      const f = n.fav || (favs && favs[n.url]) || null;
      return `<div class="row brow" data-id="${n.id}" style="--d:${depth}" tabindex="0">${favHTML({ title: n.title || hostOf(n.url), url: n.url, fav: f })}<span class="tx"><b>${esc(n.title || hostOf(n.url))}</b><small>${esc(path ? path + ' · ' : '')}${esc(hostOf(n.url))}</small></span>
        <span class="acts"><button data-a="edit">Edit</button><button class="ix" data-a="del" title="Remove" aria-label="Remove">${ic('close', 14)}</button></span></div>`;
    }
  }
  return { draw, fit, form, wireForm, tree, dragSort, COLORS, EMOJI, count, okColor };
})();
