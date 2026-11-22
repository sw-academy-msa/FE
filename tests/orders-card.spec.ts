import { test, expect } from '@playwright/test';
import { signInDemo, editState } from './session';
test.use({ viewport: { width: 402, height: 874 } });
test.beforeEach(async ({ page }) => {
  await signInDemo(page); await editState(page, s => { s.orders.slice(0, 3).forEach((o: any, i: number) => { o.status = ['shipping', 'preparing', 'delivered'][i]; o.tracking = '123456789'; o.carrier = '테스트택배'; }); }); await page.goto('/#/orders');
});
test('목록 전체 카드가 상세 링크이고 버튼과 주문번호 없이 기존 상세 기능에 접근한다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '주문 / 배송', exact: true })).toBeVisible();
  await expect(page.getByText('배송 중인 주문이 1건 있어요')).toBeVisible();
  await expect(page.getByRole('link', { name: /주문 상세 보기$/ })).toHaveCount(3);
  await expect(page.getByRole('button', { name: /배송 조회|판매자 문의|주문 상세/ })).toHaveCount(0);
  await expect(page.getByText(/주문번호/)).toHaveCount(0);
  const first = page.getByRole('link', { name: /주문 상세 보기$/ }).first(); await expect(first).toHaveAttribute('href', /#\/orders\/[^?]+$/);
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44); await first.click();
  await expect(page.getByRole('heading', { name: '주문 · 배송 상세', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '판매자 문의 · 반품 문의', exact: true })).toBeVisible();
  await expect(page.getByText('운송장 번호', { exact: true })).toBeVisible();
});
test('밑줄 탭은 15px이고 상태별 필터와 빈 상태 및 요약 숨김이 동작한다', async ({ page }) => {
  const tabs = page.getByRole('group', { name: '주문 상태' });
  await expect(tabs.getByRole('button')).toHaveText(['전체', '배송준비', '배송중', '배송완료', '취소/환불']);
  for (const tab of await tabs.getByRole('button').all()) { expect(await tab.evaluate(n => getComputedStyle(n).fontSize)).toBe('15px'); expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44); }
  for (const label of ['배송준비', '배송중', '배송완료']) { await tabs.getByRole('button', { name: label, exact: true }).click(); await expect(page.getByRole('link', { name: /주문 상세 보기$/ })).toHaveCount(1); }
  await tabs.getByRole('button', { name: '취소/환불', exact: true }).click(); await expect(page.getByText('주문 내역이 없어요', { exact: true })).toBeVisible();
  await editState(page, s => { s.orders.forEach((o: any) => { o.status = 'preparing'; }); }); await expect(page.getByText(/배송 중인 주문이/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
test('긴 상품명과 옵션, 결제 대기 카드도 잘리지 않고 전체 링크로 동작한다', async ({ page }) => {
  await editState(page, s => { const o = s.orders[0]; o.product.name = '긴상품명'.repeat(20); o.lines[0].name = '긴옵션'.repeat(20); s.holds = [{ id: 'waiting', userId: 'buyer', productId: 'ecobag', lines: [], status: 'pending', expiresAt: Date.now() + 300000 }]; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(page.getByRole('link', { name: /결제 결과 확인:/ })).toHaveAttribute('href', '#/checkout/waiting');
});
