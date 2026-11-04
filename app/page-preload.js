'use strict';
/* Runs in every web page, in Chromium's isolated world (the page's own scripts can't see or change it), top frame only.
   - Passwords: notices login and sign-up fields, tells Washi when one is focused (Washi shows the account list), fills a
     login only after you pick it in Washi's own menu, and reports a submitted login so Washi can offer to save it.
   - Passkeys: puts a thin wrapper around navigator.credentials in the page so a passkey request asks Washi first;
     Washi serves one saved in Washi before, or says no at once so the site offers another way to sign in.
   Nothing secret is ever handed to the page's scripts: a password only ever goes into the input you chose to fill. */
const { ipcRenderer, contextBridge } = require('electron');

if (window.top === window && /^https?:$/.test(location.protocol)) {
  const send = (t, d) => { try { ipcRenderer.send('washi-page', t, d || {}); } catch {} };
  /* a sign-in being sent: tell Washi before the page can move on (a message from a page that's already gone is dropped) */
  /* the pointer leaving the page through its top edge: Washi brings down the bookmarks bar (on a Mac the top bar is
     a window-drag area, which doesn't report the pointer) */
  document.addEventListener('mouseout', e => { if (!e.relatedTarget && e.clientY <= 3 && e.clientX > 0 && e.clientX < innerWidth) send('topExit'); }, true);
  /* Reader mode's own buttons and Esc (app/reader.js) */
  document.addEventListener('washi-reader-leave', () => send('reader', { act: 'leave' }));
  document.addEventListener('washi-reader-look', () => send('reader', { act: 'look' }));
  const sendNow = (t, d) => { try { ipcRenderer.sendSync('washi-page-now', t, d || {}); } catch {} };

  /* ---------- passkeys: ask Washi before the browser handles the request ---------- */
  try {
    contextBridge.executeInMainWorld({
      func: ask => {
        const CC = window.CredentialsContainer, PKC = window.PublicKeyCredential;
        if (!CC || !PKC || !navigator.credentials) return;
        const b64 = v => { try { const u = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return ''; } };
        const wrap = name => {
          const orig = CC.prototype[name];
          const f = { [name](opts) {
            const pk = opts && opts.publicKey;
            if (!pk || opts.mediation === 'conditional') return orig.apply(this, arguments);
            const self = this, args = arguments; let info;
            try {
              info = name === 'create'
                ? { kind: 'create', rpId: String((pk.rp && pk.rp.id) || ''), user: String((pk.user && (pk.user.name || pk.user.displayName)) || '').slice(0, 300), uv: String(pk.authenticatorSelection && pk.authenticatorSelection.userVerification || '') }
                : { kind: 'get', rpId: String(pk.rpId || ''), allow: Array.from(pk.allowCredentials || []).slice(0, 64).map(c => b64(c.id)), uv: String(pk.userVerification || '') };
            } catch { return orig.apply(this, args); }
            return Promise.resolve(ask(info)).then(r => {
              if (typeof r !== 'string' || !(r === 'go' || r.startsWith('go:'))) throw new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');
              let call = args;
              if (r.startsWith('go:')) {                                // you picked the account in Washi: ask for exactly that passkey
                const id = Uint8Array.from(atob(r.slice(3).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                call = [Object.assign({}, opts, { publicKey: Object.assign({}, pk, { allowCredentials: [{ type: 'public-key', id }] }) })];
              }
              const done = () => { try { ask({ kind: 'done' }); } catch {} };          // Washi takes its authenticator away once the browser has answered
              return orig.apply(self, call).then(v => { done(); return v; }, e => { done(); throw e; });
            });
          } }[name];
          Object.defineProperty(CC.prototype, name, { value: f, writable: true, configurable: true });
        };
        wrap('create'); wrap('get');
        /* no passkeys on this Mac, as far as sites are concerned: they offer your password or a code straight away (Apple only
           lets browsers it has approved use iCloud Keychain passkeys). Passkeys saved in Washi before are still served. */
        try { PKC.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false); } catch {}
        try { PKC.isConditionalMediationAvailable = () => Promise.resolve(false); } catch {}
        try { if (PKC.getClientCapabilities) { const g = PKC.getClientCapabilities.bind(PKC); PKC.getClientCapabilities = () => g().then(c => ({ ...c, conditionalGet: false, conditionalCreate: false, hybridTransport: false, passkeyPlatformAuthenticator: false, userVerifyingPlatformAuthenticator: false })); } } catch {}
      },
      args: [info => ipcRenderer.invoke('washi-passkey', info).catch(() => 'cancel')]
    });
  } catch (e) { /* older engine: leave passkeys alone */ }

  /* ---------- passwords ---------- */
  const isInput = e => e instanceof HTMLInputElement;
  const isPass = e => isInput(e) && e.type === 'password';
  const TEXTY = new Set(['text', 'email', 'tel']);
  const isTexty = e => isInput(e) && TEXTY.has(e.type);
  const shown = e => { if (!e || !e.isConnected || e.disabled) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > .05; };
  const ac = e => (e.getAttribute('autocomplete') || '').toLowerCase();
  const userish = e => isTexty(e) && (/\b(username|email)\b/.test(ac(e)) || e.type === 'email' || /user|e-?mail|login|identifier|account/i.test((e.name || '') + ' ' + (e.id || '')));
  const scope = e => e.form || e.closest('form') || document;
  const passesIn = root => [...root.querySelectorAll('input[type=password]')].filter(shown);
  function userFor(pass) {
    const root = scope(pass), all = [...root.querySelectorAll('input')];
    const before = all.slice(0, all.indexOf(pass)).filter(e => isTexty(e) && !isPass(e));
    return before.filter(shown).reverse().find(userish) || before.filter(shown).pop()
      || all.find(e => isInput(e) && /\b(username|email)\b/.test(ac(e)) && e.value) || null;      // a hidden "username" field (two-step sign-ins)
  }
  const isNew = p => /new-password/.test(ac(p)) || (passesIn(scope(p)).length >= 2 && !/current-password/.test(ac(p)));
  const rectOf = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const pageHasPass = () => passesIn(document).length > 0;

  let active = null, menu = false, filling = false;
  function focused(e) {
    if (filling || !isInput(e) || e.readOnly || e.disabled) return;
    let kind = null;
    if (isPass(e)) kind = isNew(e) ? 'new' : 'pass';
    else if (isTexty(e) && (userish(e) || pageHasPass()) && (passesIn(scope(e)).length || /\b(username|email)\b/.test(ac(e)) || /webauthn/.test(ac(e)))) {
      const ps = passesIn(scope(e)); kind = ps.length && ps.every(isNew) ? null : 'user';
    }
    if (!kind) return;
    active = e;
    send('focus', { kind, rect: rectOf(e) });
  }
  document.addEventListener('focusin', e => focused(e.target), true);
  document.addEventListener('mousedown', e => { if (e.target === document.activeElement && e.target === active && !menu) focused(e.target); }, true);
  document.addEventListener('focusout', e => { if (e.target === active) send('blur'); }, true);
  addEventListener('scroll', () => { if (menu) send('blur'); }, true);
  addEventListener('resize', () => { if (menu) send('blur'); });
  document.addEventListener('input', e => { if (menu && e.target === active && !isPass(e.target)) send('typed'); }, true);
  document.addEventListener('keydown', e => {
    if (!menu || e.target !== active) return;
    if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key) || (e.key === 'Enter' && menu === 'sel')) { e.preventDefault(); e.stopPropagation(); send('key', { key: e.key }); }
  }, true);
  ipcRenderer.on('washi-pw-menu', (_, open) => { menu = open; });

  /* fill: the field you were on, and its partner (username ↔ password, or both new-password fields) */
  function setVal(el, v) {
    if (!el || !shown(el) && !(el === active)) return false;
    el.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  ipcRenderer.on('washi-pw-fill', (_, d) => {
    const a = active && active.isConnected ? active : null; if (!a || !d) return;
    filling = true;                                    // focusing the fields while filling mustn't bring the menu back
    try {
      if (d.gen) { const ps = passesIn(scope(a)).filter(isNew); (ps.length ? ps : [a]).forEach(p => setVal(p, d.pass)); a.focus(); return; }
      const pass = isPass(a) ? a : passesIn(scope(a))[0] || null, user = isPass(a) ? userFor(a) : a;
      if (user && d.user) setVal(user, d.user);
      if (pass) setVal(pass, d.pass);
      (pass || a).focus();
    } finally { filling = false; }
  });

  /* ---------- a login is being sent: remember it, Washi asks after the page moves on ---------- */
  let lastSent = 0;
  function submitted(root) {
    if (Date.now() - lastSent < 400) return;
    const ps = passesIn(root === document ? document : root).filter(p => p.value);
    if (!ps.length) {
      const u = [...(root === document ? document : root).querySelectorAll('input')].find(e => userish(e) && shown(e) && e.value);
      if (u) { lastSent = Date.now(); sendNow('user', { user: u.value.slice(0, 300) }); }
      return;
    }
    const news = ps.filter(isNew), cur = ps.find(p => !isNew(p));
    const pass = news.length ? news[news.length - 1].value : cur.value, u = userFor(news[0] || cur);
    lastSent = Date.now();
    sendNow('submit', { user: u ? u.value.slice(0, 300) : '', pass: pass.slice(0, 1000), isNew: !!news.length });
  }
  document.addEventListener('submit', e => submitted(e.target instanceof HTMLFormElement ? e.target : document), true);
  document.addEventListener('click', e => {
    const b = e.target instanceof Element && e.target.closest('button,input[type=submit],input[type=button],[role=button]'); if (!b) return;
    const root = b.form || b.closest('form') || document;
    if (passesIn(root).some(p => p.value) || [...root.querySelectorAll('input')].some(x => userish(x) && shown(x) && x.value)) submitted(root);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && isInput(e.target) && (isPass(e.target) || isTexty(e.target)) && !(menu === 'sel' && e.target === active)) submitted(e.target.form || e.target.closest('form') || document); }, true);
  /* Washi asks "is a password field still showing?" a moment after a submit (a failed sign-in usually shows the form again) */
  ipcRenderer.on('washi-pw-check', () => send('check', { pass: pageHasPass() }));
}
