import { expect, test, type Page, type Route } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

type Handler = (path: string, route: Route) => unknown | Promise<unknown>;
async function mockApi(page: Page, role: 'BUYER' | 'SELLER', handler: Handler) {
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '') + url.search;
    let data: unknown;
    if (path.includes('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.includes('/auth/login') || path.includes('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: role === 'BUYER' ? ['BUYER'] : ['BUYER', 'SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트', roles: [role] };
    else data = await handler(path, route);
    if (data === null) return;
    await route.fulfill({ json: { success: true, data: data ?? {} } });
  });
}
async function signIn(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
type FaqRow = { id: string; question: string; answer: string };
const faqDto = (f: FaqRow) => ({ ...f, suggestionId: null, sourceInquiryId: null, confirmedBy: 'real-seller', confirmedAt: '2026-01-01T00:00:00Z' });
const sellerProduct = (version: number, faqs: FaqRow[], status = 'APPROVED') => ({ id: 'p1', sellerId: 'real-seller', version, status, name: '패딩', description: '설명', sourceUrl: null, category: '의류', price: 2000, shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: null, startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', reviewReason: null, options: [{ id: 'o1', label: '카키', initialQuantity: 5, reservedQuantity: 0, confirmedQuantity: 1, availableQuantity: 4, selections: {} }], brandOrStore: '스토어', attributes: [], optionDimensions: [], dispatchAddress: null, returnAddress: null, addressesCapturedAt: null, faqs: faqs.map(faqDto) });
const publicProduct = (faqs: FaqRow[]) => ({ id: 'p1', sellerId: 'real-seller', name: '패딩', description: '설명', brandOrStore: '스토어', category: '의류', sourceUrl: 'https://example.invalid', price: 2000, shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: '재고', attributes: [], dimensions: [], options: [{ id: 'o1', label: '카키', selections: {}, availableQuantity: 4 }], images: [], faqs: faqs.map(f => ({ id: f.id, question: f.question, answer: f.answer })), canAttemptPurchase: true, serverTime: '2030-01-01T00:00:00Z', status: 'ON_SALE', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', soldOutAt: null, stock: { initialQuantity: 5, confirmedQuantity: 1, availableQuantity: 4, approximate: false }, metadata: { version: 1, occurredAt: '2026-01-01T00:00:00Z', projectedAt: '2026-01-01T00:00:00Z' } });
function sellerStatusPages(path: string) {
  if (path.includes('/images') || path.includes('/revisions')) return [];
  if (path.includes('/seller/orders/summary')) return { confirmedQuantity: 1, confirmedOrders: 1 };
  if (path.includes('/seller/orders/settlement')) return { month: '2026-11', confirmedAmount: 0, confirmedOrders: 0, awaitingOrders: 0, awaitingAmount: 0, products: [] };
  if (path.includes('/seller/orders')) return { content: [], page: 0, size: 100, totalPages: 1, totalElements: 0 };
  return undefined;
}

test('판매 중 상품의 FAQ를 하나씩 추가, 수정, 삭제하고 구매자 상세 반영을 확인한다', async ({ page }) => {
  let version = 3, faqs: FaqRow[] = [{ id: 'f1', question: '세탁은 어떻게 하나요?', answer: '손세탁해 주세요.' }];
  let publicFaqs = [...faqs], publicReads = 0; const calls: { method: string; path: string; body?: unknown }[] = [];
  await mockApi(page, 'SELLER', (path, route) => {
    const method = route.request().method();
    if (path.includes('/seller/products/p1/faqs')) {
      const body = method === 'DELETE' ? undefined : route.request().postDataJSON(); calls.push({ method, path, body });
      if (method === 'POST') faqs = [...faqs, { id: `f${faqs.length + 2}`, question: body.faq.question, answer: body.faq.answer }];
      if (method === 'PUT') faqs = faqs.map(f => f.id === 'f1' ? { ...f, question: body.faq.question, answer: body.faq.answer } : f);
      if (method === 'DELETE') faqs = faqs.filter(f => !path.includes(`/faqs/${f.id}?`));
      version++; const snapshot = [...faqs]; publicReads = 0;
      setTimeout(() => { publicFaqs = snapshot; }, 700); // 조회 모델은 잠시 뒤 반영된다
      return sellerProduct(version, faqs);
    }
    if (path === '/api/v1/seller/products/p1') return sellerProduct(version, faqs);
    if (path === '/api/v1/products/p1') { publicReads++; return publicProduct(publicFaqs); }
    return sellerStatusPages(path);
  });
  await signIn(page, '/seller/product/p1');
  await page.getByRole('link', { name: 'FAQ 수정', exact: true }).click();
  await expect(page).toHaveURL(/#\/seller\/product\/p1\/faqs$/);
  await expect(page.getByRole('heading', { name: /등록된 FAQ 1개/ })).toBeVisible();

  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await page.getByRole('textbox', { name: 'FAQ 질문' }).fill('  사이즈는 정사이즈인가요?  ');
  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await expect(page.getByText('답변을 입력해 주세요.')).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('textbox', { name: 'FAQ 답변' }).fill('네, 정사이즈예요.');
  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await expect(page.getByText('FAQ를 추가했어요.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '구매자 상품 상세에 반영됐어요.' })).toBeVisible({ timeout: 8000 });
  expect(publicReads).toBeGreaterThan(1); // 첫 조회는 반영 전이라 다시 읽었다
  await expect(page.getByRole('heading', { name: /등록된 FAQ 2개/ })).toBeVisible();

  await page.getByRole('button', { name: '세탁은 어떻게 하나요? 수정' }).click();
  await page.getByRole('textbox', { name: 'FAQ 답변' }).fill('찬물 손세탁해 주세요.');
  await page.getByRole('button', { name: '수정 저장' }).click();
  await expect(page.getByText('FAQ를 수정했어요.')).toBeVisible();

  await page.getByRole('button', { name: '사이즈는 정사이즈인가요? 삭제' }).click();
  await page.getByRole('dialog', { name: 'FAQ 삭제 확인' }).getByRole('button', { name: '삭제하기' }).click();
  await expect(page.getByText('FAQ를 삭제했어요.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /등록된 FAQ 1개/ })).toBeVisible();
  await expect(page.getByText('찬물 손세탁해 주세요.')).toBeVisible();

  expect(calls.map(c => `${c.method} ${c.path.replace('/api/v1', '')}`)).toEqual(['POST /seller/products/p1/faqs', 'PUT /seller/products/p1/faqs/f1', 'DELETE /seller/products/p1/faqs/f3?expectedVersion=5']);
  expect(calls[0].body).toEqual({ expectedVersion: 3, faq: { question: '사이즈는 정사이즈인가요?', answer: '네, 정사이즈예요.', confirmed: true } });
  expect(calls[1].body).toMatchObject({ expectedVersion: 4, faq: { id: 'f1', question: '세탁은 어떻게 하나요?', answer: '찬물 손세탁해 주세요.', confirmed: true } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 구매자 상품 상세에도 바뀐 FAQ가 보인다
  await page.goto('/#/product/p1');
  await expect(page.getByText('세탁은 어떻게 하나요?')).toBeVisible();
});

test('다른 곳에서 상품이 바뀌어 version이 다르면(409) 최신 내용을 다시 받고 입력은 남긴다', async ({ page }) => {
  let version = 3; let failOnce = true;
  await mockApi(page, 'SELLER', async (path, route) => {
    if (path.includes('/seller/products/p1/faqs')) {
      if (failOnce) { failOnce = false; version = 7; await route.fulfill({ status: 409, json: { code: 'PRODUCT_STATE', message: '현재 상태에서는 처리할 수 없습니다.' } }); return null; }
      expect(route.request().postDataJSON().expectedVersion).toBe(7);
      return sellerProduct(8, [{ id: 'f9', question: '질문', answer: '답변' }]);
    }
    if (path === '/api/v1/seller/products/p1') return sellerProduct(version, []);
    if (path === '/api/v1/products/p1') return publicProduct([{ id: 'f9', question: '질문', answer: '답변' }]);
    return sellerStatusPages(path);
  });
  await signIn(page, '/seller/product/p1/faqs');
  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await page.getByRole('textbox', { name: 'FAQ 질문' }).fill('질문');
  await page.getByRole('textbox', { name: 'FAQ 답변' }).fill('답변');
  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await expect(page.getByText('상품 정보가 바뀌어 최신 내용을 불러왔어요. 다시 저장해 주세요.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'FAQ 답변' })).toHaveValue('답변');
  await page.getByRole('button', { name: 'FAQ 추가', exact: true }).click();
  await expect(page.getByText('FAQ를 추가했어요.')).toBeVisible();
});

test('판매 심사 중인 상품은 FAQ를 바꿀 수 없다고 안내한다', async ({ page }) => {
  await mockApi(page, 'SELLER', path => (path === '/api/v1/seller/products/p1' ? sellerProduct(2, [{ id: 'f1', question: '질문', answer: '답변' }], 'IN_REVIEW') : sellerStatusPages(path)));
  await signIn(page, '/seller/product/p1/faqs');
  await expect(page.getByText('판매 심사 중이에요')).toBeVisible();
  await expect(page.getByRole('button', { name: 'FAQ 추가' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /수정$|삭제$/ })).toHaveCount(0);
});

test('상품 알림 신청과 취소는 Gateway의 product-alerts 단건 경로로 PUT과 DELETE를 보낸다', async ({ page }) => {
  const calls: string[] = [];
  await mockApi(page, 'BUYER', (path, route) => {
    if (path.includes('/notifications/product-alerts/')) { calls.push(`${route.request().method()} ${path}`); return route.request().method() === 'PUT' ? { productId: 'p1', subscribed: true, createdAt: '2026-01-01T00:00:00Z' } : {}; }
    if (path.endsWith('/notifications/product-alerts')) return [];
    if (path === '/api/v1/products/p1') return { ...publicProduct([]), status: 'UPCOMING', startsAt: '2098-01-01T00:00:00Z' };
    if (path.includes('/inquiries')) return { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
  });
  await signIn(page, '/product/p1');
  const toggle = page.getByRole('button', { name: /상품 알림/ }).first();
  await toggle.click();
  await expect(page.getByText(/상품 알림을 신청했어요/)).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.getByText('상품 알림을 취소했어요.')).toBeVisible();
  expect(calls).toEqual(['PUT /api/v1/notifications/product-alerts/p1', 'DELETE /api/v1/notifications/product-alerts/p1']);
});
