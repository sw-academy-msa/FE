import { expect, test } from '@playwright/test';
import { signInDemo } from './session';
test('옵션 선택과 주문서에서 전체 상품 상세를 새 탭으로 다시 열 수 있다', async ({ page }) => {
  await signInDemo(page); await page.goto('/#/product/ecobag');
  await page.getByRole('button', { name: /남은.*선착순 구매하기/ }).click();
  const link = page.getByRole('link', { name: '상품 정보 전체 보기 (새 탭)', exact: true });
  await expect(link).toHaveAttribute('href', /product\/ecobag/); await expect(link).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: '내추럴 수량 추가', exact: true }).click();
  await page.getByRole('button', { name: '구매하기', exact: true }).click();
  await expect(page).toHaveURL(/checkout/); await expect(link).toBeVisible(); await expect(link).toHaveAttribute('href', /product\/ecobag/);
});
