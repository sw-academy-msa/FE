import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');

const productDetail = {
  id: 'p2', sellerId: 's1', name: '테스트 상품', description: '설명', brandOrStore: '테스트 스토어', category: '의류', sourceUrl: 'https://store.example.invalid/p', price: 10000, shippingFee: 3000,
  dispatchBusinessDays: 3, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: '시즌 종료', attributes: [], dimensions: [{ name: '색상', values: ['크림'] }],
  options: [{ id: 'o1', label: '크림', selections: { 색상: '크림' }, availableQuantity: 7 }], images: [], faqs: [], canAttemptPurchase: true, serverTime: '2030-01-01T01:00:00Z',
  status: 'ON_SALE', startsAt: '2020-01-01T01:00:00Z', endsAt: '2099-01-01T04:00:00Z', soldOutAt: null,
  stock: { initialQuantity: 10, confirmedQuantity: 3, availableQuantity: 7, approximate: false }, metadata: { version: 1, occurredAt: '2030-01-01T00:59:58Z', projectedAt: '2030-01-01T00:59:59Z' },
};
const row = (id: string, answer: string | null) => ({ id, question: `${id} 질문`, answer, createdAt: '2026-01-01T00:00:00Z', answeredAt: answer ? '2026-01-02T00:00:00Z' : null });
async function mockApi(page: Page, calls: string[], posted: unknown[] = []) {
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '');
    calls.push(`${route.request().method()} ${path}${url.search}`);
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-buyer', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-buyer', name: '테스트 구매자', roles: ['BUYER'] };
    // 알림의 문의가 첫 페이지 밖에 있어도 본인 목록의 다음 페이지에서 찾는다
    else if (path.endsWith('/products/p2') && route.request().method() === 'GET') data = productDetail;
    else if (path.endsWith('/products/p2/inquiries') && route.request().method() === 'POST') { posted.push(route.request().postDataJSON()); data = row('q9', null); }
    else if (path.endsWith('/products/p2/inquiries')) data = { items: [row('q8', '답변이에요')], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/products/p1/inquiries')) data = url.searchParams.get('page') === '1' ? { items: [row('q1', '네, 가능합니다')], page: 1, size: 100, totalPages: 2, totalElements: 101 } : { items: [row('q0', null)], page: 0, size: 100, totalPages: 2, totalElements: 101 };
    else if (path.endsWith('/orders/o1/inquiries/q2')) data = { id: 'q2', orderId: 'o1', category: '배송', messages: [{ seller: false, body: '언제 오나요', createdAt: '2026-01-01T00:00:00Z' }, { seller: true, body: '내일 출고해요', createdAt: '2026-01-02T00:00:00Z' }, { seller: false, body: '송장도 알려 주세요', createdAt: '2026-01-03T00:00:00Z' }], imageIds: [], createdAt: '2026-01-01T00:00:00Z' };
    await route.fulfill({ json: { success: true, data } });
  });
}
async function signIn(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('상품 문의 답변 알림 경로로 직접 들어오면 관련 상품 ID로 문의를 찾고 추가 질문은 숨긴다', async ({ page }) => {
  const calls: string[] = []; await mockApi(page, calls);
  await signIn(page, '/inquiries/q1?productId=p1');
  await expect(page.getByText('q1 질문')).toBeVisible();
  await expect(page.getByText('네, 가능합니다')).toBeVisible();
  await expect(page.getByRole('button', { name: '추가 문의' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '새 문의는 상품 상세에서 남겨 주세요' })).toHaveAttribute('href', '#/product/p1');
  expect(calls.filter(c => c.startsWith('GET /api/v1/products/p1/inquiries'))).toEqual(expect.arrayContaining([expect.stringContaining('page=0'), expect.stringContaining('page=1')]));
  expect(calls.some(c => c.startsWith('POST') && c.includes('/inquiries'))).toBe(false);
});

test('주문 문의 답변 알림 경로는 주문 ID로 상세를 읽고 구매자 추가 질문이 마지막이면 답변 대기로 보인다', async ({ page }) => {
  const calls: string[] = []; await mockApi(page, calls);
  await signIn(page, '/inquiries/q2?orderId=o1');
  await expect(page.getByText('송장도 알려 주세요')).toBeVisible();
  await expect(page.getByText('답변 대기', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '추가 문의 보내기' })).toBeVisible();
  expect(calls).toContain('GET /api/v1/orders/o1/inquiries/q2');
});

test('상품 상세의 상품 문의는 실제 생성 API를 호출하고 본인 문의를 보여 준다', async ({ page }) => {
  const calls: string[] = [], posted: unknown[] = []; await mockApi(page, calls, posted);
  await signIn(page, '/product/p2');
  await expect(page.getByRole('button', { name: /q8 질문.*답변 완료/ })).toBeVisible();
  await page.getByRole('textbox', { name: '상품 문의 내용' }).fill('  사이즈가 어떻게 되나요?  ');
  await page.getByRole('button', { name: '문의 남기기' }).click();
  await expect(page.getByText('문의가 판매자에게 전달되었습니다.')).toBeVisible();
  expect(posted).toEqual([{ question: '사이즈가 어떻게 되나요?' }]);
  await expect(page.getByRole('button', { name: /q9 질문.*답변 대기/ })).toBeVisible();
  await page.getByRole('button', { name: /q8 질문/ }).click();
  await expect(page).toHaveURL(/#\/inquiries\/q8\?productId=p2$/);
  await expect(page.getByText('답변이에요')).toBeVisible();
});
