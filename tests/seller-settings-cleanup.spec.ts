import { expect, test } from '@playwright/test';
import { actor, signInDemo } from './session';

// 로컬에만 저장되던 판매자 알림 설정 화면(진입 링크 없는 fallback)을 지웠다. 알림 설정은 공통 화면을 쓴다
test('예전 판매자 알림 설정 주소는 마이페이지로 보내고 공통 알림 설정 진입은 그대로다', async ({ page }) => {
  await signInDemo(page); await actor(page, 'seller');
  await page.goto('/#/seller/settings/notifications');
  await expect(page).toHaveURL(/#\/my$/);
  await expect(page.getByRole('switch', { name: /신규주문 알림|판매일정 알림/ })).toHaveCount(0);
  await page.getByRole('link', { name: '알림 설정', exact: true }).click();
  await expect(page).toHaveURL(/#\/notifications\/settings\?mode=settings/);
});
