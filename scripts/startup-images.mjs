/**
 * 아이폰 홈 화면 앱 정지 화면(public/splash/splash-*.png)을 앱의 실제 시작 화면(Splash)과 똑같이 다시 그린다
 * 사용법: node scripts/startup-images.mjs [주소, 기본 http://localhost:5173]  (dev 서버가 떠 있어야 함)
 * index.html의 apple-touch-startup-image 링크마다 기기 CSS 크기와 배율로 시작 화면을 찍는다
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const html = fs.readFileSync('index.html', 'utf-8');
const links = [...html.matchAll(/href="\.\/(splash\/[^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/g)];
const browser = await chromium.launch();
for (const [, file, w, h, r] of links) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +r });
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); // 자동화 브라우저도 시작 화면을 띄운다
  await page.goto(`${BASE}/#/welcome`);
  const splash = page.getByRole('img', { name: 'STOCKDROP' });
  await splash.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await splash.screenshot({ path: `public/${file}`, animations: 'disabled' });
  console.log(file);
  await page.close();
}
await browser.close();
