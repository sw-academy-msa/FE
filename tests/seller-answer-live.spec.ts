import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');

const ANSWER = '내일 출고해요';
const question = { seller: false, body: '언제 오나요', createdAt: '2026-01-01T00:00:00Z' };
type Opts = { answered?: boolean; failAnswer?: boolean; productAnswer?: string | null };
async function mockSeller(page: Page, o: Opts = {}) {
  const state = { answered: !!o.answered, posts: 0, productAnswer: o.productAnswer ?? null, puts: 0 };
  const detail = () => ({ id: 'q1', orderId: 'o1', category: '배송', messages: state.answered ? [question, { seller: true, body: ANSWER, createdAt: '2026-01-02T00:00:00Z' }] : [question], imageIds: [], createdAt: '2026-01-01T00:00:00Z' });
  const productRow = () => ({ id: 'pq1', productId: 'p1', buyerId: 'b1', version: 1, question: '사이즈가 어떻게 되나요', answer: state.productAnswer, createdAt: '2026-01-01T00:00:00Z', answeredAt: state.productAnswer ? '2026-01-02T00:00:00Z' : null });
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (path.endsWith('/seller/orders/o1/inquiries/q1/answers')) {
      state.posts++;
      if (o.failAnswer) { await route.fulfill({ status: 500, json: { code: 'COMMON_INTERNAL', message: '답변을 저장하지 못했어요.' } }); return; }
      await new Promise(r => setTimeout(r, 300)); // 전송 중 두 번 누르기 확인용
      state.answered = true; data = { ...detail(), version: 2 };
    }
    else if (path.endsWith('/seller/orders/o1/inquiries/q1')) data = detail();
    else if (path.endsWith('/seller/orders/inquiries')) data = { content: [{ id: 'q1', orderId: 'o1', productId: 'p1', productName: '패딩', category: '배송', lastMessage: state.answered ? ANSWER : question.body, lastMessageAt: '2026-01-02T00:00:00Z', awaitingSeller: !state.answered, createdAt: '2026-01-01T00:00:00Z' }], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/seller/products/p1/inquiries/pq1/answer')) { state.puts++; state.productAnswer = (req.postDataJSON() as { answer: string }).answer; data = { ...productRow(), version: 2 }; }
    else if (path.endsWith('/seller/products/inquiries')) data = { items: [productRow()], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    else if (path.endsWith('/seller/products')) data = { items: [{ id: 'p1', sellerId: 'real-seller', name: '패딩', status: 'APPROVED', version: 1, startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-01T03:00:00Z', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', submittedAt: null }], page: 0, size: 100, totalPages: 1, totalElements: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
  return state;
}
async function signIn(page: Page, next: string) {
  await page.goto(`/#/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const box = (page: Page) => page.getByRole('textbox', { name: '답변 입력' });

test('주문 문의 답변을 보낸 뒤 나갔다 다시 들어와도 입력창은 비어 있고 답변은 한 번만 보인다', async ({ page }) => {
  const state = await mockSeller(page);
  await signIn(page, '/seller/inquiries');
  await page.getByRole('link', { name: /패딩/ }).click();
  await expect(page.getByText('언제 오나요', { exact: true })).toBeVisible();
  await box(page).fill(ANSWER);
  await page.getByRole('button', { name: '답변 등록', exact: true }).dblclick();
  await expect(page.getByText('답변을 저장했습니다.')).toBeVisible();
  await expect(box(page)).toHaveValue('');
  expect(state.posts).toBe(1);
  await page.getByRole('button', { name: '이전 화면', exact: true }).click();
  await page.getByRole('link', { name: /패딩/ }).click();
  await expect(page.getByText(`[판매자] ${ANSWER}`, { exact: true })).toHaveCount(1);
  await expect(box(page)).toHaveValue('');
});

test('이미 답변한 주문 문의를 바로 열어도 보낸 답변이 입력창에 채워지지 않는다', async ({ page }) => {
  await mockSeller(page, { answered: true });
  await signIn(page, '/seller/inquiries/q1');
  await expect(page.getByText(`[판매자] ${ANSWER}`, { exact: true })).toHaveCount(1);
  await expect(box(page)).toHaveValue('');
});

test('답변 전송에 실패하면 입력한 내용을 그대로 둔다', async ({ page }) => {
  await mockSeller(page, { failAnswer: true });
  await signIn(page, '/seller/inquiries');
  await page.getByRole('link', { name: /패딩/ }).click();
  await box(page).fill(ANSWER);
  await page.getByRole('button', { name: '답변 등록', exact: true }).click();
  await expect(page.getByText('답변을 저장하지 못했어요.')).toBeVisible();
  await expect(box(page)).toHaveValue(ANSWER);
});

test('상품 문의 답변은 저장 뒤 입력창이 비고 답변으로 한 번 보이며, 다시 들어와도 입력창에 남지 않는다', async ({ page }) => {
  const state = await mockSeller(page);
  await signIn(page, '/seller/inquiries');
  await page.getByRole('button', { name: /상품 문의/ }).click();
  await page.getByRole('link', { name: /사이즈가 어떻게 되나요/ }).click();
  await box(page).fill('M 사이즈 기준 가슴 단면 55cm예요');
  await page.getByRole('button', { name: '답변 등록', exact: true }).click();
  await expect(page.getByText('답변을 저장했습니다.')).toBeVisible();
  await expect(box(page)).toHaveValue('');
  await expect(page.getByText('[판매자] M 사이즈 기준 가슴 단면 55cm예요', { exact: true })).toHaveCount(1);
  expect(state.puts).toBe(1);
  await page.getByRole('button', { name: '이전 화면', exact: true }).click();
  await page.getByRole('button', { name: /상품 문의/ }).click();
  await page.getByRole('link', { name: /사이즈가 어떻게 되나요/ }).click();
  await expect(box(page)).toHaveValue('');
  await page.getByRole('button', { name: '기존 답변 불러와 수정', exact: true }).click();
  await expect(box(page)).toHaveValue('M 사이즈 기준 가슴 단면 55cm예요');
});
