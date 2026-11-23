import { test, expect } from '@playwright/test';
import { signInDemo } from './session';

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('지금 보고 있는 하단 탭을 다시 누르면 페이지 새로고침 없이 화면을 다시 그리고, 다른 탭은 이동만', async ({ page }) => {
  await page.goto('/#/schedule');
  const nav = page.getByRole('navigation', { name: '하단 메뉴' });
  await expect(nav).toBeVisible();
  await page.evaluate(() => { (window as any).__kept = true; });
  await nav.getByRole('link', { name: '주문' }).click();
  await expect(page).toHaveURL(/#\/orders$/);
  const before = await page.evaluateHandle(() => document.querySelector('main'));
  await nav.getByRole('link', { name: '주문' }).click();
  await expect(page).toHaveURL(/#\/orders$/);
  await expect.poll(() => before.evaluate(el => !!el && !el.isConnected)).toBe(true); // 화면을 다시 마운트
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__kept)).toBe(true); // 페이지 전체 새로고침은 없음
});
