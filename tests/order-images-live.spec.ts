import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 확인한다. 주문 응답에는 상품 사진이 없다
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const img = (id: string) => `https://img.example.test/${id}-photo.png`;
const address = { recipientName: '홍길동', recipientPhone: '01012345678', postalCode: '06236', roadAddress: '서울 강남구 테헤란로 1', detailAddress: '1층', deliveryMemo: null };
const items = [{ optionId: 'opt1', label: '기본', quantity: 1 }];
const names: Record<string, string> = { p1: '울 니트', p2: '코튼 셔츠' };
const product = (id: string) => ({ id, name: names[id], brandOrStore: '스토어', category: '숏패딩', price: 18000, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 1, availableQuantity: 9, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) }, images: [{ id: `${id}-i`, objectKey: 'k', url: img(id), contentType: 'image/png', position: 0, representative: true }], sellerId: 'real-seller', description: '새 상품', sourceUrl: 'https://shop.example.com/1', shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: null, attributes: [], dimensions: [], options: [{ id: 'opt1', label: '기본', selections: {}, availableQuantity: 9 }], faqs: [], canAttemptPurchase: true, serverTime: iso(Date.now()) });
const order = (id: string, pid: string) => ({ orderId: id, orderNumber: `SD-${id}`, productId: pid, productName: names[pid], brandOrStore: '스토어', items, state: 'CONFIRMED', delivery: 'PREPARING', totalAmount: 21000, createdAt: iso(Date.now()), sourceVersion: 3 });
const orderDetail = (id: string, pid: string) => ({ ...order(id, pid), address, unitPrice: 18000, shippingFee: 3000, dispatchBusinessDays: 2, expiresAt: null, confirmedAt: iso(Date.now()), carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null, purchaseConfirmedAt: null });

/** 상품 상세 요청 수를 센다(같은 상품은 한 번만) */
async function serve(page: Page, role: 'BUYER' | 'SELLER') {
  const productCalls: string[] = [];
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/img\.example\.test/, route => route.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '');
    const uid = role === 'SELLER' ? 'real-seller' : 'buyer-1';
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: uid, roles: [role], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: uid, name: '사용자', roles: [role] };
    else if (/\/v1\/products\/p\d$/.test(path)) { const id = path.split('/').pop()!; productCalls.push(id); data = product(id); }
    else if (path.endsWith('/v1/products')) data = { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0, serverTime: iso(Date.now()) };
    else if (path.endsWith('/categories')) data = [];
    else if (path.endsWith('/seller/orders/summary')) data = { confirmedOrders: 3, preparingOrders: 3, shippingOrders: 0, deliveredOrders: 0, approximate: false };
    else if (path.endsWith('/seller/orders')) data = { content: [order('o1', 'p1'), order('o2', 'p2'), order('o3', 'p1')], page: 0, totalPages: 1 };
    else if (/\/seller\/orders\/o\d\/inquiries$/.test(path)) data = { content: [], page: 0, totalPages: 1 };
    else if (/\/seller\/orders\/o\d$/.test(path)) data = { ...orderDetail('o1', 'p1'), sellerId: 'real-seller' };
    else if (path.endsWith('/seller/products/p1/dispatch-address')) data = { address: '서울 성수동' };
    else if (/\/v1\/orders\/o1$/.test(path)) data = orderDetail('o1', 'p1');
    else if (path.endsWith('/v1/orders')) data = { content: [order('o1', 'p1')], page: 0, totalPages: 1 };
    else if (path.includes('/orders/o1/inquiries')) data = { content: [], page: 0, totalPages: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
  return productCalls;
}
async function login(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('user@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const loaded = (page: Page, name: string, id: string) => expect.poll(() => page.getByRole('img', { name, exact: true }).first().evaluate((el: HTMLImageElement, want) => el.getAttribute('src') === want && el.complete && el.naturalWidth > 0, img(id))).toBe(true);

test('구매자 주문 문의 화면을 바로 열어도 상품 사진이 보인다', async ({ page }) => {
  await serve(page, 'BUYER');
  await login(page, '/orders/o1/inquiry');
  await expect(page.getByText('울 니트').first()).toBeVisible();
  await loaded(page, '울 니트', 'p1');
});

test('판매자 주문 목록은 상품마다 한 번만 받아 사진을 보여 주고, 주문 상세도 사진이 보인다', async ({ page }) => {
  const calls = await serve(page, 'SELLER');
  await login(page, '/seller/orders');
  await expect(page.getByText('코튼 셔츠').first()).toBeVisible();
  await loaded(page, '울 니트', 'p1'); await loaded(page, '코튼 셔츠', 'p2');
  expect(calls.filter(c => c === 'p1')).toHaveLength(1); expect(calls.filter(c => c === 'p2')).toHaveLength(1); // 주문 3개, 상품 2개
  await page.reload(); await page.goto('/#/seller/orders/o1');
  await expect(page.getByRole('heading', { name: /송장을 등록해 주세요/ })).toBeVisible();
  await loaded(page, '울 니트', 'p1');
});
