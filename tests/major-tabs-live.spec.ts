import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 확인한다. 공개 카테고리 카탈로그(GET /api/v1/category-catalog) 기준 대분류 탭
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const iso = (ms: number) => new Date(ms).toISOString();
const catalog = { majors: [
  { code: 'CLOTHING', name: '의류', categories: [{ code: 'CLOTHING', name: '의류' }, { code: 'CLOTHING_JUMPER_03', name: '숏패딩' }] },
  { code: 'FASHION_ACCESSORIES', name: '패션잡화', categories: [{ code: 'FASHION_ACCESSORIES', name: '패션잡화' }, { code: 'FASHION_ACCESSORIES_BAG_01', name: '백팩' }] },
  { code: 'STATIONERY', name: '문구', categories: [{ code: 'STATIONERY', name: '문구' }, { code: 'STATIONERY_WRITING_01', name: '볼펜' }] },
  { code: 'HOUSEHOLD', name: '일반 생활잡화', categories: [{ code: 'HOUSEHOLD', name: '일반 생활잡화' }, { code: 'HOUSEHOLD_BOX_01', name: '수납함' }] },
] };
const summary = (id: string, name: string, category: string) => ({ id, name, brandOrStore: '스토어', category, price: 18000, image: null, status: 'ON_SALE', startsAt: iso(Date.now() - 600_000), endsAt: iso(Date.now() + 7_200_000), soldOutAt: null, stock: { initialQuantity: 10, confirmedQuantity: 0, availableQuantity: 10, approximate: false }, metadata: { version: 1, occurredAt: iso(Date.now()), projectedAt: iso(Date.now()) } });
type Sv = { catalogFails: boolean; catalogCalls: number; oldCategoriesCalls: number; list: ReturnType<typeof summary>[] };

async function serve(page: Page, sv: Sv) {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/refresh')) { await route.fulfill({ status: 401, json: { success: false, code: 'AUTH_REQUIRED', message: '로그인이 필요해요' } }); return; }
    else if (path.endsWith('/category-catalog')) { sv.catalogCalls++; if (sv.catalogFails) { await route.fulfill({ status: 503, json: { success: false, code: 'UNAVAILABLE', message: '잠시 후 다시 시도해 주세요' } }); return; } data = catalog; }
    else if (path.endsWith('/v1/categories')) { sv.oldCategoriesCalls++; data = { categories: ['숏패딩'] }; }
    else if (path.endsWith('/v1/products')) data = { items: sv.list, page: 0, size: 100, totalPages: 1, totalElements: sv.list.length, serverTime: iso(Date.now()) };
    await route.fulfill({ json: { success: true, data } });
  });
}
const tabs = (page: Page) => page.getByRole('group', { name: '상품 카테고리' }).getByRole('button');
const tab = (page: Page, name: string) => page.getByRole('group', { name: '상품 카테고리' }).getByRole('button', { name, exact: true });
const ids = (page: Page) => page.getByTestId('home-products').locator('[data-current] a[href^="#/product/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')!.replace('#/product/', '')))]);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** 비로그인 홈(온보딩을 건너뛴 상태) */
async function openHome(page: Page) {
  await page.goto('/#/welcome'); await page.getByRole('button', { name: '가입 없이 둘러보기' }).click();
  await expect(page.getByRole('heading', { name: 'STOCKDROP' })).toBeVisible();
}

test('비로그인 홈에서 전체 + 서버 대분류 탭(상품 없는 대분류 포함)이 보이고, 세부 카테고리 상품이 대분류 탭에 나온다', async ({ page }) => {
  const sv: Sv = { catalogFails: false, catalogCalls: 0, oldCategoriesCalls: 0, list: [summary('pad', '숏패딩 점퍼', '숏패딩'), summary('pen', '젤 볼펜', '볼펜'), summary('etc', '미분류 상품', '서버에 없는 이름'), summary('cloth', '대분류 이름 상품', '의류')] };
  await serve(page, sv); await openHome(page);
  await expect(tabs(page)).toHaveText(['전체', '의류', '패션잡화', '문구', '일반 생활잡화']);
  expect(await noOverflow(page)).toBe(true);
  await expect.poll(() => ids(page)).toHaveLength(4); // 전체에는 매핑 안 되는 상품도
  await tab(page, '의류').click(); await expect(page).toHaveURL(/category=%EC%9D%98%EB%A5%98/);
  await expect.poll(async () => (await ids(page)).sort()).toEqual(['cloth', 'pad']);
  await tab(page, '문구').click(); await expect.poll(() => ids(page)).toEqual(['pen']);
  // 상품이 없는 대분류도 탭이 있고 빈 상태 안내
  await tab(page, '패션잡화').click();
  await expect(page.getByText('아직 패션잡화 상품이 없어요')).toBeVisible();
  await page.getByRole('button', { name: '전체 상품 보기' }).click(); await expect.poll(() => ids(page)).toHaveLength(4);
  // 상세에 갔다 뒤로 오면 보던 탭 그대로
  await tab(page, '의류').click(); await expect.poll(async () => (await ids(page)).sort()).toEqual(['cloth', 'pad']);
  await page.getByTestId('home-products').locator('a[href="#/product/pad"]').first().click(); await expect(page).toHaveURL(/#\/product\/pad/);
  await page.goBack(); await expect(tab(page, '의류')).toHaveClass(/font-bold/);
  await expect.poll(async () => (await ids(page)).sort()).toEqual(['cloth', 'pad']);
  expect(sv.oldCategoriesCalls).toBe(0); // 예전 /categories는 더 쓰지 않는다
});

test('대분류 탭을 바꾸면 스와이프 페이지가 첫 페이지로 돌아간다', async ({ page }) => {
  const sv: Sv = { catalogFails: false, catalogCalls: 0, oldCategoriesCalls: 0, list: Array.from({ length: 15 }, (_, i) => summary(`c${i + 1}`, `패딩 ${i + 1}`, '숏패딩')) };
  await serve(page, sv); await openHome(page);
  await tab(page, '의류').click();
  await page.getByRole('navigation', { name: '상품 페이지' }).getByRole('button', { name: '2페이지' }).click();
  await expect(page).toHaveURL(/[?&]p=2/);
  await tab(page, '전체').click(); await expect(page).not.toHaveURL(/[?&]p=/);
  await expect(page.getByRole('navigation', { name: '상품 페이지' }).getByRole('button', { name: '1페이지' })).toHaveAttribute('aria-current', 'page');
});

test('카탈로그를 못 받으면 고정 대분류 탭을 보여 주고, 대분류 이름과 같은 상품만 그 탭에, 다시 시도하면 서버 카탈로그로', async ({ page }) => {
  const sv: Sv = { catalogFails: true, catalogCalls: 0, oldCategoriesCalls: 0, list: [summary('pad', '숏패딩 점퍼', '숏패딩'), summary('cloth', '대분류 이름 상품', '의류')] };
  await serve(page, sv); await openHome(page);
  await expect(tabs(page)).toHaveText(['전체', '의류', '패션잡화', '문구', '일반 생활잡화']);
  await expect(page.getByText('카테고리를 불러오지 못해 대분류만 보여요.')).toBeVisible();
  await tab(page, '의류').click(); await expect.poll(() => ids(page)).toEqual(['cloth']); // 세부 이름(숏패딩)은 대체 목록으로 매핑할 수 없다
  sv.catalogFails = false; await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByText('카테고리를 불러오지 못해 대분류만 보여요.')).toHaveCount(0);
  await expect.poll(async () => (await ids(page)).sort()).toEqual(['cloth', 'pad']);
});
