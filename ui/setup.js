'use strict';
/* Welcome setup, Settings and the quick-start guide. Drawn in the overlay view, on paper.
   Every change applies live: this view re-themes itself and tells the shell, which re-themes the window and the sidebar and saves. */
window.SETUP = (() => {
  const B = window.washi, BL = window.BL;
  const { esc, PAL, KEYS, palFor, palOf, applyTheme, PRESETS, ENGINES, isDark, prefsOf } = BL;
  const root = document.getElementById('setup');
  let extHook = null; if (B.onExtChanged) B.onExtChanged(list => extHook && extHook(list));   // Settings › Extensions redraws when one is added or removed
  let P = null, SPACES = [], CUR = null, DOCK = true, INFO = {}, KEYMAP = {}, PAGE = 'onboard', step = 0, syncs = [], isOpen = false, sheet = null, body = null, HAVE = [], appsCommit = null;

  const hooks = { perms: null, update: null, arc: null, bm: null };
  B.onSetupEvent(e => { if (e && e.type === 'tools' && P && isOpen) { P.tools = e.tools; P.toolsOff = e.toolsOff; refresh(); } if (e && e.type === 'arcDone' && hooks.arc) hooks.arc(e); if (e && e.type === 'bmDone' && hooks.bm) hooks.bm(e); });
  B.onPerms(l => hooks.perms && hooks.perms(l)); B.onUpdate(u => hooks.update && hooks.update(u));
  const STEPS = [['hello', 'Hello'], ['look', 'Look'], ['basics', 'Basics'], ['apps', 'Your apps'], ['tour', 'What it does'], ['guide', 'Quick start'], ['done', 'Done']];
  const curSp = () => SPACES.find(x => x.id === CUR) || SPACES[0];
  const retheme = () => applyTheme(P, palFor(curSp()));
  const send = m => B.setupMsg(m);
  const refresh = () => syncs.forEach(f => f());
  const modeKey = () => isDark(P) ? 'dark' : 'light';
  const calm = () => BL.motion.off || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* the sites that always open in this space (set from a tab's menu: Always Open … in); × sends one back to any space */
  function routesFor(space) {
    const box = h('div', { class: 'routes' });
    const draw = () => {
      box.innerHTML = ''; const mine = (P.routes || []).filter(r => r.space === space);
      if (!mine.length) { box.append(h('p', { class: 'hint' }, 'Sites that always open here: right-click a tab › Always Open … in.')); return; }
      box.append(h('p', { class: 'hint' }, 'Always opens here:'), h('span', { class: 'chips' }, mine.map(r => h('button', { class: 'chip allow', title: 'Open it in any space again', onclick: () => { setPref({ routes: (P.routes || []).filter(x => x.host !== r.host) }); draw(); } }, r.host, h('i', {}, '×')))));
    };
    sync(draw); return box;
  }
  function setPref(patch) {
    for (const k in patch) { if (k === 'light' || k === 'dark') P[k] = { ...P[k], ...patch[k] }; else P[k] = patch[k]; }
    retheme(); send({ type: 'prefs', patch }); refresh();
  }
  function setSpace(id, m) {
    const x = SPACES.find(z => z.id === id); if (!x) return;
    if (m.h !== undefined) { x.h = m.h; x.custom = null; }
    if (m.custom) { x.custom = { ...(x.custom || {}), ...m.custom }; for (const k in x.custom) if (!x.custom[k]) delete x.custom[k]; if (!Object.keys(x.custom).length) x.custom = null; }
    if (id === CUR) retheme(); send({ type: 'space', id, ...m }); refresh();
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  const sync = f => { syncs.push(f); f(); };
  const field = (label, ctl, hint) => h('div', { class: 'fld' }, h('h4', {}, label), ctl, hint ? h('p', { class: 'hint' }, hint) : null);

  /* ---------- controls ---------- */
  function seg(opts, get, set, cls = '') {
    const el = h('div', { class: 'seg ' + cls, role: 'radiogroup' }, opts.map(o => h('button', { class: 'sg', role: 'radio', 'data-v': String(o.v), onclick: () => set(o.v) },
      o.art ? h('span', { class: 'art', 'data-clip': '', html: o.art }) : null, h('b', {}, o.label), o.sub ? h('small', {}, o.sub) : null)));
    sync(() => el.querySelectorAll('.sg').forEach(b => { const on = b.dataset.v === String(get()); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }));
    return el;
  }
  function toggle(label, sub, get, set) {
    const sw = h('button', { class: 'sw', role: 'switch', 'aria-label': label, onclick: () => set(!get()) }, h('i'));
    const el = h('div', { class: 'tgl' }, h('span', { class: 'tl' }, h('b', {}, label), sub ? h('small', {}, sub) : null), sw);
    sync(() => { sw.classList.toggle('on', !!get()); sw.setAttribute('aria-checked', String(!!get())); });
    return el;
  }
  function colorField(label, get, set, fallback) {
    const inp = h('input', { type: 'color', 'aria-label': label + ' color' });
    const txt = h('input', { type: 'text', class: 'hex', maxlength: '7', spellcheck: 'false', 'aria-label': label + ' hex code' });
    const chip = h('span', { class: 'chip' }, inp);
    const reset = h('button', { class: 'rs', title: 'Use the preset color', onclick: () => set('') }, 'reset');
    let t = 0; inp.addEventListener('input', () => { const v = inp.value; cancelAnimationFrame(t); t = requestAnimationFrame(() => set(v)); });
    txt.addEventListener('change', () => { let v = txt.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) set(v.toLowerCase()); else txt.value = get() || fallback(); });
    const el = h('div', { class: 'cf' }, h('span', { class: 'cl' }, label), chip, txt, reset);
    sync(() => { const v = get() || fallback(); if (document.activeElement !== inp) inp.value = v; if (document.activeElement !== txt) txt.value = v; chip.style.background = v; reset.classList.toggle('vis', !!get()); });
    return el;
  }
  function textField(ph, get, set, check) {
    const inp = h('input', { type: 'text', class: 'txt', placeholder: ph, spellcheck: 'false' }), msg = h('small', { class: 'err' });
    const commit = () => { const v = inp.value.trim(), bad = check ? check(v) : null; msg.textContent = bad || ''; if (!bad) set(v); };
    inp.addEventListener('change', commit); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); commit(); inp.blur(); } });
    const el = h('div', { class: 'tf' }, inp, msg);
    sync(() => { if (document.activeElement !== inp) inp.value = get() || ''; });
    return el;
  }

  /* little paper drawings for the choice cards */
  const artMode = m => m === 'auto'
    ? '<i style="background:linear-gradient(105deg,#fbf6ea 50%,#2b2520 50%)"></i><b style="background:linear-gradient(105deg,#2b2118 50%,#f3ead8 50%)"></b>'
    : `<i style="background:${m === 'dark' ? '#2b2520' : '#fbf6ea'}"></i><b style="background:${m === 'dark' ? '#f3ead8' : '#2b2118'}"></b>`;
  const artSide = d => d ? '<span class="as"><i class="sb"></i><i class="pg"></i></span>' : '<span class="as fl"><i class="sb"></i><i class="pg"></i><em>hover</em></span>';

  /* ---------- sections (shared by the welcome steps and Settings) ---------- */
  function presetSwatches() {
    const row = h('div', { class: 'swr' }); let key = '';
    sync(() => {
      const mk = modeKey();
      if (key !== mk) {
        key = mk; row.innerHTML = '';
        for (const pr of PRESETS[mk]) row.append(h('button', { class: 'pz', 'data-id': pr.id, title: pr.n, onclick: () => setPref({ [mk]: { preset: pr.id, paper: '', ink: '' } }) },
          h('i', { style: `background:${pr.paper};color:${pr.ink}` }, 'Aa'), h('span', {}, pr.n)));
      }
      const m = P[mk]; row.querySelectorAll('.pz').forEach(b => b.classList.toggle('on', b.dataset.id === m.preset && !m.paper && !m.ink));
    });
    return row;
  }
  const presetOf = () => { const mk = modeKey(), m = P[mk]; return PRESETS[mk].find(x => x.id === m.preset) || PRESETS[mk][0]; };
  function spaceColors(id) {
    const sp = () => SPACES.find(z => z.id === id);
    const row = h('div', { class: 'swr' }, KEYS.map(k => h('button', { class: 'pal', 'data-h': String(k), title: PAL[k].n, onclick: () => setSpace(id, { h: k }) },
      h('i', { 'data-clip': '', style: `background:${PAL[k].desk}` }, h('em', { style: `background:${PAL[k].tape}` }), h('u', { style: `background:${PAL[k].s2}` })), h('span', {}, PAL[k].n))));
    sync(() => { const x = sp(); if (x) row.querySelectorAll('.pal').forEach(b => b.classList.toggle('on', +b.dataset.h === x.h && !x.custom)); });
    const cf = (k, label) => colorField(label, () => ((sp() || {}).custom || {})[k] || '', v => setSpace(id, { custom: { [k]: v } }), () => palOf((sp() || {}).h)[k]);
    return h('div', {}, row, h('div', { class: 'cfs' }, cf('desk', 'Desk'), cf('tape', 'Tape'), cf('s2', 'Highlight')));
  }
  function secLook() {
    return [
      field('Appearance', seg([{ v: 'light', label: 'Light', art: artMode('light') }, { v: 'dark', label: 'Dark', art: artMode('dark') }, { v: 'auto', label: 'Match my Mac', art: artMode('auto') }], () => P.mode, v => setPref({ mode: v }), 'modes'),
        'Websites that have a dark version follow this too.'),
      field('Paper & ink', h('div', {}, presetSwatches(), h('div', { class: 'cfs' },
        colorField('Paper', () => P[modeKey()].paper, v => setPref({ [modeKey()]: { paper: v } }), () => presetOf().paper),
        colorField('Ink', () => P[modeKey()].ink, v => setPref({ [modeKey()]: { ink: v } }), () => presetOf().ink)))),
      field('Feel', h('div', { class: 'tgls' },
        toggle('Paper texture', 'The grain on every scrap', () => P.texture, v => setPref({ texture: v })),
        toggle('Scrapbook', 'More paper everywhere: tape on what\'s stuck down, crooked scraps, sticker emoji', () => P.wobble, v => setPref({ wobble: v })),
        toggle('Animations', 'Turn off for a calmer, instant browser', () => P.motion, v => setPref({ motion: v }))))
    ];
  }
  const searchCheck = v => (/^https?:\/\/\S+$/.test(v) && v.includes('%s')) ? null : 'Needs to start with https:// and include %s where your words go';
  function secSearch() {
    const custom = textField('https://example.com/search?q=%s', () => P.customSearch, v => setPref({ customSearch: v }), searchCheck);
    sync(() => { custom.hidden = P.search !== 'custom'; });
    return [field('Search engine', h('div', {}, seg([...ENGINES.map(e => ({ v: e.id, label: e.n })), { v: 'custom', label: 'Custom…' }], () => P.search, v => setPref({ search: v }), 'grid'), custom),
      'Anything you type in the command bar that isn\'t an address gets searched here. Type !yt, !w, !gh, !a and more to search a site directly.'),
      field('Suggestions', toggle('Show search suggestions', 'As you type, your search engine suggests searches. What you type is sent to it.', () => P.suggest, v => setPref({ suggest: v })))];
  }
  function secStartup() {
    const home = textField('Homepage, like news.ycombinator.com', () => P.home, v => setPref({ home: v }), v => v ? null : 'Type an address');
    sync(() => { home.hidden = P.startup !== 'home'; });
    return field('When Washi opens', h('div', {}, seg([{ v: 'restore', label: 'Pick up where I left off', sub: 'All your tabs, just as you left them' }, { v: 'home', label: 'Also open my homepage', sub: 'Your tabs, plus a fresh homepage tab' }], () => P.startup, v => setPref({ startup: v }), 'wide'), home));
  }
  function secSidebar() {
    return field('Sidebar', seg([{ v: true, label: 'Pinned', sub: 'Always beside your pages', art: artSide(true) }, { v: false, label: 'Floating', sub: 'Hides away; hover the left edge', art: artSide(false) }],
      () => DOCK, v => { DOCK = v; send({ type: 'dock', dock: v }); refresh(); }, 'wide'), kh('sidebar') ? `Switch any time with ${kh('sidebar')}.` : '');
  }
  const BLOCK_OPTS = [{ v: 'off', label: 'Off', sub: 'Show everything' }, { v: 'standard', label: 'Standard', sub: 'Blocks ads and trackers' }, { v: 'strict', label: 'Strict', sub: 'Also hides cookie banners and pop-overs' }];
  function secBlocking(brief) {
    if (brief) return field('Ads and trackers', seg(BLOCK_OPTS, () => P.blocking, v => setPref({ blocking: v }), 'wide'), 'Built in, like an ad blocker you never have to install.');
    const when = h('small', { class: 'hint' }), upd = h('button', { class: 'btn small', onclick: async () => { upd.disabled = true; upd.textContent = 'Updating…'; const r = await B.setupAct({ type: 'lists:refresh' }); upd.disabled = false; upd.textContent = r && r.ok ? 'Updated ✓' : 'Couldn\'t update right now'; if (r && r.at) INFO.lists = r.at; drawWhen(); } }, 'Update lists now');
    const drawWhen = () => { when.textContent = INFO.lists ? 'Lists last updated ' + new Date(INFO.lists).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + '. Washi refreshes them every few days.' : ''; };
    drawWhen();
    return field('Ads and trackers', h('div', {}, seg(BLOCK_OPTS, () => P.blocking, v => setPref({ blocking: v }), 'wide'), h('div', { class: 'row tight' }, when, upd)), 'Blocks things that follow you around the web. You can turn it off for one site from the shield in the top bar.');
  }
  function secSecurity() {
    return [
      field('Safety', h('div', { class: 'tgls' },
        toggle('Warn me about dangerous sites', 'Checks every page against lists of known phishing and malware sites, on your Mac. Nothing is sent anywhere.', () => P.safety, v => setPref({ safety: v })),
        toggle('Always use secure connections', 'Upgrades sites to https. If a site can\'t do that, Washi asks before loading it insecurely.', () => P.httpsFirst, v => setPref({ httpsFirst: v })),
        toggle('Ask sites not to track me', 'Sends Global Privacy Control and Do Not Track with every request', () => P.gpc, v => setPref({ gpc: v })),
        toggle('Clear cookies when Washi quits', 'You\'ll be signed out of websites each time you quit', () => P.clearOnExit, v => setPref({ clearOnExit: v })))),
      field('Secure DNS', seg([{ v: 'auto', label: 'Automatic', sub: 'Encrypted when your network supports it' }, { v: 'cloudflare', label: 'Cloudflare' }, { v: 'quad9', label: 'Quad9', sub: 'Also blocks malware domains' }, { v: 'google', label: 'Google' }, { v: 'off', label: 'Off' }], () => P.dns, v => setPref({ dns: v }), 'grid5'),
        'Looks up website addresses over an encrypted connection, so your network can\'t see or change them.')
    ];
  }
  function secPerms() {
    const box = h('div', { class: 'perms' });
    const NAMES = { 'local-network': 'Apps on this Mac', media: 'Camera & mic', geolocation: 'Location', notifications: 'Notifications', 'clipboard-read': 'Clipboard', midi: 'MIDI', midiSysex: 'MIDI control', 'display-capture': 'Screen recording', 'idle-detection': 'Idle detection', hid: 'HID devices', serial: 'Serial ports', usb: 'USB devices' };
    const draw = list => {
      box.innerHTML = '';
      if (!list || !list.length) { box.append(h('p', { class: 'hint' }, 'No sites have asked for anything yet. When one does, your answer shows up here.')); return; }
      for (const { origin, perms } of list) box.append(h('div', { class: 'perm' }, h('b', {}, origin.replace(/^https:\/\//, '')),
        h('span', { class: 'chips' }, Object.entries(perms).map(([k, v]) => h('button', { class: 'chip ' + v, title: v === 'allow' ? 'Allowed: click to block' : 'Blocked: click to allow', 'aria-pressed': String(v === 'allow'), onclick: async () => draw(await B.setupAct({ type: 'perm:set', origin, perm: k, v: v === 'allow' ? 'block' : 'allow' })) }, (v === 'allow' ? '✓ ' : '✕ ') + (NAMES[k] || k)))),
        h('button', { class: 'lnk', onclick: async () => draw(await B.setupAct({ type: 'perm:reset', origin })) }, 'Reset')));
    };
    draw(INFO.perms || []); hooks.perms = draw;
    return field('Site permissions', box, 'Click a choice to switch it between allowed and blocked. Reset forgets a site, so it asks again.');
  }
  function secDownloads() {
    return field('Downloads', seg([{ v: false, label: 'Save to Downloads', sub: 'No questions asked' }, { v: true, label: 'Ask where to save', sub: 'Pick a folder each time' }], () => P.askDownload, v => setPref({ askDownload: v }), 'wide'));
  }
  const ARCHIVE_OPTS = [{ v: 0, label: 'Never' }, { v: 12, label: 'After 12 hours' }, { v: 24, label: 'After a day' }, { v: 168, label: 'After a week' }, { v: 720, label: 'After 30 days' }];
  /* your shortcut for an action, as you've set it (hints follow your own keys) */
  const kh = id => KEYMAP[id] ? BL.fmtKey(KEYMAP[id]) : '';
  const withKey = (text, id) => kh(id) ? `${text} (${kh(id)})` : text;
  /* ---------- Features: how Focus mode, Reader, Now playing, swiping, snapshots and the rest behave ---------- */
  function secFeatures() {
    const rd = () => P.reader || {};
    return [
      field(withKey('Focus mode', 'focus'), h('div', { class: 'segs' },
        seg([{ v: 'peek', label: 'Top bar peeks in', sub: 'Point at the very top' }, { v: 'off', label: 'Top bar stays away', sub: 'Until you leave Focus mode' }], () => P.focusBar || 'peek', v => setPref({ focusBar: v }), 'wide'),
        seg([{ v: 'edge', label: 'Sidebar slides in', sub: 'Point at the left edge' }, { v: 'off', label: 'Sidebar stays away', sub: 'Until you leave Focus mode' }], () => P.focusSide || 'edge', v => setPref({ focusSide: v }), 'wide'))),
      field(withKey('Reader', 'reader'), h('div', { class: 'segs' },
        seg([{ v: 'serif', label: 'Serif', sub: 'Like a book' }, { v: 'sans', label: 'Sans', sub: 'Clean and modern' }], () => rd().face || 'serif', v => setPref({ reader: { ...rd(), face: v } }), 'wide'),
        seg([{ v: 16, label: 'Small' }, { v: 19, label: 'Medium' }, { v: 22, label: 'Large' }, { v: 25, label: 'Huge' }], () => [16, 19, 22, 25].reduce((a, b) => Math.abs(b - (rd().size || 19)) < Math.abs(a - (rd().size || 19)) ? b : a), v => setPref({ reader: { ...rd(), size: v } }), 'grid')),
        'How articles look in Reader. Aa on the sheet changes it while you read.'),
      field('Now playing', toggle('Show what\'s playing in the sidebar', 'Music or a video in another tab gets a little ticket at the bottom of the sidebar, with play and pause.', () => P.nowPlaying !== false, v => setPref({ nowPlaying: v }))),
      field('Spaces', toggle('Swipe between spaces', 'Two fingers sideways on the sidebar goes to the next or previous space.', () => P.swipe !== false, v => setPref({ swipe: v }))),
      field(withKey('Snapshot', 'snapshot'), seg([{ v: 'copy', label: 'Copy it', sub: 'Save from the note if you want' }, { v: 'save', label: 'Copy and save', sub: 'Also puts a PNG in Downloads' }], () => P.snapSave || 'copy', v => setPref({ snapSave: v }), 'wide')),
      field('Bookmarks', toggle('Rest on the star for the bookmarks bar', 'The bar slides out while you point at the star, whatever Settings › Bookmarks says.', () => P.starBar !== false, v => setPref({ starBar: v }))),
      field('Tidying', toggle('Offer to tidy up a busy sidebar', 'With 10 or more loose tabs, a Tidy button shows up in the sidebar.', () => P.tidyOffer !== false, v => setPref({ tidyOffer: v })))
    ];
  }
  /* ---------- Top bar: which tools show, in what order (drag the rows, or the buttons in the bar itself) ---------- */
  function secToolbar() {
    const box = h('div', { class: 'tbset' });
    const draw = () => {
      const order = BL.toolOrder(P.tools), off = new Set(P.toolsOff || []);
      const preview = h('div', { class: 'tbprev', 'aria-hidden': 'true' }, h('span', { class: 'tbaddr' }), order.filter(id => !off.has(id)).map(id => { const t = BL.TOOLS.find(x => x.id === id); return h('span', { class: 'tbpi', 'data-tool': id, html: BL.ic(t.icon, 16) }); }));
      const list = h('div', { class: 'tblist', role: 'list', 'aria-label': 'Top bar tools, drag to reorder' }, order.map((id, i) => {
        const t = BL.TOOLS.find(x => x.id === id), on = !off.has(id), k = t.key && KEYMAP[t.key] ? BL.fmtKey(KEYMAP[t.key]) : '';
        const move = d => { const o = order.slice(), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; setPref({ tools: o }); };
        return h('div', { class: 'tbrow' + (on ? '' : ' off'), role: 'listitem', 'data-id': id, style: `--i:${i}` },
          h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), h('span', { class: 'tbi', html: BL.ic(t.icon, 18) }),
          h('span', { class: 'tbn' }, h('b', {}, t.name), t.sub ? h('small', {}, t.sub) : null), k ? h('kbd', {}, k) : null,
          h('span', { class: 'tbmv' }, h('button', { class: 'mv', 'data-a': '1', 'aria-label': `Move ${t.name} left`, title: 'Move left', disabled: i === 0 ? '' : null, onclick: () => move(-1), html: BL.ic('up', 14) }), h('button', { class: 'mv', 'data-a': '1', 'aria-label': `Move ${t.name} right`, title: 'Move right', disabled: i === order.length - 1 ? '' : null, onclick: () => move(1), html: BL.ic('down', 14) })),
          h('button', { class: 'sw' + (on ? ' on' : ''), 'data-a': '1', role: 'switch', 'aria-checked': String(on), 'aria-label': `Show ${t.name} in the top bar`, onclick: () => { const n = new Set(P.toolsOff || []); on ? n.add(id) : n.delete(id); setPref({ toolsOff: [...n] }); } }, h('i')));
      }));
      BMK.dragSort(list, '.tbrow', 'y', m => { const o = order.filter(x => x !== m.id), j = o.indexOf(m.target); o.splice(m.before ? j : j + 1, 0, m.id); setPref({ tools: o }); });
      const dflt = !P.tools && !(P.toolsOff || []).length;
      box.replaceChildren(preview, list, h('div', { class: 'row' }, h('button', { class: 'btn small', disabled: dflt ? '' : null, onclick: () => setPref({ tools: null, toolsOff: [] }) }, 'Reset to the standard order')));
    };
    sync(draw);
    return [field('Tools on the right', box, 'Drag a row to move it (or drag the buttons in the top bar itself). Right-click a button in the bar to hide it. Reader only shows on articles, Downloads once you\'ve downloaded something.')];
  }
  function secTabs(brief) {
    const arch = field('Tidy up old tabs', seg(ARCHIVE_OPTS, () => +P.archive, v => setPref({ archive: v }), 'grid'),
      `Tabs you haven't opened in a while move to the Archive${kh('archive') ? ` (${kh('archive')})` : ''}, so your sidebar stays clean. Pinned tabs and folders are never touched.`);
    const pos = field('New scraps go', seg([{ v: 'top', label: 'At the top', sub: 'Newest first, like Arc' }, { v: 'bottom', label: 'At the bottom', sub: 'In the order you opened them' }], () => P.newTabPos, v => setPref({ newTabPos: v }), 'wide'));
    if (brief) return arch;
    return [pos, arch,
      field('Sleeping tabs', seg([{ v: 0, label: 'Never' }, { v: 15, label: 'After 15 min' }, { v: 60, label: 'After 1 hour' }, { v: 240, label: 'After 4 hours' }], () => +P.sleep, v => setPref({ sleep: v }), 'grid'),
        'Tabs you aren\'t using stop running to save memory and battery. They reload when you click them. Tabs playing sound never sleep.'),
      field('Memory saver', seg([{ v: 'off', label: 'Off' }, { v: 'balanced', label: 'Balanced', sub: 'Over a quarter of your memory' }, { v: 'max', label: 'Maximum', sub: 'Over a sixth of your memory' }], () => P.memSaver || 'balanced', v => setPref({ memSaver: v }), 'grid'),
        'When Washi uses more than that much of your Mac\'s memory, tabs you haven\'t looked at in a while go to sleep early, oldest first. Never the tab you\'re on, one playing sound, or one you used in the last 10 minutes.'),
      field('Video', toggle('Picture in picture when switching tabs', 'A playing video keeps going in a small floating window', () => P.autoPip, v => setPref({ autoPip: v }))),
      field('Little scraps', toggle('Open links from other apps in a little scrap', `A small window you can glance at and close, or keep${kh('scrapadopt') ? ` with ${kh('scrapadopt')}` : ''}. Needs Washi as your default browser.`, () => P.scrapLinks, v => setPref({ scrapLinks: v })),
        kh('scrap') ? `Open one any time with ${kh('scrap')}.` : ''),
      field('Tab previews', toggle('Preview a tab when you rest on it', 'A little snapshot of the page beside the sidebar.', () => P.tabPeek !== false, v => setPref({ tabPeek: v }))),
      field('Quitting', toggle('Press ⌘Q twice to quit', 'So a stray ⌘Q doesn\'t close all your windows. Quitting from the menu with the mouse still quits right away.', () => P.confirmQuit !== false, v => setPref({ confirmQuit: v })))];
  }
  function secDefault() {
    const out = h('div', { class: 'dfb' });
    const draw = () => {
      out.innerHTML = '';
      if (INFO.isDefault) out.append(h('p', { class: 'okay' }, '✓ Washi is your default browser. Links from other apps open here.'));
      else if (!INFO.packaged) out.append(h('p', { class: 'hint' }, 'This works in the installed app (build it with npm run dist). You\'re running the developer version, which macOS won\'t accept as a default browser.'));
      else out.append(h('button', { class: 'btn', onclick: async e => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'Check the macOS prompt…';
        const r = await B.setupAct({ type: 'defaultBrowser' }); INFO.isDefault = !!r.isDefault; draw();
      } }, 'Make Washi my default browser'));
    };
    draw();
    return field('Default browser', out);
  }
  function secData() {
    const pick = { history: true, cookies: false, cache: true };
    const boxes = h('div', { class: 'tgls' },
      toggle('History', 'Pages you\'ve visited and recently closed tabs', () => pick.history, v => { pick.history = v; refresh(); }),
      toggle('Cookies and site data', 'Signs you out of websites', () => pick.cookies, v => { pick.cookies = v; refresh(); }),
      toggle('Cached files', 'Images and files saved to load pages faster', () => pick.cache, v => { pick.cache = v; refresh(); }));
    let armed = false;
    const btn = h('button', { class: 'btn warn', onclick: async () => {
      if (!armed) { armed = true; btn.textContent = 'Click again to clear'; setTimeout(() => { armed = false; btn.textContent = 'Clear browsing data'; }, 3000); return; }
      armed = false; btn.disabled = true; await B.setupAct({ type: 'clearData', ...pick }); btn.textContent = 'Cleared ✓'; setTimeout(() => { btn.disabled = false; btn.textContent = 'Clear browsing data'; }, 2200);
    } }, 'Clear browsing data');
    return field('Clear browsing data', h('div', {}, boxes, btn));
  }
  /* ---------- keyboard shortcut editor ---------- */
  const fmt = BL.fmtKey;
  const CODES = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Escape' };
  function accelOf(e) {
    let k = null;
    if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3); else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5); else if (/^F\d{1,2}$/.test(e.code)) k = e.code; else k = CODES[e.code];
    if (!k || /^(Meta|Control|Alt|Shift)/.test(e.key)) return null;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'CmdOrCtrl'].filter(Boolean);
    if (!mods.length && !/^F\d/.test(k)) return '';                                   // shortcuts need a modifier (⌘ ⌥ ⌃ ⇧), except F-keys
    return [...mods, k].join('+');
  }
  const normK = a => { if (!a) return ''; const p = a.split('+'), key = p.pop(); const o = ['Ctrl', 'Alt', 'Shift', 'CmdOrCtrl']; return [...o.filter(m => p.includes(m)), key.length === 1 ? key.toUpperCase() : key].join('+'); };
  function secKeys() {
    const box = h('div', { class: 'keyed' }); let ACT = [], rec = null;
    const cur = id => (P.keys && P.keys[id] !== undefined) ? P.keys[id] : (ACT.find(a => a.id === id) || {}).def;
    const save = next => { const keys = {}; for (const a of ACT) if (next[a.id] !== undefined && next[a.id] !== a.def) keys[a.id] = next[a.id]; P.keys = keys; KEYMAP = Object.fromEntries(ACT.map(a => [a.id, keys[a.id] !== undefined ? keys[a.id] : a.def])); send({ type: 'prefs', patch: { keys } }); };
    const stop = () => { if (rec) { rec.chip.classList.remove('rec'); rec = null; B.keysRecording(false); removeEventListener('keydown', onKey, true); draw(); } };
    function onKey(e) {
      if (!rec) return; e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) return stop();
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) { const n = { ...(P.keys || {}) }; n[rec.id] = ''; save(n); return stop(); }
      const a = accelOf(e); if (a === null) return;
      if (a === '') { rec.msg.textContent = 'Add ⌘, ⌥, ⌃ or ⇧'; return; }
      const clash = ACT.find(x => x.id !== rec.id && normK(cur(x.id)) === normK(a));
      const n = { ...(P.keys || {}) }; n[rec.id] = a;
      if (clash) { n[clash.id] = ''; rec.note = `${fmt(a)} was used by “${clash.label}”, which now has no shortcut.`; }
      const note = rec.note; save(n); stop(); if (note) flash(note);
    }
    const flash = t => { const p = box.querySelector('.knote'); if (p) { p.textContent = t; p.classList.add('on'); setTimeout(() => p.classList.remove('on'), 5000); } };
    const GROUPS = [['app', 'Washi'], ['file', 'Tabs and spaces'], ['edit', 'Editing'], ['view', 'View'], ['history', 'History'], ['bookmarks', 'Bookmarks'], ['spaces', 'Moving around']];
    function draw() {
      box.innerHTML = '';
      box.append(h('p', { class: 'knote' }));
      for (const [g, name] of GROUPS) {
        const list = ACT.filter(a => a.menu === g); if (!list.length) continue;
        box.append(h('h5', {}, name));
        for (const a of list) {
          const k = cur(a.id), custom = P.keys && P.keys[a.id] !== undefined && P.keys[a.id] !== a.def;
          const msg = h('small', { class: 'kmsg' });
          const chip = h('button', { class: 'kchip' + (k ? '' : ' none') + (custom ? ' custom' : ''), title: 'Click, then press the new shortcut. Delete removes it, esc cancels.', onclick: () => {
            if (rec) stop(); rec = { id: a.id, chip, msg }; chip.classList.add('rec'); chip.textContent = 'Press keys…'; B.keysRecording(true); addEventListener('keydown', onKey, true);
          } }, k ? fmt(k) : 'none');
          box.append(h('div', { class: 'krow' }, h('span', { class: 'kl' }, a.label), msg, chip,
            h('button', { class: 'rs' + (custom ? ' vis' : ''), title: 'Back to ' + (fmt(a.def) || 'none'), onclick: () => { const n = { ...(P.keys || {}) }; delete n[a.id]; save(n); draw(); } }, 'reset')));
        }
      }
      box.append(h('p', { class: 'hint' }, 'Always: hold ⌃ and tap Tab to flip through your recent tabs (add ⇧ to go back, esc to stay put).'));
      box.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { save({}); draw(); flash('All shortcuts are back to their defaults.'); } }, 'Reset all shortcuts')));
    }
    B.keysList().then(r => { ACT = r.actions; draw(); });
    return field('Keyboard shortcuts', box, 'Click a shortcut, then press the keys you want. Every menu and hint in Washi updates to match.');
  }
  function secAbout() {
    const st = h('p', { class: 'hint' }), btn = h('button', { class: 'btn small' }, 'Check for updates');
    const draw = u => {
      u = u || {}; const m = { dev: 'Updates arrive automatically in the installed app. This copy isn\'t set up for updates (developer version).', checking: 'Checking…', downloading: `Downloading Washi ${u.version || ''}${u.percent ? ` (${u.percent}%)` : ''}…`, current: 'You\'re up to date.', ready: `Washi ${u.version} is ready. Restart to finish updating (or it installs next time you quit).`, installing: 'Installing the update…', error: 'Couldn\'t check for updates: ' + (u.error || 'unknown error'), idle: 'Washi checks for updates automatically.' };
      st.textContent = m[u.status] || m.idle;
      btn.textContent = u.status === 'ready' ? 'Restart now' : 'Check for updates'; btn.disabled = u.status === 'dev' || u.status === 'checking' || u.status === 'downloading';
      btn.onclick = async () => { if (u.status === 'ready') return B.setupAct({ type: 'update:install' }); draw(await B.setupAct({ type: 'update:check' })); };
    };
    draw(INFO.update); hooks.update = draw;
    return [field('Updates', h('div', {}, h('p', { class: 'ver' }, h('b', {}, 'Washi ' + (INFO.version || '')), h('small', {}, ` · Chromium ${INFO.chrome || ''} · Electron ${INFO.electron || ''}`)), st, btn),
      'Each update brings the newest Chromium security fixes. Updates download in the background; you choose when to restart.'),
      field('When an update is ready', seg([{ v: 'card', label: 'Show me a card', sub: 'Restart now, or later' }, { v: 'quiet', label: 'Stay quiet', sub: 'It installs when you quit' }], () => P.updates || 'card', v => setPref({ updates: v }), 'wide')),
      field('After an update', toggle('Show what\'s new', 'A page of what changed and how to use it, the first time Washi starts after an update.', () => P.showNews !== false, v => setPref({ showNews: v })))];
  }


  /* ---------- live folders: a GitHub token for private repositories ---------- */
  function secLive() {
    const out = h('div', { class: 'ghk' });
    const draw = (msg, bad) => {
      out.innerHTML = '';
      if (INFO.ghToken) out.append(h('p', { class: 'okay' }, '✓ A GitHub token is saved (in your Mac\'s Keychain).'), h('button', { class: 'btn small', onclick: async () => { const r = await B.setupAct({ type: 'github:token', value: '' }); INFO.ghToken = !!(r && r.has); draw('Removed.'); } }, 'Remove token'));
      else {
        const inp = h('input', { type: 'password', class: 'txt', placeholder: 'GitHub token (github_pat_… or ghp_…)', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'GitHub token' });
        const save = async () => { const r = await B.setupAct({ type: 'github:token', value: inp.value }); if (r && r.ok) { INFO.ghToken = !!r.has; draw(); } else draw((r && r.error) || 'Couldn\'t save it.', true); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); save(); } });
        out.append(h('div', { class: 'sbtns' }, inp, h('button', { class: 'btn small', onclick: save }, 'Save')));
      }
      if (msg) out.append(h('small', { class: bad ? 'err' : 'hint' }, msg));
    };
    draw();
    return field('GitHub', out, h('span', {}, 'Lets the Today page show pull requests waiting on you, and live folders read private repositories. ', h('button', { class: 'link', onclick: () => send({ type: 'openUrl', url: 'https://github.com/settings/personal-access-tokens/new' }) }, 'Make a token on GitHub'), ' (read-only access to pull requests is enough), then paste it here.'));
  }

  /* ---------- bring your Arc setup over ---------- */
  function secImport(brief) {
    const box = h('div', { class: 'arc' });
    let scan = null, pick = new Set(), favs = true, unpinned = false, busy = false, done = null;
    const merges = s => SPACES.some(x => x.name.toLowerCase() === s.name.slice(0, 12).toLowerCase());
    const newCount = set => scan.spaces.filter(s => set.has(s.key) && !merges(s)).length;
    const fits = set => SPACES.length + newCount(set) <= 6;
    const desc = c => [c.tabs && `${c.tabs} tab${c.tabs > 1 ? 's' : ''}`, c.folders && `${c.folders} folder${c.folders > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'empty';
    const choose = async () => { const r = await B.setupAct({ type: 'arc:pick' }); if (r) { scan = r; preselect(); draw(); } };
    const preselect = () => { pick = new Set(); if (!scan || !scan.found) return; for (const s of scan.spaces) { const next = new Set(pick).add(s.key); if (fits(next)) pick = next; } };
    const go = () => {
      if (busy || !pick.size) return; busy = true; draw();
      send({ type: 'arcImport', path: scan.path, keys: [...pick], favorites: favs, unpinned });
    };
    hooks.arc = r => { busy = false; done = r; if (r.ok) { for (const s of scan.spaces) if (pick.has(s.key) && !merges(s) && SPACES.length < 6) SPACES.push({ id: 'arc-' + s.key, name: s.name.slice(0, 12), h: 40 }); } draw(); };
    function draw() {
      box.innerHTML = '';
      if (done) { box.append(h('p', { class: done.ok ? 'okay' : 'err' }, (done.ok ? '✓ ' : '') + (done.text || done.error))); if (done.ok) { box.append(h('p', { class: 'hint' }, 'Pages load when you first click them. Run it again any time: nothing gets doubled up.')); return; } }
      if (!scan) { box.append(h('p', { class: 'hint' }, 'Looking for Arc on this Mac…')); return; }
      if (!scan.found) {
        if (brief) return;
        box.append(h('p', { class: 'hint' }, scan.error ? `Couldn't read Arc's sidebar: ${scan.error}` : 'Arc isn\'t on this Mac, or its sidebar file is somewhere else (for example, copied from another Mac).'),
          h('button', { class: 'btn small', onclick: choose }, 'Choose Arc\'s sidebar file…'));
        return;
      }
      if (brief) {
        const n = scan.spaces.filter(s => pick.has(s.key));
        box.append(h('p', { class: 'hint' }, `Found ${scan.spaces.length} Arc space${scan.spaces.length > 1 ? 's' : ''}: ${scan.spaces.map(s => s.name).join(', ')}. Bring their pinned tabs, folders and favorites over?`),
          h('button', { class: 'btn primary small', disabled: busy || !n.length, onclick: go }, busy ? 'Bringing them in…' : 'Bring in my Arc setup'));
        return;
      }
      const list = h('div', { class: 'arcl' });
      for (const s of scan.spaces) {
        const on = pick.has(s.key), next = new Set(pick); on ? next.delete(s.key) : next.add(s.key);
        const blocked = !on && !fits(next);
        list.append(h('button', { class: 'arow' + (on ? ' on' : ''), role: 'checkbox', 'aria-checked': String(on), disabled: blocked || busy, title: blocked ? 'Washi has room for 6 spaces' : '', onclick: () => { pick = next; draw(); } },
          h('i', { class: 'ck' }), h('span', { class: 'an' }, h('b', {}, s.name), h('small', {}, desc(s.pinned) + (s.unpinned.tabs ? ` (+${s.unpinned.tabs} unpinned)` : ''))),
          h('em', { class: 'tag' }, merges(s) ? 'adds to ' + SPACES.find(x => x.name.toLowerCase() === s.name.slice(0, 12).toLowerCase()).name : blocked ? 'no room' : 'new space')));
      }
      const unp = scan.spaces.reduce((a, s) => a + (pick.has(s.key) ? s.unpinned.tabs : 0), 0);
      box.append(list, h('div', { class: 'tgls' },
        toggleLocal('Favorites become pinned tabs', `${scan.favorites} favorite${scan.favorites === 1 ? '' : 's'} at the top of Arc's sidebar`, () => favs, v => { favs = v; draw(); }),
        toggleLocal('Also bring tabs that weren\'t pinned', unp ? `${unp} tab${unp > 1 ? 's' : ''} from Arc's "Today" list` : 'None in the spaces you picked', () => unpinned, v => { unpinned = v; draw(); })),
        h('div', { class: 'sbtns' }, h('button', { class: 'btn primary small', disabled: busy || !pick.size, onclick: go }, busy ? 'Bringing them in…' : `Bring in ${pick.size} space${pick.size === 1 ? '' : 's'}`),
          h('button', { class: 'btn small plain', onclick: choose }, 'Use a different file…')));
      if (SPACES.length + newCount(new Set(scan.spaces.map(s => s.key))) > 6) box.append(h('p', { class: 'hint' }, 'Washi has room for 6 spaces. Pick the ones you want, or rename a Washi space to match an Arc one to merge them.'));
    }
    /* toggles here aren't settings, so they don't go through setPref */
    function toggleLocal(label, sub, get, set) {
      const sw = h('button', { class: 'sw' + (get() ? ' on' : ''), role: 'switch', 'aria-checked': String(!!get()), 'aria-label': label, onclick: () => set(!get()) }, h('i'));
      return h('div', { class: 'tgl' }, h('span', { class: 'tl' }, h('b', {}, label), h('small', {}, sub)), sw);
    }
    const fld = field(brief ? 'Coming from Arc?' : 'Bring your Arc setup', box, brief ? null : 'Reads the sidebar file Arc keeps on your Mac. Spaces, pinned tabs, folders (even folders in folders), split views and favorites come over. Arc stays untouched and nothing leaves your Mac.');
    const show = () => { if (brief) fld.hidden = !done && !(scan && scan.found); };
    const draw0 = draw; draw = () => { draw0(); show(); };
    B.setupAct({ type: 'arc:scan' }).then(r => { scan = r; preselect(); draw(); });
    draw();
    return fld;
  }

  /* ---------- bookmarks: how the bar shows, and bringing them in from other browsers ---------- */
  function secBookmarks() {
    const bar = field('Bookmarks bar', seg([{ v: 'always', label: 'Always', sub: 'A slim row above your pages' }, { v: 'hover', label: 'On hover', sub: 'Point at the top bar to see it' }, { v: 'hidden', label: 'Hidden', sub: 'Find them with ⌘T or ⌥⌘B' }],
      () => P.bookmarkBar || 'hover', v => setPref({ bookmarkBar: v, ...(v !== 'always' ? { barLast: v } : { barLast: P.bookmarkBar || 'hover' }) }), 'wide'), `Click ☆ next to the address${kh('bookmark') ? ` (or press ${kh('bookmark')})` : ''} to bookmark a page. Right-click the bar for folders, emoji and colors.`);
    return [bar, importBox(false)];
  }

  /* ---------- Settings › Extensions: Chrome extensions from the Chrome Web Store ---------- */
  function secExtensions() {
    const box = h('div', { class: 'xbox' }); let L = { ok: true, list: [] }, msg = null;
    const load = async () => { try { L = (await B.setupAct({ type: 'ext:list' })) || L; } catch {} draw(); };
    function draw() {
      box.innerHTML = '';
      if (!L.ok) { box.append(h('p', { class: 'err' }, 'Extensions couldn\'t start on this Mac.')); return; }
      if (msg) box.append(h('p', { class: msg.ok ? 'okay' : 'err' }, (msg.ok ? '✓ ' : '') + msg.text));
      const list = h('div', { class: 'pwlist', role: 'list' });
      if (!L.list.length) list.append(h('p', { class: 'hint pwempty' }, 'No extensions yet. Open the Chrome Web Store, pick one and press “Add to Chrome”: Washi asks before adding it.'));
      for (const e of L.list) list.append(h('div', { class: 'pwrow xrow', role: 'listitem', 'data-id': e.id },
        h('img', { class: 'xicon', src: `crx://extension-icon/${e.id}/32/2?partition=washi-pages`, alt: '', onerror: function () { this.replaceWith(h('span', { class: 'pwfav', html: BL.favHTML({ title: e.name, url: 'https://' + e.id }) })); } }),
        h('span', { class: 'pwt' }, h('b', {}, e.name), h('small', {}, [e.version && 'Version ' + e.version, e.description].filter(Boolean).join(' · '))),
        h('span', { class: 'pwacts' },
          e.options ? h('button', { class: 'btn small plain', onclick: () => { B.setupAct({ type: 'ext:options', id: e.id }); finish(); } }, 'Options') : null,
          h('button', { class: 'ib warn', title: 'Remove', 'aria-label': 'Remove ' + e.name, 'data-a': 'remove', html: BL.ic('trash', 16), onclick: async () => { const r = await B.setupAct({ type: 'ext:remove', id: e.id }); msg = r && r.ok ? { ok: true, text: `Removed ${e.name}.` } : { ok: false, text: `Couldn't remove ${e.name}.` }; load(); } }))));
      box.append(h('div', { class: 'sbtns' }, h('button', { class: 'btn small primary', onclick: () => { B.setupAct({ type: 'ext:store' }); finish(); } }, 'Get extensions from the Chrome Web Store')), list);
    }
    extHook = list => { L = { ok: true, list }; draw(); };
    load();
    return field('Extensions', box, 'Chrome extensions work in Washi: their buttons sit in the top bar, next to ☆. They run in every space. Extensions that need a desktop app on your Mac to talk to (some password managers) may only partly work.');
  }

  /* ---------- Settings › Passwords: saved logins and passkeys, kept encrypted on this Mac ---------- */
  function secPasswords() {
    const box = h('div', { class: 'pwbox' }), pkbox = h('div', { class: 'pwbox' }), nvbox = h('div', {});
    let L = { logins: [], passkeys: [], never: [], ok: true }, q = '', open = null, shown = new Map(), msg = null, undo = null, adding = false;
    const say = (text, ok = true, un = null, where = 'pw') => { msg = { text, ok, where }; undo = un; draw(); };
    const load = async () => { try { L = (await B.setupAct({ type: 'pw:list' })) || L; } catch {} draw(); };
    const ago = t => { if (!t) return 'never'; const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 31 ? d + ' days ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    function editor(l) {
      const site = h('input', { class: 'txt', value: l ? (l.origin.startsWith('https://') ? l.host : l.origin) : '', placeholder: 'github.com', spellcheck: 'false', 'aria-label': 'Website' });
      const user = h('input', { class: 'txt', value: l ? l.user : '', placeholder: 'Username or email', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Username' });
      const pass = h('input', { class: 'txt', type: 'password', placeholder: l ? 'Leave empty to keep it' : 'Password', autocomplete: 'new-password', 'aria-label': 'Password' });
      const err = h('small', { class: 'err' });
      const save = async () => {
        const r = l ? await B.setupAct({ type: 'pw:edit', id: l.id, site: site.value, user: user.value, pass: pass.value || undefined }) : await B.setupAct({ type: 'pw:add', site: site.value, user: user.value, pass: pass.value });
        if (!r || !r.ok) { err.textContent = (r && r.error) || 'Couldn\'t save that.'; return; }
        open = null; adding = false; shown.delete(l && l.id); await load(); say(l ? 'Saved your changes.' : 'Added the password.');
      };
      [site, user, pass].forEach(i => i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') { open = null; adding = false; draw(); } }));
      setTimeout(() => (l ? user : site).focus(), 30);
      return h('div', { class: 'pwedit' }, h('label', { class: 'fl' }, h('span', {}, 'Website'), site), h('label', { class: 'fl' }, h('span', {}, 'Username'), user), h('label', { class: 'fl' }, h('span', {}, 'Password'), pass), err,
        h('div', { class: 'sbtns' }, h('button', { class: 'btn small plain', onclick: () => { open = null; adding = false; draw(); } }, 'Cancel'), h('button', { class: 'btn small primary', onclick: save }, l ? 'Save' : 'Add password')));
    }
    function draw() {
      box.innerHTML = '';
      if (!L.ok) box.append(h('p', { class: 'err' }, L.broken ? 'Washi couldn\'t unlock your saved passwords (the Keychain said no). They\'re untouched; restart Washi and allow access when macOS asks.' : 'Passwords can\'t be stored securely on this computer.'));
      const note = () => h('p', { class: msg.ok ? 'okay' : 'err' }, (msg.ok ? '✓ ' : '') + msg.text, undo ? h('button', { class: 'link', onclick: async () => { const u = undo; undo = null; await B.setupAct(u); msg = null; load(); } }, ' Undo') : null);
      if (msg && msg.where === 'pw') box.append(note());
      const search = h('input', { class: 'txt pwq', type: 'search', placeholder: `Search ${L.logins.length} saved password${L.logins.length === 1 ? '' : 's'}`, value: q, spellcheck: 'false', 'aria-label': 'Search passwords' });
      search.addEventListener('input', () => { q = search.value; drawList(); });
      search.addEventListener('keydown', e => e.stopPropagation());
      const list = h('div', { class: 'pwlist', role: 'list' });
      function drawList() {
        list.innerHTML = '';
        const want = q.trim().toLowerCase(), rows = L.logins.filter(l => !want || l.host.toLowerCase().includes(want) || l.user.toLowerCase().includes(want));
        if (!L.logins.length) list.append(h('p', { class: 'hint pwempty' }, 'No saved passwords yet. When you sign in to a site, Washi offers to save it.'));
        else if (!rows.length) list.append(h('p', { class: 'hint pwempty' }, 'Nothing matches.'));
        for (const l of rows) {
          const sh = shown.get(l.id);
          const row = h('div', { class: 'pwrow' + (open === l.id ? ' open' : ''), role: 'listitem', 'data-id': l.id },
            h('span', { class: 'pwfav', html: BL.favHTML({ title: l.host, url: l.origin }) }),
            h('span', { class: 'pwt' }, h('b', {}, l.host), h('small', {}, l.user || '(no username)')),
            h('span', { class: 'pwv' + (sh ? ' on' : ''), title: sh ? '' : 'Hidden' }, sh || '•'.repeat(Math.min(12, Math.max(8, l.len)))),
            h('span', { class: 'pwacts' },
              h('button', { class: 'ib', title: sh ? 'Hide' : 'Show', 'aria-label': (sh ? 'Hide' : 'Show') + ' password for ' + l.host, 'data-a': 'show', html: BL.ic('eye', 16), onclick: async () => { if (sh) { shown.delete(l.id); return drawList(); } const r = await B.setupAct({ type: 'pw:reveal', id: l.id }); if (r && r.ok) { shown.set(l.id, r.pass); drawList(); setTimeout(() => { shown.delete(l.id); drawList(); }, 30000); } } }),
              h('button', { class: 'ib', title: 'Copy password', 'aria-label': 'Copy password for ' + l.host, 'data-a': 'copy', html: BL.ic('copy', 16), onclick: async () => { const r = await B.setupAct({ type: 'pw:copy', id: l.id }); if (r && r.ok) say(`Copied the password for ${l.host}. It's cleared from the clipboard in a minute.`); } }),
              h('button', { class: 'ib', title: 'Edit', 'aria-label': 'Edit ' + l.host, 'data-a': 'edit', html: BL.ic('pen', 16), onclick: () => { open = open === l.id ? null : l.id; adding = false; drawList(); } }),
              h('button', { class: 'ib warn', title: 'Delete', 'aria-label': 'Delete password for ' + l.host, 'data-a': 'del', html: BL.ic('trash', 16), onclick: async () => { const r = await B.setupAct({ type: 'pw:delete', id: l.id }); await load(); if (r && r.ok) say(`Deleted the password for ${l.host}.`, true, { type: 'pw:undo', undo: r.undo }); } })));
          list.append(row);
          if (open === l.id) list.append(editor(l));
        }
      }
      drawList();
      box.append(...[h('div', { class: 'pwtop' }, search, h('button', { class: 'btn small', onclick: () => { adding = !adding; open = null; draw(); } }, adding ? 'Cancel' : 'Add password')), adding ? editor(null) : null, list,
        h('div', { class: 'sbtns' },
          h('button', { class: 'btn small', onclick: async () => { const r = await B.setupAct({ type: 'pw:import' }); if (!r) return; if (!r.ok) return say(r.error || 'Couldn\'t import that.', false); await load(); say(`Imported ${r.added} new password${r.added === 1 ? '' : 's'}${r.updated ? ` and updated ${r.updated}` : ''}${r.skipped ? ` (${r.skipped} skipped: no website or password)` : ''}.`); } }, 'Import passwords…'),
          h('button', { class: 'btn small plain', disabled: !L.logins.length, onclick: async () => { const r = await B.setupAct({ type: 'pw:export' }); if (!r) return; if (!r.ok) return say(r.denied ? 'Export cancelled.' : r.error || 'Couldn\'t export.', false); say(`Exported ${r.n} passwords. Anyone who opens that file can read them: delete it when you're done.`); } }, 'Export…'))].filter(Boolean));
      pkbox.innerHTML = '';
      if (msg && msg.where === 'pk') pkbox.append(note());
      if (!L.passkeys.length) pkbox.append(h('p', { class: 'hint' }, 'No passkeys yet. When a site offers to add a passkey (usually in its security settings), Washi saves it here.'));
      for (const p of L.passkeys) pkbox.append(h('div', { class: 'pwrow pk', 'data-id': p.id },
        h('span', { class: 'pwfav', html: BL.favHTML({ title: p.rpId, url: 'https://' + p.rpId }) }),
        h('span', { class: 'pwt' }, h('b', {}, p.rpId), h('small', {}, (p.user || 'Passkey') + ' · used ' + ago(p.used))),
        h('span', { class: 'pwacts' }, h('button', { class: 'ib warn', title: 'Delete passkey', 'aria-label': 'Delete passkey for ' + p.rpId, html: BL.ic('trash', 16), onclick: async () => { const r = await B.setupAct({ type: 'pk:delete', id: p.id }); await load(); if (r && r.ok) say(`Deleted the passkey for ${p.rpId}. Remove it in the site's settings too.`, true, { type: 'pk:undo', undo: r.undo }, 'pk'); } }))));
      nvbox.innerHTML = '';
      if (L.never.length) nvbox.append(field('Never saved for', h('div', { class: 'pwnever' }, L.never.map(o => h('span', { class: 'chipx' }, o.replace(/^https?:\/\//, ''), h('button', { 'aria-label': 'Offer to save on ' + o + ' again', title: 'Offer to save here again', onclick: async () => { await B.setupAct({ type: 'pw:never', origin: o }); load(); } }, '×'))))));
    }
    load();
    return [
      field('Passwords', h('div', { class: 'tgls' },
        toggle('Offer to save passwords', 'When you sign in or sign up, Washi asks whether to keep it', () => P.pwSave !== false, v => setPref({ pwSave: v })),
        toggle('Fill saved passwords', 'Pick an account under a sign-in field to fill it in. Nothing is filled until you pick.', () => P.pwFill !== false, v => setPref({ pwFill: v }))), 'Kept encrypted on this Mac with a key in your Keychain, never sent anywhere. Showing or copying one asks for Touch ID.'),
      field('Saved passwords', box),
      field('Passkeys', h('div', {}, h('div', { class: 'tgls' }, toggle('Use Washi for passkeys', 'Sites can save a passkey in Washi and sign you in with it (with Touch ID)', () => P.passkeys !== false, v => setPref({ passkeys: v }))), pkbox),
        'Passkeys in iCloud Keychain or on your phone can\'t be used by Washi: Apple only lets browsers it has approved use them. Add a Washi passkey alongside them in each site\'s security settings.'),
      nvbox
    ];
  }

  /* ---------- your apps: pick the ones you use; they're pinned (or go in a space that keeps its own logins) ---------- */
  const workSpace = () => SPACES.find(x => x.id === 'work') || SPACES.find(x => /work/i.test(x.name));
  function appPicker(o = {}) {
    const cat = BL.appsFor(INFO), picks = new Map(), wrap = h('div', { class: 'apppick' }); let iconsDone = false;
    const homes = () => [{ v: '', label: 'Pinned' }, ...SPACES.filter(x => x.isolated).map(x => ({ v: x.id, label: x.name + ' logins' }))];
    const dflt = a => { const w = workSpace(); return a.work && w && w.isolated ? w.id : ''; };
    const grid = h('div', { class: 'appgrid', role: 'group', 'aria-label': 'Apps' });
    function draw() {
      grid.innerHTML = '';
      for (const a of cat) {
        const have = HAVE.includes(a.id), on = picks.has(a.id), dest = homes().find(x => x.v === picks.get(a.id)) || homes()[0];
        const icon = h('span', { class: 'aicon', 'data-icon': a.id, html: BL.icons[a.id] || iconsDone ? BL.favHTML({ title: a.n, url: a.url, fav: BL.icons[a.id] || null }) : '<span class="fav wait"></span>' });
        const tag = on ? h('span', { class: 'atag' + (homes().length > 1 ? ' can' : ''), role: homes().length > 1 ? 'button' : null, tabindex: homes().length > 1 ? '0' : null, title: homes().length > 1 ? 'Where it goes: tap to change' : null,
          onclick: e => { e.stopPropagation(); const hs = homes(); if (hs.length < 2) return; const i = hs.findIndex(x => x.v === picks.get(a.id)); picks.set(a.id, hs[(i + 1) % hs.length].v); draw(); } }, dest.label) : null;
        grid.append(h('button', { class: 'apptile' + (on ? ' on' : '') + (have ? ' have' : ''), 'data-app': a.id, 'aria-pressed': String(on), disabled: have, title: have ? 'Already in Washi' : a.n,
          onclick: () => { if (on) picks.delete(a.id); else picks.set(a.id, dflt(a)); draw(); } }, icon, h('b', {}, a.n), have ? h('span', { class: 'atag' }, 'Added') : tag, h('i', { class: 'ack', 'aria-hidden': 'true' })));
      }
      if (o.button) { o.button.disabled = !picks.size; o.button.textContent = picks.size ? `Add ${picks.size} app${picks.size > 1 ? 's' : ''}` : 'Pick some apps'; }
    }
    const commit = () => {
      if (!picks.size) return 0;
      const list = [...picks].map(([id, space]) => ({ id, space }));
      send({ type: 'apps', picks: list }); HAVE = [...HAVE, ...list.map(x => x.id)]; picks.clear(); draw(); return list.length;
    };
    wrap.append(grid); draw();
    /* icons: from the Mac's cache at once, or fetched in the background; each tile fills in by itself (no redraw needed) */
    const fill = () => grid.querySelectorAll('[data-icon]').forEach(sp => { const a = cat.find(x => x.id === sp.dataset.icon); if (a && sp.querySelector('.wait')) sp.innerHTML = BL.favHTML({ title: a.n, url: a.url, fav: BL.icons[a.id] || null }); });
    BL.loadIcons(B, cat).then(() => { iconsDone = true; fill(); });
    return { el: wrap, commit, redraw: draw, count: () => picks.size };
  }
  function workToggle(onChange) {
    const w = workSpace(); if (!w) return null;
    return h('div', { class: 'tgls' }, toggle(`Keep ${w.name}'s logins separate`, `Like a work profile: apps in ${w.name} get their own sign-ins`, () => !!w.isolated, v => { w.isolated = v; send({ type: 'isolate', id: w.id, on: v }); refresh(); onChange && onChange(); }));
  }
  function secApps() {
    const btn = h('button', { class: 'btn primary small' });
    const pk = appPicker({ button: btn });
    const done = h('small', { class: 'okay', hidden: true });
    btn.onclick = () => { const n = pk.commit(); if (n) { done.hidden = false; done.textContent = `✓ Added ${n} app${n > 1 ? 's' : ''}. Sign in to each one from the Today page.`; } };
    return [field('Your apps', h('div', {}, pk.el, workToggle(pk.redraw), h('div', { class: 'sbtns' }, btn, done)), 'Pinned apps sit at the top of the sidebar in every space. An app can go in a space that keeps its own logins instead, so work and personal accounts stay apart.'), secLive()];
  }

  /* ---------- bring bookmarks and history over from Safari, Chrome-type browsers and Firefox ---------- */
  const fmtN = n => Number(n).toLocaleString();
  function importBox(brief) {
    const box = h('div', { class: 'bmi' });
    let found = null, busy = '', msg = null;
    const run = async (key, label) => {
      if (busy) return; busy = key; msg = null; draw();
      const r = key === 'safari' || key === 'file' ? await B.setupAct({ type: 'bm:pick', kind: key }) : await B.setupAct({ type: 'bm:read', key });
      if (!r) { busy = ''; draw(); return; }
      if (!r.ok) { busy = ''; msg = { ok: false, text: r.error || 'Couldn\'t read that.' }; draw(); return; }
      send({ type: 'bmImport', data: { bar: r.bar, other: r.other, history: r.history || [], pw: r.pw || null }, name: key === 'safari' || key === 'file' ? r.name : label });
    };
    hooks.bm = r => { busy = ''; msg = { ok: !!r.ok, text: r.text || r.error }; draw(); };
    const what = b => [b.count && `${fmtN(b.count)} bookmark${b.count === 1 ? '' : 's'}`, b.history && `${fmtN(Math.min(b.history, 3000))} page${b.history === 1 ? '' : 's'} of history`].filter(Boolean).join(' · ');
    function draw() {
      box.innerHTML = '';
      if (msg) box.append(h('p', { class: msg.ok ? 'okay' : 'err' }, (msg.ok ? '✓ ' : '') + msg.text));
      const list = h('div', { class: 'arcl' });
      list.append(h('div', { class: 'arow bmrow' }, h('span', { class: 'an' }, h('b', {}, 'Safari'), h('small', {}, 'In Safari: File › Export Browsing Data to File… (bookmarks, history and passwords), then choose the .zip')),
        h('button', { class: 'btn small', disabled: !!busy, onclick: () => run('safari', 'Safari') }, busy === 'safari' ? 'Bringing it in…' : 'Choose export…')));
      if (found) for (const b of found) {
        const lbl = b.browser + (found.filter(x => x.browser === b.browser).length > 1 ? ` (${b.profile})` : '');
        list.append(h('div', { class: 'arow bmrow' }, h('span', { class: 'an' }, h('b', {}, b.browser), h('small', {}, `${b.profile} · ${what(b)}`)),
          h('button', { class: 'btn small', disabled: !!busy, onclick: () => run(b.key, lbl) }, busy === b.key ? 'Bringing it in…' : 'Import')));
      }
      box.append(list);
      if (!found) box.append(h('p', { class: 'hint' }, 'Looking for other browsers on this Mac…'));
      else if (!found.length && !brief) box.append(h('p', { class: 'hint' }, 'No Chrome, Brave, Edge, Arc, Dia, Helium, Vivaldi, Opera or Firefox found on this Mac.'));
      if (!brief) box.append(h('div', { class: 'sbtns' }, h('button', { class: 'btn small plain', disabled: !!busy, onclick: () => run('file', '') }, busy === 'file' ? 'Bringing them in…' : 'Choose a bookmarks file…')),
        h('p', { class: 'hint' }, 'Any browser\'s bookmarks export (.html) works too. Safari\'s export brings your passwords along; for other browsers, use Settings › Passwords › Import.'));
    }
    B.setupAct({ type: 'bm:scan' }).then(r => { found = Array.isArray(r) ? r : []; draw(); }).catch(() => { found = []; draw(); });
    draw();
    return field(brief ? 'Bring your stuff over' : 'Bring bookmarks and history over', box, brief ? null : 'Reads them straight from the other browser on this Mac. Their bookmarks bar joins yours, the rest go in a folder, and history joins yours. Nothing is doubled up if you do it twice.');
  }

  function secSpeed() {
    const out = h('div', { class: 'speed' }), btn = h('button', { class: 'btn small' }, 'Run a speed check'), copy = h('button', { class: 'btn small plain', hidden: true }, 'Copy report');
    let text = '';
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Checking for 3 seconds…'; out.textContent = '';
      const r = await B.setupAct({ type: 'perf' });
      btn.disabled = false; btn.textContent = 'Run it again';
      const row = (k, v, bad) => h('div', { class: 'srow' + (bad ? ' bad' : '') }, h('span', {}, k), h('b', {}, v));
      out.append(
        row('Graphics acceleration', r.gpu ? 'on' : 'OFF: everything will feel slow', !r.gpu),
        row('Browser busy (worst moment)', r.lagMax + ' ms', r.lagMax > 100),
        row('Washi interface', `${r.ui.cpu}% CPU · ${r.ui.mem} MB`, r.ui.cpu > 15),
        row(`Web pages (${r.pages.n} awake)`, `${r.pages.cpu}% CPU · ${r.pages.mem} MB`, r.pages.cpu > 80),
        row('Graphics process', `${r.gpuProc.cpu}% CPU · ${r.gpuProc.mem} MB`, r.gpuProc.cpu > 40),
        row('Busiest page', r.top ? `${r.top.title} · ${r.top.cpu}% CPU` : '—', r.top && r.top.cpu > 40));
      text = r.text; copy.hidden = false;
    };
    copy.onclick = () => { B.copy(text); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy report'; }, 1200); };
    return field('Speed check', h('div', {}, h('div', { class: 'sbtns speed-btns' }, btn, copy), out),
      'If Washi feels slow, run this while it is slow, then copy the report and send it along. It shows which part is busy.');
  }

  /* ---------- the mini browser used for the live preview and the quick-start drawing ---------- */
  function mini(cls = '') {
    return h('div', { class: 'mb ' + cls, 'aria-hidden': 'true', html: `
      <div class="mb-top"><i class="st on" data-t="side"></i><i class="st"></i><i class="st"></i><i class="st"></i>
        <span class="lb" data-t="url"><em></em>washi.paper/hello</span><i class="st sp" data-t="split"></i></div>
      <div class="mb-side" data-t="sidebar">
        <b class="nm">Home</b>
        <span class="sr"><span class="sc" data-t="scrap"><i>+</i>new scrap</span><b class="sq sun" data-t="today"><svg viewBox="0 0 24 24"><use href="#i-sun"/></svg></b><b class="sq"></b></span>
        <span class="pn" data-t="pins"><i style="--c:#ff6a3d"></i><i style="--c:#3d63ff"></i><i style="--c:#1f9d57"></i><i style="--c:#7b46ff"></i></span>
        <span class="tb on" data-t="tabs"><i style="background:#3d63ff"></i>Recipes</span>
        <span class="tb"><i style="background:#1f9d57"></i>Weather</span>
        <span class="fdw" data-t="folder"><span class="fd"><em class="chv"></em><em class="fic">✈️</em>Trip ideas<small>2</small></span>
          <span class="fdl"><span class="tb"><i style="background:#e89a00"></i>Flights</span><span class="tb"><i style="background:#0e9f9f"></i>Hotels</span></span></span>
        <span class="pr" data-t="pair"><span class="tb"><i style="background:#ff3d8d"></i>Notes</span><span class="tb"><i style="background:#7b46ff"></i>Docs</span></span>
        <span class="sps" data-t="spaces"><i class="on">Home</i><i></i><i></i><i></i></span>
      </div>
      <div class="mb-page" data-t="page"><b></b><i></i><i></i><i class="s"></i><span class="img"></span><i></i><i class="s"></i></div>` });
  }

  /* ---------- quick-start sheet: laid out like the paper insert in a new laptop box ----------
     The browser drawn small in the middle; short handwritten labels in tidy columns, each with a thin leader line ending in a dot. */
  const GW = 1000, GH = 530, MX = 250, MY = 112;           // stage size and where the drawing sits
  const NOTES = [
    // id, title, keys, text, side, label position [x, y, width], target point (drawing coords)
    ['side', 'Float the sidebar', '⌘S', 'Hover the left edge to bring it back.', 'top', [150, 4, 236], [23, 23]],
    ['url', 'Address label', '⌘L', 'Click it to type an address or search.', 'top', [430, 4, 230], [300, 23]],
    ['split', 'Your tools', '', 'Notes, Focus, bookmarks, split… Drag them into any order.', 'top', [690, 4, 236], [477, 23]],
    ['scrap', 'New scrap', '⌘T', 'Search, open a site, or find a tab.', 'left', [0, 160, 228], [14, 94]],
    ['pins', 'Pins', '⌘D', 'Favorites that stay put.', 'left', [0, 228, 228], [14, 125]],
    ['folder', 'Folders', '', 'Drag tabs in. Click its icon for an emoji and color.', 'left', [0, 298, 228], [14, 210]],
    ['pair', 'Split view', '⌘\\', 'Drag a tab onto the page. The pair stays together here.', 'left', [0, 368, 228], [14, 277]],
    ['spaces', 'Spaces', '⌃1–5', 'A desk for each part of your life.', 'left', [0, 450, 228], [14, 379]],
    ['today', 'Today', '⇧⌘H', 'Your landing page: apps, pins and recent tabs. ☀︎ next to New scrap brings it back.', 'right', [772, 150, 228], [490, 96]],
    ['page', 'Your page', '', 'Every tab is a real web page.', 'right', [772, 286, 228], [490, 200]],
    ['yours', 'Make it yours', '⌘,', 'Colors, dark mode, shortcuts and more.', 'right', [772, 448, 228], [496, 360]]
  ];
  function guide() {
    const stage = h('div', { class: 'gstage', style: `width:${GW}px;height:${GH}px` });
    const mb = mini('big'); mb.style.left = MX + 'px'; mb.style.top = MY + 'px'; stage.append(mb);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`); svg.setAttribute('class', 'arrows'); stage.append(svg);
    const KID = { side: 'sidebar', url: 'location', pair: 'split', scrap: 'newtab', pins: 'pin', yours: 'settings', today: 'today' };
    NOTES.forEach(([id, title, keys, text, side, [lx, ly, lw], [tx, ty]], i) => {
      if (KID[id] && KEYMAP[KID[id]] !== undefined) keys = BL.fmtKey(KEYMAP[KID[id]]);
      const lab = h('div', { class: 'gl ' + side, 'data-t': id, style: `left:${lx}px;top:${ly}px;width:${lw}px;--i:${i}` },
        h('h5', {}, h('b', { class: 'n' }, String(i + 1)), title, keys ? h('kbd', {}, keys) : null), h('p', {}, text));
      stage.append(lab);
      const X = MX + tx, Y = MY + ty;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('data-a', id); g.style.setProperty('--i', i);
      g.innerHTML = `<path class="ln"/><circle class="dot" cx="${X}" cy="${Y}" r="4"/>`;
      svg.append(g);
      const hl = on => { mb.querySelector(`[data-t="${id}"]`)?.classList.toggle('lite', on); lab.classList.toggle('lit', on); g.classList.toggle('lit', on); };
      lab.addEventListener('pointerenter', () => hl(true)); lab.addEventListener('pointerleave', () => hl(false));
      lab._line = () => {                                         // leader from the label's edge to the dot, measured after fonts settle
        const w = lab.offsetWidth, hgt = lab.offsetHeight, tw = lab.querySelector('h5').scrollWidth;
        let x1, y1;
        if (side === 'top') { x1 = X; y1 = ly + hgt + 4; }
        else if (side === 'left') { x1 = lx + w + 6; y1 = ly + 15; }
        else { x1 = lx - 6; y1 = ly + 15; }
        const mid = side === 'top' ? `L${X} ${(y1 + Y) / 2}` : `L${(x1 + X) / 2} ${y1}`;
        g.querySelector('.ln').setAttribute('d', side === 'top' ? `M${x1} ${y1} L${X} ${Y - 5}` : `M${x1} ${y1} ${mid} L${X + (side === 'left' ? -5 : 5)} ${Y}`);
        void tw;
      };
    });
    const wrap = h('div', { class: 'gwrap' }, stage);
    const fit = () => { const w = wrap.clientWidth, hh = wrap.clientHeight; if (!w) return; const z = Math.min(w / GW, hh / GH, 1.3); stage.style.transform = `translate(-50%,-50%) scale(${z.toFixed(3)})`; };
    new ResizeObserver(fit).observe(wrap);
    const draw = () => {
      stage.querySelectorAll('.gl').forEach(l => l._line());
      svg.querySelectorAll('.ln').forEach((p, i) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = calm() ? 0 : L; if (!calm()) p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 380, delay: 350 + i * 90, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' }); });
    };
    requestAnimationFrame(() => { fit(); (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(draw)); });
    return wrap;
  }

  /* ---------- paper confetti ---------- */
  function confetti() {
    if (calm()) return;
    const pal = palFor(curSp()), cols = [pal.tape, pal.s2, pal.desk, 'var(--white)', 'var(--ink)'], W = innerWidth;
    for (let i = 0; i < 46; i++) {
      const d = h('i', { class: 'cf-bit', style: `left:${W / 2}px;top:${innerHeight * .42}px;width:${7 + Math.random() * 9}px;height:${4 + Math.random() * 7}px;background:${cols[i % cols.length]}` });
      root.append(d);
      const a = Math.random() * Math.PI * 2, r = 140 + Math.random() * 320;
      d.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * .7 + 160}px)) rotate(${(Math.random() - .5) * 900}deg)`, opacity: 0 }],
        { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' }).onfinish = () => d.remove();
    }
  }

  /* ---------- welcome steps ---------- */
  function pageFor(id) {
    syncs = [];
    if (id === 'hello') return h('div', { class: 'pg hello' },
      h('div', { class: 'scraps', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5, 6].map(i => h('i', { style: `--i:${i}` }))),
      h('div', { class: 'wm' }, h('i', { class: 'tp a' }), h('i', { class: 'tp b' }), 'Washi'),
      h('p', { class: 'lead big' }, 'A browser made of paper scraps.'),
      h('p', { class: 'lead' }, `Let's pick your colors and a couple of settings, then take a quick look around. About a minute, and you can change all of it later in Settings${kh('settings') ? ` (${kh('settings')})` : ''}.`),
      h('div', { class: 'cta' }, h('button', { class: 'btn primary big', onclick: () => go(1) }, 'Let\'s set it up'), h('button', { class: 'link', onclick: finish }, 'Skip, use the defaults')));
    if (id === 'look') return h('div', { class: 'pg two' },
      h('div', { class: 'col' }, h('h2', { class: 'ttl' }, 'Pick your look'), h('p', { class: 'lead' }, 'Everything changes as you click. This is your Home space; every space gets its own colors.'),
        secLook(), field('Home space colors', spaceColors(CUR))),
      h('div', { class: 'prev' }, mini('pv'), h('p', { class: 'cap' }, '↑ live preview')));
    if (id === 'basics') return h('div', { class: 'pg' }, h('h2', { class: 'ttl' }, 'The basics'), h('p', { class: 'lead' }, 'The usual browser settings. Sensible defaults are already picked.'),
      secImport(true), h('div', { class: 'grid2' }, h('div', {}, ...secSearch(), secStartup(), secTabs(true)), h('div', {}, secSidebar(), secBlocking(true), secDownloads(), secDefault())));
    if (id === 'apps') {
      const pk = appPicker();
      appsCommit = () => { pk.commit(); };
      return h('div', { class: 'pg' }, h('h2', { class: 'ttl' }, 'Your apps'), h('p', { class: 'lead' }, 'Pick the apps you use every day. They get pinned, and you sign in to each one once, from the Today page.'),
        h('div', { class: 'grid2 appsgrid' }, h('div', {}, field('Sign in to your apps', h('div', {}, pk.el, workToggle(pk.redraw)))), h('div', {}, importBox(true))));
    }
    if (id === 'tour') {
      const T = [
        ['p:palette', 'Spaces', 'A desk for each part of your life, with its own colors. Swipe sideways on the sidebar to switch.', ''],
        ['i:split', 'Split view', 'Two pages side by side. Or drag a tab onto the page.', 'split'],
        ['i:focus', 'Focus mode', 'The page gets the whole window.', 'focus'],
        ['p:book', 'Reader', 'An article as a clean sheet of paper.', 'reader'],
        ['p:news', 'Sticky notes', 'A note for every space, saved as you type.', 'notes'],
        ['p:camera', 'Snapshot', 'Grab part of a page: copied straight away.', 'snapshot'],
        ['i:sun', 'Today', 'Your landing page: apps, pins, recent tabs.', 'today'],
        ['i:plus', 'Little scraps', 'A small window for a quick look.', 'scrap'],
        ['i:broom', 'Tidy up', 'Lots of tabs? One click sorts them into folders.', ''],
        ['p:music', 'Now playing', 'Music in another tab, playable from the sidebar.', ''],
        ['p:plane', 'Sites in their space', 'Okta always in Work: right-click a tab › Always Open in.', ''],
        ['i:puzzle', 'Chrome extensions', 'From the Chrome Web Store, just like Chrome.', ''],
        ['i:key', 'Passwords and passkeys', 'Saved safely on this Mac, filled in for you.', ''],
        ['i:shield', 'Blocking', 'Ads and trackers blocked, dangerous sites flagged.', ''],
        ['i:bolt', 'Your top bar', 'Drag its buttons into any order; right-click one to hide it.', ''],
        ['i:gear', 'Lots of choices', 'Settings › Features: Focus, Reader, swiping and more.', 'settings']];
      return h('div', { class: 'pg tour' }, h('h2', { class: 'ttl' }, 'What Washi can do'), h('p', { class: 'lead' }, 'A quick look at what\'s in here. Everything is in the menus too, with its shortcut.'),
        h('div', { class: 'tourg' }, T.map(([icon, t, p, k], i) => h('div', { class: 'tc', style: `--i:${i}` }, h('span', { class: 'nic', html: newsIcon(icon) }), h('div', { class: 'tt' }, h('b', {}, t, kh(k) ? h('kbd', {}, kh(k)) : null), h('p', {}, p))))));
    }
    if (id === 'guide') return h('div', { class: 'pg gpage' }, h('div', { class: 'ghead' }, h('h2', { class: 'ttl' }, 'Quick-start guide'), h('p', { class: 'lead' }, 'Here\'s what everything is. Point at a note to light up its spot.')), guide());
    if (id === 'done') {
      setTimeout(confetti, 250);
      return h('div', { class: 'pg done' }, h('h2', { class: 'ttl huge' }, 'You\'re all set!'),
        h('div', { class: 'tips' }, [[kh('newtab') || '⌘T', 'Open a new scrap', 'Type an address or anything to search.'], ['drag', 'Split two pages', 'Drag a tab from the sidebar onto the page.'], [kh('settings') || '⌘,', 'Change anything', 'Colors, the top bar, Focus mode: all in Settings.']]
          .map(([k, t, p], i) => h('div', { class: 'tip', style: `--i:${i}` }, h('kbd', {}, k), h('b', {}, t), h('p', {}, p)))),
        h('p', { class: 'lead' }, 'Lost? Help → Quick-Start Guide shows the map again.'),
        h('button', { class: 'btn primary big', onclick: finish }, 'Start browsing'));
    }
  }
  function go(n, dir) {
    if (appsCommit) { appsCommit(); appsCommit = null; }               // leaving "Your apps": add what was picked
    n = Math.max(0, Math.min(STEPS.length - 1, n)); dir = dir || (n >= step ? 1 : -1); step = n;
    const old = body.firstElementChild, pg = pageFor(STEPS[n][0]);
    body.append(pg);
    if (old) {
      if (calm()) old.remove();
      else {
        old.style.pointerEvents = 'none';
        old.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 60}px) rotate(${-dir * 2}deg)`, opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).onfinish = () => old.remove();
        pg.animate([{ transform: `translateX(${dir * 80}px) rotate(${dir * 2.5}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: BL.SP.ms, delay: 90, easing: BL.SP.css, fill: 'backwards' });
      }
    }
    sheet.querySelectorAll('.crumb').forEach((c, i) => { c.classList.toggle('on', i === n); c.classList.toggle('past', i < n); });
    sheet.classList.toggle('hello-on', n === 0); sheet.classList.toggle('done-on', n === STEPS.length - 1);
    const back = sheet.querySelector('.back'), next = sheet.querySelector('.next');
    back.hidden = n <= 1; next.textContent = n === STEPS.length - 2 ? 'Finish' : 'Next';
  }
  function buildOnboard() {
    sheet = h('div', { class: 'sheet ob' }, h('i', { class: 'tp l' }), h('i', { class: 'tp r' }),
      h('header', { class: 'crumbs' }, STEPS.map(([, n], i) => h('button', { class: 'crumb', onclick: () => { if (i > 0) go(i); } }, n)), h('button', { class: 'link skip', onclick: finish }, 'Skip setup')),
      body = h('div', { class: 'body' }),
      h('footer', { class: 'nav' }, h('button', { class: 'btn back', onclick: () => go(step - 1) }, 'Back'), h('span', { class: 'fill' }), h('button', { class: 'btn primary next', onclick: () => go(step + 1) }, 'Next')));
    root.append(sheet); step = 0; go(0);
  }

  /* ---------- Settings ---------- */
  function buildSettings(startAt) {
    syncs = [];
    const secs = [
      ['look', 'Look', () => secLook()],
      ['toolbar', 'Top bar', () => secToolbar()],
      ['features', 'Features', () => secFeatures()],
      ['spaces', 'Spaces', () => SPACES.map(x => field(x.name + (x.id === CUR ? ' (current)' : ''), h('div', {}, spaceColors(x.id), h('div', { class: 'tgls' }, toggle('Keep this space\'s logins separate', 'Its own cookies and sign-ins, like a separate browser profile: handy for work and personal accounts', () => !!x.isolated, v => { x.isolated = v; send({ type: 'isolate', id: x.id, on: v }); refresh(); })), routesFor(x.id))))],
      ['search', 'Search & startup', () => [...secSearch(), secStartup()]],
      ['tabs', 'Tabs', () => secTabs()],
      ['browser', 'Browser', () => [secSidebar(), secDownloads(), secDefault()]],
      ['privacy', 'Privacy & security', () => [secBlocking(), ...secSecurity(), secPerms(), secData()]],
      ['apps', 'Apps', () => secApps()],
      ['passwords', 'Passwords', () => secPasswords()],
      ['extensions', 'Extensions', () => secExtensions()],
      ['bookmarks', 'Bookmarks', () => secBookmarks()],
      ['keys', 'Shortcuts', () => secKeys()],
      ['import', 'Import', () => secImport()],
      ['help', 'Help', () => [
        field('Quick-start guide', h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => open({ page: 'guide' }, true) }, 'Show the guide'), h('button', { class: 'btn', onclick: () => open({ page: 'news' }, true) }, 'What\'s new'), h('button', { class: 'btn', onclick: () => open({ page: 'onboard' }, true) }, 'Run the welcome setup again'))),
        field('Start fresh', h('div', {}, h('p', { class: 'hint' }, 'Erase every tab, space, setting and cookie and start Washi as if it was just installed.'), h('button', { class: 'btn warn', onclick: () => B.setupAct({ type: 'startFresh' }) }, 'Start fresh…'))),
        ...secAbout(), secSpeed()]]
    ];
    const scroll = h('div', { class: 'scroll' }, secs.map(([id, n, f]) => h('section', { class: 'sec', id: 'sec-' + id }, h('h3', {}, n), f())));
    const rail = h('nav', { class: 'rail' }, secs.map(([id, n]) => h('button', { 'data-s': id, onclick: () => { scroll.querySelector('#sec-' + id).scrollIntoView({ behavior: calm() ? 'auto' : 'smooth' }); } }, n)));
    const mark = () => { let cur = secs[0][0]; for (const [id] of secs) if (scroll.querySelector('#sec-' + id).offsetTop - scroll.scrollTop < 140) cur = id; if (scroll.scrollTop > 0 && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) cur = secs[secs.length - 1][0];   /* at the very bottom: the last section, even if it's short */ rail.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === cur)); };
    scroll.addEventListener('scroll', mark, { passive: true });
    sheet = h('div', { class: 'sheet set' }, h('i', { class: 'tp l' }), h('i', { class: 'tp r' }),
      h('header', { class: 'shead' }, h('h2', { class: 'ttl' }, 'Settings'), h('button', { class: 'xx', 'aria-label': 'Close settings', onclick: finish }, '×')),
      h('div', { class: 'cols' }, rail, scroll));
    root.append(sheet); mark();
    if (startAt) requestAnimationFrame(() => scroll.querySelector('#sec-' + startAt)?.scrollIntoView());
  }
  /* ---------- What's new: "Fresh off the press", after an update (and Help › What's New) ---------- */
  const vnum = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
  const newer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  function newsIcon(icon) { const s = String(icon || ''); return s.startsWith('p:') ? BL.fIcon(s, 22) : BL.ic(s.replace(/^i:/, '') || 'star', 21); }
  function newsCard(it, i) {
    const keys = (it.keys || []).map(id => KEYMAP[id] ? BL.fmtKey(KEYMAP[id]) : '').filter(Boolean);
    return h('article', { class: 'nwc', style: `--i:${i}` },
      h('span', { class: 'nic', html: newsIcon(it.icon) }),
      h('div', { class: 'nwt' }, h('h5', {}, it.title), h('p', {}, it.text),
        it.how || keys.length ? h('p', { class: 'how' }, h('b', {}, 'How: '), it.how || '', ...keys.map(k => h('kbd', {}, k))) : null,
        it.point ? h('button', { class: 'btn small', onclick: () => { finish(); setTimeout(() => B.overlayResult({ kind: 'coach', point: it.point, title: it.title, tip: it.tip || it.how || '', keys: it.keys || [] }), 260); } }, 'Show me')
          : it.try ? h('button', { class: 'btn small', onclick: () => { finish(); setTimeout(() => B.overlayResult({ kind: 'cmd', cmd: it.try }), 250); } }, 'Try it') : null));
  }
  function buildNews(since) {
    const all = window.WHATSNEW || [], fresh = since ? all.filter(r => newer(r.v, since)) : all.slice(0, 1), show = fresh.length ? fresh : all.slice(0, 1), older = all.filter(r => !show.includes(r));
    let n = 0;
    const fixes = r => (r.fixes || []).length ? h('div', { class: 'nwfx', style: `--i:${n++}` }, h('h4', {}, (r.items || []).length ? 'Also fixed and polished' : 'Fixes and polish'), h('ul', {}, r.fixes.map(f => h('li', { html: BL.ic('check', 14) + '<span>' + BL.esc(f) + '</span>' })))) : null;
    const rel = (r, first) => h('div', { class: 'nwr' }, first ? null : h('h3', { class: 'nwv' }, h('span', {}, 'Washi ' + r.v), h('small', {}, r.lead || '')), (r.items || []).length ? h('div', { class: 'nwg' }, r.items.map(it => newsCard(it, n++))) : null, fixes(r));
    const earlier = h('div', { class: 'nwold' });
    const more = older.length ? h('button', { class: 'lnk', onclick: () => { more.remove(); n = 0; earlier.append(...older.map(r => rel(r, false))); } }, 'Earlier updates') : null;
    sheet = h('div', { class: 'sheet nw' }, h('i', { class: 'tp l' }), h('i', { class: 'tp r' }),
      h('header', { class: 'shead' }, h('span', { class: 'stampv' }, 'Washi ' + (show[0] ? show[0].v : INFO.version || '')), h('h2', { class: 'ttl' }, 'Fresh off the press'), h('p', { class: 'lead' }, (show[0] && show[0].lead) || 'What\'s new in Washi.'), h('button', { class: 'xx', 'aria-label': 'Close', onclick: finish }, '×')),
      h('div', { class: 'body' }, h('div', { class: 'pg npage' }, ...show.map((r, i) => rel(r, i === 0)), earlier, more)),
      h('footer', { class: 'nav' }, h('span', { class: 'hint' }, 'Any time: Help › What\'s New'), h('span', { class: 'fill' }), h('button', { class: 'btn primary', onclick: finish }, 'Got it')));
    root.append(sheet);
  }
  function buildGuide() {
    syncs = [];
    sheet = h('div', { class: 'sheet gd' }, h('i', { class: 'tp l' }), h('i', { class: 'tp r' }),
      h('header', { class: 'shead' }, h('h2', { class: 'ttl' }, 'Quick-start guide'), h('p', { class: 'lead' }, 'Point at a note to light up its spot.'), h('button', { class: 'xx', 'aria-label': 'Close the guide', onclick: finish }, '×')),
      h('div', { class: 'body' }, h('div', { class: 'pg gpage' }, guide())),
      h('footer', { class: 'nav' }, h('span', { class: 'fill' }), h('button', { class: 'btn primary', onclick: finish }, 'Got it')));
    root.append(sheet);
  }

  /* ---------- open / close ---------- */
  function open(d, inPlace) {
    if (!inPlace) { P = prefsOf(d.prefs); SPACES = (d.spaces || []).map(x => ({ ...x })); CUR = d.cur; DOCK = d.dock !== false; INFO = d.info || {}; KEYMAP = d.keys || {}; HAVE = d.apps || []; }
    PAGE = d.page || 'onboard';
    root.innerHTML = ''; retheme();
    if (PAGE === 'settings') buildSettings(d.section); else if (PAGE === 'guide') buildGuide(); else if (PAGE === 'news') buildNews(d.section); else buildOnboard();
    root.classList.add('on'); isOpen = true;
    sheet.tabIndex = -1; setTimeout(() => sheet.focus({ preventScroll: true }), 60);
  }
  function finish() {
    if (!isOpen) return; isOpen = false;
    if (appsCommit) { appsCommit(); appsCommit = null; }
    const s = sheet;
    const done = () => { root.classList.remove('on'); root.innerHTML = ''; syncs = []; B.overlayResult({ kind: 'setup', page: PAGE }); };
    if (calm() || !s) done();
    else s.animate([{ transform: 'rotate(-.3deg)', opacity: 1 }, { transform: 'translateY(30px) rotate(2deg) scale(.97)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).onfinish = done;
  }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (PAGE !== 'onboard') finish(); return; }
    if (PAGE === 'onboard' && e.key === 'Enter' && !/INPUT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); if (step === STEPS.length - 1) finish(); else go(step + 1); }
  }
  return { open, isOpen: () => isOpen, key, finish };
})();
