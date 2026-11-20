import { expect, test, type Page, type Route } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');

type Handler = (path: string, url: URL, route: Route) => unknown | Promise<unknown>;
async function mockApi(page: Page, role: 'BUYER' | 'SELLER', handler: Handler) {
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '');
    let data: unknown;
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-user', roles: [role], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-user', name: '테스트 사용자', roles: [role] };
    else data = await handler(path, url, route);
    if (data === null) return; // handler가 직접 응답했다
    await route.fulfill({ json: { success: true, data: data ?? {} } });
  });
}
async function signIn(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('user@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const product = (id: string, category: string) => ({ id, name: `${category} 상품 ${id}`, brandOrStore: '스토어', category, price: 1000, image: null, status: 'ON_SALE', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', soldOutAt: null, stock: { initialQuantity: 5, confirmedQuantity: 0, availableQuantity: 5, approximate: false }, metadata: { version: 1, occurredAt: '2026-01-01T00:00:00Z', projectedAt: '2026-01-01T00:00:00Z' } });

test('판매자 주문 문의 상세에 구매자가 첨부한 사진이 판매자용 열람 URL로 보인다', async ({ page }) => {
  const downloads: string[] = [];
  await mockApi(page, 'SELLER', path => {
    if (path.includes('/seller/orders/o1/inquiry-images/')) { downloads.push(path.split('/').at(-2)!); return { id: 'x', url: PIXEL, contentType: 'image/gif', sizeBytes: 1, expiresAt: '2099-01-01T00:00:00Z' }; }
    if (path.endsWith('/seller/orders/o1/inquiries/q1')) return { id: 'q1', orderId: 'o1', category: '하자', messages: [{ seller: false, body: '찍힘이 있어요', createdAt: '2026-01-01T00:00:00Z' }], imageIds: ['img1', 'img2'], createdAt: '2026-01-01T00:00:00Z' };
    if (path.endsWith('/seller/orders/inquiries')) return { content: [{ id: 'q1', orderId: 'o1', productId: 'p1', productName: '패딩', category: '하자', lastMessage: '찍힘이 있어요', lastMessageAt: '2026-01-01T00:00:00Z', awaitingSeller: true, createdAt: '2026-01-01T00:00:00Z' }], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    if (path.endsWith('/seller/products/inquiries') || path.endsWith('/seller/products')) return { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
  });
  await signIn(page, '/seller/inquiries/q1');
  await expect(page.getByText('찍힘이 있어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '구매자 첨부 사진' })).toHaveCount(2);
  await expect.poll(() => downloads.sort()).toEqual(['img1', 'img2']);
});

// 홈 카테고리 탭은 공개 카테고리 카탈로그(GET /category-catalog)의 대분류로 만든다(이슈 #103). 예전 /categories(공개 상품의 세부 이름) 탭을 대신한다
const CATALOG = { majors: [{ code: 'CLOTHING', name: '의류', categories: [{ code: 'CLOTHING', name: '의류' }, { code: 'CLOTHING_COAT_01', name: '아우터' }] }, { code: 'HOUSEHOLD', name: '일반 생활잡화', categories: [{ code: 'HOUSEHOLD', name: '일반 생활잡화' }, { code: 'HOUSEHOLD_KITCHEN_01', name: '주방용품' }] }] };
test('홈 카테고리 탭은 서버 카탈로그의 대분류로 만들고 그 대분류의 세부 카테고리 상품을 거른다', async ({ page }) => {
  await mockApi(page, 'BUYER', path => {
    if (path.endsWith('/category-catalog')) return CATALOG;
    if (path.endsWith('/products')) return { items: [product('a', '아우터'), product('k', '주방용품')], page: 0, size: 100, totalPages: 1, totalElements: 2 };
    if (path.endsWith('/notifications/unread-count')) return { count: 0 };
  });
  await signIn(page, '/');
  const tabs = page.getByRole('group', { name: '상품 카테고리' });
  await expect(tabs.getByRole('button')).toHaveText(['전체', '의류', '일반 생활잡화']);
  await tabs.getByRole('button', { name: '일반 생활잡화', exact: true }).click();
  await expect(page.getByText('주방용품 상품 k')).toBeVisible();
  await expect(page.getByText('아우터 상품 a')).toHaveCount(0);
});

test('카테고리 카탈로그를 불러오지 못하면 고정 대분류 탭(대체 목록)을 보이고 다시 시도로 서버 카탈로그를 다시 불러온다', async ({ page }) => {
  let fail = true;
  await mockApi(page, 'BUYER', async (path, _url, route) => {
    if (path.endsWith('/category-catalog')) { if (fail) { await route.fulfill({ status: 503, json: { code: 'TEMP', message: '잠시 후' } }); return null; } return CATALOG; }
    if (path.endsWith('/products')) return { items: [product('a', '아우터')], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    if (path.endsWith('/notifications/unread-count')) return { count: 0 };
  });
  await signIn(page, '/');
  const tabs = page.getByRole('group', { name: '상품 카테고리' });
  await expect(page.getByText('카테고리를 불러오지 못해 대분류만 보여요.')).toBeVisible();
  await expect(tabs.getByRole('button')).toHaveText(['전체', '의류', '패션잡화', '문구', '일반 생활잡화']);
  await expect(page.getByText('아우터 상품 a')).toBeVisible();
  await tabs.getByRole('button', { name: '의류', exact: true }).click(); await expect(page.getByText('아직 의류 상품이 없어요')).toBeVisible(); // 대체 목록은 세부 이름(아우터)을 매핑하지 못한다
  fail = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(tabs.getByRole('button')).toHaveText(['전체', '의류', '일반 생활잡화']);
  await expect(page.getByText('아우터 상품 a')).toBeVisible();
});

test('상품 상세에는 서버에 저장되지 않는 찜(관심 상품) 버튼이 없고 알림 받기는 남아 있다', async ({ page }) => {
  await mockApi(page, 'BUYER', path => {
    if (path.endsWith('/products/a')) return { ...product('a', '아우터'), status: 'UPCOMING', startsAt: '2098-01-01T00:00:00Z', sellerId: 's1', description: '설명', sourceUrl: 'https://example.invalid', shippingFee: 3000, dispatchBusinessDays: 3, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: '재고', attributes: [], dimensions: [], options: [{ id: 'o1', label: '기본', selections: {}, availableQuantity: 5 }], images: [], faqs: [], canAttemptPurchase: true, serverTime: '2030-01-01T00:00:00Z' };
    if (path.includes('/inquiries')) return { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    if (path.endsWith('/notifications/product-alerts')) return { content: [] };
  });
  await signIn(page, '/product/a');
  await expect(page.getByText('아우터 상품 a').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /관심 상품/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /상품 알림/ }).first()).toBeVisible();
});

test('알림함은 50건씩 보여 주고 더 보기로 다음 페이지를 이어서 읽는다', async ({ page }) => {
  const pages: string[] = [];
  const note = (i: number) => ({ id: `n${i}`, type: 'PRODUCT_SALE_STARTED', title: `알림 ${i}`, body: '본문', targetType: 'PRODUCT', targetId: 'p', relatedId: null, occurredAt: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(), createdAt: '2026-01-01T00:00:00Z', readAt: '2026-01-01T00:00:00Z' });
  await mockApi(page, 'BUYER', (path, url) => {
    if (path.endsWith('/notifications')) { const p = Number(url.searchParams.get('page')); pages.push(`${p}:${url.searchParams.get('size')}`); return { content: Array.from({ length: p === 0 ? 50 : 3 }, (_, i) => note(p * 50 + i)) }; }
  });
  await signIn(page, '/notifications');
  await expect(page.getByText('알림 49', { exact: true })).toBeVisible();
  await expect(page.getByText('알림 50', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '알림 더 보기', exact: true }).click();
  await expect(page.getByText('알림 52', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '알림 더 보기', exact: true })).toHaveCount(0);
  expect(pages).toEqual(['0:50', '1:50']);
});

test('판매자 배송 완료는 입력란 없이 확인 한 번으로 서버에 보낸다', async ({ page }) => {
  const posted: unknown[] = [];
  const detail = { orderId: 'o1', orderNumber: 'o1', productId: 'p1', productName: '패딩', brandOrStore: '스토어', items: [{ optionId: 'op1', label: '카키', quantity: 1 }], state: 'CONFIRMED', delivery: 'SHIPPING', totalAmount: 5000, createdAt: '2026-01-01T00:00:00Z', sourceVersion: 1, address: { recipientName: '홍길동', recipientPhone: '01012345678', postalCode: '1', roadAddress: '도로 1', detailAddress: null, deliveryMemo: null }, unitPrice: 2000, shippingFee: 3000, dispatchBusinessDays: 2, expiresAt: null, confirmedAt: '2026-01-01T00:00:00Z', carrier: 'CJ대한통운', trackingNumber: '123456789', shippedAt: '2026-01-02T00:00:00Z', deliveredAt: null };
  await mockApi(page, 'SELLER', (path, _url, route) => {
    if (path.endsWith('/seller/orders/o1/fulfillment')) return { ...detail, version: 4, sellerId: 'real-user', serverTime: '2026-01-03T00:00:00Z', paymentAttemptId: null, failureCode: null, termsVersion: null };
    if (path.endsWith('/seller/orders/o1/delivery-completion')) { posted.push(route.request().postDataJSON()); return { ...detail, delivery: 'DELIVERED', version: 5, sellerId: 'real-user', serverTime: '2026-01-03T00:00:00Z', paymentAttemptId: null, failureCode: null, termsVersion: null }; }
    if (path.endsWith('/seller/orders/o1/inquiries')) return { content: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    if (path.endsWith('/seller/orders/o1')) return detail;
    if (path.endsWith('/seller/orders/summary')) return { totalOrders: 1, confirmedOrders: 1, preparingOrders: 0, shippingOrders: 1, deliveredOrders: 0, confirmedQuantity: 1, approximate: false };
    if (path.endsWith('/seller/orders')) return { content: [detail], page: 0, size: 100, totalPages: 1, totalElements: 1 };
  });
  await signIn(page, '/seller/orders/o1');
  await page.getByRole('button', { name: '배송완료 확인', exact: true }).click();
  await expect(page.getByText('배송완료로 처리할까요?')).toBeVisible();
  await expect(page.locator('.fixed input, .fixed textarea, .fixed select')).toHaveCount(0);
  await page.getByRole('button', { name: '배송완료 처리', exact: true }).click();
  await expect(page.getByText('배송완료로 처리했습니다.')).toBeVisible();
  expect(posted).toEqual([{ expectedVersion: 4 }]);
});
