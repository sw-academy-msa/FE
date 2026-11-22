import { test, expect, type Page } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
test.use({ viewport: { width: 402, height: 874 } });
async function setup(page: Page, mode: 'data' | 'empty' | 'error' | 'current') {
  const months = new Set<string>(); let error = mode === 'error';
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''); let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (/\/auth\/(login|refresh)$/.test(path)) data = { accessToken: 'test-token', accountId: 'test-seller', roles: ['SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { accountId: 'test-seller', name: '판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/orders/settlement')) {
      const month = url.searchParams.get('month')!; months.add(month);
      if (error) return route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: '정산 조회 오류' } } });
      const current = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(Date.now());
      const amount = mode === 'empty' || mode === 'current' && month !== current ? 0 : 2000;
      data = { month, confirmedAmount: amount, confirmedOrders: amount ? 1 : 0, awaitingOrders: 0, awaitingAmount: 0, products: amount ? [{ productId: 'p1', productName: '패딩', amount, quantity: 2, orders: 1 }] : [] };
    } else if (path.endsWith('/seller/products')) data = { items: [{ id: 'p1', sellerId: 'test-seller', name: '패딩', price: 1000, shippingFee: 3000, status: 'APPROVED', startsAt: '2020-01-01T00:00:00Z', endsAt: '2030-01-01T03:00:00Z', totalQuantity: 2, soldQuantity: 2, initialQuantity: 2, confirmedQuantity: 2, reservedQuantity: 0, availableQuantity: 0, options: [{ id: 'o1', label: '카키', initialQuantity: 2, confirmedQuantity: 2, reservedQuantity: 0, availableQuantity: 0 }], attributes: [], faqs: [], optionDimensions: [] }], page: 0, totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/seller/orders/summary')) data = { confirmedOrders: 1, preparingOrders: 1, shippingOrders: 0, deliveredOrders: 0 };
    else if (path.endsWith('/images') || path.endsWith('/revisions')) data = [];
    else if (path.endsWith('/seller/orders')) data = { content: [], totalPages: 0, page: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/#/login?next=%2Fseller%2Fsales'); await page.getByLabel('이메일', { exact: true }).fill('test@example.com'); await page.getByLabel('비밀번호', { exact: true }).fill('password'); await page.getByRole('button', { name: '로그인', exact: true }).click();
  return { months, recover: () => { error = false; } };
}
test('월별 정산 API 6개월을 조회해 금액과 수량 및 순차 모션을 표시한다', async ({ page }) => {
  const { months } = await setup(page, 'data'); const chart = page.getByRole('region', { name: '월별 판매 현황' }); await expect(chart.getByRole('button')).toHaveCount(6); expect(months.size).toBe(6); await expect(chart.getByText('2,000원', { exact: true }).last()).toBeVisible(); await expect(chart.getByText('2개', { exact: true })).toBeVisible(); await expect(chart.getByText('1,800원', { exact: true })).toBeVisible();
  const bars = chart.locator('.seller-sales-bar'); expect(await bars.evaluateAll(es => es.map(e => getComputedStyle(e).animationDelay))).toEqual(['0s', '0.2s', '0.4s', '0.6s', '0.8s', '1s']); await chart.getByRole('button').first().click(); await expect(chart.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true'); await page.emulateMedia({ reducedMotion: 'reduce' }); expect(await bars.first().evaluate(e => getComputedStyle(e).animationName)).toBe('none'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
test('정산 빈 달은 막대 없이 표시한다', async ({ page }) => { await setup(page, 'empty'); await expect(page.getByText('아직 구매 확정된 판매가 없어요')).toBeVisible(); await expect(page.locator('.seller-sales-bar')).toHaveCount(0); });
test('이번 달만 판매가 있으면 앞 5개월은 API의 0원이고 마지막 달만 값이 있다', async ({ page }) => {
  await setup(page, 'current'); const chart = page.getByRole('region', { name: '월별 판매 현황' }); const months = chart.getByRole('button'); await expect(months).toHaveCount(6); await expect(chart.getByText('0원', { exact: true })).toHaveCount(5); await expect(chart.locator('.seller-sales-bar')).toHaveCount(1); await expect(months.last()).toHaveAttribute('aria-label', /2,000원/); await expect(months.first()).toHaveAttribute('aria-label', /0원/); await expect(months.last()).toHaveAttribute('aria-pressed', 'true');
});
test('정산 오류를 0원으로 표시하지 않고 다시 조회한다', async ({ page }) => { const state = await setup(page, 'error'); const chart = page.getByRole('region', { name: '월별 판매 현황' }); await expect(chart.getByRole('button', { name: '다시 시도' })).toBeVisible(); await expect(chart.getByText('0원', { exact: true })).toHaveCount(0); state.recover(); await chart.getByRole('button', { name: '다시 시도' }).click(); await expect(chart.getByText('2,000원', { exact: true }).last()).toBeVisible(); });
