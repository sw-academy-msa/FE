import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { actor, editState, signInDemo } from './session';
// 서비스 워커가 사진을 대신 받으면 page.route가 요청을 못 보므로 이 파일에서는 막는다
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await signInDemo(page); });

const photo = (page: Page) => page.getByRole('img', { name: '데일리 코튼 에코백', exact: true }).first();
/** 앞 화면에서 받은 사진은 메모리 캐시에서 바로 열려 route를 거치지 않으므로, 테스트마다 처음 보는 주소를 준다 */
const freshPhoto = (page: Page, tag: string) => editState(page, (s, url) => { s.products.find((p: any) => p.id === 'ecobag').images = [url]; }, `./images/generated-4.png?t=${tag}`);
const tagged = (tag: string) => (url: URL) => url.pathname.endsWith('/images/generated-4.png') && url.searchParams.get('t') === tag;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('사진 주소가 없으면 STOCKDROP 배너를 칸 크기 그대로 보여 준다', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await editState(page, s => { s.products.find((p: any) => p.id === 'ecobag').images = []; });
  await page.goto('/#/product/ecobag');
  const img = photo(page);
  await expect(img).toHaveAttribute('data-fallback', 'banner');
  await expect(img).toHaveAttribute('src', /icon-512\.png$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  expect(await img.evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
  const box = (await img.boundingBox())!; expect(Math.abs(box.width - box.height)).toBeLessThan(2); // aspect-square 칸 유지
  expect(await noOverflow(page)).toBe(true);
});

test('사진을 못 받으면 배너로 바뀌고, 다시 받은 주소가 열리면 실제 사진으로 바뀐다', async ({ page }) => {
  const fail = tagged('fail'); await page.route(fail, r => r.abort());
  await freshPhoto(page, 'fail');
  await page.goto('/#/product/ecobag');
  const img = photo(page);
  await expect(img).toHaveAttribute('data-fallback', 'banner');
  await expect(img).toHaveAttribute('src', /icon-512\.png$/);
  // 조회 모델이 늦게 새 주소를 준 경우: 주소가 바뀌면 다시 시도한다
  await page.unroute(fail);
  await editState(page, s => { s.products.find((p: any) => p.id === 'ecobag').images = ['./images/generated-4.png?v=2']; });
  await page.goto('/#/product/ecobag');
  await expect(img).not.toHaveAttribute('data-fallback', /./);
  await expect(img).toHaveAttribute('src', /generated-4\.png\?v=2$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('사진을 받는 동안은 배너가 깔리고, 다 받으면 실제 사진만 남는다', async ({ page }) => {
  let release!: () => void; const held = new Promise<void>(r => { release = r; });
  await page.route(tagged('slow'), async r => { await held; await r.continue(); });
  await freshPhoto(page, 'slow');
  await page.goto('/#/product/ecobag');
  const img = photo(page);
  await expect(img).toHaveAttribute('data-fallback', 'loading');
  expect(await img.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('icon-512.png');
  release();
  await expect(img).not.toHaveAttribute('data-fallback', /./);
  expect(await img.evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('배너까지 못 받으면 빈 자리로 끝나고 배너를 반복해서 부르지 않는다', async ({ page }) => {
  let bannerHits = 0;
  await page.route(tagged('both'), r => r.abort());
  await page.route('**/icon-512.png', r => { bannerHits++; return r.abort(); });
  await freshPhoto(page, 'both');
  await page.goto('/#/product/ecobag');
  const empty = photo(page);
  await expect(empty).toBeVisible();
  await expect.poll(() => empty.evaluate(el => el.tagName)).toBe('DIV');
  const settled = bannerHits; expect(settled).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(bannerHits).toBe(settled); // 빈 자리가 된 뒤로는 배너 요청이 더 생기지 않는다(onError 반복 없음)
  await expect.poll(() => empty.evaluate(el => el.tagName)).toBe('DIV');
});

test('운영자 입점 심사와 판매 심사 화면에 왼쪽 색 줄이 없다', async ({ page }) => {
  await actor(page, 'admin');
  for (const url of ['/#/admin/applications', '/#/admin/products']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const bars = await page.locator('main *').evaluateAll(nodes => nodes.filter(n => parseFloat(getComputedStyle(n).borderLeftWidth) >= 3).length);
    expect(bars, url).toBe(0);
    expect(await noOverflow(page)).toBe(true);
  }
});
