import { test, expect } from '@playwright/test';
import { signInDemo } from './session';

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('홈의 알림 목록 아이콘은 오른쪽에서 들어오는 전체 화면 패널로 알림을 열고, 알림 아이콘은 백그라운드 알림 상태를 문구로 알려 준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await page.getByRole('button', { name: /^백그라운드 알림 (켜짐|꺼짐)$/ }).click();
  await expect(page.getByText(/백그라운드 알림이 (켜져|꺼져) 있습니다/)).toBeVisible();
  await page.getByRole('button', { name: '알림 목록' }).click();
  const panel = page.getByRole('dialog', { name: '알림 목록' });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#\/\?inbox=1$/); // 홈 위에 패널(열림은 주소에만 남긴다)
  await expect.poll(async () => { const b = (await panel.boundingBox())!; return Math.round(b.x) <= 1 && b.width >= 389; }).toBe(true); // 오른쪽에서 들어와 전체 화면
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/#\/$/);
});

test('알림 패널에서 다른 화면으로 갔다가 뒤로 가면 홈이 아니라 열린 알림 패널로 돌아오고, 닫으면 홈만 남는다', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: '알림 목록' }).click();
  const panel = page.getByRole('dialog', { name: '알림 목록' });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/#\/\?inbox=1$/);
  await page.evaluate(() => { location.hash = '#/product/ecobag'; }); // 알림을 눌러 관련 화면으로 간 것과 같다
  await expect(page).toHaveURL(/#\/product\/ecobag$/);
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden'); // 패널이 스크롤을 잠근 채 남지 않는다
  await page.goBack();
  await expect(page).toHaveURL(/#\/\?inbox=1$/);
  await expect(panel).toBeVisible();
  await panel.getByRole('button').first().click(); // 닫기
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/#\/$/);
});
