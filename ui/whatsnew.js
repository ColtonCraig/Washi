'use strict';
/* What's new in each release, newest first. Shown on a "Fresh off the press" sheet the first time Washi starts after an
   update (ui/setup.js buildNews), and any time from Help › What's New. Every release adds its own entry here.
   icon: a paper icon (p:<name>) or a sidebar symbol (i:<name>); keys: action ids whose shortcut is shown (they follow
   your own shortcuts); try: an action to run from the sheet. */
window.WHATSNEW = [
  {
    v: '0.17.0',
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
    v: '0.16.0',
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
