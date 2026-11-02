'use strict';
/* Saved passwords and passkeys, in the main process: messages from app/page-preload.js (always checked: they must come
   from the top frame of one of Washi's tabs, and the site is taken from the frame itself, never from what the page says),
   the account menu under login fields, the "Save password?" card, and passkeys served by a virtual authenticator that
   only exists for the one request you approved. */
const { ipcMain, systemPreferences, app } = require('electron');
const vault = require('./vault');

const P = { save: true, fill: true, passkeys: true };
let ui = { tab: () => null, focus: () => {}, menu: () => {}, menuKey: () => {}, hideMenu: () => {}, save: () => {}, passkey: async () => ({ act: 'cancel' }) };
const pend = new Map();            // webContents id -> the login that was just sent { origin, user, pass, kind, timer, nav }
const lastUser = new Map();        // webContents id -> { origin, user, t }: the username step of a two-step sign-in
const menus = new Map();           // webContents id -> { origin, kind, items, gen }
const saving = new Map();          // token -> the login a "Save password?" card is about
const pkBusy = new Set();          // webContents ids with a passkey request on screen
const pkQuiet = new Map();         // webContents id -> time until which new passkey requests are refused (after you said no)
const wired = new WeakSet();
const testUV = () => !app.isPackaged && process.env.WASHI_TEST_UV === '1';

const originOf = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch { return null; } };
const sameFrame = (a, b) => !!a && !!b && a.processId === b.processId && a.routingId === b.routingId;
function source(e) {
  const wc = e.sender, f = e.senderFrame;
  if (!wc || wc.isDestroyed() || !f || !sameFrame(f, wc.mainFrame)) return null;
  const found = ui.tab(wc); if (!found) return null;
  const origin = originOf(f.url); if (!origin) return null;
  watch(wc);
  return { wc, frame: f, origin, ...found };
}
function watch(wc) {
  if (wired.has(wc)) return; wired.add(wc);
  wc.on('did-navigate', () => { hideMenu(wc); const p = pend.get(wc.id); if (p) { p.nav = true; clearTimeout(p.timer); p.timer = setTimeout(() => check(wc), 1200); } });
  wc.on('did-navigate-in-page', (_, __, isMain) => { if (isMain) hideMenu(wc); });
  wc.once('destroyed', () => { const id = wc.id; serving.delete(id); pend.delete(id); lastUser.delete(id); menus.delete(id); pkBusy.delete(id); pkQuiet.delete(id); });
}

/* ---------- the account menu under a login field ---------- */
function hideMenu(wc) {
  if (!menus.has(wc.id)) return;
  menus.delete(wc.id); ui.hideMenu(wc);
  try { wc.mainFrame.send('washi-pw-menu', false); } catch {}
}
function onFocus(s, d) {
  if (!P.fill || !vault.ready()) return;
  const r = d.rect || {}; if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) return;
  let items, gen = null;
  if (d.kind === 'new') { gen = vault.generate(); items = [{ gen: true }]; }
  else items = vault.forOrigin(s.origin).slice(0, 5).map(l => ({ id: l.id, user: l.user }));
  if (!items.length) return hideMenu(s.wc);
  menus.set(s.wc.id, { origin: s.origin, kind: d.kind, items, gen });
  ui.menu(s, { kind: d.kind, rect: r, host: new URL(s.origin).host, items: items.map(i => i.gen ? { gen: true, pass: gen } : { id: i.id, user: i.user || '(no username)' }) });
  try { s.frame.send('washi-pw-menu', 'open'); } catch {}
}
/* you picked something in the menu (in Washi's overlay, never in the page) */
function pick(wc, choice) {
  const m = menus.get(wc.id); if (!m || !choice) return false;
  if (originOf(wc.mainFrame.url) !== m.origin) { hideMenu(wc); return false; }        // the page moved on since
  let fill;
  if (choice.gen && m.gen) fill = { gen: true, pass: m.gen };
  else { const it = m.items.find(i => i.id === choice.id); const l = it && vault.get(it.id); if (!l || l.origin !== m.origin) return false; vault.used(l.id); fill = { user: l.user, pass: l.pass }; }
  hideMenu(wc);
  try { wc.mainFrame.send('washi-pw-fill', fill); } catch {}
  return true;
}
function menuSel(wc, sel) { try { if (menus.has(wc.id)) wc.mainFrame.send('washi-pw-menu', sel >= 0 ? 'sel' : 'open'); } catch {} }

/* ---------- saving: after a login is sent, ask once the page has moved on (and the form is gone) ---------- */
function onSubmit(s, d) {
  if (!P.save || !vault.ready()) return;
  const pass = String(d.pass || ''); if (!pass) return;
  let user = String(d.user || '');
  const lu = lastUser.get(s.wc.id);
  if (!user && lu && lu.origin === s.origin && Date.now() - lu.t < 10 * 60e3) user = lu.user;
  const kind = vault.wouldSave(s.origin, user, pass); if (!kind) return;
  const old = pend.get(s.wc.id); if (old) clearTimeout(old.timer);
  const p = { origin: s.origin, user, pass, kind, nav: false };
  p.timer = setTimeout(() => check(s.wc), 2500);                 // a sign-in that doesn't load a new page
  pend.set(s.wc.id, p);
}
function check(wc) {
  if (wc.isDestroyed() || !pend.has(wc.id)) return;
  try { wc.mainFrame.send('washi-pw-check'); } catch { offer(wc); }
}
function onCheck(s, d) {
  const p = pend.get(s.wc.id); if (!p) return;
  if (d.pass) { if (p.nav) pend.delete(s.wc.id); return; }       // the sign-in form is still there: it probably didn't work
  offer(s.wc);
}
function offer(wc) {
  const p = pend.get(wc.id); if (!p) return; pend.delete(wc.id); clearTimeout(p.timer);
  const kind = vault.wouldSave(p.origin, p.user, p.pass); if (!kind) return;
  const tok = require('crypto').randomBytes(9).toString('hex');
  saving.set(tok, { origin: p.origin, user: p.user, pass: p.pass, at: Date.now() });
  for (const [k, v] of saving) if (Date.now() - v.at > 10 * 60e3) saving.delete(k);
  const f = ui.tab(wc); if (!f) return;
  ui.save({ wc, ...f }, { token: tok, kind, host: new URL(p.origin).host, user: p.user, len: p.pass.length });
}
/* your answer on the "Save password?" card */
function answer(a) {
  const x = a && saving.get(a.token); if (!x) return { ok: false };
  saving.delete(a.token);
  if (a.act === 'save') { const id = vault.upsert(x.origin, typeof a.user === 'string' ? a.user.slice(0, 300) : x.user, x.pass); return { ok: !!id }; }
  if (a.act === 'never') { vault.never(x.origin, true); return { ok: true }; }
  return { ok: true };
}

/* ---------- passkeys ---------- */
const std = b64u => Buffer.from(String(b64u || ''), 'base64url').toString('base64');
const url64 = b64 => Buffer.from(String(b64 || ''), 'base64').toString('base64url');
async function verify(reason) {
  if (testUV()) return true;
  if (process.platform === 'darwin') {
    try { if (systemPreferences.canPromptTouchID()) { await systemPreferences.promptTouchID(reason); return true; } } catch { return null; }   // null: Touch ID said no
  }
  return false;                                                   // no Touch ID: your click on Washi's card is the only check
}
async function passkey(e, info) {
  const s = source(e); if (!s || !info || typeof info !== 'object') return 'cancel';
  if (info.kind === 'done') { const st = serving.get(s.wc.id); if (st) { clearTimeout(st.timer); st.timer = setTimeout(() => stopServing(s.wc), 50); } return 'ok'; }
  if (!P.passkeys) return 'go';                                   // off in Settings: the request goes to the browser untouched
  const id = s.wc.id, u = new URL(s.origin), host = u.hostname;
  if (u.protocol !== 'https:' && host !== 'localhost') return 'cancel';
  if (pkBusy.has(id) || Date.now() < (pkQuiet.get(id) || 0)) return 'cancel';
  const rpId = String(info.rpId || host).toLowerCase();
  if (!(host === rpId || host.endsWith('.' + rpId)) || (!rpId.includes('.') && rpId !== 'localhost')) return 'cancel';
  pkBusy.add(id);
  try {
    hideMenu(s.wc);
    let creds = [], ans;
    if (info.kind === 'get') {
      const allow = Array.isArray(info.allow) ? info.allow.map(String) : [];
      creds = vault.passkeysFor(rpId).filter(p => !allow.length || allow.includes(p.credId));
      ans = await ui.passkey(s, { kind: 'get', rpId, accounts: creds.map(p => ({ id: p.id, user: p.user || p.display || 'Passkey' })) });
    } else if (info.kind === 'create') {
      ans = await ui.passkey(s, { kind: 'create', rpId, user: String(info.user || '').slice(0, 300) });
    } else return 'cancel';
    if (!ans || (ans.act !== 'use' && ans.act !== 'create')) { pkQuiet.set(id, Date.now() + 2500); return 'cancel'; }
    if (s.wc.isDestroyed() || originOf(s.wc.mainFrame.url) !== s.origin) return 'cancel';
    const chosen = ans.act === 'use' ? creds.find(p => p.id === ans.id) : null;
    if (ans.act === 'use' && !chosen) return 'cancel';
    const uv = await verify(ans.act === 'use' ? `sign in to ${rpId}` : `save a passkey for ${rpId}`);
    if (uv === null) { pkQuiet.set(id, Date.now() + 2500); return 'cancel'; }
    await serve(s.wc, rpId, uv, ans.act === 'use' ? [chosen] : vault.passkeysFor(rpId), info.user);
    ui.focus(s);                                                  // the browser only answers a focused page: wait until it is
    for (let i = 0; i < 50 && !s.wc.isDestroyed() && !s.wc.isFocused(); i++) { await new Promise(r => setTimeout(r, 20)); if (i % 10 === 9) ui.focus(s); }
    return chosen ? 'go:' + chosen.credId : 'go';
  } catch (err) { console.error('passkey', err && err.message); return 'cancel'; }
  finally { pkBusy.delete(id); }
}
/* a virtual authenticator holding just what this request may use; it goes away when the request is done */
const serving = new Map();
async function serve(wc, rpId, uv, creds, userName) {
  await stopServing(wc);
  const d = wc.debugger; let ours = false;
  if (!d.isAttached()) { d.attach('1.3'); ours = true; }
  const st = { wc, ours, auth: null, rpId, timer: null, onMsg: null, userName };
  serving.set(wc.id, st);
  await d.sendCommand('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await d.sendCommand('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: !!uv, automaticPresenceSimulation: true } });
  st.auth = authenticatorId;
  for (const p of creds) {
    const credential = { credentialId: std(p.credId), isResidentCredential: true, rpId: p.rpId, privateKey: p.key, userHandle: std(p.userHandle), signCount: p.count || 0 };
    try { await d.sendCommand('WebAuthn.addCredential', { authenticatorId, credential: { ...credential, userName: p.user || '', userDisplayName: p.display || '' } }); }
    catch { await d.sendCommand('WebAuthn.addCredential', { authenticatorId, credential }); }
  }
  st.onMsg = (_, method, params) => {
    if (!params || params.authenticatorId !== authenticatorId) return;
    if (method === 'WebAuthn.credentialAdded' || method === 'WebAuthn.credentialAsserted') { clearTimeout(st.timer); st.timer = setTimeout(() => stopServing(wc), 5000); }   // normally the page says it's done first
  };
  d.on('message', st.onMsg);
  st.timer = setTimeout(() => stopServing(wc), 120e3);
}
/* before taking the authenticator away, keep what it now holds: a new passkey, or a used one's new counter */
async function stopServing(wc) {
  const st = serving.get(wc.id); if (!st) return; serving.delete(wc.id); clearTimeout(st.timer);
  if (wc.isDestroyed()) return;
  const d = wc.debugger;
  try {
    if (st.auth) {
      const { credentials } = await d.sendCommand('WebAuthn.getCredentials', { authenticatorId: st.auth });
      for (const c of credentials || []) {
        const credId = url64(c.credentialId), have = vault.passkeysFor(c.rpId).find(p => p.credId === credId);
        if (have) vault.passkeyUsed(c.rpId, credId, c.signCount);
        else if (c.rpId === st.rpId && c.privateKey) vault.addPasskey({ rpId: c.rpId, credId, userHandle: url64(c.userHandle), user: c.userName || st.userName || '', display: c.userDisplayName || '', key: c.privateKey, count: c.signCount || 0 });
      }
      await d.sendCommand('WebAuthn.removeVirtualAuthenticator', { authenticatorId: st.auth });
    }
    await d.sendCommand('WebAuthn.disable');
  } catch (e) { console.error('passkey cleanup', e && e.message); }
  if (st.onMsg) d.removeListener('message', st.onMsg);
  if (st.ours) try { d.detach(); } catch {}
}

/* ---------- messages from pages ---------- */
function init() {
  ipcMain.on('washi-page', (e, type, d) => {
    const s = source(e); if (!s || typeof type !== 'string' || !d || typeof d !== 'object') return;
    if (type === 'focus') onFocus(s, d);
    else if (type === 'blur') setTimeout(() => { const m = menus.get(s.wc.id); if (m && !m.picking) hideMenu(s.wc); }, 180);
    else if (type === 'typed') hideMenu(s.wc);
    else if (type === 'key' && menus.has(s.wc.id)) { if (d.key === 'Escape') hideMenu(s.wc); else ui.menuKey(s, String(d.key)); }
    else if (type === 'user' && d.user) lastUser.set(s.wc.id, { origin: s.origin, user: String(d.user).slice(0, 300), t: Date.now() });
    else if (type === 'submit') onSubmit(s, d);
    else if (type === 'check') onCheck(s, d);
  });
  ipcMain.handle('washi-passkey', passkey);
}
const configure = p => Object.assign(P, p);
module.exports = { init, configure, P, pick, hideMenu, menuSel, answer, menus, stopServing, bind: h => { ui = { ...ui, ...h }; }, picking: wc => { const m = menus.get(wc.id); if (m) m.picking = true; } };
