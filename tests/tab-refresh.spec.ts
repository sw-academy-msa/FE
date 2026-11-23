import { test, expect } from '@playwright/test';
import { signInDemo } from './session';

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('지금 보고 있는 하단 탭을 다시 누르면 새로고침, 다른 탭은 이동만', async ({ page }) => {
  await page.goto('/#/schedule');
  const nav = page.getByRole('navigation', { name: '하단 메뉴' });
  await expect(nav).toBeVisible();
  await page.evaluate(() => { (window as any).__kept = true; });
  await nav.getByRole('link', { name: '주문' }).click();
  await expect(page).toHaveURL(/#\/orders$/);
  expect(await page.evaluate(() => (window as any).__kept)).toBe(true); // 다른 탭: 새로고침 없음
  await Promise.all([page.waitForEvent('load'), nav.getByRole('link', { name: '주문' }).click()]);
  await expect(page).toHaveURL(/#\/orders$/);
  expect(await page.evaluate(() => (window as any).__kept)).toBeUndefined(); // 같은 탭: 새로고침됨
});
