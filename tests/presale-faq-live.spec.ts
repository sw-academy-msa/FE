import { expect, test } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 HTTP 모킹 전용');
test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
const answer = '세탁은 찬물 손세탁을 권장합니다.\n'.repeat(100);
test.beforeEach(async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/presale$/, route => route.fulfill({ json: { success: true, data: {
    id: 'presale', sellerId: 'seller1', name: '판매 예정 패딩', brandOrStore: '확인한 판매처', category: '의류', description: '판매 전 상세 설명입니다.', price: 2000, shippingFee: 3000,
    dispatchBusinessDays: 2, perAccountLimit: 2, startsAt: '2035-01-01T00:00:00Z', endsAt: '2035-01-01T03:00:00Z', status: 'UPCOMING', sourceUrl: 'https://example.com/product', disposalReason: '시즌 종료 재고', shippingNotice: '택배사와 반품 배송비 안내', purchaseNotice: null,
    stock: { initialQuantity: 7, availableQuantity: 7, confirmedQuantity: 0 }, options: [{ id: 'a', label: '카키', selections: {}, availableQuantity: 3 }, { id: 'b', label: '검정', selections: {}, availableQuantity: 4 }],
    attributes: [{ name: '소재', value: '면 100%' }], dimensions: [], images: [{ id: 'im1', url: '/images/generated-3.png', position: 0 }, { id: 'im2', url: '/images/generated-4.png', position: 1 }],
    faqs: [{ id: 'f1', question: '세탁 방법은 무엇인가요?', answer, confirmedAt: '2026-01-01T00:00:00Z' }, { id: 'f2', question: '직접 작성한 질문', answer: '직접 작성한 답변', confirmedAt: '2026-01-01T00:00:00Z' }], serverTime: '2026-11-21T00:00:00Z', canAttemptPurchase: false,
  } } }));
  await page.goto('/#/product/presale');
  await expect(page.getByRole('heading', { name: '판매 예정 패딩', exact: true })).toBeVisible();
});
test('판매 시작 전에도 상세, 배송 안내, 수량과 모든 사진을 확인하고 구매는 막는다', async ({ page }) => {
  for (const text of ['판매 전 상세 설명입니다.', '면 100%', '시즌 종료 재고', '택배사와 반품 배송비 안내']) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText('3개 · 판매 시작 후 구매 가능', { exact: true })).toBeVisible();
  await expect(page.getByText('4개 · 판매 시작 후 구매 가능', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '상품 사진 2 보기', exact: true }).click();
  await expect(page.getByRole('img', { name: '판매 예정 패딩', exact: true })).toHaveAttribute('src', /generated-4/);
  await expect(page.getByRole('button', { name: '판매 시작 전 · 구매할 수 없어요', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
test('FAQ 질문은 아래 모달로 열리고 Esc, 바깥, 뒤로와 닫기 버튼으로 닫힌다', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '세탁 방법은 무엇인가요?', exact: true });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '세탁 방법은 무엇인가요?', exact: true });
  await expect(sheet).toBeVisible(); await expect(sheet).toHaveAttribute('aria-modal', 'true');
  await sheet.click({ position: { x: 5, y: 5 } }); await expect(sheet).toBeVisible();
  await expect(sheet.getByText(answer, { exact: true })).toBeVisible();
  expect(await sheet.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press('Escape'); await expect(sheet).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click(); await page.mouse.click(2, 2); await expect(sheet).not.toBeVisible();
  await trigger.click(); await page.goBack(); await expect(sheet).not.toBeVisible(); await expect(page).toHaveURL(/product\/presale/);
  await trigger.click(); await sheet.getByRole('button', { name: '닫기', exact: true }).click(); await expect(sheet).not.toBeVisible();
  await page.getByRole('button', { name: '직접 작성한 질문', exact: true }).click(); await expect(page.getByRole('dialog').getByText('직접 작성한 답변')).toBeVisible();
});
test('standalone에서도 FAQ 안전 영역과 402px 너비를 유지한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true })); await page.reload();
  await page.getByRole('button', { name: '세탁 방법은 무엇인가요?', exact: true }).click();
  const sheet = page.getByRole('dialog'); await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
