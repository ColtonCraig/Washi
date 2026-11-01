'use strict';
/* Compact phishing-domain set: 64-bit FNV-1a hashes, sorted, binary-searched. ~8 bytes per domain, no false alarms in practice.
   Shared by the build script (plain Node) and the browser. */
const OFF = 0xcbf29ce484222325n, PRIME = 0x100000001b3n, MASK = (1n << 64n) - 1n;
function hash(s) { let h = OFF; for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * PRIME) & MASK; } return h; }
/* big shared hosts that phishing lists sometimes name as a whole; we never block these outright */
const NEVER = new Set(['google.com', 'docs.google.com', 'sites.google.com', 'drive.google.com', 'forms.gle', 'goo.gl', 'microsoft.com', 'live.com', 'office.com', 'sharepoint.com', 'onedrive.live.com',
  'apple.com', 'icloud.com', 'amazon.com', 'amazonaws.com', 'cloudfront.net', 'github.com', 'github.io', 'githubusercontent.com', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev',
  'firebaseapp.com', 'web.app', 'appspot.com', 'herokuapp.com', 'azurewebsites.net', 'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'square.site', 'webflow.io', 'notion.site',
  'dropbox.com', 'box.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'bit.ly', 'tinyurl.com', 'ipfs.io', 'cloudflare-ipfs.com', 'r2.dev', 'glitch.me', 'repl.co', 'replit.app']);
function build(text) {
  const out = [];
  for (let line of text.split('\n')) {
    line = line.trim().toLowerCase(); if (!line || line[0] === '#' || line.includes('/') || line.includes(' ')) continue;
    if (NEVER.has(line)) continue;
    out.push(hash(line));
  }
  const arr = BigUint64Array.from(out).sort();
  const uniq = arr.filter((v, i) => i === 0 || v !== arr[i - 1]);
  return Buffer.from(uniq.buffer, uniq.byteOffset, uniq.byteLength);
}
function load(buf) { return new BigUint64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - (buf.byteLength % 8))); }
function has(set, h) { let lo = 0, hi = set.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1, v = set[m]; if (v === h) return true; if (v < h) lo = m + 1; else hi = m - 1; } return false; }
/* sub.evil.example.com -> checks sub.evil.example.com, evil.example.com, example.com */
function check(set, host) {
  if (!set || !host) return false;
  host = host.toLowerCase().replace(/\.$/, ''); const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) { const d = parts.slice(i).join('.'); if (NEVER.has(d)) return false; if (has(set, hash(d))) return true; }
  return false;
}
module.exports = { hash, build, load, check, NEVER };
