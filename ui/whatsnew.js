'use strict';
/* What's new in each release, newest first. Shown on a "Fresh off the press" sheet the first time Washi starts after an
   update (ui/setup.js buildNews), and any time from Help › What's New. Every release adds its own entry here.
   items are the big new things, one card each; fixes are the small things, a short list. icon: a paper icon (p:<name>)
   or a sidebar symbol (i:<name>); keys: action ids whose shortcut is shown (they follow your own shortcuts); point: what
   "Show me" points at (a selector in the window) with tip; try: an action "Try it" runs. */
window.WHATSNEW = [
  {
    v: '1.2.0', name: '1.0', paper: 'Kozo',
    lead: 'Washi 1.0, “Kozo”: the paper browser, finished.',
    items: [
      { icon: 'i:sidebar', title: 'Tabs down the side', text: 'Your tabs, folders and pins live in a sidebar you can pin or float. Spaces keep work and home apart, each with its own color, and can keep their own sign-ins.', point: '#bSide', tip: 'Pin or float the sidebar here' },
      { icon: 'i:split', title: 'Split view', text: 'Drag a tab onto the page to put two side by side. They stay together in the sidebar as one item.', keys: ['split'], point: '#bSplit', tip: 'Split view' },
      { icon: 'i:search', title: 'One bar for everything', text: 'Search, jump to an open tab, or run a command from the same bar. !bangs work too (!yt cats).', keys: ['newtab'] },
      { icon: 'i:bolt', title: 'Your top bar, your way', text: 'Drag the buttons into the order you like and hide the ones you don\'t use. Settings › Top bar has them all.', point: '#tools', tip: 'Drag a button along the bar' },
      { icon: 'i:focus', title: 'Focus mode and Reader', text: 'Focus mode gives the page the whole window. Reader turns an article into clean, quiet text.', keys: ['focus', 'reader'], try: 'focus' },
      { icon: 'p:news', title: 'Sticky notes and snapshots', text: 'Every space has its own sticky note. Snapshot copies the page as a picture.', keys: ['notes', 'snapshot'], try: 'notes' },
      { icon: 'i:key', title: 'Passwords, kept on this Mac', text: 'Washi saves and fills your passwords, encrypted with a key in your Keychain. Showing one asks for Touch ID.' },
      { icon: 'i:shield', title: 'Blocking and safety', text: 'Ads and trackers are blocked, known scam sites are stopped, and every page runs locked away from the rest of your Mac.' },
      { icon: 'i:puzzle', title: 'Your Chrome extensions', text: 'Install from the Chrome Web Store as usual: Bitwarden, Okta, LastPass, Dark Reader, Grammarly, uBlock Origin Lite and more.' },
      { icon: 'i:reload', title: 'Light on memory', text: 'Tabs you haven\'t looked at for a while go to sleep and wake right where you left them. Hover a tab to see what it uses.' },
      { icon: 'i:down', title: 'Updates on its own', text: 'Washi checks for updates often, downloads them quietly, and a postcard offers to restart. Chromium\'s security fixes come in as they\'re released.' }
    ],
    fixes: [
      'Reader stays in the top bar when it\'s turned on: it lights up on articles.',
      'A long or handwritten space name is never shaved off, docked or floating.',
      'Settings opens on Look, and nothing on any screen touches or runs into anything.',
      'Updates are noticed within minutes, and the postcard waits until you\'re back.',
      'Passkeys are gone: Apple only lets browsers it has approved use iCloud passkeys, so sites offer your password or a code straight away.'
    ]
  },
  {
    v: '1.1.2', name: 'Beta 7',
    lead: 'Polished all over.',
    fixes: [
      'Settings opens on Look with Look lit up (it showed Help lit).',
      'Nothing runs into anything: "Reset to the standard order" no longer sits on the last top-bar row, and every screen and card was checked in every look.',
      'The blocking and update cards are as tall as what\'s on them, with no empty space.',
      'Passkeys are gone: Apple only lets browsers it has approved use your iCloud passkeys, so sites now offer your password or a code straight away instead of waiting.',
      'With two windows, What\'s new shows once, and a new window starts with the sidebar the way you had it.'
    ]
  },
  {
    v: '1.1.1', name: 'Beta 6',
    lead: 'Lighter on memory, and safer.',
    fixes: [
      'A sleeping tab wakes up just where you left it: same place on the page, same Back and Forward.',
      'Tabs you haven\'t looked at for 30 minutes go to sleep to save memory (Settings › Tabs: from 15 minutes to 4 hours, or never).',
      'Hover a tab to see how much memory it\'s using.',
      'Memory saver steps in sooner when your Mac is running low.',
      'Security fixes from Chromium, the engine underneath Washi (now Electron 45.2.2).'
    ]
  },
  {
    v: '1.1.0', name: 'Beta 5',
    lead: 'Washi, arranged your way.',
    items: [
      { icon: 'i:bolt', title: 'Your top bar, your way', text: 'Drag any button along the top bar to put it where you like, and right-click one you never use to hide it. Settings › Top bar has them all, with a reset.', point: '#tools', tip: 'Drag any of these along the bar. Right-click one to hide it.' },
      { icon: 'i:focus', title: 'A Focus mode button', text: 'Focus mode has its own button in the top bar now: one click and the page gets the whole window.', point: '#bFocus', tip: 'Click it for Focus mode. Point at the very top of the window to bring the bar back.', keys: ['focus'] },
      { icon: 'i:gear', title: 'More ways to make it yours', text: 'Settings › Features: whether Focus mode hides the bar and sidebar, Reader\'s font and size, Now playing, swiping between spaces, saving snapshots, and more.', try: 'features' },
      { icon: 'p:news', title: 'Updates on a postcard', text: 'When an update has downloaded, a little card offers to restart now or later. Rather not be asked? Settings › Help › Stay quiet, and it installs when you quit.' },
      { icon: 'i:eye', title: 'Show me', text: 'On this page, "Show me" points at the thing to click, and takes you back here when you\'re done.', keys: ['whatsnew'] }
    ],
    fixes: [
      'Closing a tab and bringing it back (⇧⌘T) puts it back in its folder, in its place, with the name you gave it.',
      'Close Other Tabs and Close Tabs Below, in a tab\'s menu, with Undo.',
      'Every button\'s tooltip shows your own shortcut, as you\'ve set it.',
      '⌘W always closes the tab, never the whole window.',
      'The welcome setup has a page of everything Washi can do, and the quick-start guide shows your tools.',
      'Settings fits small windows, and small updates get a short list like this one instead of a page of cards.'
    ]
  },
  {
    v: '1.0.1', name: 'Beta 4',
    lead: 'Extensions behave with more than one window.',
    fixes: [
      'With two windows open, an extension\'s popup opens in the window you clicked it in (it could jump to the other one, even on another desktop), and tabs it opens land there too.',
      'The shortcut an extension comes with works, like ⇧⌘O for Okta\'s plugin (View › Extension Shortcuts).'
    ]
  },
  {
    v: '1.0.0', name: 'Beta 3',
    lead: 'Washi 1.0: your extensions work, and lots of little things got fixed.',
    fixes: [
      'Chrome extensions work properly: Okta\'s plugin shows your apps once you\'re signed in, and 1Password, uBlock Origin Lite, Bitwarden, Dark Reader and Grammarly open and work.',
      'Settings your company sets for an extension (Chrome\'s managed policy) reach it. Right-click in an extension\'s popup for Reload and Inspect.',
      'YouTube plays with blocking on: no more blank white player.',
      'Leaving Reader is easy: the book stamp again, Esc, or the × on the sheet. Aa on the sheet sets text size and font.',
      'Resting on the star brings out the bookmarks bar, in Focus mode too.',
      'Sleeping tabs keep their colours.'
    ]
  },
  {
    v: '0.17.0', name: 'Beta 2',
    lead: 'A calmer page, music in the corner, notes for every space.',
    items: [
      { icon: 'i:expand', title: 'Focus mode', text: 'The page gets the whole window: the top bar and sidebar get out of the way.', how: 'Point at the very top for the top bar, the left edge for the sidebar.', keys: ['focus'], try: 'focus' },
      { icon: 'p:music', title: 'Now playing', text: 'Music or a video playing in another tab shows as a little ticket at the bottom of the sidebar.', how: 'Pause or play it there; click the ticket to jump to its tab.' },
      { icon: 'p:news', title: 'A sticky note for every space', text: 'Jot things down: each space keeps its own note, saved as you type.', how: 'The note stamp in the top bar.', keys: ['notes'], try: 'notes' },
      { icon: 'i:right', title: 'Swipe between spaces', text: 'Two fingers sideways on the sidebar goes to the next or previous space.', how: 'Swipe on the sidebar, like turning a page.' },
      { icon: 'p:camera', title: 'Snapshot', text: 'Grab part of a page, or all of it. It\'s copied straight away, ready to paste; Save puts it in Downloads.', how: 'Drag a box, or press Enter for the whole page.', keys: ['snapshot'], try: 'snapshot' },
      { icon: 'p:plane', title: 'Send a site to a space', text: 'Okta always in Work? Links to it open there and take you along, wherever you click them.', how: 'Right-click a tab › Always Open … in › pick a space. Settings › Spaces lists them.' },
      { icon: 'p:palette', title: 'Folders pick their own icon', text: 'Name a folder "MDM" or "Budget", or fill it with GitHub tabs, and it gets a paper icon to match. One you choose yourself always stays.' },
      { icon: 'i:reload', title: 'Bring back what you closed', text: 'Closed a whole window, or deleted a folder full of tabs? It comes back in one go.', keys: ['reopen'] },
      { icon: 'p:star', title: 'This page', text: 'From now on, Washi shows you what\'s new after each update.', how: 'Any time: Help › What\'s New.' }
    ]
  },
  {
    v: '0.16.0', name: 'Beta 1',
    lead: 'Okta works, and the sidebar learned to tidy itself.',
    items: [
      { icon: 'p:tools', title: 'Okta Browser Plugin works', text: 'No more "We\'re having trouble launching your app" on hudl.okta.com and other sign-in pages.' },
      { icon: 'p:book', title: 'Reader mode', text: 'An article as a clean sheet of Washi paper: just the words, your size, Serif or Sans.', how: 'The book stamp in the top bar on articles.', keys: ['reader'], try: 'reader' },
      { icon: 'i:broom', title: 'Tidy up', text: 'Tabs from the same site go into a folder, ones you haven\'t opened today go to the Archive. You can undo it.', how: 'The Tidy button shows when you have lots of loose tabs.' },
      { icon: 'i:eye', title: 'Tab peek', text: 'Rest the pointer on a sidebar tab for a polaroid of it, without leaving the page you\'re on.' },
      { icon: 'i:pen', title: 'Rename any tab or pin', text: 'Give a tab your own name.', how: 'Double-click its name, or right-click › Rename.' },
      { icon: 'p:heart', title: 'Little things', text: 'Clear tabs (space menu) keeps pins and folders. Mute this site (tab menu). Press ⌘Q twice to quit, so you don\'t quit by accident (Settings › Basics).' }
    ]
  }
];
