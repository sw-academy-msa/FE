import { expect, test, type Page } from '@playwright/test';
import { actor, editState, signInDemo } from './session';

test.describe('아이폰 17 Safari 크기', () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
  test.beforeEach(async ({ page }) => { await signInDemo(page); });
  async function check(page: Page) {
    const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
    for (const flag of ['width=device-width', 'initial-scale=1', 'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no', 'viewport-fit=cover']) expect(meta).toContain(flag);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const clipped = await page.locator('body *').evaluateAll(elements => elements.filter(el => {
      const rect = el.getBoundingClientRect(); if (!rect.width || !rect.height) return false;
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return false;
        parent = parent.parentElement;
      }
      return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1;
    }).map(el => el.tagName + '.' + el.className));
    expect(clipped).toEqual([]);
    const small = await page.locator('input, textarea, select').evaluateAll(elements => elements.filter(el => !['checkbox', 'radio', 'file', 'hidden', 'range'].includes((el as HTMLInputElement).type) && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.getAttribute('aria-label') || el.tagName));
    expect(small).toEqual([]);
    const width = await page.locator('main').evaluate(el => el.parentElement!.getBoundingClientRect().width);
    expect(width).toBeCloseTo(402, 0);
  }
  for (const [name, route, role] of [
    ['홈', '/#/', 'buyer'], ['상품 상세', '/#/product/ecobag', 'buyer'], ['마이페이지', '/#/my', 'buyer'],
    ['판매 등록', '/#/seller/new', 'seller'], ['판매자 주문', '/#/seller/orders', 'seller'],
    ['운영자', '/#/admin', 'admin'], ['로그인', '/#/login', 'buyer'],
  ]) test(`${name}: viewport와 가로 너비 및 입력 글자 크기`, async ({ page }) => {
    if (name === '로그인') await editState(page, state => { state.auth.userId = null; state.activeUserId = ''; });
    else await actor(page, role);
    await page.goto(route);
    if (name === '로그인') { await expect(page).toHaveURL(/#\/login$/); await expect(page.getByRole('textbox', { name: '이메일', exact: true })).toBeVisible(); }
    await expect(page.locator('main')).toBeVisible(); await check(page);
  });
  test('결제: viewport와 가로 너비 및 입력 글자 크기', async ({ page }) => {
    await page.goto('/#/product/ecobag'); await page.getByRole('button', { name: /남은.*선착순 구매하기/ }).click();
    await page.getByRole('button', { name: '내추럴 수량 추가', exact: true }).click(); await page.getByRole('button', { name: '구매하기', exact: true }).click();
    await expect(page).toHaveURL(/checkout/); await check(page);
  });
  test('제스처 확대는 차단하고 한 손가락 세로 이동은 유지한다', async ({ page }) => {
    const result = await page.evaluate(() => {
      const blocked = (type: string, touches?: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        if (touches !== undefined) Object.defineProperty(event, 'touches', { value: Array(touches).fill({}) });
        document.dispatchEvent(event); return event.defaultPrevented;
      };
      return { gestures: ['gesturestart', 'gesturechange', 'gestureend'].map(type => blocked(type)), multi: blocked('touchmove', 2), single: blocked('touchmove', 1), touchAction: getComputedStyle(document.body).touchAction, overscroll: getComputedStyle(document.documentElement).overscrollBehavior };
    });
    expect(result).toEqual({ gestures: [true, true, true], multi: true, single: false, touchAction: 'manipulation', overscroll: 'none' });
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });
  test('홈 화면 앱도 같은 viewport를 사용하고 검색과 링크가 동작한다', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.reload(); await check(page);
    await page.getByRole('textbox', { name: '상품 검색' }).fill('에코백');
    await expect(page.getByRole('textbox', { name: '상품 검색' })).toHaveValue('에코백');
    await page.getByRole('link', { name: '마이', exact: true }).click();
    await expect(page).toHaveURL(/#\/my$/);
  });
  test('상품 구매 영역은 문서 스크롤 후에도 viewport 하단에 유지된다', async ({ page }) => {
    await page.goto('/#/product/ecobag');
    const buy = page.getByRole('button', { name: /남은.*선착순 구매하기/ });
    await expect(buy).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(async () => { const box = await buy.boundingBox(); return !!box && box.y >= 0 && box.y + box.height <= 874 - 76; }).toBe(true);
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).overflowX)).toBe('clip');
  });
  test('모달은 문서와 body를 잠그고 닫은 뒤 세로 스크롤을 복원한다', async ({ page }) => {
    await page.goto('/#/product/ecobag');
    await page.getByRole('button', { name: /남은.*선착순 구매하기/ }).click();
    await expect(page.getByRole('dialog', { name: '옵션 선택' })).toBeVisible();
    expect(await page.evaluate(() => [document.documentElement, document.body].every(el => el.classList.contains('overflow-hidden') && getComputedStyle(el).overflowY === 'hidden'))).toBe(true);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '옵션 선택' })).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => [document.documentElement, document.body].every(el => !el.classList.contains('overflow-hidden')))).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });
});

test('데스크톱은 기존 390px 가운데 레이아웃을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signInDemo(page);
  expect(await page.locator('main').evaluate(el => el.parentElement!.getBoundingClientRect().width)).toBe(390);
});
