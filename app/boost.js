'use strict';
/* Boosts: make a site look the way you like. Per website (by host name): a colour tint, a font, things you've
   zapped (hidden) and your own CSS. Applied as a user stylesheet every time a page of that site loads.
   No scripts run on your behalf except the zap picker you start yourself, in an isolated world the page can't see. */
const store = require('./store');

let boosts = store.readJSON('boosts.json', {});
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => store.writeJSON('boosts.json', boosts), 300); };

const hostOf = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.hostname.replace(/^www\./, '') : ''; } catch { return ''; } };
const TINTS = {
  warm: 'sepia(.25) saturate(1.1) hue-rotate(-8deg)',
  cool: 'hue-rotate(16deg) saturate(.9) brightness(1.02)',
  soft: 'contrast(.88) saturate(.8) brightness(1.04)',
  gray: 'grayscale(1)',
  dark: 'invert(.9) hue-rotate(180deg)'
};
const FONTS = {
  sans: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',system-ui,sans-serif",
  serif: "'New York','Iowan Old Style',Charter,Georgia,serif",
  rounded: "ui-rounded,'SF Pro Rounded',-apple-system,system-ui,sans-serif",
  mono: "ui-monospace,'SF Mono',Menlo,monospace"
};
const MAX_CSS = 20000;
const okSel = s => typeof s === 'string' && s.length < 600 && !/[{}<;]/.test(s);

/* Every boost stylesheet is scoped to a version mark on <html>. Electron can't reliably take an inserted stylesheet
   back out, so changing a boost adds a new version and moves the mark: the old stylesheet simply stops matching. */
function cssFor(b, v = 'v') {
  if (!b || !b.on) return '';
  let out = '';
  if (TINTS[b.tint]) {
    out += `filter:${TINTS[b.tint]} !important;\n`;
    if (b.tint === 'dark') out += 'img,video,picture,canvas,embed,object,iframe{filter:invert(1) hue-rotate(180deg) !important}\n';   // photos stay photos
  }
  /* icon fonts are left alone so buttons keep their symbols */
  if (FONTS[b.font]) out += `body,body :not(i):not(code):not(pre):not(kbd):not(samp):not(svg):not([class*="icon" i]):not([class*="fa-"]):not([class*="symbol" i]):not([aria-hidden="true"]){font-family:${FONTS[b.font]} !important}\n`;
  for (const z of b.zaps || []) if (okSel(z)) out += `${z}{display:none !important}\n`;
  if (b.css) out += String(b.css).slice(0, MAX_CSS).replace(/(^|[},])\s*(html|:root)(?=[\s{,:.[#>~+]|$)/g, '$1 &') + '\n';   // "html { … }" means the page itself
  return out ? `:root[data-washi-boost="${v}"]{\n${out}}` : '';
}
const get = host => boosts[host] || null;
const isOn = u => { const b = get(hostOf(u)); return !!(b && b.on && cssFor(b)); };
function set(host, patch) {
  if (!host) return null;
  const b = { on: true, tint: 'none', font: 'site', zaps: [], css: '', ...(boosts[host] || {}) };
  for (const k of ['on', 'tint', 'font', 'css']) if (patch[k] !== undefined) b[k] = k === 'on' ? !!patch.on : String(patch[k]).slice(0, MAX_CSS);
  if (patch.addZap && okSel(patch.addZap) && !b.zaps.includes(patch.addZap)) b.zaps.push(patch.addZap);
  if (patch.undoZap) b.zaps.pop();
  if (patch.clearZaps) b.zaps = [];
  if (patch.reset) { delete boosts[host]; save(); return null; }
  boosts[host] = b; save(); return b;
}

/* keep each page's boost stylesheet up to date */
const chains = new Map(); let ver = 0;                      // one update at a time per page
const mark = (wc, v) => wc.executeJavaScriptInIsolatedWorld(1008, [{ code: `document.documentElement && document.documentElement.setAttribute('data-washi-boost', ${JSON.stringify(String(v))})` }]).catch(() => {});
function apply(wc) {
  if (!wc || wc.isDestroyed()) return Promise.resolve();
  const id = wc.id, run = (chains.get(id) || Promise.resolve()).then(async () => {
    if (wc.isDestroyed()) return;
    const v = 'b' + (++ver), css = cssFor(get(hostOf(wc.getURL())), v);
    if (css) { try { await wc.insertCSS(css, { cssOrigin: 'user' }); } catch {} }
    if (!wc.isDestroyed()) await mark(wc, css ? v : 'off');
  });
  chains.set(id, run.catch(() => {}));
  return run;
}
function watch(wc) {
  const go = () => apply(wc);
  wc.on('did-navigate', go); wc.on('dom-ready', go);
  const id = wc.id; wc.once('destroyed', () => chains.delete(id));
}

/* the zap picker: highlights what's under the pointer; a click returns a CSS selector for it, esc returns null */
const PICKER = `(() => new Promise(resolve => {
  const host = document.createElement('washi-zap'), root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>.b{position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ff6a3d;background:rgba(255,106,61,.14);border-radius:5px;transition:all .06s;display:none}' +
    '.r{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;padding:7px 7px 7px 14px;border-radius:12px;background:#fbf6ea;color:#2b2118;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 0 0 1px rgba(43,33,24,.1),0 10px 30px rgba(43,33,24,.25)}' +
    'button{all:unset;cursor:default;padding:6px 12px;border-radius:8px;background:#ff6a3d;color:#fff;font:600 12.5px -apple-system,system-ui,sans-serif}</style>' +
    '<div class="b"></div><div class="r">Click anything to hide it<button>Done</button></div>';
  document.documentElement.append(host);
  const box = root.querySelector('.b'); let cur = null;
  const inside = e => e.composedPath().includes(host);
  const move = e => { if (inside(e)) { box.style.display = 'none'; cur = null; return; } const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || el === host || el === document.documentElement || el === document.body) { box.style.display = 'none'; cur = null; return; }
    cur = el; const r = el.getBoundingClientRect(); Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); };
  const stop = e => { if (!inside(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  const esc = CSS.escape, uniq = s => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const goodId = id => id && !/\\d{3,}|[a-f0-9]{10,}|^(ember|react|radix|headlessui)|[:]/i.test(id);
  const goodClass = c => c && c.length < 40 && !/\\d{2,}|[A-Z0-9]{6,}|__|^(css|sc|jsx|svelte|emotion)-|^_/.test(c);
  const part = e => { if (goodId(e.id)) return '#' + esc(e.id); let s = e.tagName.toLowerCase(); const cl = [...e.classList].filter(goodClass).slice(0, 3); if (cl.length) s += cl.map(c => '.' + esc(c)).join(''); return s; };
  const selectorFor = el => {
    const path = []; let e = el;
    while (e && e !== document.documentElement && path.length < 12) {
      let p = part(e);
      if (p[0] === '#') { path.unshift(p); if (uniq(path.join(' > '))) return path.join(' > '); }
      else { const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : []; if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')'; path.unshift(p); if (uniq(path.join(' > '))) return path.join(' > '); }
      e = e.parentElement;
    }
    return uniq(path.join(' > ')) ? path.join(' > ') : null;
  };
  const done = v => { removeEventListener('mousemove', move, true); for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'auxclick', 'dblclick']) removeEventListener(t, stop, true); removeEventListener('click', pick, true); removeEventListener('keydown', key, true); host.remove(); resolve(v); };
  const pick = e => { if (inside(e)) return; stop(e); if (!cur) return; done({ sel: selectorFor(cur) }); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
  root.querySelector('button').addEventListener('click', ev => { ev.stopPropagation(); done(null); });
  addEventListener('mousemove', move, true); addEventListener('click', pick, true);
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'auxclick', 'dblclick']) addEventListener(t, stop, true);
  addEventListener('keydown', key, true);
}))()`;
async function zap(wc, onEach) {
  let n = 0;
  for (let i = 0; i < 60 && wc && !wc.isDestroyed(); i++) {
    const host = hostOf(wc.getURL()); if (!host) break;
    let r; try { r = await wc.executeJavaScriptInIsolatedWorld(1009, [{ code: PICKER }], true); } catch { break; }
    if (!r) break;
    if (r.sel) { set(host, { on: true, addZap: r.sel }); await apply(wc); n++; onEach && onEach(n); }
  }
  return n;
}
module.exports = { hostOf, get, set, cssFor, isOn, apply, watch, zap, TINTS, FONTS, all: () => boosts };
