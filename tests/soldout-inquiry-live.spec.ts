import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');

const LATER = '2099-01-01T03:00:00Z';
type Stock = { initial: number; confirmed: number; reserved: number };
async function mockSeller(page: Page, stock: Stock) {
  const available = stock.initial - stock.confirmed - stock.reserved;
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/products/p1')) data = { id: 'p1', sellerId: 'real-seller', name: '패딩', price: 2000, shippingFee: 3000, status: 'APPROVED', startsAt: '2020-01-01T00:00:00Z', endsAt: LATER, options: [{ id: 'o1', label: '카키', initialQuantity: stock.initial, confirmedQuantity: stock.confirmed, reservedQuantity: stock.reserved, availableQuantity: available }], faqs: [], attributes: [], optionDimensions: [] };
    else if (path.endsWith('/images') || path.endsWith('/revisions')) data = [];
    else if (path.endsWith('/seller/orders/summary')) data = { confirmedQuantity: stock.confirmed, confirmedOrders: stock.confirmed };
    else if (path.endsWith('/seller/orders/settlement')) data = { month: '2026-11', confirmedAmount: 0, confirmedOrders: 0, awaitingOrders: 0, awaitingAmount: 0, products: [] };
    else if (path.endsWith('/seller/orders')) data = { content: [], page: 0, size: 100, totalPages: 1, totalElements: 0 };
    else if (path.endsWith('/seller/products/sales-summary')) data = { productCount: 1, scheduledCount: 0, onSaleCount: 1, endedCount: 0, initialQuantity: stock.initial, reservedQuantity: stock.reserved, confirmedQuantity: stock.confirmed, availableQuantity: available };
    else if (path.endsWith('/seller/products')) data = { items: [{ id: 'p1', sellerId: 'real-seller', name: '패딩', status: 'APPROVED', version: 1, startsAt: '2020-01-01T00:00:00Z', endsAt: LATER, createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', submittedAt: null, price: 2000, totalQuantity: stock.initial, soldQuantity: stock.confirmed }], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
}
async function signIn(page: Page, next: string, email: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('판매 종료 전이라도 한정 수량이 모두 결제 확정되면 판매 현황은 카운트다운을 멈추고 완판으로 보인다', async ({ page }) => {
  await mockSeller(page, { initial: 2, confirmed: 2, reserved: 0 });
  await signIn(page, '/seller/product/p1', 'seller@example.com');
  await expect(page.getByText('완판됐어요', { exact: true })).toBeVisible();
  await expect(page.getByText('판매 종료까지', { exact: true })).toHaveCount(0);
  await expect(page.getByText('LIVE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
});

test('결제 대기 때문에 남은 수량이 0이어도 확정 수량이 모자라면 판매 중 카운트다운을 유지한다', async ({ page }) => {
  await mockSeller(page, { initial: 2, confirmed: 1, reserved: 1 });
  await signIn(page, '/seller/product/p1', 'seller@example.com');
  await expect(page.getByText('판매 종료까지', { exact: true })).toBeVisible();
  await expect(page.getByText('완판됐어요', { exact: true })).toHaveCount(0);
});

test('판매 상품 관리 목록과 판매 현황 요약도 완판 상품의 남은 시간을 보여 주지 않는다', async ({ page }) => {
  await mockSeller(page, { initial: 2, confirmed: 2, reserved: 0 });
  await signIn(page, '/seller/products', 'seller@example.com');
  await expect(page.getByText('2 / 2개 판매', { exact: true })).toBeVisible();
  await expect(page.getByText(/남음$/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: '판매 결과', exact: true })).toBeVisible();
  await page.goto('/#/seller/sales');
  await expect(page.getByRole('link', { name: /패딩/ })).toContainText('완판');
  await expect(page.getByText(/남음 ›$/)).toHaveCount(0);
});

const order = { orderId: 'o1', orderNumber: 'o1', productId: 'p1', productName: '패딩', brandOrStore: '테스트 스토어', items: [{ optionId: 'opt1', label: '카키', quantity: 1, unitPrice: 2000 }], state: 'CONFIRMED', delivery: 'DELIVERED', totalAmount: 5000, createdAt: '2026-01-01T00:00:00Z', sourceVersion: 1 };
const inquiry = { id: 'q1', orderId: 'o1', category: '하자·파손', messages: [{ seller: false, body: '포장이 찢어져 왔어요', createdAt: '2026-01-02T00:00:00Z' }], imageIds: [], createdAt: '2026-01-02T00:00:00Z' };
async function mockBuyer(page: Page, onDetail: () => number = () => 2) {
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-buyer', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-buyer', name: '테스트 구매자', roles: ['BUYER'] };
    else if (path.endsWith('/orders/o1/inquiries') && req.method() === 'POST') data = { ...inquiry, version: 1 };
    else if (path.endsWith('/orders/o1/inquiries/q1')) {
      // Kafka 조회 모델 반영 전: 첫 조회는 404
      if (onDetail() === 1) { await route.fulfill({ status: 404, json: { code: 'ORDER_QUERY_NOT_FOUND', message: '문의를 찾을 수 없어요.' } }); return; }
      data = inquiry;
    }
    else if (path.endsWith('/orders/inquiries')) data = { content: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    else if (path.endsWith('/orders/o1')) data = { ...order, address: null, unitPrice: 2000, shippingFee: 3000, dispatchBusinessDays: 3, expiresAt: null, confirmedAt: null, carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null };
    else if (path.endsWith('/orders')) data = { content: [order], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
}

test('주문 문의를 보낸 직후 조회 모델이 아직 없어도 다시 시도 없이 주문 번호와 문의가 보인다', async ({ page }) => {
  let detailCalls = 0;
  await mockBuyer(page, () => ++detailCalls);
  await signIn(page, '/orders', 'buyer@example.com');
  await page.getByRole('link', { name: /주문 상세 보기$/ }).click();
  await page.getByRole('button', { name: '판매자에게 문의', exact: true }).click();
  await expect(page.getByText('주문번호 o1', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '문의 내용' }).fill('포장이 찢어져 왔어요');
  await page.getByRole('button', { name: '문의 보내기', exact: true }).click();
  await expect(page).toHaveURL(/#\/inquiries\/q1/);
  await expect.poll(() => detailCalls).toBeGreaterThan(1);
  await expect(page.getByText('주문번호 o1', { exact: true })).toBeVisible();
  await expect(page.getByText('포장이 찢어져 왔어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0);
});

test('주문 문의 작성 화면에 바로 들어와도 주문을 불러와 주문 번호를 보여 준다', async ({ page }) => {
  await mockBuyer(page);
  await signIn(page, '/orders/o1/inquiry', 'buyer@example.com');
  await expect(page.getByText('주문번호 o1', { exact: true })).toBeVisible();
  await expect(page.getByText('주문을 찾을 수 없어요', { exact: true })).toHaveCount(0);
});

test('1:1 문의 작성 화면에 바로 들어와도 관련 주문 목록을 불러와 주문 번호를 고를 수 있다', async ({ page }) => {
  await mockBuyer(page);
  await signIn(page, '/inquiries/compose', 'buyer@example.com');
  await expect(page.getByRole('combobox', { name: '관련 주문' }).locator('option', { hasText: 'o1 · 패딩' })).toHaveCount(1);
});
