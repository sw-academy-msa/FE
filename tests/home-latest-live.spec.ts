import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 홈 최신순과 8개씩 페이지를 확인한다
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
const summary = (id: string, name: string) => ({ id, name, brandOrStore: '스토어', category: '숏패딩', price: 18000, image: null, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 0, availableQuantity: 10, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) } });

async function serve(page: Page, sv: { list: string[]; queries: string[] }) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'buyer-1', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'buyer-1', name: '구매자', roles: ['BUYER'] };
    else if (path.endsWith('/v1/products')) { sv.queries.push(url.search); data = { items: sv.list.map(id => summary(id, `상품 ${id}`)), page: 0, size: 100, totalPages: 1, totalElements: sv.list.length, serverTime: iso(Date.now()) }; }
    else if (path.endsWith('/categories')) data = ['숏패딩'];
    await route.fulfill({ json: { success: true, data } });
  });
}
async function login(page: Page) {
  await page.goto('/#/login?next=%2F');
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const ids = (page: Page) => page.getByTestId('home-products').locator('[data-current] a[href^="#/product/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')!.replace('#/product/', '')))]);

test('홈은 서버 최신순(NEWEST) 응답 순서로, 예전에 받아 둔 상품보다 새로 올라온 상품이 먼저', async ({ page }) => {
  const sv = { list: ['old'], queries: [] as string[] };
  await serve(page, sv); await login(page);
  await expect(page.getByText('상품 old')).toBeVisible();
  // 새로고침 없이(앱 안 이동) 홈에 다시 오면 저장소에는 예전 상품이 먼저 들어 있다
  sv.list = ['new', 'old']; await page.goto('/#/orders'); await page.goto('/#/');
  await expect(page.getByText('상품 new')).toBeVisible();
  await expect.poll(() => ids(page)).toEqual(['new', 'old']);
  expect(sv.queries.every(q => /sort=NEWEST/.test(q) && /size=100/.test(q))).toBe(true);
});

test('실제 모드도 8개씩 페이지로 넘기고 아래 점으로 표시한다', async ({ page }) => {
  const sv = { list: Array.from({ length: 23 }, (_, i) => `p${i + 1}`), queries: [] as string[] };
  await serve(page, sv); await login(page);
  await expect.poll(async () => (await ids(page)).length).toBe(8);
  expect((await ids(page))[0]).toBe('p1');
  const nav = page.getByRole('navigation', { name: '상품 페이지' });
  await expect(nav.getByRole('button', { name: /^\d+페이지$/ })).toHaveCount(3);
  await nav.getByRole('button', { name: '3페이지' }).click();
  await expect(page).toHaveURL(/[?&]p=3/); await expect.poll(() => ids(page)).toEqual(['p17', 'p18', 'p19', 'p20', 'p21', 'p22', 'p23']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
