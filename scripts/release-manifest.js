'use strict';
/* Writes the signed latest.json that installed copies of Washi read to find updates.
   Usage: WASHI_UPDATE_KEY="<private key PEM>" node scripts/release-manifest.js <version> <out-dir> <arm64.zip> <x64.zip> ["notes"]
   The private key lives only in the WASHI_UPDATE_KEY GitHub secret; app/update-key.pub is its public half. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [version, outDir, arm, x64, notes = ''] = process.argv.slice(2);
if (!version || !outDir || !arm) { console.error('usage: release-manifest.js <version> <out-dir> <arm64.zip> [x64.zip] [notes]'); process.exit(2); }
const pem = process.env.WASHI_UPDATE_KEY; if (!pem) { console.error('WASHI_UPDATE_KEY is not set'); process.exit(2); }
const file = f => ({ name: path.basename(f), size: fs.statSync(f).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') });
const shown = (() => { try { const w = require('../package.json').washi || {}; return { display: String(w.display || version), paper: String(w.paper || '') }; } catch { return { display: version, paper: '' }; } })();   // what people see (1.0 “Kozo”)
const payload = JSON.stringify({ version, ...shown, date: new Date().toISOString(), notes, files: { arm64: file(arm), ...(x64 ? { x64: file(x64) } : {}) } });
const key = crypto.createPrivateKey(pem);
const pub = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
if (pub.trim() !== fs.readFileSync(path.join(__dirname, '..', 'app', 'update-key.pub'), 'utf8').trim()) { console.error('WASHI_UPDATE_KEY does not match app/update-key.pub'); process.exit(1); }
const sig = crypto.sign(null, Buffer.from(payload), key).toString('base64');
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({ payload, sig }, null, 1));
console.log('wrote', path.join(outDir, 'latest.json'));
