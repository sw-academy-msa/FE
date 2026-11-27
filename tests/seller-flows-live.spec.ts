import { expect, test, type Page, type Route } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } }); // 아이폰 너비에서 가로로 넘치지 않는지 함께 본다

type Handler = (path: string, route: Route) => unknown | Promise<unknown>;
async function mockApi(page: Page, role: 'BUYER' | 'SELLER' | 'ADMIN', handler: Handler) {
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, '');
    let data: unknown;
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-user', roles: role === 'BUYER' ? ['BUYER'] : ['BUYER', role], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me') && route.request().method() === 'GET') data = await handler(path, route) ?? { accountId: 'real-user', id: 'real-user', name: '테스트 사용자', email: 'user@example.com', roles: [role], interestCategories: [] };
    else data = await handler(path, route);
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
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
for (const role of ['BUYER', 'SELLER'] as const) {
  test(`${role} 마이페이지에서 관심사 메뉴를 숨기고 옛 주소를 마이페이지로 보낸다`, async ({ page }) => {
    const removedRequests: string[] = [];
    await mockApi(page, role, path => {
      if (/signup-options|\/interests$|\/ai\/analytics\/profile$/.test(path)) removedRequests.push(path);
    });
    await signIn(page, '/my/interests');
    await expect(page).toHaveURL(/#\/my$/);
    await expect(page.getByRole('heading', { name: role === 'BUYER' ? '구매자 마이페이지' : '마이페이지', exact: true })).toBeVisible();
    await expect(page.getByText('관심사와 맞춤 추천', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^알림 설정/ }).or(page.getByRole('link', { name: /^알림 설정/ }))).toBeVisible();
    expect(removedRequests).toEqual([]);
    await noOverflow(page);
  });
}

test('회원가입은 관심사 선택 없이 완료하고 요청에 관심 카테고리를 보내지 않는다', async ({ page }) => {
  const signups: Record<string, unknown>[] = [];
  await mockApi(page, 'BUYER', (path, route) => {
    if (path.endsWith('/email-verifications')) return { challengeId: 'c1', expiresAt: new Date(Date.now() + 180000).toISOString(), resendAvailableAt: new Date(Date.now() + 60000).toISOString() };
    if (path.endsWith('/email-verifications/confirm')) return { verificationToken: 'verified-token' };
    if (path.endsWith('/auth/signup')) signups.push(route.request().postDataJSON());
  });
  await page.goto('/#/signup');
  await page.getByLabel('이름', { exact: true }).fill('테스트 사용자');
  await page.getByLabel('이메일', { exact: true }).fill('new@example.com');
  await page.getByRole('button', { name: '인증번호 요청', exact: true }).click();
  await page.getByRole('textbox', { name: '인증번호' }).fill('123456');
  await page.getByRole('button', { name: '인증 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 정보 입력' })).toBeVisible();
  await expect(page.getByText(/관심사|관심 카테고리/)).toHaveCount(0);
  await page.getByLabel('휴대폰 번호', { exact: true }).fill('01012345678');
  await page.getByLabel('비밀번호', { exact: true }).fill('Password1!');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('Password1!');
  await page.getByLabel('약관 전체 동의').check();
  await page.getByRole('button', { name: '가입하기', exact: true }).click();
  await expect(page).toHaveURL(/#\/signup\/done/);
  expect(signups).toHaveLength(1);
  expect(signups[0]).not.toHaveProperty('interestCategories');
});
const app = (o: object = {}) => ({ applicationId: 'ap1', accountId: 'real-user', attemptNumber: 1, sellerDisplayName: '스토어', contactName: '홍길동', contactEmail: 'user@example.com', contactPhone: '01012345678', bankName: '신한은행', maskedBankAccount: '***789', dispatchAddress: { postalCode: '04066', roadAddress: '서울 도로 1', detailAddress: null }, returnAddress: { postalCode: '04066', roadAddress: '서울 도로 1', detailAddress: null }, status: 'PENDING', submittedAt: '2026-01-01T00:00:00Z', reviewedAt: '2026-01-02T00:00:00Z', reviewedBy: null, rejectionReason: null, certificateReviewed: true, certificateRecheck: false, previousApplicationId: null, ...o });
const correction = (items: { field: string; reason: string }[], state = 'OPEN') => ({ id: 'c1', applicationId: 'ap1', deadline: '2099-01-08T14:59:59Z', state, items, submittedApplicationId: null });

test('판매자 정정은 세 버튼으로 저장과 삭제를 선택하고 계좌와 첨부는 보관하지 않는다', async ({ page }) => {
  await mockApi(page, 'BUYER', path => {
    if (path.endsWith('/seller-applications/ap1/correction-request')) return correction([{ field: 'STORE_NAME', reason: '이름 확인' }, { field: 'BANK_ACCOUNT', reason: '계좌 확인' }, { field: 'CERTIFICATE', reason: '서류 확인' }]);
    if (path.endsWith('/seller-applications/me')) return app({ status: 'CHANGES_REQUESTED' });
  });
  await signIn(page, '/apply'); await page.getByRole('button', { name: '사유 확인하기' }).click();
  await page.getByLabel('판매자 표시 이름', { exact: true }).fill('보관할 상점'); await page.getByLabel('정산 계좌번호', { exact: true }).fill('11012345678');
  await page.getByLabel('사업자등록증 PDF 첨부').setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: '이전 화면', exact: true }).click(); const sheet = page.getByRole('dialog', { name: '작성 중인 내용을 임시 저장할까요?' });
  await expect(sheet.getByRole('button')).toHaveCount(3); await expect(sheet).toContainText('계좌번호와 첨부 서류는 저장되지 않아요.'); await sheet.getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('stockdrop:correction-draft:ap1')!))).toMatchObject({ displayName: '보관할 상점', account: '' });
  await page.goto('/#/apply?fix=1'); await page.reload(); await expect(page.getByLabel('판매자 표시 이름', { exact: true })).toHaveValue('보관할 상점'); await expect(page.getByLabel('정산 계좌번호', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '이전 화면', exact: true }).click(); await sheet.getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('stockdrop:correction-draft:ap1'))).toBeNull();
});

test('운영자는 입점 신청에 항목별 보완 요청을 보내고 보낸 요청을 볼 수 있다', async ({ page }) => {
  let status = 'PENDING'; const posted: unknown[] = [];
  await mockApi(page, 'ADMIN', async (path, route) => {
    if (path.endsWith('/admin/seller-applications/ap1/certificate-review')) { await route.fulfill({ body: PDF, contentType: 'application/pdf' }); return null; }
    if (path.endsWith('/admin/seller-applications/ap1/correction-request')) {
      if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); posted.push(b); status = 'CHANGES_REQUESTED'; return correction(b.items); }
      return correction([{ field: 'BANK_ACCOUNT', reason: '예금주가 사업자와 달라요' }, { field: 'CONTACT', reason: '연락처가 연결되지 않아요' }]);
    }
    if (path.endsWith('/admin/seller-applications/ap1')) return app({ status });
    if (path.endsWith('/admin/seller-applications')) return { content: [app({ status })], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    if (path.includes('/admin/product-reviews')) return path.endsWith('/revisions') ? [] : { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
  });
  await signIn(page, '/admin/ap1');
  await expect(page.getByText('사업자등록증을 열람했어요')).toBeVisible();
  await page.getByRole('button', { name: '보완 요청', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '보완 요청' });
  await sheet.getByLabel('정산 계좌번호').check();
  await sheet.getByLabel('담당자').check();
  await sheet.getByRole('textbox', { name: '정산 계좌번호 보완 사유' }).fill('예금주가 사업자와 달라요');
  await sheet.getByRole('button', { name: '2개 항목 보완 요청' }).click();
  await expect(sheet.getByText('담당자 보완 사유를 입력해 주세요.')).toBeVisible();
  expect(posted).toHaveLength(0);
  await sheet.getByRole('textbox', { name: '담당자 보완 사유' }).fill('연락처가 연결되지 않아요');
  await noOverflow(page);
  await sheet.getByRole('button', { name: '2개 항목 보완 요청' }).click();
  await expect(page.getByText('보완 요청을 보냈어요. 신청자에게 알림이 가요.')).toBeVisible();
  expect(posted).toEqual([{ deadline: expect.stringMatching(/T14:59:59\.000Z$/), items: [{ field: 'CONTACT', reason: '연락처가 연결되지 않아요' }, { field: 'BANK_ACCOUNT', reason: '예금주가 사업자와 달라요' }] }]);
  const sent = page.getByRole('region', { name: '보낸 보완 요청' });
  await expect(sent.getByText('보완 대기')).toBeVisible();
  await expect(sent.getByText('예금주가 사업자와 달라요')).toBeVisible();
  await page.goto('/#/admin/applications');
  await page.getByRole('button', { name: /보완 요청 1건/ }).click();
  await expect(page.getByRole('link', { name: /스토어/ })).toBeVisible();
});

test('판매 신청자는 서버가 요청한 항목만 입력해 실제로 다시 제출한다', async ({ page }) => {
  let status = 'CHANGES_REQUESTED'; let body = '';
  await mockApi(page, 'BUYER', (path, route) => {
    if (path.endsWith('/seller-applications/ap1/resubmissions')) { body = route.request().postDataBuffer()?.toString('utf8') ?? ''; status = 'PENDING'; return { applicationId: 'ap2', status: 'PENDING' }; }
    if (path.endsWith('/seller-applications/ap1/correction-request')) return correction([{ field: 'STORE_NAME', reason: '상호와 다른 이름이에요' }, { field: 'BANK_ACCOUNT', reason: '계좌를 확인할 수 없어요' }]);
    if (path.endsWith('/seller-applications/me')) return app({ status });
  });
  await signIn(page, '/apply');
  await expect(page.getByRole('heading', { name: /보완을 요청했어요/ })).toBeVisible();
  for (const [label, state] of [['판매자 표시 이름', '보완 필요'], ['정산 계좌번호', '보완 필요'], ['담당자', '확인 완료'], ['사업자등록증 PDF', '확인 완료'], ['출고지', '확인 완료'], ['반품 주소', '확인 완료']])
    await expect(page.locator('div.divider', { hasText: label }).first()).toContainText(state);
  await page.getByRole('button', { name: '사유 확인하기' }).click();
  await expect(page.getByRole('region', { name: '판매자 표시 이름 보완' })).toContainText('상호와 다른 이름이에요');
  await expect(page.getByRole('region', { name: '담당자 보완' })).toHaveCount(0);
  await expect(page.getByLabel('사업자등록증 PDF 첨부')).toHaveCount(0);
  await page.getByRole('textbox', { name: '판매자 표시 이름' }).fill('정식 상호 스토어');
  await page.getByRole('button', { name: '보완해서 다시 심사 요청하기' }).click();
  await expect(page.getByText('계좌번호를 숫자 6~30자리로 입력해 주세요.')).toBeVisible();
  expect(body).toBe('');
  await page.getByRole('textbox', { name: '정산 계좌번호' }).fill('110-123-456789');
  await noOverflow(page);
  await page.getByRole('button', { name: '보완해서 다시 심사 요청하기' }).click();
  await expect(page.getByText('보완 내용을 제출했어요. 다시 심사해 드릴게요.')).toBeVisible();
  expect(body).toContain('name="application"');
  expect(body).toContain('"sellerDisplayName":"정식 상호 스토어"');
  expect(body).toContain('"bankAccount":{"bankName":"신한은행","number":"110123456789"}');
  expect(body).not.toContain('"contact"');
  expect(body).not.toContain('name="certificate"');
  await expect(page.getByRole('heading', { name: /진행 중이에요/ })).toBeVisible();
});

test('판매 제한 판매자는 마이페이지에서 안내를 보고 사업자등록증을 다시 제출해 재심사 상태를 본다', async ({ page }) => {
  let status = 'REJECTED'; let uploaded = '';
  const review = () => ({ salesRestricted: true, application: app({ status, certificateRecheck: true, rejectionReason: status === 'REJECTED' ? '사업자등록증이 흐릿해요' : null }), correction: null });
  await mockApi(page, 'SELLER', (path, route) => {
    if (path.endsWith('/sellers/me/review-status')) return review();
    if (path.endsWith('/sellers/me/certificate-reviews')) { uploaded = route.request().postDataBuffer()?.toString('latin1') ?? ''; status = 'PENDING'; return { applicationId: 'ap3', status: 'PENDING' }; }
    if (path.endsWith('/sellers/me')) return { sellerDisplayName: '스토어', contactName: '홍길동', contactEmail: 'user@example.com', contactPhone: '01012345678', bankAccount: null, dispatchAddress: null, returnAddress: null };
    if (path.endsWith('/seller/products/sales-summary')) return { productCount: 0, scheduledCount: 0, onSaleCount: 0, endedCount: 0, initialQuantity: 0, reservedQuantity: 0, confirmedQuantity: 0, availableQuantity: 0 };
    if (path.endsWith('/seller/orders/settlement')) return { month: '2026-11', confirmedAmount: 0, confirmedOrders: 0, awaitingOrders: 0, awaitingAmount: 0, products: [] };
    if (path.endsWith('/seller/products')) return { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
  });
  await signIn(page, '/my');
  const banner = page.getByRole('alert').filter({ hasText: '판매가 제한돼 있어요' });
  await expect(banner).toContainText('사업자등록증이 흐릿해요');
  await noOverflow(page);
  await banner.click();
  await expect(page).toHaveURL(/#\/seller\/review$/);
  await expect(page.getByRole('status', { name: '재심사 상태' })).toContainText('재심사를 통과하지 못했어요');
  await page.getByLabel('사업자등록증 PDF 첨부').setInputFiles({ name: '사업자등록증.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: '재심사 신청하기' }).click();
  await page.getByRole('dialog', { name: '재심사 신청 확인' }).getByRole('button', { name: '신청하기' }).click();
  await expect(page.getByText('재심사를 신청했어요. 결과는 알림으로 알려드려요.')).toBeVisible();
  expect(uploaded).toContain('name="certificate"');
  expect(uploaded).toContain('%PDF-');
  await expect(page.getByRole('status', { name: '재심사 상태' })).toContainText('사업자등록증 재심사 중이에요');
  await expect(page.getByRole('button', { name: '재심사 신청하기' })).toHaveCount(0);
  await noOverflow(page);
});
