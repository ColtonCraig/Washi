'use strict';
/* Test harness: starts the browser under a throwaway profile, connects over CDP, gives back the three UI pages. */
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else fails++; console.log((c ? '  PASS ' : '  FAIL ') + m); return c; };
async function start({ profile, fresh = true, port = 9222, args = [], sandbox = false } = {}) {
  profile = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-test-'));
  const app = spawn(path.join(__dirname, '..', 'node_modules', '.bin', 'electron'), [...(sandbox ? [] : ['--no-sandbox']), '--no-proxy-server', `--remote-debugging-port=${port}`, path.join(__dirname, '..'), ...(fresh ? ['--fresh'] : []), ...args],
    { env: { WASHI_TEST_SUGGEST: 'http://localhost:8765/sugg?q=%s', ...process.env, NODE_OPTIONS: '', WASHI_PROFILE: profile }, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = ''; app.stderr.on('data', d => { log += d; });
  let br;
  for (let i = 0; i < 60 && !br; i++) { await sleep(250); try { br = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch {} }
  if (!br) throw new Error('browser did not start\n' + log.slice(-2000));
  const pages = () => br.contexts().flatMap(c => c.pages());
  const find = s => pages().find(p => p.url().includes(s));
  for (let i = 0; i < 40 && !(find('index.html') && find('sidebar.html') && find('overlay.html')); i++) await sleep(250);
  const ui = find('index.html'), sb = find('sidebar.html'), ov = find('overlay.html');
  for (const [n, p] of [['shell', ui], ['sidebar', sb], ['overlay', ov]]) p.on('pageerror', e => ok(false, `${n} threw: ${e.message}`));
  await sleep(1200);
  for (let i = 0; i < 60 && !(await ui.evaluate(() => typeof openTab === 'function' && typeof B === 'object').catch(() => false)); i++) await sleep(250);   // slow machines: wait until Washi's window is ready
  const gone = new Promise(r => app.once('exit', r));
  const stop = async () => { try { await br.close(); } catch {} app.kill(); await Promise.race([gone, sleep(6000)]); await sleep(300); };   // wait until it has really quit (a Mac takes a while), so the next start gets the port and the profile
  return { br, ui, sb, ov, pages, find, profile, stop, log: () => log };
}
async function skipSetup(b) {
  await sleep(600);
  if (await b.ov.evaluate(() => window.SETUP && SETUP.isOpen())) { await b.ov.evaluate(() => SETUP.finish()); await sleep(900); }
  await b.ov.evaluate(() => { const c = document.getElementById('cmd'); if (c.classList.contains('on')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  await b.ui.evaluate(() => B.overlayCancel()); await sleep(400);
}
const shot = name => { const f = path.join(process.env.WASHI_SHOTS || os.tmpdir(), name) + '.png'; try { execSync(process.platform === 'darwin' ? `screencapture -x ${f}` : `import -window root ${f}`, { stdio: 'ignore' }); } catch {} };
/* Every visible element must sit inside the box that clips it (overflow container or the window) and its text must not be cut off unless it ends in an ellipsis. */
const AUDIT = () => {
  const out = [], W = innerWidth, H = innerHeight, tol = 1.5;
  const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (e.textContent ? ` "${e.textContent.trim().slice(0, 24)}"` : '');
  const visible = e => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < .05) return false; } return true; };
  /* how far the painted box (hard shadows, outlines) reaches past the border box */
  const paint = (e, s) => {
    const x = { l: 0, r: 0, t: 0, b: 0 };
    if (s.boxShadow && s.boxShadow !== 'none') for (const part of s.boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const n = (part.replace(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z-]+\([^)]*\)/gi, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
      const [ox = 0, oy = 0, bl = 0, sp = 0] = n, a = Math.round(bl / 2) + sp;
      if (bl >= 10) continue;                       // a big soft ambient shadow has no edge to see cut off; hard and small shadows count
      x.r = Math.max(x.r, ox + a); x.l = Math.max(x.l, -ox + a); x.b = Math.max(x.b, oy + a); x.t = Math.max(x.t, -oy + a);
    }
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth)) { const o = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset || 0); for (const k in x) x[k] = Math.max(x[k], o); }
    return x;
  };
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg,[aria-hidden="true"],[data-clip],.bit,.cf-bit,.scraps,.deco,.desk,.tp')) continue;
    const r0 = e.getBoundingClientRect(); if (r0.width < 2 || r0.height < 2 || !visible(e)) continue;
    const s = getComputedStyle(e), p = paint(e, s);
    const r = { left: r0.left - p.l, right: r0.right + p.r, top: r0.top - p.t, bottom: r0.bottom + p.b };
    let clip = null, ell = false;
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.textOverflow === 'ellipsis') ell = true; if (/(hidden|auto|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { clip = x; break; } }
    if (ell) continue;
    const c = clip ? clip.getBoundingClientRect() : { left: 0, top: 0, right: W, bottom: H };
    const scrollY = clip && /(auto|scroll)/.test(getComputedStyle(clip).overflowY), scrollX = clip && /(auto|scroll)/.test(getComputedStyle(clip).overflowX);
    if (scrollY && (r0.bottom < c.top || r0.top > c.bottom)) continue;          // scrolled out of view: nobody can see it
    const bad = [];
    if (!scrollX && (r.left < c.left - tol || r.right > c.right + tol)) bad.push(`x ${r.left.toFixed(0)}..${r.right.toFixed(0)} outside ${c.left.toFixed(0)}..${c.right.toFixed(0)}`);
    if (!scrollY && (r.top < c.top - tol || r.bottom > c.bottom + tol)) bad.push(`y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)} outside ${c.top.toFixed(0)}..${c.bottom.toFixed(0)}`);
    if (scrollX && (r.left < c.left - tol || r.right > c.right + tol) && clip.scrollWidth <= clip.clientWidth + 1) bad.push(`x sticks out of a scroller that can't scroll sideways`);
    if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis' && /(hidden|clip)/.test(s.overflowX)) bad.push('text cut off');
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {     // a frame drawn inside a box (negative outline-offset) must not run through its contents
      const cs = getComputedStyle(x); const off = parseFloat(cs.outlineOffset || 0), w = parseFloat(cs.outlineWidth || 0);
      if (cs.outlineStyle !== 'none' && w && off < 0) { const xr = x.getBoundingClientRect(), ins = -off; if (r.left < xr.left + ins - tol || r.right > xr.right - ins + tol || r.top < xr.top + ins - tol || r.bottom > xr.bottom - ins + tol) { bad.push('crosses the frame drawn inside ' + name(x).slice(0, 30)); break; } }
    }
    if (bad.length) out.push(name(e) + ' -> ' + bad.join('; ') + (clip ? '  [in ' + name(clip).slice(0, 40) + ']' : ' [window]'));
  }
  /* text running into the text next to it (e.g. a label into its ⌘T hint): the painted text of siblings must not overlap */
  const textBox = e => { const rg = document.createRange(); let u = null; for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.width < 1) continue; u = u ? { left: Math.min(u.left, q.left), right: Math.max(u.right, q.right), top: Math.min(u.top, q.top), bottom: Math.max(u.bottom, q.bottom) } : { left: q.left, right: q.right, top: q.top, bottom: q.bottom }; } } return u; };
  const seen = new Set();
  for (const par of document.body.querySelectorAll('*')) {
    if (seen.has(par) || par.closest('svg,[aria-hidden="true"],[data-clip],.bit,.cf-bit,.scraps,.deco,.desk,.tp') || !visible(par)) continue; seen.add(par);
    const kids = [...par.children].filter(k => visible(k) && !/matrix\((?!1, 0, 0, 1)/.test(getComputedStyle(k).transform)).map(k => { let t = textBox(k); if (t) { const cs = getComputedStyle(k); if (/(hidden|clip)/.test(cs.overflowX)) { const kr = k.getBoundingClientRect(); t = { ...t, left: Math.max(t.left, kr.left), right: Math.min(t.right, kr.right) }; } } return [k, t]; }).filter(([, t]) => t && t.right - t.left > 1);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const [a, A] = kids[i], [b, Bx] = kids[j], ox = Math.min(A.right, Bx.right) - Math.max(A.left, Bx.left), oy = Math.min(A.bottom, Bx.bottom) - Math.max(A.top, Bx.top);
      if (ox > tol && oy > 4) out.push(`${name(a)} -> its text runs into ${name(b)} (${ox.toFixed(0)}px)`);
    }
  }
  return out;
};
const done = () => { console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0); };
/* GAPS: boxes that touch or run into each other. A box is anything drawn with an edge: a button, a field, a card or row
   with a background, border or shadow. Two boxes that aren't inside one another must not overlap, and must keep at least
   MIN px apart where they face each other (a button sitting right on the row above it, a pill on its neighbour). Joined
   controls on purpose (a segmented control's buttons, a field and its attached button) are marked data-joined. */
const GAPS = (MIN = 4) => {
  const out = [], seen = new Set();
  const visible = e => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < .05) return false; } return true; };
  const tr = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/ 0\)$/.test(c);
  const boxy = (e, s) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || !tr(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && !tr(s.borderTopColor)) || (s.boxShadow && s.boxShadow !== 'none');
  const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.textContent.trim() ? ` "${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 22)}"` : '');
  const clipOf = e => { let c = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }; for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (/(hidden|auto|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const r = x.getBoundingClientRect(); c = { left: Math.max(c.left, r.left), top: Math.max(c.top, r.top), right: Math.min(c.right, r.right), bottom: Math.min(c.bottom, r.bottom) }; } } return c; };
  const B = [];
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg,[aria-hidden="true"],[data-clip],[data-joined],.tp,.deco,.desk,.bit,.cf-bit,.scraps')) continue;
    const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
    const s = getComputedStyle(e); if (!boxy(e, s) || !visible(e)) continue;
    if (s.position === 'fixed' && r.width >= innerWidth - 2 && r.height >= innerHeight - 2) continue;   // a full-window backdrop
    const c = clipOf(e), v = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    if (v.right - v.left < 4 || v.bottom - v.top < 4) continue;                                    // scrolled out of view
    const layer = (() => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed' || cs.position === 'absolute' || +cs.zIndex > 0) return n; } return document.body; })();
    B.push({ e, r: v, full: r, layer, cut: { t: v.top > r.top + .5, b: v.bottom < r.bottom - .5, l: v.left > r.left + .5, rt: v.right < r.right - .5 } });
  }
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    let why = '';
    if (a.layer !== b.layer) continue;                     // stacked on purpose: a menu, popover or panel laid over another layer
    const up = a.r.top < b.r.top ? [a, b] : [b, a], lf = a.r.left < b.r.left ? [a, b] : [b, a];
    if (ox > 1 && oy > 1) why = `overlap ${Math.round(ox)}×${Math.round(oy)}`;
    else if (ox > 4 && oy <= 0 && -oy < MIN && !up[0].cut.b && !up[1].cut.t) why = `${Math.round(-oy * 10) / 10}px apart vertically`;   // (a box cut by a scroll edge just meets that edge)
    else if (oy > 4 && ox <= 0 && -ox < MIN && !lf[0].cut.rt && !lf[1].cut.l) why = `${Math.round(-ox * 10) / 10}px apart sideways`;
    if (!why) continue;
    const k = name(a.e) + ' | ' + name(b.e); if (seen.has(k)) continue; seen.add(k);
    out.push(`${name(a.e)}  ↔  ${name(b.e)}: ${why}`);
  }
  return out;
};
module.exports = { GAPS, start, sleep, ok, shot, AUDIT, done, skipSetup, counts: () => ({ passes, fails }) };
