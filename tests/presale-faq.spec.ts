import { expect, test } from '@playwright/test';
import { editState, signInDemo } from './session';
test('?? ??? ????? ?? ?? ?? ?? ??? ???? ???'판매 예정, 판매 중과 판매 종료에서도 공개 정보를 모두 유지한다', async ({ page }) => {
  await signInDemo(page);
  for (const offset of [3600000, -3600000, -14400000]) {
    await editState(page, (s, offset) => {
      const p = s.products.find((p: any) => p.id === 'ecobag');
      Object.assign(p, { startsAt: Date.now() + offset, endsAt: Date.now() + offset + 10800000, description: '모든 상태의 설명', shippingNotice: '모든 상태의 배송 안내', purchaseNotice: '모든 상태의 구매 안내', reason: '모든 상태의 처분 사유', extras: [{ key: '소재', value: '모든 상태의 소재' }], faqs: [{ id: 'all', question: '모든 상태의 질문', answer: '답변', confirmed: true }] });
    }, offset);
    await page.goto('/#/product/ecobag');
    for (const text of ['모든 상태의 설명', '모든 상태의 배송 안내', '모든 상태의 구매 안내', '모든 상태의 처분 사유', '모든 상태의 소재']) await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '모든 상태의 질문', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /기존 판매처에서 상품 보기/ })).toHaveAttribute('href', /.+/);
  }
});
test('옵션 선택과 주문서에서 전체 상품 상세를 새 탭으로 다시 열 수 있다', async ({ page }) => {
  await signInDemo(page); await page.goto('/#/product/ecobag');
  await page.getByRole('button', { name: /남은.*선착순 구매하기/ }).click();
  const link = page.getByRole('link', { name: '상품 정보 전체 보기 (새 탭)', exact: true });
  await expect(link).toHaveCount(0);
  await page.getByRole('button', { name: '내추럴 수량 추가', exact: true }).click();
  await page.getByRole('button', { name: '구매하기', exact: true }).click();
  await expect(page).toHaveURL(/checkout/); await expect(link).toHaveCount(0);
});
