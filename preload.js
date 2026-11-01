'use strict';
/* The only bridge between Washi's interface and the main process. Web pages never get this file. */
const { contextBridge, ipcRenderer } = require('electron');
const on = ch => cb => { const f = (_, ...a) => cb(...a); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
const send = ch => (...a) => ipcRenderer.send(ch, ...a);
const invoke = ch => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('washi', {
  stateLoad: invoke('state:load'), stateSave: send('state:save'), histSave: send('hist:save'),
  tabEnsure: invoke('tab:ensure'), tabClose: send('tab:close'), tabNav: send('tab:nav'), tabAct: send('tab:act'),
  panes: invoke('panes:set'),
  overlayOpen: invoke('overlay:open'), panel: invoke('overlay:panel'), overlayResult: send('overlay:result'), overlayCancel: send('overlay:cancel'),
  fx: send('fx'), toastAct: send('toast:act'), popupMenu: send('menu:popup'), copy: send('copy'), reveal: send('reveal'),
  sbState: send('sb:state'), sbFx: send('sb:fx'), sbMode: invoke('side:set'),
  layoutInfo: send('layout:info'), intent: send('sb:intent'), drag: send('drag:msg'), sbReady: send('sb:ready'), sbHover: send('sb:hover'),
  prefsSync: send('prefs:sync'), setupMsg: send('setup:msg'), setupReply: send('setup:reply'), setupInfo: invoke('setup:info'), setupAct: invoke('setup:act'),
  findQuery: send('find:query'), scrapOpen: send('scrap:open'), scrapAct: send('scrap:act'), scrapAdopt: invoke('scrap:adopt'), peekOpen: send('peek:open'), peekAdopt: invoke('peek:adopt'),
  keysList: invoke('keys:list'), keysRecording: send('keys:recording'),
  dlList: invoke('dl:list'), dlAct: send('dl:act'), suggest: invoke('suggest'),
  onTab: on('tab:event'), onOpenRequest: on('tab:openRequest'), onCmd: on('cmd'),
  onPaneFocus: on('pane:focus'), onOverlayResult: on('overlay:result'), onOverlayCancel: on('overlay:cancel'),
  onMenu: on('menu:click'), onOverlayInit: on('overlay:init'), onFx: on('overlay:fx'), onDrag: on('overlay:drag'),
  onSetupMsg: on('setup:msg'), onSetupEvent: on('setup:event'), onDl: on('dl:update'), onFind: on('find:result'), onFindStep: on('find:step'),
  onPeekInfo: on('peek:info'), onOverlayClosed: on('overlay:closed'), onPeekClosed: on('peek:closed'), onUpdate: on('update:state'), onPerms: on('perms:update'),
  onSbState: on('sb:state'), onSbFx: on('sb:fx'), onSbMode: on('sb:mode'), onIntent: on('sb:intent'), onSbReady: on('sb:ready'), onScrapAdopt: on('scrap:adopt'), onScrapInfo: on('scrap:info'), onScrapFocus: on('scrap:focus')
});
