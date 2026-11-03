'use strict';
/* Every keyboard shortcut Washi has, with its default. Users can change any of them in Settings → Shortcuts;
   the menu bar is rebuilt from this list, so menus always show the keys that really work. */
const ACTIONS = [
  // id, label, menu, default accelerator
  ['settings', 'Settings', 'app', 'CmdOrCtrl+,'],
  ['newtab', 'New Scrap (search or address)', 'file', 'CmdOrCtrl+T'],
  ['newwindow', 'New Window', 'file', 'CmdOrCtrl+N'],
  ['closewindow', 'Close Window', 'file', 'CmdOrCtrl+Shift+W'],
  ['scrap', 'New Little Scrap', 'file', 'Alt+CmdOrCtrl+N'],
  ['scrapadopt', 'Open Little Scrap in Washi', 'file', 'CmdOrCtrl+O'],
  ['location', 'Edit This Address', 'file', 'CmdOrCtrl+L'],
  ['newspace', 'New Space', 'file', 'CmdOrCtrl+Shift+N'],
  ['newfolder', 'New Folder', 'file', 'CmdOrCtrl+Shift+F'],
  ['close', 'Close Tab', 'file', 'CmdOrCtrl+W'],
  ['reopen', 'Reopen Closed Tab', 'file', 'CmdOrCtrl+Shift+T'],
  ['pin', 'Pin or Unpin Tab', 'file', 'CmdOrCtrl+D'],
  ['print', 'Print…', 'file', 'CmdOrCtrl+P'],
  ['find', 'Find on Page…', 'edit', 'CmdOrCtrl+F'],
  ['findnext', 'Find Next', 'edit', 'CmdOrCtrl+G'],
  ['findprev', 'Find Previous', 'edit', 'CmdOrCtrl+Shift+G'],
  ['copyurl', 'Copy Page Address', 'edit', 'CmdOrCtrl+Shift+C'],
  ['today', 'Today', 'view', 'CmdOrCtrl+Shift+H'],
  ['reader', 'Reader Mode', 'view', 'CmdOrCtrl+Alt+R'],
  ['notes', 'Sticky Note', 'view', 'CmdOrCtrl+Shift+K'],
  ['sidebar', 'Pin or Float Sidebar', 'view', 'CmdOrCtrl+S'],
  ['split', 'Split View', 'view', 'CmdOrCtrl+\\'],
  ['reload', 'Reload', 'view', 'CmdOrCtrl+R'],
  ['hardreload', 'Reload Without Cache', 'view', 'CmdOrCtrl+Shift+R'],
  ['zoomin', 'Zoom In', 'view', 'CmdOrCtrl+='],
  ['zoomout', 'Zoom Out', 'view', 'CmdOrCtrl+-'],
  ['zoomreset', 'Actual Size', 'view', 'CmdOrCtrl+0'],
  ['mute', 'Mute or Unmute Tab', 'view', 'Ctrl+CmdOrCtrl+M'],
  ['pip', 'Picture in Picture', 'view', 'Ctrl+CmdOrCtrl+P'],
  ['devtools', 'Developer Tools', 'view', 'Alt+CmdOrCtrl+I'],
  ['back', 'Back', 'history', 'CmdOrCtrl+['],
  ['forward', 'Forward', 'history', 'CmdOrCtrl+]'],
  ['history', 'Show History', 'history', 'CmdOrCtrl+Y'],
  ['archive', 'Show Archived Tabs', 'history', 'Alt+CmdOrCtrl+A'],
  ['downloads', 'Show Downloads', 'history', 'Alt+CmdOrCtrl+L'],
  ['bookmark', 'Bookmark This Page…', 'bookmarks', 'CmdOrCtrl+Shift+D'],
  ['bookmarks', 'Show All Bookmarks', 'bookmarks', 'Alt+CmdOrCtrl+B'],
  ['bookmarkbar', 'Always Show Bookmarks Bar', 'bookmarks', 'CmdOrCtrl+Shift+B'],
  ['nexttab', 'Next Tab in Sidebar', 'spaces', 'Alt+CmdOrCtrl+Down'],
  ['prevtab', 'Previous Tab in Sidebar', 'spaces', 'Alt+CmdOrCtrl+Up'],
  ...[1, 2, 3, 4, 5, 6].map(n => [`space:${n}`, `Space ${n}`, 'spaces', `Ctrl+${n}`]),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => [`pin:${n}`, `Pinned Tab ${n}`, 'spaces', `CmdOrCtrl+${n}`])
].map(([id, label, menu, def]) => ({ id, label, menu, def }));

/* normalise so 'Cmd+Shift+T' and 'Shift+CmdOrCtrl+T' compare equal */
function norm(a) {
  if (!a) return '';
  const parts = a.split('+'), key = parts.pop();
  const mods = parts.map(m => ({ Cmd: 'CmdOrCtrl', Command: 'CmdOrCtrl', CommandOrControl: 'CmdOrCtrl', Option: 'Alt', Control: 'Ctrl' }[m] || m));
  const order = ['Ctrl', 'Alt', 'Shift', 'CmdOrCtrl'];
  return [...order.filter(m => mods.includes(m)), key.length === 1 ? key.toUpperCase() : key].join('+');
}
const keyFor = (id, custom) => { const c = custom && custom[id]; if (c !== undefined) return c; const a = ACTIONS.find(x => x.id === id); return a ? a.def : ''; };
function conflicts(custom) {
  const seen = new Map(), out = [];
  for (const a of ACTIONS) { const k = norm(keyFor(a.id, custom)); if (!k) continue; if (seen.has(k)) out.push([seen.get(k), a.id, k]); else seen.set(k, a.id); }
  return out;
}
module.exports = { ACTIONS, keyFor, norm, conflicts };
