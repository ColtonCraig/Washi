'use strict';
/* Washi's paper look, shared by the new tab, the popup and Reader: paper and ink presets for light and dark, a tape
   color, the grain, Scrapbook tilt, and Animations off. The same values as Washi (ui/shared.js). Saved in
   chrome.storage.local under "look"; every open Washi page follows a change at once. */
(() => {
  const hx = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const PRESETS = {
    light: [{ id: 'cream', n: 'Cream', paper: '#fbf6ea', ink: '#2b2118' }, { id: 'news', n: 'Newsprint', paper: '#f1f0ea', ink: '#1d1d1b' }, { id: 'blush', n: 'Blush', paper: '#fff0ee', ink: '#3b1f2b' }, { id: 'mint', n: 'Mint', paper: '#edf9f0', ink: '#15332a' }, { id: 'sky', n: 'Sky', paper: '#eef4ff', ink: '#1b2440' }],
    dark: [{ id: 'cocoa', n: 'Cocoa', paper: '#2b2520', ink: '#f3ead8' }, { id: 'midnight', n: 'Midnight', paper: '#22273a', ink: '#e8ecff' }, { id: 'forest', n: 'Forest', paper: '#1e2a24', ink: '#e2f2e7' }, { id: 'plum', n: 'Plum', paper: '#2c2133', ink: '#f4e7ff' }, { id: 'ink', n: 'Ink', paper: '#1c1c1e', ink: '#f2f2f0' }]
  };
  const PAL = {
    40: { n: 'Tangerine', desk: '#fdd3ae', tape: '#ff6a3d', s2: '#ffd84d' }, 255: { n: 'Blueberry', desk: '#cbd9f6', tape: '#3d63ff', s2: '#ffd84d' },
    340: { n: 'Bubblegum', desk: '#fdd1dc', tape: '#ff3d8d', s2: '#7fe0c9' }, 150: { n: 'Clover', desk: '#d2eec6', tape: '#1f9d57', s2: '#ffe14d' },
    200: { n: 'Lagoon', desk: '#c6ede6', tape: '#0e9f9f', s2: '#ff9370' }, 300: { n: 'Grape', desk: '#e3d2f6', tape: '#7b46ff', s2: '#ffd84d' },
    110: { n: 'Lime', desk: '#eaf3b4', tape: '#74b000', s2: '#ff7aa8' }
  };
  const DEF = { mode: 'auto', light: 'cream', dark: 'cocoa', color: 40, texture: true, scrapbook: false, motion: true, name: '' };
  const darkQ = matchMedia('(prefers-color-scheme: dark)');
  const isDark = l => l.mode === 'dark' || (l.mode === 'auto' && darkQ.matches);
  let look = { ...DEF };
  function colors(l = look) {
    const dark = isDark(l), list = PRESETS[dark ? 'dark' : 'light'], pr = list.find(x => x.id === l[dark ? 'dark' : 'light']) || list[0], pal = PAL[l.color] || PAL[40];
    const paper = pr.paper, ink = pr.ink, white = dark ? mix(paper, '#ffffff', .08) : mix(paper, '#ffffff', .72);
    return { dark, paper, ink, white, pal, desk: dark ? mix(pal.desk, '#120e0b', .7) : pal.desk };
  }
  function apply(el = document.documentElement) {
    const c = colors();
    const v = { '--ink': c.ink, '--inkc': hx(c.ink).join(' '), '--paper': c.paper, '--paper2': mix(c.paper, c.ink, .07), '--white': c.white, '--whc': hx(c.white).join(' '),
      '--sh': c.dark ? '0 0 0' : hx(c.ink).join(' '), '--desk': c.desk, '--tape': c.pal.tape, '--s2': c.pal.s2,
      '--grain': look.texture ? `url(${chrome.runtime.getURL(c.dark ? 'grain-dark.png' : 'grain.png')})` : 'none', 'color-scheme': c.dark ? 'dark' : 'light' };
    for (const k in v) el.style.setProperty(k, v[k]);
    el.classList.toggle('dark', c.dark); el.classList.toggle('motion-off', !look.motion); el.classList.toggle('scrapbook', !!look.scrapbook);
  }
  const listeners = new Set();
  const load = () => new Promise(r => chrome.storage.local.get('look', o => { look = { ...DEF, ...(o.look || {}) }; r(look); }));
  const save = patch => { look = { ...look, ...patch }; chrome.storage.local.set({ look }); apply(); for (const f of listeners) f(look); };
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.look) { look = { ...DEF, ...(ch.look.newValue || {}) }; apply(); for (const f of listeners) f(look); } });
  darkQ.addEventListener('change', () => { apply(); for (const f of listeners) f(look); });
  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-reload" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-pen" viewBox="0 0 24 24"><path d="M4 20l1-4.5L16 4.5a2 2 0 0 1 3 3L8 18.5zM14 7l3 3"/></symbol>
<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></symbol>
<symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></symbol>
<symbol id="i-reader" viewBox="0 0 24 24"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/></symbol>
<symbol id="i-note" viewBox="0 0 24 24"><path d="M5 4h14v11l-5 5H5zM14 20v-5h5M8.5 9h7M8.5 12.5h4"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2L18.5 7.8"/></symbol>
<symbol id="i-focus" viewBox="0 0 24 24"><path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3"/><circle cx="12" cy="12" r="2.4"/></symbol>
<symbol id="i-expand" viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></symbol>
<symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/></symbol>
<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.8l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/></symbol>
<symbol id="i-camera" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></symbol>
</defs></svg>`;
  const ic = (n, s) => `<svg class="i" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}><use href="#i-${n}"/></svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const calm = () => !look.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.WASHI = { PRESETS, PAL, DEF, colors, apply, load, save, get look() { return look; }, onChange: f => listeners.add(f), SPRITE, ic, esc, mix, calm,
    sprite() { document.body.insertAdjacentHTML('afterbegin', SPRITE); } };
})();
