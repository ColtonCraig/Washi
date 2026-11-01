'use strict';
/* The toolbar of a little scrap window. The page itself is a separate view below it, owned by the main process. */
const B = window.washi;
BL.setup();
const $ = s => document.querySelector(s);
const q = $('#q'), bar = $('#bar');
if (!/Mac/.test(navigator.platform)) $('#lights').hidden = true;      // traffic lights only exist on the Mac
let I = { url: '', title: '', search: 'https://www.google.com/search?q=%s' };
const toURL = v => {
  v = v.trim(); if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(v) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(v)) return 'http://' + v;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(v)) return 'https://' + v;
  const b = BL.bang(v); if (b) return b.url;
  return I.search.replace('%s', encodeURIComponent(v));
};
const show = () => { if (document.activeElement !== q) q.value = I.url ? I.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : ''; };
B.onScrapInfo(i => {
  I = { ...I, ...i };
  if (i.look) BL.applyTheme(i.look.theme, i.look.pal);
  document.title = i.title || 'Little scrap';
  $('#back').disabled = !i.canBack; $('#fwd').disabled = !i.canFwd; $('#keep').disabled = !/^https?:/.test(i.url || '');
  bar.classList.toggle('loading', !!i.loading); show();
});
B.onScrapFocus(() => { q.focus(); q.select(); });
q.addEventListener('focus', () => { q.value = I.url || ''; requestAnimationFrame(() => q.select()); });
q.addEventListener('blur', show);
q.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); q.value = I.url || ''; q.blur(); } });
$('#form').addEventListener('submit', e => { e.preventDefault(); const u = toURL(q.value); if (u) { B.scrapAct({ type: 'go', url: u }); q.blur(); } });
$('#back').onclick = () => B.scrapAct({ type: 'back' });
$('#fwd').onclick = () => B.scrapAct({ type: 'forward' });
$('#reload').onclick = () => B.scrapAct({ type: 'reload' });
$('#keep').onclick = () => B.scrapAct({ type: 'adopt' });
