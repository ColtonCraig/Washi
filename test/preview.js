'use strict';
/* Every control on the Look step must change the live preview (and the real window) right away. */
const { start, sleep, ok, done } = require('./lib');
(async () => {
  const b = await start(); const { ui, sb, ov } = b;
  await ov.click('.cta .btn'); await sleep(1000);
  const css = (sel, prop) => ov.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
  const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255})`; };
  const deskOf = () => css('.prev .mb', 'backgroundColor'), pageOf = () => css('.prev .mb-page', 'backgroundColor');
  const before = await pageOf();
  await ov.click('.seg.modes .sg[data-v="dark"]'); await sleep(350);
  ok(await pageOf() !== before, 'Dark: preview page turns dark (' + await pageOf() + ')');
  ok(await ui.evaluate(() => document.documentElement.classList.contains('dark')), 'Dark: real window turns dark');
  ok(await ov.evaluate(() => [...document.querySelectorAll('.pz')].map(x => x.dataset.id).join()) === 'cocoa,midnight,forest,plum,ink', 'Dark: paper presets switch to the dark set');
  await ov.click('.pz[data-id="forest"]'); await sleep(250);
  ok(await css('.prev .mb-side .nm', 'color') === rgb('#e2f2e7'), 'Forest preset: preview ink changes');
  ok(await ov.evaluate(() => document.querySelectorAll('.cf .hex')[0].value) === '#1e2a24', 'Forest preset: paper field shows the preset color');
  await ov.click('.seg.modes .sg[data-v="auto"]'); await sleep(900);
  ok(await pageOf() === before, 'Match my Mac: follows the system (light here) right away');
  await ov.click('.seg.modes .sg[data-v="light"]'); await sleep(300);
  for (const id of ['news', 'blush', 'mint', 'sky', 'cream']) {
    await ov.click(`.pz[data-id="${id}"]`); await sleep(200);
    const want = await ov.evaluate(i => BL.PRESETS.light.find(p => p.id === i).paper, id);
    ok(await ui.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()) === want, `preset ${id}: window paper = ${want}`);
  }
  const setHex = async (i, v) => { await ov.evaluate(([i, v]) => { const x = document.querySelectorAll('.cf .hex')[i]; x.value = v; x.dispatchEvent(new Event('change')); }, [i, v]); await sleep(250); };
  await setHex(0, '#ffeedd'); ok(await css('.prev .mb-page', 'backgroundColor') !== before && await ui.evaluate(() => S.prefs.light.paper) === '#ffeedd', 'custom paper color: preview + saved');
  await setHex(1, '#123456'); ok(await css('.prev .mb-side .nm', 'color') === rgb('#123456'), 'custom ink color: preview text');
  ok(await sb.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()) === '#123456', 'custom ink color: sidebar too');
  await ov.evaluate(() => document.querySelectorAll('.cf .rs')[0].click()); await sleep(200); await ov.evaluate(() => document.querySelectorAll('.cf .rs')[1].click()); await sleep(200);
  ok(await ui.evaluate(() => !S.prefs.light.paper && !S.prefs.light.ink), 'reset buttons return to the preset');
  for (const k of [255, 340, 150, 200, 300, 110, 40]) {
    await ov.click(`.pal[data-h="${k}"]`); await sleep(200);
    const want = await ov.evaluate(k => BL.PAL[k], k);
    ok(await deskOf() === rgb(want.desk) && await css('.prev .mb .st.on', 'backgroundColor') === rgb(want.tape), `palette ${want.n}: preview desk + tape`);
  }
  await setHex(2, '#00ff00'); ok(await deskOf() === rgb('#00ff00'), 'custom desk: preview');
  await setHex(3, '#0000ff'); ok(await css('.prev .mb .st.on', 'backgroundColor') === rgb('#0000ff'), 'custom tape: preview');
  await setHex(4, '#ff0000'); ok(await css('.prev .mb .sps i:nth-child(2)', 'backgroundColor') === rgb('#ff0000'), 'custom highlight: preview');
  ok(await ui.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--desk').trim()) === '#00ff00', 'custom desk: real window');
  const sw = n => ov.click(`.tgls .sw >> nth=${n}`);
  await sw(0); await sleep(250); ok(await css('.prev .mb', 'backgroundImage') === 'none', 'texture off: preview loses grain');
  await sw(0); await sleep(250); ok(/grain/.test(await css('.prev .mb', 'backgroundImage')), 'texture on: grain back');
  const t0 = await css('.prev .mb .tb:not(.on)', 'transform'); await sw(1); await sleep(250);
  ok(t0 !== 'none' && await css('.prev .mb .tb:not(.on)', 'transform') !== t0, 'wonky off: preview scraps straighten');
  await sw(1); await sw(2); await sleep(250);
  ok(await ov.evaluate(() => document.documentElement.classList.contains('motion-off')) && await sb.evaluate(() => document.documentElement.classList.contains('motion-off')), 'animations off: applied everywhere');
  await sw(2);
  await b.stop(); done();
})().catch(e => { console.error(e); process.exit(1); });
