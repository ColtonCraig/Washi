'use strict';
const B = window.washi;
const { esc, ic, favHTML, hostOf, hueOf, palOf, applyTheme, zones, zoneAt } = window.BL;
BL.setup();
const $ = s => document.querySelector(s);
const cmd = $('#cmd'), q = $('#q'), res = $('#res'), modeEl = $('#mode'), toast = $('#toast');
const looksLikeUrl = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^localhost(:\d+)?([/?#]|$)/i.test(v) || /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(v);

/* ---------- command bar ---------- */
let D = null, items = [], sel = 0, sugg = [], suggFor = '', suggT = 0;
B.onOverlayInit(d => {
  applyTheme(d.theme, d.pal);
  if (d.mode !== 'peek') window.PANELS.closeAll(); if (d.mode !== 'sheet') window.SHEETS.close(true); if (d.mode !== 'panel' && d.mode !== 'peek' && d.mode !== 'sheet' && d.mode !== 'setup') close();
  if (d.mode === 'setup') { window.SETUP.open(d); return; }
  if (d.mode === 'panel') { window.PANELS.open(d); return; }
  if (d.mode === 'peek') { window.PANELS.peek(d); return; }
  if (d.mode === 'sheet') { window.SHEETS.open(d); return; }
  D = d; sugg = []; suggFor = '';
  modeEl.textContent = d.mode === 'new' ? 'new scrap' : d.mode === 'this' ? 'this tab' : 'name it';
  q.placeholder = d.mode === 'prompt' ? d.title : 'Search, go to a tab, or run a command';
  q.value = d.value || '';
  cmd.classList.add('on'); res.classList.add('stagger');
  build(); setTimeout(() => res.classList.remove('stagger'), 700);
  q.focus(); if (d.mode !== 'new') q.select();
});
function close() { cmd.classList.remove('on'); D = null; }
function pick(r) { close(); B.overlayResult(r); }
function cancel() { if (!D) return; close(); B.overlayCancel(); }

function build() {
  if (!D) return;
  const v = q.value.trim(), lv = v.toLowerCase();
  if (D.mode === 'prompt') { items = v ? [{ r: { kind: 'prompt', value: v }, label: `Save “${v}”`, icon: 'bolt', hint: '↵' }] : []; render([{ rows: items }]); return; }
  const words = lv.split(/\s+/).filter(Boolean), has = s => !words.length || words.every(w => s.toLowerCase().includes(w));
  const groups = [];
  const bg = v && BL.bang(v);
  if (v) groups.push({ rows: [{ r: { kind: 'url', value: v, mode: D.mode }, label: bg ? `Search ${bg.name} for “${bg.q}”` : looksLikeUrl(v) ? `Go to ${v}` : `Search for “${v}”`, icon: looksLikeUrl(v) ? 'globe' : 'search', hint: '↵' }] });
  if (v && !bg && !looksLikeUrl(v) && D.suggest) {
    if (suggFor !== v) { clearTimeout(suggT); suggT = setTimeout(async () => { const want = q.value.trim(); if (!D || want !== v) return; const r = await B.suggest(v, D.suggest).catch(() => []); if (!D || q.value.trim() !== v) return; sugg = r; suggFor = v; build(); }, 140); }
    const rows = (suggFor === v ? sugg : []).filter(x => x.toLowerCase() !== lv).slice(0, 4).map(x => ({ r: { kind: 'url', value: x, mode: D.mode }, label: x, icon: 'search', hint: 'search' }));
    if (rows.length) groups.push({ rows });
  }
  const tabs = D.tabs.filter(t => has(t.title + ' ' + t.url)).slice(0, 8).map(t => ({ r: { kind: 'tab', id: t.id }, label: t.title || hostOf(t.url), fav: t, hint: t.space }));
  const open = new Set(D.tabs.map(t => t.url));
  const hist = v ? D.history.filter(h => !open.has(h.url) && has((h.title || '') + ' ' + h.url)).slice(0, 5).map(h => ({ r: { kind: 'url', value: h.url, mode: D.mode }, label: h.title || hostOf(h.url), icon: 'clock', hint: hostOf(h.url) })) : [];
  const acts = D.actions.filter(a => has(a.label)).slice(0, v ? 4 : 12).map(a => ({ r: { kind: 'action', id: a.id }, label: a.label, icon: 'bolt', hint: a.hint }));
  groups.push({ name: 'open tabs', rows: tabs });
  if (v) groups.push({ name: 'history', rows: hist });
  if (v && D.archive) groups.push({ name: 'archived', rows: D.archive.filter(a => !open.has(a.url) && has((a.title || '') + ' ' + a.url)).slice(0, 3).map(a => ({ r: { kind: 'url', value: a.url, mode: D.mode }, label: a.title || hostOf(a.url), icon: 'clock', hint: 'archived' })) });
  groups.push({ name: 'actions', rows: acts });
  render(groups);
}
function render(groups) {
  let h = '', n = 0; items = [];
  for (const g of groups) {
    if (!g.rows.length) continue;
    if (g.name) h += `<div class="rh">${g.name}</div>`;
    for (const r of g.rows) {
      items.push(r);
      const icon = r.fav ? `<span class="ico fav" style="box-shadow:none;background:none">${favHTML({ title: r.label, url: r.fav.url, fav: r.fav.fav })}</span>` : `<span class="ico">${ic(r.icon, 15)}</span>`;
      h += `<button class="r" data-n="${n}" style="--i:${n}">${icon}<span class="lb">${esc(r.label)}</span><span class="hint">${esc(r.hint || '')}</span></button>`;
      n++;
    }
  }
  if (!n && D.mode !== 'prompt') h = '<div class="note">Nothing matches. Press Return to search the web.</div>';
  res.innerHTML = '<div class="hl" id="hl"></div>' + h; sel = 0; move();
}
function move() {
  const el = res.querySelector(`.r[data-n="${sel}"]`), hl = $('#hl'); if (!hl) return;
  if (!el) { hl.style.height = '0px'; return; }
  hl.style.transform = `translateY(${el.offsetTop}px)`; hl.style.height = el.offsetHeight + 'px'; el.scrollIntoView({ block: 'nearest' });
}
q.addEventListener('input', build);
res.addEventListener('pointermove', e => { const r = e.target.closest('.r'); if (r && +r.dataset.n !== sel) { sel = +r.dataset.n; move(); } });
res.addEventListener('click', e => { const r = e.target.closest('.r'); if (r) pick(items[+r.dataset.n].r); });
cmd.addEventListener('pointerdown', e => { if (e.target === cmd) cancel(); });
addEventListener('keydown', e => {
  if (window.SETUP && window.SETUP.isOpen()) return window.SETUP.key(e);
  if (window.SHEETS && window.SHEETS.isOpen()) return window.SHEETS.key(e);
  if (window.PANELS && window.PANELS.isOpen()) return window.PANELS.key(e);
  if (!D) return;
  if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; move(); }
  else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) pick(it.r); else if (q.value.trim() && D.mode !== 'prompt') pick({ kind: 'url', value: q.value.trim(), mode: D.mode }); }
});

/* ---------- drag a tab out to split: drop zones + the tab riding the cursor ---------- */
const dragEl = $('#drag'), zonesEl = $('#zones'), ghost = $('#ghost'), dim = $('#dim');
let L = null, gx = -999, gy = -999, tilt = 0, lastX = 0, raf = 0, hot = null;
const minis = id => ({ splitL: '<b class="me"></b><b></b>', splitR: '<b></b><b class="me"></b>', replace: '<b class="me" style="flex:1"></b>', replaceA: '<b class="me"></b><b></b>', replaceB: '<b></b><b class="me"></b>' }[id]);
function loop() {
  raf = requestAnimationFrame(loop);
  const vx = gx - lastX; lastX = gx;
  tilt += (Math.max(-6, Math.min(6, vx * .5)) - tilt) * .22;
  ghost.style.transform = `translate(${gx - 28}px,${gy - 22}px) rotate(${tilt}deg)`;
}
B.onDrag(m => {
  if (m.type === 'start') {
    L = m.layout; applyTheme(m.theme, m.pal); hot = null;
    const t = m.tab; ghost.innerHTML = `${favHTML(t)}<span class="t">${esc(t.title)}</span>`;
    const s = L ? L.stage : { x: 0, y: 0, w: 0, h: 0 };
    dim.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
    zonesEl.innerHTML = zones(L).map((z, i) => `<div class="zone" data-id="${z.id}" style="--i:${i};--r:${(i % 2 ? 1 : -1) * .6}deg;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px"><div class="mini">${minis(z.id)}</div><div class="zl">${z.label}</div></div>`).join('');
    gx = -999; gy = -999; lastX = -999; dragEl.classList.add('on');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  } else if (m.type === 'move') {
    gx = m.x; gy = m.y;
    const z = zoneAt(L, m.x, m.y), id = z ? z.id : null;
    if (id !== hot) { hot = id; zonesEl.querySelectorAll('.zone').forEach(e => e.classList.toggle('hot', e.dataset.id === id)); }
  } else if (m.type === 'end') { dragEl.classList.remove('on'); cancelAnimationFrame(raf); }
});

/* ---------- effects ---------- */
let toastT;
B.onFx(f => {
  if (f.type === 'toast') {
    $('#toastTxt').textContent = f.text;
    const btn = $('#toastBtn'), a = f.action || (f.reveal ? { label: 'Show in Finder', cmd: 'reveal', path: f.reveal } : null);
    btn.hidden = !a; if (a) { btn.textContent = a.label; btn.onclick = () => { toast.classList.remove('on'); B.toastAct(a); }; }
    toast.classList.toggle('short', !!f.short);
    toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), f.short ? 1400 : a ? 5800 : 3800);
  }
});

B.onOverlayClosed(() => { close(); window.PANELS.closeAll(); window.SHEETS.close(true); });
