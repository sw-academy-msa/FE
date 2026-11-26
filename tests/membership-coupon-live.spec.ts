import { expect, test, type Page } from '@playwright/test';

/*
 * 회원제·쿠폰 화면 HTTP 픽스처 E2E(실제 API 모드 개발 서버, VITE_FEATURE_MEMBERSHIP_COUPON=true).
 * 응답 모양은 백엔드 main 소스와 같게 맞췄다:
 *  - AccountService MembershipResponse, MembershipCancellationResponse
 *  - PaymentService MembershipResponse(/me), MembershipConfigurationResponse
 *  - CouponService IssueResponse, ApplicableCouponResponse, PublicCampaignResponse(CampaignResponse, DefinitionResponse)
 *  - OrderCommandService CheckoutResponse(쿠폰, 멤버십 금액 필드), OrderRequests.Create(couponIssueId)
 *  - OrderQueryService OrderResponses.Detail, AIService BehaviorRequest(events 1~20)
 * 운영 서버는 호출하지 않는다.
 */
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
const ACC = '6f1d2c3b-4a59-4e8f-9a0b-1c2d3e4f5a6b';
const P1 = '0b9e4b1a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const C1 = '11111111-2222-4333-8444-555555555555', C2 = '21111111-2222-4333-8444-555555555555', C3 = '31111111-2222-4333-8444-555555555555';
const ORDER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const address = { recipientName: '홍길동', recipientPhone: '01012345678', postalCode: '06236', roadAddress: '서울 강남구 테헤란로 1', detailAddress: '1층', deliveryMemo: null };
const items = [{ optionId: 'opt1', label: '오프화이트 / M', quantity: 1 }];
const coupon = (issueId: string, o: Record<string, unknown> = {}) => ({ issueId, name: '회원 전용 쿠폰', discountType: 'AMOUNT', amount: 3000, rateBps: null, maxDiscount: null, minItemsAmount: 10000, scope: 'ALL', productId: null, validUntil: iso(Date.now() + 2 * 86_400_000), status: 'ISSUED', ...o });
const detail = (o: Record<string, unknown> = {}) => ({ id: P1, name: '코튼 데일리 셔츠', brandOrStore: '아틀리에 노트', category: '셔츠', price: 50000, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 1, availableQuantity: 9, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) }, images: [], sellerId: 'seller-x', description: '새 상품', sourceUrl: 'https://shop.example.com/1', shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 3, shippingNotice: null, purchaseNotice: null, disposalReason: null, attributes: [], dimensions: [], options: [{ id: 'opt1', label: '오프화이트 / M', selections: {}, availableQuantity: 9 }], faqs: [], canAttemptPurchase: true, serverTime: iso(Date.now()), ...o });
const membership = (o: Record<string, unknown> = {}) => ({ state: 'ACTIVE', active: true, entitlementUntil: '2026-12-25T15:00:00Z', periodEnd: '2026-12-25T15:00:00Z', autoRenew: true, amount: 4900, currency: 'KRW', sourceVersion: 3, cancelRequested: false, updatedAt: iso(Date.now()), ...o });
const NONE = { state: 'NONE', active: false, entitlementUntil: null, periodEnd: null, autoRenew: false, amount: 0, currency: 'KRW', sourceVersion: 0, cancelRequested: false, updatedAt: null };
const BILLING_NONE = { subscriptionId: null, state: 'NONE', autoRenew: false, periodStart: null, periodEnd: null, entitlementUntil: null, nextChargeAt: null, amount: 0, currency: 'KRW', version: 0, billingRegistrationRequired: true };
const CONFIG = { clientKey: 'test_ck_x', planVersion: 'monthly-v1', amount: 4900, currency: 'KRW', termsVersion: 'recurring-v1', successUrl: 'https://stockdrop-app.vercel.app/membership/billing/success', failUrl: 'https://stockdrop-app.vercel.app/membership/billing/fail' };
const checkout = (o: Record<string, unknown> = {}) => ({ orderId: ORDER, orderNumber: 'SD-' + ORDER, version: 2, state: 'HELD', delivery: null, productId: P1, sellerId: 'seller-x', productName: '코튼 데일리 셔츠', brandOrStore: '아틀리에 노트', items, address, unitPrice: 50000, shippingFee: 3000, originalShippingFee: 3000, membershipShippingDiscount: 3000, effectiveShippingFee: 0, totalAmount: 47000, itemsAmount: 50000, couponIssueId: C1, couponState: 'LOCKED', couponRejectCode: null, couponDiscount: 3000, dispatchBusinessDays: 2, expiresAt: iso(Date.now() + 300_000), serverTime: iso(Date.now()), paymentAttemptId: null, confirmedAt: null, carrier: null, trackingNumber: null, purchaseConfirmedAt: null, failureCode: null, termsVersion: 'v1', ...o });

interface Server { membership: unknown; billing: unknown; consent: boolean; mine: Record<string, unknown[]>; applicable: unknown[]; checkout: Record<string, unknown>; orderDetail?: Record<string, unknown>; aiEvents: { name: string; productId?: string; couponIssueId?: string; promotionId?: string; clientEventId: string }[]; created: Record<string, unknown>[]; claims: number; cancels: number; refreshes: number; alerts: string[]; product?: Record<string, unknown> }
const server = (o: Partial<Server> = {}): Server => ({ membership: membership(), billing: null, consent: true, mine: { AVAILABLE: [coupon(C1), coupon(C2, { name: '첫 구매 쿠폰', amount: 1000, validUntil: iso(Date.now() + 30 * 86_400_000) }), coupon(C3, { name: '가을 쿠폰', amount: 5000, status: 'LOCKED' })], USED: [coupon('u1', { status: 'USED' })], EXPIRED: [] }, applicable: [{ coupon: coupon(C1), estimatedDiscount: 3000 }, { coupon: coupon(C2, { name: '첫 구매 쿠폰', amount: 1000 }), estimatedDiscount: 1000 }], checkout: checkout(), aiEvents: [], created: [], claims: 0, cancels: 0, refreshes: 0, alerts: [], ...o });

async function serve(page: Page, sv: Server) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    const body = () => route.request().postDataJSON() as Record<string, unknown>;
    let data: unknown = {}, status = 200;
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) { if (path.endsWith('/refresh')) sv.refreshes++; data = { accessToken: 'test-token', accountId: ACC, roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' }; }
    else if (path.endsWith('/accounts/me')) data = { id: ACC, name: '김민지', roles: ['BUYER'] };
    else if (path.endsWith('/ai/analytics/identity')) { if (!sv.consent) { await route.fulfill({ status: 404, json: { code: 'PERSONALIZATION_NOT_FOUND', message: '없음' } }); return; } data = { analyticsId: '7a7a7a7a-1b1b-4c4c-8d8d-9e9e9e9e9e9e', consentedAt: iso(0) }; }
    else if (path.endsWith('/ai/events') && method === 'POST') { sv.aiEvents.push(...(body().events as Server['aiEvents'])); status = 202; data = null; }
    else if (path.endsWith('/accounts/me/membership/cancellation') && method === 'POST') { sv.cancels++; sv.membership = membership({ cancelRequested: true }); status = 202; data = { commandId: 'c0c0c0c0-1111-4222-8333-444444444444', status: 'ACCEPTED', refreshRequired: true }; }
    else if (path.endsWith('/accounts/me/membership')) data = sv.membership;
    else if (path.endsWith('/payments/memberships/me')) data = sv.billing ?? BILLING_NONE;
    else if (path.endsWith('/payments/memberships/configuration')) data = CONFIG;
    else if (path.endsWith('/coupons/me/applicable')) data = Number(url.searchParams.get('itemsAmount')) >= 10000 ? sv.applicable : [];
    else if (path.endsWith('/coupons/me')) data = sv.mine[url.searchParams.get('status') ?? 'AVAILABLE'] ?? [];
    else if (path.endsWith('/coupons/campaigns/WELCOME_1000/claims') && method === 'POST') { sv.claims++; status = 201; data = coupon('41111111-2222-4333-8444-555555555555', { name: '웰컴 쿠폰', amount: 1000, minItemsAmount: 0 }); }
    else if (path.endsWith('/coupons/campaigns/WELCOME_1000')) data = { campaign: { id: 'c-1', code: 'WELCOME_1000', kind: 'CLAIM', totalBudget: 200, issuedCount: 80, status: 'ACTIVE', startsAt: iso(Date.now() - 86_400_000), endsAt: iso(Date.now() + 86_400_000), demo: false }, definition: { id: 'd-1', name: '웰컴 쿠폰', discountType: 'AMOUNT', amount: 1000, rateBps: null, maxDiscount: null, minItemsAmount: 0, scope: 'ALL', status: 'ACTIVE', version: 1 }, remaining: 120, claimed: sv.claims > 0 };
    else if (path.endsWith('/accounts/me/addresses')) data = [{ addressId: 'a1', label: '집', ...address, defaultAddress: true, createdAt: iso(0), updatedAt: iso(0) }];
    else if (path.endsWith('/notifications/product-alerts') && method === 'GET') data = sv.alerts.map(productId => ({ productId, subscribed: true, createdAt: iso(0) }));
    else if (path.includes('/notifications/product-alerts/') && method === 'PUT') { const id = path.split('/').pop()!; sv.alerts.push(id); data = { productId: id, subscribed: true, createdAt: iso(0) }; }
    else if (path.endsWith('/notifications/unread-count')) data = { count: 0 };
    else if (path.endsWith('/orders/checkout-terms')) data = { version: 'v1', title: '결제 약관', content: '약관', effectiveAt: iso(0), contentSha256: 'x' };
    else if (path.endsWith('/v1/orders') && method === 'POST') { sv.created.push(body()); status = 202; data = sv.checkout; }
    else if (path.endsWith(`/orders/${ORDER}/checkout`)) data = sv.checkout;
    else if (path.endsWith(`/v1/orders/${ORDER}`)) data = sv.orderDetail ?? {};
    else if (path.endsWith(`/v1/products/${P1}`)) data = detail(sv.product);
    else if (path.endsWith('/v1/products')) data = { items: [{ ...detail(), image: null }], page: 0, size: 100, totalPages: 1, totalElements: 1, serverTime: iso(Date.now()) };
    else if (path.endsWith('/category-catalog') || path.endsWith('/categories')) data = [];
    await route.fulfill({ status, json: { success: true, code: 'COMMON_SUCCESS', data } });
  });
}
async function login(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password1!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

test('마이페이지: 이용 중 멤버십 카드, 내 쿠폰(탭 3개, 사용 중 비활성), 관리 시트 해지', async ({ page }) => {
  const sv = server(); await serve(page, sv); await login(page, '/my');
  const card = page.getByRole('region', { name: 'STOCKDROP 멤버십' });
  await expect(card.getByRole('heading', { name: '멤버십 이용 중' })).toBeVisible();
  await expect(card.getByText('12월 26일 · 4,900원')).toBeVisible();
  // 기존 순서: 주문·배송 조회 → (새) 멤버십 → 내 쿠폰 → 회원 권한
  const order = await page.evaluate(() => ['주문 · 배송 조회', 'STOCKDROP 멤버십', '내 쿠폰', '회원 권한'].map(t => [...document.querySelectorAll('main *')].findIndex(e => e.children.length === 0 && e.textContent?.trim() === t)));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await expect(page.getByRole('button', { name: /내 쿠폰 2장 · 곧 만료 1장/ })).toBeVisible(); await noOverflow(page);
  await page.getByRole('button', { name: /내 쿠폰/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('3,000원 할인')).toBeVisible(); await expect(sheet.getByText('사용 중')).toBeVisible(); await expect(sheet.getByText(/일 후 만료|오늘 만료/)).toBeVisible();
  await sheet.getByRole('button', { name: '사용 완료', exact: true }).click(); await expect(sheet.getByText('회원 전용 쿠폰 · 3,000원 할인')).toBeVisible();
  await sheet.getByRole('button', { name: '만료', exact: true }).click(); await expect(sheet.getByText('만료된 쿠폰이 없어요')).toBeVisible();
  await sheet.getByRole('button', { name: '닫기' }).last().click(); await expect(sheet).toHaveCount(0);
  await card.getByRole('button', { name: '멤버십 관리' }).click();
  const manage = page.getByRole('dialog');
  await expect(manage.getByText('2026.12.26까지')).toBeVisible();
  await manage.getByRole('button', { name: '정기결제 해지하기' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '해지하기' }).click();
  await expect.poll(() => sv.cancels).toBe(1); await expect.poll(() => sv.refreshes).toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'STOCKDROP 멤버십' }).getByText('해지 예약')).toBeVisible();
});

test('마이페이지: 비회원 큰 카드와 가입 시트(서버 요금, 약관 버전 본문, 동의 전 비활성, 카드 등록은 연결 전)', async ({ page }) => {
  const sv = server({ membership: NONE }); await serve(page, sv); await login(page, '/my');
  const card = page.getByRole('region', { name: 'STOCKDROP 멤버십' });
  await expect(card.getByText('월 4,900원으로')).toBeVisible(); await expect(card.getByText('매달 3,000원 쿠폰')).toBeVisible();
  await card.getByRole('button', { name: '혜택 확인하고 가입하기' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('월 4,900원')).toBeVisible();
  const go = sheet.getByRole('button', { name: '동의하고 카드 등록하기' });
  await expect(go).toBeDisabled();
  await sheet.getByRole('checkbox').check(); await expect(go).toBeDisabled(); // 카드 등록 귀환 처리 계약 전에는 비활성
  await sheet.getByText('이용약관 · 요금 및 해지 안내 보기').click(); await expect(sheet.getByText(/해지는 마이페이지의 멤버십 관리에서/)).toBeVisible();
  await noOverflow(page);
});

test('마이페이지: 결제 실패 유예와 가입 확인 중 상태', async ({ page }) => {
  const sv = server({ membership: membership({ state: 'GRACE', entitlementUntil: '2026-12-28T15:00:00Z' }) }); await serve(page, sv); await login(page, '/my');
  const card = page.getByRole('region', { name: 'STOCKDROP 멤버십' });
  await expect(card.getByText('결제에 실패했어요')).toBeVisible(); await expect(card.getByText('유예 중')).toBeVisible(); await expect(card.getByText('2026.12.29까지')).toBeVisible();
  await expect(card.getByRole('button', { name: '카드 다시 등록하기' })).toHaveCount(0);
  sv.membership = NONE; sv.billing = { ...BILLING_NONE, subscriptionId: 's1', state: 'PENDING', billingRegistrationRequired: false };
  await page.reload(); await expect(page.getByRole('region', { name: 'STOCKDROP 멤버십' }).getByText('가입을 확인하고 있어요')).toBeVisible();
});

test('알림 딥링크: 쿠폰은 내 쿠폰 시트, 회원제는 멤버십 관리 시트', async ({ page }) => {
  const sv = server(); await serve(page, sv); await login(page, '/my?coupons=available');
  await expect(page.getByRole('dialog').getByText('내 쿠폰')).toBeVisible();
  await page.goto('/#/my?membership=manage'); await expect(page.getByRole('dialog').getByText('멤버십 관리')).toBeVisible();
  await expect(page).toHaveURL(/#\/my$/);
});

test('상품 상세: 회원 배송비 무료, 쓸 수 있는 쿠폰, ?campaign=CODE 쿠폰 받기와 이벤트', async ({ page }) => {
  const sv = server(); await serve(page, sv); await login(page, `/product/${P1}?campaign=WELCOME_1000`);
  const benefits = page.getByLabel('구매 혜택');
  await expect(benefits.getByText('멤버십 회원이라 이 상품 배송비 무료')).toBeVisible();
  await expect(benefits.getByText('쓸 수 있는 쿠폰 2장 · 최대 3,000원 할인')).toBeVisible();
  const claim = page.getByLabel('쿠폰 받기'); await expect(claim.getByText('웰컴 쿠폰 1,000원 할인 · 남은 수량 120장')).toBeVisible();
  await claim.getByRole('button', { name: '받기' }).click(); await expect.poll(() => sv.claims).toBe(1); await expect(claim.getByText('받음')).toBeVisible();
  await expect.poll(() => sv.aiEvents.map(e => e.name)).toEqual(expect.arrayContaining(['view_promotion', 'select_promotion', 'coupon_claim']));
  expect(sv.aiEvents.find(e => e.name === 'coupon_claim')?.promotionId).toBe('WELCOME_1000');
  await noOverflow(page);
});

test('옵션 시트 쿠폰 선택 → 주문 생성 요청 couponIssueId → 결제 화면 서버 금액 요약', async ({ page }) => {
  const sv = server(); await serve(page, sv); await login(page, `/product/${P1}`);
  await page.getByRole('button', { name: /선착순 구매하기/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: '오프화이트 / M 수량 추가' }).click();
  await sheet.getByRole('button', { name: '쿠폰 선택' }).click();
  await expect(sheet.getByRole('heading', { name: '쿠폰 선택' })).toBeVisible();
  await sheet.getByRole('radio', { name: /회원 전용 쿠폰 · 3,000원 할인/ }).click();
  await sheet.getByRole('button', { name: '이 쿠폰 사용하기' }).click();
  await expect(sheet.getByText('예상 쿠폰 할인')).toBeVisible(); await expect(sheet.getByText('멤버십 배송 할인')).toBeVisible();
  await expect(sheet.getByText('47,000원')).toBeVisible(); await noOverflow(page);
  await sheet.getByRole('button', { name: '구매하기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`checkout/${ORDER}`));
  expect(sv.created[0]).toMatchObject({ productId: P1, couponIssueId: C1, addressId: 'a1', items: [{ optionId: 'opt1', quantity: 1 }] });
  for (const [label, value] of [['상품금액', '50,000원'], ['쿠폰 할인', '−3,000원'], ['기본 배송비', '3,000원'], ['멤버십 배송 할인', '−3,000원'], ['실제 배송비', '0원'], ['최종 결제금액', '47,000원']]) await expect(page.locator('div.flex', { has: page.getByText(label, { exact: true }) }).getByText(value, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('적용 쿠폰')).toBeVisible(); await expect(page.locator('div.divider', { has: page.getByText('적용 쿠폰') }).getByText('3,000원 할인', { exact: true })).toBeVisible();
  await expect.poll(() => sv.aiEvents.map(e => e.name)).toContain('coupon_use');
  expect(sv.aiEvents.some(e => e.name === 'begin_checkout')).toBe(false); // AI는 서버가 기록
  await noOverflow(page);
});

test('결제 화면: 할인이 없으면 기존 세 줄 그대로(서버 금액), 쿠폰 거절 안내', async ({ page }) => {
  const sv = server({ checkout: checkout({ couponIssueId: null, couponState: 'NONE', couponDiscount: 0, membershipShippingDiscount: 0, effectiveShippingFee: 3000, totalAmount: 53000 }) }); await serve(page, sv); await login(page, `/checkout/${ORDER}`);
  await expect(page.getByText('고정 배송비', { exact: true })).toBeVisible(); await expect(page.getByText('53,000원')).toBeVisible();
  await expect(page.getByText('쿠폰 할인', { exact: true })).toHaveCount(0); await expect(page.getByText('적용 쿠폰')).toHaveCount(0);
  sv.checkout = checkout({ couponState: 'REJECTED', couponRejectCode: 'COUPON_MIN_AMOUNT', couponDiscount: 0, membershipShippingDiscount: 0, effectiveShippingFee: 3000, totalAmount: 53000 });
  await page.reload(); await expect(page.getByText('적용 안 됨')).toBeVisible(); await expect(page.getByText(/최소 주문 금액을 채우지 못했어요/)).toBeVisible();
});

test('주문 상세: 쿠폰 할인과 멤버십 배송 할인 요약', async ({ page }) => {
  const sv = server({ orderDetail: { orderId: ORDER, orderNumber: 'SD-1', productId: P1, productName: '코튼 데일리 셔츠', brandOrStore: '아틀리에 노트', items, state: 'CONFIRMED', delivery: 'PREPARING', address, unitPrice: 50000, shippingFee: 3000, originalShippingFee: 3000, membershipShippingDiscount: 3000, effectiveShippingFee: 0, itemsAmount: 50000, couponIssueId: C1, couponDiscount: 3000, couponState: 'LOCKED', totalAmount: 47000, dispatchBusinessDays: 2, expiresAt: null, createdAt: iso(Date.now()), confirmedAt: iso(Date.now()), carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null, purchaseConfirmedAt: null, sourceVersion: 3, sourceOccurredAt: iso(0), projectedAt: iso(0) } });
  await serve(page, sv); await login(page, `/orders/${ORDER}`);
  for (const t of ['쿠폰 할인', '기본 배송비', '멤버십 배송 할인', '실제 배송비']) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByText('47,000원')).toBeVisible(); await noOverflow(page);
});

test('홈 검색, 목록 노출, 상품 선택 이벤트(search, view_item_list, select_item)', async ({ page }) => {
  const sv = server(); await serve(page, sv);
  await page.route(/\/v1\/products\/0b9e/, route => route.fallback());
  await login(page, '/');
  await page.getByRole('textbox', { name: '상품 검색' }).fill('셔츠');
  await expect.poll(() => sv.aiEvents.map(e => e.name)).toEqual(expect.arrayContaining(['search', 'view_item_list']));
  await page.getByRole('link', { name: /코튼 데일리 셔츠/ }).first().click();
  await expect.poll(() => sv.aiEvents.map(e => e.name)).toContain('select_item');
  expect(sv.aiEvents.find(e => e.name === 'select_item')?.productId).toBe(P1);
  // 이벤트 ID는 모두 다르다(재전송만 같은 ID)
  expect(new Set(sv.aiEvents.map(e => e.clientEventId)).size).toBe(sv.aiEvents.length);
});

test('상품 알림 신청 성공 때 add_to_wishlist를 GA와 AI로 보낸다', async ({ page }) => {
  const sv = server({ product: { status: 'UPCOMING', startsAt: iso(Date.now() + 3_600_000), endsAt: iso(Date.now() + 14_400_000) } }); await serve(page, sv); await login(page, `/product/${P1}`);
  await page.getByRole('button', { name: /상품 알림 받기/ }).click();
  await expect.poll(() => sv.alerts).toEqual([P1]);
  await expect.poll(() => sv.aiEvents.filter(e => e.name === 'add_to_wishlist').map(e => e.productId)).toEqual([P1]);
});

test('분석 동의가 없으면 AI 이벤트를 보내지 않는다', async ({ page }) => {
  const sv = server({ consent: false }); await serve(page, sv); await login(page, `/product/${P1}?campaign=WELCOME_1000`);
  await page.getByLabel('쿠폰 받기').getByRole('button', { name: '받기' }).click(); await expect.poll(() => sv.claims).toBe(1);
  await page.waitForTimeout(2500); expect(sv.aiEvents).toHaveLength(0);
});
