import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답과 가짜 토스 복귀 주소로 확인한다. 운영 결제는 하지 않는다
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
const IMG = 'https://img.example.test/p1-photo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const address = { recipientName: '홍길동', recipientPhone: '01012345678', postalCode: '06236', roadAddress: '서울 강남구 테헤란로 1', detailAddress: '1층', deliveryMemo: null };
const items = [{ optionId: 'opt1', label: '기본', quantity: 1 }];
const detail = () => ({ id: 'p1', name: '울 니트', brandOrStore: '스토어', category: '숏패딩', price: 18000, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 1, availableQuantity: 9, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) }, images: [{ id: 'i1', objectKey: 'k', url: IMG, contentType: 'image/png', position: 0, representative: true }], sellerId: 's1', description: '새 상품', sourceUrl: 'https://shop.example.com/1', shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: null, attributes: [], dimensions: [], options: [{ id: 'opt1', label: '기본', selections: {}, availableQuantity: 9 }], faqs: [], canAttemptPurchase: true, serverTime: iso(Date.now()) });

async function serve(page: Page, sv: { state: string; code: string; remaining?: number }) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(IMG, route => route.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    const checkout = { orderId: 'o1', orderNumber: 'SD-1', version: 2, state: sv.state, delivery: null, productId: 'p1', sellerId: 's1', productName: '울 니트', brandOrStore: '스토어', items, address, unitPrice: 18000, shippingFee: 3000, totalAmount: 21000, dispatchBusinessDays: 2, expiresAt: iso(Date.now() + 300_000), serverTime: iso(Date.now()), paymentAttemptId: null, confirmedAt: sv.state === 'CONFIRMED' ? iso(Date.now()) : null, carrier: null, trackingNumber: null, failureCode: sv.code, purchaseLimit: sv.remaining === undefined ? null : 3, remainingPurchaseQuantity: sv.remaining ?? null, termsVersion: 'v1', tossOrderId: null };
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'buyer-1', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'buyer-1', name: '구매자', roles: ['BUYER'] };
    else if (path.endsWith('/orders/checkout-terms')) data = { version: 'v1', title: '결제 약관', content: '약관', effectiveAt: iso(0), contentSha256: 'x' };
    else if (path.endsWith('/orders/o1/payment-attempts') && method === 'POST') { sv.state = 'CONFIRMED'; data = { ...checkout, state: 'APPROVING_PAYMENT' }; }
    else if (path.endsWith('/orders/o1/checkout')) data = checkout;
    // 주문 상세 응답에는 상품 사진이 없다(OrderDetailDto)
    else if (path.endsWith('/v1/orders/o1')) data = { orderId: 'o1', orderNumber: 'SD-1', productId: 'p1', productName: '울 니트', brandOrStore: '스토어', items, state: 'CONFIRMED', delivery: 'PREPARING', totalAmount: 21000, createdAt: iso(Date.now()), sourceVersion: 3, address, unitPrice: 18000, shippingFee: 3000, dispatchBusinessDays: 2, expiresAt: null, confirmedAt: iso(Date.now()), carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null, purchaseConfirmedAt: null };
    else if (path.endsWith('/v1/products/p1')) data = detail();
    else if (path.endsWith('/v1/products')) data = { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0, serverTime: iso(Date.now()) };
    else if (path.endsWith('/categories')) data = [];
    await route.fulfill({ json: { success: true, data } });
  });
}

async function openFailedCheckout(page: Page, code: string, remaining?: number) {
  await serve(page, { state: 'FAILED', code, remaining });
  await page.goto('/#/login?next=%2Fcheckout%2Fo1');
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#\/product\/p1$/);
}
test('한도를 다 구매한 계정은 재고 부족 대신 한도 안내와 확인만 표시한다', async ({ page }) => {
  await openFailedCheckout(page, 'PRODUCT_PURCHASE_LIMIT_EXCEEDED', 0);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('이 상품은 1인당 3개까지 살 수 있어요. 이미 3개를 구매해서 더 주문할 수 없어요.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '확인', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '구매하기', exact: true })).toHaveCount(0);
  await expect(sheet.getByText('재고를 확보하지 못했어요', { exact: true })).toHaveCount(0);
});
test('한도가 일부 남으면 남은 수량까지만 선택하고 구매할 수 있다', async ({ page }) => {
  await openFailedCheckout(page, 'PRODUCT_PURCHASE_LIMIT_EXCEEDED', 1);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('이 상품은 1인당 3개까지 살 수 있어요. 지금은 1개까지 주문할 수 있어요.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '기본 수량 추가', exact: true })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: '구매하기', exact: true })).toBeEnabled();
});
test('실제 품절은 기존 재고 부족 문구를 유지한다', async ({ page }) => {
  await openFailedCheckout(page, 'PRODUCT_STOCK');
  await expect(page.getByRole('dialog').getByText('재고를 확보하지 못했어요. 수량을 다시 선택해 주세요. 결제는 진행되지 않았어요.', { exact: true })).toBeVisible();
});
test('수량 정보가 없는 한도 오류는 공통 문구와 확인을 표시한다', async ({ page }) => {
  await openFailedCheckout(page, 'PRODUCT_PURCHASE_LIMIT_EXCEEDED');
  await expect(page.getByRole('dialog').getByText('1인 구매 한도를 넘었어요. 이 상품은 이미 구매 가능한 수량만큼 구매하셨어요.', { exact: true })).toBeVisible();
});
