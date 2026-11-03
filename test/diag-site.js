'use strict';
/* Diagnostic (not a pass/fail test): open real sites in Washi on GitHub's Mac and record whether video plays, with
   blocking Standard, Strict and off: the <video> element's state, codec support, console errors, how much was blocked,
   and screenshots. Usage: SITES="url url" node test/diag-site.js   (needs the internet; .github/workflows/diag-site.yml) */
const fs = require('fs'), os = require('os'), path = require('path');
const { start, sleep, skipSetup, shot } = require('./lib');
const OUT = process.env.WASHI_SHOTS || os.tmpdir();
const SITES = (process.env.SITES || 'https://www.youtube.com/watch?v=jfKfPfyJRdk https://www.youtube.com/watch?v=dQw4w9WgXcQ').split(/\s+/).filter(Boolean);
const say = (k, v) => console.log(`## ${k}: ${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);
(async () => {
  const b = await start({ sandbox: process.platform === 'darwin' }); const { ui } = b; await skipSetup(b);
  say('lists refresh', await ui.evaluate(() => B.setupAct({ type: 'lists:refresh' })).catch(e => e.message));   // the lists as they are after Washi updates them (not the ones it ships with)
  for (const mode of (process.env.MODES || 'standard strict off').split(' ')) {
    await ui.evaluate(m => B.setupMsg({ type: 'prefs', patch: { blocking: m } }), mode); await sleep(800);
    for (const url of SITES) {
      await ui.evaluate(u => openTab(u), url); await sleep(9000);
      const p = b.pages().filter(x => x.url().startsWith(url.slice(0, 30))).pop();
      if (!p) { say(`${mode} ${url}`, 'page not found: ' + b.pages().map(x => x.url()).join(' | ')); continue; }
      const msgs = []; p.on('console', m => { if (/error|warn/.test(m.type())) msgs.push(m.type() + ': ' + m.text().slice(0, 300)); }); p.on('pageerror', e => msgs.push('pageerror: ' + e.message.slice(0, 300)));
      await sleep(+(process.env.WATCH_S || 4) * 1000);
      const info = await p.evaluate(() => {
        const v = document.querySelector('video'), mse = typeof MediaSource !== 'undefined';
        const can = t => { try { return MediaSource.isTypeSupported(t); } catch { return 'err'; } };
        return { title: document.title, url: location.href, video: v ? { readyState: v.readyState, paused: v.paused, time: +v.currentTime.toFixed(1), err: v.error && v.error.code, src: (v.currentSrc || '').slice(0, 60), w: v.videoWidth, h: v.videoHeight } : null,
          player: !!document.querySelector('#movie_player, .html5-video-player'), playerErr: (document.querySelector('.ytp-error, yt-playability-error-supported-renderers') || {}).textContent?.trim().slice(0, 200) || '',
          enforcement: !!document.querySelector('ytd-enforcement-message-view-model, tp-yt-paper-dialog ytd-enforcement-message-view-model'),
          codecs: { mse, h264: can('video/mp4; codecs="avc1.42E01E"'), vp9: can('video/webm; codecs="vp9"'), av1: can('video/mp4; codecs="av01.0.05M.08"'), aac: can('audio/mp4; codecs="mp4a.40.2"'), opus: can('audio/webm; codecs="opus"') },
          ua: navigator.userAgent, uad: navigator.userAgentData && navigator.userAgentData.brands.map(b => b.brand + ' ' + b.version) };
      }).catch(e => ({ evalError: e.message }));
      const blocked = await ui.evaluate(() => R.blocked[R.a] || 0);
      say(`${mode} ${url}`, { ...info, blocked, console: msgs.slice(0, 15) });
      const name = `site-${mode}-${SITES.indexOf(url)}`;
      try { await p.screenshot({ path: path.join(OUT, name + '.png') }); } catch {}
      await ui.evaluate(() => closeTab(focusedId())); await sleep(800);
    }
  }
  say('main log', b.log().split('\n').filter(l => /rror|blocked|denied/i.test(l) && !/DevTools|proxy|GPU|gl_|viz|XPC/.test(l)).slice(-30));
  await b.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
