'use strict';
/* Snapshot (⇧⌘S), in the overlay: the page frozen where it was, under a soft veil. Drag a box over what you want (or
   press Enter for the whole page, Esc to stop). It's copied straight away: a white flash, then it turns into a
   polaroid that drops into the corner with "Copied", and a toast offers Save. */
window.SNAP = (() => {
  const B = window.washi;
  let el = null, D = null, sel = null, start = null, busy = false;
  const calm = () => document.documentElement.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function open(d) {
    close(); D = d; busy = false; sel = null;
    el = document.createElement('div'); el.className = 'snap on'; el.tabIndex = -1;
    const r = d.rect;
    el.innerHTML = `<img class="sshot" alt="" src="${d.url}" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px">
      <div class="sveil"></div><div class="ssel" hidden data-clip><span class="ssz"></span></div>
      <div class="shint"><i class="tp"></i><b>Snapshot</b><span>Drag over what you want</span><kbd>↩</kbd><span>whole page</span><kbd>esc</kbd><span>stop</span></div>`;
    document.body.appendChild(el);
    const box = el.querySelector('.ssel'), size = el.querySelector('.ssz');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const draw = () => { box.hidden = false; box.style.left = sel.x + 'px'; box.style.top = sel.y + 'px'; box.style.width = sel.w + 'px'; box.style.height = sel.h + 'px'; size.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`; el.classList.add('picking'); };
    el.addEventListener('pointerdown', e => {
      if (busy || e.button) return;
      if (e.target.closest('.shint')) return;
      const x = clamp(e.clientX, r.x, r.x + r.width), y = clamp(e.clientY, r.y, r.y + r.height);
      start = { x, y }; sel = { x, y, w: 0, h: 0 }; el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!start || busy) return;
      const x = clamp(e.clientX, r.x, r.x + r.width), y = clamp(e.clientY, r.y, r.y + r.height);
      sel = { x: Math.min(x, start.x), y: Math.min(y, start.y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) }; draw();
    });
    el.addEventListener('pointerup', () => {
      if (!start || busy) return; start = null;
      if (sel && sel.w >= 8 && sel.h >= 8) take(sel); else { sel = null; box.hidden = true; el.classList.remove('picking'); }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && !busy) { e.preventDefault(); sel = { x: r.x, y: r.y, w: r.width, h: r.height }; draw(); take(sel); }
    });
    setTimeout(() => el && el.focus(), 30);
  }
  async function take(s) {
    busy = true; const r = D.rect;
    const res = await B.snapTake({ x: s.x - r.x, y: s.y - r.y, w: s.w, h: s.h });
    if (!res) { cancel(); return; }
    el.classList.add('taken');
    const pol = document.createElement('div'); pol.className = 'spol';
    pol.innerHTML = `<i class="tp"></i><img alt="" src="${res.url}"><b>Copied</b>`;
    const W = innerWidth, H = innerHeight, maxW = 240, k = Math.min(1, maxW / s.w, 170 / s.h), fw = s.w * k + 20, fh = s.h * k + 46;
    Object.assign(pol.style, { left: s.x - 10 + 'px', top: s.y - 10 + 'px', width: s.w + 20 + 'px', height: s.h + 46 + 'px' });
    el.appendChild(pol);
    const flash = document.createElement('div'); flash.className = 'sflash'; el.appendChild(flash);
    const keep = !!(D && D.theme && D.theme.snapSave === 'save');     // Settings › Features: copy, or copy and save
    const done = () => { cancel(); setTimeout(() => keep ? B.setupAct({ type: 'snap:save' }) : B.fx({ type: 'toast', text: 'Snapshot copied: paste it anywhere', action: { label: 'Save', cmd: 'snap:save' } }), 60); };
    if (calm()) { pol.style.left = W - fw - 24 + 'px'; pol.style.top = H - fh - 24 + 'px'; pol.style.width = fw + 'px'; pol.style.height = fh + 'px'; setTimeout(done, 700); return; }
    flash.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    const tilt = document.documentElement.classList.contains('scrapbook') ? 6 : 3;
    const a = pol.animate([
      { left: s.x - 10 + 'px', top: s.y - 10 + 'px', width: s.w + 20 + 'px', height: s.h + 46 + 'px', transform: 'rotate(0deg)' },
      { offset: .35, left: s.x - 10 + 'px', top: s.y - 14 + 'px', width: s.w + 20 + 'px', height: s.h + 46 + 'px', transform: 'rotate(-1deg) scale(1.02)' },
      { left: W - fw - 24 + 'px', top: H - fh - 24 + 'px', width: fw + 'px', height: fh + 'px', transform: `rotate(${tilt}deg)` }
    ], { duration: 620, easing: 'cubic-bezier(.3,.9,.3,1.04)', fill: 'forwards' });
    a.finished.then(() => setTimeout(done, 650), done);
  }
  function cancel() { const was = !!el; close(); if (was) B.overlayCancel(); }
  function close() { if (el) el.remove(); el = null; D = null; start = null; busy = false; }
  return { open, close, isOpen: () => !!el };
})();
