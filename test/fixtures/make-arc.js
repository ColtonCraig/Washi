'use strict';
/* Builds a realistic Arc StorableSidebar.json (the alternating id/object layout Arc writes) for the import tests. */
const items = [], add = it => { items.push(it.id, it); return it.id; };
const tab = (id, parent, url, title) => add({ id, parentID: parent, childrenIds: [], title: null, data: { tab: { savedURL: url, savedTitle: title } } });
const folder = (id, parent, title, kids) => add({ id, parentID: parent, childrenIds: kids, title, data: { list: {} } });
const cont = (id, kids) => add({ id, parentID: null, childrenIds: kids, data: { itemContainer: { containerType: { spaceItems: { _0: 'x' } } } } });
const B = 'http://localhost:8765/';
// Work space: pinned has tabs, a folder with a nested folder (3 deep + one 4th level that must flatten), a split view, an easel and an arc:// tab to skip
tab('w1', 'wP', B + 'p1.html?w1', 'Work Inbox'); tab('w2', 'wF1', B + 'p2.html?w2', 'Spec doc');
tab('w3', 'wF2', B + 'p3.html?w3', 'Design file'); tab('w4', 'wF3', B + 'p1.html?w4', 'Deep link'); tab('w5', 'wF4', B + 'p2.html?w5', 'Too deep');
folder('wF4', 'wF3', 'Level4', ['w5']); folder('wF3', 'wF2', 'Level3', ['w4', 'wF4']); folder('wF2', 'wF1', 'Designs', ['w3', 'wF3']); folder('wF1', 'wP', 'Projects', ['w2', 'wF2']);
tab('s1', 'wS', B + 'p1.html?s1', 'Left half'); tab('s2', 'wS', B + 'p3.html?s2', 'Right half');
add({ id: 'wS', parentID: 'wP', childrenIds: ['s1', 's2'], title: null, data: { splitView: { layout: 'h' } } });
add({ id: 'wE', parentID: 'wP', childrenIds: [], title: 'Moodboard', data: { easel: { id: 'e' } } });
tab('wA', 'wP', 'arc://extensions', 'Extensions');
cont('wP', ['w1', 'wF1', 'wS', 'wE', 'wA']);
tab('wu1', 'wU', B + 'p2.html?wu1', 'Today tab'); cont('wU', ['wu1']);
// Personal space (old containerIDs format), merges into Washi's Home? no: name differs → new space
tab('h1', 'hP', B + 'p3.html?h1', 'Recipes'); tab('h2', 'hF', B + 'p1.html?h2', 'Flights'); folder('hF', 'hP', 'Trip', ['h2']); cont('hP', ['h1', 'hF']);
cont('hU', []);
// Play space: same name as Washi's "Play" (merges), one tab already present in Washi to check no duplicates
tab('g1', 'gP', B + 'p2.html?g1', 'Game wiki'); tab('g2', 'gP', B + 'p1.html?dup', 'Already here'); cont('gP', ['g1', 'g2']); cont('gU', []);
// favorites
tab('f1', 'fav', B + 'p1.html?fav1', 'Mail'); tab('f2', 'fav', B + 'p2.html?fav2', 'Calendar'); cont('fav', ['f1', 'f2']);
const spaces = [
  'sW', { id: 'sW', title: 'Work', newContainerIDs: [{ pinned: {} }, 'wP', { unpinned: { _0: { shared: {} } } }, 'wU'], profile: { default: true } },
  'sH', { id: 'sH', title: 'Personal', containerIDs: ['pinned', 'hP', 'unpinned', 'hU'] },
  'sG', { id: 'sG', title: 'Play', newContainerIDs: [{ pinned: {} }, 'gP', { unpinned: {} }, 'gU'] }
];
const data = { sidebar: { containers: [{ global: {} }, { spaces, items, topAppsContainerIDs: [{ default: true }, 'fav'] }] }, version: 1 };
require('fs').writeFileSync(process.argv[2], JSON.stringify(data));
