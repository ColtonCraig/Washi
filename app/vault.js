'use strict';
/* Saved passwords and passkeys. Everything is kept in one file, encrypted with a key that lives in the macOS Keychain
   (Electron's safeStorage), so the file on disk is unreadable without your Mac login. Nothing ever leaves this Mac.
   Pages never see this module: they only get a password typed into a field after you pick it in Washi's own UI.
   A login is { id, origin, user, pass, at, used }; a passkey is { id, rpId, credId, userHandle, user, display, key, count, at, used }
   (key = the private key, PKCS#8 base64; credId/userHandle = base64url). */
const { safeStorage } = require('electron');
const crypto = require('crypto');
const store = require('./store');

const FILE = 'vault.json', MAX = 5000;
const testKeyring = () => { if (process.platform === 'linux' && process.env.WASHI_TEST_KEYRING === 'basic' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true); };   // tests on Linux have no keyring
let V = null, broken = false;
const empty = () => ({ logins: [], passkeys: [], never: [] });
const uid = () => crypto.randomBytes(9).toString('base64url');
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const okOrigin = o => { try { const u = new URL(o); return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === o; } catch { return false; } };

function load() {
  if (V) return V;
  testKeyring();
  const raw = store.readJSON(FILE, null);
  if (!raw) { V = empty(); return V; }
  try {
    const j = JSON.parse(safeStorage.decryptString(Buffer.from(raw.v, 'base64')));
    V = { logins: Array.isArray(j.logins) ? j.logins : [], passkeys: Array.isArray(j.passkeys) ? j.passkeys : [], never: Array.isArray(j.never) ? j.never : [] };
  } catch (e) {
    /* can't decrypt (the Keychain said no, or the file was damaged): keep the file untouched, never overwrite it */
    console.error('vault: could not open', e.message); broken = true; V = empty();
  }
  return V;
}
function save() {
  if (broken) return false;
  if (!safeStorage.isEncryptionAvailable()) return false;
  store.writeJSON(FILE, { v: safeStorage.encryptString(JSON.stringify(V)).toString('base64'), n: V.logins.length + V.passkeys.length });
  return true;
}
const ready = () => { load(); return !broken && safeStorage.isEncryptionAvailable(); };

/* ---------- logins ---------- */
const forOrigin = origin => load().logins.filter(l => l.origin === origin).sort((a, b) => (b.used || b.at) - (a.used || a.at));
/* what a page's save prompt should offer: 'new' | 'update' (same user, new password) | null (already saved, or never for this site) */
function wouldSave(origin, user, pass) {
  load();
  if (!okOrigin(origin) || !pass || V.never.includes(origin)) return null;
  const same = V.logins.find(l => l.origin === origin && l.user === user);
  if (!same) return 'new';
  return same.pass === pass ? null : 'update';
}
function upsert(origin, user, pass) {
  if (!ready() || !okOrigin(origin) || !pass) return null;
  user = clip(user, 300); pass = clip(pass, 1000);
  let l = V.logins.find(x => x.origin === origin && x.user === user);
  if (l) { l.pass = pass; l.at = Date.now(); }
  else { if (V.logins.length >= MAX) return null; l = { id: uid(), origin, user, pass, at: Date.now(), used: 0 }; V.logins.push(l); }
  save(); return l.id;
}
function edit(id, patch) {
  if (!ready()) return false;
  const l = V.logins.find(x => x.id === id); if (!l) return false;
  if (patch.user !== undefined) l.user = clip(patch.user, 300);
  if (patch.pass !== undefined && patch.pass) l.pass = clip(patch.pass, 1000);
  if (patch.origin !== undefined) { const o = normOrigin(patch.origin); if (!o) return false; l.origin = o; }
  l.at = Date.now(); save(); return true;
}
function remove(id) {
  if (!ready()) return null;
  const i = V.logins.findIndex(x => x.id === id); if (i < 0) return null;
  const [l] = V.logins.splice(i, 1); save(); return l;
}
function restore(l) { if (!ready() || !l || !okOrigin(l.origin)) return; if (!V.logins.some(x => x.id === l.id)) { V.logins.push(l); save(); } }
function used(id) { const l = load().logins.find(x => x.id === id); if (l) { l.used = Date.now(); save(); } return l; }
function never(origin, on = true) { if (!ready() || !okOrigin(origin)) return; V.never = V.never.filter(o => o !== origin); if (on) V.never.push(origin); save(); }
const get = id => load().logins.find(x => x.id === id) || null;

/* "github.com", "https://github.com/login" → "https://github.com" */
function normOrigin(s) {
  s = String(s || '').trim(); if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') && u.hostname !== 'localhost') return null; return u.origin; } catch { return null; }
}

/* ---------- CSV import (Chrome, Safari, Firefox, 1Password, Bitwarden, Edge…) ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function importCSV(text) {
  if (!ready()) return { ok: false, error: 'Passwords can\'t be stored securely on this Mac right now.' };
  const rows = parseCSV(text); if (rows.length < 2) return { ok: false, error: 'That file has no passwords in it.' };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => head.findIndex(h => names.includes(h));
  const cu = col('url', 'login_uri', 'website', 'web site', 'origin', 'login url'), cn = col('username', 'login_username', 'user name', 'login', 'email'), cp = col('password', 'login_password');
  if (cu < 0 || cp < 0) return { ok: false, error: 'That doesn\'t look like a passwords export (it needs URL and Password columns).' };
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const origin = normOrigin(r[cu]), pass = r[cp] || '', user = cn >= 0 ? (r[cn] || '') : '';
    if (!origin || !pass) { skipped++; continue; }
    const k = wouldSave(origin, user, pass);
    if (k === null && V.logins.some(l => l.origin === origin && l.user === user)) continue;
    if (V.logins.length >= MAX) { skipped++; continue; }
    const had = V.logins.find(l => l.origin === origin && l.user === user);
    if (had) { had.pass = clip(pass, 1000); had.at = Date.now(); updated++; }
    else { V.logins.push({ id: uid(), origin, user: clip(user, 300), pass: clip(pass, 1000), at: Date.now(), used: 0 }); added++; }
  }
  save();
  return { ok: true, added, updated, skipped };
}
const csvCell = s => /[",\n\r]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
const exportCSV = () => 'name,url,username,password\n' + load().logins.map(l => [new URL(l.origin).host, l.origin + '/', l.user, l.pass].map(csvCell).join(',')).join('\n') + '\n';

/* ---------- passkeys ---------- */
const passkeysFor = rpId => load().passkeys.filter(p => p.rpId === rpId).sort((a, b) => (b.used || b.at) - (a.used || a.at));
function addPasskey(p) {
  if (!ready()) return false;
  const credId = clip(p.credId, 2000);
  const old = V.passkeys.find(x => x.credId === credId && x.rpId === p.rpId);
  if (old) { old.count = Math.max(old.count || 0, +p.count || 0); old.used = Date.now(); save(); return true; }
  V.passkeys.push({ id: uid(), rpId: clip(p.rpId, 255), credId, userHandle: clip(p.userHandle, 200), user: clip(p.user, 300), display: clip(p.display, 300), key: clip(p.key, 8000), count: +p.count || 0, at: Date.now(), used: Date.now() });
  save(); return true;
}
function passkeyUsed(rpId, credId, count) { const p = load().passkeys.find(x => x.rpId === rpId && x.credId === credId); if (p) { p.used = Date.now(); if (count !== undefined) p.count = Math.max(p.count || 0, +count || 0); save(); } }
function removePasskey(id) { if (!ready()) return null; const i = V.passkeys.findIndex(x => x.id === id); if (i < 0) return null; const [p] = V.passkeys.splice(i, 1); save(); return p; }
function restorePasskey(p) { if (!ready() || !p) return; if (!V.passkeys.some(x => x.id === p.id)) { V.passkeys.push(p); save(); } }

/* what Settings shows: never the passwords or keys themselves */
const list = () => ({
  logins: load().logins.map(l => ({ id: l.id, origin: l.origin, host: new URL(l.origin).host, user: l.user, at: l.at, used: l.used, len: l.pass.length })).sort((a, b) => a.host.localeCompare(b.host) || a.user.localeCompare(b.user)),
  passkeys: load().passkeys.map(p => ({ id: p.id, rpId: p.rpId, user: p.user || p.display, at: p.at, used: p.used })).sort((a, b) => a.rpId.localeCompare(b.rpId)),
  never: [...load().never].sort(), ok: ready(), broken
});

/* a strong password: 20 characters, letters and digits in dash-separated groups, easy to read aloud */
function generate() {
  const A = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let s = '';
    for (let i = 0; i < 18; i++) { s += A[crypto.randomInt(A.length)]; if (i === 5 || i === 11) s += '-'; }
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s)) return s;
  }
}
module.exports = { forOrigin, wouldSave, upsert, edit, remove, restore, used, never, get, normOrigin, importCSV, exportCSV, parseCSV, passkeysFor, addPasskey, passkeyUsed, removePasskey, restorePasskey, list, generate, ready };
