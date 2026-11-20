import { expect, test } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');

async function mockApi(page: import('@playwright/test').Page, kind: 'sold' | 'pending' | 'unsold' = 'sold') {
  const sold = kind === 'unsold' ? 0 : 1, initial = kind === 'pending' ? 2 : 1;
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/products/p1')) data = { id: 'p1', sellerId: 'real-seller', name: '패딩', price: 2000, shippingFee: 3000, status: 'APPROVED', startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-01T03:00:00Z', options: [{ id: 'o1', label: '카키', initialQuantity: initial, confirmedQuantity: sold, reservedQuantity: 0, availableQuantity: initial - sold }], faqs: [], attributes: [], optionDimensions: [] };
    else if (path.endsWith('/images') || path.endsWith('/revisions')) data = [];
    else if (path.endsWith('/seller/orders/summary')) data = { confirmedQuantity: sold, confirmedOrders: sold };
    else if (path.endsWith('/seller/orders/settlement')) data = { month: '2026-11', confirmedAmount: kind === 'sold' ? 2000 : 0, confirmedOrders: kind === 'sold' ? 1 : 0, awaitingOrders: 0, awaitingAmount: 0, products: kind === 'sold' ? [{ productId: 'p1', amount: 2000, quantity: 1, orders: 1 }] : [] };
    else if (path.endsWith('/seller/orders')) data = { content: sold ? [{ orderId: 'o1', productId: 'p1', state: 'CONFIRMED', delivery: 'PREPARING', totalAmount: 5000, items: [{ optionId: 'o1', label: '카키', quantity: 1 }], createdAt: '2020-01-01T01:00:00Z' }] : [], page: 0, size: 100, totalPages: 1, totalElements: sold };
    else if (path.endsWith('/seller/products')) data = { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    else if (path.endsWith('/auth/logout')) await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { success: true, data } });
  });
}
async function signIn(page: import('@playwright/test').Page) {
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('배송비 제외 구매 확정 정산을 원 단위로 표시한다', async ({ page }) => {
  await mockApi(page);
  await page.goto('/#/login?next=%2Fseller%2Fproduct%2Fp1'); await signIn(page);
  await expect(page.getByRole('heading', { name: '판매 결과', exact: true })).toBeVisible();
  await expect(page.getByText('−200원', { exact: true })).toBeVisible();
  await expect(page.getByText('1,800원', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('5,000원', { exact: true })).toHaveCount(0);
  await expect(page.getByText('1만원', { exact: true })).toHaveCount(0);
});
test('구매 미확정 금액은 정산에서 제외한다', async ({ page }) => {
  await mockApi(page, 'pending');
  await page.goto('/#/login?next=%2Fseller%2Fproduct%2Fp1'); await signIn(page);
  await expect(page.getByText('판매 수수료 (0%)', { exact: true })).toBeVisible();
  await expect(page.getByText('0원', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('4,500원', { exact: true })).toHaveCount(0);
});
test('미판매 상품은 1개 한정과 0/1개를 표시하고 완판으로 표시하지 않는다', async ({ page }) => {
  await mockApi(page, 'unsold');
  await page.goto('/#/login?next=%2Fseller%2Fproduct%2Fp1'); await signIn(page);
  await expect(page.getByText('1개 한정', { exact: true })).toBeVisible();
  await expect(page.getByText('/ 1개 판매', { exact: true })).toBeVisible();
  await expect(page.getByText('0개가 판매됐어요', { exact: true })).toBeVisible();
  await expect(page.getByText('완판됐어요', { exact: true })).toHaveCount(0);
});
test('판매자는 로그아웃 직후 재로그인해도 온보딩으로 이동하지 않는다', async ({ page }) => {
  await mockApi(page);
  await page.goto('/#/login?next=%2Fmy'); await signIn(page);
  await expect(page).toHaveURL(/#\/my$/);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃하기', exact: true }).click();
  await expect(page).toHaveURL(/welcome|login/);
  if (page.url().includes('/welcome')) await page.getByRole('link', { name: '이메일로 로그인', exact: true }).click();
  await signIn(page);
  await expect(page).not.toHaveURL(/onboarding|login/);
  await page.goto('/#/my');
  await expect(page.getByRole('heading', { name: '마이페이지', exact: true })).toBeVisible();
});
