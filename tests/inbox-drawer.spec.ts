import { test, expect } from '@playwright/test';
import { signInDemo } from './session';

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('홈의 알림 목록 아이콘은 오른쪽 패널로 알림을 열고, 알림 아이콘은 백그라운드 알림 상태를 문구로 알려 준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await page.getByRole('button', { name: /^백그라운드 알림 (켜짐|꺼짐)$/ }).click();
  await expect(page.getByText(/백그라운드 알림이 (켜져|꺼져) 있습니다/)).toBeVisible();
  await page.getByRole('button', { name: '알림 목록' }).click();
  const panel = page.getByRole('dialog', { name: '알림 목록' });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#\/$/); // 페이지 이동 없이 패널
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThan(150); expect(box.x + box.width).toBeGreaterThan(385); // 오른쪽에서 절반 정도
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});
