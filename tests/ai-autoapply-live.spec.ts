import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 AI 분석(유료)은 부르지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const meta = { categories: ['니트', '노트'], categoryCriteria: [{ code: 'CLOTHING', name: '니트', checks: [{ code: 'SIZE', question: '사이즈 정보' }] }] };
type Opts = { category?: string; runningPolls?: number };
async function setup(page: Page, o: Opts = {}) {
  const calls = { analyses: 0, polls: 0 };
  // 개발 서버의 registration-metadata 저장 훅(docs/registration-metadata.json)에 가짜 응답이 저장되지 않게 막는다
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  const product = () => ({ id: 'p1', sellerId: 'real-seller', version: 4, status: 'DRAFT', name: '울 니트', description: '새 상품', sourceUrl: null, category: o.category ?? null, price: null, shippingFee: null, dispatchBusinessDays: null, perAccountLimit: null, shippingNotice: null, purchaseNotice: null, disposalReason: '시즌 재고', startsAt: null, endsAt: null, reviewReason: null, options: [], brandOrStore: null, attributes: [], optionDimensions: [], dispatchAddress: null, returnAddress: null, addressesCapturedAt: null, faqs: [] });
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['BUYER', 'SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/products/registration-metadata')) data = meta;
    else if (path.endsWith('/seller/products/p1/images')) data = [{ id: 'img1', objectKey: 'k', contentType: 'image/jpeg', sizeBytes: 1000, position: 0, representative: true }];
    else if (path.endsWith('/seller/products/p1/ai-analyses') && method === 'POST') { calls.analyses++; data = { requestId: `r${calls.analyses}`, productId: 'p1', fingerprint: 'f', completed: false }; }
    else if (path.startsWith('/api/v1/ai/product-analyses/')) {
      calls.polls++;
      const running = calls.polls <= (o.runningPolls ?? 0);
      data = { requestId: 'r1', productId: 'p1', productVersion: 4, fingerprint: 'f', status: running ? 'RUNNING' : 'COMPLETED', attempts: 1, nextAttemptAt: null,
        result: running ? null : { requestId: 'r1', productId: 'p1', sellerId: 'real-seller', fingerprint: 'f', outcome: 'RECOMMENDED', recommendedCategory: 'CLOTHING', questions: [{ suggestionId: 's1', checkCode: null, question: '시즌 재고라 보관 중 생긴 구김이 있나요?', reason: '처분 사유가 시즌 재고예요', suggestedAnswer: '사진상 큰 구김은 보이지 않아요' }] } };
    }
    else if (path.startsWith('/api/v1/seller/products/p1')) data = product();
    else if (path.endsWith('/seller/products')) data = method === 'POST' ? product() : { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/#/login?next=${encodeURIComponent('/seller/new')}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '한정 판매 등록' })).toBeVisible();
  // 사진 업로드까지 끝난 초안(서버 초안 p1)으로 시작한다
  await page.evaluate(({ px, category }) => {
    const key = 'stockdrop:v1:live', s = JSON.parse(localStorage.getItem(key)!);
    const d = s.drafts['real-seller'];
    s.drafts['real-seller'] = { ...d, serverId: 'p1', name: '울 니트', description: '새 상품', reason: '시즌 재고', images: [px], imageIds: ['img1'], imageSizes: [1000], category: category ?? '', faqs: [] };
    localStorage.setItem(key, JSON.stringify(s));
  }, { px: PIXEL, category: o.category });
  await page.reload();
  await expect(page.getByLabel('상품명')).toHaveValue('울 니트');
  return calls;
}
const notice = (page: Page) => page.getByRole('status', { name: 'AI 분석 반영 안내' });

test('AI 분석이 성공하면 결과 보기 없이 카테고리와 구매자 질문을 바로 반영하고, 화면을 떠났다 와도 한 번만 반영한다', async ({ page }) => {
  const calls = await setup(page, { runningPolls: 2 });
  await page.getByRole('button', { name: 'AI로 카테고리 분석하기' }).click();
  await expect(page.getByRole('heading', { name: /분석하고 있어요/ })).toBeVisible();
  await page.getByRole('button', { name: '기다리지 않고 등록 계속하기' }).click(); // 분석 중에 등록 화면으로 떠난다
  await expect(notice(page)).toContainText('AI 분석 결과를 반영했어요', { timeout: 15000 });
  await expect(notice(page)).toContainText('구매자가 물어볼 만한 질문 1개');
  await expect(page.getByText('니트', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /AI 질문 답/ })).toHaveValue('사진상 큰 구김은 보이지 않아요');
  await expect(page.getByText('AI 예상 답변 · 확인 전')).toBeVisible();
  await expect(page.getByRole('button', { name: /분석 결과 보기|이 카테고리로 적용/ })).toHaveCount(0);
  expect(calls.analyses).toBe(1);
  const polls = calls.polls;
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // 다시 들어와도 같은 결과를 또 반영하거나 다시 분석하지 않는다. 안내를 닫으면 다시 보이지 않는다
  await page.reload();
  await expect(notice(page)).toBeVisible();
  await notice(page).getByRole('button', { name: '닫기' }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.goto('/#/seller/products'); await page.goto('/#/seller/new'); await page.reload();
  await expect(page.getByText('니트', { exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  expect(calls.analyses).toBe(1); expect(calls.polls).toBe(polls);
});

test('판매자가 이미 고른 카테고리는 덮지 않고 알린 뒤 원하면 AI 추천으로 바꾼다', async ({ page }) => {
  await setup(page, { category: '노트' });
  await page.getByRole('button', { name: 'AI로 카테고리 분석하기' }).click();
  await expect(notice(page)).toContainText('직접 고른 카테고리는 그대로 두었어요', { timeout: 15000 });
  await expect(notice(page)).toContainText('AI 추천 카테고리는 니트예요');
  await expect(page.getByText('노트', { exact: true })).toBeVisible();
  await notice(page).getByRole('button', { name: 'AI 추천으로 바꾸기' }).click();
  await expect(page.getByText('니트', { exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});
