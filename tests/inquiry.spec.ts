import { expect, test } from '@playwright/test';
import { actor, editState, signInDemo } from './session';

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('상품 상세에서 상품 문의를 남기고 상세는 새 문의 안내만 보여 준다', async ({ page }) => {
  await page.goto('/#/product/ecobag');
  const box = page.getByRole('textbox', { name: '상품 문의 내용' });
  await box.scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '문의 남기기' })).toBeDisabled();
  await box.fill('세탁기로 빨아도 되나요?');
  await page.getByRole('button', { name: '문의 남기기' }).click();
  await expect(page.getByText('문의가 판매자에게 전달되었습니다.')).toBeVisible();
  await expect(box).toHaveValue('');
  const mine = page.getByRole('button', { name: /세탁기로 빨아도 되나요\?.*답변 대기/ });
  await expect(mine).toBeVisible();
  await mine.click();
  await expect(page).toHaveURL(/#\/inquiries\/[^?]+\?productId=ecobag$/);
  await expect(page.getByText('세탁기로 빨아도 되나요?')).toBeVisible();
  // 상품 문의에는 추가 메시지 API가 없어 추가 질문 버튼 대신 상품 상세의 새 문의 안내만 둔다
  await expect(page.getByRole('button', { name: '추가 문의' })).toHaveCount(0);
  await page.getByRole('link', { name: '새 문의는 상품 상세에서 남겨 주세요' }).click();
  await expect(page).toHaveURL(/#\/product\/ecobag$/);
});

test('로그인 전에는 로그인 후 문의하도록 안내하고 판매자 본인 상품에는 문의 영역이 없다', async ({ page }) => {
  await editState(page, s => { s.auth.userId = null; s.activeUserId = ''; });
  await page.goto('/#/product/ecobag');
  await expect(page.getByRole('link', { name: '로그인하고 문의하기' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '상품 문의 내용' })).toHaveCount(0);
  await actor(page, 'seller');
  await editState(page, s => { const p = s.products.find((x: { id: string }) => x.id === 'ecobag'); p.sellerId = 'seller'; });
  await page.goto('/#/product/ecobag');
  await expect(page.getByRole('heading', { name: '옵션별 구매 가능 수량' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '상품 문의' })).toHaveCount(0);
});

test('운영 1:1 문의 상세는 저장되지 않는 추가 문의를 보내지 않고 새 문의로 안내한다', async ({ page }) => {
  await editState(page, s => { s.inquiries.unshift({ id: 'ops-1', userId: 'buyer', sellerId: 'stockdrop', productId: '', productName: '계정', kind: '계정', question: '로그인이 안 돼요', public: false, createdAt: Date.now() }); });
  await page.goto('/#/inquiries/ops-1');
  await expect(page.getByText('로그인이 안 돼요')).toBeVisible();
  await expect(page.getByRole('button', { name: '추가 문의 보내기' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '새 1:1 문의' })).toBeVisible();
});
