'use strict';
/* Renders build/icon.svg to every size macOS wants and packs build/icon.icns (+ icon.png).
   Pick a different logo first with:  npm run icon -- B   (A = tape roll, B = taped globe, C = tape star; see build/logo-options)
   Needs Playwright's Chromium and Python's icnsutil:  pip install icnsutil */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const B = path.join(__dirname, '..', 'build'), OUT = path.join(B, 'icon.iconset');
(async () => {
  const pick = process.argv[2];
  if (pick) { const f = fs.readdirSync(path.join(B, 'logo-options')).find(n => n.toUpperCase().startsWith(pick.toUpperCase())); if (!f) throw new Error('no logo option ' + pick); fs.copyFileSync(path.join(B, 'logo-options', f), path.join(B, 'icon.svg')); console.log('using', f); }
  const svg = fs.readFileSync(path.join(B, 'icon.svg'), 'utf8');
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  fs.mkdirSync(OUT, { recursive: true });
  const render = async (px, file) => {
    await pg.setViewportSize({ width: px, height: px });
    await pg.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="1024" height="1024"', `width="${px}" height="${px}"`)}</body></html>`);
    await pg.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  };
  for (const s of [16, 32, 128, 256, 512]) { await render(s, path.join(OUT, `icon_${s}x${s}.png`)); await render(s * 2, path.join(OUT, `icon_${s}x${s}@2x.png`)); }
  await render(1024, path.join(B, 'icon.png'));
  await br.close();
  execFileSync('python3', ['-m', 'icnsutil', 'compose', '-f', path.join(B, 'icon.icns'), ...['16x16', '16x16@2x', '32x32', '32x32@2x', '128x128', '128x128@2x', '256x256', '256x256@2x', '512x512', '512x512@2x'].map(n => path.join(OUT, `icon_${n}.png`))]);
  console.log('built build/icon.icns and build/icon.png');
})().catch(e => { console.error(e); process.exit(1); });
