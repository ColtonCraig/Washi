'use strict';
/* Washi's own in-page notices (page didn't load, not secure, dangerous site), drawn on paper.
   Their buttons are links to https://washi.internal/<action>?k=<token>; the main process catches those before they go anywhere,
   and the one-time token stops a web page from pressing them by itself. */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = `
:root{--paper:#fbf6ea;--ink:#2b2118;--ink2:#6b5d4f;--tape:#ff6a3d;--white:#fffdf8;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#2b2520;--ink:#f3ead8;--ink2:#bfb3a1;--white:#363029}}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:grid;place-items:center;padding:24px;background:var(--paper);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
.card{position:relative;max-width:560px;padding:34px 38px 30px;border-radius:12px;background:var(--white);box-shadow:6px 7px 0 rgba(0,0,0,.16);transform:rotate(-.6deg)}
.card::before{content:"";position:absolute;left:50%;top:-12px;width:96px;height:24px;margin-left:-48px;transform:rotate(-3deg);opacity:.92;background:repeating-linear-gradient(-45deg,var(--tape) 0 7px,color-mix(in srgb,var(--tape) 60%,#fff) 7px 14px)}
h1{margin:0 0 8px;font:700 30px/1.15 ui-rounded,-apple-system,system-ui,sans-serif}
p{margin:0 0 10px;color:var(--ink2)}
.url{font:600 13px ui-monospace,Menlo,monospace;word-break:break-all;color:var(--ink)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:20px}
a.btn{display:inline-flex;align-items:center;height:42px;padding:0 20px;border-radius:9px;background:var(--tape);color:#fff;font-weight:700;text-decoration:none;box-shadow:3px 3px 0 rgba(0,0,0,.2)}
a.btn:hover{transform:translateY(-1px)}
a.ghost{color:var(--ink2);font-size:13px}
.big{font-size:54px;line-height:1;margin-bottom:8px}`;
const page = (title, body, accent) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><style>${BASE}${accent ? `:root{--tape:${accent}}` : ''}</style><div class="card">${body}</div>`);
const act = (a, k) => `https://washi.internal/${a}?k=${k}`;

function failed(url, desc, k) {
  return page('Can\'t open page', `<div class="big">✂︎</div><h1>This page didn't load</h1><p>${esc(desc || 'Something went wrong.')}</p><p class="url">${esc(String(url).slice(0, 200))}</p>
    <div class="row"><a class="btn" href="${act('retry', k)}">Try again</a></div>`);
}
function insecure(url, k) {
  let host = url; try { host = new URL(url).host; } catch {}
  return page('Not secure', `<div class="big">🔓</div><h1>${esc(host)} doesn't offer a secure connection</h1>
    <p>Washi tried the secure (https) version and it didn't work. If you continue, anything you send to this site could be seen or changed by others on your network.</p><p class="url">${esc(String(url).slice(0, 200))}</p>
    <div class="row"><a class="btn" href="${act('back', k)}">Go back</a><a class="ghost" href="${act('insecure', k)}">Continue to the site (not secure)</a></div>`, '#c98a00');
}
function dangerous(url, reason, k) {
  let host = url; try { host = new URL(url).host; } catch {}
  const what = reason === 'phishing' ? 'This site is on a list of known phishing sites. It may try to trick you into giving away passwords, card numbers or other personal details.'
    : 'This site is on a list of sites known for malware, scams or deceptive downloads.';
  return page('Dangerous site', `<div class="big">⚠︎</div><h1>Deceptive site ahead</h1><p>${what}</p><p class="url">${esc(host)}</p>
    <div class="row"><a class="btn" href="${act('back', k)}">Back to safety</a><a class="ghost" href="${act('proceed', k)}">I understand the risk, open it anyway</a></div>`, '#d23b2a');
}
module.exports = { failed, insecure, dangerous, isInternal: u => /^https:\/\/washi\.internal\//.test(u), isNotice: u => u.startsWith('data:text/html') };
