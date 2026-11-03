'use strict';
/* The tools on the right of the top bar: in your order, the ones you want. Drag one along the bar to move it (the others
   slide out of the way); right-click one to hide it or open Settings › Top bar, where they can all be shown, hidden,
   reordered and reset. Esc during a drag puts everything back. Saved in prefs (tools, toolsOff), so every window follows. */
window.TOOLBAR = (() => {
  const box = document.getElementById('tools');
  const byId = id => box.querySelector(`[data-tool="${id}"]`) || document.querySelector(`[data-tool="${id}"]`);
  const info = id => BL.TOOLS.find(t => t.id === id) || { id, name: id };
  const motionOK = () => !document.documentElement.classList.contains('motion-off') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrap = () => document.documentElement.classList.contains('scrapbook');
  let applied = '';

  function apply() {
    if (!S) return;
    const order = BL.toolOrder(S.prefs.tools), off = new Set(S.prefs.toolsOff || []);
    const key = order.join() + '|' + [...off].join();
    if (key === applied || drag) return;
    const first = !applied; applied = key;
    const before = rects(visible()), anim = !first && motionOK(), going = [], coming = [];
    for (const id of order) { const el = byId(id); if (!el) continue; const was = el.hasAttribute('data-off'), now = off.has(id); if (was === now) continue; (now ? going : coming).push(el); }
    const settle = () => {
      for (const el of going) el.setAttribute('data-off', '');
      for (const el of coming) el.removeAttribute('data-off');
      const now = [...box.children].map(e => e.dataset.tool).filter(Boolean);
      if (now.join() !== order.join()) for (const id of order) { const el = byId(id); if (el) box.appendChild(el); }
      if (!anim) return;
      slide(before, null);                                                     // the rest glide to their new places
      for (const el of coming) el.animate([{ transform: `scale(.4) rotate(${scrap() ? -14 : -6}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    };
    if (anim && going.length) { for (const el of going) el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.4)', opacity: 0 }], { duration: 150, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).finished.then(a => a.cancel(), () => {}); setTimeout(settle, 150); }   // (a timer, not onfinish: a window in the background may never finish its animations)
    else settle();
  }
  function setTools(patch) {
    for (const k in patch) S.prefs[k] = patch[k];
    save(); syncMain(); apply(); updateChrome();
    B.setupReply({ type: 'tools', tools: BL.toolOrder(S.prefs.tools), toolsOff: S.prefs.toolsOff || [] });
  }
  const visible = () => [...box.children].filter(e => e.dataset.tool && !e.hasAttribute('data-off') && !e.hidden && e.getBoundingClientRect().width > 4);

  /* ---------- drag along the bar ---------- */
  let drag = null, swallow = 0;
  const rects = els => new Map(els.map(e => [e, e.getBoundingClientRect()]));
  function slide(before, skip) {                       // FLIP: everyone who moved glides to their new place
    if (!motionOK()) return;
    for (const [el, r] of before) {
      if (el === skip) continue;
      const n = el.getBoundingClientRect(), dx = r.left - n.left; if (!dx) continue;
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.215,.61,.355,1)' });
    }
  }
  function place(x) {
    const d = drag, el = d.el, sibs = visible().filter(e => e !== el);
    let target = null; for (const s of sibs) { const r = s.getBoundingClientRect(); if (x < r.left + r.width / 2) { target = s; break; } }
    const cur = el.nextElementSibling;
    const want = target || null;
    if (want !== cur && !(want === null && !visibleAfter(el))) {
      const before = rects(sibs); const r0 = el.getBoundingClientRect();
      if (want) box.insertBefore(el, want); else box.appendChild(el);
      try { el.setPointerCapture(d.pid); } catch {}                           // moving it in the page drops the capture: take it again
      const r1 = el.getBoundingClientRect(); d.base += r1.left - r0.left;
      slide(before, el);
    }
    el.style.transform = `translateX(${x - d.grab - d.base}px) translateY(-2px) rotate(${scrap() ? -6 : -2}deg) scale(1.08)`;
  }
  const visibleAfter = el => { for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (visible().includes(n)) return true; return false; };
  function begin(e) {
    const d = drag, r = d.el.getBoundingClientRect();
    d.on = true; d.grab = d.x0 - r.left; d.base = r.left;
    d.el.classList.add('lift'); box.classList.add('arranging'); document.body.classList.add('arranging');
    d.pid = e.pointerId; try { d.el.setPointerCapture(e.pointerId); } catch {}
    B.fx && B.fx({ type: 'toast', text: 'Drag to rearrange · esc puts it back', short: true });
  }
  function finish(keep) {
    const d = drag; drag = null; if (!d || !d.on) return;
    const el = d.el;
    if (!keep) { const before = rects(visible()); for (const id of d.start) { const x = byId(id); if (x) box.appendChild(x); } slide(before, el); }
    el.style.transform = ''; el.classList.remove('lift'); box.classList.remove('arranging'); document.body.classList.remove('arranging');
    const r = el.getBoundingClientRect();
    if (motionOK()) { const from = d.lastX != null ? d.lastX - d.grab - r.left : 0;
      el.animate([{ transform: `translateX(${from}px) translateY(-2px) rotate(${scrap() ? -6 : -2}deg) scale(1.08)` }, { transform: `translateY(1px) rotate(${scrap() ? 2 : 0}deg) scale(.96)`, offset: .7 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.3,.5,1)' }); }
    swallow = Date.now() + 400;
    const order = [...box.children].map(x => x.dataset.tool).filter(Boolean);
    if (keep && order.join() !== d.start.join()) setTools({ tools: order });
  }
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !S) return;
    const el = e.target.closest('[data-tool]'); if (!el || el.parentElement !== box) return;
    drag = { el, x0: e.clientX, y0: e.clientY, on: false, start: [...box.children].map(x => x.dataset.tool).filter(Boolean) };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!(e.buttons & 1)) { if (drag.on) finish(true); else drag = null; return; }   // the button came up somewhere we didn't hear it
    if (!drag.on) { if (Math.abs(e.clientX - drag.x0) < 6 && Math.abs(e.clientY - drag.y0) < 6) return; begin(e); }
    place(e.clientX); drag.lastX = e.clientX;
  }, true);
  window.addEventListener('pointerup', () => { if (drag) { if (drag.on) finish(true); else drag = null; } }, true);
  window.addEventListener('pointercancel', () => finish(false), true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && drag && drag.on) { e.preventDefault(); e.stopPropagation(); finish(false); } }, true);
  window.addEventListener('click', e => { if (Date.now() < swallow && e.target.closest && e.target.closest('#tools')) { e.preventDefault(); e.stopPropagation(); } }, true);   // the click at the end of a drag isn't a press
  window.addEventListener('blur', () => finish(false));

  /* ---------- right-click a tool ---------- */
  box.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-tool]'); if (!el || el.parentElement !== box || el.dataset.tool === 'exts') return;   // extensions have their own menus
    if (el.dataset.tool === 'reader' && R.reading[focusedId()]) return;                                                   // Reader's text size card
    e.preventDefault(); const t = info(el.dataset.tool);
    B.popupMenu([{ label: `Hide ${t.name} from the Top Bar`, id: 'tb:hide:' + t.id }, { type: 'separator' }, { label: 'Customize Top Bar…', id: 'tb:custom' }]);
  });
  function menu(id) {
    if (id.startsWith('tb:hide:')) {
      const t = id.slice(8), off = new Set(S.prefs.toolsOff || []); off.add(t); setTools({ toolsOff: [...off] });
      B.fx({ type: 'toast', text: `${info(t).name} is hidden · Settings › Top bar brings it back`, action: { label: 'Undo', cmd: 'tb:show:' + t } });
      return true;
    }
    if (id === 'tb:custom') { openSetup('settings', 'toolbar'); return true; }
    return false;
  }
  function cmd(n) { if (n.startsWith('tb:show:')) { const t = n.slice(8); setTools({ toolsOff: (S.prefs.toolsOff || []).filter(x => x !== t) }); return true; } return false; }
  if (S) apply();
  return { apply, save: setTools, menu, cmd, isDragging: () => !!(drag && drag.on) };
})();
