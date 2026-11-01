'use strict';
/* Small paper panels that sit over part of the window (find bar, blocking popover) and the peek card. */
window.PANELS = (() => {
  const B = window.washi, { esc, ic, hostOf } = window.BL;
  const panel = document.getElementById('panel'), peekEl = document.getElementById('peek');
  let kind = null, data = null, findT = 0, peekOn = false;

  /* ---------- find on page ---------- */
  function find() {
    panel.innerHTML = `<div class="findbar" role="search"><i class="tp"></i>${ic('search', 16)}<input id="fq" type="text" placeholder="Find on page" spellcheck="false" aria-label="Find on page"><span class="fc" id="fc"></span>
      <button class="fb" id="fprev" title="Previous (⇧↩)" aria-label="Previous match">${ic('up', 15)}</button><button class="fb" id="fnext" title="Next (↩)" aria-label="Next match">${ic('down', 15)}</button><button class="fb" id="fx" title="Close (esc)" aria-label="Close find">${ic('close', 15)}</button></div>`;
    const q = document.getElementById('fq');
    const go = (dir, next) => B.findQuery({ text: q.value, dir, next });
    q.addEventListener('input', () => { clearTimeout(findT); findT = setTimeout(() => go(1, false), 70); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1, true); } });
    document.getElementById('fprev').onclick = () => go(-1, true);
    document.getElementById('fnext').onclick = () => go(1, true);
    document.getElementById('fx').onclick = () => B.overlayCancel();
    setTimeout(() => q.focus(), 30);
  }
  B.onFind(r => {
    const c = document.getElementById('fc'), q = document.getElementById('fq'); if (!c || !q) return;
    c.textContent = q.value ? (r.total ? `${r.active} of ${r.total}` : 'none') : '';
    panel.querySelector('.findbar').classList.toggle('miss', !!q.value && !r.total);
  });
  B.onFindStep(d => { const q = document.getElementById('fq'); if (q) B.findQuery({ text: q.value, dir: d, next: true }); });

  /* ---------- blocking popover ---------- */
  function shield() {
    const d = data, on = !d.allowed && d.mode !== 'off';
    panel.innerHTML = `<div class="pop" role="dialog" aria-label="Blocking on this site"><i class="tp"></i>
      <div class="ph">${ic('shield', 18)}<b>Blocking</b><span class="mode">${d.mode === 'off' ? 'off' : d.mode}</span></div>
      <div class="big"><b>${d.mode === 'off' || d.allowed ? '–' : d.count}</b><span>${d.mode === 'off' ? 'Blocking is turned off in Settings.' : d.allowed ? `Off for ${esc(d.host)}` : `ads and trackers blocked on ${esc(d.host || 'this page')}`}</span></div>
      ${d.host && d.mode !== 'off' ? `<div class="tgl"><span class="tl"><b>Block on this site</b><small>Turn off if the site looks broken</small></span><button class="sw${on ? ' on' : ''}" id="sitesw" role="switch" aria-checked="${on}" aria-label="Block on this site"><i></i></button></div>` : ''}
      <button class="lnk" id="toset">Blocking settings</button></div>`;
    const sw = document.getElementById('sitesw');
    if (sw) sw.onclick = async () => { const block = !sw.classList.contains('on'); sw.classList.toggle('on', block); await B.setupAct({ type: 'blocking:site', host: d.host, block }); setTimeout(() => B.overlayCancel(), 350); };
    document.getElementById('toset').onclick = () => B.overlayResult({ kind: 'cmd', cmd: 'settings:privacy' });
  }
  addEventListener('blur', () => { if (kind === 'shield') { kind = null; panel.classList.remove('on'); B.overlayCancel(); } });

  function open(d) {
    kind = d.kind; data = d.data || {}; if (d.data && d.data.theme) window.BL.applyTheme(d.data.theme, d.data.pal);
    panel.className = 'panel on ' + kind;
    if (kind === 'find') find(); else if (kind === 'shield') shield();
  }
  function close() { kind = null; panel.className = 'panel'; panel.innerHTML = ''; }

  /* ---------- peek: a paper card around the page the main process places inside it ---------- */
  function peek(d) {
    const r = d.rect, already = peekOn; peekOn = true;
    peekEl.className = 'peek on' + (already || d.resize ? ' still' : '');
    peekEl.innerHTML = `<div class="dim" id="pkdim"></div><div class="card" style="left:${r.x - 9}px;top:${r.y - 52}px;width:${r.w + 18}px;height:${r.h + 61}px"><i class="tp"></i>
      <div class="bar"><span class="pt"><b id="pkt">${esc(hostOf(d.url))}</b><small id="pku">${esc(d.url)}</small></span>
      <button class="pbtn" id="pkopen" title="Open as a tab">${ic('expand', 15)}<span>Open as tab</span></button><button class="pbtn x" id="pkx" title="Close (esc)" aria-label="Close peek">${ic('close', 16)}</button></div></div>`;
    document.getElementById('pkdim').onclick = () => B.overlayCancel();
    document.getElementById('pkx').onclick = () => B.overlayCancel();
    document.getElementById('pkopen').onclick = () => { closePeek(); B.setupMsg({ type: 'peekAdopt' }); };
  }
  B.onPeekInfo(i => { const t = document.getElementById('pkt'), u = document.getElementById('pku'); if (t) t.textContent = i.title || hostOf(i.url); if (u) u.textContent = i.url; peekEl.classList.toggle('loading', !!i.loading); });
  function closePeek() { peekOn = false; peekEl.className = 'peek'; peekEl.innerHTML = ''; }
  B.onPeekClosed(closePeek);

  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); B.overlayCancel(); close(); closePeek(); }
  }
  return { open, peek, close, key, isOpen: () => !!kind || peekOn, closeAll: () => { close(); closePeek(); } };
})();
