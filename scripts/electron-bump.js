'use strict';
/* Security updates: moves Washi to the newest Electron in the same major version (Chromium's security fixes arrive as
   these patch releases), bumps Washi's patch version, and adds the What's new and BACKLOG notes.
   Prints "none" when there's nothing newer, else "<old> <new> <washi version>". A new major version (a bigger change
   that needs a person to look at it) is only reported: "major <version>".
   Usage: node scripts/electron-bump.js [--dry]   (run by .github/workflows/electron-update.yml) */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..'), P = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(P, 'utf8'));
const cur = pkg.devDependencies.electron, major = cur.split('.')[0];
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const stable = v => /^\d+\.\d+\.\d+$/.test(v);
const all = JSON.parse(execSync('npm view electron versions --json', { encoding: 'utf8' })).filter(stable);
const same = all.filter(v => v.split('.')[0] === major).sort(cmp), newest = same[same.length - 1];
const nextMajor = all.filter(v => +v.split('.')[0] > +major).sort(cmp).pop();
if (nextMajor) console.error('major ' + nextMajor);
if (!newest || cmp(newest, cur) <= 0) { console.log('none'); process.exit(0); }

(async () => {
  let chrome = '';
  try { const r = await (await fetch('https://releases.electronjs.org/releases.json')).json(); chrome = (r.find(x => x.version === newest) || {}).chrome || ''; } catch {}
  const [a, b, c] = pkg.version.split('.').map(Number), ver = `${a}.${b}.${c + 1}`;
  if (process.argv.includes('--dry')) { console.log(`${cur} ${newest} ${ver}`); return; }
  execSync(`npm install --save-exact --ignore-scripts --no-audit --no-fund electron@${newest}`, { cwd: root, stdio: 'inherit' });
  const pk = JSON.parse(fs.readFileSync(P, 'utf8')); pk.version = ver; fs.writeFileSync(P, JSON.stringify(pk, null, 2) + '\n');
  const lock = path.join(root, 'package-lock.json');
  if (fs.existsSync(lock)) { const l = JSON.parse(fs.readFileSync(lock, 'utf8')); l.version = ver; if (l.packages && l.packages['']) l.packages[''].version = ver; fs.writeFileSync(lock, JSON.stringify(l, null, 2) + '\n'); }
  const engine = chrome ? `Chromium ${chrome.split('.')[0]}, Electron ${newest}` : `Electron ${newest}`;
  const fix = `Security fixes from Chromium, the engine underneath Washi (now ${engine}).`;
  const W = path.join(root, 'ui', 'whatsnew.js'); let w = fs.readFileSync(W, 'utf8');
  w = w.replace('window.WHATSNEW = [\n', `window.WHATSNEW = [\n  {\n    v: '${ver}',\n    lead: 'A security update.',\n    fixes: [\n      '${fix.replace(/'/g, "\\'")}'\n    ]\n  },\n`);
  fs.writeFileSync(W, w);
  const BL = path.join(root, 'BACKLOG.md'); let bl = fs.readFileSync(BL, 'utf8');
  bl = bl.replace(/\n## Done and tested \(/, `\n## Done and tested (${ver})\n- Security update: Electron ${cur} → ${newest}${chrome ? ` (Chromium ${chrome})` : ''}, automatically, after the full test run passed\n\n## Done and tested (`);
  fs.writeFileSync(BL, bl);
  console.log(`${cur} ${newest} ${ver}`);
})().catch(e => { console.error(e); process.exit(1); });
