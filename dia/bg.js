'use strict';
/* Background: the Reader shortcut (⌥⇧R), and the one place the popup's tools are wired to a tab. */
const READER = ['theme.js', 'vendor/Readability.js', 'vendor/Readability-readerable.js', 'reader-cs.js'];
const usable = u => /^https?:/.test(u || '') && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(u);
async function reader(tabId) {
  const t = await chrome.tabs.get(tabId).catch(() => null); if (!t || !usable(t.url)) return { ok: false };
  await chrome.scripting.executeScript({ target: { tabId }, files: READER }); return { ok: true };
}
chrome.commands.onCommand.addListener(async (cmd, tab) => { if (cmd === 'reader' && tab) reader(tab.id); });
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !m) return;
  if (m.type === 'reader') { reader(m.tabId).then(reply, () => reply({ ok: false })); return true; }
});
