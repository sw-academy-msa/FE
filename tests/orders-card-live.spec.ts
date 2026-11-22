import { test, expect } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
test.use({ viewport: { width: 402, height: 874 } });
test('실제 주문 응답의 상태별 건수와 카드 상세 이동 및 상품 사진 보완', async ({ page }) => {
  let details = 0;
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, ''); let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (/\/auth\/(login|refresh)$/.test(path)) data = { accessToken: 'test-token', accountId: 'buyer-test', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z' };
    else if (path.endsWith('/accounts/me')) data = { id: 'buyer-test', name: '구매자', roles: ['BUYER'] };
    else if (path.endsWith('/orders')) data = { content: ['SHIPPING', 'SHIPPING', 'DELIVERED'].map((delivery, i) => ({ orderId: `o${i}`, productId: 'p1', productName: '서버 상품', brandOrStore: '판매처', state: 'CONFIRMED', delivery, items: [{ optionId: 'a', label: '카키', quantity: 1 }], totalAmount: 5000, createdAt: '2026-01-01T03:00:00Z' })), page: 0, totalPages: 1, totalElements: 3 };
    else if (path.endsWith('/products/p1')) data = { id: 'p1', sellerId: 'seller-test', name: '서버 상품', price: 2000, shippingFee: 3000, brandOrStore: '판매처', category: '의류', startsAt: '2020-01-01T00:00:00Z', endsAt: '2030-01-01T00:00:00Z', images: [{ url: '/images/generated-3.png', position: 0 }], options: [], faqs: [] };
    else if (path.endsWith('/orders/o0')) { details++; data = { orderId: 'o0', productId: 'p1', productName: '서버 상품', brandOrStore: '판매처', state: 'CONFIRMED', delivery: 'SHIPPING', items: [{ optionId: 'a', label: '카키', quantity: 1 }], totalAmount: 5000, shippingFee: 3000, createdAt: '2026-01-01T03:00:00Z', carrier: '택배사', trackingNumber: '123456789' }; }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/#/login?next=%2Forders'); await page.getByLabel('이메일', { exact: true }).fill('test@example.com'); await page.getByLabel('비밀번호', { exact: true }).fill('password'); await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('배송 중인 주문이 2건 있어요')).toBeVisible();
  await expect(page.getByRole('link', { name: /주문 상세 보기$/ })).toHaveCount(3);
  await expect(page.getByRole('img', { name: '서버 상품', exact: true }).first()).toHaveAttribute('src', /generated-3/);
  await page.getByRole('button', { name: '배송중', exact: true }).click(); await expect(page.getByRole('link', { name: /주문 상세 보기$/ })).toHaveCount(2);
  await expect(page.getByText(/주문번호/)).toHaveCount(0); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.getByRole('link', { name: /주문 상세 보기$/ }).first().click(); await expect(page).toHaveURL(/orders\/o0$/); await expect.poll(() => details).toBeGreaterThan(0); await expect(page.getByText('운송장 번호', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '판매자 문의 · 반품 문의', exact: true })).toBeVisible();
});
