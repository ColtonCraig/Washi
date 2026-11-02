'use strict';
/* Saved passwords and passkeys, as drawn in the overlay: the account menu under a login field, the "Save password?"
   card, and the passkey card. The main process decides when they show and what they hold; this only draws and answers.
   Passwords themselves never come here (the menu shows usernames; the save card shows dots). */
window.VAULTUI = (() => {
  const B = window.washi, { esc, ic, favHTML } = window.BL;
  const el = document.createElement('div'); el.className = 'vault'; el.id = 'vault'; document.body.append(el);
  let kind = null, d = null, sel = -1;

  /* ---------- the menu under a login field ---------- */
  function menu() {
    sel = -1;
    const items = d.items || [];
    el.className = 'vault on menu';
    el.innerHTML = `<div class="vmenu" role="listbox" aria-label="Saved passwords"><i class="tp"></i>
      ${items.map((it, i) => it.gen
        ? `<button class="vi gen" role="option" data-i="${i}">${ic('key', 16)}<span class="vt"><b>Use a strong password</b><small class="mono">${esc(it.pass)}</small></span></button>`
        : `<button class="vi" role="option" data-i="${i}">${favHTML({ title: d.host, url: 'https://' + d.host })}<span class="vt"><b>${esc(it.user)}</b><small>${esc(d.host)} · ••••••••</small></span></button>`).join('')}
      <button class="vfoot" data-a="manage">${ic('gear', 14)}<span>${items.some(i => i.gen) ? 'Washi saves it when you sign up' : 'Manage passwords…'}</span></button></div>`;
    el.querySelectorAll('.vi').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); pickAt(+b.dataset.i); });
      b.addEventListener('pointermove', () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; mark(); } });
    });
    el.querySelector('.vfoot').addEventListener('pointerdown', e => { e.preventDefault(); B.overlayResult({ kind: 'cmd', cmd: 'settings:passwords' }); });
  }
  function mark() { el.querySelectorAll('.vi').forEach(b => { const on = +b.dataset.i === sel; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); B.vaultSel(sel); }
  function pickAt(i) { const it = (d.items || [])[i]; if (!it) return; close(); B.vaultPick(it.gen ? { gen: true } : { id: it.id }); }
  B.onVaultKey(key => {
    if (kind !== 'menu') return;
    const n = (d.items || []).length; if (!n) return;
    if (key === 'ArrowDown') { sel = (sel + 1) % n; mark(); }
    else if (key === 'ArrowUp') { sel = (sel - 1 + n) % n; mark(); }
    else if (key === 'Enter' && sel >= 0) pickAt(sel);
  });

  /* ---------- "Save password for github.com?" ---------- */
  function save() {
    const up = d.what === 'update';
    el.className = 'vault on save';
    el.innerHTML = `<div class="vcard" role="dialog" aria-label="${up ? 'Update password' : 'Save password'}"><i class="tp"></i>
      <div class="vh">${favHTML({ title: d.host, url: 'https://' + d.host })}<b>${up ? 'Update password' : 'Save password'} for <span class="h">${esc(d.host)}</span>?</b></div>
      <label class="vf"><span>Username</span><input id="vuser" value="${esc(d.user || '')}" spellcheck="false" autocomplete="off" aria-label="Username"></label>
      <label class="vf"><span>Password</span><span class="dots" aria-label="hidden password">${'•'.repeat(Math.min(16, Math.max(8, d.len || 8)))}</span></label>
      <div class="vbtns"><button class="lnk" data-a="never">Never for this site</button><span class="fill"></span><button class="btn" data-a="later">Not now</button><button class="btn primary" data-a="save">${up ? 'Update' : 'Save'}</button></div></div>`;
    const answer = act => { const user = el.querySelector('#vuser').value; close(); B.vaultSave({ token: d.token, act, user }); };
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => answer(b.dataset.a));
    el.querySelector('#vuser').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); answer('save'); } });
  }

  /* ---------- passkeys ---------- */
  function pk() {
    el.className = 'vault on pk';
    const s = d.stage, at = s ? `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px` : 'inset:0';
    const how = d.touch ? 'with Touch ID' : '';
    let body;
    if (d.what === 'create') body = `<div class="vh">${ic('key', 20)}<b>Save a passkey for <span class="h">${esc(d.rpId)}</span>?</b></div>
      <p class="vp">${d.user ? `For <b>${esc(d.user)}</b>. ` : ''}Washi keeps it encrypted on this Mac${how ? ' and unlocks it ' + how : ''}. You'll use it instead of a password next time.</p>
      <div class="vbtns"><span class="fill"></span><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="create">Save passkey</button></div>`;
    else if (d.accounts && d.accounts.length) body = `<div class="vh">${ic('key', 20)}<b>Sign in to <span class="h">${esc(d.rpId)}</span></b></div>
      <p class="vp">With your Washi passkey${how ? ', ' + how : ''}.</p>
      <div class="vlist">${d.accounts.map((a, i) => `<button class="vi${i ? '' : ' on'}" data-a="use" data-id="${esc(a.id)}">${favHTML({ title: d.rpId, url: 'https://' + d.rpId })}<span class="vt"><b>${esc(a.user)}</b><small>Passkey · ${esc(d.rpId)}</small></span>${ic('right', 15)}</button>`).join('')}</div>
      <div class="vbtns"><span class="fill"></span><button class="btn" data-a="cancel">Use another way</button></div>`;
    else body = `<div class="vh">${ic('key', 20)}<b>No Washi passkey for <span class="h">${esc(d.rpId)}</span></b></div>
      <p class="vp">Passkeys kept in iCloud Keychain or on your phone can't be used in Washi. Sign in another way for now (the site's other options, like a code or your password).</p>
      <p class="vp sm">Then add a passkey in ${esc(d.rpId)}'s security settings while you're in Washi: Washi will keep it, and next time this just works.</p>
      <div class="vbtns"><span class="fill"></span><button class="btn primary" data-a="cancel">Use another way</button></div>`;
    el.innerHTML = `<div class="vdim" data-a="cancel"></div><div class="vstage" style="${at}"><div class="vcard pkc" role="dialog" aria-modal="true" aria-label="Passkey"><i class="tp"></i>${body}</div></div>`;
    const answer = (act, id) => { close(); B.vaultPk({ act, id }); };
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => { if (b.classList.contains('vdim') && e.target !== b) return; answer(b.dataset.a, b.dataset.id); }));
    el.querySelector('.vstage').addEventListener('click', e => { if (e.target.classList.contains('vstage')) answer('cancel'); });
    const first = el.querySelector('.vlist .vi, .btn.primary'); if (first) setTimeout(() => first.focus(), 30);
  }

  function open(x) {
    d = x; kind = x.kind; window.BL.applyTheme(x.theme, x.pal);
    if (kind === 'menu') menu(); else if (kind === 'save') save(); else if (kind === 'pk') pk();
  }
  function close() { kind = null; el.className = 'vault'; el.innerHTML = ''; }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); const k = kind; close(); if (k === 'pk') B.vaultPk({ act: 'cancel' }); else if (k === 'save') B.vaultSave({ token: d.token, act: 'later' }); else B.overlayCancel(); return; }
    if (kind === 'pk' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const bs = [...el.querySelectorAll('.vlist .vi')], i = bs.indexOf(document.activeElement); if (!bs.length) return;
      e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    }
  }
  return { open, close, key, isOpen: () => !!kind };
})();
