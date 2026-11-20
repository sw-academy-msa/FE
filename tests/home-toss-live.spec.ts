import { expect, test, type Browser, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답과 가짜 토스 결제창으로 확인한다. 운영 결제는 하지 않는다
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
type Server = { state: string; attempts: number; list: string[] };
const summary = (id: string, name: string) => ({ id, name, brandOrStore: '스토어', category: '니트', price: 18000, image: null, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 0, availableQuantity: 10, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) } });
const detail = () => ({ ...summary('p1', '울 니트'), images: [], sellerId: 's1', description: '새 상품', sourceUrl: 'https://shop.example.com/1', shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: null, attributes: [], dimensions: [], options: [{ id: 'opt1', label: '기본', selections: {}, availableQuantity: 10 }], faqs: [], canAttemptPurchase: true, serverTime: iso(Date.now()) });
const address = { recipientName: '홍길동', recipientPhone: '01012345678', postalCode: '06236', roadAddress: '서울 강남구 테헤란로 1', detailAddress: '1층', deliveryMemo: null };
const checkout = (sv: Server) => ({ orderId: 'o1', orderNumber: 'SD-1', version: 2, state: sv.state, delivery: null, productId: 'p1', sellerId: 's1', productName: '울 니트', brandOrStore: '스토어', items: [{ optionId: 'opt1', label: '기본', quantity: 1 }], address, unitPrice: 18000, shippingFee: 3000, totalAmount: 21000, dispatchBusinessDays: 2, expiresAt: iso(Date.now() + 300_000), serverTime: iso(Date.now()), paymentAttemptId: null, confirmedAt: sv.state === 'CONFIRMED' ? iso(Date.now()) : null, carrier: null, trackingNumber: null, failureCode: null, termsVersion: 'v1', tossOrderId: null });
/** 가짜 토스 결제창: requestPayment에서 successUrl(또는 취소면 failUrl)로 토스처럼 쿼리를 붙여 이동한다 */
const fakeToss = (mode: 'success' | 'cancel') => `window.TossPayments = function () { return { payment: function () { return { requestPayment: function (o) {
  var at = function (u, q) { var i = u.indexOf('#'); return i < 0 ? u + '?' + q : u.slice(0, i) + '?' + q + u.slice(i); };
  location.href = ${mode === 'success' ? "at(o.successUrl, 'paymentKey=pk_test_1&orderId=' + o.orderId + '&amount=' + o.amount.value)" : "at(o.failUrl, 'code=PAY_PROCESS_CANCELED&message=cancel&orderId=' + o.orderId)"};
  return new Promise(function () {}); } }; } }; }; window.TossPayments.ANONYMOUS = 'ANONYMOUS';`;

async function serve(page: Page, sv: Server, toss: 'success' | 'cancel' = 'success') {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route('https://js.tosspayments.com/**', route => route.fulfill({ contentType: 'application/javascript', body: fakeToss(toss) }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'buyer-1', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'buyer-1', name: '구매자', roles: ['BUYER'] };
    else if (path.endsWith('/accounts/me/addresses')) data = [{ addressId: 'a1', label: '집', ...address, defaultAddress: true, createdAt: iso(0), updatedAt: iso(0) }];
    else if (path.endsWith('/orders/checkout-terms')) data = { version: 'v1', title: '결제 약관', content: '약관', effectiveAt: iso(0), contentSha256: 'x' };
    else if (path.endsWith('/payments/client-configuration')) data = { clientKey: 'test_ck_fake' };
    else if (path.endsWith('/orders/o1/payment-attempts') && method === 'POST') { sv.attempts++; sv.state = 'CONFIRMED'; data = { ...checkout(sv), state: 'APPROVING_PAYMENT' }; }
    else if (path.endsWith('/orders/o1/checkout') || path.endsWith('/orders/o1/shipping-address')) data = checkout(sv);
    else if (path.endsWith('/products/p1')) data = detail();
    else if (path.endsWith('/v1/products')) data = { items: sv.list.map(id => summary(id, id === 'p-new' ? '새 상품' : '예전 상품')), page: 0, size: 100, totalPages: 1, totalElements: sv.list.length, serverTime: iso(Date.now()) };
    else if (path.endsWith('/categories')) data = [];
    await route.fulfill({ json: { success: true, data } });
  });
}
async function login(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
/** 홈 화면 앱(standalone)처럼 보이게 하고, 시스템 브라우저로 여는 주소를 기록한다 */
const asHomeScreenApp = (page: Page) => page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); (window as any).__opened = []; window.open = ((u: string) => { (window as any).__opened.push(u); return null; }) as typeof window.open; });
async function payInApp(page: Page) {
  await expect(page.getByRole('heading', { name: '주문 / 결제' })).toBeVisible();
  await page.getByRole('checkbox', { name: /결제에 동의합니다/ }).check();
  await page.getByRole('button', { name: /안에 결제하기$/ }).click();
}
/** 시스템 브라우저: 앱과 쿠키, 저장소가 따로인 새 컨텍스트 */
async function systemBrowser(browser: Browser, sv: Server, toss: 'success' | 'cancel') {
  const ctx = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL, viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage(); await serve(page, sv, toss); return page;
}

test('홈은 서버 최신순(NEWEST) 순서로, 예전에 받아 둔 상품보다 새로 올라온 상품이 먼저', async ({ page }) => {
  const sv: Server = { state: 'HELD', attempts: 0, list: ['p-old'] };
  await serve(page, sv); await login(page, '/'); await expect(page.getByText('예전 상품')).toBeVisible();
  // 새로고침 없이(앱 안 이동) 홈에 다시 오면 저장소에는 예전 상품이 먼저 들어 있다
  sv.list = ['p-new', 'p-old']; await page.goto('/#/orders'); await page.goto('/#/');
  await expect(page.getByText('새 상품', { exact: true })).toBeVisible();
  const ids = await page.getByTestId('home-products').locator('a[href^="#/product/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))]);
  expect(ids).toEqual(['#/product/p-new', '#/product/p-old']);
});

test('홈 화면 앱은 토스 결제를 시스템 브라우저로 열고, 브라우저에서 로그인과 승인 뒤 앱으로 돌아오면 주문 완료를 보여 준다', async ({ page, browser }) => {
  const sv: Server = { state: 'HELD', attempts: 0, list: [] };
  await asHomeScreenApp(page); await serve(page, sv);
  await login(page, '/checkout/o1'); await payInApp(page);
  // 앱 안에서 토스를 열지 않고 브라우저 열기 버튼을 보여 준다(누르는 순간 연다)
  const panel = page.getByRole('region', { name: '브라우저 결제 안내' });
  await expect(panel).toContainText('Safari나 Chrome에서 결제해 주세요');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await panel.getByRole('button', { name: /브라우저에서 결제하기/ }).click();
  const opened = await page.evaluate(() => (window as any).__opened as string[]);
  expect(opened).toHaveLength(1); expect(opened[0]).toMatch(/\/\?payStart=o1$/);
  await expect(panel.getByRole('button', { name: '브라우저 다시 열기' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/checkout/o1'); // 앱은 그대로

  // 시스템 브라우저: 앱 로그인이 없어 로그인 → 결제창 → 성공 → 승인 → 앱으로 돌아가라는 안내
  const web = await systemBrowser(browser, sv, 'success');
  await web.goto(opened[0]);
  await expect(web.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  await web.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com'); await web.getByLabel('비밀번호', { exact: true }).fill('password'); await web.getByRole('button', { name: '로그인', exact: true }).click();
  const done = web.getByRole('status', { name: '앱으로 돌아가기 안내' });
  await expect(done).toContainText('결제가 완료됐어요');
  expect(sv.attempts).toBe(1);
  await web.reload(); await web.waitForTimeout(1500);
  expect(sv.attempts).toBe(1); // 새로고침해도 승인을 다시 보내지 않는다
  await web.context().close();

  // 앱으로 돌아오면(visibilitychange) 주문 상태를 다시 조회해 결제 완료로
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page).toHaveURL(/#\/orders\/o1(\?|$)/);
});

test('브라우저에서 결제를 취소하고 앱으로 돌아오면 같은 주문으로 다시 열거나 결과를 확인할 수 있다', async ({ page, browser }) => {
  const sv: Server = { state: 'HELD', attempts: 0, list: [] };
  await asHomeScreenApp(page); await serve(page, sv);
  await login(page, '/checkout/o1'); await payInApp(page);
  const panel = page.getByRole('region', { name: '브라우저 결제 안내' });
  await panel.getByRole('button', { name: /브라우저에서 결제하기/ }).click();
  const url = (await page.evaluate(() => (window as any).__opened as string[]))[0];
  const web = await systemBrowser(browser, sv, 'cancel');
  await login(web, `/payments/toss/start?order=o1`); await web.goto(url);
  await expect(web.getByRole('status', { name: '앱으로 돌아가기 안내' })).toContainText('결제를 취소했어요');
  expect(sv.attempts).toBe(0); await web.context().close();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(panel.getByRole('button', { name: '브라우저 다시 열기' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '결제 결과 확인' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/checkout/o1');
});

test('일반 브라우저는 지금처럼 같은 탭에서 토스 결제창을 열고 돌아와 결제 완료로 간다', async ({ page }) => {
  const sv: Server = { state: 'HELD', attempts: 0, list: [] };
  await page.addInitScript(() => { (window as any).__opened = []; window.open = ((u: string) => { (window as any).__opened.push(u); return null; }) as typeof window.open; });
  await serve(page, sv);
  await login(page, '/checkout/o1'); await payInApp(page);
  await expect(page).toHaveURL(/#\/orders\/o1(\?|$)/);
  expect(sv.attempts).toBe(1);
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([]);
});
