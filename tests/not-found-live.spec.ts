import { expect, test } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 HTTP 모킹 전용');
test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });

/** 없는 상품 주소(서버 404)는 다시 시도 대신 '상품을 찾을 수 없어요'와 홈으로, 서버 오류(5xx)는 다시 시도 */
test('없는 상품 주소는 상품을 찾을 수 없어요와 홈으로 버튼을 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/no-such-product$/, route => route.fulfill({ status: 404, json: { success: false, error: { code: 'PRODUCT_NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' } } }));
  await page.goto('/#/product/no-such-product');
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await page.getByRole('link', { name: '홈으로' }).click();
  await expect(page).not.toHaveURL(/no-such-product/);
});

test('형식이 틀린 상품 id(서버 400)도 상품을 찾을 수 없어요와 홈으로를 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/abc$/, route => route.fulfill({ status: 400, json: { code: 'COMMON_INVALID_REQUEST', message: '요청값이 올바르지 않습니다.', violations: [] } }));
  await page.goto('/#/product/abc');
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '홈으로' })).toBeVisible();
});

test('저장(제출)의 400은 지금처럼 오류 문구를 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, ''), method = route.request().method();
    if (path.endsWith('/support-inquiries') && method === 'POST') return route.fulfill({ status: 400, json: { code: 'COMMON_INVALID_REQUEST', message: '제목은 100자 이하로 입력해 주세요.', violations: [] } });
    let data: unknown = [];
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-user', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-user', name: '테스트 사용자', roles: ['BUYER'] };
    else if (path.includes('/orders')) data = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/#/login?next=${encodeURIComponent('/inquiries/compose')}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('user@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목' })).toBeVisible();
  await page.getByRole('textbox', { name: '제목' }).fill('결제 문의'); await page.getByRole('textbox', { name: '문의 내용' }).fill('결제가 두 번 됐어요.');
  await page.getByRole('button', { name: '문의 보내기' }).click();
  await expect(page.getByText('제목은 100자 이하로 입력해 주세요.')).toBeVisible();
  await expect(page).toHaveURL(/inquiries\/compose/);
});

test('서버 오류(5xx)면 상품 화면은 다시 시도를 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/broken-product$/, route => route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.' } } }));
  await page.goto('/#/product/broken-product');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없어요' })).toHaveCount(0);
});
