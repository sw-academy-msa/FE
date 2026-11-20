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

async function serve(page: Page, sv: { state: string }) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(IMG, route => route.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    const checkout = { orderId: 'o1', orderNumber: 'SD-1', version: 2, state: sv.state, delivery: null, productId: 'p1', sellerId: 's1', productName: '울 니트', brandOrStore: '스토어', items, address, unitPrice: 18000, shippingFee: 3000, totalAmount: 21000, dispatchBusinessDays: 2, expiresAt: iso(Date.now() + 300_000), serverTime: iso(Date.now()), paymentAttemptId: null, confirmedAt: sv.state === 'CONFIRMED' ? iso(Date.now()) : null, carrier: null, trackingNumber: null, failureCode: null, termsVersion: 'v1', tossOrderId: null };
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

test('토스 결제창에서 돌아와(새로 열린 페이지) 결제 완료 화면이 뜰 때 상품 사진이 보인다', async ({ page }) => {
  const sv = { state: 'HELD' };
  await serve(page, sv);
  await page.goto('/#/login?next=%2Forders');
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#\/orders$/);
  // 토스가 successUrl로 돌려보내면 페이지가 새로 열린다(저장소에 상품이 없는 상태)
  await page.goto('/?paymentKey=pk_test_1&orderId=SD-o1&amount=21000#/payments/toss/success');
  await expect(page).toHaveURL(/#\/orders\/o1/);
  await expect(page.getByText('울 니트').first()).toBeVisible();
  const photo = page.getByRole('img', { name: '울 니트', exact: true }).first();
  await expect(photo).toHaveAttribute('src', IMG);
  await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});
