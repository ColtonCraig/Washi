'use strict';
(() => {
  /* One palette per space. Keys are the saved hue numbers, so older saved spaces keep working. */
  const PAL = {
    40: { n: 'Tangerine', desk: '#ffb77c', tape: '#ff6a3d', s2: '#ffd84d' },
    255: { n: 'Blueberry', desk: '#a3c1ff', tape: '#3d63ff', s2: '#ffd84d' },
    340: { n: 'Bubblegum', desk: '#ffb3d1', tape: '#ff3d8d', s2: '#7fe0c9' },
    150: { n: 'Clover', desk: '#b0e8a8', tape: '#1f9d57', s2: '#ffe14d' },
    200: { n: 'Lagoon', desk: '#9ae6e2', tape: '#0e9f9f', s2: '#ff9370' },
    300: { n: 'Grape', desk: '#d0b5ff', tape: '#7b46ff', s2: '#ffd84d' },
    110: { n: 'Lime', desk: '#dcf088', tape: '#74b000', s2: '#ff7aa8' }
  };
  const STICK = ['#ff6a3d', '#3d63ff', '#ff3d8d', '#1f9d57', '#0e9f9f', '#7b46ff', '#74b000', '#e89a00'];
  const palOf = h => PAL[h] || PAL[40];
  const applyPal = (h, el = document.documentElement) => { const p = palOf(h); el.style.setProperty('--desk', p.desk); el.style.setProperty('--tape', p.tape); el.style.setProperty('--s2', p.s2); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hostOf = u => { try { return new URL(u).host.replace(/^www\./, '') || u; } catch { return u || ''; } };
  const hueOf = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const chip = url => STICK[hueOf(hostOf(url)) % STICK.length];
  const rot = id => (((hueOf(id) % 23) / 23) - 0.5) * 2.2;      // stable little tilt per tab, in degrees

  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="i-fwd" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></symbol>
<symbol id="i-reload" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-sidebar" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></symbol>
<symbol id="i-split" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="6" y="11" width="12" height="9" rx="2.5"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/></symbol>
<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
<symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
<symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/></symbol>
<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></symbol>
<symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4.5M12 17.6v.1"/></symbol>
<symbol id="i-mute" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM16 9.5l5 5M21 9.5l-5 5"/></symbol>
<symbol id="i-sound" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></symbol>
<symbol id="i-expand" viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>
<symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/></symbol>
<symbol id="i-folderopen" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H7.5L5 19H5a2 2 0 0 1-2-2zM7.5 10H22l-2.8 9H5z"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
</defs></svg>`;
  const ic = (n, s, c) => `<svg class="i${c ? ' ' + c : ''}" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}><use href="#i-${n}"/></svg>`;

  const favHTML = t => {
    const l = ((t.title || hostOf(t.url) || '•')[0] || '•').toUpperCase(), c = chip(t.url || '');
    return t.fav ? `<span class="fav img" data-l="${esc(l)}" data-c="${c}"><img src="${esc(t.fav)}" alt=""></span>` : `<span class="fav" style="background:${c}">${esc(l)}</span>`;
  };
  const favFix = () => document.addEventListener('error', e => {
    const im = e.target; if (im.tagName !== 'IMG') return; const f = im.closest('.fav'); if (!f) return;
    f.className = 'fav'; f.textContent = f.dataset.l || '•'; f.style.background = f.dataset.c || '#ff6a3d';
  }, true);

  /* damped-spring curves sampled into CSS linear() easings */
  function spring(k, c) {
    const w = Math.sqrt(k), z = c / (2 * w), wd = w * Math.sqrt(Math.max(1 - z * z, 1e-6));
    const f = t => z < 1 ? 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)) : 1 - Math.exp(-w * t) * (1 + w * t);
    let T = 0; for (let t = 0; t < 3; t += .01) if (Math.abs(1 - f(t)) > .004) T = t; T += .02;
    const n = 40, p = []; for (let i = 0; i <= n; i++) p.push(i === n ? 1 : +f(T * i / n).toFixed(4));
    return { css: `linear(${p.join(',')})`, ms: Math.round(T * 1000) };
  }
  const SP = { css: 'cubic-bezier(.34,1.45,.64,1)', ms: 520 };
  function setup() {
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
    try { const s = spring(460, 21); SP.css = s.css; SP.ms = s.ms; document.documentElement.style.setProperty('--spring', s.css); document.documentElement.style.setProperty('--spring-ms', s.ms + 'ms'); } catch {}
    favFix();
  }


  /* ---------- theme: light/dark, paper + ink, per-space colors, texture, tilt, motion ---------- */
  const hx = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hx(a), Bc = hx(b); return toHex(A.map((v, i) => v + (Bc[i] - v) * t)); };
  const PRESETS = {
    light: [{ id: 'cream', n: 'Cream', paper: '#fbf6ea', ink: '#2b2118' }, { id: 'news', n: 'Newsprint', paper: '#f1f0ea', ink: '#1d1d1b' }, { id: 'blush', n: 'Blush', paper: '#fff0ee', ink: '#3b1f2b' }, { id: 'mint', n: 'Mint', paper: '#edf9f0', ink: '#15332a' }, { id: 'sky', n: 'Sky', paper: '#eef4ff', ink: '#1b2440' }],
    dark: [{ id: 'cocoa', n: 'Cocoa', paper: '#2b2520', ink: '#f3ead8' }, { id: 'midnight', n: 'Midnight', paper: '#22273a', ink: '#e8ecff' }, { id: 'forest', n: 'Forest', paper: '#1e2a24', ink: '#e2f2e7' }, { id: 'plum', n: 'Plum', paper: '#2c2133', ink: '#f4e7ff' }, { id: 'ink', n: 'Ink', paper: '#1c1c1e', ink: '#f2f2f0' }]
  };
  const DEF = { done: false, mode: 'light', light: { preset: 'cream', paper: '', ink: '' }, dark: { preset: 'cocoa', paper: '', ink: '' }, texture: true, wobble: true, motion: true,
    search: 'google', customSearch: '', startup: 'restore', home: '', gpc: true, askDownload: false,
    blocking: 'standard', httpsFirst: true, safety: true, dns: 'auto', clearOnExit: false, suggest: true,
    archive: 0, sleep: 60, autoPip: true, keys: {} };
  const prefsOf = p => { p = p || {}; return { ...DEF, ...p, light: { ...DEF.light, ...(p.light || {}) }, dark: { ...DEF.dark, ...(p.dark || {}) }, keys: { ...(p.keys || {}) } }; };
  const ENGINES = [
    { id: 'google', n: 'Google', url: 'https://www.google.com/search?q=%s' }, { id: 'duckduckgo', n: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { id: 'brave', n: 'Brave Search', url: 'https://search.brave.com/search?q=%s' }, { id: 'bing', n: 'Bing', url: 'https://www.bing.com/search?q=%s' },
    { id: 'ecosia', n: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' }, { id: 'startpage', n: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
    { id: 'yahoo', n: 'Yahoo', url: 'https://search.yahoo.com/search?p=%s' }
  ];
  /* search suggestions for the command bar, per engine (OpenSearch JSON: [query, [suggestions]]) */
  const SUGGEST = { google: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s', duckduckgo: 'https://duckduckgo.com/ac/?q=%s&type=list', brave: 'https://search.brave.com/api/suggest?q=%s',
    bing: 'https://api.bing.com/osjson.aspx?query=%s', ecosia: 'https://ac.ecosia.org/autocomplete?q=%s&type=list', startpage: 'https://www.startpage.com/suggestions?q=%s&format=opensearch', yahoo: 'https://search.yahoo.com/sugg/os?command=%s&output=fxjson' };
  const suggestTpl = p => p.suggest ? (SUGGEST[p.search] || null) : null;
  /* !bangs: type "!yt cats" (or "cats !yt") to search a site directly */
  const BANGS = { g: ['Google', 'https://www.google.com/search?q=%s'], ddg: ['DuckDuckGo', 'https://duckduckgo.com/?q=%s'], b: ['Bing', 'https://www.bing.com/search?q=%s'], br: ['Brave Search', 'https://search.brave.com/search?q=%s'],
    yt: ['YouTube', 'https://www.youtube.com/results?search_query=%s'], w: ['Wikipedia', 'https://en.wikipedia.org/w/index.php?search=%s'], gh: ['GitHub', 'https://github.com/search?q=%s'], r: ['Reddit', 'https://www.reddit.com/search/?q=%s'],
    a: ['Amazon', 'https://www.amazon.com/s?k=%s'], m: ['Google Maps', 'https://www.google.com/maps/search/%s'], maps: ['Apple Maps', 'https://maps.apple.com/?q=%s'], i: ['Google Images', 'https://www.google.com/search?tbm=isch&q=%s'],
    n: ['Google News', 'https://news.google.com/search?q=%s'], so: ['Stack Overflow', 'https://stackoverflow.com/search?q=%s'], mdn: ['MDN', 'https://developer.mozilla.org/search?q=%s'], npm: ['npm', 'https://www.npmjs.com/search?q=%s'],
    imdb: ['IMDb', 'https://www.imdb.com/find/?q=%s'], gr: ['Goodreads', 'https://www.goodreads.com/search?q=%s'], spot: ['Spotify', 'https://open.spotify.com/search/%s'], x: ['X', 'https://x.com/search?q=%s'],
    ebay: ['eBay', 'https://www.ebay.com/sch/i.html?_nkw=%s'], zillow: ['Zillow', 'https://www.zillow.com/homes/%s_rb/'], t: ['Translate', 'https://translate.google.com/?sl=auto&tl=en&text=%s'], ud: ['Urban Dictionary', 'https://www.urbandictionary.com/define.php?term=%s'],
    pplx: ['Perplexity', 'https://www.perplexity.ai/search?q=%s'], claude: ['Claude', 'https://claude.ai/new?q=%s'], chatgpt: ['ChatGPT', 'https://chatgpt.com/?q=%s'] };
  function bang(v) {
    const m = v.match(/^!(\w+)\s+(.+)$/) || v.match(/^(.+?)\s+!(\w+)$/); if (!m) return null;
    const [key, q] = v.startsWith('!') ? [m[1], m[2]] : [m[2], m[1]]; const b = BANGS[key.toLowerCase()]; if (!b) return null;
    return { name: b[0], url: b[1].replace('%s', encodeURIComponent(q.trim())), q: q.trim() };
  }
  /* "Shift+CmdOrCtrl+T" -> "⇧⌘T" */
  const fmtKey = a => !a ? '' : a.split('+').map(k => ({ CmdOrCtrl: '⌘', Cmd: '⌘', Command: '⌘', Ctrl: '⌃', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Tab: '⇥', Left: '←', Right: '→', Up: '↑', Down: '↓', Return: '↩', Enter: '↩', Backspace: '⌫', Delete: '⌦', Escape: 'esc', Space: 'Space', Plus: '+' }[k] || k)).sort((x, y) => '⌃⌥⇧⌘'.indexOf(y) < 0 ? -1 : '⌃⌥⇧⌘'.indexOf(x) < 0 ? 1 : '⌃⌥⇧⌘'.indexOf(x) - '⌃⌥⇧⌘'.indexOf(y)).join('');
  const searchTpl = p => { if (p.search === 'custom' && /^https?:\/\/\S+%s/.test(p.customSearch || '')) return p.customSearch; return (ENGINES.find(e => e.id === p.search) || ENGINES[0]).url; };
  const palFor = sp => ({ ...palOf(sp && sp.h), ...((sp && sp.custom) || {}) });
  const darkQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const isDark = p => p.mode === 'dark' || (p.mode === 'auto' && darkQ.matches);
  const mode = { off: false };
  let last = null;
  function applyTheme(prefs, pal, el = document.documentElement) {
    const p = prefsOf(prefs); pal = pal || palOf(40); last = [prefs, pal, el];
    const dark = isDark(p), m = dark ? p.dark : p.light, list = PRESETS[dark ? 'dark' : 'light'];
    const pr = list.find(x => x.id === m.preset) || list[0];
    const paper = m.paper || pr.paper, ink = m.ink || pr.ink;
    const white = dark ? mix(paper, '#ffffff', .08) : mix(paper, '#ffffff', .72);
    const v = {
      '--ink': ink, '--inkc': hx(ink).join(' '), '--paper': paper, '--paper2': mix(paper, ink, .07), '--white': white, '--whc': hx(white).join(' '),
      '--sh': dark ? '0 0 0' : hx(ink).join(' '), '--desk': dark ? mix(pal.desk, '#120e0b', .64) : pal.desk, '--tape': pal.tape, '--s2': pal.s2,
      '--grain': p.texture ? (dark ? 'url(grain-dark.png)' : 'url(grain.png)') : 'none', '--wob': p.wobble ? 1 : 0, 'color-scheme': dark ? 'dark' : 'light'
    };
    for (const k in v) el.style.setProperty(k, v[k]);
    el.classList.toggle('dark', dark); el.classList.toggle('motion-off', !p.motion); mode.off = !p.motion;
  }
  darkQ.addEventListener && darkQ.addEventListener('change', () => { if (last) applyTheme(...last); });

  /* drop zones for dragging a tab into the page area. layout = { stage, a, b, split } in window pixels */
  function zones(L) {
    if (!L) return [];
    if (!L.split) {
      const s = L.stage, lw = Math.round(s.w * 0.34), g = 12;
      return [
        { id: 'splitL', x: s.x, y: s.y, w: lw, h: s.h, label: 'stick it on the left' },
        { id: 'replace', x: s.x + lw + g, y: s.y, w: s.w - 2 * lw - 2 * g, h: s.h, label: 'swap it in' },
        { id: 'splitR', x: s.x + s.w - lw, y: s.y, w: lw, h: s.h, label: 'stick it on the right' }
      ];
    }
    return [{ id: 'replaceA', ...L.a, label: 'swap the left side' }, { id: 'replaceB', ...L.b, label: 'swap the right side' }];
  }
  const zoneAt = (L, x, y) => zones(L).find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) || null;

  window.BL = { PAL, KEYS: Object.keys(PAL).map(Number), palOf, applyPal, hx, toHex, mix, PRESETS, DEF, prefsOf, ENGINES, searchTpl, suggestTpl, SUGGEST, BANGS, bang, fmtKey, palFor, isDark, applyTheme, motion: mode, esc, hostOf, hueOf, chip, rot, ic, favHTML, spring, SP, setup, zones, zoneAt };
})();
