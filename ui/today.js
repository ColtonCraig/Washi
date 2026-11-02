'use strict';
/* Today: the page you see when no scrap is open in a space (after setup, in a new window, or with ⇧⌘H).
   A greeting, a big search, the apps you still need to sign in to, your pinned apps, what you had open recently,
   bookmarks, and (with GitHub connected) pull requests waiting on you. Drawn by the shell, so nothing here is a
   web page and nothing loads from the internet except site icons. Uses the shell's state (S, R) directly. */
window.TODAY = (() => {
  const el = document.getElementById('today');
  const { esc, favHTML, hostOf, ic } = window.BL;
  let key = '', shownAt = 0, status = {}, statusAt = 0, statusBusy = false, gh = null, ghAt = 0, ghBusy = false, wasOpen = false, timer = 0;
  const visible = () => !!S && !R.a;
  const greeting = d => { const h = d.getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  /* ---------- your apps, and whether you're signed in ---------- */
  function picked() {
    const cat = appCat(), on = S.prefs.apps || {};
    return cat.filter(a => on[a.id] && appTabsOf(a.id).length && (!on[a.id].space || on[a.id].space === S.cur))      // pinned ones, and this space's own
      .map(a => ({ ...a, tab: appTabsOf(a.id)[0], space: on[a.id].space || '' }));
  }
  function signedIn(a) {
    if (a.cookie) return !!status[a.id];
    const t = S.tabs[a.tab]; if (!t || !t.appSeen) return false;              // only once the page has really loaded
    const host = hostOf(a.url);
    return hostOf(t.url) === host && !(a.login && a.login.test(t.url));
  }
  async function checkStatus(force) {
    if (statusBusy || (!force && Date.now() - statusAt < 4000)) return;
    const list = picked().filter(a => a.cookie); if (!list.length) return;
    statusBusy = true;
    try {
      const sp = id => { const s = id && S.spaces.find(x => x.id === id); return s && s.isolated ? { id: s.id, isolated: true } : null; };
      const r = await B.setupAct({ type: 'apps:status', apps: list.map(a => ({ id: a.id, cookie: a.cookie, space: sp(a.space) })) });
      if (r && typeof r === 'object') status = r;
    } catch {}
    statusAt = Date.now(); statusBusy = false; key = ''; draw();
  }
  /* ---------- GitHub ---------- */
  async function loadGitHub(force) {
    if (ghBusy || !(R.info && R.info.ghToken) || (!force && gh && Date.now() - ghAt < 5 * 60e3)) return;
    ghBusy = true; key = ''; draw();
    try { gh = await B.setupAct({ type: 'github:today' }); } catch (e) { gh = { ok: false, error: 'Couldn\'t reach GitHub.' }; }
    ghAt = Date.now(); ghBusy = false; key = ''; draw();
  }

  /* ---------- drawing ---------- */
  const row = (attrs, fav, title, sub) => `<button class="trow" ${attrs}>${fav}<span class="tx"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  function sections() {
    const s = sp(), now = new Date(), out = { head: '', cards: [] };
    out.head = `<header class="thead"><i class="ttape" aria-hidden="true"></i><h1>${greeting(now)}</h1>
      <p>${esc(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${esc(s.name)}</p></header>
      <button class="tsearch" data-a="search">${ic('search', 18)}<span>Search or type an address</span><kbd>⌘T</kbd></button>`;
    // sign in to your apps
    const apps = picked(), todo = apps.filter(a => !signedIn(a));
    if (apps.length && todo.length && !S.prefs.appsHide) {
      out.signin = `<section class="tcard tsign"><div class="tch"><h2>Sign in to your apps</h2><span class="tprog">${apps.length - todo.length} of ${apps.length}</span><button class="tlink" data-a="hideSign">Hide</button></div>
        <div class="tapps">${apps.map(a => { const ok = signedIn(a); return `<button class="tapp${ok ? ' ok' : ''}" data-a="signin" data-id="${a.id}" title="${ok ? `Signed in to ${esc(a.n)}` : `Sign in to ${esc(a.n)}`}">${favHTML({ title: a.n, url: a.url, fav: BL.appIcon(a) })}<b>${esc(a.n)}</b><em>${ok ? '✓ signed in' : 'Sign in'}</em></button>`; }).join('')}</div></section>`;
    }
    // pinned
    const pins = S.pins.filter(id => S.tabs[id]);
    if (pins.length) out.cards.push(['pins', `<section class="tcard"><h2>Pinned</h2><div class="tpins">${pins.map(id => { const t = S.tabs[id]; return `<button class="tpin" data-a="tab" data-id="${id}" title="${esc(t.title || hostOf(t.url))}">${favHTML({ title: t.title, url: t.url, fav: t.fav || (t.app ? BL.appIcon(appCat().find(a => a.id === t.app) || {}) : null) })}<span>${esc(t.title || hostOf(t.url))}</span></button>`; }).join('')}</div></section>`]);
    // jump back in: tabs in this space, newest first; else recent history
    const tabs = spaceTabs(s).filter(id => S.tabs[id]).sort((a, b) => (S.tabs[b].seen || 0) - (S.tabs[a].seen || 0)).slice(0, 6);
    if (tabs.length) out.cards.push(['recent', `<section class="tcard"><h2>Jump back in</h2>${tabs.map(id => { const t = S.tabs[id]; return row(`data-a="tab" data-id="${id}"`, favHTML({ title: t.title, url: t.url, fav: t.fav }), t.title || hostOf(t.url), hostOf(t.url)); }).join('')}</section>`]);
    else if (S.history.length) out.cards.push(['recent', `<section class="tcard"><h2>Recently visited</h2>${S.history.slice(0, 6).map(h => row(`data-a="url" data-url="${esc(h.url)}"`, favHTML({ title: h.title, url: h.url, fav: h.fav }), h.title || hostOf(h.url), hostOf(h.url))).join('')}</section>`]);
    // GitHub
    const ghPicked = !!(S.prefs.apps && S.prefs.apps.github);           // in any space
    if (R.info && R.info.ghToken) {
      let body;
      if (!gh) body = `<p class="tnote">Checking GitHub…</p>`;
      else if (!gh.ok) body = `<p class="tnote err">${esc(gh.error || 'Couldn\'t reach GitHub.')}</p><button class="tlink" data-a="ghRetry">Try again</button>`;
      else {
        const list = (name, x, empty) => `<h3>${name}${x.total ? ` <span>${x.total}</span>` : ''}</h3>` + (x.items.length ? x.items.slice(0, 5).map(i => row(`data-a="url" data-url="${esc(i.url)}"`, `<span class="tpr${i.draft ? ' draft' : ''}">${ic('split', 13)}</span>`, i.title, `${i.repo} #${i.number}${i.draft ? ' · draft' : ''}`)).join('') : `<p class="tnote">${empty}</p>`);
        body = list('Waiting on your review', gh.reviews, 'Nothing waiting on you.') + list('Your open pull requests', gh.mine, 'None open right now.');
      }
      out.cards.push(['gh', `<section class="tcard tgh"><div class="tch"><h2>GitHub</h2>${ghBusy ? '<span class="tprog">updating…</span>' : `<button class="tlink" data-a="ghRetry" title="Check again">Refresh</button>`}</div>${body}</section>`]);
    } else if (ghPicked) {
      out.cards.push(['gh', `<section class="tcard tgh"><h2>GitHub</h2><p class="tnote">Connect GitHub to see pull requests waiting on your review, right here.</p><button class="tbtn" data-a="ghConnect">Connect GitHub</button></section>`]);
    }
    // bookmarks
    const bms = S.bookmarks.slice(0, 12);
    if (bms.length) out.cards.push(['bm', `<section class="tcard"><h2>Bookmarks</h2><div class="tbms">${bms.map(b => b.type === 'folder'
      ? `<button class="tbm fold" data-a="bm" data-id="${b.id}" ${BMK.okColor(b.color) ? `style="--fc:${b.color}"` : ''}>${b.icon ? `<span class="emo">${esc(b.icon)}</span>` : ic('folder', 14)}<span>${esc(b.name)}</span></button>`
      : `<button class="tbm" data-a="bm" data-id="${b.id}">${favHTML({ title: b.title, url: b.url, fav: b.fav || null })}<span>${esc(b.title || hostOf(b.url))}</span></button>`).join('')}</div></section>`]);
    if (!out.cards.length && !out.signin) out.cards.push(['tips', `<section class="tcard ttips"><h2>A fresh desk</h2><p class="tnote">Press <kbd>⌘T</kbd> to open your first scrap, or add the apps you use every day.</p><button class="tbtn" data-a="apps">Add apps</button></section>`]);
    return out;
  }
  function draw() {
    if (!el) return;
    const on = visible();
    el.hidden = !on;
    if (!on) { wasOpen = false; return; }
    if (!wasOpen) { wasOpen = true; shownAt = Date.now(); key = ''; checkStatus(true); }
    else checkStatus();                                    // both only ask when it's been a while
    loadGitHub();
    const x = sections();
    const k = JSON.stringify([x.head, x.signin, x.cards.map(c => c[1])]);
    if (k === key) return; key = k;
    const left = x.cards.filter(c => c[0] === 'pins' || c[0] === 'recent' || c[0] === 'tips'), right = x.cards.filter(c => !left.includes(c));
    const fresh = Date.now() - shownAt < 400;
    el.innerHTML = `<div class="tin${fresh && !BL.motion.off ? ' enter' : ''}">${x.head}${x.signin || ''}<div class="tgrid${right.length && left.length ? ' two' : ''}"><div class="tcol">${left.map(c => c[1]).join('')}</div><div class="tcol">${right.map(c => c[1]).join('')}</div></div></div>`;
    el.querySelectorAll('.tcard').forEach((c, i) => c.style.setProperty('--i', i));
  }
  el && el.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'search') openCmd('new');
    else if (a === 'tab') selectTab(b.dataset.id);
    else if (a === 'url') openTab(b.dataset.url);
    else if (a === 'bm') { const x = bmFind(b.dataset.id); if (!x) return; const r = b.getBoundingClientRect(); if (x.node.type === 'folder') B.popupMenu(bmFolderMenu(x.node), { x: r.left, y: r.bottom + 2 }); else bmOpen(x.node); }
    else if (a === 'signin') { const ap = picked().find(p => p.id === b.dataset.id); if (ap) { selectTab(ap.tab); statusAt = 0; } }
    else if (a === 'hideSign') { S.prefs.appsHide = true; save(); syncMain(); key = ''; draw(); }
    else if (a === 'ghRetry') loadGitHub(true);
    else if (a === 'ghConnect') openSetup('settings', 'apps');
    else if (a === 'apps') openSetup('settings', 'apps');
  });
  addEventListener('focus', () => { if (visible()) { checkStatus(); loadGitHub(); } });
  clearInterval(timer); timer = setInterval(() => { if (visible()) { key = ''; draw(); } }, 60e3);   // the greeting keeps up with the time of day
  return { draw, redraw: () => { key = ''; draw(); }, refresh: () => { statusAt = 0; gh = null; key = ''; draw(); }, state: () => ({ status, gh }) };
})();
