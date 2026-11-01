'use strict';
/* Live folders: a folder that fills itself from GitHub pull requests or an RSS/Atom feed.
   Fetching happens here (so pages' rules don't apply and nothing runs from the feed); the sidebar only gets
   plain {key, url, title} items. A GitHub token (for private repos) is kept encrypted with the macOS Keychain. */
const { net, safeStorage } = require('electron');
const store = require('./store');

const API = () => process.env.WASHI_GITHUB_API || 'https://api.github.com';
const MAX_ITEMS = 30, MAX_BYTES = 4 * 1024 * 1024, TIMEOUT = 15000;
const okURL = u => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 4096;
const clip = (s, n = 200) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/* ---------- GitHub token (optional) ---------- */
const testKeyring = () => { if (process.platform === 'linux' && process.env.WASHI_TEST_KEYRING === 'basic' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true); };   // tests on Linux have no keyring; never used in the Mac app
function tokenGet() {
  testKeyring();
  const t = store.readJSON('github-token.json', null); if (!t || !t.v) return '';
  try { return t.enc ? safeStorage.decryptString(Buffer.from(t.v, 'base64')) : ''; } catch { return ''; }
}
function tokenSet(v) {
  v = String(v || '').trim();
  if (!v) { store.remove('github-token.json'); return { ok: true, has: false }; }
  if (!/^[A-Za-z0-9_\-.]{20,255}$/.test(v)) return { ok: false, error: 'That doesn\'t look like a GitHub token.' };
  testKeyring();
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Can\'t store it securely on this computer.' };
  store.writeJSON('github-token.json', { enc: true, v: safeStorage.encryptString(v).toString('base64') });
  return { ok: true, has: true };
}

async function get(url, headers = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': 'Washi', ...headers }, signal: ctl.signal, cache: 'no-store', redirect: 'follow' });
    const len = +r.headers.get('content-length'); if (len > MAX_BYTES) throw new Error('That feed is too big.');
    const text = await r.text(); if (text.length > MAX_BYTES) throw new Error('That feed is too big.');
    return { status: r.status, text };
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'It took too long to answer.' : (e.message || 'Couldn\'t reach it.')); }
  finally { clearTimeout(t); }
}

/* "owner/repo", or any github.com URL of a repo → "owner/repo" */
function repoOf(s) {
  s = String(s || '').trim().replace(/\.git$/, '');
  const m = s.match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:[/?#].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
async function github(src) {
  const repo = repoOf(src); if (!repo) throw new Error('Type it like owner/repo, for example electron/electron.');
  const tok = tokenGet();
  const r = await get(`${API()}/repos/${repo}/pulls?state=open&per_page=${MAX_ITEMS}&sort=created&direction=desc`, { Accept: 'application/vnd.github+json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) });
  if (r.status === 404) throw new Error(tok ? `Can't see ${repo}. Check the name, and that your token can read it.` : `Can't see ${repo}. If it's private, add a GitHub token in Settings › Tabs.`);
  if (r.status === 401 || r.status === 403) throw new Error(/rate limit/i.test(r.text) ? 'GitHub says to slow down. Washi will try again later.' : 'GitHub refused the token. Check it in Settings › Tabs.');
  if (r.status !== 200) throw new Error(`GitHub answered ${r.status}.`);
  let list; try { list = JSON.parse(r.text); } catch { throw new Error('GitHub sent something unexpected.'); }
  if (!Array.isArray(list)) throw new Error('GitHub sent something unexpected.');
  return { name: repo.split('/')[1], items: list.filter(p => p && okURL(p.html_url)).slice(0, MAX_ITEMS).map(p => ({ key: 'pr:' + p.number, url: p.html_url, title: clip(`#${p.number} ${p.title || ''}`) + (p.draft ? ' (draft)' : '') })) };
}

/* ---------- RSS 2.0 / Atom, without running anything from the feed ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m).replace(/<[^>]+>/g, '');   // titles marked as HTML: drop the tags after decoding
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]).trim() : ''; };
function parseFeed(xml, base) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('That address isn\'t an RSS or Atom feed.');
  const abs = u => { try { return new URL(u, base).toString(); } catch { return ''; } };
  const head = xml.split(/<(item|entry)[\s>]/i)[0];
  const name = clip(tag(head, 'title'), 40);
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const b = m[2];
    let link = tag(b, 'link');
    if (!link) { const alt = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i) || b.match(/<link\b[^>]*>/i); const h = alt && alt[0].match(/href=["']([^"']+)["']/i); if (h) link = decode(h[1]); }
    link = abs(link.trim()); if (!okURL(link)) continue;
    const id = tag(b, 'guid') || tag(b, 'id') || link;
    items.push({ key: 'f:' + id.slice(0, 300), url: link, title: clip(tag(b, 'title') || link) });
    if (items.length >= MAX_ITEMS) break;
  }
  return { name, items };
}
async function feed(src) {
  let u = String(src || '').trim();
  if (!/^https?:\/\//i.test(u)) u = (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?([/?#]|$)/i.test(u) ? 'http://' : 'https://') + u;
  if (!okURL(u)) throw new Error('Type the feed\'s address.');
  const r = await get(u, { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1' });
  if (r.status !== 200) throw new Error(`The site answered ${r.status}.`);
  return { ...parseFeed(r.text, u), src: u };
}
async function fetchLive(kind, src) {
  try { const r = kind === 'github' ? await github(src) : await feed(src); return { ok: true, ...r, src: r.src || (kind === 'github' ? repoOf(src) : src) }; }
  catch (e) { return { ok: false, error: e.message || 'Couldn\'t load it.' }; }
}
module.exports = { fetchLive, parseFeed, repoOf, tokenSet, tokenHas: () => !!tokenGet() };
