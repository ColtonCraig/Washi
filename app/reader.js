'use strict';
/* Reader mode: an article as a clean sheet of Washi paper, over the page (the page itself isn't touched, so Done just
   lifts the sheet off). Mozilla's Readability (the engine behind Firefox's Reader View, Apache-2.0) finds the article
   in a private script world the site can't see; the sheet lives in a shadow root with its own stylesheet, so
   the site's CSS can't reach it and its Content-Security-Policy doesn't block it. */
const fs = require('fs'), path = require('path');
const WORLD = 1717;                                     // our own isolated world in the page
const dir = path.dirname(require.resolve('@mozilla/readability/package.json'));
const RD = fs.readFileSync(path.join(dir, 'Readability.js'), 'utf8'), RA = fs.readFileSync(path.join(dir, 'Readability-readerable.js'), 'utf8');
/* the small check runs on every page; the article finder only when you open Reader */
const ABLE = `(() => { if (window.__washiAble) return; ${RA}\n window.__washiAble = () => { try { return !!(document.body && isProbablyReaderable(document, { minContentLength: 400, minScore: 30 })); } catch { return false; } }; })();`;
const run = (wc, code) => wc.isDestroyed() ? Promise.resolve(null) : wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]).catch(() => null);

/* everything that runs in the page lives here, defined once per page */
const PAGE = `(() => {
  if (window.__washiReader) return;
  ${RD}
  const R = window.__washiReader = { host: null, look: null, art: null };
  const css = l => \`
    :host{all:initial;position:fixed;inset:0;z-index:2147483647;display:block;background:\${l.desk};overflow:auto;-webkit-font-smoothing:antialiased;color-scheme:\${l.dark ? 'dark' : 'light'}}
    .sheet{position:relative;box-sizing:border-box;max-width:\${l.width}px;margin:40px auto 80px;padding:56px 64px 64px;background:\${l.paper};color:\${l.ink};border-radius:6px 6px 10px 8px;box-shadow:0 0 0 1px \${l.line},0 18px 50px rgba(0,0,0,\${l.dark ? .45 : .14});
      font:\${l.size}px/1.62 \${l.face === 'serif' ? "'New York','Iowan Old Style',Charter,Georgia,serif" : "-apple-system,system-ui,'Helvetica Neue',sans-serif"};animation:in .32s cubic-bezier(.2,.9,.3,1.04)}
    @keyframes in{from{opacity:0;transform:translateY(14px) rotate(-.4deg)}}
    @media (prefers-reduced-motion:reduce){.sheet{animation:none}}
    .tape{position:absolute;top:-9px;left:50%;width:84px;height:20px;margin-left:-42px;transform:rotate(-2deg);opacity:.85;background:repeating-linear-gradient(-45deg,\${l.tape} 0 6px,color-mix(in srgb,\${l.tape} 62%,#fff) 6px 12px);display:\${l.scrap ? 'block' : 'none'}}
    .site{margin:0 0 10px;font:700 12px/1.3 -apple-system,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:\${l.tapeInk}}
    h1.t{margin:0 0 10px;font-size:1.9em;line-height:1.18;letter-spacing:-.01em;font-weight:700}
    .by{margin:0 0 30px;padding-bottom:22px;border-bottom:1.5px dashed \${l.line};font:500 13px/1.4 -apple-system,system-ui,sans-serif;color:\${l.ink2}}
    .c{overflow-wrap:break-word}
    .c img,.c video,.c figure,.c picture,.c svg{max-width:100%;height:auto;border-radius:4px}
    .c figure{margin:1.4em 0}.c figcaption{font-size:.82em;color:\${l.ink2};margin-top:6px}
    .c a{color:\${l.tapeInk};text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
    .c h1,.c h2,.c h3,.c h4{line-height:1.25;margin:1.6em 0 .5em}
    .c p,.c ul,.c ol,.c blockquote,.c pre,.c table{margin:0 0 1.05em}
    .c blockquote{margin-left:0;padding:2px 0 2px 18px;border-left:3px solid \${l.tape};color:\${l.ink2}}
    .c pre,.c code{font:.86em/1.5 ui-monospace,Menlo,monospace;background:\${l.wash};border-radius:5px}
    .c pre{padding:12px 14px;overflow:auto}.c code{padding:1px 4px}.c pre code{padding:0;background:none}
    .c table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}.c td,.c th{border:1px solid \${l.line};padding:5px 8px}
    .c hr{border:0;border-top:1.5px dashed \${l.line};margin:2em 0}
    ::selection{background:color-mix(in srgb,\${l.tape} 30%,transparent)}
    @media (max-width:760px){.sheet{margin:16px;padding:34px 26px 40px}}\`;
  R.show = l => {
    if (!R.art) {
      const doc = document.cloneNode(true);
      const a = new Readability(doc, { charThreshold: 300, keepClasses: false }).parse();
      if (!a || !a.content) return { ok: false };
      R.art = a;
    }
    if (!R.host) {
      R.host = document.createElement('washi-reader'); const sr = R.host.attachShadow({ mode: 'open' }); R.sr = sr;
      sr.innerHTML = '<div class="sheet" role="article"><i class="tape"></i><p class="site"></p><h1 class="t"></h1><p class="by"></p><div class="c"></div></div>';
      const a = R.art, q = s => sr.querySelector(s);
      q('.site').textContent = a.siteName || location.hostname.replace(/^www\\./, '');
      const site = (a.siteName || '').trim(); let title = (a.title || document.title || '').trim();
      if (site) for (const x of [' — ', ' – ', ' - ', ' | ', ' · ', ' : ', ' • ']) { if (title.endsWith(x + site)) title = title.slice(0, -(x + site).length); if (title.startsWith(site + x)) title = title.slice((site + x).length); }   // "Title — Site" → "Title"
      q('.t').textContent = title;
      const mins = Math.max(1, Math.round((a.length || 0) / 1100));
      q('.by').textContent = [a.byline, mins + ' min read'].filter(Boolean).join(' · ');
      const tpl = document.createElement('template'); tpl.innerHTML = a.content;
      for (const e of tpl.content.querySelectorAll('script,style,iframe,object,embed,form,link,meta')) e.remove();
      for (const e of tpl.content.querySelectorAll('*')) for (const at of [...e.attributes]) if (/^on/i.test(at.name) || /^(style|class|id)$/i.test(at.name) || (/^(href|src)$/i.test(at.name) && /^\\s*javascript:/i.test(at.value))) e.removeAttribute(at.name);
      q('.c').append(tpl.content);
      sr.addEventListener('keydown', e => e.stopPropagation(), true);
      R.prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
      document.documentElement.append(R.host);
    }
    R.look = l; const sheet = new CSSStyleSheet(); sheet.replaceSync(css(l)); R.sr.adoptedStyleSheets = [sheet];
    return { ok: true, title: R.art.title || '', words: R.art.length || 0 };
  };
  R.hide = () => { if (R.host) { R.host.remove(); R.host = null; R.sr = null; document.documentElement.style.overflow = R.prevOverflow || ''; } return { ok: true }; };
  R.on = () => !!R.host;
})();`;

const ensure = wc => run(wc, PAGE);
async function able(wc) { await run(wc, ABLE); return !!(await run(wc, 'window.__washiAble && window.__washiAble()')); }
async function show(wc, look) { await ensure(wc); return (await run(wc, `window.__washiReader.show(${JSON.stringify(clean(look))})`)) || { ok: false }; }
async function hide(wc) { return (await run(wc, 'window.__washiReader ? window.__washiReader.hide() : { ok: true }')) || { ok: false }; }
async function isOn(wc) { return !!(await run(wc, '!!(window.__washiReader && window.__washiReader.on())')); }
/* only plain colours, numbers and flags reach the page */
const COL = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s/%]+\))$/i;
function clean(l = {}) {
  const c = (v, d) => (typeof v === 'string' && COL.test(v.trim()) ? v.trim() : d);
  return { desk: c(l.desk, '#efe6d6'), paper: c(l.paper, '#fbf6ea'), ink: c(l.ink, '#2b2118'), ink2: c(l.ink2, '#6b5f55'), line: c(l.line, 'rgba(0,0,0,.12)'), wash: c(l.wash, 'rgba(0,0,0,.05)'), tape: c(l.tape, '#ff6a3d'), tapeInk: c(l.tapeInk, '#d2502a'),
    dark: !!l.dark, scrap: !!l.scrap, face: l.face === 'sans' ? 'sans' : 'serif', size: Math.max(14, Math.min(26, +l.size || 19)), width: Math.max(560, Math.min(980, +l.width || 720)) };
}
module.exports = { able, show, hide, isOn, clean };
