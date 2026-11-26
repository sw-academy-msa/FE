import { expect, test, type Page } from '@playwright/test';

/*
 * 운영자 쿠폰 관리(시안 20, 20-1) HTTP 픽스처 E2E. 실제 API 모드 개발 서버(VITE_USE_MOCK=false, VITE_FEATURE_MEMBERSHIP_COUPON=true).
 * 응답 모양은 CouponService main 소스와 같다: DefinitionResponse, CampaignResponse, CampaignStatsResponse, ErrorResponse(code, message, traceId, violations).
 * 운영 서버는 호출하지 않는다. ADMIN_COUPON_FLAG_OFF=true로 띄운 플래그 끔 서버에서는 메뉴가 없는지만 본다.
 */
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
test.use({ viewport: { width: 402, height: 874 } });
const FLAG_OFF = process.env.ADMIN_COUPON_FLAG_OFF === 'true';
const SHOTS = process.env.ADMIN_COUPON_SHOTS;

const NOW = '2026-11-26T05:00:00Z';
const def = (o: Record<string, unknown> = {}) => ({ id: 'd0000000-0000-4000-8000-000000000001', name: '회원 전용 3,000원', discountType: 'AMOUNT', amount: 3000, rateBps: null, maxDiscount: null, minItemsAmount: 10000, scope: 'ALL', status: 'ACTIVE', version: 1, ...o });
const camp = (o: Record<string, unknown> = {}) => ({ id: 'c0000000-0000-4000-8000-000000000001', code: 'MEMBER_2611', kind: 'MEMBER', totalBudget: 1000, issuedCount: 312, status: 'ACTIVE', startsAt: '2026-10-31T15:00:00Z', endsAt: '2026-11-30T14:59:00Z', demo: false, ...o });
interface Server { products?: Record<string, unknown>[]; defs: Record<string, unknown>[]; campaigns: Record<string, unknown>[]; posts: { path: string; body: unknown }[]; fail?: { path: RegExp; status: number; body: Record<string, unknown> }[] }
const server = (): Server => ({
  defs: [def(), def({ id: 'd0000000-0000-4000-8000-000000000002', name: '맞춤 10%', discountType: 'RATE', amount: null, rateBps: 1000, maxDiscount: 3000, scope: 'PRODUCT' }), def({ id: 'd0000000-0000-4000-8000-000000000003', name: '예전 웰컴', amount: 1000, minItemsAmount: 0, status: 'RETIRED' })],
  campaigns: [camp(), camp({ id: 'c0000000-0000-4000-8000-000000000002', code: 'SALE_OPEN_10', kind: 'TARGETED', totalBudget: 500, issuedCount: 48, status: 'PAUSED', startsAt: '2026-11-19T15:00:00Z', endsAt: '2026-12-31T14:59:00Z' }), camp({ id: 'c0000000-0000-4000-8000-000000000003', code: 'WELCOME_1000', kind: 'CLAIM', totalBudget: 300, issuedCount: 0, status: 'DRAFT', startsAt: '2026-11-19T15:00:00Z', endsAt: '2026-12-31T14:59:00Z' })],
  posts: [],
});

async function serve(page: Page, sv: Server) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    const body = () => route.request().postDataJSON() as Record<string, unknown>;
    if (method === 'POST' && path.includes('/admin/coupons/')) {
      sv.posts.push({ path, body: route.request().postData() ? body() : null });
      const f = sv.fail?.find(x => x.path.test(path));
      if (f) { sv.fail = sv.fail!.filter(x => x !== f); await route.fulfill({ status: f.status, json: { traceId: 't-1', violations: [], ...f.body } }); return; }
    }
    let data: unknown = {}, status = 200;
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'admin-1', roles: ['BUYER', 'ADMIN'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { accountId: 'admin-1', id: 'admin-1', name: '운영자', email: 'ops@example.com', roles: ['ADMIN'], interestCategories: [] };
    else if (path.endsWith('/admin/seller-applications')) data = { content: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    else if (path.includes('/admin/product-reviews')) data = path.endsWith('/images') || path.endsWith('/revisions') ? [] : { items: sv.products ?? [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    else if (path.endsWith('/admin/coupons/definitions') && method === 'GET') data = sv.defs;
    else if (path.endsWith('/admin/coupons/definitions') && method === 'POST') { const b = body(); data = { id: 'd-new', status: 'ACTIVE', version: 1, ...b, minItemsAmount: b.minItemsAmount ?? 0 }; sv.defs.push(data as Record<string, unknown>); status = 201; }
    else if (/\/admin\/coupons\/definitions\/[^/]+\/retire$/.test(path)) { const id = path.split('/').at(-2); const d = sv.defs.find(x => x.id === id)!; d.status = 'RETIRED'; data = d; }
    else if (path.endsWith('/admin/coupons/campaigns') && method === 'GET') data = sv.campaigns;
    else if (path.endsWith('/admin/coupons/campaigns') && method === 'POST') { const b = body(); data = { id: 'c-new-' + sv.campaigns.length, code: b.code, kind: b.kind, totalBudget: b.totalBudget, issuedCount: 0, status: 'DRAFT', startsAt: b.startsAt, endsAt: b.endsAt, demo: b.demo, productId: b.productId }; sv.campaigns.push(data as Record<string, unknown>); status = 201; }
    else if (/\/admin\/coupons\/campaigns\/[^/]+\/(activate|pause)$/.test(path)) { const parts = path.split('/'), id = parts.at(-2), c = sv.campaigns.find(x => x.id === id)!; c.status = parts.at(-1) === 'activate' ? 'ACTIVE' : 'PAUSED'; data = c; }
    else if (/\/admin\/coupons\/campaigns\/[^/]+\/stats$/.test(path)) data = { issued: 312, used: 128, released: 6, expired: 4, discountTotal: 384000 };
    else if (path.endsWith('/notifications/unread-count')) data = { count: 0 };
    else if (path.endsWith('/category-catalog') || path.endsWith('/categories')) data = [];
    await route.fulfill({ status, json: { success: true, code: 'COMMON_SUCCESS', data } });
  });
}
async function login(page: Page) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('/#/login?next=%2Fadmin');
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('ops@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password1!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영자 마이페이지' })).toBeVisible();
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
const shot = async (page: Page, name: string, fullPage = true) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }); };
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });

test('상품을 검색해 고른 캠페인은 PRODUCT 정의와 링크만 제공하고 선택 해제가 가능하다', async ({ page, context }) => {
  test.skip(FLAG_OFF, '플래그 켬 서버 전용');
  const sv = server();
  sv.products = [{ id: '10000000-0000-4000-8000-000000000001', name: '광고용 셔츠', sellerId: 'seller-1', status: 'APPROVED', startsAt: '2026-11-25T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', totalQuantity: 10, soldQuantity: 1, version: 1 }, { id: 'ended', name: '종료 상품', status: 'APPROVED', endsAt: '2026-11-01T00:00:00Z' }, { id: 'sold', name: '품절 상품', status: 'APPROVED', endsAt: '2026-12-01T00:00:00Z', totalQuantity: 1, soldQuantity: 1 }];
  await serve(page, sv); await login(page);
  await page.getByRole('button', { name: '쿠폰 관리' }).click();
  await page.getByRole('button', { name: '캠페인 만들기' }).click();
  const form = sheet(page, '캠페인 만들기');
  await form.getByRole('button', { name: '상품 고르기' }).click();
  await sheet(page, '적용 상품 고르기').getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: '상품 고르기' }).click();
  const picker = sheet(page, '적용 상품 고르기');
  await expect(picker.getByText('종료 상품')).toHaveCount(0);
  await expect(picker.getByText('품절 상품')).toHaveCount(0);
  await picker.getByRole('textbox', { name: '상품명 검색' }).fill('셔츠');
  await picker.getByRole('button', { name: /광고용 셔츠/ }).click();
  await expect(form.getByRole('radio', { name: /맞춤 10%/ })).toBeVisible();
  await expect(form.getByRole('radio', { name: /회원 전용/ })).toHaveCount(0);
  await form.getByRole('button', { name: '선택 해제' }).click();
  await expect(form.getByRole('radio', { name: /회원 전용/ })).toBeVisible();
  await form.getByRole('button', { name: '상품 고르기' }).click();
  await sheet(page, '적용 상품 고르기').getByRole('button', { name: /광고용 셔츠/ }).click();
  await form.getByRole('radio', { name: /맞춤 10%/ }).click();
  await form.getByRole('textbox', { name: '캠페인 코드' }).fill('PRODUCT_LINK');
  await form.getByRole('textbox', { name: '예산' }).fill('10');
  await form.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: /PRODUCT_LINK/ }).click();
  const link = 'https://stockdrop-app.vercel.app/#/product/10000000-0000-4000-8000-000000000001?campaign=PRODUCT_LINK';
  await expect(page.getByText(link, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '알림 보내기', exact: true })).toHaveCount(0);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '링크 복사' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(sv.posts.find(x => x.path.endsWith('/campaigns'))?.body).toMatchObject({ productId: sv.products[0].id, definitionId: sv.defs[1].id });
  await noOverflow(page);
});

test.describe('플래그 켬', () => {
  test.skip(FLAG_OFF, '플래그 켬 서버 전용');

  test('쿠폰 관리 펼침: 캠페인 목록, 상세, 일시정지 확인 시트, 발급 내역', async ({ page }) => {
    const sv = server(); await serve(page, sv); await login(page);
    // 기존 메뉴 네 줄은 그대로, 그 아래에 쿠폰 관리 한 줄
    const menu = page.locator('main a.divider, main button.divider').filter({ hasText: /입점 심사|판매 심사|판매자 목록|문의 관리|쿠폰 관리/ });
    await expect(menu).toHaveText([/입점 심사/, /판매 심사/, '판매자 목록', '문의 관리', '쿠폰 관리']);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    await expect(page.getByRole('button', { name: '캠페인', pressed: true })).toBeVisible();
    await expect(page.getByText('MEMBER_2611')).toBeVisible();
    await expect(page.getByText('회원 구독(MEMBER) · 11.01–11.30')).toBeVisible();
    await expect(page.getByText('발급 312 / 예산 1,000')).toBeVisible();
    await expect(page.getByText('준비', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /MEMBER_2611/ }).click();
    await expect(page.getByText('2026.11.01 – 2026.11.30')).toBeVisible();
    await noOverflow(page);
    await shot(page, '01-admin-coupons-campaigns');
    await page.getByRole('button', { name: '발급 내역' }).click();
    const stats = sheet(page, '발급 내역');
    await expect(stats.getByText('384,000원')).toBeVisible();
    await expect(stats.getByText('128장')).toBeVisible();
    await shot(page, '02-campaign-stats', false);
    await stats.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(stats).toBeHidden();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    const confirm = sheet(page, '캠페인을 일시정지할까요?');
    await expect(confirm.getByText('이미 받은 쿠폰은 그대로 쓸 수 있어요')).toBeVisible();
    await confirm.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '일시정지했어요.' })).toBeVisible();
    expect(sv.posts.map(p => p.path)).toEqual(['/api/v1/admin/coupons/campaigns/c0000000-0000-4000-8000-000000000001/pause']);
    await expect(page.getByRole('button', { name: '활성화', exact: true })).toBeVisible();
  });

  test('활성화 실패는 토스트로 알리고 상태를 바꾸지 않는다', async ({ page }) => {
    const sv = server(); sv.fail = [{ path: /activate$/, status: 404, body: { code: 'CAMPAIGN_NOT_FOUND', message: '캠페인을 찾을 수 없습니다.' } }];
    await serve(page, sv); await login(page);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    await page.getByRole('button', { name: /WELCOME_1000/ }).click();
    await page.getByRole('button', { name: '활성화', exact: true }).click();
    await sheet(page, '캠페인을 활성화할까요?').getByRole('button', { name: '활성화', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '대상을 찾을 수 없어요' })).toBeVisible();
    await expect(sheet(page, '캠페인을 활성화할까요?')).toBeVisible();
  });

  test('쿠폰 정의 만들기: 기본 예시 3,000원과 1만 원, 칸 오류, 정률 본문, 서버 400 칸 오류, 정의 종료', async ({ page }) => {
    const sv = server(); sv.fail = [{ path: /definitions$/, status: 400, body: { code: 'COMMON_INVALID_REQUEST', message: '요청값이 올바르지 않습니다.', violations: [{ field: 'name', message: '크기가 0에서 60 사이여야 합니다' }] } }];
    await serve(page, sv); await login(page);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    await page.getByRole('button', { name: '쿠폰 정의', exact: true }).click();
    await expect(page.getByText('3,000원 할인 · 1만 원 이상 구매 시 · 전체 상품')).toBeVisible();
    await expect(page.getByText('종료', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '쿠폰 정의 만들기' }).click();
    const s = sheet(page, '쿠폰 정의 만들기');
    await expect(s.getByLabel('할인 금액')).toHaveValue('3,000');
    await expect(s.getByLabel('최소 상품 금액')).toHaveValue('10,000');
    await expect(s.getByLabel('발급 후 사용 기간')).toHaveValue('30');
    await shot(page, '03-definition-sheet', false);
    await s.getByLabel('이름').fill('11월 맞춤 쿠폰');
    await s.getByRole('button', { name: '정률' }).click();
    await s.getByLabel('할인율').fill('10');
    await s.getByLabel('최대 할인').fill('3000');
    await s.getByRole('button', { name: '특정 상품' }).click();
    await s.getByLabel('발급 후 사용 기간').fill('0');
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(s.getByText('1일 이상 입력해 주세요.')).toBeVisible();
    expect(sv.posts).toHaveLength(0);
    await noOverflow(page);
    await shot(page, '03b-definition-sheet-error', false);
    await s.getByLabel('발급 후 사용 기간').fill('7');
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(s.getByText('크기가 0에서 60 사이여야 합니다')).toBeVisible();
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '쿠폰 정의를 만들었어요.' })).toBeVisible();
    expect(sv.posts.at(-1)!.body).toEqual({ name: '11월 맞춤 쿠폰', discountType: 'RATE', amount: null, rateBps: 1000, maxDiscount: 3000, minItemsAmount: 10000, scope: 'PRODUCT', validityMode: 'RELATIVE', validFrom: null, validUntil: null, validMinutes: 10080, noticeLeadMinutes: null });
    await expect(page.getByText('11월 맞춤 쿠폰')).toBeVisible();
    // 정의 종료(확인 시트)
    await page.getByRole('button', { name: /회원 전용 3,000원/ }).click();
    await page.getByRole('button', { name: '정의 종료' }).click();
    await sheet(page, '쿠폰 정의를 종료할까요?').getByRole('button', { name: '종료', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '정의를 종료했어요.' })).toBeVisible();
    expect(sv.posts.at(-1)!.path).toBe('/api/v1/admin/coupons/definitions/d0000000-0000-4000-8000-000000000001/retire');
  });

  test('맞춤형 자동 코드: 네 규칙과 시연용 변경, 종류 전환 시 직접 입력', async ({ page }) => {
    await serve(page, server()); await login(page);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    await page.getByRole('button', { name: '캠페인 만들기' }).click();
    const s = sheet(page, '캠페인 만들기');
    const code = s.getByLabel('캠페인 코드');
    await expect(s.getByRole('switch', { name: '시연용' })).toHaveCount(0);
    await code.fill('MANUAL_CLAIM');
    await s.getByRole('button', { name: '맞춤형', exact: true }).click();
    await expect(code).toHaveValue('');
    await expect(code).not.toBeEditable();
    await expect(s.getByText('맞춤형은 AI가 이 코드로 쿠폰을 요청해서 자동으로 정해져요.')).toBeVisible();
    for (const [label, rule] of [['판매 오픈', 'SALE_OPEN'], ['결제 이탈', 'CHECKOUT_ABANDON'], ['품절 유사 상품', 'SOLD_OUT_SIMILAR'], ['관심 카테고리 신상품', 'CATEGORY_NEW']]) {
      await s.getByRole('button', { name: label, exact: true }).click();
      await expect(code).toHaveValue(`${rule}_NORMAL`);
      await s.getByRole('switch', { name: '시연용' }).click();
      await expect(code).toHaveValue(`${rule}_DEMO`);
      await s.getByRole('switch', { name: '시연용' }).click();
      await expect(code).toHaveValue(`${rule}_NORMAL`);
    }
    await s.getByRole('switch', { name: '시연용' }).click();
    await s.getByRole('button', { name: '판매 오픈', exact: true }).click();
    await expect(code).toHaveValue('SALE_OPEN_DEMO');
    for (const kind of ['받기형', '회원 쿠폰']) {
      await s.getByRole('button', { name: kind, exact: true }).click();
      await expect(code).toBeEditable();
      await expect(code).toHaveValue('');
      await expect(s.getByRole('switch', { name: '시연용' })).toHaveCount(0);
      await code.fill('manual_123');
      await expect(code).toHaveValue('MANUAL_123');
      await s.getByRole('button', { name: '맞춤형', exact: true }).click();
      await expect(code).toHaveValue('');
      await s.getByRole('button', { name: '판매 오픈', exact: true }).click();
      await expect(code).toHaveValue('SALE_OPEN_NORMAL');
      await expect(s.getByRole('switch', { name: '시연용' })).not.toBeChecked();
      await s.getByRole('switch', { name: '시연용' }).click();
    }
  });

  test('받기형과 회원형은 시연용을 숨기고 false로 요청한다', async ({ page }) => {
    const sv = server(); await serve(page, sv); await login(page);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    for (const [label, kind] of [['받기형', 'CLAIM'], ['회원 쿠폰', 'MEMBER']]) {
      await page.getByRole('button', { name: '캠페인 만들기' }).click();
      const s = sheet(page, '캠페인 만들기');
      await s.getByRole('button', { name: '맞춤형', exact: true }).click();
      await s.getByRole('switch', { name: '시연용' }).click();
      await s.getByRole('button', { name: label, exact: true }).click();
      await expect(s.getByRole('switch', { name: '시연용' })).toHaveCount(0);
      await s.getByRole('radio').click();
      await s.getByLabel('캠페인 코드').fill(`TEST_${kind}`);
      await s.getByLabel('예산').fill('100');
      await s.getByRole('button', { name: '만들기', exact: true }).click();
      await expect(s).toBeHidden();
      expect(sv.posts.at(-1)!.body).toMatchObject({ kind, demo: false, code: `TEST_${kind}` });
    }
  });

  test('캠페인 만들기: 종류별 정의 범위, 맞춤 규칙, 시연용, 코드 중복 409는 코드 칸, COUPON_INVALID는 시트 안내', async ({ page }) => {
    const sv = server(); sv.fail = [{ path: /campaigns$/, status: 409, body: { code: 'COMMON_DATA_CONFLICT', message: '현재 데이터 상태와 요청이 충돌합니다.' } }, { path: /campaigns$/, status: 400, body: { code: 'COUPON_INVALID', message: '쿠폰 조건이 올바르지 않습니다.' } }];
    await serve(page, sv); await login(page);
    await page.getByRole('button', { name: '쿠폰 관리' }).click();
    await page.getByRole('button', { name: '캠페인 만들기' }).click();
    const s = sheet(page, '캠페인 만들기');
    // 받기형, 회원 쿠폰: 전체 상품 정의만(종료된 정의 제외)
    await expect(s.getByRole('radio')).toHaveCount(1);
    await expect(s.getByRole('radio', { name: /회원 전용 3,000원/ })).toBeVisible();
    await s.getByRole('button', { name: '회원 쿠폰', exact: true }).click();
    await expect(s.getByRole('radio')).toHaveCount(1);
    await expect(s.getByText('맞춤 규칙')).toHaveCount(0);
    // 맞춤형: 특정 상품 정의와 규칙
    await s.getByRole('button', { name: '맞춤형', exact: true }).click();
    await expect(s.getByRole('radio')).toHaveCount(1);
    await expect(s.getByRole('radio', { name: /맞춤 10%/ })).toBeVisible();
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(s.getByText('맞춤 규칙을 골라 주세요.')).toBeVisible();
    await s.getByRole('radio', { name: /맞춤 10%/ }).click();
    await s.getByRole('button', { name: '판매 오픈' }).click();
    await expect(s.getByLabel('캠페인 코드')).toHaveValue('SALE_OPEN_NORMAL');
    await expect(s.getByLabel('캠페인 코드')).not.toBeEditable();
    await s.getByLabel('예산').fill('100');
    await s.getByRole('switch', { name: '시연용' }).click();
    await expect(s.getByLabel('캠페인 코드')).toHaveValue('SALE_OPEN_DEMO');
    await noOverflow(page);
    await s.getByRole('button', { name: '맞춤형', exact: true }).scrollIntoViewIfNeeded();
    await shot(page, '04-campaign-sheet', false);
    await s.getByRole('button', { name: '만들기', exact: true }).scrollIntoViewIfNeeded();
    await shot(page, '04b-campaign-sheet-bottom', false);
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(s.getByText('이미 쓰고 있는 캠페인 코드예요.')).toBeVisible();
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(s.getByRole('alert').filter({ hasText: '캠페인 조건이 맞지 않아요' })).toBeVisible();
    await s.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '캠페인을 만들었어요.' })).toBeVisible();
    const b = sv.posts.at(-1)!.body as Record<string, unknown>;
    expect(b).toMatchObject({ code: 'SALE_OPEN_DEMO', definitionId: 'd0000000-0000-4000-8000-000000000002', kind: 'TARGETED', ruleCode: 'SALE_OPEN', totalBudget: 100, perAccountLimit: 1, demo: true });
    expect(Date.parse(b.endsAt as string) - Date.parse(b.startsAt as string)).toBe(30 * 86_400_000);
    await expect(page.getByText('SALE_OPEN_DEMO')).toBeVisible();
  });
});

test('플래그 끔: 운영자 마이페이지에 쿠폰 관리가 없다', async ({ page }) => {
  test.skip(!FLAG_OFF, '플래그 끔 서버 전용');
  await serve(page, server()); await login(page);
  await expect(page.getByText('문의 관리')).toBeVisible();
  await expect(page.getByText('쿠폰 관리')).toHaveCount(0);
  await shot(page, '00-admin-flagoff');
});
