'use strict';
/* Saved passwords and passkeys, end to end with real pages, the real keyboard and pointer:
   sign in (a wrong password isn't offered for saving, the right one is), the account menu under the field (mouse and
   keyboard), a strong password on sign-up, two-step and single-page sign-ins, "Never for this site", Settings ›
   Passwords (show, copy, edit, delete + undo, add, import, export, search), passkeys (save one, sign in with it — the test
   site checks the signature — use another way, delete), and everything still there after a restart, encrypted on disk. */
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-pw-'));
const csv = path.join(tmp, 'Chrome Passwords.csv'), out = path.join(tmp, 'export.csv');
fs.writeFileSync(csv, '﻿name,url,username,password,note\n"Bank, Inc",https://bank.example/login,me@bank.example,"p,a""ss"\nmail,https://mail.example.com/,colton,Sup3r!\nbroken,,nobody,x\n');
Object.assign(process.env, { WASHI_TEST_UV: '1', WASHI_TEST_KEYRING: 'basic', WASHI_TEST_PICK_PW: csv, WASHI_TEST_SAVE_PW: out });
const { start, sleep, ok, done, AUDIT, shot, skipSetup } = require('./lib');
const ptr = a => execSync('python3 ' + __dirname + '/ptr.py ' + a);
const K = seq => execSync(`python3 ${__dirname}/ptr.py keys "${seq}"`);
const X0 = 60, Y0 = 57;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'washi-pw-p-'));
const audit = async (p, what) => { const a = await p.evaluate(AUDIT); ok(!a.length, what + ': nothing cut off' + (a.length ? '\n      ' + a.slice(0, 6).join('\n      ') : '')); };
const SHIFTED = { '@': '2', '!': '1', '_': 'minus' }, NAMES = { '.': 'period', '-': 'minus' };
const typeKeys = s => K(s.split('').map(c => SHIFTED[c] ? `down:Shift_L tap:${SHIFTED[c]} up:Shift_L` : /[A-Z]/.test(c) ? `down:Shift_L tap:${c.toLowerCase()} up:Shift_L` : 'tap:' + (NAMES[c] || c)).join(' '));

(async () => {
  let b = await start({ profile }); let { ui, ov } = b; await skipSetup(b);
  const tabPage = async s => { for (let i = 0; i < 30; i++) { const p = b.pages().filter(x => x.url().includes(s)).pop(); if (p) return p; await sleep(150); } throw new Error('no page ' + s); };
  const open = async url => { await ui.evaluate(u => openTab(u), url); await sleep(1600); return tabPage(url.replace(/^https?:\/\//, '').split('?')[0]); };
  const go = async (p, url) => { await p.goto(url); await sleep(900); };
  const pane = () => ui.evaluate(() => layout().a);
  /* click something in the page with the real pointer */
  const pclick = async (p, sel) => { const a = await pane(); const r = await p.$eval(sel, e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); ptr(`move ${X0 + a.x + r.x} ${Y0 + a.y + r.y}`); await sleep(60); ptr('down'); ptr('up'); await sleep(350); };
  const vault = () => ov.evaluate(() => { const v = document.getElementById('vault'); return { cls: v.className, text: v.innerText }; });
  const card = async (want, ms = 5000) => { for (let t = 0; t < ms; t += 200) { const v = await vault(); if (v.cls.includes(want)) return v; await sleep(200); } return vault(); };

  // ---------- 1. sign in: wrong password first (no offer), then the right one ----------
  const pg = await open('http://localhost:8765/login.html');
  ok(await pg.evaluate(() => typeof window.washi === 'undefined' && typeof require === 'undefined' && typeof process === 'undefined'), 'the page itself gets no way into Washi');
  await pclick(pg, '#u'); typeKeys('colton'); await pclick(pg, '#p'); typeKeys('wrong'); K('tap:Return'); await sleep(1500);
  for (let i = 0; i < 40 && !(await pg.$('#bad').catch(() => null)); i++) await sleep(200);   // the page comes back with an error (slow machines take longer)
  await sleep(1500);                                                                          // and Washi has had time to (not) offer
  ok(await pg.$('#bad') && !(await vault()).cls.includes('on'), 'a wrong password (the form comes back) isn\'t offered for saving');
  await pclick(pg, '#u'); K('down:Control_L tap:a up:Control_L'); typeKeys('colton'); await pclick(pg, '#p'); typeKeys('hunter2'); await pclick(pg, '#go');
  let v = await card('save');
  ok(v.cls.includes('save') && /Save password for localhost:8765\?/.test(v.text) && await ov.evaluate(() => document.getElementById('vuser').value) === 'colton' && !/hunter2/.test(v.text), 'after signing in: "Save password for localhost:8765?" with the username, password as dots: ' + JSON.stringify(v.text.slice(0, 60)));
  await audit(ov, 'save card'); shot('pw-save');
  await ov.click('.vault [data-a=save]'); await sleep(500);
  let L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.logins.length === 1 && L.logins[0].user === 'colton' && L.logins[0].host === 'localhost:8765', 'Save keeps it');
  ok(!(await ui.evaluate(() => B.setupAct({ type: 'pw:list' }).then(x => JSON.stringify(x)))).includes('hunter2'), 'the list Settings gets never contains the passwords themselves');

  // ---------- 2. the menu under the field: pick with the pointer ----------
  await go(pg, 'http://localhost:8765/login.html');
  await pclick(pg, '#u'); v = await card('menu', 2000);
  ok(v.cls.includes('menu') && /colton/.test(v.text) && /Manage passwords/.test(v.text), 'clicking the username field shows your saved account under it');
  ok(await pg.evaluate(() => document.getElementById('u').value === '' && document.getElementById('p').value === ''), 'nothing is filled until you pick');
  await audit(ov, 'account menu'); shot('pw-menu');
  const a = await pane(), fr = await pg.$eval('#u', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.bottom }; });
  const it = await ov.evaluate(() => { const r = document.querySelector('.vault .vi').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const ox = Math.max(6, a.x + fr.x - 6), oy = a.y + fr.y + 2;
  ptr(`move ${X0 + ox + it.x} ${Y0 + oy + it.y}`); await sleep(120); ptr('down'); ptr('up'); await sleep(600);
  ok(await pg.evaluate(() => [document.getElementById('u').value, document.getElementById('p').value, document.getElementById('v').textContent].join('|')) === 'colton|hunter2|react:colton', 'picking it fills both fields (and the page hears the typing, so sites built with React notice)');
  ok(!(await vault()).cls.includes('on'), 'and the menu goes away');
  ok(await pg.evaluate(() => document.activeElement.id === 'p'), 'focus lands in the password field, ready to press Return');
  // keyboard: ↓ then Return
  await go(pg, 'http://localhost:8765/login.html');
  await pclick(pg, '#p'); await card('menu', 2000);
  K('tap:Down'); await sleep(250);
  ok(await ov.evaluate(() => document.querySelector('.vault .vi').classList.contains('on')), '↓ moves into the menu');
  K('tap:Return'); await sleep(600);
  ok(await pg.evaluate(() => document.getElementById('p').value === 'hunter2' && location.pathname === '/login.html'), 'Return picks it (and doesn\'t submit the form)');
  // Escape and typing put it away
  await go(pg, 'http://localhost:8765/login.html');
  await pclick(pg, '#u'); await card('menu', 2000); K('tap:Escape'); await sleep(400);
  ok(!(await vault()).cls.includes('on'), 'Esc puts the menu away');
  await pclick(pg, '#p'); await pclick(pg, '#u'); await card('menu', 2000); typeKeys('x'); await sleep(400);
  ok(!(await vault()).cls.includes('on') && await pg.$eval('#u', e => e.value) === 'x', 'typing your own name puts it away too');
  await pclick(pg, '#p'); await card('menu', 2000);
  await pg.evaluate(() => scrollBy(0, 30)); await sleep(500);
  ok(!(await vault()).cls.includes('on'), 'scrolling the page puts it away (it never floats off its field)');

  // ---------- 3. sign up: a strong password, then save it ----------
  await go(pg, 'http://localhost:8765/signup.html');
  await pclick(pg, '#e'); typeKeys('me@x.example'); await sleep(200);
  ok(!(await vault()).cls.includes('menu'), 'a sign-up email field has no account menu');
  await pclick(pg, '#n1'); v = await card('menu', 2000);
  ok(/Use a strong password/.test(v.text) && /[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}/.test(v.text), 'a new-password field offers a strong password: ' + (v.text.match(/\S{6}-\S{6}-\S{6}/) || [''])[0]);
  shot('pw-gen');
  await ov.click('.vault .vi.gen'); await sleep(500);
  const gen = await pg.evaluate(() => [document.getElementById('n1').value, document.getElementById('n2').value]);
  ok(gen[0] && gen[0] === gen[1] && /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(gen[0]), 'picking it fills both password fields with the same strong password');
  await pclick(pg, '#go'); v = await card('save');
  ok(/Save password/.test(v.text) && await ov.evaluate(() => document.getElementById('vuser').value) === 'me@x.example', 'after signing up, it offers to save it with your email');
  await ov.fill('#vuser', 'me@x.example'); await ov.click('.vault [data-a=save]'); await sleep(500);
  L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.logins.length === 2, 'two saved now');

  // ---------- 4. a single-page sign-in (no new page): offered once the form is gone; "Not now" saves nothing ----------
  await go(pg, 'http://127.0.0.1:8765/spa.html');
  await pclick(pg, '#u'); typeKeys('spa'); await pclick(pg, '#p'); typeKeys('pw1'); await pclick(pg, '#go');
  v = await card('save', 6000);
  ok(/Save password for 127\.0\.0\.1:8765/.test(v.text), 'a sign-in that only changes the page is offered too (after the form goes away)');
  await ov.click('.vault [data-a=later]'); await sleep(400);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.length === 2, '"Not now" saves nothing');

  // ---------- 5. two steps (email page, then password page) and "Never for this site" ----------
  await go(pg, 'http://127.0.0.1:8765/step1.html');
  await pclick(pg, '#u'); typeKeys('two@steps.example'); K('tap:Return'); await sleep(1200);
  await pclick(pg, '#p'); typeKeys('pw2'); K('tap:Return');
  v = await card('save');
  ok(await ov.evaluate(() => document.getElementById('vuser').value) === 'two@steps.example', 'two-step sign-in: the email from the first page is the username');
  await ov.click('.vault [data-a=never]'); await sleep(400);
  await go(pg, 'http://127.0.0.1:8765/spa.html'); await pclick(pg, '#u'); typeKeys('again'); await pclick(pg, '#p'); typeKeys('pw3'); await pclick(pg, '#go'); await sleep(4000);
  ok(!(await vault()).cls.includes('save'), '"Never for this site" means it doesn\'t ask there again');

  // ---------- 6. Settings › Passwords ----------
  await ui.evaluate(() => openSetup('settings', 'passwords')); await sleep(1500);
  let rows = await ov.$$eval('#sec-passwords .pwrow:not(.pk)', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok(rows.length === 2 && rows.some(r => /localhost:8765 colton/.test(r)) && !rows.join().includes('hunter2'), 'Settings › Passwords lists them, passwords hidden: ' + JSON.stringify(rows));
  ok(await ov.evaluate(() => /127\.0\.0\.1:8765/.test(document.querySelector('#sec-passwords .pwnever').textContent)), 'and the "never saved" sites');
  await audit(ov, 'Settings › Passwords'); shot('pw-settings');
  const row = sel => `#sec-passwords .pwrow[data-id="${sel}"]`;
  const colId = L.logins.find(l => l.user === 'colton').id;
  await ov.click(row(colId) + ' [data-a=show]'); await sleep(400);
  ok(await ov.$eval(row(colId) + ' .pwv', e => e.textContent) === 'hunter2', 'Show reveals it (after Touch ID on a Mac)');
  await ov.click(row(colId) + ' [data-a=copy]'); await sleep(400);
  ok(/Copied the password for localhost:8765/.test(await ov.$eval('#sec-passwords .pwbox .okay', e => e.textContent)), 'Copy copies it (and clears the clipboard after a minute)');
  await ov.click(row(colId) + ' [data-a=edit]'); await sleep(300);
  await ov.fill('#sec-passwords .pwedit input[aria-label=Username]', 'colton.craig'); await ov.click('#sec-passwords .pwedit .btn.primary'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.some(l => l.user === 'colton.craig' && l.origin === 'http://localhost:8765'), 'Edit changes the username (and leaves the site alone)');
  await ov.click(row(colId) + ' [data-a=del]'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.length === 1, 'Delete removes it');
  await ov.click('#sec-passwords .pwbox .okay .link'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.length === 2, 'Undo brings it back');
  await ov.click('#sec-passwords .pwtop .btn'); await sleep(300);
  await ov.fill('#sec-passwords .pwedit input[aria-label=Website]', 'news.example.org/login');
  await ov.fill('#sec-passwords .pwedit input[aria-label=Username]', 'reader'); await ov.fill('#sec-passwords .pwedit input[aria-label=Password]', 'r3ad');
  await ov.click('#sec-passwords .pwedit .btn.primary'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.some(l => l.origin === 'https://news.example.org' && l.user === 'reader'), 'Add password: "news.example.org/login" becomes https://news.example.org');
  await ov.click('#sec-passwords button:has-text("Import passwords")'); await sleep(700);
  ok(/Imported 2 new passwords \(1 skipped/.test(await ov.$eval('#sec-passwords .pwbox .okay', e => e.textContent)), 'Import reads a Chrome export (BOM, quoted commas and quotes; a row with no site is skipped)');
  const bank = (await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).logins.find(l => l.host === 'bank.example');
  ok(bank && (await ui.evaluate(id => B.setupAct({ type: 'pw:reveal', id }), bank.id)).pass === 'p,a"ss', 'tricky passwords come through exactly');
  await ov.fill('#sec-passwords .pwq', 'bank'); await sleep(200);
  ok(await ov.$$eval('#sec-passwords .pwrow:not(.pk)', r => r.length) === 1, 'search narrows the list');
  await ov.fill('#sec-passwords .pwq', ''); await sleep(200);
  await ov.click('#sec-passwords button:has-text("Export")'); await sleep(600);
  const ex = fs.readFileSync(out, 'utf8');
  ok(/^name,url,username,password\n/.test(ex) && ex.includes('"p,a""ss"') && ex.split('\n').length === 7 && (fs.statSync(out).mode & 0o777) === 0o600, 'Export writes a standard CSV only you can read (5 passwords)');
  await audit(ov, 'Settings › Passwords, everything open'); shot('pw-settings-2');
  await ov.evaluate(() => SETUP.finish()); await sleep(600);

  // ---------- 7. passkeys ----------
  const wk = await open('http://localhost:8765/webauthn.html');
  await pclick(wk, '#caps'); await sleep(400);
  ok(await wk.title() === 'caps:true:false', 'sites see that passkeys work here (and no half-working autofill offer)');
  await pclick(wk, '#reg'); v = await card('pk');
  ok(/Save a passkey for localhost\?/.test(v.text) && /colton@example\.com/.test(v.text), 'a site asking to save a passkey: Washi\'s card, with the account');
  await audit(ov, 'passkey card'); shot('pk-save');
  await ov.click('.vault [data-a=create]'); await sleep(1500);
  ok(/^registered:/.test(await wk.title()), 'Save passkey: the site registers it');
  await pclick(wk, '#log'); v = await card('pk');
  ok(/Sign in to localhost/.test(v.text) && /colton@example\.com/.test(v.text), 'signing in: the card lists your passkey');
  shot('pk-sign');
  K('tap:Return'); await sleep(1500);
  ok(/^signed-in:uv=1:count=\d+:user=16$/.test(await wk.title()), 'Return signs in; the site checks the signature, user verified: ' + await wk.title());
  await pclick(wk, '#log2'); await card('pk'); await ov.click('.vault .vlist .vi'); await sleep(1500);
  ok(/^signed-in:uv=1/.test(await wk.title()), 'and with the site naming the account it expects');
  await pclick(wk, '#log'); await card('pk'); await ov.click('.vault .btn[data-a=cancel]'); await sleep(800);
  ok(await wk.title() === 'get-error:NotAllowedError', '"Use another way": the site hears no, and can offer its other options (it doesn\'t hang)');
  await sleep(2600);
  await ui.evaluate(() => openSetup('settings', 'passwords')); await sleep(1500);
  ok(await ov.evaluate(() => /localhost[\s\S]*colton@example\.com/.test(document.querySelector('#sec-passwords .pwrow.pk').innerText)), 'Settings lists the passkey');
  await ov.click('#sec-passwords .pwrow.pk .ib.warn'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).passkeys.length === 0 && /Deleted the passkey for localhost/.test(await ov.$eval('#sec-passwords .pwbox .okay', e => e.textContent)), 'deleting a passkey says so, next to the passkeys');
  await ov.click('#sec-passwords .pwbox .okay .link'); await sleep(500);
  ok((await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).passkeys.length === 1, 'Undo brings the passkey back');
  await ov.click('#sec-passwords .pwrow.pk .ib.warn'); await sleep(500);
  await ov.evaluate(() => SETUP.finish()); await sleep(600);
  await pclick(wk, '#log'); v = await card('pk');
  ok(/No Washi passkey for localhost/.test(v.text) && /iCloud Keychain/.test(v.text), 'with no Washi passkey for the site, the card says so plainly (and why iCloud ones can\'t be used)');
  shot('pk-none'); await audit(ov, 'no-passkey card');
  await ov.click('.vault .btn[data-a=cancel]'); await sleep(600);
  ok(await wk.title() === 'get-error:NotAllowedError', 'and the site gets a clean no');
  await sleep(2600);
  await pclick(wk, '#reg'); await card('pk'); await ov.click('.vault [data-a=create]'); await sleep(1500);
  ok(/^registered:/.test(await wk.title()) && (await ui.evaluate(() => B.setupAct({ type: 'pw:list' }))).passkeys.length === 1, 'a new passkey can be saved again');

  // ---------- 8. after a restart: still there, encrypted, and Touch ID refusal is respected ----------
  await b.stop();
  const disk = fs.readFileSync(path.join(profile, 'vault.json'), 'utf8');
  ok(!/hunter2|colton|bank\.example|localhost/.test(disk), 'on disk it\'s encrypted: no passwords, names or sites readable');
  process.env.WASHI_TEST_GATE = 'deny';
  b = await start({ profile, fresh: false }); ({ ui, ov } = b); await sleep(1500);
  L = await ui.evaluate(() => B.setupAct({ type: 'pw:list' }));
  ok(L.logins.length === 5 && L.passkeys.length === 1, 'after quitting: 5 passwords and the passkey are still there');
  ok((await ui.evaluate(id => B.setupAct({ type: 'pw:reveal', id }), L.logins[0].id)).ok === false, 'if Touch ID says no, the password isn\'t shown');
  const wk2 = await open('http://localhost:8765/webauthn.html');
  await pclick(wk2, '#log'); await card('pk'); await ov.click('.vault .vlist .vi'); await sleep(1500);
  ok(/^signed-in:uv=1/.test(await wk2.title()), 'the passkey still signs in after a restart: ' + await wk2.title() + ' ' + JSON.stringify(await vault()) + ' ' + await ov.evaluate(() => [document.getElementById('cmd').className, window.SETUP.isOpen()].join()));
  const lp = await open('http://localhost:8765/login.html');
  await pclick(lp, '#u'); v = await card('menu', 2000);
  ok(/colton\.craig/.test(v.text), 'and the account menu still has your login: ' + JSON.stringify(v.text));
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
