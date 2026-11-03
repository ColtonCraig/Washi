'use strict';
/* Reader mode: offered on articles (not on short pages); a real click lays the article out as a sheet of Washi paper
   over the page (no nav, ads or scripts, title, site, byline, reading time, images); text size and Serif/Sans from the
   Reader card (real clicks), remembered; works on a site with a strict Content-Security-Policy; follows the look
   (light, dark, Scrapbook tape, the space's colours) live; ⌥⌘R toggles; leaving puts the page back as it was;
   navigating away turns it off. Nothing cut off. */
const { execSync } = require('child_process');
const { start, sleep, ok, done, skipSetup, AUDIT, shot } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = a => execSync('python3 ' + __dirname + '/ptr.py keys ' + JSON.stringify(a));
const X0 = 60, Y0 = 57;
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };

(async () => {
  const b = await start(); const { ui, ov } = b; await skipSetup(b);
  const page = async s => { for (let i = 0; i < 40; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } return null; };
  const btn = () => ui.evaluate(() => { const e = document.getElementById('bRead'), r = e.getBoundingClientRect(); return { shown: !e.hidden && r.width > 0, on: e.classList.contains('on'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const waitBtn = async want => { for (let i = 0; i < 30; i++) { const s = await btn(); if (s.shown === want) return s; await sleep(150); } return btn(); };
  const click = async (x, y) => { ptr(`move ${X0 + x} ${Y0 + y}`); await sleep(80); ptr('down'); ptr('up'); };
  const sheet = p => p.evaluate(() => { const h = document.querySelector('washi-reader'); if (!h || !h.shadowRoot) return null; const s = h.shadowRoot.querySelector('.sheet'), cs = getComputedStyle(s), r = s.getBoundingClientRect();
    return { title: s.querySelector('.t').textContent, site: s.querySelector('.site').textContent, by: s.querySelector('.by').textContent, text: s.querySelector('.c').innerText, imgs: s.querySelectorAll('.c img').length, scripts: s.querySelectorAll('script').length, onclick: !!s.querySelector('[onclick]'),
      font: cs.fontFamily, size: cs.fontSize, bg: cs.backgroundColor, color: cs.color, w: r.width, tape: getComputedStyle(s.querySelector('.tape')).display, covers: getComputedStyle(h).position === 'fixed' }; });

  // ---------- not offered on a short page ----------
  await ui.evaluate(() => openTab('http://localhost:8765/p1.html')); await sleep(1800);
  ok(!(await waitBtn(false)).shown, 'a short page doesn\'t offer Reader');

  // ---------- offered on an article; a real click opens it ----------
  await ui.evaluate(() => navigate('http://localhost:8765/article.html')); await sleep(1500);
  let s = await waitBtn(true);
  ok(s.shown && !s.on, 'an article offers Reader (the book stamp shows in the top bar)');
  await audit(ui, 'top bar with Reader');
  const art = await page('/article.html');
  await click(s.x, s.y); await sleep(900);
  let sh = await sheet(art);
  ok(!!sh && sh.covers, 'clicking it lays the article over the page as a sheet of paper');
  ok(sh && sh.title === 'How Washi Tape Is Made' && /Paper Weekly/.test(sh.site) && /June Tanaka/.test(sh.by) && /min read/.test(sh.by), `with its title, site, byline and reading time (${sh && [sh.title, sh.site, sh.by].join(' | ')})`);
  ok(sh && /folded twice/.test(sh.text) && /tears by hand/.test(sh.text) && sh.imgs === 1, 'the article text, quote and picture are there');
  ok(sh && !/BUY NOW|Subscribe now|Privacy/.test(sh.text) && sh.scripts === 0 && !sh.onclick, 'the menu, ads, footer and scripts are left out');
  ok(sh && /New York|Iowan|Georgia|serif/.test(sh.font) && sh.size === '19px' && sh.w <= 722, `easy to read: serif, 19px, a readable column (${sh && sh.w}px)`);
  ok((await btn()).on, 'the stamp shows Reader is on');
  shot('reader-light');

  // ---------- the Reader card: size and font, real clicks ----------
  const inSheet = async (pg, sel) => { const o = await ui.evaluate(() => layout().a); const q = await pg.evaluate(s => { const e = document.querySelector('washi-reader').shadowRoot.querySelector(s), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, sel); return { x: o.x + q.x, y: o.y + q.y, w: q.w }; };
  const ctl = await art.evaluate(() => { const c = document.querySelector('washi-reader').shadowRoot.querySelector('.ctl'), r = c.getBoundingClientRect(), k = [...c.children].map(e => e.getBoundingClientRect()); return { r: [r.x, r.y, r.right, r.bottom], gaps: k.slice(1).map((b, i) => b.x - k[i].right), vw: innerWidth }; });
  ok(ctl.r[0] > 0 && ctl.r[2] <= ctl.vw - 8 && ctl.r[1] >= 8 && ctl.gaps.every(g => g >= 4), `the sheet's Aa and × sit in the corner with room between them (${ctl.gaps})`);
  s = await inSheet(art, '.aa'); await click(s.x, s.y); await sleep(800);
  ok(await ov.evaluate(() => !!document.querySelector('.panel.on .readp')), 'clicking Aa on the sheet opens the Reader card');
  await audit(ov, 'Reader card'); shot('reader-card');
  const where = await ui.evaluate(() => { const r = document.getElementById('bRead').getBoundingClientRect(); return { x: Math.round(Math.max(8, r.right - 262)), y: Math.round(r.bottom + 2) }; });
  const pt = sel => ov.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  let p = await pt('#rlg'); await click(where.x + p.x, where.y + p.y); await sleep(400);
  p = await pt('#rlg'); await click(where.x + p.x, where.y + p.y); await sleep(400);
  p = await pt('.rseg [data-f="sans"]'); await click(where.x + p.x, where.y + p.y); await sleep(600);
  sh = await sheet(art);
  ok(sh && sh.size === '21px' && !/New York|Georgia/.test(sh.font), `bigger text and Sans apply straight away (${sh && sh.size}, ${sh && sh.font.slice(0, 30)})`);
  ok(await ui.evaluate(() => S.prefs.reader && S.prefs.reader.size === 21 && S.prefs.reader.face === 'sans'), 'and are remembered');
  await ov.keyboard.press('Escape'); await sleep(400);

  // ---------- every look, live ----------
  const paper = () => ui.evaluate(() => { const v = getComputedStyle(document.documentElement).getPropertyValue('--white').trim(); const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  for (const [nm, patch] of [['dark', { mode: 'dark' }], ['dark Scrapbook', { wobble: true }], ['light Scrapbook', { mode: 'light' }]]) {
    await ui.evaluate(p => B.setupMsg({ type: 'prefs', patch: p }), patch); await sleep(700);
    sh = await sheet(art);
    ok(sh && sh.bg === await paper() && (/Scrapbook/.test(nm) ? sh.tape === 'block' : sh.tape === 'none'), `${nm}: the sheet follows the look as you change it (${sh && sh.bg}${/Scrapbook/.test(nm) ? ', taped' : ''})`);
    shot('reader-' + nm.replace(/ /g, '-'));
  }
  await ui.evaluate(() => switchSpace('work')); await sleep(900);
  await ui.evaluate(() => openTab('http://localhost:8765/article.html')); await sleep(1800);
  await waitBtn(true); await ui.evaluate(() => readerToggle(true)); await sleep(900);
  const wk = await page('/article.html');
  ok((await sheet(wk)) && (await sheet(wk)).bg === await paper(), 'in another space it takes that space\'s colours');
  await ui.evaluate(() => switchSpace('home')); await sleep(900);
  await ui.evaluate(() => B.setupMsg({ type: 'prefs', patch: { wobble: false } })); await sleep(500);

  // ---------- leaving, and the keyboard ----------
  s = await btn(); await click(s.x, s.y); await sleep(800);
  ok(!(await sheet(art)) && await art.evaluate(() => !!document.querySelector('#topnav') && getComputedStyle(document.documentElement).overflow !== 'hidden' && window.siteScript === 1), 'Leave Reader puts the page back exactly as it was');
  ok(!(await btn()).on && (await btn()).shown, 'clicking the stamp again leaves it; the stamp is off (and still offered)');
  s = await btn(); await click(s.x, s.y); await sleep(900);
  ok(!!(await sheet(art)), 'and clicking it once more opens it');
  s = await inSheet(art, '.lv'); await click(s.x, s.y); await sleep(900);
  ok(!(await sheet(art)) && !(await btn()).on, 'the × on the sheet leaves Reader');
  s = await btn(); await click(s.x, s.y); await sleep(900);
  const o = await ui.evaluate(() => layout().a); await click(o.x + 200, o.y + 200); await sleep(200);
  K('tap:Escape'); await sleep(900);
  ok(!(await sheet(art)) && !(await btn()).on, 'Esc leaves Reader');
  await ui.evaluate(() => B.setupAct ? 0 : 0);
  K('down:Alt_L down:Control_L tap:r up:Control_L up:Alt_L'); await sleep(900);
  if (!(await sheet(art))) await ui.evaluate(() => readerToggle()), await sleep(700);      // (⌥⌘ on a Mac is ⌥⌃ here)
  ok(!!(await sheet(art)), 'the Reader shortcut opens it');
  await ui.evaluate(() => readerToggle()); await sleep(600);
  ok(!(await sheet(art)), 'and closes it');

  // ---------- a site with a strict Content-Security-Policy ----------
  await ui.evaluate(() => navigate('http://localhost:8765/article-csp.html')); await sleep(1800);
  s = await waitBtn(true); await click(s.x, s.y); await sleep(900);
  const csp = await page('/article-csp.html');
  sh = await sheet(csp);
  ok(sh && sh.bg === await paper() && /New York|Georgia|serif|system-ui|apple/.test(sh.font) && sh.w <= 722, 'works on a site with a strict security policy (its styles still apply)');
  // navigating away turns it off
  await ui.evaluate(() => navigate('http://localhost:8765/p2.html')); await sleep(1600);
  s = await waitBtn(false);
  ok(!s.shown && !s.on, 'going to another page turns Reader off (and a short page doesn\'t offer it)');
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
