'use strict';
/* Washi's own code-signing certificate (self-made, free; not Apple's paid Developer ID). A stable signature lets macOS
   remember "Always Allow" for the Keychain and keeps site permissions across updates. The certificate is kept in the
   repo encrypted (build/signing.enc); the key to open it comes from the WASHI_UPDATE_KEY secret, so only the release
   build can use it.
   Usage: WASHI_UPDATE_KEY="<pem>" node scripts/signing-identity.js open <out.p12>     → prints the .p12 password
          WASHI_UPDATE_KEY="<pem>" node scripts/signing-identity.js seal <in.p12>      (one time, when making it) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const pem = process.env.WASHI_UPDATE_KEY; if (!pem) { console.error('WASHI_UPDATE_KEY is not set'); process.exit(2); }
const der = crypto.createPrivateKey(pem).export({ type: 'pkcs8', format: 'der' });
const derive = label => crypto.createHash('sha256').update(label).update(der).digest();
const key = derive('washi-signing-file'), pass = derive('washi-signing-p12').toString('hex').slice(0, 32);
const ENC = path.join(__dirname, '..', 'build', 'signing.enc');
const [cmd, file] = process.argv.slice(2);
if (cmd === 'seal') {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(fs.readFileSync(file)), c.final()]);
  fs.writeFileSync(ENC, Buffer.concat([iv, c.getAuthTag(), body]));
  console.log(pass);
} else if (cmd === 'open') {
  const b = fs.readFileSync(ENC), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  fs.writeFileSync(file, Buffer.concat([d.update(b.subarray(28)), d.final()]), { mode: 0o600 });
  console.log(pass);
} else if (cmd === 'pass') console.log(pass);
else { console.error('usage: signing-identity.js open|seal <file>'); process.exit(2); }
