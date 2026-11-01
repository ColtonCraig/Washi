'use strict';
/* Welcome setup, Settings and the quick-start guide. Drawn in the overlay view, on paper.
   Every change applies live: this view re-themes itself and tells the shell, which re-themes the window and the sidebar and saves. */
window.SETUP = (() => {
  const B = window.washi, BL = window.BL;
  const { esc, PAL, KEYS, palFor, palOf, applyTheme, PRESETS, ENGINES, isDark, prefsOf } = BL;
  const root = document.getElementById('setup');
  let P = null, SPACES = [], CUR = null, DOCK = true, INFO = {}, KEYMAP = {}, PAGE = 'onboard', step = 0, syncs = [], isOpen = false, sheet = null, body = null;

  const hooks = { perms: null, update: null, arc: null };
  B.onSetupEvent(e => { if (e && e.type === 'arcDone' && hooks.arc) hooks.arc(e); });
  B.onPerms(l => hooks.perms && hooks.perms(l)); B.onUpdate(u => hooks.update && hooks.update(u));
  const STEPS = [['hello', 'Hello'], ['look', 'Look'], ['basics', 'Basics'], ['guide', 'Quick start'], ['done', 'Done']];
  const curSp = () => SPACES.find(x => x.id === CUR) || SPACES[0];
  const retheme = () => applyTheme(P, palFor(curSp()));
  const send = m => B.setupMsg(m);
  const refresh = () => syncs.forEach(f => f());
  const modeKey = () => isDark(P) ? 'dark' : 'light';
  const calm = () => BL.motion.off || matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        toggle('Wonky scraps', 'Tabs sit a little crooked, like real paper', () => P.wobble, v => setPref({ wobble: v })),
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
      () => DOCK, v => { DOCK = v; send({ type: 'dock', dock: v }); refresh(); }, 'wide'), 'Switch any time with ⌘S.');
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
    const NAMES = { media: 'Camera & mic', geolocation: 'Location', notifications: 'Notifications', 'clipboard-read': 'Clipboard', midi: 'MIDI', midiSysex: 'MIDI control', 'display-capture': 'Screen recording', 'idle-detection': 'Idle detection', hid: 'HID devices', serial: 'Serial ports', usb: 'USB devices' };
    const draw = list => {
      box.innerHTML = '';
      if (!list || !list.length) { box.append(h('p', { class: 'hint' }, 'No sites have asked for anything yet. When one does, your answer shows up here.')); return; }
      for (const { origin, perms } of list) box.append(h('div', { class: 'perm' }, h('b', {}, origin.replace(/^https:\/\//, '')),
        h('span', { class: 'chips' }, Object.entries(perms).map(([k, v]) => h('button', { class: 'chip ' + v, title: 'Forget this choice', onclick: async () => draw(await B.setupAct({ type: 'perm:reset', origin, perm: k })) }, (v === 'allow' ? '✓ ' : '✕ ') + (NAMES[k] || k), h('i', {}, '×')))),
        h('button', { class: 'lnk', onclick: async () => draw(await B.setupAct({ type: 'perm:reset', origin })) }, 'Reset')));
    };
    draw(INFO.perms || []); hooks.perms = draw;
    return field('Site permissions', box, 'Click a choice to forget it; the site will ask again next time.');
  }
  function secDownloads() {
    return field('Downloads', seg([{ v: false, label: 'Save to Downloads', sub: 'No questions asked' }, { v: true, label: 'Ask where to save', sub: 'Pick a folder each time' }], () => P.askDownload, v => setPref({ askDownload: v }), 'wide'));
  }
  const ARCHIVE_OPTS = [{ v: 0, label: 'Never' }, { v: 12, label: 'After 12 hours' }, { v: 24, label: 'After a day' }, { v: 168, label: 'After a week' }, { v: 720, label: 'After 30 days' }];
  function secTabs(brief) {
    const arch = field('Tidy up old tabs', seg(ARCHIVE_OPTS, () => +P.archive, v => setPref({ archive: v }), 'grid'),
      'Tabs you haven\'t opened in a while move to the Archive (⌥⌘A), so your sidebar stays clean. Pinned tabs and folders are never touched.');
    if (brief) return arch;
    return [arch,
      field('Sleeping tabs', seg([{ v: 0, label: 'Never' }, { v: 15, label: 'After 15 min' }, { v: 60, label: 'After 1 hour' }, { v: 240, label: 'After 4 hours' }], () => +P.sleep, v => setPref({ sleep: v }), 'grid'),
        'Tabs you aren\'t using stop running to save memory and battery. They reload when you click them. Tabs playing sound never sleep.'),
      field('Video', toggle('Picture in picture when switching tabs', 'A playing video keeps going in a small floating window', () => P.autoPip, v => setPref({ autoPip: v }))),
      secLive(),
      field('Little scraps', toggle('Open links from other apps in a little scrap', 'A small window you can glance at and close, or keep with ⌘O. Needs Washi as your default browser.', () => P.scrapLinks, v => setPref({ scrapLinks: v })),
        'Open one any time with ⌥⌘N.')];
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
    const GROUPS = [['app', 'Washi'], ['file', 'Tabs and spaces'], ['edit', 'Editing'], ['view', 'View'], ['history', 'History'], ['spaces', 'Moving around']];
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
    return field('Updates', h('div', {}, h('p', { class: 'ver' }, h('b', {}, 'Washi ' + (INFO.version || '')), h('small', {}, ` · Chromium ${INFO.chrome || ''} · Electron ${INFO.electron || ''}`)), st, btn),
      'Each update brings the newest Chromium security fixes. Updates download in the background; you choose when to restart.');
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
    return field('Live folders', out, 'Live folders fill themselves from GitHub pull requests or any RSS/Atom feed (make one from the folder button in the sidebar). Public repos need nothing; for private ones, add a token that can read pull requests.');
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
        <span class="sc" data-t="scrap"><i>+</i>new scrap</span>
        <span class="pn" data-t="pins"><i style="--c:#ff6a3d"></i><i style="--c:#3d63ff"></i><i style="--c:#1f9d57"></i><i style="--c:#7b46ff"></i></span>
        <span class="tb on" data-t="tabs"><i style="background:#3d63ff"></i>Recipes</span>
        <span class="tb"><i style="background:#1f9d57"></i>Weather</span>
        <span class="fd" data-t="folder">Trip ideas</span>
        <span class="tb in"><i style="background:#e89a00"></i>Flights</span>
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
    ['split', 'Split view', '⌘\\', 'Or drag any tab onto the page.', 'top', [690, 4, 236], [477, 23]],
    ['scrap', 'New scrap', '⌘T', 'Search, open a site, or find a tab.', 'left', [0, 160, 228], [14, 94]],
    ['pins', 'Pins', '⌘D', 'Favorites that stay put.', 'left', [0, 228, 228], [14, 125]],
    ['folder', 'Folders', '', 'Drag tabs in to group them.', 'left', [0, 298, 228], [14, 210]],
    ['pair', 'Split cards', '', 'Split tabs stay together here.', 'left', [0, 368, 228], [14, 277]],
    ['spaces', 'Spaces', '⌃1–5', 'A desk for each part of your life.', 'left', [0, 450, 228], [14, 379]],
    ['page', 'Your page', '', 'Every tab is a real web page.', 'right', [772, 286, 228], [490, 200]],
    ['yours', 'Make it yours', '⌘,', 'Colors, dark mode, shortcuts and more.', 'right', [772, 448, 228], [496, 360]]
  ];
  function guide() {
    const stage = h('div', { class: 'gstage', style: `width:${GW}px;height:${GH}px` });
    const mb = mini('big'); mb.style.left = MX + 'px'; mb.style.top = MY + 'px'; stage.append(mb);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`); svg.setAttribute('class', 'arrows'); stage.append(svg);
    const KID = { side: 'sidebar', url: 'location', split: 'split', scrap: 'newtab', pins: 'pin', yours: 'settings' };
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
      h('p', { class: 'lead' }, 'Let\'s pick your colors and a couple of settings, then take a quick look around. About a minute, and you can change all of it later in Settings (⌘,).'),
      h('div', { class: 'cta' }, h('button', { class: 'btn primary big', onclick: () => go(1) }, 'Let\'s set it up'), h('button', { class: 'link', onclick: finish }, 'Skip, use the defaults')));
    if (id === 'look') return h('div', { class: 'pg two' },
      h('div', { class: 'col' }, h('h2', { class: 'ttl' }, 'Pick your look'), h('p', { class: 'lead' }, 'Everything changes as you click. This is your Home space; every space gets its own colors.'),
        secLook(), field('Home space colors', spaceColors(CUR))),
      h('div', { class: 'prev' }, mini('pv'), h('p', { class: 'cap' }, '↑ live preview')));
    if (id === 'basics') return h('div', { class: 'pg' }, h('h2', { class: 'ttl' }, 'The basics'), h('p', { class: 'lead' }, 'The usual browser settings. Sensible defaults are already picked.'),
      secImport(true), h('div', { class: 'grid2' }, h('div', {}, ...secSearch(), secStartup(), secTabs(true)), h('div', {}, secSidebar(), secBlocking(true), secDownloads(), secDefault())));
    if (id === 'guide') return h('div', { class: 'pg gpage' }, h('div', { class: 'ghead' }, h('h2', { class: 'ttl' }, 'Quick-start guide'), h('p', { class: 'lead' }, 'Here\'s what everything is. Point at a note to light up its spot.')), guide());
    if (id === 'done') {
      setTimeout(confetti, 250);
      return h('div', { class: 'pg done' }, h('h2', { class: 'ttl huge' }, 'You\'re all set!'),
        h('div', { class: 'tips' }, [['⌘T', 'Open a new scrap', 'Type an address or anything to search.'], ['drag', 'Split two pages', 'Drag a tab from the sidebar onto the page.'], ['⌘,', 'Change anything', 'Colors, search, sidebar: all in Settings.']]
          .map(([k, t, p], i) => h('div', { class: 'tip', style: `--i:${i}` }, h('kbd', {}, k), h('b', {}, t), h('p', {}, p)))),
        h('p', { class: 'lead' }, 'Lost? Help → Quick-Start Guide shows the map again.'),
        h('button', { class: 'btn primary big', onclick: finish }, 'Start browsing'));
    }
  }
  function go(n, dir) {
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
      ['spaces', 'Spaces', () => SPACES.map(x => field(x.name + (x.id === CUR ? ' (current)' : ''), h('div', {}, spaceColors(x.id), h('div', { class: 'tgls' }, toggle('Keep this space\'s logins separate', 'Its own cookies and sign-ins, like a separate browser profile: handy for work and personal accounts', () => !!x.isolated, v => { x.isolated = v; send({ type: 'isolate', id: x.id, on: v }); refresh(); })))))],
      ['search', 'Search & startup', () => [...secSearch(), secStartup()]],
      ['tabs', 'Tabs', () => secTabs()],
      ['browser', 'Browser', () => [secSidebar(), secDownloads(), secDefault()]],
      ['privacy', 'Privacy & security', () => [secBlocking(), ...secSecurity(), secPerms(), secData()]],
      ['keys', 'Shortcuts', () => secKeys()],
      ['import', 'Import', () => secImport()],
      ['help', 'Help', () => [
        field('Quick-start guide', h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => open({ page: 'guide' }, true) }, 'Show the guide'), h('button', { class: 'btn', onclick: () => open({ page: 'onboard' }, true) }, 'Run the welcome setup again'))),
        field('Start fresh', h('div', {}, h('p', { class: 'hint' }, 'Erase every tab, space, setting and cookie and start Washi as if it was just installed.'), h('button', { class: 'btn warn', onclick: () => B.setupAct({ type: 'startFresh' }) }, 'Start fresh…'))),
        secAbout(), secSpeed()]]
    ];
    const scroll = h('div', { class: 'scroll' }, secs.map(([id, n, f]) => h('section', { class: 'sec', id: 'sec-' + id }, h('h3', {}, n), f())));
    const rail = h('nav', { class: 'rail' }, secs.map(([id, n]) => h('button', { 'data-s': id, onclick: () => { scroll.querySelector('#sec-' + id).scrollIntoView({ behavior: calm() ? 'auto' : 'smooth' }); } }, n)));
    const mark = () => { let cur = secs[0][0]; for (const [id] of secs) if (scroll.querySelector('#sec-' + id).offsetTop - scroll.scrollTop < 140) cur = id; rail.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === cur)); };
    scroll.addEventListener('scroll', mark, { passive: true });
    sheet = h('div', { class: 'sheet set' }, h('i', { class: 'tp l' }), h('i', { class: 'tp r' }),
      h('header', { class: 'shead' }, h('h2', { class: 'ttl' }, 'Settings'), h('button', { class: 'xx', 'aria-label': 'Close settings', onclick: finish }, '×')),
      h('div', { class: 'cols' }, rail, scroll));
    root.append(sheet); mark();
    if (startAt) requestAnimationFrame(() => scroll.querySelector('#sec-' + startAt)?.scrollIntoView());
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
    if (!inPlace) { P = prefsOf(d.prefs); SPACES = (d.spaces || []).map(x => ({ ...x })); CUR = d.cur; DOCK = d.dock !== false; INFO = d.info || {}; KEYMAP = d.keys || {}; }
    PAGE = d.page || 'onboard';
    root.innerHTML = ''; retheme();
    if (PAGE === 'settings') buildSettings(d.section); else if (PAGE === 'guide') buildGuide(); else buildOnboard();
    root.classList.add('on'); isOpen = true;
    sheet.tabIndex = -1; setTimeout(() => sheet.focus({ preventScroll: true }), 60);
  }
  function finish() {
    if (!isOpen) return; isOpen = false;
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
