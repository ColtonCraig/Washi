'use strict';
/* Washi's new tab: a hello in handwriting, the time and date, one search box (your browser's own search engine, or
   type an address), your apps as paper tiles (edit to add or remove), a sticky note that stays on every new tab,
   and the Washi look (light/dark, paper, tape color, grain, Scrapbook, animations) behind the gear. */
const W = window.WASHI, $ = s => document.querySelector(s), esc = W.esc;
const DEFAULT_APPS = [
  { name: 'Gmail', url: 'https://mail.google.com/' }, { name: 'Calendar', url: 'https://calendar.google.com/' }, { name: 'Drive', url: 'https://drive.google.com/' },
  { name: 'GitHub', url: 'https://github.com/' }, { name: 'Notion', url: 'https://www.notion.so/' }, { name: 'Slack', url: 'https://app.slack.com/' }, { name: 'YouTube', url: 'https://www.youtube.com/' }
];
const STICK = ['#ff6a3d', '#3d63ff', '#ff3d8d', '#1f9d57', '#0e9f9f', '#7b46ff', '#74b000', '#e89a00'];
let apps = [], editing = false;

/* ---------- hello, time and date ---------- */
function tick() {
  const d = new Date(), h = d.getHours(), name = (W.look.name || '').trim();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Still up';
  $('#greet').textContent = part + (name ? ', ' + name : '');
  $('#date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ---------- search: an address goes straight there, anything else to your browser's search engine ---------- */
/* a bare address gets https://, except this Mac's own servers (localhost, 127.0.0.1), which are plain http */
const withScheme = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : (/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(v) ? 'http://' : 'https://') + v;
const looksLikeURL = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || (/^[^\s]+\.[a-z]{2,}(?::\d+)?(\/\S*)?$/i.test(v) && !/\s/.test(v)) || /^localhost(:\d+)?(\/\S*)?$/i.test(v);
$('#search').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#q').value.trim(); if (!v) return;
  if (looksLikeURL(v)) { location.href = withScheme(v); return; }
  if (chrome.search && chrome.search.query) chrome.search.query({ text: v, disposition: 'CURRENT_TAB' });
  else location.href = 'https://www.google.com/search?q=' + encodeURIComponent(v);
});

/* ---------- apps ---------- */
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const favURL = u => { const f = new URL(chrome.runtime.getURL('/_favicon/')); f.searchParams.set('pageUrl', u); f.searchParams.set('size', '64'); return f.toString(); };
const sig = img => { try { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16); return c.toDataURL(); } catch { return ''; } };
let globeP = null;
const globe = () => globeP || (globeP = new Promise(r => { const i = new Image(); i.onload = () => r(sig(i)); i.onerror = () => r(''); i.src = favURL('https://washi-never-visited.invalid/'); }));
const colorOf = s => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return STICK[n % STICK.length]; };
function drawApps() {
  const box = $('#apps'); box.innerHTML = '';
  apps.forEach((a, i) => {
    const el = document.createElement('a'); el.className = 'app'; el.href = a.url; el.title = a.url;
    el.innerHTML = `<span class="ico"><img alt="" src="${esc(favURL(a.url))}"></span><b>${esc(a.name)}</b><button class="x" aria-label="Remove ${esc(a.name)}" title="Remove"><svg class="i"><use href="#i-close"/></svg></button>`;
    const img = el.querySelector('img');
    const letter = () => { const s = el.querySelector('.ico'); s.textContent = (a.name || host(a.url) || '?').trim()[0].toUpperCase(); s.style.background = colorOf(host(a.url) || a.name); };
    img.addEventListener('error', letter, { once: true });
    /* the browser answers a grey globe for a site it has never seen: a colored letter looks better */
    img.addEventListener('load', async () => { const g = await globe(); if (g && sig(img) === g) letter(); }, { once: true });
    el.querySelector('.x').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); remove(i, el); });
    el.addEventListener('click', e => { if (editing) e.preventDefault(); });
    box.append(el);
  });
  const add = document.createElement('button'); add.className = 'app add'; add.innerHTML = '<svg class="i"><use href="#i-plus"/></svg><b>Add an app</b>';
  add.addEventListener('click', openAdd); box.append(add);
}
function remove(i, el) {
  const done = () => { apps.splice(i, 1); saveApps(); drawApps(); };
  if (W.calm()) return done();
  el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.6) rotate(-8deg)', opacity: 0 }], { duration: 180, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).onfinish = done;
}
function openAdd() {
  if ($('#addf')) return $('#addf input').focus();
  const f = document.createElement('form'); f.id = 'addf';
  f.innerHTML = '<input name="u" placeholder="Address, like linear.app" aria-label="Address" spellcheck="false"><input name="n" placeholder="Name (optional)" aria-label="Name"><button class="btn primary" type="submit">Add</button><button class="btn" type="button" data-a="cancel">Cancel</button><p class="err" hidden></p>';
  $('#apps').append(f); f.querySelector('input').focus();
  f.querySelector('[data-a=cancel]').addEventListener('click', () => f.remove());
  f.addEventListener('submit', e => {
    e.preventDefault(); let u = f.u.value.trim(); const err = f.querySelector('.err');
    if (!u) { err.hidden = false; err.textContent = 'Type the site\'s address.'; return; }
    u = withScheme(u);
    let ok = false; try { ok = /\./.test(new URL(u).hostname) || new URL(u).hostname === 'localhost'; } catch {}
    if (!ok) { err.hidden = false; err.textContent = 'That doesn\'t look like a web address.'; return; }
    const h = host(u), name = f.n.value.trim() || h.split('.').slice(-2, -1)[0].replace(/^./, c => c.toUpperCase()) || h;
    apps.push({ name: name.slice(0, 40), url: u }); saveApps(); drawApps(); openAdd();
  });
}
const saveApps = () => chrome.storage.local.set({ apps });
function setEditing(on) {
  editing = on; document.body.classList.toggle('editing', on); $('#edit').classList.toggle('on', on);
  $('#edit').title = on ? 'Done editing' : 'Edit your apps'; $('#edit').setAttribute('aria-label', $('#edit').title);
  $('#edit').innerHTML = on ? '<svg class="i"><use href="#i-check"/></svg>' : '<svg class="i"><use href="#i-pen"/></svg>';
  if (!on && $('#addf')) $('#addf').remove();
}
$('#edit').addEventListener('click', () => setEditing(!editing));

/* ---------- the note ---------- */
let noteT = 0;
$('#ntx').addEventListener('input', () => { clearTimeout(noteT); noteT = setTimeout(() => chrome.storage.local.set({ ntNote: $('#ntx').value.slice(0, 20000) }), 300); });

/* ---------- the look ---------- */
function drawLook() {
  const L = W.look, c = W.colors(), box = $('#look'), dark = c.dark;
  const list = W.PRESETS[dark ? 'dark' : 'light'];
  box.innerHTML = `<h3>Washi look</h3>
    <div><p class="lbl">Appearance</p><div class="seg" role="radiogroup">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match my Mac']].map(([v, n]) => `<button role="radio" data-mode="${v}" class="${L.mode === v ? 'on' : ''}" aria-checked="${L.mode === v}">${n}</button>`).join('')}</div></div>
    <div><p class="lbl">Paper and ink (${dark ? 'dark' : 'light'})</p><div class="papers">${list.map(p => `<button class="pz${(L[dark ? 'dark' : 'light']) === p.id ? ' on' : ''}" data-paper="${p.id}" aria-label="${p.n}"><i style="background:${p.paper};color:${p.ink}">Aa</i>${p.n}</button>`).join('')}</div></div>
    <div><p class="lbl">Tape color</p><div class="dots">${Object.entries(W.PAL).map(([k, p]) => `<button class="dot${+L.color === +k ? ' on' : ''}" data-color="${k}" style="background:${p.tape}" aria-label="${p.n}" title="${p.n}"></button>`).join('')}</div></div>
    <div><p class="lbl">Feel</p>${[['texture', 'Paper texture', 'The grain on every scrap'], ['scrapbook', 'Scrapbook', 'Tape, tilted scraps, more paper'], ['motion', 'Animations', 'Turn off for a calmer, instant page']].map(([k, n, s]) => `<div class="row" style="margin-top:8px"><span class="t"><b>${n}</b><small>${s}</small></span><button class="sw${L[k] ? ' on' : ''}" role="switch" aria-checked="${!!L[k]}" aria-label="${n}" data-sw="${k}"></button></div>`).join('')}</div>
    <div><p class="lbl">Your name</p><input id="nm" placeholder="For the hello (optional)" value="${esc(L.name || '')}" maxlength="40"></div>`;
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => W.save({ mode: b.dataset.mode }));
  box.querySelectorAll('[data-paper]').forEach(b => b.onclick = () => W.save({ [W.colors().dark ? 'dark' : 'light']: b.dataset.paper }));
  box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => W.save({ color: +b.dataset.color }));
  box.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => W.save({ [b.dataset.sw]: !W.look[b.dataset.sw] }));
  let nmT = 0; $('#nm').addEventListener('input', e => { clearTimeout(nmT); const v = e.target.value; nmT = setTimeout(() => { W.save({ name: v.trim().slice(0, 40) }); }, 250); });
}
function toggleLook(on) {
  const box = $('#look'); on = on === undefined ? box.hidden : on;
  if (on) { drawLook(); box.hidden = false; $('#gear').classList.add('on'); }
  else { box.hidden = true; $('#gear').classList.remove('on'); }
}
$('#gear').addEventListener('click', e => { e.stopPropagation(); toggleLook(); });
document.addEventListener('click', e => { if (!e.target.isConnected) return; if (!$('#look').hidden && !e.target.closest('#look,#gear')) toggleLook(false); });   // (a click inside redraws the card: its button is gone by now, and that's not a click outside)
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#look').hidden) toggleLook(false); else if (editing) setEditing(false); } });
W.onChange(() => { tick(); if (!$('#look').hidden && !document.activeElement.matches('#nm')) drawLook(); });

/* ---------- start ---------- */
(async () => {
  W.sprite();
  await W.load(); W.apply(); tick(); setInterval(tick, 15000);
  const o = await chrome.storage.local.get(['apps', 'ntNote']);
  apps = Array.isArray(o.apps) ? o.apps : DEFAULT_APPS.slice(); drawApps();
  $('#ntx').value = o.ntNote || '';
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.apps && !editing) { apps = ch.apps.newValue || []; drawApps(); }
    if (ch.ntNote && document.activeElement !== $('#ntx')) $('#ntx').value = ch.ntNote.newValue || '';
  });
  $('#q').focus();
})();
