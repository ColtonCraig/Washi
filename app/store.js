'use strict';
/* Where Washi keeps its files, with atomic writes (write a temp file, then rename) so a crash never leaves half a file. */
const { app } = require('electron');
const fs = require('fs'), path = require('path');

const PROFILE = process.env.WASHI_PROFILE || process.env.BLOOM_PROFILE;
if (PROFILE) app.setPath('userData', PROFILE);                       // tests run in a throwaway profile
else {
  /* Bloom was Washi's working name: carry an existing profile over the first time Washi starts */
  try {
    const now = app.getPath('userData'), old = path.join(app.getPath('appData'), 'Bloom');
    if (!fs.existsSync(path.join(now, 'state.json')) && fs.existsSync(path.join(old, 'state.json'))) fs.cpSync(old, now, { recursive: true, errorOnExist: false });
  } catch {}
}
const file = n => path.join(app.getPath('userData'), n);
function read(n) { try { return fs.readFileSync(file(n), 'utf8'); } catch { return null; } }
function readJSON(n, d) { try { const v = JSON.parse(read(n)); return v == null ? d : v; } catch { return d; } }
const gen = new Map();
function write(n, s) {
  gen.set(n, (gen.get(n) || 0) + 1);
  const f = file(n), tmp = f + '.' + process.pid + '.tmp';
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, s); fs.renameSync(tmp, f); } catch (e) { console.error('write failed', n, e.message); try { fs.unlinkSync(tmp); } catch {} }
}
/* Off the main thread: the latest content for each file is written in the background, one write at a time per file. */
const queued = new Map(), busy = new Set();
let syncMode = false; const waiters = [];
const idle = () => (busy.size ? new Promise(r => waiters.push(r)) : Promise.resolve());
function writeSoon(n, s) {
  if (syncMode) return write(n, s);                    // quitting: write right away
  queued.set(n, s); if (busy.has(n)) return;
  busy.add(n);
  (async function loop() {
    while (queued.has(n)) {
      const data = queued.get(n); queued.delete(n); const g = gen.get(n) || 0;
      const f = file(n), tmp = f + '.' + process.pid + '.a.tmp';
      try {
        await fs.promises.mkdir(path.dirname(f), { recursive: true }); await fs.promises.writeFile(tmp, data);
        if ((gen.get(n) || 0) === g) await fs.promises.rename(tmp, f); else await fs.promises.unlink(tmp);   // a newer write already landed
      }
      catch (e) { console.error('write failed', n, e.message); fs.promises.unlink(tmp).catch(() => {}); }
    }
    busy.delete(n); if (!busy.size) for (const r of waiters.splice(0)) r();
  })();
}
function flush() { syncMode = true; for (const [n, s] of queued) write(n, s); queued.clear(); }   // at quit: finish anything still waiting
const writeJSON = (n, o) => write(n, JSON.stringify(o));
const remove = n => { queued.delete(n); gen.set(n, (gen.get(n) || 0) + 1); try { fs.rmSync(file(n), { recursive: true, force: true }); } catch {} };   // a save still on its way must not bring it back
module.exports = { file, read, readJSON, write, writeSoon, flush, idle, pending: () => busy.size > 0, writeJSON, remove };
