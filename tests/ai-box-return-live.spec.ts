import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 AI 분석(유료)과 운영 데이터는 부르지 않는다.
// 판매 등록 AI 상자: 사진 바꾸기 → 1단계 '진행 중이던 단계로 돌아가기' → 분석 입력이 바뀌었을 때만 다시 요청, AI 다시 분석은 2단계 칸과 상관없이 요청
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const meta = { categories: ['니트', '노트'], categoryCriteria: [{ code: 'CLOTHING', name: '니트', checks: [{ code: 'SIZE', question: '사이즈 정보' }] }] };
async function setup(page: Page, o: { failFirst?: boolean } = {}) {
  const calls = { analyses: 0, basic: [] as Record<string, unknown>[] };
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  const product: Record<string, unknown> = { id: 'p1', sellerId: 'real-seller', version: 4, status: 'DRAFT', name: '울 니트', description: '새 상품', sourceUrl: null, category: null, price: null, shippingFee: null, dispatchBusinessDays: null, perAccountLimit: null, shippingNotice: null, purchaseNotice: null, disposalReason: '시즌 재고', startsAt: null, endsAt: null, reviewReason: null, options: [], brandOrStore: null, attributes: [], optionDimensions: [], dispatchAddress: null, returnAddress: null, addressesCapturedAt: null, faqs: [] };
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['BUYER', 'SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/products/registration-metadata')) data = meta;
    else if (path.endsWith('/seller/products/p1/images')) data = [{ id: 'img1', objectKey: 'k', contentType: 'image/jpeg', sizeBytes: 1000, position: 0, representative: true }];
    else if (path.endsWith('/seller/products/p1/registration/basic-info')) { const b = route.request().postDataJSON() as Record<string, unknown>; calls.basic.push(b); const { expectedVersion: _, ...rest } = b; Object.assign(product, rest, { version: Number(product.version) + 1 }); data = product; }
    else if (path.endsWith('/seller/products/p1/ai-analyses') && method === 'POST') {
      calls.analyses++;
      if (o.failFirst && calls.analyses === 1) { await route.fulfill({ status: 500, json: { success: false, error: { code: 'COMMON_INTERNAL_SERVER_ERROR', message: '서버 오류' } } }); return; }
      data = { requestId: `r${calls.analyses}`, productId: 'p1', fingerprint: 'f', completed: false };
    }
    else if (path.startsWith('/api/v1/ai/product-analyses/')) data = { requestId: 'r', productId: 'p1', productVersion: product.version, fingerprint: 'f', status: 'COMPLETED', attempts: 1, nextAttemptAt: null, result: { requestId: 'r', productId: 'p1', sellerId: 'real-seller', fingerprint: 'f', outcome: 'NOT_APPLICABLE', recommendedCategory: null, questions: [] } };
    else if (path.startsWith('/api/v1/seller/products/p1')) data = product;
    else if (path.endsWith('/seller/products')) data = method === 'POST' ? product : { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/#/login?next=${encodeURIComponent('/seller/new')}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '한정 판매 등록' })).toBeVisible();
  await page.evaluate(px => {
    const key = 'stockdrop:v1:live', s = JSON.parse(localStorage.getItem(key)!);
    s.drafts['real-seller'] = { ...s.drafts['real-seller'], serverId: 'p1', name: '울 니트', description: '새 상품', reason: '시즌 재고', images: [px], imageIds: ['img1'], imageSizes: [1000], category: '', faqs: [] };
    localStorage.setItem(key, JSON.stringify(s));
  }, PIXEL);
  await page.reload(); await expect(page.getByLabel('상품명')).toHaveValue('울 니트');
  return calls;
}
const step = (page: Page, n: number) => page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) });
const warn = (page: Page) => page.locator('[data-tone="warn"]');
const returnBtn = (page: Page) => page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' });

test('2단계에서 사진 바꾸기 → 1단계 버튼 하나. 바꾸지 않고 돌아가면 분석 요청 0회, 상품명을 바꾸고 돌아가면 1회와 2단계로. 고치는 중인 판매 URL은 분석 저장에 보내지 않는다', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(step(page, 2)).toBeVisible();
  await expect(warn(page)).toHaveText(/^판매 가능한 분류가 아닌 사진으로 보여요/, { timeout: 15000 });
  expect(calls.analyses).toBe(1);
  await page.getByLabel('타 플랫폼 판매 URL').fill('coupang'); await page.getByLabel('한정 판매가').fill('12000');
  await warn(page).getByRole('button', { name: '사진 바꾸기' }).click(); await expect(step(page, 1)).toBeVisible();
  await expect(page.locator('.safe-bottom').getByRole('button')).toHaveCount(1); await expect(returnBtn(page)).toBeVisible();
  await returnBtn(page).click(); await expect(step(page, 2)).toBeVisible();
  await expect(page.getByLabel('한정 판매가')).toHaveValue('12,000'); await expect(page.getByLabel('타 플랫폼 판매 URL')).toHaveValue('coupang');
  await page.waitForTimeout(500); expect(calls.analyses).toBe(1);
  await warn(page).getByRole('button', { name: '사진 바꾸기' }).click(); await expect(step(page, 1)).toBeVisible();
  await page.getByLabel('상품명').fill('울 니트 라운드');
  await returnBtn(page).click(); await expect(step(page, 2)).toBeVisible();
  await expect.poll(() => calls.analyses).toBe(2);
  await expect(warn(page)).toBeVisible({ timeout: 15000 }); await page.waitForTimeout(500); expect(calls.analyses).toBe(2);
  const last = calls.basic.at(-1)!; expect(last.name).toBe('울 니트 라운드'); expect(last.sourceUrl ?? null).toBeNull();
  // 뒤로 가기는 2 → 1 → 나가기 확인창
  await page.goBack(); await expect(step(page, 1)).toBeVisible(); await expect(returnBtn(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('AI 분석 실패 뒤 2단계 칸(판매가, 판매 URL)이 비었거나 고치는 중이어도 다시 분석은 요청하고 칸 오류를 띄우지 않는다', async ({ page }) => {
  const calls = await setup(page, { failFirst: true });
  await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(step(page, 2)).toBeVisible();
  await expect(warn(page)).toHaveText(/^AI가 사진을 분석하지 못했어요/, { timeout: 15000 });
  await page.getByLabel('타 플랫폼 판매 URL').fill('coupang');
  await warn(page).getByRole('button', { name: '다시 분석' }).click();
  await expect.poll(() => calls.analyses).toBe(2); await expect(step(page, 2)).toBeVisible();
  await expect(warn(page)).toHaveText(/^판매 가능한 분류가 아닌 사진으로 보여요/, { timeout: 15000 });
  await expect(page.locator('[data-field="price"]').getByRole('alert')).toHaveCount(0); await expect(page.locator('[data-field="sourceUrl"]').getByRole('alert')).toHaveCount(0);
});
