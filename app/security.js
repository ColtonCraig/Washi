'use strict';
/* Locks down the parts of Washi that web pages must never reach.
   - Only Washi's own interface (served from washi://app) may talk to the main process; every IPC message is checked.
   - The interface views can't navigate away, open windows, or attach <webview>s.
   - Every webContents (pages included) refuses <webview> and gets a sandbox. */
const { app, ipcMain } = require('electron');
const { ORIGIN } = require('./protocol');

const ui = new Set();
function trustUI(wc) {
  ui.add(wc.id);
  wc.once('destroyed', () => ui.delete(wc.id));
  wc.on('will-navigate', e => e.preventDefault());
  wc.on('will-redirect', e => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}
const trusted = e => ui.has(e.sender.id) && !!e.senderFrame && e.senderFrame.url.startsWith(ORIGIN + '/');
let refused = 0;
function on(ch, fn) { ipcMain.on(ch, (e, ...a) => { if (!trusted(e)) { refused++; return; } try { fn(e, ...a); } catch (err) { console.error(ch, err); } }); }
function handle(ch, fn) { ipcMain.handle(ch, (e, ...a) => { if (!trusted(e)) { refused++; throw new Error('Not allowed'); } return fn(e, ...a); }); }

app.on('web-contents-created', (_, wc) => {
  wc.on('will-attach-webview', e => e.preventDefault());
});
module.exports = { trustUI, trusted, on, handle, refusedCount: () => refused };
