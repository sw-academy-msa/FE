import { expect, test, type Page } from '@playwright/test';

// 로컬 실제 API 모드에서 HTTP 응답만 대체하며 운영 API를 호출하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
const NOW = '2030-01-01T00:00:00Z';
const campaign = () => ({ id: 'c1', code: 'WELCOME', kind: 'CLAIM', totalBudget: 10, issuedCount: 2, status: 'ACTIVE', startsAt: '2029-12-01T00:00:00Z', endsAt: '2030-02-01T00:00:00Z', demo: false, notificationSentAt: null as string | null });
async function fixture(page: Page, admin = false, mode: 'open' | 'closed' | 'expired' | 'claimed' = 'open') {
  const c = campaign(); let claims = mode === 'claimed' ? 1 : 0, sends = 0;
  if (mode === 'closed') c.issuedCount = 10;
  if (mode === 'expired') c.endsAt = NOW;
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    let data: unknown = {}, status = 200;
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (/\/auth\/(login|refresh)$/.test(path)) data = { accessToken: 'test-token', accountId: 'buyer-1', roles: admin ? ['BUYER', 'ADMIN'] : ['BUYER'], expiresAt: '2031-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { accountId: 'buyer-1', id: 'buyer-1', name: '테스터', email: 'test@example.com', roles: admin ? ['BUYER', 'ADMIN'] : ['BUYER'], interestCategories: [] };
    else if (path.endsWith('/accounts/me/membership')) data = { state: 'NONE', active: false, autoRenew: false, sourceVersion: 0 };
    else if (path.endsWith('/payments/memberships/configuration')) data = { amount: 4900, currency: 'KRW', planVersion: 'monthly-v1', termsVersion: 'recurring-v1', clientKey: 'test_ck_fixture' };
    else if (path.endsWith('/payments/memberships/me')) data = { state: 'NONE', autoRenew: false, version: 0, billingRegistrationRequired: true };
    else if (path.endsWith('/coupons/me')) data = [];
    else if (path.endsWith('/coupons/campaigns/WELCOME/claims') && method === 'POST') { claims++; status = 201; data = { issueId: 'issued', name: '웰컴 쿠폰' }; }
    else if (path.endsWith('/coupons/campaigns/WELCOME')) data = { campaign: c, definition: { id: 'd1', name: '웰컴 쿠폰', discountType: 'AMOUNT', amount: 3000, minItemsAmount: 10000, scope: 'ALL', status: 'ACTIVE', version: 1 }, remaining: c.totalBudget - c.issuedCount, claimed: claims > 0 };
    else if (path.endsWith('/admin/coupons/campaigns/c1/notifications')) { sends++; c.notificationSentAt = NOW; data = c; }
    else if (path.endsWith('/admin/coupons/campaigns')) data = [c];
    else if (path.endsWith('/admin/coupons/definitions')) data = [];
    else if (path.endsWith('/notifications/n1')) data = { id: 'n1', type: 'CAMPAIGN_CLAIM_AVAILABLE', title: '(광고) 쿠폰이 도착했어요', body: '웰컴 쿠폰을 받아 가세요.', targetType: 'CLAIM_CAMPAIGN', targetId: 'c1', campaignCode: 'WELCOME', createdAt: NOW, occurredAt: NOW, readAt: null };
    else if (path.endsWith('/notifications/unread-count')) data = { count: 1 };
    else if (path.endsWith('/admin/seller-applications')) data = { content: [], totalElements: 0, totalPages: 0 };
    else if (path.includes('/admin/product-reviews')) data = path.endsWith('/revisions') ? [] : { items: [], totalPages: 0, totalElements: 0 };
    else if (path.endsWith('/category-catalog') || path.endsWith('/categories')) data = [];
    await route.fulfill({ status, json: { success: true, code: 'COMMON_SUCCESS', data } });
  });
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  return { claims: () => claims, sends: () => sends };
}
async function login(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('test@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password1!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
test('알림 상세 딥링크가 마이페이지 받기 시트를 열고 한 번만 발급한다', async ({ page }) => {
  const sv = await fixture(page); await login(page, '/my');
  await expect(page.getByRole('heading', { name: '구매자 마이페이지' })).toBeVisible();
  await page.goto('/?notificationId=n1');
  const sheet = page.getByRole('dialog', { name: '쿠폰 받기' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('웰컴 쿠폰')).toBeVisible();
  await expect(sheet.getByText('3,000원 할인')).toBeVisible();
  await expect(sheet.getByText(/1만 원 이상 구매 시/)).toBeVisible();
  await expect(sheet.getByText('8장')).toBeVisible();
  await sheet.getByRole('button', { name: '받기', exact: true }).click();
  await expect(sheet.getByRole('button', { name: '받음', exact: true })).toBeDisabled();
  expect(sv.claims()).toBe(1);
  await expect(page.getByRole('heading', { name: '구매자 마이페이지' })).toBeVisible();
});
for (const [mode, label] of [['closed', '마감'], ['expired', '만료'], ['claimed', '받음']] as const) {
  test(`받기 시트 ${label} 상태는 발급을 막는다`, async ({ page }) => {
    const sv = await fixture(page, false, mode); await login(page, '/my?claim=WELCOME');
    await expect(page.getByRole('dialog', { name: '쿠폰 받기' }).getByRole('button', { name: label, exact: true })).toBeDisabled();
    expect(sv.claims()).toBe(mode === 'claimed' ? 1 : 0);
  });
}
test('관리자 확인 시트 이후 발송하고 새로고침해도 알림 보냄을 표시한다', async ({ page }) => {
  const sv = await fixture(page, true); await login(page, '/admin');
  await page.getByRole('button', { name: '쿠폰 관리' }).click();
  await page.getByRole('button', { name: /WELCOME/ }).click();
  await page.getByRole('button', { name: '알림 보내기', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '쿠폰 알림을 보낼까요?' });
  expect(sv.sends()).toBe(0);
  await sheet.getByRole('button', { name: '알림 보내기', exact: true }).click();
  await expect(page.getByRole('button', { name: '알림 보냄' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '쿠폰 관리' }).click();
  await page.getByRole('button', { name: /WELCOME/ }).click();
  await expect(page.getByRole('button', { name: '알림 보냄' })).toBeDisabled();
  expect(sv.sends()).toBe(1);
});
