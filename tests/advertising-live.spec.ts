import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
/** 실제 API 모드의 로컬 HTTP fixture이며 토스와 운영 API로 요청을 보내지 않는다. */
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
const PAYMENT = '97acde7b-6b2f-4cc5-86d7-815ca6dd7295', APPLICATION = 'aaacde7b-6b2f-4cc5-86d7-815ca6dd7295';
async function serve(page: Page, settings: { close?: boolean; widget?: boolean; rejectCompletionOnce?: boolean; admin?: boolean } = {}) {
  const state = { complete: [] as { body: unknown; key: string | undefined }[], abandoned: 0, polls: 0, paid: false, failed: false };
  await page.addInitScript(({ close }) => {
    const requestPayment = async (request: { successUrl: string; orderId: string }) => {
      if (close) throw new Error('synthetic close');
      location.href = `${request.successUrl}?paymentKey=synthetic-ad-key&orderId=${request.orderId}&amount=200000`;
    };
    (window as any).TossPayments = () => ({ payment: () => ({ requestPayment }), widgets: () => ({ setAmount: async () => {}, renderPaymentMethods: async () => { document.querySelector('#advertising-methods')!.textContent = '합성 테스트 결제 수단'; }, renderAgreement: async () => {}, requestPayment }) });
  }, { close: !!settings.close });
  await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/pg/, '');
    const advertising = { requested: true, applicationId: APPLICATION, submissionId: APPLICATION, amount: 200000, currency: 'KRW', paymentStatus: state.paid || settings.admin ? 'PAID' : state.failed ? 'FAILED' : 'PENDING', cancellationStatus: 'NONE', paidAt: state.paid || settings.admin ? '2030-01-01T00:00:00Z' : null, canceledAt: null, fulfillmentStatus: settings.admin ? 'READY' : 'WAITING_APPROVAL' };
    const product = { id: 'p1', sellerId: 'seller-1', name: '광고 합성 상품', price: 40000, version: 3, shippingFee: 0, status: settings.admin ? 'APPROVED' : state.paid ? 'IN_REVIEW' : 'DRAFT', startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-03T00:00:00Z', options: [{ id: 'o1', label: '기본', initialQuantity: 100, confirmedQuantity: 0, availableQuantity: 100 }], faqs: [], attributes: [], optionDimensions: [], advertising };
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (/\/auth\/(login|refresh)$/.test(path)) data = { accessToken: 'test-token', accountId: settings.admin ? 'admin-1' : 'seller-1', roles: settings.admin ? ['BUYER', 'ADMIN'] : ['BUYER', 'SELLER'], expiresAt: '2099-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: settings.admin ? 'admin-1' : 'seller-1', accountId: settings.admin ? 'admin-1' : 'seller-1', name: '합성 사용자', roles: settings.admin ? ['ADMIN'] : ['SELLER'], interestCategories: [] };
    else if (path.endsWith('/completion')) {
      state.complete.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (settings.rejectCompletionOnce && state.complete.length === 1) { await route.fulfill({ status: 503, json: { code: 'PAYMENT_AD_UNAVAILABLE', message: '확인 지연' } }); return; }
      state.paid = true; data = { paymentId: PAYMENT, productId: 'p1', applicationId: APPLICATION, amount: 200000, paymentStatus: 'PENDING' };
    } else if (path.endsWith('/abandon')) { state.abandoned++; state.failed = true; data = {}; }
    else if (path.includes('/advertising-submissions/')) {
      state.polls++; data = { applicationId: APPLICATION, submissionId: APPLICATION, intentStatus: state.failed ? 'ABORTED' : state.paid && state.polls > 1 ? 'SUBMITTED' : 'WAITING_PAYMENT', paymentStatus: state.failed ? 'FAILED' : state.paid ? 'PAID' : 'PENDING', amount: 200000, paymentAttemptId: PAYMENT, checkoutReady: !state.paid && !state.failed, cancellationStatus: state.failed ? 'CONFIRMED' : 'NONE' };
    } else if (path.endsWith(`/advertising/${PAYMENT}/checkout`)) data = { paymentId: PAYMENT, applicationId: APPLICATION, tossOrderId: `AD-${PAYMENT}`, amount: 200000, currency: 'KRW', clientKey: settings.widget ? 'test_gck_synthetic' : 'test_ck_synthetic', successUrl: `${url.origin}/#/seller/advertising/toss/success`, failUrl: `${url.origin}/#/seller/advertising/toss/fail` };
    else if (path.endsWith(`/advertising/${PAYMENT}`)) data = { paymentId: PAYMENT, productId: 'p1', applicationId: APPLICATION, amount: 200000, currency: 'KRW', paymentStatus: state.paid ? 'PAID' : 'PENDING' };
    else if (path.endsWith('/images') || path.endsWith('/revisions')) data = [];
    else if (path.endsWith('/seller/products/p1') || path.endsWith('/admin/product-reviews/p1')) data = product;
    else if (path.endsWith('/admin/product-reviews')) data = { items: url.searchParams.get('status') === 'APPROVED' ? [product] : [], totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/seller/products')) data = { items: [product], totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/admin/seller-applications') || path.endsWith('/seller/orders')) data = { content: [], totalPages: 0, totalElements: 0 };
    else if (path.endsWith('/notifications/unread-count')) data = { count: 0 };
    await route.fulfill({ json: { success: true, code: 'COMMON_SUCCESS', data } });
  });
  return state;
}
async function login(page: Page) {
  await page.goto('/#/login?next=%2Fmy');
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password1!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#\/(?:my|admin)$/);
}
test('저장소 없이 AD 귀환을 복구하고 PAID 뒤 심사 접수까지 기다린다', async ({ page }) => {
  const state = await serve(page); await login(page);
  await page.goto(`/?paymentKey=synthetic-ad-key&orderId=AD-${PAYMENT}&amount=200000#/seller/advertising/toss/success`);
  await expect(page.getByRole('status').first()).toContainText('결제 완료');
  await expect(page).toHaveURL(/#\/seller\/published\/p1$/);
  expect(state.complete).toEqual([{ body: { paymentKey: 'synthetic-ad-key', tossOrderId: `AD-${PAYMENT}` }, key: PAYMENT }]);
  expect(page.url()).not.toContain('paymentKey');
});
test('원본 금액과 다른 귀환은 승인하지 않는다', async ({ page }) => {
  const state = await serve(page); await login(page);
  await page.goto(`/#/seller/advertising/toss/success?paymentKey=synthetic-ad-key&orderId=AD-${PAYMENT}&amount=200001`);
  await expect(page.getByText('서버 광고비와 결제 금액이 일치하지 않아요.', { exact: false })).toBeVisible();
  expect(state.complete).toHaveLength(0);
});
test('테스트 위젯으로 결제하고 자동 심사 접수한다', async ({ page }) => {
  const state = await serve(page, { widget: true }); await login(page);
  await page.goto(`/#/seller/advertising/checkout/p1/${APPLICATION}`);
  await expect(page.getByText('합성 테스트 결제 수단')).toBeVisible();
  await page.getByRole('button', { name: '광고비 200,000원 결제하고 심사 요청' }).click();
  await expect(page).toHaveURL(/#\/seller\/published\/p1$/); expect(state.complete).toHaveLength(1);
});
test('결제창 닫기는 중단 의도 뒤 서버 실패 상태를 확인한다', async ({ page }) => {
  const state = await serve(page, { close: true }); await login(page);
  await page.goto(`/#/seller/advertising/checkout/p1/${APPLICATION}`);
  await page.getByRole('button', { name: '광고비 200,000원 결제하고 심사 요청' }).click();
  await expect(page.getByRole('status').first()).toContainText('광고 결제가 완료되지 않았어요');
  expect(state.abandoned).toBe(1); expect(state.complete).toHaveLength(0);
});
test('승인 접수 지연을 같은 멱등 키로 재시도한다', async ({ page }) => {
  const state = await serve(page, { rejectCompletionOnce: true }); await login(page);
  await page.goto(`/#/seller/advertising/toss/success?paymentKey=synthetic-ad-key&orderId=AD-${PAYMENT}&amount=200000`);
  await expect(page.getByText('확인 지연')).toBeVisible();
  await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect(page).toHaveURL(/#\/seller\/published\/p1$/);
  expect(state.complete.map(x => x.key)).toEqual([PAYMENT, PAYMENT]);
});
test('운영자 상세는 결제 배지와 수동 광고 쿠폰 안내를 표시한다', async ({ page }) => {
  await serve(page, { admin: true }); await login(page);
  await page.goto('/#/admin/products/p1');
  await expect(page.getByText('광고 결제 완료', { exact: true })).toBeVisible();
  await expect(page.getByText('광고 쿠폰 만들기:', { exact: false })).toBeVisible();
});
