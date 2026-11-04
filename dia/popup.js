'use strict';
/* The Washi button: Reader (the article on a sheet of Washi paper), Snapshot (copied, and saved to Downloads), and a
   sticky note for this site that's there every time you come back. */
const W = window.WASHI, $ = s => document.querySelector(s), esc = W.esc;
let tab = null, host = '';
const usable = u => /^https?:/.test(u || '') && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(u);
function say(t, ok) { const s = $('#say'); if (!s) return; s.textContent = t; s.className = ok ? 'ok' : ''; clearTimeout(say.t); say.t = setTimeout(() => { s.textContent = ''; }, 3500); }

function draw(note) {
  $('#body').innerHTML = `
    <div class="tools">
      <button class="tool" id="reader"><svg class="i"><use href="#i-reader"/></svg>Reader</button>
      <button class="tool" id="snap"><svg class="i"><use href="#i-camera"/></svg>Snapshot</button>
      <button class="tool" id="notebtn" aria-expanded="false"><svg class="i"><use href="#i-note"/></svg>Note</button>
    </div>
    <div class="sec" id="notesec" hidden><p class="lbl">A note for ${esc(host)}</p><textarea id="note" placeholder="Jot something down: it stays with this site."></textarea></div>
    <div class="foot"><span id="say"></span><span class="fill"></span><small class="keys">Reader: ⌥⇧R</small></div>`;
  $('#reader').onclick = reader; $('#snap').onclick = snap; $('#notebtn').onclick = () => toggleNote();
  if (note) toggleNote(true, note);
}
async function reader() {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['theme.js', 'vendor/Readability.js', 'vendor/Readability-readerable.js', 'reader-cs.js'] });
  window.close();
}
async function snap() {
  const b = $('#snap'); b.disabled = true;
  try {
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    let copied = false;
    try { const blob = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } catch {}
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    await chrome.downloads.download({ url, filename: `Snapshot ${host} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`, saveAs: false });
    say(copied ? 'Copied, and saved to Downloads' : 'Saved to Downloads', true);
    if (!W.calm()) b.animate([{ transform: 'scale(.9) rotate(-3deg)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  } catch { say('Couldn\'t take a snapshot of this page'); }
  finally { b.disabled = false; }
}
let noteT = 0;
async function toggleNote(force, value) {
  const sec = $('#notesec'), on = force !== undefined ? force : sec.hidden;
  sec.hidden = !on; $('#notebtn').classList.toggle('on', on); $('#notebtn').setAttribute('aria-expanded', String(on));
  if (!on) return;
  if (!W.calm()) sec.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.215,.61,.355,1)' });
  const ta = $('#note');
  if (value !== undefined) ta.value = value; else { const o = await chrome.storage.local.get('notes'); ta.value = (o.notes || {})[host] || ''; ta.focus(); }
  ta.oninput = () => { clearTimeout(noteT); noteT = setTimeout(async () => { const o = await chrome.storage.local.get('notes'), n = o.notes || {}; const v = ta.value.slice(0, 20000); if (v.trim()) n[host] = v; else delete n[host]; await chrome.storage.local.set({ notes: n }); }, 300); };
}

(async () => {
  W.sprite(); await W.load(); W.apply();
  const want = +new URLSearchParams(location.search).get('tab');          // (tests open the popup as a page, for a given tab)
  tab = want ? await chrome.tabs.get(want) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  $('#host').textContent = host || 'This page';
  const fav = $('#fav'); if (tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl)) fav.innerHTML = `<img alt="" src="${esc(tab.favIconUrl)}">`; else { fav.textContent = (host || 'W')[0].toUpperCase(); fav.style.background = 'var(--tape)'; }
  if (!usable(tab.url)) {
    $('#sub').textContent = 'Washi';
    $('#body').innerHTML = '<p class="nope">This is one of the browser\'s own pages, so Washi can\'t read or snap it. Open a website and try again.</p>';
    return;
  }
  $('#sub').textContent = tab.title ? tab.title.slice(0, 80) : 'Washi';
  const o = await chrome.storage.local.get('notes');
  draw((o.notes || {})[host]);
})();
