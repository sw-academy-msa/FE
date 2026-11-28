/**
 * 앱 아이콘(public/*.png): 주색 바탕에 흰 STOCKDROP 글자 로고(src/splashLogo.ts)
 * 사용법: node scripts/app-icons.mjs  (favicon.ico는 favicon-16·32.png로 따로 만든다)
 * maskable은 가운데 원(지름 80%) 안에 들어가게 로고를 줄인다
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const src = fs.readFileSync('src/splashLogo.ts', 'utf-8');
const path = src.match(/LOGO_PATH = '([^']+)'/)[1];
const [, , vw, vh] = src.match(/LOGO_VIEWBOX = \[([^\]]+)\]/)[1].split(',').map(Number);
const BRAND = '#023EB5'; // stockdropPalette.ink
const ICONS = [['app-icon.png', 1024, .78], ['icon-512.png', 512, .78], ['icon-192.png', 192, .78], ['icon-maskable-512.png', 512, .66], ['apple-touch-icon.png', 180, .78], ['favicon-32.png', 32, .86], ['favicon-16.png', 16, .9]];
const browser = await chromium.launch();
for (const [file, size, ratio] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const w = size * ratio;
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:${BRAND};display:grid;place-items:center"><svg viewBox="0 0 ${vw} ${vh}" width="${w}" height="${w * vh / vw}"><path d="${path}" fill="#FFFFFF"/></svg></body>`);
  await page.screenshot({ path: `public/${file}` });
  console.log(file);
  await page.close();
}
await browser.close();
