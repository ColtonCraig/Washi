'use strict';
/* Draws the Mac-ready logo options into build/logo-options (D–H). Each one fills Apple's icon shape exactly:
   1024 canvas, 824 px rounded "squircle" body with 100 px margins, so macOS shows it at the same size as other apps
   instead of shrinking it into a grey box. Pick one with:  npm run icon -- D */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'build', 'logo-options');

/* Apple's continuous-corner icon shape, as a superellipse (n = 5) through the 824 px body */
function squircle(cx = 512, cy = 512, a = 412, n = 5, steps = 360) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + a * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
}
const BODY = squircle();
const star = (cx, cy, R, r, rot = -90) => Array.from({ length: 10 }, (_, i) => { const a = (rot + i * 36) * Math.PI / 180, d = i % 2 ? r : R; return [cx + d * Math.cos(a), cy + d * Math.sin(a)]; });
const P = pts => pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
/* folded-paper star: every point is two triangles, one lit and one in shade */
function foldedStar(cx, cy, R, r, light, dark) {
  const s = star(cx, cy, R, r); let out = '';
  for (let i = 0; i < 10; i += 2) {
    const o = s[i], l = s[(i + 9) % 10], rr = s[i + 1];
    out += `<polygon points="${P([[cx, cy], l, o])}" fill="${light}"/><polygon points="${P([[cx, cy], o, rr])}" fill="${dark}"/>`;
  }
  return { faces: out, outline: P(s) };
}
/* a strip of washi tape with torn (zigzag) ends */
function tape(cx, cy, w, h, deg, pat, opacity = .92) {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, z = 9, teeth = 5; let d = `M${x0} ${y0}L${x1} ${y0}`;
  for (let i = 1; i <= teeth; i++) d += `L${x1 + (i % 2 ? z : 0)} ${y0 + (h * i) / teeth}`;
  d += `L${x0} ${-y0}`;
  for (let i = teeth - 1; i >= 0; i--) d += `L${x0 - (i % 2 ? 0 : z)} ${y0 + (h * i) / teeth}`;
  return `<g transform="translate(${cx} ${cy}) rotate(${deg})" opacity="${opacity}"><path d="${d}Z" fill="url(#${pat})"/><path d="${d}Z" fill="url(#sheen)"/></g>`;
}
const stripes = (id, a, b, w = 26) => `<pattern id="${id}" width="${w * 2}" height="${w * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="${w * 2}" height="${w * 2}" fill="${a}"/><rect width="${w}" height="${w * 2}" fill="${b}"/></pattern>`;
function icon({ bg, inner, grainAmt = .5 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs>
  <clipPath id="body"><path d="${BODY}"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
  <linearGradient id="light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .15  0 0 0 0 .1  0 0 0 ${grainAmt * -1.1} ${grainAmt * .55}"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <filter id="drop" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".28"/></filter>
  ${stripes('tMint', '#3fbf9c', '#8fe0c8')}${stripes('tCream', '#fff3dc', '#ffd9a6')}${stripes('tBlue', '#3d63ff', '#86a0ff')}${stripes('tCoral', '#ff6a3d', '#ffa784')}${stripes('tPink', '#ff4f97', '#ff9cc4')}
  </defs>
  <g filter="url(#drop)"><path d="${BODY}" fill="url(#bg)"/></g>
  <g clip-path="url(#body)">
    <rect width="1024" height="1024" fill="url(#bg)" filter="url(#grain)"/>
    ${inner}
    <rect width="1024" height="1024" fill="url(#light)"/>
  </g>
  <path d="${BODY}" fill="none" stroke="#000" stroke-opacity=".1" stroke-width="2"/>
</svg>`;
}
const S = foldedStar(512, 548, 300, 132, '#ff8a5e', '#e4532c');
const designs = {
  'D-paper-star': icon({ bg: ['#fff7ea', '#f2dfbf'], inner: `
    <polygon points="${S.outline}" transform="translate(18 22)" fill="#7a4a1c" opacity=".2"/>${S.faces}
    ${tape(512, 290, 330, 96, -7, 'tMint')}` }),
  'E-night-star': icon({ bg: ['#2b3a78', '#141b3d'], grainAmt: .35, inner: `
    <polygon points="${S.outline}" transform="translate(18 22)" fill="#000" opacity=".35"/>${foldedStar(512, 548, 300, 132, '#ffb24a', '#f07a22').faces}
    ${tape(512, 290, 330, 96, -7, 'tPink')}` }),
  'F-paper-globe': icon({ bg: ['#ff8c5c', '#ef4d29'], inner: `
    <circle cx="530" cy="560" r="272" fill="#7a2410" opacity=".28"/>
    <g><circle cx="512" cy="536" r="272" fill="#fff6e6"/>
      <clipPath id="globe"><circle cx="512" cy="536" r="262"/></clipPath>
      <g fill="none" stroke="#2b2f4a" stroke-width="20" stroke-linecap="round" clip-path="url(#globe)">
        <ellipse cx="512" cy="536" rx="118" ry="272"/><line x1="512" y1="264" x2="512" y2="808"/>
        <path d="M230 420 Q512 370 794 420"/><path d="M230 536 L794 536"/><path d="M230 652 Q512 702 794 652"/></g>
      <circle cx="512" cy="536" r="272" fill="none" stroke="#2b2f4a" stroke-width="22"/></g>
    ${tape(640, 300, 300, 92, 28, 'tBlue')}` }),
  'H-tape-burst': icon({ bg: ['#fff7ea', '#f2dfbf'], inner: `
    <g transform="translate(18 22)" opacity=".2" fill="#7a4a1c">${[0, 60, 120].map(a => `<rect x="232" y="466" width="560" height="116" rx="4" transform="rotate(${a} 512 524)"/>`).join('')}</g>
    ${[['tBlue', 120], ['tMint', 60], ['tCoral', 0]].map(([pat, a]) => tape(512, 524, 560, 116, a, pat, 1)).join('')}
    <circle cx="512" cy="524" r="34" fill="#fff7ea"/><circle cx="512" cy="524" r="34" fill="none" stroke="#7a4a1c" stroke-opacity=".25" stroke-width="4"/>` })
};
for (const [n, svg] of Object.entries(designs)) fs.writeFileSync(path.join(OUT, n + '.svg'), svg);
console.log('wrote', Object.keys(designs).join(', '));
